"""Code Generator - converts diagram JSON to Robot Framework code."""

from __future__ import annotations

import json
import re
from pathlib import PurePosixPath
from typing import Any


def _sanitize_string(s: str) -> str:
    """Remove invalid UTF-16 surrogate characters.

    :param s: Input string that may contain surrogates.
    :returns: Sanitized string without surrogates.
    """
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


class CodeGenerator:
    """Converts visual diagram JSON to Robot Framework .robot code.

    The generator traverses the node graph starting from the Start block
    and generates corresponding Robot Framework syntax.
    """

    def __init__(self):
        self._indent = "    "
        self._libraries: set[str] = set()
        self._variables: dict[str, str] = {}
        self._sourcemap: dict[int, str] = {}
        self._node_lines: list[tuple[str, list[str]]] = []
        self._diagram_metadata_by_id: dict[str, dict[str, Any]] = {}

    def validate_diagram(self, diagram: dict[str, Any]) -> list[DiagramValidationError]:
        """Validate diagram topology before code generation.

        :param diagram: Diagram JSON with nodes and edges.
        :returns: List of validation errors (empty if valid).
        """
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

        if len(start_nodes) == 1:
            edges = diagram.get("edges", [])
            graph = self._build_graph(nodes, edges)
            start_id = start_nodes[0]

            reachable = self._find_reachable_nodes(start_id, graph)

            orphaned = [
                nid
                for nid in nodes
                if nid not in reachable
                and nodes[nid].get("data", {}).get("blockData", {}).get("type")
                != "start"
            ]

            if orphaned:
                errors.append(
                    DiagramValidationError(
                        error_type="orphaned_nodes",
                        message=f"{len(orphaned)} node(s) are not reachable from Start",
                        node_ids=orphaned,
                    )
                )

            errors.extend(self._validate_supported_graph_semantics(nodes, edges))

        return errors

    def validate_project_diagram(
        self,
        diagram_id: str,
        diagrams: dict[str, dict[str, Any]],
    ) -> list[DiagramValidationError]:
        """Validate a diagram plus its reachable nested-diagram graph."""
        if diagram_id not in diagrams:
            return [
                DiagramValidationError(
                    error_type="missing_subdiagram",
                    message=f'Diagram "{diagram_id}" not found in project documents',
                    node_ids=[diagram_id],
                )
            ]

        errors: list[DiagramValidationError] = []
        reachable = self._collect_reachable_diagrams(diagram_id, diagrams, errors)

        for reachable_id in reachable:
            document = diagrams.get(reachable_id)
            if not document:
                continue
            errors.extend(self.validate_diagram(document))

        return errors

    def _collect_reachable_diagrams(
        self,
        diagram_id: str,
        diagrams: dict[str, dict[str, Any]],
        errors: list[DiagramValidationError],
        visited: set[str] | None = None,
        stack: list[str] | None = None,
        ordered: list[str] | None = None,
    ) -> list[str]:
        """Collect diagrams reachable via sub-diagram-call blocks."""
        if visited is None:
            visited = set()
        if stack is None:
            stack = []
        if ordered is None:
            ordered = []

        if diagram_id in stack:
            errors.append(
                DiagramValidationError(
                    error_type="circular_subdiagram",
                    message=f'Circular sub-diagram reference detected: {" -> ".join([*stack, diagram_id])}',
                    node_ids=[*stack, diagram_id],
                )
            )
            return ordered

        if diagram_id in visited:
            return ordered

        document = diagrams.get(diagram_id)
        if not document:
            errors.append(
                DiagramValidationError(
                    error_type="missing_subdiagram",
                    message=f'Diagram "{diagram_id}" not found in project documents',
                    node_ids=[diagram_id],
                )
            )
            return ordered

        visited.add(diagram_id)
        stack.append(diagram_id)
        ordered.append(diagram_id)

        for node in document.get("nodes", []):
            block_data = node.get("data", {}).get("blockData", {})
            if block_data.get("type") != "sub-diagram-call":
                continue
            nested_id = block_data.get("diagramId")
            if isinstance(nested_id, str) and nested_id:
                self._collect_reachable_diagrams(
                    nested_id,
                    diagrams,
                    errors,
                    visited,
                    stack,
                    ordered,
                )

        stack.pop()
        return ordered

    def _validate_supported_graph_semantics(
        self, nodes: dict[str, Any], edges: list[dict[str, Any]]
    ) -> list[DiagramValidationError]:
        """Reject unsupported typed graph semantics explicitly."""
        errors: list[DiagramValidationError] = []
        outgoing_by_source: dict[str, list[dict[str, Any]]] = {}

        for edge in edges:
            source_id = edge.get("source")
            if isinstance(source_id, str):
                outgoing_by_source.setdefault(source_id, []).append(edge)

        for edge in edges:
            source_id = edge.get("source")
            if not source_id or source_id not in nodes:
                continue

            source_node = nodes[source_id]
            block_type = source_node.get("data", {}).get("blockData", {}).get("type")
            handle = edge.get("sourceHandle")

            if block_type == "parallel" or (
                isinstance(handle, str) and handle.startswith("branch")
            ):
                errors.append(
                    DiagramValidationError(
                        error_type="unsupported_parallel",
                        message="Parallel graph semantics are not supported by code generation yet",
                        node_ids=[source_id],
                    )
                )
                continue

            if handle in {"true", "false"} and block_type != "if":
                errors.append(
                    DiagramValidationError(
                        error_type="unsupported_branch_handle",
                        message="Only If blocks can emit true/false branch handles during generation",
                        node_ids=[source_id],
                    )
                )

        for node_id, node in nodes.items():
            block_type = node.get("data", {}).get("blockData", {}).get("type")
            if block_type != "if":
                continue

            outgoing = outgoing_by_source.get(node_id, [])
            true_edges = [
                edge for edge in outgoing if edge.get("sourceHandle") == "true"
            ]
            false_edges = [
                edge for edge in outgoing if edge.get("sourceHandle") == "false"
            ]
            invalid_handles = [
                str(edge.get("sourceHandle"))
                for edge in outgoing
                if edge.get("sourceHandle") not in {"true", "false"}
            ]

            if len(true_edges) > 1 or len(false_edges) > 1:
                errors.append(
                    DiagramValidationError(
                        error_type="unsupported_if_fanout",
                        message="If blocks must have at most one true and one false edge during generation",
                        node_ids=[node_id],
                    )
                )

            if len(true_edges) == 0:
                errors.append(
                    DiagramValidationError(
                        error_type="unsupported_if_handle",
                        message="If blocks must define a true branch during generation",
                        node_ids=[node_id],
                    )
                )

            if invalid_handles:
                errors.append(
                    DiagramValidationError(
                        error_type="unsupported_if_handle",
                        message="If blocks may only use true/false typed handles during generation",
                        node_ids=[node_id],
                    )
                )

        for node_id, node in nodes.items():
            block_data = node.get("data", {}).get("blockData", {})
            block_type = block_data.get("type")

            if block_type == "switch":
                outgoing = outgoing_by_source.get(node_id, [])
                expected_handles = {
                    *(
                        switch_case.get("id")
                        for switch_case in block_data.get("cases", [])
                    ),
                    "default",
                }
                handles = [
                    handle
                    for handle in (edge.get("sourceHandle") for edge in outgoing)
                    if isinstance(handle, str)
                ]

                duplicates = {handle for handle in handles if handles.count(handle) > 1}
                invalid_handles = [
                    handle for handle in handles if handle not in expected_handles
                ]

                if duplicates:
                    errors.append(
                        DiagramValidationError(
                            error_type="unsupported_switch_fanout",
                            message="Switch blocks must have at most one edge per case/default handle during generation",
                            node_ids=[node_id],
                        )
                    )

                if invalid_handles:
                    errors.append(
                        DiagramValidationError(
                            error_type="unsupported_switch_handle",
                            message="Switch blocks may only use configured case handles plus the default handle during generation",
                            node_ids=[node_id],
                        )
                    )

            if block_type == "try-catch":
                outgoing = outgoing_by_source.get(node_id, [])
                handles = [
                    handle
                    for handle in (edge.get("sourceHandle") for edge in outgoing)
                    if isinstance(handle, str)
                ]
                duplicates = {handle for handle in handles if handles.count(handle) > 1}
                invalid_handles = [
                    handle
                    for handle in handles
                    if handle not in {"output", "error", "finally"}
                ]
                except_blocks = block_data.get("exceptBlocks", [])

                if duplicates:
                    errors.append(
                        DiagramValidationError(
                            error_type="unsupported_try_catch_fanout",
                            message="Try/Catch blocks must have at most one output, error, and finally edge during generation",
                            node_ids=[node_id],
                        )
                    )

                if invalid_handles:
                    errors.append(
                        DiagramValidationError(
                            error_type="unsupported_try_catch_handle",
                            message="Try/Catch blocks may only use output, error, and finally handles during generation",
                            node_ids=[node_id],
                        )
                    )

                if len(except_blocks) > 1:
                    errors.append(
                        DiagramValidationError(
                            error_type="unsupported_multi_except",
                            message="Try/Catch code generation currently supports at most one EXCEPT handler",
                            node_ids=[node_id],
                        )
                    )

        unique_errors: list[DiagramValidationError] = []
        seen: set[tuple[str, str, tuple[str, ...]]] = set()
        for error in errors:
            key = (error.error_type, error.message, tuple(error.node_ids))
            if key not in seen:
                seen.add(key)
                unique_errors.append(error)

        return unique_errors

    def _find_reachable_nodes(
        self, start_id: str, graph: dict[str, list[tuple[str, str | None]]]
    ) -> set[str]:
        """Find all nodes reachable from start node via BFS.

        :param start_id: Start node ID.
        :param graph: Adjacency graph.
        :returns: Set of reachable node IDs.
        """
        reachable: set[str] = set()
        queue = [start_id]

        while queue:
            current = queue.pop(0)
            if current in reachable:
                continue
            reachable.add(current)

            for target, _ in graph.get(current, []):
                if target not in reachable:
                    queue.append(target)

        return reachable

    def _find_reachable_distances(
        self, start_id: str, graph: dict[str, list[tuple[str, str | None]]]
    ) -> dict[str, int]:
        """Find minimum edge distance from a start node to reachable nodes."""
        distances: dict[str, int] = {}
        queue: list[tuple[str, int]] = [(start_id, 0)]

        while queue:
            current, distance = queue.pop(0)
            if current in distances and distances[current] <= distance:
                continue

            distances[current] = distance

            for target, _ in graph.get(current, []):
                queue.append((target, distance + 1))

        return distances

    def _find_common_merge_node(
        self,
        targets: list[str | None],
        graph: dict[str, list[tuple[str, str | None]]],
    ) -> str | None:
        """Find the nearest common successor between multiple branches."""
        valid_targets = [target for target in targets if target]
        if len(valid_targets) < 2:
            return None

        distance_maps = [
            self._find_reachable_distances(target, graph) for target in valid_targets
        ]
        common_nodes = set(distance_maps[0])
        for distance_map in distance_maps[1:]:
            common_nodes &= set(distance_map)

        if not common_nodes:
            return None

        return min(
            common_nodes,
            key=lambda node_id: (
                sum(distance_map[node_id] for distance_map in distance_maps),
                *(distance_map[node_id] for distance_map in distance_maps),
                node_id,
            ),
        )

    def generate(self, diagram: dict[str, Any]) -> str:
        """Generate Robot Framework code from diagram.

        :param diagram: Diagram JSON with nodes and edges.
        :returns: Generated .robot file content.
        :raises DiagramValidationError: If diagram topology is invalid.
        """
        self._libraries = {"BuiltIn"}
        self._variables = {}
        self._sourcemap = {}
        self._node_lines = []
        self._diagram_metadata_by_id = {}

        project_diagrams, active_diagram_id = self._extract_project_documents(diagram)
        if project_diagrams and active_diagram_id:
            errors = self.validate_project_diagram(active_diagram_id, project_diagrams)
            if errors:
                raise errors[0]

            return self._generate_project_file(
                active_diagram_id,
                project_diagrams,
                diagram.get("project", {}).get("diagrams", []),
            )

        errors = self.validate_diagram(diagram)
        if errors:
            raise errors[0]

        nodes = {n["id"]: n for n in diagram.get("nodes", [])}
        edges = diagram.get("edges", [])
        graph = self._build_graph(nodes, edges)
        start_node = self._find_start_node(nodes)
        if not start_node:
            return self._generate_empty()

        lines = self._compose_robot_file(
            variables_nodes=nodes,
            task_lines=self._generate_tasks(start_node, nodes, graph),
        )

        return self._finalize_code(lines)

    def _extract_project_documents(
        self, diagram: dict[str, Any]
    ) -> tuple[dict[str, dict[str, Any]], str | None]:
        """Extract project diagram documents from the generation payload."""
        project = diagram.get("project")
        documents = diagram.get("diagramDocuments")
        if not isinstance(project, dict) or not isinstance(documents, dict):
            return {}, None

        active_diagram_id = (
            diagram.get("activeDiagramId")
            or diagram.get("metadata", {}).get("id")
            or project.get("main")
        )
        if not isinstance(active_diagram_id, str):
            return {}, None

        merged_documents: dict[str, dict[str, Any]] = {}
        for diagram_id, document in documents.items():
            if isinstance(diagram_id, str) and isinstance(document, dict):
                merged_documents[diagram_id] = document

        if active_diagram_id not in merged_documents and diagram.get("nodes"):
            merged_documents[active_diagram_id] = {
                "metadata": diagram.get("metadata", {}),
                "nodes": diagram.get("nodes", []),
                "edges": diagram.get("edges", []),
            }

        return merged_documents, active_diagram_id

    def _compose_robot_file(
        self,
        *,
        variables_nodes: dict[str, Any],
        task_lines: list[str],
        keyword_lines: list[str] | None = None,
    ) -> list[str]:
        """Compose the final Robot Framework file sections."""
        lines = self._generate_settings()
        lines.append("")

        vars_lines = self._generate_variables(variables_nodes)
        if vars_lines:
            lines.extend(vars_lines)
            lines.append("")

        lines.extend(task_lines)

        if keyword_lines:
            lines.append("")
            lines.extend(keyword_lines)

        lines.append("")
        return lines

    def _finalize_code(self, lines: list[str]) -> str:
        """Finalize source text and line-level sourcemap."""
        code = "\n".join(lines)

        line_num = 1
        for line in lines:
            for node_id, node_code_lines in self._node_lines:
                if line in node_code_lines:
                    self._sourcemap[line_num] = node_id
                    break
            line_num += 1

        return code

    def _generate_project_file(
        self,
        active_diagram_id: str,
        documents: dict[str, dict[str, Any]],
        project_diagrams: list[dict[str, Any]],
    ) -> str:
        """Generate Robot Framework source for a project with nested diagrams."""
        self._diagram_metadata_by_id = {
            diagram_meta.get("id"): diagram_meta
            for diagram_meta in project_diagrams
            if isinstance(diagram_meta, dict)
            and isinstance(diagram_meta.get("id"), str)
        }

        active_document = documents.get(active_diagram_id, {})
        active_nodes = {
            node["id"]: node
            for node in active_document.get("nodes", [])
            if "id" in node
        }
        active_edges = active_document.get("edges", [])
        active_graph = self._build_graph(active_nodes, active_edges)
        active_meta = self._diagram_metadata_by_id.get(
            active_diagram_id,
            active_document.get("metadata", {}),
        )

        start_node = self._find_start_node(active_nodes)
        if not start_node:
            return self._generate_empty()

        reachable_errors: list[DiagramValidationError] = []
        reachable_diagrams = self._collect_reachable_diagrams(
            active_diagram_id,
            documents,
            reachable_errors,
        )
        if reachable_errors:
            raise reachable_errors[0]

        keyword_lines: list[str] = []
        nested_diagram_ids = [
            diagram_id
            for diagram_id in reachable_diagrams
            if diagram_id != active_diagram_id
        ]

        if active_meta.get("type") == "main":
            task_lines = self._generate_tasks(start_node, active_nodes, active_graph)
        else:
            for input_name in active_meta.get("inputs", []) or []:
                self._variables.setdefault(
                    self._normalize_variable_name(input_name), ""
                )
            task_lines = self._generate_subdiagram_preview_task(active_diagram_id)
            nested_diagram_ids = reachable_diagrams

        if nested_diagram_ids:
            keyword_lines.append("*** Keywords ***")
            for diagram_id in nested_diagram_ids:
                keyword_lines.extend(
                    self._generate_keyword_for_diagram(diagram_id, documents)
                )
                keyword_lines.append("")
            while keyword_lines and keyword_lines[-1] == "":
                keyword_lines.pop()

        lines = self._compose_robot_file(
            variables_nodes=active_nodes,
            task_lines=task_lines,
            keyword_lines=keyword_lines or None,
        )

        return self._finalize_code(lines)

    def generate_with_sourcemap(
        self, diagram: dict[str, Any]
    ) -> tuple[str, dict[int, str]]:
        """Generate Robot Framework code with line-to-node sourcemap.

        :param diagram: Diagram JSON with nodes and edges.
        :returns: Tuple of (code, sourcemap) where sourcemap maps line numbers to node IDs.
        :raises DiagramValidationError: If diagram topology is invalid.
        """
        code = self.generate(diagram)
        return code, self._sourcemap.copy()

    def generate_files(self, diagram: dict[str, Any]) -> dict[str, str]:
        """Generate one or more Robot Framework files for a diagram/project."""
        project_diagrams, active_diagram_id = self._extract_project_documents(diagram)
        if project_diagrams and active_diagram_id:
            project_meta = diagram.get("project", {})
            main_diagram_id = (
                project_meta.get("main")
                if isinstance(project_meta.get("main"), str)
                else active_diagram_id
            )
            errors = self.validate_project_diagram(main_diagram_id, project_diagrams)
            if errors:
                raise errors[0]
            return self._generate_project_files(
                main_diagram_id,
                project_diagrams,
                project_meta.get("diagrams", []),
            )

        code = self.generate(diagram)
        metadata = diagram.get("metadata", {})
        file_name = self._robot_path_for_diagram(metadata)
        return {file_name: code}

    def _generate_project_files(
        self,
        main_diagram_id: str,
        documents: dict[str, dict[str, Any]],
        project_diagrams: list[dict[str, Any]],
    ) -> dict[str, str]:
        """Generate a resource-file bundle for a nested-diagram project."""
        metadata_by_id = {
            diagram_meta.get("id"): diagram_meta
            for diagram_meta in project_diagrams
            if isinstance(diagram_meta, dict)
            and isinstance(diagram_meta.get("id"), str)
        }
        self._diagram_metadata_by_id = metadata_by_id

        reachable_errors: list[DiagramValidationError] = []
        reachable_diagrams = self._collect_reachable_diagrams(
            main_diagram_id,
            documents,
            reachable_errors,
        )
        if reachable_errors:
            raise reachable_errors[0]

        files: dict[str, str] = {}
        for diagram_id in reachable_diagrams:
            file_path = self._robot_path_for_diagram(
                metadata_by_id.get(
                    diagram_id, documents.get(diagram_id, {}).get("metadata", {})
                )
            )
            files[file_path] = self._generate_bundle_file(
                diagram_id,
                documents,
                metadata_by_id,
                entry_diagram_id=main_diagram_id,
            )

        return files

    def _generate_bundle_file(
        self,
        diagram_id: str,
        documents: dict[str, dict[str, Any]],
        metadata_by_id: dict[str, dict[str, Any]],
        *,
        entry_diagram_id: str,
    ) -> str:
        """Generate a single Robot file for a diagram in a project bundle."""
        document = documents.get(diagram_id)
        if not document:
            raise DiagramValidationError(
                error_type="missing_subdiagram",
                message=f'Diagram "{diagram_id}" not found in project documents',
                node_ids=[diagram_id],
            )

        nodes = {node["id"]: node for node in document.get("nodes", []) if "id" in node}
        edges = document.get("edges", [])
        graph = self._build_graph(nodes, edges)
        start_node = self._find_start_node(nodes)
        if not start_node:
            raise DiagramValidationError(
                error_type="no_start",
                message=f'Diagram "{diagram_id}" must have exactly one Start node',
                node_ids=[diagram_id],
            )

        self._libraries = {"BuiltIn"}
        self._variables = {}
        self._node_lines = []

        diagram_meta = metadata_by_id.get(diagram_id, document.get("metadata", {}))
        child_ids = self._find_direct_subdiagram_children(diagram_id, documents)

        task_lines: list[str] | None = None
        keyword_lines: list[str] | None = None
        if diagram_id == entry_diagram_id:
            task_lines = self._generate_tasks(start_node, nodes, graph)
        else:
            keyword_lines = [
                "*** Keywords ***",
                *self._generate_keyword_for_diagram(diagram_id, documents),
            ]

        lines = self._generate_settings()
        current_path = self._robot_path_for_diagram(diagram_meta)
        for child_id in child_ids:
            child_meta = metadata_by_id.get(
                child_id, documents.get(child_id, {}).get("metadata", {})
            )
            child_path = self._robot_path_for_diagram(child_meta)
            lines.append(
                f"Resource    {self._relative_robot_path(current_path, child_path)}"
            )

        lines.append("")

        variables_lines = self._generate_variables(nodes)
        if variables_lines:
            lines.extend(variables_lines)
            lines.append("")

        if task_lines:
            lines.extend(task_lines)
        elif keyword_lines:
            lines.extend(keyword_lines)

        lines.append("")
        return "\n".join(lines)

    def _find_direct_subdiagram_children(
        self,
        diagram_id: str,
        documents: dict[str, dict[str, Any]],
    ) -> list[str]:
        """Find direct sub-diagram-call children for a diagram."""
        document = documents.get(diagram_id, {})
        seen: set[str] = set()
        children: list[str] = []
        for node in document.get("nodes", []):
            block_data = node.get("data", {}).get("blockData", {})
            child_id = (
                block_data.get("diagramId")
                if block_data.get("type") == "sub-diagram-call"
                else None
            )
            if isinstance(child_id, str) and child_id and child_id not in seen:
                seen.add(child_id)
                children.append(child_id)
        return children

    def _robot_path_for_diagram(self, diagram_meta: dict[str, Any]) -> str:
        """Resolve a `.robot` file path for diagram metadata."""
        raw_path = str(diagram_meta.get("path", "") or "")
        if raw_path.endswith(".diagram.json"):
            return raw_path[: -len(".diagram.json")] + ".robot"
        if raw_path.endswith(".json"):
            return raw_path[: -len(".json")] + ".robot"
        if raw_path.endswith(".robot"):
            return raw_path

        diagram_name = _sanitize_string(
            str(diagram_meta.get("name", "process"))
        ).strip()
        safe_name = (
            re.sub(r"[^a-zA-Z0-9._-]+", "-", diagram_name).strip("-") or "process"
        )
        return f"{safe_name}.robot"

    def _relative_robot_path(self, source_path: str, target_path: str) -> str:
        """Compute a resource import path relative to another Robot file."""
        source = PurePosixPath(source_path)
        target = PurePosixPath(target_path)
        source_parts = source.parent.parts
        target_parts = target.parts

        common = 0
        while (
            common < len(source_parts)
            and common < len(target_parts)
            and source_parts[common] == target_parts[common]
        ):
            common += 1

        relative_parts = [".."] * (len(source_parts) - common) + list(
            target_parts[common:]
        )
        return (
            PurePosixPath(*relative_parts).as_posix() if relative_parts else target.name
        )

    def _build_graph(
        self, nodes: dict[str, Any], edges: list[dict]
    ) -> dict[str, list[tuple[str, str | None]]]:
        """Build adjacency graph from edges.

        Returns dict: node_id -> [(target_id, handle), ...]
        """
        graph: dict[str, list[tuple[str, str | None]]] = {nid: [] for nid in nodes}

        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            handle = edge.get("sourceHandle")

            if source and target and source in graph:
                graph[source].append((target, handle))

        return graph

    def _find_start_node(self, nodes: dict[str, Any]) -> str | None:
        """Find the start node in the diagram."""
        for nid, node in nodes.items():
            block_type = node.get("data", {}).get("blockData", {}).get("type")
            if block_type == "start":
                return nid
        return None

    def _generate_empty(self) -> str:
        """Generate empty robot file."""
        return """*** Settings ***
Library    BuiltIn

*** Tasks ***
Empty Process
    No Operation
"""

    def _generate_settings(self) -> list[str]:
        """Generate *** Settings *** section."""
        lines = ["*** Settings ***"]
        for lib in sorted(self._libraries):
            lines.append(f"Library    {lib}")
        return lines

    def _generate_variables(self, nodes: dict[str, Any]) -> list[str]:
        """Generate *** Variables *** section."""
        lines: list[str] = []

        for node in nodes.values():
            data = node.get("data", {})
            block_data = data.get("blockData", {})

            if block_data.get("type") == "assign":
                var_name = block_data.get("variableName", "")
                expr = block_data.get("expression", "")
                if var_name:
                    var_key = (
                        var_name if var_name.startswith("${") else f"${{{var_name}}}"
                    )
                    self._variables[var_key] = expr

        if self._variables:
            lines.append("*** Variables ***")
            for var_name, value in self._variables.items():
                lines.append(f"{var_name}    {value}")

        return lines

    def _generate_tasks(
        self,
        start_node: str,
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
    ) -> list[str]:
        """Generate *** Tasks *** section."""
        lines = ["*** Tasks ***"]

        start_data = nodes[start_node].get("data", {}).get("blockData", {})
        process_name = _sanitize_string(start_data.get("processName", "Main Process"))
        lines.append(process_name)

        visited: set[str] = set()
        task_lines = self._generate_node(start_node, nodes, graph, visited, indent=1)
        lines.extend(task_lines)

        return lines

    def _normalize_variable_name(self, name: str) -> str:
        """Normalize a string to Robot Framework scalar variable syntax."""
        sanitized = _sanitize_string(name.strip())
        if not sanitized:
            return "${value}"
        if sanitized.startswith("${") and sanitized.endswith("}"):
            return sanitized
        return f"${{{sanitized}}}"

    def _generate_subdiagram_preview_task(self, diagram_id: str) -> list[str]:
        """Generate a preview task wrapper for an active sub-diagram."""
        diagram_meta = self._diagram_metadata_by_id.get(diagram_id, {})
        diagram_name = _sanitize_string(diagram_meta.get("name", "Sub Diagram"))
        lines = ["*** Tasks ***", f"Preview {diagram_name}"]
        lines.append(
            self._build_subdiagram_call_line(
                {
                    "diagramId": diagram_id,
                    "diagramName": diagram_name,
                    "parameters": {
                        input_name: self._normalize_variable_name(input_name)
                        for input_name in diagram_meta.get("inputs", []) or []
                    },
                    "returns": {},
                },
                self._indent,
            )
        )
        return lines

    def _generate_keyword_for_diagram(
        self,
        diagram_id: str,
        documents: dict[str, dict[str, Any]],
    ) -> list[str]:
        """Generate a user keyword definition for a sub-diagram."""
        document = documents.get(diagram_id)
        if not document:
            raise DiagramValidationError(
                error_type="missing_subdiagram",
                message=f'Diagram "{diagram_id}" not found in project documents',
                node_ids=[diagram_id],
            )

        nodes = {node["id"]: node for node in document.get("nodes", []) if "id" in node}
        edges = document.get("edges", [])
        graph = self._build_graph(nodes, edges)
        start_node = self._find_start_node(nodes)
        if not start_node:
            raise DiagramValidationError(
                error_type="no_start",
                message=f'Sub-diagram "{diagram_id}" must have exactly one Start node',
                node_ids=[diagram_id],
            )

        diagram_meta = self._diagram_metadata_by_id.get(
            diagram_id,
            document.get("metadata", {}),
        )
        keyword_name = _sanitize_string(
            diagram_meta.get("name")
            or document.get("metadata", {}).get("name", diagram_id)
        )
        inputs = diagram_meta.get("inputs", []) or []
        outputs = diagram_meta.get("outputs", []) or []

        lines = [keyword_name]

        if inputs:
            lines.append(
                f"{self._indent}[Arguments]    "
                + "    ".join(
                    self._normalize_variable_name(input_name) for input_name in inputs
                )
            )

        for output_name in outputs:
            normalized = self._normalize_variable_name(output_name)
            lines.append(f"{self._indent}{normalized}=    Set Variable    ${{NONE}}")

        visited: set[str] = set()
        body_lines = self._generate_node(start_node, nodes, graph, visited, indent=1)
        lines.extend(body_lines)

        if outputs:
            lines.append(
                f"{self._indent}RETURN    "
                + "    ".join(
                    self._normalize_variable_name(output_name)
                    for output_name in outputs
                )
            )

        return lines

    def _generate_node(
        self,
        node_id: str,
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        visited: set[str],
        indent: int = 1,
        stop_node: str | None = None,
    ) -> list[str]:
        """Generate code for a node and its successors."""
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
        if block_type == "switch":
            return self._generate_switch_node(
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

        if block_type == "end":
            pass
        else:
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
        """Generate Robot Framework IF/ELSE from typed branch edges."""
        prefix = self._indent * indent
        branch_prefix = self._indent * (indent + 1)
        condition = _sanitize_string(block_data.get("condition", "${True}"))
        successors = graph.get(node_id, [])

        true_target = next(
            (target for target, handle in successors if handle == "true"), None
        )
        false_target = next(
            (target for target, handle in successors if handle == "false"), None
        )
        merge_node = self._find_common_merge_node([true_target, false_target], graph)

        lines = [f"{prefix}IF    {condition}"]

        true_lines = (
            self._generate_node(
                true_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=merge_node,
            )
            if true_target
            else []
        )
        lines.extend(true_lines or [f"{branch_prefix}No Operation"])

        if false_target:
            lines.append(f"{prefix}ELSE")
            false_lines = self._generate_node(
                false_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=merge_node,
            )
            lines.extend(false_lines or [f"{branch_prefix}No Operation"])

        lines.append(f"{prefix}END")

        if merge_node and merge_node != stop_node:
            lines.extend(
                self._generate_node(
                    merge_node,
                    nodes,
                    graph,
                    visited,
                    indent,
                    stop_node=stop_node,
                )
            )

        return lines

    def _format_switch_condition(self, expression: str, value: str) -> str:
        """Format a switch case comparison expression."""
        normalized_value = value.strip()
        if not normalized_value:
            return expression

        if (
            normalized_value.startswith(("${", "@{", "&{", "%{", "'", '"'))
            or normalized_value.replace(".", "", 1).isdigit()
        ):
            comparable = normalized_value
        else:
            comparable = repr(normalized_value)

        return f"{expression} == {comparable}"

    def _generate_switch_node(
        self,
        node_id: str,
        block_data: dict[str, Any],
        nodes: dict[str, Any],
        graph: dict[str, list[tuple[str, str | None]]],
        visited: set[str],
        indent: int,
        stop_node: str | None = None,
    ) -> list[str]:
        """Generate Robot Framework IF/ELSE IF/ELSE from switch handles."""
        prefix = self._indent * indent
        branch_prefix = self._indent * (indent + 1)
        expression = _sanitize_string(block_data.get("expression", "${value}"))
        cases = block_data.get("cases", [])
        successors = graph.get(node_id, [])
        target_by_handle = {
            handle: target for target, handle in successors if isinstance(handle, str)
        }
        case_targets = [target_by_handle.get(case.get("id")) for case in cases]
        default_target = target_by_handle.get("default")
        merge_node = self._find_common_merge_node(
            [*case_targets, default_target],
            graph,
        )

        lines: list[str] = []

        for index, switch_case in enumerate(cases):
            condition = self._format_switch_condition(
                expression,
                str(switch_case.get("value", "")),
            )
            header = "IF" if index == 0 else "ELSE IF"
            lines.append(f"{prefix}{header}    {condition}")

            case_target = target_by_handle.get(switch_case.get("id"))
            case_lines = (
                self._generate_node(
                    case_target,
                    nodes,
                    graph,
                    visited,
                    indent + 1,
                    stop_node=merge_node,
                )
                if case_target
                else []
            )
            lines.extend(case_lines or [f"{branch_prefix}No Operation"])

        if default_target:
            lines.append(f"{prefix}ELSE")
            default_lines = self._generate_node(
                default_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=merge_node,
            )
            lines.extend(default_lines or [f"{branch_prefix}No Operation"])

        if cases:
            lines.append(f"{prefix}END")
        elif default_target:
            lines.extend(
                self._generate_node(
                    default_target,
                    nodes,
                    graph,
                    visited,
                    indent,
                    stop_node=merge_node,
                )
            )

        if merge_node and merge_node != stop_node:
            lines.extend(
                self._generate_node(
                    merge_node,
                    nodes,
                    graph,
                    visited,
                    indent,
                    stop_node=stop_node,
                )
            )

        return lines

    def _format_except_header(self, except_block: dict[str, Any]) -> str:
        """Format EXCEPT header from try/catch metadata."""
        exception_type = except_block.get("exceptionType") or "*"
        variable = except_block.get("variable") or ""
        if variable and not variable.startswith("${"):
            variable = f"${{{variable}}}"

        if variable:
            return f"EXCEPT    {exception_type}    AS    {variable}"
        if exception_type:
            return f"EXCEPT    {exception_type}"
        return "EXCEPT"

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
        """Generate Robot Framework TRY/EXCEPT/FINALLY from typed handles."""
        prefix = self._indent * indent
        branch_prefix = self._indent * (indent + 1)
        successors = graph.get(node_id, [])
        target_by_handle = {
            handle: target for target, handle in successors if isinstance(handle, str)
        }
        try_target = target_by_handle.get("output")
        error_target = target_by_handle.get("error")
        finally_target = target_by_handle.get("finally")
        except_blocks = block_data.get("exceptBlocks", [])
        merge_node = self._find_common_merge_node(
            [try_target, error_target, finally_target],
            graph,
        )

        lines = [f"{prefix}TRY"]
        try_lines = (
            self._generate_node(
                try_target,
                nodes,
                graph,
                visited,
                indent + 1,
                stop_node=merge_node,
            )
            if try_target
            else []
        )
        lines.extend(try_lines or [f"{branch_prefix}No Operation"])

        if error_target or except_blocks:
            except_block = except_blocks[0] if except_blocks else {}
            lines.append(f"{prefix}{self._format_except_header(except_block)}")
            error_lines = (
                self._generate_node(
                    error_target,
                    nodes,
                    graph,
                    visited,
                    indent + 1,
                    stop_node=merge_node,
                )
                if error_target
                else []
            )
            lines.extend(error_lines or [f"{branch_prefix}No Operation"])

        if finally_target or block_data.get("finallyBlock") is not None:
            lines.append(f"{prefix}FINALLY")
            finally_lines = (
                self._generate_node(
                    finally_target,
                    nodes,
                    graph,
                    visited,
                    indent + 1,
                    stop_node=merge_node,
                )
                if finally_target
                else []
            )
            lines.extend(finally_lines or [f"{branch_prefix}No Operation"])

        lines.append(f"{prefix}END")

        if merge_node and merge_node != stop_node:
            lines.extend(
                self._generate_node(
                    merge_node,
                    nodes,
                    graph,
                    visited,
                    indent,
                    stop_node=stop_node,
                )
            )

        return lines

    def _get_block_handler(self, block_type: str):
        """Get handler function for block type."""
        handlers = {
            "start": self._handle_start,
            "end": self._handle_end,
            "if": self._handle_if,
            "while": self._handle_while,
            "for-each": self._handle_for_each,
            "try-catch": self._handle_try_catch,
            "throw": self._handle_throw,
            "assign": self._handle_assign,
            "set-variable": self._handle_set_variable,
            "get-variable": self._handle_get_variable,
            "activity": self._handle_activity,
            "parallel": self._handle_parallel,
            "retry-scope": self._handle_retry_scope,
            "switch": self._handle_switch,
            "sub-diagram-call": self._handle_sub_diagram_call,
        }
        return handlers.get(block_type, self._handle_unknown)

    def _handle_start(self, _block_data: dict, _prefix: str, _indent: int) -> list[str]:
        """Handle Start block - no code generated."""
        return []

    def _handle_end(self, _block_data: dict, prefix: str, _indent: int) -> list[str]:
        """Handle End block."""
        return [f"{prefix}# End"]

    def _handle_if(self, block_data: dict, prefix: str, _indent: int) -> list[str]:
        """Handle If block - Robot Framework IF/ELSE syntax."""
        condition = _sanitize_string(block_data.get("condition", "${True}"))
        lines = [f"{prefix}IF    {condition}"]
        lines.append(f"{prefix}{self._indent}Log    True branch")
        lines.append(f"{prefix}ELSE")
        lines.append(f"{prefix}{self._indent}Log    False branch")
        lines.append(f"{prefix}END")
        return lines

    def _handle_while(self, block_data: dict, prefix: str, _indent: int) -> list[str]:
        """Handle While block."""
        condition = _sanitize_string(block_data.get("condition", "${True}"))
        max_iter = block_data.get("maxIterations", 100)
        lines = [
            f"{prefix}WHILE    {condition}    limit={max_iter}",
            f"{prefix}{self._indent}# Loop body",
            f"{prefix}END",
        ]
        return lines

    def _handle_for_each(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle For Each block."""
        item_var = _sanitize_string(block_data.get("itemVariable", "${item}"))
        collection = _sanitize_string(block_data.get("collection", "@{list}"))
        lines = [
            f"{prefix}FOR    {item_var}    IN    {collection}",
            f"{prefix}{self._indent}# Loop body",
            f"{prefix}END",
        ]
        return lines

    def _handle_try_catch(
        self, _block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle Try Catch block."""
        lines = [
            f"{prefix}TRY",
            f"{prefix}{self._indent}# Try block",
            f"{prefix}EXCEPT    *",
            f"{prefix}{self._indent}# Catch block",
            f"{prefix}FINALLY",
            f"{prefix}{self._indent}# Finally block",
            f"{prefix}END",
        ]
        return lines

    def _handle_throw(self, block_data: dict, prefix: str, _indent: int) -> list[str]:
        """Handle Throw block."""
        message = _sanitize_string(block_data.get("message", "Error occurred"))
        return [f"{prefix}Fail    {message}"]

    def _handle_assign(self, block_data: dict, prefix: str, _indent: int) -> list[str]:
        """Handle Assign block."""
        var_name = block_data.get("variableName", "result")
        if not var_name.startswith("${"):
            var_name = f"${{{var_name}}}"
        expr = _sanitize_string(block_data.get("expression", ""))
        return [f"{prefix}{var_name}=    Set Variable    {expr}"]

    def _handle_set_variable(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle Set Variable block."""
        var_name = _sanitize_string(block_data.get("variableName", "var"))
        if not var_name.startswith("${"):
            var_name = f"${{{var_name}}}"
        value = _sanitize_string(block_data.get("value", ""))
        return [f"{prefix}Set Suite Variable    {var_name}    {value}"]

    def _handle_get_variable(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle Get Variable block."""
        var_name = _sanitize_string(block_data.get("variableName", "var"))
        output = _sanitize_string(block_data.get("outputVariable", "result"))
        if not output.startswith("${"):
            output = f"${{{output}}}"
        return [f"{prefix}Set Variable    {output}    {var_name}"]

    def _handle_activity(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle Activity block using SDK metadata if available."""
        from rpaforge.sdk import get_activity

        activity_id = block_data.get("activityId", "")
        library = block_data.get("library", "BuiltIn")
        args = block_data.get("params", block_data.get("arguments", {}))

        keyword = activity_id.replace("_", " ").title() if activity_id else "Log"

        if library and library != "BuiltIn":
            rf_library = (
                f"RPAForge.{library}" if not library.startswith("RPAForge") else library
            )
            self._libraries.add(rf_library)

        meta = get_activity(activity_id) if activity_id else None
        if meta:
            keyword = meta.rf_keyword or keyword
            if meta.rf_library and meta.rf_library != "BuiltIn":
                self._libraries.add(meta.rf_library)

        if isinstance(args, dict):
            args_list = []
            for _k, v in args.items():
                if v is not None:
                    args_list.append(_sanitize_string(str(v)))
            args_str = "    ".join(args_list)
        elif isinstance(args, list):
            args_str = "    ".join(
                _sanitize_string(str(arg)) for arg in args if arg is not None
            )
        else:
            args_str = _sanitize_string(str(args)) if args else ""

        if args_str:
            return [f"{prefix}{keyword}    {args_str}"]
        return [f"{prefix}{keyword}"]

    def _handle_parallel(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle Parallel block - comment placeholder."""
        branches = block_data.get("branches", [])
        lines = [f"{prefix}# Parallel execution with {len(branches)} branches"]
        lines.append(f"{prefix}# Note: Robot Framework doesn't support true parallel")
        lines.append(f"{prefix}# Use pabot for parallel execution")
        return lines

    def _handle_retry_scope(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle Retry Scope block."""
        retry_count = block_data.get("retryCount", 3)
        interval = block_data.get("retryInterval", "2s")
        lines = [
            f"{prefix}Wait Until Keyword Succeeds    {retry_count}x    {interval}",
            f"{prefix}{self._indent}# Keyword to retry",
        ]
        return lines

    def _handle_switch(self, _block_data: dict, prefix: str, _indent: int) -> list[str]:
        """Handle Switch block."""
        lines = [f"{prefix}# Switch statement - use multiple IF/ELSE"]
        return lines

    def _handle_sub_diagram_call(
        self, block_data: dict, prefix: str, _indent: int
    ) -> list[str]:
        """Handle Sub Diagram Call block."""
        return [self._build_subdiagram_call_line(block_data, prefix)]

    def _build_subdiagram_call_line(
        self, block_data: dict[str, Any], prefix: str
    ) -> str:
        """Build a Robot Framework keyword call for a sub-diagram call block."""
        diagram_id = block_data.get("diagramId")
        diagram_meta = (
            self._diagram_metadata_by_id.get(diagram_id, {})
            if isinstance(diagram_id, str)
            else {}
        )
        diagram_name = _sanitize_string(
            diagram_meta.get("name") or block_data.get("diagramName", "SubProcess")
        )
        parameters = block_data.get("parameters", {}) or {}
        returns = block_data.get("returns", {}) or {}

        ordered_inputs = diagram_meta.get("inputs") or list(parameters.keys())
        ordered_outputs = diagram_meta.get("outputs") or list(returns.keys())

        args = [
            _sanitize_string(str(parameters[input_name]))
            for input_name in ordered_inputs
            if parameters.get(input_name)
        ]

        assignments = [
            self._normalize_variable_name(str(returns[output_name]))
            for output_name in ordered_outputs
            if returns.get(output_name)
        ]

        call_parts = [f"{prefix}"]
        if assignments:
            call_parts.append("    ".join(assignments) + "=    ")
        call_parts.append(diagram_name)
        if args:
            call_parts.append("    " + "    ".join(args))

        return "".join(call_parts)

    def _handle_unknown(self, block_data: dict, prefix: str, _indent: int) -> list[str]:
        """Handle unknown block type."""
        block_type = block_data.get("type", "unknown")
        return [f"{prefix}# Unknown block type: {block_type}"]

    def generate_from_json(self, json_str: str) -> str:
        """Generate Robot Framework code from JSON string.

        :param json_str: JSON string with diagram data.
        :returns: Generated .robot file content.
        """
        diagram = json.loads(json_str)
        return self.generate(diagram)
