// Catalogue des exercices (données pures).
import { buildPhases } from './engine.js';

export const EXERCISES = [
  {
    id: 'coherence',
    name: 'Cohérence cardiaque 365',
    tag: '6 respirations par minute',
    desc: 'Inspire et expire à parts égales, lentement, au rythme de la balle. Ce rythme régulier aide le souffle et le cœur à s’accorder, et laisse souvent un calme durable. L’idéal : trois fois par jour.',
    timing: { inspire: 5, holdIn: 0, expire: 5, holdOut: 0 },
  },
  {
    id: 'carree',
    name: 'Respiration carrée',
    tag: 'Pour se recentrer',
    desc: 'Quatre temps égaux, comme les côtés d’un carré. Ce rythme stable occupe l’esprit et aide à se recentrer avant un moment important. Simple à retenir, facile à refaire partout.',
    timing: { inspire: 4, holdIn: 4, expire: 4, holdOut: 4 },
  },
  {
    id: '478',
    name: '4-7-8',
    tag: 'Pour s’endormir',
    desc: 'Une expiration deux fois plus longue que l’inspiration invite le corps à ralentir. À pratiquer le soir, au lit, pour préparer l’endormissement. Si la rétention te gêne, va à ton rythme.',
    timing: { inspire: 4, holdIn: 7, expire: 8, holdOut: 0 },
  },
  {
    id: 'soupir',
    name: 'Soupir de détente',
    tag: 'Inspiré de la sophrologie',
    desc: 'Inspire tranquillement, puis laisse partir l’air lentement, comme un long soupir. Cet exercice issu de la sophrologie aide à relâcher les tensions. Parfait pour une petite pause.',
    timing: { inspire: 4, holdIn: 0, expire: 8, holdOut: 0 },
  },
  {
    id: 'perso',
    name: 'Personnalisé',
    tag: 'Ton propre rythme',
    desc: 'Compose ton rythme : inspiration, rétention poumons pleins, expiration, rétention poumons vides. Pratique pour suivre la consigne de ton coach ou de ton thérapeute. Commence doucement et écoute tes sensations.',
    timing: null, // vient des réglages
  },
];

export const EXERCISE_IDS = EXERCISES.map((e) => e.id);

export const PERSO_FIELDS = [
  { key: 'inspire', label: 'Inspiration', testid: 'perso-inspire' },
  { key: 'holdIn', label: 'Rétention poumons pleins', testid: 'perso-hold-in' },
  { key: 'expire', label: 'Expiration', testid: 'perso-expire' },
  { key: 'holdOut', label: 'Rétention poumons vides', testid: 'perso-hold-out' },
];

export const PERSO_MIN = 0;
export const PERSO_MAX = 15;

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || null;
}

/** Rythme effectif d'un exercice (le personnalisé vient des réglages). */
export function timingFor(exercise, settings) {
  return exercise.id === 'perso' ? { ...settings.perso } : { ...exercise.timing };
}

/** Valide un rythme personnalisé. Renvoie un message d'erreur en français, ou null si tout va bien. */
export function validateTiming(timing) {
  for (const f of PERSO_FIELDS) {
    const v = timing[f.key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < PERSO_MIN || v > PERSO_MAX) {
      return `Chaque durée doit être un nombre entier de ${PERSO_MIN} à ${PERSO_MAX} secondes.`;
    }
  }
  if (timing.inspire < 1 || timing.expire < 1) {
    return 'L’inspiration et l’expiration doivent durer au moins 1 seconde.';
  }
  return null;
}

/** Texte des phases, ex. « Inspire 5 s · Expire 5 s ». */
export function phasesText(timing) {
  return buildPhases(timing).map((p) => `${p.label} ${p.ms / 1000} s`).join(' · ');
}
