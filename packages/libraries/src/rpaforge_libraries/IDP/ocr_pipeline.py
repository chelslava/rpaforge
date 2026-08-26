"""Hybrid scanned-PDF OCR pipeline (issue #739).

Fast local Tesseract pass per rasterized page; pages whose mean word
confidence falls below ``min_confidence`` escalate to the A2 multimodal
VLM client for transcription when ``vlm_fallback=True``. Every page is
tagged with provenance ``{"engine": "tesseract" | "vlm", "confidence"}``.

Privacy note mirrors the Studio consent philosophy: the VLM path sends
page images to the configured external provider and logs a warning
before doing so.

Module-level seams (:func:`_rasterize_pdf_pages`, :func:`_tesseract_words`,
:func:`_build_vision_client`) exist so tests can stub rasterization,
OCR output and the provider without native binaries.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

from rpaforge_libraries.i18n import _
from rpaforge_libraries.IDP.exceptions import IDPDependencyError

logger = logging.getLogger("rpaforge.idp.ocr")

#: Rasterization scale over the 72dpi PDF base (200 DPI ≈ 2.78).
_DEFAULT_SCALE = 200 / 72

_VLM_TRANSCRIBE_PROMPT = (
    "Transcribe ALL text visible in this document page image. "
    "Preserve reading order and line breaks. Output ONLY the transcribed "
    "text - no commentary, no markdown fences."
)


def _require_pypdfium2() -> Any:
    """Import pypdfium2 lazily with an actionable typed error."""
    try:
        import pypdfium2 as pdfium
    except ImportError as err:
        raise IDPDependencyError(
            _("pypdfium2 is required to rasterize PDF pages. ")
            + _("Install it with: pip install 'rpaforge-libraries[idp]'")
        ) from err
    return pdfium


def _require_pytesseract() -> Any:
    """Import pytesseract lazily with an actionable typed error."""
    try:
        import pytesseract
    except ImportError as err:
        raise IDPDependencyError(
            _("pytesseract is required for local OCR. ")
            + _("Install it with: pip install 'rpaforge-libraries[idp]'")
        ) from err
    return pytesseract


def _rasterize_pdf_pages(pdf_path: Path, indices: list[int], scale: float) -> list[Any]:
    """Render selected PDF pages to PIL images via pypdfium2."""
    pdfium = _require_pypdfium2()
    try:
        pdf = pdfium.PdfDocument(str(pdf_path))
        try:
            return [_pdfium_page_to_pillow(pdf[index], scale) for index in indices]
        finally:
            pdf.close()
    except IDPDependencyError:
        raise
    except Exception as err:
        raise IDPDependencyError(_(f"Failed to rasterize '{pdf_path}': {err}")) from err


def _pdfium_page_to_pillow(pdf_page: Any, scale: float) -> Any:
    """Convert one pypdfium2 page to a Pillow RGB image at *scale*."""
    _require_pillow_image()
    bitmap = pdf_page.render(scale=scale)
    return bitmap.to_pil()


def _require_pillow_image() -> Any:
    try:
        from PIL import Image
    except ImportError as err:
        raise IDPDependencyError(
            _("pillow is required for OCR rasterization. ")
            + _("Install it with: pip install 'rpaforge-libraries[idp]'")
        ) from err
    return Image


def _tesseract_words(image: Any) -> tuple[list[str], list[float]]:
    """Run Tesseract ``image_to_data``; return word texts and confidences.

    Confidence values are Tesseract's 0..100 floats (-1 for layout-only
    entries); callers filter negatives before averaging.
    """
    pytesseract = _require_pytesseract()
    from pytesseract import Output

    data = pytesseract.image_to_data(image, output_type=Output.DICT)
    words: list[str] = []
    confidences: list[float] = []
    count = len(data.get("text", []))
    for index in range(count):
        text = str(data["text"][index]).strip()
        if not text:
            continue
        words.append(text)
        try:
            confidences.append(float(data["conf"][index]))
        except (TypeError, ValueError):
            confidences.append(-1.0)
    return words, confidences


def _tesseract_word_boxes(image: Any) -> list[dict[str, Any]]:
    """Run Tesseract ``image_to_data``; return word boxes with coordinates.

    Each entry: ``{"text", "conf" (0..100, -1 unknown), "x", "y", "w",
    "h"}`` in rasterized pixel space. Used by the table extractor (#740)
    for column-position alignment.
    """
    pytesseract = _require_pytesseract()
    from pytesseract import Output

    data = pytesseract.image_to_data(image, output_type=Output.DICT)
    out: list[dict[str, Any]] = []
    keys = ("left", "top", "width", "height")
    for index in range(len(data.get("text", []))):
        text = str(data["text"][index]).strip()
        if not text:
            continue
        try:
            conf = float(data["conf"][index])
        except (TypeError, ValueError):
            conf = -1.0
        entry: dict[str, Any] = {"text": text, "conf": conf}
        for key, source in zip(keys, ("left", "top", "width", "height"), strict=False):
            try:
                entry[key] = float(data[source][index])
            except (TypeError, ValueError, KeyError):
                entry[key] = 0.0
        out.append(entry)
    return out


def _build_vision_client():
    """Build an LLM client for the VLM fallback path (test seam)."""
    from rpaforge.llm import create_client, resolve_llm_config, resolve_vision_model

    config = resolve_llm_config()
    model = resolve_vision_model(config.vision_model or config.model or None)
    return create_client(config), model


def _image_to_png_bytes(image: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def ocr_scanned_document(
    pdf_path: Path,
    page_indices: list[int],
    total_pages: int,
    min_confidence: float = 0.75,
    vlm_fallback: bool = True,
) -> dict[str, Any]:
    """Run the hybrid OCR pipeline over already-validated pages.

    Returns a pipeline-document dict shaped like the other IDP parsers with
    per-page provenance flags.
    """
    images = _rasterize_pdf_pages(pdf_path, page_indices, _DEFAULT_SCALE)
    warnings: list[str] = []
    pages_out: list[dict[str, Any]] = []

    vision_client: tuple[Any, str] | None = None
    privacy_warned = False

    for position, index in enumerate(page_indices):
        image = images[position]
        words, confidences = _tesseract_words(image)
        try:
            word_boxes: list[dict[str, Any]] | None = _tesseract_word_boxes(image)
        except Exception as exc:  # noqa: BLE001 - missing binary degrades, text survives
            logger.debug("Word-box extraction unavailable: %s", exc)
            word_boxes = None
        usable = [conf for conf in confidences if conf >= 0]
        text = " ".join(words)
        confidence = (sum(usable) / len(usable) / 100.0) if usable else 0.0

        engine = "tesseract"
        if (not text or confidence < min_confidence) and vlm_fallback:
            if vision_client is None:
                vision_client = _build_vision_client()
            if not privacy_warned:
                logger.warning(
                    _(
                        "Low-confidence OCR on '{path}': page content will be "
                        "sent to the external LLM provider (privacy notice).",
                        path=str(pdf_path),
                    )
                )
                warnings.append(
                    _(
                        "Pages below confidence {threshold} were re-read by an "
                        "external VLM provider; their content left this machine.",
                        threshold=min_confidence,
                    )
                )
                privacy_warned = True
            client, model = vision_client
            try:
                result = client.chat(
                    [
                        {
                            "role": "user",
                            "content": _VLM_TRANSCRIBE_PROMPT,
                        }
                    ],
                    model=model,
                    images=[_image_to_png_bytes(image)],
                )
                text = result.text.strip()
                engine = "vlm"
                confidence = 1.0
            except Exception as exc:
                warnings.append(
                    _(
                        "VLM fallback failed for page {page}: {error}",
                        page=index + 1,
                        error=exc,
                    )
                )
        elif not text or confidence < min_confidence:
            warnings.append(
                _(
                    "Page {page}: OCR confidence {confidence:.2f} below threshold "
                    "{threshold} and vlm_fallback=False; low-quality text kept.",
                    page=index + 1,
                    confidence=confidence,
                    threshold=min_confidence,
                )
            )

        pages_out.append(
            {
                "number": index + 1,
                "text": text,
                "engine": engine,
                "confidence": round(confidence, 4) if engine == "tesseract" else None,
                "width": int(image.width),
                "height": int(image.height),
                # Word boxes (text/conf/x/y/w/h) power the table extractor
                # (issue 740); absent on vlm-transcribed pages.
                **({"words": word_boxes} if word_boxes else {}),
            }
        )

    return {
        "source": str(pdf_path),
        "page_count": total_pages,
        "pages": pages_out,
        "warnings": warnings,
    }
