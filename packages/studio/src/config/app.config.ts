/**
 * RPAForge Studio Application Configuration
 *
 * Centralized configuration with environment overrides support.
 */

/**
 * Base configuration values.
 * These can be overridden via window.rpaforgeConfig in production.
 */
const appConfig = {
  /**
   * Autosave configuration
   */
  autosave: {
    /** Enable autosave functionality */
    enabled: true,
    /** Autosave interval in milliseconds */
    intervalMs: 30_000,
    /** Maximum number of backup files to keep */
    maxBackups: 5,
  },

  /**
   * History and editor interaction configuration
   */
  history: {
    /** Maximum number of undo snapshots kept in memory */
    maxSize: 50,
  },

  /**
   * Shell / console configuration
   */
  console: {
    /** Whether the bottom console panel is open by default in designer mode */
    defaultOpen: false,
    /** Maximum number of console lines retained in memory */
    maxLogs: 10_000,
  },

  /**
   * Desktop shell window defaults
   */
  window: {
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
  },

  /**
   * Diagram editor configuration
   */
  diagram: {
    /** Grid size in pixels */
    gridSize: 20,
    /** Snap elements to grid */
    snapToGrid: true,
    /** Minimum zoom level */
    minZoom: 0.1,
    /** Maximum zoom level */
    maxZoom: 2.0,
  },

  /**
   * Python bridge configuration
   */
  bridge: {
    /** Request timeout in milliseconds */
    requestTimeoutMs: 30_000,
    /** Maximum reconnection attempts */
    maxReconnectAttempts: 3,
    /** Base delay between reconnection attempts in milliseconds */
    reconnectDelayMs: 1_000,
    /** Maximum wait time for Python process startup in milliseconds */
    startupTimeoutMs: 5_000,
    /** Heartbeat interval in milliseconds */
    heartbeatIntervalMs: 5_000,
    /** Number of missed heartbeats before reconnecting */
    heartbeatFailureThreshold: 2,
  },

  /**
   * Debugger configuration
   */
  debugger: {
    /** Default timeout for debugger operations */
    defaultTimeoutMs: 30_000,
  },
} as const;

/**
 * Type for runtime configuration overrides.
 * Partial allows overriding any subset of config values.
 */
type ConfigOverrides = {
  autosave?: {
    enabled?: boolean;
    intervalMs?: number;
    maxBackups?: number;
  };
  diagram?: {
    gridSize?: number;
    snapToGrid?: boolean;
    minZoom?: number;
    maxZoom?: number;
  };
  history?: {
    maxSize?: number;
  };
  console?: {
    defaultOpen?: boolean;
    maxLogs?: number;
  };
  window?: {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
  };
  bridge?: {
    requestTimeoutMs?: number;
    maxReconnectAttempts?: number;
    reconnectDelayMs?: number;
    startupTimeoutMs?: number;
    heartbeatIntervalMs?: number;
    heartbeatFailureThreshold?: number;
  };
  debugger?: {
    defaultTimeoutMs?: number;
  };
};

/**
 * Runtime configuration with environment overrides.
 * Allows runtime configuration via window.rpaforgeConfig.
 */
declare global {
  interface Window {
    rpaforgeConfig?: ConfigOverrides;
  }
}

/**
 * Merged configuration with environment overrides.
 */
export const config = {
  autosave: {
    ...appConfig.autosave,
    ...(typeof window !== 'undefined' ? window.rpaforgeConfig?.autosave : undefined),
  },
  history: {
    ...appConfig.history,
    ...(typeof window !== 'undefined' ? window.rpaforgeConfig?.history : undefined),
  },
  console: {
    ...appConfig.console,
    ...(typeof window !== 'undefined' ? window.rpaforgeConfig?.console : undefined),
  },
  window: {
    ...appConfig.window,
    ...(typeof window !== 'undefined' ? window.rpaforgeConfig?.window : undefined),
  },
  diagram: {
    ...appConfig.diagram,
    ...(typeof window !== 'undefined' ? window.rpaforgeConfig?.diagram : undefined),
  },
  bridge: {
    ...appConfig.bridge,
    ...(typeof window !== 'undefined' ? window.rpaforgeConfig?.bridge : undefined),
  },
  debugger: {
    ...appConfig.debugger,
    ...(typeof window !== 'undefined' ? window.rpaforgeConfig?.debugger : undefined),
  },
} as const;

/**
 * Configuration type for type-safe access.
 */
export type AppConfig = typeof config;
