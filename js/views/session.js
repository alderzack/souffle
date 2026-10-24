// Écran de séance : « Prêt ? » (si la séance n'a pas été lancée par un clic), balle, phase, décomptes,
// pause / arrêt, puis écran de fin. v1.1 : fond photo, ambiance sonore et voix, chacun indépendant.
import { h, setText } from '../dom.js';
import { buildPhases, stateAt, createTimer, formatRemaining } from '../engine.js';
import { getExercise, timingFor, validateTiming, phasesText } from '../exercises.js';
import { loadSettings, addSession } from '../storage.js';
import { chime, buzz, acquireWakeLock, releaseWakeLock, primeAudio } from '../feedback.js';
import { navigate, takeStartRequest, replaceHash } from '../router.js';
import { plural } from '../format.js';
import { createBackdrop, setBackdropMode } from '../backdrop.js';
import { startAmbience } from '../ambience.js';
import { say, silence, prepareVoice, voiceAvailable, setVoiceChoice, PHASE_KEYS } from '../voice.js';
import { ambianceSummary } from '../summary.js';

export const title = 'Séance — Souffle';
export const MIN_RECORD_MS = 60_000;
export const PAUSED_LABEL = 'En pause';
export const DONE_MESSAGE = 'C’est noté dans ton historique.';
export const VOICE_LABELS = Object.freeze({ on: 'Couper la voix', off: 'Remettre la voix', none: 'Voix indisponible' });
export const AMBIENCE_LABELS = Object.freeze({ on: "Couper l'ambiance", off: "Remettre l'ambiance" });

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Icône décorative au trait (tracés SVG). */
function strokeIcon(paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon-stroke');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
const ICON_VOICE = ['M4 5.5h16v10H10l-4.5 3.5v-3.5H4z', 'M8.5 10.5h7'];
const ICON_AMBIENCE = ['M3 10c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0', 'M3 15c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0'];
const ICON_OFF = 'M4 3.5 20 20.5';

/** Durée faite, ex. « 45 s », « 5 min », « 2 min 30 s ». */
export function formatDoneDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${Math.max(1, s)} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function mount(root, { id }) {
  const settings = loadSettings();
  const exercise = getExercise(id);
  const timing = exercise && timingFor(exercise, settings);
  if (!exercise || validateTiming(timing)) {
    location.replace('#/');
    return () => {};
  }

  let stopSession = null; // fourni par startSession()
  const backdrop = createBackdrop(settings.background); // null si « aucun »
  setBackdropMode(Boolean(backdrop));
  setVoiceChoice(settings.voiceChoice);
  if (settings.voice) prepareVoice();
  const withPhoto = (cls) => (backdrop ? `${cls} has-photo` : cls);
  const needsAudio = () => settings.sound || settings.ambience !== 'aucune';

  if (takeStartRequest(id)) startSession();
  else showReady();

  // Si on quitte l'écran autrement (retour arrière, lien…), on traite comme un arrêt.
  return () => {
    stopSession?.();
    backdrop?.destroy();
    setBackdropMode(false);
  };

  // ------------------------------------------------------------------ écran « Prêt ? »
  function showReady() {
    const minutes = settings.duration;
    const heading = h('h1', { class: 'ready-title', id: 'ready-title', tabindex: '-1' }, exercise.name);
    const startBtn = h('button', {
      type: 'button', class: 'btn btn-primary btn-wide', testid: 'btn-session-start',
      onclick: () => {
        if (needsAudio()) primeAudio();
        startSession();
      },
    }, 'Commencer');
    const screen = h('section', { class: withPhoto('ready'), testid: 'session-ready', 'aria-labelledby': 'ready-title' },
      backdrop?.nodes,
      h('div', { class: 'done-ball', 'aria-hidden': 'true' }),
      h('p', { class: 'ready-kicker' }, 'Prêt ?'),
      heading,
      h('p', { class: 'phases ready-phases' }, phasesText(timing)),
      h('p', { class: 'ready-text' }, `Séance de ${minutes} ${plural(minutes, 'minute', 'minutes')}. Installe-toi confortablement, puis commence quand tu veux.`),
      h('div', { class: 'session-actions' },
        startBtn,
        h('a', { href: '#/', class: 'btn btn-secondary btn-wide' }, 'Retour à l’accueil'),
      ),
      ambianceSummary(settings, 'ready-summary'),
    );
    root.replaceChildren(screen);
    document.title = `${exercise.name} — Souffle`;
  }

  // ------------------------------------------------------------------ séance
  function startSession() {
    const phases = buildPhases(timing);
    const totalMs = settings.duration * 60_000;
    const startedAt = new Date();
    const timer = createTimer();

    document.body.classList.add('in-session');
    document.title = title;

    // --- DOM ---
    const firstCount = Math.ceil(phases[0].ms / 1000);
    const label = h('p', { class: 'phase-label', testid: 'phase-label', 'aria-live': 'polite' }, phases[0].label);
    const countdown = h('span', { class: 'phase-countdown', testid: 'phase-countdown' }, String(firstCount));
    // Texte lu après le chiffre ; l'espace final le sépare du bloc suivant dans le texte du document.
    const unitText = (n) => ` ${plural(n, 'seconde', 'secondes')} `;
    const countUnit = h('span', { class: 'visually-hidden' }, unitText(firstCount));
    const remaining = h('span', { class: 'remaining-value', testid: 'session-remaining' }, formatRemaining(totalMs));
    const ball = h('div', { class: 'ball', testid: 'ball', 'aria-hidden': 'true' });
    const track = h('div', { class: 'ball-track', testid: 'ball-track', 'aria-hidden': 'true' }, ball);
    const progress = h('progress', {
      class: 'phase-progress', testid: 'phase-progress', max: 100, value: 0,
      'aria-label': 'Progression de la phase', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0,
    });
    const btnPause = h('button', { type: 'button', class: 'btn btn-primary btn-wide', testid: 'btn-pause' }, 'Pause');
    const btnStop = h('button', { type: 'button', class: 'btn btn-secondary btn-wide', testid: 'btn-stop' }, 'Arrêter');
    const heading = h('h1', { class: 'session-title', id: 'session-title', tabindex: '-1' }, exercise.name);

    // --- Voix et ambiance : coupables d'un geste, sans toucher au déroulé de la séance ---
    const canSpeak = voiceAvailable();
    let voiceOn = settings.voice && canSpeak;
    const ambience = settings.ambience !== 'aucune'
      ? startAmbience(settings.ambience, { volume: settings.ambienceVolume })
      : null;
    let ambienceOn = true;

    const toggleBtn = (testid, text, paths) => {
      const off = strokeIcon([ICON_OFF]);
      off.classList.add('icon-off');
      return h('button', { type: 'button', class: 'chip', testid },
        h('span', { class: 'chip-icon' }, strokeIcon(paths), off),
        h('span', { class: 'chip-text' }, text));
    };
    const btnVoice = toggleBtn('btn-toggle-voice', 'Voix', ICON_VOICE);
    const btnAmbience = settings.ambience !== 'aucune' ? toggleBtn('btn-toggle-ambience', 'Ambiance', ICON_AMBIENCE) : null;
    const refreshToggles = () => {
      btnVoice.setAttribute('aria-label', canSpeak ? (voiceOn ? VOICE_LABELS.on : VOICE_LABELS.off) : VOICE_LABELS.none);
      btnVoice.classList.toggle('is-off', !voiceOn);
      btnVoice.disabled = !canSpeak;
      if (btnAmbience) {
        btnAmbience.setAttribute('aria-label', ambienceOn ? AMBIENCE_LABELS.on : AMBIENCE_LABELS.off);
        btnAmbience.classList.toggle('is-off', !ambienceOn);
      }
    };
    refreshToggles();

    const view = h('section', { class: withPhoto('session'), 'aria-labelledby': 'session-title', dataset: { phase: phases[0].type } },
      backdrop?.nodes,
      heading,
      h('div', { class: 'session-stage' },
        h('div', { class: 'phase-box' },
          label,
          h('p', { class: 'phase-count-line' }, countdown, countUnit),
        ),
        track,
        progress,
      ),
      h('p', { class: 'remaining' }, h('span', { class: 'remaining-label' }, 'Temps restant '), remaining),
      h('div', { class: 'session-actions' }, btnPause, btnStop),
      h('div', { class: 'session-toggles' }, btnVoice, btnAmbience),
    );
    const hadFocus = root.contains(document.activeElement);
    root.replaceChildren(view);
    if (hadFocus) heading.focus({ preventScroll: true }); // départ depuis « Prêt ? » : le focus ne se perd pas

    // --- Boucle ---
    let lastIndex = 0;
    let done = false;
    let recorded = false;
    let rafId = 0;
    let intervalId = 0;
    let endTimeoutId = 0;

    function render() {
      const elapsed = timer.elapsed();
      if (elapsed >= totalMs) { finish(); return; }
      const s = stateAt(phases, elapsed);
      if (s.index !== lastIndex) {
        lastIndex = s.index;
        if (settings.sound) chime(s.phase.type);
        if (settings.vibration) buzz();
        if (voiceOn && timer.running) say(PHASE_KEYS[s.phase.type]);
      }
      backdrop?.sync();
      setText(label, timer.running ? s.label : PAUSED_LABEL);
      if (view.dataset.phase !== s.phase.type) view.dataset.phase = s.phase.type;
      setText(countdown, String(s.countdown));
      setText(countUnit, unitText(s.countdown));
      setText(remaining, formatRemaining(totalMs - elapsed));
      ball.style.setProperty('--level', s.level.toFixed(4));
      const pct = Math.round(s.progress * 100);
      if (progress.value !== pct) {
        progress.value = pct;
        progress.setAttribute('aria-valuenow', String(pct));
      }
    }

    function frame() {
      if (done) return;
      render();
      rafId = requestAnimationFrame(frame);
    }

    // Filet de sécurité : la fin ne dépend pas des images rendues. Un minuteur est calé sur l'heure de fin
    // (recalculé à chaque reprise) ; le setInterval rattrape aussi la fin si ce minuteur est retardé.
    function scheduleEnd() {
      clearTimeout(endTimeoutId);
      endTimeoutId = 0;
      if (done || !timer.running) return;
      endTimeoutId = setTimeout(() => { if (!done) render(); }, Math.max(0, totalMs - timer.elapsed()) + 20);
    }

    function onVisibility() {
      if (!done && document.visibilityState === 'visible') render();
    }

    function stopLoop() {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
      clearTimeout(endTimeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function record(seconds) {
      if (recorded) return;
      recorded = true;
      addSession({ date: startedAt, exercise: exercise.id, seconds });
    }

    function cleanup() {
      stopLoop();
      releaseWakeLock();
      silence();
      ambience?.stop();
      document.body.classList.remove('in-session');
    }

    function finish() {
      if (done) return;
      done = true;
      cleanup();
      const seconds = Math.round(totalMs / 1000);
      record(seconds);
      showDone(seconds, true);
      if (voiceOn) say('fin');
    }

    /** Arrêt : renvoie les secondes enregistrées, ou 0 si la séance était trop courte pour l'être. */
    function stop() {
      if (done) return 0;
      done = true;
      const elapsed = Math.min(timer.elapsed(), totalMs);
      cleanup();
      if (elapsed < MIN_RECORD_MS) return 0;
      const seconds = Math.floor(elapsed / 1000);
      record(seconds);
      return seconds;
    }
    stopSession = stop;

    function showDone(seconds, completed) {
      // L'adresse redevient « #/ » sans nouvelle entrée d'historique : recharger affiche l'accueil,
      // retour / avancer ne relancent rien.
      replaceHash('#/');
      const homeBtn = h('button', { type: 'button', class: 'btn btn-primary btn-wide', testid: 'btn-done-home', onclick: () => navigate('#/') }, 'Retour à l’accueil');
      const doneHeading = h('h1', { class: 'done-title', id: 'done-title', tabindex: '-1' }, completed ? 'Bravo !' : 'Bien joué');
      const screen = h('section', { class: withPhoto('done'), testid: 'done-screen', 'aria-labelledby': 'done-title' },
        backdrop?.nodes,
        h('div', { class: 'done-ball', 'aria-hidden': 'true' }),
        doneHeading,
        h('p', { class: 'done-text' }, 'Tu as respiré pendant ', h('strong', { testid: 'done-duration' }, formatDoneDuration(seconds)), '.'),
        h('p', { class: 'done-message', testid: 'done-message' }, DONE_MESSAGE),
        h('p', { class: 'done-sub' }, 'Prends encore un instant pour sentir comment tu te sens, avant de reprendre ta journée.'),
        h('div', { class: 'session-actions' },
          homeBtn,
          h('a', { href: '#/historique', class: 'btn btn-secondary btn-wide' }, 'Voir ma pratique'),
        ),
      );
      root.replaceChildren(screen);
      document.title = `${completed ? 'Bravo' : 'Séance arrêtée'} — Souffle`;
      window.scrollTo(0, 0);
      doneHeading.focus({ preventScroll: true });
    }

    btnPause.addEventListener('click', () => {
      if (done) return;
      if (timer.running) {
        timer.pause();
        setText(btnPause, 'Reprendre');
        view.classList.add('is-paused');
        silence();
        ambience?.pause();
      } else {
        timer.resume();
        setText(btnPause, 'Pause');
        view.classList.remove('is-paused');
        ambience?.resume();
      }
      scheduleEnd();
      render();
    });

    btnVoice.addEventListener('click', () => {
      if (done || !canSpeak) return;
      voiceOn = !voiceOn;
      if (!voiceOn) silence();
      refreshToggles();
    });

    btnAmbience?.addEventListener('click', () => {
      if (done || !ambience) return;
      ambienceOn = !ambienceOn;
      if (ambienceOn) ambience.unmute(); else ambience.mute();
      refreshToggles();
    });

    btnStop.addEventListener('click', () => {
      const seconds = stop();
      if (seconds > 0) { showDone(seconds, false); return; }
      // Trop court pour être enregistré : retour direct à l'accueil, à la place de l'adresse de la séance.
      replaceHash('#/');
      navigate('#/');
    });

    acquireWakeLock();
    // Accueil, puis « Inspire » s'il reste au moins 1,2 s de la première inspiration quand l'accueil se termine.
    if (voiceOn) {
      say('accueil', {
        next: PHASE_KEYS[phases[0].type],
        nextIf: () => voiceOn && !done && timer.running && lastIndex === 0 && timer.elapsed() <= phases[0].ms - 1200,
      });
    }
    render();
    rafId = requestAnimationFrame(frame);
    intervalId = setInterval(() => { if (!done) render(); }, 200);
    scheduleEnd();
    document.addEventListener('visibilitychange', onVisibility);
  }
}
