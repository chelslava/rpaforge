"""Tests for RPAForge Core Engine."""

from unittest.mock import MagicMock

from rpaforge.core.execution import (
    ActivityCall,
    ExecutionStatus,
    Process,
    ProcessBuilder,
    Task,
)
from rpaforge.core.runner import ProcessRunner, RunnerState, StudioEngine


class TestStudioEngine:
    """Tests for StudioEngine class."""

    def test_create_engine(self):
        engine = StudioEngine()
        assert engine is not None
        assert not engine.is_running

    def test_create_process(self):
        engine = StudioEngine()
        builder = engine.create_process("Test Process")
        assert builder.name == "Test Process"

    def test_stop_process(self):
        engine = StudioEngine()
        engine._is_running = True
        engine._runner._state = engine._runner._state.__class__.RUNNING

        engine.stop()

        assert engine.stop_requested is True


class TestProcessBuilder:
    """Tests for ProcessBuilder class."""

    def test_create_empty_process(self):
        builder = ProcessBuilder("Empty Process")
        process = builder.build()
        assert process.name == "Empty Process"

    def test_add_task(self):
        builder = ProcessBuilder("Test Process")
        builder.add_task("First Task").add_activity(
            "DesktopUI", "log_message", "Test message"
        )
        process = builder.build()
        assert len(process.tasks) == 1
        assert process.tasks[0].name == "First Task"

    def test_add_variable(self):
        builder = ProcessBuilder("Test Process")
        builder.add_variable("test_var", "value")
        process = builder.build()
        assert "test_var" in process.variables
        assert process.variables["test_var"] == "value"

    def test_add_multiple_tasks(self):
        builder = ProcessBuilder("Test Process")
        builder.add_task("Task 1").add_activity("DesktopUI", "log", "1")
        builder.add_task("Task 2").add_activity("DesktopUI", "log", "2")
        builder.add_task("Task 3").add_activity("DesktopUI", "log", "3")
        process = builder.build()
        assert len(process.tasks) == 3

    def test_task_with_tags(self):
        builder = ProcessBuilder("Test Process")
        task_builder = builder.add_task("Tagged Task")
        task_builder.add_activity("DesktopUI", "log", "Test").add_tags(
            "smoke", "critical"
        )
        process = builder.build()
        assert "smoke" in process.tasks[0].tags
        assert "critical" in process.tasks[0].tags


class TestProcessRunner:
    """Tests for ProcessRunner class."""

    def test_create_runner(self):
        runner = ProcessRunner()
        assert runner.state == RunnerState.IDLE

    def test_add_breakpoint(self):
        runner = ProcessRunner()
        bp = runner.add_breakpoint("node_123", line=10)
        assert bp.node_id == "node_123"
        assert bp.line == 10
        assert bp.enabled is True

    def test_remove_breakpoint(self):
        runner = ProcessRunner()
        bp = runner.add_breakpoint("node_123")
        assert runner.remove_breakpoint(bp.id) is True
        assert runner.remove_breakpoint(bp.id) is False

    def test_toggle_breakpoint(self):
        runner = ProcessRunner()
        bp = runner.add_breakpoint("node_123")
        assert runner.toggle_breakpoint(bp.id) is False
        assert runner.toggle_breakpoint(bp.id) is True


class TestActivityCall:
    """Tests for ActivityCall class."""

    def test_create_activity_call(self):
        call = ActivityCall(
            library="DesktopUI",
            activity="click_element",
            args=("selector",),
            kwargs={"timeout": "10s"},
            line=5,
            node_id="node_1",
        )
        assert call.library == "DesktopUI"
        assert call.activity == "click_element"
        assert call.args == ("selector",)
        assert call.line == 5
        assert call.node_id == "node_1"

    def test_to_dict(self):
        call = ActivityCall(
            library="WebUI",
            activity="open_browser",
            args=("https://example.com",),
        )
        d = call.to_dict()
        assert d["library"] == "WebUI"
        assert d["activity"] == "open_browser"
        assert d["args"] == ("https://example.com",)


class TestProcess:
    """Tests for Process class."""

    def test_get_variable(self):
        process = Process(name="Test")
        process.set_variable("name", "value")
        assert process.get_variable("name") == "value"
        assert process.get_variable("${name}") == "value"

    def test_get_variable_default(self):
        process = Process(name="Test")
        assert process.get_variable("missing", "default") == "default"
