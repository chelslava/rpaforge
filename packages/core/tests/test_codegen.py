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
        assert "from rpaforge_libraries.DesktopUI import DesktopUI" in code
        assert "desktopui = DesktopUI()" in code
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


class TestWebUIActivities:
    """Tests for WebUI activity code generation."""

    def test_generate_open_browser(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "WebTest"}},
                },
                {
                    "id": "browser1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Open Browser",
                            "args": ["https://example.com", "chromium"],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "browser1"}],
        }
        code = generator.generate(diagram)
        assert "from rpaforge_libraries.WebUI import WebUI" in code
        assert "webui = WebUI()" in code
        assert "webui.open_browser(" in code.lower()
        assert "https://example.com" in code

    def test_generate_open_browser_with_url(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "browser1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Open Browser",
                            "args": ["https://google.com"],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "browser1"}],
        }
        code = generator.generate(diagram)
        assert "webui.open_browser" in code.lower()
        assert "https://google.com" in code

    def test_generate_navigate(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "nav1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Navigate",
                            "args": ["https://example.com"],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "nav1"}],
        }
        code = generator.generate(diagram)
        assert "webui.navigate" in code.lower()

    def test_generate_click_element(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "click1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Click Element",
                            "args": ["#submit-btn"],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "click1"}],
        }
        code = generator.generate(diagram)
        assert "webui.click_element" in code.lower()
        assert "#submit-btn" in code

    def test_generate_input_text(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "input1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Input Text",
                            "args": ["#username", "testuser"],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "input1"}],
        }
        code = generator.generate(diagram)
        assert "webui.input_text" in code.lower()
        assert "#username" in code
        assert "testuser" in code

    def test_generate_get_element_text_with_output(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "get1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Get Element Text",
                            "args": ["#result"],
                            "output_variable": "${text}",
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "get1"}],
        }
        code = generator.generate(diagram)
        assert "webui.get_element_text" in code.lower()
        assert "text =" in code.lower()

    def test_generate_take_screenshot(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "ss1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Take Screenshot",
                            "args": ["screenshot.png"],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "ss1"}],
        }
        code = generator.generate(diagram)
        assert "webui.take_screenshot" in code.lower()
        assert "screenshot.png" in code

    def test_generate_close_browser(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "close1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Close Browser",
                            "args": [],
                        }
                    },
                },
            ],
            "edges": [{"source": "start", "target": "close1"}],
        }
        code = generator.generate(diagram)
        assert "webui.close_browser" in code.lower()

    def test_generate_multiple_webui_activities(self):
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "WebFlow"}},
                },
                {
                    "id": "open1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Open Browser",
                            "args": ["https://example.com"],
                        }
                    },
                },
                {
                    "id": "click1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Click Element",
                            "args": ["#btn"],
                        }
                    },
                },
                {
                    "id": "close1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "WebUI",
                            "activity": "Close Browser",
                            "args": [],
                        }
                    },
                },
            ],
            "edges": [
                {"source": "start", "target": "open1"},
                {"source": "open1", "target": "click1"},
                {"source": "click1", "target": "close1"},
            ],
        }
        code = generator.generate(diagram)
        assert code.count("from rpaforge_libraries.WebUI import WebUI") == 1
        assert code.count("webui = WebUI()") == 1
        assert "webui.open_browser" in code.lower()
        assert "webui.click_element" in code.lower()
        assert "webui.close_browser" in code.lower()


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
