"""Tests for OCR library."""

from __future__ import annotations

import time

import pytest

PIL = pytest.importorskip("PIL", reason="Pillow not installed (ocr extra required)")


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


class TestCompareImages:
    """Tests for the vectorized compare_images implementation."""

    @pytest.fixture(autouse=True)
    def _tmp_dir(self, tmp_path):
        self.tmp_path = tmp_path

    def _img(self, name, size, color):
        from PIL import Image

        path = self.tmp_path / name
        Image.new("RGB", size, color).save(path)
        return str(path)

    def test_identical_images_score_one(self):
        from rpaforge_libraries.OCR import OCR

        a = self._img("a.png", (64, 64), (10, 20, 30))
        b = self._img("b.png", (64, 64), (10, 20, 30))

        assert OCR().compare_images(a, b) == 1.0

    def test_different_images_score_below_one(self):
        from rpaforge_libraries.OCR import OCR

        a = self._img("a.png", (64, 64), (0, 0, 0))
        b = self._img("b.png", (64, 64), (255, 255, 255))

        score = OCR().compare_images(a, b)
        assert 0.0 <= score < 1.0

    def test_different_size_images_handled(self):
        """Different sizes must be resized to a common resolution without error."""
        from rpaforge_libraries.OCR import OCR

        a = self._img("a.png", (64, 48), (10, 20, 30))
        b = self._img("b.png", (32, 24), (10, 20, 30))

        score = OCR().compare_images(a, b)
        assert 0.0 <= score <= 1.0

    def test_early_exit_returns_upper_bound(self):
        """A trivially different image with a low similarity bound must stop early."""
        from rpaforge_libraries.OCR import OCR

        a = self._img("a.png", (256, 256), (0, 0, 0))
        b = self._img("b.png", (256, 256), (255, 255, 255))

        # minimum_similarity low (0.9) → the two images differ enormously, so the
        # scan stops after the first blocks; the returned score must be < 0.9.
        score = OCR().compare_images(a, b, minimum_similarity=0.9)
        assert score < 0.9

    def test_early_exit_never_exceeds_exact_score(self):
        """Early-exit score must never be higher than the exact full-image score."""
        from rpaforge_libraries.OCR import OCR

        a = self._img("a.png", (128, 128), (0, 0, 0))
        b = self._img("b.png", (128, 128), (50, 50, 50))

        exact = OCR().compare_images(a, b)  # minimum_similarity default → exact
        early = OCR().compare_images(a, b, minimum_similarity=0.99)
        assert early <= exact

    def test_large_image_within_time_budget(self):
        """Full-HD-size compare with early exit must finish in a small budget."""
        from rpaforge_libraries.OCR import OCR

        # 1920x1080 solid images that differ massively — worst case without early
        # exit, trivially different with it.
        a = self._img("a.png", (1920, 1080), (0, 0, 0))
        b = self._img("b.png", (1920, 1080), (255, 255, 255))

        start = time.perf_counter()
        OCR().compare_images(a, b, minimum_similarity=0.9)
        elapsed = time.perf_counter() - start
        assert elapsed < 2.0, f"compare_images too slow: {elapsed:.3f}s"
