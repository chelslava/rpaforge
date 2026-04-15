"""Tests for RPAForge String Library."""

import pytest

from rpaforge_libraries.String import String


class TestStringLibrary:
    """Tests for String library."""

    def setup_method(self):
        """Set up test fixtures."""
        self.library = String()

    def test_split(self):
        """Test splitting a string."""
        result = self.library.split("a,b,c", delimiter=",")
        assert result == ["a", "b", "c"]

    def test_join(self):
        """Test joining strings."""
        result = self.library.join(["a", "b", "c"], delimiter=",")
        assert result == "a,b,c"

    def test_replace(self):
        """Test replacing substrings."""
        result = self.library.replace("hello world", "world", "universe")
        assert result == "hello universe"

    def test_replace_case_insensitive(self):
        """Test case-insensitive replacement."""
        result = self.library.replace(
            "Hello World", "world", "universe", case_sensitive=False
        )
        assert result == "Hello universe"

    def test_trim(self):
        """Test trimming whitespace."""
        assert self.library.trim("  hello  ") == "hello"
        assert self.library.trim("__hello__", chars="_") == "hello"

    def test_trim_start(self):
        """Test trimming leading whitespace."""
        assert self.library.trim("  hello  ", mode="start") == "hello  "

    def test_trim_end(self):
        """Test trimming trailing whitespace."""
        assert self.library.trim("  hello  ", mode="end") == "  hello"

    def test_format_string(self):
        """Test string formatting."""
        result = self.library.format_string("Hello {name}!", name="World")
        assert result == "Hello World!"

    def test_length(self):
        """Test getting string length."""
        assert self.library.length("hello") == 5
        assert self.library.length("") == 0

    def test_contains(self):
        """Test string contains."""
        assert self.library.check_string("Hello World", "World", "contains") is True
        assert self.library.check_string("Hello World", "world", "contains") is False

    def test_contains_case_insensitive(self):
        """Test case-insensitive contains."""
        assert (
            self.library.check_string(
                "Hello World", "world", "contains", case_sensitive=False
            )
            is True
        )

    def test_starts_with(self):
        """Test prefix check."""
        assert self.library.check_string("hello world", "hello", "starts_with") is True
        assert self.library.check_string("hello world", "world", "starts_with") is False

    def test_ends_with(self):
        """Test suffix check."""
        assert self.library.check_string("hello world", "world", "ends_with") is True
        assert self.library.check_string("hello world", "hello", "ends_with") is False

    def test_to_upper(self):
        """Test uppercase conversion."""
        assert self.library.change_case("hello", mode="upper") == "HELLO"

    def test_to_lower(self):
        """Test lowercase conversion."""
        assert self.library.change_case("HELLO", mode="lower") == "hello"

    def test_to_title_case(self):
        """Test title case conversion."""
        assert self.library.change_case("hello world", mode="title") == "Hello World"

    def test_capitalize(self):
        """Test capitalization."""
        assert self.library.change_case("hello", mode="capitalize") == "Hello"

    def test_regex_match(self):
        """Test regex matching."""
        result = self.library.regex_operation("hello123", r"([a-z]+)(\d+)", "match")
        assert result == ["hello", "123"]

    def test_regex_match_no_match(self):
        """Test regex with no match."""
        result = self.library.regex_operation("hello", r"\d+", "match")
        assert result is None

    def test_regex_replace(self):
        """Test regex replacement."""
        result = self.library.regex_operation(
            "hello123world456", r"\d+", "replace", "X"
        )
        assert result == "helloXworldX"

    def test_regex_find_all(self):
        """Test finding all regex matches."""
        result = self.library.regex_operation("hello123world456", r"\d+", "find_all")
        assert result == ["123", "456"]

    def test_substring(self):
        """Test substring extraction."""
        assert self.library.substring("hello world", 0, 5) == "hello"
        assert self.library.substring("hello world", 6) == "world"

    def test_index_of(self):
        """Test finding substring index."""
        assert self.library.find_index("hello world", "world") == 6
        assert self.library.find_index("hello world", "foo") == -1

    def test_last_index_of(self):
        """Test finding last occurrence."""
        assert self.library.find_index("hello hello", "hello", direction="last") == 6

    def test_pad_left(self):
        """Test left padding."""
        assert self.library.pad("5", 3, "0", direction="left") == "005"

    def test_pad_right(self):
        """Test right padding."""
        assert self.library.pad("5", 3, "0", direction="right") == "500"

    def test_repeat(self):
        """Test string repetition."""
        assert self.library.repeat("ab", 3) == "ababab"

    def test_is_empty(self):
        """Test empty check."""
        assert self.library.is_empty("") is True
        assert self.library.is_empty("   ", trim_whitespace=True) is True
        assert self.library.is_empty("hello") is False

    def test_reverse(self):
        """Test string reversal."""
        assert self.library.reverse("hello") == "olleh"

    def test_count_occurrences(self):
        """Test counting occurrences."""
        assert self.library.count_occurrences("hello hello hello", "hello") == 3
        assert (
            self.library.count_occurrences("Hello HELLO", "hello", case_sensitive=False)
            == 2
        )

    def test_remove_duplicates(self):
        """Test removing duplicates from list."""
        result = self.library.remove_duplicates(["a", "b", "a", "c"])
        assert result == ["a", "b", "c"]
