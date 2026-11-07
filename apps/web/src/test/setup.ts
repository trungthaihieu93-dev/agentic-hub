import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { toast } from 'sonner';
import { initializeTheme } from './helpers';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.head.insertAdjacentHTML('beforeend', '<meta name="color-scheme" content="light">');
  initializeTheme();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  window.__AH_THEME__.setTheme('light');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  Reflect.deleteProperty(window, '__AH_THEME__');
  document.documentElement.classList.remove('dark');
  document.querySelector('meta[name="color-scheme"]')?.remove();
});

// jsdom lacks these; Radix and sonner touch them.
class ResizeObserverStub {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => undefined;
