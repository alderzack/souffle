// Moteur de phases — logique pure, sans DOM. Tout est calculé à partir du temps écoulé (ms).

export const PHASE_LABELS = Object.freeze({
  inspire: 'Inspire',
  holdIn: 'Retiens',
  expire: 'Expire',
  holdOut: 'Retiens',
});

export const PHASE_ORDER = Object.freeze(['inspire', 'holdIn', 'expire', 'holdOut']);

/** Transforme un rythme { inspire, holdIn, expire, holdOut } (secondes) en liste de phases non nulles. */
export function buildPhases(timing) {
  return PHASE_ORDER
    .map((type) => ({ type, label: PHASE_LABELS[type], ms: Math.round((Number(timing[type]) || 0) * 1000) }))
    .filter((p) => p.ms > 0);
}

export function cycleMs(phases) {
  return phases.reduce((sum, p) => sum + p.ms, 0);
}

/** Courbe douce (moitié linéaire, moitié sinusoïdale) : départ et arrivée en douceur, mouvement régulier. */
export function ease(p) {
  const x = Math.min(1, Math.max(0, p));
  return 0.5 * x + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * x));
}

/** Niveau des poumons (0 = vides, en bas ; 1 = pleins, en haut) pour une phase et sa progression (0..1). */
export function levelFor(type, progress) {
  switch (type) {
    case 'inspire': return ease(progress);
    case 'holdIn': return 1;
    case 'expire': return 1 - ease(progress);
    default: return 0;
  }
}

/**
 * État de la séance à un instant donné.
 * index : numéro global de la phase depuis le début (change à chaque changement de phase).
 */
export function stateAt(phases, elapsedMs) {
  const total = cycleMs(phases);
  if (!phases.length || total <= 0) throw new Error('Rythme invalide');
  const t = Math.max(0, elapsedMs);
  const cycle = Math.floor(t / total);
  let rest = t - cycle * total;
  let i = 0;
  while (i < phases.length - 1 && rest >= phases[i].ms) { rest -= phases[i].ms; i += 1; }
  const phase = phases[i];
  const progress = Math.min(1, rest / phase.ms);
  const remainingMs = phase.ms - rest;
  return {
    index: cycle * phases.length + i,
    cycle,
    phase,
    label: phase.label,
    phaseElapsedMs: rest,
    phaseRemainingMs: remainingMs,
    countdown: Math.max(1, Math.ceil(remainingMs / 1000 - 1e-9)),
    progress,
    level: levelFor(phase.type, progress),
  };
}

/** Chronomètre pausable, avec une source de temps injectable (performance.now par défaut). */
export function createTimer(now = () => performance.now()) {
  let accumulated = 0;
  let startedAt = now();
  let running = true;
  return {
    elapsed() { return running ? accumulated + (now() - startedAt) : accumulated; },
    pause() { if (running) { accumulated += now() - startedAt; running = false; } },
    resume() { if (!running) { startedAt = now(); running = true; } },
    get running() { return running; },
  };
}

/** Temps restant en secondes entières (arrondi au-dessus) au format m:ss. */
export function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
