// Écran Réglages : couleur de balle, fond photo, ambiance sonore (et volume), voix et repères, thème.
import { h } from '../dom.js';
import { BALL_COLORS } from '../colors.js';
import { BACKGROUNDS } from '../backgrounds.js';
import { AMBIENCES } from '../ambience-data.js';
import { startAmbience } from '../ambience.js';
import { synthesisAvailable, voiceAvailable, prepareVoice, VOICE_CHOICES, setVoiceChoice, previewVoice, silence } from '../voice.js';
import { loadSettings, saveSettings, clampVolume } from '../storage.js';
import { applyTheme, applyBallColor } from '../theme.js';

export const title = 'Réglages — Souffle';
export const PREVIEW_MS = 10_000;
/** Durée maximale de l'aperçu de la voix (filet de sécurité si la fin de lecture n'est pas signalée). */
export const VOICE_PREVIEW_MS = 12_000;

/** Aide affichée sous le choix du thème, selon le choix en cours. */
export const THEME_HINTS = Object.freeze({
  auto: 'Automatique suit le réglage de ton téléphone.',
  light: 'Clair : un fond lumineux, agréable en journée.',
  dark: 'Sombre : plus doux pour les yeux, le soir ou dans le noir.',
});

export const VOICE_HINTS = Object.freeze({
  ok: 'Une voix calme dit «\u00a0Inspire\u00a0», «\u00a0Retiens\u00a0», «\u00a0Expire\u00a0», avec une phrase d’accueil et de fin.',
  none: 'Indisponible sur cet appareil : le navigateur ne sait pas parler.',
});

const volumeText = (v) => `${v} %`;

export function mount(root) {
  const settings = loadSettings();

  // --- Couleur de la balle ---
  const colorGroup = h('fieldset', { class: 'card colors', testid: 'ball-color', role: 'radiogroup', 'aria-labelledby': 'color-legend' },
    h('legend', { id: 'color-legend', class: 'card-title' }, 'Couleur de la balle'),
    h('div', { class: 'swatches' },
      BALL_COLORS.map((c, i) => {
        const id = `color-${i}`;
        return h('label', { class: 'swatch', for: id },
          h('input', {
            type: 'radio', name: 'ball-color', id, value: c.value, class: 'swatch-input',
            style: `--swatch: ${c.value}`, checked: c.value === settings.ballColor,
            onchange: (e) => { if (e.target.checked) { saveSettings({ ballColor: c.value }); applyBallColor(c.value); } },
          }),
          h('span', { class: 'swatch-name' }, c.name),
        );
      }),
    ),
    h('div', { class: 'preview', 'aria-hidden': 'true' }, h('span', { class: 'preview-ball' })),
  );

  // --- Fond ---
  const backgroundSection = h('section', { class: 'card', 'aria-labelledby': 'bg-title' },
    h('h2', { class: 'card-title', id: 'bg-title' }, 'Fond'),
    h('p', { class: 'hint', id: 'bg-hint' }, 'La photo remplit l’écran pendant la séance et bouge très lentement. Un voile garde la balle et les textes bien lisibles.'),
    h('div', { class: 'bg-grid', role: 'radiogroup', testid: 'background-choice', 'aria-labelledby': 'bg-title', 'aria-describedby': 'bg-hint' },
      BACKGROUNDS.map((b) => h('label', { class: 'bg-option' },
        h('span', { class: 'bg-thumb' },
          b.file
            ? h('img', { src: b.file, alt: '', loading: 'lazy', decoding: 'async', width: 120, height: 160 })
            : h('span', { class: 'bg-none', 'aria-hidden': 'true' }, h('span', { class: 'bg-none-ball' })),
          h('input', {
            type: 'radio', name: 'background', value: b.id, class: 'bg-input', checked: b.id === settings.background,
            onchange: (e) => { if (e.target.checked) saveSettings({ background: b.id }); },
          }),
        ),
        h('span', { class: 'bg-name' }, b.name),
      )),
    ),
  );

  // --- Ambiance sonore ---
  let ambience = settings.ambience;
  let volume = settings.ambienceVolume;
  let preview = null;
  let previewTimer = 0;

  const listenBtn = h('button', { type: 'button', class: 'btn btn-secondary listen-btn', 'aria-describedby': 'amb-hint' }, 'Écouter');
  const stopPreview = (seconds = 1.2) => {
    clearTimeout(previewTimer);
    previewTimer = 0;
    if (preview) { preview.stop(seconds); preview = null; }
    listenBtn.textContent = 'Écouter';
  };
  const startPreview = () => {
    stopPreview(0.6);
    if (ambience === 'aucune') return;
    preview = startAmbience(ambience, { volume });
    if (!preview) return;
    listenBtn.textContent = 'Arrêter l’écoute';
    previewTimer = setTimeout(() => stopPreview(2), PREVIEW_MS);
  };
  const refreshListen = () => { listenBtn.disabled = ambience === 'aucune'; };
  listenBtn.addEventListener('click', () => { if (preview) stopPreview(); else startPreview(); });
  refreshListen();

  const ambienceGroup = h('div', { class: 'amb-grid', role: 'radiogroup', testid: 'ambience-choice', 'aria-labelledby': 'amb-title' },
    AMBIENCES.map((a) => h('label', { class: 'amb-option' },
      h('input', {
        type: 'radio', name: 'ambience', value: a.id, class: 'amb-input', checked: a.id === settings.ambience,
        onchange: (e) => {
          if (!e.target.checked) return;
          ambience = a.id;
          saveSettings({ ambience: a.id });
          refreshListen();
          if (preview) startPreview();
        },
      }),
      h('span', { class: 'amb-text' },
        h('span', { class: 'amb-name' }, a.name),
        h('span', { class: 'amb-hint' }, a.hint),
      ),
    )),
  );

  const volumeOut = h('output', { class: 'volume-value', for: 'ambience-volume', id: 'volume-value' }, volumeText(volume));
  const volumeInput = h('input', {
    type: 'range', id: 'ambience-volume', testid: 'ambience-volume', class: 'range', min: 0, max: 100, step: 1, value: volume,
    'aria-valuetext': volumeText(volume),
  });
  const onVolume = () => {
    volume = clampVolume(volumeInput.value);
    saveSettings({ ambienceVolume: volume });
    volumeOut.textContent = volumeText(volume);
    volumeInput.setAttribute('aria-valuetext', volumeText(volume));
    preview?.setVolume(volume);
  };
  volumeInput.addEventListener('input', onVolume);
  volumeInput.addEventListener('change', onVolume);

  const ambienceSection = h('section', { class: 'card', 'aria-labelledby': 'amb-title' },
    h('h2', { class: 'card-title', id: 'amb-title' }, 'Ambiance sonore'),
    h('p', { class: 'hint', id: 'amb-hint' }, 'Un fond sonore créé en direct par l’app, sans fichier. Il démarre et s’arrête en douceur avec la séance, et se tait en pause.'),
    ambienceGroup,
    h('div', { class: 'volume-row' },
      h('label', { for: 'ambience-volume', class: 'volume-label' }, 'Volume'),
      volumeInput,
      volumeOut,
    ),
    listenBtn,
  );

  // --- Thème ---
  const themeSelect = h('select', { id: 'theme', testid: 'theme', class: 'select', 'aria-describedby': 'theme-hint' },
    h('option', { value: 'auto' }, 'Automatique'),
    h('option', { value: 'light' }, 'Clair'),
    h('option', { value: 'dark' }, 'Sombre'),
  );
  themeSelect.value = settings.theme;
  const themeHint = h('p', { class: 'hint', id: 'theme-hint', 'aria-live': 'polite' }, THEME_HINTS[settings.theme]);
  themeSelect.addEventListener('change', () => {
    const s = saveSettings({ theme: themeSelect.value });
    applyTheme(s.theme);
    themeHint.textContent = THEME_HINTS[s.theme];
  });

  // --- Voix, son et vibration ---
  const toggle = (key, testid, labelText, hintText) => {
    const id = `toggle-${key}`;
    const input = h('input', {
      type: 'checkbox', id, testid, class: 'check', checked: settings[key], 'aria-describedby': `${id}-hint`,
      onchange: (e) => saveSettings({ [key]: e.target.checked }),
    });
    const hint = h('p', { class: 'hint', id: `${id}-hint` }, hintText);
    const row = h('div', { class: 'toggle-row' },
      h('div', { class: 'toggle-text' },
        h('label', { for: id, class: 'toggle-label' }, labelText),
        hint,
      ),
      input,
    );
    return { row, input, hint };
  };

  const voice = toggle('voice', 'toggle-voice', 'Voix qui guide', VOICE_HINTS.ok);
  const setVoiceAvailable = (ok) => {
    voice.input.disabled = !ok;
    voice.row.classList.toggle('is-unavailable', !ok);
    voice.hint.textContent = ok ? VOICE_HINTS.ok : VOICE_HINTS.none;
  };
  if (!synthesisAvailable()) {
    setVoiceAvailable(false);
    // Sans synthèse, les enregistrements de Zack peuvent quand même servir.
    prepareVoice().then((found) => { if (found && found.size && voice.row.isConnected) setVoiceAvailable(true); });
  }

  // --- Choix de la voix enregistrée + aperçu ---
  setVoiceChoice(settings.voiceChoice);
  let voicePlaying = false;
  let voiceTimer = 0;
  const voiceBtn = h('button', {
    type: 'button', class: 'btn btn-secondary listen-btn', testid: 'btn-voice-preview', 'aria-describedby': 'voice-choice-hint',
  }, 'Écouter');
  const endVoicePreview = () => {
    clearTimeout(voiceTimer);
    voiceTimer = 0;
    voicePlaying = false;
    voiceBtn.textContent = 'Écouter';
  };
  const stopVoicePreview = () => {
    if (voicePlaying) silence();
    endVoicePreview();
  };
  const startVoicePreview = () => {
    stopVoicePreview();
    voicePlaying = true;
    voiceBtn.textContent = 'Arrêter l’écoute';
    previewVoice(() => { if (voicePlaying) endVoicePreview(); });
    voiceTimer = setTimeout(stopVoicePreview, VOICE_PREVIEW_MS);
  };
  voiceBtn.addEventListener('click', () => { if (voicePlaying) stopVoicePreview(); else startVoicePreview(); });

  const voiceChoiceBlock = h('div', { class: 'voice-choice' },
    h('p', { class: 'voice-choice-title', id: 'voice-choice-title' }, 'Voix enregistrée'),
    h('p', { class: 'hint', id: 'voice-choice-hint' }, 'Choisis la voix qui te guide ; «\u00a0Écouter\u00a0» fait entendre la phrase d’accueil. Une phrase pas encore enregistrée est dite par la voix du téléphone.'),
    h('div', {
      class: 'amb-grid voice-grid', role: 'radiogroup', testid: 'voice-choice',
      'aria-labelledby': 'voice-choice-title', 'aria-describedby': 'voice-choice-hint',
    },
      VOICE_CHOICES.map((v) => h('label', { class: 'amb-option' },
        h('input', {
          type: 'radio', name: 'voice-choice', value: v.id, class: 'amb-input', checked: v.id === settings.voiceChoice,
          onchange: (e) => {
            if (!e.target.checked) return;
            stopVoicePreview(); // jamais deux voix : changer de voix coupe l'aperçu en cours
            const saved = saveSettings({ voiceChoice: v.id });
            setVoiceChoice(saved.voiceChoice);
          },
        }),
        h('span', { class: 'amb-text' }, h('span', { class: 'amb-name' }, v.name)),
      )),
    ),
    voiceBtn,
  );
  const setPreviewAvailable = (ok) => { voiceBtn.disabled = !ok; };
  setPreviewAvailable(synthesisAvailable());
  prepareVoice().then(() => { if (voiceBtn.isConnected) setPreviewAvailable(voiceAvailable()); });

  root.append(
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1' }, 'Réglages'),
      h('p', { class: 'lead' }, 'Ajuste l’app à ton goût. Tes choix sont gardés sur cet appareil.'),
    ),
    colorGroup,
    backgroundSection,
    ambienceSection,
    h('section', { class: 'card', 'aria-labelledby': 'cues-title' },
      h('h2', { class: 'card-title', id: 'cues-title' }, 'Voix et repères'),
      h('p', { class: 'hint' }, 'Chaque option se règle séparément. Pendant la séance, la voix et l’ambiance se coupent d’un geste.'),
      voice.row,
      voiceChoiceBlock,
      toggle('sound', 'toggle-sound', 'Repère sonore', 'Un son doux à chaque changement de phase.').row,
      toggle('vibration', 'toggle-vibration', 'Vibration', 'Une petite vibration à chaque changement de phase, si ton téléphone le permet.').row,
    ),
    h('section', { class: 'card', 'aria-labelledby': 'theme-title' },
      h('h2', { class: 'card-title', id: 'theme-title' }, h('label', { for: 'theme' }, 'Thème')),
      themeSelect,
      themeHint,
    ),
  );
  return () => { stopPreview(0.4); stopVoicePreview(); };
}
