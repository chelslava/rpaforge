/**
 * RPAForge IPC Types
 *
 * TypeScript types for JSON-RPC 2.0 IPC communication
 * between Electron UI and Python Engine.
 */

export type JSONRPCVersion = '2.0';

export interface JSONRPCRequest<T = unknown> {
  jsonrpc: JSONRPCVersion;
  method: string;
  params?: T;
  id: number | string;
}

export interface JSONRPCResponse<T = unknown> {
  jsonrpc: JSONRPCVersion;
  result?: T;
  error?: JSONRPCError;
  id: number | string | null;
}

export interface JSONRPCNotification<T = unknown> {
  jsonrpc: JSONRPCVersion;
  method: string;
  params?: T;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export enum JSONRPCErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
}

export type RequestId = number | string;

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}
