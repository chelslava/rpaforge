"""
RPAForge Spy Library.

Global element picker for Web (CDP) and Desktop (UI Automation).
"""

from __future__ import annotations

import ctypes
import json
import logging
import sys
from typing import Any

from rpaforge_libraries.i18n import _

if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

logger = logging.getLogger("rpaforge.spy")


def get_mouse_position() -> tuple[int, int]:
    if sys.platform != "win32":
        raise NotImplementedError(
            _("get_mouse_position requires Windows. ")
            + _(
                "Use get_element_at_point_web for browser-based element picking on other platforms."
            )
        )
    try:

        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        return int(pt.x), int(pt.y)
    except Exception as e:
        logger.error(f"Failed to get mouse position: {e}")
        raise


def get_element_at_point_web(x: int, y: int) -> dict[str, Any] | None:
    """Get element at coordinates via Chrome DevTools Protocol (CDP).

    Requires Chrome with: chrome --remote-debugging-port=9222
    """
    import urllib.request

    try:
        response = urllib.request.urlopen("http://localhost:9222/json", timeout=2)
        data = json.loads(response.read().decode())

        for target in data:
            if target.get("type") not in ("page", "iframe"):
                continue
            ws_url = target.get("webSocketDebuggerUrl")
            if not ws_url:
                continue
            return _get_element_via_cdp(ws_url, x, y)
        return None
    except Exception as e:
        logger.debug(f"CDP connection failed: {e}")
        return None


def _get_element_via_cdp(ws_url: str, x: int, y: int) -> dict[str, Any] | None:
    """Get element via WebSocket CDP connection (blocking)."""
    try:
        import websocket

        ws = websocket.create_connection(ws_url, timeout=5)
        try:
            expression = f"""
(function() {{
    var el = document.elementFromPoint({x}, {y});
    if (!el) return null;

    function getXPath(node) {{
        if (node.id) return '//' + node.tagName.toLowerCase() + '[@id="' + node.id + '"]';
        var parts = [];
        var cur = node;
        while (cur && cur.nodeType === 1) {{
            var idx = 1;
            var sib = cur.previousSibling;
            while (sib) {{
                if (sib.nodeType === 1 && sib.tagName === cur.tagName) idx++;
                sib = sib.previousSibling;
            }}
            parts.unshift(cur.tagName.toLowerCase() + (idx > 1 ? '[' + idx + ']' : ''));
            cur = cur.parentElement;
        }}
        return '/' + parts.join('/');
    }}

    function getCSSPath(node) {{
        if (node.id) return node.tagName.toLowerCase() + '#' + node.id;
        var cls = Array.prototype.slice.call(node.classList, 0, 3);
        if (cls.length > 0) return node.tagName.toLowerCase() + '.' + cls.join('.');
        return node.tagName.toLowerCase();
    }}

    var rect = el.getBoundingClientRect();
    return {{
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: Array.prototype.slice.call(el.classList, 0, 10),
        text: (el.textContent || '').trim().substring(0, 100),
        xpath: getXPath(el),
        cssPath: getCSSPath(el),
        rect: {{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }},
        reliableSelector: el.id
            ? {{type: 'id', value: '#' + el.id, reliability: 1.0}}
            : {{type: 'css', value: getCSSPath(el), reliability: 0.6}}
    }};
}})();"""

            ws.send(
                json.dumps(
                    {
                        "id": 1,
                        "method": "Runtime.evaluate",
                        "params": {"expression": expression, "returnByValue": True},
                    }
                )
            )

            response = ws.recv()
            result = json.loads(response)

            if result.get("result", {}).get("result", {}).get("value"):
                return result["result"]["result"]["value"]
            return None
        finally:
            ws.close()
    except Exception as e:
        logger.debug(f"CDP fetch failed: {e}")
        return None


def get_element_at_point_desktop(x: int, y: int) -> dict[str, Any] | None:
    """Get element at coordinates via Windows UI Automation."""
    if sys.platform != "win32":
        logger.debug("get_element_at_point_desktop requires Windows")
        return None
    try:
        import uiautomation as ua
    except ImportError:
        logger.warning("uiautomation not installed. Run: pip install uiautomation")
        return None

    try:
        ua.UIAutomationInitializerInThread()
        element = ua.ControlFromPoint(x, y)
        if not element:
            logger.debug(f"No element found at point ({x}, {y})")
            return None

        automation_id = str(element.AutomationId) if element.AutomationId else ""
        name = str(element.Name) if element.Name else ""
        class_name = str(element.ClassName) if element.ClassName else ""

        rect_data = None
        rect = element.BoundingRectangle
        if rect:
            rect_data = {
                "x": int(rect.left),
                "y": int(rect.top),
                "width": int(rect.width()) if callable(rect.width) else int(rect.width),
                "height": (
                    int(rect.height()) if callable(rect.height) else int(rect.height)
                ),
            }

        if automation_id:
            sel_value = f"id:{automation_id}"
            reliability = 1.0
            sel_type = "id"
        elif name and len(name) < 100:
            sel_value = f"name:{name}"
            reliability = 0.75
            sel_type = "name"
        elif class_name:
            sel_value = f"class:{class_name}"
            reliability = 0.5
            sel_type = "class"
        else:
            sel_value = ""
            reliability = 0.1
            sel_type = "none"

        result = {
            "tag": class_name or "Control",
            "id": automation_id or None,
            "classes": [class_name] if class_name else [],
            "text": name[:50] if name else "",
            "xpath": f"//*[@name='{name[:30]}']" if name else "",
            "cssPath": sel_value,
            "reliableSelector": {
                "type": sel_type,
                "value": sel_value,
                "reliability": reliability,
            },
            "rect": rect_data,
        }
        logger.debug(f"Captured element: {result}")
        return result
    except Exception as e:
        logger.debug(f"Desktop element capture failed: {e}")
        import traceback

        traceback.print_exc()
        return None
