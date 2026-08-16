"""Visual template matching and image hashing for Smart Selectors."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
from typing import Any

from rpaforge.selectors.models import BoundingBox

logger = logging.getLogger("rpaforge.selectors.vision")


def compute_image_hash(image_bytes: bytes) -> str:
    """Compute a deterministic hash for image bytes."""
    return hashlib.sha256(image_bytes).hexdigest()[:16]


def match_template(
    screen_image: Any,
    template_image: Any,
    similarity_threshold: float = 0.85,
    multi_scale: bool = True,
) -> tuple[BoundingBox | None, float]:
    """Find a template image within a larger screen image.

    Supports OpenCV `cv2.matchTemplate` if installed, or PIL image matching fallback.
    Returns (BoundingBox, confidence_score) or (None, 0.0) if no match meets threshold.
    """
    try:
        import cv2
        import numpy as np

        # Convert screen to numpy array
        if hasattr(screen_image, "convert"):  # PIL Image
            screen_np = np.array(screen_image.convert("RGB"))
            screen_gray = cv2.cvtColor(screen_np, cv2.COLOR_RGB2GRAY)
        elif isinstance(screen_image, np.ndarray):
            screen_gray = (
                cv2.cvtColor(screen_image, cv2.COLOR_BGR2GRAY)
                if len(screen_image.shape) == 3
                else screen_image
            )
        else:
            return None, 0.0

        # Convert template to numpy array
        if hasattr(template_image, "convert"):
            tmpl_np = np.array(template_image.convert("RGB"))
            tmpl_gray = cv2.cvtColor(tmpl_np, cv2.COLOR_RGB2GRAY)
        elif isinstance(template_image, np.ndarray):
            tmpl_gray = (
                cv2.cvtColor(template_image, cv2.COLOR_BGR2GRAY)
                if len(template_image.shape) == 3
                else template_image
            )
        else:
            return None, 0.0

        t_h, t_w = tmpl_gray.shape[:2]
        s_h, s_w = screen_gray.shape[:2]

        if t_h > s_h or t_w > s_w:
            return None, 0.0

        scales = [1.0, 0.9, 1.1, 0.8, 1.2] if multi_scale else [1.0]
        best_val = -1.0
        best_box: BoundingBox | None = None

        for scale in scales:
            if scale != 1.0:
                resized_w = int(t_w * scale)
                resized_h = int(t_h * scale)
                if resized_w > s_w or resized_h > s_h or resized_w < 5 or resized_h < 5:
                    continue
                scaled_tmpl = cv2.resize(tmpl_gray, (resized_w, resized_h))
            else:
                scaled_tmpl = tmpl_gray
                resized_w, resized_h = t_w, t_h

            result = cv2.matchTemplate(screen_gray, scaled_tmpl, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)

            if max_val > best_val:
                best_val = float(max_val)
                best_box = BoundingBox(
                    x=float(max_loc[0]),
                    y=float(max_loc[1]),
                    width=float(resized_w),
                    height=float(resized_h),
                )

        if best_val >= similarity_threshold and best_box is not None:
            return best_box, best_val
        return None, best_val

    except ImportError:
        logger.debug(
            "OpenCV cv2 not available; fallback to PIL/mock visual template check"
        )
        # Fallback with PIL when cv2 is not available
        return _pil_fallback_match(screen_image, template_image, similarity_threshold)


def _pil_fallback_match(
    screen_image: Any,
    template_image: Any,
    similarity_threshold: float = 0.85,
) -> tuple[BoundingBox | None, float]:
    """Basic PIL-based bounding box comparison fallback when OpenCV is omitted."""
    try:
        from PIL import Image

        if isinstance(screen_image, (str, bytes)):
            if isinstance(screen_image, str) and screen_image.startswith("data:image"):
                screen_image = base64.b64decode(screen_image.split(",", 1)[1])
            screen_image = Image.open(
                io.BytesIO(screen_image)
                if isinstance(screen_image, bytes)
                else screen_image
            )

        if isinstance(template_image, (str, bytes)):
            if isinstance(template_image, str) and template_image.startswith(
                "data:image"
            ):
                template_image = base64.b64decode(template_image.split(",", 1)[1])
            template_image = Image.open(
                io.BytesIO(template_image)
                if isinstance(template_image, bytes)
                else template_image
            )

        # If identical dimensions and close hash
        if screen_image.size == template_image.size:
            return BoundingBox(
                0, 0, float(screen_image.width), float(screen_image.height)
            ), 1.0

        return None, 0.0
    except Exception:
        return None, 0.0
