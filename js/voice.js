// Voix qui guide. Pour chaque annonce (clé), dans l'ordre : enregistrement de la voix choisie
// app/voice/<femme|homme>/<cle>.mp3, sinon app/voice/<cle>.mp3 (voix de Zack), sinon synthèse vocale.
//
// Règles : une annonce remplace toujours la précédente (cancel() avant chaque annonce, jamais de file
// d'attente qui prend du retard) ; silence() coupe tout (pause, arrêt). Rien ne lève jamais d'erreur.
//
// Détection des enregistrements : requêtes HEAD faites depuis un petit worker (un fichier absent ne laisse
// ainsi aucune erreur dans la console de la page), résultat gardé en mémoire. Hors ligne : cache de l'app.

export const VOICE_KEYS = Object.freeze(['accueil', 'inspire', 'retiens', 'expire', 'fin']);

export const PHRASES = Object.freeze({
  accueil: 'Installe-toi confortablement. On commence.',
  inspire: 'Inspire',
  retiens: 'Retiens',
  expire: 'Expire',
  fin: 'C’est terminé. Prends un moment pour revenir doucement.',
});

/** Clé d'annonce pour un type de phase du moteur. */
export const PHASE_KEYS = Object.freeze({ inspire: 'inspire', holdIn: 'retiens', expire: 'expire', holdOut: 'retiens' });

export const LANG = 'fr-FR';
export const RATE = 0.9;
export const PITCH = 1;

/** Voix enregistrées au choix (dossiers app/voice/<id>/). */
export const VOICE_CHOICES = Object.freeze([
  Object.freeze({ id: 'femme', name: 'Voix de femme' }),
  Object.freeze({ id: 'homme', name: 'Voix d’homme' }),
]);
export const VOICE_CHOICE_IDS = Object.freeze(VOICE_CHOICES.map((v) => v.id));
export const DEFAULT_VOICE_CHOICE = 'femme';

/** Nom affiché d'un choix de voix (« Voix de femme » par défaut). */
export function voiceChoiceName(id) {
  return (VOICE_CHOICES.find((v) => v.id === id) || VOICE_CHOICES[0]).name;
}

// Dossiers sondés : '' = racine voice/ (voix de Zack), puis un par choix.
const FOLDERS = Object.freeze(['', ...VOICE_CHOICE_IDS]);
const voiceUrl = (key, folder = '') => new URL(`voice/${folder ? `${folder}/` : ''}${key}.mp3`, document.baseURI).href;

/**
 * Adresse à jouer pour `key` selon le choix et les fichiers trouvés (logique pure) :
 * dossier choisi → racine → null (synthèse). `found` : { '': Set, femme: Set, homme: Set }.
 */
export function resolveVoiceFile(key, choice, found) {
  if (!found) return null;
  const c = VOICE_CHOICE_IDS.includes(choice) ? choice : DEFAULT_VOICE_CHOICE;
  if (found[c] && found[c].has(key)) return voiceUrl(key, c);
  if (found[''] && found[''].has(key)) return voiceUrl(key);
  return null;
}

let choice = DEFAULT_VOICE_CHOICE;

/** Change la voix utilisée pour les prochaines annonces (sans rechargement). */
export function setVoiceChoice(id) {
  choice = VOICE_CHOICE_IDS.includes(id) ? id : DEFAULT_VOICE_CHOICE;
}
export function getVoiceChoice() { return choice; }

// ------------------------------------------------------------------ disponibilité
function synth() {
  try {
    const s = window.speechSynthesis;
    return s && typeof s.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function' ? s : null;
  } catch { return null; }
}

/** Vrai si le navigateur sait parler (synthèse vocale). */
export function synthesisAvailable() { return synth() !== null; }

let recorded = null; // { '': Set, femme: Set, homme: Set } une fois connu
let probing = null;  // Promise

const countRecorded = (r) => (r ? FOLDERS.reduce((n, f) => n + (r[f] ? r[f].size : 0), 0) : 0);

/** Vrai si une voix est possible : synthèse disponible, ou enregistrements trouvés. */
export function voiceAvailable() { return synthesisAvailable() || countRecorded(recorded) > 0; }

/** Clés enregistrées utilisables avec la voix choisie (null tant que la vérification n'est pas finie). */
export function recordedKeys() {
  if (!recorded) return null;
  return new Set(VOICE_KEYS.filter((k) => resolveVoiceFile(k, choice, recorded)));
}

function headInWorker(urls) {
  return new Promise((resolve) => {
    let w;
    try { w = new Worker(new URL('./voice-probe.js', import.meta.url)); } catch { resolve(null); return; }
    const end = (v) => { try { w.terminate(); } catch { /* ignoré */ } resolve(v); };
    w.onmessage = (e) => end(Array.isArray(e.data) ? e.data : null);
    w.onerror = (e) => { try { e.preventDefault(); } catch { /* ignoré */ } end(null); };
    w.postMessage(urls);
  });
}

async function headInPage(urls) {
  return Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return { ok: r.ok, type: r.headers.get('content-type') || '' };
    } catch { return { ok: false, type: '', offline: true }; }
  }));
}

async function inCache(url) {
  try { return Boolean(window.caches && (await caches.match(url))); } catch { return false; }
}

/**
 * Vérifie (une seule fois, en une sonde groupée) quels enregistrements existent dans les trois dossiers.
 * Renvoie l'ensemble des clés utilisables avec la voix choisie.
 */
export function prepareVoice() {
  if (probing) return probing;
  probing = (async () => {
    const found = Object.fromEntries(FOLDERS.map((f) => [f, new Set()]));
    try {
      const items = FOLDERS.flatMap((folder) => VOICE_KEYS.map((key) => ({ folder, key, url: voiceUrl(key, folder) })));
      const urls = items.map((it) => it.url);
      const results = (typeof Worker === 'function' ? await headInWorker(urls) : null) || await headInPage(urls);
      await Promise.all(items.map(async (it, i) => {
        const r = results[i] || {};
        // Un serveur peut répondre la page d'accueil à la place d'un fichier absent : on l'écarte.
        const ok = r.ok && !/text\/html/i.test(r.type || '');
        if (ok || (r.offline && await inCache(it.url))) found[it.folder].add(it.key);
      }));
    } catch { /* aucune voix enregistrée : synthèse */ }
    recorded = found;
    return recordedKeys();
  })();
  return probing;
}

// ------------------------------------------------------------------ choix de la voix de synthèse
let chosen;     // SpeechSynthesisVoice | null | undefined (pas encore cherché)
let listening = false;

function pickVoice() {
  const s = synth();
  if (!s) return null;
  if (!listening) {
    listening = true;
    try { s.addEventListener?.('voiceschanged', () => { chosen = undefined; }); } catch { /* ignoré */ }
  }
  if (chosen !== undefined) return chosen;
  let voices = [];
  try { voices = (typeof s.getVoices === 'function' && s.getVoices()) || []; } catch { voices = []; }
  const fr = voices.filter((v) => /^fr([-_]|$)/i.test(String(v.lang || '')));
  const score = (v) => {
    const lang = String(v.lang || '').replace('_', '-').toLowerCase();
    return (v.localService ? 4 : 0) + (lang === 'fr-fr' ? 2 : lang === 'fr-ch' ? 1.5 : 1) + (v.default ? 0.5 : 0);
  };
  fr.sort((a, b) => score(b) - score(a));
  chosen = fr[0] || null;
  // Liste encore vide (chargement asynchrone) : on réessaiera à la prochaine annonce.
  if (!voices.length) { const c = chosen; chosen = undefined; return c; }
  return chosen;
}

// ------------------------------------------------------------------ lecture
const players = new Map();
let current = null; // lecteur d'enregistrement en cours
let token = 0;

function stopAll() {
  const s = synth();
  if (s) { try { s.cancel(); } catch { /* ignoré */ } }
  if (current) {
    try { current.pause(); current.currentTime = 0; } catch { /* ignoré */ }
    current = null;
  }
}

function player(url) {
  let a = players.get(url);
  if (!a) {
    a = new Audio(url);
    a.preload = 'auto';
    players.set(url, a);
  }
  return a;
}

function speakSynth(text, onEnd) {
  const s = synth();
  if (!s) return;
  try {
    s.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    if (onEnd) u.onend = onEnd;
    u.lang = LANG;
    u.rate = RATE;
    u.pitch = PITCH;
    u.volume = 1;
    const v = pickVoice();
    if (v) u.voice = v;
    s.speak(u);
  } catch { /* ignoré */ }
}

function play(key, onEnd) {
  stopAll();
  const url = resolveVoiceFile(key, choice, recorded);
  if (url) {
    try {
      const a = player(url);
      current = a;
      a.onended = onEnd ? () => { if (current === a) onEnd(); } : null;
      a.currentTime = 0;
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => { if (current === a) current = null; });
    } catch { current = null; }
    return;
  }
  speakSynth(PHRASES[key], onEnd);
}

/**
 * Dit l'annonce `key` (« accueil », « inspire », « retiens », « expire », « fin »), en coupant la précédente.
 * `next` / `nextIf` : annonce enchaînée à la fin de celle-ci, seulement si `nextIf()` est encore vrai à ce
 * moment-là et qu'aucune autre annonce n'a pris la place (ex. accueil puis « Inspire » au premier souffle).
 */
export function say(key, { next = null, nextIf = () => true, onDone = null } = {}) {
  if (!PHRASES[key]) return;
  const mine = ++token;
  stopAll();
  const onEnd = next && PHRASES[next]
    ? () => { if (mine === token && nextIf()) { token += 1; play(next); } }
    : onDone ? () => { if (mine === token) onDone(); } : null;
  if (recorded) { play(key, onEnd); return; }
  prepareVoice().then(() => { if (mine === token) play(key, onEnd); });
}

/**
 * Aperçu (Réglages) : dit la phrase d'accueil avec la voix choisie (même repli que les séances).
 * `onDone` est appelé à la fin naturelle de la lecture (pas si elle est coupée).
 */
export function previewVoice(onDone) {
  say('accueil', { onDone });
}

/** Coupe immédiatement toute annonce (en cours ou en attente). */
export function silence() {
  token += 1;
  stopAll();
}
