"""Tests for RPAForge Core Engine."""

from unittest.mock import MagicMock

from rpaforge.core.execution import (
    ActivityCall,
    Process,
    ProcessBuilder,
)
from rpaforge.core.interfaces import ExecutionEvent, Executor
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

    def test_close_releases_executor_resources(self):
        executor = MagicMock()
        engine = StudioEngine(executor=executor)

        engine.close()

        executor.close.assert_called_once()

    def test_cancel_process(self):
        engine = StudioEngine()
        engine._runner._state = RunnerState.RUNNING

        engine.cancel()

        assert engine.stop_requested is True
        assert engine.state == RunnerState.CANCELLING

    def test_cancel_from_idle_does_nothing(self):
        engine = StudioEngine()
        engine.cancel()
        assert engine.state == RunnerState.IDLE

    def test_lifecycle_callbacks(self):
        engine = StudioEngine()
        cancel_called = []
        stop_called = []

        engine.on_cancel(lambda: cancel_called.append(True))
        engine.on_stop(lambda: stop_called.append(True))

        engine._runner._state = RunnerState.RUNNING
        engine.cancel()

        assert len(cancel_called) == 1
        assert engine.state == RunnerState.CANCELLING


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

    def test_cancel_transitions_state(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING
        runner.cancel()
        assert runner.state == RunnerState.CANCELLING
        assert runner._stop_requested is True

    def test_cancel_from_idle_no_op(self):
        runner = ProcessRunner()
        runner.cancel()
        assert runner.state == RunnerState.IDLE


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


class TestStatefulLibraryTimeout:
    """Tests for stateful library timeout bypass (issue #595)."""

    def test_stateful_library_timeout_bypass(self, monkeypatch):
        """Stateful libraries with timeout_ms > 0 should get effective_timeout=0."""
        from unittest.mock import MagicMock

        from rpaforge.core.activity import LIBRARY_REGISTRY, LibraryMeta
        from rpaforge.core.executor import ProcessExecutor

        # Create a mock stateful library
        class MockLibrary:
            @staticmethod
            def test_activity():
                return "result"

        mock_meta = LibraryMeta(name="MockLibrary", is_stateful=True)
        LIBRARY_REGISTRY["MockLibrary"] = (MockLibrary, mock_meta)

        # Patch the activity registry lookup
        monkeypatch.setattr("rpaforge.core.activity.ACTIVITY_REGISTRY", {})

        # Create executor with a mock subprocess executor that we can track
        subprocess_mock = MagicMock()
        executor = ProcessExecutor()
        executor._subprocess_executor = subprocess_mock

        # Mock the library provider to return our mock library
        executor._library_provider.get_library = lambda _: MockLibrary
        executor._library_provider.instantiate_library = lambda cls: cls()

        # Call with timeout_ms=5000 - should be overridden to 0 for stateful library
        result = executor._execute_activity(
            "MockLibrary", "test_activity", timeout_ms=5000
        )

        # Verify the result
        assert result == "result"

        # Verify subprocess executor was NOT called (because effective_timeout=0)
        assert subprocess_mock.execute_with_timeout.call_count == 0

        # Clean up
        del LIBRARY_REGISTRY["MockLibrary"]

    def test_non_stateful_library_uses_timeout(self):
        """Non-stateful libraries should use the specified timeout."""
        from unittest.mock import MagicMock

        from rpaforge.core.activity import LIBRARY_REGISTRY, LibraryMeta
        from rpaforge.core.executor import ProcessExecutor

        # Create a mock non-stateful library
        class MockLibrary:
            @staticmethod
            def test_activity():
                return "result"

        mock_meta = LibraryMeta(name="MockLibrary", is_stateful=False)
        LIBRARY_REGISTRY["MockLibrary"] = (MockLibrary, mock_meta)

        # Create executor with a mock subprocess executor
        subprocess_mock = MagicMock()
        executor = ProcessExecutor()
        executor._subprocess_executor = subprocess_mock

        # Mock the library provider to return our mock library
        executor._library_provider.get_library = lambda _: MockLibrary
        executor._library_provider.instantiate_library = lambda cls: cls()

        # Call with timeout_ms=5000 - should use the specified timeout
        executor._execute_activity("MockLibrary", "test_activity", timeout_ms=5000)

        # Verify subprocess executor WAS called with the timeout
        assert subprocess_mock.execute_with_timeout.call_count == 1
        call_kwargs = subprocess_mock.execute_with_timeout.call_args.kwargs
        assert call_kwargs["timeout_ms"] == 5000

        # Clean up
        del LIBRARY_REGISTRY["MockLibrary"]


class TestProcess:
    """Tests for Process class."""

    def test_get_variable(self):
        process = Process(name="Test")
        process.set_variable("name", "value")
        assert process.get_variable("name") == "value"

    def test_get_variable_default(self):
        process = Process(name="Test")
        assert process.get_variable("missing", "default") == "default"


class MockExecutor:
    """Mock executor implementing the Executor Protocol for testing."""

    def __init__(self):
        self.calls = []
        self._context = None

    def run(self, process):
        self.calls.append(("run", process))
        return None

    def add_listener(self, callback):
        self.calls.append(("add_listener", callback))

    def remove_listener(self, callback):
        self.calls.append(("remove_listener", callback))

    def cancel(self):
        self.calls.append(("cancel",))

    @property
    def context(self):
        return self._context


class TestExecutorProtocol:
    """Tests for Executor Protocol abstractions."""

    def test_mock_executor_satisfies_protocol(self):
        mock = MockExecutor()
        assert isinstance(mock, Executor)

    def test_process_runner_accepts_mock_executor(self):
        mock = MockExecutor()
        runner = ProcessRunner(executor=mock)
        assert runner.executor is mock

    def test_mock_executor_add_listener_called_on_init(self):
        mock = MockExecutor()
        ProcessRunner(executor=mock)
        listener_calls = [c for c in mock.calls if c[0] == "add_listener"]
        assert len(listener_calls) == 1

    def test_studio_engine_accepts_mock_executor(self):
        mock = MockExecutor()
        engine = StudioEngine(executor=mock)
        assert engine.executor is mock

    def test_execution_event_dataclass(self):
        event = ExecutionEvent(event_type="start_process", data={"name": "Test"})
        assert event.event_type == "start_process"
        assert event.data["name"] == "Test"

    def test_execution_event_default_data(self):
        event = ExecutionEvent(event_type="end_process")
        assert event.data == {}
