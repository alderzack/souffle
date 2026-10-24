// Formats de texte en français — logique pure, sans DOM.

/** Accord en nombre : en français, 0 et 1 sont au singulier (« 1 seconde », « 2 secondes »). */
export function plural(n, one, many) {
  return Math.abs(Number(n)) < 2 ? one : many;
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Jour, ex. « mardi 20 octobre 2026 » (heure locale, minuscules, sans virgule). */
export function formatDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDate() === 1 ? '1er' : String(d.getDate());
  return `${DAYS[d.getDay()]} ${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Heure, ex. « 8 h 06 » (heure sans zéro initial, minutes sur deux chiffres). */
export function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Date et heure, ex. « mardi 20 octobre 2026 à 8 h 06 ». */
export function formatDateTime(date) {
  return `${formatDay(date)} à ${formatTime(date)}`;
}

/** Durée courte, ex. « 45 s », « 5 min », « 2 min 30 s » (espaces insécables). */
export function formatSeconds(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const nb = ' ';
  if (s < 60) return `${s}${nb}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}${nb}min${nb}${r}${nb}s` : `${m}${nb}min`;
}
