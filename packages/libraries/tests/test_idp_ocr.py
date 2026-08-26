"""Tests for the hybrid scanned-PDF OCR pipeline (issue #739).

Native binaries (tesseract, pdfium) are not required: rasterization,
Tesseract output and the VLM client go through module-level seams that
these tests stub.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import pytest

PIL = pytest.importorskip("PIL", reason="Pillow not installed")
from PIL import Image  # noqa: E402

from rpaforge_libraries.IDP import IDP, IDPDependencyError  # noqa: E402
from rpaforge_libraries.IDP import ocr_pipeline as pipeline_module  # noqa: E402

# ---------------------------------------------------------------- helpers


def _tiny_image(width: int = 40, height: int = 30) -> Any:
    return Image.new("RGB", (width, height), color=(255, 255, 255))


class _FakePdfPage:
    def render(self, _scale: float) -> Any:
        class _Bitmap:
            width = 40
            height = 30

            def to_pil(self) -> Any:
                return _tiny_image()

        return _Bitmap()


class _FakePdfDocument:
    def __init__(self, page_count: int) -> None:
        self._count = page_count

    def __getitem__(self, index: int) -> _FakePdfPage:
        return _FakePdfPage()

    def close(self) -> None:
        pass


class _ScriptedVLM:
    def __init__(self, texts: list[str]) -> None:
        self._texts = list(texts)
        self.calls: list[dict[str, Any]] = []

    def chat(self, messages, *, model, images=None, **_kwargs: Any):
        self.calls.append(
            {"messages": list(messages), "model": model, "images": list(images or [])}
        )
        from rpaforge.llm.client import LLMResult

        return LLMResult(text=self._texts.pop(0), model=model)


@pytest.fixture(autouse=True)
def _stub_rasterization(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        pipeline_module,
        "_rasterize_pdf_pages",
        lambda _path, indices, _scale: [_tiny_image() for _ in indices],
    )


def _install_tesseract(
    monkeypatch: pytest.MonkeyPatch, per_page: list[tuple[list[str], list[float]]]
) -> None:
    """Queue tesseract results consumed one per page call."""
    calls = {"n": 0}

    def _fake_words(image: Any) -> tuple[list[str], list[float]]:
        result = per_page[min(calls["n"], len(per_page) - 1)]
        calls["n"] += 1
        return result

    monkeypatch.setattr(pipeline_module, "_tesseract_words", _fake_words)

    def _fake_boxes(_image: Any) -> list[dict[str, Any]]:
        # No coordinates in these fixtures; table extraction falls back to
        # the whitespace strategy which is not under test here.
        return []

    monkeypatch.setattr(pipeline_module, "_tesseract_word_boxes", _fake_boxes)


def _pdf(tmp_path: Path) -> Path:
    # A non-empty dummy file; pypdf is only asked for the page count via
    # the IDP activity, so direct pipeline tests bypass it entirely.
    pdf = tmp_path / "scan.pdf"
    pdf.write_bytes(b"%PDF-1.4 fake")
    return pdf


# ---------------------------------------------------------------- tests


class TestDigitalTextStaysLocal:
    """Acceptance: confident pages never trigger the fallback."""

    def test_high_confidence_pages_use_tesseract_only(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install_tesseract(
            monkeypatch,
            [
                (["Hello", "world"], [95.0, 97.0]),
                (["Second", "page"], [90.0, 92.0]),
            ],
        )

        def _fail_client() -> Any:
            raise AssertionError("VLM client must not be built")

        monkeypatch.setattr(pipeline_module, "_build_vision_client", _fail_client)

        document = pipeline_module.ocr_scanned_document(
            _pdf(tmp_path), [0, 1], total_pages=2, min_confidence=0.75
        )

        assert document["warnings"] == []
        assert all(page["engine"] == "tesseract" for page in document["pages"])
        assert document["pages"][0]["text"] == "Hello world"
        assert document["pages"][0]["confidence"] == pytest.approx(0.96, abs=1e-3)
        assert document["pages"][0]["number"] == 1


class TestLowConfidenceEscalation:
    """Acceptance: low-confidence fixture escalates and merges provenance."""

    def test_low_confidence_page_escalates_to_mocked_vlm(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install_tesseract(monkeypatch, [(["garb", "led"], [40.0, 35.0])])

        vlm = _ScriptedVLM(["Clean transcribed text\nline two"])
        monkeypatch.setattr(
            pipeline_module, "_build_vision_client", lambda: (vlm, "vlm-model")
        )

        document = pipeline_module.ocr_scanned_document(
            _pdf(tmp_path), [0], total_pages=1, min_confidence=0.75
        )

        page = document["pages"][0]
        assert page["engine"] == "vlm"
        assert page["text"].startswith("Clean transcribed")
        assert page["confidence"] is None  # vlm pages carry no tesseract score
        assert any(
            "external VLM provider" in warning for warning in document["warnings"]
        )

        sent_images = vlm.calls[0]["images"]
        assert sent_images
        with Image.open(io.BytesIO(sent_images[0])) as img:
            assert img.size == (40, 30)

    def test_provenance_mixed_across_pages(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install_tesseract(
            monkeypatch,
            [
                (["Good"], [96.0]),
                (["bad"], [30.0]),
            ],
        )
        vlm = _ScriptedVLM(["Rescued page text"])
        monkeypatch.setattr(pipeline_module, "_build_vision_client", lambda: (vlm, "m"))

        document = pipeline_module.ocr_scanned_document(_pdf(tmp_path), [0, 1], 2)

        engines = [page["engine"] for page in document["pages"]]
        assert engines == ["tesseract", "vlm"]
        assert document["pages"][0]["confidence"] == pytest.approx(0.96, abs=1e-3)
        assert document["pages"][1]["text"] == "Rescued page text"


class TestOfflineDegradation:
    """Acceptance: vlm_fallback=False degrades gracefully with warnings."""

    def test_offline_mode_keeps_low_confidence_with_warning(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install_tesseract(monkeypatch, [(["blurry"], [42.0])])

        def _fail_client() -> Any:
            raise AssertionError("offline mode must not build a client")

        monkeypatch.setattr(pipeline_module, "_build_vision_client", _fail_client)

        document = pipeline_module.ocr_scanned_document(
            _pdf(tmp_path),
            [0],
            total_pages=1,
            min_confidence=0.75,
            vlm_fallback=False,
        )

        page = document["pages"][0]
        assert page["engine"] == "tesseract"
        assert page["text"] == "blurry"
        assert any("vlm_fallback=False" in warning for warning in document["warnings"])

    def test_empty_text_page_offline_warns(self, tmp_path: Path, monkeypatch) -> None:
        _install_tesseract(monkeypatch, [([], [])])
        monkeypatch.setattr(
            pipeline_module,
            "_build_vision_client",
            lambda: (_ for _ in ()).throw(AssertionError("no client offline")),
        )
        document = pipeline_module.ocr_scanned_document(
            _pdf(tmp_path), [0], 1, vlm_fallback=False
        )
        assert document["pages"][0]["confidence"] == 0.0
        assert document["warnings"]

    def test_vlm_failure_degrades_not_raises(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install_tesseract(monkeypatch, [(["weak"], [20.0])])

        class _BrokenClient:
            def chat(self, *_a: Any, **_kw: Any) -> Any:
                raise ConnectionError("provider down")

        monkeypatch.setattr(
            pipeline_module, "_build_vision_client", lambda: (_BrokenClient(), "m")
        )

        document = pipeline_module.ocr_scanned_document(_pdf(tmp_path), [0], 1)

        # Page stays on the local engine with its low confidence.
        assert document["pages"][0]["engine"] == "tesseract"
        assert any("VLM fallback failed" in w for w in document["warnings"])


class TestIDPActivityWiring:
    """Activity-level wiring through the IDP library class."""

    def test_parse_scanned_pdf_registered_and_validates_input(
        self, tmp_path: Path
    ) -> None:
        from rpaforge.core.activity import ACTIVITY_REGISTRY

        meta = ACTIVITY_REGISTRY["IDP.parse_scanned_pdf"]
        param_names = {p["name"] for p in meta.params}
        assert {"path", "pages", "min_confidence", "vlm_fallback"} <= param_names

        idp = IDP()
        missing = tmp_path / "missing.pdf"
        with pytest.raises(FileNotFoundError):
            idp.parse_scanned_pdf(str(missing))

    def test_real_pdf_rasterizes_through_pypdfium2_when_available(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        pypdf = pytest.importorskip("pypdf")
        try:
            import pypdfium2  # noqa: F401
        except ImportError:
            pytest.skip("pypdfium2 not installed")

        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=200, height=200)
        pdf_path = tmp_path / "blank.pdf"
        with open(pdf_path, "wb") as fh:
            writer.write(fh)

        seen_indices: list[list[int]] = []

        def _fake_raster(_path: Path, indices: list[int], _scale: float) -> list[Any]:
            seen_indices.append(list(indices))
            return [_tiny_image() for _ in indices]

        monkeypatch.setattr(pipeline_module, "_rasterize_pdf_pages", _fake_raster)
        _install_tesseract(monkeypatch, [(["ok"], [99.0])])
        monkeypatch.setattr(
            pipeline_module,
            "_build_vision_client",
            lambda: (_ for _ in ()).throw(AssertionError("not needed")),
        )

        idp = IDP()
        document = idp.parse_scanned_pdf(str(pdf_path), pages="1")

        assert seen_indices == [[0]]
        assert document["page_count"] == 1
        assert document["pages"][0]["engine"] == "tesseract"

    def test_missing_dependency_raises_actionable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import builtins

        real_import = builtins.__import__

        def _no_pdfium(name: str, *args: Any, **kwargs: Any) -> Any:
            if name == "pypdfium2":
                raise ImportError(name)
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", _no_pdfium)
        with pytest.raises(IDPDependencyError, match="pypdfium2"):
            pipeline_module._require_pypdfium2()
