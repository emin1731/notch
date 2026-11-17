// Applies the saved theme (light | dark | system) before the app loads, so there's no flash.
// Keep in sync with src/app/ThemeProvider.tsx.
(function () {
  var choice = 'system';
  try {
    choice = localStorage.getItem('notch-theme') || 'system';
  } catch {
    // Storage blocked (private mode): follow the system.
  }
  var dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
