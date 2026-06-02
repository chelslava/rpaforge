import { useCallback, useEffect, useRef, useState } from 'react';
import { Joyride, STATUS, type EventData, type Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';

const steps: Step[] = [
  {
    target: 'body',
    placement: 'center' as const,
    content: 'Welcome to RPAForge! Let\'s take a quick tour of the main features.',
    skipBeacon: true,
  },
  {
    target: '[data-tour="activity-palette"]',
    placement: 'right' as const,
    content: 'Choose from 80+ activities organized by library. Drag activities to the canvas to build your automation.',
  },
  {
    target: '[data-tour="canvas"]',
    placement: 'center' as const,
    content: 'This is the canvas where you build your automation workflow. Connect activities to define the process flow.',
  },
  {
    target: '[data-tour="properties"]',
    placement: 'left' as const,
    content: 'Configure each activity\'s settings here. Click on an activity in the canvas to see its properties.',
  },
  // NOTE: steps targeting the debug toolbar and recorder were removed — those
  // elements are only mounted on demand (paused debug session / open recorder
  // panel), so the tour would hang waiting for targets that don't exist yet.
  {
    target: 'body',
    placement: 'center' as const,
    content: 'You\'re all set! Start building your first process or explore the sample templates.',
    skipBeacon: true,
  },
];

interface OnboardingTourProps {
  /** Callback when tour is completed or skipped */
  onTourEnd?: () => void;
}

export function OnboardingTour({ onTourEnd }: OnboardingTourProps) {
  const { t } = useTranslation('common');
  const tourCompleted = useSettingsStore((state) => state.tourCompleted);
  const setTourCompleted = useSettingsStore((state) => state.setTourCompleted);
  const appReady = useUIStore((state) => state.appReady);
  const [isRunning, setIsRunning] = useState(false);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start the tour only AFTER the app finished loading (splash dismissed),
  // and only on the first run. A short delay lets target elements paint.
  useEffect(() => {
    if (!appReady || tourCompleted) return;
    const startTimeout = setTimeout(() => setIsRunning(true), 500);
    return () => clearTimeout(startTimeout);
  }, [appReady, tourCompleted]);

  const handleJoyrideCallback = useCallback(
    (data: EventData) => {
      const { status } = data;

      // Handle when user clicks "Close" button (tour step)
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        // Use setTimeout to ensure state updates complete before unmount
        cleanupTimeoutRef.current = setTimeout(() => {
          setIsRunning(false);
          setTourCompleted(true);
          onTourEnd?.();
          // Force focus back to document body to clear any focus traps
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          document.body.focus();
        }, 100);
      }
    },
    [setTourCompleted, onTourEnd]
  );

  // Clean up Joyride and any pending timeouts when component unmounts
  useEffect(() => {
    return () => {
      setIsRunning(false);
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, []);

  // Don't render if tour already completed
  if (tourCompleted) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={isRunning}
      continuous
      onEvent={handleJoyrideCallback}
      options={{
        showProgress: true,
        // Defensive: if a target is ever missing, fail the step after 3s
        // instead of hanging the tour indefinitely.
        targetWaitTimeout: 3000,
        buttons: ['back', 'close', 'skip', 'primary'],
        arrowColor: 'var(--color-ui-primary)',
        backgroundColor: 'var(--color-ui-surface)',
        overlayColor: 'var(--color-ui-overlay)',
        primaryColor: 'var(--color-ui-primary)',
        textColor: 'var(--color-ui-text)',
        zIndex: 10000,
        beaconSize: 40,
      }}
      styles={{
        tooltipContainer: {
          textAlign: 'left' as const,
        },
        buttonPrimary: {
          backgroundColor: 'var(--color-ui-primary)',
          color: 'var(--color-ui-text-inverse)',
        },
        buttonBack: {
          color: 'var(--color-ui-primary)',
        },
        buttonSkip: {
          color: 'var(--color-ui-text-muted)',
        },
      }}
      locale={{
        back: t('tour.back', 'Back'),
        close: t('tour.close', 'Close'),
        last: t('tour.done', 'Done'),
        next: t('tour.next', 'Next'),
        skip: t('tour.skip', 'Skip'),
      }}
    />
  );
}

export default OnboardingTour;
