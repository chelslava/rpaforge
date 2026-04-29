var Bn = Object.defineProperty;
var Yn = (e, t, s) => t in e ? Bn(e, t, { enumerable: !0, configurable: !0, writable: !0, value: s }) : e[t] = s;
var re = (e, t, s) => Yn(e, typeof t != "symbol" ? t + "" : t, s);
import { app as Fe, BrowserWindow as Cn, ipcMain as W, dialog as ur, shell as lr } from "electron";
import * as ye from "node:path";
import Se from "node:path";
import * as Xn from "node:fs";
import * as de from "node:fs/promises";
import Qn from "chokidar";
import { spawn as Zn } from "child_process";
const dr = {
  /**
   * Desktop shell window defaults
   */
  window: {
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768
  },
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
var On, Nn, Tn, jn, kn, qn, Dn;
const Ee = {
  autosave: {
    ...typeof window < "u" ? (On = window.rpaforgeConfig) == null ? void 0 : On.autosave : void 0
  },
  history: {
    ...typeof window < "u" ? (Nn = window.rpaforgeConfig) == null ? void 0 : Nn.history : void 0
  },
  console: {
    ...typeof window < "u" ? (Tn = window.rpaforgeConfig) == null ? void 0 : Tn.console : void 0
  },
  window: {
    ...dr.window,
    ...typeof window < "u" ? (jn = window.rpaforgeConfig) == null ? void 0 : jn.window : void 0
  },
  diagram: {
    ...typeof window < "u" ? (kn = window.rpaforgeConfig) == null ? void 0 : kn.diagram : void 0
  },
  bridge: {
    ...dr.bridge,
    ...typeof window < "u" ? (qn = window.rpaforgeConfig) == null ? void 0 : qn.bridge : void 0
  },
  debugger: {
    ...typeof window < "u" ? (Dn = window.rpaforgeConfig) == null ? void 0 : Dn.debugger : void 0
  }
};
let xn = 0;
function es() {
  return `log_${Date.now()}_${++xn}`;
}
function Xe(e) {
  return { ...e, id: es() };
}
function Qe(e, t, s, r) {
  const p = `[${t}] ${s}`;
  if (r === void 0) {
    console[e](p);
    return;
  }
  console[e](p, r);
}
function Wt(e, t, s, r) {
  var p;
  typeof window < "u" && ((p = window.rpaforge) != null && p.log) && window.rpaforge.log.log({ level: e, scope: t, message: s, details: r });
}
function An(e, t = {}) {
  const s = t.debugEnabled ?? process.env.NODE_ENV !== "production";
  return {
    debug: (r, p) => {
      if (!s) return;
      const a = (/* @__PURE__ */ new Date()).toISOString();
      Xe({ timestamp: a, level: "debug", scope: e, message: r, details: p }), Qe("log", e, r, p);
    },
    info: (r, p) => {
      const a = (/* @__PURE__ */ new Date()).toISOString();
      Xe({ timestamp: a, level: "info", scope: e, message: r, details: p }), Qe("info", e, r, p), Wt("info", e, r, p);
    },
    warn: (r, p) => {
      const a = (/* @__PURE__ */ new Date()).toISOString();
      Xe({ timestamp: a, level: "warn", scope: e, message: r, details: p }), Qe("warn", e, r, p), Wt("warn", e, r, p);
    },
    error: (r, p) => {
      const a = (/* @__PURE__ */ new Date()).toISOString();
      Xe({ timestamp: a, level: "error", scope: e, message: r, details: p }), Qe("error", e, r, p), Wt("error", e, r, p);
    }
  };
}
const ts = {
  maxReconnectAttempts: Ee.bridge.maxReconnectAttempts,
  reconnectDelayMs: Ee.bridge.reconnectDelayMs,
  startupTimeoutMs: Ee.bridge.startupTimeoutMs,
  heartbeatIntervalMs: Ee.bridge.heartbeatIntervalMs,
  heartbeatFailureThreshold: Ee.bridge.heartbeatFailureThreshold,
  requestTimeoutMs: Ee.bridge.requestTimeoutMs
}, rs = 100, ns = 0, fr = An("electron-python-bridge");
class ss {
  constructor(t = {}, s = Zn) {
    re(this, "config");
    re(this, "process", null);
    re(this, "pendingRequests", /* @__PURE__ */ new Map());
    re(this, "buffer", "");
    re(this, "messageId", 0);
    re(this, "eventListeners", /* @__PURE__ */ new Map());
    re(this, "heartbeatInterval", null);
    re(this, "reconnectTimer", null);
    re(this, "startPromise", null);
    re(this, "activeProcessGeneration", 0);
    re(this, "reconnectAttempts", 0);
    re(this, "consecutiveHeartbeatFailures", 0);
    re(this, "manualStop", !1);
    re(this, "launchMode", "initial");
    re(this, "_state", "stopped");
    re(this, "previousState");
    re(this, "lastError");
    re(this, "lastReason");
    re(this, "fatal", !1);
    this.spawnChildProcess = s, this.config = {
      ...ts,
      ...t
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
  sendRequest(t, s, r = this.config.requestTimeoutMs) {
    return new Promise((p, a) => {
      if (!this.process || !this.process.stdin) {
        a(new Error(`Python process not running (state: ${this._state})`));
        return;
      }
      if (this._state === "stopped") {
        a(new Error("Bridge is stopped"));
        return;
      }
      const h = ++this.messageId, d = {
        jsonrpc: "2.0",
        method: t,
        params: s,
        id: h
      }, m = setTimeout(() => {
        this.pendingRequests.delete(h), a(new Error(`Request timeout: ${t}`));
      }, r);
      this.pendingRequests.set(h, {
        resolve: (w) => p(w),
        reject: a,
        timer: m
      }), this.process.stdin.write(`${JSON.stringify(d)}
`, "utf8");
    });
  }
  onEvent(t, s) {
    this.eventListeners.has(t) || this.eventListeners.set(t, /* @__PURE__ */ new Set());
    const r = this.eventListeners.get(t);
    return r != null && r.has(s) ? () => {
      r.delete(s);
    } : (r == null || r.add(s), () => {
      r == null || r.delete(s);
    });
  }
  async launchProcess() {
    this.stopHeartbeat(), this.buffer = "", this.consecutiveHeartbeatFailures = 0, this.setState("starting", {
      reason: "startup",
      fatal: !1,
      clearError: this.launchMode === "initial",
      consecutiveHeartbeatFailures: 0
    });
    const t = this.spawnBridgeProcess();
    try {
      await this.waitForReady(t), this.reconnectAttempts = 0, this.setState("ready", {
        reason: "ready_check",
        fatal: !1,
        clearError: !0,
        consecutiveHeartbeatFailures: 0
      }), this.startHeartbeat();
    } catch (s) {
      const r = s instanceof Error ? s.message : "Failed to start Python bridge";
      throw !this.manualStop && t === this.activeProcessGeneration && (this.launchMode === "reconnect" ? this.scheduleReconnect("process_exit", r) : this.setState("stopped", {
        reason: "startup",
        error: r,
        fatal: !0
      })), s;
    }
  }
  spawnBridgeProcess() {
    const t = this.activeProcessGeneration + 1;
    this.activeProcessGeneration = t;
    const s = this.getPythonPath(), r = this.spawnChildProcess(s, ["-m", "rpaforge.bridge.server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1"
      }
    });
    return this.process = r, r.stdout.on("data", (p) => {
      t === this.activeProcessGeneration && this.handleData(p.toString());
    }), r.stderr.on("data", (p) => {
      if (t !== this.activeProcessGeneration)
        return;
      p.toString().split(/\r?\n/).map((h) => h.trim()).filter(Boolean).forEach((h) => this.handleStderrLine(h));
    }), r.on("close", (p) => {
      if (t !== this.activeProcessGeneration)
        return;
      const a = p === null ? "Python bridge process closed" : `Python bridge process exited with code ${p}`;
      this.handleProcessTermination("process_exit", a);
    }), r.on("error", (p) => {
      t === this.activeProcessGeneration && (this.emitEvent("error", {
        type: "error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        code: ns,
        message: p.message
      }), this.handleProcessTermination("process_error", p.message));
    }), t;
  }
  handleStderrLine(t) {
    try {
      const s = JSON.parse(t);
      if (s.log && s.message) {
        this.emitEvent("log", {
          type: "log",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: this.normalizeLogLevel(s.log),
          message: s.message,
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
      message: t,
      source: "python-bridge"
    });
  }
  normalizeLogLevel(t) {
    switch (t) {
      case "trace":
      case "debug":
      case "info":
      case "warn":
      case "error":
        return t;
      default:
        return "info";
    }
  }
  async waitForReady(t) {
    const s = Date.now() + this.config.startupTimeoutMs, r = Math.min(500, this.config.startupTimeoutMs);
    for (; Date.now() < s; ) {
      if (t !== this.activeProcessGeneration || !this.process)
        throw new Error("Process terminated during startup");
      try {
        await this.sendRequest("ping", {}, r);
        return;
      } catch {
        await this.delay(rs);
      }
    }
    throw new Error("Python engine failed to start within timeout");
  }
  async delay(t) {
    await new Promise((s) => setTimeout(s, t));
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
      } catch (t) {
        const s = t instanceof Error ? t.message : "Heartbeat failure", r = this.consecutiveHeartbeatFailures + 1;
        this.setState("degraded", {
          reason: "heartbeat",
          error: s,
          fatal: !1,
          consecutiveHeartbeatFailures: r
        }), r >= this.config.heartbeatFailureThreshold && this.forceReconnectFromHeartbeat(s);
      }
  }
  forceReconnectFromHeartbeat(t) {
    this.stopHeartbeat(), this.rejectPendingRequests(`Bridge heartbeat failed: ${t}`);
    const s = this.process;
    this.process = null, this.activeProcessGeneration = 0, s && s.kill(), this.scheduleReconnect("heartbeat", t);
  }
  handleProcessTermination(t, s) {
    if (this.stopHeartbeat(), this.buffer = "", this.process = null, this.activeProcessGeneration = 0, this.rejectPendingRequests(s), !this.manualStop) {
      if (this._state === "starting") {
        this.launchMode === "reconnect" ? this.scheduleReconnect(t, s) : this.setState("stopped", {
          reason: "startup",
          error: s,
          fatal: !0
        });
        return;
      }
      if (this._state === "ready" || this._state === "degraded" || this._state === "reconnecting") {
        this.scheduleReconnect(t, s);
        return;
      }
      this.setState("stopped", {
        reason: t,
        error: s,
        fatal: !1
      });
    }
  }
  scheduleReconnect(t, s) {
    if (this.manualStop)
      return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState("stopped", {
        reason: "reconnect_exhausted",
        error: s ?? "Python bridge stopped after exhausting reconnect attempts",
        fatal: !0
      });
      return;
    }
    this.clearReconnectTimer(), this.reconnectAttempts += 1, this.setState("reconnecting", {
      reason: t,
      error: s,
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
  stopInternal(t) {
    this.manualStop = !0, this.clearReconnectTimer(), this.stopHeartbeat(), this.rejectPendingRequests("Bridge stopped");
    const s = this.process;
    this.process = null, this.activeProcessGeneration = 0, s && s.kill(), this.setState("stopped", {
      reason: t,
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
  rejectPendingRequests(t) {
    this.pendingRequests.forEach((s) => {
      s.timer && clearTimeout(s.timer), s.reject(new Error(t));
    }), this.pendingRequests.clear();
  }
  setState(t, s = {}) {
    const r = this._state, p = s.clearError ? void 0 : s.error !== void 0 ? s.error : this.lastError, a = s.reason ?? this.lastReason, h = s.fatal !== void 0 ? s.fatal : t === "ready" ? !1 : this.fatal, d = s.consecutiveHeartbeatFailures ?? this.consecutiveHeartbeatFailures, m = r !== t || p !== this.lastError || a !== this.lastReason || h !== this.fatal || d !== this.consecutiveHeartbeatFailures;
    if (this._state = t, this.previousState = r === t ? this.previousState : r, this.lastError = p, this.lastReason = a, this.fatal = h, this.consecutiveHeartbeatFailures = d, !m)
      return;
    const w = {
      type: "bridgeState",
      ...this.getStatus(),
      previousState: r
    };
    this.emitEvent("bridgeState", w);
  }
  handleData(t) {
    this.buffer += t;
    const s = this.buffer.split(`
`);
    this.buffer = s.pop() || "";
    for (const r of s) {
      const p = r.trim();
      if (!(!p || !p.startsWith("{")))
        try {
          const a = JSON.parse(p);
          "id" in a && a.id !== null ? this.handleResponse(a) : "method" in a && this.handleNotification(a);
        } catch (a) {
          this.emitEvent("log", {
            type: "log",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            level: "warn",
            message: `Failed to parse bridge JSON: ${p}`,
            source: a instanceof Error ? a.message : "python-bridge"
          });
        }
    }
  }
  handleResponse(t) {
    const s = this.pendingRequests.get(t.id);
    if (s) {
      if (this.pendingRequests.delete(t.id), s.timer && clearTimeout(s.timer), t.error) {
        const r = new Error(t.error.message);
        r.code = t.error.code, s.reject(r);
        return;
      }
      s.resolve(t.result);
    }
  }
  handleNotification(t) {
    const s = t.params;
    s && "type" in s && this.emitEvent(s.type, s);
  }
  emitEvent(t, s) {
    const r = this.eventListeners.get(t);
    r == null || r.forEach((a) => {
      try {
        a(s);
      } catch (h) {
        fr.error("Event listener error", h);
      }
    });
    const p = this.eventListeners.get("*");
    p == null || p.forEach((a) => {
      try {
        a(s);
      } catch (h) {
        fr.error("Event listener error", h);
      }
    });
  }
  getPythonPath() {
    return process.env.PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
  }
}
const H = {
  // Bridge channels
  BRIDGE_IS_READY: "bridge:isReady",
  BRIDGE_GET_STATE: "bridge:getState",
  BRIDGE_GET_STATUS: "bridge:getStatus",
  BRIDGE_SEND: "bridge:send",
  BRIDGE_EVENT: "bridge:event",
  // Engine channels
  ENGINE_PING: "engine:ping",
  ENGINE_GET_CAPABILITIES: "engine:getCapabilities",
  ENGINE_RUN_PROCESS: "engine:runProcess",
  ENGINE_RUN_FILE: "engine:runFile",
  ENGINE_STOP_PROCESS: "engine:stopProcess",
  ENGINE_PAUSE_PROCESS: "engine:pauseProcess",
  ENGINE_RESUME_PROCESS: "engine:resumeProcess",
  ENGINE_GET_ACTIVITIES: "engine:getActivities",
  // Debugger channels
  DEBUGGER_SET_BREAKPOINT: "debugger:setBreakpoint",
  DEBUGGER_REMOVE_BREAKPOINT: "debugger:removeBreakpoint",
  DEBUGGER_TOGGLE_BREAKPOINT: "debugger:toggleBreakpoint",
  DEBUGGER_GET_BREAKPOINTS: "debugger:getBreakpoints",
  DEBUGGER_STEP_OVER: "debugger:stepOver",
  DEBUGGER_STEP_INTO: "debugger:stepInto",
  DEBUGGER_STEP_OUT: "debugger:stepOut",
  DEBUGGER_CONTINUE: "debugger:continue",
  DEBUGGER_GET_VARIABLES: "debugger:getVariables",
  DEBUGGER_GET_CALL_STACK: "debugger:getCallStack",
  // Dialog channels
  DIALOG_SHOW_OPEN: "dialog:showOpen",
  DIALOG_SHOW_SAVE: "dialog:showSave",
  // Editor channels
  EDITOR_FORMAT_CODE: "editor:formatCode",
  EDITOR_VALIDATE_CODE: "editor:validateCode",
  // FileSystem channels
  FS_SET_PROJECT_ROOT: "fs:setProjectRoot",
  FS_PATH_EXISTS: "fs:pathExists",
  FS_READ_DIR: "fs:readDir",
  FS_READ_FILE: "fs:readFile",
  FS_WRITE_FILE: "fs:writeFile",
  FS_CREATE_DIR: "fs:createDir",
  FS_DELETE: "fs:delete",
  FS_RENAME: "fs:rename",
  FS_COPY: "fs:copy",
  FS_OPEN_WITH_SYSTEM: "fs:openWithSystem",
  FS_SHOW_IN_FOLDER: "fs:showInFolder",
  FS_GET_FILE_INFO: "fs:getFileInfo",
  FS_WATCH_DIR: "fs:watchDir",
  FS_UNWATCH_DIR: "fs:unwatchDir",
  FS_EVENT: "fs:event",
  // Log channels
  LOG_WRITE: "log:write",
  LOG_GET: "log:get",
  LOG_EXPORT: "log:export",
  LOG_CLEAR: "log:clear"
};
function as(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
var Ze = { exports: {} }, Jt = {}, Pe = {}, qe = {}, Bt = {}, Yt = {}, Xt = {}, hr;
function Mt() {
  return hr || (hr = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.regexpCode = e.getEsmExportName = e.getProperty = e.safeStringify = e.stringify = e.strConcat = e.addCodeArg = e.str = e._ = e.nil = e._Code = e.Name = e.IDENTIFIER = e._CodeOrName = void 0;
    class t {
    }
    e._CodeOrName = t, e.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    class s extends t {
      constructor(n) {
        if (super(), !e.IDENTIFIER.test(n))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = n;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return !1;
      }
      get names() {
        return { [this.str]: 1 };
      }
    }
    e.Name = s;
    class r extends t {
      constructor(n) {
        super(), this._items = typeof n == "string" ? [n] : n;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return !1;
        const n = this._items[0];
        return n === "" || n === '""';
      }
      get str() {
        var n;
        return (n = this._str) !== null && n !== void 0 ? n : this._str = this._items.reduce((c, g) => `${c}${g}`, "");
      }
      get names() {
        var n;
        return (n = this._names) !== null && n !== void 0 ? n : this._names = this._items.reduce((c, g) => (g instanceof s && (c[g.str] = (c[g.str] || 0) + 1), c), {});
      }
    }
    e._Code = r, e.nil = new r("");
    function p(u, ...n) {
      const c = [u[0]];
      let g = 0;
      for (; g < n.length; )
        d(c, n[g]), c.push(u[++g]);
      return new r(c);
    }
    e._ = p;
    const a = new r("+");
    function h(u, ...n) {
      const c = [_(u[0])];
      let g = 0;
      for (; g < n.length; )
        c.push(a), d(c, n[g]), c.push(a, _(u[++g]));
      return m(c), new r(c);
    }
    e.str = h;
    function d(u, n) {
      n instanceof r ? u.push(...n._items) : n instanceof s ? u.push(n) : u.push(P(n));
    }
    e.addCodeArg = d;
    function m(u) {
      let n = 1;
      for (; n < u.length - 1; ) {
        if (u[n] === a) {
          const c = w(u[n - 1], u[n + 1]);
          if (c !== void 0) {
            u.splice(n - 1, 3, c);
            continue;
          }
          u[n++] = "+";
        }
        n++;
      }
    }
    function w(u, n) {
      if (n === '""')
        return u;
      if (u === '""')
        return n;
      if (typeof u == "string")
        return n instanceof s || u[u.length - 1] !== '"' ? void 0 : typeof n != "string" ? `${u.slice(0, -1)}${n}"` : n[0] === '"' ? u.slice(0, -1) + n.slice(1) : void 0;
      if (typeof n == "string" && n[0] === '"' && !(u instanceof s))
        return `"${u}${n.slice(1)}`;
    }
    function $(u, n) {
      return n.emptyStr() ? u : u.emptyStr() ? n : h`${u}${n}`;
    }
    e.strConcat = $;
    function P(u) {
      return typeof u == "number" || typeof u == "boolean" || u === null ? u : _(Array.isArray(u) ? u.join(",") : u);
    }
    function v(u) {
      return new r(_(u));
    }
    e.stringify = v;
    function _(u) {
      return JSON.stringify(u).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    e.safeStringify = _;
    function y(u) {
      return typeof u == "string" && e.IDENTIFIER.test(u) ? new r(`.${u}`) : p`[${u}]`;
    }
    e.getProperty = y;
    function E(u) {
      if (typeof u == "string" && e.IDENTIFIER.test(u))
        return new r(`${u}`);
      throw new Error(`CodeGen: invalid export name: ${u}, use explicit $id name mapping`);
    }
    e.getEsmExportName = E;
    function o(u) {
      return new r(u.toString());
    }
    e.regexpCode = o;
  })(Xt)), Xt;
}
var Qt = {}, pr;
function mr() {
  return pr || (pr = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.ValueScope = e.ValueScopeName = e.Scope = e.varKinds = e.UsedValueState = void 0;
    const t = /* @__PURE__ */ Mt();
    class s extends Error {
      constructor(w) {
        super(`CodeGen: "code" for ${w} not defined`), this.value = w.value;
      }
    }
    var r;
    (function(m) {
      m[m.Started = 0] = "Started", m[m.Completed = 1] = "Completed";
    })(r || (e.UsedValueState = r = {})), e.varKinds = {
      const: new t.Name("const"),
      let: new t.Name("let"),
      var: new t.Name("var")
    };
    class p {
      constructor({ prefixes: w, parent: $ } = {}) {
        this._names = {}, this._prefixes = w, this._parent = $;
      }
      toName(w) {
        return w instanceof t.Name ? w : this.name(w);
      }
      name(w) {
        return new t.Name(this._newName(w));
      }
      _newName(w) {
        const $ = this._names[w] || this._nameGroup(w);
        return `${w}${$.index++}`;
      }
      _nameGroup(w) {
        var $, P;
        if (!((P = ($ = this._parent) === null || $ === void 0 ? void 0 : $._prefixes) === null || P === void 0) && P.has(w) || this._prefixes && !this._prefixes.has(w))
          throw new Error(`CodeGen: prefix "${w}" is not allowed in this scope`);
        return this._names[w] = { prefix: w, index: 0 };
      }
    }
    e.Scope = p;
    class a extends t.Name {
      constructor(w, $) {
        super($), this.prefix = w;
      }
      setValue(w, { property: $, itemIndex: P }) {
        this.value = w, this.scopePath = (0, t._)`.${new t.Name($)}[${P}]`;
      }
    }
    e.ValueScopeName = a;
    const h = (0, t._)`\n`;
    class d extends p {
      constructor(w) {
        super(w), this._values = {}, this._scope = w.scope, this.opts = { ...w, _n: w.lines ? h : t.nil };
      }
      get() {
        return this._scope;
      }
      name(w) {
        return new a(w, this._newName(w));
      }
      value(w, $) {
        var P;
        if ($.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const v = this.toName(w), { prefix: _ } = v, y = (P = $.key) !== null && P !== void 0 ? P : $.ref;
        let E = this._values[_];
        if (E) {
          const n = E.get(y);
          if (n)
            return n;
        } else
          E = this._values[_] = /* @__PURE__ */ new Map();
        E.set(y, v);
        const o = this._scope[_] || (this._scope[_] = []), u = o.length;
        return o[u] = $.ref, v.setValue($, { property: _, itemIndex: u }), v;
      }
      getValue(w, $) {
        const P = this._values[w];
        if (P)
          return P.get($);
      }
      scopeRefs(w, $ = this._values) {
        return this._reduceValues($, (P) => {
          if (P.scopePath === void 0)
            throw new Error(`CodeGen: name "${P}" has no value`);
          return (0, t._)`${w}${P.scopePath}`;
        });
      }
      scopeCode(w = this._values, $, P) {
        return this._reduceValues(w, (v) => {
          if (v.value === void 0)
            throw new Error(`CodeGen: name "${v}" has no value`);
          return v.value.code;
        }, $, P);
      }
      _reduceValues(w, $, P = {}, v) {
        let _ = t.nil;
        for (const y in w) {
          const E = w[y];
          if (!E)
            continue;
          const o = P[y] = P[y] || /* @__PURE__ */ new Map();
          E.forEach((u) => {
            if (o.has(u))
              return;
            o.set(u, r.Started);
            let n = $(u);
            if (n) {
              const c = this.opts.es5 ? e.varKinds.var : e.varKinds.const;
              _ = (0, t._)`${_}${c} ${u} = ${n};${this.opts._n}`;
            } else if (n = v == null ? void 0 : v(u))
              _ = (0, t._)`${_}${n}${this.opts._n}`;
            else
              throw new s(u);
            o.set(u, r.Completed);
          });
        }
        return _;
      }
    }
    e.ValueScope = d;
  })(Qt)), Qt;
}
var gr;
function Y() {
  return gr || (gr = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.or = e.and = e.not = e.CodeGen = e.operators = e.varKinds = e.ValueScopeName = e.ValueScope = e.Scope = e.Name = e.regexpCode = e.stringify = e.getProperty = e.nil = e.strConcat = e.str = e._ = void 0;
    const t = /* @__PURE__ */ Mt(), s = /* @__PURE__ */ mr();
    var r = /* @__PURE__ */ Mt();
    Object.defineProperty(e, "_", { enumerable: !0, get: function() {
      return r._;
    } }), Object.defineProperty(e, "str", { enumerable: !0, get: function() {
      return r.str;
    } }), Object.defineProperty(e, "strConcat", { enumerable: !0, get: function() {
      return r.strConcat;
    } }), Object.defineProperty(e, "nil", { enumerable: !0, get: function() {
      return r.nil;
    } }), Object.defineProperty(e, "getProperty", { enumerable: !0, get: function() {
      return r.getProperty;
    } }), Object.defineProperty(e, "stringify", { enumerable: !0, get: function() {
      return r.stringify;
    } }), Object.defineProperty(e, "regexpCode", { enumerable: !0, get: function() {
      return r.regexpCode;
    } }), Object.defineProperty(e, "Name", { enumerable: !0, get: function() {
      return r.Name;
    } });
    var p = /* @__PURE__ */ mr();
    Object.defineProperty(e, "Scope", { enumerable: !0, get: function() {
      return p.Scope;
    } }), Object.defineProperty(e, "ValueScope", { enumerable: !0, get: function() {
      return p.ValueScope;
    } }), Object.defineProperty(e, "ValueScopeName", { enumerable: !0, get: function() {
      return p.ValueScopeName;
    } }), Object.defineProperty(e, "varKinds", { enumerable: !0, get: function() {
      return p.varKinds;
    } }), e.operators = {
      GT: new t._Code(">"),
      GTE: new t._Code(">="),
      LT: new t._Code("<"),
      LTE: new t._Code("<="),
      EQ: new t._Code("==="),
      NEQ: new t._Code("!=="),
      NOT: new t._Code("!"),
      OR: new t._Code("||"),
      AND: new t._Code("&&"),
      ADD: new t._Code("+")
    };
    class a {
      optimizeNodes() {
        return this;
      }
      optimizeNames(l, S) {
        return this;
      }
    }
    class h extends a {
      constructor(l, S, j) {
        super(), this.varKind = l, this.name = S, this.rhs = j;
      }
      render({ es5: l, _n: S }) {
        const j = l ? s.varKinds.var : this.varKind, V = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${j} ${this.name}${V};` + S;
      }
      optimizeNames(l, S) {
        if (l[this.name.str])
          return this.rhs && (this.rhs = Q(this.rhs, l, S)), this;
      }
      get names() {
        return this.rhs instanceof t._CodeOrName ? this.rhs.names : {};
      }
    }
    class d extends a {
      constructor(l, S, j) {
        super(), this.lhs = l, this.rhs = S, this.sideEffects = j;
      }
      render({ _n: l }) {
        return `${this.lhs} = ${this.rhs};` + l;
      }
      optimizeNames(l, S) {
        if (!(this.lhs instanceof t.Name && !l[this.lhs.str] && !this.sideEffects))
          return this.rhs = Q(this.rhs, l, S), this;
      }
      get names() {
        const l = this.lhs instanceof t.Name ? {} : { ...this.lhs.names };
        return z(l, this.rhs);
      }
    }
    class m extends d {
      constructor(l, S, j, V) {
        super(l, j, V), this.op = S;
      }
      render({ _n: l }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + l;
      }
    }
    class w extends a {
      constructor(l) {
        super(), this.label = l, this.names = {};
      }
      render({ _n: l }) {
        return `${this.label}:` + l;
      }
    }
    class $ extends a {
      constructor(l) {
        super(), this.label = l, this.names = {};
      }
      render({ _n: l }) {
        return `break${this.label ? ` ${this.label}` : ""};` + l;
      }
    }
    class P extends a {
      constructor(l) {
        super(), this.error = l;
      }
      render({ _n: l }) {
        return `throw ${this.error};` + l;
      }
      get names() {
        return this.error.names;
      }
    }
    class v extends a {
      constructor(l) {
        super(), this.code = l;
      }
      render({ _n: l }) {
        return `${this.code};` + l;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(l, S) {
        return this.code = Q(this.code, l, S), this;
      }
      get names() {
        return this.code instanceof t._CodeOrName ? this.code.names : {};
      }
    }
    class _ extends a {
      constructor(l = []) {
        super(), this.nodes = l;
      }
      render(l) {
        return this.nodes.reduce((S, j) => S + j.render(l), "");
      }
      optimizeNodes() {
        const { nodes: l } = this;
        let S = l.length;
        for (; S--; ) {
          const j = l[S].optimizeNodes();
          Array.isArray(j) ? l.splice(S, 1, ...j) : j ? l[S] = j : l.splice(S, 1);
        }
        return l.length > 0 ? this : void 0;
      }
      optimizeNames(l, S) {
        const { nodes: j } = this;
        let V = j.length;
        for (; V--; ) {
          const U = j[V];
          U.optimizeNames(l, S) || (se(l, U.names), j.splice(V, 1));
        }
        return j.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((l, S) => K(l, S.names), {});
      }
    }
    class y extends _ {
      render(l) {
        return "{" + l._n + super.render(l) + "}" + l._n;
      }
    }
    class E extends _ {
    }
    class o extends y {
    }
    o.kind = "else";
    class u extends y {
      constructor(l, S) {
        super(S), this.condition = l;
      }
      render(l) {
        let S = `if(${this.condition})` + super.render(l);
        return this.else && (S += "else " + this.else.render(l)), S;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const l = this.condition;
        if (l === !0)
          return this.nodes;
        let S = this.else;
        if (S) {
          const j = S.optimizeNodes();
          S = this.else = Array.isArray(j) ? new o(j) : j;
        }
        if (S)
          return l === !1 ? S instanceof u ? S : S.nodes : this.nodes.length ? this : new u(we(l), S instanceof u ? [S] : S.nodes);
        if (!(l === !1 || !this.nodes.length))
          return this;
      }
      optimizeNames(l, S) {
        var j;
        if (this.else = (j = this.else) === null || j === void 0 ? void 0 : j.optimizeNames(l, S), !!(super.optimizeNames(l, S) || this.else))
          return this.condition = Q(this.condition, l, S), this;
      }
      get names() {
        const l = super.names;
        return z(l, this.condition), this.else && K(l, this.else.names), l;
      }
    }
    u.kind = "if";
    class n extends y {
    }
    n.kind = "for";
    class c extends n {
      constructor(l) {
        super(), this.iteration = l;
      }
      render(l) {
        return `for(${this.iteration})` + super.render(l);
      }
      optimizeNames(l, S) {
        if (super.optimizeNames(l, S))
          return this.iteration = Q(this.iteration, l, S), this;
      }
      get names() {
        return K(super.names, this.iteration.names);
      }
    }
    class g extends n {
      constructor(l, S, j, V) {
        super(), this.varKind = l, this.name = S, this.from = j, this.to = V;
      }
      render(l) {
        const S = l.es5 ? s.varKinds.var : this.varKind, { name: j, from: V, to: U } = this;
        return `for(${S} ${j}=${V}; ${j}<${U}; ${j}++)` + super.render(l);
      }
      get names() {
        const l = z(super.names, this.from);
        return z(l, this.to);
      }
    }
    class i extends n {
      constructor(l, S, j, V) {
        super(), this.loop = l, this.varKind = S, this.name = j, this.iterable = V;
      }
      render(l) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(l);
      }
      optimizeNames(l, S) {
        if (super.optimizeNames(l, S))
          return this.iterable = Q(this.iterable, l, S), this;
      }
      get names() {
        return K(super.names, this.iterable.names);
      }
    }
    class f extends y {
      constructor(l, S, j) {
        super(), this.name = l, this.args = S, this.async = j;
      }
      render(l) {
        return `${this.async ? "async " : ""}function ${this.name}(${this.args})` + super.render(l);
      }
    }
    f.kind = "func";
    class b extends _ {
      render(l) {
        return "return " + super.render(l);
      }
    }
    b.kind = "return";
    class T extends y {
      render(l) {
        let S = "try" + super.render(l);
        return this.catch && (S += this.catch.render(l)), this.finally && (S += this.finally.render(l)), S;
      }
      optimizeNodes() {
        var l, S;
        return super.optimizeNodes(), (l = this.catch) === null || l === void 0 || l.optimizeNodes(), (S = this.finally) === null || S === void 0 || S.optimizeNodes(), this;
      }
      optimizeNames(l, S) {
        var j, V;
        return super.optimizeNames(l, S), (j = this.catch) === null || j === void 0 || j.optimizeNames(l, S), (V = this.finally) === null || V === void 0 || V.optimizeNames(l, S), this;
      }
      get names() {
        const l = super.names;
        return this.catch && K(l, this.catch.names), this.finally && K(l, this.finally.names), l;
      }
    }
    class D extends y {
      constructor(l) {
        super(), this.error = l;
      }
      render(l) {
        return `catch(${this.error})` + super.render(l);
      }
    }
    D.kind = "catch";
    class F extends y {
      render(l) {
        return "finally" + super.render(l);
      }
    }
    F.kind = "finally";
    class L {
      constructor(l, S = {}) {
        this._values = {}, this._blockStarts = [], this._constants = {}, this.opts = { ...S, _n: S.lines ? `
` : "" }, this._extScope = l, this._scope = new s.Scope({ parent: l }), this._nodes = [new E()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(l) {
        return this._scope.name(l);
      }
      // reserves unique name in the external scope
      scopeName(l) {
        return this._extScope.name(l);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(l, S) {
        const j = this._extScope.value(l, S);
        return (this._values[j.prefix] || (this._values[j.prefix] = /* @__PURE__ */ new Set())).add(j), j;
      }
      getScopeValue(l, S) {
        return this._extScope.getValue(l, S);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(l) {
        return this._extScope.scopeRefs(l, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(l, S, j, V) {
        const U = this._scope.toName(S);
        return j !== void 0 && V && (this._constants[U.str] = j), this._leafNode(new h(l, U, j)), U;
      }
      // `const` declaration (`var` in es5 mode)
      const(l, S, j) {
        return this._def(s.varKinds.const, l, S, j);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(l, S, j) {
        return this._def(s.varKinds.let, l, S, j);
      }
      // `var` declaration with optional assignment
      var(l, S, j) {
        return this._def(s.varKinds.var, l, S, j);
      }
      // assignment code
      assign(l, S, j) {
        return this._leafNode(new d(l, S, j));
      }
      // `+=` code
      add(l, S) {
        return this._leafNode(new m(l, e.operators.ADD, S));
      }
      // appends passed SafeExpr to code or executes Block
      code(l) {
        return typeof l == "function" ? l() : l !== t.nil && this._leafNode(new v(l)), this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...l) {
        const S = ["{"];
        for (const [j, V] of l)
          S.length > 1 && S.push(","), S.push(j), (j !== V || this.opts.es5) && (S.push(":"), (0, t.addCodeArg)(S, V));
        return S.push("}"), new t._Code(S);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(l, S, j) {
        if (this._blockNode(new u(l)), S && j)
          this.code(S).else().code(j).endIf();
        else if (S)
          this.code(S).endIf();
        else if (j)
          throw new Error('CodeGen: "else" body without "then" body');
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(l) {
        return this._elseNode(new u(l));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new o());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(u, o);
      }
      _for(l, S) {
        return this._blockNode(l), S && this.code(S).endFor(), this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(l, S) {
        return this._for(new c(l), S);
      }
      // `for` statement for a range of values
      forRange(l, S, j, V, U = this.opts.es5 ? s.varKinds.var : s.varKinds.let) {
        const x = this._scope.toName(l);
        return this._for(new g(U, x, S, j), () => V(x));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(l, S, j, V = s.varKinds.const) {
        const U = this._scope.toName(l);
        if (this.opts.es5) {
          const x = S instanceof t.Name ? S : this.var("_arr", S);
          return this.forRange("_i", 0, (0, t._)`${x}.length`, (X) => {
            this.var(U, (0, t._)`${x}[${X}]`), j(U);
          });
        }
        return this._for(new i("of", V, U, S), () => j(U));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(l, S, j, V = this.opts.es5 ? s.varKinds.var : s.varKinds.const) {
        if (this.opts.ownProperties)
          return this.forOf(l, (0, t._)`Object.keys(${S})`, j);
        const U = this._scope.toName(l);
        return this._for(new i("in", V, U, S), () => j(U));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(n);
      }
      // `label` statement
      label(l) {
        return this._leafNode(new w(l));
      }
      // `break` statement
      break(l) {
        return this._leafNode(new $(l));
      }
      // `return` statement
      return(l) {
        const S = new b();
        if (this._blockNode(S), this.code(l), S.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(b);
      }
      // `try` statement
      try(l, S, j) {
        if (!S && !j)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const V = new T();
        if (this._blockNode(V), this.code(l), S) {
          const U = this.name("e");
          this._currNode = V.catch = new D(U), S(U);
        }
        return j && (this._currNode = V.finally = new F(), this.code(j)), this._endBlockNode(D, F);
      }
      // `throw` statement
      throw(l) {
        return this._leafNode(new P(l));
      }
      // start self-balancing block
      block(l, S) {
        return this._blockStarts.push(this._nodes.length), l && this.code(l).endBlock(S), this;
      }
      // end the current self-balancing block
      endBlock(l) {
        const S = this._blockStarts.pop();
        if (S === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const j = this._nodes.length - S;
        if (j < 0 || l !== void 0 && j !== l)
          throw new Error(`CodeGen: wrong number of nodes: ${j} vs ${l} expected`);
        return this._nodes.length = S, this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(l, S = t.nil, j, V) {
        return this._blockNode(new f(l, S, j)), V && this.code(V).endFunc(), this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(f);
      }
      optimize(l = 1) {
        for (; l-- > 0; )
          this._root.optimizeNodes(), this._root.optimizeNames(this._root.names, this._constants);
      }
      _leafNode(l) {
        return this._currNode.nodes.push(l), this;
      }
      _blockNode(l) {
        this._currNode.nodes.push(l), this._nodes.push(l);
      }
      _endBlockNode(l, S) {
        const j = this._currNode;
        if (j instanceof l || S && j instanceof S)
          return this._nodes.pop(), this;
        throw new Error(`CodeGen: not in block "${S ? `${l.kind}/${S.kind}` : l.kind}"`);
      }
      _elseNode(l) {
        const S = this._currNode;
        if (!(S instanceof u))
          throw new Error('CodeGen: "else" without "if"');
        return this._currNode = S.else = l, this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const l = this._nodes;
        return l[l.length - 1];
      }
      set _currNode(l) {
        const S = this._nodes;
        S[S.length - 1] = l;
      }
    }
    e.CodeGen = L;
    function K(N, l) {
      for (const S in l)
        N[S] = (N[S] || 0) + (l[S] || 0);
      return N;
    }
    function z(N, l) {
      return l instanceof t._CodeOrName ? K(N, l.names) : N;
    }
    function Q(N, l, S) {
      if (N instanceof t.Name)
        return j(N);
      if (!V(N))
        return N;
      return new t._Code(N._items.reduce((U, x) => (x instanceof t.Name && (x = j(x)), x instanceof t._Code ? U.push(...x._items) : U.push(x), U), []));
      function j(U) {
        const x = S[U.str];
        return x === void 0 || l[U.str] !== 1 ? U : (delete l[U.str], x);
      }
      function V(U) {
        return U instanceof t._Code && U._items.some((x) => x instanceof t.Name && l[x.str] === 1 && S[x.str] !== void 0);
      }
    }
    function se(N, l) {
      for (const S in l)
        N[S] = (N[S] || 0) - (l[S] || 0);
    }
    function we(N) {
      return typeof N == "boolean" || typeof N == "number" || N === null ? !N : (0, t._)`!${q(N)}`;
    }
    e.not = we;
    const be = I(e.operators.AND);
    function te(...N) {
      return N.reduce(be);
    }
    e.and = te;
    const Oe = I(e.operators.OR);
    function A(...N) {
      return N.reduce(Oe);
    }
    e.or = A;
    function I(N) {
      return (l, S) => l === t.nil ? S : S === t.nil ? l : (0, t._)`${q(l)} ${N} ${q(S)}`;
    }
    function q(N) {
      return N instanceof t.Name ? N : (0, t._)`(${N})`;
    }
  })(Yt)), Yt;
}
var J = {}, yr;
function Z() {
  if (yr) return J;
  yr = 1, Object.defineProperty(J, "__esModule", { value: !0 }), J.checkStrictMode = J.getErrorPath = J.Type = J.useFunc = J.setEvaluated = J.evaluatedPropsToName = J.mergeEvaluated = J.eachItem = J.unescapeJsonPointer = J.escapeJsonPointer = J.escapeFragment = J.unescapeFragment = J.schemaRefOrVal = J.schemaHasRulesButRef = J.schemaHasRules = J.checkUnknownRules = J.alwaysValidSchema = J.toHash = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Mt();
  function s(i) {
    const f = {};
    for (const b of i)
      f[b] = !0;
    return f;
  }
  J.toHash = s;
  function r(i, f) {
    return typeof f == "boolean" ? f : Object.keys(f).length === 0 ? !0 : (p(i, f), !a(f, i.self.RULES.all));
  }
  J.alwaysValidSchema = r;
  function p(i, f = i.schema) {
    const { opts: b, self: T } = i;
    if (!b.strictSchema || typeof f == "boolean")
      return;
    const D = T.RULES.keywords;
    for (const F in f)
      D[F] || g(i, `unknown keyword: "${F}"`);
  }
  J.checkUnknownRules = p;
  function a(i, f) {
    if (typeof i == "boolean")
      return !i;
    for (const b in i)
      if (f[b])
        return !0;
    return !1;
  }
  J.schemaHasRules = a;
  function h(i, f) {
    if (typeof i == "boolean")
      return !i;
    for (const b in i)
      if (b !== "$ref" && f.all[b])
        return !0;
    return !1;
  }
  J.schemaHasRulesButRef = h;
  function d({ topSchemaRef: i, schemaPath: f }, b, T, D) {
    if (!D) {
      if (typeof b == "number" || typeof b == "boolean")
        return b;
      if (typeof b == "string")
        return (0, e._)`${b}`;
    }
    return (0, e._)`${i}${f}${(0, e.getProperty)(T)}`;
  }
  J.schemaRefOrVal = d;
  function m(i) {
    return P(decodeURIComponent(i));
  }
  J.unescapeFragment = m;
  function w(i) {
    return encodeURIComponent($(i));
  }
  J.escapeFragment = w;
  function $(i) {
    return typeof i == "number" ? `${i}` : i.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  J.escapeJsonPointer = $;
  function P(i) {
    return i.replace(/~1/g, "/").replace(/~0/g, "~");
  }
  J.unescapeJsonPointer = P;
  function v(i, f) {
    if (Array.isArray(i))
      for (const b of i)
        f(b);
    else
      f(i);
  }
  J.eachItem = v;
  function _({ mergeNames: i, mergeToName: f, mergeValues: b, resultToName: T }) {
    return (D, F, L, K) => {
      const z = L === void 0 ? F : L instanceof e.Name ? (F instanceof e.Name ? i(D, F, L) : f(D, F, L), L) : F instanceof e.Name ? (f(D, L, F), F) : b(F, L);
      return K === e.Name && !(z instanceof e.Name) ? T(D, z) : z;
    };
  }
  J.mergeEvaluated = {
    props: _({
      mergeNames: (i, f, b) => i.if((0, e._)`${b} !== true && ${f} !== undefined`, () => {
        i.if((0, e._)`${f} === true`, () => i.assign(b, !0), () => i.assign(b, (0, e._)`${b} || {}`).code((0, e._)`Object.assign(${b}, ${f})`));
      }),
      mergeToName: (i, f, b) => i.if((0, e._)`${b} !== true`, () => {
        f === !0 ? i.assign(b, !0) : (i.assign(b, (0, e._)`${b} || {}`), E(i, b, f));
      }),
      mergeValues: (i, f) => i === !0 ? !0 : { ...i, ...f },
      resultToName: y
    }),
    items: _({
      mergeNames: (i, f, b) => i.if((0, e._)`${b} !== true && ${f} !== undefined`, () => i.assign(b, (0, e._)`${f} === true ? true : ${b} > ${f} ? ${b} : ${f}`)),
      mergeToName: (i, f, b) => i.if((0, e._)`${b} !== true`, () => i.assign(b, f === !0 ? !0 : (0, e._)`${b} > ${f} ? ${b} : ${f}`)),
      mergeValues: (i, f) => i === !0 ? !0 : Math.max(i, f),
      resultToName: (i, f) => i.var("items", f)
    })
  };
  function y(i, f) {
    if (f === !0)
      return i.var("props", !0);
    const b = i.var("props", (0, e._)`{}`);
    return f !== void 0 && E(i, b, f), b;
  }
  J.evaluatedPropsToName = y;
  function E(i, f, b) {
    Object.keys(b).forEach((T) => i.assign((0, e._)`${f}${(0, e.getProperty)(T)}`, !0));
  }
  J.setEvaluated = E;
  const o = {};
  function u(i, f) {
    return i.scopeValue("func", {
      ref: f,
      code: o[f.code] || (o[f.code] = new t._Code(f.code))
    });
  }
  J.useFunc = u;
  var n;
  (function(i) {
    i[i.Num = 0] = "Num", i[i.Str = 1] = "Str";
  })(n || (J.Type = n = {}));
  function c(i, f, b) {
    if (i instanceof e.Name) {
      const T = f === n.Num;
      return b ? T ? (0, e._)`"[" + ${i} + "]"` : (0, e._)`"['" + ${i} + "']"` : T ? (0, e._)`"/" + ${i}` : (0, e._)`"/" + ${i}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
    }
    return b ? (0, e.getProperty)(i).toString() : "/" + $(i);
  }
  J.getErrorPath = c;
  function g(i, f, b = i.opts.strictSchema) {
    if (b) {
      if (f = `strict mode: ${f}`, b === !0)
        throw new Error(f);
      i.self.logger.warn(f);
    }
  }
  return J.checkStrictMode = g, J;
}
var xe = {}, _r;
function ke() {
  if (_r) return xe;
  _r = 1, Object.defineProperty(xe, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = {
    // validation function arguments
    data: new e.Name("data"),
    // data passed to validation function
    // args passed from referencing schema
    valCxt: new e.Name("valCxt"),
    // validation/data context - should not be used directly, it is destructured to the names below
    instancePath: new e.Name("instancePath"),
    parentData: new e.Name("parentData"),
    parentDataProperty: new e.Name("parentDataProperty"),
    rootData: new e.Name("rootData"),
    // root data - same as the data passed to the first/top validation function
    dynamicAnchors: new e.Name("dynamicAnchors"),
    // used to support recursiveRef and dynamicRef
    // function scoped variables
    vErrors: new e.Name("vErrors"),
    // null or array of validation errors
    errors: new e.Name("errors"),
    // counter of validation errors
    this: new e.Name("this"),
    // "globals"
    self: new e.Name("self"),
    scope: new e.Name("scope"),
    // JTD serialize/parse name for JSON string and position
    json: new e.Name("json"),
    jsonPos: new e.Name("jsonPos"),
    jsonLen: new e.Name("jsonLen"),
    jsonPart: new e.Name("jsonPart")
  };
  return xe.default = t, xe;
}
var vr;
function Lt() {
  return vr || (vr = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.extendErrors = e.resetErrorsCount = e.reportExtraError = e.reportError = e.keyword$DataError = e.keywordError = void 0;
    const t = /* @__PURE__ */ Y(), s = /* @__PURE__ */ Z(), r = /* @__PURE__ */ ke();
    e.keywordError = {
      message: ({ keyword: o }) => (0, t.str)`must pass "${o}" keyword validation`
    }, e.keyword$DataError = {
      message: ({ keyword: o, schemaType: u }) => u ? (0, t.str)`"${o}" keyword must be ${u} ($data)` : (0, t.str)`"${o}" keyword is invalid ($data)`
    };
    function p(o, u = e.keywordError, n, c) {
      const { it: g } = o, { gen: i, compositeRule: f, allErrors: b } = g, T = P(o, u, n);
      c ?? (f || b) ? m(i, T) : w(g, (0, t._)`[${T}]`);
    }
    e.reportError = p;
    function a(o, u = e.keywordError, n) {
      const { it: c } = o, { gen: g, compositeRule: i, allErrors: f } = c, b = P(o, u, n);
      m(g, b), i || f || w(c, r.default.vErrors);
    }
    e.reportExtraError = a;
    function h(o, u) {
      o.assign(r.default.errors, u), o.if((0, t._)`${r.default.vErrors} !== null`, () => o.if(u, () => o.assign((0, t._)`${r.default.vErrors}.length`, u), () => o.assign(r.default.vErrors, null)));
    }
    e.resetErrorsCount = h;
    function d({ gen: o, keyword: u, schemaValue: n, data: c, errsCount: g, it: i }) {
      if (g === void 0)
        throw new Error("ajv implementation error");
      const f = o.name("err");
      o.forRange("i", g, r.default.errors, (b) => {
        o.const(f, (0, t._)`${r.default.vErrors}[${b}]`), o.if((0, t._)`${f}.instancePath === undefined`, () => o.assign((0, t._)`${f}.instancePath`, (0, t.strConcat)(r.default.instancePath, i.errorPath))), o.assign((0, t._)`${f}.schemaPath`, (0, t.str)`${i.errSchemaPath}/${u}`), i.opts.verbose && (o.assign((0, t._)`${f}.schema`, n), o.assign((0, t._)`${f}.data`, c));
      });
    }
    e.extendErrors = d;
    function m(o, u) {
      const n = o.const("err", u);
      o.if((0, t._)`${r.default.vErrors} === null`, () => o.assign(r.default.vErrors, (0, t._)`[${n}]`), (0, t._)`${r.default.vErrors}.push(${n})`), o.code((0, t._)`${r.default.errors}++`);
    }
    function w(o, u) {
      const { gen: n, validateName: c, schemaEnv: g } = o;
      g.$async ? n.throw((0, t._)`new ${o.ValidationError}(${u})`) : (n.assign((0, t._)`${c}.errors`, u), n.return(!1));
    }
    const $ = {
      keyword: new t.Name("keyword"),
      schemaPath: new t.Name("schemaPath"),
      // also used in JTD errors
      params: new t.Name("params"),
      propertyName: new t.Name("propertyName"),
      message: new t.Name("message"),
      schema: new t.Name("schema"),
      parentSchema: new t.Name("parentSchema")
    };
    function P(o, u, n) {
      const { createErrors: c } = o.it;
      return c === !1 ? (0, t._)`{}` : v(o, u, n);
    }
    function v(o, u, n = {}) {
      const { gen: c, it: g } = o, i = [
        _(g, n),
        y(o, n)
      ];
      return E(o, u, i), c.object(...i);
    }
    function _({ errorPath: o }, { instancePath: u }) {
      const n = u ? (0, t.str)`${o}${(0, s.getErrorPath)(u, s.Type.Str)}` : o;
      return [r.default.instancePath, (0, t.strConcat)(r.default.instancePath, n)];
    }
    function y({ keyword: o, it: { errSchemaPath: u } }, { schemaPath: n, parentSchema: c }) {
      let g = c ? u : (0, t.str)`${u}/${o}`;
      return n && (g = (0, t.str)`${g}${(0, s.getErrorPath)(n, s.Type.Str)}`), [$.schemaPath, g];
    }
    function E(o, { params: u, message: n }, c) {
      const { keyword: g, data: i, schemaValue: f, it: b } = o, { opts: T, propertyName: D, topSchemaRef: F, schemaPath: L } = b;
      c.push([$.keyword, g], [$.params, typeof u == "function" ? u(o) : u || (0, t._)`{}`]), T.messages && c.push([$.message, typeof n == "function" ? n(o) : n]), T.verbose && c.push([$.schema, f], [$.parentSchema, (0, t._)`${F}${L}`], [r.default.data, i]), D && c.push([$.propertyName, D]);
    }
  })(Bt)), Bt;
}
var $r;
function is() {
  if ($r) return qe;
  $r = 1, Object.defineProperty(qe, "__esModule", { value: !0 }), qe.boolOrEmptySchema = qe.topBoolOrEmptySchema = void 0;
  const e = /* @__PURE__ */ Lt(), t = /* @__PURE__ */ Y(), s = /* @__PURE__ */ ke(), r = {
    message: "boolean schema is false"
  };
  function p(d) {
    const { gen: m, schema: w, validateName: $ } = d;
    w === !1 ? h(d, !1) : typeof w == "object" && w.$async === !0 ? m.return(s.default.data) : (m.assign((0, t._)`${$}.errors`, null), m.return(!0));
  }
  qe.topBoolOrEmptySchema = p;
  function a(d, m) {
    const { gen: w, schema: $ } = d;
    $ === !1 ? (w.var(m, !1), h(d)) : w.var(m, !0);
  }
  qe.boolOrEmptySchema = a;
  function h(d, m) {
    const { gen: w, data: $ } = d, P = {
      gen: w,
      keyword: "false schema",
      data: $,
      schema: !1,
      schemaCode: !1,
      schemaValue: !1,
      params: {},
      it: d
    };
    (0, e.reportError)(P, r, void 0, m);
  }
  return qe;
}
var oe = {}, De = {}, wr;
function Mn() {
  if (wr) return De;
  wr = 1, Object.defineProperty(De, "__esModule", { value: !0 }), De.getRules = De.isJSONType = void 0;
  const e = ["string", "number", "integer", "boolean", "null", "object", "array"], t = new Set(e);
  function s(p) {
    return typeof p == "string" && t.has(p);
  }
  De.isJSONType = s;
  function r() {
    const p = {
      number: { type: "number", rules: [] },
      string: { type: "string", rules: [] },
      array: { type: "array", rules: [] },
      object: { type: "object", rules: [] }
    };
    return {
      types: { ...p, integer: !0, boolean: !0, null: !0 },
      rules: [{ rules: [] }, p.number, p.string, p.array, p.object],
      post: { rules: [] },
      all: {},
      keywords: {}
    };
  }
  return De.getRules = r, De;
}
var Re = {}, Er;
function Fn() {
  if (Er) return Re;
  Er = 1, Object.defineProperty(Re, "__esModule", { value: !0 }), Re.shouldUseRule = Re.shouldUseGroup = Re.schemaHasRulesForType = void 0;
  function e({ schema: r, self: p }, a) {
    const h = p.RULES.types[a];
    return h && h !== !0 && t(r, h);
  }
  Re.schemaHasRulesForType = e;
  function t(r, p) {
    return p.rules.some((a) => s(r, a));
  }
  Re.shouldUseGroup = t;
  function s(r, p) {
    var a;
    return r[p.keyword] !== void 0 || ((a = p.definition.implements) === null || a === void 0 ? void 0 : a.some((h) => r[h] !== void 0));
  }
  return Re.shouldUseRule = s, Re;
}
var br;
function Ft() {
  if (br) return oe;
  br = 1, Object.defineProperty(oe, "__esModule", { value: !0 }), oe.reportTypeError = oe.checkDataTypes = oe.checkDataType = oe.coerceAndCheckDataType = oe.getJSONTypes = oe.getSchemaTypes = oe.DataType = void 0;
  const e = /* @__PURE__ */ Mn(), t = /* @__PURE__ */ Fn(), s = /* @__PURE__ */ Lt(), r = /* @__PURE__ */ Y(), p = /* @__PURE__ */ Z();
  var a;
  (function(n) {
    n[n.Correct = 0] = "Correct", n[n.Wrong = 1] = "Wrong";
  })(a || (oe.DataType = a = {}));
  function h(n) {
    const c = d(n.type);
    if (c.includes("null")) {
      if (n.nullable === !1)
        throw new Error("type: null contradicts nullable: false");
    } else {
      if (!c.length && n.nullable !== void 0)
        throw new Error('"nullable" cannot be used without "type"');
      n.nullable === !0 && c.push("null");
    }
    return c;
  }
  oe.getSchemaTypes = h;
  function d(n) {
    const c = Array.isArray(n) ? n : n ? [n] : [];
    if (c.every(e.isJSONType))
      return c;
    throw new Error("type must be JSONType or JSONType[]: " + c.join(","));
  }
  oe.getJSONTypes = d;
  function m(n, c) {
    const { gen: g, data: i, opts: f } = n, b = $(c, f.coerceTypes), T = c.length > 0 && !(b.length === 0 && c.length === 1 && (0, t.schemaHasRulesForType)(n, c[0]));
    if (T) {
      const D = y(c, i, f.strictNumbers, a.Wrong);
      g.if(D, () => {
        b.length ? P(n, c, b) : o(n);
      });
    }
    return T;
  }
  oe.coerceAndCheckDataType = m;
  const w = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
  function $(n, c) {
    return c ? n.filter((g) => w.has(g) || c === "array" && g === "array") : [];
  }
  function P(n, c, g) {
    const { gen: i, data: f, opts: b } = n, T = i.let("dataType", (0, r._)`typeof ${f}`), D = i.let("coerced", (0, r._)`undefined`);
    b.coerceTypes === "array" && i.if((0, r._)`${T} == 'object' && Array.isArray(${f}) && ${f}.length == 1`, () => i.assign(f, (0, r._)`${f}[0]`).assign(T, (0, r._)`typeof ${f}`).if(y(c, f, b.strictNumbers), () => i.assign(D, f))), i.if((0, r._)`${D} !== undefined`);
    for (const L of g)
      (w.has(L) || L === "array" && b.coerceTypes === "array") && F(L);
    i.else(), o(n), i.endIf(), i.if((0, r._)`${D} !== undefined`, () => {
      i.assign(f, D), v(n, D);
    });
    function F(L) {
      switch (L) {
        case "string":
          i.elseIf((0, r._)`${T} == "number" || ${T} == "boolean"`).assign(D, (0, r._)`"" + ${f}`).elseIf((0, r._)`${f} === null`).assign(D, (0, r._)`""`);
          return;
        case "number":
          i.elseIf((0, r._)`${T} == "boolean" || ${f} === null
              || (${T} == "string" && ${f} && ${f} == +${f})`).assign(D, (0, r._)`+${f}`);
          return;
        case "integer":
          i.elseIf((0, r._)`${T} === "boolean" || ${f} === null
              || (${T} === "string" && ${f} && ${f} == +${f} && !(${f} % 1))`).assign(D, (0, r._)`+${f}`);
          return;
        case "boolean":
          i.elseIf((0, r._)`${f} === "false" || ${f} === 0 || ${f} === null`).assign(D, !1).elseIf((0, r._)`${f} === "true" || ${f} === 1`).assign(D, !0);
          return;
        case "null":
          i.elseIf((0, r._)`${f} === "" || ${f} === 0 || ${f} === false`), i.assign(D, null);
          return;
        case "array":
          i.elseIf((0, r._)`${T} === "string" || ${T} === "number"
              || ${T} === "boolean" || ${f} === null`).assign(D, (0, r._)`[${f}]`);
      }
    }
  }
  function v({ gen: n, parentData: c, parentDataProperty: g }, i) {
    n.if((0, r._)`${c} !== undefined`, () => n.assign((0, r._)`${c}[${g}]`, i));
  }
  function _(n, c, g, i = a.Correct) {
    const f = i === a.Correct ? r.operators.EQ : r.operators.NEQ;
    let b;
    switch (n) {
      case "null":
        return (0, r._)`${c} ${f} null`;
      case "array":
        b = (0, r._)`Array.isArray(${c})`;
        break;
      case "object":
        b = (0, r._)`${c} && typeof ${c} == "object" && !Array.isArray(${c})`;
        break;
      case "integer":
        b = T((0, r._)`!(${c} % 1) && !isNaN(${c})`);
        break;
      case "number":
        b = T();
        break;
      default:
        return (0, r._)`typeof ${c} ${f} ${n}`;
    }
    return i === a.Correct ? b : (0, r.not)(b);
    function T(D = r.nil) {
      return (0, r.and)((0, r._)`typeof ${c} == "number"`, D, g ? (0, r._)`isFinite(${c})` : r.nil);
    }
  }
  oe.checkDataType = _;
  function y(n, c, g, i) {
    if (n.length === 1)
      return _(n[0], c, g, i);
    let f;
    const b = (0, p.toHash)(n);
    if (b.array && b.object) {
      const T = (0, r._)`typeof ${c} != "object"`;
      f = b.null ? T : (0, r._)`!${c} || ${T}`, delete b.null, delete b.array, delete b.object;
    } else
      f = r.nil;
    b.number && delete b.integer;
    for (const T in b)
      f = (0, r.and)(f, _(T, c, g, i));
    return f;
  }
  oe.checkDataTypes = y;
  const E = {
    message: ({ schema: n }) => `must be ${n}`,
    params: ({ schema: n, schemaValue: c }) => typeof n == "string" ? (0, r._)`{type: ${n}}` : (0, r._)`{type: ${c}}`
  };
  function o(n) {
    const c = u(n);
    (0, s.reportError)(c, E);
  }
  oe.reportTypeError = o;
  function u(n) {
    const { gen: c, data: g, schema: i } = n, f = (0, p.schemaRefOrVal)(n, i, "type");
    return {
      gen: c,
      keyword: "type",
      data: g,
      schema: i.type,
      schemaCode: f,
      schemaValue: f,
      parentSchema: i,
      params: {},
      it: n
    };
  }
  return oe;
}
var He = {}, Sr;
function os() {
  if (Sr) return He;
  Sr = 1, Object.defineProperty(He, "__esModule", { value: !0 }), He.assignDefaults = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z();
  function s(p, a) {
    const { properties: h, items: d } = p.schema;
    if (a === "object" && h)
      for (const m in h)
        r(p, m, h[m].default);
    else a === "array" && Array.isArray(d) && d.forEach((m, w) => r(p, w, m.default));
  }
  He.assignDefaults = s;
  function r(p, a, h) {
    const { gen: d, compositeRule: m, data: w, opts: $ } = p;
    if (h === void 0)
      return;
    const P = (0, e._)`${w}${(0, e.getProperty)(a)}`;
    if (m) {
      (0, t.checkStrictMode)(p, `default is ignored for: ${P}`);
      return;
    }
    let v = (0, e._)`${P} === undefined`;
    $.useDefaults === "empty" && (v = (0, e._)`${v} || ${P} === null || ${P} === ""`), d.if(v, (0, e._)`${P} = ${(0, e.stringify)(h)}`);
  }
  return He;
}
var ve = {}, ee = {}, Pr;
function $e() {
  if (Pr) return ee;
  Pr = 1, Object.defineProperty(ee, "__esModule", { value: !0 }), ee.validateUnion = ee.validateArray = ee.usePattern = ee.callValidateCode = ee.schemaProperties = ee.allSchemaProperties = ee.noPropertyInData = ee.propertyInData = ee.isOwnProperty = ee.hasPropFunc = ee.reportMissingProp = ee.checkMissingProp = ee.checkReportMissingProp = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), s = /* @__PURE__ */ ke(), r = /* @__PURE__ */ Z();
  function p(n, c) {
    const { gen: g, data: i, it: f } = n;
    g.if($(g, i, c, f.opts.ownProperties), () => {
      n.setParams({ missingProperty: (0, e._)`${c}` }, !0), n.error();
    });
  }
  ee.checkReportMissingProp = p;
  function a({ gen: n, data: c, it: { opts: g } }, i, f) {
    return (0, e.or)(...i.map((b) => (0, e.and)($(n, c, b, g.ownProperties), (0, e._)`${f} = ${b}`)));
  }
  ee.checkMissingProp = a;
  function h(n, c) {
    n.setParams({ missingProperty: c }, !0), n.error();
  }
  ee.reportMissingProp = h;
  function d(n) {
    return n.scopeValue("func", {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ref: Object.prototype.hasOwnProperty,
      code: (0, e._)`Object.prototype.hasOwnProperty`
    });
  }
  ee.hasPropFunc = d;
  function m(n, c, g) {
    return (0, e._)`${d(n)}.call(${c}, ${g})`;
  }
  ee.isOwnProperty = m;
  function w(n, c, g, i) {
    const f = (0, e._)`${c}${(0, e.getProperty)(g)} !== undefined`;
    return i ? (0, e._)`${f} && ${m(n, c, g)}` : f;
  }
  ee.propertyInData = w;
  function $(n, c, g, i) {
    const f = (0, e._)`${c}${(0, e.getProperty)(g)} === undefined`;
    return i ? (0, e.or)(f, (0, e.not)(m(n, c, g))) : f;
  }
  ee.noPropertyInData = $;
  function P(n) {
    return n ? Object.keys(n).filter((c) => c !== "__proto__") : [];
  }
  ee.allSchemaProperties = P;
  function v(n, c) {
    return P(c).filter((g) => !(0, t.alwaysValidSchema)(n, c[g]));
  }
  ee.schemaProperties = v;
  function _({ schemaCode: n, data: c, it: { gen: g, topSchemaRef: i, schemaPath: f, errorPath: b }, it: T }, D, F, L) {
    const K = L ? (0, e._)`${n}, ${c}, ${i}${f}` : c, z = [
      [s.default.instancePath, (0, e.strConcat)(s.default.instancePath, b)],
      [s.default.parentData, T.parentData],
      [s.default.parentDataProperty, T.parentDataProperty],
      [s.default.rootData, s.default.rootData]
    ];
    T.opts.dynamicRef && z.push([s.default.dynamicAnchors, s.default.dynamicAnchors]);
    const Q = (0, e._)`${K}, ${g.object(...z)}`;
    return F !== e.nil ? (0, e._)`${D}.call(${F}, ${Q})` : (0, e._)`${D}(${Q})`;
  }
  ee.callValidateCode = _;
  const y = (0, e._)`new RegExp`;
  function E({ gen: n, it: { opts: c } }, g) {
    const i = c.unicodeRegExp ? "u" : "", { regExp: f } = c.code, b = f(g, i);
    return n.scopeValue("pattern", {
      key: b.toString(),
      ref: b,
      code: (0, e._)`${f.code === "new RegExp" ? y : (0, r.useFunc)(n, f)}(${g}, ${i})`
    });
  }
  ee.usePattern = E;
  function o(n) {
    const { gen: c, data: g, keyword: i, it: f } = n, b = c.name("valid");
    if (f.allErrors) {
      const D = c.let("valid", !0);
      return T(() => c.assign(D, !1)), D;
    }
    return c.var(b, !0), T(() => c.break()), b;
    function T(D) {
      const F = c.const("len", (0, e._)`${g}.length`);
      c.forRange("i", 0, F, (L) => {
        n.subschema({
          keyword: i,
          dataProp: L,
          dataPropType: t.Type.Num
        }, b), c.if((0, e.not)(b), D);
      });
    }
  }
  ee.validateArray = o;
  function u(n) {
    const { gen: c, schema: g, keyword: i, it: f } = n;
    if (!Array.isArray(g))
      throw new Error("ajv implementation error");
    if (g.some((F) => (0, t.alwaysValidSchema)(f, F)) && !f.opts.unevaluated)
      return;
    const T = c.let("valid", !1), D = c.name("_valid");
    c.block(() => g.forEach((F, L) => {
      const K = n.subschema({
        keyword: i,
        schemaProp: L,
        compositeRule: !0
      }, D);
      c.assign(T, (0, e._)`${T} || ${D}`), n.mergeValidEvaluated(K, D) || c.if((0, e.not)(T));
    })), n.result(T, () => n.reset(), () => n.error(!0));
  }
  return ee.validateUnion = u, ee;
}
var Rr;
function cs() {
  if (Rr) return ve;
  Rr = 1, Object.defineProperty(ve, "__esModule", { value: !0 }), ve.validateKeywordUsage = ve.validSchemaType = ve.funcKeywordCode = ve.macroKeywordCode = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ ke(), s = /* @__PURE__ */ $e(), r = /* @__PURE__ */ Lt();
  function p(v, _) {
    const { gen: y, keyword: E, schema: o, parentSchema: u, it: n } = v, c = _.macro.call(n.self, o, u, n), g = w(y, E, c);
    n.opts.validateSchema !== !1 && n.self.validateSchema(c, !0);
    const i = y.name("valid");
    v.subschema({
      schema: c,
      schemaPath: e.nil,
      errSchemaPath: `${n.errSchemaPath}/${E}`,
      topSchemaRef: g,
      compositeRule: !0
    }, i), v.pass(i, () => v.error(!0));
  }
  ve.macroKeywordCode = p;
  function a(v, _) {
    var y;
    const { gen: E, keyword: o, schema: u, parentSchema: n, $data: c, it: g } = v;
    m(g, _);
    const i = !c && _.compile ? _.compile.call(g.self, u, n, g) : _.validate, f = w(E, o, i), b = E.let("valid");
    v.block$data(b, T), v.ok((y = _.valid) !== null && y !== void 0 ? y : b);
    function T() {
      if (_.errors === !1)
        L(), _.modifying && h(v), K(() => v.error());
      else {
        const z = _.async ? D() : F();
        _.modifying && h(v), K(() => d(v, z));
      }
    }
    function D() {
      const z = E.let("ruleErrs", null);
      return E.try(() => L((0, e._)`await `), (Q) => E.assign(b, !1).if((0, e._)`${Q} instanceof ${g.ValidationError}`, () => E.assign(z, (0, e._)`${Q}.errors`), () => E.throw(Q))), z;
    }
    function F() {
      const z = (0, e._)`${f}.errors`;
      return E.assign(z, null), L(e.nil), z;
    }
    function L(z = _.async ? (0, e._)`await ` : e.nil) {
      const Q = g.opts.passContext ? t.default.this : t.default.self, se = !("compile" in _ && !c || _.schema === !1);
      E.assign(b, (0, e._)`${z}${(0, s.callValidateCode)(v, f, Q, se)}`, _.modifying);
    }
    function K(z) {
      var Q;
      E.if((0, e.not)((Q = _.valid) !== null && Q !== void 0 ? Q : b), z);
    }
  }
  ve.funcKeywordCode = a;
  function h(v) {
    const { gen: _, data: y, it: E } = v;
    _.if(E.parentData, () => _.assign(y, (0, e._)`${E.parentData}[${E.parentDataProperty}]`));
  }
  function d(v, _) {
    const { gen: y } = v;
    y.if((0, e._)`Array.isArray(${_})`, () => {
      y.assign(t.default.vErrors, (0, e._)`${t.default.vErrors} === null ? ${_} : ${t.default.vErrors}.concat(${_})`).assign(t.default.errors, (0, e._)`${t.default.vErrors}.length`), (0, r.extendErrors)(v);
    }, () => v.error());
  }
  function m({ schemaEnv: v }, _) {
    if (_.async && !v.$async)
      throw new Error("async keyword in sync schema");
  }
  function w(v, _, y) {
    if (y === void 0)
      throw new Error(`keyword "${_}" failed to compile`);
    return v.scopeValue("keyword", typeof y == "function" ? { ref: y } : { ref: y, code: (0, e.stringify)(y) });
  }
  function $(v, _, y = !1) {
    return !_.length || _.some((E) => E === "array" ? Array.isArray(v) : E === "object" ? v && typeof v == "object" && !Array.isArray(v) : typeof v == E || y && typeof v > "u");
  }
  ve.validSchemaType = $;
  function P({ schema: v, opts: _, self: y, errSchemaPath: E }, o, u) {
    if (Array.isArray(o.keyword) ? !o.keyword.includes(u) : o.keyword !== u)
      throw new Error("ajv implementation error");
    const n = o.dependencies;
    if (n != null && n.some((c) => !Object.prototype.hasOwnProperty.call(v, c)))
      throw new Error(`parent schema must have dependencies of ${u}: ${n.join(",")}`);
    if (o.validateSchema && !o.validateSchema(v[u])) {
      const g = `keyword "${u}" value is invalid at path "${E}": ` + y.errorsText(o.validateSchema.errors);
      if (_.validateSchema === "log")
        y.logger.error(g);
      else
        throw new Error(g);
    }
  }
  return ve.validateKeywordUsage = P, ve;
}
var Ie = {}, Ir;
function us() {
  if (Ir) return Ie;
  Ir = 1, Object.defineProperty(Ie, "__esModule", { value: !0 }), Ie.extendSubschemaMode = Ie.extendSubschemaData = Ie.getSubschema = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z();
  function s(a, { keyword: h, schemaProp: d, schema: m, schemaPath: w, errSchemaPath: $, topSchemaRef: P }) {
    if (h !== void 0 && m !== void 0)
      throw new Error('both "keyword" and "schema" passed, only one allowed');
    if (h !== void 0) {
      const v = a.schema[h];
      return d === void 0 ? {
        schema: v,
        schemaPath: (0, e._)`${a.schemaPath}${(0, e.getProperty)(h)}`,
        errSchemaPath: `${a.errSchemaPath}/${h}`
      } : {
        schema: v[d],
        schemaPath: (0, e._)`${a.schemaPath}${(0, e.getProperty)(h)}${(0, e.getProperty)(d)}`,
        errSchemaPath: `${a.errSchemaPath}/${h}/${(0, t.escapeFragment)(d)}`
      };
    }
    if (m !== void 0) {
      if (w === void 0 || $ === void 0 || P === void 0)
        throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
      return {
        schema: m,
        schemaPath: w,
        topSchemaRef: P,
        errSchemaPath: $
      };
    }
    throw new Error('either "keyword" or "schema" must be passed');
  }
  Ie.getSubschema = s;
  function r(a, h, { dataProp: d, dataPropType: m, data: w, dataTypes: $, propertyName: P }) {
    if (w !== void 0 && d !== void 0)
      throw new Error('both "data" and "dataProp" passed, only one allowed');
    const { gen: v } = h;
    if (d !== void 0) {
      const { errorPath: y, dataPathArr: E, opts: o } = h, u = v.let("data", (0, e._)`${h.data}${(0, e.getProperty)(d)}`, !0);
      _(u), a.errorPath = (0, e.str)`${y}${(0, t.getErrorPath)(d, m, o.jsPropertySyntax)}`, a.parentDataProperty = (0, e._)`${d}`, a.dataPathArr = [...E, a.parentDataProperty];
    }
    if (w !== void 0) {
      const y = w instanceof e.Name ? w : v.let("data", w, !0);
      _(y), P !== void 0 && (a.propertyName = P);
    }
    $ && (a.dataTypes = $);
    function _(y) {
      a.data = y, a.dataLevel = h.dataLevel + 1, a.dataTypes = [], h.definedProperties = /* @__PURE__ */ new Set(), a.parentData = h.data, a.dataNames = [...h.dataNames, y];
    }
  }
  Ie.extendSubschemaData = r;
  function p(a, { jtdDiscriminator: h, jtdMetadata: d, compositeRule: m, createErrors: w, allErrors: $ }) {
    m !== void 0 && (a.compositeRule = m), w !== void 0 && (a.createErrors = w), $ !== void 0 && (a.allErrors = $), a.jtdDiscriminator = h, a.jtdMetadata = d;
  }
  return Ie.extendSubschemaMode = p, Ie;
}
var ue = {}, Zt, Or;
function Ln() {
  return Or || (Or = 1, Zt = function e(t, s) {
    if (t === s) return !0;
    if (t && s && typeof t == "object" && typeof s == "object") {
      if (t.constructor !== s.constructor) return !1;
      var r, p, a;
      if (Array.isArray(t)) {
        if (r = t.length, r != s.length) return !1;
        for (p = r; p-- !== 0; )
          if (!e(t[p], s[p])) return !1;
        return !0;
      }
      if (t.constructor === RegExp) return t.source === s.source && t.flags === s.flags;
      if (t.valueOf !== Object.prototype.valueOf) return t.valueOf() === s.valueOf();
      if (t.toString !== Object.prototype.toString) return t.toString() === s.toString();
      if (a = Object.keys(t), r = a.length, r !== Object.keys(s).length) return !1;
      for (p = r; p-- !== 0; )
        if (!Object.prototype.hasOwnProperty.call(s, a[p])) return !1;
      for (p = r; p-- !== 0; ) {
        var h = a[p];
        if (!e(t[h], s[h])) return !1;
      }
      return !0;
    }
    return t !== t && s !== s;
  }), Zt;
}
var xt = { exports: {} }, Nr;
function ls() {
  if (Nr) return xt.exports;
  Nr = 1;
  var e = xt.exports = function(r, p, a) {
    typeof p == "function" && (a = p, p = {}), a = p.cb || a;
    var h = typeof a == "function" ? a : a.pre || function() {
    }, d = a.post || function() {
    };
    t(p, h, d, r, "", r);
  };
  e.keywords = {
    additionalItems: !0,
    items: !0,
    contains: !0,
    additionalProperties: !0,
    propertyNames: !0,
    not: !0,
    if: !0,
    then: !0,
    else: !0
  }, e.arrayKeywords = {
    items: !0,
    allOf: !0,
    anyOf: !0,
    oneOf: !0
  }, e.propsKeywords = {
    $defs: !0,
    definitions: !0,
    properties: !0,
    patternProperties: !0,
    dependencies: !0
  }, e.skipKeywords = {
    default: !0,
    enum: !0,
    const: !0,
    required: !0,
    maximum: !0,
    minimum: !0,
    exclusiveMaximum: !0,
    exclusiveMinimum: !0,
    multipleOf: !0,
    maxLength: !0,
    minLength: !0,
    pattern: !0,
    format: !0,
    maxItems: !0,
    minItems: !0,
    uniqueItems: !0,
    maxProperties: !0,
    minProperties: !0
  };
  function t(r, p, a, h, d, m, w, $, P, v) {
    if (h && typeof h == "object" && !Array.isArray(h)) {
      p(h, d, m, w, $, P, v);
      for (var _ in h) {
        var y = h[_];
        if (Array.isArray(y)) {
          if (_ in e.arrayKeywords)
            for (var E = 0; E < y.length; E++)
              t(r, p, a, y[E], d + "/" + _ + "/" + E, m, d, _, h, E);
        } else if (_ in e.propsKeywords) {
          if (y && typeof y == "object")
            for (var o in y)
              t(r, p, a, y[o], d + "/" + _ + "/" + s(o), m, d, _, h, o);
        } else (_ in e.keywords || r.allKeys && !(_ in e.skipKeywords)) && t(r, p, a, y, d + "/" + _, m, d, _, h);
      }
      a(h, d, m, w, $, P, v);
    }
  }
  function s(r) {
    return r.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  return xt.exports;
}
var Tr;
function Vt() {
  if (Tr) return ue;
  Tr = 1, Object.defineProperty(ue, "__esModule", { value: !0 }), ue.getSchemaRefs = ue.resolveUrl = ue.normalizeId = ue._getFullPath = ue.getFullPath = ue.inlineRef = void 0;
  const e = /* @__PURE__ */ Z(), t = Ln(), s = ls(), r = /* @__PURE__ */ new Set([
    "type",
    "format",
    "pattern",
    "maxLength",
    "minLength",
    "maxProperties",
    "minProperties",
    "maxItems",
    "minItems",
    "maximum",
    "minimum",
    "uniqueItems",
    "multipleOf",
    "required",
    "enum",
    "const"
  ]);
  function p(E, o = !0) {
    return typeof E == "boolean" ? !0 : o === !0 ? !h(E) : o ? d(E) <= o : !1;
  }
  ue.inlineRef = p;
  const a = /* @__PURE__ */ new Set([
    "$ref",
    "$recursiveRef",
    "$recursiveAnchor",
    "$dynamicRef",
    "$dynamicAnchor"
  ]);
  function h(E) {
    for (const o in E) {
      if (a.has(o))
        return !0;
      const u = E[o];
      if (Array.isArray(u) && u.some(h) || typeof u == "object" && h(u))
        return !0;
    }
    return !1;
  }
  function d(E) {
    let o = 0;
    for (const u in E) {
      if (u === "$ref")
        return 1 / 0;
      if (o++, !r.has(u) && (typeof E[u] == "object" && (0, e.eachItem)(E[u], (n) => o += d(n)), o === 1 / 0))
        return 1 / 0;
    }
    return o;
  }
  function m(E, o = "", u) {
    u !== !1 && (o = P(o));
    const n = E.parse(o);
    return w(E, n);
  }
  ue.getFullPath = m;
  function w(E, o) {
    return E.serialize(o).split("#")[0] + "#";
  }
  ue._getFullPath = w;
  const $ = /#\/?$/;
  function P(E) {
    return E ? E.replace($, "") : "";
  }
  ue.normalizeId = P;
  function v(E, o, u) {
    return u = P(u), E.resolve(o, u);
  }
  ue.resolveUrl = v;
  const _ = /^[a-z_][-a-z0-9._]*$/i;
  function y(E, o) {
    if (typeof E == "boolean")
      return {};
    const { schemaId: u, uriResolver: n } = this.opts, c = P(E[u] || o), g = { "": c }, i = m(n, c, !1), f = {}, b = /* @__PURE__ */ new Set();
    return s(E, { allKeys: !0 }, (F, L, K, z) => {
      if (z === void 0)
        return;
      const Q = i + L;
      let se = g[z];
      typeof F[u] == "string" && (se = we.call(this, F[u])), be.call(this, F.$anchor), be.call(this, F.$dynamicAnchor), g[L] = se;
      function we(te) {
        const Oe = this.opts.uriResolver.resolve;
        if (te = P(se ? Oe(se, te) : te), b.has(te))
          throw D(te);
        b.add(te);
        let A = this.refs[te];
        return typeof A == "string" && (A = this.refs[A]), typeof A == "object" ? T(F, A.schema, te) : te !== P(Q) && (te[0] === "#" ? (T(F, f[te], te), f[te] = F) : this.refs[te] = Q), te;
      }
      function be(te) {
        if (typeof te == "string") {
          if (!_.test(te))
            throw new Error(`invalid anchor "${te}"`);
          we.call(this, `#${te}`);
        }
      }
    }), f;
    function T(F, L, K) {
      if (L !== void 0 && !t(F, L))
        throw D(K);
    }
    function D(F) {
      return new Error(`reference "${F}" resolves to more than one schema`);
    }
  }
  return ue.getSchemaRefs = y, ue;
}
var jr;
function Gt() {
  if (jr) return Pe;
  jr = 1, Object.defineProperty(Pe, "__esModule", { value: !0 }), Pe.getData = Pe.KeywordCxt = Pe.validateFunctionCode = void 0;
  const e = /* @__PURE__ */ is(), t = /* @__PURE__ */ Ft(), s = /* @__PURE__ */ Fn(), r = /* @__PURE__ */ Ft(), p = /* @__PURE__ */ os(), a = /* @__PURE__ */ cs(), h = /* @__PURE__ */ us(), d = /* @__PURE__ */ Y(), m = /* @__PURE__ */ ke(), w = /* @__PURE__ */ Vt(), $ = /* @__PURE__ */ Z(), P = /* @__PURE__ */ Lt();
  function v(R) {
    if (i(R) && (b(R), g(R))) {
      o(R);
      return;
    }
    _(R, () => (0, e.topBoolOrEmptySchema)(R));
  }
  Pe.validateFunctionCode = v;
  function _({ gen: R, validateName: O, schema: k, schemaEnv: M, opts: G }, B) {
    G.code.es5 ? R.func(O, (0, d._)`${m.default.data}, ${m.default.valCxt}`, M.$async, () => {
      R.code((0, d._)`"use strict"; ${n(k, G)}`), E(R, G), R.code(B);
    }) : R.func(O, (0, d._)`${m.default.data}, ${y(G)}`, M.$async, () => R.code(n(k, G)).code(B));
  }
  function y(R) {
    return (0, d._)`{${m.default.instancePath}="", ${m.default.parentData}, ${m.default.parentDataProperty}, ${m.default.rootData}=${m.default.data}${R.dynamicRef ? (0, d._)`, ${m.default.dynamicAnchors}={}` : d.nil}}={}`;
  }
  function E(R, O) {
    R.if(m.default.valCxt, () => {
      R.var(m.default.instancePath, (0, d._)`${m.default.valCxt}.${m.default.instancePath}`), R.var(m.default.parentData, (0, d._)`${m.default.valCxt}.${m.default.parentData}`), R.var(m.default.parentDataProperty, (0, d._)`${m.default.valCxt}.${m.default.parentDataProperty}`), R.var(m.default.rootData, (0, d._)`${m.default.valCxt}.${m.default.rootData}`), O.dynamicRef && R.var(m.default.dynamicAnchors, (0, d._)`${m.default.valCxt}.${m.default.dynamicAnchors}`);
    }, () => {
      R.var(m.default.instancePath, (0, d._)`""`), R.var(m.default.parentData, (0, d._)`undefined`), R.var(m.default.parentDataProperty, (0, d._)`undefined`), R.var(m.default.rootData, m.default.data), O.dynamicRef && R.var(m.default.dynamicAnchors, (0, d._)`{}`);
    });
  }
  function o(R) {
    const { schema: O, opts: k, gen: M } = R;
    _(R, () => {
      k.$comment && O.$comment && z(R), F(R), M.let(m.default.vErrors, null), M.let(m.default.errors, 0), k.unevaluated && u(R), T(R), Q(R);
    });
  }
  function u(R) {
    const { gen: O, validateName: k } = R;
    R.evaluated = O.const("evaluated", (0, d._)`${k}.evaluated`), O.if((0, d._)`${R.evaluated}.dynamicProps`, () => O.assign((0, d._)`${R.evaluated}.props`, (0, d._)`undefined`)), O.if((0, d._)`${R.evaluated}.dynamicItems`, () => O.assign((0, d._)`${R.evaluated}.items`, (0, d._)`undefined`));
  }
  function n(R, O) {
    const k = typeof R == "object" && R[O.schemaId];
    return k && (O.code.source || O.code.process) ? (0, d._)`/*# sourceURL=${k} */` : d.nil;
  }
  function c(R, O) {
    if (i(R) && (b(R), g(R))) {
      f(R, O);
      return;
    }
    (0, e.boolOrEmptySchema)(R, O);
  }
  function g({ schema: R, self: O }) {
    if (typeof R == "boolean")
      return !R;
    for (const k in R)
      if (O.RULES.all[k])
        return !0;
    return !1;
  }
  function i(R) {
    return typeof R.schema != "boolean";
  }
  function f(R, O) {
    const { schema: k, gen: M, opts: G } = R;
    G.$comment && k.$comment && z(R), L(R), K(R);
    const B = M.const("_errs", m.default.errors);
    T(R, B), M.var(O, (0, d._)`${B} === ${m.default.errors}`);
  }
  function b(R) {
    (0, $.checkUnknownRules)(R), D(R);
  }
  function T(R, O) {
    if (R.opts.jtd)
      return we(R, [], !1, O);
    const k = (0, t.getSchemaTypes)(R.schema), M = (0, t.coerceAndCheckDataType)(R, k);
    we(R, k, !M, O);
  }
  function D(R) {
    const { schema: O, errSchemaPath: k, opts: M, self: G } = R;
    O.$ref && M.ignoreKeywordsWithRef && (0, $.schemaHasRulesButRef)(O, G.RULES) && G.logger.warn(`$ref: keywords ignored in schema at path "${k}"`);
  }
  function F(R) {
    const { schema: O, opts: k } = R;
    O.default !== void 0 && k.useDefaults && k.strictSchema && (0, $.checkStrictMode)(R, "default is ignored in the schema root");
  }
  function L(R) {
    const O = R.schema[R.opts.schemaId];
    O && (R.baseId = (0, w.resolveUrl)(R.opts.uriResolver, R.baseId, O));
  }
  function K(R) {
    if (R.schema.$async && !R.schemaEnv.$async)
      throw new Error("async schema in sync schema");
  }
  function z({ gen: R, schemaEnv: O, schema: k, errSchemaPath: M, opts: G }) {
    const B = k.$comment;
    if (G.$comment === !0)
      R.code((0, d._)`${m.default.self}.logger.log(${B})`);
    else if (typeof G.$comment == "function") {
      const ae = (0, d.str)`${M}/$comment`, _e = R.scopeValue("root", { ref: O.root });
      R.code((0, d._)`${m.default.self}.opts.$comment(${B}, ${ae}, ${_e}.schema)`);
    }
  }
  function Q(R) {
    const { gen: O, schemaEnv: k, validateName: M, ValidationError: G, opts: B } = R;
    k.$async ? O.if((0, d._)`${m.default.errors} === 0`, () => O.return(m.default.data), () => O.throw((0, d._)`new ${G}(${m.default.vErrors})`)) : (O.assign((0, d._)`${M}.errors`, m.default.vErrors), B.unevaluated && se(R), O.return((0, d._)`${m.default.errors} === 0`));
  }
  function se({ gen: R, evaluated: O, props: k, items: M }) {
    k instanceof d.Name && R.assign((0, d._)`${O}.props`, k), M instanceof d.Name && R.assign((0, d._)`${O}.items`, M);
  }
  function we(R, O, k, M) {
    const { gen: G, schema: B, data: ae, allErrors: _e, opts: he, self: pe } = R, { RULES: ie } = pe;
    if (B.$ref && (he.ignoreKeywordsWithRef || !(0, $.schemaHasRulesButRef)(B, ie))) {
      G.block(() => V(R, "$ref", ie.all.$ref.definition));
      return;
    }
    he.jtd || te(R, O), G.block(() => {
      for (const ge of ie.rules)
        Le(ge);
      Le(ie.post);
    });
    function Le(ge) {
      (0, s.shouldUseGroup)(B, ge) && (ge.type ? (G.if((0, r.checkDataType)(ge.type, ae, he.strictNumbers)), be(R, ge), O.length === 1 && O[0] === ge.type && k && (G.else(), (0, r.reportTypeError)(R)), G.endIf()) : be(R, ge), _e || G.if((0, d._)`${m.default.errors} === ${M || 0}`));
    }
  }
  function be(R, O) {
    const { gen: k, schema: M, opts: { useDefaults: G } } = R;
    G && (0, p.assignDefaults)(R, O.type), k.block(() => {
      for (const B of O.rules)
        (0, s.shouldUseRule)(M, B) && V(R, B.keyword, B.definition, O.type);
    });
  }
  function te(R, O) {
    R.schemaEnv.meta || !R.opts.strictTypes || (Oe(R, O), R.opts.allowUnionTypes || A(R, O), I(R, R.dataTypes));
  }
  function Oe(R, O) {
    if (O.length) {
      if (!R.dataTypes.length) {
        R.dataTypes = O;
        return;
      }
      O.forEach((k) => {
        N(R.dataTypes, k) || S(R, `type "${k}" not allowed by context "${R.dataTypes.join(",")}"`);
      }), l(R, O);
    }
  }
  function A(R, O) {
    O.length > 1 && !(O.length === 2 && O.includes("null")) && S(R, "use allowUnionTypes to allow union type keyword");
  }
  function I(R, O) {
    const k = R.self.RULES.all;
    for (const M in k) {
      const G = k[M];
      if (typeof G == "object" && (0, s.shouldUseRule)(R.schema, G)) {
        const { type: B } = G.definition;
        B.length && !B.some((ae) => q(O, ae)) && S(R, `missing type "${B.join(",")}" for keyword "${M}"`);
      }
    }
  }
  function q(R, O) {
    return R.includes(O) || O === "number" && R.includes("integer");
  }
  function N(R, O) {
    return R.includes(O) || O === "integer" && R.includes("number");
  }
  function l(R, O) {
    const k = [];
    for (const M of R.dataTypes)
      N(O, M) ? k.push(M) : O.includes("integer") && M === "number" && k.push("integer");
    R.dataTypes = k;
  }
  function S(R, O) {
    const k = R.schemaEnv.baseId + R.errSchemaPath;
    O += ` at "${k}" (strictTypes)`, (0, $.checkStrictMode)(R, O, R.opts.strictTypes);
  }
  class j {
    constructor(O, k, M) {
      if ((0, a.validateKeywordUsage)(O, k, M), this.gen = O.gen, this.allErrors = O.allErrors, this.keyword = M, this.data = O.data, this.schema = O.schema[M], this.$data = k.$data && O.opts.$data && this.schema && this.schema.$data, this.schemaValue = (0, $.schemaRefOrVal)(O, this.schema, M, this.$data), this.schemaType = k.schemaType, this.parentSchema = O.schema, this.params = {}, this.it = O, this.def = k, this.$data)
        this.schemaCode = O.gen.const("vSchema", X(this.$data, O));
      else if (this.schemaCode = this.schemaValue, !(0, a.validSchemaType)(this.schema, k.schemaType, k.allowUndefined))
        throw new Error(`${M} value must be ${JSON.stringify(k.schemaType)}`);
      ("code" in k ? k.trackErrors : k.errors !== !1) && (this.errsCount = O.gen.const("_errs", m.default.errors));
    }
    result(O, k, M) {
      this.failResult((0, d.not)(O), k, M);
    }
    failResult(O, k, M) {
      this.gen.if(O), M ? M() : this.error(), k ? (this.gen.else(), k(), this.allErrors && this.gen.endIf()) : this.allErrors ? this.gen.endIf() : this.gen.else();
    }
    pass(O, k) {
      this.failResult((0, d.not)(O), void 0, k);
    }
    fail(O) {
      if (O === void 0) {
        this.error(), this.allErrors || this.gen.if(!1);
        return;
      }
      this.gen.if(O), this.error(), this.allErrors ? this.gen.endIf() : this.gen.else();
    }
    fail$data(O) {
      if (!this.$data)
        return this.fail(O);
      const { schemaCode: k } = this;
      this.fail((0, d._)`${k} !== undefined && (${(0, d.or)(this.invalid$data(), O)})`);
    }
    error(O, k, M) {
      if (k) {
        this.setParams(k), this._error(O, M), this.setParams({});
        return;
      }
      this._error(O, M);
    }
    _error(O, k) {
      (O ? P.reportExtraError : P.reportError)(this, this.def.error, k);
    }
    $dataError() {
      (0, P.reportError)(this, this.def.$dataError || P.keyword$DataError);
    }
    reset() {
      if (this.errsCount === void 0)
        throw new Error('add "trackErrors" to keyword definition');
      (0, P.resetErrorsCount)(this.gen, this.errsCount);
    }
    ok(O) {
      this.allErrors || this.gen.if(O);
    }
    setParams(O, k) {
      k ? Object.assign(this.params, O) : this.params = O;
    }
    block$data(O, k, M = d.nil) {
      this.gen.block(() => {
        this.check$data(O, M), k();
      });
    }
    check$data(O = d.nil, k = d.nil) {
      if (!this.$data)
        return;
      const { gen: M, schemaCode: G, schemaType: B, def: ae } = this;
      M.if((0, d.or)((0, d._)`${G} === undefined`, k)), O !== d.nil && M.assign(O, !0), (B.length || ae.validateSchema) && (M.elseIf(this.invalid$data()), this.$dataError(), O !== d.nil && M.assign(O, !1)), M.else();
    }
    invalid$data() {
      const { gen: O, schemaCode: k, schemaType: M, def: G, it: B } = this;
      return (0, d.or)(ae(), _e());
      function ae() {
        if (M.length) {
          if (!(k instanceof d.Name))
            throw new Error("ajv implementation error");
          const he = Array.isArray(M) ? M : [M];
          return (0, d._)`${(0, r.checkDataTypes)(he, k, B.opts.strictNumbers, r.DataType.Wrong)}`;
        }
        return d.nil;
      }
      function _e() {
        if (G.validateSchema) {
          const he = O.scopeValue("validate$data", { ref: G.validateSchema });
          return (0, d._)`!${he}(${k})`;
        }
        return d.nil;
      }
    }
    subschema(O, k) {
      const M = (0, h.getSubschema)(this.it, O);
      (0, h.extendSubschemaData)(M, this.it, O), (0, h.extendSubschemaMode)(M, O);
      const G = { ...this.it, ...M, items: void 0, props: void 0 };
      return c(G, k), G;
    }
    mergeEvaluated(O, k) {
      const { it: M, gen: G } = this;
      M.opts.unevaluated && (M.props !== !0 && O.props !== void 0 && (M.props = $.mergeEvaluated.props(G, O.props, M.props, k)), M.items !== !0 && O.items !== void 0 && (M.items = $.mergeEvaluated.items(G, O.items, M.items, k)));
    }
    mergeValidEvaluated(O, k) {
      const { it: M, gen: G } = this;
      if (M.opts.unevaluated && (M.props !== !0 || M.items !== !0))
        return G.if(k, () => this.mergeEvaluated(O, d.Name)), !0;
    }
  }
  Pe.KeywordCxt = j;
  function V(R, O, k, M) {
    const G = new j(R, k, O);
    "code" in k ? k.code(G, M) : G.$data && k.validate ? (0, a.funcKeywordCode)(G, k) : "macro" in k ? (0, a.macroKeywordCode)(G, k) : (k.compile || k.validate) && (0, a.funcKeywordCode)(G, k);
  }
  const U = /^\/(?:[^~]|~0|~1)*$/, x = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
  function X(R, { dataLevel: O, dataNames: k, dataPathArr: M }) {
    let G, B;
    if (R === "")
      return m.default.rootData;
    if (R[0] === "/") {
      if (!U.test(R))
        throw new Error(`Invalid JSON-pointer: ${R}`);
      G = R, B = m.default.rootData;
    } else {
      const pe = x.exec(R);
      if (!pe)
        throw new Error(`Invalid JSON-pointer: ${R}`);
      const ie = +pe[1];
      if (G = pe[2], G === "#") {
        if (ie >= O)
          throw new Error(he("property/index", ie));
        return M[O - ie];
      }
      if (ie > O)
        throw new Error(he("data", ie));
      if (B = k[O - ie], !G)
        return B;
    }
    let ae = B;
    const _e = G.split("/");
    for (const pe of _e)
      pe && (B = (0, d._)`${B}${(0, d.getProperty)((0, $.unescapeJsonPointer)(pe))}`, ae = (0, d._)`${ae} && ${B}`);
    return ae;
    function he(pe, ie) {
      return `Cannot access ${pe} ${ie} levels up, current level is ${O}`;
    }
  }
  return Pe.getData = X, Pe;
}
var et = {}, kr;
function sr() {
  if (kr) return et;
  kr = 1, Object.defineProperty(et, "__esModule", { value: !0 });
  class e extends Error {
    constructor(s) {
      super("validation failed"), this.errors = s, this.ajv = this.validation = !0;
    }
  }
  return et.default = e, et;
}
var tt = {}, qr;
function Ut() {
  if (qr) return tt;
  qr = 1, Object.defineProperty(tt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Vt();
  class t extends Error {
    constructor(r, p, a, h) {
      super(h || `can't resolve reference ${a} from id ${p}`), this.missingRef = (0, e.resolveUrl)(r, p, a), this.missingSchema = (0, e.normalizeId)((0, e.getFullPath)(r, this.missingRef));
    }
  }
  return tt.default = t, tt;
}
var me = {}, Dr;
function ar() {
  if (Dr) return me;
  Dr = 1, Object.defineProperty(me, "__esModule", { value: !0 }), me.resolveSchema = me.getCompilingSchema = me.resolveRef = me.compileSchema = me.SchemaEnv = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ sr(), s = /* @__PURE__ */ ke(), r = /* @__PURE__ */ Vt(), p = /* @__PURE__ */ Z(), a = /* @__PURE__ */ Gt();
  class h {
    constructor(u) {
      var n;
      this.refs = {}, this.dynamicAnchors = {};
      let c;
      typeof u.schema == "object" && (c = u.schema), this.schema = u.schema, this.schemaId = u.schemaId, this.root = u.root || this, this.baseId = (n = u.baseId) !== null && n !== void 0 ? n : (0, r.normalizeId)(c == null ? void 0 : c[u.schemaId || "$id"]), this.schemaPath = u.schemaPath, this.localRefs = u.localRefs, this.meta = u.meta, this.$async = c == null ? void 0 : c.$async, this.refs = {};
    }
  }
  me.SchemaEnv = h;
  function d(o) {
    const u = $.call(this, o);
    if (u)
      return u;
    const n = (0, r.getFullPath)(this.opts.uriResolver, o.root.baseId), { es5: c, lines: g } = this.opts.code, { ownProperties: i } = this.opts, f = new e.CodeGen(this.scope, { es5: c, lines: g, ownProperties: i });
    let b;
    o.$async && (b = f.scopeValue("Error", {
      ref: t.default,
      code: (0, e._)`require("ajv/dist/runtime/validation_error").default`
    }));
    const T = f.scopeName("validate");
    o.validateName = T;
    const D = {
      gen: f,
      allErrors: this.opts.allErrors,
      data: s.default.data,
      parentData: s.default.parentData,
      parentDataProperty: s.default.parentDataProperty,
      dataNames: [s.default.data],
      dataPathArr: [e.nil],
      // TODO can its length be used as dataLevel if nil is removed?
      dataLevel: 0,
      dataTypes: [],
      definedProperties: /* @__PURE__ */ new Set(),
      topSchemaRef: f.scopeValue("schema", this.opts.code.source === !0 ? { ref: o.schema, code: (0, e.stringify)(o.schema) } : { ref: o.schema }),
      validateName: T,
      ValidationError: b,
      schema: o.schema,
      schemaEnv: o,
      rootId: n,
      baseId: o.baseId || n,
      schemaPath: e.nil,
      errSchemaPath: o.schemaPath || (this.opts.jtd ? "" : "#"),
      errorPath: (0, e._)`""`,
      opts: this.opts,
      self: this
    };
    let F;
    try {
      this._compilations.add(o), (0, a.validateFunctionCode)(D), f.optimize(this.opts.code.optimize);
      const L = f.toString();
      F = `${f.scopeRefs(s.default.scope)}return ${L}`, this.opts.code.process && (F = this.opts.code.process(F, o));
      const z = new Function(`${s.default.self}`, `${s.default.scope}`, F)(this, this.scope.get());
      if (this.scope.value(T, { ref: z }), z.errors = null, z.schema = o.schema, z.schemaEnv = o, o.$async && (z.$async = !0), this.opts.code.source === !0 && (z.source = { validateName: T, validateCode: L, scopeValues: f._values }), this.opts.unevaluated) {
        const { props: Q, items: se } = D;
        z.evaluated = {
          props: Q instanceof e.Name ? void 0 : Q,
          items: se instanceof e.Name ? void 0 : se,
          dynamicProps: Q instanceof e.Name,
          dynamicItems: se instanceof e.Name
        }, z.source && (z.source.evaluated = (0, e.stringify)(z.evaluated));
      }
      return o.validate = z, o;
    } catch (L) {
      throw delete o.validate, delete o.validateName, F && this.logger.error("Error compiling schema, function code:", F), L;
    } finally {
      this._compilations.delete(o);
    }
  }
  me.compileSchema = d;
  function m(o, u, n) {
    var c;
    n = (0, r.resolveUrl)(this.opts.uriResolver, u, n);
    const g = o.refs[n];
    if (g)
      return g;
    let i = v.call(this, o, n);
    if (i === void 0) {
      const f = (c = o.localRefs) === null || c === void 0 ? void 0 : c[n], { schemaId: b } = this.opts;
      f && (i = new h({ schema: f, schemaId: b, root: o, baseId: u }));
    }
    if (i !== void 0)
      return o.refs[n] = w.call(this, i);
  }
  me.resolveRef = m;
  function w(o) {
    return (0, r.inlineRef)(o.schema, this.opts.inlineRefs) ? o.schema : o.validate ? o : d.call(this, o);
  }
  function $(o) {
    for (const u of this._compilations)
      if (P(u, o))
        return u;
  }
  me.getCompilingSchema = $;
  function P(o, u) {
    return o.schema === u.schema && o.root === u.root && o.baseId === u.baseId;
  }
  function v(o, u) {
    let n;
    for (; typeof (n = this.refs[u]) == "string"; )
      u = n;
    return n || this.schemas[u] || _.call(this, o, u);
  }
  function _(o, u) {
    const n = this.opts.uriResolver.parse(u), c = (0, r._getFullPath)(this.opts.uriResolver, n);
    let g = (0, r.getFullPath)(this.opts.uriResolver, o.baseId, void 0);
    if (Object.keys(o.schema).length > 0 && c === g)
      return E.call(this, n, o);
    const i = (0, r.normalizeId)(c), f = this.refs[i] || this.schemas[i];
    if (typeof f == "string") {
      const b = _.call(this, o, f);
      return typeof (b == null ? void 0 : b.schema) != "object" ? void 0 : E.call(this, n, b);
    }
    if (typeof (f == null ? void 0 : f.schema) == "object") {
      if (f.validate || d.call(this, f), i === (0, r.normalizeId)(u)) {
        const { schema: b } = f, { schemaId: T } = this.opts, D = b[T];
        return D && (g = (0, r.resolveUrl)(this.opts.uriResolver, g, D)), new h({ schema: b, schemaId: T, root: o, baseId: g });
      }
      return E.call(this, n, f);
    }
  }
  me.resolveSchema = _;
  const y = /* @__PURE__ */ new Set([
    "properties",
    "patternProperties",
    "enum",
    "dependencies",
    "definitions"
  ]);
  function E(o, { baseId: u, schema: n, root: c }) {
    var g;
    if (((g = o.fragment) === null || g === void 0 ? void 0 : g[0]) !== "/")
      return;
    for (const b of o.fragment.slice(1).split("/")) {
      if (typeof n == "boolean")
        return;
      const T = n[(0, p.unescapeFragment)(b)];
      if (T === void 0)
        return;
      n = T;
      const D = typeof n == "object" && n[this.opts.schemaId];
      !y.has(b) && D && (u = (0, r.resolveUrl)(this.opts.uriResolver, u, D));
    }
    let i;
    if (typeof n != "boolean" && n.$ref && !(0, p.schemaHasRulesButRef)(n, this.RULES)) {
      const b = (0, r.resolveUrl)(this.opts.uriResolver, u, n.$ref);
      i = _.call(this, c, b);
    }
    const { schemaId: f } = this.opts;
    if (i = i || new h({ schema: n, schemaId: f, root: c, baseId: u }), i.schema !== i.root.schema)
      return i;
  }
  return me;
}
const ds = "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#", fs = "Meta-schema for $data reference (JSON AnySchema extension proposal)", hs = "object", ps = ["$data"], ms = { $data: { type: "string", anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }] } }, gs = !1, ys = {
  $id: ds,
  description: fs,
  type: hs,
  required: ps,
  properties: ms,
  additionalProperties: gs
};
var rt = {}, ze = { exports: {} }, er, Cr;
function Vn() {
  if (Cr) return er;
  Cr = 1;
  const e = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu), t = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
  function s(v) {
    let _ = "", y = 0, E = 0;
    for (E = 0; E < v.length; E++)
      if (y = v[E].charCodeAt(0), y !== 48) {
        if (!(y >= 48 && y <= 57 || y >= 65 && y <= 70 || y >= 97 && y <= 102))
          return "";
        _ += v[E];
        break;
      }
    for (E += 1; E < v.length; E++) {
      if (y = v[E].charCodeAt(0), !(y >= 48 && y <= 57 || y >= 65 && y <= 70 || y >= 97 && y <= 102))
        return "";
      _ += v[E];
    }
    return _;
  }
  const r = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
  function p(v) {
    return v.length = 0, !0;
  }
  function a(v, _, y) {
    if (v.length) {
      const E = s(v);
      if (E !== "")
        _.push(E);
      else
        return y.error = !0, !1;
      v.length = 0;
    }
    return !0;
  }
  function h(v) {
    let _ = 0;
    const y = { error: !1, address: "", zone: "" }, E = [], o = [];
    let u = !1, n = !1, c = a;
    for (let g = 0; g < v.length; g++) {
      const i = v[g];
      if (!(i === "[" || i === "]"))
        if (i === ":") {
          if (u === !0 && (n = !0), !c(o, E, y))
            break;
          if (++_ > 7) {
            y.error = !0;
            break;
          }
          g > 0 && v[g - 1] === ":" && (u = !0), E.push(":");
          continue;
        } else if (i === "%") {
          if (!c(o, E, y))
            break;
          c = p;
        } else {
          o.push(i);
          continue;
        }
    }
    return o.length && (c === p ? y.zone = o.join("") : n ? E.push(o.join("")) : E.push(s(o))), y.address = E.join(""), y;
  }
  function d(v) {
    if (m(v, ":") < 2)
      return { host: v, isIPV6: !1 };
    const _ = h(v);
    if (_.error)
      return { host: v, isIPV6: !1 };
    {
      let y = _.address, E = _.address;
      return _.zone && (y += "%" + _.zone, E += "%25" + _.zone), { host: y, isIPV6: !0, escapedHost: E };
    }
  }
  function m(v, _) {
    let y = 0;
    for (let E = 0; E < v.length; E++)
      v[E] === _ && y++;
    return y;
  }
  function w(v) {
    let _ = v;
    const y = [];
    let E = -1, o = 0;
    for (; o = _.length; ) {
      if (o === 1) {
        if (_ === ".")
          break;
        if (_ === "/") {
          y.push("/");
          break;
        } else {
          y.push(_);
          break;
        }
      } else if (o === 2) {
        if (_[0] === ".") {
          if (_[1] === ".")
            break;
          if (_[1] === "/") {
            _ = _.slice(2);
            continue;
          }
        } else if (_[0] === "/" && (_[1] === "." || _[1] === "/")) {
          y.push("/");
          break;
        }
      } else if (o === 3 && _ === "/..") {
        y.length !== 0 && y.pop(), y.push("/");
        break;
      }
      if (_[0] === ".") {
        if (_[1] === ".") {
          if (_[2] === "/") {
            _ = _.slice(3);
            continue;
          }
        } else if (_[1] === "/") {
          _ = _.slice(2);
          continue;
        }
      } else if (_[0] === "/" && _[1] === ".") {
        if (_[2] === "/") {
          _ = _.slice(2);
          continue;
        } else if (_[2] === "." && _[3] === "/") {
          _ = _.slice(3), y.length !== 0 && y.pop();
          continue;
        }
      }
      if ((E = _.indexOf("/", 1)) === -1) {
        y.push(_);
        break;
      } else
        y.push(_.slice(0, E)), _ = _.slice(E);
    }
    return y.join("");
  }
  function $(v, _) {
    const y = _ !== !0 ? escape : unescape;
    return v.scheme !== void 0 && (v.scheme = y(v.scheme)), v.userinfo !== void 0 && (v.userinfo = y(v.userinfo)), v.host !== void 0 && (v.host = y(v.host)), v.path !== void 0 && (v.path = y(v.path)), v.query !== void 0 && (v.query = y(v.query)), v.fragment !== void 0 && (v.fragment = y(v.fragment)), v;
  }
  function P(v) {
    const _ = [];
    if (v.userinfo !== void 0 && (_.push(v.userinfo), _.push("@")), v.host !== void 0) {
      let y = unescape(v.host);
      if (!t(y)) {
        const E = d(y);
        E.isIPV6 === !0 ? y = `[${E.escapedHost}]` : y = v.host;
      }
      _.push(y);
    }
    return (typeof v.port == "number" || typeof v.port == "string") && (_.push(":"), _.push(String(v.port))), _.length ? _.join("") : void 0;
  }
  return er = {
    nonSimpleDomain: r,
    recomposeAuthority: P,
    normalizeComponentEncoding: $,
    removeDotSegments: w,
    isIPv4: t,
    isUUID: e,
    normalizeIPv6: d,
    stringArrayToHexStripped: s
  }, er;
}
var tr, Ar;
function _s() {
  if (Ar) return tr;
  Ar = 1;
  const { isUUID: e } = Vn(), t = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu, s = (
    /** @type {const} */
    [
      "http",
      "https",
      "ws",
      "wss",
      "urn",
      "urn:uuid"
    ]
  );
  function r(i) {
    return s.indexOf(
      /** @type {*} */
      i
    ) !== -1;
  }
  function p(i) {
    return i.secure === !0 ? !0 : i.secure === !1 ? !1 : i.scheme ? i.scheme.length === 3 && (i.scheme[0] === "w" || i.scheme[0] === "W") && (i.scheme[1] === "s" || i.scheme[1] === "S") && (i.scheme[2] === "s" || i.scheme[2] === "S") : !1;
  }
  function a(i) {
    return i.host || (i.error = i.error || "HTTP URIs must have a host."), i;
  }
  function h(i) {
    const f = String(i.scheme).toLowerCase() === "https";
    return (i.port === (f ? 443 : 80) || i.port === "") && (i.port = void 0), i.path || (i.path = "/"), i;
  }
  function d(i) {
    return i.secure = p(i), i.resourceName = (i.path || "/") + (i.query ? "?" + i.query : ""), i.path = void 0, i.query = void 0, i;
  }
  function m(i) {
    if ((i.port === (p(i) ? 443 : 80) || i.port === "") && (i.port = void 0), typeof i.secure == "boolean" && (i.scheme = i.secure ? "wss" : "ws", i.secure = void 0), i.resourceName) {
      const [f, b] = i.resourceName.split("?");
      i.path = f && f !== "/" ? f : void 0, i.query = b, i.resourceName = void 0;
    }
    return i.fragment = void 0, i;
  }
  function w(i, f) {
    if (!i.path)
      return i.error = "URN can not be parsed", i;
    const b = i.path.match(t);
    if (b) {
      const T = f.scheme || i.scheme || "urn";
      i.nid = b[1].toLowerCase(), i.nss = b[2];
      const D = `${T}:${f.nid || i.nid}`, F = g(D);
      i.path = void 0, F && (i = F.parse(i, f));
    } else
      i.error = i.error || "URN can not be parsed.";
    return i;
  }
  function $(i, f) {
    if (i.nid === void 0)
      throw new Error("URN without nid cannot be serialized");
    const b = f.scheme || i.scheme || "urn", T = i.nid.toLowerCase(), D = `${b}:${f.nid || T}`, F = g(D);
    F && (i = F.serialize(i, f));
    const L = i, K = i.nss;
    return L.path = `${T || f.nid}:${K}`, f.skipEscape = !0, L;
  }
  function P(i, f) {
    const b = i;
    return b.uuid = b.nss, b.nss = void 0, !f.tolerant && (!b.uuid || !e(b.uuid)) && (b.error = b.error || "UUID is not valid."), b;
  }
  function v(i) {
    const f = i;
    return f.nss = (i.uuid || "").toLowerCase(), f;
  }
  const _ = (
    /** @type {SchemeHandler} */
    {
      scheme: "http",
      domainHost: !0,
      parse: a,
      serialize: h
    }
  ), y = (
    /** @type {SchemeHandler} */
    {
      scheme: "https",
      domainHost: _.domainHost,
      parse: a,
      serialize: h
    }
  ), E = (
    /** @type {SchemeHandler} */
    {
      scheme: "ws",
      domainHost: !0,
      parse: d,
      serialize: m
    }
  ), o = (
    /** @type {SchemeHandler} */
    {
      scheme: "wss",
      domainHost: E.domainHost,
      parse: E.parse,
      serialize: E.serialize
    }
  ), c = (
    /** @type {Record<SchemeName, SchemeHandler>} */
    {
      http: _,
      https: y,
      ws: E,
      wss: o,
      urn: (
        /** @type {SchemeHandler} */
        {
          scheme: "urn",
          parse: w,
          serialize: $,
          skipNormalize: !0
        }
      ),
      "urn:uuid": (
        /** @type {SchemeHandler} */
        {
          scheme: "urn:uuid",
          parse: P,
          serialize: v,
          skipNormalize: !0
        }
      )
    }
  );
  Object.setPrototypeOf(c, null);
  function g(i) {
    return i && (c[
      /** @type {SchemeName} */
      i
    ] || c[
      /** @type {SchemeName} */
      i.toLowerCase()
    ]) || void 0;
  }
  return tr = {
    wsIsSecure: p,
    SCHEMES: c,
    isValidSchemeName: r,
    getSchemeHandler: g
  }, tr;
}
var Mr;
function vs() {
  if (Mr) return ze.exports;
  Mr = 1;
  const { normalizeIPv6: e, removeDotSegments: t, recomposeAuthority: s, normalizeComponentEncoding: r, isIPv4: p, nonSimpleDomain: a } = Vn(), { SCHEMES: h, getSchemeHandler: d } = _s();
  function m(o, u) {
    return typeof o == "string" ? o = /** @type {T} */
    v(y(o, u), u) : typeof o == "object" && (o = /** @type {T} */
    y(v(o, u), u)), o;
  }
  function w(o, u, n) {
    const c = n ? Object.assign({ scheme: "null" }, n) : { scheme: "null" }, g = $(y(o, c), y(u, c), c, !0);
    return c.skipEscape = !0, v(g, c);
  }
  function $(o, u, n, c) {
    const g = {};
    return c || (o = y(v(o, n), n), u = y(v(u, n), n)), n = n || {}, !n.tolerant && u.scheme ? (g.scheme = u.scheme, g.userinfo = u.userinfo, g.host = u.host, g.port = u.port, g.path = t(u.path || ""), g.query = u.query) : (u.userinfo !== void 0 || u.host !== void 0 || u.port !== void 0 ? (g.userinfo = u.userinfo, g.host = u.host, g.port = u.port, g.path = t(u.path || ""), g.query = u.query) : (u.path ? (u.path[0] === "/" ? g.path = t(u.path) : ((o.userinfo !== void 0 || o.host !== void 0 || o.port !== void 0) && !o.path ? g.path = "/" + u.path : o.path ? g.path = o.path.slice(0, o.path.lastIndexOf("/") + 1) + u.path : g.path = u.path, g.path = t(g.path)), g.query = u.query) : (g.path = o.path, u.query !== void 0 ? g.query = u.query : g.query = o.query), g.userinfo = o.userinfo, g.host = o.host, g.port = o.port), g.scheme = o.scheme), g.fragment = u.fragment, g;
  }
  function P(o, u, n) {
    return typeof o == "string" ? (o = unescape(o), o = v(r(y(o, n), !0), { ...n, skipEscape: !0 })) : typeof o == "object" && (o = v(r(o, !0), { ...n, skipEscape: !0 })), typeof u == "string" ? (u = unescape(u), u = v(r(y(u, n), !0), { ...n, skipEscape: !0 })) : typeof u == "object" && (u = v(r(u, !0), { ...n, skipEscape: !0 })), o.toLowerCase() === u.toLowerCase();
  }
  function v(o, u) {
    const n = {
      host: o.host,
      scheme: o.scheme,
      userinfo: o.userinfo,
      port: o.port,
      path: o.path,
      query: o.query,
      nid: o.nid,
      nss: o.nss,
      uuid: o.uuid,
      fragment: o.fragment,
      reference: o.reference,
      resourceName: o.resourceName,
      secure: o.secure,
      error: ""
    }, c = Object.assign({}, u), g = [], i = d(c.scheme || n.scheme);
    i && i.serialize && i.serialize(n, c), n.path !== void 0 && (c.skipEscape ? n.path = unescape(n.path) : (n.path = escape(n.path), n.scheme !== void 0 && (n.path = n.path.split("%3A").join(":")))), c.reference !== "suffix" && n.scheme && g.push(n.scheme, ":");
    const f = s(n);
    if (f !== void 0 && (c.reference !== "suffix" && g.push("//"), g.push(f), n.path && n.path[0] !== "/" && g.push("/")), n.path !== void 0) {
      let b = n.path;
      !c.absolutePath && (!i || !i.absolutePath) && (b = t(b)), f === void 0 && b[0] === "/" && b[1] === "/" && (b = "/%2F" + b.slice(2)), g.push(b);
    }
    return n.query !== void 0 && g.push("?", n.query), n.fragment !== void 0 && g.push("#", n.fragment), g.join("");
  }
  const _ = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
  function y(o, u) {
    const n = Object.assign({}, u), c = {
      scheme: void 0,
      userinfo: void 0,
      host: "",
      port: void 0,
      path: "",
      query: void 0,
      fragment: void 0
    };
    let g = !1;
    n.reference === "suffix" && (n.scheme ? o = n.scheme + ":" + o : o = "//" + o);
    const i = o.match(_);
    if (i) {
      if (c.scheme = i[1], c.userinfo = i[3], c.host = i[4], c.port = parseInt(i[5], 10), c.path = i[6] || "", c.query = i[7], c.fragment = i[8], isNaN(c.port) && (c.port = i[5]), c.host)
        if (p(c.host) === !1) {
          const T = e(c.host);
          c.host = T.host.toLowerCase(), g = T.isIPV6;
        } else
          g = !0;
      c.scheme === void 0 && c.userinfo === void 0 && c.host === void 0 && c.port === void 0 && c.query === void 0 && !c.path ? c.reference = "same-document" : c.scheme === void 0 ? c.reference = "relative" : c.fragment === void 0 ? c.reference = "absolute" : c.reference = "uri", n.reference && n.reference !== "suffix" && n.reference !== c.reference && (c.error = c.error || "URI is not a " + n.reference + " reference.");
      const f = d(n.scheme || c.scheme);
      if (!n.unicodeSupport && (!f || !f.unicodeSupport) && c.host && (n.domainHost || f && f.domainHost) && g === !1 && a(c.host))
        try {
          c.host = URL.domainToASCII(c.host.toLowerCase());
        } catch (b) {
          c.error = c.error || "Host's domain name can not be converted to ASCII: " + b;
        }
      (!f || f && !f.skipNormalize) && (o.indexOf("%") !== -1 && (c.scheme !== void 0 && (c.scheme = unescape(c.scheme)), c.host !== void 0 && (c.host = unescape(c.host))), c.path && (c.path = escape(unescape(c.path))), c.fragment && (c.fragment = encodeURI(decodeURIComponent(c.fragment)))), f && f.parse && f.parse(c, n);
    } else
      c.error = c.error || "URI can not be parsed.";
    return c;
  }
  const E = {
    SCHEMES: h,
    normalize: m,
    resolve: w,
    resolveComponent: $,
    equal: P,
    serialize: v,
    parse: y
  };
  return ze.exports = E, ze.exports.default = E, ze.exports.fastUri = E, ze.exports;
}
var Fr;
function $s() {
  if (Fr) return rt;
  Fr = 1, Object.defineProperty(rt, "__esModule", { value: !0 });
  const e = vs();
  return e.code = 'require("ajv/dist/runtime/uri").default', rt.default = e, rt;
}
var Lr;
function ws() {
  return Lr || (Lr = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.CodeGen = e.Name = e.nil = e.stringify = e.str = e._ = e.KeywordCxt = void 0;
    var t = /* @__PURE__ */ Gt();
    Object.defineProperty(e, "KeywordCxt", { enumerable: !0, get: function() {
      return t.KeywordCxt;
    } });
    var s = /* @__PURE__ */ Y();
    Object.defineProperty(e, "_", { enumerable: !0, get: function() {
      return s._;
    } }), Object.defineProperty(e, "str", { enumerable: !0, get: function() {
      return s.str;
    } }), Object.defineProperty(e, "stringify", { enumerable: !0, get: function() {
      return s.stringify;
    } }), Object.defineProperty(e, "nil", { enumerable: !0, get: function() {
      return s.nil;
    } }), Object.defineProperty(e, "Name", { enumerable: !0, get: function() {
      return s.Name;
    } }), Object.defineProperty(e, "CodeGen", { enumerable: !0, get: function() {
      return s.CodeGen;
    } });
    const r = /* @__PURE__ */ sr(), p = /* @__PURE__ */ Ut(), a = /* @__PURE__ */ Mn(), h = /* @__PURE__ */ ar(), d = /* @__PURE__ */ Y(), m = /* @__PURE__ */ Vt(), w = /* @__PURE__ */ Ft(), $ = /* @__PURE__ */ Z(), P = ys, v = /* @__PURE__ */ $s(), _ = (A, I) => new RegExp(A, I);
    _.code = "new RegExp";
    const y = ["removeAdditional", "useDefaults", "coerceTypes"], E = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]), o = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    }, u = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    }, n = 200;
    function c(A) {
      var I, q, N, l, S, j, V, U, x, X, R, O, k, M, G, B, ae, _e, he, pe, ie, Le, ge, Ht, zt;
      const Ue = A.strict, Kt = (I = A.code) === null || I === void 0 ? void 0 : I.optimize, or = Kt === !0 || Kt === void 0 ? 1 : Kt || 0, cr = (N = (q = A.code) === null || q === void 0 ? void 0 : q.regExp) !== null && N !== void 0 ? N : _, Jn = (l = A.uriResolver) !== null && l !== void 0 ? l : v.default;
      return {
        strictSchema: (j = (S = A.strictSchema) !== null && S !== void 0 ? S : Ue) !== null && j !== void 0 ? j : !0,
        strictNumbers: (U = (V = A.strictNumbers) !== null && V !== void 0 ? V : Ue) !== null && U !== void 0 ? U : !0,
        strictTypes: (X = (x = A.strictTypes) !== null && x !== void 0 ? x : Ue) !== null && X !== void 0 ? X : "log",
        strictTuples: (O = (R = A.strictTuples) !== null && R !== void 0 ? R : Ue) !== null && O !== void 0 ? O : "log",
        strictRequired: (M = (k = A.strictRequired) !== null && k !== void 0 ? k : Ue) !== null && M !== void 0 ? M : !1,
        code: A.code ? { ...A.code, optimize: or, regExp: cr } : { optimize: or, regExp: cr },
        loopRequired: (G = A.loopRequired) !== null && G !== void 0 ? G : n,
        loopEnum: (B = A.loopEnum) !== null && B !== void 0 ? B : n,
        meta: (ae = A.meta) !== null && ae !== void 0 ? ae : !0,
        messages: (_e = A.messages) !== null && _e !== void 0 ? _e : !0,
        inlineRefs: (he = A.inlineRefs) !== null && he !== void 0 ? he : !0,
        schemaId: (pe = A.schemaId) !== null && pe !== void 0 ? pe : "$id",
        addUsedSchema: (ie = A.addUsedSchema) !== null && ie !== void 0 ? ie : !0,
        validateSchema: (Le = A.validateSchema) !== null && Le !== void 0 ? Le : !0,
        validateFormats: (ge = A.validateFormats) !== null && ge !== void 0 ? ge : !0,
        unicodeRegExp: (Ht = A.unicodeRegExp) !== null && Ht !== void 0 ? Ht : !0,
        int32range: (zt = A.int32range) !== null && zt !== void 0 ? zt : !0,
        uriResolver: Jn
      };
    }
    class g {
      constructor(I = {}) {
        this.schemas = {}, this.refs = {}, this.formats = /* @__PURE__ */ Object.create(null), this._compilations = /* @__PURE__ */ new Set(), this._loading = {}, this._cache = /* @__PURE__ */ new Map(), I = this.opts = { ...I, ...c(I) };
        const { es5: q, lines: N } = this.opts.code;
        this.scope = new d.ValueScope({ scope: {}, prefixes: E, es5: q, lines: N }), this.logger = K(I.logger);
        const l = I.validateFormats;
        I.validateFormats = !1, this.RULES = (0, a.getRules)(), i.call(this, o, I, "NOT SUPPORTED"), i.call(this, u, I, "DEPRECATED", "warn"), this._metaOpts = F.call(this), I.formats && T.call(this), this._addVocabularies(), this._addDefaultMetaSchema(), I.keywords && D.call(this, I.keywords), typeof I.meta == "object" && this.addMetaSchema(I.meta), b.call(this), I.validateFormats = l;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data: I, meta: q, schemaId: N } = this.opts;
        let l = P;
        N === "id" && (l = { ...P }, l.id = l.$id, delete l.$id), q && I && this.addMetaSchema(l, l[N], !1);
      }
      defaultMeta() {
        const { meta: I, schemaId: q } = this.opts;
        return this.opts.defaultMeta = typeof I == "object" ? I[q] || I : void 0;
      }
      validate(I, q) {
        let N;
        if (typeof I == "string") {
          if (N = this.getSchema(I), !N)
            throw new Error(`no schema with key or ref "${I}"`);
        } else
          N = this.compile(I);
        const l = N(q);
        return "$async" in N || (this.errors = N.errors), l;
      }
      compile(I, q) {
        const N = this._addSchema(I, q);
        return N.validate || this._compileSchemaEnv(N);
      }
      compileAsync(I, q) {
        if (typeof this.opts.loadSchema != "function")
          throw new Error("options.loadSchema should be a function");
        const { loadSchema: N } = this.opts;
        return l.call(this, I, q);
        async function l(X, R) {
          await S.call(this, X.$schema);
          const O = this._addSchema(X, R);
          return O.validate || j.call(this, O);
        }
        async function S(X) {
          X && !this.getSchema(X) && await l.call(this, { $ref: X }, !0);
        }
        async function j(X) {
          try {
            return this._compileSchemaEnv(X);
          } catch (R) {
            if (!(R instanceof p.default))
              throw R;
            return V.call(this, R), await U.call(this, R.missingSchema), j.call(this, X);
          }
        }
        function V({ missingSchema: X, missingRef: R }) {
          if (this.refs[X])
            throw new Error(`AnySchema ${X} is loaded but ${R} cannot be resolved`);
        }
        async function U(X) {
          const R = await x.call(this, X);
          this.refs[X] || await S.call(this, R.$schema), this.refs[X] || this.addSchema(R, X, q);
        }
        async function x(X) {
          const R = this._loading[X];
          if (R)
            return R;
          try {
            return await (this._loading[X] = N(X));
          } finally {
            delete this._loading[X];
          }
        }
      }
      // Adds schema to the instance
      addSchema(I, q, N, l = this.opts.validateSchema) {
        if (Array.isArray(I)) {
          for (const j of I)
            this.addSchema(j, void 0, N, l);
          return this;
        }
        let S;
        if (typeof I == "object") {
          const { schemaId: j } = this.opts;
          if (S = I[j], S !== void 0 && typeof S != "string")
            throw new Error(`schema ${j} must be string`);
        }
        return q = (0, m.normalizeId)(q || S), this._checkUnique(q), this.schemas[q] = this._addSchema(I, N, q, l, !0), this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(I, q, N = this.opts.validateSchema) {
        return this.addSchema(I, q, !0, N), this;
      }
      //  Validate schema against its meta-schema
      validateSchema(I, q) {
        if (typeof I == "boolean")
          return !0;
        let N;
        if (N = I.$schema, N !== void 0 && typeof N != "string")
          throw new Error("$schema must be a string");
        if (N = N || this.opts.defaultMeta || this.defaultMeta(), !N)
          return this.logger.warn("meta-schema not available"), this.errors = null, !0;
        const l = this.validate(N, I);
        if (!l && q) {
          const S = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(S);
          else
            throw new Error(S);
        }
        return l;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(I) {
        let q;
        for (; typeof (q = f.call(this, I)) == "string"; )
          I = q;
        if (q === void 0) {
          const { schemaId: N } = this.opts, l = new h.SchemaEnv({ schema: {}, schemaId: N });
          if (q = h.resolveSchema.call(this, l, I), !q)
            return;
          this.refs[I] = q;
        }
        return q.validate || this._compileSchemaEnv(q);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(I) {
        if (I instanceof RegExp)
          return this._removeAllSchemas(this.schemas, I), this._removeAllSchemas(this.refs, I), this;
        switch (typeof I) {
          case "undefined":
            return this._removeAllSchemas(this.schemas), this._removeAllSchemas(this.refs), this._cache.clear(), this;
          case "string": {
            const q = f.call(this, I);
            return typeof q == "object" && this._cache.delete(q.schema), delete this.schemas[I], delete this.refs[I], this;
          }
          case "object": {
            const q = I;
            this._cache.delete(q);
            let N = I[this.opts.schemaId];
            return N && (N = (0, m.normalizeId)(N), delete this.schemas[N], delete this.refs[N]), this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(I) {
        for (const q of I)
          this.addKeyword(q);
        return this;
      }
      addKeyword(I, q) {
        let N;
        if (typeof I == "string")
          N = I, typeof q == "object" && (this.logger.warn("these parameters are deprecated, see docs for addKeyword"), q.keyword = N);
        else if (typeof I == "object" && q === void 0) {
          if (q = I, N = q.keyword, Array.isArray(N) && !N.length)
            throw new Error("addKeywords: keyword must be string or non-empty array");
        } else
          throw new Error("invalid addKeywords parameters");
        if (Q.call(this, N, q), !q)
          return (0, $.eachItem)(N, (S) => se.call(this, S)), this;
        be.call(this, q);
        const l = {
          ...q,
          type: (0, w.getJSONTypes)(q.type),
          schemaType: (0, w.getJSONTypes)(q.schemaType)
        };
        return (0, $.eachItem)(N, l.type.length === 0 ? (S) => se.call(this, S, l) : (S) => l.type.forEach((j) => se.call(this, S, l, j))), this;
      }
      getKeyword(I) {
        const q = this.RULES.all[I];
        return typeof q == "object" ? q.definition : !!q;
      }
      // Remove keyword
      removeKeyword(I) {
        const { RULES: q } = this;
        delete q.keywords[I], delete q.all[I];
        for (const N of q.rules) {
          const l = N.rules.findIndex((S) => S.keyword === I);
          l >= 0 && N.rules.splice(l, 1);
        }
        return this;
      }
      // Add format
      addFormat(I, q) {
        return typeof q == "string" && (q = new RegExp(q)), this.formats[I] = q, this;
      }
      errorsText(I = this.errors, { separator: q = ", ", dataVar: N = "data" } = {}) {
        return !I || I.length === 0 ? "No errors" : I.map((l) => `${N}${l.instancePath} ${l.message}`).reduce((l, S) => l + q + S);
      }
      $dataMetaSchema(I, q) {
        const N = this.RULES.all;
        I = JSON.parse(JSON.stringify(I));
        for (const l of q) {
          const S = l.split("/").slice(1);
          let j = I;
          for (const V of S)
            j = j[V];
          for (const V in N) {
            const U = N[V];
            if (typeof U != "object")
              continue;
            const { $data: x } = U.definition, X = j[V];
            x && X && (j[V] = Oe(X));
          }
        }
        return I;
      }
      _removeAllSchemas(I, q) {
        for (const N in I) {
          const l = I[N];
          (!q || q.test(N)) && (typeof l == "string" ? delete I[N] : l && !l.meta && (this._cache.delete(l.schema), delete I[N]));
        }
      }
      _addSchema(I, q, N, l = this.opts.validateSchema, S = this.opts.addUsedSchema) {
        let j;
        const { schemaId: V } = this.opts;
        if (typeof I == "object")
          j = I[V];
        else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          if (typeof I != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let U = this._cache.get(I);
        if (U !== void 0)
          return U;
        N = (0, m.normalizeId)(j || N);
        const x = m.getSchemaRefs.call(this, I, N);
        return U = new h.SchemaEnv({ schema: I, schemaId: V, meta: q, baseId: N, localRefs: x }), this._cache.set(U.schema, U), S && !N.startsWith("#") && (N && this._checkUnique(N), this.refs[N] = U), l && this.validateSchema(I, !0), U;
      }
      _checkUnique(I) {
        if (this.schemas[I] || this.refs[I])
          throw new Error(`schema with key or id "${I}" already exists`);
      }
      _compileSchemaEnv(I) {
        if (I.meta ? this._compileMetaSchema(I) : h.compileSchema.call(this, I), !I.validate)
          throw new Error("ajv implementation error");
        return I.validate;
      }
      _compileMetaSchema(I) {
        const q = this.opts;
        this.opts = this._metaOpts;
        try {
          h.compileSchema.call(this, I);
        } finally {
          this.opts = q;
        }
      }
    }
    g.ValidationError = r.default, g.MissingRefError = p.default, e.default = g;
    function i(A, I, q, N = "error") {
      for (const l in A) {
        const S = l;
        S in I && this.logger[N](`${q}: option ${l}. ${A[S]}`);
      }
    }
    function f(A) {
      return A = (0, m.normalizeId)(A), this.schemas[A] || this.refs[A];
    }
    function b() {
      const A = this.opts.schemas;
      if (A)
        if (Array.isArray(A))
          this.addSchema(A);
        else
          for (const I in A)
            this.addSchema(A[I], I);
    }
    function T() {
      for (const A in this.opts.formats) {
        const I = this.opts.formats[A];
        I && this.addFormat(A, I);
      }
    }
    function D(A) {
      if (Array.isArray(A)) {
        this.addVocabulary(A);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const I in A) {
        const q = A[I];
        q.keyword || (q.keyword = I), this.addKeyword(q);
      }
    }
    function F() {
      const A = { ...this.opts };
      for (const I of y)
        delete A[I];
      return A;
    }
    const L = { log() {
    }, warn() {
    }, error() {
    } };
    function K(A) {
      if (A === !1)
        return L;
      if (A === void 0)
        return console;
      if (A.log && A.warn && A.error)
        return A;
      throw new Error("logger must implement log, warn and error methods");
    }
    const z = /^[a-z_$][a-z0-9_$:-]*$/i;
    function Q(A, I) {
      const { RULES: q } = this;
      if ((0, $.eachItem)(A, (N) => {
        if (q.keywords[N])
          throw new Error(`Keyword ${N} is already defined`);
        if (!z.test(N))
          throw new Error(`Keyword ${N} has invalid name`);
      }), !!I && I.$data && !("code" in I || "validate" in I))
        throw new Error('$data keyword must have "code" or "validate" function');
    }
    function se(A, I, q) {
      var N;
      const l = I == null ? void 0 : I.post;
      if (q && l)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES: S } = this;
      let j = l ? S.post : S.rules.find(({ type: U }) => U === q);
      if (j || (j = { type: q, rules: [] }, S.rules.push(j)), S.keywords[A] = !0, !I)
        return;
      const V = {
        keyword: A,
        definition: {
          ...I,
          type: (0, w.getJSONTypes)(I.type),
          schemaType: (0, w.getJSONTypes)(I.schemaType)
        }
      };
      I.before ? we.call(this, j, V, I.before) : j.rules.push(V), S.all[A] = V, (N = I.implements) === null || N === void 0 || N.forEach((U) => this.addKeyword(U));
    }
    function we(A, I, q) {
      const N = A.rules.findIndex((l) => l.keyword === q);
      N >= 0 ? A.rules.splice(N, 0, I) : (A.rules.push(I), this.logger.warn(`rule ${q} is not defined`));
    }
    function be(A) {
      let { metaSchema: I } = A;
      I !== void 0 && (A.$data && this.opts.$data && (I = Oe(I)), A.validateSchema = this.compile(I, !0));
    }
    const te = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function Oe(A) {
      return { anyOf: [A, te] };
    }
  })(Jt)), Jt;
}
var nt = {}, st = {}, at = {}, Vr;
function Es() {
  if (Vr) return at;
  Vr = 1, Object.defineProperty(at, "__esModule", { value: !0 });
  const e = {
    keyword: "id",
    code() {
      throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
    }
  };
  return at.default = e, at;
}
var Ne = {}, Gr;
function bs() {
  if (Gr) return Ne;
  Gr = 1, Object.defineProperty(Ne, "__esModule", { value: !0 }), Ne.callRef = Ne.getValidate = void 0;
  const e = /* @__PURE__ */ Ut(), t = /* @__PURE__ */ $e(), s = /* @__PURE__ */ Y(), r = /* @__PURE__ */ ke(), p = /* @__PURE__ */ ar(), a = /* @__PURE__ */ Z(), h = {
    keyword: "$ref",
    schemaType: "string",
    code(w) {
      const { gen: $, schema: P, it: v } = w, { baseId: _, schemaEnv: y, validateName: E, opts: o, self: u } = v, { root: n } = y;
      if ((P === "#" || P === "#/") && _ === n.baseId)
        return g();
      const c = p.resolveRef.call(u, n, _, P);
      if (c === void 0)
        throw new e.default(v.opts.uriResolver, _, P);
      if (c instanceof p.SchemaEnv)
        return i(c);
      return f(c);
      function g() {
        if (y === n)
          return m(w, E, y, y.$async);
        const b = $.scopeValue("root", { ref: n });
        return m(w, (0, s._)`${b}.validate`, n, n.$async);
      }
      function i(b) {
        const T = d(w, b);
        m(w, T, b, b.$async);
      }
      function f(b) {
        const T = $.scopeValue("schema", o.code.source === !0 ? { ref: b, code: (0, s.stringify)(b) } : { ref: b }), D = $.name("valid"), F = w.subschema({
          schema: b,
          dataTypes: [],
          schemaPath: s.nil,
          topSchemaRef: T,
          errSchemaPath: P
        }, D);
        w.mergeEvaluated(F), w.ok(D);
      }
    }
  };
  function d(w, $) {
    const { gen: P } = w;
    return $.validate ? P.scopeValue("validate", { ref: $.validate }) : (0, s._)`${P.scopeValue("wrapper", { ref: $ })}.validate`;
  }
  Ne.getValidate = d;
  function m(w, $, P, v) {
    const { gen: _, it: y } = w, { allErrors: E, schemaEnv: o, opts: u } = y, n = u.passContext ? r.default.this : s.nil;
    v ? c() : g();
    function c() {
      if (!o.$async)
        throw new Error("async schema referenced by sync schema");
      const b = _.let("valid");
      _.try(() => {
        _.code((0, s._)`await ${(0, t.callValidateCode)(w, $, n)}`), f($), E || _.assign(b, !0);
      }, (T) => {
        _.if((0, s._)`!(${T} instanceof ${y.ValidationError})`, () => _.throw(T)), i(T), E || _.assign(b, !1);
      }), w.ok(b);
    }
    function g() {
      w.result((0, t.callValidateCode)(w, $, n), () => f($), () => i($));
    }
    function i(b) {
      const T = (0, s._)`${b}.errors`;
      _.assign(r.default.vErrors, (0, s._)`${r.default.vErrors} === null ? ${T} : ${r.default.vErrors}.concat(${T})`), _.assign(r.default.errors, (0, s._)`${r.default.vErrors}.length`);
    }
    function f(b) {
      var T;
      if (!y.opts.unevaluated)
        return;
      const D = (T = P == null ? void 0 : P.validate) === null || T === void 0 ? void 0 : T.evaluated;
      if (y.props !== !0)
        if (D && !D.dynamicProps)
          D.props !== void 0 && (y.props = a.mergeEvaluated.props(_, D.props, y.props));
        else {
          const F = _.var("props", (0, s._)`${b}.evaluated.props`);
          y.props = a.mergeEvaluated.props(_, F, y.props, s.Name);
        }
      if (y.items !== !0)
        if (D && !D.dynamicItems)
          D.items !== void 0 && (y.items = a.mergeEvaluated.items(_, D.items, y.items));
        else {
          const F = _.var("items", (0, s._)`${b}.evaluated.items`);
          y.items = a.mergeEvaluated.items(_, F, y.items, s.Name);
        }
    }
  }
  return Ne.callRef = m, Ne.default = h, Ne;
}
var Ur;
function Ss() {
  if (Ur) return st;
  Ur = 1, Object.defineProperty(st, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Es(), t = /* @__PURE__ */ bs(), s = [
    "$schema",
    "$id",
    "$defs",
    "$vocabulary",
    { keyword: "$comment" },
    "definitions",
    e.default,
    t.default
  ];
  return st.default = s, st;
}
var it = {}, ot = {}, Hr;
function Ps() {
  if (Hr) return ot;
  Hr = 1, Object.defineProperty(ot, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = e.operators, s = {
    maximum: { okStr: "<=", ok: t.LTE, fail: t.GT },
    minimum: { okStr: ">=", ok: t.GTE, fail: t.LT },
    exclusiveMaximum: { okStr: "<", ok: t.LT, fail: t.GTE },
    exclusiveMinimum: { okStr: ">", ok: t.GT, fail: t.LTE }
  }, r = {
    message: ({ keyword: a, schemaCode: h }) => (0, e.str)`must be ${s[a].okStr} ${h}`,
    params: ({ keyword: a, schemaCode: h }) => (0, e._)`{comparison: ${s[a].okStr}, limit: ${h}}`
  }, p = {
    keyword: Object.keys(s),
    type: "number",
    schemaType: "number",
    $data: !0,
    error: r,
    code(a) {
      const { keyword: h, data: d, schemaCode: m } = a;
      a.fail$data((0, e._)`${d} ${s[h].fail} ${m} || isNaN(${d})`);
    }
  };
  return ot.default = p, ot;
}
var ct = {}, zr;
function Rs() {
  if (zr) return ct;
  zr = 1, Object.defineProperty(ct, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), s = {
    keyword: "multipleOf",
    type: "number",
    schemaType: "number",
    $data: !0,
    error: {
      message: ({ schemaCode: r }) => (0, e.str)`must be multiple of ${r}`,
      params: ({ schemaCode: r }) => (0, e._)`{multipleOf: ${r}}`
    },
    code(r) {
      const { gen: p, data: a, schemaCode: h, it: d } = r, m = d.opts.multipleOfPrecision, w = p.let("res"), $ = m ? (0, e._)`Math.abs(Math.round(${w}) - ${w}) > 1e-${m}` : (0, e._)`${w} !== parseInt(${w})`;
      r.fail$data((0, e._)`(${h} === 0 || (${w} = ${a}/${h}, ${$}))`);
    }
  };
  return ct.default = s, ct;
}
var ut = {}, lt = {}, Kr;
function Is() {
  if (Kr) return lt;
  Kr = 1, Object.defineProperty(lt, "__esModule", { value: !0 });
  function e(t) {
    const s = t.length;
    let r = 0, p = 0, a;
    for (; p < s; )
      r++, a = t.charCodeAt(p++), a >= 55296 && a <= 56319 && p < s && (a = t.charCodeAt(p), (a & 64512) === 56320 && p++);
    return r;
  }
  return lt.default = e, e.code = 'require("ajv/dist/runtime/ucs2length").default', lt;
}
var Wr;
function Os() {
  if (Wr) return ut;
  Wr = 1, Object.defineProperty(ut, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), s = /* @__PURE__ */ Is(), p = {
    keyword: ["maxLength", "minLength"],
    type: "string",
    schemaType: "number",
    $data: !0,
    error: {
      message({ keyword: a, schemaCode: h }) {
        const d = a === "maxLength" ? "more" : "fewer";
        return (0, e.str)`must NOT have ${d} than ${h} characters`;
      },
      params: ({ schemaCode: a }) => (0, e._)`{limit: ${a}}`
    },
    code(a) {
      const { keyword: h, data: d, schemaCode: m, it: w } = a, $ = h === "maxLength" ? e.operators.GT : e.operators.LT, P = w.opts.unicode === !1 ? (0, e._)`${d}.length` : (0, e._)`${(0, t.useFunc)(a.gen, s.default)}(${d})`;
      a.fail$data((0, e._)`${P} ${$} ${m}`);
    }
  };
  return ut.default = p, ut;
}
var dt = {}, Jr;
function Ns() {
  if (Jr) return dt;
  Jr = 1, Object.defineProperty(dt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ $e(), t = /* @__PURE__ */ Z(), s = /* @__PURE__ */ Y(), p = {
    keyword: "pattern",
    type: "string",
    schemaType: "string",
    $data: !0,
    error: {
      message: ({ schemaCode: a }) => (0, s.str)`must match pattern "${a}"`,
      params: ({ schemaCode: a }) => (0, s._)`{pattern: ${a}}`
    },
    code(a) {
      const { gen: h, data: d, $data: m, schema: w, schemaCode: $, it: P } = a, v = P.opts.unicodeRegExp ? "u" : "";
      if (m) {
        const { regExp: _ } = P.opts.code, y = _.code === "new RegExp" ? (0, s._)`new RegExp` : (0, t.useFunc)(h, _), E = h.let("valid");
        h.try(() => h.assign(E, (0, s._)`${y}(${$}, ${v}).test(${d})`), () => h.assign(E, !1)), a.fail$data((0, s._)`!${E}`);
      } else {
        const _ = (0, e.usePattern)(a, w);
        a.fail$data((0, s._)`!${_}.test(${d})`);
      }
    }
  };
  return dt.default = p, dt;
}
var ft = {}, Br;
function Ts() {
  if (Br) return ft;
  Br = 1, Object.defineProperty(ft, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), s = {
    keyword: ["maxProperties", "minProperties"],
    type: "object",
    schemaType: "number",
    $data: !0,
    error: {
      message({ keyword: r, schemaCode: p }) {
        const a = r === "maxProperties" ? "more" : "fewer";
        return (0, e.str)`must NOT have ${a} than ${p} properties`;
      },
      params: ({ schemaCode: r }) => (0, e._)`{limit: ${r}}`
    },
    code(r) {
      const { keyword: p, data: a, schemaCode: h } = r, d = p === "maxProperties" ? e.operators.GT : e.operators.LT;
      r.fail$data((0, e._)`Object.keys(${a}).length ${d} ${h}`);
    }
  };
  return ft.default = s, ft;
}
var ht = {}, Yr;
function js() {
  if (Yr) return ht;
  Yr = 1, Object.defineProperty(ht, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ $e(), t = /* @__PURE__ */ Y(), s = /* @__PURE__ */ Z(), p = {
    keyword: "required",
    type: "object",
    schemaType: "array",
    $data: !0,
    error: {
      message: ({ params: { missingProperty: a } }) => (0, t.str)`must have required property '${a}'`,
      params: ({ params: { missingProperty: a } }) => (0, t._)`{missingProperty: ${a}}`
    },
    code(a) {
      const { gen: h, schema: d, schemaCode: m, data: w, $data: $, it: P } = a, { opts: v } = P;
      if (!$ && d.length === 0)
        return;
      const _ = d.length >= v.loopRequired;
      if (P.allErrors ? y() : E(), v.strictRequired) {
        const n = a.parentSchema.properties, { definedProperties: c } = a.it;
        for (const g of d)
          if ((n == null ? void 0 : n[g]) === void 0 && !c.has(g)) {
            const i = P.schemaEnv.baseId + P.errSchemaPath, f = `required property "${g}" is not defined at "${i}" (strictRequired)`;
            (0, s.checkStrictMode)(P, f, P.opts.strictRequired);
          }
      }
      function y() {
        if (_ || $)
          a.block$data(t.nil, o);
        else
          for (const n of d)
            (0, e.checkReportMissingProp)(a, n);
      }
      function E() {
        const n = h.let("missing");
        if (_ || $) {
          const c = h.let("valid", !0);
          a.block$data(c, () => u(n, c)), a.ok(c);
        } else
          h.if((0, e.checkMissingProp)(a, d, n)), (0, e.reportMissingProp)(a, n), h.else();
      }
      function o() {
        h.forOf("prop", m, (n) => {
          a.setParams({ missingProperty: n }), h.if((0, e.noPropertyInData)(h, w, n, v.ownProperties), () => a.error());
        });
      }
      function u(n, c) {
        a.setParams({ missingProperty: n }), h.forOf(n, m, () => {
          h.assign(c, (0, e.propertyInData)(h, w, n, v.ownProperties)), h.if((0, t.not)(c), () => {
            a.error(), h.break();
          });
        }, t.nil);
      }
    }
  };
  return ht.default = p, ht;
}
var pt = {}, Xr;
function ks() {
  if (Xr) return pt;
  Xr = 1, Object.defineProperty(pt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), s = {
    keyword: ["maxItems", "minItems"],
    type: "array",
    schemaType: "number",
    $data: !0,
    error: {
      message({ keyword: r, schemaCode: p }) {
        const a = r === "maxItems" ? "more" : "fewer";
        return (0, e.str)`must NOT have ${a} than ${p} items`;
      },
      params: ({ schemaCode: r }) => (0, e._)`{limit: ${r}}`
    },
    code(r) {
      const { keyword: p, data: a, schemaCode: h } = r, d = p === "maxItems" ? e.operators.GT : e.operators.LT;
      r.fail$data((0, e._)`${a}.length ${d} ${h}`);
    }
  };
  return pt.default = s, pt;
}
var mt = {}, gt = {}, Qr;
function ir() {
  if (Qr) return gt;
  Qr = 1, Object.defineProperty(gt, "__esModule", { value: !0 });
  const e = Ln();
  return e.code = 'require("ajv/dist/runtime/equal").default', gt.default = e, gt;
}
var Zr;
function qs() {
  if (Zr) return mt;
  Zr = 1, Object.defineProperty(mt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Ft(), t = /* @__PURE__ */ Y(), s = /* @__PURE__ */ Z(), r = /* @__PURE__ */ ir(), a = {
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    $data: !0,
    error: {
      message: ({ params: { i: h, j: d } }) => (0, t.str)`must NOT have duplicate items (items ## ${d} and ${h} are identical)`,
      params: ({ params: { i: h, j: d } }) => (0, t._)`{i: ${h}, j: ${d}}`
    },
    code(h) {
      const { gen: d, data: m, $data: w, schema: $, parentSchema: P, schemaCode: v, it: _ } = h;
      if (!w && !$)
        return;
      const y = d.let("valid"), E = P.items ? (0, e.getSchemaTypes)(P.items) : [];
      h.block$data(y, o, (0, t._)`${v} === false`), h.ok(y);
      function o() {
        const g = d.let("i", (0, t._)`${m}.length`), i = d.let("j");
        h.setParams({ i: g, j: i }), d.assign(y, !0), d.if((0, t._)`${g} > 1`, () => (u() ? n : c)(g, i));
      }
      function u() {
        return E.length > 0 && !E.some((g) => g === "object" || g === "array");
      }
      function n(g, i) {
        const f = d.name("item"), b = (0, e.checkDataTypes)(E, f, _.opts.strictNumbers, e.DataType.Wrong), T = d.const("indices", (0, t._)`{}`);
        d.for((0, t._)`;${g}--;`, () => {
          d.let(f, (0, t._)`${m}[${g}]`), d.if(b, (0, t._)`continue`), E.length > 1 && d.if((0, t._)`typeof ${f} == "string"`, (0, t._)`${f} += "_"`), d.if((0, t._)`typeof ${T}[${f}] == "number"`, () => {
            d.assign(i, (0, t._)`${T}[${f}]`), h.error(), d.assign(y, !1).break();
          }).code((0, t._)`${T}[${f}] = ${g}`);
        });
      }
      function c(g, i) {
        const f = (0, s.useFunc)(d, r.default), b = d.name("outer");
        d.label(b).for((0, t._)`;${g}--;`, () => d.for((0, t._)`${i} = ${g}; ${i}--;`, () => d.if((0, t._)`${f}(${m}[${g}], ${m}[${i}])`, () => {
          h.error(), d.assign(y, !1).break(b);
        })));
      }
    }
  };
  return mt.default = a, mt;
}
var yt = {}, xr;
function Ds() {
  if (xr) return yt;
  xr = 1, Object.defineProperty(yt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), s = /* @__PURE__ */ ir(), p = {
    keyword: "const",
    $data: !0,
    error: {
      message: "must be equal to constant",
      params: ({ schemaCode: a }) => (0, e._)`{allowedValue: ${a}}`
    },
    code(a) {
      const { gen: h, data: d, $data: m, schemaCode: w, schema: $ } = a;
      m || $ && typeof $ == "object" ? a.fail$data((0, e._)`!${(0, t.useFunc)(h, s.default)}(${d}, ${w})`) : a.fail((0, e._)`${$} !== ${d}`);
    }
  };
  return yt.default = p, yt;
}
var _t = {}, en;
function Cs() {
  if (en) return _t;
  en = 1, Object.defineProperty(_t, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), s = /* @__PURE__ */ ir(), p = {
    keyword: "enum",
    schemaType: "array",
    $data: !0,
    error: {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode: a }) => (0, e._)`{allowedValues: ${a}}`
    },
    code(a) {
      const { gen: h, data: d, $data: m, schema: w, schemaCode: $, it: P } = a;
      if (!m && w.length === 0)
        throw new Error("enum must have non-empty array");
      const v = w.length >= P.opts.loopEnum;
      let _;
      const y = () => _ ?? (_ = (0, t.useFunc)(h, s.default));
      let E;
      if (v || m)
        E = h.let("valid"), a.block$data(E, o);
      else {
        if (!Array.isArray(w))
          throw new Error("ajv implementation error");
        const n = h.const("vSchema", $);
        E = (0, e.or)(...w.map((c, g) => u(n, g)));
      }
      a.pass(E);
      function o() {
        h.assign(E, !1), h.forOf("v", $, (n) => h.if((0, e._)`${y()}(${d}, ${n})`, () => h.assign(E, !0).break()));
      }
      function u(n, c) {
        const g = w[c];
        return typeof g == "object" && g !== null ? (0, e._)`${y()}(${d}, ${n}[${c}])` : (0, e._)`${d} === ${g}`;
      }
    }
  };
  return _t.default = p, _t;
}
var tn;
function As() {
  if (tn) return it;
  tn = 1, Object.defineProperty(it, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Ps(), t = /* @__PURE__ */ Rs(), s = /* @__PURE__ */ Os(), r = /* @__PURE__ */ Ns(), p = /* @__PURE__ */ Ts(), a = /* @__PURE__ */ js(), h = /* @__PURE__ */ ks(), d = /* @__PURE__ */ qs(), m = /* @__PURE__ */ Ds(), w = /* @__PURE__ */ Cs(), $ = [
    // number
    e.default,
    t.default,
    // string
    s.default,
    r.default,
    // object
    p.default,
    a.default,
    // array
    h.default,
    d.default,
    // any
    { keyword: "type", schemaType: ["string", "array"] },
    { keyword: "nullable", schemaType: "boolean" },
    m.default,
    w.default
  ];
  return it.default = $, it;
}
var vt = {}, Ve = {}, rn;
function Gn() {
  if (rn) return Ve;
  rn = 1, Object.defineProperty(Ve, "__esModule", { value: !0 }), Ve.validateAdditionalItems = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), r = {
    keyword: "additionalItems",
    type: "array",
    schemaType: ["boolean", "object"],
    before: "uniqueItems",
    error: {
      message: ({ params: { len: a } }) => (0, e.str)`must NOT have more than ${a} items`,
      params: ({ params: { len: a } }) => (0, e._)`{limit: ${a}}`
    },
    code(a) {
      const { parentSchema: h, it: d } = a, { items: m } = h;
      if (!Array.isArray(m)) {
        (0, t.checkStrictMode)(d, '"additionalItems" is ignored when "items" is not an array of schemas');
        return;
      }
      p(a, m);
    }
  };
  function p(a, h) {
    const { gen: d, schema: m, data: w, keyword: $, it: P } = a;
    P.items = !0;
    const v = d.const("len", (0, e._)`${w}.length`);
    if (m === !1)
      a.setParams({ len: h.length }), a.pass((0, e._)`${v} <= ${h.length}`);
    else if (typeof m == "object" && !(0, t.alwaysValidSchema)(P, m)) {
      const y = d.var("valid", (0, e._)`${v} <= ${h.length}`);
      d.if((0, e.not)(y), () => _(y)), a.ok(y);
    }
    function _(y) {
      d.forRange("i", h.length, v, (E) => {
        a.subschema({ keyword: $, dataProp: E, dataPropType: t.Type.Num }, y), P.allErrors || d.if((0, e.not)(y), () => d.break());
      });
    }
  }
  return Ve.validateAdditionalItems = p, Ve.default = r, Ve;
}
var $t = {}, Ge = {}, nn;
function Un() {
  if (nn) return Ge;
  nn = 1, Object.defineProperty(Ge, "__esModule", { value: !0 }), Ge.validateTuple = void 0;
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), s = /* @__PURE__ */ $e(), r = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "array", "boolean"],
    before: "uniqueItems",
    code(a) {
      const { schema: h, it: d } = a;
      if (Array.isArray(h))
        return p(a, "additionalItems", h);
      d.items = !0, !(0, t.alwaysValidSchema)(d, h) && a.ok((0, s.validateArray)(a));
    }
  };
  function p(a, h, d = a.schema) {
    const { gen: m, parentSchema: w, data: $, keyword: P, it: v } = a;
    E(w), v.opts.unevaluated && d.length && v.items !== !0 && (v.items = t.mergeEvaluated.items(m, d.length, v.items));
    const _ = m.name("valid"), y = m.const("len", (0, e._)`${$}.length`);
    d.forEach((o, u) => {
      (0, t.alwaysValidSchema)(v, o) || (m.if((0, e._)`${y} > ${u}`, () => a.subschema({
        keyword: P,
        schemaProp: u,
        dataProp: u
      }, _)), a.ok(_));
    });
    function E(o) {
      const { opts: u, errSchemaPath: n } = v, c = d.length, g = c === o.minItems && (c === o.maxItems || o[h] === !1);
      if (u.strictTuples && !g) {
        const i = `"${P}" is ${c}-tuple, but minItems or maxItems/${h} are not specified or different at path "${n}"`;
        (0, t.checkStrictMode)(v, i, u.strictTuples);
      }
    }
  }
  return Ge.validateTuple = p, Ge.default = r, Ge;
}
var sn;
function Ms() {
  if (sn) return $t;
  sn = 1, Object.defineProperty($t, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Un(), t = {
    keyword: "prefixItems",
    type: "array",
    schemaType: ["array"],
    before: "uniqueItems",
    code: (s) => (0, e.validateTuple)(s, "items")
  };
  return $t.default = t, $t;
}
var wt = {}, an;
function Fs() {
  if (an) return wt;
  an = 1, Object.defineProperty(wt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), s = /* @__PURE__ */ $e(), r = /* @__PURE__ */ Gn(), a = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    error: {
      message: ({ params: { len: h } }) => (0, e.str)`must NOT have more than ${h} items`,
      params: ({ params: { len: h } }) => (0, e._)`{limit: ${h}}`
    },
    code(h) {
      const { schema: d, parentSchema: m, it: w } = h, { prefixItems: $ } = m;
      w.items = !0, !(0, t.alwaysValidSchema)(w, d) && ($ ? (0, r.validateAdditionalItems)(h, $) : h.ok((0, s.validateArray)(h)));
    }
  };
  return wt.default = a, wt;
}
var Et = {}, on;
function Ls() {
  if (on) return Et;
  on = 1, Object.defineProperty(Et, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), r = {
    keyword: "contains",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    trackErrors: !0,
    error: {
      message: ({ params: { min: p, max: a } }) => a === void 0 ? (0, e.str)`must contain at least ${p} valid item(s)` : (0, e.str)`must contain at least ${p} and no more than ${a} valid item(s)`,
      params: ({ params: { min: p, max: a } }) => a === void 0 ? (0, e._)`{minContains: ${p}}` : (0, e._)`{minContains: ${p}, maxContains: ${a}}`
    },
    code(p) {
      const { gen: a, schema: h, parentSchema: d, data: m, it: w } = p;
      let $, P;
      const { minContains: v, maxContains: _ } = d;
      w.opts.next ? ($ = v === void 0 ? 1 : v, P = _) : $ = 1;
      const y = a.const("len", (0, e._)`${m}.length`);
      if (p.setParams({ min: $, max: P }), P === void 0 && $ === 0) {
        (0, t.checkStrictMode)(w, '"minContains" == 0 without "maxContains": "contains" keyword ignored');
        return;
      }
      if (P !== void 0 && $ > P) {
        (0, t.checkStrictMode)(w, '"minContains" > "maxContains" is always invalid'), p.fail();
        return;
      }
      if ((0, t.alwaysValidSchema)(w, h)) {
        let c = (0, e._)`${y} >= ${$}`;
        P !== void 0 && (c = (0, e._)`${c} && ${y} <= ${P}`), p.pass(c);
        return;
      }
      w.items = !0;
      const E = a.name("valid");
      P === void 0 && $ === 1 ? u(E, () => a.if(E, () => a.break())) : $ === 0 ? (a.let(E, !0), P !== void 0 && a.if((0, e._)`${m}.length > 0`, o)) : (a.let(E, !1), o()), p.result(E, () => p.reset());
      function o() {
        const c = a.name("_valid"), g = a.let("count", 0);
        u(c, () => a.if(c, () => n(g)));
      }
      function u(c, g) {
        a.forRange("i", 0, y, (i) => {
          p.subschema({
            keyword: "contains",
            dataProp: i,
            dataPropType: t.Type.Num,
            compositeRule: !0
          }, c), g();
        });
      }
      function n(c) {
        a.code((0, e._)`${c}++`), P === void 0 ? a.if((0, e._)`${c} >= ${$}`, () => a.assign(E, !0).break()) : (a.if((0, e._)`${c} > ${P}`, () => a.assign(E, !1).break()), $ === 1 ? a.assign(E, !0) : a.if((0, e._)`${c} >= ${$}`, () => a.assign(E, !0)));
      }
    }
  };
  return Et.default = r, Et;
}
var rr = {}, cn;
function Vs() {
  return cn || (cn = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.validateSchemaDeps = e.validatePropertyDeps = e.error = void 0;
    const t = /* @__PURE__ */ Y(), s = /* @__PURE__ */ Z(), r = /* @__PURE__ */ $e();
    e.error = {
      message: ({ params: { property: m, depsCount: w, deps: $ } }) => {
        const P = w === 1 ? "property" : "properties";
        return (0, t.str)`must have ${P} ${$} when property ${m} is present`;
      },
      params: ({ params: { property: m, depsCount: w, deps: $, missingProperty: P } }) => (0, t._)`{property: ${m},
    missingProperty: ${P},
    depsCount: ${w},
    deps: ${$}}`
      // TODO change to reference
    };
    const p = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: e.error,
      code(m) {
        const [w, $] = a(m);
        h(m, w), d(m, $);
      }
    };
    function a({ schema: m }) {
      const w = {}, $ = {};
      for (const P in m) {
        if (P === "__proto__")
          continue;
        const v = Array.isArray(m[P]) ? w : $;
        v[P] = m[P];
      }
      return [w, $];
    }
    function h(m, w = m.schema) {
      const { gen: $, data: P, it: v } = m;
      if (Object.keys(w).length === 0)
        return;
      const _ = $.let("missing");
      for (const y in w) {
        const E = w[y];
        if (E.length === 0)
          continue;
        const o = (0, r.propertyInData)($, P, y, v.opts.ownProperties);
        m.setParams({
          property: y,
          depsCount: E.length,
          deps: E.join(", ")
        }), v.allErrors ? $.if(o, () => {
          for (const u of E)
            (0, r.checkReportMissingProp)(m, u);
        }) : ($.if((0, t._)`${o} && (${(0, r.checkMissingProp)(m, E, _)})`), (0, r.reportMissingProp)(m, _), $.else());
      }
    }
    e.validatePropertyDeps = h;
    function d(m, w = m.schema) {
      const { gen: $, data: P, keyword: v, it: _ } = m, y = $.name("valid");
      for (const E in w)
        (0, s.alwaysValidSchema)(_, w[E]) || ($.if(
          (0, r.propertyInData)($, P, E, _.opts.ownProperties),
          () => {
            const o = m.subschema({ keyword: v, schemaProp: E }, y);
            m.mergeValidEvaluated(o, y);
          },
          () => $.var(y, !0)
          // TODO var
        ), m.ok(y));
    }
    e.validateSchemaDeps = d, e.default = p;
  })(rr)), rr;
}
var bt = {}, un;
function Gs() {
  if (un) return bt;
  un = 1, Object.defineProperty(bt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), r = {
    keyword: "propertyNames",
    type: "object",
    schemaType: ["object", "boolean"],
    error: {
      message: "property name must be valid",
      params: ({ params: p }) => (0, e._)`{propertyName: ${p.propertyName}}`
    },
    code(p) {
      const { gen: a, schema: h, data: d, it: m } = p;
      if ((0, t.alwaysValidSchema)(m, h))
        return;
      const w = a.name("valid");
      a.forIn("key", d, ($) => {
        p.setParams({ propertyName: $ }), p.subschema({
          keyword: "propertyNames",
          data: $,
          dataTypes: ["string"],
          propertyName: $,
          compositeRule: !0
        }, w), a.if((0, e.not)(w), () => {
          p.error(!0), m.allErrors || a.break();
        });
      }), p.ok(w);
    }
  };
  return bt.default = r, bt;
}
var St = {}, ln;
function Hn() {
  if (ln) return St;
  ln = 1, Object.defineProperty(St, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ $e(), t = /* @__PURE__ */ Y(), s = /* @__PURE__ */ ke(), r = /* @__PURE__ */ Z(), a = {
    keyword: "additionalProperties",
    type: ["object"],
    schemaType: ["boolean", "object"],
    allowUndefined: !0,
    trackErrors: !0,
    error: {
      message: "must NOT have additional properties",
      params: ({ params: h }) => (0, t._)`{additionalProperty: ${h.additionalProperty}}`
    },
    code(h) {
      const { gen: d, schema: m, parentSchema: w, data: $, errsCount: P, it: v } = h;
      if (!P)
        throw new Error("ajv implementation error");
      const { allErrors: _, opts: y } = v;
      if (v.props = !0, y.removeAdditional !== "all" && (0, r.alwaysValidSchema)(v, m))
        return;
      const E = (0, e.allSchemaProperties)(w.properties), o = (0, e.allSchemaProperties)(w.patternProperties);
      u(), h.ok((0, t._)`${P} === ${s.default.errors}`);
      function u() {
        d.forIn("key", $, (f) => {
          !E.length && !o.length ? g(f) : d.if(n(f), () => g(f));
        });
      }
      function n(f) {
        let b;
        if (E.length > 8) {
          const T = (0, r.schemaRefOrVal)(v, w.properties, "properties");
          b = (0, e.isOwnProperty)(d, T, f);
        } else E.length ? b = (0, t.or)(...E.map((T) => (0, t._)`${f} === ${T}`)) : b = t.nil;
        return o.length && (b = (0, t.or)(b, ...o.map((T) => (0, t._)`${(0, e.usePattern)(h, T)}.test(${f})`))), (0, t.not)(b);
      }
      function c(f) {
        d.code((0, t._)`delete ${$}[${f}]`);
      }
      function g(f) {
        if (y.removeAdditional === "all" || y.removeAdditional && m === !1) {
          c(f);
          return;
        }
        if (m === !1) {
          h.setParams({ additionalProperty: f }), h.error(), _ || d.break();
          return;
        }
        if (typeof m == "object" && !(0, r.alwaysValidSchema)(v, m)) {
          const b = d.name("valid");
          y.removeAdditional === "failing" ? (i(f, b, !1), d.if((0, t.not)(b), () => {
            h.reset(), c(f);
          })) : (i(f, b), _ || d.if((0, t.not)(b), () => d.break()));
        }
      }
      function i(f, b, T) {
        const D = {
          keyword: "additionalProperties",
          dataProp: f,
          dataPropType: r.Type.Str
        };
        T === !1 && Object.assign(D, {
          compositeRule: !0,
          createErrors: !1,
          allErrors: !1
        }), h.subschema(D, b);
      }
    }
  };
  return St.default = a, St;
}
var Pt = {}, dn;
function Us() {
  if (dn) return Pt;
  dn = 1, Object.defineProperty(Pt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Gt(), t = /* @__PURE__ */ $e(), s = /* @__PURE__ */ Z(), r = /* @__PURE__ */ Hn(), p = {
    keyword: "properties",
    type: "object",
    schemaType: "object",
    code(a) {
      const { gen: h, schema: d, parentSchema: m, data: w, it: $ } = a;
      $.opts.removeAdditional === "all" && m.additionalProperties === void 0 && r.default.code(new e.KeywordCxt($, r.default, "additionalProperties"));
      const P = (0, t.allSchemaProperties)(d);
      for (const o of P)
        $.definedProperties.add(o);
      $.opts.unevaluated && P.length && $.props !== !0 && ($.props = s.mergeEvaluated.props(h, (0, s.toHash)(P), $.props));
      const v = P.filter((o) => !(0, s.alwaysValidSchema)($, d[o]));
      if (v.length === 0)
        return;
      const _ = h.name("valid");
      for (const o of v)
        y(o) ? E(o) : (h.if((0, t.propertyInData)(h, w, o, $.opts.ownProperties)), E(o), $.allErrors || h.else().var(_, !0), h.endIf()), a.it.definedProperties.add(o), a.ok(_);
      function y(o) {
        return $.opts.useDefaults && !$.compositeRule && d[o].default !== void 0;
      }
      function E(o) {
        a.subschema({
          keyword: "properties",
          schemaProp: o,
          dataProp: o
        }, _);
      }
    }
  };
  return Pt.default = p, Pt;
}
var Rt = {}, fn;
function Hs() {
  if (fn) return Rt;
  fn = 1, Object.defineProperty(Rt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ $e(), t = /* @__PURE__ */ Y(), s = /* @__PURE__ */ Z(), r = /* @__PURE__ */ Z(), p = {
    keyword: "patternProperties",
    type: "object",
    schemaType: "object",
    code(a) {
      const { gen: h, schema: d, data: m, parentSchema: w, it: $ } = a, { opts: P } = $, v = (0, e.allSchemaProperties)(d), _ = v.filter((g) => (0, s.alwaysValidSchema)($, d[g]));
      if (v.length === 0 || _.length === v.length && (!$.opts.unevaluated || $.props === !0))
        return;
      const y = P.strictSchema && !P.allowMatchingProperties && w.properties, E = h.name("valid");
      $.props !== !0 && !($.props instanceof t.Name) && ($.props = (0, r.evaluatedPropsToName)(h, $.props));
      const { props: o } = $;
      u();
      function u() {
        for (const g of v)
          y && n(g), $.allErrors ? c(g) : (h.var(E, !0), c(g), h.if(E));
      }
      function n(g) {
        for (const i in y)
          new RegExp(g).test(i) && (0, s.checkStrictMode)($, `property ${i} matches pattern ${g} (use allowMatchingProperties)`);
      }
      function c(g) {
        h.forIn("key", m, (i) => {
          h.if((0, t._)`${(0, e.usePattern)(a, g)}.test(${i})`, () => {
            const f = _.includes(g);
            f || a.subschema({
              keyword: "patternProperties",
              schemaProp: g,
              dataProp: i,
              dataPropType: r.Type.Str
            }, E), $.opts.unevaluated && o !== !0 ? h.assign((0, t._)`${o}[${i}]`, !0) : !f && !$.allErrors && h.if((0, t.not)(E), () => h.break());
          });
        });
      }
    }
  };
  return Rt.default = p, Rt;
}
var It = {}, hn;
function zs() {
  if (hn) return It;
  hn = 1, Object.defineProperty(It, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Z(), t = {
    keyword: "not",
    schemaType: ["object", "boolean"],
    trackErrors: !0,
    code(s) {
      const { gen: r, schema: p, it: a } = s;
      if ((0, e.alwaysValidSchema)(a, p)) {
        s.fail();
        return;
      }
      const h = r.name("valid");
      s.subschema({
        keyword: "not",
        compositeRule: !0,
        createErrors: !1,
        allErrors: !1
      }, h), s.failResult(h, () => s.reset(), () => s.error());
    },
    error: { message: "must NOT be valid" }
  };
  return It.default = t, It;
}
var Ot = {}, pn;
function Ks() {
  if (pn) return Ot;
  pn = 1, Object.defineProperty(Ot, "__esModule", { value: !0 });
  const t = {
    keyword: "anyOf",
    schemaType: "array",
    trackErrors: !0,
    code: (/* @__PURE__ */ $e()).validateUnion,
    error: { message: "must match a schema in anyOf" }
  };
  return Ot.default = t, Ot;
}
var Nt = {}, mn;
function Ws() {
  if (mn) return Nt;
  mn = 1, Object.defineProperty(Nt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), r = {
    keyword: "oneOf",
    schemaType: "array",
    trackErrors: !0,
    error: {
      message: "must match exactly one schema in oneOf",
      params: ({ params: p }) => (0, e._)`{passingSchemas: ${p.passing}}`
    },
    code(p) {
      const { gen: a, schema: h, parentSchema: d, it: m } = p;
      if (!Array.isArray(h))
        throw new Error("ajv implementation error");
      if (m.opts.discriminator && d.discriminator)
        return;
      const w = h, $ = a.let("valid", !1), P = a.let("passing", null), v = a.name("_valid");
      p.setParams({ passing: P }), a.block(_), p.result($, () => p.reset(), () => p.error(!0));
      function _() {
        w.forEach((y, E) => {
          let o;
          (0, t.alwaysValidSchema)(m, y) ? a.var(v, !0) : o = p.subschema({
            keyword: "oneOf",
            schemaProp: E,
            compositeRule: !0
          }, v), E > 0 && a.if((0, e._)`${v} && ${$}`).assign($, !1).assign(P, (0, e._)`[${P}, ${E}]`).else(), a.if(v, () => {
            a.assign($, !0), a.assign(P, E), o && p.mergeEvaluated(o, e.Name);
          });
        });
      }
    }
  };
  return Nt.default = r, Nt;
}
var Tt = {}, gn;
function Js() {
  if (gn) return Tt;
  gn = 1, Object.defineProperty(Tt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Z(), t = {
    keyword: "allOf",
    schemaType: "array",
    code(s) {
      const { gen: r, schema: p, it: a } = s;
      if (!Array.isArray(p))
        throw new Error("ajv implementation error");
      const h = r.name("valid");
      p.forEach((d, m) => {
        if ((0, e.alwaysValidSchema)(a, d))
          return;
        const w = s.subschema({ keyword: "allOf", schemaProp: m }, h);
        s.ok(h), s.mergeEvaluated(w);
      });
    }
  };
  return Tt.default = t, Tt;
}
var jt = {}, yn;
function Bs() {
  if (yn) return jt;
  yn = 1, Object.defineProperty(jt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ Z(), r = {
    keyword: "if",
    schemaType: ["object", "boolean"],
    trackErrors: !0,
    error: {
      message: ({ params: a }) => (0, e.str)`must match "${a.ifClause}" schema`,
      params: ({ params: a }) => (0, e._)`{failingKeyword: ${a.ifClause}}`
    },
    code(a) {
      const { gen: h, parentSchema: d, it: m } = a;
      d.then === void 0 && d.else === void 0 && (0, t.checkStrictMode)(m, '"if" without "then" and "else" is ignored');
      const w = p(m, "then"), $ = p(m, "else");
      if (!w && !$)
        return;
      const P = h.let("valid", !0), v = h.name("_valid");
      if (_(), a.reset(), w && $) {
        const E = h.let("ifClause");
        a.setParams({ ifClause: E }), h.if(v, y("then", E), y("else", E));
      } else w ? h.if(v, y("then")) : h.if((0, e.not)(v), y("else"));
      a.pass(P, () => a.error(!0));
      function _() {
        const E = a.subschema({
          keyword: "if",
          compositeRule: !0,
          createErrors: !1,
          allErrors: !1
        }, v);
        a.mergeEvaluated(E);
      }
      function y(E, o) {
        return () => {
          const u = a.subschema({ keyword: E }, v);
          h.assign(P, v), a.mergeValidEvaluated(u, P), o ? h.assign(o, (0, e._)`${E}`) : a.setParams({ ifClause: E });
        };
      }
    }
  };
  function p(a, h) {
    const d = a.schema[h];
    return d !== void 0 && !(0, t.alwaysValidSchema)(a, d);
  }
  return jt.default = r, jt;
}
var kt = {}, _n;
function Ys() {
  if (_n) return kt;
  _n = 1, Object.defineProperty(kt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Z(), t = {
    keyword: ["then", "else"],
    schemaType: ["object", "boolean"],
    code({ keyword: s, parentSchema: r, it: p }) {
      r.if === void 0 && (0, e.checkStrictMode)(p, `"${s}" without "if" is ignored`);
    }
  };
  return kt.default = t, kt;
}
var vn;
function Xs() {
  if (vn) return vt;
  vn = 1, Object.defineProperty(vt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Gn(), t = /* @__PURE__ */ Ms(), s = /* @__PURE__ */ Un(), r = /* @__PURE__ */ Fs(), p = /* @__PURE__ */ Ls(), a = /* @__PURE__ */ Vs(), h = /* @__PURE__ */ Gs(), d = /* @__PURE__ */ Hn(), m = /* @__PURE__ */ Us(), w = /* @__PURE__ */ Hs(), $ = /* @__PURE__ */ zs(), P = /* @__PURE__ */ Ks(), v = /* @__PURE__ */ Ws(), _ = /* @__PURE__ */ Js(), y = /* @__PURE__ */ Bs(), E = /* @__PURE__ */ Ys();
  function o(u = !1) {
    const n = [
      // any
      $.default,
      P.default,
      v.default,
      _.default,
      y.default,
      E.default,
      // object
      h.default,
      d.default,
      a.default,
      m.default,
      w.default
    ];
    return u ? n.push(t.default, r.default) : n.push(e.default, s.default), n.push(p.default), n;
  }
  return vt.default = o, vt;
}
var qt = {}, Dt = {}, $n;
function Qs() {
  if ($n) return Dt;
  $n = 1, Object.defineProperty(Dt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), s = {
    keyword: "format",
    type: ["number", "string"],
    schemaType: "string",
    $data: !0,
    error: {
      message: ({ schemaCode: r }) => (0, e.str)`must match format "${r}"`,
      params: ({ schemaCode: r }) => (0, e._)`{format: ${r}}`
    },
    code(r, p) {
      const { gen: a, data: h, $data: d, schema: m, schemaCode: w, it: $ } = r, { opts: P, errSchemaPath: v, schemaEnv: _, self: y } = $;
      if (!P.validateFormats)
        return;
      d ? E() : o();
      function E() {
        const u = a.scopeValue("formats", {
          ref: y.formats,
          code: P.code.formats
        }), n = a.const("fDef", (0, e._)`${u}[${w}]`), c = a.let("fType"), g = a.let("format");
        a.if((0, e._)`typeof ${n} == "object" && !(${n} instanceof RegExp)`, () => a.assign(c, (0, e._)`${n}.type || "string"`).assign(g, (0, e._)`${n}.validate`), () => a.assign(c, (0, e._)`"string"`).assign(g, n)), r.fail$data((0, e.or)(i(), f()));
        function i() {
          return P.strictSchema === !1 ? e.nil : (0, e._)`${w} && !${g}`;
        }
        function f() {
          const b = _.$async ? (0, e._)`(${n}.async ? await ${g}(${h}) : ${g}(${h}))` : (0, e._)`${g}(${h})`, T = (0, e._)`(typeof ${g} == "function" ? ${b} : ${g}.test(${h}))`;
          return (0, e._)`${g} && ${g} !== true && ${c} === ${p} && !${T}`;
        }
      }
      function o() {
        const u = y.formats[m];
        if (!u) {
          i();
          return;
        }
        if (u === !0)
          return;
        const [n, c, g] = f(u);
        n === p && r.pass(b());
        function i() {
          if (P.strictSchema === !1) {
            y.logger.warn(T());
            return;
          }
          throw new Error(T());
          function T() {
            return `unknown format "${m}" ignored in schema at path "${v}"`;
          }
        }
        function f(T) {
          const D = T instanceof RegExp ? (0, e.regexpCode)(T) : P.code.formats ? (0, e._)`${P.code.formats}${(0, e.getProperty)(m)}` : void 0, F = a.scopeValue("formats", { key: m, ref: T, code: D });
          return typeof T == "object" && !(T instanceof RegExp) ? [T.type || "string", T.validate, (0, e._)`${F}.validate`] : ["string", T, F];
        }
        function b() {
          if (typeof u == "object" && !(u instanceof RegExp) && u.async) {
            if (!_.$async)
              throw new Error("async format in sync schema");
            return (0, e._)`await ${g}(${h})`;
          }
          return typeof c == "function" ? (0, e._)`${g}(${h})` : (0, e._)`${g}.test(${h})`;
        }
      }
    }
  };
  return Dt.default = s, Dt;
}
var wn;
function Zs() {
  if (wn) return qt;
  wn = 1, Object.defineProperty(qt, "__esModule", { value: !0 });
  const t = [(/* @__PURE__ */ Qs()).default];
  return qt.default = t, qt;
}
var Ce = {}, En;
function xs() {
  return En || (En = 1, Object.defineProperty(Ce, "__esModule", { value: !0 }), Ce.contentVocabulary = Ce.metadataVocabulary = void 0, Ce.metadataVocabulary = [
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples"
  ], Ce.contentVocabulary = [
    "contentMediaType",
    "contentEncoding",
    "contentSchema"
  ]), Ce;
}
var bn;
function ea() {
  if (bn) return nt;
  bn = 1, Object.defineProperty(nt, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Ss(), t = /* @__PURE__ */ As(), s = /* @__PURE__ */ Xs(), r = /* @__PURE__ */ Zs(), p = /* @__PURE__ */ xs(), a = [
    e.default,
    t.default,
    (0, s.default)(),
    r.default,
    p.metadataVocabulary,
    p.contentVocabulary
  ];
  return nt.default = a, nt;
}
var Ct = {}, Ke = {}, Sn;
function ta() {
  if (Sn) return Ke;
  Sn = 1, Object.defineProperty(Ke, "__esModule", { value: !0 }), Ke.DiscrError = void 0;
  var e;
  return (function(t) {
    t.Tag = "tag", t.Mapping = "mapping";
  })(e || (Ke.DiscrError = e = {})), Ke;
}
var Pn;
function ra() {
  if (Pn) return Ct;
  Pn = 1, Object.defineProperty(Ct, "__esModule", { value: !0 });
  const e = /* @__PURE__ */ Y(), t = /* @__PURE__ */ ta(), s = /* @__PURE__ */ ar(), r = /* @__PURE__ */ Ut(), p = /* @__PURE__ */ Z(), h = {
    keyword: "discriminator",
    type: "object",
    schemaType: "object",
    error: {
      message: ({ params: { discrError: d, tagName: m } }) => d === t.DiscrError.Tag ? `tag "${m}" must be string` : `value of tag "${m}" must be in oneOf`,
      params: ({ params: { discrError: d, tag: m, tagName: w } }) => (0, e._)`{error: ${d}, tag: ${w}, tagValue: ${m}}`
    },
    code(d) {
      const { gen: m, data: w, schema: $, parentSchema: P, it: v } = d, { oneOf: _ } = P;
      if (!v.opts.discriminator)
        throw new Error("discriminator: requires discriminator option");
      const y = $.propertyName;
      if (typeof y != "string")
        throw new Error("discriminator: requires propertyName");
      if ($.mapping)
        throw new Error("discriminator: mapping is not supported");
      if (!_)
        throw new Error("discriminator: requires oneOf keyword");
      const E = m.let("valid", !1), o = m.const("tag", (0, e._)`${w}${(0, e.getProperty)(y)}`);
      m.if((0, e._)`typeof ${o} == "string"`, () => u(), () => d.error(!1, { discrError: t.DiscrError.Tag, tag: o, tagName: y })), d.ok(E);
      function u() {
        const g = c();
        m.if(!1);
        for (const i in g)
          m.elseIf((0, e._)`${o} === ${i}`), m.assign(E, n(g[i]));
        m.else(), d.error(!1, { discrError: t.DiscrError.Mapping, tag: o, tagName: y }), m.endIf();
      }
      function n(g) {
        const i = m.name("valid"), f = d.subschema({ keyword: "oneOf", schemaProp: g }, i);
        return d.mergeEvaluated(f, e.Name), i;
      }
      function c() {
        var g;
        const i = {}, f = T(P);
        let b = !0;
        for (let L = 0; L < _.length; L++) {
          let K = _[L];
          if (K != null && K.$ref && !(0, p.schemaHasRulesButRef)(K, v.self.RULES)) {
            const Q = K.$ref;
            if (K = s.resolveRef.call(v.self, v.schemaEnv.root, v.baseId, Q), K instanceof s.SchemaEnv && (K = K.schema), K === void 0)
              throw new r.default(v.opts.uriResolver, v.baseId, Q);
          }
          const z = (g = K == null ? void 0 : K.properties) === null || g === void 0 ? void 0 : g[y];
          if (typeof z != "object")
            throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${y}"`);
          b = b && (f || T(K)), D(z, L);
        }
        if (!b)
          throw new Error(`discriminator: "${y}" must be required`);
        return i;
        function T({ required: L }) {
          return Array.isArray(L) && L.includes(y);
        }
        function D(L, K) {
          if (L.const)
            F(L.const, K);
          else if (L.enum)
            for (const z of L.enum)
              F(z, K);
          else
            throw new Error(`discriminator: "properties/${y}" must have "const" or "enum"`);
        }
        function F(L, K) {
          if (typeof L != "string" || L in i)
            throw new Error(`discriminator: "${y}" values must be unique strings`);
          i[L] = K;
        }
      }
    }
  };
  return Ct.default = h, Ct;
}
const na = "http://json-schema.org/draft-07/schema#", sa = "http://json-schema.org/draft-07/schema#", aa = "Core schema meta-schema", ia = { schemaArray: { type: "array", minItems: 1, items: { $ref: "#" } }, nonNegativeInteger: { type: "integer", minimum: 0 }, nonNegativeIntegerDefault0: { allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }] }, simpleTypes: { enum: ["array", "boolean", "integer", "null", "number", "object", "string"] }, stringArray: { type: "array", items: { type: "string" }, uniqueItems: !0, default: [] } }, oa = ["object", "boolean"], ca = { $id: { type: "string", format: "uri-reference" }, $schema: { type: "string", format: "uri" }, $ref: { type: "string", format: "uri-reference" }, $comment: { type: "string" }, title: { type: "string" }, description: { type: "string" }, default: !0, readOnly: { type: "boolean", default: !1 }, examples: { type: "array", items: !0 }, multipleOf: { type: "number", exclusiveMinimum: 0 }, maximum: { type: "number" }, exclusiveMaximum: { type: "number" }, minimum: { type: "number" }, exclusiveMinimum: { type: "number" }, maxLength: { $ref: "#/definitions/nonNegativeInteger" }, minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" }, pattern: { type: "string", format: "regex" }, additionalItems: { $ref: "#" }, items: { anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }], default: !0 }, maxItems: { $ref: "#/definitions/nonNegativeInteger" }, minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" }, uniqueItems: { type: "boolean", default: !1 }, contains: { $ref: "#" }, maxProperties: { $ref: "#/definitions/nonNegativeInteger" }, minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" }, required: { $ref: "#/definitions/stringArray" }, additionalProperties: { $ref: "#" }, definitions: { type: "object", additionalProperties: { $ref: "#" }, default: {} }, properties: { type: "object", additionalProperties: { $ref: "#" }, default: {} }, patternProperties: { type: "object", additionalProperties: { $ref: "#" }, propertyNames: { format: "regex" }, default: {} }, dependencies: { type: "object", additionalProperties: { anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }] } }, propertyNames: { $ref: "#" }, const: !0, enum: { type: "array", items: !0, minItems: 1, uniqueItems: !0 }, type: { anyOf: [{ $ref: "#/definitions/simpleTypes" }, { type: "array", items: { $ref: "#/definitions/simpleTypes" }, minItems: 1, uniqueItems: !0 }] }, format: { type: "string" }, contentMediaType: { type: "string" }, contentEncoding: { type: "string" }, if: { $ref: "#" }, then: { $ref: "#" }, else: { $ref: "#" }, allOf: { $ref: "#/definitions/schemaArray" }, anyOf: { $ref: "#/definitions/schemaArray" }, oneOf: { $ref: "#/definitions/schemaArray" }, not: { $ref: "#" } }, ua = {
  $schema: na,
  $id: sa,
  title: aa,
  definitions: ia,
  type: oa,
  properties: ca,
  default: !0
};
var Rn;
function la() {
  return Rn || (Rn = 1, (function(e, t) {
    Object.defineProperty(t, "__esModule", { value: !0 }), t.MissingRefError = t.ValidationError = t.CodeGen = t.Name = t.nil = t.stringify = t.str = t._ = t.KeywordCxt = t.Ajv = void 0;
    const s = /* @__PURE__ */ ws(), r = /* @__PURE__ */ ea(), p = /* @__PURE__ */ ra(), a = ua, h = ["/properties"], d = "http://json-schema.org/draft-07/schema";
    class m extends s.default {
      _addVocabularies() {
        super._addVocabularies(), r.default.forEach((y) => this.addVocabulary(y)), this.opts.discriminator && this.addKeyword(p.default);
      }
      _addDefaultMetaSchema() {
        if (super._addDefaultMetaSchema(), !this.opts.meta)
          return;
        const y = this.opts.$data ? this.$dataMetaSchema(a, h) : a;
        this.addMetaSchema(y, d, !1), this.refs["http://json-schema.org/schema"] = d;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(d) ? d : void 0);
      }
    }
    t.Ajv = m, e.exports = t = m, e.exports.Ajv = m, Object.defineProperty(t, "__esModule", { value: !0 }), t.default = m;
    var w = /* @__PURE__ */ Gt();
    Object.defineProperty(t, "KeywordCxt", { enumerable: !0, get: function() {
      return w.KeywordCxt;
    } });
    var $ = /* @__PURE__ */ Y();
    Object.defineProperty(t, "_", { enumerable: !0, get: function() {
      return $._;
    } }), Object.defineProperty(t, "str", { enumerable: !0, get: function() {
      return $.str;
    } }), Object.defineProperty(t, "stringify", { enumerable: !0, get: function() {
      return $.stringify;
    } }), Object.defineProperty(t, "nil", { enumerable: !0, get: function() {
      return $.nil;
    } }), Object.defineProperty(t, "Name", { enumerable: !0, get: function() {
      return $.Name;
    } }), Object.defineProperty(t, "CodeGen", { enumerable: !0, get: function() {
      return $.CodeGen;
    } });
    var P = /* @__PURE__ */ sr();
    Object.defineProperty(t, "ValidationError", { enumerable: !0, get: function() {
      return P.default;
    } });
    var v = /* @__PURE__ */ Ut();
    Object.defineProperty(t, "MissingRefError", { enumerable: !0, get: function() {
      return v.default;
    } });
  })(Ze, Ze.exports)), Ze.exports;
}
var da = /* @__PURE__ */ la();
const fa = /* @__PURE__ */ as(da), ha = {
  // Bridge API schemas
  "bridge:send": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "bridge:send",
    type: "object",
    properties: {
      method: {
        type: "string",
        pattern: "^[a-zA-Z0-9_.]+$",
        maxLength: 255
      },
      params: {
        type: "object",
        additionalProperties: !0
      }
    },
    required: ["method", "params"],
    additionalProperties: !1
  },
  // Engine API schemas
  "engine:runProcess": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "engine:runProcess",
    type: "object",
    properties: {
      source: {
        type: "string",
        maxLength: 1048576
        // 1MB limit
      },
      name: {
        type: "string",
        minLength: 1,
        maxLength: 255
      },
      sourcemap: {
        type: "object",
        additionalProperties: { type: "string" }
      }
    },
    required: ["source"],
    additionalProperties: !1
  },
  "engine:runFile": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "engine:runFile",
    type: "object",
    properties: {
      path: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["path"],
    additionalProperties: !1
  },
  "engine:stopProcess": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "engine:stopProcess",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "engine:pauseProcess": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "engine:pauseProcess",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "engine:resumeProcess": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "engine:resumeProcess",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "engine:getCapabilities": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "engine:getCapabilities",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "engine:getActivities": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "engine:getActivities",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  // Debugger API schemas
  "debugger:setBreakpoint": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:setBreakpoint",
    type: "object",
    properties: {
      file: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      },
      line: {
        type: "integer",
        minimum: 1,
        maximum: 2147483647
      },
      condition: {
        type: "string",
        maxLength: 255
      }
    },
    required: ["file", "line"],
    additionalProperties: !1
  },
  "debugger:removeBreakpoint": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:removeBreakpoint",
    type: "object",
    properties: {
      id: {
        type: "string",
        minLength: 1,
        maxLength: 255
      }
    },
    required: ["id"],
    additionalProperties: !1
  },
  "debugger:toggleBreakpoint": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:toggleBreakpoint",
    type: "object",
    properties: {
      id: {
        type: "string",
        minLength: 1,
        maxLength: 255
      }
    },
    required: ["id"],
    additionalProperties: !1
  },
  "debugger:getBreakpoints": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:getBreakpoints",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "debugger:stepOver": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:stepOver",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "debugger:stepInto": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:stepInto",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "debugger:stepOut": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:stepOut",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "debugger:continue": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:continue",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "debugger:getVariables": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:getVariables",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  "debugger:getCallStack": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "debugger:getCallStack",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: !1
  },
  // File System API schemas
  "fs:pathExists": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:pathExists",
    type: "object",
    properties: {
      path: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["path"],
    additionalProperties: !1
  },
  "fs:readDir": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:readDir",
    type: "object",
    properties: {
      dirPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["dirPath"],
    additionalProperties: !1
  },
  "fs:readFile": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:readFile",
    type: "object",
    properties: {
      filePath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["filePath"],
    additionalProperties: !1
  },
  "fs:writeFile": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:writeFile",
    type: "object",
    properties: {
      filePath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      },
      content: {
        type: "string",
        maxLength: 1048576
        // 1MB limit
      }
    },
    required: ["filePath", "content"],
    additionalProperties: !1
  },
  "fs:createDir": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:createDir",
    type: "object",
    properties: {
      dirPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["dirPath"],
    additionalProperties: !1
  },
  "fs:delete": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:delete",
    type: "object",
    properties: {
      targetPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      },
      recursive: {
        type: "boolean"
      }
    },
    required: ["targetPath"],
    additionalProperties: !1
  },
  "fs:rename": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:rename",
    type: "object",
    properties: {
      oldPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      },
      newPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["oldPath", "newPath"],
    additionalProperties: !1
  },
  "fs:copy": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:copy",
    type: "object",
    properties: {
      source: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      },
      destination: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["source", "destination"],
    additionalProperties: !1
  },
  "fs:openWithSystem": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:openWithSystem",
    type: "object",
    properties: {
      filePath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["filePath"],
    additionalProperties: !1
  },
  "fs:showInFolder": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:showInFolder",
    type: "object",
    properties: {
      filePath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["filePath"],
    additionalProperties: !1
  },
  "fs:getFileInfo": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:getFileInfo",
    type: "object",
    properties: {
      filePath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["filePath"],
    additionalProperties: !1
  },
  "fs:watchDir": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:watchDir",
    type: "object",
    properties: {
      dirPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["dirPath"],
    additionalProperties: !1
  },
  "fs:unwatchDir": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:unwatchDir",
    type: "object",
    properties: {
      dirPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["dirPath"],
    additionalProperties: !1
  },
  "fs:setProjectRoot": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fs:setProjectRoot",
    type: "object",
    properties: {
      rootPath: {
        type: "string",
        minLength: 1,
        maxLength: 1024
      }
    },
    required: ["rootPath"],
    additionalProperties: !1
  },
  "dialog:showOpen": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "dialog:showOpen",
    type: "object",
    properties: {
      title: { type: "string", maxLength: 255 },
      defaultPath: { type: "string", maxLength: 1024 },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", maxLength: 100 },
            extensions: { type: "array", items: { type: "string" } }
          },
          required: ["name", "extensions"]
        }
      },
      properties: {
        type: "array",
        items: { type: "string" }
      }
    },
    additionalProperties: !1
  },
  "dialog:showSave": {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "dialog:showSave",
    type: "object",
    properties: {
      title: { type: "string", maxLength: 255 },
      defaultPath: { type: "string", maxLength: 1024 },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", maxLength: 100 },
            extensions: { type: "array", items: { type: "string" } }
          },
          required: ["name", "extensions"]
        }
      }
    },
    additionalProperties: !1
  }
}, pa = new fa({ allErrors: !1, strict: !1 });
let zn = null;
const Kn = /* @__PURE__ */ new Map();
for (const [e, t] of Object.entries(ha))
  try {
    Kn.set(e, pa.compile(t));
  } catch (s) {
    console.error(`Failed to compile schema ${e}:`, s);
  }
function ne(e, t, s) {
  var p;
  if (!e || !e.sender)
    throw new Error("Invalid IPC event");
  const r = Kn.get(t);
  if (!r)
    throw console.error(`[IPC Security] No schema registered for channel "${t}" — request blocked`), new Error(`[IPC Security] No schema registered for channel "${t}" — request blocked`);
  if (!r(s)) {
    const a = ((p = r.errors) == null ? void 0 : p.map((h) => `${h.instancePath} ${h.message}`).join(", ")) || "Unknown validation error";
    throw new Error(`Invalid IPC payload for ${t}: ${a}`);
  }
}
function Te(e, t) {
  if (typeof e != "string")
    throw new Error(`Invalid IPC payload: ${t} must be a string`);
  if (e.includes("\0") || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(e))
    throw new Error(`Invalid IPC payload: ${t} contains invalid characters`);
}
function ce(e, t, s = null) {
  if (typeof e != "string")
    throw new Error(`Invalid IPC payload: ${t} must be a string`);
  if (e.includes("\0") || /[\x00-\x1F]/.test(e))
    throw new Error(`Invalid IPC payload: ${t} contains invalid characters`);
  const r = Se.resolve(e), p = Se.resolve(process.cwd()), a = s ? Se.resolve(s) : p;
  if (!r.startsWith(a + Se.sep) && r !== a && !r.startsWith(p + Se.sep) && r !== p)
    throw new Error(`Invalid IPC payload: ${t} is outside the allowed project directory`);
  if ([".ssh", ".aws", ".gnupg", ".rpaforge", ".config" + Se.sep + "gh"].some((d) => r.includes(Se.sep + d + Se.sep) || r.endsWith(Se.sep + d)))
    throw new Error(`Invalid IPC payload: ${t} accesses a restricted path`);
}
function ma(e) {
  zn = e;
}
function le() {
  return zn;
}
function ga(e) {
  if (typeof e != "string")
    throw new Error("Invalid IPC payload: method name must be a string");
  if (!/^[a-zA-Z0-9_.]+$/.test(e))
    throw new Error("Invalid IPC payload: method name contains invalid characters");
}
let fe = null, C = null;
const je = /* @__PURE__ */ new Map();
let At = null;
const Me = /* @__PURE__ */ new Map(), nr = process.env.NODE_ENV === "development" || !Fe.isPackaged, Ae = An("electron-main"), ya = 100, Be = ye.join(Fe.getPath("userData"), "logs"), Ye = ye.join(Be, "app.log"), _a = 5 * 1024 * 1024, va = 5, We = [], $a = 100;
async function wa() {
  try {
    await de.mkdir(Be, { recursive: !0 });
  } catch {
  }
}
async function Ea(e) {
  try {
    await wa();
    const t = JSON.stringify(e) + `
`, s = await de.stat(Ye).catch(() => null);
    s && s.size >= _a && await ba(), await de.appendFile(Ye, t, "utf-8");
  } catch {
  }
}
async function ba() {
  try {
    for (let t = va - 1; t >= 1; t--) {
      const s = ye.join(Be, `app.${t}.log`), r = ye.join(Be, `app.${t + 1}.log`);
      try {
        await de.rename(s, r);
      } catch {
      }
    }
    const e = ye.join(Be, "app.1.log");
    try {
      await de.rename(Ye, e);
    } catch {
    }
  } catch {
  }
}
async function Wn(e) {
  try {
    let r = (await de.readFile(Ye, "utf-8")).split(`
`).filter(Boolean).map((p) => JSON.parse(p));
    return e != null && e.level && (r = r.filter((p) => p.level === e.level)), e != null && e.scope && (r = r.filter((p) => p.scope === e.scope)), r;
  } catch {
    return [];
  }
}
async function Sa() {
  try {
    const e = await Wn();
    return JSON.stringify(e, null, 2);
  } catch {
    return "[]";
  }
}
function Je(e, t, s) {
  const r = `${e}:${s}`, p = Me.get(r);
  p && clearTimeout(p);
  const a = setTimeout(() => {
    fe && !fe.isDestroyed() && fe.webContents.send(e, t), Me.delete(r);
  }, ya);
  Me.set(r, a);
}
function Pa() {
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    state: "stopped",
    isOperational: !1,
    maxReconnectAttempts: 0,
    consecutiveHeartbeatFailures: 0,
    fatal: !1
  };
}
function In() {
  let e;
  nr ? e = ye.join(process.cwd(), "dist-electron", "electron", "preload.js") : e = ye.join(__dirname, "preload.js"), fe = new Cn({
    width: Ee.window.width,
    height: Ee.window.height,
    minWidth: Ee.window.minWidth,
    minHeight: Ee.window.minHeight,
    webPreferences: {
      preload: e,
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    title: "RPAForge Studio",
    autoHideMenuBar: !0
  });
  const t = nr ? [
    "default-src 'self' http://localhost:* ws://localhost:*",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* ws://localhost:* https://cdn.jsdelivr.net",
    "frame-ancestors 'none'"
  ].join("; ") : [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' http://localhost:* ws://localhost:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
  if (fe.webContents.session.webRequest.onHeadersReceived((s, r) => {
    r({
      responseHeaders: {
        ...s.responseHeaders,
        "Content-Security-Policy": [t]
      }
    });
  }), nr) {
    const s = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
    fe.loadURL(s), fe.webContents.openDevTools();
  } else
    fe.loadFile(ye.join(__dirname, "..", "dist", "index.html"));
  fe.on("closed", () => {
    fe = null;
  });
}
async function Ra() {
  C = new ss(), At && (At(), At = null), At = C.onEvent("*", (e) => {
    fe && !fe.isDestroyed() && (Ae.debug(`Forwarding event to renderer: ${e.type}`, e), fe.webContents.send(H.BRIDGE_EVENT, e));
  });
  try {
    await C.start(), Ae.info("Python bridge initialized");
  } catch (e) {
    Ae.error("Failed to start Python bridge", e);
  }
}
function Ia() {
  W.handle(H.BRIDGE_IS_READY, () => (C == null ? void 0 : C.isReady()) ?? !1), W.handle(H.BRIDGE_GET_STATE, () => (C == null ? void 0 : C.state) ?? "stopped"), W.handle(H.BRIDGE_GET_STATUS, () => (C == null ? void 0 : C.getStatus()) ?? Pa()), W.handle(H.BRIDGE_SEND, async (e, t, s) => {
    if (ga(t), ne(e, "bridge:send", { method: t, params: s }), !(C != null && C.isOperational()))
      throw new Error(`Python bridge not operational (state: ${(C == null ? void 0 : C.state) ?? "null"})`);
    return C.sendRequest(t, s);
  }), W.handle(H.ENGINE_PING, async () => C == null ? void 0 : C.sendRequest("ping", {})), W.handle(H.ENGINE_GET_CAPABILITIES, async () => C == null ? void 0 : C.sendRequest("getCapabilities", {})), W.handle(H.ENGINE_RUN_PROCESS, async (e, t, s, r) => (Te(t, "source"), s && Te(s, "name"), ne(e, "engine:runProcess", { source: t, name: s, sourcemap: r }), C == null ? void 0 : C.sendRequest("runProcess", { source: t, name: s, sourcemap: r }))), W.handle(H.ENGINE_RUN_FILE, async (e, t) => (ce(t, "filePath"), ne(e, "engine:runFile", { path: t }), C == null ? void 0 : C.sendRequest("runFile", { path: t }))), W.handle(H.ENGINE_STOP_PROCESS, async () => C == null ? void 0 : C.sendRequest("stopProcess", {})), W.handle(H.ENGINE_PAUSE_PROCESS, async () => C == null ? void 0 : C.sendRequest("pauseProcess", {})), W.handle(H.ENGINE_RESUME_PROCESS, async () => C == null ? void 0 : C.sendRequest("resumeProcess", {})), W.handle(H.ENGINE_GET_ACTIVITIES, async () => C == null ? void 0 : C.sendRequest("getActivities", {})), W.handle(H.DEBUGGER_SET_BREAKPOINT, async (e, t, s, r) => (ce(t, "file"), ne(e, "debugger:setBreakpoint", { file: t, line: s, condition: r }), C == null ? void 0 : C.sendRequest("setBreakpoint", { file: t, line: s, condition: r }))), W.handle(H.DEBUGGER_REMOVE_BREAKPOINT, async (e, t) => (Te(t, "id"), ne(e, "debugger:removeBreakpoint", { id: t }), C == null ? void 0 : C.sendRequest("removeBreakpoint", { id: t }))), W.handle(H.DEBUGGER_TOGGLE_BREAKPOINT, async (e, t) => (Te(t, "id"), ne(e, "debugger:toggleBreakpoint", { id: t }), C == null ? void 0 : C.sendRequest("toggleBreakpoint", { id: t }))), W.handle(H.DEBUGGER_GET_BREAKPOINTS, async () => C == null ? void 0 : C.sendRequest("getBreakpoints", {})), W.handle(H.DEBUGGER_STEP_OVER, async () => C == null ? void 0 : C.sendRequest("stepOver", {})), W.handle(H.DEBUGGER_STEP_INTO, async () => C == null ? void 0 : C.sendRequest("stepInto", {})), W.handle(H.DEBUGGER_STEP_OUT, async () => C == null ? void 0 : C.sendRequest("stepOut", {})), W.handle(H.DEBUGGER_CONTINUE, async () => C == null ? void 0 : C.sendRequest("continue", {})), W.handle(H.DEBUGGER_GET_VARIABLES, async () => C == null ? void 0 : C.sendRequest("getVariables", {})), W.handle(H.DEBUGGER_GET_CALL_STACK, async () => C == null ? void 0 : C.sendRequest("getCallStack", {})), W.handle(H.DIALOG_SHOW_OPEN, async (e, t) => {
    ne(e, "dialog:showOpen", t);
    const s = await ur.showOpenDialog(fe, {
      title: t.title,
      defaultPath: t.defaultPath,
      filters: t.filters,
      properties: t.properties
    });
    return { canceled: s.canceled, filePaths: s.filePaths };
  }), W.handle(H.DIALOG_SHOW_SAVE, async (e, t) => {
    ne(e, "dialog:showSave", t);
    const s = await ur.showSaveDialog(fe, {
      title: t.title,
      defaultPath: t.defaultPath,
      filters: t.filters
    });
    return { canceled: s.canceled, filePath: s.filePath };
  }), W.handle(H.EDITOR_FORMAT_CODE, async (e, t) => (Te(t, "code"), C == null ? void 0 : C.sendRequest("formatCode", { code: t }))), W.handle(H.EDITOR_VALIDATE_CODE, async (e, t) => (Te(t, "code"), C == null ? void 0 : C.sendRequest("validateCode", { code: t }))), W.handle(H.FS_SET_PROJECT_ROOT, async (e, t) => {
    ma(t), Ae.info(`Project root set to: ${t}`);
  }), W.handle(H.FS_PATH_EXISTS, async (e, t) => (ce(t, "filePath", le()), Xn.existsSync(t))), W.handle(H.FS_READ_DIR, async (e, t) => (ce(t, "dirPath", le()), ne(e, "fs:readDir", { dirPath: t }), (await de.readdir(t, { withFileTypes: !0 })).map((r) => ({
    name: r.name,
    path: ye.join(t, r.name),
    isDirectory: r.isDirectory(),
    isFile: r.isFile(),
    extension: r.isFile() ? ye.extname(r.name) : ""
  })))), W.handle(H.FS_READ_FILE, async (e, t) => (ce(t, "filePath", le()), ne(e, "fs:readFile", { filePath: t }), de.readFile(t, "utf-8"))), W.handle(H.FS_WRITE_FILE, async (e, t, s) => {
    ce(t, "filePath", le()), Te(s, "content"), ne(e, "fs:writeFile", { filePath: t, content: s }), Te(s, "content"), await de.writeFile(t, s, "utf-8");
  }), W.handle(H.FS_CREATE_DIR, async (e, t) => {
    ce(t, "dirPath", le()), ne(e, "fs:createDir", { dirPath: t }), await de.mkdir(t, { recursive: !0 });
  }), W.handle(H.FS_DELETE, async (e, t, s = !1) => {
    ce(t, "targetPath", le()), ne(e, "fs:delete", { targetPath: t, recursive: s }), await de.rm(t, { recursive: s, force: !0 });
  }), W.handle(H.FS_RENAME, async (e, t, s) => {
    ce(t, "oldPath", le()), ce(s, "newPath", le()), ne(e, "fs:rename", { oldPath: t, newPath: s }), await de.rename(t, s);
  }), W.handle(H.FS_COPY, async (e, t, s) => {
    ce(t, "source", le()), ce(s, "destination", le()), ne(e, "fs:copy", { source: t, destination: s }), await de.cp(t, s, { recursive: !0 });
  }), W.handle(H.FS_OPEN_WITH_SYSTEM, async (e, t) => {
    ce(t, "filePath", le()), ne(e, "fs:openWithSystem", { filePath: t }), await lr.openPath(t);
  }), W.handle(H.FS_SHOW_IN_FOLDER, async (e, t) => {
    ce(t, "filePath", le()), ne(e, "fs:showInFolder", { filePath: t }), lr.showItemInFolder(t);
  }), W.handle(H.FS_GET_FILE_INFO, async (e, t) => {
    ce(t, "filePath", le()), ne(e, "fs:getFileInfo", { filePath: t });
    const s = await de.stat(t), r = ye.basename(t);
    return {
      name: r,
      path: t,
      isDirectory: s.isDirectory(),
      isFile: s.isFile(),
      extension: s.isFile() ? ye.extname(r) : "",
      size: s.size,
      modifiedAt: s.mtime.toISOString()
    };
  }), W.handle(H.FS_WATCH_DIR, async (e, t) => {
    if (ce(t, "dirPath", le()), ne(e, "fs:watchDir", { dirPath: t }), je.has(t))
      return;
    const s = Qn.watch(t, {
      ignored: /(^|[\\/])\../,
      ignoreInitial: !0,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });
    s.on("add", (r) => {
      Je(H.FS_EVENT, {
        type: "add",
        path: r
      }, `add:${r}`);
    }), s.on("addDir", (r) => {
      Je(H.FS_EVENT, {
        type: "addDir",
        path: r
      }, `addDir:${r}`);
    }), s.on("change", (r) => {
      Je(H.FS_EVENT, {
        type: "change",
        path: r
      }, `change:${r}`);
    }), s.on("unlink", (r) => {
      Je(H.FS_EVENT, {
        type: "unlink",
        path: r
      }, `unlink:${r}`);
    }), s.on("unlinkDir", (r) => {
      Je(H.FS_EVENT, {
        type: "unlinkDir",
        path: r
      }, `unlinkDir:${r}`);
    }), s.on("error", (r) => {
      Ae.error(`Watcher error for ${t}:`, r);
    }), je.set(t, s), Ae.info(`Started watching directory: ${t}`);
  }), W.handle(H.FS_UNWATCH_DIR, async (e, t) => {
    ce(t, "dirPath", le()), ne(e, "fs:unwatchDir", { dirPath: t });
    const s = je.get(t);
    s && (await s.close(), je.delete(t), Ae.info(`Stopped watching directory: ${t}`));
  }), W.on(H.LOG_WRITE, async (e, t) => {
    We.push(t), We.length > $a && We.shift(), await Ea(t);
  }), W.handle(H.LOG_GET, async (e, t) => [...We, ...await Wn(t)]), W.handle(H.LOG_EXPORT, async () => Sa()), W.handle(H.LOG_CLEAR, async () => {
    We.length = 0;
    try {
      await de.unlink(Ye).catch(() => {
      });
    } catch {
    }
  });
}
Fe.whenReady().then(async () => {
  Ia(), await Ra(), In(), Fe.on("activate", () => {
    Cn.getAllWindows().length === 0 && In();
  });
});
Fe.on("window-all-closed", () => {
  C == null || C.stop(), je.forEach((e) => e.close()), je.clear(), Me.forEach((e) => clearTimeout(e)), Me.clear(), process.platform !== "darwin" && Fe.quit();
});
Fe.on("before-quit", () => {
  C == null || C.stop(), je.forEach((e) => e.close()), je.clear(), Me.forEach((e) => clearTimeout(e)), Me.clear();
});
