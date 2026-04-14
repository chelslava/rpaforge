"""
RPAForge Core Execution Model.

Data structures for process execution without Robot Framework.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ExecutionStatus(Enum):
    """Execution status for processes and tasks."""

    PASS = "PASS"
    FAIL = "FAIL"
    SKIP = "SKIP"
    RUNNING = "RUNNING"


@dataclass
class ActivityCall:
    """A single activity invocation within a task."""

    library: str
    activity: str
    args: tuple[Any, ...] = ()
    kwargs: dict[str, Any] = field(default_factory=dict)
    line: int = 0
    node_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "library": self.library,
            "activity": self.activity,
            "args": self.args,
            "kwargs": self.kwargs,
            "line": self.line,
            "node_id": self.node_id,
        }


@dataclass
class ActivityResult:
    """Result of a single activity execution."""

    status: ExecutionStatus
    output: Any = None
    error: str | None = None
    elapsed_ms: int = 0


@dataclass
class Variable:
    """A process variable."""

    name: str
    value: Any = None

    def __post_init__(self):
        if not self.name.startswith("${"):
            self.name = f"${{{self.name}}}"


@dataclass
class Task:
    """A task within a process (equivalent to RF TestCase)."""

    name: str
    activities: list[ActivityCall] = field(default_factory=list)
    setup: ActivityCall | None = None
    teardown: ActivityCall | None = None
    tags: list[str] = field(default_factory=list)


class TaskBuilder:
    """Builder for creating tasks programmatically."""

    def __init__(self, task: Task):
        self._task = task

    def add_activity(
        self,
        library: str,
        activity: str,
        *args: Any,
        line: int = 0,
        node_id: str = "",
        **kwargs: Any,
    ) -> TaskBuilder:
        self._task.activities.append(
            ActivityCall(
                library=library,
                activity=activity,
                args=args,
                kwargs=kwargs,
                line=line,
                node_id=node_id,
            )
        )
        return self

    def set_setup(
        self,
        library: str,
        activity: str,
        *args: Any,
        **kwargs: Any,
    ) -> TaskBuilder:
        self._task.setup = ActivityCall(
            library=library,
            activity=activity,
            args=args,
            kwargs=kwargs,
        )
        return self

    def set_teardown(
        self,
        library: str,
        activity: str,
        *args: Any,
        **kwargs: Any,
    ) -> TaskBuilder:
        self._task.teardown = ActivityCall(
            library=library,
            activity=activity,
            args=args,
            kwargs=kwargs,
        )
        return self

    def add_tags(self, *tags: str) -> TaskBuilder:
        self._task.tags.extend(tags)
        return self

    def build(self) -> Task:
        return self._task


@dataclass
class Process:
    """A process (equivalent to RF TestSuite)."""

    name: str
    tasks: list[Task] = field(default_factory=list)
    variables: dict[str, Any] = field(default_factory=dict)
    imports: list[str] = field(default_factory=list)

    def get_variable(self, name: str, default: Any = None) -> Any:
        var_name = name.strip("${}")
        return self.variables.get(var_name, default)

    def set_variable(self, name: str, value: Any) -> None:
        var_name = name.strip("${}")
        self.variables[var_name] = value


@dataclass
class ExecutionResult:
    """Result of process execution."""

    status: ExecutionStatus
    message: str = ""
    variables: dict[str, Any] = field(default_factory=dict)
    elapsed_ms: int = 0
    task_results: list[dict[str, Any]] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.status == ExecutionStatus.PASS

    @property
    def failed(self) -> bool:
        return self.status == ExecutionStatus.FAIL


class ProcessBuilder:
    """Builder for creating processes programmatically."""

    def __init__(self, name: str):
        self._process = Process(name=name)

    @property
    def name(self) -> str:
        return self._process.name

    def add_variable(self, name: str, value: Any) -> ProcessBuilder:
        var_name = name.strip("${}")
        self._process.variables[var_name] = value
        return self

    def add_import(self, module: str) -> ProcessBuilder:
        self._process.imports.append(module)
        return self

    def add_task(self, name: str) -> TaskBuilder:
        task = Task(name=name)
        self._process.tasks.append(task)
        return TaskBuilder(task)

    def build(self) -> Process:
        return self._process
