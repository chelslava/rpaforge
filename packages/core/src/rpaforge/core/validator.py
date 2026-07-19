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


@dataclass
class DiagramIndexes:
    """Indexes shared by every structural validation pass."""

    nodes: dict[str, dict[str, Any]]
    edge_map: dict[str, list[tuple[str, str | None, str]]]
    in_degree: dict[str, int]
    edge_errors: list[tuple[str, str, str, str]] = field(default_factory=list)
    node_errors: list[tuple[str, str, str]] = field(default_factory=list)


VALID_BLOCK_TYPES = {
    "start",
    "end",
    "activity",
    "if",
    "switch",
    "while",
    "for-each",
    "parallel",
    "retry-scope",
    "try-catch",
    "throw",
    "assign",
    "subdiagram",
    "sub-diagram-call",
}

HANDLE_TYPES = {
    "if": ["true", "false"],
    "try-catch": ["output", "error"],
}

MULTI_SUCCESSOR_BLOCKS = {"if", "try-catch"}

LOOP_BLOCKS = {"while", "for-each"}


def _block_data(node: dict[str, Any]) -> dict[str, Any]:
    """Return block metadata without trusting malformed payload types."""
    data = node.get("data")
    if not isinstance(data, dict):
        return {}
    block_data = data.get("blockData")
    return block_data if isinstance(block_data, dict) else {}


class ProcessValidator:
    """Validates process diagrams before execution."""

    def __init__(self) -> None:
        self._result = ValidationResult()

    def validate_diagram(self, diagram: dict[str, Any]) -> ValidationResult:
        """Validate a complete diagram.

        Args:
            diagram: Diagram dictionary with 'nodes' and 'edges' keys

        Returns:
            ValidationResult with is_valid, errors, and warnings
        """
        self._result = ValidationResult()

        if not isinstance(diagram, dict):
            self._result.add_error(
                "Diagram must be an object", error_type="INVALID_DIAGRAM"
            )
            return self._result

        nodes = diagram.get("nodes", [])
        edges = diagram.get("edges", [])
        if not isinstance(nodes, list) or not isinstance(edges, list):
            self._result.add_error(
                "Diagram must contain nodes and edges arrays",
                error_type="INVALID_DIAGRAM",
            )
            return self._result

        indexes = self._build_indexes(nodes, edges)

        self._check_start_and_end(indexes)
        self._validate_topology(indexes)
        self._check_circular_references(indexes)

        return self._result

    def _build_indexes(self, nodes: list[Any], edges: list[Any]) -> DiagramIndexes:
        """Build node, adjacency, and degree indexes in one linear pass."""
        nodes_dict: dict[str, dict[str, Any]] = {}
        node_errors: list[tuple[str, str, str]] = []
        for index, node in enumerate(nodes):
            node_id = node.get("id") if isinstance(node, dict) else None
            if not isinstance(node_id, str) or not node_id:
                node_errors.append(
                    (f"Node at index {index} has no id", "", "MISSING_NODE_ID")
                )
                continue
            nodes_dict[node_id] = node

        edge_map: dict[str, list[tuple[str, str | None, str]]] = {
            node_id: [] for node_id in nodes_dict
        }
        in_degree: dict[str, int] = dict.fromkeys(nodes_dict, 0)
        edge_errors: list[tuple[str, str, str, str]] = []
        for index, edge in enumerate(edges):
            edge_id = f"edge_{index}"
            if not isinstance(edge, dict):
                edge_errors.append(
                    ("Edge must be an object", "", edge_id, "INVALID_EDGE")
                )
                continue
            source = edge.get("source", "")
            target = edge.get("target", "")
            handle = edge.get("sourceHandle")
            if not isinstance(source, str) or source not in nodes_dict:
                edge_errors.append(
                    (
                        f"Edge references non-existent source node '{source}'",
                        "",
                        edge_id,
                        "INVALID_SOURCE",
                    )
                )
                continue
            if not isinstance(target, str) or target not in nodes_dict:
                edge_errors.append(
                    (
                        f"Edge references non-existent target node '{target}'",
                        target,
                        edge_id,
                        "INVALID_TARGET",
                    )
                )
                continue
            edge_map[source].append((target, handle, edge_id))
            in_degree[target] += 1

        return DiagramIndexes(
            nodes=nodes_dict,
            edge_map=edge_map,
            in_degree=in_degree,
            edge_errors=edge_errors,
            node_errors=node_errors,
        )

    def _check_start_and_end(self, indexes: DiagramIndexes) -> None:
        """Check for exactly one start node and at least one end node."""
        start_nodes = []
        end_nodes = []

        for node in indexes.nodes.values():
            block_data = _block_data(node)
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

    def _validate_topology(self, indexes: DiagramIndexes) -> None:
        """Validate diagram topology including connections and node types."""
        for message, node_id, edge_id, error_type in indexes.edge_errors:
            self._result.add_error(
                message, node_id=node_id, edge_id=edge_id, error_type=error_type
            )
        for message, node_id, error_type in indexes.node_errors:
            self._result.add_error(message, node_id=node_id, error_type=error_type)

        self._check_node_types(indexes.nodes, indexes.edge_map)
        self._check_block_connections(indexes.nodes, indexes.edge_map)
        self._check_orphaned_nodes(indexes.nodes, indexes.edge_map, indexes.in_degree)

    def _check_node_types(
        self,
        nodes_dict: dict[str, dict],
        edge_map: dict[str, list[tuple[str, str | None, str]]],
    ) -> None:
        """Validate that each node has a valid type and connections."""
        for node_id, node in nodes_dict.items():
            block_data = _block_data(node)
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
            block_data = _block_data(node)
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
            block_data = _block_data(node)
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

    def _check_circular_references(self, indexes: DiagramIndexes) -> None:
        """Detect circular references with an iterative O(V + E) traversal."""
        state: dict[str, int] = dict.fromkeys(indexes.nodes, 0)
        for start in indexes.nodes:
            if state[start] != 0:
                continue

            path: list[str] = [start]
            path_positions = {start: 0}
            state[start] = 1
            stack: list[tuple[str, int]] = [(start, 0)]
            while stack:
                node, next_index = stack[-1]
                successors = indexes.edge_map[node]
                if next_index >= len(successors):
                    state[node] = 2
                    stack.pop()
                    path_positions.pop(node, None)
                    path.pop()
                    continue

                target = successors[next_index][0]
                stack[-1] = (node, next_index + 1)
                if state[target] == 0:
                    state[target] = 1
                    path_positions[target] = len(path)
                    path.append(target)
                    stack.append((target, 0))
                elif state[target] == 1:
                    cycle = path[path_positions[target] :] + [target]
                    self._result.add_error(
                        f"Circular reference detected: {' -> '.join(cycle)}",
                        error_type="CIRCULAR_REFERENCE",
                    )
                    return

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
        if not isinstance(diagram, dict):
            return []
        nodes = diagram.get("nodes", [])
        edges = diagram.get("edges", [])
        if not isinstance(nodes, list) or not isinstance(edges, list):
            return []
        indexes = self._build_indexes(nodes, edges)
        state: dict[str, int] = dict.fromkeys(indexes.nodes, 0)
        for start in indexes.nodes:
            if state[start] != 0:
                continue
            path: list[str] = [start]
            path_positions = {start: 0}
            state[start] = 1
            stack: list[tuple[str, int]] = [(start, 0)]
            while stack:
                node, next_index = stack[-1]
                successors = indexes.edge_map[node]
                if next_index >= len(successors):
                    state[node] = 2
                    stack.pop()
                    path_positions.pop(node, None)
                    path.pop()
                    continue
                target = successors[next_index][0]
                stack[-1] = (node, next_index + 1)
                if state[target] == 0:
                    state[target] = 1
                    path_positions[target] = len(path)
                    path.append(target)
                    stack.append((target, 0))
                elif state[target] == 1:
                    return [path[path_positions[target] :] + [target]]
        return []


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
