// Fonds photo de séance (données pures). Les fichiers sont dans app/backgrounds/<id>.webp (licence Unsplash).
export const BACKGROUNDS = Object.freeze([
  { id: 'aucun', name: 'Aucun', short: 'Aucun', file: null },
  { id: 'foret', name: 'Forêt', short: 'Forêt', file: 'backgrounds/foret.webp' },
  { id: 'riviere', name: 'Rivière', short: 'Rivière', file: 'backgrounds/riviere.webp' },
  { id: 'paysage', name: 'Paysage', short: 'Paysage', file: 'backgrounds/paysage.webp' },
  { id: 'cosmos', name: 'Cosmos', short: 'Cosmos', file: 'backgrounds/cosmos.webp' },
  { id: 'montagne', name: 'Montagne', short: 'Montagne', file: 'backgrounds/montagne.webp' },
  { id: 'sousmarin', name: 'Fond sous-marin', short: 'Sous-marin', file: 'backgrounds/sousmarin.webp' },
  { id: 'plage', name: 'Plage', short: 'Plage', file: 'backgrounds/plage.webp' },
  { id: 'aurore', name: 'Aurore boréale', short: 'Aurore', file: 'backgrounds/aurore.webp' },
]);

export const BACKGROUND_IDS = BACKGROUNDS.map((b) => b.id);

export function getBackground(id) {
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}
