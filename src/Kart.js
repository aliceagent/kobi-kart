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

    // Power-up / race state.
    this.frozen = true; // released at GO
    this.spinTimer = 0;
    this.shieldTimer = 0;
    this.itemBoostTimer = 0;
    this.heldItem = null;
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
  }

  get x() { return this.sprite.x; }
  set x(v) { this.sprite.x = v; }
  get y() { return this.sprite.y; }
  set y(v) { this.sprite.y = v; }

  get spunOut() { return this.spinTimer > 0; }

  // Returns true if the hit landed, false if a shield blocked it.
  hit(duration = 1.3) {
    if (this.shieldTimer > 0) { this.shieldTimer = 0; return false; }
    this.spinTimer = Math.max(this.spinTimer, duration);
    return true;
  }

  drive(dt, steer, braking, wantBoost, onRoad, slippery = false, desert = false) {
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.itemBoostTimer > 0) this.itemBoostTimer -= dt;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;

    const decay = Math.exp(-TUNE.knockbackDecay * dt);

    if (this.frozen) {
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
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

    // Boost meter (fires anywhere with fuel; weaker on grass).
    this.boosting = wantBoost && !this.boostDepleted && this.boostFuel > 0;
    if (this.boosting) {
      this.boostFuel = Math.max(0, this.boostFuel - TUNE.boostDrain * dt);
      if (this.boostFuel === 0) this.boostDepleted = true;
    } else {
      this.boostFuel = Math.min(TUNE.boostMax, this.boostFuel + TUNE.boostRefill * dt);
      if (this.boostDepleted && this.boostFuel >= TUNE.boostRechargeThreshold) {
        this.boostDepleted = false;
      }
    }

    let cap;
    if (this.itemBoostTimer > 0) {
      cap = onRoad ? TUNE.itemBoostSpeed : (desert ? TUNE.desertItemBoostOffRoadSpeed : TUNE.itemBoostOffRoadSpeed);
    } else if (this.boosting) {
      cap = onRoad ? TUNE.boostSpeed : (desert ? TUNE.desertOffRoadBoostSpeed : TUNE.offRoadBoostSpeed);
    } else {
      cap = onRoad ? TUNE.maxSpeed : (desert ? TUNE.desertOffRoadMax : TUNE.offRoadMax);
    }
    cap *= this.speedMul * this.speedScale;

    if (braking) {
      // Brake to a stop, then back up slowly while still held.
      this.speed = Math.max(-TUNE.reverseSpeed * this.speedScale, this.speed - TUNE.brakeDecel * dt);
    } else {
      this.speed += TUNE.accel * dt;
    }
    if (this.speed > cap) this.speed = Math.max(cap, this.speed - TUNE.overspeedDecel * dt);

    // Steering works forwards and in reverse (use speed magnitude).
    const turnFactor = Math.max(
      TUNE.minTurnFactor,
      Phaser.Math.Clamp(Math.abs(this.speed) / TUNE.minTurnSpeed, 0, 1)
    );
    let turnRate = braking ? TUNE.driftTurnRate : TUNE.turnRate;
    if (slippery) turnRate *= TUNE.slipTurnMul; // twitchy on ice
    this.heading += steer * turnRate * turnFactor * dt;

    // The engine pushes along the heading; grip pulls actual velocity toward
    // that. Full grip (1) snaps instantly (normal handling); low grip on ice
    // lets velocity lag the heading, so the kart slides and fishtails.
    const fwdX = Math.cos(this.heading) * this.speed;
    const fwdY = Math.sin(this.heading) * this.speed;
    const grip = slippery ? TUNE.iceGrip : 1;
    this.vx += (fwdX - this.vx) * grip;
    this.vy += (fwdY - this.vy) * grip;

    this.x += (this.vx + this.knockX) * dt;
    this.y += (this.vy + this.knockY) * dt;
    this.sprite.rotation = this.heading;

    this.knockX *= decay;
    this.knockY *= decay;
  }
}
