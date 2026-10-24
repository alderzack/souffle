// Ambiances sonores générées en direct par Web Audio : aucun fichier, aucune requête réseau.
//
//  - mer      : grondement (bruit brun) + vagues (bruit rose filtré) dont le filtre et le volume suivent
//               une houle lente (~0,1 Hz, mise en forme : montée lente, retombée plus franche) + écume.
//  - forêt    : vent doux (bruit rose en passe-bande qui ondule) + feuillage + chants d'oiseaux
//               synthétisés (oscillateurs avec glissandos courts) à intervalles aléatoires, dans l'espace.
//  - mystique : nappe d'accord consonant (ré majeur, voix légèrement désaccordées) sous un filtre qui
//               respire lentement + bol chantant (partiels inharmoniques à longue décroissance, battements)
//               frappé toutes les 12 à 20 s.
//
// Volume : gain maître proportionnel au réglage. Fondus d'entrée et de sortie ≥ 1 s ; pause et
// coupure = fondu à 0 (les événements aléatoires s'arrêtent aussi). Rien ne lève jamais d'erreur.
import { getAudioContext } from './feedback.js';
import { AMBIENCE_IDS, gainForVolume } from './ambience-data.js';

export { AMBIENCES, AMBIENCE_IDS, gainForVolume, getAmbience } from './ambience-data.js';

export const FADE_IN_S = 2.5;
export const FADE_OUT_S = 2.5;
export const PAUSE_FADE_S = 1;
export const RESUME_FADE_S = 1.5;

// Niveau propre de chaque ambiance (équilibrées entre elles, mesuré par rendu hors ligne).
const LEVELS = { mer: 1, foret: 1.6, mystique: 0.75 };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const cents = (c) => Math.pow(2, c / 1200);

// ------------------------------------------------------------------ tampons (bruits, réverbération)
const buffers = new WeakMap();

function store(ctx) {
  let s = buffers.get(ctx);
  if (!s) { s = {}; buffers.set(ctx, s); }
  return s;
}

/** Bruit stéréo (canaux indépendants) qui boucle sans clic (fondu enchaîné de la fin sur le début). */
function noiseBuffer(ctx, kind) {
  const s = store(ctx);
  if (s[kind]) return s[kind];
  const rate = ctx.sampleRate;
  const n = Math.floor(8 * rate);
  const fade = Math.floor(0.3 * rate);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const tmp = new Float32Array(n + fade);
    if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < tmp.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        tmp[i] = last * 3.5;
      }
    } else { // rose (filtre de Paul Kellet)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < tmp.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    const data = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      if (i < fade) {
        const x = i / fade;
        data[i] = tmp[i] * Math.sqrt(x) + tmp[n + i] * Math.sqrt(1 - x);
      } else data[i] = tmp[i];
    }
  }
  s[kind] = buf;
  return buf;
}

/** Réponse impulsionnelle de salle synthétique : bruit qui décroît et s'assombrit. */
function impulse(ctx, seconds) {
  const s = store(ctx);
  const key = `ir${seconds}`;
  if (s[key]) return s[key];
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const a = 0.85 - 0.7 * x; // le filtre se ferme : la queue est plus sombre
      y += a * ((Math.random() * 2 - 1) - y);
      data[i] = y * Math.pow(1 - x, 2.6);
    }
  }
  s[key] = buf;
  return buf;
}

// ------------------------------------------------------------------ moteur
class Ambience {
  constructor(ctx, id, volume, destination) {
    this.ctx = ctx;
    this.id = id;
    this.volume = volume;
    this.paused = false;
    this.muted = false;
    this.stopped = false;
    this.sources = [];
    this.timers = new Set();
    this.loops = [];

    const t = ctx.currentTime;
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, t);
    this.ramp = { v0: 0, v1: 0, t0: t, t1: t };
    this.master.connect(destination || ctx.destination);
    this.out = this.gain(LEVELS[id] || 1);
    this.out.connect(this.master);
    // Réverbération partagée (envoi).
    this.send = this.gain(1);
    try {
      const conv = ctx.createConvolver();
      conv.buffer = impulse(ctx, id === 'mystique' ? 5 : 3);
      this.send.connect(conv).connect(this.out);
    } catch { /* pas de réverbération : le son reste correct */ }

    if (id === 'mer') this.buildSea();
    else if (id === 'foret') this.buildForest();
    else this.buildMystic();

    this.fade(this.target(), FADE_IN_S);
    this.runLoops();
  }

  // --- petits constructeurs (constructeurs Web Audio avec options ; repli sur les méthodes create*)
  gain(v) {
    try { return new GainNode(this.ctx, { gain: v }); } catch { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  }
  filter(type, f, q = 0.7) {
    try { return new BiquadFilterNode(this.ctx, { type, frequency: f, Q: q }); } catch {
      const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
    }
  }
  osc(type, f) {
    try { return new OscillatorNode(this.ctx, { type, frequency: f }); } catch {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o;
    }
  }
  pan(p) {
    try { return new StereoPannerNode(this.ctx, { pan: p }); } catch {
      if (typeof this.ctx.createStereoPanner !== 'function') return this.gain(1);
      const n = this.ctx.createStereoPanner(); n.pan.value = p; return n;
    }
  }
  /** Source continue (démarrée tout de suite, arrêtée avec l'ambiance). */
  keep(src, offset = 0) {
    src.start(this.ctx.currentTime, offset);
    this.sources.push(src);
    return src;
  }
  noise(kind) {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuffer(this.ctx, kind);
    s.loop = true;
    return this.keep(s, rand(0, 7));
  }
  /** Oscillateur lent (LFO) relié à un paramètre : valeur = base + profondeur × sinus. */
  lfo(freq, depth, param, type = 'sine') {
    const o = this.osc(type, freq);
    const g = this.gain(depth);
    o.connect(g);
    if (param) g.connect(param);
    this.keep(o);
    return g;
  }

  // --- état
  target() { return this.paused || this.muted || this.stopped ? 0 : gainForVolume(this.volume); }
  active() { return !this.paused && !this.muted && !this.stopped; }

  /** Niveau du gain maître à l'instant `t`, calculé à partir de la dernière rampe (sans lire AudioParam.value). */
  levelAt(t) {
    const r = this.ramp;
    if (!r) return 0;
    if (t >= r.t1) return r.v1;
    if (t <= r.t0) return r.v0;
    return r.v0 + ((r.v1 - r.v0) * (t - r.t0)) / (r.t1 - r.t0);
  }

  /** Rampe linéaire du gain maître vers `value` en `seconds`, en partant du niveau actuel. */
  fade(value, seconds) {
    try {
      const p = this.master.gain;
      const now = this.ctx.currentTime;
      const current = this.levelAt(now);
      p.cancelScheduledValues(now);
      p.setValueAtTime(current, now);
      p.linearRampToValueAtTime(value, now + seconds);
      this.ramp = { v0: current, v1: value, t0: now, t1: now + seconds };
    } catch { /* ignoré */ }
  }

  later(fn, ms) {
    const id = setTimeout(() => { this.timers.delete(id); if (this.active()) fn(); }, ms);
    this.timers.add(id);
  }
  clearTimers() { for (const id of this.timers) clearTimeout(id); this.timers.clear(); }
  runLoops() { if (this.active()) for (const start of this.loops) start(); }

  setPaused(on) {
    if (this.stopped || this.paused === on) return;
    this.paused = on;
    if (on) { this.clearTimers(); this.fade(0, PAUSE_FADE_S); } else { this.fade(this.target(), RESUME_FADE_S); this.runLoops(); }
  }
  setMuted(on) {
    if (this.stopped || this.muted === on) return;
    this.muted = on;
    if (on) { this.clearTimers(); this.fade(0, PAUSE_FADE_S); } else { this.fade(this.target(), RESUME_FADE_S); this.runLoops(); }
  }
  setVolume(v) {
    this.volume = v;
    if (this.active()) this.fade(this.target(), 0.25);
  }
  stop(seconds = FADE_OUT_S) {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    clearTimeout(this.waveTimer);
    this.fade(0, seconds);
    const end = this.ctx.currentTime + seconds + 0.1;
    let pending = this.sources.length;
    const done = () => { pending -= 1; if (pending <= 0) { try { this.master.disconnect(); } catch { /* ignoré */ } } };
    for (const s of this.sources) {
      try { s.onended = done; s.stop(end); } catch { done(); }
    }
    if (!this.sources.length) done();
  }

  // ---------------------------------------------------------------- la mer
  buildSea() {
    // Grondement lointain : bruit brun très filtré.
    const rumble = this.noise('brown');
    const rLp = this.filter('lowpass', 360, 0.5);
    const rG = this.gain(0.26);
    rumble.connect(rLp).connect(rG).connect(this.out);

    // Vagues : bruit rose dont la brillance (filtre) et le volume suivent chaque vague. Les vagues sont
    // programmées une à une (7 à 12 s chacune, soit une houle de ~0,1 Hz), avec une hauteur au hasard :
    // jamais deux identiques, contrairement à un simple oscillateur.
    const waves = this.noise('pink');
    this.wLp = this.filter('lowpass', 320, 0.6);
    this.wG = this.gain(0.14);
    const wPan = this.pan(0);
    if (wPan.pan) this.lfo(0.019, 0.35, wPan.pan);
    waves.connect(this.wLp).connect(this.wG).connect(wPan);
    wPan.connect(this.out);
    const wSend = this.gain(0.18); wPan.connect(wSend).connect(this.send);

    // Écume : souffle aigu qui suit le sommet de la vague, un peu après.
    const foam = this.noise('pink');
    const fHp = this.filter('highpass', 2000, 0.5);
    const fLp = this.filter('lowpass', 6500, 0.5);
    this.fG = this.gain(0);
    foam.connect(fHp).connect(fLp).connect(this.fG).connect(this.out);

    // La houle continue pendant une pause ou une coupure (inaudible, gain maître à 0) : à la reprise, la mer
    // revient là où elle en est, au lieu de repartir d'un creux.
    this.nextWave = 0;
    const loop = () => {
      if (this.stopped) return;
      const now = this.ctx.currentTime;
      let t = Math.max(this.nextWave, now + 0.05);
      while (t < now + 14) {
        const d = rand(7, 12);
        this.wave(t, d);
        t += d + 0.01;
      }
      this.nextWave = t;
      this.waveTimer = setTimeout(loop, 5000);
    };
    loop();
  }

  /** Une vague : montée lente jusqu'au sommet (55 %), retombée plus franche ; l'écume suit avec un léger retard. */
  wave(t, d) {
    const n = 240;
    const amp = rand(0.55, 1);
    const shape = (x) => {
      if (x <= 0 || x >= 1) return 0;
      const c = 0.55;
      const s = x < c ? Math.sin((Math.PI / 2) * (x / c)) : Math.cos((Math.PI / 2) * ((x - c) / (1 - c)));
      return Math.pow(s * s, 1.2);
    };
    const g = new Float32Array(n);
    const f = new Float32Array(n);
    const foam = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      const sh = shape(x);
      g[i] = 0.14 + 0.5 * amp * sh;
      f[i] = 320 + 1500 * amp * sh;
      foam[i] = 0.1 * amp * shape((x - 0.12) / 0.88);
    }
    for (const [param, curve] of [[this.wG.gain, g], [this.wLp.frequency, f], [this.fG.gain, foam]]) {
      try { param.setValueCurveAtTime(curve, t, d); } catch { /* chevauchement improbable : vague sautée */ }
    }
  }

  // ---------------------------------------------------------------- la forêt
  buildForest() {
    // Vent : bruit rose en passe-bande large qui ondule lentement (rafales douces).
    const wind = this.noise('pink');
    const bp = this.filter('bandpass', 480, 0.45);
    const lp = this.filter('lowpass', 1500, 0.5);
    const g = this.gain(0.42);
    this.lfo(0.043, 220, bp.frequency);
    this.lfo(0.071, 0.2, g.gain);
    wind.connect(bp).connect(lp).connect(g).connect(this.out);

    // Feuillage : souffle aigu très léger qui suit les rafales.
    const leaves = this.noise('pink');
    const lHp = this.filter('highpass', 2600, 0.5);
    const lLp = this.filter('lowpass', 7000, 0.5);
    const lG = this.gain(0.03);
    this.lfo(0.071, 0.025, lG.gain);
    leaves.connect(lHp).connect(lLp).connect(lG).connect(this.out);

    // Profondeur : grave lointain.
    const floor = this.noise('brown');
    const fLp = this.filter('lowpass', 220, 0.5);
    const fG = this.gain(0.12);
    floor.connect(fLp).connect(fG).connect(this.out);

    // Oiseaux : un peu adoucis par la distance, dans la réverbération.
    this.birdBus = this.gain(1);
    const bLp = this.filter('lowpass', 7500, 0.5);
    this.birdBus.connect(bLp).connect(this.out);
    const bSend = this.gain(0.45); this.birdBus.connect(bSend).connect(this.send);

    const loop = () => {
      this.birdPhrase(this.ctx.currentTime + 0.05);
      this.later(loop, rand(2500, 8000));
    };
    this.loops.push(() => this.later(loop, rand(700, 2200)));
  }

  /** Une note d'oiseau : sinus avec glissando court, enveloppe rapide, vibrato éventuel. */
  chirp(dest, t, f0, f1, dur, level, vib) {
    const ctx = this.ctx;
    const o = this.osc('sine', f0);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + Math.min(0.018, dur * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env).connect(dest);
    const nodes = [o, env];
    if (vib) {
      const v = this.osc('sine', vib.rate);
      const vg = this.gain(vib.depth);
      v.connect(vg).connect(o.frequency);
      v.start(t);
      v.stop(t + dur + 0.02);
      nodes.push(v, vg);
    }
    o.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* ignoré */ } } };
    o.start(t);
    o.stop(t + dur + 0.02);
    return t + dur;
  }

  /** Une phrase d'oiseau (espèce tirée au hasard), placée au hasard dans l'espace. */
  birdPhrase(t0, answer = false) {
    const ctx = this.ctx;
    const scale = rand(0.9, 1.08);
    const level = answer ? rand(0.025, 0.05) : rand(0.055, 0.11);
    const p = this.pan(answer ? rand(-0.9, 0.9) : rand(-0.75, 0.75));
    const g = this.gain(1);
    g.connect(p).connect(this.birdBus);
    let t = t0;
    const species = pick(['mesange', 'merle', 'trille', 'rougegorge']);
    if (species === 'mesange') {
      const reps = 2 + Math.floor(Math.random() * 3);
      for (let r = 0; r < reps; r++) {
        t = this.chirp(g, t, 5300 * scale, 4900 * scale, 0.08, level) + 0.05;
        t = this.chirp(g, t, 4000 * scale, 3650 * scale, 0.11, level * 0.85) + 0.14;
      }
    } else if (species === 'merle') {
      const notes = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < notes; i++) {
        const f = rand(1700, 3000) * scale;
        const vib = Math.random() < 0.35 ? { rate: rand(24, 36), depth: rand(40, 90) } : null;
        t = this.chirp(g, t, f, f * rand(0.85, 1.2), rand(0.12, 0.28), level * rand(0.7, 1), vib) + rand(0.05, 0.12);
      }
    } else if (species === 'trille') {
      const n = 8 + Math.floor(Math.random() * 7);
      for (let i = 0; i < n; i++) t = this.chirp(g, t, 3200 * scale, 4700 * scale, 0.032, level * 0.7) + 0.026;
    } else {
      let f = rand(5800, 6800) * scale;
      const notes = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < notes; i++) {
        t = this.chirp(g, t, f, f * rand(0.9, 1.1), rand(0.06, 0.14), level * rand(0.75, 1)) + rand(0.03, 0.08);
        f *= rand(0.82, 0.95);
      }
    }
    // Nettoyage du petit bus de la phrase une fois fini (horloge audio, pas de minuteur).
    const cleanupAt = (t - ctx.currentTime + 0.5) * 1000;
    setTimeout(() => { try { g.disconnect(); p.disconnect(); } catch { /* ignoré */ } }, Math.max(0, cleanupAt));
    // Parfois, un autre oiseau répond au loin.
    if (!answer && Math.random() < 0.35) this.birdPhrase(t + rand(0.6, 1.8), true);
  }

  // ---------------------------------------------------------------- musique mystique
  buildMystic() {
    // Nappe : accord de ré majeur (ré, la, ré, fa#), chaque voix = deux oscillateurs légèrement désaccordés.
    const padBus = this.gain(1);
    const lp = this.filter('lowpass', 950, 0.6);
    this.lfo(0.023, 420, lp.frequency);
    padBus.connect(lp);
    lp.connect(this.out);
    const pSend = this.gain(0.55); lp.connect(pSend).connect(this.send);

    const chord = [
      { f: 146.83, level: 0.1 },
      { f: 220.0, level: 0.075 },
      { f: 293.66, level: 0.055 },
      { f: 369.99, level: 0.035 },
    ];
    for (const { f, level } of chord) {
      const voice = this.gain(level);
      this.lfo(rand(0.03, 0.08), level * 0.45, voice.gain);
      const a = this.osc('sine', f * cents(-2));
      const b = this.osc('triangle', f * cents(2.5));
      const ga = this.gain(0.7);
      const gb = this.gain(0.3);
      a.connect(ga).connect(voice);
      b.connect(gb).connect(voice);
      this.keep(a);
      this.keep(b);
      voice.connect(padBus);
    }

    // Bol chantant : premier coup peu après le début, puis toutes les 12 à 20 s.
    const loop = () => {
      this.bowl(this.ctx.currentTime + 0.05);
      this.later(loop, rand(12000, 20000));
    };
    this.loops.push(() => this.later(loop, rand(1500, 3000)));
  }

  /** Un coup de bol chantant : partiels inharmoniques (avec battements) à longue décroissance. */
  bowl(t) {
    const ctx = this.ctx;
    const base = pick([220.0, 246.94, 293.66]);
    const level = rand(0.1, 0.15);
    const partials = [
      { r: 1, a: 1, d: 18, beat: 0.7 },
      { r: 2.71, a: 0.45, d: 10, beat: 1.3 },
      { r: 5.15, a: 0.2, d: 6, beat: 2.1 },
      { r: 8.3, a: 0.08, d: 3.6, beat: 3 },
    ];
    const p = this.pan(rand(-0.3, 0.3));
    const dry = this.gain(0.7);
    const wet = this.gain(0.8);
    p.connect(dry).connect(this.out);
    p.connect(wet).connect(this.send);
    const all = [p, dry, wet];
    for (const pt of partials) {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(level * pt.a, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t + pt.d);
      env.connect(p);
      all.push(env);
      for (const df of [0, pt.beat]) {
        const o = this.osc('sine', base * pt.r + df);
        const half = this.gain(0.5);
        o.connect(half).connect(env);
        o.start(t);
        o.stop(t + pt.d + 0.05);
        all.push(o, half);
      }
    }
    // Le maillet : un souffle très bref et feutré.
    const strike = ctx.createBufferSource();
    strike.buffer = noiseBuffer(ctx, 'pink');
    const sBp = this.filter('bandpass', base * 2.7, 1.2);
    const sG = ctx.createGain();
    sG.gain.setValueAtTime(0.0001, t);
    sG.gain.linearRampToValueAtTime(level * 0.25, t + 0.004);
    sG.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    strike.connect(sBp).connect(sG).connect(p);
    strike.start(t, rand(0, 7));
    strike.stop(t + 0.08);
    all.push(strike, sBp, sG);
    setTimeout(() => { for (const n of all) { try { n.disconnect(); } catch { /* ignoré */ } } }, (t - ctx.currentTime + 18.5) * 1000);
  }
}

/**
 * Démarre une ambiance (fondu d'entrée). Renvoie une commande { pause, resume, mute, unmute, setVolume, stop },
 * ou null si l'ambiance est « aucune » ou si le navigateur ne sait pas faire de son.
 * `ctx` / `destination` : pour un rendu hors ligne (OfflineAudioContext) ; par défaut le contexte partagé.
 */
export function startAmbience(id, { volume = 50, ctx = null, destination = null } = {}) {
  if (!AMBIENCE_IDS.includes(id) || id === 'aucune') return null;
  try {
    const c = ctx || getAudioContext();
    if (!c) return null;
    const a = new Ambience(c, id, volume, destination);
    return {
      id,
      pause: () => a.setPaused(true),
      resume: () => a.setPaused(false),
      mute: () => a.setMuted(true),
      unmute: () => a.setMuted(false),
      setVolume: (v) => a.setVolume(v),
      stop: (seconds) => a.stop(seconds),
      get muted() { return a.muted; },
      get paused() { return a.paused; },
      /** Pour un rendu hors ligne : événements ponctuels à un instant donné. */
      _engine: a,
    };
  } catch {
    return null;
  }
}
