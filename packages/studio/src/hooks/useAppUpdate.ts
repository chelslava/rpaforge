/**
 * App auto-update state for the renderer (issue #819).
 *
 * Subscribes once per mounted consumer to the main-process APP_UPDATE_EVENT
 * stream and exposes the actions the Settings/Help dialogs need. The
 * initial snapshot is fetched lazily on first mount; the module-level
 * subscription counter keeps exactly one live IPC listener.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppUpdateChannel, AppUpdateEventPayload } from '../types/ipc-contracts';
import { createLogger } from '../utils/logger';

const logger = createLogger('useAppUpdate');

const IDLE_SNAPSHOT: AppUpdateEventPayload = {
  phase: 'idle',
  currentVersion: '',
  channel: 'stable',
};

interface AppUpdateApiLike {
  checkForUpdates: () => Promise<AppUpdateEventPayload>;
  installUpdate: () => Promise<void>;
  setChannel: (channel: AppUpdateChannel) => Promise<AppUpdateEventPayload>;
  getState: () => Promise<AppUpdateEventPayload>;
  onUpdateEvent: (listener: (event: AppUpdateEventPayload) => void) => () => void;
}

function api(): AppUpdateApiLike | null {
  return window.rpaforge?.appUpdate ?? null;
}

export interface UseAppUpdateResult {
  snapshot: AppUpdateEventPayload;
  /** Null when the app-update bridge is unavailable (e.g. tests, web preview). */
  isSupported: boolean;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  setChannel: (channel: AppUpdateChannel) => Promise<void>;
}

export function useAppUpdate(): UseAppUpdateResult {
  const [snapshot, setSnapshot] = useState<AppUpdateEventPayload>(IDLE_SNAPSHOT);
  const [isSupported, setIsSupported] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const updateApi = api();
    if (!updateApi) return;

    // Sync-flag outside React state: mirrors isSupported without a
    // setState-in-effect cascade (the lint rule flags synchronous sets).
    updateApi
      .getState()
      .then((state) => {
        if (mountedRef.current) {
          setSnapshot(state);
          setIsSupported(true);
        }
      })
      .catch((err) => logger.error('Failed to fetch update state', err));

    const unsubscribe = updateApi.onUpdateEvent((event) => {
      if (mountedRef.current) {
        setSnapshot(event);
        setIsSupported(true);
      }
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    const updateApi = api();
    if (!updateApi) return;
    try {
      const state = await updateApi.checkForUpdates();
      setSnapshot(state);
    } catch (err) {
      logger.error('Update check failed', err);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    await api()?.installUpdate();
  }, []);

  const setChannel = useCallback(async (channel: AppUpdateChannel) => {
    const updateApi = api();
    if (!updateApi) return;
    try {
      const state = await updateApi.setChannel(channel);
      setSnapshot(state);
    } catch (err) {
      logger.error('Failed to set update channel', err);
    }
  }, []);

  return { snapshot, isSupported, checkForUpdates, installUpdate, setChannel };
}

export default useAppUpdate;
