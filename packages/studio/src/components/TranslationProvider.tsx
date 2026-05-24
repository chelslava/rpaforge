import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface TranslationContextType {
  language: string;
  setLanguage: (lang: string) => void;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider = ({ children }: { children: ReactNode }) => {
  const { i18n: i18nextInstance } = useTranslation();
  const [language, setLanguage] = useState(i18nextInstance.language);

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setLanguage(lng);
    };

    i18nextInstance.on('languageChanged', handleLanguageChanged);
    return () => {
      i18nextInstance.off('languageChanged', handleLanguageChanged);
    };
  }, [i18nextInstance]);

  return (
    <TranslationContext.Provider value={{ language, setLanguage }}>
      {children}
    </TranslationContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTranslationContext = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslationContext must be used within a TranslationProvider');
  }
  return context;
};
