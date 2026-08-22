"""Browser tests for the WebUI Extract Table activity.

Requires Playwright and its browser binaries; skipped automatically when
they are unavailable so CI without browsers stays green.
"""

from __future__ import annotations

from pathlib import Path

import pytest

playwright_api = pytest.importorskip(
    "playwright.sync_api", reason="playwright is required for WebUI browser tests"
)

from rpaforge_libraries.WebUI.library import WebUI  # noqa: E402

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def webui():
    """A WebUI instance bound to a live page from a real Chromium."""
    try:
        driver = playwright_api.sync_playwright().start()
        browser = driver.chromium.launch(headless=True)
    except Exception as exc:
        pytest.skip(f"Playwright browsers not available: {exc}")
    lib = WebUI(headless=True)
    page = browser.new_page()
    lib._pages["fixture"] = page
    lib._current_page_id = "fixture"
    yield lib
    browser.close()
    driver.stop()


def set_html(lib: WebUI, html: str) -> None:
    """Load offline HTML into the current fixture page."""
    lib._page.set_content(html)


class TestExtractTableBrowser:
    """Browser-backed tests for Extract Table on local HTML fixtures."""

    def test_simple_table(self, webui):
        """Test a plain thead/tbody table extracts keyed records."""
        set_html(
            webui,
            """
            <html><body><table id="data">
              <thead><tr><th>City</th><th>Population</th></tr></thead>
              <tbody>
                <tr><td>Berlin</td><td>3645000</td></tr>
                <tr><td> Paris  </td><td>2161000</td></tr>
              </tbody>
            </table></body></html>
            """,
        )
        assert webui.extract_table("#data") == [
            {"City": "Berlin", "Population": "3645000"},
            {"City": "Paris", "Population": "2161000"},
        ]

    def test_nested_table_rows_are_excluded_from_outer_table(self, webui):
        """Test rows of an inner table do not leak into the outer grid."""
        set_html(
            webui,
            """
            <html><body><table id="outer">
              <tr><th>Name</th><th>Details</th></tr>
              <tr>
                <td>Alice</td>
                <td>
                  <table class="inner">
                    <tr><th>Key</th></tr>
                    <tr><td>Value</td></tr>
                  </table>
                </td>
              </tr>
            </table></body></html>
            """,
        )
        records = webui.extract_table("#outer")
        assert len(records) == 1
        assert records[0] == {"Name": "Alice", "Details": ""}

    def test_colspan_and_rowspan_misaligned_table(self, webui):
        """Test spans are expanded into a rectangular grid."""
        set_html(
            webui,
            """
            <html><body><table id="spans">
              <tr>
                <th rowspan="2">Region</th>
                <th colspan="2">Sales</th>
              </tr>
              <tr>
                <th>Q1</th>
                <th>Q2</th>
              </tr>
              <tr>
                <td>North</td>
                <td>10</td>
                <td>20</td>
              </tr>
            </table></body></html>
            """,
        )
        records = webui.extract_table("#spans", header_row=1)
        assert records == [
            {"Region": "Region", "Sales": "Q1", "Sales_2": "Q2"},
            {"Region": "North", "Sales": "10", "Sales_2": "20"},
        ]
        by_header_row_2 = webui.extract_table("#spans", header_row=2)
        assert by_header_row_2 == [{"Region": "North", "Q1": "10", "Q2": "20"}]

    def test_max_rows_limits_records(self, webui):
        """Test max_rows truncates extraction on a live page."""
        set_html(
            webui,
            """
            <html><body><table id="nums">
              <tr><th>N</th></tr>
              <tr><td>1</td></tr>
              <tr><td>2</td></tr>
              <tr><td>3</td></tr>
            </table></body></html>
            """,
        )
        assert webui.extract_table("#nums", max_rows=2) == [{"N": "1"}, {"N": "2"}]

    def test_empty_cells_and_whitespace(self, webui):
        """Test empty cells become '' and whitespace collapses."""
        set_html(
            webui,
            """
            <html><body><table id="ws">
              <tr><th> A </th><th>B</th></tr>
              <tr><td>  spaced   out </td><td>   </td></tr>
              <tr><td></td><td>x</td></tr>
            </table></body></html>
            """,
        )
        assert webui.extract_table("#ws") == [
            {"A": "spaced out", "B": ""},
            {"A": "", "B": "x"},
        ]

    def test_missing_selector_times_out(self, webui):
        """Test a selector matching nothing raises a TimeoutError."""
        set_html(webui, "<html><body><p>No table here</p></body></html>")
        with pytest.raises(TimeoutError):
            webui.extract_table("#nope", timeout="200ms")


class TestW3SchoolsFixtureIntegration:
    """Integration test against a w3schools-style static fixture page."""

    def test_extract_known_customers_rows(self, webui):
        """The known fixture rows must come back as keyed records."""
        html = (FIXTURES_DIR / "customers_table.html").read_text(encoding="utf-8")
        set_html(webui, html)
        records = webui.extract_table("#customers")
        assert records[0] == {
            "Company": "Alfreds Futterkiste",
            "Contact": "Maria Anders",
            "Country": "Germany",
        }
        assert records[-1] == {
            "Company": "Magazzini Alimentari Riuniti",
            "Contact": "Giovanni Rovelli",
            "Country": "Italy",
        }
        assert [r["Company"] for r in records] == [
            "Alfreds Futterkiste",
            "Centro comercial Moctezuma",
            "Ernst Handel",
            "Island Trading",
            "Laughing Bacchus Winecellars",
            "Magazzini Alimentari Riuniti",
        ]

    def test_extract_via_file_url_navigation(self, webui):
        """The fixture also extracts when loaded as a real local file."""
        url = (FIXTURES_DIR / "customers_table.html").resolve().as_uri()
        webui._page.goto(url)
        records = webui.extract_table("#customers", max_rows=3)
        assert len(records) == 3
        assert records[1]["Contact"] == "Francisco Chang"
