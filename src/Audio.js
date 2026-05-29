// Procedural audio via the Web Audio API — no asset files.
//
// Background music: chiptune arrangements of famous PUBLIC-DOMAIN melodies
// (their copyright expired long ago), one per world:
//   Grassy -> Rossini, William Tell Overture (gallop finale)
//   Beach  -> Offenbach, Can-Can (Galop Infernal)
//   Ice    -> Tchaikovsky, Dance of the Sugar Plum Fairy
//   Candy  -> Fucik, Entry of the Gladiators (circus march)
// Everything is wrapped in try/catch so audio can never break gameplay.

let ctx = null;
let master = null;
let enabled = true;
let muted = false;
const VOLUME = 0.45;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);
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
  if (master) master.gain.value = muted ? 0 : VOLUME;
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
function blip(freq, start, dur, type, gain) {
  if (!enabled) return;
  const c = ensure();
  if (c) toneAt(freq, c.currentTime + start, dur, type, gain);
}

export function sfx(name) {
  switch (name) {
    case 'beep': blip(520, 0, 0.18, 'square', 0.16); break;
    case 'go': blip(880, 0, 0.35, 'square', 0.22); blip(1320, 0.05, 0.35, 'square', 0.12); break;
    case 'pickup': blip(660, 0, 0.08, 'square', 0.14); blip(990, 0.08, 0.12, 'square', 0.14); break;
    case 'item': blip(440, 0, 0.1, 'sawtooth', 0.14); blip(880, 0.06, 0.14, 'sawtooth', 0.1); break;
    case 'boost': blip(220, 0, 0.3, 'sawtooth', 0.12); blip(440, 0, 0.3, 'square', 0.06); break;
    case 'hit': blip(140, 0, 0.25, 'sawtooth', 0.16); break;
    case 'bump': blip(120, 0, 0.06, 'square', 0.08); break;
    case 'lap': blip(784, 0, 0.1, 'square', 0.14); blip(1047, 0.1, 0.18, 'square', 0.14); break;
    case 'finish': [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.12, 0.25, 'square', 0.18)); break;
    case 'fanfare': [523, 523, 784, 1047, 1318].forEach((f, i) => blip(f, i * 0.16, 0.4, 'square', 0.2)); break;
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

  // Menu — bright, sunny, pastoral (in the spirit of Vivaldi's "Spring").
  Menu: {
    bpm: 116, wave: 'triangle', bassWave: 'sine', staccato: 0.7,
    melody: [
      // A
      ['C5', 0.5], ['C5', 0.5], ['G5', 0.5], ['G5', 0.5],
      ['A5', 0.5], ['G5', 0.5], ['E5', 0.5], ['C5', 0.5],
      ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['D5', 0.5],
      ['E5', 0.5], ['C5', 0.5], ['C5', 1],
      // B
      ['E5', 0.5], ['E5', 0.5], ['G5', 0.5], ['E5', 0.5],
      ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5],
      ['G5', 0.5], ['G5', 0.5], ['A5', 0.5], ['G5', 0.5],
      ['F5', 0.5], ['D5', 0.5], ['G5', 1],
      // C — gentle descent
      ['C6', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 0.5],
      ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 0.5],
      ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['D5', 0.5],
      ['E5', 0.5], ['C5', 0.5], ['C5', 1],
    ],
    bass: rep([['C3', 1], ['G3', 1], ['F3', 1], ['G3', 1]], 6),
    drum: [['k', 2]],
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
const LOOKAHEAD = 0.12;
const TICK = 25;

function scheduleTick() {
  const c = ctx;
  if (!c) return;
  const horizon = c.currentTime + LOOKAHEAD;
  for (const v of voices) {
    while (v.nextTime < horizon) {
      const [note, beats] = v.seq[v.idx];
      const dur = beats * v.spb;
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
