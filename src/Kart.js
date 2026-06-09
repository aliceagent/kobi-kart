import Phaser from 'phaser';

// Driving tuning (units: px/s, px/s^2, rad/s).
export const TUNE = {
  maxSpeed: 340,
  boostSpeed: 480,
  itemBoostSpeed: 560, // power-up boost (stronger than the meter boost)
  offRoadMax: 130,
  offRoadBoostSpeed: 230,
  itemBoostOffRoadSpeed: 470, // power-up boost shrugs off rough terrain (faster than normal on-road)
  // Desert (Beach) sand is heavier: slower off-road, and even a power-up boost
  // stays below on-road speed (340), so the road is always faster.
  desertOffRoadMax: 85,
  desertOffRoadBoostSpeed: 150,
  desertItemBoostOffRoadSpeed: 210,
  // Jungle mud is the heaviest off-road surface — even slower than sand.
  mudOffRoadMax: 70,
  mudOffRoadBoostSpeed: 120,
  mudItemBoostOffRoadSpeed: 180,
  padBoostSpeed: 470, // boost pads / speed strips (between meter-boost and item-boost)
  accel: 260,
  brakeDecel: 440,
  overspeedDecel: 650,
  reverseSpeed: 120, // slow reverse when the brake is held at a standstill
  turnRate: 3.2,
  driftTurnRate: 4.3,
  minTurnSpeed: 120,
  minTurnFactor: 0.38, // can always rotate at least this much, even when stopped (prevents dead-stop traps)
  knockbackDecay: 5,
  iceGrip: 0.055, // low traction on off-road ice → drift / fishtail (1 = full grip elsewhere)
  slipTurnMul: 1.5, // twitchier steering on ice, so the tail swings out

  // Drift mini-turbo (hold brake + steer at speed → slide & charge → release for a boost).
  driftMinSpeed: 150, // min speed to *start* a drift (scaled by car-speed setting)
  driftKeepSpeed: 90, // drop below this and the drift ends
  driftGrip: 0.16, // low traction while drifting so the tail slides out
  driftSpeedMul: 0.94, // small speed scrub during the slide
  driftBias: 0.55, // how hard the kart auto-arcs into the locked drift direction
  driftSteerAdjust: 0.5, // how much the player can tighten/widen the drift arc
  driftStraightenTime: 0.22, // straighten for this long to pop out of the drift
  // Charge tiers: reach `time` seconds → release grants `dur` seconds of boost.
  driftTiers: [
    { time: 0.40, dur: 0.50, color: 0x6cc4ff }, // blue  — mini
    { time: 0.95, dur: 0.92, color: 0xffae3a }, // orange — super
    { time: 1.70, dur: 1.45, color: 0xc06bff }, // purple — ultra
  ],

  // Boost meter.
  boostMax: 100,
  boostDrain: 55,
  boostRefill: 32,
  boostRechargeThreshold: 30,

  spinRate: 9, // rad/s while spun out
};

export default class Kart {
  constructor(scene, x, y, heading, textureKey) {
    this.scene = scene;
    this.sprite = scene.add.image(x, y, textureKey).setDepth(10);
    this.sprite.rotation = heading;

    this.heading = heading;
    this.speed = 0;
    this.vx = 0; // actual velocity (lets the kart slide on low-grip ice)
    this.vy = 0;
    this.knockX = 0;
    this.knockY = 0;
    this.radius = 17;

    this.boostFuel = TUNE.boostMax;
    this.boostDepleted = false;
    this.boosting = false;

    // Drift mini-turbo state.
    this.drifting = false;
    this.driftDir = 0; // +1 / -1, locked when the drift starts
    this.driftCharge = 0; // seconds held
    this.driftStraight = 0; // time spent not steering into the drift
    this.driftSparkTier = 0; // 0..3, current charge tier (for the rear sparks)
    this.miniTurbo = 0; // set to the tier on release; the scene reads + clears it

    // Power-up / race state.
    this.frozen = true; // released at GO
    this.spinTimer = 0;
    this.shieldTimer = 0;
    this.itemBoostTimer = 0;
    this.padBoostTimer = 0; // brief boost from a speed strip / boost pad
    this.oilImmune = 0; // grace after an oil-slick spin so it can't trap you
    this.bounceCd = 0; // cooldown so a bounce pad fires once per touch
    this.bogTimer = 0; // bogged engine after a botched (too-early) rocket start
    this.starTimer = 0; // invincibility star: immune + faster + plows others
    // Ramp jump (shortcut): airborne along a locked launch velocity, immune to
    // walls/obstacles/off-road while in the air.
    this.airTimer = 0;
    this.airTotal = 0;
    this.airVX = 0;
    this.airVY = 0;
    this.jumpCd = 0; // cooldown so a ramp can't re-fire mid-landing
    this.justLanded = false; // set the frame the kart touches down (scene reads it)
    // Air tricks: tap steer mid-jump to spin for a boost on a clean landing.
    this.tricking = false;
    this.trickDir = 0;
    this.trickAngle = 0; // extra spin added to the sprite while airborne
    this.heldItem = null;
    this.heldCount = 0; // ammo for triple-mushroom
    this.orbitShells = 0; // orbiting green shells (triple-shell)
    this.stuckTimer = 0; // time spent wedged off-track (for auto-rescue)
    this.falling = false; // falling off Rainbow Road into space
    this.fallTimer = 0;
    this.respawn = null; // {x, y, heading} to reappear at after a fall

    // Race progress (nearest-centerline-index based).
    this.prevX = x;
    this.prevY = y;
    this.lap = 0;
    this.idxPos = 0; // last confirmed index along the centerline
    this.halfway = false; // must pass the track midpoint before a lap counts
    this.finished = false;
    this.place = 0;

    // Identity / control.
    this.isAI = false;
    this.id = '';
    this.name = '';
    this.aiSkill = 1;
    this.speedMul = 1; // rubber-banding for AI
    this.speedScale = 1; // global car-speed setting (slow/medium/fast)
    // Per-kart class multipliers (default = balanced; the scene sets these).
    this.stats = { speed: 1, accel: 1, handling: 1, weight: 1 };
    this.coins = 0; // collected coins → small top-speed bonus
    this.coinMul = 1; // 1 + 0.012*coins
    this.draftMul = 1; // slipstream top-speed bonus
    this.draftTimer = 0; // how long we've been in another kart's wake
    this.drafting = false;
    this.lapStart = 0; // raceElapsed at the start of the current lap
    this.bestLap = null; // fastest completed lap (seconds)
  }

  get x() { return this.sprite.x; }
  set x(v) { this.sprite.x = v; }
  get y() { return this.sprite.y; }
  set y(v) { this.sprite.y = v; }

  get spunOut() { return this.spinTimer > 0; }

  // Returns true if the hit landed, false if blocked (star = invincible, or a shield).
  hit(duration = 1.3) {
    if (this.starTimer > 0) return false;
    if (this.shieldTimer > 0) { this.shieldTimer = 0; return false; }
    this.spinTimer = Math.max(this.spinTimer, duration);
    this.endDrift();
    return true;
  }

  // End a drift; if it charged far enough, grant the mini-turbo and flag the
  // scene (via miniTurbo) to spark + play the sound.
  endDrift() {
    if (!this.drifting) return;
    const tier = this.driftSparkTier;
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftStraight = 0;
    this.driftSparkTier = 0;
    if (tier > 0) {
      this.padBoostTimer = Math.max(this.padBoostTimer, TUNE.driftTiers[tier - 1].dur);
      this.miniTurbo = tier;
    }
  }

  // Launch into a ramp jump: glide along (vx, vy) for `dur` seconds, airborne.
  launch(vx, vy, dur) {
    this.airTimer = dur;
    this.airTotal = dur;
    this.airVX = vx;
    this.airVY = vy;
    this.heading = Math.atan2(vy, vx);
    this.jumpCd = dur + 0.45;
    // Fresh trick state for this jump.
    this.tricking = false;
    this.trickDir = 0;
    this.trickAngle = 0;
    // No drift carry through a jump.
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftStraight = 0;
    this.driftSparkTier = 0;
    this.miniTurbo = 0;
  }

  // terrain describes the surface under the kart this frame:
  //   { offRoad: 'grass'|'sand'|'ice'|'mud'|'fatal', grip: <=1, capMul: <=1 }
  // grip < 1 reduces traction (wet roads slide); off-road 'ice' is the slickest.
  // capMul shaves the speed cap (on-road mud slow-patches).
  drive(dt, steer, braking, wantBoost, onRoad, terrain = {}) {
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.itemBoostTimer > 0) this.itemBoostTimer -= dt;
    if (this.padBoostTimer > 0) this.padBoostTimer -= dt;
    if (this.starTimer > 0) this.starTimer -= dt;
    if (this.bounceCd > 0) this.bounceCd -= dt;
    if (this.bogTimer > 0) this.bogTimer -= dt;
    if (this.jumpCd > 0) this.jumpCd -= dt;
    if (this.oilImmune > 0) this.oilImmune -= dt;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;

    // Heavier karts shed knockback faster (resist shoves); lighter get tossed.
    const decay = Math.exp(-TUNE.knockbackDecay * this.stats.weight * dt);

    if (this.frozen) {
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
      this.drifting = false;
      this.knockX *= decay;
      this.knockY *= decay;
      return;
    }

    // Spun out: no control, slow spin, coast with knockback.
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.heading += TUNE.spinRate * dt;
      this.speed = Math.min(this.speed, 120) * 0.96;
      this.vx = Math.cos(this.heading) * this.speed;
      this.vy = Math.sin(this.heading) * this.speed;
      this.x += (this.vx + this.knockX) * dt;
      this.y += (this.vy + this.knockY) * dt;
      this.sprite.rotation = this.heading;
      this.knockX *= decay;
      this.knockY *= decay;
      this.boosting = false;
      return;
    }

    // Airborne on a ramp jump: coast along the locked launch velocity, ignoring
    // steering and surface. Height is conveyed visually by the scene.
    if (this.airTimer > 0) {
      this.airTimer -= dt;
      this.speed = Math.hypot(this.airVX, this.airVY);
      this.vx = this.airVX;
      this.vy = this.airVY;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.sprite.rotation = this.heading + this.trickAngle; // trickAngle spins it mid-air
      this.knockX *= decay;
      this.knockY *= decay;
      this.boosting = false;
      if (this.airTimer <= 0) this.justLanded = true;
      return;
    }

    // --- Drift state (human karts). Hold brake + steer hard at speed to slide
    // and charge a mini-turbo; pop out by straightening or releasing the brake. ---
    if (this.isAI) {
      this.drifting = false;
    } else if (!this.drifting) {
      if (braking && this.speed > TUNE.driftMinSpeed * this.speedScale && Math.abs(steer) > 0.35) {
        this.drifting = true;
        this.driftDir = steer < 0 ? -1 : 1;
        this.driftCharge = 0;
        this.driftStraight = 0;
        this.driftSparkTier = 0;
      }
    } else {
      const intoDrift = this.driftDir > 0 ? steer > 0.1 : steer < -0.1;
      this.driftStraight = intoDrift ? 0 : this.driftStraight + dt;
      if (!braking || this.speed < TUNE.driftKeepSpeed * this.speedScale
          || this.driftStraight > TUNE.driftStraightenTime) {
        this.endDrift();
      }
    }

    // Boost meter (fires anywhere with fuel; suppressed mid-drift).
    this.boosting = wantBoost && !this.drifting && !this.boostDepleted && this.boostFuel > 0;
    if (this.boosting) {
      this.boostFuel = Math.max(0, this.boostFuel - TUNE.boostDrain * dt);
      if (this.boostFuel === 0) this.boostDepleted = true;
    } else {
      this.boostFuel = Math.min(TUNE.boostMax, this.boostFuel + TUNE.boostRefill * dt);
      if (this.boostDepleted && this.boostFuel >= TUNE.boostRechargeThreshold) {
        this.boostDepleted = false;
      }
    }

    // Off-road speed caps depend on the surface type (mud slowest, then sand).
    const offType = terrain.offRoad || 'grass';
    let offMax = TUNE.offRoadMax;
    let offBoost = TUNE.offRoadBoostSpeed;
    let offItem = TUNE.itemBoostOffRoadSpeed;
    if (offType === 'sand') {
      offMax = TUNE.desertOffRoadMax; offBoost = TUNE.desertOffRoadBoostSpeed; offItem = TUNE.desertItemBoostOffRoadSpeed;
    } else if (offType === 'mud') {
      offMax = TUNE.mudOffRoadMax; offBoost = TUNE.mudOffRoadBoostSpeed; offItem = TUNE.mudItemBoostOffRoadSpeed;
    }

    let cap;
    if (this.itemBoostTimer > 0) {
      cap = onRoad ? TUNE.itemBoostSpeed : offItem;
    } else if (this.padBoostTimer > 0) {
      cap = onRoad ? TUNE.padBoostSpeed : offBoost;
    } else if (this.boosting || this.starTimer > 0) {
      cap = onRoad ? TUNE.boostSpeed : offBoost;
    } else {
      cap = onRoad ? TUNE.maxSpeed : offMax;
    }
    cap *= this.speedMul * this.speedScale * (terrain.capMul || 1) * this.coinMul * this.draftMul * this.stats.speed;
    if (this.bogTimer > 0) cap = Math.min(cap, 120 * this.speedScale); // bogged: crawl off the line

    if (this.drifting) {
      // Keep momentum through the corner (no brake decel) with a small scrub,
      // and grow the charge tier the longer you hold the slide.
      this.driftCharge += dt;
      let tier = 0;
      for (let i = TUNE.driftTiers.length - 1; i >= 0; i -= 1) {
        if (this.driftCharge >= TUNE.driftTiers[i].time) { tier = i + 1; break; }
      }
      this.driftSparkTier = tier;
      this.speed += TUNE.accel * this.stats.accel * dt;
      const driftCap = cap * TUNE.driftSpeedMul;
      if (this.speed > driftCap) this.speed = Math.max(driftCap, this.speed - TUNE.overspeedDecel * dt);
    } else if (braking) {
      // Brake to a stop, then back up slowly while still held.
      this.speed = Math.max(-TUNE.reverseSpeed * this.speedScale, this.speed - TUNE.brakeDecel * dt);
    } else {
      this.speed += TUNE.accel * this.stats.accel * dt;
    }
    if (!this.drifting && this.speed > cap) this.speed = Math.max(cap, this.speed - TUNE.overspeedDecel * dt);

    // Grip: drifting slides the tail out; off-road ice is the slickest; otherwise
    // a wet world's grip (terrain.grip < 1) applies. 1 = full traction.
    let grip;
    if (this.drifting) grip = TUNE.driftGrip;
    else if (!onRoad && offType === 'ice') grip = TUNE.iceGrip;
    else grip = terrain.grip != null ? terrain.grip : 1;
    const lowGrip = !this.drifting && grip < 0.2; // ice-level: twitchy steering

    // Steering works forwards and in reverse (use speed magnitude).
    const turnFactor = Math.max(
      TUNE.minTurnFactor,
      Phaser.Math.Clamp(Math.abs(this.speed) / TUNE.minTurnSpeed, 0, 1)
    );
    let effSteer = steer;
    let turnRate;
    if (this.drifting) {
      // Auto-arc into the locked drift direction; the player tightens/widens it.
      effSteer = Phaser.Math.Clamp(this.driftDir * TUNE.driftBias + steer * TUNE.driftSteerAdjust, -1, 1);
      turnRate = TUNE.driftTurnRate;
    } else {
      turnRate = braking ? TUNE.driftTurnRate : TUNE.turnRate;
      if (lowGrip) turnRate *= TUNE.slipTurnMul; // twitchy on ice
    }
    this.heading += effSteer * turnRate * this.stats.handling * turnFactor * dt;

    // The engine pushes along the heading; grip pulls actual velocity toward
    // that. Full grip (1) snaps instantly (normal handling); low grip lets
    // velocity lag the heading, so the kart slides and fishtails.
    const fwdX = Math.cos(this.heading) * this.speed;
    const fwdY = Math.sin(this.heading) * this.speed;
    this.vx += (fwdX - this.vx) * grip;
    this.vy += (fwdY - this.vy) * grip;

    this.x += (this.vx + this.knockX) * dt;
    this.y += (this.vy + this.knockY) * dt;
    this.sprite.rotation = this.heading;

    this.knockX *= decay;
    this.knockY *= decay;
  }
}
