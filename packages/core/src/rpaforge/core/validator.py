"""
RPAForge Process Diagram Validator.

Validates diagram structure, topology, and edge connections before execution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class ValidationError(Exception):
    """Raised when input validation fails."""

    pass


class ValidationErrorItem:
    """A single validation error with node context."""

    def __init__(
        self,
        message: str,
        node_id: str = "",
        edge_id: str = "",
        error_type: str = "",
    ) -> None:
        self.message = message
        self.node_id = node_id
        self.edge_id = edge_id
        self.error_type = error_type

    def __repr__(self) -> str:
        parts = [f"{self.error_type}: {self.message}"]
        if self.node_id:
            parts.append(f"node_id={self.node_id}")
        if self.edge_id:
            parts.append(f"edge_id={self.edge_id}")
        return " ".join(parts)


@dataclass
class ValidationResult:
    """Result of diagram validation."""

    is_valid: bool = True
    errors: list[ValidationErrorItem] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_error(
        self,
        message: str,
        node_id: str = "",
        edge_id: str = "",
        error_type: str = "",
    ) -> None:
        """Add a validation error."""
        self.is_valid = False
        self.errors.append(
            ValidationErrorItem(
                message=message,
                node_id=node_id,
                edge_id=edge_id,
                error_type=error_type,
            )
        )

    def add_warning(self, message: str) -> None:
        """Add a validation warning."""
        self.warnings.append(message)

    def summary(self) -> str:
        """Get a summary of validation results."""
        lines = []
        if self.is_valid:
            lines.append("Validation passed")
            if self.warnings:
                lines.append(f"Warnings: {len(self.warnings)}")
        else:
            lines.append(f"Validation failed with {len(self.errors)} error(s)")
            if self.warnings:
                lines.append(f"Warnings: {len(self.warnings)}")
        return "\n".join(lines)


VALID_BLOCK_TYPES = {
    "start",
    "end",
    "activity",
    "if",
    "while",
    "for-each",
    "try-catch",
    "assign",
    "subdiagram",
}

HANDLE_TYPES = {
    "if": ["true", "false"],
    "try-catch": ["output", "error"],
}

MULTI_SUCCESSOR_BLOCKS = {"if", "try-catch"}

LOOP_BLOCKS = {"while", "for-each"}


class ProcessValidator:
    """Validates process diagrams before execution."""

    def __init__(self) -> None:
        self._result: ValidationResult | None = None

    def validate_diagram(self, diagram: dict[str, Any]) -> ValidationResult:
        """Validate a complete diagram.

        Args:
            diagram: Diagram dictionary with 'nodes' and 'edges' keys

        Returns:
            ValidationResult with is_valid, errors, and warnings
        """
        nodes = diagram.get("nodes", [])
        edges = diagram.get("edges", [])

        nodes_dict = {n["id"]: n for n in nodes if "id" in n}

        self._result = ValidationResult()

        self._check_start_and_end(nodes_dict, nodes)
        self._validate_topology(nodes_dict, nodes, edges)
        self._check_circular_references(nodes_dict, edges)

        return self._result

    def _check_start_and_end(
        self,
        nodes_dict: dict[str, Any],
        _nodes: list[dict],
    ) -> None:
        """Check for exactly one start node and at least one end node."""
        start_nodes = []
        end_nodes = []

        for node in nodes_dict.values():
            block_data = node.get("data", {}).get("blockData", {})
            block_type = block_data.get("type", "")

            if block_type == "start":
                start_nodes.append(node.get("id", ""))
            elif block_type == "end":
                end_nodes.append(node.get("id", ""))

        if len(start_nodes) == 0:
            self._result.add_error(
                "Diagram must have exactly one start node",
                error_type="MISSING_START",
            )
        elif len(start_nodes) > 1:
            for node_id in start_nodes[1:]:
                self._result.add_error(
                    "Diagram has multiple start nodes (only one allowed)",
                    node_id=node_id,
                    error_type="MULTIPLE_STARTS",
                )

        if len(end_nodes) == 0:
            self._result.add_warning(
                "Diagram has no end node - execution may not terminate properly"
            )

    def _validate_topology(
        self,
        nodes_dict: dict[str, dict],
        _nodes: list[dict],
        edges: list[dict],
    ) -> None:
        """Validate diagram topology including connections and node types."""
        node_ids = set(nodes_dict.keys())
        edge_map: dict[str, list[tuple[str, str | None, str]]] = {
            nid: [] for nid in node_ids
        }
        in_degree: dict[str, int] = dict.fromkeys(node_ids, 0)

        for idx, edge in enumerate(edges):
            source = edge.get("source", "")
            target = edge.get("target", "")
            handle = edge.get("sourceHandle")

            edge_id = f"edge_{idx}"

            if source not in node_ids:
                self._result.add_error(
                    f"Edge references non-existent source node '{source}'",
                    edge_id=edge_id,
                    error_type="INVALID_SOURCE",
                )
                continue

            if target not in node_ids:
                self._result.add_error(
                    f"Edge references non-existent target node '{target}'",
                    node_id=target,
                    edge_id=edge_id,
                    error_type="INVALID_TARGET",
                )
                continue

            edge_map[source].append((target, handle, edge_id))
            in_degree[target] = in_degree.get(target, 0) + 1

        self._check_node_types(nodes_dict, edge_map)

        self._check_block_connections(nodes_dict, edge_map)

        self._check_orphaned_nodes(nodes_dict, edge_map, in_degree)

    def _check_node_types(
        self,
        nodes_dict: dict[str, dict],
        edge_map: dict[str, list[tuple[str, str | None, str]]],
    ) -> None:
        """Validate that each node has a valid type and connections."""
        for node_id, node in nodes_dict.items():
            block_data = node.get("data", {}).get("blockData", {})
            block_type = block_data.get("type", "")

            if not block_type:
                self._result.add_error(
                    f"Node '{node_id}' has no block type",
                    node_id=node_id,
                    error_type="MISSING_TYPE",
                )
                continue

            if block_type not in VALID_BLOCK_TYPES:
                self._result.add_error(
                    f"Node '{node_id}' has invalid block type '{block_type}'",
                    node_id=node_id,
                    error_type="INVALID_TYPE",
                )
                continue

            if block_type == "start" and edge_map.get(node_id, []):
                successors = [t for t, _, _ in edge_map[node_id]]
                if len(successors) > 1:
                    self._result.add_error(
                        f"Start node '{node_id}' has multiple outgoing edges (should have exactly one)",
                        node_id=node_id,
                        error_type="INVALID_START_CONNECTIONS",
                    )

            if block_type == "end" and edge_map.get(node_id, []):
                self._result.add_error(
                    f"End node '{node_id}' should not have outgoing edges",
                    node_id=node_id,
                    error_type="INVALID_END_CONNECTIONS",
                )

    def _check_block_connections(
        self,
        nodes_dict: dict[str, dict],
        edge_map: dict[str, list[tuple[str, str | None, str]]],
    ) -> None:
        """Validate that block-specific connection requirements are met."""
        for node_id, node in nodes_dict.items():
            block_data = node.get("data", {}).get("blockData", {})
            block_type = block_data.get("type", "")

            successors = edge_map.get(node_id, [])
            if not successors and block_type not in ("while", "for-each"):
                continue

            if block_type == "if":
                has_true = any(h == "true" for _, h, _ in successors)
                has_false = any(h == "false" for _, h, _ in successors)

                if not has_true:
                    self._result.add_error(
                        f"If node '{node_id}' missing 'true' branch connection",
                        node_id=node_id,
                        error_type="MISSING_TRUE_BRANCH",
                    )
                if not has_false:
                    self._result.add_error(
                        f"If node '{node_id}' missing 'false' branch connection",
                        node_id=node_id,
                        error_type="MISSING_FALSE_BRANCH",
                    )

            elif block_type == "while":
                if not successors:
                    self._result.add_warning(
                        f"While node '{node_id}' has no body connection"
                    )

            elif block_type == "for-each":
                if not successors:
                    self._result.add_warning(
                        f"ForEach node '{node_id}' has no body connection"
                    )

            elif block_type == "try-catch":
                has_output = any(h == "output" for _, h, _ in successors)
                has_error = any(h == "error" for _, h, _ in successors)

                if not has_output:
                    self._result.add_warning(
                        f"Try-Catch node '{node_id}' missing 'output' connection"
                    )
                if not has_error:
                    self._result.add_warning(
                        f"Try-Catch node '{node_id}' missing 'error' connection"
                    )

    def _check_orphaned_nodes(
        self,
        nodes_dict: dict[str, dict],
        edge_map: dict[str, list[tuple[str, str | None, str]]],
        in_degree: dict[str, int],
    ) -> None:
        """Check for orphaned nodes (no connections)."""
        for node_id, node in nodes_dict.items():
            block_data = node.get("data", {}).get("blockData", {})
            block_type = block_data.get("type", "")

            if block_type in ("start", "end"):
                continue

            has_outgoing = bool(edge_map.get(node_id, []))
            has_incoming = in_degree.get(node_id, 0) > 0

            if not has_outgoing and not has_incoming:
                self._result.add_error(
                    f"Node '{node_id}' is orphaned (no incoming or outgoing edges)",
                    node_id=node_id,
                    error_type="ORPHANED_NODE",
                )

    def _check_circular_references(
        self, nodes_dict: dict[str, dict], edges: list[dict]
    ) -> None:
        """Detect circular references in the diagram."""
        node_ids = list(nodes_dict.keys())

        graph: dict[str, set[str]] = {nid: set() for nid in node_ids}
        for edge in edges:
            source = edge.get("source", "")
            target = edge.get("target", "")
            if source in graph and target in graph:
                graph[source].add(target)

        visited: set[str] = set()
        rec_stack: set[str] = set()

        def dfs(node: str, path: list[str]) -> list[str] | None:
            visited.add(node)
            rec_stack.add(node)

            for neighbor in graph.get(node, set()):
                if neighbor not in visited:
                    result = dfs(neighbor, path + [neighbor])
                    if result:
                        return result
                elif neighbor in rec_stack:
                    cycle_start = path.index(neighbor) if neighbor in path else 0
                    return path[cycle_start:] + [neighbor]

            rec_stack.remove(node)
            return None

        for node_id in node_ids:
            if node_id not in visited:
                cycle = dfs(node_id, [node_id])
                if cycle:
                    cycle_str = " -> ".join(cycle)
                    self._result.add_error(
                        f"Circular reference detected: {cycle_str}",
                        error_type="CIRCULAR_REFERENCE",
                    )
                    break

    def validate_topology(
        self, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]
    ) -> ValidationResult:
        """Validate topology of nodes and edges.

        Args:
            nodes: List of node dictionaries
            edges: List of edge dictionaries

        Returns:
            ValidationResult with validation status
        """
        diagram = {"nodes": nodes, "edges": edges}
        return self.validate_diagram(diagram)

    def check_circular_references(self, diagram: dict[str, Any]) -> list[list[str]]:
        """Check for circular references in a diagram.

        Args:
            diagram: Diagram dictionary with 'nodes' and 'edges' keys

        Returns:
            List of cycles found (each cycle is a list of node IDs)
        """
        nodes = diagram.get("nodes", [])
        edges = diagram.get("edges", [])
        node_dict = {n["id"]: n for n in nodes if "id" in n}

        graph: dict[str, set[str]] = {nid: set() for nid in node_dict}
        for edge in edges:
            source = edge.get("source", "")
            target = edge.get("target", "")
            if source in graph and target in graph:
                graph[source].add(target)

        cycles: list[list[str]] = []
        visited: set[str] = set()

        def dfs(node: str, path: list[str]) -> None:
            visited.add(node)
            path.append(node)

            for neighbor in graph.get(node, set()):
                if neighbor not in visited:
                    dfs(neighbor, path.copy())
                elif neighbor in path:
                    cycle_start = path.index(neighbor)
                    cycle = path[cycle_start:] + [neighbor]
                    if cycle not in cycles:
                        cycles.append(cycle)

        for node_id in node_dict:
            if node_id not in visited:
                dfs(node_id, [])

        return cycles


def validate_diagram(diagram: dict[str, Any]) -> ValidationResult:
    """Convenience function to validate a diagram.

    Args:
        diagram: Diagram dictionary with 'nodes' and 'edges' keys

    Returns:
        ValidationResult with validation status
    """
    validator = ProcessValidator()
    return validator.validate_diagram(diagram)


def validate_process(process: Any, allow_empty: bool = False) -> ValidationResult:
    """Validate a process object.

    Args:
        process: Process object to validate
        allow_empty: Whether to allow empty processes (no tasks/activities)

    Returns:
        ValidationResult with validation status
    """
    result = ValidationResult()

    if not process:
        result.add_error("Process is None", error_type="NULL_PROCESS")
        return result

    if hasattr(process, "name") and not process.name:
        result.add_warning("Process has no name")

    if hasattr(process, "tasks"):
        if not process.tasks:
            if not allow_empty:
                result.add_error("Process has no tasks", error_type="NO_TASKS")
        else:
            for idx, task in enumerate(process.tasks):
                if not task:
                    result.add_error(
                        f"Task at index {idx} is None",
                        error_type="NULL_TASK",
                    )
                    continue

                if hasattr(task, "name") and not task.name:
                    result.add_warning(f"Task at index {idx} has no name")

                if hasattr(task, "activities"):
                    for act_idx, activity in enumerate(task.activities):
                        if activity is None:
                            result.add_error(
                                f"Activity at task {idx}, index {act_idx} is None",
                                error_type="NULL_ACTIVITY",
                            )

    return result
