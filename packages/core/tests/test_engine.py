"""Tests for RPAForge Core."""

from unittest.mock import MagicMock

from rpaforge.engine import ProcessBuilder, StudioEngine


class TestStudioEngine:
    """Tests for StudioEngine class."""

    def test_create_engine(self):
        """Test creating a studio engine."""
        engine = StudioEngine()
        assert engine is not None
        assert not engine.is_running

    def test_create_process(self):
        """Test creating a process builder."""
        engine = StudioEngine()
        builder = engine.create_process("Test Process")
        assert builder.name == "Test Process"

    def test_run_simple_string(self):
        """Test running a simple Robot Framework string."""
        engine = StudioEngine()
        result = engine.run_string("""
*** Tasks ***
Simple Task
    Log    Hello World
""")
        assert result is not None
        assert result.suite is not None

    def test_stop_requests_resume_for_paused_debugger(self):
        """Test stop requests cancel execution state and unpause debugger."""
        debugger = MagicMock()
        debugger.is_paused = True

        engine = StudioEngine(debugger=debugger)
        engine._is_running = True

        engine.stop()

        assert engine.stop_requested is True
        assert engine.is_running is False
        debugger.resume.assert_called_once()


class TestProcessBuilder:
    """Tests for ProcessBuilder class."""

    def test_create_empty_process(self):
        """Test creating an empty process."""
        builder = ProcessBuilder("Empty Process")
        suite = builder.build()
        assert suite.name == "Empty Process"

    def test_add_task(self):
        """Test adding a task to the process."""
        builder = ProcessBuilder("Test Process")
        builder.add_task(
            "First Task",
            [
                ("Log", ["Test message"]),
            ],
        )
        suite = builder.build()
        assert len(suite.tests) == 1
        assert suite.tests[0].name == "First Task"

    def test_add_variable(self):
        """Test adding a variable."""
        builder = ProcessBuilder("Test Process")
        builder.add_variable("${test_var}", "value")
        suite = builder.build()
        assert len(suite.resource.variables) == 1

    def test_add_import(self):
        """Test adding an import."""
        builder = ProcessBuilder("Test Process")
        builder.add_import("Library", "BuiltIn")
        suite = builder.build()
        assert len(suite.resource.imports) == 1

    def test_add_multiple_tasks(self):
        """Test adding multiple tasks."""
        builder = ProcessBuilder("Test Process")
        builder.add_task("Task 1", [("Log", ["1"])])
        builder.add_task("Task 2", [("Log", ["2"])])
        builder.add_task("Task 3", [("Log", ["3"])])
        suite = builder.build()
        assert len(suite.tests) == 3

    def test_task_with_tags(self):
        """Test adding a task with tags."""
        builder = ProcessBuilder("Test Process")
        builder.add_task(
            "Tagged Task",
            [
                ("Log", ["Test"]),
            ],
            tags=["smoke", "critical"],
        )
        suite = builder.build()
        assert "smoke" in suite.tests[0].tags
        assert "critical" in suite.tests[0].tags
