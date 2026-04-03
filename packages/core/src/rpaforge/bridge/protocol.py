"""
RPAForge Bridge Protocol.

JSON-RPC 2.0 protocol implementation for IPC communication.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import IntEnum
from typing import Any


class JSONRPCErrorCode(IntEnum):
    """JSON-RPC 2.0 error codes."""

    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    SERVER_ERROR_START = -32000
    SERVER_ERROR_END = -32099


class JSONRPCError(Exception):
    """JSON-RPC 2.0 error object.

    This is an Exception subclass so it can be raised and caught.
    """

    def __init__(self, code: int, message: str, data: Any | None = None) -> None:
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        result = {"code": self.code, "message": self.message}
        if self.data is not None:
            result["data"] = self.data
        return result


@dataclass
class JSONRPCRequest:
    """JSON-RPC 2.0 request."""

    method: str
    id: int | str
    params: dict[str, Any] | list[Any] | None = None
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "jsonrpc": self.jsonrpc,
            "method": self.method,
            "id": self.id,
        }
        if self.params is not None:
            result["params"] = self.params
        return result

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> JSONRPCRequest:
        return cls(
            method=data["method"],
            id=data["id"],
            params=data.get("params"),
            jsonrpc=data.get("jsonrpc", "2.0"),
        )


@dataclass
class JSONRPCResponse:
    """JSON-RPC 2.0 response."""

    id: int | str | None
    result: Any | None = None
    error: JSONRPCError | None = None
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"jsonrpc": self.jsonrpc, "id": self.id}
        if self.error is not None:
            result["error"] = self.error.to_dict()
        else:
            result["result"] = self.result
        return result

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def success(cls, id: int | str | None, result: Any) -> JSONRPCResponse:
        return cls(id=id, result=result)

    @classmethod
    def error_response(
        cls,
        id: int | str | None,
        error: JSONRPCError,
    ) -> JSONRPCResponse:
        return cls(id=id, error=error)


@dataclass
class JSONRPCNotification:
    """JSON-RPC 2.0 notification (no id, no response expected)."""

    method: str
    params: dict[str, Any] | list[Any] | None = None
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"jsonrpc": self.jsonrpc, "method": self.method}
        if self.params is not None:
            result["params"] = self.params
        return result

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> JSONRPCNotification:
        return cls(
            method=data["method"],
            params=data.get("params"),
            jsonrpc=data.get("jsonrpc", "2.0"),
        )


def parse_message(data: str) -> JSONRPCRequest | JSONRPCNotification | None:
    """Parse a JSON-RPC message from string.

    :param data: JSON string.
    :returns: Parsed message or None if parse error.
    """
    try:
        obj = json.loads(data)
    except json.JSONDecodeError:
        return None

    if not isinstance(obj, dict):
        return None

    if "method" not in obj:
        return None

    if "id" in obj:
        return JSONRPCRequest.from_dict(obj)
    else:
        return JSONRPCNotification.from_dict(obj)
