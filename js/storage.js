// Lecture / écriture locale (localStorage, clés préfixées « souffle: »). Toujours dans des try/catch.
import { BALL_COLORS } from './colors.js';
import { EXERCISE_IDS } from './exercises.js';
import { BACKGROUND_IDS } from './backgrounds.js';
import { AMBIENCE_IDS, DEFAULT_VOLUME } from './ambience-data.js';
import { VOICE_CHOICE_IDS, DEFAULT_VOICE_CHOICE } from './voice.js';

export const KEY_SETTINGS = 'souffle:settings';
export const KEY_HISTORY = 'souffle:history';

export const DURATION_MIN = 1;
export const DURATION_MAX = 20;
export const THEMES = ['auto', 'light', 'dark'];

export const DEFAULT_SETTINGS = Object.freeze({
  duration: 5,
  ballColor: BALL_COLORS[0].value,
  theme: 'auto',
  sound: true,
  vibration: true,
  voice: true,
  background: 'aucun',
  ambience: 'aucune',
  ambienceVolume: DEFAULT_VOLUME,
  voiceChoice: DEFAULT_VOICE_CHOICE,
  perso: Object.freeze({ inspire: 4, holdIn: 2, expire: 6, holdOut: 0 }),
});

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const isInt = (v, min, max) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function clampDuration(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.duration;
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, n));
}

/** Volume d'ambiance : entier de 0 à 100 (50 par défaut si la valeur est absente ou abîmée). */
export function clampVolume(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return DEFAULT_VOLUME;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(100, Math.max(0, n));
}

/** Normalise des réglages quelconques (valeurs manquantes ou abîmées -> valeurs par défaut). */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SETTINGS;
  const p = s.perso && typeof s.perso === 'object' ? s.perso : {};
  const perso = {};
  for (const k of ['inspire', 'holdIn', 'expire', 'holdOut']) perso[k] = isInt(p[k], 0, 15) ? p[k] : d.perso[k];
  if (perso.inspire < 1 || perso.expire < 1) Object.assign(perso, d.perso);
  return {
    duration: isInt(s.duration, DURATION_MIN, DURATION_MAX) ? s.duration : d.duration,
    ballColor: typeof s.ballColor === 'string' && s.ballColor.trim() ? s.ballColor : d.ballColor,
    theme: THEMES.includes(s.theme) ? s.theme : d.theme,
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
    vibration: typeof s.vibration === 'boolean' ? s.vibration : d.vibration,
    voice: typeof s.voice === 'boolean' ? s.voice : d.voice,
    background: BACKGROUND_IDS.includes(s.background) ? s.background : d.background,
    ambience: AMBIENCE_IDS.includes(s.ambience) ? s.ambience : d.ambience,
    ambienceVolume: clampVolume(s.ambienceVolume),
    voiceChoice: VOICE_CHOICE_IDS.includes(s.voiceChoice) ? s.voiceChoice : d.voiceChoice,
    perso,
  };
}

export function loadSettings() {
  return normalizeSettings(readJSON(KEY_SETTINGS));
}

export function saveSettings(patch) {
  const next = normalizeSettings({ ...loadSettings(), ...patch });
  writeJSON(KEY_SETTINGS, next);
  return next;
}

function isValidEntry(e) {
  return e && typeof e === 'object' && e.id != null && typeof e.date === 'string'
    && !Number.isNaN(Date.parse(e.date)) && typeof e.seconds === 'number' && e.seconds >= 0;
}

export function loadHistory() {
  const raw = readJSON(KEY_HISTORY);
  return Array.isArray(raw) ? raw.filter(isValidEntry) : [];
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addSession({ date, exercise, seconds }) {
  const entry = {
    id: newId(),
    date: (date instanceof Date ? date : new Date(date ?? Date.now())).toISOString(),
    exercise: EXERCISE_IDS.includes(exercise) ? exercise : String(exercise),
    seconds: Math.max(0, Math.round(seconds)),
  };
  const raw = readJSON(KEY_HISTORY);
  const list = Array.isArray(raw) ? raw : [];
  list.push(entry);
  writeJSON(KEY_HISTORY, list);
  return entry;
}

export function deleteSession(id) {
  const raw = readJSON(KEY_HISTORY);
  const list = Array.isArray(raw) ? raw : [];
  const next = list.filter((e) => !e || String(e.id) !== String(id));
  writeJSON(KEY_HISTORY, next);
  return next.filter(isValidEntry);
}

/** Supprime une séance et renvoie { entry, index } pour pouvoir l'annuler (null si introuvable). */
export function removeSession(id) {
  const raw = readJSON(KEY_HISTORY);
  const list = Array.isArray(raw) ? raw : [];
  const index = list.findIndex((e) => e && String(e.id) === String(id));
  if (index < 0) return null;
  const [entry] = list.splice(index, 1);
  writeJSON(KEY_HISTORY, list);
  return { entry, index };
}

/** Remet une séance supprimée (annulation), à sa place d'origine si possible. */
export function restoreSession(entry, index = -1) {
  if (!isValidEntry(entry)) return loadHistory();
  const raw = readJSON(KEY_HISTORY);
  const list = Array.isArray(raw) ? raw : [];
  if (list.some((e) => e && String(e.id) === String(entry.id))) return list.filter(isValidEntry);
  const at = Number.isInteger(index) && index >= 0 && index <= list.length ? index : list.length;
  list.splice(at, 0, entry);
  writeJSON(KEY_HISTORY, list);
  return list.filter(isValidEntry);
}
