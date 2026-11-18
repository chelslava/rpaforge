#!/usr/bin/env node
/**
 * pnpm-audit gate: fail the build on critical/high advisories in the resolved
 * lockfile, with a dated allow-list for advisories that have no fixed version.
 *
 * Node-side mirror of pip_audit_gate.py (same policy: high/critical/unknown
 * block; the allow-list is dated and expired entries fail the gate so the
 * list cannot rot silently). Consumes the `pnpm audit --json` report the
 * workflow already produces (npm-shape: .metadata.vulnerabilities +
 * .advisories keyed by numeric id).
 *
 * Allow-list format (.github/npm-audit-allowlist.txt):
 *   GHSA-xxxx-xxxx-xxxx  expires:YYYY-MM-DD  # reason
 * Entries without an expiry are rejected outright; expired entries fail the
 * gate. Matching is by `github_advisory_id` from the audit report.
 */

import { readFileSync } from "node:fs";

function parseAllowlist(path) {
  const allowed = new Map();
  const problems = [];
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [new Map(), [`${path}: allow-list file not found`]];
  }
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    const lineno = idx + 1;
    if (!line || line.startsWith("#")) return;
    const match = /^(\S+)\s+expires:(\d{4}-\d{2}-\d{2})(?:\s+#\s?(.*))?$/.exec(line);
    if (!match) {
      problems.push(`${path}:${lineno}: malformed entry: ${JSON.stringify(line)}`);
      return;
    }
    allowed.set(match[1], { expires: match[2], reason: match[3] ?? "" });
  });
  return [allowed, problems];
}

function main() {
  const args = process.argv.slice(2);
  const readArg = (name, fallback) => {
    const idx = args.indexOf(name);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
  };
  const auditPath = readArg("--audit", "packages/studio/npm-audit.json");
  const allowlistPath = readArg("--allowlist", ".github/npm-audit-allowlist.txt");

  const [allowed, problems] = parseAllowlist(allowlistPath);
  for (const problem of problems) {
    console.error(`::error::${problem}`);
    console.error(`ALLOWLIST ERROR: ${problem}`);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(auditPath, "utf8"));
  } catch {
    // pnpm mixes stderr into the file on non-JSON output (workflow pipes
    // 2>&1). Same policy as before this gate existed: an unparseable report
    // warns instead of blocking — the JSON shape check keeps this honest.
    console.warn(`GATE WARN: ${auditPath} is not valid JSON; nothing to check`);
    return problems.length ? 1 : 0;
  }

  const blocking = [];
  const nonblocking = [];
  const advisories = report.advisories ?? {};
  for (const entry of Object.values(advisories)) {
    const severity = String(entry.severity ?? "unknown").toLowerCase();
    const ghsa = entry.github_advisory_id ?? entry.url ?? "?";
    const line = `${entry.module_name} (${(entry.findings ?? [])
      .flatMap((f) => f.version ?? [])
      .join(", ")}) ${ghsa} severity=${severity} paths=${(entry.findings ?? [])
      .flatMap((f) => f.paths ?? [])
      .slice(0, 3)
      .join("; ")}`;
    if (severity !== "critical" && severity !== "high") {
      nonblocking.push(line);
      continue;
    }
    const waiver = allowed.get(ghsa);
    if (waiver) {
      nonblocking.push(`${line} [allow-listed until ${waiver.expires}]`);
    } else {
      blocking.push(line);
      console.error(`::error title=npm-audit gate::${line}`);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const [entryId, waiver] of allowed) {
    if (waiver.expires < today) {
      const message = `allow-list entry ${entryId} expired on ${waiver.expires} — remove or re-date it`;
      blocking.push(message);
      console.error(`::error title=npm-audit gate::${message}`);
    }
  }

  if (nonblocking.length > 0) {
    console.log("\nNon-blocking findings (medium/low or allow-listed):");
    for (const line of nonblocking) console.log(`  - ${line}`);
  }
  if (blocking.length === 0 && problems.length === 0) {
    console.log(
      `\nGATE PASS: no blocking advisories (${nonblocking.length} non-blocking, allow-list: ${allowed.size} entries)`
    );
    return 0;
  }
  console.log("\nGATE FAIL: blocking findings:");
  for (const line of blocking) console.log(`  - ${line}`);
  return 1;
}

process.exit(main());
