"""RPAForge DataFrames Library - Tabular data operations using Polars."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags

logger = logging.getLogger("rpaforge.dataframes")


@library(name="DataFrames", category="Data", icon="🗂️")
class DataFrames:
    """Tabular data operations library powered by Polars."""

    def __init__(self):
        self._frames: dict[str, Any] = {}

    @property
    def _pl(self):
        try:
            import polars as pl

            return pl
        except ImportError as err:
            raise ImportError(
                "polars is required for DataFrames library. "
                "Install it with: pip install rpaforge-libraries[dataframes]"
            ) from err

    def _get_frame(self, name: str) -> Any:
        if name not in self._frames:
            raise KeyError(
                f"DataFrame '{name}' not found. Available: {list(self._frames.keys())}"
            )
        return self._frames[name]

    def _save_frame(self, result_frame: str | None, source: str, df: Any) -> str:
        target = result_frame if result_frame else source
        self._frames[target] = df
        return target

    # ─── Load / Create ───────────────────────────────────────────────────────

    @activity(name="Read CSV", category="DataFrames")
    @tags("csv", "read", "file")
    @output("Name of the loaded DataFrame")
    @param("separator", type="string", description="Column separator character")
    def read_csv(
        self,
        path: str,
        frame_name: str = "df",
        separator: str = ",",
        has_header: bool = True,
    ) -> str:
        """Read a CSV file into a named DataFrame."""
        if not Path(path).exists():
            raise FileNotFoundError(f"CSV file not found: {path}")
        pl = self._pl
        df = pl.read_csv(path, separator=separator, has_header=has_header)
        self._frames[frame_name] = df
        logger.info(
            f"Read CSV '{path}': {df.shape[0]}r x {df.shape[1]}c → '{frame_name}'"
        )
        return frame_name

    @activity(name="Read Excel", category="DataFrames")
    @tags("excel", "read", "file")
    @output("Name of the loaded DataFrame")
    def read_excel(
        self,
        path: str,
        frame_name: str = "df",
        sheet: str | None = None,
    ) -> str:
        """Read an Excel file into a named DataFrame."""
        if not Path(path).exists():
            raise FileNotFoundError(f"Excel file not found: {path}")
        pl = self._pl
        kwargs: dict[str, Any] = {}
        if sheet:
            kwargs["sheet_name"] = sheet
        df = pl.read_excel(path, **kwargs)
        self._frames[frame_name] = df
        logger.info(
            f"Read Excel '{path}': {df.shape[0]}r x {df.shape[1]}c → '{frame_name}'"
        )
        return frame_name

    @activity(name="Read JSON", category="DataFrames")
    @tags("json", "read", "file")
    @output("Name of the loaded DataFrame")
    def read_json(
        self,
        path: str,
        frame_name: str = "df",
    ) -> str:
        """Read a JSON file into a named DataFrame."""
        if not Path(path).exists():
            raise FileNotFoundError(f"JSON file not found: {path}")
        pl = self._pl
        df = pl.read_json(path)
        self._frames[frame_name] = df
        logger.info(
            f"Read JSON '{path}': {df.shape[0]}r x {df.shape[1]}c → '{frame_name}'"
        )
        return frame_name

    @activity(name="From List", category="DataFrames")
    @tags("create", "list")
    @output("Name of the created DataFrame")
    def from_list(
        self,
        data: list,
        frame_name: str = "df",
    ) -> str:
        """Create a DataFrame from a list of dicts."""
        pl = self._pl
        df = pl.DataFrame(data)
        self._frames[frame_name] = df
        logger.info(
            f"Created DataFrame from list: {df.shape[0]}r x {df.shape[1]}c → '{frame_name}'"
        )
        return frame_name

    # ─── Save ────────────────────────────────────────────────────────────────

    @activity(name="Write CSV", category="DataFrames")
    @tags("csv", "write", "file")
    @output("Path where the file was saved")
    @param("separator", type="string", description="Column separator character")
    def write_csv(
        self,
        frame: str,
        path: str,
        separator: str = ",",
    ) -> str:
        """Write a DataFrame to a CSV file."""
        df = self._get_frame(frame)
        df.write_csv(path, separator=separator)
        logger.info(f"Wrote DataFrame '{frame}' to CSV: {path}")
        return path

    @activity(name="Write Excel", category="DataFrames")
    @tags("excel", "write", "file")
    @output("Path where the file was saved")
    def write_excel(
        self,
        frame: str,
        path: str,
        sheet: str = "Sheet1",
    ) -> str:
        """Write a DataFrame to an Excel file."""
        df = self._get_frame(frame)
        df.write_excel(path, worksheet=sheet)
        logger.info(f"Wrote DataFrame '{frame}' to Excel: {path}")
        return path

    @activity(name="Write JSON", category="DataFrames")
    @tags("json", "write", "file")
    @output("Path where the file was saved")
    def write_json(
        self,
        frame: str,
        path: str,
    ) -> str:
        """Write a DataFrame to a JSON file."""
        df = self._get_frame(frame)
        df.write_json(path)
        logger.info(f"Wrote DataFrame '{frame}' to JSON: {path}")
        return path

    # ─── Inspect ─────────────────────────────────────────────────────────────

    @activity(name="Get Shape", category="DataFrames")
    @tags("info", "shape")
    @output("Dict with 'rows' and 'cols' counts")
    def get_shape(self, frame: str) -> dict[str, int]:
        """Return the number of rows and columns in a DataFrame."""
        rows, cols = self._get_frame(frame).shape
        return {"rows": rows, "cols": cols}

    @activity(name="Get Columns", category="DataFrames")
    @tags("info", "columns")
    @output("List of column names")
    def get_columns(self, frame: str) -> list[str]:
        """Return the list of column names."""
        return self._get_frame(frame).columns

    @activity(name="To List", category="DataFrames")
    @tags("convert", "list")
    @output("All rows as a list of dicts")
    def to_list(self, frame: str) -> list[dict[str, Any]]:
        """Convert the entire DataFrame to a list of dicts."""
        return self._get_frame(frame).to_dicts()

    @activity(name="Head", category="DataFrames")
    @tags("preview", "rows")
    @output("First N rows as a list of dicts")
    def head(self, frame: str, n: int = 5) -> list[dict[str, Any]]:
        """Return the first N rows of a DataFrame."""
        return self._get_frame(frame).head(n).to_dicts()

    @activity(name="Tail", category="DataFrames")
    @tags("preview", "rows")
    @output("Last N rows as a list of dicts")
    def tail(self, frame: str, n: int = 5) -> list[dict[str, Any]]:
        """Return the last N rows of a DataFrame."""
        return self._get_frame(frame).tail(n).to_dicts()

    @activity(name="Describe", category="DataFrames")
    @tags("statistics", "info")
    @output("Statistical summary as a list of dicts")
    def describe(self, frame: str) -> list[dict[str, Any]]:
        """Return descriptive statistics for all columns."""
        return self._get_frame(frame).describe().to_dicts()

    # ─── Filter / Select ─────────────────────────────────────────────────────

    @activity(name="Filter Rows", category="DataFrames")
    @tags("filter", "rows", "condition")
    @output("Name of the resulting DataFrame")
    @param(
        "operator",
        type="string",
        description="Comparison operator",
        options=[
            "==",
            "!=",
            ">",
            ">=",
            "<",
            "<=",
            "contains",
            "starts_with",
            "ends_with",
            "is_null",
            "is_not_null",
        ],
    )
    def filter_rows(
        self,
        frame: str,
        column: str,
        operator: str,
        value: str = "",
        result_frame: str | None = None,
    ) -> str:
        """Filter rows by a column condition."""
        pl = self._pl
        df = self._get_frame(frame)
        col = pl.col(column)

        if operator in {">", ">=", "<", "<="}:
            try:
                numeric_value: Any = float(value)
            except (ValueError, TypeError):
                numeric_value = value
            ops = {
                ">": col.__gt__,
                ">=": col.__ge__,
                "<": col.__lt__,
                "<=": col.__le__,
            }
            mask = ops[operator](numeric_value)
        elif operator == "==":
            mask = col == value
        elif operator == "!=":
            mask = col != value
        elif operator == "contains":
            mask = col.str.contains(value)
        elif operator == "starts_with":
            mask = col.str.starts_with(value)
        elif operator == "ends_with":
            mask = col.str.ends_with(value)
        elif operator == "is_null":
            mask = col.is_null()
        elif operator == "is_not_null":
            mask = col.is_not_null()
        else:
            raise ValueError(
                f"Unknown operator '{operator}'. "
                "Use one of: ==, !=, >, >=, <, <=, contains, starts_with, ends_with, is_null, is_not_null"
            )

        result = df.filter(mask)
        target = self._save_frame(result_frame, frame, result)
        logger.info(
            f"Filter '{frame}': {column} {operator} {value!r} → {result.shape[0]} rows → '{target}'"
        )
        return target

    @activity(name="Select Columns", category="DataFrames")
    @tags("select", "columns")
    @output("Name of the resulting DataFrame")
    def select_columns(
        self,
        frame: str,
        columns: list,
        result_frame: str | None = None,
    ) -> str:
        """Keep only the specified columns."""
        df = self._get_frame(frame)
        result = df.select(columns)
        target = self._save_frame(result_frame, frame, result)
        logger.info(f"Selected {columns} from '{frame}' → '{target}'")
        return target

    @activity(name="Drop Columns", category="DataFrames")
    @tags("drop", "columns")
    @output("Name of the resulting DataFrame")
    def drop_columns(
        self,
        frame: str,
        columns: list,
        result_frame: str | None = None,
    ) -> str:
        """Remove the specified columns."""
        df = self._get_frame(frame)
        result = df.drop(columns)
        target = self._save_frame(result_frame, frame, result)
        logger.info(f"Dropped {columns} from '{frame}' → '{target}'")
        return target

    @activity(name="Slice Rows", category="DataFrames")
    @tags("slice", "rows")
    @output("Name of the resulting DataFrame")
    def slice_rows(
        self,
        frame: str,
        start: int,
        length: int | None = None,
        result_frame: str | None = None,
    ) -> str:
        """Return a slice of rows starting at 'start' with optional 'length'."""
        df = self._get_frame(frame)
        result = df.slice(start, length)
        target = self._save_frame(result_frame, frame, result)
        logger.info(f"Sliced '{frame}' offset={start} length={length} → '{target}'")
        return target

    # ─── Transform ────────────────────────────────────────────────────────────

    @activity(name="Sort", category="DataFrames")
    @tags("sort", "order")
    @output("Name of the resulting DataFrame")
    def sort(
        self,
        frame: str,
        by: list,
        descending: bool = False,
        result_frame: str | None = None,
    ) -> str:
        """Sort a DataFrame by one or more columns."""
        df = self._get_frame(frame)
        result = df.sort(by, descending=descending)
        target = self._save_frame(result_frame, frame, result)
        logger.info(f"Sorted '{frame}' by {by} descending={descending} → '{target}'")
        return target

    @activity(name="Rename Column", category="DataFrames")
    @tags("rename", "column")
    @output("Name of the resulting DataFrame")
    def rename_column(
        self,
        frame: str,
        old_name: str,
        new_name: str,
        result_frame: str | None = None,
    ) -> str:
        """Rename a single column."""
        df = self._get_frame(frame)
        result = df.rename({old_name: new_name})
        target = self._save_frame(result_frame, frame, result)
        logger.info(f"Renamed '{old_name}' → '{new_name}' in '{frame}' → '{target}'")
        return target

    @activity(name="Drop Nulls", category="DataFrames")
    @tags("null", "clean")
    @output("Name of the resulting DataFrame")
    def drop_nulls(
        self,
        frame: str,
        subset: list | None = None,
        result_frame: str | None = None,
    ) -> str:
        """Remove rows that contain null values."""
        df = self._get_frame(frame)
        result = df.drop_nulls(subset=subset)
        target = self._save_frame(result_frame, frame, result)
        logger.info(f"Dropped nulls from '{frame}' (subset={subset}) → '{target}'")
        return target

    @activity(name="Fill Nulls", category="DataFrames")
    @tags("null", "fill")
    @output("Name of the resulting DataFrame")
    def fill_nulls(
        self,
        frame: str,
        value: Any,
        column: str | None = None,
        result_frame: str | None = None,
    ) -> str:
        """Replace null values with the given value."""
        pl = self._pl
        df = self._get_frame(frame)
        if column:
            result = df.with_columns(pl.col(column).fill_null(value))
        else:
            result = df.fill_null(value)
        target = self._save_frame(result_frame, frame, result)
        logger.info(
            f"Filled nulls in '{frame}' column={column} with {value!r} → '{target}'"
        )
        return target

    # ─── Aggregate ───────────────────────────────────────────────────────────

    _AGG_FUNCTIONS = ["sum", "mean", "min", "max", "count", "std", "first", "last"]

    @activity(name="Aggregate", category="DataFrames")
    @tags("aggregate", "statistics")
    @output("Scalar aggregation result")
    @param(
        "function",
        type="string",
        description="Aggregation function",
        options=["sum", "mean", "min", "max", "count", "std", "first", "last"],
    )
    def aggregate(
        self,
        frame: str,
        column: str,
        function: str = "sum",
    ) -> Any:
        """Compute a single aggregation over a column."""
        pl = self._pl
        df = self._get_frame(frame)
        col = pl.col(column)
        agg_map = {
            "sum": col.sum(),
            "mean": col.mean(),
            "min": col.min(),
            "max": col.max(),
            "count": col.count(),
            "std": col.std(),
            "first": col.first(),
            "last": col.last(),
        }
        if function not in agg_map:
            raise ValueError(
                f"Unknown function '{function}'. Use: {self._AGG_FUNCTIONS}"
            )
        result = df.select(agg_map[function]).item()
        logger.info(f"{function}('{column}') on '{frame}' = {result}")
        return result

    @activity(name="Group By", category="DataFrames")
    @tags("group", "aggregate")
    @output("Name of the resulting DataFrame")
    @param(
        "agg_function",
        type="string",
        description="Aggregation function",
        options=["sum", "mean", "min", "max", "count", "std", "first", "last"],
    )
    def group_by(
        self,
        frame: str,
        by: list,
        agg_column: str,
        agg_function: str = "sum",
        result_frame: str | None = None,
    ) -> str:
        """Group by columns and aggregate another column."""
        pl = self._pl
        df = self._get_frame(frame)
        col = pl.col(agg_column)
        agg_map = {
            "sum": col.sum(),
            "mean": col.mean(),
            "min": col.min(),
            "max": col.max(),
            "count": col.count(),
            "std": col.std(),
            "first": col.first(),
            "last": col.last(),
        }
        if agg_function not in agg_map:
            raise ValueError(
                f"Unknown function '{agg_function}'. Use: {self._AGG_FUNCTIONS}"
            )
        result = df.group_by(by).agg(agg_map[agg_function])
        target = self._save_frame(result_frame, frame, result)
        logger.info(
            f"group_by {by}, {agg_function}('{agg_column}') on '{frame}' → '{target}'"
        )
        return target

    # ─── Combine ─────────────────────────────────────────────────────────────

    @activity(name="Join", category="DataFrames")
    @tags("join", "merge")
    @output("Name of the resulting DataFrame")
    @param(
        "how",
        type="string",
        description="Join type",
        options=["inner", "left", "full", "cross", "semi", "anti"],
    )
    def join(
        self,
        left_frame: str,
        right_frame: str,
        on: list,
        how: str = "inner",
        result_frame: str | None = None,
    ) -> str:
        """Join two DataFrames on common columns."""
        left = self._get_frame(left_frame)
        right = self._get_frame(right_frame)
        result = left.join(right, on=on, how=how)
        target = result_frame if result_frame else f"{left_frame}_joined"
        self._frames[target] = result
        logger.info(
            f"Joined '{left_frame}' + '{right_frame}' on {on} ({how}) → '{target}'"
        )
        return target

    @activity(name="Concat", category="DataFrames")
    @tags("concat", "append")
    @output("Name of the resulting DataFrame")
    def concat(
        self,
        frames: list,
        result_frame: str | None = None,
    ) -> str:
        """Concatenate multiple DataFrames vertically."""
        pl = self._pl
        dfs = [self._get_frame(name) for name in frames]
        result = pl.concat(dfs)
        target = result_frame if result_frame else frames[0]
        self._frames[target] = result
        logger.info(f"Concatenated {frames} → '{target}'")
        return target

    # ─── Manage ──────────────────────────────────────────────────────────────

    @activity(name="List Frames", category="DataFrames")
    @tags("info", "list")
    @output("List of names of all loaded DataFrames")
    def list_frames(self) -> list[str]:
        """Return the names of all DataFrames currently in memory."""
        return list(self._frames.keys())

    @activity(name="Drop Frame", category="DataFrames")
    @tags("drop", "delete")
    def drop_frame(self, frame: str) -> None:
        """Remove a DataFrame from memory."""
        self._frames.pop(frame, None)
        logger.info(f"Dropped frame '{frame}'")

    @activity(name="Copy Frame", category="DataFrames")
    @tags("copy", "clone")
    @output("Name of the copied DataFrame")
    def copy_frame(self, frame: str, new_name: str) -> str:
        """Create a copy of a DataFrame under a new name."""
        df = self._get_frame(frame)
        self._frames[new_name] = df.clone()
        logger.info(f"Copied '{frame}' → '{new_name}'")
        return new_name
