"""Tests for Code Generator."""

import pytest

from rpaforge.codegen import CodeGenerator
from rpaforge.codegen.generator import DiagramValidationError


class TestDiagramValidation:
    """Tests for diagram topology validation."""

    def test_valid_single_start_diagram(self):
        """Valid diagram with single Start passes validation."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "end1",
                    "data": {"blockData": {"type": "end"}},
                },
            ],
            "edges": [{"source": "start1", "target": "end1"}],
        }

        errors = gen.validate_diagram(diagram)
        assert len(errors) == 0

    def test_no_start_node_error(self):
        """Diagram without Start node raises error."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {"id": "end1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [],
        }

        errors = gen.validate_diagram(diagram)
        assert len(errors) == 1
        assert errors[0].error_type == "no_start"

    def test_multiple_start_nodes_error(self):
        """Diagram with multiple Start nodes raises error."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test1"}},
                },
                {
                    "id": "start2",
                    "data": {"blockData": {"type": "start", "processName": "Test2"}},
                },
            ],
            "edges": [],
        }

        errors = gen.validate_diagram(diagram)
        assert len(errors) == 1
        assert errors[0].error_type == "multiple_start"
        assert "start1" in errors[0].node_ids
        assert "start2" in errors[0].node_ids

    def test_orphaned_nodes_detected(self):
        """Nodes not reachable from Start are detected."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "end1",
                    "data": {"blockData": {"type": "end"}},
                },
                {
                    "id": "orphan1",
                    "data": {"blockData": {"type": "activity"}},
                },
            ],
            "edges": [{"source": "start1", "target": "end1"}],
        }

        errors = gen.validate_diagram(diagram)
        assert len(errors) == 1
        assert errors[0].error_type == "orphaned_nodes"
        assert "orphan1" in errors[0].node_ids

    def test_generate_raises_on_no_start(self):
        """Generate raises exception on invalid diagram."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {"id": "end1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [],
        }

        with pytest.raises(DiagramValidationError) as exc_info:
            gen.generate(diagram)

        assert exc_info.value.error_type == "no_start"

    def test_generate_raises_on_multiple_start(self):
        """Generate raises exception on multiple Start nodes."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test1"}},
                },
                {
                    "id": "start2",
                    "data": {"blockData": {"type": "start", "processName": "Test2"}},
                },
            ],
            "edges": [],
        }

        with pytest.raises(DiagramValidationError) as exc_info:
            gen.generate(diagram)

        assert exc_info.value.error_type == "multiple_start"

    def test_switch_invalid_handle_is_rejected(self):
        """Switch blocks reject handles outside configured cases/default."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "switch1",
                    "data": {"blockData": {"type": "switch"}},
                },
                {"id": "end1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start1", "target": "switch1", "sourceHandle": "output"},
                {"source": "switch1", "target": "end1", "sourceHandle": "unknown"},
            ],
        }

        with pytest.raises(DiagramValidationError) as exc_info:
            gen.generate(diagram)

        assert exc_info.value.error_type == "unsupported_switch_handle"

    def test_parallel_graph_semantics_are_rejected(self):
        """Parallel branch handles fail explicitly until support lands."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "parallel1",
                    "data": {"blockData": {"type": "parallel"}},
                },
                {"id": "end1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start1", "target": "parallel1", "sourceHandle": "output"},
                {"source": "parallel1", "target": "end1", "sourceHandle": "branch-1"},
            ],
        }

        with pytest.raises(DiagramValidationError) as exc_info:
            gen.generate(diagram)

        assert exc_info.value.error_type == "unsupported_parallel"

    def test_try_catch_multiple_except_handlers_are_rejected(self):
        """Try/Catch currently supports at most one EXCEPT handler in graph codegen."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "try1",
                    "data": {
                        "blockData": {
                            "type": "try-catch",
                            "exceptBlocks": [
                                {"id": "except1", "exceptionType": "TimeoutError"},
                                {"id": "except2", "exceptionType": "ValueError"},
                            ],
                        }
                    },
                },
                {"id": "end1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start1", "target": "try1", "sourceHandle": "output"},
                {"source": "try1", "target": "end1", "sourceHandle": "error"},
            ],
        }

        with pytest.raises(DiagramValidationError) as exc_info:
            gen.generate(diagram)

        assert exc_info.value.error_type == "unsupported_multi_except"

    def test_if_duplicate_true_edges_are_rejected(self):
        """If blocks must keep deterministic true/false fanout during generation."""
        gen = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "if1",
                    "data": {"blockData": {"type": "if", "condition": "${flag}"}},
                },
                {"id": "a1", "data": {"blockData": {"type": "activity"}}},
                {"id": "a2", "data": {"blockData": {"type": "activity"}}},
            ],
            "edges": [
                {"source": "start1", "target": "if1", "sourceHandle": "output"},
                {"source": "if1", "target": "a1", "sourceHandle": "true"},
                {"source": "if1", "target": "a2", "sourceHandle": "true"},
            ],
        }

        with pytest.raises(DiagramValidationError) as exc_info:
            gen.generate(diagram)

        assert exc_info.value.error_type == "unsupported_if_fanout"


class TestCodeGenerator:
    """Tests for CodeGenerator class."""

    def test_generate_empty_diagram(self):
        """Test generating code from empty diagram raises error."""
        generator = CodeGenerator()
        with pytest.raises(DiagramValidationError) as exc_info:
            generator.generate({"nodes": [], "edges": []})
        assert exc_info.value.error_type == "no_start"

    def test_generate_start_end_only(self):
        """Test generating code from diagram with only start and end."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {
                        "blockData": {"type": "start", "processName": "Test Process"}
                    },
                },
                {
                    "id": "end-1",
                    "data": {"blockData": {"type": "end", "status": "PASS"}},
                },
            ],
            "edges": [{"source": "start-1", "target": "end-1"}],
        }
        code = generator.generate(diagram)
        assert "Test Process" in code
        assert "# End" in code

    def test_generate_with_assign(self):
        """Test generating code with assign block."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Main"}},
                },
                {
                    "id": "assign-1",
                    "data": {
                        "blockData": {
                            "type": "assign",
                            "variableName": "result",
                            "expression": "Hello World",
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "assign-1"},
                {"source": "assign-1", "target": "end-1"},
            ],
        }
        code = generator.generate(diagram)
        assert "Main" in code
        assert "${result}" in code

    def test_generate_with_if_block(self):
        """Test generating code with IF block."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "if-1",
                    "data": {"blockData": {"type": "if", "condition": "${True}"}},
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "if-1"},
                {"source": "if-1", "target": "end-1", "sourceHandle": "true"},
            ],
        }
        code = generator.generate(diagram)
        assert "IF" in code
        assert "END" in code

    def test_generate_with_if_true_false_branches(self):
        """If branch handles generate deterministic IF/ELSE bodies."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "if-1",
                    "data": {"blockData": {"type": "if", "condition": "${flag}"}},
                },
                {
                    "id": "true-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "true path"},
                        }
                    },
                },
                {
                    "id": "false-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "false path"},
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "if-1"},
                {"source": "if-1", "target": "true-activity", "sourceHandle": "true"},
                {"source": "if-1", "target": "false-activity", "sourceHandle": "false"},
                {"source": "true-activity", "target": "end-1"},
                {"source": "false-activity", "target": "end-1"},
            ],
        }

        code = generator.generate(diagram)
        assert "IF    ${flag}" in code
        assert "Log    true path" in code
        assert "ELSE" in code
        assert "Log    false path" in code
        assert code.index("Log    true path") < code.index("ELSE")
        assert code.index("ELSE") < code.index("Log    false path")
        assert code.count("# End") == 1

    def test_generate_with_switch_cases_and_default(self):
        """Switch case handles generate IF / ELSE IF / ELSE code deterministically."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Switch Test"}},
                },
                {
                    "id": "switch-1",
                    "data": {
                        "blockData": {
                            "type": "switch",
                            "expression": "${status}",
                            "cases": [
                                {"id": "success", "value": "success", "label": "Success"},
                                {"id": "warning", "value": "warning", "label": "Warning"},
                            ],
                        }
                    },
                },
                {
                    "id": "success-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "success path"},
                        }
                    },
                },
                {
                    "id": "warning-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "warning path"},
                        }
                    },
                },
                {
                    "id": "default-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "default path"},
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "switch-1"},
                {"source": "switch-1", "target": "success-activity", "sourceHandle": "success"},
                {"source": "switch-1", "target": "warning-activity", "sourceHandle": "warning"},
                {"source": "switch-1", "target": "default-activity", "sourceHandle": "default"},
                {"source": "success-activity", "target": "end-1"},
                {"source": "warning-activity", "target": "end-1"},
                {"source": "default-activity", "target": "end-1"},
            ],
        }

        code = generator.generate(diagram)
        assert "IF    ${status} == 'success'" in code
        assert "ELSE IF    ${status} == 'warning'" in code
        assert "ELSE" in code
        assert "Log    success path" in code
        assert "Log    warning path" in code
        assert "Log    default path" in code
        assert code.count("# End") == 1

    def test_generate_with_try_catch_error_and_finally_paths(self):
        """Try/Catch typed handles generate TRY / EXCEPT / FINALLY blocks."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Try Test"}},
                },
                {
                    "id": "try-1",
                    "data": {
                        "blockData": {
                            "type": "try-catch",
                            "exceptBlocks": [
                                {
                                    "id": "except-1",
                                    "exceptionType": "TimeoutError",
                                    "variable": "${err}",
                                }
                            ],
                            "finallyBlock": [],
                        }
                    },
                },
                {
                    "id": "try-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "try path"},
                        }
                    },
                },
                {
                    "id": "error-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "error path"},
                        }
                    },
                },
                {
                    "id": "finally-activity",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "cleanup path"},
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "try-1"},
                {"source": "try-1", "target": "try-activity", "sourceHandle": "output"},
                {"source": "try-1", "target": "error-activity", "sourceHandle": "error"},
                {"source": "try-1", "target": "finally-activity", "sourceHandle": "finally"},
                {"source": "try-activity", "target": "end-1"},
                {"source": "error-activity", "target": "end-1"},
                {"source": "finally-activity", "target": "end-1"},
            ],
        }

        code = generator.generate(diagram)
        assert "TRY" in code
        assert "Log    try path" in code
        assert "EXCEPT    TimeoutError    AS    ${err}" in code
        assert "Log    error path" in code
        assert "FINALLY" in code
        assert "Log    cleanup path" in code
        assert code.count("# End") == 1

    def test_generate_with_while_block(self):
        """Test generating code with WHILE block."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Loop"}},
                },
                {
                    "id": "while-1",
                    "data": {
                        "blockData": {
                            "type": "while",
                            "condition": "${counter} < 10",
                            "maxIterations": 100,
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "while-1"},
                {"source": "while-1", "target": "end-1"},
            ],
        }
        code = generator.generate(diagram)
        assert "WHILE" in code
        assert "limit=100" in code

    def test_generate_with_for_each(self):
        """Test generating code with FOR EACH block."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Iterate"}},
                },
                {
                    "id": "foreach-1",
                    "data": {
                        "blockData": {
                            "type": "for-each",
                            "itemVariable": "${item}",
                            "collection": "@{items}",
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "foreach-1"},
                {"source": "foreach-1", "target": "end-1"},
            ],
        }
        code = generator.generate(diagram)
        assert "FOR" in code
        assert "${item}" in code
        assert "@{items}" in code

    def test_generate_with_activity(self):
        """Test generating code with activity block."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "activity-1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "arguments": {"message": "Hello"},
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "activity-1"},
                {"source": "activity-1", "target": "end-1"},
            ],
        }
        code = generator.generate(diagram)
        assert "Log" in code

    def test_generate_with_activity_params_contract(self):
        """Activity params from Studio contract generate keyword arguments."""
        generator = CodeGenerator()
        diagram = {
            "nodes": [
                {
                    "id": "start-1",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "activity-1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "activityId": "log",
                            "library": "BuiltIn",
                            "params": {"message": "Hello from params"},
                        }
                    },
                },
                {"id": "end-1", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start-1", "target": "activity-1"},
                {"source": "activity-1", "target": "end-1"},
            ],
        }
        code = generator.generate(diagram)
        assert "Hello from params" in code

    def test_generate_from_json_string(self):
        """Test generating code from JSON string."""
        generator = CodeGenerator()
        json_str = '{"nodes": [{"id": "s1", "data": {"blockData": {"type": "start", "processName": "Test"}}}, {"id": "e1", "data": {"blockData": {"type": "end"}}}], "edges": [{"source": "s1", "target": "e1"}]}'
        code = generator.generate_from_json(json_str)
        assert "*** Settings ***" in code
        assert "Test" in code
