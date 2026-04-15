"""Tests for RPAForge Variables Library."""

import pytest

from rpaforge_libraries.Variables import Variables


class TestVariablesLibrary:
    """Tests for Variables library."""

    def setup_method(self):
        """Set up test fixtures."""
        self.library = Variables()

    def test_set_variable(self):
        """Test setting a variable."""
        result = self.library.set_variable("name", "value")
        assert result == "value"

    def test_get_variable(self):
        """Test getting a variable."""
        self.library.set_variable("name", "value")
        result = self.library.get_variable("name")
        assert result == "value"

    def test_get_variable_not_found_raises(self):
        """Test getting non-existent variable raises error."""
        with pytest.raises(KeyError):
            self.library.get_variable("nonexistent")

    def test_get_variable_default(self):
        """Test getting variable with default."""
        result = self.library.get_variable("nonexistent", default="default")
        assert result == "default"

    def test_clear_variable(self):
        """Test clearing a variable."""
        self.library.set_variable("name", "value")
        result = self.library.clear_variable("name")
        assert result is True
        assert not self.library.variable_exists("name")

    def test_clear_variable_not_exists(self):
        """Test clearing non-existent variable."""
        result = self.library.clear_variable("nonexistent")
        assert result is False

    def test_variable_exists(self):
        """Test variable existence check."""
        assert not self.library.variable_exists("name")
        self.library.set_variable("name", "value")
        assert self.library.variable_exists("name")

    def test_clear_all_variables(self):
        """Test clearing all variables."""
        self.library.set_variable("a", 1)
        self.library.set_variable("b", 2)
        count = self.library.clear_all_variables()
        assert count == 2
        assert self.library.get_variable_count() == 0

    def test_get_variable_names(self):
        """Test getting variable names."""
        self.library.set_variable("a", 1)
        self.library.set_variable("b", 2)
        names = self.library.get_variable_names()
        assert set(names) == {"a", "b"}

    def test_get_variable_count(self):
        """Test getting variable count."""
        assert self.library.get_variable_count() == 0
        self.library.set_variable("a", 1)
        assert self.library.get_variable_count() == 1

    def test_get_all_variables(self):
        """Test getting all variables."""
        self.library.set_variable("a", 1)
        self.library.set_variable("b", 2)
        all_vars = self.library.get_all_variables()
        assert all_vars == {"a": 1, "b": 2}

    def test_set_variables_from_dict(self):
        """Test setting variables from dict."""
        count = self.library.set_variables_from_dict({"a": 1, "b": 2})
        assert count == 2
        assert self.library.get_variable("a") == 1

    def test_increment_variable(self):
        """Test incrementing a variable."""
        self.library.set_variable("counter", 5)
        result = self.library.adjust_variable("counter", operation="increment")
        assert result == 6

    def test_increment_variable_by_amount(self):
        """Test incrementing by specific amount."""
        self.library.set_variable("counter", 5)
        result = self.library.adjust_variable(
            "counter", amount=10, operation="increment"
        )
        assert result == 15

    def test_increment_non_numeric_raises(self):
        """Test incrementing non-numeric raises error."""
        self.library.set_variable("text", "hello")
        with pytest.raises(TypeError):
            self.library.adjust_variable("text", operation="increment")

    def test_decrement_variable(self):
        """Test decrementing a variable."""
        self.library.set_variable("counter", 5)
        result = self.library.adjust_variable("counter", operation="decrement")
        assert result == 4

    def test_append_to_list(self):
        """Test appending to list variable."""
        self.library.set_variable("items", [1, 2])
        result = self.library.append_to_list("items", 3)
        assert result == [1, 2, 3]

    def test_append_to_non_list_raises(self):
        """Test appending to non-list raises error."""
        self.library.set_variable("text", "hello")
        with pytest.raises(TypeError):
            self.library.append_to_list("text", "world")

    def test_extend_list(self):
        """Test extending list variable."""
        self.library.set_variable("items", [1, 2])
        result = self.library.extend_list("items", [3, 4])
        assert result == [1, 2, 3, 4]

    def test_get_list_length(self):
        """Test getting list length."""
        self.library.set_variable("items", [1, 2, 3])
        result = self.library.get_list_length("items")
        assert result == 3

    def test_get_dict_keys(self):
        """Test getting dict keys."""
        self.library.set_variable("data", {"a": 1, "b": 2})
        result = self.library.get_dict_keys("data")
        assert set(result) == {"a", "b"}

    def test_get_dict_value(self):
        """Test getting dict value."""
        self.library.set_variable("data", {"a": 1, "b": 2})
        result = self.library.get_dict_value("data", "a")
        assert result == 1

    def test_get_dict_value_default(self):
        """Test getting dict value with default."""
        self.library.set_variable("data", {"a": 1})
        result = self.library.get_dict_value("data", "c", default=0)
        assert result == 0

    def test_set_dict_value(self):
        """Test setting dict value."""
        self.library.set_variable("data", {"a": 1})
        result = self.library.set_dict_value("data", "b", 2)
        assert result == {"a": 1, "b": 2}

    def test_convert_to_string(self):
        """Test converting to string."""
        self.library.set_variable("num", 123)
        result = self.library.convert_variable("num", target_type="string")
        assert result == "123"

    def test_convert_to_integer(self):
        """Test converting to integer."""
        self.library.set_variable("str_num", "123")
        result = self.library.convert_variable("str_num", target_type="integer")
        assert result == 123

    def test_convert_to_float(self):
        """Test converting to float."""
        self.library.set_variable("str_num", "123.45")
        result = self.library.convert_variable("str_num", target_type="float")
        assert result == 123.45

    def test_convert_to_boolean(self):
        """Test converting to boolean."""
        self.library.set_variable("val", 1)
        result = self.library.convert_variable("val", target_type="boolean")
        assert result is True

    def test_get_variable_type(self):
        """Test getting variable type."""
        self.library.set_variable("num", 123)
        self.library.set_variable("text", "hello")
        self.library.set_variable("items", [1, 2])
        assert self.library.get_variable_type("num") == "int"
        assert self.library.get_variable_type("text") == "str"
        assert self.library.get_variable_type("items") == "list"
