"""Tests for Bridge Server."""

from __future__ import annotations

import json
import logging
import runpy
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from rpaforge import StudioEngine
from rpaforge.bridge.server import BridgeLogHandler, BridgeServer, main


class TestBridgeLogHandler:
    """Tests for BridgeLogHandler."""

    def test_emit_debug(self):
        """Test emitting debug log record."""
        emit_callback = MagicMock()
        handler = BridgeLogHandler(emit_callback)

        record = MagicMock()
        record.name = "test"
        record.levelno = logging.DEBUG
        record.getMessage = lambda: "debug message"
        record.exc_text = None
        record.exc_info = None
        record.stack_info = None

        handler.emit(record)

        emit_callback.assert_called_once()
        event = emit_callback.call_args[0][0]
        assert event["type"] == "log"
        assert event["level"] == "debug"
        assert event["message"] == "debug message"
        assert event["source"] == "test"

    def test_emit_info(self):
        """Test emitting info log record."""
        emit_callback = MagicMock()
        handler = BridgeLogHandler(emit_callback)

        record = MagicMock()
        record.name = "test"
        record.levelno = logging.INFO
        record.getMessage.return_value = "info message"
        record.exc_text = None
        record.exc_info = None

        handler.emit(record)

        event = emit_callback.call_args[0][0]
        assert event["level"] == "info"

    def test_emit_warning(self):
        """Test emitting warning log record."""
        emit_callback = MagicMock()
        handler = BridgeLogHandler(emit_callback)

        record = MagicMock()
        record.name = "test"
        record.levelno = logging.WARNING
        record.getMessage.return_value = "warn message"
        record.exc_text = None
        record.exc_info = None

        handler.emit(record)

        event = emit_callback.call_args[0][0]
        assert event["level"] == "warn"

    def test_emit_error(self):
        """Test emitting error log record."""
        emit_callback = MagicMock()
        handler = BridgeLogHandler(emit_callback)

        record = MagicMock()
        record.name = "test"
        record.levelno = logging.ERROR
        record.getMessage.return_value = "error message"
        record.exc_text = None
        record.exc_info = None

        handler.emit(record)

        event = emit_callback.call_args[0][0]
        assert event["level"] == "error"

    def test_emit_critical_maps_to_error(self):
        """Test that critical log level maps to error."""
        emit_callback = MagicMock()
        handler = BridgeLogHandler(emit_callback)

        record = MagicMock()
        record.name = "test"
        record.levelno = logging.CRITICAL
        record.getMessage.return_value = "critical message"
        record.exc_text = None
        record.exc_info = None

        handler.emit(record)

        event = emit_callback.call_args[0][0]
        assert event["level"] == "error"

    def test_emit_unknown_level_defaults_to_info(self):
        """Test that unknown log level defaults to info."""
        emit_callback = MagicMock()
        handler = BridgeLogHandler(emit_callback)

        record = MagicMock()
        record.name = "test"
        record.levelno = 9999
        record.getMessage.return_value = "unknown level"
        record.exc_text = None
        record.exc_info = None

        handler.emit(record)

        event = emit_callback.call_args[0][0]
        assert event["level"] == "info"


class TestBridgeServer:
    """Tests for BridgeServer."""

    @pytest.fixture
    def engine(self):
        """Create a mock engine."""
        return StudioEngine()

    @pytest.fixture
    def server(self, engine):
        """Create a bridge server."""
        return BridgeServer(engine)

    def test_init(self, server, engine):
        """Test server initialization."""
        assert server._engine is engine
        assert server._running is False
        assert server._shutting_down is False
        assert server._input_buffer == ""
        assert server._output_lock is not None
        assert server._log_handler is None

    def test_stop(self, server):
        """Test stopping the server."""
        server._running = True
        server.stop()
        assert server._running is False

    @pytest.mark.asyncio
    async def test_shutdown_first_call(self, server):
        """Test shutdown first call."""
        server._shutting_down = False
        server._running = True

        with patch.object(server, "_log") as mock_log:
            with patch.object(
                server, "_emit_event", new_callable=AsyncMock
            ) as mock_emit:
                await server.shutdown("test reason")

                mock_log.assert_called_with("Bridge shutting down: test reason")
                mock_emit.assert_called_once()
                assert server._shutting_down is True
                assert server._running is False

    @pytest.mark.asyncio
    async def test_shutdown_idempotent(self, server):
        """Test that shutdown is idempotent."""
        server._shutting_down = True

        with patch.object(server, "_log") as mock_log:
            with patch.object(
                server, "_emit_event", new_callable=AsyncMock
            ) as mock_emit:
                await server.shutdown("second reason")

                mock_log.assert_not_called()
                mock_emit.assert_not_called()

    def test_emit_event_sync_without_loop(self, server):
        """Test emit_event_sync when no event loop is set."""
        server._event_loop = None
        server._emit_event_sync({})

    def test_emit_event_sync_with_loop(self, server):
        """Test emit_event_sync when event loop is set."""
        server._event_loop = MagicMock()
        server._event_loop.call_soon_threadsafe = MagicMock()

        with patch("asyncio.create_task", new_callable=AsyncMock):
            server._emit_event_sync({})
            server._event_loop.call_soon_threadsafe.assert_called_once()


class TestBridgeServerProcessMessage:
    """Tests for message processing."""

    @pytest.fixture
    def server(self):
        """Create a bridge server with mocked handlers."""
        engine = StudioEngine()
        server = BridgeServer(engine)
        server._method_handlers = {
            "test.method": MagicMock(return_value={"result": "ok"}),
            "async.method": MagicMock(
                return_value=AsyncMock(return_value={"result": "async"})
            ),
        }
        return server

    @pytest.mark.asyncio
    async def test_process_message_invalid_json(self, server):
        """Test processing invalid JSON."""
        with patch("rpaforge.bridge.server.parse_message", return_value=None):
            with patch.object(
                server, "_send_error", new_callable=AsyncMock
            ) as mock_send_error:
                await server._process_message("invalid json")

                mock_send_error.assert_called_once()
                args = mock_send_error.call_args[0]
                assert args[1] == -32700

    @pytest.mark.asyncio
    async def test_process_message_notification_ignored(self, server):
        """Test that notifications are ignored."""
        from rpaforge.bridge.protocol import JSONRPCNotification

        notification = JSONRPCNotification(method="event", params={})
        with patch("rpaforge.bridge.server.parse_message", return_value=notification):
            with patch.object(
                server, "_send_error", new_callable=AsyncMock
            ) as mock_send_error:
                await server._process_message('{"jsonrpc": "2.0", "method": "event"}')

                mock_send_error.assert_not_called()

    @pytest.mark.asyncio
    async def test_process_message_method_not_found(self, server):
        """Test processing message with unknown method."""
        from rpaforge.bridge.protocol import JSONRPCRequest

        request = JSONRPCRequest(id=1, method="unknown.method", params={})
        with patch("rpaforge.bridge.server.parse_message", return_value=request):
            with patch.object(
                server, "_send_error", new_callable=AsyncMock
            ) as mock_send_error:
                await server._process_message(
                    '{"jsonrpc": "2.0", "method": "unknown", "id": 1}'
                )

                mock_send_error.assert_called_once()
                args = mock_send_error.call_args[0]
                assert args[1] == -32601

    @pytest.mark.asyncio
    async def test_process_message_success(self, server):
        """Test successful message processing."""
        from rpaforge.bridge.protocol import JSONRPCRequest

        server._method_handlers["test.method"].return_value = {"result": "ok"}
        request = JSONRPCRequest(id=1, method="test.method", params={})

        with patch("rpaforge.bridge.server.parse_message", return_value=request):
            with patch.object(
                server, "_send_response", new_callable=AsyncMock
            ) as mock_send_response:
                await server._process_message(
                    '{"jsonrpc": "2.0", "method": "test.method", "id": 1}'
                )

                mock_send_response.assert_called_once_with(1, {"result": "ok"})

    @pytest.mark.asyncio
    async def test_process_message_async_handler(self, server):
        """Test processing message with async handler."""
        from rpaforge.bridge.protocol import JSONRPCRequest

        async def async_handler(params):
            return {"result": "async"}

        server._method_handlers["async.method"] = async_handler
        request = JSONRPCRequest(id=2, method="async.method", params={})

        with patch("rpaforge.bridge.server.parse_message", return_value=request):
            with patch.object(
                server, "_send_response", new_callable=AsyncMock
            ) as mock_send_response:
                await server._process_message(
                    '{"jsonrpc": "2.0", "method": "async.method", "id": 2}'
                )

                mock_send_response.assert_called_once_with(2, {"result": "async"})


class TestBridgeServerOutput:
    """Tests for output handling."""

    @pytest.fixture
    def server(self):
        """Create a bridge server."""
        engine = StudioEngine()
        return BridgeServer(engine)

    @pytest.mark.asyncio
    async def test_send_response(self, server):
        """Test sending response."""
        with patch.object(sys.stdout, "write") as mock_write:
            with patch.object(sys.stdout, "flush"):
                await server._send_response(1, {"result": "ok"})

                mock_write.assert_called_once()
                response_data = json.loads(mock_write.call_args[0][0])
                assert response_data["jsonrpc"] == "2.0"
                assert response_data["id"] == 1
                assert response_data["result"] == {"result": "ok"}

    @pytest.mark.asyncio
    async def test_send_error(self, server):
        """Test sending error response."""
        from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

        error = JSONRPCError(
            code=JSONRPCErrorCode.INVALID_PARAMS, message="Invalid params"
        )
        with patch.object(sys.stdout, "write") as mock_write:
            with patch.object(sys.stdout, "flush"):
                await server._send_error(1, error.code, error.message)

                mock_write.assert_called_once()
                response_data = json.loads(mock_write.call_args[0][0])
                assert response_data["jsonrpc"] == "2.0"
                assert response_data["id"] == 1
                assert response_data["error"]["code"] == -32602

    @pytest.mark.asyncio
    async def test_emit_event(self, server):
        """Test emitting event notification."""
        event_dict = {"type": "processStarted", "data": {"id": 123}}
        with patch.object(sys.stdout, "write") as mock_write:
            with patch.object(sys.stdout, "flush"):
                await server._emit_event(event_dict)

                mock_write.assert_called_once()
                response_data = json.loads(mock_write.call_args[0][0])
                assert response_data["jsonrpc"] == "2.0"
                assert response_data["method"] == "processStarted"
                assert response_data["params"]["type"] == "processStarted"


class TestBridgeServerLogging:
    """Tests for logging setup/teardown."""

    @pytest.fixture
    def server(self):
        """Create a bridge server."""
        return BridgeServer(StudioEngine())

    def test_setup_logging(self, server):
        """Test logging setup."""
        server._setup_logging()

        assert server._log_handler is not None
        assert server._log_handler.level == logging.DEBUG

    def test_teardown_logging(self, server):
        """Test logging teardown."""
        server._setup_logging()
        server._teardown_logging()

        assert server._log_handler is None

    def test_log_method(self, server):
        """Test _log method writes via logging."""
        with patch("rpaforge.bridge.server.logging.getLogger") as mock_get_logger:
            mock_logger = MagicMock()
            mock_get_logger.return_value = mock_logger
            server._log("test message", "debug")
            mock_get_logger.assert_called_once_with("rpaforge.bridge.server")
            mock_logger.log.assert_called_once_with(logging.DEBUG, "test message")


class TestBridgeServerMain:
    """Tests for main entry point."""

    @pytest.mark.asyncio
    async def test_main_success(self):
        """Test main entry point with successful initialization."""
        with patch("rpaforge.StudioEngine") as mock_engine_class:
            mock_engine = MagicMock()
            mock_engine_class.return_value = mock_engine

            with patch.object(
                BridgeServer, "start", new_callable=AsyncMock
            ) as mock_start:
                await main()

                mock_engine_class.assert_called_once()
                mock_start.assert_called_once()
                mock_engine.close.assert_called_once()

    def test_bridge_entrypoint_enables_multiprocessing_bootstrap(self):
        """Test the frozen bridge initializes multiprocessing support."""
        with patch("multiprocessing.freeze_support") as mock_freeze_support:
            with patch("asyncio.run") as mock_asyncio_run:
                runpy.run_module("rpaforge.bridge.__main__", run_name="__main__")

                mock_freeze_support.assert_called_once()
                mock_asyncio_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_main_error(self):
        """Test main entry point with initialization error."""
        with patch("rpaforge.StudioEngine", side_effect=Exception("Init failed")):
            with patch.object(sys.stderr, "write") as mock_write:
                with patch.object(sys.stderr, "flush"):
                    with pytest.raises(Exception, match="Init failed"):
                        await main()

                    mock_write.assert_called()


class TestReadLoopSelection:
    """Tests for read loop selection based on platform."""

    @pytest.fixture
    def server(self):
        """Create a bridge server."""
        return BridgeServer(StudioEngine())

    @pytest.mark.asyncio
    async def test_read_loop_windows(self, server):
        """Test Windows read loop selection."""
        with patch.object(
            server, "_read_loop_sync", new_callable=AsyncMock
        ) as mock_sync:
            with patch("sys.platform", "win32"):
                server._running = True
                await server._read_loop()
                mock_sync.assert_called_once()

    @pytest.mark.asyncio
    async def test_read_loop_unix(self, server):
        """Test Unix read loop selection."""
        with patch.object(
            server, "_read_loop_unix", new_callable=AsyncMock
        ) as mock_unix:
            with patch("sys.platform", "linux"):
                server._running = True
                await server._read_loop()
                mock_unix.assert_called_once()
