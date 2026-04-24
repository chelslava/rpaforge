from __future__ import annotations

import ast
import operator
from typing import Any

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


class SafeEvaluator(ast.NodeVisitor):
    def __init__(self, variables: dict[str, Any]):
        self.variables = variables

    def visit_Expr(self, node: ast.Expr) -> Any:
        return self.visit(node.value)

    def visit_Constant(self, node: ast.Constant) -> Any:
        return node.value

    def visit_Num(self, node: ast.Num) -> Any:
        return node.n

    def visit_Str(self, node: ast.Str) -> Any:
        return node.s

    def visit_Name(self, node: ast.Name) -> Any:
        if node.id in self.variables:
            return self.variables[node.id]
        elif node.id in SAFE_BUILTINS:
            return SAFE_BUILTINS[node.id]
        else:
            raise NameError(f"Undefined variable: {node.id}")

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        op_func = SAFE_OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
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
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        operand = self.visit(node.operand)
        return op_func(operand)

    def visit_BoolOp(self, node: ast.BoolOp) -> Any:
        values = [self.visit(value) for value in node.values]
        if isinstance(node.op, ast.And):
            return all(values)
        elif isinstance(node.op, ast.Or):
            return any(values)
        else:
            raise ValueError(f"Unsupported boolean operator: {type(node.op).__name__}")

    def visit_IfExp(self, node: ast.IfExp) -> Any:
        condition = self.visit(node.test)
        if condition:
            return self.visit(node.body)
        else:
            return self.visit(node.orelse)

    def generic_visit(self, node: ast.AST) -> Any:
        raise ValueError(f"Unsupported expression: {type(node).__name__}")


def safe_eval(condition: str, variables: dict[str, Any]) -> bool:
    if not condition or not condition.strip():
        return False
    try:
        tree = ast.parse(condition, mode="eval")
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
    def __init__(self, variables: dict[str, Any]):
        self.variables = variables

    def evaluate(self, condition: str) -> bool:
        if not condition or not condition.strip():
            return False
        try:
            return safe_eval(condition, self.variables)
        except Exception:
            return False
