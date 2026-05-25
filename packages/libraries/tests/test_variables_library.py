"""Tests for Variables library."""

from __future__ import annotations

import pytest


class TestVariablesImport:
    """Tests for Variables library import and metadata."""

    def test_import_library(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.Variables import Variables

        assert hasattr(Variables, "_library_meta")
        assert Variables._library_name == "Variables"

    def test_starts_empty(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        assert lib._variables == {}


class TestVariablesKeywords:
    """Tests for Variables keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()

        keywords = [
            "set_variable",
            "get_variable",
            "clear_variable",
            "variable_exists",
            "clear_all_variables",
            "get_variable_names",
            "get_variable_count",
            "get_all_variables",
            "set_variables_from_dict",
            "adjust_variable",
            "append_to_list",
            "extend_list",
            "get_list_length",
            "get_dict_keys",
            "get_dict_value",
            "set_dict_value",
            "convert_variable",
            "get_variable_type",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"


class TestSetVariable:
    """Tests for set_variable method."""

    def test_set_string_variable(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        result = lib.set_variable("name", "Alice")
        assert result == "Alice"
        assert lib._variables["name"] == "Alice"

    def test_set_integer_variable(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        result = lib.set_variable("count", 42)
        assert result == 42

    def test_set_overwrites_existing(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 1)
        lib.set_variable("x", 2)
        assert lib._variables["x"] == 2

    def test_set_returns_value(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        value = {"key": "val"}
        result = lib.set_variable("data", value)
        assert result is value


class TestGetVariable:
    """Tests for get_variable method."""

    def test_get_existing_variable(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 100)
        assert lib.get_variable("x") == 100

    def test_get_missing_variable_raises_key_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        with pytest.raises(KeyError, match="not found"):
            lib.get_variable("nonexistent")

    def test_get_missing_with_default(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        result = lib.get_variable("nonexistent", default="fallback")
        assert result == "fallback"

    def test_get_none_default(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        result = lib.get_variable("nonexistent", default=None)
        assert result is None


class TestClearVariable:
    """Tests for clear_variable method."""

    def test_clear_existing_variable(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 1)
        result = lib.clear_variable("x")
        assert result is True
        assert "x" not in lib._variables

    def test_clear_nonexistent_variable(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        result = lib.clear_variable("nonexistent")
        assert result is False


class TestVariableExists:
    """Tests for variable_exists method."""

    def test_exists_true(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 1)
        assert lib.variable_exists("x") is True

    def test_exists_false(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        assert lib.variable_exists("nonexistent") is False

    def test_exists_after_clear(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 1)
        lib.clear_variable("x")
        assert lib.variable_exists("x") is False


class TestClearAllVariables:
    """Tests for clear_all_variables method."""

    def test_clear_all(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("a", 1)
        lib.set_variable("b", 2)
        lib.set_variable("c", 3)
        count = lib.clear_all_variables()
        assert count == 3
        assert lib._variables == {}

    def test_clear_all_empty(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        count = lib.clear_all_variables()
        assert count == 0


class TestGetVariableNames:
    """Tests for get_variable_names method."""

    def test_get_names(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("a", 1)
        lib.set_variable("b", 2)
        names = lib.get_variable_names()
        assert set(names) == {"a", "b"}

    def test_get_names_empty(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        assert lib.get_variable_names() == []


class TestGetVariableCount:
    """Tests for get_variable_count method."""

    def test_count_variables(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("a", 1)
        lib.set_variable("b", 2)
        assert lib.get_variable_count() == 2

    def test_count_empty(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        assert lib.get_variable_count() == 0


class TestGetAllVariables:
    """Tests for get_all_variables method."""

    def test_get_all(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("a", 1)
        lib.set_variable("b", "two")
        result = lib.get_all_variables()
        assert result == {"a": 1, "b": "two"}

    def test_get_all_returns_copy(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 1)
        result = lib.get_all_variables()
        result["y"] = 2
        assert "y" not in lib._variables


class TestSetVariablesFromDict:
    """Tests for set_variables_from_dict method."""

    def test_set_from_dict(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        count = lib.set_variables_from_dict({"a": 1, "b": 2, "c": 3})
        assert count == 3
        assert lib.get_variable("a") == 1

    def test_set_from_dict_no_overwrite(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("a", 99)
        count = lib.set_variables_from_dict({"a": 1, "b": 2}, overwrite=False)
        assert count == 1
        assert lib.get_variable("a") == 99
        assert lib.get_variable("b") == 2

    def test_set_from_dict_with_overwrite(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("a", 99)
        lib.set_variables_from_dict({"a": 1}, overwrite=True)
        assert lib.get_variable("a") == 1


class TestAdjustVariable:
    """Tests for adjust_variable method."""

    def test_increment(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("count", 5)
        result = lib.adjust_variable("count", amount=1, operation="increment")
        assert result == 6

    def test_decrement(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("count", 5)
        result = lib.adjust_variable("count", amount=2, operation="decrement")
        assert result == 3

    def test_adjust_float(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("val", 1.5)
        result = lib.adjust_variable("val", amount=0.5, operation="increment")
        assert result == 2.0

    def test_adjust_missing_raises_key_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        with pytest.raises(KeyError):
            lib.adjust_variable("nonexistent")

    def test_adjust_non_numeric_raises_type_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("text", "hello")
        with pytest.raises(TypeError):
            lib.adjust_variable("text")


class TestAppendToList:
    """Tests for append_to_list method."""

    def test_append_to_list(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("items", [1, 2, 3])
        result = lib.append_to_list("items", 4)
        assert result == [1, 2, 3, 4]

    def test_append_missing_variable_raises_key_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        with pytest.raises(KeyError):
            lib.append_to_list("nonexistent", 1)

    def test_append_to_non_list_raises_type_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", "not a list")
        with pytest.raises(TypeError):
            lib.append_to_list("x", 1)


class TestExtendList:
    """Tests for extend_list method."""

    def test_extend_list(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("items", [1, 2])
        result = lib.extend_list("items", [3, 4, 5])
        assert result == [1, 2, 3, 4, 5]

    def test_extend_missing_raises_key_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        with pytest.raises(KeyError):
            lib.extend_list("nonexistent", [1])

    def test_extend_non_list_raises_type_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 42)
        with pytest.raises(TypeError):
            lib.extend_list("x", [1])


class TestGetListLength:
    """Tests for get_list_length method."""

    def test_list_length(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("items", [1, 2, 3, 4])
        assert lib.get_list_length("items") == 4

    def test_empty_list_length(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("items", [])
        assert lib.get_list_length("items") == 0

    def test_non_list_raises_type_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", "not a list")
        with pytest.raises(TypeError):
            lib.get_list_length("x")


class TestGetDictKeys:
    """Tests for get_dict_keys method."""

    def test_get_keys(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("data", {"a": 1, "b": 2})
        keys = lib.get_dict_keys("data")
        assert set(keys) == {"a", "b"}

    def test_non_dict_raises_type_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", [1, 2])
        with pytest.raises(TypeError):
            lib.get_dict_keys("x")


class TestGetDictValue:
    """Tests for get_dict_value method."""

    def test_get_existing_key(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("data", {"key": "value"})
        assert lib.get_dict_value("data", "key") == "value"

    def test_get_missing_key_with_default(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("data", {})
        assert lib.get_dict_value("data", "missing", default="fallback") == "fallback"

    def test_non_dict_raises_type_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", 42)
        with pytest.raises(TypeError):
            lib.get_dict_value("x", "key")


class TestSetDictValue:
    """Tests for set_dict_value method."""

    def test_set_new_key(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("data", {})
        result = lib.set_dict_value("data", "key", "value")
        assert result == {"key": "value"}

    def test_overwrite_key(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("data", {"key": "old"})
        lib.set_dict_value("data", "key", "new")
        assert lib.get_dict_value("data", "key") == "new"

    def test_non_dict_raises_type_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("x", [])
        with pytest.raises(TypeError):
            lib.set_dict_value("x", "k", "v")


class TestConvertVariable:
    """Tests for convert_variable method."""

    def test_to_string(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("n", 42)
        result = lib.convert_variable("n", target_type="string")
        assert result == "42"
        assert isinstance(result, str)

    def test_to_integer(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("s", "123")
        result = lib.convert_variable("s", target_type="integer")
        assert result == 123
        assert isinstance(result, int)

    def test_to_float(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("s", "3.14")
        result = lib.convert_variable("s", target_type="float")
        assert result == pytest.approx(3.14)

    def test_to_boolean(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("n", 1)
        result = lib.convert_variable("n", target_type="boolean")
        assert result is True

    def test_missing_raises_key_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        with pytest.raises(KeyError):
            lib.convert_variable("nonexistent")


class TestGetVariableType:
    """Tests for get_variable_type method."""

    def test_type_int(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("n", 42)
        assert lib.get_variable_type("n") == "int"

    def test_type_str(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("s", "hello")
        assert lib.get_variable_type("s") == "str"

    def test_type_list(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("lst", [1, 2, 3])
        assert lib.get_variable_type("lst") == "list"

    def test_type_dict(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        lib.set_variable("d", {"a": 1})
        assert lib.get_variable_type("d") == "dict"

    def test_missing_raises_key_error(self):
        from rpaforge_libraries.Variables import Variables

        lib = Variables()
        with pytest.raises(KeyError):
            lib.get_variable_type("nonexistent")
