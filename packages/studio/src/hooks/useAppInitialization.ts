import { useEffect, useState } from 'react';
import { useUIStore } from '../stores/uiStore';

interface InitializationStep {
  name: string;
  weight: number;
}

const INITIALIZATION_STEPS: InitializationStep[] = [
  { name: 'i18n', weight: 15 },
  { name: 'stores', weight: 25 },
  { name: 'styles', weight: 20 },
  { name: 'components', weight: 30 },
  { name: 'ready', weight: 10 },
];

export function useAppInitialization() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('i18n');
  const setAppReady = useUIStore((state) => state.setAppReady);

  useEffect(() => {
    let currentProgress = 0;
    const stepDurations = [500, 800, 600, 900, 300];

    const finish = () => {
      setProgress(100);
      setIsInitializing(false);
      // Signals the app is interactive — the onboarding tour starts only now.
      setAppReady(true);
    };

    const initializeSteps = async () => {
      for (let i = 0; i < INITIALIZATION_STEPS.length; i++) {
        const step = INITIALIZATION_STEPS[i];
        setCurrentStep(step.name);

        // Simulate step execution
        await new Promise(resolve => setTimeout(resolve, stepDurations[i]));

        currentProgress += step.weight;
        setProgress(Math.min(currentProgress, 99));
      }

      finish();
    };

    initializeSteps().catch(() => {
      // On error, still hide splash after a short timeout
      setTimeout(finish, 2000);
    });
  }, [setAppReady]);

  return {
    isInitializing,
    progress,
    currentStep,
  };
}
