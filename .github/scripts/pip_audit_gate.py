#!/usr/bin/env python3
"""pip-audit gate: fail the build on blocking advisories in the resolved environment.

Runs pip-audit (JSON format) against the current environment, resolves each
finding's severity via the OSV API (curated GHSA ``database_specific.severity``
first, falling back to a CVSS 3.1 base-score calculation from the advisory
vector), and exits non-zero when a blocking finding is not allow-listed.

Blocking = severity high, critical, or unknown. Unknown includes advisory IDs
that cannot be resolved over the network: a silent API outage must not green-
light an unaudited dependency. Medium/low findings are reported but do not
block (mirrors the Node.js audit job's critical/high policy).

Allow-list format (.github/pip-audit-allowlist.txt):
    PYSEC-YYYY-NN  expires:YYYY-MM-DD  # reason
Entries without an expiry are rejected outright; expired entries fail the gate
so the list cannot rot silently.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

OSV_API_URL = "https://api.osv.dev/v1/vulns/"
OSV_TIMEOUT_S = 15

BLOCKING_SEVERITIES = {"high", "critical", "unknown"}
SEVERITY_NORMALIZATION = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "IMPORTANT": "high",
    "MODERATE": "medium",
    "MEDIUM": "medium",
    "LOW": "low",
}

_ALLOWLIST_LINE = re.compile(
    r"^(?P<id>[A-Za-z]+-\d{4}-\d+)"          # e.g. PYSEC-2026-89, GHSA-style rejected (no 4-digit year)
    r"(?:\s+expires:(?P<expires>\d{4}-\d{2}-\d{2}))?"
    r"(?:\s+#\s?(?P<reason>.*))?$"
)

_CVSS31_WEIGHTS = {
    "AV": {"N": 0.85, "A": 0.62, "L": 0.55, "P": 0.2},
    "AC": {"L": 0.77, "H": 0.44},
    "PR": {"U": {"N": 0.85, "L": 0.62, "H": 0.27}, "C": {"N": 0.85, "L": 0.68, "H": 0.5}},
    "UI": {"N": 0.85, "R": 0.62},
    "CIA": {"H": 0.56, "L": 0.22, "N": 0.0},
}


def parse_allowlist(path: Path) -> tuple[dict[str, str], list[str]]:
    """Parse the allow-list into {advisory_id: expiry ISO date} plus problems."""
    allowed: dict[str, str] = {}
    problems: list[str] = []
    if not path.exists():
        return allowed, [f"allow-list file not found: {path}"]
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = _ALLOWLIST_LINE.match(line)
        if not match:
            problems.append(f"{path}:{lineno}: malformed entry: {line!r}")
            continue
        entry_id = match.group("id")
        expires = match.group("expires")
        if not expires:
            problems.append(f"{path}:{lineno}: {entry_id} has no expires:YYYY-MM-DD (required)")
            continue
        allowed[entry_id] = expires
    return allowed, problems


def _cvss31_roundup(value: float) -> float:
    return math.ceil(value * 10) / 10


def cvss31_base_score(vector: str) -> float | None:
    """CVSS v3.1 base score from a full vector string, or None if unparseable."""
    body = vector.strip()
    if body.startswith("CVSS:3.1/"):
        body = body[len("CVSS:3.1/") :]
    parts = dict(item.split(":", 1) for item in body.split("/") if ":" in item)
    try:
        scope_changed = parts["S"] == "C"
        impact_subscore = 1.0
        for metric in ("C", "I", "A"):
            impact_subscore *= 1.0 - _CVSS31_WEIGHTS["CIA"][parts[metric]]
        iss = 1.0 - impact_subscore
        impact = (
            6.42 * iss
            if not scope_changed
            else 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
        )
        if impact <= 0:
            return 0.0
        exploitability = (
            8.22
            * _CVSS31_WEIGHTS["AV"][parts["AV"]]
            * _CVSS31_WEIGHTS["AC"][parts["AC"]]
            * _CVSS31_WEIGHTS["PR"]["C" if scope_changed else "U"][parts["PR"]]
            * _CVSS31_WEIGHTS["UI"][parts["UI"]]
        )
        score = impact + exploitability
        if scope_changed:
            score *= 1.08
        return _cvss31_roundup(min(score, 10.0))
    except KeyError:
        return None


def _score_to_severity(score: float) -> str:
    if score >= 9.0:
        return "critical"
    if score >= 7.0:
        return "high"
    if score >= 4.0:
        return "medium"
    if score > 0.0:
        return "low"
    return "unknown"


def _fetch_osv(advisory_id: str) -> dict | None:
    url = OSV_API_URL + advisory_id
    try:
        with urllib.request.urlopen(url, timeout=OSV_TIMEOUT_S) as response:
            return json.load(response)
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return None


def resolve_severity(advisory_id: str, aliases: list[str], cache: dict[str, str]) -> str:
    """Severity for one advisory, preferring curated GHSA records over raw vectors."""
    candidates = [a for a in aliases if a.startswith("GHSA-")]
    candidates += [advisory_id] + [a for a in aliases if a not in candidates]
    for candidate in candidates:
        if candidate in cache:
            return cache[candidate]
        record = _fetch_osv(candidate)
        if record is None:
            continue
        severity: str | None = None
        db_specific = record.get("database_specific") or {}
        raw = db_specific.get("severity")
        if isinstance(raw, str):
            severity = SEVERITY_NORMALIZATION.get(raw.upper())
        if severity is None:
            for entry in record.get("severity") or []:
                if entry.get("type") == "CVSS_V3":
                    score = cvss31_base_score(entry.get("score", ""))
                    if score is not None:
                        severity = _score_to_severity(score)
                        break
        resolved = severity or "unknown"
        cache[candidate] = resolved
        if resolved != "unknown":
            return resolved
    return "unknown"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allowlist",
        type=Path,
        default=Path(".github/pip-audit-allowlist.txt"),
        help="path to the dated allow-list file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("pip-audit.json"),
        help="where to store the raw pip-audit JSON (CI artifact)",
    )
    args = parser.parse_args()

    allowed, problems = parse_allowlist(args.allowlist)
    for problem in problems:
        print(f"::error::{problem}")
        print(f"ALLOWLIST ERROR: {problem}")

    audit_file = args.output.resolve()
    cmd = [
        sys.executable,
        "-m",
        "pip_audit",
        "--format",
        "json",
        "--output",
        str(audit_file),
        "--progress-spinner",
        "off",
    ]
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, check=False)

    # pip-audit exit codes: 0 = clean, 1 = vulnerabilities found (JSON is still
    # written), anything else is a runtime/usage error — refuse to pass.
    if result.returncode > 1:
        print(
            f"::error::pip-audit exited with {result.returncode}; "
            "refusing to pass the gate"
        )
        print(f"GATE FAIL: pip-audit exited with code {result.returncode}")
        return 1

    if not audit_file.exists():
        print("::error::pip-audit produced no report; refusing to pass the gate")
        print("GATE FAIL: pip-audit produced no report (service outage or crash?)")
        return 1

    payload = json.loads(audit_file.read_text(encoding="utf-8"))
    cache: dict[str, str] = {}
    blocking: list[str] = []
    nonblocking: list[str] = []
    today = date.today()

    for dep in payload.get("dependencies", []):
        for vuln in dep.get("vulns", []):
            advisory_id = vuln.get("id", "?")
            aliases = vuln.get("aliases", []) or []
            fix_versions = ", ".join(vuln.get("fix_versions", []) or []) or "none"
            severity = resolve_severity(advisory_id, aliases, cache)
            line = (
                f"{dep.get('name')}=={dep.get('version')} "
                f"{advisory_id} severity={severity} fixed_in=[{fix_versions}]"
            )
            if severity in BLOCKING_SEVERITIES and advisory_id not in allowed:
                blocking.append(line)
                print(f"::error title=pip-audit gate::{line}")
            else:
                nonblocking.append(line)

    expired = [
        (entry_id, expiry)
        for entry_id, expiry in allowed.items()
        if date.fromisoformat(expiry) < today
    ]
    for entry_id, expiry in expired:
        message = f"allow-list entry {entry_id} expired on {expiry} — remove or re-date it"
        blocking.append(message)
        print(f"::error title=pip-audit gate::{message}")

    if nonblocking:
        print("\nNon-blocking findings (medium/low or allow-listed):")
        for line in nonblocking:
            print(f"  - {line}")
    if not blocking and not problems:
        print(
            f"\nGATE PASS: no blocking advisories "
            f"({len(nonblocking)} non-blocking, allow-list: {len(allowed)} entries)"
        )
        return 0

    print("\nGATE FAIL: blocking findings:")
    for line in blocking:
        print(f"  - {line}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
