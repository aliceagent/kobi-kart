// Procedural track generator.
//
// Approach (classic "convex hull + midpoint displacement"): scatter random
// points, take their convex hull (a guaranteed-simple outer boundary), then
// repeatedly insert midpoints displaced perpendicular to each edge by a random
// amount. Outward displacement bulges, inward displacement carves a concavity
// — and concavities are what create genuine left/right turns and switchbacks
// instead of a plain blob. Candidates are validated (no self-intersection, no
// self-merging of the road) and regenerated until one is clean.

// Each theme carries its palette plus physics flags read by RaceScene:
//   offRoad: grass | sand | ice | mud | fatal   (how leaving the road behaves)
//   grip:    on-road traction (1 = dry; < 1 = wet/slick)
//   wind:    lateral gust strength (px/s)
//   boostPads/slowPatches/oilPatches/lowVis: on-road features
//   hazard:  lightning | geyser | null   (timed telegraphed hazards)
//   movers/currents/bouncePads/fogPatches: Adventure-cup signature mechanics
//   twist:   generation difficulty 0 (gentle) | 1 (medium) | 2 (tight); legacy
//            `hard: true` is treated as twist 2. roadWidth overrides the default.
const DEFAULT_ROAD_WIDTH = 143;
export const THEMES = [
  // --- Starter Cup ---
  { name: 'Grassy', terrain: 0x7ec850, road: 0x4a4a55, edge: 0xffffff, deco: 0x4e9a3a, decoAlt: 0x6fc24a, offRoad: 'grass' },
  { name: 'Beach', terrain: 0xf3e1a6, road: 0x70747f, edge: 0xffffff, deco: 0x2fa39a, decoAlt: 0x57d6c4, offRoad: 'sand' },
  { name: 'Ice', terrain: 0xdfeefb, road: 0x8fa9c4, edge: 0xffffff, deco: 0xa9d3f5, decoAlt: 0xffffff, offRoad: 'ice' },
  { name: 'Candy', terrain: 0xffc1e3, road: 0x9b6bce, edge: 0xffffff, deco: 0xff5fa2, decoAlt: 0xfff04d, offRoad: 'grass' },
  // --- Adventure Cup (medium) ---
  { name: 'Desert', terrain: 0xe3b96a, road: 0x8f7350, edge: 0xfff2cf, deco: 0x9c5a2a, decoAlt: 0x4f8a3a, offRoad: 'sand', movers: 'tumbleweed', roadWidth: 134, twist: 1 },
  { name: 'Coral', terrain: 0x0d5f72, road: 0x8fd6cf, edge: 0xeafff8, deco: 0xff6f91, decoAlt: 0x3fe0c8, offRoad: 'sand', currents: true, roadWidth: 138, twist: 1 },
  { name: 'Haunted', terrain: 0x1c1430, road: 0x3a3550, edge: 0x9d7bd6, deco: 0x121022, decoAlt: 0x6ad0a0, offRoad: 'mud', fogPatches: true, roadWidth: 132, twist: 1 },
  { name: 'Carnival', terrain: 0x3aa65f, road: 0x46465f, edge: 0xffd23f, deco: 0xe2403a, decoAlt: 0x49c2e8, offRoad: 'grass', boostPads: true, bouncePads: true, roadWidth: 136, twist: 1 },
  // --- Pro Cup ---
  { name: 'Volcano', terrain: 0x7a1f08, road: 0x2f2b2b, edge: 0xffb24d, deco: 0x1c1a1a, decoAlt: 0xff7a1a, offRoad: 'fatal', boostPads: true, hazard: 'geyser', hard: true, roadWidth: 120 },
  { name: 'Storm', terrain: 0x39434b, road: 0x44474f, edge: 0xcfe0ee, deco: 0x2b3640, decoAlt: 0x8fa6b4, offRoad: 'grass', grip: 0.55, wind: 130, hazard: 'lightning', hard: true, roadWidth: 126 },
  { name: 'Jungle', terrain: 0x2f6b2e, road: 0x5a5048, edge: 0xe0d2a0, deco: 0x1c4a1b, decoAlt: 0x6abf3a, offRoad: 'mud', slowPatches: true, hard: true, roadWidth: 118 },
  { name: 'Neon', terrain: 0x110f1e, road: 0x1d1b30, edge: 0x00e5ff, deco: 0xff3df0, decoAlt: 0x9b6bff, offRoad: 'grass', boostPads: true, oilPatches: true, lowVis: true, hard: true, roadWidth: 128 },
  // Secret Rainbow Road (outer space): drawn as a rainbow; off-road is the void.
  { name: 'Rainbow', terrain: 0x0a0a1f, road: 0x222244, edge: 0xffffff, deco: 0xffffff, decoAlt: 0x9fd6f5, offRoad: 'fatal' },
];

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(randFloat(min, max + 1));
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Andrew's monotone-chain convex hull.
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Relax a point ring so every pair sits at least minDist apart.
function pushApart(pts, minDist, iters, bounds) {
  const md2 = minDist * minDist;
  for (let it = 0; it < iters; it += 1) {
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        let dx = pts[j].x - pts[i].x;
        let dy = pts[j].y - pts[i].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < md2 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const shift = ((minDist - d) / d) * 0.5;
          dx *= shift;
          dy *= shift;
          pts[i].x -= dx;
          pts[i].y -= dy;
          pts[j].x += dx;
          pts[j].y += dy;
        }
      }
    }
    for (const p of pts) {
      p.x = clamp(p.x, bounds.minX, bounds.maxX);
      p.y = clamp(p.y, bounds.minY, bounds.maxY);
    }
  }
  return pts;
}

// Insert a perpendicular-displaced midpoint between each pair of points.
function displaceMidpoints(pts, maxDisp) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    out.push({ x: a.x, y: a.y });
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const px = -(c.y - a.y) / len;
    const py = (c.x - a.x) / len;
    const disp = randFloat(-maxDisp, maxDisp);
    out.push({ x: (a.x + c.x) / 2 + px * disp, y: (a.y + c.y) / 2 + py * disp });
  }
  return out;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function sampleClosedSpline(controlPoints, samplesPerSegment) {
  const n = controlPoints.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = controlPoints[(i - 1 + n) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];
    for (let s = 0; s < samplesPerSegment; s += 1) {
      out.push(catmullRom(p0, p1, p2, p3, s / samplesPerSegment));
    }
  }
  return out;
}

function ccw(a, b, c) {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

// Does the closed polyline cross itself?
function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      if ((j + 1) % n === i || (i + 1) % n === j) continue; // skip adjacent
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      if (ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2)) {
        return true;
      }
    }
  }
  return false;
}

// Do two non-adjacent stretches of the loop pass close enough that the road
// band would visually merge (creating an accidental shortcut)?
function roadSelfMerges(pts, minSep) {
  const n = pts.length;
  const sep2 = minSep * minSep;
  // Skip pairs that are near each other *along* the loop.
  const skip = Math.max(3, Math.round(n * 0.06));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const along = Math.min(j - i, n - (j - i));
      if (along <= skip) continue;
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      if (dx * dx + dy * dy < sep2) return true;
    }
  }
  return false;
}

function startPose(centerline) {
  const a = centerline[0];
  const b = centerline[1 % centerline.length];
  return { x: a.x, y: a.y, heading: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Rotate the loop so index 0 sits on its straightest stretch — that's where the
// start line / grid goes, so karts never spawn into a corner rail.
function rotateToStraight(centerline) {
  const n = centerline.length;
  const turn = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const p0 = centerline[(i - 1 + n) % n];
    const p1 = centerline[i];
    const p2 = centerline[(i + 1) % n];
    const d1x = p1.x - p0.x; const d1y = p1.y - p0.y;
    const d2x = p2.x - p1.x; const d2y = p2.y - p1.y;
    turn[i] = Math.abs(Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y));
  }
  const W = 5;
  let best = 0;
  let bestSum = Infinity;
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let k = -W; k <= W; k += 1) sum += turn[(i + k + n) % n];
    if (sum < bestSum) { bestSum = sum; best = i; }
  }
  return centerline.slice(best).concat(centerline.slice(0, best));
}

// Guard rails: place barrier segments along the OUTER edge of sharp corners
// only. "Sharp" is measured by turn radius (curvature = turn angle / step
// length, which is density-independent); the outward normal is the side away
// from the centre of curvature, so the rail catches a car running wide.
const MIN_TURN_RADIUS = 150; // corners tighter than this (px) get rails
const RAIL_DILATE = 2; // extend rails this many steps into the corner's entry/exit

function distToSegSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

function minDistToCenterlineSq(cl, x, y) {
  const n = cl.length;
  let m = Infinity;
  for (let i = 0; i < n; i += 1) {
    const a = cl[i];
    const b = cl[(i + 1) % n];
    const d = distToSegSq(x, y, a.x, a.y, b.x, b.y);
    if (d < m) m = d;
  }
  return m;
}

function buildRails(centerline, halfWidth) {
  const n = centerline.length;
  const tan = new Array(n); // unit tangent
  const cross = new Array(n); // signed turn (sign = curve direction)
  const hard = new Array(n).fill(false);
  const maxCurvature = 1 / MIN_TURN_RADIUS;

  for (let i = 0; i < n; i += 1) {
    const p0 = centerline[(i - 1 + n) % n];
    const p1 = centerline[i];
    const p2 = centerline[(i + 1) % n];
    const d1x = p1.x - p0.x;
    const d1y = p1.y - p0.y;
    const d2x = p2.x - p1.x;
    const d2y = p2.y - p1.y;
    const cv = d1x * d2y - d1y * d2x;
    cross[i] = cv;
    const turn = Math.abs(Math.atan2(cv, d1x * d2x + d1y * d2y));
    const stepLen = Math.hypot(d2x, d2y) || 1;
    hard[i] = turn / stepLen >= maxCurvature;
    const tx = p2.x - p0.x;
    const ty = p2.y - p0.y;
    const tl = Math.hypot(tx, ty) || 1;
    tan[i] = { x: tx / tl, y: ty / tl };
  }

  // Group consecutive hard points into corner "runs", breaking at gaps AND at
  // turn-direction changes — so one rail strip never spans an inflection (which
  // is what made rails cut across the road in S-curves).
  let start = 0;
  while (start < n && hard[start]) start += 1;
  if (start >= n) start = 0; // (degenerate) whole loop is sharp

  const runs = [];
  let run = null;
  let runSign = 0;
  for (let c = 0; c < n; c += 1) {
    const i = (start + c) % n;
    if (hard[i]) {
      const sgn = Math.sign(cross[i]);
      if (!run) {
        run = [i];
        runSign = sgn;
      } else if (sgn !== 0 && runSign !== 0 && sgn !== runSign) {
        runs.push(run);
        run = [i];
        runSign = sgn;
      } else {
        run.push(i);
        if (runSign === 0) runSign = sgn;
      }
    } else if (run) {
      runs.push(run);
      run = null;
      runSign = 0;
    }
  }
  if (run) runs.push(run);

  const off = halfWidth + 5; // sit just outside the road edge
  const rails = [];
  for (const r of runs) {
    const sign = Math.sign(r.reduce((sum, i) => sum + cross[i], 0)) || 1;

    // Extend each end into the corner's entry/exit, but only through points
    // that keep curving the same way (never across an inflection).
    const idx = r.slice();
    let lo = idx[0];
    for (let k = 0; k < RAIL_DILATE; k += 1) {
      const prev = (lo - 1 + n) % n;
      if (Math.sign(cross[prev]) === sign || cross[prev] === 0) {
        idx.unshift(prev);
        lo = prev;
      } else break;
    }
    let hi = idx[idx.length - 1];
    for (let k = 0; k < RAIL_DILATE; k += 1) {
      const nxt = (hi + 1) % n;
      if (Math.sign(cross[nxt]) === sign || cross[nxt] === 0) {
        idx.push(nxt);
        hi = nxt;
      } else break;
    }

    // Outward normal from the run's turn direction (away from the curve centre).
    const outer = idx.map((i) => ({
      x: centerline[i].x + sign * tan[i].y * off,
      y: centerline[i].y - sign * tan[i].x * off,
    }));
    // A rail point is only valid if it's genuinely OUTSIDE the road. Where the
    // track doubles back or pinches, an offset point can land on another stretch
    // of road — drop those, and never bridge a segment across a dropped point or
    // over the road, so rails can never cross or enter the track.
    const clear = halfWidth + 2;
    const clearSq = clear * clear;
    const offRoad = outer.map((p) => minDistToCenterlineSq(centerline, p.x, p.y) >= clearSq);
    for (let k = 0; k < outer.length - 1; k += 1) {
      if (!offRoad[k] || !offRoad[k + 1]) continue;
      const mx = (outer[k].x + outer[k + 1].x) / 2;
      const my = (outer[k].y + outer[k + 1].y) / 2;
      if (minDistToCenterlineSq(centerline, mx, my) < clearSq) continue; // segment bows over the road
      rails.push({ ax: outer[k].x, ay: outer[k].y, bx: outer[k + 1].x, by: outer[k + 1].y });
    }
  }
  return rails;
}

function tryGenerate(width, height, halfWidth, roadWidth, twist) {
  const margin = halfWidth + 140;
  const bounds = { minX: margin, minY: margin, maxX: width - margin, maxY: height - margin };

  // Higher twist packs in more corners: more control points, bigger fine wiggles
  // and tighter point separation so the racing line winds more. twist 0/1/2 maps
  // to gentle (Starter) / medium (Adventure) / tight (Pro).
  const tw = twist === 1 ? 1 : twist >= 2 ? 2 : 0;
  const countLo = [14, 15, 16][tw]; const countHi = [20, 21, 22][tw];
  const sep1 = [420, 390, 360][tw]; const disp1 = [300, 320, 340][tw];
  const sep2 = [230, 212, 195][tw]; const disp2 = [150, 170, 190][tw];
  const sep3 = [130, 119, 108][tw];

  const count = randInt(countLo, countHi);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push({ x: randFloat(bounds.minX, bounds.maxX), y: randFloat(bounds.minY, bounds.maxY) });
  }

  let pts = convexHull(points);
  if (pts.length < 6) return null;

  pushApart(pts, sep1, 14, bounds);
  pts = displaceMidpoints(pts, disp1); // coarse turns (both directions)
  pushApart(pts, sep2, 12, bounds);
  pts = displaceMidpoints(pts, disp2); // finer wiggles → longer, busier route
  pushApart(pts, sep3, 8, bounds);

  // Validate the smoothed loop, not just the control polygon.
  let centerline = sampleClosedSpline(pts, 8);
  if (selfIntersects(centerline)) return null;
  if (roadSelfMerges(centerline, roadWidth * 1.35)) return null;
  centerline = rotateToStraight(centerline);

  return {
    centerline,
    roadWidth,
    halfWidth,
    rails: buildRails(centerline, halfWidth),
    start: startPose(centerline),
  };
}

// Guaranteed-valid fallback if every random attempt is rejected.
function fallbackTrack(width, height, halfWidth, roadWidth, twist) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = cx - (halfWidth + 160);
  const ry = cy - (halfWidth + 160);
  const ctrl = [];
  const n = [9, 10, 11][twist === 1 ? 1 : twist >= 2 ? 2 : 0];
  for (let i = 0; i < n; i += 1) {
    const ang = (i / n) * Math.PI * 2;
    const r = 0.7 + 0.3 * Math.sin(ang * 3); // gentle in/out variation
    ctrl.push({ x: cx + Math.cos(ang) * rx * r, y: cy + Math.sin(ang) * ry * r });
  }
  const centerline = rotateToStraight(sampleClosedSpline(ctrl, 12));
  return {
    centerline,
    roadWidth,
    halfWidth,
    rails: buildRails(centerline, halfWidth),
    start: startPose(centerline),
  };
}

// Find one dirt "shortcut": a chord that cuts the inside of a curve, shorter
// than following the road around it. Constrained to sit away from the start
// line AND the lap-midpoint checkpoint so it can never break lap detection.
function findShortcut(cl, halfWidth) {
  const n = cl.length;
  const lo = Math.round(n * 0.1);
  const midA = Math.round(n * 0.38);
  const midB = Math.round(n * 0.62);
  const hi = Math.round(n * 0.9);
  const segLen = (i) => Math.hypot(cl[(i + 1) % n].x - cl[i].x, cl[(i + 1) % n].y - cl[i].y);
  let best = null;
  let bestRatio = 0.62; // only qualify if the chord is < 62% of the arc
  for (let a = lo; a < hi; a += 2) {
    for (let skip = 16; skip <= 28; skip += 2) {
      const b = a + skip;
      if (b > hi) continue;
      if (a < midB && b > midA) continue; // must not straddle the checkpoint window
      const A = cl[a]; const B = cl[b];
      const chord = Math.hypot(B.x - A.x, B.y - A.y);
      let arc = 0; for (let i = a; i < b; i += 1) arc += segLen(i);
      if (arc <= 0) continue;
      const ratio = chord / arc;
      if (ratio >= bestRatio) continue;
      const mx = (A.x + B.x) / 2; const my = (A.y + B.y) / 2;
      if (minDistToCenterlineSq(cl, mx, my) < (halfWidth * 1.6) ** 2) continue;
      const q1 = { x: A.x * 0.75 + B.x * 0.25, y: A.y * 0.75 + B.y * 0.25 };
      const q3 = { x: A.x * 0.25 + B.x * 0.75, y: A.y * 0.25 + B.y * 0.75 };
      if (minDistToCenterlineSq(cl, q1.x, q1.y) < (halfWidth * 1.15) ** 2) continue;
      if (minDistToCenterlineSq(cl, q3.x, q3.y) < (halfWidth * 1.15) ** 2) continue;
      best = { aIdx: a, bIdx: b, ax: A.x, ay: A.y, bx: B.x, by: B.y };
      bestRatio = ratio;
    }
  }
  return best;
}

export function generateTrack(width, height, themeName) {
  const theme = themeName
    ? THEMES.find((t) => t.name === themeName) || THEMES[0]
    : THEMES[randInt(0, THEMES.length - 1)];
  const roadWidth = theme.roadWidth || DEFAULT_ROAD_WIDTH;
  const halfWidth = roadWidth / 2;
  const twist = theme.twist != null ? theme.twist : (theme.hard ? 2 : 0);
  let base = null;
  for (let attempt = 0; attempt < 80 && !base; attempt += 1) {
    base = tryGenerate(width, height, halfWidth, roadWidth, twist);
  }
  if (!base) base = fallbackTrack(width, height, halfWidth, roadWidth, twist);
  // Dirt shortcut — not on fatal-void worlds (you'd cut across the abyss).
  const shortcut = theme.offRoad === 'fatal' ? null : findShortcut(base.centerline, halfWidth);
  // Guard rails are built from the main road alone, so corner fences routinely
  // cross the shortcut strip and wall it off. Carve those segments out — the
  // fence simply parts where the dirt passes through.
  if (shortcut) {
    const clearHalf = (roadWidth * 0.72) / 2 + 18; // strip half-width + rail/kart clearance
    base.rails = base.rails.filter((r) => {
      for (let f = 0; f <= 1; f += 0.2) {
        const px = r.ax + (r.bx - r.ax) * f;
        const py = r.ay + (r.by - r.ay) * f;
        if (distToSegSq(px, py, shortcut.ax, shortcut.ay, shortcut.bx, shortcut.by) < clearHalf * clearHalf) return false;
      }
      return true;
    });
  }
  return { ...base, theme, shortcut };
}
