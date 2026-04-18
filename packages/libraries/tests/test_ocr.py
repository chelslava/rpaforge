"""Tests for OCR library."""

from __future__ import annotations

import pytest


class TestOCR:
    """Tests for OCR library."""

    def test_import_library(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.OCR import OCR

        assert hasattr(OCR, "_library_meta")
        assert OCR._library_name == "OCR"

    def test_default_language(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR()
        assert lib._lang == "eng"

    def test_default_confidence(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR()
        assert lib._min_confidence == 0.6

    def test_custom_language(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR(lang="rus")
        assert lib._lang == "rus"

    def test_custom_confidence(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR(min_confidence=0.8)
        assert lib._min_confidence == 0.8

    def test_set_ocr_language(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR()
        lib.set_ocr_language("deu")
        assert lib._lang == "deu"

    def test_set_ocr_confidence(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR()
        lib.set_ocr_confidence(0.9)
        assert lib._min_confidence == 0.9

    def test_set_ocr_confidence_invalid(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR()
        with pytest.raises(ValueError):
            lib.set_ocr_confidence(1.5)
        with pytest.raises(ValueError):
            lib.set_ocr_confidence(-0.1)


class TestOCRKeywords:
    """Tests for OCR keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.OCR import OCR

        lib = OCR()

        keywords = [
            "ocr_text_from_image",
            "ocr_text_from_screen",
            "find_text_on_screen",
            "click_text",
            "get_text_coordinates",
            "set_ocr_language",
            "set_ocr_confidence",
            "get_ocr_data",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"

    def test_ocr_text_from_image_signature(self):
        import inspect

        from rpaforge_libraries.OCR import OCR

        sig = inspect.signature(OCR.ocr_text_from_image)
        params = list(sig.parameters.keys())

        assert "path" in params
        assert "lang" in params

    def test_find_text_on_screen_signature(self):
        import inspect

        from rpaforge_libraries.OCR import OCR

        sig = inspect.signature(OCR.find_text_on_screen)
        params = list(sig.parameters.keys())

        assert "text" in params
        assert "region" in params
