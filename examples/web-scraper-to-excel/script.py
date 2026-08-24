"""Web Scraper to Excel — end-to-end RPAForge example (issues #729, #751).

Opens a demo HTML table in a headless Chromium browser via the WebUI
library, extracts it structurally with the ``Extract Table`` activity,
stores it as a Polars DataFrame through the DataFrames library, and
writes an Excel workbook.

Run from the repository root:

    python examples/web-scraper-to-excel/script.py

The workbook is written to ``examples/web-scraper-to-excel/output/customers.xlsx``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from rpaforge_libraries.DataFrames.library import DataFrames
from rpaforge_libraries.WebUI.library import WebUI

TARGET_URL = "https://www.w3schools.com/html/html_tables.asp"
TABLE_SELECTOR = "#customers"
HEADERS = ("Company", "Contact", "Country")
FRAME_NAME = "customers"
OUTPUT_PATH = Path(__file__).resolve().parent / "output" / "customers.xlsx"


def scrape_table(webui: WebUI) -> list[dict[str, str]]:
    """Open the target page headlessly and extract the table rows."""
    try:
        webui.open_browser(url=TARGET_URL, headless=True)
        webui.wait_for_page_load()
        rows = webui.extract_table(TABLE_SELECTOR)
    finally:
        webui.close_browser(all=True)

    if not rows:
        raise RuntimeError(f"No data extracted from table '{TABLE_SELECTOR}'")
    if tuple(rows[0]) != HEADERS:
        raise ValueError(f"Unexpected table headers: {list(rows[0])}")
    return rows


def save_rows_to_excel(frames: DataFrames, rows: list[dict[str, str]]) -> str:
    """Store rows in a named DataFrame and write them to an Excel file."""
    frames.from_list(rows, frame_name=FRAME_NAME)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    return frames.write_excel(FRAME_NAME, str(OUTPUT_PATH), sheet="Customers")


def main() -> int:
    """Run the scrape-to-Excel workflow."""
    webui = WebUI()
    frames = DataFrames()
    print(f"Opening {TARGET_URL}")
    rows: list[dict[str, str]] = scrape_table(webui)
    saved = save_rows_to_excel(frames, rows)
    print(f"Saved {len(rows)} rows to {saved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
