"""RPAForge String Library - String manipulation operations."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, param, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.string")


@library(name="String", category="Data", icon="📝")
class String:
    """String manipulation operations library."""

    @activity(name="Split String", category="String")
    @tags("string", "split")
    @output("List of string parts")
    def split(
        self,
        text: str,
        delimiter: str = " ",
        max_splits: int = -1,
        strip_whitespace: bool = True,
    ) -> list[str]:
        """Split a string into a list by delimiter.

        :param text: String to split.
        :param delimiter: Delimiter to split by (default: space).
        :param max_splits: Maximum number of splits (-1 for unlimited).
        :param strip_whitespace: Whether to strip whitespace from each part.
        :returns: List of string parts.
        """
        if max_splits >= 0:
            parts = text.split(delimiter, max_splits)
        else:
            parts = text.split(delimiter)

        if strip_whitespace:
            parts = [p.strip() for p in parts]

        logger.info(f"Split string into {len(parts)} parts")
        return parts

    @activity(name="Join Strings", category="String")
    @tags("string", "join")
    @output("Joined string")
    def join(
        self,
        items: list[str],
        delimiter: str = ", ",
    ) -> str:
        """Join a list of strings with a delimiter.

        :param items: List of strings to join.
        :param delimiter: Delimiter to join with (default: ', ').
        :returns: Joined string.
        """
        result = delimiter.join(str(item) for item in items)
        logger.info(f"Joined {len(items)} items")
        return result

    @activity(name="Replace String", category="String")
    @tags("string", "replace")
    @output("Modified string")
    def replace(
        self,
        text: str,
        old: str,
        new: str,
        count: int = -1,
        case_sensitive: bool = True,
    ) -> str:
        """Replace occurrences of a substring.

        :param text: String to modify.
        :param old: Substring to replace.
        :param new: Replacement string.
        :param count: Maximum replacements (-1 for all).
        :param case_sensitive: Whether replacement is case-sensitive.
        :returns: Modified string.
        """
        if case_sensitive:
            result = text.replace(old, new, count)
        else:
            pattern = re.compile(re.escape(old), re.IGNORECASE)
            if count >= 0:
                result = pattern.sub(new, text, count=count)
            else:
                result = pattern.sub(new, text)

        logger.info(f"Replaced '{old}' with '{new}'")
        return result

    @activity(name="Trim", category="String")
    @tags("string", "trim")
    @output("Trimmed string")
    @param(
        "mode",
        type="string",
        options=["both", "start", "end"],
        description="Which side to trim",
    )
    def trim(
        self,
        text: str,
        chars: str | None = None,
        mode: str = "both",
    ) -> str:
        """Remove whitespace or specified characters from string.

        :param text: String to trim.
        :param chars: Characters to remove (default: whitespace).
        :param mode: Trim mode - both, start, or end.
        :returns: Trimmed string.
        """
        mode = mode.lower()
        if mode == "start":
            return text.lstrip(chars)
        elif mode == "end":
            return text.rstrip(chars)
        return text.strip(chars)

    @activity(name="Format String", category="String")
    @tags("string", "format")
    @output("Formatted string")
    def format_string(
        self,
        template: str,
        **kwargs: Any,
    ) -> str:
        """Format a string template with named placeholders.

        :param template: Template string with {placeholder} syntax.
        :param kwargs: Named values to substitute.
        :returns: Formatted string.
        """
        return template.format(**kwargs)

    @activity(name="String Length", category="String")
    @tags("string", "length")
    @output("Length of the string")
    def length(
        self,
        text: str,
    ) -> int:
        """Get the length of a string.

        :param text: String to measure.
        :returns: Length of the string.
        """
        return len(text)

    @activity(name="Check String", category="String")
    @tags("string", "search")
    @output("True if condition is met")
    @param(
        "check_type",
        type="string",
        options=["contains", "starts_with", "ends_with"],
        description="Type of check to perform",
    )
    def check_string(
        self,
        text: str,
        pattern: str,
        check_type: str = "contains",
        case_sensitive: bool = True,
    ) -> bool:
        """Check if a string matches a condition.

        :param text: String to check.
        :param pattern: Pattern to match.
        :param check_type: Type of check - contains, starts_with, ends_with.
        :param case_sensitive: Whether comparison is case-sensitive.
        :returns: True if condition is met.
        """
        check_type = check_type.lower()
        if not case_sensitive:
            text = text.lower()
            pattern = pattern.lower()

        if check_type == "contains":
            return pattern in text
        elif check_type == "starts_with":
            return text.startswith(pattern)
        elif check_type == "ends_with":
            return text.endswith(pattern)
        return False

    @activity(name="Change Case", category="String")
    @tags("string", "case")
    @output("Converted string")
    @param(
        "mode",
        type="string",
        options=["upper", "lower", "title", "capitalize"],
        description="Case conversion mode",
    )
    def change_case(
        self,
        text: str,
        mode: str = "upper",
    ) -> str:
        """Convert string to a different case.

        :param text: String to convert.
        :param mode: Case mode - upper, lower, title, or capitalize.
        :returns: Converted string.
        """
        mode = mode.lower()
        if mode == "upper":
            return text.upper()
        elif mode == "lower":
            return text.lower()
        elif mode == "title":
            return text.title()
        elif mode == "capitalize":
            return text.capitalize()
        return text.upper()

    @activity(name="Regex Operation", category="String")
    @tags("string", "regex")
    @output("Result depends on operation type")
    @param(
        "operation",
        type="string",
        options=["match", "find_all", "replace"],
        description="Regex operation to perform",
    )
    def regex_operation(
        self,
        text: str,
        pattern: str,
        operation: str = "match",
        replacement: str = "",
        flags: str = "",
        count: int = 0,
    ) -> list[str] | str | None:
        """Perform a regex operation on a string.

        :param text: String to process.
        :param pattern: Regex pattern.
        :param operation: Operation - match, find_all, replace.
        :param replacement: Replacement string (for replace operation).
        :param flags: Regex flags: 'i' for ignore case, 'm' for multiline, 's' for dotall.
        :param count: Maximum replacements (for replace, 0 for all).
        :returns: Match groups, list of matches, or modified string.
        """
        regex_flags = 0
        if "i" in flags:
            regex_flags |= re.IGNORECASE
        if "m" in flags:
            regex_flags |= re.MULTILINE
        if "s" in flags:
            regex_flags |= re.DOTALL

        operation = operation.lower()

        if operation == "match":
            match = re.search(pattern, text, regex_flags)
            if not match:
                return None
            groups = match.groups()
            if groups:
                return list(groups)
            return [match.group(0)]
        elif operation == "find_all":
            matches = re.findall(pattern, text, regex_flags)
            if matches and isinstance(matches[0], tuple):
                return ["|".join(m) for m in matches]
            return list(matches)
        elif operation == "replace":
            return re.sub(pattern, replacement, text, count=count, flags=regex_flags)

        return None

    @activity(name="Substring", category="String")
    @tags("string", "extract")
    @output("Extracted substring")
    def substring(
        self,
        text: str,
        start: int,
        length: int | None = None,
    ) -> str:
        """Extract a substring.

        :param text: Source string.
        :param start: Start index (0-based, negative for from end).
        :param length: Length to extract (None for rest of string).
        :returns: Extracted substring.
        """
        if length is None:
            return text[start:]
        return text[start : start + length]

    @activity(name="Find Index", category="String")
    @tags("string", "search")
    @output("Index of substring, or -1 if not found")
    @param(
        "direction",
        type="string",
        options=["first", "last"],
        description="Search direction",
    )
    def find_index(
        self,
        text: str,
        substring: str,
        start: int = 0,
        case_sensitive: bool = True,
        direction: str = "first",
    ) -> int:
        """Find the index of a substring.

        :param text: String to search in.
        :param substring: Substring to find.
        :param start: Start index for search (only for first direction).
        :param case_sensitive: Whether search is case-sensitive.
        :param direction: Search direction - first or last occurrence.
        :returns: Index of substring, or -1 if not found.
        """
        if direction.lower() == "last":
            if case_sensitive:
                return text.rfind(substring)
            return text.lower().rfind(substring.lower())
        if case_sensitive:
            return text.find(substring, start)
        return text.lower().find(substring.lower(), start)

    @activity(name="Pad", category="String")
    @tags("string", "pad")
    @output("Padded string")
    @param(
        "direction",
        type="string",
        options=["left", "right"],
        description="Which side to pad",
    )
    def pad(
        self,
        text: str,
        total_length: int,
        pad_char: str = " ",
        direction: str = "left",
    ) -> str:
        """Pad a string to a target length.

        :param text: String to pad.
        :param total_length: Target total length.
        :param pad_char: Character to pad with (default: space).
        :param direction: Pad direction - left or right.
        :returns: Padded string.
        """
        if direction.lower() == "right":
            return text.ljust(total_length, pad_char)
        return text.rjust(total_length, pad_char)

    @activity(name="Repeat String", category="String")
    @tags("string", "repeat")
    @output("Repeated string")
    def repeat(
        self,
        text: str,
        count: int,
    ) -> str:
        """Repeat a string multiple times.

        :param text: String to repeat.
        :param count: Number of repetitions.
        :returns: Repeated string.
        """
        return text * count

    @activity(name="Is Empty", category="String")
    @tags("string", "check")
    @output("True if string is empty")
    def is_empty(
        self,
        text: str,
        trim_whitespace: bool = True,
    ) -> bool:
        """Check if a string is empty.

        :param text: String to check.
        :param trim_whitespace: Whether to trim before checking.
        :returns: True if string is empty.
        """
        if trim_whitespace:
            return text.strip() == ""
        return text == ""

    @activity(name="Reverse String", category="String")
    @tags("string", "transform")
    @output("Reversed string")
    def reverse(
        self,
        text: str,
    ) -> str:
        """Reverse a string.

        :param text: String to reverse.
        :returns: Reversed string.
        """
        return text[::-1]

    @activity(name="Count Occurrences", category="String")
    @tags("string", "count")
    @output("Number of occurrences")
    def count_occurrences(
        self,
        text: str,
        substring: str,
        case_sensitive: bool = True,
    ) -> int:
        """Count occurrences of a substring.

        :param text: String to search in.
        :param substring: Substring to count.
        :param case_sensitive: Whether search is case-sensitive.
        :returns: Number of occurrences.
        """
        if not substring:
            return 0

        if case_sensitive:
            return text.count(substring)
        return text.lower().count(substring.lower())

    @activity(name="Remove Duplicates", category="String")
    @tags("string", "list")
    @output("List with duplicates removed")
    def remove_duplicates(
        self,
        items: list[str],
        case_sensitive: bool = True,
    ) -> list[str]:
        """Remove duplicate strings from a list.

        :param items: List of strings.
        :param case_sensitive: Whether comparison is case-sensitive.
        :returns: List with duplicates removed.
        """
        if case_sensitive:
            seen = set()
            return [x for x in items if not (x in seen or seen.add(x))]
        else:
            seen_lower = set()
            result = []
            for item in items:
                lower = item.lower()
                if lower not in seen_lower:
                    seen_lower.add(lower)
                    result.append(item)
            return result
