"""Tests for input validation module."""

from __future__ import annotations

import pytest

from rpaforge.core.validation import (
    ValidationError,
    sanitize_input,
    validate_activity_params,
    validate_diagram_size,
    validate_expression,
    validate_file_path,
    validate_string,
    validate_variable_name,
)


class TestValidateString:
    """Tests for validate_string."""

    def test_passes_for_short_string(self) -> None:
        result = validate_string("short")
        assert result == "short"

    def test_passes_at_limit(self) -> None:
        limit = 100
        value = "x" * limit
        result = validate_string(value, limit)
        assert result == value

    def test_raises_over_limit(self) -> None:
        limit = 100
        value = "x" * (limit + 1)
        with pytest.raises(ValidationError):
            validate_string(value, limit)


class TestValidateFilePath:
    """Tests for validate_file_path."""

    def test_passes_for_normal_path(self) -> None:
        result = validate_file_path("/home/user/file.txt")
        assert result == "/home/user/file.txt"

    def test_passes_at_limit(self) -> None:
        limit = 100
        value = "x" * limit
        result = validate_file_path(value, limit)
        assert result == value

    def test_raises_over_limit(self) -> None:
        limit = 100
        value = "x" * (limit + 1)
        with pytest.raises(ValidationError):
            validate_file_path(value, limit)


class TestValidateExpression:
    """Tests for validate_expression."""

    def test_passes_for_short_expression(self) -> None:
        result = validate_expression("${x} + 1")
        assert result == "${x} + 1"

    def test_passes_at_limit(self) -> None:
        limit = 100
        value = "x" * limit
        result = validate_expression(value, limit)
        assert result == value

    def test_raises_over_limit(self) -> None:
        limit = 100
        value = "x" * (limit + 1)
        with pytest.raises(ValidationError):
            validate_expression(value, limit)


class TestValidateVariableName:
    """Tests for validate_variable_name."""

    def test_passes_for_valid_name(self) -> None:
        result = validate_variable_name("my_var")
        assert result == "my_var"

    def test_passes_underscore_start(self) -> None:
        result = validate_variable_name("_private")
        assert result == "_private"

    def test_raises_numbers_first(self) -> None:
        with pytest.raises(ValidationError):
            validate_variable_name("1invalid")

    def test_raises_special_chars(self) -> None:
        with pytest.raises(ValidationError):
            validate_variable_name("my-var")

    def test_passes_at_limit(self) -> None:
        limit = 100
        value = "x" * limit
        result = validate_variable_name(value, limit)
        assert result == value

    def test_raises_over_limit(self) -> None:
        limit = 100
        value = "x" * (limit + 1)
        with pytest.raises(ValidationError):
            validate_variable_name(value, limit)


class TestValidateDiagramSize:
    """Tests for validate_diagram_size."""

    def test_passes_for_small_diagram(self) -> None:
        nodes = [{"id": "1"}, {"id": "2"}]
        edges = [{"source": "1", "target": "2"}]
        validate_diagram_size(nodes, edges, limit=100)

    def test_passes_at_limit(self) -> None:
        limit = 10
        nodes = [{"id": str(i)} for i in range(limit)]
        edges = [{"source": str(i), "target": str(i + 1)} for i in range(limit - 1)]
        validate_diagram_size(nodes, edges, limit)

    def test_raises_over_limit(self) -> None:
        limit = 10
        nodes = [{"id": str(i)} for i in range(limit + 1)]
        edges = [{"source": str(i), "target": str(i + 1)} for i in range(limit)]
        with pytest.raises(ValidationError):
            validate_diagram_size(nodes, edges, limit)


class TestValidateActivityParams:
    """Tests for validate_activity_params."""

    def test_validates_string_param_values(self) -> None:
        params = {"name": "short", "description": "text"}
        result = validate_activity_params(params)
        assert result == params

    def test_raises_for_long_string_param(self) -> None:
        long_value = "x" * 10241
        params = {"value": long_value}
        with pytest.raises(ValidationError):
            validate_activity_params(params)


class TestSanitizeInput:
    """Tests for sanitize_input."""

    def test_removes_null_bytes(self) -> None:
        result = sanitize_input("hello\x00world")
        assert "\x00" not in result
        assert result == "helloworld"

    def test_truncates_over_10240(self) -> None:
        long_value = "x" * 10241
        result = sanitize_input(long_value)
        assert len(result) == 10240

    def test_passes_short_string(self) -> None:
        result = sanitize_input("short")
        assert result == "short"


class TestValidationError:
    """Tests for ValidationError exception."""

    def test_is_raised_by_string_validation(self) -> None:
        with pytest.raises(ValidationError):
            validate_string("x" * 10241, limit=10240)

    def test_is_raised_by_file_path_validation(self) -> None:
        with pytest.raises(ValidationError):
            validate_file_path("x" * 4097, limit=4096)

    def test_is_raised_by_expression_validation(self) -> None:
        with pytest.raises(ValidationError):
            validate_expression("x" * 1025, limit=1024)

    def test_is_raised_by_variable_name_validation_invalid_chars(self) -> None:
        with pytest.raises(ValidationError):
            validate_variable_name("1invalid")

    def test_is_raised_by_variable_name_validation_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            validate_variable_name("x" * 101, limit=100)

    def test_is_raised_by_diagram_size_validation(self) -> None:
        nodes = [{"id": str(i)} for i in range(101)]
        edges = []
        with pytest.raises(ValidationError):
            validate_diagram_size(nodes, edges, limit=100)

    def test_is_raised_by_activity_params_validation(self) -> None:
        params = {"value": "x" * 10241}
        with pytest.raises(ValidationError):
            validate_activity_params(params)
