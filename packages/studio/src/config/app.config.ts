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
  bridge?: {
    requestTimeoutMs?: number;
    maxReconnectAttempts?: number;
    reconnectDelayMs?: number;
    startupTimeoutMs?: number;
    heartbeatIntervalMs?: number;
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
    ...window.rpaforgeConfig?.autosave,
  },
  diagram: {
    ...appConfig.diagram,
    ...window.rpaforgeConfig?.diagram,
  },
  bridge: {
    ...appConfig.bridge,
    ...window.rpaforgeConfig?.bridge,
  },
  debugger: {
    ...appConfig.debugger,
    ...window.rpaforgeConfig?.debugger,
  },
} as const;

/**
 * Configuration type for type-safe access.
 */
export type AppConfig = typeof config;
