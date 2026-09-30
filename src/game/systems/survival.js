const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const TANK_SECONDS = 150; // one cylinder at 2 L/min, in game seconds

// Body state: health, stamina, blood oxygen, warmth, food, water, acclimatization, kit.
export class Survival {
  constructor() { this.reset(); }

  reset() {
    Object.assign(this, {
      health: 100, stamina: 100, spo2: 80, warmth: 100, food: 90, water: 90, acclim: 0,
      tanks: 0, tankLevel: 0, o2On: false, rations: 2, bottles: 2, cause: '', warned: {},
      gear: { crampons: false, axe: false, harness: false, suit: false },
    });
  }

  get cap() { return 100 * clamp(0.35 + 0.65 * Math.min(this.food, this.water) / 45, 0.35, 1); }
  get maxSlope() { return (this.gear.crampons ? (this.gear.axe ? 40 : 34) : 24) * Math.PI / 180; }
  get speedMul() { return 0.5 + 0.5 * clamp((this.spo2 - 40) / 40, 0, 1); }

  damage(n, cause) {
    if (n <= 0) return;
    this.health = Math.max(0, this.health - n);
    this.cause = cause;
  }

  // e: alt (m), airTemp (°C), wind (m/s), moving, sprinting, climbing, uphill, sitting, arresting
  update(dt, e) {
    const msgs = [];
    if (this.o2On) {
      this.tankLevel -= dt / TANK_SECONDS;
      if (this.tankLevel <= 0) {
        this.tanks--;
        if (this.tanks > 0) { this.tankLevel = 1; msgs.push(`Cylinder empty. Switched to a fresh one (${this.tanks} left).`); }
        else { this.tanks = 0; this.tankLevel = 0; this.o2On = false; msgs.push('Your last oxygen cylinder is empty!'); }
      }
    }
    const effort = e.moving ? (e.sprinting ? 2.5 : e.climbing ? 1.8 : 1) + Math.max(0, e.uphill) * 1.5 : 0;

    // blood oxygen falls with altitude; acclimatization and bottled oxygen push it back up
    const target = clamp(100 - Math.max(0, e.alt - 3000) * 0.0095 + this.acclim * 12 + (this.o2On ? 28 : 0) - effort * 2.5, 30, 99);
    this.spo2 += (target - this.spo2) * Math.min(1, dt * 0.3);

    const feels = e.airTemp - e.wind * 0.6;
    this.warmth = clamp(this.warmth + clamp((feels + (this.gear.suit ? 32 : 6) + effort * 5 + 6) * 0.04, -1.5, 2) * dt, 0, 100);
    this.food = Math.max(0, this.food - (0.06 + effort * 0.05) * dt);
    this.water = Math.max(0, this.water - (0.08 + effort * 0.07 + Math.max(0, e.alt - 6000) * 0.00003) * dt);

    const hyp = clamp((this.spo2 - 40) / 40, 0.15, 1), cold = this.warmth < 30 ? 0.5 : 1;
    const drain = (e.sprinting ? 14 : e.climbing ? 5 : e.moving ? Math.max(0, e.uphill) * 9 : 0) + (e.arresting ? 12 : 0);
    const regen = (e.sitting ? 18 : e.moving ? 3 : 10) * hyp * cold;
    this.stamina = clamp(this.stamina + (regen - drain) * dt, 0, this.cap);

    const h0 = this.health;
    if (this.spo2 < 50) this.damage((50 - this.spo2) * 0.07 * dt, 'Hypoxia: your brain and lungs gave out in the thin air');
    if (this.warmth < 30) this.damage((30 - this.warmth) * 0.03 * dt, 'Hypothermia');
    if (this.food <= 0) this.damage(0.3 * dt, 'Exhaustion and starvation');
    if (this.water <= 0) this.damage(0.4 * dt, 'Severe dehydration');
    if (this.health > 0 && this.health === h0 && this.spo2 > 62 && this.warmth > 50 && this.food > 25 && this.water > 25) this.health = Math.min(100, this.health + 0.25 * dt);

    this.warn(msgs, 'spo2', this.spo2 < 55, this.spo2 > 60, 'Severe hypoxia! Start oxygen [O], rest, or descend.');
    this.warn(msgs, 'warmth', this.warmth < 35, this.warmth > 45, 'Hypothermia setting in. Get out of the wind or into a tent.');
    this.warn(msgs, 'water', this.water < 20, this.water > 30, 'You are dehydrated. Drink [2].');
    this.warn(msgs, 'food', this.food < 20, this.food > 30, 'You are running on empty. Eat [1].');
    return msgs;
  }

  warn(msgs, key, bad, fine, text) {
    if (bad && !this.warned[key]) { this.warned[key] = true; msgs.push(text); }
    else if (fine) this.warned[key] = false;
  }

  // A night in a tent: sleep, melt snow, cook, and acclimatize to this camp's altitude.
  rest(alt) {
    this.acclim = Math.min(1, Math.max(this.acclim, (alt - 5000) / 3500 + 0.1));
    this.stamina = 100; this.warmth = 100;
    this.health = Math.min(100, this.health + 45);
    this.water = Math.min(100, this.water + 50);
    this.food = Math.min(100, this.food + 30);
  }

  eat() {
    if (!this.rations) return 'No rations left. Resupply at a camp cache.';
    if (this.food > 92) return 'You are not hungry.';
    this.rations--; this.food = Math.min(100, this.food + 35);
    return 'You eat an energy ration.';
  }

  drink() {
    if (!this.bottles) return 'No water left. Resupply at a camp cache.';
    if (this.water > 92) return 'You are not thirsty.';
    this.bottles--; this.water = Math.min(100, this.water + 40);
    return 'You drink from your thermos.';
  }

  toggleO2() {
    if (!this.tanks) return 'No oxygen cylinders. The caches at Camp III and Camp IV hold oxygen.';
    this.o2On = !this.o2On;
    return this.o2On ? 'Oxygen flowing at 2 L/min.' : 'Oxygen flow off.';
  }
}
