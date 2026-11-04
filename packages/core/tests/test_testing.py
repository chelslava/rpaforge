"""Tests for the diagram testing framework ``rpaforge-runner test`` (issue #845)."""

from __future__ import annotations

import json
from pathlib import Path
from xml.etree import ElementTree

import pytest

from rpaforge.testing import (
    SpecError,
    discover_specs,
    load_spec,
    run_spec,
    run_specs,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _write_diagram(
    tmp_path: Path,
    name: str,
    activities: list[dict],
    variables: list[dict] | None = None,
) -> Path:
    """Write a minimal standalone .process file: start -> activities -> end."""
    nodes: list[dict] = [
        {"id": "start", "data": {"blockData": {"type": "start", "processName": name}}}
    ]
    edges: list[dict] = []
    previous = "start"
    for spec in activities:
        node_id = spec["id"]
        nodes.append(
            {
                "id": node_id,
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": spec["library"],
                        "activity": {
                            "name": spec["activity"],
                            "library": spec["library"],
                        },
                    },
                    "activity": {"name": spec["activity"], "library": spec["library"]},
                    "activityValues": spec.get("values", {}),
                },
            }
        )
        edges.append({"source": previous, "target": node_id, "sourceHandle": None})
        previous = node_id
    nodes.append({"id": "end", "data": {"blockData": {"type": "end"}}})
    edges.append({"source": previous, "target": "end", "sourceHandle": None})

    document: dict = {"nodes": nodes, "edges": edges}
    if variables is not None:
        document["variables"] = variables
    path = tmp_path / f"{name}.process"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


class _Recorder:
    """Test library proving whether real activities run."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def fetch(self, url: str) -> dict:
        self.calls.append(("fetch", {"url": url}))
        return {"status": 200, "url": url}

    def add(self, a: float, b: float) -> float:
        self.calls.append(("add", {"a": a, "b": b}))
        return a + b

    def boom(self) -> None:
        self.calls.append(("boom", {}))
        raise RuntimeError("real boom")


# ---------------------------------------------------------------------------
# Spec parsing / discovery
# ---------------------------------------------------------------------------


class TestSpecParsing:
    def test_parses_full_spec(self, tmp_path: Path):
        path = tmp_path / "sample.test.json"
        path.write_text(
            json.dumps(
                {
                    "name": "invoice total",
                    "diagram": "p.process",
                    "variables": {"tax": 0.2},
                    "mocks": [
                        {"activity": "WebUI.Click Element", "return": {"ok": True}},
                        {"activity": "HTTP.Fetch", "sequence": [1, 2]},
                        {"activity": "DB.Exec", "raise": "refused"},
                    ],
                    "allow_real": ["Flow.Log"],
                    "assert": {
                        "process_status": "pass",
                        "variables": {"total": 42},
                        "expressions": ["total == 42"],
                        "node_status": {"n3": "pass"},
                        "nodes_executed": ["n1"],
                    },
                    "min_coverage": 80,
                }
            ),
            encoding="utf-8",
        )
        spec = load_spec(path)
        assert spec.name == "invoice total"
        assert len(spec.mocks) == 3
        assert spec.mocks[1].sequence == (1, 2)
        assert spec.mocks[2].raise_message == "refused"
        assert spec.allow_real == ("Flow.Log",)
        assert spec.assertions.variables == {"total": 42}
        assert spec.min_coverage == 80.0

    def test_mock_requires_exactly_one_behavior(self, tmp_path: Path):
        path = tmp_path / "bad.test.json"
        path.write_text(
            json.dumps(
                {
                    "name": "x",
                    "diagram": "p.process",
                    "mocks": [{"activity": "A.B", "return": 1, "raise": "x"}],
                }
            ),
            encoding="utf-8",
        )
        with pytest.raises(SpecError, match="exactly one"):
            load_spec(path)

    def test_unknown_keys_rejected(self, tmp_path: Path):
        path = tmp_path / "bad.test.json"
        path.write_text(
            json.dumps({"name": "x", "diagram": "p.process", "gpu": True}),
            encoding="utf-8",
        )
        with pytest.raises(SpecError, match="unknown spec keys"):
            load_spec(path)

    def test_invalid_coverage_rejected(self, tmp_path: Path):
        path = tmp_path / "bad.test.json"
        path.write_text(
            json.dumps({"name": "x", "diagram": "p.process", "min_coverage": 150}),
            encoding="utf-8",
        )
        with pytest.raises(SpecError, match="between 0 and 100"):
            load_spec(path)

    def test_discover_scans_directory(self, tmp_path: Path):
        _write_diagram(tmp_path, "proc", [])
        (tmp_path / "one.test.json").write_text(
            json.dumps({"name": "one", "diagram": "proc.process"}), encoding="utf-8"
        )
        nested = tmp_path / "nested"
        nested.mkdir()
        (nested / "two.rpaforge-test.json").write_text(
            json.dumps({"name": "two", "diagram": "proc.process"}), encoding="utf-8"
        )
        (nested / "ignored.json").write_text("{}", encoding="utf-8")
        specs = discover_specs(tmp_path)
        assert sorted(s.name for s in specs) == ["one", "two"]

    def test_discover_missing_path_raises(self, tmp_path: Path):
        with pytest.raises(SpecError, match="does not exist"):
            discover_specs(tmp_path / "absent.test.json")


# ---------------------------------------------------------------------------
# Spec execution
# ---------------------------------------------------------------------------


class TestRunSpec:
    def test_all_unmocked_activities_are_skipped(self, tmp_path: Path):
        recorder = _Recorder()
        _write_diagram(
            tmp_path,
            "proc",
            [
                {
                    "id": "n1",
                    "library": "Rec",
                    "activity": "Fetch",
                    "values": {"url": "http://x"},
                },
                {"id": "n2", "library": "Rec", "activity": "Boom"},
            ],
        )
        spec = load_spec(_write_spec(tmp_path, "skip-all", "proc.process", {}))
        result = run_spec(spec, register_libraries={"Rec": recorder})
        assert result.passed
        assert recorder.calls == []  # nothing ran for real
        assert all(c.disposition == "skipped" for c in result.calls)
        assert result.covered_nodes == set()
        assert result.visited_nodes == {"n1", "n2"}
        assert result.coverage == 0.0

    def test_mock_overrides_activity_and_records(self, tmp_path: Path):
        recorder = _Recorder()
        _write_diagram(
            tmp_path,
            "proc",
            [
                {
                    "id": "n1",
                    "library": "Rec",
                    "activity": "Fetch",
                    "values": {"url": "http://x"},
                },
            ],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "mocked",
                "proc.process",
                {
                    "mocks": [{"activity": "Rec.Fetch", "return": {"status": 599}}],
                    "assert": {
                        "process_status": "pass",
                        "node_status": {"n1": "pass"},
                    },
                },
            )
        )
        result = run_spec(spec, register_libraries={"Rec": recorder})
        assert result.passed, result.failures
        assert recorder.calls == []  # real method never invoked
        assert result.calls[0].disposition == "mocked"
        assert result.calls[0].output == {"status": 599}
        assert result.covered_nodes == {"n1"}
        assert result.coverage == 100.0

    def test_mock_raise_drives_failure_branch(self, tmp_path: Path):
        _write_diagram(
            tmp_path,
            "proc",
            [{"id": "n1", "library": "Rec", "activity": "Boom"}],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "raise",
                "proc.process",
                {
                    "mocks": [{"activity": "Rec.Boom", "raise": "connection refused"}],
                    "assert": {"process_status": "fail"},
                },
            )
        )
        result = run_spec(spec, register_libraries={"Rec": _Recorder()})
        assert result.passed, result.failures
        assert result.process_status == "fail"
        assert result.calls[0].status == "fail"
        assert "connection refused" in (result.calls[0].error or "")

    def test_mock_sequence_returns_in_order(self, tmp_path: Path):
        _write_diagram(
            tmp_path,
            "proc",
            [
                {"id": "n1", "library": "Rec", "activity": "Fetch"},
                {"id": "n2", "library": "Rec", "activity": "Fetch"},
                {"id": "n3", "library": "Rec", "activity": "Fetch"},
            ],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "sequence",
                "proc.process",
                {
                    "mocks": [
                        {"activity": "Rec.Fetch", "sequence": [{"n": 1}, {"n": 2}]}
                    ],
                    "variables": {"v1": "", "v2": "", "v3": ""},
                },
            )
        )
        result = run_spec(spec, register_libraries={"Rec": _Recorder()})
        assert result.passed, result.failures
        mock_calls = [c for c in result.calls if c.disposition == "mocked"]
        assert [c.output for c in mock_calls] == [{"n": 1}, {"n": 2}, {"n": 2}]

    def test_wildcard_mock_matches_library(self, tmp_path: Path):
        recorder = _Recorder()
        _write_diagram(
            tmp_path,
            "proc",
            [{"id": "n1", "library": "Rec", "activity": "Fetch"}],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "wildcard",
                "proc.process",
                {"mocks": [{"activity": "Rec.*", "return": 7}]},
            )
        )
        result = run_spec(spec, register_libraries={"Rec": recorder})
        assert result.passed, result.failures
        assert result.calls[0].output == 7
        assert recorder.calls == []

    def test_allow_real_executes_and_unmocked_others_skip(self, tmp_path: Path):
        recorder = _Recorder()
        _write_diagram(
            tmp_path,
            "proc",
            [
                {
                    "id": "n1",
                    "library": "Rec",
                    "activity": "Add",
                    "values": {"a": 2, "b": 3},
                },
                {"id": "n2", "library": "Rec", "activity": "Boom"},
            ],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "allow-real",
                "proc.process",
                {
                    "allow_real": ["Rec.Add"],
                    "assert": {"process_status": "pass"},
                },
            )
        )
        result = run_spec(spec, register_libraries={"Rec": recorder})
        assert result.passed, result.failures
        assert ("add", {"a": 2, "b": 3}) in recorder.calls
        dispositions = {c.activity: c.disposition for c in result.calls}
        assert dispositions == {"Rec.Add": "real", "Rec.Boom": "skipped"}
        assert result.coverage == 50.0

    def test_assertion_failure_marks_spec_failed(self, tmp_path: Path):
        _write_diagram(
            tmp_path,
            "proc",
            [{"id": "n1", "library": "Rec", "activity": "Fetch"}],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "wrong-assert",
                "proc.process",
                {"assert": {"variables": {"total": 42}}},
                variables={"total": "not-42"},
            )
        )
        result = run_spec(spec, register_libraries={"Rec": _Recorder()})
        assert not result.passed
        assert any("variable 'total'" in f for f in result.failures)

    def test_expression_assertions_use_safe_eval(self, tmp_path: Path):
        _write_diagram(
            tmp_path,
            "proc",
            [],
            variables=[{"name": "total", "type": "number", "value": 42}],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "expressions",
                "proc.process",
                {"assert": {"expressions": ["total == 42", "total > 40", "nope == 1"]}},
            )
        )
        result = run_spec(spec, register_libraries={"Rec": _Recorder()})
        assert not result.passed
        assert any("nope" in f for f in result.failures)
        assert not any("total == 42" in f for f in result.failures)

    def test_min_coverage_threshold_failure(self, tmp_path: Path):
        _write_diagram(
            tmp_path,
            "proc",
            [
                {"id": "n1", "library": "Rec", "activity": "Fetch"},
                {"id": "n2", "library": "Rec", "activity": "Boom"},
            ],
        )
        spec = load_spec(
            _write_spec(
                tmp_path,
                "coverage",
                "proc.process",
                {"mocks": [{"activity": "Rec.Fetch", "return": 1}], "min_coverage": 80},
            )
        )
        result = run_spec(spec, register_libraries={"Rec": _Recorder()})
        assert not result.passed
        assert any("below the 80.0% threshold" in f for f in result.failures)

    def test_min_coverage_default_applies(self, tmp_path: Path):
        _write_diagram(
            tmp_path,
            "proc",
            [{"id": "n1", "library": "Rec", "activity": "Fetch"}],
        )
        spec = load_spec(_write_spec(tmp_path, "default", "proc.process", {}))
        result = run_spec(spec, min_coverage_default=100, register_libraries={})
        assert not result.passed  # nothing covered, threshold 100

    def test_missing_diagram_reports_error(self, tmp_path: Path):
        spec = load_spec(_write_spec(tmp_path, "broken", "absent.process", {}))
        result = run_spec(spec)
        assert not result.passed
        assert result.error is not None

    def test_run_specs_isolates_engines(self, tmp_path: Path):
        _write_diagram(
            tmp_path,
            "proc",
            [{"id": "n1", "library": "Rec", "activity": "Fetch"}],
        )
        specs = [
            load_spec(_write_spec(tmp_path, "s1", "proc.process", {})),
            load_spec(_write_spec(tmp_path, "s2", "proc.process", {})),
        ]
        results = run_specs(specs, register_libraries={"Rec": _Recorder()})
        assert [r.passed for r in results] == [True, True]
        assert results[0].calls is not results[1].calls


def _write_spec(
    tmp_path: Path,
    name: str,
    diagram: str,
    body: dict,
    variables: dict | None = None,
) -> Path:
    data = {"name": name, "diagram": diagram, **body}
    if variables is not None:
        data["variables"] = variables
    path = tmp_path / f"{name}.test.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# JUnit XML
# ---------------------------------------------------------------------------


class TestJUnitOutput:
    def test_junit_xml_is_valid_and_counts(self):
        from rpaforge.testing import build_junit_xml
        from rpaforge.testing.runner import SpecResult

        passing = SpecResult(name="ok", diagram="p.process", passed=True, elapsed_ms=12)
        failing = SpecResult(
            name="bad",
            diagram="p.process",
            failures=["variable 'total' expected 1, got 2"],
            elapsed_ms=34,
        )
        erroring = SpecResult(
            name="broken",
            diagram="p.process",
            error="diagram conversion failed",
            failures=["diagram conversion failed"],
        )
        xml = build_junit_xml([passing, failing, erroring])
        root = ElementTree.fromstring(xml)
        assert root.tag == "testsuite"
        assert root.get("tests") == "3"
        assert root.get("failures") == "1"
        assert root.get("errors") == "1"
        cases = root.findall("testcase")
        assert len(cases) == 3
        assert cases[1].find("failure") is not None
        assert cases[1].find("failure").get("message")  # type: ignore[union-attr]
        assert cases[2].find("error") is not None

    def test_cli_writes_junit_and_exits_by_result(self, tmp_path: Path):
        from rpaforge.runner.cli import main

        _write_diagram(
            tmp_path,
            "proc",
            [{"id": "n1", "library": "Rec", "activity": "Fetch"}],
        )
        _write_spec(
            tmp_path,
            "happy",
            "proc.process",
            {"mocks": [{"activity": "Rec.Fetch", "return": 1}]},
        )
        junit = tmp_path / "out" / "junit.xml"
        code = main(
            ["test", str(tmp_path), "--junit", str(junit), "--min-coverage", "100"]
        )
        assert code == 0
        root = ElementTree.fromstring(junit.read_text(encoding="utf-8"))
        assert root.get("tests") == "1"

    def test_cli_failing_assertion_exits_1(self, tmp_path: Path):
        from rpaforge.runner.cli import main

        _write_diagram(tmp_path, "proc", [])
        _write_spec(
            tmp_path,
            "sad",
            "proc.process",
            {"assert": {"process_status": "fail"}},
        )
        code = main(["test", str(tmp_path)])
        assert code == 1

    def test_cli_no_specs_found_exits_2(self, tmp_path: Path):
        from rpaforge.runner.cli import main

        empty = tmp_path / "empty"
        empty.mkdir()
        code = main(["test", str(empty)])
        assert code == 2

    def test_cli_json_output(self, tmp_path: Path, capsys: pytest.CaptureFixture):
        from rpaforge.runner.cli import main

        _write_diagram(tmp_path, "proc", [])
        _write_spec(tmp_path, "one", "proc.process", {})
        code = main(["test", str(tmp_path), "--json"])
        assert code == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload["status"] == "PASSED"
        assert payload["total"] == 1
