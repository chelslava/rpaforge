"""
RPAForge Diagram to Process Converter.

Converts visual diagram JSON to Process objects for execution.
"""

from __future__ import annotations

import ast
import logging
from typing import Any

from rpaforge.core.execution import ActivityCall, Process, Task, TryCatchGroup
from rpaforge.core.validator import (
    ProcessValidator,
    ValidationResult,
)
from rpaforge.core.validator import (
    ValidationError as DiagramValidationError,
)

logger = logging.getLogger("rpaforge.converter")


class DiagramConverter:
    """Converts visual diagram JSON to Process objects."""

    MAX_RECURSION_DEPTH = 1000

    def __init__(self):
        self._node_line_counter = 0
        self._initial_variables: dict[str, Any] = {}

    def convert(
        self,
        diagram: dict[str, Any],
        validation_result: ValidationResult | None = None,
    ) -> Process:
        result = validation_result or ProcessValidator().validate_diagram(diagram)
        if not result.is_valid and result.errors:
            first_error = result.errors[0]
            raise DiagramValidationError(
                f"Diagram validation failed: {first_error.message} ({first_error.error_type})"
            )

        nodes = {n["id"]: n for n in diagram.get("nodes", [])}
        edges = diagram.get("edges", [])

        start_node = self._find_start_node(nodes)
        if not start_node:
            return Process(name="Empty Process")

        start_data = nodes[start_node].get("data", {}).get("blockData", {})
        process_name = start_data.get("processName", "Main Process")

        process = Process(name=process_name)

        variables = self._extract_variables(diagram)
        self._initial_variables = variables
        for var_name, var_value in variables.items():
            process.set_variable(var_name, var_value)

        graph = self._build_graph(nodes, edges)

        task = Task(name="Main Task")
        self._node_line_counter = 0
        self._collect_activities_iterative(start_node, nodes, graph, task)

        process.tasks.append(task)

        return process

    def _find_start_node(self, nodes: dict[str, Any]) -> str | None:
        for nid, node in nodes.items():
            block_type = node.get("data", {}).get("blockData", {}).get("type")
            if block_type == "start":
                return nid
        return None

    def _build_graph(
        self, nodes: dict[str, Any], edges: list[dict]
    ) -> dict[str, list[tuple[str, str | None]]]:
        graph: dict[str, list[tuple[str, str | None]]] = {nid: [] for nid in nodes}

        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            handle = edge.get("sourceHandle")

            if source and target and source in graph:
                graph[source].append((target, handle))

        return graph

    def _extract_variables(self, diagram: dict[str, Any]) -> dict[str, Any]:
        variables: dict[str, Any] = {}
        nodes = {n["id"]: n for n in diagram.get("nodes", []) if "id" in n}
        from rpaforge.core.validation import validate_variable_name

        for variable in diagram.get("variables", []):
            if not isinstance(variable, dict):
                continue
            variable_name = variable.get("name")
            if isinstance(variable_name, str) and variable_name:
                try:
                    validated_name = validate_variable_name(variable_name)
                except Exception:
                    continue
                variables[validated_name] = variable.get("value", "")

        for node in nodes.values():
            data = node.get("data", {})
            block_data = data.get("blockData", {})

            if block_data.get("type") == "assign":
                var_name = block_data.get("variableName", "")
                expr = block_data.get("expression", "")
                if var_name:
                    from rpaforge.core.validation import validate_variable_name

                    try:
                        validated_name = validate_variable_name(var_name)
                        try:
                            variables[validated_name] = ast.literal_eval(expr)
                        except (ValueError, SyntaxError):
                            variables[validated_name] = expr
                    except Exception as e:
                        logger.debug(
                            "Skipping invalid variable name %r: %s", var_name, e
                        )

        return variables

    def _collect_activities_iterative(
        self,
        start_node: str,
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        task: Task,
    ) -> None:
        visited: set[str] = set()
        stack: list[tuple[str, set[str], str | None]] = [(start_node, set(), None)]
        depth = 0

        while stack:
            depth += 1
            if depth > self.MAX_RECURSION_DEPTH:
                raise DiagramValidationError(
                    "Diagram too complex: exceeded maximum recursion depth"
                )
            node_id, branch_visited, stop_node = stack.pop()

            if node_id == stop_node:
                continue
            if node_id in visited:
                continue

            visited.add(node_id)
            branch_visited = branch_visited | {node_id}

            node = nodes.get(node_id)
            if not node:
                continue

            data = node.get("data", {})
            block_data = data.get("blockData", {})
            block_type = block_data.get("type", "activity")

            # Checkpoint for breakpoint support on control-flow blocks
            if block_type not in ("activity", "throw", "start", "end"):
                task.activities.append(self._create_checkpoint_activity(node_id))

            if block_type == "activity":
                activity = self._create_activity(node)
                if activity:
                    task.activities.append(activity)

                successors = graph.get(node_id, [])
                for next_id, _ in reversed(successors):
                    if next_id not in branch_visited:
                        stack.append((next_id, branch_visited.copy(), None))

            elif block_type == "if":
                self._push_if_branches(node_id, node, graph, stack, branch_visited)

            elif block_type == "while":
                self._push_while_branch(node_id, graph, stack, branch_visited)

            elif block_type == "for-each":
                self._push_for_each_branch(node_id, graph, stack, branch_visited)

            elif block_type == "try-catch":
                tc_group = self._build_try_catch_group(node_id, nodes, graph)
                task.activities.append(tc_group)
                merge = self._find_try_catch_merge(node_id, graph)
                if merge and merge not in branch_visited:
                    stack.append((merge, branch_visited.copy(), stop_node))

            elif block_type == "throw":
                activity = self._create_throw_activity(node)
                if activity:
                    task.activities.append(activity)

            elif block_type != "end":
                successors = graph.get(node_id, [])
                for next_id, _ in reversed(successors):
                    if next_id not in branch_visited:
                        stack.append((next_id, branch_visited.copy(), None))

    def _push_if_branches(
        self,
        node_id: str,
        node: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        stack: list[tuple[str, set[str], str | None]],
        visited: set[str],
    ) -> None:
        from rpaforge.core.safe_evaluator import safe_eval

        successors = graph.get(node_id, [])
        true_target = next(
            (target for target, handle in successors if handle == "true"), None
        )
        false_target = next(
            (target for target, handle in successors if handle == "false"), None
        )

        branch_taken: str | None = None
        condition = node.get("data", {}).get("blockData", {}).get("condition", "")
        if condition:
            try:
                result = safe_eval(condition, self._initial_variables)
                branch_taken = "true" if result else "false"
            except Exception:
                pass  # dynamic condition — collect both branches

        if branch_taken == "true":
            if true_target:
                stack.append((true_target, visited.copy(), None))
        elif branch_taken == "false":
            if false_target:
                stack.append((false_target, visited.copy(), None))
        else:
            if false_target:
                stack.append((false_target, visited.copy(), None))
            if true_target:
                stack.append((true_target, visited.copy(), None))

        for next_id, handle in successors:
            if handle not in ("true", "false") and next_id not in visited:
                stack.append((next_id, visited.copy(), None))

    def _push_while_branch(
        self,
        node_id: str,
        graph: dict[str, list[tuple[str, str | None]]],
        stack: list[tuple[str, set[str], str | None]],
        visited: set[str],
    ) -> None:
        successors = graph.get(node_id, [])
        body_target = next((target for target, _ in successors), None)
        if body_target:
            stack.append((body_target, visited.copy(), node_id))

    def _push_for_each_branch(
        self,
        node_id: str,
        graph: dict[str, list[tuple[str, str | None]]],
        stack: list[tuple[str, set[str], str | None]],
        visited: set[str],
    ) -> None:
        successors = graph.get(node_id, [])
        body_target = next((target for target, _ in successors), None)
        if body_target:
            stack.append((body_target, visited.copy(), node_id))

    def _find_try_catch_merge(
        self,
        node_id: str,
        graph: dict[str, list[tuple[str, str | None]]],
    ) -> str | None:
        """Find the first node reachable after both try and catch branches converge."""
        successors = graph.get(node_id, [])
        target_by_handle = {
            handle: target for target, handle in successors if isinstance(handle, str)
        }
        try_target = target_by_handle.get("output")
        error_target = target_by_handle.get("error")

        if not try_target or not error_target:
            return None

        def reachable_set(start: str) -> set[str]:
            visited: set[str] = set()
            queue = [start]
            while queue:
                n = queue.pop(0)
                if n in visited:
                    continue
                visited.add(n)
                for nxt, _ in graph.get(n, []):
                    queue.append(nxt)
            return visited

        try_reachable = reachable_set(try_target)
        error_reachable = reachable_set(error_target)
        common = try_reachable & error_reachable

        queue = [try_target]
        seen: set[str] = set()
        while queue:
            n = queue.pop(0)
            if n in seen:
                continue
            seen.add(n)
            if n in common and n != try_target:
                return n
            for nxt, _ in graph.get(n, []):
                queue.append(nxt)
        return None

    def _collect_sub_branch(
        self,
        start_node: str | None,
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        stop_node: str | None = None,
    ) -> list[Any]:
        """Collect activities for a sub-branch, stopping at stop_node."""
        if not start_node:
            return []

        activities: list[Any] = []
        visited: set[str] = set()
        stack: list[tuple[str, set[str], str | None]] = [(start_node, set(), stop_node)]

        while stack:
            node_id, branch_visited, stop = stack.pop()

            if node_id == stop or node_id in visited:
                continue

            visited.add(node_id)
            branch_visited = branch_visited | {node_id}

            node = nodes.get(node_id)
            if not node:
                continue

            data = node.get("data", {})
            block_data = data.get("blockData", {})
            block_type = block_data.get("type", "activity")

            if block_type not in ("activity", "throw", "start", "end"):
                activities.append(self._create_checkpoint_activity(node_id))

            if block_type == "activity":
                act = self._create_activity(node)
                if act:
                    activities.append(act)
                successors = graph.get(node_id, [])
                for next_id, _ in reversed(successors):
                    if next_id not in branch_visited:
                        stack.append((next_id, branch_visited.copy(), stop))

            elif block_type == "throw":
                act = self._create_throw_activity(node)
                if act:
                    activities.append(act)

            elif block_type == "if":
                self._push_if_branches(node_id, node, graph, stack, branch_visited)

            elif block_type == "try-catch":
                nested = self._build_try_catch_group(node_id, nodes, graph)
                activities.append(nested)
                merge = self._find_try_catch_merge(node_id, graph)
                if merge and merge != stop and merge not in branch_visited:
                    stack.append((merge, branch_visited.copy(), stop))

            elif block_type != "end":
                successors = graph.get(node_id, [])
                for next_id, _ in reversed(successors):
                    if next_id not in branch_visited:
                        stack.append((next_id, branch_visited.copy(), stop))

        return activities

    def _build_try_catch_group(
        self,
        node_id: str,
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
    ) -> TryCatchGroup:
        """Create a TryCatchGroup from the try-catch diagram node."""
        successors = graph.get(node_id, [])
        target_by_handle = {
            handle: target for target, handle in successors if isinstance(handle, str)
        }
        try_target = target_by_handle.get("output")
        error_target = target_by_handle.get("error")
        finally_target = target_by_handle.get("finally")

        merge = self._find_try_catch_merge(node_id, graph)

        return TryCatchGroup(
            try_activities=self._collect_sub_branch(try_target, nodes, graph, merge),
            catch_activities=self._collect_sub_branch(
                error_target, nodes, graph, merge
            ),
            finally_activities=self._collect_sub_branch(
                finally_target, nodes, graph, merge
            ),
            node_id=node_id,
        )

    def _push_try_catch_branches(
        self,
        node_id: str,
        graph: dict[str, list[tuple[str, str | None]]],
        stack: list[tuple[str, set[str], str | None]],
        visited: set[str],
    ) -> None:
        successors = graph.get(node_id, [])
        target_by_handle = {
            handle: target for target, handle in successors if isinstance(handle, str)
        }

        error_target = target_by_handle.get("error")
        if error_target:
            stack.append((error_target, visited.copy(), None))

        try_target = target_by_handle.get("output")
        if try_target:
            stack.append((try_target, visited.copy(), None))

    def _create_checkpoint_activity(self, node_id: str) -> ActivityCall:
        self._node_line_counter += 1
        return ActivityCall(
            library="__bp__",
            activity="checkpoint",
            args=(),
            kwargs={},
            line=self._node_line_counter,
            node_id=node_id,
            output_variable="",
        )

    def _create_throw_activity(self, node: dict[str, Any]) -> ActivityCall | None:
        block_data = node.get("data", {}).get("blockData", {})
        message = block_data.get("message", "Error occurred")
        exception_type = block_data.get("exceptionType", "Exception")
        self._node_line_counter += 1
        return ActivityCall(
            library="Flow",
            activity="throw_exception",
            args=(message, exception_type),
            kwargs={},
            line=self._node_line_counter,
            node_id=node.get("id", ""),
            output_variable="",
        )

    def _create_activity(self, node: dict[str, Any]) -> ActivityCall | None:
        data = node.get("data", {})
        block_data = data.get("blockData", {})

        activity_data = data.get("activity") or block_data.get("activity")
        if not activity_data:
            return None

        library = block_data.get("library", "Flow")

        if isinstance(activity_data, dict):
            activity_name = activity_data.get("name", "Log Message")
            library = activity_data.get("library", library)
        else:
            activity_name = activity_data

        activity_values = data.get("activityValues", {})
        block_args = block_data.get("args", [])
        params = block_data.get("params", {})

        if block_args:
            args = block_args
        elif activity_values:
            activity_def = data.get("activity") or {}
            if isinstance(activity_def, dict):
                params_meta = {p["name"]: p for p in activity_def.get("params", [])}
            else:
                params_meta = {}
            args = []
            for param_name, value in activity_values.items():
                if params_meta.get(param_name, {}).get("variadic") and isinstance(
                    value, list
                ):
                    args.extend(value)
                else:
                    args.append(value)
        elif params:
            args = list(params.values())
        else:
            args = []

        self._node_line_counter += 1

        return ActivityCall(
            library=library,
            activity=activity_name,
            args=tuple(args),
            kwargs={},
            line=self._node_line_counter,
            node_id=node.get("id", ""),
            output_variable=data.get(
                "outputVariable", block_data.get("output_variable", "")
            ),
        )
