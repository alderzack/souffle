// Application du thème et de la couleur de balle sur le document.

const THEME_COLORS = { light: '#eef4f2', dark: '#0f1b1d' };

export function resolvedTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolvedTheme(theme)]);
}

export function applyBallColor(color) {
  document.documentElement.style.setProperty('--ball', color);
}

export function applySettings(settings) {
  applyTheme(settings.theme);
  applyBallColor(settings.ballColor);
}
