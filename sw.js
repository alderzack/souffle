// Service worker de Souffle : met toute l'app en cache (cache d'abord) pour qu'elle marche hors ligne.
// Penser à changer VERSION à chaque modification des fichiers de l'app.
const VERSION = 'souffle-v7';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js',
  './js/engine.js',
  './js/exercises.js',
  './js/storage.js',
  './js/stats.js',
  './js/colors.js',
  './js/feedback.js',
  './js/dom.js',
  './js/format.js',
  './js/router.js',
  './js/theme.js',
  './js/views/home.js',
  './js/views/session.js',
  './js/views/history.js',
  './js/views/settings.js',
  './js/backgrounds.js',
  './js/backdrop.js',
  './js/ambience.js',
  './js/ambience-data.js',
  './js/voice.js',
  './js/voice-probe.js',
  './js/summary.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './backgrounds/foret.webp',
  './backgrounds/riviere.webp',
  './backgrounds/paysage.webp',
  './backgrounds/cosmos.webp',
  './backgrounds/montagne.webp',
  './backgrounds/sousmarin.webp',
  './backgrounds/plage.webp',
  './backgrounds/aurore.webp',
];

// Voix enregistrées (facultatives) : mises en cache si elles existent, pour marcher aussi hors ligne.
// Racine voice/ (voix de Zack) et un dossier par voix au choix (voice/femme/, voice/homme/).
const VOICE_KEYS = ['accueil', 'inspire', 'retiens', 'expire', 'fin'];
const VOICE_FOLDERS = ['', 'femme/', 'homme/'];
const VOICE_FILES = VOICE_FOLDERS.flatMap((f) => VOICE_KEYS.map((k) => `./voice/${f}${k}.mp3`));

async function cacheVoices(cache) {
  await Promise.all(VOICE_FILES.map(async (url) => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const type = res.headers.get('content-type') || '';
      if (res.ok && res.status === 200 && !/text\/html/i.test(type)) await cache.put(url, res);
    } catch { /* absente ou hors ligne : la synthèse vocale prend le relais */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES).then(() => cacheVoices(cache)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Voix enregistrées : réseau direct (le fichier peut être ajouté à tout moment) ; hors ligne, le cache.
  if (url.pathname.includes('/voice/')) {
    if (self.navigator && self.navigator.onLine === false) {
      event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
    }
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
