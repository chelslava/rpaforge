var E = Object.defineProperty;
var R = (n, e, t) => e in n ? E(n, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : n[e] = t;
var a = (n, e, t) => R(n, typeof e != "symbol" ? e + "" : e, t);
import { spawn as T } from "child_process";
const _ = {
  /**
   * Python bridge configuration
   */
  bridge: {
    /** Request timeout in milliseconds */
    requestTimeoutMs: 3e4,
    /** Maximum reconnection attempts */
    maxReconnectAttempts: 3,
    /** Base delay between reconnection attempts in milliseconds */
    reconnectDelayMs: 1e3,
    /** Maximum wait time for Python process startup in milliseconds */
    startupTimeoutMs: 5e3,
    /** Heartbeat interval in milliseconds */
    heartbeatIntervalMs: 5e3,
    /** Number of missed heartbeats before reconnecting */
    heartbeatFailureThreshold: 2
  }
};
var m, v, w, b, y, P, S;
const c = {
  autosave: {
    ...typeof window < "u" ? (m = window.rpaforgeConfig) == null ? void 0 : m.autosave : void 0
  },
  history: {
    ...typeof window < "u" ? (v = window.rpaforgeConfig) == null ? void 0 : v.history : void 0
  },
  console: {
    ...typeof window < "u" ? (w = window.rpaforgeConfig) == null ? void 0 : w.console : void 0
  },
  window: {
    ...typeof window < "u" ? (b = window.rpaforgeConfig) == null ? void 0 : b.window : void 0
  },
  diagram: {
    ...typeof window < "u" ? (y = window.rpaforgeConfig) == null ? void 0 : y.diagram : void 0
  },
  bridge: {
    ..._.bridge,
    ...typeof window < "u" ? (P = window.rpaforgeConfig) == null ? void 0 : P.bridge : void 0
  },
  debugger: {
    ...typeof window < "u" ? (S = window.rpaforgeConfig) == null ? void 0 : S.debugger : void 0
  }
};
let F = 0;
function H() {
  return `log_${Date.now()}_${++F}`;
}
function l(n) {
  return { ...n, id: H() };
}
function u(n, e, t, r) {
  const s = `[${e}] ${t}`;
  if (r === void 0) {
    console[n](s);
    return;
  }
  console[n](s, r);
}
function p(n, e, t, r) {
  var s;
  typeof window < "u" && ((s = window.rpaforge) != null && s.log) && window.rpaforge.log.log({ level: n, scope: e, message: t, details: r });
}
function M(n, e = {}) {
  const t = e.debugEnabled ?? process.env.NODE_ENV !== "production";
  return {
    debug: (r, s) => {
      if (!t) return;
      const i = (/* @__PURE__ */ new Date()).toISOString();
      l({ timestamp: i, level: "debug", scope: n, message: r, details: s }), u("log", n, r, s);
    },
    info: (r, s) => {
      const i = (/* @__PURE__ */ new Date()).toISOString();
      l({ timestamp: i, level: "info", scope: n, message: r, details: s }), u("info", n, r, s), p("info", n, r, s);
    },
    warn: (r, s) => {
      const i = (/* @__PURE__ */ new Date()).toISOString();
      l({ timestamp: i, level: "warn", scope: n, message: r, details: s }), u("warn", n, r, s), p("warn", n, r, s);
    },
    error: (r, s) => {
      const i = (/* @__PURE__ */ new Date()).toISOString();
      l({ timestamp: i, level: "error", scope: n, message: r, details: s }), u("error", n, r, s), p("error", n, r, s);
    }
  };
}
const I = {
  maxReconnectAttempts: c.bridge.maxReconnectAttempts,
  reconnectDelayMs: c.bridge.reconnectDelayMs,
  startupTimeoutMs: c.bridge.startupTimeoutMs,
  heartbeatIntervalMs: c.bridge.heartbeatIntervalMs,
  heartbeatFailureThreshold: c.bridge.heartbeatFailureThreshold,
  requestTimeoutMs: c.bridge.requestTimeoutMs
}, D = 100, O = 0, g = M("electron-python-bridge");
class x {
  constructor(e = {}, t = T) {
    a(this, "config");
    a(this, "process", null);
    a(this, "pendingRequests", /* @__PURE__ */ new Map());
    a(this, "buffer", "");
    a(this, "messageId", 0);
    a(this, "eventListeners", /* @__PURE__ */ new Map());
    a(this, "heartbeatInterval", null);
    a(this, "reconnectTimer", null);
    a(this, "startPromise", null);
    a(this, "activeProcessGeneration", 0);
    a(this, "reconnectAttempts", 0);
    a(this, "consecutiveHeartbeatFailures", 0);
    a(this, "manualStop", !1);
    a(this, "launchMode", "initial");
    a(this, "_state", "stopped");
    a(this, "previousState");
    a(this, "lastError");
    a(this, "lastReason");
    a(this, "fatal", !1);
    this.spawnChildProcess = t, this.config = {
      ...I,
      ...e
    };
  }
  get state() {
    return this._state;
  }
  getStatus() {
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      state: this._state,
      previousState: this.previousState,
      isOperational: this.isOperational(),
      reconnectAttempt: this.reconnectAttempts > 0 ? this.reconnectAttempts : void 0,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      consecutiveHeartbeatFailures: this.consecutiveHeartbeatFailures,
      error: this.lastError,
      reason: this.lastReason,
      fatal: this.fatal
    };
  }
  async start() {
    if (!this.isOperational())
      return this.startPromise ? this.startPromise : (this.manualStop = !1, this.clearReconnectTimer(), this.reconnectAttempts = 0, this.launchMode = "initial", this.startPromise = this.launchProcess().finally(() => {
        this.startPromise = null;
      }), this.startPromise);
  }
  stop() {
    this.stopInternal("manual_stop");
  }
  restart() {
    return this.stopInternal("manual_restart"), this.start();
  }
  isReady() {
    return this._state === "ready";
  }
  isOperational() {
    return this._state === "ready" || this._state === "degraded";
  }
  sendRequest(e, t, r = this.config.requestTimeoutMs) {
    return new Promise((s, i) => {
      if (!this.process || !this.process.stdin) {
        i(new Error(`Python process not running (state: ${this._state})`));
        return;
      }
      if (this._state === "stopped") {
        i(new Error("Bridge is stopped"));
        return;
      }
      const o = ++this.messageId, h = {
        jsonrpc: "2.0",
        method: e,
        params: t,
        id: o
      }, d = setTimeout(() => {
        this.pendingRequests.delete(o), i(new Error(`Request timeout: ${e}`));
      }, r);
      this.pendingRequests.set(o, {
        resolve: (f) => s(f),
        reject: i,
        timer: d
      }), this.process.stdin.write(`${JSON.stringify(h)}
`, "utf8");
    });
  }
  onEvent(e, t) {
    this.eventListeners.has(e) || this.eventListeners.set(e, /* @__PURE__ */ new Set());
    const r = this.eventListeners.get(e);
    return r != null && r.has(t) ? () => {
      r.delete(t);
    } : (r == null || r.add(t), () => {
      r == null || r.delete(t);
    });
  }
  async launchProcess() {
    this.stopHeartbeat(), this.buffer = "", this.consecutiveHeartbeatFailures = 0, this.setState("starting", {
      reason: "startup",
      fatal: !1,
      clearError: this.launchMode === "initial",
      consecutiveHeartbeatFailures: 0
    });
    const e = this.spawnBridgeProcess();
    try {
      await this.waitForReady(e), this.reconnectAttempts = 0, this.setState("ready", {
        reason: "ready_check",
        fatal: !1,
        clearError: !0,
        consecutiveHeartbeatFailures: 0
      }), this.startHeartbeat();
    } catch (t) {
      const r = t instanceof Error ? t.message : "Failed to start Python bridge";
      throw !this.manualStop && e === this.activeProcessGeneration && (this.launchMode === "reconnect" ? this.scheduleReconnect("process_exit", r) : this.setState("stopped", {
        reason: "startup",
        error: r,
        fatal: !0
      })), t;
    }
  }
  spawnBridgeProcess() {
    const e = this.activeProcessGeneration + 1;
    this.activeProcessGeneration = e;
    const t = this.getPythonPath(), r = this.spawnChildProcess(t, ["-m", "rpaforge.bridge.server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1"
      }
    });
    return this.process = r, r.stdout.on("data", (s) => {
      e === this.activeProcessGeneration && this.handleData(s.toString());
    }), r.stderr.on("data", (s) => {
      if (e !== this.activeProcessGeneration)
        return;
      s.toString().split(/\r?\n/).map((o) => o.trim()).filter(Boolean).forEach((o) => this.handleStderrLine(o));
    }), r.on("close", (s) => {
      if (e !== this.activeProcessGeneration)
        return;
      const i = s === null ? "Python bridge process closed" : `Python bridge process exited with code ${s}`;
      this.handleProcessTermination("process_exit", i);
    }), r.on("error", (s) => {
      e === this.activeProcessGeneration && (this.emitEvent("error", {
        type: "error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        code: O,
        message: s.message
      }), this.handleProcessTermination("process_error", s.message));
    }), e;
  }
  handleStderrLine(e) {
    try {
      const t = JSON.parse(e);
      if (t.log && t.message) {
        this.emitEvent("log", {
          type: "log",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: this.normalizeLogLevel(t.log),
          message: t.message,
          source: "python-bridge"
        });
        return;
      }
    } catch {
    }
    this.emitEvent("log", {
      type: "log",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: "warn",
      message: e,
      source: "python-bridge"
    });
  }
  normalizeLogLevel(e) {
    switch (e) {
      case "trace":
      case "debug":
      case "info":
      case "warn":
      case "error":
        return e;
      default:
        return "info";
    }
  }
  async waitForReady(e) {
    const t = Date.now() + this.config.startupTimeoutMs, r = Math.min(500, this.config.startupTimeoutMs);
    for (; Date.now() < t; ) {
      if (e !== this.activeProcessGeneration || !this.process)
        throw new Error("Process terminated during startup");
      try {
        await this.sendRequest("ping", {}, r);
        return;
      } catch {
        await this.delay(D);
      }
    }
    throw new Error("Python engine failed to start within timeout");
  }
  async delay(e) {
    await new Promise((t) => setTimeout(t, e));
  }
  startHeartbeat() {
    this.stopHeartbeat(), this.heartbeatInterval = setInterval(() => {
      this.runHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }
  async runHeartbeat() {
    if (!(!this.process || !this.isOperational()))
      try {
        await this.sendRequest(
          "ping",
          {},
          Math.min(this.config.heartbeatIntervalMs, this.config.requestTimeoutMs)
        ), (this.consecutiveHeartbeatFailures > 0 || this._state === "degraded") && this.setState("ready", {
          reason: "heartbeat",
          fatal: !1,
          clearError: !0,
          consecutiveHeartbeatFailures: 0
        });
      } catch (e) {
        const t = e instanceof Error ? e.message : "Heartbeat failure", r = this.consecutiveHeartbeatFailures + 1;
        this.setState("degraded", {
          reason: "heartbeat",
          error: t,
          fatal: !1,
          consecutiveHeartbeatFailures: r
        }), r >= this.config.heartbeatFailureThreshold && this.forceReconnectFromHeartbeat(t);
      }
  }
  forceReconnectFromHeartbeat(e) {
    this.stopHeartbeat(), this.rejectPendingRequests(`Bridge heartbeat failed: ${e}`);
    const t = this.process;
    this.process = null, this.activeProcessGeneration = 0, t && t.kill(), this.scheduleReconnect("heartbeat", e);
  }
  handleProcessTermination(e, t) {
    if (this.stopHeartbeat(), this.buffer = "", this.process = null, this.activeProcessGeneration = 0, this.rejectPendingRequests(t), !this.manualStop) {
      if (this._state === "starting") {
        this.launchMode === "reconnect" ? this.scheduleReconnect(e, t) : this.setState("stopped", {
          reason: "startup",
          error: t,
          fatal: !0
        });
        return;
      }
      if (this._state === "ready" || this._state === "degraded" || this._state === "reconnecting") {
        this.scheduleReconnect(e, t);
        return;
      }
      this.setState("stopped", {
        reason: e,
        error: t,
        fatal: !1
      });
    }
  }
  scheduleReconnect(e, t) {
    if (this.manualStop)
      return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState("stopped", {
        reason: "reconnect_exhausted",
        error: t ?? "Python bridge stopped after exhausting reconnect attempts",
        fatal: !0
      });
      return;
    }
    this.clearReconnectTimer(), this.reconnectAttempts += 1, this.setState("reconnecting", {
      reason: e,
      error: t,
      fatal: !1
    });
    const r = this.config.reconnectDelayMs * this.reconnectAttempts;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null, this.launchMode = "reconnect", this.startPromise || (this.startPromise = this.launchProcess().catch(() => {
      }).finally(() => {
        this.startPromise = null;
      }));
    }, r);
  }
  stopInternal(e) {
    this.manualStop = !0, this.clearReconnectTimer(), this.stopHeartbeat(), this.rejectPendingRequests("Bridge stopped");
    const t = this.process;
    this.process = null, this.activeProcessGeneration = 0, t && t.kill(), this.setState("stopped", {
      reason: e,
      fatal: !1,
      clearError: !0,
      consecutiveHeartbeatFailures: 0
    });
  }
  clearReconnectTimer() {
    this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null);
  }
  stopHeartbeat() {
    this.heartbeatInterval && (clearInterval(this.heartbeatInterval), this.heartbeatInterval = null);
  }
  rejectPendingRequests(e) {
    this.pendingRequests.forEach((t) => {
      t.timer && clearTimeout(t.timer), t.reject(new Error(e));
    }), this.pendingRequests.clear();
  }
  setState(e, t = {}) {
    const r = this._state, s = t.clearError ? void 0 : t.error !== void 0 ? t.error : this.lastError, i = t.reason ?? this.lastReason, o = t.fatal !== void 0 ? t.fatal : e === "ready" ? !1 : this.fatal, h = t.consecutiveHeartbeatFailures ?? this.consecutiveHeartbeatFailures, d = r !== e || s !== this.lastError || i !== this.lastReason || o !== this.fatal || h !== this.consecutiveHeartbeatFailures;
    if (this._state = e, this.previousState = r === e ? this.previousState : r, this.lastError = s, this.lastReason = i, this.fatal = o, this.consecutiveHeartbeatFailures = h, !d)
      return;
    const f = {
      type: "bridgeState",
      ...this.getStatus(),
      previousState: r
    };
    this.emitEvent("bridgeState", f);
  }
  handleData(e) {
    this.buffer += e;
    const t = this.buffer.split(`
`);
    this.buffer = t.pop() || "";
    for (const r of t) {
      const s = r.trim();
      if (!(!s || !s.startsWith("{")))
        try {
          const i = JSON.parse(s);
          "id" in i && i.id !== null ? this.handleResponse(i) : "method" in i && this.handleNotification(i);
        } catch (i) {
          this.emitEvent("log", {
            type: "log",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            level: "warn",
            message: `Failed to parse bridge JSON: ${s}`,
            source: i instanceof Error ? i.message : "python-bridge"
          });
        }
    }
  }
  handleResponse(e) {
    const t = this.pendingRequests.get(e.id);
    if (t) {
      if (this.pendingRequests.delete(e.id), t.timer && clearTimeout(t.timer), e.error) {
        const r = new Error(e.error.message);
        r.code = e.error.code, t.reject(r);
        return;
      }
      t.resolve(e.result);
    }
  }
  handleNotification(e) {
    const t = e.params;
    t && "type" in t && this.emitEvent(t.type, t);
  }
  emitEvent(e, t) {
    const r = this.eventListeners.get(e);
    r == null || r.forEach((i) => {
      try {
        i(t);
      } catch (o) {
        g.error("Event listener error", o);
      }
    });
    const s = this.eventListeners.get("*");
    s == null || s.forEach((i) => {
      try {
        i(t);
      } catch (o) {
        g.error("Event listener error", o);
      }
    });
  }
  getPythonPath() {
    return process.env.PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
  }
}
export {
  x as PythonBridge
};
