"""RPAForge OCR Library - Text recognition using Tesseract."""

from __future__ import annotations

import logging
import sys
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, tags
from rpaforge_libraries.i18n import _

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.ocr")


def _ensure_screen_capture() -> None:
    if sys.platform not in ("win32", "darwin"):
        raise NotImplementedError(
            _("Screen capture with PIL ImageGrab requires Windows or macOS. ")
            + _("On Linux, consider using mss library instead: pip install mss")
        )


@library(name="OCR", category="Vision", icon="🔍")
class OCR:
    """OCR text recognition library using Tesseract."""

    def __init__(self, lang: str = "eng", min_confidence: float = 0.6) -> None:
        self._lang = lang
        self._min_confidence = min_confidence

    @property
    def _tesseract(self):
        try:
            import pytesseract

            return pytesseract
        except ImportError as err:
            raise ImportError(
                "pytesseract is required for OCR library. "
                "Install it with: pip install rpaforge-libraries[ocr]"
            ) from err

    @property
    def _pillow(self):
        try:
            from PIL import Image, ImageGrab

            return Image, ImageGrab
        except ImportError as err:
            raise ImportError(
                "pillow is required for OCR library. "
                "Install it with: pip install rpaforge-libraries[ocr]"
            ) from err

    @activity(name="OCR Text From Image", category="OCR")
    @tags("ocr", "image", "text")
    @output("Recognized text")
    def ocr_text_from_image(self, path: str, lang: str | None = None) -> str:
        """Recognize text from an image file.

        :param path: Path to the image file.
        :param lang: OCR language (uses default if not specified).
        :returns: Recognized text.
        """
        Image, _ = self._pillow
        pytesseract = self._tesseract

        with Image.open(path) as image:
            text = pytesseract.image_to_string(image, lang=lang or self._lang)
        logger.info(f"OCR from image: {len(text)} characters")
        return text.strip()

    @activity(name="OCR Text From Screen", category="OCR")
    @tags("ocr", "screen", "text")
    @output("Recognized text")
    def ocr_text_from_screen(
        self, region: tuple[int, int, int, int] | None = None
    ) -> str:
        """Recognize text from screen region.

        :param region: Region as (x, y, width, height). Full screen if None.
        :returns: Recognized text.
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
        logger.info(f"OCR from screen: {len(text)} characters")
        return text.strip()

    @activity(name="Find Text On Screen", category="OCR")
    @tags("ocr", "search", "text")
    @output("Coordinates (x, y) of text center, or None if not found")
    def find_text_on_screen(
        self, text: str, region: tuple[int, int, int, int] | None = None
    ) -> tuple[int, int] | None:
        """Find text coordinates on screen.

        :param text: Text to find.
        :param region: Search region.
        :returns: Coordinates (x, y) of text center, or None if not found.
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
                logger.info(f"Found text '{text}' at ({x}, {y})")
                return (x, y)

        logger.info(f"Text '{text}' not found on screen")
        return None

    @activity(name="Click Text", category="OCR")
    @tags("ocr", "click", "text")
    def click_text(
        self,
        text: str,
        region: tuple[int, int, int, int] | None = None,
        button: str = "left",
    ) -> bool:
        """Click on text found on screen.

        :param text: Text to find and click.
        :param region: Search region.
        :param button: Mouse button ('left', 'right', 'middle').
        :returns: True if text was found and clicked, False otherwise.
        """
        coords = self.find_text_on_screen(text, region)
        if coords:
            try:
                import pyautogui

                pyautogui.click(coords[0], coords[1], button=button)
                logger.info(f"Clicked on text '{text}' at {coords}")
                return True
            except ImportError:
                logger.warning("pyautogui not installed, cannot click")
                return False
        return False

    @activity(name="Get Text Coordinates", category="OCR")
    @tags("ocr", "coordinates", "text")
    @output("Dictionary with x, y, width, height or None")
    def get_text_coordinates(
        self, text: str, region: tuple[int, int, int, int] | None = None
    ) -> dict[str, int] | None:
        """Get coordinates and dimensions of text on screen.

        :param text: Text to find.
        :param region: Search region.
        :returns: Dictionary with x, y, width, height or None.
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

        :param lang: Language code (e.g., 'eng', 'rus', 'deu').
        """
        self._lang = lang
        logger.info(f"OCR language set to: {lang}")

    @activity(name="Set OCR Confidence", category="OCR")
    @tags("ocr", "config", "confidence")
    def set_ocr_confidence(self, confidence: float) -> None:
        """Set minimum confidence threshold for text detection.

        :param confidence: Minimum confidence (0.0 to 1.0).
        """
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("Confidence must be between 0.0 and 1.0")
        self._min_confidence = confidence
        logger.info(f"OCR confidence threshold set to: {confidence}")

    @activity(name="Get OCR Data", category="OCR")
    @tags("ocr", "data", "advanced")
    @output("Dictionary with OCR data including text, coordinates, confidence")
    def get_ocr_data(
        self, region: tuple[int, int, int, int] | None = None
    ) -> list[dict[str, Any]]:
        """Get detailed OCR data from screen region.

        :param region: Screen region or None for full screen.
        :returns: List of dictionaries with text, coordinates, and confidence.
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
        :param langs: Language codes (e.g. ['eng', 'rus', 'deu']).
        :returns: Recognized text.
        """
        Image, _ = self._pillow
        pytesseract = self._tesseract
        lang_str = "+".join(langs)
        with Image.open(path) as image:
            text: str = pytesseract.image_to_string(image, lang=lang_str)
        logger.info(f"OCR multi-language ({lang_str}) on {path}")
        return text.strip()

    @activity(name="OCR With Confidence", category="OCR")
    @tags("ocr", "confidence")
    @output("List of dicts with text and confidence (0.0-1.0)")
    def ocr_with_confidence(
        self,
        path: str,
        lang: str | None = None,
        min_confidence: float | None = None,
    ) -> list[dict[str, Any]]:
        """Run OCR and return each word with its confidence score.

        :param path: Path to the image file.
        :param lang: Tesseract language code (uses library default if None).
        :param min_confidence: Filter out words below this confidence (0-1).
        :returns: List of {'text': str, 'confidence': float} dicts.
        """
        Image, _ = self._pillow
        pytesseract = self._tesseract
        threshold = (
            min_confidence if min_confidence is not None else self._min_confidence
        )
        with Image.open(path) as image:
            data = pytesseract.image_to_data(
                image,
                lang=lang or self._lang,
                output_type=pytesseract.Output.DICT,
            )
        results = []
        for i, word in enumerate(data["text"]):
            if word.strip() and data["conf"][i] >= 0:
                conf = data["conf"][i] / 100.0
                if conf >= threshold:
                    results.append({"text": word, "confidence": round(conf, 3)})
        logger.info(f"OCR with confidence: {len(results)} words above {threshold}")
        return results

    @activity(name="Compare Images", category="OCR")
    @tags("image", "compare", "diff")
    @output("Similarity score between 0.0 (different) and 1.0 (identical)")
    def compare_images(
        self,
        path1: str,
        path2: str,
    ) -> float:
        """Compare two images and return a similarity score.

        :param path1: Path to the first image.
        :param path2: Path to the second image.
        :returns: Float in [0.0, 1.0] where 1.0 means pixel-identical.
        """
        Image, _ = self._pillow
        with Image.open(path1) as f1, Image.open(path2) as f2:
            img1 = f1.convert("RGB")
            img2 = f2.convert("RGB")
        if img1.size != img2.size:
            img2 = img2.resize(img1.size, Image.LANCZOS)
        pixels1 = list(img1.getdata())
        pixels2 = list(img2.getdata())
        total = len(pixels1) * 3
        diff = sum(
            abs(a - b)
            for p1, p2 in zip(pixels1, pixels2, strict=False)
            for a, b in zip(p1, p2, strict=False)
        )
        score = round(1.0 - diff / (total * 255), 4)
        logger.info(f"Image similarity: {score}")
        return score

    @activity(name="Read Barcode", category="OCR")
    @tags("barcode", "qr", "scan")
    @output("List of decoded barcode/QR values")
    def read_barcode(self, path: str) -> list[str]:
        """Decode barcodes and QR codes from an image.

        Requires pyzbar and its native libzbar shared library.
        Install with: pip install pyzbar

        :param path: Path to the image file.
        :returns: List of decoded string values.
        """
        try:
            from pyzbar.pyzbar import decode as pyzbar_decode  # type: ignore[import]
        except ImportError as err:
            raise ImportError(
                "pyzbar is required for barcode reading. "
                "Install with: pip install pyzbar  (libzbar-0 also required on Linux)"
            ) from err
        Image, _ = self._pillow
        with Image.open(path) as image:
            decoded = pyzbar_decode(image)
        values = [obj.data.decode("utf-8") for obj in decoded]
        logger.info(f"Decoded {len(values)} barcode(s) from {path}")
        return values
