"""Tests for String library."""

from __future__ import annotations


class TestStringImport:
    """Tests for String library import and metadata."""

    def test_import_library(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.String import String

        assert hasattr(String, "_library_meta")
        assert String._library_name == "String"


class TestStringKeywords:
    """Tests for String keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.String import String

        lib = String()

        keywords = [
            "split",
            "join",
            "replace",
            "trim",
            "format_string",
            "length",
            "check_string",
            "change_case",
            "regex_operation",
            "substring",
            "find_index",
            "pad",
            "repeat",
            "is_empty",
            "reverse",
            "count_occurrences",
            "remove_duplicates",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"


class TestSplit:
    """Tests for split method."""

    def test_split_by_space(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.split("hello world foo", delimiter=" ")
        assert result == ["hello", "world", "foo"]

    def test_split_by_comma(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.split("a,b,c", delimiter=",")
        assert result == ["a", "b", "c"]

    def test_split_with_max_splits(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.split("a,b,c,d", delimiter=",", max_splits=2)
        assert result == ["a", "b", "c,d"]

    def test_split_strips_whitespace(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.split("a , b , c", delimiter=",", strip_whitespace=True)
        assert result == ["a", "b", "c"]

    def test_split_no_strip(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.split("a , b", delimiter=",", strip_whitespace=False)
        assert result == ["a ", " b"]


class TestJoin:
    """Tests for join method."""

    def test_join_with_comma(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.join(["a", "b", "c"], delimiter=", ")
        assert result == "a, b, c"

    def test_join_with_empty_delimiter(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.join(["hello", "world"], delimiter="")
        assert result == "helloworld"

    def test_join_converts_to_string(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.join([1, 2, 3], delimiter="-")
        assert result == "1-2-3"


class TestReplace:
    """Tests for replace method."""

    def test_replace_basic(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.replace("hello world", old="world", new="there")
        assert result == "hello there"

    def test_replace_all_occurrences(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.replace("aababab", old="a", new="x")
        assert result == "xxbxbxb"

    def test_replace_with_count(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.replace("aaa", old="a", new="b", count=2)
        assert result == "bba"

    def test_replace_case_insensitive(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.replace("Hello HELLO hello", old="hello", new="hi", case_sensitive=False)
        assert result == "hi hi hi"

    def test_replace_case_sensitive(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.replace("Hello HELLO hello", old="hello", new="hi", case_sensitive=True)
        assert result == "Hello HELLO hi"


class TestTrim:
    """Tests for trim method."""

    def test_trim_both_sides(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.trim("  hello  ") == "hello"

    def test_trim_start(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.trim("  hello  ", mode="start") == "hello  "

    def test_trim_end(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.trim("  hello  ", mode="end") == "  hello"

    def test_trim_custom_chars(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.trim("***hello***", chars="*") == "hello"


class TestFormatString:
    """Tests for format_string method."""

    def test_format_with_named_placeholders(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.format_string("Hello, {name}!", name="World")
        assert result == "Hello, World!"

    def test_format_multiple_placeholders(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.format_string("{first} {last}", first="John", last="Doe")
        assert result == "John Doe"


class TestLength:
    """Tests for length method."""

    def test_length_basic(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.length("hello") == 5

    def test_length_empty_string(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.length("") == 0

    def test_length_unicode(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.length("abc") == 3


class TestCheckString:
    """Tests for check_string method."""

    def test_contains_true(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.check_string("hello world", "world", check_type="contains") is True

    def test_contains_false(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.check_string("hello world", "xyz", check_type="contains") is False

    def test_starts_with_true(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.check_string("hello world", "hello", check_type="starts_with") is True

    def test_ends_with_true(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.check_string("hello world", "world", check_type="ends_with") is True

    def test_case_insensitive(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.check_string("Hello World", "hello", check_type="contains", case_sensitive=False) is True


class TestChangeCase:
    """Tests for change_case method."""

    def test_upper(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.change_case("hello", mode="upper") == "HELLO"

    def test_lower(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.change_case("HELLO", mode="lower") == "hello"

    def test_title(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.change_case("hello world", mode="title") == "Hello World"

    def test_capitalize(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.change_case("hello world", mode="capitalize") == "Hello world"


class TestRegexOperation:
    """Tests for regex_operation method."""

    def test_match_found(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.regex_operation("hello123world", pattern=r"\d+", operation="match")
        assert result == ["123"]

    def test_match_not_found(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.regex_operation("helloworld", pattern=r"\d+", operation="match")
        assert result is None

    def test_find_all(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.regex_operation("a1b2c3", pattern=r"\d", operation="find_all")
        assert result == ["1", "2", "3"]

    def test_replace(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.regex_operation(
            "hello123world", pattern=r"\d+", operation="replace", replacement="NUM"
        )
        assert result == "helloNUMworld"

    def test_case_insensitive_flag(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.regex_operation("Hello World", pattern=r"hello", operation="match", flags="i")
        assert result == ["Hello"]

    def test_match_with_groups(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.regex_operation("2024-06-15", pattern=r"(\d{4})-(\d{2})-(\d{2})", operation="match")
        assert result == ["2024", "06", "15"]


class TestSubstring:
    """Tests for substring method."""

    def test_substring_from_start(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.substring("hello world", start=0, length=5) == "hello"

    def test_substring_from_middle(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.substring("hello world", start=6, length=5) == "world"

    def test_substring_to_end(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.substring("hello world", start=6) == "world"

    def test_substring_negative_start(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.substring("hello world", start=-5) == "world"


class TestFindIndex:
    """Tests for find_index method."""

    def test_find_first_occurrence(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.find_index("hello world hello", "hello") == 0

    def test_find_last_occurrence(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.find_index("hello world hello", "hello", direction="last") == 12

    def test_find_not_found(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.find_index("hello world", "xyz") == -1

    def test_find_case_insensitive(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.find_index("Hello World", "hello", case_sensitive=False) == 0


class TestPad:
    """Tests for pad method."""

    def test_pad_left(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.pad("42", total_length=5, direction="left") == "   42"

    def test_pad_right(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.pad("42", total_length=5, direction="right") == "42   "

    def test_pad_with_custom_char(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.pad("42", total_length=5, pad_char="0", direction="left") == "00042"


class TestRepeat:
    """Tests for repeat method."""

    def test_repeat_basic(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.repeat("ab", count=3) == "ababab"

    def test_repeat_zero(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.repeat("abc", count=0) == ""


class TestIsEmpty:
    """Tests for is_empty method."""

    def test_empty_string(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.is_empty("") is True

    def test_whitespace_only_trimmed(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.is_empty("   ", trim_whitespace=True) is True

    def test_whitespace_not_trimmed(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.is_empty("   ", trim_whitespace=False) is False

    def test_non_empty_string(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.is_empty("hello") is False


class TestReverse:
    """Tests for reverse method."""

    def test_reverse_basic(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.reverse("hello") == "olleh"

    def test_reverse_palindrome(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.reverse("racecar") == "racecar"

    def test_reverse_empty(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.reverse("") == ""


class TestCountOccurrences:
    """Tests for count_occurrences method."""

    def test_count_basic(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.count_occurrences("hello world hello", "hello") == 2

    def test_count_not_found(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.count_occurrences("hello world", "xyz") == 0

    def test_count_empty_substring(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.count_occurrences("hello", "") == 0

    def test_count_case_insensitive(self):
        from rpaforge_libraries.String import String

        lib = String()
        assert lib.count_occurrences("Hello HELLO hello", "hello", case_sensitive=False) == 3


class TestRemoveDuplicates:
    """Tests for remove_duplicates method."""

    def test_remove_duplicates_basic(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.remove_duplicates(["a", "b", "a", "c", "b"])
        assert result == ["a", "b", "c"]

    def test_remove_duplicates_case_sensitive(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.remove_duplicates(["Hello", "hello", "HELLO"], case_sensitive=True)
        assert result == ["Hello", "hello", "HELLO"]

    def test_remove_duplicates_case_insensitive(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.remove_duplicates(["Hello", "hello", "HELLO"], case_sensitive=False)
        assert result == ["Hello"]

    def test_remove_duplicates_no_duplicates(self):
        from rpaforge_libraries.String import String

        lib = String()
        result = lib.remove_duplicates(["a", "b", "c"])
        assert result == ["a", "b", "c"]
