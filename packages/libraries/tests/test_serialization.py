"""Tests for the Serialization library (issue #821)."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from rpaforge_libraries.Serialization.library import (
    Serialization,
    SerializationError,
    _validate_zip_member,
)


@pytest.fixture()
def lib() -> Serialization:
    return Serialization()


class TestJsonActivities:
    """Read/Write JSON and dot-path access."""

    def test_write_and_read_round_trip(self, lib: Serialization, tmp_path: Path):
        target = tmp_path / "data" / "out.json"
        written = lib.write_json(str(target), {"a": 1, "b": ["x"]})
        assert Path(written).is_file()
        assert lib.read_json(written) == {"a": 1, "b": ["x"]}

    def test_read_missing_file_raises(self, lib: Serialization, tmp_path: Path):
        with pytest.raises(SerializationError, match="not found"):
            lib.read_json(str(tmp_path / "nope.json"))

    def test_read_invalid_json_raises(self, lib: Serialization, tmp_path: Path):
        bad = tmp_path / "bad.json"
        bad.write_text("{broken", encoding="utf-8")
        with pytest.raises(SerializationError, match="Failed to read"):
            lib.read_json(str(bad))

    def test_get_json_value_walks_lists(self, lib: Serialization):
        data = {"users": [{"email": "a@x.io"}, {"email": "b@x.io"}]}
        assert lib.get_json_value(data, "users.1.email") == "b@x.io"

    def test_get_json_value_default_on_missing(self, lib: Serialization):
        assert lib.get_json_value({"a": 1}, "b.c", default="fallback") == "fallback"

    def test_set_json_value_does_not_mutate_input(self, lib: Serialization):
        data = {"a": {"b": 1}}
        result = lib.set_json_value(data, "a.b", 2)
        assert result["a"]["b"] == 2
        assert data["a"]["b"] == 1  # input untouched

    def test_set_json_value_creates_intermediate_keys(self, lib: Serialization):
        result = lib.set_json_value({}, "x.y.z", "v")
        assert result == {"x": {"y": {"z": "v"}}}

    def test_set_json_value_list_index_out_of_range_raises(self, lib: Serialization):
        with pytest.raises(SerializationError, match="Failed to set"):
            lib.set_json_value({"items": []}, "items.0", 1)


class TestXmlActivities:
    """XML parsing/serialization with the @attr/#text convention."""

    def test_xml_round_trip(self, lib: Serialization, tmp_path: Path):
        source = tmp_path / "doc.xml"
        source.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<order id="42"><item>widget</item>'
            '<item>gadget</item><total currency="EUR">9.9</total></order>',
            encoding="utf-8",
        )
        doc = lib.xml_to_dict(str(source))
        assert doc["order"]["@id"] == "42"
        assert doc["order"]["item"] == ["widget", "gadget"]
        assert doc["order"]["total"] == {"@currency": "EUR", "#text": "9.9"}

        out = tmp_path / "roundtrip.xml"
        lib.dict_to_xml(doc, str(out))
        reloaded = lib.xml_to_dict(str(out))
        assert reloaded == doc

    def test_xml_to_dict_invalid_xml_raises(self, lib: Serialization, tmp_path: Path):
        bad = tmp_path / "bad.xml"
        bad.write_text("<a><b></a>", encoding="utf-8")
        with pytest.raises(SerializationError, match="Invalid XML"):
            lib.xml_to_dict(str(bad))

    def test_dict_to_xml_requires_single_root(self, lib: Serialization, tmp_path: Path):
        with pytest.raises(SerializationError, match="root key"):
            lib.dict_to_xml({"a": 1, "b": 2}, str(tmp_path / "out.xml"))


class TestCsvActivity:
    """CSV writing."""

    def test_write_csv_with_headers_and_quoting(
        self, lib: Serialization, tmp_path: Path
    ):
        target = tmp_path / "out.csv"
        lib.write_csv(
            str(target),
            [
                {"name": 'Ana "The" Costa', "amount": 3},
                {"name": "Bo", "amount": 4},
            ],
        )
        lines = target.read_text(encoding="utf-8").strip().splitlines()
        assert lines[0] == "name,amount"
        assert any("Bo,4" in line for line in lines)
        assert any('"Ana ""The"" Costa",3' in line for line in lines)

    def test_write_csv_custom_delimiter(self, lib: Serialization, tmp_path: Path):
        target = tmp_path / "out.csv"
        lib.write_csv(str(target), [{"a": 1, "b": 2}], delimiter=";")
        assert target.read_text(encoding="utf-8").strip().splitlines()[0] == "a;b"

    def test_write_csv_empty_rows_raises(self, lib: Serialization, tmp_path: Path):
        with pytest.raises(SerializationError, match="at least one row"):
            lib.write_csv(str(tmp_path / "out.csv"), [])


class TestZipActivities:
    """Archive creation and hardened extraction."""

    def test_zip_and_unzip_round_trip(self, lib: Serialization, tmp_path: Path):
        work = tmp_path / "work"
        work.mkdir()
        (work / "one.txt").write_text("first", encoding="utf-8")
        (work / "two.txt").write_text("second", encoding="utf-8")

        archive = tmp_path / "bundle.zip"
        lib.zip_files([str(work / "one.txt"), str(work / "two.txt")], str(archive))

        dest = tmp_path / "extracted"
        lib.unzip_archive(str(archive), str(dest))
        assert (dest / "one.txt").read_text(encoding="utf-8") == "first"
        assert (dest / "two.txt").read_text(encoding="utf-8") == "second"

    def test_zip_missing_file_raises(self, lib: Serialization, tmp_path: Path):
        with pytest.raises(SerializationError, match="not found"):
            lib.zip_files([str(tmp_path / "ghost.txt")], str(tmp_path / "a.zip"))

    @pytest.mark.parametrize(
        "member",
        [
            "/etc/passwd",  # absolute posix
            "C:\\Windows\\system32\\evil.dll",  # drive letter
            "../outside.txt",  # posix traversal
            "..\\outside.txt",  # backslash traversal
            "nested/../../outside.txt",  # nested traversal
        ],
    )
    def test_unzip_rejects_unsafe_member_paths(
        self, lib: Serialization, tmp_path: Path, member: str
    ):
        archive = tmp_path / "evil.zip"
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr(member, "malicious")
        with pytest.raises(SerializationError, match="unsafe member path"):
            lib.unzip_archive(str(archive), str(tmp_path / "dest"))
        # Nothing extracted before the rejection.
        assert not (tmp_path / "dest").exists() or not any(
            (tmp_path / "dest").iterdir()
        )

    def test_unzip_rejects_mixed_safe_and_unsafe(
        self, lib: Serialization, tmp_path: Path
    ):
        """A single poisoned member rejects the whole archive (fail-closed)."""
        archive = tmp_path / "mixed.zip"
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr("safe.txt", "fine")
            zf.writestr("evil/../../../outside.txt", "bad")
        with pytest.raises(SerializationError, match="unsafe member path"):
            lib.unzip_archive(str(archive), str(tmp_path / "dest"))


class TestValidateZipMember:
    """Unit coverage for the member-path normalizer."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("docs/readme.txt", "docs/readme.txt"),
            ("a\\b.txt", "a/b.txt"),  # backslashes normalized
            ("./x.txt", "x.txt"),
        ],
    )
    def test_safe_members_normalized(self, raw, expected):
        assert _validate_zip_member(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        ["/abs.txt", "C:/abs.txt", "..", "a/../..", "dir/.."],
    )
    def test_unsafe_members_rejected(self, raw):
        assert _validate_zip_member(raw) is None


class TestRegistration:
    """The library exposes all nine activities."""

    ACTIVITY_METHODS = (
        "read_json",
        "write_json",
        "get_json_value",
        "set_json_value",
        "xml_to_dict",
        "dict_to_xml",
        "write_csv",
        "zip_files",
        "unzip_archive",
    )

    def test_all_activity_methods_exist(self, lib: Serialization):
        for method in self.ACTIVITY_METHODS:
            assert callable(getattr(lib, method)), method

    def test_en_locale_file_valid(self):
        locale_path = (
            Path(__file__).parents[2]
            / "studio"
            / "public"
            / "locales"
            / "en"
            / "serialization.json"
        )
        doc = json.loads(locale_path.read_text(encoding="utf-8"))
        assert doc["library"] == "Serialization"
        assert set(doc["activities"].keys()) == set(self.ACTIVITY_METHODS)
