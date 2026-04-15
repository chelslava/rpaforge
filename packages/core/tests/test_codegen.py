"""Tests for Python Code Generator."""

import pytest

from rpaforge.codegen import CodeGenerator, DiagramValidationError


class TestPythonCodeGenerator:
    """Tests for PythonCodeGenerator class."""

    def test_create_generator(self):
        generator = CodeGenerator()
        assert generator is not None

    def test_validate_empty_diagram(self):
        generator = CodeGenerator()
        errors = generator.validate_diagram({})
        assert len(errors) == 1
        assert errors[0].error_type == "no_start"

    def test_validate_diagram_multiple_starts(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {"id": "start1", "data": {"blockData": {"type": "start"}}},
                {"id": "start2", "data": {"blockData": {"type": "start"}}},
            ]
        }
        errors = generator.validate_diagram(diagram)
        assert len(errors) == 1
        assert errors[0].error_type == "multiple_start"

    def test_generate_empty_process(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Empty"}},
                },
            ],
            "edges": [],
        }
        code = generator.generate(diagram)
        assert "def Empty():" in code
        assert "pass" in code

    def test_generate_with_activity(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "act1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "DesktopUI",
                            "activity": "Click Element",
                            "args": ["id:btn"],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "act1"}],
        }
        code = generator.generate(diagram)
        assert "def Test():" in code
        assert "from rpaforge.libraries import DesktopUI" in code
        assert "desktopui.click_element" in code.lower()

    def test_generate_with_assign(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Main"}},
                },
                {
                    "id": "assign1",
                    "data": {
                        "blockData": {
                            "type": "assign",
                            "variableName": "result",
                            "expression": "Hello",
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "assign1"}],
        }
        code = generator.generate(diagram)
        assert "result = 'Hello'" in code

    def test_generate_with_if_block(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "if1",
                    "data": {"blockData": {"type": "if", "condition": "True"}},
                },
            ],
            "edges": [
                {"source": "start", "target": "if1"},
                {"source": "if1", "target": "start", "sourceHandle": "true"},
            ],
        }
        code = generator.generate(diagram)
        assert "if True:" in code

    def test_generate_with_sourcemap(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
            ],
            "edges": [],
        }
        code, sourcemap = generator.generate_with_sourcemap(diagram)
        assert code is not None
        assert isinstance(sourcemap, dict)

    def test_generate_raises_on_invalid(self):
        generator = CodeGenerator()
        diagram = {"nodes": [], "edges": []}
        with pytest.raises(DiagramValidationError):
            generator.generate(diagram)

    def test_generate_with_throw(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "throw1",
                    "data": {"blockData": {"type": "throw", "message": "Test error"}},
                },
            ],
            "edges": [
                {"source": "start", "target": "throw1"},
            ],
        }
        code = generator.generate(diagram)
        assert 'raise Exception("Test error")' in code

    def test_generate_with_typed_throw(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "throw1",
                    "data": {
                        "blockData": {
                            "type": "throw",
                            "message": "Invalid value",
                            "exceptionType": "ValueError",
                        }
                    },
                },
            ],
            "edges": [
                {"source": "start", "target": "throw1"},
            ],
        }
        code = generator.generate(diagram)
        assert 'raise ValueError("Invalid value")' in code

    def test_generate_with_try_catch(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "try1",
                    "data": {"blockData": {"type": "try-catch"}},
                },
            ],
            "edges": [
                {"source": "start", "target": "try1"},
            ],
        }
        code = generator.generate(diagram)
        assert "try:" in code

    def test_generate_with_multiple_except_blocks(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "try1",
                    "data": {
                        "blockData": {
                            "type": "try-catch",
                            "exceptBlocks": [
                                {"exceptionType": "ValueError", "variable": "ve"},
                                {"exceptionType": "KeyError", "variable": "ke"},
                            ],
                        }
                    },
                },
            ],
            "edges": [
                {"source": "start", "target": "try1"},
            ],
        }
        code = generator.generate(diagram)
        assert "except ValueError as ve:" in code
        assert "except KeyError as ke:" in code


class TestDiagramValidationError:
    """Tests for DiagramValidationError class."""

    def test_create_error(self):
        error = DiagramValidationError(
            error_type="no_start",
            message="No start node",
        )
        assert error.error_type == "no_start"
        assert error.message == "No start node"
        assert error.node_ids == []

    def test_create_error_with_node_ids(self):
        error = DiagramValidationError(
            error_type="orphaned_nodes",
            message="Orphaned nodes",
            node_ids=["node1", "node2"],
        )
        assert error.node_ids == ["node1", "node2"]

    def test_error_is_exception(self):
        error = DiagramValidationError(
            error_type="test",
            message="Test error",
        )
        with pytest.raises(DiagramValidationError):
            raise error
