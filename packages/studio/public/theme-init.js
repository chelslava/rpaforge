(() => {
  try {
    const rawSettings = localStorage.getItem('rpaforge-settings');
    const settings = rawSettings ? JSON.parse(rawSettings) : null;
    const theme = settings?.state?.theme ?? 'system';
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const resolvedTheme = theme === 'dark' || (theme === 'system' && prefersDark) ? 'dark' : 'light';
    const root = document.documentElement;

    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  } catch {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();
