"""Excel Report Generator - zero-environment tabular reporting example (issue #755).

Demonstrates tabular aggregation and Excel reporting using Polars & openpyxl:

    DataFrames.Read CSV  ->  DataFrames.Group By(category, sum revenue)
        ->  DataFrames.Sort(descending)  ->  DataFrames.Write Excel

No browser, no LLM required - runs 100% offline.

Run from the repository root:

    python examples/excel-report/script.py

The workbook is written to ``examples/excel-report/output/report.xlsx``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from rpaforge_libraries.DataFrames.library import DataFrames

SAMPLE_CSV = Path(__file__).resolve().parent / "sample" / "sales_data.csv"
OUTPUT_PATH = Path(__file__).resolve().parent / "output" / "report.xlsx"
RAW_FRAME = "raw_sales"
SUMMARY_FRAME = "category_summary"


def generate_report(csv_path: Path, output_path: Path) -> str:
    """Read sales CSV, aggregate by category, sort by revenue, and write Excel."""
    df = DataFrames()
    # 1. Read CSV
    df.read_csv(str(csv_path), frame_name=RAW_FRAME)

    # 2. Group by category and compute total revenue
    df.group_by(
        frame=RAW_FRAME,
        by=["category"],
        agg_column="revenue",
        agg_function="sum",
        result_frame=SUMMARY_FRAME,
    )

    # 3. Sort by revenue descending
    df.sort(
        frame=SUMMARY_FRAME,
        by=["revenue"],
        descending=True,
    )

    # 4. Write Excel workbook
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return df.write_excel(
        frame=SUMMARY_FRAME,
        path=str(output_path),
        sheet="Category Summary",
    )


def main() -> int:
    """Run the Excel report generation workflow."""
    print(f"Reading sales data from {SAMPLE_CSV}")
    saved = generate_report(SAMPLE_CSV, OUTPUT_PATH)
    print(f"Report successfully saved to {saved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
