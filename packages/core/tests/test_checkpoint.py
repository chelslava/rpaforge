"""Tests for RPAForge Checkpoint System."""

import tempfile
import time
from pathlib import Path

from rpaforge.core.checkpoint import (
    DEFAULT_CHECKPOINT_FREQUENCY,
    CheckpointData,
    CheckpointManager,
)
from rpaforge.core.runner import Breakpoint, CallFrame, ProcessRunner


class TestCheckpointData:
    """Tests for CheckpointData dataclass."""

    def test_create_checkpoint_data(self):
        cp = CheckpointData(
            process_name="Test Process",
            current_node_id="node_1",
            state="running",
            variables={"var1": "value1"},
            activity_count=10,
        )
        assert cp.process_name == "Test Process"
        assert cp.current_node_id == "node_1"
        assert cp.state == "running"
        assert cp.variables == {"var1": "value1"}
        assert cp.activity_count == 10

    def test_to_dict(self):
        cp = CheckpointData(
            timestamp="2024-01-01T00:00:00",
            process_name="Test",
            current_node_id="n1",
            state="paused",
            variables={"x": 1},
            call_stack=[{"activity": "act1", "library": "lib1", "line": 1}],
            activity_count=5,
            checkpoint_id="cp_1",
        )
        data = cp.to_dict()
        assert data["process_name"] == "Test"
        assert data["current_node_id"] == "n1"
        assert data["state"] == "paused"
        assert data["variables"] == {"x": 1}
        assert len(data["call_stack"]) == 1
        assert data["activity_count"] == 5

    def test_from_dict(self):
        data = {
            "version": "1.0",
            "timestamp": "2024-01-01T00:00:00",
            "process_name": "Test Process",
            "current_node_id": "node_2",
            "current_task_name": "Task 1",
            "state": "running",
            "variables": {"count": 42},
            "call_stack": [],
            "breakpoints": {},
            "activity_count": 15,
            "checkpoint_id": "cp_2",
        }
        cp = CheckpointData.from_dict(data)
        assert cp.process_name == "Test Process"
        assert cp.current_node_id == "node_2"
        assert cp.current_task_name == "Task 1"
        assert cp.state == "running"
        assert cp.variables == {"count": 42}
        assert cp.activity_count == 15

    def test_from_dict_with_defaults(self):
        data = {"process_name": "Minimal"}
        cp = CheckpointData.from_dict(data)
        assert cp.process_name == "Minimal"
        assert cp.version == "1.0"
        assert cp.variables == {}


class TestCheckpointManager:
    """Tests for CheckpointManager class."""

    def test_init_default_values(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            assert cm.frequency == DEFAULT_CHECKPOINT_FREQUENCY
            assert cm.checkpoint_dir == Path(tmpdir)

    def test_init_custom_values(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir, frequency=5, keep_last=2)
            assert cm.frequency == 5
            assert cm._keep_last == 2

    def test_frequency_property(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            cm.frequency = 20
            assert cm.frequency == 20
            cm.frequency = 0
            assert cm.frequency == 1
            cm.frequency = -5
            assert cm.frequency == 1

    def test_set_checkpoint_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            new_dir = Path(tmpdir) / "subdir"
            cm.set_checkpoint_dir(new_dir)
            assert cm.checkpoint_dir == new_dir
            assert new_dir.exists()

    def test_should_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir, frequency=10)
            assert cm.should_checkpoint(0) is False
            assert cm.should_checkpoint(5) is False
            assert cm.should_checkpoint(10) is True
            assert cm.should_checkpoint(20) is True
            assert cm.should_checkpoint(9) is False

    def test_save_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            call_stack = [
                CallFrame(
                    activity="log",
                    library="BuiltIn",
                    line=10,
                    args=("test",),
                    node_id="n1",
                )
            ]
            bp = Breakpoint(id="bp_1", node_id="n1", line=5)
            checkpoint_id = cm.save(
                process_name="Test Process",
                current_node_id="node_1",
                current_task_name="Task 1",
                state="running",
                variables={"var1": "value1"},
                call_stack=call_stack,
                breakpoints={"bp_1": bp},
                activity_count=10,
            )
            assert checkpoint_id is not None
            assert "cp_" in checkpoint_id

            checkpoint_path = Path(tmpdir) / f"{checkpoint_id}.json"
            assert checkpoint_path.exists()

    def test_save_and_load_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            call_stack = [
                CallFrame(
                    activity="open_browser",
                    library="WebUI",
                    line=5,
                    args=("https://example.com",),
                    node_id="n1",
                )
            ]
            bp = Breakpoint(
                id="bp_n1_5",
                node_id="n1",
                line=5,
                enabled=True,
                condition="${count} > 5",
                hit_count=3,
            )
            cm.save(
                process_name="Browser Process",
                current_node_id="n1",
                current_task_name="Open Site",
                state="paused",
                variables={"url": "https://example.com", "count": 10},
                call_stack=call_stack,
                breakpoints={"bp_n1_5": bp},
                activity_count=15,
            )

            loaded = cm.load()
            assert loaded is not None
            assert loaded.process_name == "Browser Process"
            assert loaded.current_node_id == "n1"
            assert loaded.current_task_name == "Open Site"
            assert loaded.state == "paused"
            assert loaded.variables["url"] == "https://example.com"
            assert loaded.activity_count == 15
            assert len(loaded.call_stack) == 1
            assert loaded.call_stack[0]["activity"] == "open_browser"

    def test_load_no_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            assert cm.load() is None

    def test_has_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            assert cm.has_checkpoint() is False
            cm.save(
                process_name="Test",
                current_node_id="n1",
                current_task_name="T1",
                state="running",
                variables={},
                call_stack=[],
                breakpoints={},
                activity_count=1,
            )
            assert cm.has_checkpoint() is True

    def test_clear_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            for i in range(5):
                cm.save(
                    process_name=f"Process{i}",
                    current_node_id="n1",
                    current_task_name="T1",
                    state="running",
                    variables={},
                    call_stack=[],
                    breakpoints={},
                    activity_count=i,
                )
            assert cm.has_checkpoint() is True
            assert cm.clear() is True
            assert cm.has_checkpoint() is False

    def test_cleanup_old_checkpoints(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir, frequency=1, keep_last=3)
            for i in range(6):
                cm.save(
                    process_name=f"Process{i}",
                    current_node_id="n1",
                    current_task_name="T1",
                    state="running",
                    variables={},
                    call_stack=[],
                    breakpoints={},
                    activity_count=i,
                )
                time.sleep(0.01)

            checkpoints = list(Path(tmpdir).glob("*.json"))
            assert len(checkpoints) == 3

    def test_get_checkpoint_info(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            cm.save(
                process_name="My Process",
                current_node_id="node_xyz",
                current_task_name="Main Task",
                state="running",
                variables={"count": 10},
                call_stack=[],
                breakpoints={},
                activity_count=25,
            )

            info = cm.get_checkpoint_info()
            assert info is not None
            assert info["process_name"] == "My Process"
            assert info["current_node_id"] == "node_xyz"
            assert info["activity_count"] == 25
            assert "checkpoint_id" in info
            assert "timestamp" in info

    def test_get_checkpoint_info_no_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            assert cm.get_checkpoint_info() is None

    def test_load_corrupted_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir)
            bad_file = Path(tmpdir) / "bad_checkpoint.json"
            bad_file.write_text("not valid json {")
            assert cm.load() is None


class TestCheckpointManagerThreadSafety:
    """Tests for thread-safety of CheckpointManager."""

    def test_concurrent_saves(self):
        import threading

        with tempfile.TemporaryDirectory() as tmpdir:
            cm = CheckpointManager(checkpoint_dir=tmpdir, frequency=1)
            results = []

            def save_checkpoint(thread_id: int):
                for i in range(5):
                    result = cm.save(
                        process_name=f"Thread {thread_id}",
                        current_node_id=f"n{thread_id}",
                        current_task_name="T1",
                        state="running",
                        variables={"thread": thread_id},
                        call_stack=[],
                        breakpoints={},
                        activity_count=i,
                    )
                    results.append(result)

            threads = [
                threading.Thread(target=save_checkpoint, args=(i,)) for i in range(3)
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            assert len([r for r in results if r is not None]) > 0
            assert cm.has_checkpoint()


class TestProcessRunnerCheckpointIntegration:
    """Tests for checkpoint integration with ProcessRunner."""

    def test_runner_initializes_checkpoint_manager(self):
        runner = ProcessRunner()
        assert runner._checkpoint_manager is not None
        assert runner._checkpoint_manager.frequency == 10

    def test_runner_custom_checkpoint_frequency(self):
        runner = ProcessRunner(checkpoint_frequency=5)
        assert runner._checkpoint_manager.frequency == 5
        assert runner.checkpoint_frequency == 5

    def test_runner_checkpoint_frequency_setter(self):
        runner = ProcessRunner(checkpoint_frequency=10)
        runner.checkpoint_frequency = 20
        assert runner.checkpoint_frequency == 20

    def test_runner_clear_checkpoint(self):
        runner = ProcessRunner()
        runner._checkpoint_manager.save(
            process_name="Test",
            current_node_id="n1",
            current_task_name="T1",
            state="running",
            variables={},
            call_stack=[],
            breakpoints={},
            activity_count=1,
        )
        assert runner.has_checkpoint() is True
        assert runner.clear_checkpoint() is True
        assert runner.has_checkpoint() is False

    def test_runner_has_checkpoint(self):
        runner = ProcessRunner()
        assert runner.has_checkpoint() is False

    def test_runner_get_checkpoint_info(self):
        runner = ProcessRunner()
        runner._checkpoint_manager.save(
            process_name="Test Process",
            current_node_id="node_1",
            current_task_name="Task 1",
            state="running",
            variables={"var": "value"},
            call_stack=[],
            breakpoints={},
            activity_count=10,
        )
        info = runner.get_checkpoint_info()
        assert info is not None
        assert info["process_name"] == "Test Process"

    def test_runner_get_checkpoint_data(self):
        runner = ProcessRunner()
        runner._checkpoint_manager.save(
            process_name="Data Test",
            current_node_id="node_data",
            current_task_name="Data Task",
            state="paused",
            variables={"key": "value"},
            call_stack=[],
            breakpoints={},
            activity_count=12,
        )
        data = runner.get_checkpoint_data()
        assert data is not None
        assert isinstance(data, CheckpointData)
        assert data.process_name == "Data Test"
        assert data.activity_count == 12


class TestStudioEngineCheckpointIntegration:
    """Tests for checkpoint integration with StudioEngine."""

    def test_engine_initializes_with_checkpoint_frequency(self):
        from rpaforge.core.runner import StudioEngine

        engine = StudioEngine(checkpoint_frequency=15)
        assert engine.checkpoint_frequency == 15

    def test_engine_checkpoint_methods(self):
        from rpaforge.core.runner import StudioEngine

        engine = StudioEngine()
        assert hasattr(engine, "clear_checkpoint")
        assert hasattr(engine, "has_checkpoint")
        assert hasattr(engine, "get_checkpoint_info")
        assert hasattr(engine, "get_checkpoint_data")

    def test_engine_checkpoint_frequency_setter(self):
        from rpaforge.core.runner import StudioEngine

        engine = StudioEngine(checkpoint_frequency=10)
        engine.checkpoint_frequency = 25
        assert engine.checkpoint_frequency == 25
