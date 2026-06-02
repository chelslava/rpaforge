import { useEffect, useState } from 'react';
import i18n from '../i18n';

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

  useEffect(() => {
    let currentProgress = 0;
    const stepDurations = [500, 800, 600, 900, 300];

    const initializeSteps = async () => {
      for (let i = 0; i < INITIALIZATION_STEPS.length; i++) {
        const step = INITIALIZATION_STEPS[i];
        setCurrentStep(step.name);

        // Simulate step execution
        await new Promise(resolve => setTimeout(resolve, stepDurations[i]));

        currentProgress += step.weight;
        setProgress(Math.min(currentProgress, 99));
      }

      // i18n is ready after initialization steps
      setProgress(100);
      setIsInitializing(false);
    };

    initializeSteps().catch(() => {
      // On error, still hide splash after timeout
      setTimeout(() => {
        setProgress(100);
        setIsInitializing(false);
      }, 2000);
    });
  }, []);

  return {
    isInitializing,
    progress,
    currentStep,
  };
}
