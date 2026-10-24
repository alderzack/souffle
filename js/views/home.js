// Écran d'accueil : choix de la durée et de l'exercice.
import { h } from '../dom.js';
import { EXERCISES, PERSO_FIELDS, PERSO_MIN, PERSO_MAX, phasesText, validateTiming, timingFor } from '../exercises.js';
import { loadSettings, saveSettings, clampDuration, DURATION_MIN, DURATION_MAX } from '../storage.js';
import { primeAudio } from '../feedback.js';
import { navigate } from '../router.js';
import { ambianceSummary } from '../summary.js';
import { prepareVoice, setVoiceChoice } from '../voice.js';

export const title = 'Souffle — respiration guidée';

export function mount(root) {
  let settings = loadSettings();
  setVoiceChoice(settings.voiceChoice);
  if (settings.voice) prepareVoice(); // savoir à l'avance si la voix de Zack est enregistrée

  // --- Durée ---
  const durationInput = h('input', {
    id: 'duration', type: 'number', inputmode: 'numeric', min: DURATION_MIN, max: DURATION_MAX, step: 1,
    value: settings.duration, testid: 'duration', class: 'stepper-input', 'aria-label': 'Durée de la séance en minutes', 'aria-describedby': 'duration-hint',
  });
  const commitDuration = (clamp) => {
    const raw = durationInput.value.trim();
    const n = Number(raw);
    if (clamp) {
      const v = clampDuration(raw === '' ? settings.duration : n);
      durationInput.value = String(v);
      settings = saveSettings({ duration: v });
    } else if (raw !== '' && Number.isInteger(n) && n >= DURATION_MIN && n <= DURATION_MAX) {
      settings = saveSettings({ duration: n });
    }
  };
  durationInput.addEventListener('input', () => commitDuration(false));
  durationInput.addEventListener('change', () => commitDuration(true));
  const step = (delta) => {
    durationInput.value = String(clampDuration((Number(durationInput.value) || settings.duration) + delta));
    commitDuration(true);
  };

  const durationBlock = h('section', { class: 'card duration', 'aria-labelledby': 'duration-title' },
    h('h2', { id: 'duration-title', class: 'card-title' }, 'Durée de la séance'),
    h('div', { class: 'stepper' },
      h('button', { type: 'button', class: 'btn btn-round', 'aria-label': 'Une minute de moins', onclick: () => step(-1) }, '−'),
      h('label', { class: 'stepper-field', for: 'duration' },
        durationInput,
        h('span', { class: 'stepper-unit', 'aria-hidden': 'true' }, 'min'),
      ),
      h('button', { type: 'button', class: 'btn btn-round', 'aria-label': 'Une minute de plus', onclick: () => step(1) }, '+'),
    ),
    h('p', { id: 'duration-hint', class: 'hint' }, `De ${DURATION_MIN} à ${DURATION_MAX} minutes. Ta durée est retenue pour la prochaine fois.`),
  );

  // --- Cartes d'exercice ---
  const cards = EXERCISES.map((ex) => (ex.id === 'perso' ? persoCard(ex) : exerciseCard(ex)));

  function start(id) {
    commitDuration(true);
    if (settings.sound || settings.ambience !== 'aucune') primeAudio();
    navigate(`#/seance/${id}`, { start: id }); // clic explicite : séance affichée et démarrée tout de suite
  }

  function exerciseCard(ex) {
    return h('article', { class: 'card exercise', testid: 'exercise-card', dataset: { exercise: ex.id }, 'aria-labelledby': `name-${ex.id}` },
      h('p', { class: 'tag' }, ex.tag),
      h('h2', { class: 'card-title', id: `name-${ex.id}`, testid: 'exercise-name' }, ex.name),
      h('p', { class: 'phases', testid: 'exercise-phases' }, phasesText(ex.timing)),
      h('p', { class: 'desc', testid: 'exercise-desc' }, ex.desc),
      h('button', {
        type: 'button', class: 'btn btn-primary', testid: `btn-start-${ex.id}`,
        'aria-label': `Commencer : ${ex.name}`, onclick: () => start(ex.id),
      }, 'Commencer'),
    );
  }

  function persoCard(ex) {
    const inputs = {};
    const phasesEl = h('p', { class: 'phases', testid: 'exercise-phases', 'aria-live': 'polite' });
    const errorEl = h('p', { class: 'error', testid: 'perso-error', id: 'perso-error', role: 'alert', hidden: true });
    const startBtn = h('button', {
      type: 'button', class: 'btn btn-primary', testid: 'btn-start-perso',
      'aria-label': `Commencer : ${ex.name}`, onclick: () => { if (!read().error) start('perso'); },
    }, 'Commencer');

    const read = () => {
      const timing = {};
      for (const f of PERSO_FIELDS) {
        const raw = inputs[f.key].value.trim();
        timing[f.key] = raw === '' ? NaN : Number(raw);
      }
      return { timing, error: validateTiming(timing) };
    };

    const refresh = () => {
      const { timing, error } = read();
      errorEl.hidden = !error;
      errorEl.textContent = error || '';
      startBtn.disabled = Boolean(error);
      for (const f of PERSO_FIELDS) {
        const v = timing[f.key];
        const bad = !Number.isInteger(v) || v < PERSO_MIN || v > PERSO_MAX
          || ((f.key === 'inspire' || f.key === 'expire') && v < 1);
        inputs[f.key].setAttribute('aria-invalid', error && bad ? 'true' : 'false');
        if (error) inputs[f.key].setAttribute('aria-describedby', 'perso-error');
        else inputs[f.key].removeAttribute('aria-describedby');
      }
      if (!error) {
        settings = saveSettings({ perso: timing });
        phasesEl.textContent = phasesText(timing);
      }
    };

    const current = timingFor(ex, settings);
    const fields = PERSO_FIELDS.map((f) => {
      const id = `perso-${f.key}`;
      inputs[f.key] = h('input', {
        id, type: 'number', inputmode: 'numeric', min: PERSO_MIN, max: PERSO_MAX, step: 1,
        value: current[f.key], testid: f.testid, class: 'num-input',
        oninput: refresh, onchange: refresh,
      });
      return h('div', { class: 'field' },
        h('label', { for: id }, f.label),
        h('span', { class: 'num-wrap' }, inputs[f.key], h('span', { class: 'num-unit', 'aria-hidden': 'true' }, 's')),
      );
    });

    phasesEl.textContent = phasesText(current);

    return h('article', { class: 'card exercise perso', testid: 'exercise-card', dataset: { exercise: ex.id }, 'aria-labelledby': `name-${ex.id}` },
      h('p', { class: 'tag' }, ex.tag),
      h('h2', { class: 'card-title', id: `name-${ex.id}`, testid: 'exercise-name' }, ex.name),
      phasesEl,
      h('p', { class: 'desc', testid: 'exercise-desc' }, ex.desc),
      h('fieldset', { class: 'perso-fields' },
        h('legend', {}, 'Durées en secondes (0 à 15)'),
        h('div', { class: 'perso-grid' }, fields),
      ),
      errorEl,
      startBtn,
    );
  }

  root.append(
    h('header', { class: 'hero' },
      h('h1', { testid: 'app-title', class: 'app-title', tabindex: '-1' }, 'Souffle'),
      h('p', { class: 'lead' }, 'Prends un moment pour toi. Choisis un exercice, suis la balle, et laisse ton souffle ralentir.'),
    ),
    durationBlock,
    ambianceSummary(settings, 'home-summary'),
    h('section', { class: 'exercises', 'aria-label': 'Exercices' }, cards),
    h('p', { class: 'disclaimer', testid: 'disclaimer' }, 'Cette app ne remplace pas un avis médical.'),
  );

  return () => {};
}
