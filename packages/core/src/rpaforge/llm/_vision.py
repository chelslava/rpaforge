"""Multimodal image-input support shared by both LLM adapters.

Images passed through ``chat(..., images=...)`` are normalized here before
being rendered into provider-specific wire formats:

- media-type detection from magic bytes (PNG, JPEG, GIF, WebP) with a
  ``Path``-suffix fallback,
- automatic downscale/re-encode of oversized images so one screenshot cannot
  blow up token cost (longest side capped, default
  :data:`rpaforge.llm.client.DEFAULT_MAX_IMAGE_SIDE`),
- lazy Pillow import with an actionable error — ``pillow`` ships in the
  optional ``[llm]`` extra and is never required at import time.

Text-only calls never enter this module: when ``images`` is omitted the
adapters keep sending plain string content exactly as before.
"""

from __future__ import annotations

import base64
import functools
import io
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import TYPE_CHECKING, Any

from rpaforge.llm.client import (
    DEFAULT_MAX_IMAGE_SIDE,
    ImageInput,
    LLMError,
    resolve_max_image_side,
)

if TYPE_CHECKING:
    from PIL import Image as PILImageModule

__all__ = [
    "PreparedImage",
    "detect_media_type",
    "last_user_message_index",
    "load_pillow",
    "prepare_images",
    "render_anthropic_blocks",
    "render_openai_content",
]

#: Media types accepted by every supported provider.
_SUFFIX_MEDIA_TYPES: dict[str, str] = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

#: Image modes the PNG encoder accepts without conversion.
_PNG_SAFE_MODES = frozenset({"1", "L", "P", "RGB", "RGBA"})


@dataclass(frozen=True)
class PreparedImage:
    """One normalized image ready to be rendered onto the wire."""

    data: bytes
    media_type: str

    @functools.cached_property
    def b64(self) -> str:
        """Return the base64-encoded payload (computed once, then cached)."""
        return base64.b64encode(self.data).decode("ascii")


def load_pillow() -> ModuleType:
    """Return the ``PIL.Image`` module with an actionable error when absent.

    Import is performed lazily so that :mod:`rpaforge.llm` stays usable
    without the optional ``[llm]`` extra; only calls that actually carry
    images require Pillow.
    """
    try:
        from PIL import Image
    except ImportError as exc:
        raise LLMError(
            "The 'pillow' package is required for multimodal (image) input. "
            "Install it with: pip install 'rpaforge-core[llm]'"
        ) from exc
    return Image


def detect_media_type(data: bytes, suffix: str | None = None) -> str:
    """Detect the MIME type from magic bytes, falling back to *suffix*.

    Only formats universally accepted by vision-capable providers are
    recognized: PNG, JPEG, GIF, and WebP. Raises :class:`LLMError` for
    anything else.
    """
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    mapped = _SUFFIX_MEDIA_TYPES.get((suffix or "").lower())
    if mapped:
        return mapped
    raise LLMError(
        "Unsupported image format for vision input "
        f"(detected {len(data)} bytes"
        + (f", suffix '{suffix}'" if suffix else "")
        + "). Supported formats: PNG, JPEG, GIF, WebP."
    )


def prepare_images(
    images: Sequence[ImageInput], *, max_side: int | None = None
) -> list[PreparedImage]:
    """Normalize every input image for the wire.

    ``max_side`` defaults to the ``RPAFORGE_LLM_VISION_MAX_SIDE``
    environment override, falling back to :data:`DEFAULT_MAX_IMAGE_SIDE`.
    Images whose longest side already fits pass through byte-for-byte;
    larger ones are downscaled and re-encoded losslessly as PNG.
    """
    if not images:
        return []
    resolved_side = max_side if max_side is not None else _resolve_max_side_from_env()
    return [prepare_image(image, max_side=resolved_side) for image in images]


def render_openai_content(
    text: str, images: Sequence[PreparedImage]
) -> str | list[dict[str, Any]]:
    """Return plain string content, or OpenAI multipart parts with images."""
    if not images:
        return text
    parts: list[dict[str, Any]] = [{"type": "text", "text": text}]
    for image in images:
        parts.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{image.media_type};base64,{image.b64}",
                },
            }
        )
    return parts


def render_anthropic_blocks(
    text: str, images: Sequence[PreparedImage]
) -> str | list[dict[str, Any]]:
    """Return plain string content, or Anthropic content blocks with images."""
    if not images:
        return text
    blocks: list[dict[str, Any]] = [{"type": "text", "text": text}]
    for image in images:
        blocks.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image.media_type,
                    "data": image.b64,
                },
            }
        )
    return blocks


def last_user_message_index(messages: Sequence[Any]) -> int:
    """Return the index of the final ``user`` message, or ``-1``."""
    for index in range(len(messages) - 1, -1, -1):
        if messages[index].get("role") == "user":
            return index
    return -1


def prepare_image(image: ImageInput, *, max_side: int) -> PreparedImage:
    """Load one image, verify its format, and downscale it when oversized.

    Images already within *max_side* are returned unchanged (no quality or
    size churn); oversized ones are resized proportionally with Lanczos
    resampling and re-encoded as PNG. Animated inputs contribute their
    first frame after resizing.
    """
    if isinstance(image, Path):
        raw = image.read_bytes()
        suffix = image.suffix
    elif isinstance(image, (bytes, bytearray)):
        raw = bytes(image)
        suffix = None
    else:
        raise LLMError(
            f"images entries must be bytes or pathlib.Path, got {type(image).__name__}."
        )
    media_type = detect_media_type(raw, suffix)
    pillow_module = load_pillow()
    try:
        with pillow_module.open(io.BytesIO(raw)) as source:
            width, height = source.size
            if max(width, height) <= max_side:
                return PreparedImage(data=raw, media_type=media_type)
            scale = max_side / float(max(width, height))
            target = (max(1, round(width * scale)), max(1, round(height * scale)))
            resized = _to_encodable_mode(source).resize(
                target, pillow_module.Resampling.LANCZOS
            )
            buffer = io.BytesIO()
            resized.save(buffer, format="PNG")
    except Exception as exc:  # noqa: BLE001 - boundary around Pillow decoding
        raise LLMError(f"Could not process image for vision input: {exc}") from exc
    return PreparedImage(data=buffer.getvalue(), media_type="image/png")


def _resolve_max_side_from_env() -> int:
    """Read ``RPAFORGE_LLM_VISION_MAX_SIDE``, tolerating invalid values."""
    try:
        return resolve_max_image_side()
    except ValueError:
        return DEFAULT_MAX_IMAGE_SIDE


def _to_encodable_mode(source: PILImageModule.Image) -> PILImageModule.Image:
    """Convert *source* to a mode the PNG encoder accepts, when needed."""
    if source.mode in _PNG_SAFE_MODES:
        return source
    if source.mode == "CMYK":
        return source.convert("RGB")
    has_alpha = "transparency" in source.info or source.mode in ("LA", "PA")
    return source.convert("RGBA" if has_alpha else "RGB")
