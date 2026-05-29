// Procedural track generator.
//
// Approach (classic "convex hull + midpoint displacement"): scatter random
// points, take their convex hull (a guaranteed-simple outer boundary), then
// repeatedly insert midpoints displaced perpendicular to each edge by a random
// amount. Outward displacement bulges, inward displacement carves a concavity
// — and concavities are what create genuine left/right turns and switchbacks
// instead of a plain blob. Candidates are validated (no self-intersection, no
// self-merging of the road) and regenerated until one is clean.

export const THEMES = [
  { name: 'Grassy', terrain: 0x7ec850, road: 0x4a4a55, edge: 0xffffff, deco: 0x4e9a3a, decoAlt: 0x6fc24a },
  { name: 'Beach', terrain: 0xf3e1a6, road: 0x70747f, edge: 0xffffff, deco: 0x2fa39a, decoAlt: 0x57d6c4 },
  { name: 'Ice', terrain: 0xdfeefb, road: 0x8fa9c4, edge: 0xffffff, deco: 0xa9d3f5, decoAlt: 0xffffff },
  { name: 'Candy', terrain: 0xffc1e3, road: 0x9b6bce, edge: 0xffffff, deco: 0xff5fa2, decoAlt: 0xfff04d },
];

const ROAD_WIDTH = 143; // 10% wider
const HALF_WIDTH = ROAD_WIDTH / 2;

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
    for (let k = 0; k < outer.length - 1; k += 1) {
      rails.push({ ax: outer[k].x, ay: outer[k].y, bx: outer[k + 1].x, by: outer[k + 1].y });
    }
  }
  return rails;
}

function tryGenerate(width, height) {
  const margin = HALF_WIDTH + 140;
  const bounds = { minX: margin, minY: margin, maxX: width - margin, maxY: height - margin };

  const count = randInt(14, 20);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push({ x: randFloat(bounds.minX, bounds.maxX), y: randFloat(bounds.minY, bounds.maxY) });
  }

  let pts = convexHull(points);
  if (pts.length < 6) return null;

  pushApart(pts, 420, 14, bounds);
  pts = displaceMidpoints(pts, 300); // coarse turns (both directions)
  pushApart(pts, 230, 12, bounds);
  pts = displaceMidpoints(pts, 150); // finer wiggles → longer, busier route
  pushApart(pts, 130, 8, bounds);

  // Validate the smoothed loop, not just the control polygon.
  let centerline = sampleClosedSpline(pts, 8);
  if (selfIntersects(centerline)) return null;
  if (roadSelfMerges(centerline, ROAD_WIDTH * 1.35)) return null;
  centerline = rotateToStraight(centerline);

  return {
    centerline,
    roadWidth: ROAD_WIDTH,
    halfWidth: HALF_WIDTH,
    rails: buildRails(centerline, HALF_WIDTH),
    start: startPose(centerline),
  };
}

// Guaranteed-valid fallback if every random attempt is rejected.
function fallbackTrack(width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = cx - (HALF_WIDTH + 160);
  const ry = cy - (HALF_WIDTH + 160);
  const ctrl = [];
  const n = 9;
  for (let i = 0; i < n; i += 1) {
    const ang = (i / n) * Math.PI * 2;
    const r = 0.7 + 0.3 * Math.sin(ang * 3); // gentle in/out variation
    ctrl.push({ x: cx + Math.cos(ang) * rx * r, y: cy + Math.sin(ang) * ry * r });
  }
  const centerline = rotateToStraight(sampleClosedSpline(ctrl, 12));
  return {
    centerline,
    roadWidth: ROAD_WIDTH,
    halfWidth: HALF_WIDTH,
    rails: buildRails(centerline, HALF_WIDTH),
    start: startPose(centerline),
  };
}

export function generateTrack(width, height, themeName) {
  let base = null;
  for (let attempt = 0; attempt < 80 && !base; attempt += 1) {
    base = tryGenerate(width, height);
  }
  if (!base) base = fallbackTrack(width, height);
  const theme = themeName
    ? THEMES.find((t) => t.name === themeName) || THEMES[0]
    : THEMES[randInt(0, THEMES.length - 1)];
  return { ...base, theme };
}
