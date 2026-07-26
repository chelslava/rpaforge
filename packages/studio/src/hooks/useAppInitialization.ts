import { useEffect, useState } from 'react';
import i18n from '../i18n';
import { useDesignerStore } from '../stores/designerStore';
import { useDiagramStore } from '../stores/diagramStore';
import { useFileStore } from '../stores/fileStore';
import { useProcessStore } from '../stores/processStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useVariableStore } from '../stores/variableStore';
import { useUIStore } from '../stores/uiStore';

const BRIDGE_TIMEOUT_MS = 3_000;
const BRIDGE_POLL_MS = 50;

type PersistedStore = {
  persist?: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
};

const PERSISTED_STORES: PersistedStore[] = [
  useDesignerStore,
  useDiagramStore,
  useFileStore,
  useProcessStore,
  useSettingsStore,
  useVariableStore,
];

function waitForStoreHydration(store: PersistedStore): Promise<void> {
  if (!store.persist || store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.persist?.onFinishHydration(() => {
      unsubscribe?.();
      resolve();
    });
  });
}

async function waitForBridge(): Promise<'ready' | 'degraded' | 'skipped'> {
  const bridge = typeof window !== 'undefined' ? window.rpaforge?.bridge : undefined;
  if (!bridge) return 'skipped';

  const deadline = Date.now() + BRIDGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if (await bridge.isReady()) return 'ready';
      if ((await bridge.getState()) === 'ready') return 'ready';
    } catch {
      // The bridge may still be starting. The bounded timeout below handles a stall.
    }
    await new Promise((resolve) => setTimeout(resolve, BRIDGE_POLL_MS));
  }
  return 'degraded';
}

function waitForFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function useAppInitialization() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('i18n');
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAppReady = useUIStore((state) => state.setAppReady);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      setProgress(100);
      setIsInitializing(false);
      setAppReady(true);
    };

    const initialize = async () => {
      setCurrentStep('i18n');
      if (!i18n.isInitialized) {
        await new Promise<void>((resolve) => {
          const unsubscribe = () => {
            i18n.off('initialized', unsubscribe);
            resolve();
          };
          i18n.on('initialized', unsubscribe);
        });
      }
      if (cancelled) return;
      setProgress(20);

      setCurrentStep('stores');
      await Promise.all(PERSISTED_STORES.map(waitForStoreHydration));
      if (cancelled) return;
      setProgress(45);

      setCurrentStep('bridge');
      const bridgeStatus = await waitForBridge();
      if (cancelled) return;
      if (bridgeStatus === 'degraded') {
        setDegraded(true);
        setError('bridge');
      }
      setProgress(80);

      setCurrentStep('components');
      await waitForFirstPaint();
      finish();
    };

    initialize().catch((initializationError) => {
      if (cancelled) return;
      setDegraded(true);
      setError(initializationError instanceof Error ? initializationError.message : 'initialization');
      finish();
    });

    return () => {
      cancelled = true;
    };
  }, [setAppReady]);

  return {
    isInitializing,
    progress,
    currentStep,
    degraded,
    error,
  };
}
