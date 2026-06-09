// Procedural audio via the Web Audio API — no asset files.
//
// Background music: chiptune arrangements of famous PUBLIC-DOMAIN melodies
// (their copyright expired long ago), one per world:
//   Grassy  -> Rossini, William Tell Overture (gallop finale)
//   Beach   -> Offenbach, Can-Can (Galop Infernal)
//   Ice     -> Tchaikovsky, Dance of the Sugar Plum Fairy
//   Candy   -> Fucik, Entry of the Gladiators (circus march)
//   Volcano -> Grieg, In the Hall of the Mountain King (menacing build)
//   Storm   -> Beethoven, Symphony No. 5 (the famous fate motif)
//   Jungle  -> Rimsky-Korsakov, Flight of the Bumblebee (frantic buzz)
//   Neon    -> original synthwave groove (E-minor night drive)
// Everything is wrapped in try/catch so audio can never break gameplay.

let ctx = null;
let master = null;     // mix bus (unity gain) — every voice and SFX connects here
let masterOut = null;  // final stage: master volume + mute
let enabled = true;
let muted = false;
const VOLUME = 0.45;

// A simple decaying-noise impulse response for the reverb convolver. Stereo, so
// the tail spreads a little width across the speakers.
function makeImpulse(c, seconds, decay) {
  const rate = c.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
  }
  return buf;
}

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();

    // Final output stage carries the master volume + mute.
    masterOut = ctx.createGain();
    masterOut.gain.value = muted ? 0 : VOLUME;
    masterOut.connect(ctx.destination);

    // A gentle bus compressor glues the mix together and tames peaks when many
    // sounds stack (countdown + boost + shells + music all at once).
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 26;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(masterOut);

    // The mix bus everything plays into (toneAt / drumAt connect to `master`).
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(comp);

    // A short, high-passed reverb send adds a sense of space and glues the
    // chiptune without muddying the low end (bass/kick stay tight).
    try {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, 1.1, 2.6);
      const revHP = ctx.createBiquadFilter();
      revHP.type = 'highpass';
      revHP.frequency.value = 480;
      const revSend = ctx.createGain();
      revSend.gain.value = 0.14;
      master.connect(revSend);
      revSend.connect(revHP);
      revHP.connect(conv);
      conv.connect(comp);
    } catch (e) { /* reverb is optional — the dry mix still plays */ }
  } catch (e) {
    enabled = false;
  }
  return ctx;
}

export function resumeAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (masterOut) masterOut.gain.value = muted ? 0 : VOLUME;
  return muted;
}

// --- note helpers -----------------------------------------------------------
const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteFreq(name) {
  // e.g. "C5", "D#5", "Bb4"
  let i = 0;
  let semis = SEMITONE[name[i]];
  i += 1;
  if (name[i] === '#') { semis += 1; i += 1; } else if (name[i] === 'b') { semis -= 1; i += 1; }
  const octave = parseInt(name.slice(i), 10);
  const midi = (octave + 1) * 12 + semis;
  return 440 * 2 ** ((midi - 69) / 12);
}

function rep(pattern, times) {
  let out = [];
  for (let k = 0; k < times; k += 1) out = out.concat(pattern);
  return out;
}

// --- low-level synths -------------------------------------------------------
function toneAt(freq, at, dur, type, gain) {
  const c = ctx;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  } catch (e) { /* ignore */ }
}

function drumAt(kind, at, gain) {
  const c = ctx;
  try {
    if (kind === 'k') {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, at);
      osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      osc.connect(g); g.connect(master);
      osc.start(at); osc.stop(at + 0.16);
    } else {
      const len = Math.floor(c.sampleRate * 0.09);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain * 0.6;
      src.connect(g); g.connect(master);
      src.start(at);
    }
  } catch (e) { /* ignore */ }
}

// --- SFX --------------------------------------------------------------------
// A tone that glides f0 -> f1 over `dur` (whooshes, zaps, boings, sweeps).
function sweepAt(f0, f1, at, dur, type, gain) {
  const c = ctx;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g); g.connect(master);
    osc.start(at); osc.stop(at + dur + 0.03);
  } catch (e) { /* ignore */ }
}

// A filtered noise burst (whoosh / impact / dust / crackle). The filter cutoff
// can sweep f0 -> f1 across the burst for movement.
function noiseAt(at, dur, gain, filt, f0, f1, q) {
  const c = ctx;
  try {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const bq = c.createBiquadFilter();
    bq.type = filt;
    bq.Q.value = q || 1;
    bq.frequency.setValueAtTime(f0, at);
    if (f1 && f1 !== f0) bq.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.015, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bq); bq.connect(g); g.connect(master);
    src.start(at); src.stop(at + dur + 0.03);
  } catch (e) { /* ignore */ }
}

// Several tones struck together (chord stab).
function chordAt(freqs, at, dur, type, gain) {
  for (const f of freqs) toneAt(f, at, dur, type, gain);
}

// Layered, characterful sound effects. `opt` carries extra data (e.g. the
// drift charge tier). Every branch is best-effort; the master chain (compressor
// + reverb) gives them body and tames the peaks when several fire at once.
export function sfx(name, opt) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const n = noteFreq;
  switch (name) {
    case 'beep': // menu hover / countdown tick — a crisp pip
      toneAt(760, t, 0.10, 'square', 0.13);
      toneAt(1520, t, 0.05, 'square', 0.04);
      break;
    case 'go': // race start — whoosh + a bright triad
      sweepAt(320, 920, t, 0.26, 'sawtooth', 0.14);
      noiseAt(t, 0.3, 0.12, 'bandpass', 600, 2600, 1.2);
      chordAt([n('C5'), n('E5'), n('G5'), n('C6')], t + 0.05, 0.5, 'square', 0.10);
      break;
    case 'pickup': // grab an item box — sparkly ascending arpeggio
      [n('E5'), n('A5'), n('C6'), n('E6')].forEach((f, i) => toneAt(f, t + i * 0.05, 0.14, 'square', 0.11));
      toneAt(n('E6') * 2, t + 0.2, 0.18, 'sine', 0.04);
      break;
    case 'item': // activate any item — quick power-up swell
      sweepAt(420, 1100, t, 0.16, 'square', 0.10);
      toneAt(n('C5'), t + 0.04, 0.16, 'sawtooth', 0.07);
      break;
    case 'boost': // meter boost / boost pad / mushroom — a real whoosh
      noiseAt(t, 0.34, 0.15, 'bandpass', 480, 2700, 1.4);
      sweepAt(180, 540, t, 0.32, 'sawtooth', 0.10);
      toneAt(460, t, 0.3, 'square', 0.04);
      break;
    case 'drift': { // mini-turbo release — brighter with the charge tier (1..3)
      const tier = Math.max(1, Math.min(3, opt || 1));
      const base = 360 + tier * 150;
      sweepAt(base * 0.6, base * 1.7, t, 0.2, 'square', 0.12);
      noiseAt(t, 0.16, 0.09, 'highpass', 1800, 5200, 0.8);
      toneAt(base * 2.2, t + 0.06, 0.18, 'sine', 0.05);
      break;
    }
    case 'jump': // ramp launch — a rising "wheee"
      sweepAt(300, 1500, t, 0.32, 'sine', 0.12);
      noiseAt(t, 0.3, 0.09, 'bandpass', 800, 3200, 1.5);
      break;
    case 'land': // touchdown — thud + a little chirp
      noiseAt(t, 0.1, 0.12, 'lowpass', 1300, 320, 1);
      toneAt(160, t, 0.1, 'sine', 0.10);
      toneAt(n('G4'), t + 0.04, 0.12, 'square', 0.06);
      break;
    case 'bounce': // bounce pad — cartoon boing
      sweepAt(300, 820, t, 0.08, 'sine', 0.12);
      sweepAt(820, 380, t + 0.08, 0.14, 'sine', 0.10);
      break;
    case 'hit': // spun out — punchy impact
      noiseAt(t, 0.18, 0.18, 'lowpass', 1900, 280, 1);
      sweepAt(260, 70, t, 0.22, 'sawtooth', 0.15);
      drumAt('k', t, 0.12);
      break;
    case 'bump': // gentle knock (kart-kart / bystander)
      noiseAt(t, 0.07, 0.10, 'lowpass', 700, 280, 1);
      toneAt(150, t, 0.07, 'sine', 0.10);
      break;
    case 'shell': // fire a shell — a launching fwip
      sweepAt(900, 320, t, 0.16, 'sawtooth', 0.11);
      noiseAt(t, 0.14, 0.08, 'bandpass', 1200, 600, 2);
      break;
    case 'oildrop': // drop an oil slick — wet plop
      noiseAt(t, 0.16, 0.12, 'lowpass', 900, 240, 0.7);
      toneAt(170, t, 0.13, 'sine', 0.08);
      break;
    case 'shield': // shield up — shimmering rise
      [n('C5'), n('G5'), n('C6'), n('E6')].forEach((f, i) => toneAt(f, t + i * 0.05, 0.32, 'sine', 0.06));
      sweepAt(400, 1200, t, 0.26, 'triangle', 0.05);
      break;
    case 'shieldbreak': // a hit blocked by the shield — glassy shatter
      noiseAt(t, 0.12, 0.12, 'highpass', 2600, 6000, 0.8);
      [1800, 1400, 1000].forEach((f, i) => toneAt(f, t + i * 0.03, 0.1, 'triangle', 0.08));
      break;
    case 'star': // star pickup — magical sparkly run
      [n('C5'), n('E5'), n('G5'), n('C6'), n('E6'), n('G6')].forEach((f, i) => toneAt(f, t + i * 0.05, 0.16, 'square', 0.09));
      break;
    case 'lap': // cross the line — pleasant chime
      toneAt(n('G5'), t, 0.12, 'square', 0.12);
      toneAt(n('C6'), t + 0.1, 0.22, 'square', 0.12);
      toneAt(n('E6'), t + 0.1, 0.2, 'sine', 0.04);
      break;
    case 'finallap': // final lap — urgent alarm then a rising call
      [988, 784, 988, 784].forEach((f, i) => toneAt(f, t + i * 0.12, 0.12, 'square', 0.14));
      [659, 880, 1047, 1319].forEach((f, i) => toneAt(f, t + 0.52 + i * 0.09, 0.26, 'square', 0.16));
      break;
    case 'coin': // collect a coin — the classic two-note, with a sparkle tail
      toneAt(988, t, 0.06, 'square', 0.12);
      toneAt(1319, t + 0.05, 0.16, 'square', 0.12);
      toneAt(2637, t + 0.05, 0.12, 'sine', 0.03);
      break;
    case 'zap': // lightning — electric crackle + descending zap
      noiseAt(t, 0.18, 0.15, 'bandpass', 3000, 800, 6);
      sweepAt(1700, 200, t, 0.2, 'sawtooth', 0.13);
      [1320, 660, 990].forEach((f, i) => toneAt(f, t + i * 0.04, 0.05, 'sawtooth', 0.10));
      break;
    case 'finish': // cross the finish — bright resolved fanfare
      [523, 659, 784, 1047].forEach((f, i) => toneAt(f, t + i * 0.1, 0.3, 'square', 0.15));
      chordAt([523, 659, 784, 1047], t + 0.42, 0.55, 'square', 0.09);
      break;
    case 'fanfare': // ceremony — a grand cadence with a sparkle on top
      chordAt([n('C4'), n('E4'), n('G4')], t, 0.3, 'square', 0.09);
      chordAt([n('F4'), n('A4'), n('C5')], t + 0.3, 0.3, 'square', 0.09);
      chordAt([n('G4'), n('B4'), n('D5')], t + 0.6, 0.3, 'square', 0.09);
      chordAt([n('C5'), n('E5'), n('G5'), n('C6')], t + 0.9, 0.8, 'square', 0.11);
      [n('C6'), n('E6'), n('G6')].forEach((f, i) => toneAt(f, t + 0.95 + i * 0.07, 0.4, 'sine', 0.04));
      break;
    default: break;
  }
}

// --- music tracks (public-domain melodies) ----------------------------------
// Each note is [name|null(rest), beats]. Each tune is a 24-beat arrangement
// (three 8-beat phrases A/B/C, for variety before it repeats); melody & bass
// loops both total 24 beats so they stay locked, and the drum pattern tiles.
const TRACKS = {
  // Rossini — William Tell Overture (the galloping cavalry charge).
  Grassy: {
    bpm: 133, wave: 'triangle', bassWave: 'square', staccato: 0.55,
    melody: [
      // A — gallop + bugle
      ['G4', 0.25], ['G4', 0.25], ['G4', 0.5],
      ['G4', 0.25], ['G4', 0.25], ['G4', 0.5],
      ['G4', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25],
      ['G5', 0.5], ['G5', 0.5],
      ['G5', 0.25], ['G5', 0.25], ['G5', 0.5],
      ['E5', 0.25], ['E5', 0.25], ['E5', 0.5],
      ['C5', 0.25], ['E5', 0.25], ['G5', 0.25], ['C6', 0.25],
      ['G5', 0.5], ['E5', 0.5],
      // B — bugle call
      ['C5', 0.5], ['C5', 0.25], ['C5', 0.25], ['C5', 0.5], ['E5', 0.5],
      ['D5', 0.5], ['D5', 0.25], ['D5', 0.25], ['D5', 0.5], ['G4', 0.5],
      ['E5', 0.5], ['G5', 0.5], ['C6', 0.5], ['G5', 0.5],
      ['E5', 0.5], ['C5', 0.5], ['G4', 1],
      // C — high reprise
      ['C5', 0.25], ['C5', 0.25], ['C5', 0.5],
      ['E5', 0.25], ['E5', 0.25], ['E5', 0.5],
      ['G5', 0.25], ['G5', 0.25], ['G5', 0.5],
      ['C6', 0.5], ['G5', 0.5],
      ['G5', 0.25], ['E5', 0.25], ['C5', 0.25], ['E5', 0.25],
      ['G5', 0.25], ['E5', 0.25], ['C5', 0.25], ['G4', 0.25],
      ['C5', 0.5], ['E5', 0.5],
      ['G5', 0.5], ['C5', 0.5],
    ],
    bass: rep([['C3', 1], ['C3', 1], ['G2', 1], ['G2', 1], ['C3', 1], ['C3', 1], ['G2', 1], ['G2', 1]], 3),
    drum: [['k', 1], ['s', 1]],
  },

  // Offenbach — Can-Can (fast, bouncy).
  Beach: {
    bpm: 142, wave: 'square', bassWave: 'square', staccato: 0.7,
    melody: [
      // A
      ['C5', 0.5], ['C5', 0.25], ['D5', 0.25], ['E5', 0.5], ['F5', 0.5],
      ['E5', 0.5], ['C5', 0.5], ['G4', 0.5], ['C5', 0.5],
      ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 0.5],
      ['E5', 0.5], ['C5', 0.5], ['C5', 0.5], ['C5', 0.5],
      // B — high run
      ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5],
      ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 0.5],
      ['B5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5],
      ['E5', 0.5], ['D5', 0.5], ['C5', 1],
      // C — kicks
      ['E5', 0.25], ['E5', 0.25], ['E5', 0.5], ['D5', 0.25], ['D5', 0.25], ['D5', 0.5],
      ['C5', 0.5], ['C5', 0.5], ['G4', 0.5], ['G4', 0.5],
      ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F5', 0.5],
      ['G5', 0.5], ['E5', 0.5], ['C5', 1],
    ],
    bass: rep([['C3', 1], ['G3', 1]], 12),
    drum: [['k', 1], ['s', 1]],
  },

  // Tchaikovsky — Dance of the Sugar Plum Fairy (sparkly, staccato).
  Ice: {
    bpm: 121, wave: 'triangle', bassWave: 'sine', staccato: 0.4,
    melody: [
      // A
      ['E5', 0.5], ['D#5', 0.25], ['E5', 0.25], ['B4', 0.5], ['G4', 0.5],
      ['A4', 0.5], ['C5', 0.25], ['B4', 0.25], ['A4', 0.5], ['E4', 0.5],
      ['E5', 0.5], ['D#5', 0.25], ['E5', 0.25], ['B4', 0.5], ['G4', 0.5],
      ['B4', 0.5], ['A4', 0.25], ['G#4', 0.25], ['A4', 1],
      // B — lower answer
      ['C5', 0.5], ['B4', 0.25], ['C5', 0.25], ['G4', 0.5], ['E4', 0.5],
      ['F4', 0.5], ['A4', 0.25], ['G4', 0.25], ['F4', 0.5], ['C4', 0.5],
      ['C5', 0.5], ['B4', 0.25], ['C5', 0.25], ['G4', 0.5], ['E4', 0.5],
      ['G4', 0.5], ['F4', 0.25], ['E4', 0.25], ['F4', 1],
      // C — sparkle
      ['E5', 0.5], ['B4', 0.5], ['E5', 0.5], ['B4', 0.5],
      ['D#5', 0.25], ['E5', 0.25], ['F#5', 0.25], ['G5', 0.25], ['A5', 0.5], ['G5', 0.5],
      ['F#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['B4', 0.5],
      ['E5', 0.5], ['B4', 0.5], ['E5', 1],
    ],
    bass: rep([['A2', 2], ['E2', 2]], 6),
    drum: [['k', 2]],
  },

  // Fucik — Entry of the Gladiators (the circus chromatic descent).
  Candy: {
    bpm: 132, wave: 'square', bassWave: 'square', staccato: 0.6,
    melody: [
      // A — chromatic descent
      ['C5', 0.5], ['B4', 0.5], ['A#4', 0.5], ['A4', 0.5],
      ['G#4', 0.5], ['G4', 0.5], ['F#4', 0.5], ['F4', 0.5],
      ['E4', 0.5], ['F4', 0.5], ['F#4', 0.5], ['G4', 0.5],
      ['C5', 0.5], ['G4', 0.5], ['C5', 1],
      // B — higher descent
      ['E5', 0.5], ['D#5', 0.5], ['D5', 0.5], ['C#5', 0.5],
      ['C5', 0.5], ['B4', 0.5], ['A#4', 0.5], ['A4', 0.5],
      ['G#4', 0.5], ['A4', 0.5], ['A#4', 0.5], ['B4', 0.5],
      ['C5', 0.5], ['G4', 0.5], ['C5', 1],
      // C — bouncy march
      ['G4', 0.5], ['C5', 0.5], ['E5', 0.5], ['C5', 0.5],
      ['G4', 0.5], ['C5', 0.5], ['E5', 0.5], ['G5', 0.5],
      ['F5', 0.5], ['D5', 0.5], ['B4', 0.5], ['D5', 0.5],
      ['C5', 0.5], ['G4', 0.5], ['C5', 1],
    ],
    bass: rep([['C3', 0.5], ['G3', 0.5]], 24),
    drum: [['k', 1], ['s', 1]],
  },

  // Grieg — In the Hall of the Mountain King (B minor, creeping then frantic).
  Volcano: {
    bpm: 138, wave: 'sawtooth', bassWave: 'square', staccato: 0.55,
    melody: [
      // A — the creeping theme, low
      ['B3', 0.25], ['C#4', 0.25], ['D4', 0.25], ['E4', 0.25], ['F#4', 0.25], ['D4', 0.25], ['F#4', 0.5],
      ['F4', 0.25], ['D4', 0.25], ['F4', 0.5], ['E4', 0.25], ['C#4', 0.25], ['E4', 0.5],
      ['B3', 0.25], ['C#4', 0.25], ['D4', 0.25], ['E4', 0.25], ['F#4', 0.25], ['D4', 0.25], ['F#4', 0.25], ['B4', 0.25],
      ['A4', 0.25], ['F#4', 0.25], ['D4', 0.25], ['F#4', 0.25], ['A4', 0.5], ['B3', 0.5],
      // B — same theme an octave up (eruption)
      ['B4', 0.25], ['C#5', 0.25], ['D5', 0.25], ['E5', 0.25], ['F#5', 0.25], ['D5', 0.25], ['F#5', 0.5],
      ['F5', 0.25], ['D5', 0.25], ['F5', 0.5], ['E5', 0.25], ['C#5', 0.25], ['E5', 0.5],
      ['B4', 0.25], ['C#5', 0.25], ['D5', 0.25], ['E5', 0.25], ['F#5', 0.25], ['D5', 0.25], ['F#5', 0.25], ['B5', 0.25],
      ['A5', 0.25], ['F#5', 0.25], ['D5', 0.25], ['F#5', 0.25], ['B5', 1],
    ],
    bass: rep([['B2', 1], ['B2', 1], ['F#2', 1], ['F#2', 1]], 6),
    drum: [['k', 1], ['s', 1]],
  },

  // Beethoven — Symphony No. 5 fate motif (C minor, dramatic and stormy).
  Storm: {
    bpm: 132, wave: 'square', bassWave: 'square', staccato: 0.5,
    melody: [
      // A — the motif and its echo
      ['G4', 0.25], ['G4', 0.25], ['G4', 0.25], ['D#4', 1],
      ['F4', 0.25], ['F4', 0.25], ['F4', 0.25], ['D4', 1],
      ['G4', 0.25], ['G4', 0.25], ['G4', 0.25], ['D#4', 0.5], ['G#4', 0.25], ['G#4', 0.25], ['G#4', 0.25], ['G4', 0.5],
      ['D#5', 0.25], ['D#5', 0.25], ['D#5', 0.25], ['C5', 0.5], ['D5', 0.25], ['D5', 0.25], ['D5', 0.25], ['B4', 0.5],
      // B — rising tension
      ['C5', 0.25], ['C5', 0.25], ['C5', 0.25], ['G#4', 1],
      ['A#4', 0.25], ['A#4', 0.25], ['A#4', 0.25], ['G4', 1],
      ['G5', 0.25], ['G5', 0.25], ['G5', 0.25], ['D#5', 1],
      ['F5', 0.25], ['F5', 0.25], ['F5', 0.25], ['D5', 1],
      ['C5', 0.5], ['G4', 0.5], ['D#4', 0.5], ['C4', 1],
    ],
    bass: rep([['C3', 1], ['C3', 1], ['G2', 1], ['G2', 1], ['G#2', 1], ['G#2', 1], ['G2', 1], ['G2', 1]], 3),
    drum: [['k', 1], ['s', 1]],
  },

  // Rimsky-Korsakov — Flight of the Bumblebee (A minor, frantic chromatic buzz).
  Jungle: {
    bpm: 150, wave: 'sawtooth', bassWave: 'square', staccato: 0.45,
    melody: [
      // A — chromatic descent and climb (the buzzing)
      ['E5', 0.25], ['D#5', 0.25], ['D5', 0.25], ['C#5', 0.25], ['C5', 0.25], ['B4', 0.25], ['A#4', 0.25], ['A4', 0.25],
      ['G#4', 0.25], ['A4', 0.25], ['A#4', 0.25], ['B4', 0.25], ['C5', 0.25], ['C#5', 0.25], ['D5', 0.25], ['D#5', 0.25],
      ['E5', 0.25], ['D#5', 0.25], ['D5', 0.25], ['C#5', 0.25], ['C5', 0.25], ['B4', 0.25], ['A#4', 0.25], ['A4', 0.25],
      ['G#4', 0.25], ['G4', 0.25], ['F#4', 0.25], ['F4', 0.25], ['E4', 0.5], ['E5', 0.5],
      // B — buzzing around the nest
      ['E5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D#5', 0.25], ['E5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D5', 0.25],
      ['C5', 0.25], ['B4', 0.25], ['A4', 0.25], ['B4', 0.25], ['C5', 0.25], ['D5', 0.25], ['E5', 0.25], ['F5', 0.25],
      ['G5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D5', 0.25], ['C5', 0.25], ['B4', 0.25], ['A4', 0.25], ['G4', 0.25],
      ['A4', 0.5], ['E4', 0.5], ['A4', 1],
    ],
    bass: rep([['A2', 0.5], ['A2', 0.5], ['E2', 0.5], ['E2', 0.5]], 12),
    drum: [['k', 1], ['s', 0.5], ['k', 0.5]],
  },

  // Original synthwave night-drive groove (E minor arpeggios).
  Neon: {
    bpm: 128, wave: 'sawtooth', bassWave: 'square', staccato: 0.6,
    melody: [
      // A — climbing arpeggios
      ['E4', 0.25], ['B4', 0.25], ['E5', 0.25], ['G5', 0.25], ['F#5', 0.5], ['B4', 0.25], ['F#5', 0.25], ['E5', 0.5],
      ['C5', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['D5', 0.5], ['G4', 0.25], ['D5', 0.25], ['B4', 0.5],
      ['A4', 0.25], ['E4', 0.25], ['A4', 0.25], ['C5', 0.25], ['B4', 0.5], ['E4', 0.25], ['B4', 0.25], ['G4', 0.5],
      ['B4', 0.25], ['D5', 0.25], ['F#5', 0.25], ['B5', 0.25], ['A5', 0.5], ['F#5', 0.5], ['E5', 1],
      // B — high lead
      ['E5', 0.25], ['F#5', 0.25], ['G5', 0.25], ['A5', 0.25], ['B5', 0.5], ['A5', 0.25], ['G5', 0.25], ['F#5', 0.5],
      ['G5', 0.25], ['E5', 0.25], ['B4', 0.25], ['E5', 0.25], ['D5', 0.5], ['B4', 0.5], ['E5', 1],
    ],
    bass: rep([['E2', 0.5], ['E2', 0.5], ['C2', 0.5], ['C2', 0.5], ['G2', 0.5], ['G2', 0.5], ['B2', 0.5], ['B2', 0.5]], 4),
    drum: [['k', 1], ['s', 1]],
  },

  // Foster — Camptown Races (bouncy, sunny "doo-dah" romp).
  Desert: {
    bpm: 150, wave: 'square', bassWave: 'square', staccato: 0.6,
    melody: [
      // A — verse
      ['G4', 0.25], ['G4', 0.25], ['E4', 0.5], ['G4', 0.25], ['A4', 0.25], ['G4', 0.5], ['E4', 0.5],
      ['E4', 0.5], ['D4', 0.5], ['E4', 0.5], ['G4', 0.5],
      ['G4', 0.25], ['G4', 0.25], ['E4', 0.5], ['G4', 0.25], ['A4', 0.25], ['G4', 0.25], ['E4', 0.25], ['D4', 0.5], ['G4', 0.5],
      // B — chorus ("gonna run all night")
      ['D5', 0.5], ['B4', 0.5], ['D5', 0.25], ['D5', 0.25], ['B4', 0.5], ['G4', 0.5],
      ['A4', 0.5], ['B4', 0.5], ['A4', 0.25], ['G4', 0.25], ['E4', 0.5], ['D4', 0.5],
      ['G4', 0.25], ['G4', 0.25], ['E4', 0.5], ['G4', 0.25], ['A4', 0.25], ['G4', 0.25], ['E4', 0.25], ['D4', 0.5], ['C4', 0.5],
      ['G4', 0.5], ['G4', 0.5], ['C5', 1],
    ],
    bass: rep([['C3', 0.5], ['G3', 0.5], ['G2', 0.5], ['G3', 0.5]], 12),
    drum: [['k', 1], ['s', 1]],
  },

  // Saint-Saëns — "Aquarium" (Carnival of the Animals): shimmering, flowing water.
  Coral: {
    bpm: 100, wave: 'triangle', bassWave: 'sine', staccato: 0.5,
    melody: [
      // A — descending shimmer
      ['E5', 0.5], ['A5', 0.25], ['G5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D5', 0.5], ['C5', 0.5],
      ['B4', 0.5], ['E5', 0.25], ['D5', 0.25], ['C5', 0.25], ['B4', 0.25], ['A4', 0.5], ['E4', 0.5],
      ['C5', 0.5], ['F5', 0.25], ['E5', 0.25], ['D5', 0.25], ['C5', 0.25], ['B4', 0.5], ['A4', 0.5],
      ['G4', 0.5], ['C5', 0.25], ['B4', 0.25], ['A4', 0.25], ['G4', 0.25], ['A4', 1],
      // B — rising swell
      ['A4', 0.5], ['C5', 0.5], ['E5', 0.5], ['A5', 0.5],
      ['G5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5],
      ['F5', 0.5], ['D5', 0.5], ['B4', 0.5], ['D5', 0.5],
      ['C5', 0.5], ['E5', 0.5], ['A5', 1],
    ],
    bass: rep([['A2', 1], ['E2', 1], ['F2', 1], ['G2', 1]], 5),
    drum: null,
  },

  // Saint-Saëns — "Danse Macabre": the spooky waltz with its tritone toll.
  Haunted: {
    bpm: 120, wave: 'square', bassWave: 'square', staccato: 0.55,
    melody: [
      // A — the tolling tritone, then the dance theme (D minor)
      ['A4', 0.5], ['Eb5', 0.5], ['A4', 0.5], ['Eb5', 0.5],
      ['D5', 0.25], ['A4', 0.25], ['F4', 0.5], ['D4', 0.5], ['A4', 0.5],
      ['D5', 0.25], ['A4', 0.25], ['F4', 0.5], ['D4', 0.5], ['A3', 0.5],
      // B — rising chromatic menace
      ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['E5', 0.5],
      ['D5', 0.5], ['C#5', 0.5], ['D5', 0.5], ['A4', 0.5],
      ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C#5', 0.5],
      ['D5', 0.5], ['A4', 0.5], ['D5', 1],
    ],
    bass: rep([['D2', 1], ['A2', 1], ['D2', 1], ['A2', 1], ['Bb2', 1], ['A2', 1], ['D2', 1], ['A2', 1]], 3),
    drum: [['k', 1], ['s', 1]],
  },

  // Original calliope galop — bright, bouncy fairground fun (C major).
  Carnival: {
    bpm: 142, wave: 'square', bassWave: 'square', staccato: 0.55,
    melody: [
      // A — bouncy arpeggio romp
      ['C5', 0.25], ['E5', 0.25], ['G5', 0.5], ['G5', 0.25], ['E5', 0.25], ['C5', 0.5],
      ['D5', 0.25], ['F5', 0.25], ['A5', 0.5], ['G5', 0.5], ['E5', 0.5],
      ['C5', 0.25], ['E5', 0.25], ['G5', 0.5], ['C6', 0.5], ['G5', 0.5],
      ['F5', 0.25], ['D5', 0.25], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5],
      // B — skippy turnaround
      ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['G5', 0.25], ['E5', 0.5], ['C5', 0.5],
      ['A4', 0.25], ['C5', 0.25], ['F5', 0.25], ['A5', 0.25], ['F5', 0.5], ['C5', 0.5],
      ['G4', 0.25], ['B4', 0.25], ['D5', 0.25], ['G5', 0.25], ['F5', 0.5], ['D5', 0.5],
      ['C5', 0.5], ['G4', 0.5], ['C5', 1],
    ],
    bass: rep([['C3', 0.5], ['G3', 0.5], ['G2', 0.5], ['G3', 0.5], ['F3', 0.5], ['C3', 0.5], ['G2', 0.5], ['G3', 0.5]], 4),
    drum: [['k', 1], ['s', 1]],
  },

  // Menu — Beethoven, "Ode to Joy" (Symphony No. 9). A long, comprehensive
  // arrangement: the theme, a contrasting bridge, then triumphant octave-up
  // restatements, so the ~26s loop stays grand without grating on repeat.
  Menu: {
    bpm: 128, wave: 'triangle', bassWave: 'square', staccato: 0.62,
    melody: [
      // A — the theme
      ['E4', 0.5], ['E4', 0.5], ['F4', 0.5], ['G4', 0.5],
      ['G4', 0.5], ['F4', 0.5], ['E4', 0.5], ['D4', 0.5],
      ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 0.5],
      ['E4', 0.75], ['D4', 0.25], ['D4', 1],
      // A2 — answering phrase
      ['E4', 0.5], ['E4', 0.5], ['F4', 0.5], ['G4', 0.5],
      ['G4', 0.5], ['F4', 0.5], ['E4', 0.5], ['D4', 0.5],
      ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 0.5],
      ['D4', 0.75], ['C4', 0.25], ['C4', 1],
      // B — the contrasting bridge
      ['D4', 0.5], ['D4', 0.5], ['E4', 0.5], ['C4', 0.5],
      ['D4', 0.5], ['E4', 0.25], ['F4', 0.25], ['E4', 0.5], ['C4', 0.5],
      ['D4', 0.5], ['E4', 0.25], ['F4', 0.25], ['E4', 0.5], ['D4', 0.5],
      ['C4', 0.5], ['D4', 0.5], ['G3', 1],
      // A3 — grand restatement, an octave up
      ['E5', 0.5], ['E5', 0.5], ['F5', 0.5], ['G5', 0.5],
      ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5],
      ['C5', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5],
      ['D5', 0.75], ['C5', 0.25], ['C5', 1],
      // A4 — reprise back in the warm mid octave
      ['E4', 0.5], ['E4', 0.5], ['F4', 0.5], ['G4', 0.5],
      ['G4', 0.5], ['F4', 0.5], ['E4', 0.5], ['D4', 0.5],
      ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 0.5],
      ['E4', 0.75], ['D4', 0.25], ['D4', 1],
      // B2 — bridge again
      ['D4', 0.5], ['D4', 0.5], ['E4', 0.5], ['C4', 0.5],
      ['D4', 0.5], ['E4', 0.25], ['F4', 0.25], ['E4', 0.5], ['C4', 0.5],
      ['D4', 0.5], ['E4', 0.25], ['F4', 0.25], ['E4', 0.5], ['D4', 0.5],
      ['C4', 0.5], ['D4', 0.5], ['G3', 1],
      // A5 — triumphant finale (high), held to breathe before the loop
      ['E5', 0.5], ['E5', 0.5], ['F5', 0.5], ['G5', 0.5],
      ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5],
      ['C5', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5],
      ['D5', 0.5], ['C5', 0.5], ['C5', 1.5],
    ],
    bass: rep([['C3', 1], ['G2', 1], ['C3', 1], ['F2', 1]], 14),
    drum: [['k', 1], ['s', 1]],
  },

  // Funky groove (original) — used for the psychedelic menu and Rainbow Road.
  Funky: {
    bpm: 112, wave: 'square', bassWave: 'square', staccato: 0.5,
    melody: [
      ['E5', 0.5], [null, 0.25], ['E5', 0.25], ['G5', 0.5], ['E5', 0.5],
      ['D5', 0.5], ['E5', 0.5], [null, 0.5], ['B4', 0.5],
      ['E5', 0.25], ['G5', 0.25], ['A5', 0.5], [null, 0.25], ['A5', 0.25], ['G5', 0.5],
      ['E5', 0.5], ['D5', 0.5], ['E5', 1],
      ['B5', 0.5], [null, 0.25], ['B5', 0.25], ['A5', 0.5], ['G5', 0.5],
      ['A5', 0.5], ['G5', 0.5], ['E5', 0.5], ['D5', 0.5],
      ['E5', 0.25], ['G5', 0.25], ['B5', 0.5], ['A5', 0.5], ['G5', 0.5],
      ['E5', 0.5], ['D5', 0.5], ['E5', 1],
    ],
    bass: rep([
      ['E2', 0.5], ['E2', 0.25], [null, 0.25], ['E2', 0.5], ['G2', 0.5],
      ['A2', 0.5], ['A2', 0.25], [null, 0.25], ['G2', 0.5], ['E2', 0.5],
      ['E2', 0.5], ['E2', 0.25], [null, 0.25], ['D2', 0.5], ['D2', 0.5],
      ['G2', 0.5], ['A2', 0.5], ['B2', 0.5], ['B2', 0.5],
    ], 2),
    drum: [['k', 1], ['s', 0.5], ['k', 0.5]],
  },
};

// --- sequencer --------------------------------------------------------------
let schedTimer = null;
let voices = [];
let tempoMul = 1; // >1 speeds the music up (final-lap intensity)
const LOOKAHEAD = 0.12;
const TICK = 25;

// Ramp the music tempo (1 = normal). Takes effect within ~one lookahead.
export function setMusicRate(mult) {
  tempoMul = mult > 0 ? mult : 1;
}

function scheduleTick() {
  const c = ctx;
  if (!c) return;
  const horizon = c.currentTime + LOOKAHEAD;
  for (const v of voices) {
    while (v.nextTime < horizon) {
      const [note, beats] = v.seq[v.idx];
      const dur = (beats * v.spb) / tempoMul;
      if (note) {
        if (v.drum) drumAt(note, v.nextTime, v.gain);
        else toneAt(noteFreq(note), v.nextTime, dur * v.staccato, v.type, v.gain);
      }
      v.nextTime += dur;
      v.idx = (v.idx + 1) % v.seq.length;
    }
  }
}

export function startMusic(themeName) {
  stopMusic();
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const track = TRACKS[themeName] || TRACKS.Grassy;
  const spb = 60 / track.bpm;
  tempoMul = 1; // reset any final-lap speed-up from the previous race
  const t0 = c.currentTime + 0.15;
  voices = [];
  voices.push({ seq: track.melody, idx: 0, nextTime: t0, spb, type: track.wave, staccato: track.staccato, gain: 0.085 });
  voices.push({ seq: track.bass, idx: 0, nextTime: t0, spb, type: track.bassWave, staccato: 0.95, gain: 0.06 });
  if (track.drum) voices.push({ seq: track.drum, idx: 0, nextTime: t0, spb, drum: true, gain: 0.07 });
  schedTimer = setInterval(scheduleTick, TICK);
}

export function stopMusic() {
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  voices = [];
}
