"""
RPAForge Bridge Server.

JSON-RPC server for IPC communication between Electron UI and Python Engine.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import sys
from typing import TYPE_CHECKING, Any

from rpaforge.bridge.handlers import BridgeHandlers
from rpaforge.bridge.protocol import (
    JSONRPCError,
    JSONRPCErrorCode,
    JSONRPCNotification,
    JSONRPCRequest,
    JSONRPCResponse,
    parse_message,
)

if TYPE_CHECKING:
    from rpaforge import StudioEngine


class BridgeServer:
    """JSON-RPC server for IPC communication.

    This server communicates over stdin/stdout using JSON-RPC 2.0 protocol.
    It allows Electron UI to control the Python engine.

    Example:
        >>> from rpaforge import StudioEngine
        >>> from rpaforge.bridge import BridgeServer
        >>>
        >>> engine = StudioEngine()
        >>> server = BridgeServer(engine)
        >>> await server.start()
    """

    def __init__(
        self,
        engine: StudioEngine,
    ):
        self._engine = engine
        self._handlers = BridgeHandlers(
            engine=engine,
            emit_event=self._emit_event_sync,
        )
        self._method_handlers = self._handlers.get_handlers()
        self._running = False
        self._shutting_down = False
        self._input_buffer = ""
        self._output_lock = asyncio.Lock()
        self._event_loop: asyncio.AbstractEventLoop | None = None

    def _emit_event_sync(self, event_dict: dict[str, Any]) -> None:
        if not self._event_loop:
            return
        with contextlib.suppress(RuntimeError):
            self._event_loop.call_soon_threadsafe(
                lambda: asyncio.create_task(self._emit_event(event_dict))
            )

    async def start(self) -> None:
        self._running = True
        self._shutting_down = False
        self._event_loop = asyncio.get_event_loop()
        self._log("Bridge server started")

        try:
            await self._read_loop()
        except asyncio.CancelledError:
            pass
        finally:
            self._running = False
            self._log("Bridge server stopped")

    def stop(self) -> None:
        self._running = False

    async def shutdown(self, reason: str = "shutdown") -> None:
        if self._shutting_down:
            return
        self._shutting_down = True
        self._log(f"Bridge shutting down: {reason}")
        await self._emit_event(
            {
                "type": "bridgeState",
                "state": "stopped",
                "reason": "shutdown",
                "message": reason,
            }
        )
        self._running = False

    async def _read_loop(self) -> None:
        """Main loop for reading and processing messages."""
        if sys.platform == "win32":
            await self._read_loop_sync()
        else:
            await self._read_loop_unix()

    async def _read_loop_windows(self) -> None:
        """Windows-specific read loop - deprecated, use sync mode."""
        await self._read_loop_sync()

    async def _read_loop_unix(self) -> None:
        """Unix read loop."""
        loop = asyncio.get_event_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)

        while self._running:
            try:
                line = await reader.readline()
                if not line:
                    break

                line_str = line.decode("utf-8").strip()
                if not line_str:
                    continue

                await self._process_message(line_str)

            except asyncio.CancelledError:
                break
            except Exception as e:
                await self._send_error(None, JSONRPCErrorCode.INTERNAL_ERROR, str(e))

    async def _read_loop_sync(self) -> None:
        """Synchronous read loop for Windows compatibility."""
        self._log("Using synchronous read mode for Windows compatibility")

        while self._running:
            try:
                loop = asyncio.get_event_loop()
                line = await loop.run_in_executor(None, self._read_line)

                if not line:
                    break

                line_str = line.strip()
                if not line_str:
                    continue

                await self._process_message(line_str)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self._log(f"Sync read error: {e}")
                await self._send_error(None, JSONRPCErrorCode.INTERNAL_ERROR, str(e))

    def _read_line(self) -> str:
        """Blocking read line for executor."""
        try:
            line = sys.stdin.buffer.readline()
            return line.decode("utf-8")
        except Exception:
            return ""

    async def _process_message(self, data: str) -> None:
        """Process an incoming message.

        :param data: Raw message string.
        """
        message = parse_message(data)

        if message is None:
            await self._send_error(None, JSONRPCErrorCode.PARSE_ERROR, "Invalid JSON")
            return

        request_id = None
        if isinstance(message, JSONRPCRequest):
            request_id = message.id
        else:
            return

        method = message.method
        params = message.params if isinstance(message.params, dict) else {}

        handler = self._method_handlers.get(method)
        if handler is None:
            await self._send_error(
                request_id,
                JSONRPCErrorCode.METHOD_NOT_FOUND,
                f"Method not found: {method}",
            )
            return

        try:
            result = handler(params)
            if asyncio.iscoroutine(result):
                result = await result
            await self._send_response(request_id, result)

        except JSONRPCError as e:
            await self._send_error(request_id, e.code, e.message, e.data)
        except Exception as e:
            await self._send_error(request_id, JSONRPCErrorCode.INTERNAL_ERROR, str(e))

    async def _send_response(self, request_id: int | str | None, result: Any) -> None:
        """Send a success response.

        :param request_id: The request ID.
        :param result: The result to send.
        """
        response = JSONRPCResponse.success(request_id, result)
        await self._write_output(response.to_json())

    async def _send_error(
        self,
        request_id: int | str | None,
        code: int,
        message: str,
        data: Any | None = None,
    ) -> None:
        """Send an error response.

        :param request_id: The request ID.
        :param code: Error code.
        :param message: Error message.
        :param data: Optional error data.
        """
        error = JSONRPCError(code=code, message=message, data=data)
        response = JSONRPCResponse.error_response(request_id, error)
        await self._write_output(response.to_json())

    async def _emit_event(self, event_dict: dict[str, Any]) -> None:
        """Emit an event notification.

        :param event_dict: Event data as dictionary.
        """
        notification = JSONRPCNotification(
            method=event_dict.get("type", "event"),
            params=event_dict,
        )
        await self._write_output(notification.to_json())

    async def _write_output(self, data: str) -> None:
        """Write data to stdout.

        :param data: Data to write.
        """
        async with self._output_lock:
            sys.stdout.write(data + "\n")
            sys.stdout.flush()

    def _log(self, message: str, level: str = "debug") -> None:
        """Log a message to stderr (non-blocking).

        :param message: Message to log.
        :param level: Log level.
        """
        sys.stderr.write(json.dumps({"log": level, "message": message}) + "\n")
        sys.stderr.flush()


async def main() -> None:
    """Main entry point for the bridge server."""
    try:
        from rpaforge import StudioEngine

        engine = StudioEngine()

        server = BridgeServer(engine)
        await server.start()
    except Exception as e:
        sys.stderr.write(
            json.dumps({"log": "error", "message": f"Bridge server error: {e}"}) + "\n"
        )
        sys.stderr.flush()
        raise


if __name__ == "__main__":
    asyncio.run(main())
