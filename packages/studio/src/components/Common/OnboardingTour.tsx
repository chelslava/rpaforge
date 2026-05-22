import React, { useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';

const steps: Step[] = [
  {
    target: 'body',
    placement: 'center' as const,
    content: 'Welcome to RPAForge! Let\'s take a quick tour of the main features.',
    disableBeacon: true,
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
  {
    target: '[data-tour="debug-toolbar"]',
    placement: 'bottom' as const,
    content: 'Set breakpoints and step through your process to debug issues. Use run, pause, and stop controls.',
  },
  {
    target: '[data-tour="recorder"]',
    placement: 'right' as const,
    content: 'Record your actions to automatically create automations. Perfect for getting started quickly.',
  },
  {
    target: 'body',
    placement: 'center' as const,
    content: 'You\'re all set! Start building your first process or explore the sample templates.',
    disableBeacon: true,
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

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { status, type } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED || type === 'FinishedStatus') {
        setTourCompleted(true);
        onTourEnd?.();
      }
    },
    [setTourCompleted, onTourEnd]
  );

  // Don't render if tour already completed
  if (tourCompleted) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={true}
      continuous
      showSkipButton
      showProgress
      disableScrolling={false}
      spotlightClicks={false}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          arrowColor: '#6366f1',
          backgroundColor: '#ffffff',
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          primaryColor: '#6366f1',
          textColor: '#1f2937',
          zIndex: 10000,
        },
        tooltipContainer: {
          textAlign: 'left' as const,
        },
        buttonNext: {
          backgroundColor: '#6366f1',
          color: '#ffffff',
        },
        buttonBack: {
          color: '#6366f1',
        },
        buttonSkip: {
          color: '#6b7280',
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
