"""RPAForge OCR Library - Text recognition using Tesseract."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.ocr")


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

        image = Image.open(path)
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
        _, ImageGrab = self._pillow
        pytesseract = self._tesseract

        if region:
            x, y, w, h = region
            image = ImageGrab.grab(bbox=(x, y, x + w, y + h))
        else:
            image = ImageGrab.grab()

        text = pytesseract.image_to_string(image, lang=self._lang)
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

        return pytesseract.image_to_data(
            image, lang=self._lang, output_type=pytesseract.Output.DICT
        )
