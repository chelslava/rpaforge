"""
RPAForge Bridge Server.

JSON-RPC server for IPC communication between Electron UI and Python Engine.
"""

from __future__ import annotations

import asyncio
import json
import sys
from typing import Any, TYPE_CHECKING

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
    from rpaforge.debugger import Debugger


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
        debugger: Debugger | None = None,
    ):
        """Initialize the bridge server.

        :param engine: The StudioEngine instance to control.
        :param debugger: Optional Debugger instance for debugging support.
        """
        self._engine = engine
        self._debugger = debugger
        self._handlers = BridgeHandlers(
            engine=engine,
            debugger=debugger,
            emit_event=self._emit_event_sync,
        )
        self._method_handlers = self._handlers.get_handlers()
        self._running = False
        self._input_buffer = ""
        self._output_lock = asyncio.Lock()

    def _emit_event_sync(self, event_dict: dict[str, Any]) -> None:
        """Synchronous wrapper for emitting events."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self._emit_event(event_dict))
            else:
                loop.run_until_complete(self._emit_event(event_dict))
        except RuntimeError:
            pass

    async def start(self) -> None:
        """Start the bridge server.

        This method runs indefinitely, processing incoming messages.
        """
        self._running = True
        self._log("Bridge server started")

        if self._debugger:
            self._debugger.on_pause(self._on_debugger_pause)
            self._debugger.on_resume(self._on_debugger_resume)

        try:
            await self._read_loop()
        except asyncio.CancelledError:
            pass
        finally:
            self._running = False
            self._log("Bridge server stopped")

    def stop(self) -> None:
        """Stop the bridge server."""
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

    def _on_debugger_pause(self) -> None:
        """Handle debugger pause event."""
        if self._debugger:
            frame = self._debugger.get_current_frame()
            asyncio.create_task(
                self._emit_event(
                    {
                        "type": "processPaused",
                        "file": frame.file if frame else None,
                        "line": frame.line if frame else None,
                    }
                )
            )

    def _on_debugger_resume(self) -> None:
        """Handle debugger resume event."""
        asyncio.create_task(
            self._emit_event(
                {
                    "type": "processResumed",
                }
            )
        )


async def main() -> None:
    """Main entry point for the bridge server."""
    from rpaforge import StudioEngine
    from rpaforge.debugger import Debugger

    debugger = Debugger()
    engine = StudioEngine(debugger=debugger)

    server = BridgeServer(engine, debugger)
    await server.start()


if __name__ == "__main__":
    asyncio.run(main())
