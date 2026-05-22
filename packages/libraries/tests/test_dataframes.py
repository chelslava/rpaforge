"""Tests for RPAForge DataFrames Library."""

import pytest

pytest.importorskip("polars", reason="polars is required for DataFrames library")

import polars.exceptions as polars_exc  # noqa: E402

from rpaforge_libraries.DataFrames import DataFrames  # noqa: E402


class TestDataFramesLibrary:
    """Tests for DataFrames library."""

    def setup_method(self):
        self.lib = DataFrames()
        # Seed a simple frame used by most tests
        self.lib.from_list(
            [
                {"name": "Alice", "age": 30, "score": 90.0},
                {"name": "Bob", "age": 25, "score": 75.0},
                {"name": "Carol", "age": 35, "score": 85.0},
                {"name": "Dave", "age": 25, "score": None},
            ],
            frame_name="people",
        )

    # ─── Load / Create ───────────────────────────────────────────────────────

    def test_from_list_returns_frame_name(self):
        name = self.lib.from_list([{"x": 1}, {"x": 2}], frame_name="tmp")
        assert name == "tmp"

    def test_from_list_stores_frame(self):
        self.lib.from_list([{"a": 1, "b": 2}], frame_name="t")
        assert "t" in self.lib.list_frames()

    def test_read_csv(self, tmp_path):
        csv_file = tmp_path / "data.csv"
        csv_file.write_text("x,y\n1,2\n3,4\n")
        name = self.lib.read_csv(str(csv_file), frame_name="csv_df")
        assert name == "csv_df"
        assert self.lib.get_shape("csv_df") == {"rows": 2, "cols": 2}

    def test_read_json(self, tmp_path):
        import json

        json_file = tmp_path / "data.json"
        json_file.write_text(json.dumps([{"a": 1}, {"a": 2}]))
        name = self.lib.read_json(str(json_file), frame_name="jdf")
        assert name == "jdf"
        assert self.lib.get_shape("jdf")["rows"] == 2

    def test_write_and_read_csv_roundtrip(self, tmp_path):
        path = str(tmp_path / "out.csv")
        self.lib.write_csv("people", path)
        name = self.lib.read_csv(path, frame_name="loaded")
        rows = self.lib.get_shape(name)["rows"]
        assert rows == 4

    def test_write_and_read_json_roundtrip(self, tmp_path):
        path = str(tmp_path / "out.json")
        # drop_nulls first so JSON serialises cleanly
        self.lib.drop_nulls("people", result_frame="people_clean")
        self.lib.write_json("people_clean", path)
        name = self.lib.read_json(path, frame_name="loaded_json")
        assert self.lib.get_shape(name)["rows"] == 3

    # ─── Inspect ─────────────────────────────────────────────────────────────

    def test_get_shape(self):
        assert self.lib.get_shape("people") == {"rows": 4, "cols": 3}

    def test_get_columns(self):
        assert set(self.lib.get_columns("people")) == {"name", "age", "score"}

    def test_to_list(self):
        rows = self.lib.to_list("people")
        assert len(rows) == 4
        assert rows[0]["name"] == "Alice"

    def test_head(self):
        rows = self.lib.head("people", n=2)
        assert len(rows) == 2
        assert rows[0]["name"] == "Alice"

    def test_tail(self):
        rows = self.lib.tail("people", n=2)
        assert len(rows) == 2
        assert rows[-1]["name"] == "Dave"

    def test_describe_returns_list_of_dicts(self):
        stats = self.lib.describe("people")
        assert isinstance(stats, list)
        assert all(isinstance(r, dict) for r in stats)

    def test_missing_frame_raises(self):
        with pytest.raises(KeyError, match="no_such"):
            self.lib.get_shape("no_such")

    # ─── Filter / Select ─────────────────────────────────────────────────────

    def test_filter_rows_equals(self):
        target = self.lib.filter_rows("people", "name", "==", "Alice", result_frame="r")
        rows = self.lib.to_list(target)
        assert len(rows) == 1
        assert rows[0]["name"] == "Alice"

    def test_filter_rows_not_equals(self):
        target = self.lib.filter_rows("people", "name", "!=", "Alice", result_frame="r")
        assert self.lib.get_shape(target)["rows"] == 3

    def test_filter_rows_gt(self):
        target = self.lib.filter_rows("people", "age", ">", "27", result_frame="r")
        rows = self.lib.to_list(target)
        assert all(r["age"] > 27 for r in rows)

    def test_filter_rows_contains(self):
        target = self.lib.filter_rows(
            "people", "name", "contains", "a", result_frame="r"
        )
        names = [r["name"] for r in self.lib.to_list(target)]
        assert "Carol" in names
        assert "Dave" in names

    def test_filter_rows_starts_with(self):
        target = self.lib.filter_rows(
            "people", "name", "starts_with", "A", result_frame="r"
        )
        rows = self.lib.to_list(target)
        assert rows[0]["name"] == "Alice"

    def test_filter_rows_is_null(self):
        target = self.lib.filter_rows("people", "score", "is_null", result_frame="r")
        assert self.lib.get_shape(target)["rows"] == 1

    def test_filter_rows_is_not_null(self):
        target = self.lib.filter_rows(
            "people", "score", "is_not_null", result_frame="r"
        )
        assert self.lib.get_shape(target)["rows"] == 3

    def test_filter_rows_unknown_operator(self):
        with pytest.raises(ValueError, match="Unknown operator"):
            self.lib.filter_rows("people", "name", "LIKE", "A")

    def test_filter_rows_overwrites_source_when_no_result_frame(self):
        self.lib.from_list([{"v": 1}, {"v": 2}, {"v": 3}], frame_name="nums")
        self.lib.filter_rows("nums", "v", ">", "1")
        assert self.lib.get_shape("nums")["rows"] == 2

    def test_select_columns(self):
        target = self.lib.select_columns("people", ["name", "age"], result_frame="slim")
        assert self.lib.get_columns(target) == ["name", "age"]

    def test_drop_columns(self):
        target = self.lib.drop_columns("people", ["score"], result_frame="no_score")
        assert "score" not in self.lib.get_columns(target)

    def test_slice_rows(self):
        target = self.lib.slice_rows("people", start=1, length=2, result_frame="sliced")
        assert self.lib.get_shape(target)["rows"] == 2

    # ─── Transform ────────────────────────────────────────────────────────────

    def test_sort_ascending(self):
        target = self.lib.sort("people", by=["age"], result_frame="sorted")
        rows = self.lib.to_list(target)
        ages = [r["age"] for r in rows]
        assert ages == sorted(ages)

    def test_sort_descending(self):
        target = self.lib.sort(
            "people", by=["age"], descending=True, result_frame="sorted"
        )
        rows = self.lib.to_list(target)
        ages = [r["age"] for r in rows]
        assert ages == sorted(ages, reverse=True)

    def test_rename_column(self):
        target = self.lib.rename_column(
            "people", "age", "years", result_frame="renamed"
        )
        cols = self.lib.get_columns(target)
        assert "years" in cols
        assert "age" not in cols

    def test_drop_nulls(self):
        target = self.lib.drop_nulls("people", result_frame="clean")
        assert self.lib.get_shape(target)["rows"] == 3

    def test_drop_nulls_subset(self):
        target = self.lib.drop_nulls("people", subset=["score"], result_frame="clean")
        assert self.lib.get_shape(target)["rows"] == 3

    def test_fill_nulls_all(self):
        target = self.lib.fill_nulls("people", 0.0, result_frame="filled")
        rows = self.lib.to_list(target)
        dave = next(r for r in rows if r["name"] == "Dave")
        assert dave["score"] == 0.0

    def test_fill_nulls_column(self):
        target = self.lib.fill_nulls(
            "people", -1.0, column="score", result_frame="filled"
        )
        rows = self.lib.to_list(target)
        dave = next(r for r in rows if r["name"] == "Dave")
        assert dave["score"] == -1.0

    # ─── Aggregate ───────────────────────────────────────────────────────────

    def test_aggregate_sum(self):
        result = self.lib.aggregate("people", "age", "sum")
        assert result == 115  # 30 + 25 + 35 + 25

    def test_aggregate_mean(self):
        result = self.lib.aggregate("people", "age", "mean")
        assert result == pytest.approx(28.75)

    def test_aggregate_count(self):
        result = self.lib.aggregate("people", "name", "count")
        assert result == 4

    def test_aggregate_min(self):
        assert self.lib.aggregate("people", "age", "min") == 25

    def test_aggregate_max(self):
        assert self.lib.aggregate("people", "age", "max") == 35

    def test_aggregate_unknown_function(self):
        with pytest.raises(ValueError, match="Unknown function"):
            self.lib.aggregate("people", "age", "median")

    def test_group_by(self):
        target = self.lib.group_by(
            "people",
            by=["age"],
            agg_column="name",
            agg_function="count",
            result_frame="grouped",
        )
        rows = self.lib.to_list(target)
        age_25_row = next(r for r in rows if r["age"] == 25)
        assert age_25_row["name"] == 2

    def test_group_by_sum(self):
        target = self.lib.group_by(
            "people",
            by=["age"],
            agg_column="score",
            agg_function="sum",
            result_frame="grouped",
        )
        assert target == "grouped"
        assert self.lib.get_shape(target)["cols"] == 2

    # ─── Combine ─────────────────────────────────────────────────────────────

    def test_join_inner(self):
        self.lib.from_list(
            [{"name": "Alice", "dept": "Eng"}, {"name": "Zara", "dept": "HR"}],
            frame_name="depts",
        )
        target = self.lib.join(
            "people", "depts", on=["name"], how="inner", result_frame="joined"
        )
        rows = self.lib.to_list(target)
        assert len(rows) == 1
        assert rows[0]["dept"] == "Eng"

    def test_join_left(self):
        self.lib.from_list([{"name": "Alice", "dept": "Eng"}], frame_name="depts")
        target = self.lib.join(
            "people", "depts", on=["name"], how="left", result_frame="joined"
        )
        assert self.lib.get_shape(target)["rows"] == 4

    def test_concat(self):
        self.lib.from_list(
            [{"name": "Eve", "age": 28, "score": 88.0}], frame_name="extra"
        )
        target = self.lib.concat(["people", "extra"], result_frame="all_people")
        assert self.lib.get_shape(target)["rows"] == 5

    # ─── Manage ──────────────────────────────────────────────────────────────

    def test_list_frames(self):
        assert "people" in self.lib.list_frames()

    def test_drop_frame(self):
        self.lib.from_list([{"x": 1}], frame_name="tmp")
        self.lib.drop_frame("tmp")
        assert "tmp" not in self.lib.list_frames()

    def test_drop_frame_nonexistent_is_noop(self):
        self.lib.drop_frame("ghost")  # should not raise

    def test_copy_frame(self):
        new_name = self.lib.copy_frame("people", "people_copy")
        assert new_name == "people_copy"
        assert self.lib.get_shape("people_copy") == self.lib.get_shape("people")

    def test_copy_frame_is_independent(self):
        self.lib.copy_frame("people", "people_copy")
        # Mutate the copy; original must be untouched
        self.lib.filter_rows("people_copy", "name", "==", "Alice")
        assert self.lib.get_shape("people")["rows"] == 4

    # ─── Decorator checks ────────────────────────────────────────────────────

    def test_library_is_decorated(self):
        assert hasattr(DataFrames, "_library_meta")
        assert DataFrames._library_name == "DataFrames"

    # ─── Edge cases: empty DataFrame ─────────────────────────────────────────

    def test_from_empty_list_creates_empty_frame(self):
        name = self.lib.from_list([], frame_name="empty")
        assert name == "empty"
        assert self.lib.get_shape("empty") == {"rows": 0, "cols": 0}

    def test_to_list_on_empty_frame_returns_empty_list(self):
        self.lib.from_list([], frame_name="empty")
        result = self.lib.to_list("empty")
        assert result == []

    def test_head_on_empty_frame_returns_empty_list(self):
        self.lib.from_list([], frame_name="empty")
        assert self.lib.head("empty", n=5) == []

    def test_tail_on_empty_frame_returns_empty_list(self):
        self.lib.from_list([], frame_name="empty")
        assert self.lib.tail("empty", n=5) == []

    def test_drop_nulls_on_empty_frame_stays_empty(self):
        self.lib.from_list([], frame_name="empty")
        target = self.lib.drop_nulls("empty", result_frame="clean")
        assert self.lib.get_shape(target)["rows"] == 0

    def test_filter_on_empty_frame_returns_empty(self):
        self.lib.from_list([{"v": 1}], frame_name="one")
        self.lib.filter_rows("one", "v", ">", "999", result_frame="none")
        assert self.lib.get_shape("none")["rows"] == 0

    def test_concat_empty_frames(self):
        self.lib.from_list([], frame_name="e1")
        self.lib.from_list([], frame_name="e2")
        target = self.lib.concat(["e1", "e2"], result_frame="merged")
        assert self.lib.get_shape(target)["rows"] == 0

    # ─── Edge cases: missing file ─────────────────────────────────────────────

    def test_read_csv_nonexistent_file_raises(self):
        with pytest.raises((FileNotFoundError, OSError)):
            self.lib.read_csv("/nonexistent/path/data.csv")

    def test_read_json_nonexistent_file_raises(self):
        with pytest.raises((FileNotFoundError, OSError)):
            self.lib.read_json("/nonexistent/path/data.json")

    # ─── Edge cases: CSV separator ───────────────────────────────────────────

    def test_read_csv_semicolon_separator(self, tmp_path):
        csv_file = tmp_path / "data.csv"
        csv_file.write_text("a;b\n1;2\n3;4\n")
        name = self.lib.read_csv(str(csv_file), frame_name="semi", separator=";")
        assert self.lib.get_shape(name) == {"rows": 2, "cols": 2}

    def test_write_csv_semicolon_separator(self, tmp_path):
        path = str(tmp_path / "out.csv")
        self.lib.drop_nulls("people", result_frame="clean")
        self.lib.write_csv("clean", path, separator=";")
        # Re-read with correct separator to verify
        name = self.lib.read_csv(path, frame_name="reloaded", separator=";")
        assert self.lib.get_shape(name)["cols"] == 3

    # ─── Edge cases: invalid column references ────────────────────────────────

    def test_filter_rows_nonexistent_column_raises(self):
        with pytest.raises(polars_exc.ColumnNotFoundError):
            self.lib.filter_rows("people", "nonexistent_col", "==", "x")

    def test_select_nonexistent_column_raises(self):
        with pytest.raises(polars_exc.ColumnNotFoundError):
            self.lib.select_columns("people", ["nonexistent_col"])

    def test_aggregate_nonexistent_column_raises(self):
        with pytest.raises(polars_exc.ColumnNotFoundError):
            self.lib.aggregate("people", "nonexistent_col", "sum")

    # ─── Edge cases: frame management ────────────────────────────────────────

    def test_get_frame_nonexistent_raises_key_error(self):
        with pytest.raises(KeyError, match="ghost"):
            self.lib.get_shape("ghost")

    def test_write_csv_nonexistent_frame_raises(self, tmp_path):
        with pytest.raises(KeyError):
            self.lib.write_csv("ghost_frame", str(tmp_path / "out.csv"))

    def test_join_nonexistent_right_frame_raises(self):
        with pytest.raises(KeyError):
            self.lib.join("people", "ghost_frame", on=["name"])

    # ─── Edge cases: slice and sort ──────────────────────────────────────────

    def test_slice_beyond_length_returns_remaining_rows(self):
        target = self.lib.slice_rows("people", start=2, length=100, result_frame="s")
        assert self.lib.get_shape(target)["rows"] == 2

    def test_slice_start_at_zero(self):
        target = self.lib.slice_rows("people", start=0, length=2, result_frame="s")
        assert self.lib.get_shape(target)["rows"] == 2

    def test_sort_by_multiple_columns(self):
        target = self.lib.sort("people", by=["age", "name"], result_frame="sorted")
        rows = self.lib.to_list(target)
        assert len(rows) == 4
