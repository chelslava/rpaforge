"""RPAForge OCR Library - Text recognition using Tesseract."""

from __future__ import annotations

import logging
import sys
from typing import Any

from rpaforge.core.activity import activity, library, output, tags
from rpaforge_libraries.i18n import _

logger = logging.getLogger("rpaforge.ocr")


def _ensure_screen_capture() -> None:
    if sys.platform not in ("win32", "darwin"):
        raise NotImplementedError(
            _("Screen capture with PIL ImageGrab requires Windows or macOS. ")
            + _("On Linux, consider using mss library instead: pip install mss")
        )


@library(name="OCR", category="Vision", icon="🔍")
class OCR:
    """Recognize image and screen text with Tesseract.

    Python dependencies are loaded lazily so importing the library does not
    require the ``ocr`` extra. Screen capture support depends on the operating
    system and Pillow configuration; file-based activities work wherever
    Tesseract is installed.

    :param lang: Default Tesseract language code.
    :param min_confidence: Default normalized confidence threshold for
        activities that filter detected words.
    """

    def __init__(self, lang: str = "eng", min_confidence: float = 0.6) -> None:
        self._lang = lang
        self._min_confidence = min_confidence

    @property
    def _tesseract(self):
        """Return the lazily imported pytesseract module.

        :returns: The imported ``pytesseract`` module.
        :raises ImportError: If the OCR extra is not installed.
        """
        try:
            import pytesseract

            return pytesseract
        except ImportError as err:
            raise ImportError(
                _(
                    "pytesseract is required for OCR library. Install it with: pip install rpaforge-libraries[ocr]"
                )
            ) from err

    @property
    def _pillow(self):
        """Return the Pillow image and screen-capture classes.

        :returns: A tuple containing ``PIL.Image`` and ``PIL.ImageGrab``.
        :raises ImportError: If the OCR extra is not installed.
        """
        try:
            from PIL import Image, ImageGrab

            return (Image, ImageGrab)
        except ImportError as err:
            raise ImportError(
                _(
                    "pillow is required for OCR library. Install it with: pip install rpaforge-libraries[ocr]"
                )
            ) from err

    @activity(name="OCR Text From Image", category="OCR")
    @tags("ocr", "image", "text")
    @output("Recognized text")
    def ocr_text_from_image(self, path: str, lang: str | None = None) -> str:
        """Return text recognized in an image file.

        :param path: Path to the image file.
        :param lang: Tesseract language code, or ``None`` to use the library
            default.
        :returns: Recognized text with leading and trailing whitespace removed.
        :raises ImportError: If the OCR extra is not installed.
        :raises OSError: If the image cannot be opened or decoded.
        """
        Image, _ = self._pillow
        pytesseract = self._tesseract
        with Image.open(path) as image:
            text = pytesseract.image_to_string(image, lang=lang or self._lang)
        logger.info(_(f"Recognized {len(text)} characters from image"))
        return text.strip()

    @activity(name="OCR Text From Screen", category="OCR")
    @tags("ocr", "screen", "text")
    @output("Recognized text")
    def ocr_text_from_screen(
        self, region: tuple[int, int, int, int] | None = None
    ) -> str:
        """Return text recognized in a screen region.

        :param region: Region as ``(x, y, width, height)``, or ``None`` for the
            full screen.
        :returns: Recognized text with leading and trailing whitespace removed.
        :raises NotImplementedError: If screen capture is requested on an
            unsupported operating system.
        :raises ImportError: If the OCR extra is not installed.
        :raises OSError: If the screen cannot be captured.
        """
        _ensure_screen_capture()
        _, ImageGrab = self._pillow
        pytesseract = self._tesseract
        if region:
            x, y, w, h = region
            image = ImageGrab.grab(bbox=(x, y, x + w, y + h))
        else:
            image = ImageGrab.grab()
        try:
            text = pytesseract.image_to_string(image, lang=self._lang)
        finally:
            image.close()
        logger.info(_(f"Recognized {len(text)} characters from screen"))
        return text.strip()

    @activity(name="Find Text On Screen", category="OCR")
    @tags("ocr", "search", "text")
    @output("Coordinates (x, y) of text center, or None if not found")
    def find_text_on_screen(
        self, text: str, region: tuple[int, int, int, int] | None = None
    ) -> tuple[int, int] | None:
        """Find the center of matching text on screen.

        Matches are case-insensitive substrings and must meet the configured
        minimum confidence.

        :param text: Text to find.
        :param region: Region as ``(x, y, width, height)``, or ``None`` for the
            full screen.
        :returns: Absolute ``(x, y)`` coordinates of the first matching word's
            center, or ``None`` if no match is found.
        :raises ImportError: If the OCR extra is not installed.
        :raises OSError: If the screen cannot be captured.
        """
        data = self._get_ocr_data(region)
        for i, word in enumerate(data["text"]):
            if (
                text.lower() in word.lower()
                and data["conf"][i] >= self._min_confidence * 100
            ):
                x = data["left"][i] + data["width"][i] // 2
                y = data["top"][i] + data["height"][i] // 2
                if region:
                    x += region[0]
                    y += region[1]
                logger.info(_("Found text {text} at ({x}, {y})", text=text, x=x, y=y))
                return (x, y)
        logger.info(_("Text {text} not found on screen", text=text))
        return None

    @activity(name="Click Text", category="OCR")
    @tags("ocr", "click", "text")
    def click_text(
        self,
        text: str,
        region: tuple[int, int, int, int] | None = None,
        button: str = "left",
    ) -> bool:
        """Click the first matching text found on screen.

        :param text: Text to find and click.
        :param region: Region as ``(x, y, width, height)``, or ``None`` for the
            full screen.
        :param button: Mouse button, such as ``"left"``, ``"right"`` or
            ``"middle"``.
        :returns: ``True`` if matching text was clicked; ``False`` if it was not
            found or PyAutoGUI is unavailable.
        :raises ImportError: If the Pillow or pytesseract dependency is missing.
        :raises OSError: If the screen cannot be captured.
        """
        coords = self.find_text_on_screen(text, region)
        if coords:
            try:
                import pyautogui

                pyautogui.click(coords[0], coords[1], button=button)
                logger.info(
                    _("Clicked on text {text} at {coords}", text=text, coords=coords)
                )
                return True
            except ImportError:
                logger.warning(_("pyautogui not installed, cannot click"))
                return False
        return False

    @activity(name="Get Text Coordinates", category="OCR")
    @tags("ocr", "coordinates", "text")
    @output("Dictionary with x, y, width, height or None")
    def get_text_coordinates(
        self, text: str, region: tuple[int, int, int, int] | None = None
    ) -> dict[str, int] | None:
        """Return the bounding box of matching text on screen.

        :param text: Text to find.
        :param region: Region as ``(x, y, width, height)``, or ``None`` for the
            full screen.
        :returns: A dict with absolute ``x`` and ``y`` coordinates plus ``width``
            and ``height``, or ``None`` if no match is found.
        :raises ImportError: If the OCR extra is not installed.
        :raises OSError: If the screen cannot be captured.
        """
        data = self._get_ocr_data(region)
        for i, word in enumerate(data["text"]):
            if (
                text.lower() in word.lower()
                and data["conf"][i] >= self._min_confidence * 100
            ):
                x = data["left"][i]
                y = data["top"][i]
                w = data["width"][i]
                h = data["height"][i]
                if region:
                    x += region[0]
                    y += region[1]
                return {"x": x, "y": y, "width": w, "height": h}
        return None

    @activity(name="Set OCR Language", category="OCR")
    @tags("ocr", "config", "language")
    def set_ocr_language(self, lang: str) -> None:
        """Set OCR language for subsequent operations.

        :param lang: Tesseract language code, for example ``"eng"``, ``"rus"``
            or ``"deu"``.
        :returns: ``None``.
        """
        self._lang = lang
        logger.info(_("ocr_language_set_to", lang=lang))

    @activity(name="Set OCR Confidence", category="OCR")
    @tags("ocr", "config", "confidence")
    def set_ocr_confidence(self, confidence: float) -> None:
        """Set minimum confidence threshold for text detection.

        :param confidence: Minimum confidence in the inclusive range ``0.0`` to
            ``1.0``.
        :returns: ``None``.
        :raises ValueError: If *confidence* is outside ``0.0`` to ``1.0``.
        """
        if not 0.0 <= confidence <= 1.0:
            raise ValueError(_("Confidence must be between 0.0 and 1.0"))
        self._min_confidence = confidence
        logger.info(_("ocr_confidence_threshold_set_to", confidence=confidence))

    @activity(name="Get OCR Data", category="OCR")
    @tags("ocr", "data", "advanced")
    @output("Dictionary with OCR data including text, coordinates, confidence")
    def get_ocr_data(
        self, region: tuple[int, int, int, int] | None = None
    ) -> list[dict[str, Any]]:
        """Return detailed OCR data from a screen region.

        :param region: Region as ``(x, y, width, height)``, or ``None`` for the
            full screen.
        :returns: A list of dicts containing ``text``, absolute ``x`` and ``y``
            coordinates, ``width``, ``height`` and normalized ``confidence``.
        :raises ImportError: If the OCR extra is not installed.
        :raises OSError: If the screen cannot be captured.
        """
        data = self._get_ocr_data(region)
        results = []
        for i in range(len(data["text"])):
            if data["text"][i].strip() and data["conf"][i] > 0:
                item = {
                    "text": data["text"][i],
                    "x": data["left"][i],
                    "y": data["top"][i],
                    "width": data["width"][i],
                    "height": data["height"][i],
                    "confidence": data["conf"][i] / 100.0,
                }
                if region:
                    item["x"] += region[0]
                    item["y"] += region[1]
                results.append(item)
        return results

    def _get_ocr_data(self, region: tuple | None = None) -> dict:
        """Get raw OCR data from screen."""
        _, ImageGrab = self._pillow
        pytesseract = self._tesseract
        if region:
            x, y, w, h = region
            image = ImageGrab.grab(bbox=(x, y, x + w, y + h))
        else:
            image = ImageGrab.grab()
        try:
            return pytesseract.image_to_data(
                image, lang=self._lang, output_type=pytesseract.Output.DICT
            )
        finally:
            image.close()

    @activity(name="OCR Multi Language", category="OCR")
    @tags("ocr", "multi-language")
    @output("Recognized text combining all specified languages")
    def ocr_multi_language(self, path: str, langs: list[str]) -> str:
        """Run OCR with multiple Tesseract language packs.

        :param path: Path to the image file.
        :param langs: Tesseract language codes, for example ``["eng", "rus"]``.
        :returns: Recognized text with leading and trailing whitespace removed.
        :raises ImportError: If the OCR extra is not installed.
        :raises OSError: If the image cannot be opened or decoded.
        """
        Image, _ = self._pillow
        pytesseract = self._tesseract
        lang_str = "+".join(langs)
        with Image.open(path) as image:
            text: str = pytesseract.image_to_string(image, lang=lang_str)
        logger.info(_("ocr_multilanguage_on", lang_str=lang_str, path=path))
        return text.strip()

    @activity(name="OCR With Confidence", category="OCR")
    @tags("ocr", "confidence")
    @output("List of dicts with text and confidence (0.0-1.0)")
    def ocr_with_confidence(
        self, path: str, lang: str | None = None, min_confidence: float | None = None
    ) -> list[dict[str, Any]]:
        """Run OCR and return each word with its confidence score.

        :param path: Path to the image file.
        :param lang: Tesseract language code, or ``None`` to use the library
            default.
        :param min_confidence: Minimum normalized confidence, or ``None`` to use
            the library default.
        :returns: A list of ``{"text": str, "confidence": float}`` dicts for
            words that meet the confidence threshold.
        :raises ImportError: If the OCR extra is not installed.
        :raises OSError: If the image cannot be opened or decoded.
        """
        Image, _ = self._pillow
        pytesseract = self._tesseract
        threshold = (
            min_confidence if min_confidence is not None else self._min_confidence
        )
        with Image.open(path) as image:
            data = pytesseract.image_to_data(
                image, lang=lang or self._lang, output_type=pytesseract.Output.DICT
            )
        results = []
        for i, word in enumerate(data["text"]):
            if word.strip() and data["conf"][i] >= 0:
                conf = data["conf"][i] / 100.0
                if conf >= threshold:
                    results.append({"text": word, "confidence": round(conf, 3)})
        logger.info(
            _(
                "ocr_with_confidence_words_above",
                count=len(results),
                threshold=threshold,
            )
        )
        return results

    @activity(name="Compare Images", category="OCR")
    @tags("image", "compare", "diff")
    @output("Similarity score between 0.0 (different) and 1.0 (identical)")
    def compare_images(
        self,
        path1: str,
        path2: str,
        minimum_similarity: float | None = 1.0,
    ) -> float:
        """Compare two images and return a similarity score.

        The comparison is vectorized (no pure-Python pixel loop): the per-pixel
        absolute difference is computed by Pillow's ``ImageChops.difference`` and
        aggregated with ``ImageStat.Stat``.  This replaces the old implementation
        that materialized every pixel into lists and ran a triple-nested Python
        loop — a multi-hundred-MB, seconds-to-minutes cost on full-HD/4K images.

        Passing a positive *minimum_similarity* enables an early exit when the
        scanned blocks already differ beyond that threshold. Pass ``None`` or
        ``0.0`` to scan the whole image and return the exact
        ``1 - mean_diff / 255`` score.

        :param path1: Path to the first image.
        :param path2: Path to the second image.
        :param minimum_similarity: Early-exit bound in [0.0, 1.0]; ``None`` (or
            ``0.0``) disables early exit and always returns the exact score.
        :returns: A float in ``[0.0, 1.0]`` where ``1.0`` means pixel-identical.
        :raises ImportError: If Pillow is not installed.
        :raises OSError: If either image cannot be opened or decoded.
        """
        from PIL import ImageChops, ImageStat

        Image, _igrab = self._pillow
        with Image.open(path1) as f1, Image.open(path2) as f2:
            img1 = f1.convert("RGB")
            img2 = f2.convert("RGB")
        if img1.size != img2.size:
            img2 = img2.resize(img1.size, Image.LANCZOS)

        if minimum_similarity is None or minimum_similarity <= 0.0:
            early_exit = None
        else:
            early_exit = (1.0 - minimum_similarity) * 255.0

        diff = ImageChops.difference(img1, img2)
        width, height = diff.size
        # Scan in horizontal blocks so an early exit can stop before reading the
        # whole diff for grossly different inputs.
        block_height = max(1, (height + 15) // 16)
        mean_diff = 0.0
        seen_pixels = 0
        for top in range(0, height, block_height):
            block = diff.crop((0, top, width, min(top + block_height, height)))
            stat = ImageStat.Stat(block)
            block_pixels = block.size[0] * block.size[1]
            block_mean = sum(stat.mean) / 3.0
            # Running mean over all pixels seen so far.
            mean_diff = (mean_diff * seen_pixels + block_mean * block_pixels) / (
                seen_pixels + block_pixels
            )
            seen_pixels += block_pixels
            if early_exit is not None and mean_diff > early_exit:
                # Even if every remaining pixel were identical, mean_diff can no
                # longer drop back below early_exit, so the true score is below
                # minimum_similarity — stop scanning and return the upper bound.
                break

        score = round(1.0 - min(mean_diff, 255.0) / 255.0, 4)
        logger.info(_("image_similarity", score=score))
        return score

    @activity(name="Read Barcode", category="OCR")
    @tags("barcode", "qr", "scan")
    @output("List of decoded barcode/QR values")
    def read_barcode(self, path: str) -> list[str]:
        """Decode barcodes and QR codes from an image.

        Requires pyzbar and its native libzbar shared library.

        :param path: Path to the image file.
        :returns: List of decoded string values.
        :raises ImportError: If pyzbar or its native libzbar dependency is
            unavailable.
        :raises OSError: If the image cannot be opened or decoded.
        :raises UnicodeDecodeError: If a decoded payload is not valid UTF-8.
        """
        try:
            from pyzbar.pyzbar import decode as pyzbar_decode
        except ImportError as err:
            raise ImportError(
                _(
                    "pyzbar is required for barcode reading. Install with: pip install pyzbar  (libzbar-0 also required on Linux)"
                )
            ) from err
        Image, ImageGrab = self._pillow
        with Image.open(path) as image:
            decoded = pyzbar_decode(image)
        values = [obj.data.decode("utf-8") for obj in decoded]
        logger.info(_("decoded_barcodes_from", count=len(values), path=path))
        return values
