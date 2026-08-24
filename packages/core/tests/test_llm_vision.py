"""Tests for multimodal image input in rpaforge.llm (issue #733).

All provider interactions run through ``httpx.MockTransport`` — no network.
Oversized fixtures are built in-test with Pillow and the wire payloads are
decoded back through Pillow to assert the downscale cap.
"""

from __future__ import annotations

import base64
import io
import json
import sys
from pathlib import Path
from typing import Any

import pytest

from rpaforge.llm import (
    DEFAULT_MAX_IMAGE_SIDE,
    AnthropicClient,
    LLMError,
    OpenAICompatClient,
    resolve_llm_config,
    resolve_max_image_side,
    resolve_vision_model,
)
from rpaforge.llm._vision import detect_media_type, prepare_images

httpx = pytest.importorskip("httpx")

PILImage = pytest.importorskip("PIL.Image")

OPENAI_BASE_URL = "https://gateway.test/v1"
ANTHROPIC_BASE_URL = "https://anthropic.test"
API_KEY = "sk-vision-test-key"

VISION_ENV_VARS = (
    "RPAFORGE_LLM_PROVIDER",
    "RPAFORGE_LLM_BASE_URL",
    "RPAFORGE_LLM_MODEL",
    "RPAFORGE_LLM_VISION_MODEL",
    "RPAFORGE_LLM_VISION_MAX_SIDE",
    "RPAFORGE_LLM_API_KEY",
)


def _clear_vision_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in VISION_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def _png_bytes(size: tuple[int, int], color: str = "red") -> bytes:
    buffer = io.BytesIO()
    PILImage.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _openai_client(handler: Any, **kwargs: Any) -> OpenAICompatClient:
    transport = httpx.MockTransport(handler)
    defaults: dict[str, Any] = {
        "base_url": OPENAI_BASE_URL,
        "api_key": API_KEY,
        "timeout": 5.0,
        "transport": transport,
    }
    defaults.update(kwargs)
    return OpenAICompatClient(**defaults)


def _anthropic_client(handler: Any, **kwargs: Any) -> AnthropicClient:
    transport = httpx.MockTransport(handler)
    defaults: dict[str, Any] = {
        "base_url": ANTHROPIC_BASE_URL,
        "api_key": API_KEY,
        "timeout": 5.0,
        "transport": transport,
    }
    defaults.update(kwargs)
    return AnthropicClient(**defaults)


def _openai_response() -> dict[str, Any]:
    return {
        "model": "gpt-test",
        "choices": [
            {
                "message": {"role": "assistant", "content": "I see it"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
    }


def _anthropic_response() -> dict[str, Any]:
    return {
        "type": "message",
        "role": "assistant",
        "model": "claude-test",
        "content": [{"type": "text", "text": "I see it"}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 10, "output_tokens": 4},
    }


def _capturing(handler_response: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.read().decode("utf-8"))
        return httpx.Response(200, json=handler_response)

    return handler, captured


class TestOpenAIMultimodalWireFormat:
    """Round-trip image+question against a mocked OpenAI-compatible server."""

    def test_single_image_renders_multipart_content(self) -> None:
        png = _png_bytes((4, 3))
        handler, captured = _capturing(_openai_response())
        result = _openai_client(handler).chat(
            [{"role": "user", "content": "What is this?"}],
            model="gpt-test",
            images=[png],
        )

        assert result.text == "I see it"
        assert captured["body"]["messages"] == [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is this?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{_b64(png)}"},
                    },
                ],
            }
        ]

    def test_multiple_images_per_message(self) -> None:
        first = _png_bytes((4, 3), "red")
        second = _png_bytes((5, 2), "blue")
        handler, captured = _capturing(_openai_response())

        _openai_client(handler).chat(
            [{"role": "user", "content": "Compare"}],
            model="gpt-test",
            images=[first, second],
        )

        content = captured["body"]["messages"][0]["content"]
        assert [part["type"] for part in content] == [
            "text",
            "image_url",
            "image_url",
        ]
        assert content[1]["image_url"]["url"] == f"data:image/png;base64,{_b64(first)}"
        assert content[2]["image_url"]["url"] == f"data:image/png;base64,{_b64(second)}"

    def test_images_attach_to_last_user_message_only(self) -> None:
        png = _png_bytes((4, 3))
        handler, captured = _capturing(_openai_response())

        _openai_client(handler).chat(
            [
                {"role": "user", "content": "first question"},
                {"role": "user", "content": "second question"},
            ],
            model="gpt-test",
            images=[png],
        )

        messages = captured["body"]["messages"]
        assert messages[0]["content"] == "first question"
        assert isinstance(messages[1]["content"], list)
        assert messages[1]["content"][0]["text"] == "second question"

    def test_images_without_user_message_raises(self) -> None:
        png = _png_bytes((4, 3))
        handler, _ = _capturing(_openai_response())

        with pytest.raises(LLMError, match="role 'user'"):
            _openai_client(handler).chat(
                [{"role": "system", "content": "be brief"}],
                model="gpt-test",
                images=[png],
            )


class TestAnthropicMultimodalWireFormat:
    """Round-trip image+question against a mocked Anthropic Messages API."""

    def test_single_image_renders_base64_source_block(self) -> None:
        png = _png_bytes((4, 3))
        handler, captured = _capturing(_anthropic_response())
        result = _anthropic_client(handler).chat(
            [{"role": "user", "content": "What is this?"}],
            model="claude-test",
            images=[png],
        )

        assert result.text == "I see it"
        assert captured["body"]["messages"] == [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is this?"},
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": _b64(png),
                        },
                    },
                ],
            }
        ]

    def test_multiple_images_per_message(self) -> None:
        first = _png_bytes((4, 3), "red")
        second = _png_bytes((5, 2), "blue")
        handler, captured = _capturing(_anthropic_response())

        _anthropic_client(handler).chat(
            [{"role": "user", "content": "Compare"}],
            model="claude-test",
            images=[first, second],
        )

        content = captured["body"]["messages"][0]["content"]
        assert [block["type"] for block in content] == ["text", "image", "image"]
        assert content[1]["source"]["media_type"] == "image/png"
        assert content[1]["source"]["data"] == _b64(first)
        assert content[2]["source"]["data"] == _b64(second)

    def test_system_message_stays_string_while_user_gets_blocks(self) -> None:
        png = _png_bytes((4, 3))
        handler, captured = _capturing(_anthropic_response())

        _anthropic_client(handler).chat(
            [
                {"role": "system", "content": "be concise"},
                {"role": "user", "content": "describe"},
            ],
            model="claude-test",
            images=[png],
        )

        body = captured["body"]
        assert body["system"] == "be concise"
        assert len(body["messages"]) == 1
        user_content = body["messages"][0]["content"]
        assert user_content[0] == {"type": "text", "text": "describe"}
        assert user_content[1]["type"] == "image"


class TestImageInputsAndDownscale:
    """Path inputs, passthrough behavior, and the max-side cap."""

    def test_path_input_matches_bytes_input(self, tmp_path: Path) -> None:
        png = _png_bytes((4, 3))
        image_path = tmp_path / "shot.png"
        image_path.write_bytes(png)
        handler, captured = _capturing(_openai_response())

        _openai_client(handler).chat(
            [{"role": "user", "content": "q"}], model="gpt-test", images=[image_path]
        )

        url = captured["body"]["messages"][0]["content"][1]["image_url"]["url"]
        assert url == f"data:image/png;base64,{_b64(png)}"

    def test_within_bounds_image_passes_through_byte_for_byte(self) -> None:
        png = _png_bytes((32, 16))
        prepared = prepare_images([png], max_side=1568)
        assert len(prepared) == 1
        assert prepared[0].data == png
        assert prepared[0].media_type == "image/png"

    def test_oversized_image_downscaled_to_constructor_cap(self) -> None:
        oversized = _png_bytes((2000, 1000))
        handler, captured = _capturing(_openai_response())

        _openai_client(handler, max_image_side=64).chat(
            [{"role": "user", "content": "tiny please"}],
            model="gpt-test",
            images=[oversized],
        )

        url = captured["body"]["messages"][0]["content"][1]["image_url"]["url"]
        assert url.startswith("data:image/png;base64,")
        payload = base64.b64decode(url.removeprefix("data:image/png;base64,"))
        with PILImage.open(io.BytesIO(payload)) as decoded:
            width, height = decoded.size
        assert width <= 64
        assert height <= 64
        assert abs(height / width - 0.5) < 0.05

    def test_env_override_caps_downscale_size(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_LLM_VISION_MAX_SIDE", "32")
        oversized = _png_bytes((1000, 500))
        handler, captured = _capturing(_openai_response())

        _openai_client(handler).chat(
            [{"role": "user", "content": "q"}], model="gpt-test", images=[oversized]
        )

        url = captured["body"]["messages"][0]["content"][1]["image_url"]["url"]
        payload = base64.b64decode(url.removeprefix("data:image/png;base64,"))
        with PILImage.open(io.BytesIO(payload)) as decoded:
            width, height = decoded.size
        assert max(width, height) <= 32

    def test_invalid_explicit_max_side_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="positive"):
            resolve_max_image_side(0)

    def test_invalid_env_max_side_falls_back_to_default(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_LLM_VISION_MAX_SIDE", "not-a-number")
        assert resolve_max_image_side() == DEFAULT_MAX_IMAGE_SIDE


class TestMediaTypeDetection:
    """Magic-byte detection with Path-suffix fallback."""

    @pytest.mark.parametrize(
        ("magic", "expected"),
        [
            pytest.param(b"\x89PNG\r\n\x1a\n....", "image/png", id="png"),
            pytest.param(b"\xff\xd8\xff\xe0junk", "image/jpeg", id="jpeg"),
            pytest.param(b"GIF89a......", "image/gif", id="gif"),
            pytest.param(b"RIFF1234WEBPVP8 ", "image/webp", id="webp"),
        ],
    )
    def test_magic_bytes_detection(self, magic: bytes, expected: str) -> None:
        assert detect_media_type(magic) == expected

    def test_suffix_fallback_for_unknown_magic(self) -> None:
        assert detect_media_type(b"\x00\x01unknown-bytes", ".PNG") == "image/png"

    def test_unsupported_format_raises_actionable_error(self) -> None:
        with pytest.raises(LLMError, match="PNG, JPEG, GIF, WebP"):
            detect_media_type(b"BM\x00\x00bitmap")


class TestVisionConfiguration:
    """vision_model and max-side resolution precedence."""

    def test_default_max_image_side_is_1568(self) -> None:
        assert DEFAULT_MAX_IMAGE_SIDE == 1568

    def test_resolve_vision_model_reads_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _clear_vision_env(monkeypatch)
        monkeypatch.setenv("RPAFORGE_LLM_VISION_MODEL", " gpt-4o-mini ")
        assert resolve_vision_model() == "gpt-4o-mini"

    def test_explicit_vision_model_overrides_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_LLM_VISION_MODEL", "env-vision")
        assert resolve_vision_model("explicit-vision") == "explicit-vision"

    def test_resolve_vision_model_defaults_to_empty(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _clear_vision_env(monkeypatch)
        assert resolve_vision_model() == ""

    def test_llm_config_includes_vision_model_from_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _clear_vision_env(monkeypatch)
        monkeypatch.setenv("RPAFORGE_LLM_VISION_MODEL", "vision-model-x")
        config = resolve_llm_config(provider="openai", model="gpt-text")
        assert config.model == "gpt-text"
        assert config.vision_model == "vision-model-x"


class TestLazyPillowImport:
    """Pillow stays optional until an image actually flows through."""

    def test_chat_with_images_without_pillow_raises_actionable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(sys.modules, "PIL", None)
        handler, _ = _capturing(_openai_response())
        client = _openai_client(handler)

        with pytest.raises(LLMError, match=r"rpaforge-core\[llm\]"):
            client.chat(
                [{"role": "user", "content": "q"}],
                model="gpt-test",
                images=[b"\x89PNG\r\n\x1a\n"],
            )
