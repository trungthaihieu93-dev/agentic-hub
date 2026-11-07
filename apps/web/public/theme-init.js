(function () {
  let preference = null;
  try {
    const saved = window.localStorage.getItem('ah-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {
    // A browser may deny storage while still allowing an in-memory choice.
  }

  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  let theme = preference || (media && media.matches ? 'dark' : 'light');
  const listeners = new Set();

  function apply() {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', theme);
  }

  function update(next) {
    if (theme === next) return;
    theme = next;
    apply();
    listeners.forEach(function (listener) { listener(); });
  }

  function onSystemChange(event) {
    if (preference === null) update(event.matches ? 'dark' : 'light');
  }

  if (preference === null && media) media.addEventListener('change', onSystemChange);
  apply();

  window.__AH_THEME__ = {
    getTheme: function () { return theme; },
    subscribe: function (listener) {
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    },
    setTheme: function (next) {
      if (next !== 'light' && next !== 'dark') return;
      preference = next;
      if (media) media.removeEventListener('change', onSystemChange);
      try {
        window.localStorage.setItem('ah-theme', next);
      } catch {
        // Keep the explicit choice for this page even when persistence fails.
      }
      update(next);
    },
  };
}());
