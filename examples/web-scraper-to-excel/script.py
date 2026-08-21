"""Web Scraper to Excel — end-to-end RPAForge example (issue #729).

Opens a demo HTML table in a headless Chromium browser via the WebUI
library, extracts its text, parses it into rows, stores it as a Polars
DataFrame through the DataFrames library, and writes an Excel workbook.

Run from the repository root:

    python examples/web-scraper-to-excel/script.py

The workbook is written to ``examples/web-scraper-to-excel/output/customers.xlsx``.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from rpaforge_libraries.DataFrames.library import DataFrames
from rpaforge_libraries.WebUI.library import WebUI

TARGET_URL = "https://www.w3schools.com/html/html_tables.asp"
TABLE_SELECTOR = "#customers"
HEADERS = ("Company", "Contact", "Country")
FRAME_NAME = "customers"
OUTPUT_PATH = Path(__file__).resolve().parent / "output" / "customers.xlsx"


def parse_table_text(raw: str, width: int) -> list[list[str]]:
    """Parse raw table text into a grid of *width*-column rows.

    The WebUI ``Get Element Text`` activity returns Playwright's
    ``text_content``: the table's text nodes flattened line by line,
    one cell per non-empty line for pages whose markup puts each cell
    on its own source line (the layout used by the demo page).
    """
    cells = [line.strip() for line in raw.splitlines() if line.strip()]
    if not cells:
        return []
    if len(cells) % width != 0:
        raise ValueError(
            f"Expected cell count divisible by {width} columns, got {len(cells)}"
        )
    return [cells[i : i + width] for i in range(0, len(cells), width)]


def scrape_table(webui: WebUI) -> list[dict[str, str]]:
    """Open the target page headlessly and extract the table rows."""
    try:
        webui.open_browser(url=TARGET_URL, headless=True)
        webui.wait_for_page_load()
        raw = webui.get_element_text(TABLE_SELECTOR)
    finally:
        webui.close_browser(all=True)

    grid = parse_table_text(raw, width=len(HEADERS))
    if not grid:
        raise RuntimeError(f"No data extracted from table '{TABLE_SELECTOR}'")
    header_row, body = grid[0], grid[1:]
    if tuple(header_row) != HEADERS:
        raise ValueError(f"Unexpected table headers: {header_row}")
    return [dict(zip(HEADERS, row, strict=True)) for row in body]


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
    rows: list[dict[str, Any]] = scrape_table(webui)
    saved = save_rows_to_excel(frames, rows)
    print(f"Saved {len(rows)} rows to {saved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
