(window as unknown as { clearStorage: () => void }).clearStorage = () => {
  localStorage.clear();
  sessionStorage.clear();
};

