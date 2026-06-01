from __future__ import annotations

import ast
import functools
import keyword
import logging
import operator
from typing import Any

from rpaforge.i18n import _ as _t

logger = logging.getLogger("rpaforge")

DEFAULT_AST_CACHE_SIZE = 256


@functools.lru_cache(maxsize=DEFAULT_AST_CACHE_SIZE)
def _cached_parse_expression(condition: str) -> ast.Expression:
    return ast.parse(condition, mode="eval")


MAX_STRING_LENGTH = 10240
MAX_LIST_LENGTH = 1000
MAX_NESTING_DEPTH = 10

SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.BitOr: operator.or_,
    ast.BitAnd: operator.and_,
    ast.BitXor: operator.xor,
    ast.LShift: operator.lshift,
    ast.RShift: operator.rshift,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
    ast.In: lambda x, y: x in y,
    ast.NotIn: lambda x, y: x not in y,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Invert: operator.invert,
    ast.And: lambda x, y: x and y,
    ast.Or: lambda x, y: x or y,
}

SAFE_BUILTINS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "len": len,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "any": any,
    "all": all,
}

# Read-only string/collection methods that are safe to call
SAFE_METHODS = frozenset(
    {
        "upper",
        "lower",
        "strip",
        "lstrip",
        "rstrip",
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
        "count",
        "find",
        "index",
        "isdigit",
        "isalpha",
        "isalnum",
        "isnumeric",
        "isspace",
        "title",
        "capitalize",
    }
)


class SafeEvaluator(ast.NodeVisitor):
    """AST-based safe expression evaluator.

    This evaluator uses AST parsing to execute expressions safely without
    exposing Python's eval() function directly to user input.

    Args:
        variables: Dictionary of variable name to value mappings
    """

    def __init__(self, variables: dict[str, Any]):
        self.variables = variables

    def _get_nesting_depth(self, node: ast.AST, current_depth: int = 0) -> int:
        """Calculate maximum nesting depth of an AST node."""
        max_depth = current_depth
        for child in ast.iter_child_nodes(node):
            child_depth = self._get_nesting_depth(child, current_depth + 1)
            max_depth = max(max_depth, child_depth)
        return max_depth

    def visit_Expr(self, node: ast.Expr) -> Any:
        if self._get_nesting_depth(node) > MAX_NESTING_DEPTH:
            raise ValueError(
                f"Expression nesting depth exceeds maximum ({MAX_NESTING_DEPTH})"
            )
        return self.visit(node.value)

    def visit_Constant(self, node: ast.Constant) -> Any:
        return node.value

    def visit_List(self, node: ast.List) -> Any:
        if len(node.elts) > MAX_LIST_LENGTH:
            raise ValueError(_t("engine.list_exceeds_maximum_length"))
        return [self.visit(e) for e in node.elts]

    def visit_Tuple(self, node: ast.Tuple) -> tuple[Any, ...]:
        return tuple(self.visit(e) for e in node.elts)

    def visit_Num(self, node: ast.Num) -> Any:
        return node.n

    def visit_Str(self, node: ast.Str) -> Any:
        return node.s

    def visit_Name(self, node: ast.Name) -> Any:
        if node.id in self.variables:
            return self.variables[node.id]
        elif node.id in SAFE_BUILTINS:
            return SAFE_BUILTINS[node.id]
        elif keyword.iskeyword(node.id):
            raise NameError(f"'{node.id}' is a Python reserved keyword")
        else:
            raise NameError(f"Undefined variable: {node.id}")

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        op_func = SAFE_OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(
                _t("engine.unsupported_operator", op=type(node.op).__name__)
            )
        left = self.visit(node.left)
        right = self.visit(node.right)
        return op_func(left, right)

    def visit_Compare(self, node: ast.Compare) -> Any:
        left = self.visit(node.left)
        results = []
        for op, comparator in zip(node.ops, node.comparators, strict=True):
            op_func = SAFE_OPERATORS.get(type(op))
            if op_func is None:
                raise ValueError(
                    f"Unsupported comparison operator: {type(op).__name__}"
                )
            right = self.visit(comparator)
            results.append(op_func(left, right))
            left = right
        return all(results)

    def visit_UnaryOp(self, node: ast.UnaryOp) -> Any:
        op_func = SAFE_OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(
                _t("engine.unsupported_unary_operator", op=type(node.op).__name__)
            )
        operand = self.visit(node.operand)
        return op_func(operand)

    def visit_BoolOp(self, node: ast.BoolOp) -> Any:
        values = [self.visit(value) for value in node.values]
        if isinstance(node.op, ast.And):
            return all(values)
        elif isinstance(node.op, ast.Or):
            return any(values)
        else:
            raise ValueError(
                _t("engine.unsupported_boolean_operator", op=type(node.op).__name__)
            )

    def visit_IfExp(self, node: ast.IfExp) -> Any:
        condition = self.visit(node.test)
        if condition:
            return self.visit(node.body)
        else:
            return self.visit(node.orelse)

    def visit_Attribute(self, node: ast.Attribute) -> Any:
        # Only allow attribute access for method resolution via visit_Call.
        # Direct attribute reads (e.g. ``obj.attr`` as a value) are not
        # supported here — raise so that callers know to handle this via
        # visit_Call instead.
        raise ValueError(
            f"Direct attribute access is not supported: {node.attr!r}. "
            "Use a whitelisted method call instead."
        )

    def visit_Call(self, node: ast.Call) -> Any:
        # Allow calls of the form  obj.method(...)  where method is in
        # SAFE_METHODS.  Reject everything else (arbitrary callables,
        # nested calls as the function, etc.).
        if not isinstance(node.func, ast.Attribute):
            # Allow calls to whitelisted builtins (e.g. len(x), str(x))
            if isinstance(node.func, ast.Name) and node.func.id in SAFE_BUILTINS:
                func = SAFE_BUILTINS[node.func.id]
                eval_args = [self.visit(arg) for arg in node.args]
                eval_kwargs = {kw.arg: self.visit(kw.value) for kw in node.keywords}
                return func(*eval_args, **eval_kwargs)
            raise ValueError(
                f"Unsupported call target: {type(node.func).__name__}. "
                "Only whitelisted method calls are allowed."
            )

        method_name = node.func.attr
        if method_name not in SAFE_METHODS:
            raise ValueError(
                f"Method '{method_name}' is not in the safe-method whitelist."
            )

        obj = self.visit(node.func.value)
        method = getattr(obj, method_name, None)
        if method is None or not callable(method):
            raise ValueError(
                f"Object of type {type(obj).__name__!r} has no callable method '{method_name}'."
            )

        eval_args = [self.visit(arg) for arg in node.args]
        eval_kwargs = {kw.arg: self.visit(kw.value) for kw in node.keywords}
        return method(*eval_args, **eval_kwargs)

    def generic_visit(self, node: ast.AST) -> Any:
        raise ValueError(_t("engine.unsupported_expression", type=type(node).__name__))


def safe_eval(
    condition: str, variables: dict[str, Any], max_length: int = MAX_STRING_LENGTH
) -> bool:
    """
    Safely evaluate a Python expression using AST parsing.

    Args:
        condition: Expression string to evaluate
        variables: Dictionary of variable name to value mappings
        max_length: Maximum allowed string length

    Returns:
        Boolean result of the evaluated condition

    Raises:
        SyntaxError: If the expression has invalid syntax
        NameError: If an undefined variable is referenced
        ValueError: If expression contains unsupported operations or is too long
    """
    if not condition or not condition.strip():
        return False
    if len(condition) > max_length:
        raise ValueError(
            f"Expression length ({len(condition)}) exceeds maximum ({max_length})"
        )
    try:
        tree = _cached_parse_expression(condition)
        evaluator = SafeEvaluator(variables)
        result = evaluator.visit(tree.body)
        return bool(result)
    except SyntaxError as err:
        raise SyntaxError(f"Invalid syntax in condition: {condition}") from err
    except NameError as err:
        raise NameError(f"{err} in condition: {condition}") from err
    except ValueError as err:
        raise ValueError(
            f"Unsupported operation in condition: {err} - {condition}"
        ) from err


class ConditionParser:
    """Parser for evaluating conditions with safe expression evaluation.

    Args:
        variables: Dictionary of variable name to value mappings
    """

    def __init__(self, variables: dict[str, Any]):
        self.variables = variables

    def evaluate(self, condition: str) -> bool:
        if not condition or not condition.strip():
            return False
        try:
            return safe_eval(condition, self.variables)
        except Exception as exc:
            logger.debug("Condition evaluation failed for '%s': %s", condition, exc)
            return False


def clear_expression_cache() -> None:
    """Clear the AST parse cache."""
    _cached_parse_expression.cache_clear()


def get_cache_stats() -> dict[str, int]:
    """Get AST parse cache statistics."""
    stats = _cached_parse_expression.cache_info()
    return {
        "hits": stats.hits,
        "misses": stats.misses,
        "size": stats.currsize,
        "maxsize": stats.maxsize,
    }
