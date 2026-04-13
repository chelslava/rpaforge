"""
RPAForge Python Code Generator.

Converts visual diagram JSON to native Python code.
"""

from __future__ import annotations

import json
import re
from pathlib import PurePosixPath
from typing import Any


def _sanitize_string(s: str) -> str:
    """Remove invalid UTF-16 surrogate characters."""
    return re.sub(r"[\ud800-\udfff]", "", s)


class DiagramValidationError(Exception):
    """Raised when diagram validation fails."""

    def __init__(
        self, error_type: str, message: str, node_ids: list[str] | None = None
    ):
        self.error_type = error_type
        self.message = message
        self.node_ids = node_ids or []
        super().__init__(message)


class PythonCodeGenerator:
    """Converts visual diagram JSON to native Python code."""

    def __init__(self):
        self._indent = "    "
        self._libraries: set[str] = set()
        self._variables: dict[str, str] = {}
        self._sourcemap: dict[int, str] = {}
        self._node_lines: list[tuple[str, list[str]]] = []
        self._diagram_metadata_by_id: dict[str, dict[str, Any]] = {}
        self._sub_diagram_imports: set[str] = set()

    def validate_diagram(self, diagram: dict[str, Any]) -> list[DiagramValidationError]:
        errors: list[DiagramValidationError] = []
        nodes = {n["id"]: n for n in diagram.get("nodes", [])}

        start_nodes = [
            nid
            for nid, node in nodes.items()
            if node.get("data", {}).get("blockData", {}).get("type") == "start"
        ]

        if len(start_nodes) == 0:
            errors.append(
                DiagramValidationError(
                    error_type="no_start",
                    message="Diagram must have exactly one Start node",
                )
            )
        elif len(start_nodes) > 1:
            errors.append(
                DiagramValidationError(
                    error_type="multiple_start",
                    message="Diagram must have exactly one Start node",
                    node_ids=start_nodes,
                )
            )

        return errors

    def generate(self, diagram: dict[str, Any]) -> str:
        """Generate Python code from diagram."""
        self._libraries = set()
        self._variables = {}
        self._sourcemap = {}
        self._node_lines = []
        self._diagram_metadata_by_id = {}
        self._sub_diagram_imports = set()

        errors = self.validate_diagram(diagram)
        if errors:
            raise errors[0]

        nodes = {n["id"]: n for n in diagram.get("nodes", [])}
        edges = diagram.get("edges", [])
        graph = self._build_graph(nodes, edges)
        start_node = self._find_start_node(nodes)

        if not start_node:
            return self._generate_empty()

        start_data = nodes[start_node].get("data", {}).get("blockData", {})
        process_name = _sanitize_string(start_data.get("processName", "Main Process"))

        lines = self._compose_python_file(
            process_name=process_name,
            variables_nodes=nodes,
            task_lines=self._generate_function_body(start_node, nodes, graph),
        )

        return self._finalize_code(lines)

    def generate_with_sourcemap(
        self, diagram: dict[str, Any]
    ) -> tuple[str, dict[int, str]]:
        code = self.generate(diagram)
        return code, self._sourcemap.copy()

    def _compose_python_file(
        self,
        process_name: str,
        variables_nodes: dict[str, Any],
        task_lines: list[str],
    ) -> list[str]:
        lines = [
            '"""Auto-generated RPAForge process."""',
            "",
        ]

        libs = sorted(self._libraries)
        if libs:
            for lib in libs:
                lines.append(f"from rpaforge.libraries import {lib}")
            lines.append("")

        imports = sorted(self._sub_diagram_imports)
        if imports:
            for imp in imports:
                lines.append(imp)
            lines.append("")

        lines.append("")
        vars_lines = self._generate_variables(variables_nodes)
        if vars_lines:
            lines.extend(vars_lines)
            lines.append("")

        lines.append(f"def {self._sanitize_identifier(process_name)}():")
        lines.extend(task_lines or [f"{self._indent}pass"])

        lines.append("")
        lines.append("")
        lines.append('if __name__ == "__main__":')
        lines.append(f"    {self._sanitize_identifier(process_name)}()")
        lines.append("")

        return lines

    def _finalize_code(self, lines: list[str]) -> str:
        code = "\n".join(lines)

        line_num = 1
        for line in lines:
            for node_id, node_code_lines in self._node_lines:
                if line in node_code_lines:
                    self._sourcemap[line_num] = node_id
                    break
            line_num += 1

        return code

    def _generate_variables(self, nodes: dict[str, Any]) -> list[str]:
        lines: list[str] = []

        for node in nodes.values():
            data = node.get("data", {})
            block_data = data.get("blockData", {})

            if block_data.get("type") == "assign":
                var_name = block_data.get("variableName", "")
                expr = block_data.get("expression", "")
                if var_name:
                    self._variables[var_name] = expr

        if self._variables:
            for var_name, value in self._variables.items():
                lines.append(f"{var_name} = {repr(value)}")

        return lines

    def _generate_function_body(
        self,
        start_node: str,
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
    ) -> list[str]:
        lines: list[str] = []

        visited: set[str] = set()
        body_lines = self._generate_node(start_node, nodes, graph, visited, indent=1)
        lines.extend(body_lines)

        return lines

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

    def _find_start_node(self, nodes: dict[str, Any]) -> str | None:
        for nid, node in nodes.items():
            block_type = node.get("data", {}).get("blockData", {}).get("type")
            if block_type == "start":
                return nid
        return None

    def _generate_empty(self) -> str:
        return '''"""Auto-generated RPAForge process."""\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n'''

    def _generate_node(
        self,
        node_id: str,
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        visited: set[str],
        indent: int = 1,
        stop_node: str | None = None,
    ) -> list[str]:
        if node_id == stop_node:
            return []

        if node_id in visited:
            return []

        visited.add(node_id)

        node = nodes.get(node_id)
        if not node:
            return []

        data = node.get("data", {})
        block_data = data.get("blockData", {})
        block_type = block_data.get("type", "activity")

        lines: list[str] = []
        prefix = self._indent * indent

        if block_type == "if":
            return self._generate_if_node(
                node_id=node_id,
                block_data=block_data,
                nodes=nodes,
                graph=graph,
                visited=visited,
                indent=indent,
                stop_node=stop_node,
            )
        if block_type == "while":
            return self._generate_while_node(
                node_id=node_id,
                block_data=block_data,
                nodes=nodes,
                graph=graph,
                visited=visited,
                indent=indent,
                stop_node=stop_node,
            )
        if block_type == "for-each":
            return self._generate_for_each_node(
                node_id=node_id,
                block_data=block_data,
                nodes=nodes,
                graph=graph,
                visited=visited,
                indent=indent,
                stop_node=stop_node,
            )
        if block_type == "try-catch":
            return self._generate_try_catch_node(
                node_id=node_id,
                block_data=block_data,
                nodes=nodes,
                graph=graph,
                visited=visited,
                indent=indent,
                stop_node=stop_node,
            )

        handler = self._get_block_handler(block_type)
        node_lines = handler(block_data, prefix, indent)

        lines.extend(node_lines)
        self._node_lines.append((node_id, node_lines))

        successors = graph.get(node_id, [])

        if block_type != "end":
            for next_id, _ in successors:
                lines.extend(
                    self._generate_node(
                        next_id,
                        nodes,
                        graph,
                        visited,
                        indent,
                        stop_node=stop_node,
                    )
                )

        return lines

    def _generate_if_node(
        self,
        node_id: str,
        block_data: dict[str, Any],
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        visited: set[str],
        indent: int,
        stop_node: str | None = None,
    ) -> list[str]:
        prefix = self._indent * indent
        condition = _sanitize_string(block_data.get("condition", "True"))
        successors = graph.get(node_id, [])

        true_target = next(
            (target for target, handle in successors if handle == "true"), None
        )
        false_target = next(
            (target for target, handle in successors if handle == "false"), None
        )

        lines = [f"{prefix}if {condition}:"]

        true_lines = (
            self._generate_node(
                true_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=stop_node,
            )
            if true_target
            else []
        )
        lines.extend(true_lines or [f"{prefix}{self._indent}pass"])

        if false_target:
            lines.append(f"{prefix}else:")
            false_lines = self._generate_node(
                false_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=stop_node,
            )
            lines.extend(false_lines or [f"{prefix}{self._indent}pass"])

        return lines

    def _generate_while_node(
        self,
        node_id: str,
        block_data: dict[str, Any],
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        visited: set[str],
        indent: int,
        stop_node: str | None = None,
    ) -> list[str]:
        prefix = self._indent * indent
        condition = _sanitize_string(block_data.get("condition", "True"))
        successors = graph.get(node_id, [])
        body_target = next((target for target, _ in successors), None)

        lines = [f"{prefix}while {condition}:"]

        body_lines = (
            self._generate_node(
                body_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=node_id,
            )
            if body_target
            else []
        )
        lines.extend(body_lines or [f"{prefix}{self._indent}pass"])

        return lines

    def _generate_for_each_node(
        self,
        node_id: str,
        block_data: dict[str, Any],
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        visited: set[str],
        indent: int,
        stop_node: str | None = None,
    ) -> list[str]:
        prefix = self._indent * indent
        item_var = _sanitize_string(block_data.get("itemVariable", "item"))
        collection = _sanitize_string(block_data.get("collection", "items"))
        successors = graph.get(node_id, [])
        body_target = next((target for target, _ in successors), None)

        lines = [f"{prefix}for {item_var} in {collection}:"]

        body_lines = (
            self._generate_node(
                body_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=node_id,
            )
            if body_target
            else []
        )
        lines.extend(body_lines or [f"{prefix}{self._indent}pass"])

        return lines

    def _generate_try_catch_node(
        self,
        node_id: str,
        block_data: dict[str, Any],
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        visited: set[str],
        indent: int,
        stop_node: str | None = None,
    ) -> list[str]:
        prefix = self._indent * indent
        successors = graph.get(node_id, [])
        target_by_handle = {
            handle: target for target, handle in successors if isinstance(handle, str)
        }

        try_target = target_by_handle.get("output")
        error_target = target_by_handle.get("error")
        finally_target = target_by_handle.get("finally")

        lines = [f"{prefix}try:"]

        try_lines = (
            self._generate_node(
                try_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=stop_node,
            )
            if try_target
            else []
        )
        lines.extend(try_lines or [f"{prefix}{self._indent}pass"])

        if error_target:
            lines.append(f"{prefix}except Exception as e:")
            error_lines = self._generate_node(
                error_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=stop_node,
            )
            lines.extend(error_lines or [f"{prefix}{self._indent}pass"])

        if finally_target:
            lines.append(f"{prefix}finally:")
            finally_lines = self._generate_node(
                finally_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=stop_node,
            )
            lines.extend(finally_lines or [f"{prefix}{self._indent}pass"])

        return lines

    def _get_block_handler(self, block_type: str):
        handlers = {
            "start": self._handle_start,
            "end": self._handle_end,
            "assign": self._handle_assign,
            "activity": self._handle_activity,
            "sub-diagram-call": self._handle_sub_diagram_call,
        }
        return handlers.get(block_type, self._handle_unknown)

    def _handle_start(self, _block_data: dict, _prefix: str, _indent: int) -> list[str]:
        return []

    def _handle_end(self, _block_data: dict, prefix: str, _indent: int) -> list[str]:
        return [f"{prefix}# End"]

    def _handle_assign(self, block_data: dict, prefix: str, _indent: int) -> list[str]:
        var_name = _sanitize_string(block_data.get("variableName", "result"))
        expr = _sanitize_string(block_data.get("expression", ""))
        return [f"{prefix}{var_name} = {expr}"]

    def _handle_activity(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        library = block_data.get("library", "DesktopUI")
        activity_name = block_data.get("activity", "Log")
        args = block_data.get("args", [])

        self._libraries.add(library)

        method_name = activity_name.lower().replace(" ", "_")

        if args:
            args_str = ", ".join(repr(a) for a in args)
            return [f"{prefix}{library.lower()}.{method_name}({args_str})"]
        else:
            return [f"{prefix}{library.lower()}.{method_name}()"]

    def _handle_sub_diagram_call(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        diagram_id = block_data.get("diagramId", "")
        diagram_name = block_data.get("diagramName", "unnamed")
        parameters = block_data.get("parameters", {})
        returns = block_data.get("returns", {})

        module_name = self._sanitize_identifier(diagram_name)
        self._sub_diagram_imports.add(
            f"from processes.{module_name} import {module_name}"
        )

        lines = []

        if parameters:
            params_parts = []
            for k, v in parameters.items():
                sanitized_value = _sanitize_string(str(v))
                if sanitized_value and sanitized_value[0].isalpha():
                    params_parts.append(f"{k}={sanitized_value}")
                else:
                    params_parts.append(f"{k}={repr(sanitized_value)}")
            params_str = ", ".join(params_parts)
            lines.append(f"{prefix}# Call sub-diagram: {diagram_name}")
            lines.append(f"{prefix}_result = {module_name}({params_str})")
        else:
            lines.append(f"{prefix}# Call sub-diagram: {diagram_name}")
            lines.append(f"{prefix}_result = {module_name}()")

        if returns:
            for output_var, result_key in returns.items():
                sanitized_var = _sanitize_string(str(output_var))
                lines.append(
                    f"{prefix}{sanitized_var} = _result.get({repr(result_key)})"
                )

        return lines

    def _handle_unknown(self, block_data: dict, prefix: str, _indent: int) -> list[str]:
        return [f"{prefix}# Unknown block type"]

    def _sanitize_identifier(self, name: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_]", "_", _sanitize_string(name))
        if safe and safe[0].isdigit():
            safe = "_" + safe
        return safe or "process"

    def generate_project(
        self,
        main_diagram: dict[str, Any],
        sub_diagrams: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, str]:
        """Generate Python files for main diagram and all sub-diagrams.

        Args:
            main_diagram: The main diagram data
            sub_diagrams: Dictionary of diagram_id -> diagram data for sub-diagrams

        Returns:
            Dictionary mapping file paths to Python code
        """
        files = {}

        main_code = self.generate(main_diagram)
        files["main.py"] = main_code

        if sub_diagrams:
            for diag_id, diag_data in sub_diagrams.items():
                diag_metadata = diag_data.get("metadata", {})
                diag_name = diag_metadata.get("name", f"diagram_{diag_id}")
                module_name = self._sanitize_identifier(diag_name)

                diag_code = self.generate(diag_data)
                files[f"processes/{module_name}.py"] = diag_code

        return files
