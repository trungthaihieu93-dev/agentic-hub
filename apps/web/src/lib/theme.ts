import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeController {
  getTheme: () => Theme;
  subscribe: (listener: () => void) => () => void;
  setTheme: (theme: Theme) => void;
}

declare global {
  interface Window {
    __AH_THEME__: ThemeController;
  }
}

/** The parser-blocking public bootstrap owns theme resolution and root updates. */
export function useTheme(): Theme {
  const controller = window.__AH_THEME__;
  return useSyncExternalStore(controller.subscribe, controller.getTheme, controller.getTheme);
}

export function setTheme(theme: Theme): void {
  window.__AH_THEME__.setTheme(theme);
}
