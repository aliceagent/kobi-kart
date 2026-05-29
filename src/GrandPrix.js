// Grand Prix state + roster. Stored on the Phaser registry so it survives
// scene transitions (Title -> Race x4 -> Ceremony).

export const ROSTER = [
  { id: 'p1', name: 'Red', color: 0xff4d4d, trim: 0xb01e1e },
  { id: 'p2', name: 'Blue', color: 0x4d8bff, trim: 0x1e46b0 },
  { id: 'c1', name: 'Green', color: 0x57c75a, trim: 0x2f7d32 },
  { id: 'c2', name: 'Yellow', color: 0xffd23f, trim: 0xb8870f },
];

export const POINTS = [10, 6, 3, 1]; // awarded for 1st..4th each race
export const LAPS = 2; // laps per race (tracks are long, so 2 keeps races snappy)
export const ALL_THEMES = ['Grassy', 'Beach', 'Ice', 'Candy'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function initGrandPrix(registry, playerCount) {
  const points = {};
  ROSTER.forEach((r) => { points[r.id] = 0; });
  registry.set('gp', {
    playerCount,
    raceIndex: 0,
    themeOrder: shuffle(ALL_THEMES),
    points,
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
  return ROSTER.map((r) => ({ ...r, points: gp.points[r.id] }))
    .sort((a, b) => b.points - a.points);
}
