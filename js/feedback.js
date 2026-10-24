// Retours de séance : son doux (Web Audio), vibration, verrou de mise en veille. Tout est protégé par try/catch.

let audioCtx = null;

/** Contexte audio partagé (repères sonores et ambiances), créé à la première demande. */
export function getAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  const activated = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  if (audioCtx.state === 'suspended' && activated && typeof audioCtx.resume === 'function') {
    try { const p = audioCtx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* ignoré */ }
  }
  return audioCtx;
}

/** À appeler pendant un geste de l'utilisateur (clic sur « Commencer ») pour autoriser le son. */
export function primeAudio() {
  try { getAudioContext(); } catch { /* ignoré */ }
}

const TONES = { inspire: 528, holdIn: 440, expire: 396, holdOut: 352 };

/** Petit son doux et court (sinusoïde avec attaque et extinction progressives). */
export function chime(phaseType) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(TONES[phaseType] || 440, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.75);
  } catch { /* le son est un bonus : jamais d'erreur */ }
}

function isNative(fn) {
  try { return /\[native code\]/.test(Function.prototype.toString.call(fn)); } catch { return true; }
}

/** Petite vibration, si le téléphone le permet. */
export function buzz() {
  try {
    const vibrate = navigator.vibrate;
    if (typeof vibrate !== 'function') return;
    // Sans geste préalable (séance ouverte par un lien), Chrome bloque la vibration native et écrit une
    // erreur dans la console : on s'abstient alors, le résultat est le même pour l'utilisateur.
    const activated = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
    if (!activated && isNative(vibrate)) return;
    navigator.vibrate(40);
  } catch { /* ignoré */ }
}

// --- Verrou de mise en veille d'écran ---
let sentinel = null;
let wanted = false;

async function requestLock() {
  try {
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') return;
    const s = await navigator.wakeLock.request('screen');
    if (!wanted) { try { await s?.release?.(); } catch { /* ignoré */ } return; }
    sentinel = s;
    try { s?.addEventListener?.('release', () => { if (sentinel === s) sentinel = null; }); } catch { /* ignoré */ }
  } catch { sentinel = null; }
}

function onVisibility() {
  if (wanted && !sentinel && document.visibilityState === 'visible') requestLock();
}

export function acquireWakeLock() {
  wanted = true;
  document.addEventListener('visibilitychange', onVisibility);
  return requestLock();
}

export async function releaseWakeLock() {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibility);
  const s = sentinel;
  sentinel = null;
  try { await s?.release?.(); } catch { /* ignoré */ }
}
