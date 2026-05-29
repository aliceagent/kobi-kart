import Phaser from 'phaser';

// Driving tuning (units: px/s, px/s^2, rad/s).
export const TUNE = {
  maxSpeed: 340,
  boostSpeed: 480,
  itemBoostSpeed: 560, // power-up boost (stronger than the meter boost)
  offRoadMax: 130,
  offRoadBoostSpeed: 230,
  itemBoostOffRoadSpeed: 470, // power-up boost shrugs off rough terrain (faster than normal on-road)
  accel: 260,
  brakeDecel: 440,
  overspeedDecel: 650,
  turnRate: 3.2,
  driftTurnRate: 4.3,
  minTurnSpeed: 120,
  minTurnFactor: 0.38, // can always rotate at least this much, even when stopped (prevents dead-stop traps)
  knockbackDecay: 5,

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

  drive(dt, steer, braking, wantBoost, onRoad) {
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.itemBoostTimer > 0) this.itemBoostTimer -= dt;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;

    const decay = Math.exp(-TUNE.knockbackDecay * dt);

    if (this.frozen) {
      this.speed = 0;
      this.knockX *= decay;
      this.knockY *= decay;
      return;
    }

    // Spun out: no control, slow spin, coast with knockback.
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.heading += TUNE.spinRate * dt;
      this.speed = Math.min(this.speed, 120) * 0.96;
      this.x += (Math.cos(this.heading) * this.speed + this.knockX) * dt;
      this.y += (Math.sin(this.heading) * this.speed + this.knockY) * dt;
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
    if (this.itemBoostTimer > 0) cap = onRoad ? TUNE.itemBoostSpeed : TUNE.itemBoostOffRoadSpeed;
    else if (this.boosting) cap = onRoad ? TUNE.boostSpeed : TUNE.offRoadBoostSpeed;
    else cap = onRoad ? TUNE.maxSpeed : TUNE.offRoadMax;
    cap *= this.speedMul;

    if (braking) this.speed -= TUNE.brakeDecel * dt;
    else this.speed += TUNE.accel * dt;
    if (this.speed > cap) this.speed = Math.max(cap, this.speed - TUNE.overspeedDecel * dt);
    if (this.speed < 0) this.speed = 0;

    const turnFactor = Math.max(
      TUNE.minTurnFactor,
      Phaser.Math.Clamp(this.speed / TUNE.minTurnSpeed, 0, 1)
    );
    const turnRate = braking ? TUNE.driftTurnRate : TUNE.turnRate;
    this.heading += steer * turnRate * turnFactor * dt;

    this.x += (Math.cos(this.heading) * this.speed + this.knockX) * dt;
    this.y += (Math.sin(this.heading) * this.speed + this.knockY) * dt;
    this.sprite.rotation = this.heading;

    this.knockX *= decay;
    this.knockY *= decay;
  }
}
