// Point d'entrée : routeur par ancre, thème, service worker.
import { loadSettings } from './storage.js';
import { applySettings } from './theme.js';
import { EXERCISE_IDS } from './exercises.js';
import { setRouteHandler, shownHash, setShownHash } from './router.js';
import * as home from './views/home.js';
import * as session from './views/session.js';
import * as history from './views/history.js';
import * as settingsView from './views/settings.js';

const main = document.getElementById('main');
let cleanup = null;
let first = true;

export function parseRoute(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: 'accueil', view: home };
  if (parts[0] === 'seance' && EXERCISE_IDS.includes(parts[1]) && parts.length === 2) return { name: 'seance', view: session, params: { id: parts[1] } };
  if (parts[0] === 'historique' && parts.length === 1) return { name: 'historique', view: history };
  if (parts[0] === 'reglages' && parts.length === 1) return { name: 'reglages', view: settingsView };
  return null;
}

function route() {
  const hash = location.hash;
  // Écran déjà affiché (par navigate() ou par un événement précédent) : ne pas le recréer.
  if (hash === shownHash()) return;
  const r = parseRoute(hash);
  if (!r) { setShownHash(null); location.replace('#/'); return; }
  setShownHash(hash); // avant mount() : une vue peut elle-même rediriger (location.replace)
  try { cleanup?.(); } catch (e) { console.warn(e); }
  cleanup = null;
  applySettings(loadSettings());
  document.body.dataset.route = r.name;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === r.name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  main.replaceChildren();
  document.title = r.view.title;
  cleanup = r.view.mount(main, r.params || {}) || null;
  if (!first) {
    window.scrollTo(0, 0);
    const heading = main.querySelector('h1');
    heading?.focus({ preventScroll: true });
  }
  first = false;
}

setRouteHandler(route);
window.addEventListener('hashchange', route);
// Retour / avancer entre deux entrées de même ancre (ex. après l'écran de fin, dont l'adresse a été remplacée
// par « #/ ») : pas de hashchange, mais un popstate.
window.addEventListener('popstate', route);
// Lien vers l'ancre déjà dans la barre d'adresse alors qu'un autre écran est affiché (écran de fin) :
// le navigateur ne déclenche rien, on affiche l'écran nous-mêmes.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target instanceof Element ? e.target.closest('a[href^="#/"]') : null;
  if (!a || a.getAttribute('href') !== location.hash || shownHash() === location.hash) return;
  e.preventDefault();
  route();
});
route();

// Le thème « automatique » suit le téléphone en direct.
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applySettings(loadSettings()));
} catch { /* ignoré */ }

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne indisponible : l'app marche quand même */ });
  });
}
