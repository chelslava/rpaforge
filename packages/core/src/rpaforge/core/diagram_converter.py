"""
RPAForge Diagram to Process Converter.

Converts visual diagram JSON to Process objects for execution.
"""

from __future__ import annotations

from typing import Any

from rpaforge.core.execution import ActivityCall, Process, Task


class DiagramConverter:
    """Converts visual diagram JSON to Process objects."""

    MAX_RECURSION_DEPTH = 1000

    def __init__(self):
        self._node_line_counter = 0

    def convert(self, diagram: dict[str, Any]) -> Process:
        nodes = {n["id"]: n for n in diagram.get("nodes", [])}
        edges = diagram.get("edges", [])

        start_node = self._find_start_node(nodes)
        if not start_node:
            return Process(name="Empty Process")

        start_data = nodes[start_node].get("data", {}).get("blockData", {})
        process_name = start_data.get("processName", "Main Process")

        process = Process(name=process_name)

        variables = self._extract_variables(nodes)
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

    def _extract_variables(self, nodes: dict[str, Any]) -> dict[str, Any]:
        variables = {}

        for node in nodes.values():
            data = node.get("data", {})
            block_data = data.get("blockData", {})

            if block_data.get("type") == "assign":
                var_name = block_data.get("variableName", "")
                expr = block_data.get("expression", "")
                if var_name:
                    variables[var_name] = expr

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

        while stack:
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

            if block_type == "activity":
                activity = self._create_activity(node)
                if activity:
                    task.activities.append(activity)

            elif block_type == "if":
                self._push_if_branches(node_id, graph, stack, branch_visited)

            elif block_type == "while":
                self._push_while_branch(node_id, graph, stack, branch_visited)

            elif block_type == "for-each":
                self._push_for_each_branch(node_id, graph, stack, branch_visited)

            elif block_type == "try-catch":
                self._push_try_catch_branches(node_id, graph, stack, branch_visited)

            elif block_type != "end":
                successors = graph.get(node_id, [])
                for next_id, _ in reversed(successors):
                    if next_id not in branch_visited:
                        stack.append((next_id, branch_visited.copy(), None))

    def _push_if_branches(
        self,
        node_id: str,
        graph: dict[str, list[tuple[str, str | None]]],
        stack: list[tuple[str, set[str], str | None]],
        visited: set[str],
    ) -> None:
        successors = graph.get(node_id, [])
        true_target = next(
            (target for target, handle in successors if handle == "true"), None
        )
        false_target = next(
            (target for target, handle in successors if handle == "false"), None
        )

        if true_target:
            stack.append((true_target, visited.copy(), None))
        if false_target:
            stack.append((false_target, visited.copy(), None))

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

        try_target = target_by_handle.get("output")
        if try_target:
            stack.append((try_target, visited.copy(), None))

        error_target = target_by_handle.get("error")
        if error_target:
            stack.append((error_target, visited.copy(), None))

    def _create_activity(self, node: dict[str, Any]) -> ActivityCall | None:
        data = node.get("data", {})
        block_data = data.get("blockData", {})

        library = block_data.get("library", "Flow")
        activity_data = block_data.get("activity", "Log Message")

        if isinstance(activity_data, dict):
            activity_name = activity_data.get("name", "Log Message")
            library = activity_data.get("library", library)
        else:
            activity_name = activity_data

        activity_values = data.get("activityValues", {})
        block_args = block_data.get("args", [])
        params = block_data.get("params", {})

        args = (
            block_args
            if block_args
            else (
                list(activity_values.values())
                if activity_values
                else list(params.values()) if params else []
            )
        )

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
