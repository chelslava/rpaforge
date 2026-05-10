"""Tests for SafeEvaluator - condition expression evaluator."""

from __future__ import annotations

import ast

import pytest

from rpaforge.core.safe_evaluator import (
    SAFE_BUILTINS,
    SAFE_METHODS,
    SAFE_OPERATORS,
    ConditionParser,
    SafeEvaluator,
    clear_expression_cache,
    get_cache_stats,
    safe_eval,
)


class TestSafeOperators:
    """Tests for safe operator definitions."""

    def test_safe_operators_contain_expected(self):
        """Test that all expected operators are present."""
        expected_ops = [
            ast.Add,
            ast.Sub,
            ast.Mult,
            ast.Div,
            ast.FloorDiv,
            ast.Mod,
            ast.Pow,
            ast.BitOr,
            ast.BitAnd,
            ast.BitXor,
            ast.LShift,
            ast.RShift,
        ]
        for op in expected_ops:
            assert op in SAFE_OPERATORS, f"Missing operator: {op.__name__}"

    def test_safe_comparison_operators(self):
        """Test comparison operators are safe."""
        expected_comparisons = [
            ast.Eq,
            ast.NotEq,
            ast.Lt,
            ast.LtE,
            ast.Gt,
            ast.GtE,
            ast.Is,
            ast.IsNot,
            ast.In,
            ast.NotIn,
        ]
        for op in expected_comparisons:
            assert op in SAFE_OPERATORS, f"Missing comparison: {op.__name__}"

    def test_safe_unary_operators(self):
        """Test unary operators are safe."""
        expected_unary = [ast.USub, ast.UAdd, ast.Invert]
        for op in expected_unary:
            assert op in SAFE_OPERATORS, f"Missing unary: {op.__name__}"


class TestSafeBuiltins:
    """Tests for safe builtins."""

    def test_safe_builtins_contain_expected(self):
        """Test that expected builtins are present."""
        expected = [
            "abs",
            "min",
            "max",
            "round",
            "len",
            "str",
            "int",
            "float",
            "bool",
            "any",
            "all",
        ]
        for name in expected:
            assert name in SAFE_BUILTINS, f"Missing builtin: {name}"
            assert callable(SAFE_BUILTINS[name])


class TestSafeMethods:
    """Tests for safe methods whitelist."""

    def test_safe_methods_is_frozenset(self):
        """Test that SAFE_METHODS is a frozenset."""
        assert isinstance(SAFE_METHODS, frozenset)

    def test_safe_methods_contain_expected(self):
        """Test that expected methods are present."""
        expected = [
            "upper",
            "lower",
            "strip",
            "startswith",
            "endswith",
            "split",
            "join",
            "replace",
            "format",
            "keys",
            "values",
            "items",
            "get",
        ]
        for method in expected:
            assert method in SAFE_METHODS, f"Missing method: {method}"


class TestSafeEvaluatorConstants:
    """Tests for SafeEvaluator constant visits."""

    @pytest.fixture
    def evaluator(self):
        """Create evaluator with empty variables."""
        return SafeEvaluator({})

    def test_visit_constant_int(self, evaluator):
        """Test visiting integer constant."""
        node = ast.Constant(value=42)
        result = evaluator.visit(node)
        assert result == 42

    def test_visit_constant_float(self, evaluator):
        """Test visiting float constant."""
        node = ast.Constant(value=3.14)
        result = evaluator.visit(node)
        assert abs(result - 3.14) < 0.001

    def test_visit_constant_string(self, evaluator):
        """Test visiting string constant."""
        node = ast.Constant(value="hello")
        result = evaluator.visit(node)
        assert result == "hello"

    def test_visit_constant_bool_true(self, evaluator):
        """Test visiting True constant."""
        node = ast.Constant(value=True)
        result = evaluator.visit(node)
        assert result is True

    def test_visit_constant_bool_false(self, evaluator):
        """Test visiting False constant."""
        node = ast.Constant(value=False)
        result = evaluator.visit(node)
        assert result is False

    def test_visit_constant_none(self, evaluator):
        """Test visiting None constant."""
        node = ast.Constant(value=None)
        result = evaluator.visit(node)
        assert result is None

    def test_visit_num_compat(self, evaluator):
        """Test visiting Num node (compatibility for Python < 3.8)."""
        node = ast.Num(n=42)
        result = evaluator.visit(node)
        assert result == 42

    def test_visit_str_compat(self, evaluator):
        """Test visiting Str node (compatibility for Python < 3.8)."""
        node = ast.Str(s="test")
        result = evaluator.visit(node)
        assert result == "test"


class TestSafeEvaluatorName:
    """Tests for SafeEvaluator name resolution."""

    def test_visit_name_defined_variable(self):
        """Test visiting defined variable."""
        evaluator = SafeEvaluator({"x": 10, "name": "Alice"})
        node = ast.Name(id="x")
        assert evaluator.visit(node) == 10

        node = ast.Name(id="name")
        assert evaluator.visit(node) == "Alice"

    def test_visit_name_safe_builtin(self):
        """Test visiting safe builtin."""
        evaluator = SafeEvaluator({})
        node = ast.Name(id="abs")
        result = evaluator.visit(node)
        assert result is abs

    def test_visit_name_undefined_raises(self):
        """Test visiting undefined variable raises NameError."""
        evaluator = SafeEvaluator({})
        node = ast.Name(id="undefined_var")
        with pytest.raises(NameError, match="Undefined variable: undefined_var"):
            evaluator.visit(node)

    def test_visit_name_unsafe_builtin_raises(self):
        """Test visiting unsafe builtin raises NameError."""
        evaluator = SafeEvaluator({})
        node = ast.Name(id="eval")
        with pytest.raises(NameError, match="Undefined variable: eval"):
            evaluator.visit(node)


class TestSafeEvaluatorBinaryOperations:
    """Tests for binary operations."""

    def test_addition(self):
        """Test addition."""
        evaluator = SafeEvaluator({"a": 5, "b": 3})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.Add(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 8

    def test_subtraction(self):
        """Test subtraction."""
        evaluator = SafeEvaluator({"a": 10, "b": 4})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.Sub(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 6

    def test_multiplication(self):
        """Test multiplication."""
        evaluator = SafeEvaluator({"a": 6, "b": 7})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.Mult(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 42

    def test_division(self):
        """Test true division."""
        evaluator = SafeEvaluator({"a": 10, "b": 4})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.Div(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 2.5

    def test_floor_division(self):
        """Test floor division."""
        evaluator = SafeEvaluator({"a": 10, "b": 3})
        node = ast.BinOp(
            left=ast.Name(id="a"), op=ast.FloorDiv(), right=ast.Name(id="b")
        )
        assert evaluator.visit(node) == 3

    def test_modulo(self):
        """Test modulo."""
        evaluator = SafeEvaluator({"a": 17, "b": 5})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.Mod(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 2

    def test_power(self):
        """Test power."""
        evaluator = SafeEvaluator({"a": 2, "b": 8})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.Pow(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 256

    def test_bitwise_or(self):
        """Test bitwise OR."""
        evaluator = SafeEvaluator({"a": 5, "b": 3})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.BitOr(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 7

    def test_bitwise_and(self):
        """Test bitwise AND."""
        evaluator = SafeEvaluator({"a": 5, "b": 3})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.BitAnd(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 1

    def test_bitwise_xor(self):
        """Test bitwise XOR."""
        evaluator = SafeEvaluator({"a": 5, "b": 3})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.BitXor(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 6

    def test_left_shift(self):
        """Test left shift."""
        evaluator = SafeEvaluator({"a": 1, "b": 3})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.LShift(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 8

    def test_right_shift(self):
        """Test right shift."""
        evaluator = SafeEvaluator({"a": 8, "b": 1})
        node = ast.BinOp(left=ast.Name(id="a"), op=ast.RShift(), right=ast.Name(id="b"))
        assert evaluator.visit(node) == 4

    def test_unsupported_operator_raises(self):
        """Test that unsupported operator raises ValueError."""
        evaluator = SafeEvaluator({})
        node = ast.BinOp(
            left=ast.Constant(value=1), op=ast.MatMult(), right=ast.Constant(value=2)
        )
        with pytest.raises(ValueError, match="Unsupported operator"):
            evaluator.visit(node)


class TestSafeEvaluatorComparisons:
    """Tests for comparison operations."""

    def test_equal(self):
        """Test equality comparison."""
        evaluator = SafeEvaluator({"a": 5, "b": 5})
        node = ast.Compare(
            left=ast.Name(id="a"), ops=[ast.Eq()], comparators=[ast.Name(id="b")]
        )
        assert evaluator.visit(node) is True

    def test_not_equal(self):
        """Test not equal comparison."""
        evaluator = SafeEvaluator({"a": 5, "b": 3})
        node = ast.Compare(
            left=ast.Name(id="a"), ops=[ast.NotEq()], comparators=[ast.Name(id="b")]
        )
        assert evaluator.visit(node) is True

    def test_less_than(self):
        """Test less than comparison."""
        evaluator = SafeEvaluator({"a": 3, "b": 5})
        node = ast.Compare(
            left=ast.Name(id="a"), ops=[ast.Lt()], comparators=[ast.Name(id="b")]
        )
        assert evaluator.visit(node) is True

    def test_less_than_or_equal(self):
        """Test less than or equal comparison."""
        evaluator = SafeEvaluator({"a": 5, "b": 5})
        node = ast.Compare(
            left=ast.Name(id="a"), ops=[ast.LtE()], comparators=[ast.Name(id="b")]
        )
        assert evaluator.visit(node) is True

    def test_greater_than(self):
        """Test greater than comparison."""
        evaluator = SafeEvaluator({"a": 10, "b": 5})
        node = ast.Compare(
            left=ast.Name(id="a"), ops=[ast.Gt()], comparators=[ast.Name(id="b")]
        )
        assert evaluator.visit(node) is True

    def test_greater_than_or_equal(self):
        """Test greater than or equal comparison."""
        evaluator = SafeEvaluator({"a": 5, "b": 5})
        node = ast.Compare(
            left=ast.Name(id="a"), ops=[ast.GtE()], comparators=[ast.Name(id="b")]
        )
        assert evaluator.visit(node) is True

    def test_is_operator(self):
        """Test is operator."""
        evaluator = SafeEvaluator({})
        node = ast.Compare(
            left=ast.Constant(value=None),
            ops=[ast.Is()],
            comparators=[ast.Constant(value=None)],
        )
        assert evaluator.visit(node) is True

    def test_is_not_operator(self):
        """Test is not operator."""
        evaluator = SafeEvaluator({"a": None})
        node = ast.Compare(
            left=ast.Name(id="a"),
            ops=[ast.IsNot()],
            comparators=[ast.Constant(value=5)],
        )
        assert evaluator.visit(node) is True

    def test_in_operator(self):
        """Test in operator with list comparator."""
        evaluator = SafeEvaluator({"a": 3})
        node = ast.Compare(
            left=ast.Name(id="a"),
            ops=[ast.In()],
            comparators=[
                ast.List(
                    elts=[
                        ast.Constant(value=1),
                        ast.Constant(value=2),
                        ast.Constant(value=3),
                    ]
                )
            ],
        )
        assert evaluator.visit(node) is True

    def test_not_in_operator(self):
        """Test not in operator."""
        evaluator = SafeEvaluator({"a": 4})
        node = ast.Compare(
            left=ast.Name(id="a"),
            ops=[ast.NotIn()],
            comparators=[
                ast.List(
                    elts=[
                        ast.Constant(value=1),
                        ast.Constant(value=2),
                        ast.Constant(value=3),
                    ]
                )
            ],
        )
        assert evaluator.visit(node) is True

    def test_chained_comparisons(self):
        """Test chained comparisons."""
        evaluator = SafeEvaluator({"a": 5, "b": 6, "c": 7})
        node = ast.Compare(
            left=ast.Name(id="a"),
            ops=[ast.Lt(), ast.Lt()],
            comparators=[ast.Name(id="b"), ast.Name(id="c")],
        )
        assert evaluator.visit(node) is True


class TestSafeEvaluatorUnaryOperations:
    """Tests for unary operations."""

    def test_unary_minus(self):
        """Test unary minus."""
        evaluator = SafeEvaluator({"a": 5})
        node = ast.UnaryOp(op=ast.USub(), operand=ast.Name(id="a"))
        assert evaluator.visit(node) == -5

    def test_unary_plus(self):
        """Test unary plus."""
        evaluator = SafeEvaluator({"a": 5})
        node = ast.UnaryOp(op=ast.UAdd(), operand=ast.Name(id="a"))
        assert evaluator.visit(node) == 5

    def test_bitwise_invert(self):
        """Test bitwise invert."""
        evaluator = SafeEvaluator({"a": 5})
        node = ast.UnaryOp(op=ast.Invert(), operand=ast.Name(id="a"))
        assert evaluator.visit(node) == -6

    def test_not_unary_operator(self):
        """Test logical not via BoolOp (safe_eval uses 'not' keyword)."""
        evaluator = SafeEvaluator({"a": True})
        node = ast.UnaryOp(op=ast.Not(), operand=ast.Name(id="a"))
        with pytest.raises(ValueError, match="Unsupported unary operator"):
            evaluator.visit(node)


class TestSafeEvaluatorBooleanOperations:
    """Tests for boolean operations."""

    def test_and_all_true(self):
        """Test AND with all true values."""
        evaluator = SafeEvaluator({"a": True, "b": True})
        node = ast.BoolOp(
            op=ast.And(),
            values=[ast.Name(id="a"), ast.Name(id="b")],
        )
        assert evaluator.visit(node) is True

    def test_and_one_false(self):
        """Test AND with one false value."""
        evaluator = SafeEvaluator({"a": True, "b": False})
        node = ast.BoolOp(
            op=ast.And(),
            values=[ast.Name(id="a"), ast.Name(id="b")],
        )
        assert evaluator.visit(node) is False

    def test_or_one_true(self):
        """Test OR with one true value."""
        evaluator = SafeEvaluator({"a": True, "b": False})
        node = ast.BoolOp(
            op=ast.Or(),
            values=[ast.Name(id="a"), ast.Name(id="b")],
        )
        assert evaluator.visit(node) is True

    def test_or_all_false(self):
        """Test OR with all false values."""
        evaluator = SafeEvaluator({"a": False, "b": False})
        node = ast.BoolOp(
            op=ast.Or(),
            values=[ast.Name(id="a"), ast.Name(id="b")],
        )
        assert evaluator.visit(node) is False

    def test_nested_boolean_operations(self):
        """Test nested boolean operations."""
        evaluator = SafeEvaluator({"a": True, "b": False, "c": True})
        node = ast.BoolOp(
            op=ast.And(),
            values=[
                ast.Name(id="a"),
                ast.BoolOp(
                    op=ast.Or(),
                    values=[ast.Name(id="b"), ast.Name(id="c")],
                ),
            ],
        )
        assert evaluator.visit(node) is True


class TestSafeEvaluatorTernaryExpression:
    """Tests for ternary if-else expressions."""

    def test_ternary_true_condition(self):
        """Test ternary with true condition."""
        evaluator = SafeEvaluator({"a": True, "x": 10, "y": 20})
        node = ast.IfExp(
            test=ast.Name(id="a"),
            body=ast.Name(id="x"),
            orelse=ast.Name(id="y"),
        )
        assert evaluator.visit(node) == 10

    def test_ternary_false_condition(self):
        """Test ternary with false condition."""
        evaluator = SafeEvaluator({"a": False, "x": 10, "y": 20})
        node = ast.IfExp(
            test=ast.Name(id="a"),
            body=ast.Name(id="x"),
            orelse=ast.Name(id="y"),
        )
        assert evaluator.visit(node) == 20

    def test_nested_ternary(self):
        """Test nested ternary expressions."""
        evaluator = SafeEvaluator({"a": 1, "x": 10, "y": 20, "z": 30})
        node = ast.IfExp(
            test=ast.Compare(
                left=ast.Name(id="a"),
                ops=[ast.Eq()],
                comparators=[ast.Constant(value=1)],
            ),
            body=ast.Name(id="x"),
            orelse=ast.IfExp(
                test=ast.Compare(
                    left=ast.Name(id="a"),
                    ops=[ast.Eq()],
                    comparators=[ast.Constant(value=2)],
                ),
                body=ast.Name(id="y"),
                orelse=ast.Name(id="z"),
            ),
        )
        assert evaluator.visit(node) == 10


class TestSafeEvaluatorCalls:
    """Tests for function/method calls."""

    def test_builtin_abs(self):
        """Test abs() builtin."""
        evaluator = SafeEvaluator({"x": -5})
        node = ast.Call(
            func=ast.Name(id="abs"),
            args=[ast.Name(id="x")],
            keywords=[],
        )
        assert evaluator.visit(node) == 5

    def test_builtin_len(self):
        """Test len() builtin."""
        evaluator = SafeEvaluator({"arr": [1, 2, 3]})
        node = ast.Call(
            func=ast.Name(id="len"),
            args=[ast.Name(id="arr")],
            keywords=[],
        )
        assert evaluator.visit(node) == 3

    def test_builtin_str(self):
        """Test str() builtin."""
        evaluator = SafeEvaluator({"x": 123})
        node = ast.Call(
            func=ast.Name(id="str"),
            args=[ast.Name(id="x")],
            keywords=[],
        )
        assert evaluator.visit(node) == "123"

    def test_builtin_int(self):
        """Test int() builtin."""
        evaluator = SafeEvaluator({"x": "42"})
        node = ast.Call(
            func=ast.Name(id="int"),
            args=[ast.Name(id="x")],
            keywords=[],
        )
        assert evaluator.visit(node) == 42

    def test_string_upper_method(self):
        """Test string upper() method."""
        evaluator = SafeEvaluator({"text": "hello"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="upper"),
            args=[],
            keywords=[],
        )
        assert evaluator.visit(node) == "HELLO"

    def test_string_lower_method(self):
        """Test string lower() method."""
        evaluator = SafeEvaluator({"text": "HELLO"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="lower"),
            args=[],
            keywords=[],
        )
        assert evaluator.visit(node) == "hello"

    def test_string_strip_method(self):
        """Test string strip() method."""
        evaluator = SafeEvaluator({"text": "  hello  "})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="strip"),
            args=[],
            keywords=[],
        )
        assert evaluator.visit(node) == "hello"

    def test_string_strip_with_arg(self):
        """Test string strip() with argument."""
        evaluator = SafeEvaluator({"text": "xxxhelloxxx"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="strip"),
            args=[ast.Constant(value="x")],
            keywords=[],
        )
        assert evaluator.visit(node) == "hello"

    def test_string_startswith(self):
        """Test string startswith() method."""
        evaluator = SafeEvaluator({"text": "Hello World"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="startswith"),
            args=[ast.Constant(value="Hello")],
            keywords=[],
        )
        assert evaluator.visit(node) is True

    def test_string_endswith(self):
        """Test string endswith() method."""
        evaluator = SafeEvaluator({"text": "Hello World"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="endswith"),
            args=[ast.Constant(value="World")],
            keywords=[],
        )
        assert evaluator.visit(node) is True

    def test_string_split(self):
        """Test string split() method."""
        evaluator = SafeEvaluator({"text": "a,b,c"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="split"),
            args=[ast.Constant(value=",")],
            keywords=[],
        )
        assert evaluator.visit(node) == ["a", "b", "c"]

    def test_string_replace(self):
        """Test string replace() method."""
        evaluator = SafeEvaluator({"text": "hello world"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="replace"),
            args=[ast.Constant(value="world"), ast.Constant(value="universe")],
            keywords=[],
        )
        assert evaluator.visit(node) == "hello universe"

    def test_string_format(self):
        """Test string format() method."""
        evaluator = SafeEvaluator({"template": "Hello {}!"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="template"), attr="format"),
            args=[ast.Constant(value="World")],
            keywords=[],
        )
        assert evaluator.visit(node) == "Hello World!"

    def test_dict_keys(self):
        """Test dict keys() method."""
        evaluator = SafeEvaluator({"d": {"a": 1, "b": 2}})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="d"), attr="keys"),
            args=[],
            keywords=[],
        )
        assert set(evaluator.visit(node)) == {"a", "b"}

    def test_dict_values(self):
        """Test dict values() method."""
        evaluator = SafeEvaluator({"d": {"a": 1, "b": 2}})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="d"), attr="values"),
            args=[],
            keywords=[],
        )
        assert set(evaluator.visit(node)) == {1, 2}

    def test_dict_items(self):
        """Test dict items() method."""
        evaluator = SafeEvaluator({"d": {"a": 1, "b": 2}})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="d"), attr="items"),
            args=[],
            keywords=[],
        )
        assert set(evaluator.visit(node)) == {("a", 1), ("b", 2)}

    def test_dict_get(self):
        """Test dict get() method."""
        evaluator = SafeEvaluator({"d": {"a": 1, "b": 2}})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="d"), attr="get"),
            args=[ast.Constant(value="a")],
            keywords=[],
        )
        assert evaluator.visit(node) == 1

    def test_dict_get_with_default(self):
        """Test dict get() with default value."""
        evaluator = SafeEvaluator({"d": {"a": 1}})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="d"), attr="get"),
            args=[ast.Constant(value="missing"), ast.Constant(value="default")],
            keywords=[],
        )
        assert evaluator.visit(node) == "default"

    def test_string_count(self):
        """Test string count() method."""
        evaluator = SafeEvaluator({"text": "hello world"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="count"),
            args=[ast.Constant(value="l")],
            keywords=[],
        )
        assert evaluator.visit(node) == 3

    def test_string_find(self):
        """Test string find() method."""
        evaluator = SafeEvaluator({"text": "hello world"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="find"),
            args=[ast.Constant(value="world")],
            keywords=[],
        )
        assert evaluator.visit(node) == 6

    def test_string_index(self):
        """Test string index() method."""
        evaluator = SafeEvaluator({"text": "hello world"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="index"),
            args=[ast.Constant(value="world")],
            keywords=[],
        )
        assert evaluator.visit(node) == 6

    def test_unsupported_method_raises(self):
        """Test that unsupported method raises ValueError."""
        evaluator = SafeEvaluator({"text": "hello"})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="text"), attr="__init__"),
            args=[],
            keywords=[],
        )
        with pytest.raises(ValueError, match="not in the safe-method whitelist"):
            evaluator.visit(node)

    def test_call_on_non_callable_raises(self):
        """Test calling method on non-callable raises."""
        evaluator = SafeEvaluator({"x": 42})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="x"), attr="upper"),
            args=[],
            keywords=[],
        )
        with pytest.raises(ValueError, match="has no callable method"):
            evaluator.visit(node)

    def test_unsupported_call_target_raises(self):
        """Test that arbitrary callables raise ValueError."""
        evaluator = SafeEvaluator({"x": 42})
        node = ast.Call(
            func=ast.Attribute(value=ast.Name(id="x"), attr="upper"),
            args=[],
            keywords=[],
        )
        with pytest.raises(ValueError, match="has no callable method"):
            evaluator.visit(node)


class TestSafeEvaluatorDirectAttributeAccess:
    """Tests for direct attribute access (should raise)."""

    def test_direct_attribute_access_raises(self):
        """Test that direct attribute access raises ValueError."""
        evaluator = SafeEvaluator({"text": "hello"})
        node = ast.Attribute(value=ast.Name(id="text"), attr="upper")
        with pytest.raises(
            ValueError, match="Direct attribute access is not supported"
        ):
            evaluator.visit(node)


class TestSafeEvaluatorGenericVisit:
    """Tests for generic visit (unsupported nodes)."""

    def test_unsupported_node_raises(self):
        """Test that unsupported nodes raise ValueError."""
        evaluator = SafeEvaluator({})
        node = ast.Lambda(
            args=ast.arguments(
                posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]
            ),
            body=ast.Constant(value=1),
        )
        with pytest.raises(ValueError, match="Unsupported expression"):
            evaluator.visit(node)


class TestSafeEvalFunction:
    """Tests for safe_eval() function."""

    def test_simple_arithmetic(self):
        """Test simple arithmetic expression."""
        variables = {"a": 10, "b": 5}
        result = safe_eval("a + b > 0", variables)
        assert result is True

    def test_comparison(self):
        """Test comparison expression."""
        variables = {"x": 5, "y": 10}
        result = safe_eval("x < y", variables)
        assert result is True

    def test_logical_and(self):
        """Test logical AND."""
        variables = {"a": True, "b": True, "c": False}
        result = safe_eval("a and b", variables)
        assert result is True

    def test_logical_or(self):
        """Test logical OR."""
        variables = {"a": False, "b": True}
        result = safe_eval("a or b", variables)
        assert result is True

    def test_ternary_expression(self):
        """Test ternary expression (returns bool)."""
        variables = {"x": 10, "y": 20, "flag": True}
        result = safe_eval("x == 10 if flag else y == 10", variables)
        assert result is True

    def test_method_call_in_expression(self):
        """Test method call in expression."""
        variables = {"name": "alice"}
        result = safe_eval('name.upper() == "ALICE"', variables)
        assert result is True

    def test_empty_condition_returns_false(self):
        """Test empty condition returns False."""
        assert safe_eval("", {}) is False
        assert safe_eval("   ", {}) is False

    def test_none_condition_returns_false(self):
        """Test None condition returns False."""
        assert safe_eval(None, {}) is False

    def test_invalid_syntax_raises_syntax_error(self):
        """Test invalid syntax raises SyntaxError."""
        with pytest.raises(SyntaxError, match="Invalid syntax"):
            safe_eval("a +", {})

    def test_undefined_variable_raises_name_error(self):
        """Test undefined variable raises NameError."""
        with pytest.raises(NameError, match="Undefined variable"):
            safe_eval("undefined_var > 5", {})

    def test_unsupported_operation_raises_value_error(self):
        """Test unsupported operation raises ValueError."""
        with pytest.raises(SyntaxError, match="Invalid syntax"):
            safe_eval("import os", {})


class TestConditionParser:
    """Tests for ConditionParser class."""

    @pytest.fixture
    def parser(self):
        """Create condition parser."""
        return ConditionParser({"x": 10, "y": 5})

    def test_evaluate_true_condition(self, parser):
        """Test evaluating true condition."""
        assert parser.evaluate("x > y") is True

    def test_evaluate_false_condition(self, parser):
        """Test evaluating false condition."""
        assert parser.evaluate("x < y") is False

    def test_evaluate_empty_returns_false(self, parser):
        """Test empty condition returns False."""
        assert parser.evaluate("") is False
        assert parser.evaluate("   ") is False

    def test_evaluate_none_returns_false(self, parser):
        """Test None condition returns False."""
        assert parser.evaluate(None) is False

    def test_evaluate_invalid_returns_false(self, parser):
        """Test invalid condition returns False (not raises)."""
        assert parser.evaluate("undefined_var > 5") is False
        assert parser.evaluate("a +") is False


class TestComplexExpressions:
    """Tests for complex real-world expressions."""

    def test_email_validation(self):
        """Test email-like validation."""
        variables = {"email": "user@example.com"}
        result = safe_eval('"@" in email and email.endswith(".com")', variables)
        assert result is True

    def test_numeric_range_check(self):
        """Test numeric range check."""
        variables = {"value": 50, "min_val": 0, "max_val": 100}
        result = safe_eval("min_val <= value <= max_val", variables)
        assert result is True

    def test_string_length_check(self):
        """Test string length check."""
        variables = {"username": "alice", "min_length": 3}
        result = safe_eval("len(username) >= min_length", variables)
        assert result is True

    def test_dict_value_check(self):
        """Test dictionary value check."""
        variables = {"config": {"debug": True, "verbose": False}}
        result = safe_eval('config.get("debug") == True', variables)
        assert result is True

    def test_multiple_conditions(self):
        """Test multiple conditions with AND/OR."""
        variables = {"age": 25, "has_license": True, "is_employed": True}
        result = safe_eval("(age >= 18 and has_license) or is_employed", variables)
        assert result is True


class TestMemoization:
    """Tests for AST parse memoization."""

    def test_cache_clears_successfully(self):
        """Test that cache can be cleared."""
        clear_expression_cache()
        stats = get_cache_stats()
        assert stats["size"] == 0
        assert stats["hits"] == 0
        assert stats["misses"] == 0

    def test_cache_misses_on_first_eval(self):
        """Test cache miss on first evaluation."""
        clear_expression_cache()
        safe_eval("x > 5", {"x": 10})
        stats = get_cache_stats()
        assert stats["misses"] == 1
        assert stats["hits"] == 0
        assert stats["size"] == 1

    def test_cache_hits_on_repeated_eval(self):
        """Test cache hits on repeated same expression."""
        clear_expression_cache()
        safe_eval("x > 5", {"x": 10})
        safe_eval("x > 5", {"x": 20})
        safe_eval("x > 5", {"x": 30})
        stats = get_cache_stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["size"] == 1

    def test_different_expressions_different_cache_entries(self):
        """Test that different expressions create separate cache entries."""
        clear_expression_cache()
        safe_eval("a > 5", {"a": 10})
        safe_eval("b < 10", {"b": 5})
        safe_eval("c == 3", {"c": 3})
        stats = get_cache_stats()
        assert stats["size"] == 3
        assert stats["misses"] == 3
        assert stats["hits"] == 0

    def test_cache_respects_maxsize(self):
        """Test that cache respects maxsize limit."""
        clear_expression_cache()
        for i in range(300):
            safe_eval(f"x{i} > 5", {"x" + str(i): 10})
        stats = get_cache_stats()
        assert stats["maxsize"] == 256
        assert stats["size"] <= 256

    def test_cache_info_includes_maxsize(self):
        """Test that cache info reports maxsize."""
        clear_expression_cache()
        stats = get_cache_stats()
        assert "maxsize" in stats
        assert stats["maxsize"] == 256

    def test_cache_works_with_condition_parser(self):
        """Test that ConditionParser also uses the cache."""
        clear_expression_cache()
        parser = ConditionParser({"x": 10})
        parser.evaluate("x > 5")
        parser.evaluate("x > 5")
        stats = get_cache_stats()
        assert stats["hits"] >= 1
