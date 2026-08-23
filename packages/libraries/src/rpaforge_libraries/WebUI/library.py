"""
RPAForge WebUI Library.

Web automation using Playwright with multi-browser and multi-window support.
"""

from __future__ import annotations

import contextlib
import json
import logging
import time
from collections.abc import Callable
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge.selectors import (
    CompositeSelector,
    SelectorStrategy,
    SelectorStrategyType,
    SmartSelectorEngine,
    parse_selector,
)
from rpaforge_libraries.i18n import _

logger = logging.getLogger("rpaforge.web")
BROWSER_TYPES = ["chromium", "firefox", "webkit"]
_RECORDER_MARKER = "__RPAFORGE_RECORDER__:"
_RECORDER_SCRIPT = f"""
(() => {{
  window.__rpaforgeRecorderCleanup?.();
  const marker = {_RECORDER_MARKER!r};
  const pendingInputs = new WeakMap();
  const sensitive = (element) => {{
    const type = (element.getAttribute('type') || '').toLowerCase();
    const name = (element.getAttribute('name') || '').toLowerCase();
    const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
    return type === 'password' || /password|secret|token|api[-_]?key/.test(name) ||
      /password|current-password|new-password/.test(autocomplete);
  }};
  const selectorCandidates = (element) => {{
    const candidates = [];
    if (element.id) candidates.push({{ type: 'id', value: '#' + CSS.escape(element.id), reliability: 1 }});
    for (const attribute of ['data-testid', 'name', 'aria-label']) {{
      const value = element.getAttribute(attribute);
      if (value) candidates.push({{ type: attribute, value: '[' + attribute + '=\\"' + CSS.escape(value) + '\\"]', reliability: attribute === 'data-testid' ? 0.95 : 0.85 }});
    }}
    const text = (element.textContent || '').trim().slice(0, 60);
    if (text && /^(button|a|label)$/.test(element.tagName.toLowerCase())) {{
      candidates.push({{ type: 'role+text', value: element.tagName.toLowerCase() + ':text(\\"' + text.replace(/\\"/g, '\\\\"') + '\\")', reliability: 0.75 }});
    }}
    candidates.push({{ type: 'css', value: element.tagName.toLowerCase(), reliability: 0.3 }});
    return candidates;
  }};
  const targetElement = (target) => target instanceof Element ?
    (target.closest('button, a, input, textarea, select, [role=button]') || target) : null;
  const emit = (kind, target, value) => {{
    const element = targetElement(target);
    if (!element || sensitive(element)) return;
    const candidates = selectorCandidates(element);
    if (!candidates.length) return;
    const action = {{
      id: crypto.randomUUID(),
      type: kind,
      selector: candidates[0],
      allCandidates: candidates,
      timestamp: Date.now(),
      source: 'web',
    }};
    if (value !== undefined) action.value = value;
    console.info(marker + JSON.stringify(action));
  }};
  const onClick = (event) => emit('click', event.target);
  const onInput = (event) => {{
    const element = targetElement(event.target);
    if (!element || sensitive(element)) return;
    clearTimeout(pendingInputs.get(element));
    pendingInputs.set(element, setTimeout(() => emit('input', element, element.value), 250));
  }};
  const onChange = (event) => {{
    const element = targetElement(event.target);
    if (element?.tagName.toLowerCase() === 'select') emit('select', element, element.value);
  }};
  const onKeyDown = (event) => {{
    if (event.repeat || /^(input|textarea|select)$/.test(event.target?.tagName?.toLowerCase() || '') || event.target?.isContentEditable) return;
    emit('keypress', event.target, event.key);
  }};
  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.__rpaforgeRecorderCleanup = () => {{
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }};
}})();
"""

_EXTRACT_TABLE_SCRIPT = r"""
(element) => {
  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const parseSpan = (value) => {
    const n = parseInt(value || '1', 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const rowNodes = Array.from(element.querySelectorAll(
    ':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr'
  ));
  const cellText = (cell) => {
    if (!cell.querySelector('table')) return normalize(cell.textContent);
    const clone = cell.cloneNode(true);
    Array.from(clone.querySelectorAll('table')).forEach((nested) => nested.remove());
    return normalize(clone.textContent);
  };
  const grid = [];
  rowNodes.forEach((row, rowIndex) => {
    if (!grid[rowIndex]) grid[rowIndex] = [];
    let col = 0;
    Array.from(row.children).forEach((cell) => {
      const tag = cell.tagName.toLowerCase();
      if (tag !== 'td' && tag !== 'th') return;
      while (grid[rowIndex][col] !== undefined) col++;
      const text = cellText(cell);
      const colspan = parseSpan(cell.getAttribute('colspan'));
      const rowspan = parseSpan(cell.getAttribute('rowspan'));
      for (let dr = 0; dr < rowspan; dr++) {
        if (!grid[rowIndex + dr]) grid[rowIndex + dr] = [];
        for (let dc = 0; dc < colspan; dc++) {
          if (grid[rowIndex + dr][col + dc] === undefined) {
            grid[rowIndex + dr][col + dc] = text;
          }
        }
      }
      col += colspan;
    });
  });
  const width = grid.reduce((max, cells) => Math.max(max, cells.length), 0);
  return grid.map((cells) => {
    const padded = [];
    for (let i = 0; i < width; i++) {
      padded.push(cells[i] === undefined ? '' : cells[i]);
    }
    return padded;
  });
}
"""


@library(name="WebUI", category="Web", icon="🌐")
class WebUI:
    """Web automation library using Playwright with multi-instance support."""

    def __init__(self, browser: str = "chromium", headless: bool = False):
        self._default_browser_type = browser
        self._default_headless = headless
        self._playwright: Any = None
        self._browsers: dict[str, Any] = {}
        self._contexts: dict[str, Any] = {}
        # Reference count per context (by object id). A context may be shared by
        # several pages (e.g. "New Page" reuses the current page's context so the
        # login cookies/session are shared across tabs). A shared context is only
        # closed once its last owning page is closed.
        self._context_refs: dict[int, int] = {}
        self._pages: dict[str, Any] = {}
        self._page_browser: dict[str, str] = {}
        self._current_browser_id: str | None = None
        self._current_page_id: str | None = None
        self._timeout: int = 30000
        self._screenshot_on_failure: bool = False
        self._screenshot_dir: str = "."
        self._recording_callback: Callable[[dict[str, Any]], None] | None = None
        self._recording_pages: dict[
            str, tuple[Any, Callable[..., None], Callable[..., None]]
        ] = {}
        self._recording_action_count = 0

    def _ensure_playwright(self) -> None:
        if self._playwright is not None:
            return
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as err:
            raise ImportError(
                _(
                    "playwright is required for WebUI library. Install it with: pip install rpaforge-libraries[web] && playwright install"
                )
            ) from err
        import asyncio
        import concurrent.futures

        try:
            asyncio.get_running_loop()
            running_in_loop = True
        except RuntimeError:
            running_in_loop = False
        if running_in_loop:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                self._playwright = pool.submit(
                    lambda: sync_playwright().start()
                ).result()
        else:
            self._playwright = sync_playwright().start()

    def __del__(self) -> None:
        if hasattr(self, "close_browser"):
            with contextlib.suppress(Exception):
                self.stop_recording()
                self.close_browser(all=True)

    def _recording_console_handler(self, message: Any) -> None:
        text = message.text
        if not text.startswith(_RECORDER_MARKER) or self._recording_callback is None:
            return
        try:
            action = json.loads(text[len(_RECORDER_MARKER) :])
        except (TypeError, json.JSONDecodeError):
            return
        self._recording_action_count += 1
        self._recording_callback(action)

    def _attach_recording_page(self, page_id: str, page: Any) -> None:
        if page_id in self._recording_pages:
            return

        def on_console(message: Any) -> None:
            self._recording_console_handler(message)

        def on_navigation(frame: Any) -> None:
            if frame is page.main_frame and self._recording_callback is not None:
                self._recording_action_count += 1
                self._recording_callback(
                    {
                        "id": f"recording-navigation-{self._recording_action_count}",
                        "type": "navigate",
                        "selector": {
                            "type": "url",
                            "value": page.url,
                            "reliability": 1.0,
                        },
                        "allCandidates": [
                            {"type": "url", "value": page.url, "reliability": 1.0}
                        ],
                        "timestamp": time.time_ns() // 1_000_000,
                        "value": page.url,
                        "source": "web",
                    }
                )

        page.on("console", on_console)
        page.on("framenavigated", on_navigation)
        page.add_init_script(script=_RECORDER_SCRIPT)
        page.evaluate(_RECORDER_SCRIPT)
        self._recording_pages[page_id] = (page, on_console, on_navigation)

    def _detach_recording_pages(self) -> None:
        for page, on_console, on_navigation in self._recording_pages.values():
            with contextlib.suppress(Exception):
                page.evaluate("window.__rpaforgeRecorderCleanup?.()")
            with contextlib.suppress(Exception):
                page.remove_listener("console", on_console)
            with contextlib.suppress(Exception):
                page.remove_listener("framenavigated", on_navigation)
        self._recording_pages.clear()

    def start_recording(
        self, callback: Callable[[dict[str, Any]], None]
    ) -> dict[str, Any]:
        """Start an in-memory WebUI recording on all active pages."""
        if self._page is None:
            raise RuntimeError("Open a WebUI browser before starting a recording.")
        if self._recording_callback is not None:
            return {
                "recording": True,
                "capabilities": {"web": True, "desktop": False},
            }
        self._recording_callback = callback
        self._recording_action_count = 0
        for page_id, page in self._pages.items():
            self._attach_recording_page(page_id, page)
        return {
            "recording": True,
            "capabilities": {"web": True, "desktop": False},
        }

    def stop_recording(self) -> dict[str, Any]:
        """Stop recording and discard hooks while retaining no session data."""
        self._detach_recording_pages()
        action_count = self._recording_action_count
        self._recording_callback = None
        self._recording_action_count = 0
        return {
            "recording": False,
            "actionCount": action_count,
            "capabilities": {"web": True, "desktop": False},
        }

    @property
    def _page(self) -> Any:
        if self._current_page_id and self._current_page_id in self._pages:
            return self._pages[self._current_page_id]
        return None

    @property
    def _browser(self) -> Any:
        if self._current_browser_id and self._current_browser_id in self._browsers:
            return self._browsers[self._current_browser_id]
        return None

    @property
    def _context(self) -> Any:
        if self._current_page_id and self._current_page_id in self._contexts:
            return self._contexts[self._current_page_id]
        return None

    @activity(name="Open Browser", category="Web")
    @tags("browser", "startup")
    @output("Browser instance ID")
    @param(
        "browser",
        type="string",
        options=BROWSER_TYPES,
        description="Browser type to launch",
    )
    def open_browser(
        self,
        url: str | None = None,
        browser: str = "chromium",
        headless: bool = False,
        browser_id: str | None = None,
    ) -> str:
        self._ensure_playwright()
        browser_type = browser or self._default_browser_type
        is_headless = headless if headless else self._default_headless
        import uuid

        instance_id = browser_id or f"{browser_type}_{uuid.uuid4().hex[:8]}"
        if instance_id in self._browsers:
            raise ValueError(
                _("library.browser_instance_already_exists", instance_id=instance_id)
            )
        browser_launcher = getattr(self._playwright, browser_type)
        self._browsers[instance_id] = browser_launcher.launch(headless=is_headless)
        context = self._browsers[instance_id].new_context()
        page = context.new_page()
        page.set_default_timeout(self._timeout)
        self._contexts[instance_id] = context
        self._context_refs[id(context)] = 1
        self._pages[instance_id] = page
        self._page_browser[instance_id] = instance_id
        self._current_browser_id = instance_id
        self._current_page_id = instance_id
        if url:
            page.goto(url)
        if self._recording_callback is not None:
            self._attach_recording_page(instance_id, page)
        logger.info(
            _(
                "library.opened_browser_id",
                browser_type=browser_type,
                instance_id=instance_id,
            )
        )
        return instance_id

    @activity(name="New Page", category="Web")
    @tags("browser", "page")
    @output("Page ID")
    def new_page(self, url: str | None = None, page_id: str | None = None) -> str:
        self._ensure_playwright()
        if not self._current_browser_id:
            raise ValueError(_("library.no_browser_open_use_open_browser_first"))
        import uuid

        instance_id = page_id or f"page_{uuid.uuid4().hex[:8]}"
        if instance_id in self._pages:
            raise ValueError(
                _("library.page_instance_already_exists", instance_id=instance_id)
            )
        browser = self._browsers[self._current_browser_id]
        # Reuse the current page's context so the login/session (cookies,
        # localStorage) is shared across tabs opened via "New Page". Without
        # this, each tab gets an isolated context and automation expecting a
        # session across tabs breaks (see #676).
        context = self._context or browser.new_context()
        page = context.new_page()
        page.set_default_timeout(self._timeout)
        self._contexts[instance_id] = context
        # Track how many pages share this context so it is only closed when the
        # last one goes away (see close_page).
        self._context_refs[id(context)] = self._context_refs.get(id(context), 0) + 1
        self._pages[instance_id] = page
        self._page_browser[instance_id] = self._current_browser_id
        self._current_page_id = instance_id
        if url:
            page.goto(url)
        if self._recording_callback is not None:
            self._attach_recording_page(instance_id, page)
        logger.info(_("library.created_new_page_id", instance_id=instance_id))
        return instance_id

    @activity(name="Switch Browser", category="Web")
    @tags("browser", "navigation")
    @output("Current browser ID")
    def switch_browser(self, browser_id: str) -> str:
        if browser_id not in self._browsers:
            raise ValueError(
                _("library.browser_instance_not_found", browser_id=browser_id)
            )
        self._current_browser_id = browser_id
        if browser_id in self._pages:
            self._current_page_id = browser_id
        logger.info(_("library.switched_to_browser", browser_id=browser_id))
        return browser_id

    @activity(name="Switch Page", category="Web")
    @tags("browser", "page", "navigation")
    @output("Current page ID")
    def switch_page(self, page_id: str) -> str:
        if page_id not in self._pages:
            raise ValueError(_("library.page_instance_not_found", page_id=page_id))
        self._current_page_id = page_id
        logger.info(_("library.switched_to_page", page_id=page_id))
        return page_id

    @activity(name="List Browsers", category="Web")
    @tags("browser", "info")
    @output("List of browser instance IDs")
    def list_browsers(self) -> list[str]:
        return list(self._browsers.keys())

    @activity(name="List Pages", category="Web")
    @tags("browser", "page", "info")
    @output("List of page instance IDs")
    def list_pages(self) -> list[str]:
        return list(self._pages.keys())

    @activity(name="Get Current Browser", category="Web")
    @tags("browser", "info")
    @output("Current browser ID")
    def get_current_browser(self) -> str:
        if not self._current_browser_id:
            raise ValueError(_("library.no_browser_is_currently_active"))
        return self._current_browser_id

    @activity(name="Get Current Page", category="Web")
    @tags("browser", "page", "info")
    @output("Current page ID")
    def get_current_page(self) -> str:
        if not self._current_page_id:
            raise ValueError(_("library.no_page_is_currently_active"))
        return self._current_page_id

    @activity(name="Navigate", category="Web")
    @tags("navigation")
    @param(
        "action",
        type="string",
        options=["url", "back", "forward", "refresh"],
        description="Navigation action",
    )
    def navigate(self, url: str = "", action: str = "url") -> None:
        self._ensure_page()
        action = action.lower()
        if action == "url":
            self._page.goto(url)
            logger.info(_("library.navigated_to", url=url))
        elif action == "back":
            self._page.go_back()
            logger.info(_("library.navigated_back"))
        elif action == "forward":
            self._page.go_forward()
            logger.info(_("library.navigated_forward"))
        elif action == "refresh":
            self._page.reload()
            logger.info(_("library.page_refreshed"))

    def _resolve_smart_locator(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        timeout_ms: int = 30000,
    ) -> str:
        """Resolve a composite or plain selector into a working Playwright locator."""
        composite = parse_selector(selector)
        if (
            len(composite.strategies) <= 1
            and composite.primary_strategy
            and composite.primary_strategy.type
            in ("native", "css", "xpath", "playwright", "id")
        ):
            raw_sel = (
                composite.primary_strategy.selector
                or composite.original_query
                or str(selector)
            )
            if not str(selector).strip().startswith("{"):
                return raw_sel

        engine = SmartSelectorEngine(default_timeout_ms=timeout_ms)
        probe_timeout = min(1500, max(200, timeout_ms // 2))

        def resolve_css_or_native(strategy: SelectorStrategy) -> str:
            sel = strategy.selector or ""
            self._page.wait_for_selector(sel, state="attached", timeout=probe_timeout)
            return sel

        def resolve_id(strategy: SelectorStrategy) -> str:
            sel = (
                f"#{strategy.selector}"
                if strategy.selector and not strategy.selector.startswith("#")
                else (strategy.selector or "")
            )
            self._page.wait_for_selector(sel, state="attached", timeout=probe_timeout)
            return sel

        def resolve_text_anchor(strategy: SelectorStrategy) -> str:
            lbl = strategy.label or strategy.selector or ""
            target_type = (strategy.target_type or "").lower()
            dir_str = str(
                strategy.direction.value
                if hasattr(strategy.direction, "value")
                else strategy.direction
            ).lower()

            if target_type == "input" or dir_str == "right":
                candidates = [
                    f"text={lbl} >> xpath=..//input",
                    f"label:has-text('{lbl}') >> input",
                    f"text={lbl} >> xpath=following::input[1]",
                ]
            elif target_type == "button":
                candidates = [
                    f"button:has-text('{lbl}')",
                    f"role=button[name='{lbl}']",
                    f"text={lbl}",
                ]
            else:
                candidates = [
                    f"text={lbl}",
                    f":has-text('{lbl}')",
                ]

            for cand in candidates:
                try:
                    self._page.wait_for_selector(
                        cand, state="attached", timeout=probe_timeout
                    )
                    return cand
                except Exception:
                    continue
            raise TimeoutError(f"Anchor '{lbl}' not found")

        resolvers = {
            SelectorStrategyType.CSS: resolve_css_or_native,
            SelectorStrategyType.XPATH: resolve_css_or_native,
            SelectorStrategyType.NATIVE: resolve_css_or_native,
            SelectorStrategyType.PLAYWRIGHT: resolve_css_or_native,
            SelectorStrategyType.ID: resolve_id,
            SelectorStrategyType.TEXT_ANCHOR: resolve_text_anchor,
            "css": resolve_css_or_native,
            "xpath": resolve_css_or_native,
            "native": resolve_css_or_native,
            "playwright": resolve_css_or_native,
            "id": resolve_id,
            "text_anchor": resolve_text_anchor,
            "default": resolve_css_or_native,
        }

        # VLM grounding: last-resort semantic strategy, only when a
        # vision-capable model is configured (issue #743).
        description = ""
        for strat in composite.strategies:
            strat_value = (
                strat.type.value if hasattr(strat.type, "value") else str(strat.type)
            )
            if strat_value == "vlm_grounding":
                description = strat.label or strat.selector or ""
                break
        if description:
            from rpaforge.selectors.vlm_grounding import (
                has_vision_configured,
                make_vlm_resolver,
            )

            if has_vision_configured():
                viewport = self._page.viewport_size or {}

                def resolve_vlm(strategy: SelectorStrategy) -> dict[str, int]:
                    return make_vlm_resolver(
                        description or strategy.label or "",
                        screenshot_fn=lambda: self._page.screenshot(),
                        viewport_size=(
                            int(viewport.get("width", 1280)),
                            int(viewport.get("height", 720)),
                        ),
                    )(strategy)

                resolvers[SelectorStrategyType.VLM_GROUNDING] = resolve_vlm

        res = engine.resolve(composite, resolvers=resolvers, timeout_ms=timeout_ms)
        if isinstance(res.element, dict) and "bbox" in res.element:
            # Coordinate action target from VLM grounding.
            return res.element  # type: ignore[return-value]
        return res.element

    @activity(name="Click Element", category="Web")
    @tags("input", "mouse")
    @param(
        "click_type",
        type="string",
        options=["single", "double", "right"],
        description="Type of click",
    )
    def _resolve_by_description(self, description: str, timeout_ms: int) -> list[int]:
        """Locate an element by NL description via VLM grounding (#744).

        Successful resolutions are cached per description so subsequent
        invocations reuse the healed coordinates without paying the VLM
        round-trip again.
        """
        cache: dict[str, list[int]] = getattr(self, "_vlm_cache", {})
        self._vlm_cache = cache
        if description in cache:
            return cache[description]

        from rpaforge.selectors.vlm_grounding import (
            has_vision_configured,
            make_vlm_resolver,
        )

        if not has_vision_configured():
            raise ValueError(
                "No vision-capable LLM configured. Set RPAFORGE_LLM_PROVIDER "
                "and RPAFORGE_LLM_MODEL (vision model via "
                "RPAFORGE_LLM_VISION_MODEL) to use description targeting."
            )

        composite = parse_selector(
            {"type": "vlm_grounding", "label": description, "weight": 0.3}
        )
        viewport = self._page.viewport_size or {}
        resolver = make_vlm_resolver(
            description,
            screenshot_fn=lambda: self._page.screenshot(),
            viewport_size=(
                int(viewport.get("width", 1280)),
                int(viewport.get("height", 720)),
            ),
        )
        engine = SmartSelectorEngine(default_timeout_ms=timeout_ms)
        try:
            result = engine.resolve(
                composite,
                resolvers={SelectorStrategyType.VLM_GROUNDING: resolver},
                timeout_ms=timeout_ms,
            )
        except TimeoutError as err:
            raise ValueError(
                f"Element matching '{description}' was not located by the "
                "vision model. Refine the description or check the page state."
            ) from err
        element = result.element
        bbox = [int(round(float(v))) for v in element["bbox"]]
        cache[description] = bbox
        logger.info(
            f"VLM located '{description}' at {bbox} (confidence {result.confidence_score:.2f})"
        )
        return bbox

    @activity(name="Click Element By Description", category="AI")
    @tags("ai", "vlm", "click", "natural-language")
    @param(
        "description",
        type="string",
        description="Natural-language description of the element to click.",
    )
    def click_element_by_description(
        self,
        description: str,
        timeout: str = "30s",
    ) -> None:
        """Click an element located by a natural-language description.

        Uses the VLM grounding strategy (issue #743): captures a
        screenshot, asks the vision model for the element's bounding box
        and clicks its center. Resolutions are cached per description.

        :param description: What to click, e.g. ``"the green Approve button"``.
        :param timeout: Total resolution budget.
        :raises ValueError: When nothing matches or no vision model is configured.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        x, y, w, h = self._resolve_by_description(description, timeout_ms)
        self._page.mouse.click(x + w / 2, y + h / 2)
        logger.info(
            f"Clicked by description '{description}' at ({x + w // 2}, {y + h // 2})"
        )

    @activity(name="Find Element By Description", category="AI")
    @tags("ai", "vlm", "find", "natural-language")
    @output("Dictionary with bbox [x, y, width, height], confidence and cached flag")
    @param(
        "description",
        type="string",
        description="Natural-language description of the element to locate.",
    )
    def find_element_by_description(
        self,
        description: str,
        timeout: str = "30s",
    ) -> dict[str, Any]:
        """Locate an element by natural-language description.

        :param description: What to find.
        :param timeout: Total resolution budget.
        :returns: ``{"bbox": [x, y, width, height], "confidence": float,
            "cached": bool}``.
        :raises ValueError: When nothing matches or no vision model is configured.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        cached = description in getattr(self, "_vlm_cache", {})
        bbox = self._resolve_by_description(description, timeout_ms)
        return {"bbox": bbox, "confidence": None, "cached": cached}

    def click_element(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        timeout: str = "30s",
        click_type: str = "single",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        if isinstance(loc, dict) and "bbox" in loc:
            # VLM grounding result: coordinate action at bbox center.
            x, y, w, h = (float(v) for v in loc["bbox"])
            self._page.mouse.click(x + w / 2, y + h / 2)
            logger.info(f"Clicked element via VLM grounding: {selector}")
            return
        click_type = click_type.lower()
        if click_type == "double":
            self._page.dblclick(loc, timeout=timeout_ms)
        elif click_type == "right":
            self._page.click(loc, button="right", timeout=timeout_ms)
        else:
            self._page.click(loc, timeout=timeout_ms)
        logger.info(f"Clicked element ({click_type}): {selector}")

    @activity(name="Input Text", category="Web")
    @tags("input", "keyboard")
    def input_text(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        text: str,
        clear: bool = True,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        if clear:
            self._page.fill(loc, text, timeout=timeout_ms)
        else:
            self._page.type(loc, text, timeout=timeout_ms)
        logger.info(f"Input text into {selector}")

    @activity(name="Press Keys", category="Web")
    @tags("input", "keyboard")
    def press_keys(self, keys: str) -> None:
        self._ensure_page()
        self._page.keyboard.press(keys)
        logger.info(f"Pressed keys: {keys}")

    @activity(name="Select Option", category="Web")
    @tags("input", "form")
    def select_option(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        value: str | list[str],
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        self._page.select_option(loc, value, timeout=timeout_ms)
        logger.info(f"Selected option: {value}")

    @activity(name="Set Checkbox", category="Web")
    @tags("input", "form")
    def set_checkbox(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        checked: bool = True,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        if checked:
            self._page.check(loc, timeout=timeout_ms)
            logger.info(f"Checked: {selector}")
        else:
            self._page.uncheck(loc, timeout=timeout_ms)
            logger.info(f"Unchecked: {selector}")

    @activity(name="Get Element Text", category="Web")
    @tags("element", "get")
    @output("Text content of the element")
    def get_element_text(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        timeout: str = "30s",
    ) -> str:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        text = self._page.text_content(loc, timeout=timeout_ms) or ""
        logger.info(f"Got text: {text[:50]}...")
        return text

    @activity(name="Get Element Attribute", category="Web")
    @tags("element", "get")
    @output("Attribute value")
    def get_element_attribute(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        attribute: str,
        timeout: str = "30s",
    ) -> str:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        value = self._page.get_attribute(loc, attribute, timeout=timeout_ms) or ""
        return value

    @activity(name="Extract Table", category="Web")
    @tags("element", "get", "table")
    @output("List of row records keyed by column headers")
    @param(
        "header_row",
        type="integer",
        description="1-based row index used as column headers.",
    )
    @param(
        "max_rows",
        type="integer",
        description="Maximum number of data rows to extract.",
    )
    def extract_table(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        header_row: int = 1,
        max_rows: int | None = None,
        timeout: str = "30s",
    ) -> list[dict[str, str]]:
        """Extract an HTML table into records keyed by column headers.

        Collects the ``<tr>`` grid of the table matched by *selector*
        with an in-page script (``<thead>``/``<tbody>``/``<tfoot>``
        nesting aware, rows of nested tables excluded), expands
        ``colspan``/``rowspan`` spans across the grid, and maps every
        data row onto the headers taken from the 1-based *header_row*.
        Cell values are whitespace-trimmed strings; empty cells coerce
        to ``""`` and duplicate header names are suffixed ``_2``,
        ``_3``, ...
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        element = self._page.wait_for_selector(
            loc, state="attached", timeout=timeout_ms
        )
        if element is None:
            raise ValueError(f"Table not found for selector: {selector}")
        grid = element.evaluate(_EXTRACT_TABLE_SCRIPT)
        records = _grid_to_records(grid, header_row=header_row, max_rows=max_rows)
        logger.info(f"Extracted {len(records)} rows from table: {selector}")
        return records

    @activity(name="Get Page Title", category="Web")
    @tags("element", "get")
    @output("Page title")
    def get_page_title(self) -> str:
        self._ensure_page()
        return self._page.title()

    @activity(name="Get URL", category="Web")
    @tags("element", "get")
    @output("Current page URL")
    def get_url(self) -> str:
        self._ensure_page()
        return self._page.url

    @activity(name="Wait For Page Load", category="Web")
    @tags("wait")
    def wait_for_page_load(self, timeout: str = "30s") -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.wait_for_load_state("networkidle", timeout=timeout_ms)
        logger.info(_("library.page_loaded"))

    @activity(name="Wait For Element", category="Web")
    @tags("wait")
    @param(
        "state",
        type="string",
        options=["visible", "hidden", "attached", "detached"],
        description="Element state to wait for",
    )
    def wait_for_element(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        state: str = "visible",
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
        self._page.wait_for_selector(loc, state=state, timeout=timeout_ms)
        logger.info(f"Element {selector} is {state}")

    @activity(name="Wait For Selector", category="Web")
    @tags("wait")
    def wait_for_selector(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        timeout: str = "30s",
    ) -> None:
        self.wait_for_element(selector, state="attached", timeout=timeout)

    @activity(name="Take Screenshot", category="Web")
    @tags("screenshot")
    @output("Filename of the saved screenshot")
    def take_screenshot(
        self, filename: str = "screenshot.png", full_page: bool = False
    ) -> str:
        self._ensure_page()
        self._page.screenshot(path=filename, full_page=full_page)
        logger.info(f"Screenshot saved: {filename}")
        return filename

    @activity(name="Set Screenshot On Failure", category="Web")
    @tags("screenshot", "config")
    def set_screenshot_on_failure(
        self, enabled: bool = True, directory: str = "."
    ) -> None:
        self._screenshot_on_failure = enabled
        self._screenshot_dir = directory
        logger.info(f"Screenshot on failure: {enabled}, directory: {directory}")

    @activity(name="Validate Selector", category="Web")
    @tags("element", "validation")
    @output("Dictionary with validation results")
    def validate_selector(
        self,
        selector: str | dict[str, Any] | CompositeSelector,
        timeout: str = "5s",
    ) -> dict[str, Any]:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        try:
            loc = self._resolve_smart_locator(selector, timeout_ms=timeout_ms)
            element = self._page.wait_for_selector(
                loc, state="attached", timeout=timeout_ms
            )
            if element:
                return {
                    "valid": True,
                    "found": True,
                    "visible": element.is_visible(),
                    "enabled": element.is_enabled(),
                    "text": element.text_content() or "",
                }
        except Exception:
            logger.debug(
                "Selector %r not found within %sms",
                selector,
                timeout_ms,
                exc_info=True,
            )
        return {
            "valid": False,
            "found": False,
            "visible": False,
            "enabled": False,
            "text": "",
        }

    @activity(name="Wait Until Element Contains Text", category="Web")
    @tags("element", "wait")
    @output("True when element contains text")
    def wait_until_element_contains_text(
        self,
        selector: str,
        text: str,
        timeout: str = "30s",
        case_sensitive: bool = False,
    ) -> bool:
        self._ensure_page()
        import re

        from playwright.sync_api import expect

        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        if case_sensitive:
            pattern = re.compile(re.escape(text))
        else:
            pattern = re.compile(re.escape(text), re.IGNORECASE)
        try:
            expect(self._page.locator(selector)).to_contain_text(
                pattern, timeout=timeout_ms
            )
            logger.info(f"Element contains text: {text}")
            return True
        except Exception as exc:
            raise TimeoutError(
                f"Element '{selector}' did not contain text '{text}' within {timeout}"
            ) from exc

    @activity(name="Handle Dialog", category="Web")
    @tags("dialog", "alert")
    def handle_dialog(self, action: str = "accept", prompt_text: str = "") -> None:
        self._ensure_page()
        self._page.on(
            "dialog",
            lambda dialog: (
                dialog.accept(prompt_text) if action == "accept" else dialog.dismiss()
            ),
        )
        logger.info(f"Dialog handler set: {action}")

    @activity(name="Upload File", category="Web")
    @tags("input", "file")
    def upload_file(self, selector: str, file_path: str, timeout: str = "30s") -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.set_input_files(selector, file_path, timeout=timeout_ms)
        logger.info(f"Uploaded file: {file_path}")

    @activity(name="Download File", category="Web")
    @tags("download", "file")
    @output("Path where file was saved")
    def download_file(self, selector: str, save_path: str, timeout: str = "60s") -> str:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        with self._page.expect_download(timeout=timeout_ms) as download_info:
            self._page.click(selector)
        download = download_info.value
        download.save_as(save_path)
        logger.info(f"Downloaded file: {save_path}")
        return save_path

    @activity(name="Get Element Properties", category="Web")
    @tags("element", "get")
    @output("Dictionary with element properties")
    def get_element_properties(
        self, selector: str, timeout: str = "10s"
    ) -> dict[str, Any]:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        element = self._page.wait_for_selector(selector, timeout=timeout_ms)
        return {
            "text": element.text_content() or "",
            "inner_text": element.inner_text() or "",
            "tag_name": element.evaluate("el => el.tagName.toLowerCase()"),
            "is_visible": element.is_visible(),
            "is_enabled": element.is_enabled(),
            "is_checked": element.is_checked()
            if element.evaluate("el => el.type === 'checkbox' || el.type === 'radio'")
            else None,
            "value": element.input_value()
            if element.evaluate(
                "el => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)"
            )
            else None,
        }

    @activity(name="Inspect Page", category="Web")
    def inspect_page(self, _include_frames: bool = True) -> dict[str, Any]:
        self._ensure_page()
        elements = self._page.evaluate(
            "() => {\n            function getXPath(el) {\n                if (el.id) return '//' + el.tagName.toLowerCase() + '[@id='' + el.id + '']';\n                const parts = [];\n                let current = el;\n                while (current && current.nodeType === 1) {\n                    let idx = 1;\n                    let sibling = current.previousSibling;\n                    while (sibling) {\n                        if (sibling.nodeType === 1 && sibling.tagName === current.tagName) idx++;\n                        sibling = sibling.previousSibling;\n                    }\n                    const tag = current.tagName.toLowerCase();\n                    parts.unshift(idx > 1 ? tag + '[' + idx + ']' : tag);\n                    current = current.parentElement;\n                }\n                return '/' + parts.join('/');\n            }\n\n            function getCSSPath(el) {\n                if (el.id) return el.tagName.toLowerCase() + '#' + CSS.escape(el.id);\n                const classes = Array.from(el.classList).slice(0, 3);\n                if (classes.length > 0) return el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');\n                return el.tagName.toLowerCase();\n            }\n\n            function getReliableSelector(el, xpath, cssPath) {\n                if (el.id) return {type: 'id', value: '#' + CSS.escape(el.id), reliability: 1.0};\n                const role = el.getAttribute('role');\n                const text = (el.textContent || '').trim().slice(0, 50);\n                if (role && text) return {type: 'role+text', value: '[role=\"' + role + '\"]', reliability: 0.85};\n                if (el.classList.length > 0) return {type: 'css', value: cssPath, reliability: 0.6};\n                return {type: 'xpath', value: xpath, reliability: 0.4};\n            }\n\n            const selectors = 'input, button, a, select, textarea, [role]';\n            const nodes = Array.from(document.querySelectorAll(selectors));\n            return nodes.map(el => {\n                const rect = el.getBoundingClientRect();\n                const xpath = getXPath(el);\n                const cssPath = getCSSPath(el);\n                return {\n                    tag: el.tagName.toLowerCase(),\n                    id: el.id || null,\n                    classes: Array.from(el.classList),\n                    text: (el.textContent || '').trim().slice(0, 100),\n                    xpath: xpath,\n                    cssPath: cssPath,\n                    reliableSelector: getReliableSelector(el, xpath, cssPath),\n                    rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}\n                };\n            });\n        }"
        )
        return {"elements": elements, "total": len(elements), "url": self._page.url}

    @activity(name="Highlight Element", category="Web")
    def highlight_element(
        self, selector: str, color: str = "yellow", duration: int = 3000
    ) -> None:
        self._ensure_page()
        self._page.evaluate(
            "([selector, color, duration]) => {\n            const el = document.querySelector(selector) ||\n                (selector.startsWith('/') || selector.startsWith('(')\n                    ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue\n                    : null);\n            if (!el) return;\n            const rect = el.getBoundingClientRect();\n            const overlay = document.createElement('div');\n            overlay.style.cssText = [\n                'position:fixed',\n                'pointer-events:none',\n                'z-index:2147483647',\n                'left:' + (rect.left + window.scrollX) + 'px',\n                'top:' + (rect.top + window.scrollY) + 'px',\n                'width:' + rect.width + 'px',\n                'height:' + rect.height + 'px',\n                'background:' + color,\n                'opacity:0.5',\n                'border:2px solid darkorange',\n                'box-sizing:border-box'\n            ].join(';');\n            const badge = document.createElement('span');\n            badge.textContent = el.tagName.toLowerCase();\n            badge.style.cssText = 'position:absolute;top:0;left:0;background:darkorange;color:#fff;font-size:10px;padding:1px 3px;font-family:monospace';\n            overlay.appendChild(badge);\n            document.body.appendChild(overlay);\n            setTimeout(() => overlay.remove(), duration);\n        }",
            [selector, color, duration],
        )

    @activity(name="Test Selector", category="Web")
    def test_selector(self, selector: str) -> dict[str, Any]:
        self._ensure_page()
        result = self._page.evaluate(
            "(selector) => {\n            let count = 0;\n            let visible = null;\n            let enabled = null;\n            let warning = null;\n\n            const isXPath = selector.startsWith('/') || selector.startsWith('(') || selector.startsWith('.');\n            if (isXPath && (selector.startsWith('/') || selector.startsWith('('))) {\n                try {\n                    const xr = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);\n                    count = xr.snapshotLength;\n                } catch(e) {\n                    return {valid: false, unique: false, count: 0, visible: null, enabled: null, warning: 'XPath error: ' + e.message};\n                }\n            } else {\n                try {\n                    const nodes = document.querySelectorAll(selector);\n                    count = nodes.length;\n                } catch(e) {\n                    return {valid: false, unique: false, count: 0, visible: null, enabled: null, warning: 'CSS selector error: ' + e.message};\n                }\n            }\n\n            if (count === 0) return {valid: false, unique: false, count: 0, visible: null, enabled: null, warning: 'No elements found'};\n\n            const first = selector.startsWith('/') || selector.startsWith('(')\n                ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue\n                : document.querySelector(selector);\n\n            if (first) {\n                const r = first.getBoundingClientRect();\n                visible = r.width > 0 && r.height > 0 && window.getComputedStyle(first).display !== 'none';\n                enabled = !first.disabled;\n            }\n\n            if (count > 1) warning = count + ' elements matched — selector is not unique';\n\n            return {valid: true, unique: count === 1, count: count, visible: visible, enabled: enabled, warning: warning};\n        }",
            selector,
        )
        return result

    @activity(name="Get XPath From Point", category="Web")
    def get_xpath_from_point(self, x: int, y: int) -> dict[str, str]:
        self._ensure_page()
        result = self._page.evaluate(
            "([x, y]) => {\n            const el = document.elementFromPoint(x, y);\n            if (!el) return {xpath: '', css: '', tag: '', text: ''};\n\n            function getXPath(node) {\n                if (node.id) return '//' + node.tagName.toLowerCase() + '[@id='' + node.id + '']';\n                const parts = [];\n                let cur = node;\n                while (cur && cur.nodeType === 1) {\n                    let idx = 1;\n                    let sib = cur.previousSibling;\n                    while (sib) {\n                        if (sib.nodeType === 1 && sib.tagName === cur.tagName) idx++;\n                        sib = sib.previousSibling;\n                    }\n                    const tag = cur.tagName.toLowerCase();\n                    parts.unshift(idx > 1 ? tag + '[' + idx + ']' : tag);\n                    cur = cur.parentElement;\n                }\n                return '/' + parts.join('/');\n            }\n\n            function getCSSPath(node) {\n                if (node.id) return node.tagName.toLowerCase() + '#' + CSS.escape(node.id);\n                const classes = Array.from(node.classList).slice(0, 3);\n                if (classes.length > 0) return node.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');\n                return node.tagName.toLowerCase();\n            }\n\n            return {\n                xpath: getXPath(el),\n                css: getCSSPath(el),\n                tag: el.tagName.toLowerCase(),\n                text: (el.textContent || '').trim().slice(0, 100)\n            };\n        }",
            [x, y],
        )
        return result

    def _take_failure_screenshot(self, context: str = "") -> str | None:
        if not self._screenshot_on_failure or not self._page:
            return None
        try:
            import os
            import time

            timestamp = time.strftime("%Y%m%d_%H%M%S")
            safe_context = "".join(
                c if c.isalnum() or c in "_-" else "_" for c in context
            )[:30]
            filename = os.path.join(
                self._screenshot_dir, f"failure_{timestamp}_{safe_context}.png"
            )
            self._page.screenshot(path=filename)
            logger.error(f"Failure screenshot saved: {filename}")
            return filename
        except Exception as e:
            logger.error(f"Failed to take failure screenshot: {e}")
            return None

    @activity(name="Close Page", category="Web")
    @tags("browser", "page", "close")
    def close_page(self, page_id: str | None = None) -> None:
        target_id = page_id or self._current_page_id
        if not target_id:
            raise ValueError(_("library.no_page_to_close"))
        if target_id in self._pages:
            self._pages[target_id].close()
            del self._pages[target_id]
            if target_id in self._contexts:
                context = self._contexts[target_id]
                del self._contexts[target_id]
                # The context may be shared by other pages (New Page shares the
                # current page's context). Only close it once the last owner is gone.
                refs = self._context_refs.get(id(context), 1)
                if refs <= 1:
                    self._context_refs.pop(id(context), None)
                    with contextlib.suppress(Exception):
                        context.close()
                else:
                    self._context_refs[id(context)] = refs - 1
            self._page_browser.pop(target_id, None)
            logger.info(f"Closed page: {target_id}")
        if self._current_page_id == target_id:
            self._current_page_id = next(iter(self._pages.keys()), None)

    @activity(name="Close Browser", category="Web")
    @tags("browser", "close")
    @output("List of remaining browser IDs")
    def close_browser(
        self, browser_id: str | None = None, all: bool = False
    ) -> list[str]:
        if all:
            for page_id in list(self._pages.keys()):
                with contextlib.suppress(Exception):
                    self._pages[page_id].close()
            for context_id in list(self._contexts.keys()):
                with contextlib.suppress(Exception):
                    self._contexts[context_id].close()
            for bid in list(self._browsers.keys()):
                with contextlib.suppress(Exception):
                    self._browsers[bid].close()
            self._pages.clear()
            self._contexts.clear()
            self._browsers.clear()
            self._page_browser.clear()
            self._context_refs.clear()
            self._current_browser_id = None
            self._current_page_id = None
            if self._playwright:
                self._playwright.stop()
                self._playwright = None
            logger.info(_("library.all_browsers_closed_success"))
            return []
        target_id = browser_id or self._current_browser_id
        if not target_id:
            raise ValueError(_("library.no_browser_to_close"))
        if target_id in self._browsers:
            for page_id in list(self._pages.keys()):
                if self._page_browser.get(page_id) == target_id:
                    with contextlib.suppress(Exception):
                        self._pages[page_id].close()
                    self._pages.pop(page_id, None)
                    if page_id in self._contexts:
                        context = self._contexts.pop(page_id, None)
                        refs = self._context_refs.get(id(context), 1)
                        if refs <= 1:
                            self._context_refs.pop(id(context), None)
                            with contextlib.suppress(Exception):
                                context.close()
                        else:
                            self._context_refs[id(context)] = refs - 1
                    self._page_browser.pop(page_id, None)
            self._browsers[target_id].close()
            del self._browsers[target_id]
            if not self._browsers and self._playwright:
                self._playwright.stop()
                self._playwright = None
            logger.info(f"Closed browser: {target_id}")
        if self._current_browser_id == target_id:
            self._current_browser_id = next(iter(self._browsers.keys()), None)
            self._current_page_id = (
                self._current_browser_id
                if self._current_browser_id in self._pages
                else None
            )
        return list(self._browsers.keys())

    def _ensure_page(self) -> None:
        if self._page is None:
            raise ValueError(_("library.no_browserpage_open_use_open_browser_fir"))

    def _parse_timeout(self, timeout: str) -> float:
        return _parse_time_string(timeout)


def _grid_to_records(
    grid: list[list[Any]],
    header_row: int = 1,
    max_rows: int | None = None,
) -> list[dict[str, str]]:
    """Convert a table cell grid into records keyed by column headers.

    *header_row* is the 1-based grid row whose cells name the record
    keys; rows below it become data. Duplicate header names are
    suffixed ``_2``, ``_3``, ... and blank ones fall back to
    ``column_N``. Ragged rows are padded/truncated to the header width,
    and every value is coerced to ``str`` (``None`` becomes ``""``).
    """
    if header_row < 1:
        raise ValueError(f"header_row must be >= 1, got {header_row}")
    if not grid:
        return []
    if header_row > len(grid):
        raise ValueError(
            f"header_row {header_row} is out of range for a table with "
            f"{len(grid)} row(s)"
        )
    headers = _unique_header_names([str(cell or "") for cell in grid[header_row - 1]])
    data_rows = grid[header_row:]
    if max_rows is not None:
        if max_rows < 1:
            raise ValueError(f"max_rows must be >= 1, got {max_rows}")
        data_rows = data_rows[:max_rows]
    records: list[dict[str, str]] = []
    for cells in data_rows:
        values: list[str] = []
        for index in range(len(headers)):
            cell = cells[index] if index < len(cells) else None
            values.append("" if cell is None else str(cell))
        records.append(dict(zip(headers, values, strict=True)))
    return records


def _unique_header_names(headers: list[str]) -> list[str]:
    """Return de-duplicated header names with ``_N`` suffixes on repeats."""
    counts: dict[str, int] = {}
    names: list[str] = []
    for index, name in enumerate(headers):
        base = name.strip() or f"column_{index + 1}"
        seen = counts.get(base, 0)
        counts[base] = seen + 1
        names.append(base if seen == 0 else f"{base}_{seen + 1}")
    return names


def _parse_time_string(time_str: str) -> float:
    """Parse time string to seconds (e.g., '10s', '1m', '500ms')."""
    time_str = time_str.strip().lower()
    if time_str.endswith("ms"):
        return float(time_str[:-2]) / 1000
    elif time_str.endswith("s"):
        return float(time_str[:-1])
    elif time_str.endswith("m"):
        return float(time_str[:-1]) * 60
    elif time_str.endswith("h"):
        return float(time_str[:-1]) * 3600
    else:
        try:
            return float(time_str)
        except ValueError:
            logger.warning(f"Invalid timeout format '{time_str}', defaulting to 0")
            return 0
