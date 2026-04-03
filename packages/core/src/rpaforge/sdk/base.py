from __future__ import annotations

from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .types import Port


class ActivityContext:
    def __init__(
        self,
        properties: dict[str, Any],
        variables: dict[str, Any],
        state: dict[str, Any],
    ):
        self._properties = properties
        self._variables = variables
        self._state = state
        self._outputs: dict[str, Any] = {}

    def get_property(self, name: str, default: Any = None) -> Any:
        return self._properties.get(name, default)

    def get_variable(self, name: str, default: Any = None) -> Any:
        if name.startswith("${") and name.endswith("}"):
            name = name[2:-1]
        return self._variables.get(name, default)

    def set_variable(self, name: str, value: Any) -> None:
        if name.startswith("${") and name.endswith("}"):
            name = name[2:-1]
        self._variables[name] = value

    def get_state(self, key: str, default: Any = None) -> Any:
        return self._state.get(key, default)

    def set_state(self, key: str, value: Any) -> None:
        self._state[key] = value

    def evaluate(self, expression: str) -> Any:
        return self._evaluate_expression(expression)

    def output(self, port_id: str, data: Any = None) -> dict[str, Any]:
        self._outputs[port_id] = data
        return {"port": port_id, "data": data}

    def _evaluate_expression(self, expression: str) -> Any:
        import re

        def replace_var(match: re.Match) -> str:
            var_name = match.group(1)
            value = self.get_variable(var_name)
            return str(value) if value is not None else match.group(0)

        result = re.sub(r"\$\{([^}]+)\}", replace_var, expression)

        try:
            return eval(result, {"__builtins__": {}}, self._variables)
        except Exception:
            return result


class ExecutionResult:
    def __init__(
        self,
        success: bool = True,
        output_port: str = "output",
        data: Any = None,
        error: Optional[str] = None,
    ):
        self.success = success
        self.output_port = output_port
        self.data = data
        self.error = error

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "success": self.success,
            "outputPort": self.output_port,
        }
        if self.data is not None:
            result["data"] = self.data
        if self.error:
            result["error"] = self.error
        return result


class BaseActivity:
    metadata: Optional[Any] = None

    def __init__(self, context: ActivityContext):
        self.context = context

    def execute(self) -> ExecutionResult:
        raise NotImplementedError("Subclasses must implement execute()")


class SyncActivity(BaseActivity):
    def execute(self) -> ExecutionResult:
        return super().execute()


class AsyncActivity(BaseActivity):
    async def execute_async(self) -> ExecutionResult:
        raise NotImplementedError("Subclasses must implement execute_async()")


class LoopActivity(BaseActivity):
    def get_iterations(self) -> int:
        raise NotImplementedError("Subclasses must implement get_iterations()")

    def before_iteration(self, index: int) -> bool:
        return True

    def after_iteration(self, index: int) -> bool:
        return True


class ConditionActivity(BaseActivity):
    def get_branches(self) -> list[dict[str, str]]:
        raise NotImplementedError("Subclasses must implement get_branches()")

    def evaluate(self) -> str:
        raise NotImplementedError("Subclasses must implement evaluate()")


class ContainerActivity(BaseActivity):
    def enter(self) -> bool:
        return True

    def exit(self) -> bool:
        return True


class ErrorHandlerActivity(BaseActivity):
    def get_try_block(self) -> list[Any]:
        return []

    def get_catch_blocks(self) -> list[dict[str, Any]]:
        return []

    def get_finally_block(self) -> list[Any]:
        return []

    def on_exception(self, exception: Exception) -> Optional[str]:
        return None

    def matches_exception(self, exception: Exception, exception_type: str) -> bool:
        return exception.__class__.__name__ == exception_type
