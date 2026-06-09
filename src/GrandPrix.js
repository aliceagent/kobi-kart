// Grand Prix state + roster. Stored on the Phaser registry so it survives
// scene transitions (Title -> Race x4 -> Ceremony).

// Palette of selectable car colours. Each race uses a 4-kart lineup drawn from
// these (the human picks + AI fillers).
// Kart classes — gentle stat tradeoffs so the colour you pick actually matters.
// `disp` is the 1-5 bar level shown on Character Select; the multipliers scale
// Kart physics. "balanced" exactly matches the original tuning (no balance
// change for the default pick).
export const CLASSES = {
  balanced: { label: 'All-Rounder', speed: 1.00, accel: 1.00, handling: 1.00, weight: 1.00, disp: { speed: 3, accel: 3, handling: 3, weight: 3 } },
  speedy: { label: 'Speedster', speed: 1.10, accel: 0.92, handling: 0.92, weight: 0.85, disp: { speed: 5, accel: 2, handling: 2, weight: 2 } },
  nimble: { label: 'Cornerer', speed: 0.95, accel: 1.06, handling: 1.18, weight: 0.92, disp: { speed: 2, accel: 4, handling: 5, weight: 2 } },
  heavy: { label: 'Heavyweight', speed: 1.05, accel: 0.93, handling: 0.86, weight: 1.30, disp: { speed: 4, accel: 2, handling: 2, weight: 5 } },
};

export const ROSTER = [
  { id: 'red', name: 'Red', color: 0xff4d4d, trim: 0xb01e1e, cls: 'balanced' },
  { id: 'blue', name: 'Blue', color: 0x4d8bff, trim: 0x1e46b0, cls: 'speedy' },
  { id: 'green', name: 'Green', color: 0x57c75a, trim: 0x2f7d32, cls: 'nimble' },
  { id: 'yellow', name: 'Yellow', color: 0xffd23f, trim: 0xb8870f, cls: 'heavy' },
  { id: 'orange', name: 'Orange', color: 0xff8a2c, trim: 0xb85a0f, cls: 'speedy' },
  { id: 'purple', name: 'Purple', color: 0xb06bce, trim: 0x6a3a8c, cls: 'nimble' },
  { id: 'white', name: 'White', color: 0xf2f2f7, trim: 0xb0b0be, cls: 'balanced' },
  { id: 'black', name: 'Black', color: 0x3a3a42, trim: 0x6f6f7a, cls: 'heavy' },
];

// The class object for a roster index (defaults to balanced).
export function kartClass(idx) {
  const r = ROSTER[idx];
  return (r && CLASSES[r.cls]) || CLASSES.balanced;
}

export const POINTS = [10, 6, 3, 1]; // awarded for 1st..4th each race
export const LAPS = 3; // laps per race

// Overall car-speed setting: slow is 20% slower, fast is 10% faster than medium.
export const CAR_SPEEDS = { slow: 0.72, medium: 1.0, fast: 1.1 };

// Three cups of four worlds, easiest → hardest. Adventure sits in the middle:
// medium roads, gentler-than-Pro twist, and one fair signature mechanic each.
export const CUPS = [
  { id: 1, name: 'STARTER CUP', sub: 'Friendly & forgiving', icon: '🌱', themes: ['Grassy', 'Beach', 'Ice', 'Candy'] },
  { id: 2, name: 'ADVENTURE CUP', sub: 'Wild places, fair tests', icon: '🧭', themes: ['Desert', 'Coral', 'Haunted', 'Carnival'] },
  { id: 3, name: 'PRO CUP', sub: 'Hazards & harder tracks', icon: '🏁', themes: ['Volcano', 'Storm', 'Jungle', 'Neon'] },
];
export const ALL_THEMES = CUPS[0].themes;

export function cupById(id) {
  return CUPS.find((c) => c.id === id) || CUPS[0];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// picks: ROSTER (palette) indices the human player(s) chose, in player order.
// Those become the humans; the 4-kart lineup is filled out with random AI
// colours from the rest of the palette.
export function initGrandPrix(registry, playerCount, picks, cup) {
  const chosen = (picks && picks.length ? picks : [0, 1, 2, 3]).slice(0, playerCount);
  const used = new Set(chosen);
  const pool = ROSTER.map((_, i) => i).filter((i) => !used.has(i));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const lineup = chosen.concat(pool).slice(0, 4); // 4 palette indices, humans first

  const points = {};
  lineup.forEach((idx) => { points[ROSTER[idx].id] = 0; });
  const chosenCup = cupById(cup);
  const themeOrder = shuffle(chosenCup.themes);
  // Konami-unlocked secret: a 5th race on Rainbow Road, always last.
  if (registry.get('rainbow')) themeOrder.push('Rainbow');
  registry.set('gp', {
    playerCount,
    cup: chosenCup.id,
    raceIndex: 0,
    themeOrder,
    points,
    picks: chosen,
    lineup,
    difficulty: registry.get('difficulty') || 'medium',
    lastResults: null, // set after each race
    debugAllAI: false, // test hook: drive human karts with AI too
  });
}

// AI behaviour per difficulty. speedMul caps the AI's top speed; band is how
// much trailing AI catch up (rubber-banding); boostGate is how much fuel they
// hoard before boosting (higher = boosts less); itemChance is per-frame odds
// of firing a held item.
export const AI_DIFFICULTY = {
  easy: { speedMul: 0.80, band: 0.0, boostGate: 85, itemChance: 0.010 },
  medium: { speedMul: 0.90, band: 0.006, boostGate: 55, itemChance: 0.020 },
  hard: { speedMul: 1.0, band: 0.012, boostGate: 45, itemChance: 0.030 },
};

export function totalStandings(gp) {
  const lineup = gp.lineup || [0, 1, 2, 3];
  return lineup.map((idx) => { const r = ROSTER[idx]; return { ...r, points: gp.points[r.id] }; })
    .sort((a, b) => b.points - a.points);
}
