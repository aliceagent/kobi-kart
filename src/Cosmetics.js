// Persistent coin wallet + cosmetic unlocks, all in localStorage.
//
// Coins are earned by racing (collected coins + a podium bonus bank at the
// finish) and by winning battles. They buy paint jobs (kart body + trim
// recolours) and exhaust flames (boost-fire colours). Everything is per-player
// equippable: P1 and P2 can each run their own look from the shared garage.

export const PAINTS = [
  { id: 'paint_midnight', name: 'MIDNIGHT', body: 0x232444, trim: 0x9fe8ff, price: 60 },
  { id: 'paint_bubblegum', name: 'BUBBLEGUM', body: 0xff5d8f, trim: 0xfff3b0, price: 60 },
  { id: 'paint_venom', name: 'VENOM', body: 0x57c75a, trim: 0x232444, price: 80 },
  { id: 'paint_frost', name: 'FROST', body: 0xdfeefb, trim: 0x49a8ec, price: 80 },
  { id: 'paint_magma', name: 'MAGMA', body: 0x5a1f10, trim: 0xff7a1a, price: 100 },
  { id: 'paint_gold', name: 'GOLD CHROME', body: 0xffd23f, trim: 0xffffff, price: 150 },
];

export const FLAMES = [
  { id: 'flame_cyan', name: 'CYAN BURN', color: 0x49e8ff, price: 40 },
  { id: 'flame_pink', name: 'PINK NITRO', color: 0xff5dd0, price: 40 },
  { id: 'flame_green', name: 'TOXIC TRAIL', color: 0x6dff4d, price: 60 },
  { id: 'flame_white', name: 'STARFIRE', color: 0xffffff, price: 90 },
];

export const paintById = (id) => PAINTS.find((p) => p.id === id) || null;
export const flameById = (id) => FLAMES.find((f) => f.id === id) || null;

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
};
const writeJson = (key, val) => {
  try { window.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
};

// ------------------------------------------------------------------ wallet ---
export function wallet() {
  const n = readJson('kobikart.wallet', 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function addCoins(n) {
  if (!(n > 0)) return wallet();
  const w = wallet() + Math.floor(n);
  writeJson('kobikart.wallet', w);
  return w;
}

// Returns true (and deducts) when affordable.
export function spend(n) {
  const w = wallet();
  if (n > w) return false;
  writeJson('kobikart.wallet', w - n);
  return true;
}

// ------------------------------------------------------------------ garage ---
export function owned() {
  const list = readJson('kobikart.owned', []);
  return Array.isArray(list) ? list : [];
}

export function isOwned(id) {
  return owned().includes(id);
}

export function own(id) {
  const list = owned();
  if (!list.includes(id)) { list.push(id); writeJson('kobikart.owned', list); }
}

// slot: 'p1' | 'p2'. Returns { paint: id|null, flame: id|null }.
export function equipped(slot) {
  const eq = readJson('kobikart.equip', {});
  const e = (eq && eq[slot]) || {};
  return { paint: e.paint || null, flame: e.flame || null };
}

export function setEquipped(slot, kind, id) {
  const eq = readJson('kobikart.equip', {});
  eq[slot] = eq[slot] || {};
  eq[slot][kind] = id || null;
  writeJson('kobikart.equip', eq);
}

// Apply the player's equipped cosmetics to a freshly-created kart. Regenerates
// a recoloured kart texture on demand (cheap, cached by texture key).
export function applyToKart(scene, kart, playerIdx, makeKartTexture) {
  const slot = playerIdx === 0 ? 'p1' : 'p2';
  const eq = equipped(slot);
  const paint = eq.paint && isOwned(eq.paint) ? paintById(eq.paint) : null;
  const flame = eq.flame && isOwned(eq.flame) ? flameById(eq.flame) : null;
  if (paint) {
    const key = `kartpaint_${paint.id}_${kart.id}`;
    makeKartTexture(scene, key, paint.body, paint.trim);
    kart.sprite.setTexture(key);
    kart.color = paint.body; // HUD chips, balloons and bursts match the paint
  }
  if (flame) kart.flameColor = flame.color;
}
