// Rappel discret des choix d'ambiance (accueil et écran « Prêt ? »), avec un lien vers les réglages.
import { h } from './dom.js';
import { getBackground } from './backgrounds.js';
import { getAmbience } from './ambience-data.js';
import { voiceAvailable, voiceChoiceName } from './voice.js';

const NB = ' '; // espace insécable avant les deux-points

/** Morceaux du rappel, ex. ["Fond : Forêt", "Ambiance : Mer", "Voix de femme"] (logique pure). */
export function summaryParts(settings, { voiceOk = true } = {}) {
  const bg = getBackground(settings.background);
  const amb = getAmbience(settings.ambience);
  return [
    bg.id === 'aucun' ? 'Aucun fond' : `Fond${NB}: ${bg.short}`,
    amb.id === 'aucune' ? 'Aucune ambiance' : `Ambiance${NB}: ${amb.short}`,
    settings.voice && voiceOk ? voiceChoiceName(settings.voiceChoice) : 'Sans voix',
  ];
}

export function summaryText(settings, opts) {
  return summaryParts(settings, opts).join(' · ');
}

/** Élément `ambiance-summary`. */
export function ambianceSummary(settings, extraClass = '') {
  return h('p', { class: `ambiance-summary ${extraClass}`.trim(), testid: 'ambiance-summary' },
    h('span', { class: 'summary-text' }, summaryText(settings, { voiceOk: voiceAvailable() })),
    ' ',
    h('a', { href: '#/reglages', class: 'summary-link', 'aria-label': 'Modifier le fond, l’ambiance sonore et la voix' }, 'Modifier'),
  );
}
