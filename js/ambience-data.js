// Catalogue des ambiances sonores (données pures, sans Web Audio).
export const AMBIENCES = Object.freeze([
  { id: 'aucune', name: 'Aucune', short: 'Aucune', hint: 'Le silence, simplement.' },
  { id: 'mer', name: 'La mer', short: 'Mer', hint: 'Des vagues lentes, comme une houle.' },
  { id: 'foret', name: 'La forêt', short: 'Forêt', hint: 'Un vent doux et des oiseaux au loin.' },
  { id: 'mystique', name: 'Musique mystique', short: 'Mystique', hint: 'Des nappes et des bols chantants.' },
]);

export const AMBIENCE_IDS = AMBIENCES.map((a) => a.id);
export const DEFAULT_VOLUME = 50;

/** Gain maître à 100 % ; le gain appliqué est proportionnel au volume réglé (0-100). */
export const MAX_GAIN = 0.9;

export function gainForVolume(volume) {
  const v = Math.min(100, Math.max(0, Number(volume) || 0));
  return (MAX_GAIN * v) / 100;
}

export function getAmbience(id) {
  return AMBIENCES.find((a) => a.id === id) || AMBIENCES[0];
}
