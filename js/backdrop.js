// Fond photo de séance : la photo choisie en plein écran (object-fit: cover), un voile qui garantit la
// lisibilité, et une dérive très lente : glissement du cadrage (object-position, 10 % au plus) et léger zoom
// (object-view-box, 6 %) sur 50 s, en aller-retour. Le cadre de l'image reste exactement celui de la fenêtre
// (rien ne dépasse de l'écran). La dérive suit l'horloge de la page ; aucune si l'appareil demande moins
// d'animations.
import { h } from './dom.js';
import { getBackground } from './backgrounds.js';

export const DRIFT_MS = 50_000;
export const DRIFT_KEYFRAMES = Object.freeze([
  { objectPosition: '45% 46%', objectViewBox: 'inset(0% 0% 0% 0%)' },
  { objectPosition: '55% 54%', objectViewBox: 'inset(3% 3% 3% 3%)' },
]);

function reducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Crée le fond (ou null pour « aucun »). Les nœuds sont à insérer en tête de l'écran. */
export function createBackdrop(id) {
  const bg = getBackground(id);
  if (!bg.file) return null;
  const img = h('img', {
    class: 'backdrop', testid: 'session-backdrop', dataset: { background: bg.id },
    src: bg.file, alt: '', decoding: 'async', fetchpriority: 'high', draggable: 'false',
  });
  const veil = h('div', { class: 'veil', testid: 'session-veil', 'aria-hidden': 'true' });

  let anim = null;
  let t0 = 0;
  if (!reducedMotion() && typeof img.animate === 'function') {
    try {
      anim = img.animate(DRIFT_KEYFRAMES.map((k) => ({ ...k })), {
        duration: DRIFT_MS, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out',
      });
      t0 = performance.now();
    } catch { anim = null; }
  }

  return {
    nodes: [img, veil],
    /** Recale la dérive sur l'horloge de la page (appelé par la boucle de séance). */
    sync() {
      if (!anim || anim.playState !== 'running') return;
      try {
        const target = performance.now() - t0;
        const cur = anim.currentTime;
        if (cur == null || Math.abs(cur - target) > 1000) anim.currentTime = target;
      } catch { /* ignoré */ }
    },
    destroy() {
      try { anim?.cancel(); } catch { /* ignoré */ }
      img.remove();
      veil.remove();
    },
  };
}

/** Marque le document « avec photo » (fond sombre sous la photo, en-tête lisible). */
export function setBackdropMode(on) {
  document.documentElement.classList.toggle('has-backdrop', Boolean(on));
}
