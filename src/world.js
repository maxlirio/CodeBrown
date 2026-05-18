// The World: a small persistent living planet.
// Terrain + typed resources + storms + cliffs + landmarks +
// decaying structures + spreading fire + day/night + seasons +
// scars of past generations.

import { RNG, makeNoise, clamp } from './util.js';

export const WORLD = {
  size: 120,
  hMax: 14,
  dayLen: 900,                 // ticks per day
  seasonLen: 4,                // days per season
};
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export class World {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.noise = makeNoise(this.seed);
    this.size = WORLD.size;

    this.t = 0;                 // global tick
    this.resources = [];        // {x,z,amount,max,kind}
    this.storms = [];           // {x,z,r,vx,vz}
    this.landmarks = [];        // {x,z,name}
    this.structures = [];       // {x,y,z,owner,kind,hp,maxHp}
    this.scars = [];            // {x,z,intensity}
    this.fires = [];            // {x,z,life}

    this._buildTerrain();
    this._seedResources(75);
    this._seedStorms(3);
    this._seedLandmarks();
  }

  // ---- time ----
  get dayPhase() { return (this.t % WORLD.dayLen) / WORLD.dayLen; }      // 0..1
  get isNight() { const p = this.dayPhase; return p < 0.22 || p > 0.78; }
  get daylight() {                                                       // 0..1
    return clamp(Math.sin(this.dayPhase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 0.08, 1);
  }
  get seasonIndex() { return Math.floor(this.t / WORLD.dayLen / WORLD.seasonLen) % 4; }
  get season() { return SEASONS[this.seasonIndex]; }
  get growth() { return [1.0, 1.25, 0.7, 0.35][this.seasonIndex]; }      // regrow rate
  get harshness() { return [0.9, 0.7, 1.0, 1.5][this.seasonIndex]; }     // hazard scale

  // ---- terrain ----
  _buildTerrain() {
    const n = this.noise, S = this.size;
    this.height = (x, z) => {
      const u = (x + S / 2) / S, v = (z + S / 2) / S;
      let h = n(u * 5, v * 5) * 0.7 + n(u * 13, v * 13) * 0.3;
      const cx = (u - 0.5) * 2, cz = (v - 0.5) * 2;
      h *= clamp(1.15 - Math.sqrt(cx * cx + cz * cz) * 1.15);
      return h * WORLD.hMax;
    };
  }

  inBounds(x, z) {
    const b = this.size / 2 - 2;
    return x > -b && x < b && z > -b && z < b;
  }

  slope(x, z) {
    const d = 1.2;
    const hx = this.height(x + d, z) - this.height(x - d, z);
    const hz = this.height(x, z + d) - this.height(x, z - d);
    return Math.sqrt(hx * hx + hz * hz) / d;
  }

  // ---- resources ----
  _seedResources(count) { for (let i = 0; i < count; i++) this._spawnResource(); }
  _spawnResource() {
    const S = this.size / 2 - 6, r = this.rng.next();
    const kind = r < 0.6 ? 'food' : r < 0.85 ? 'wood' : 'stone';
    for (let t = 0; t < 12; t++) {
      const x = this.rng.range(-S, S), z = this.rng.range(-S, S);
      if (this.height(x, z) > 1.5 && this.slope(x, z) < 4) {
        const max = this.rng.range(40, 100);
        this.resources.push({ x, z, amount: max, max, kind });
        return;
      }
    }
  }

  _seedStorms(count) {
    const S = this.size / 2 - 10;
    for (let i = 0; i < count; i++) this.storms.push({
      x: this.rng.range(-S, S), z: this.rng.range(-S, S),
      r: this.rng.range(8, 16),
      vx: this.rng.range(-0.05, 0.05), vz: this.rng.range(-0.05, 0.05),
    });
  }

  _seedLandmarks() {
    let best = [];
    for (let i = 0; i < 400; i++) {
      const x = this.rng.range(-this.size / 2, this.size / 2);
      const z = this.rng.range(-this.size / 2, this.size / 2);
      best.push({ x, z, h: this.height(x, z) });
    }
    best.sort((a, b) => b.h - a.h);
    const names = ['North Peak', 'The Spine', 'High Mesa', 'Old Ridge'];
    for (let i = 0; i < 4; i++) this.landmarks.push({ ...best[i], name: names[i] });
  }

  // ---- hazards ----
  hazardAt(x, z) {
    let h = 0;
    for (const s of this.storms) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) h = Math.max(h, (1 - d / s.r) * this.harshness);
    }
    for (const f of this.fires) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < 5) h = Math.max(h, 1 - d / 5);
    }
    if (this.slope(x, z) > 7) h = Math.max(h, 0.6);
    if (this.isNight) h = Math.max(h, 0.05);              // cold/dark exposure
    if (!this.inBounds(x, z)) h = 1;
    return Math.min(h, 1);
  }

  shelterAt(x, z) {
    let best = 0;
    for (const b of this.structures) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < 6) best = Math.max(best, (1 - d / 6) * (b.kind === 'stone' ? 1.3 : 1));
    }
    return Math.min(best, 1);
  }

  nearestResource(x, z, maxD, kind = null) {
    let best = null, bd = maxD * maxD;
    for (const r of this.resources) {
      if (r.amount <= 0 || (kind && r.kind !== kind)) continue;
      const dx = r.x - x, dz = r.z - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  nearestStructure(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const b of this.structures) {
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  addStructure(x, z, owner, kind = 'wood') {
    const maxHp = kind === 'stone' ? 260 : 130;
    this.structures.push({ x, y: this.height(x, z) + 0.5, z, owner, kind, hp: maxHp, maxHp });
  }
  addScar(x, z, intensity = 1) {
    this.scars.push({ x, z, intensity: Math.min(intensity, 1) });
    if (this.scars.length > 600) this.scars.shift();
  }
  ignite(x, z) {
    if (this.height(x, z) < 2) return;                   // can't burn water
    this.fires.push({ x, z, life: 50 + this.rng.range(0, 60) });
  }

  step() {
    this.t++;
    const S = this.size / 2 - 8;

    for (const s of this.storms) {
      s.x += s.vx; s.z += s.vz;
      if (s.x < -S || s.x > S) s.vx *= -1;
      if (s.z < -S || s.z > S) s.vz *= -1;
      // lightning: storms occasionally start fires (worse in dry seasons)
      if (this.rng.next() < 0.0005 * this.harshness) {
        const a = this.rng.next() * 6.28, rr = this.rng.next() * s.r;
        this.ignite(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr);
      }
    }

    // fire: burns down, spreads to neighbours, consumes resources
    const spread = [];
    for (const f of this.fires) {
      f.life--;
      if (this.rng.next() < 0.02 && this.fires.length + spread.length < 24) {
        const a = this.rng.next() * 6.28;
        const nx = f.x + Math.cos(a) * 4, nz = f.z + Math.sin(a) * 4;
        if (this.inBounds(nx, nz) && this.height(nx, nz) > 2)
          spread.push({ x: nx, z: nz, life: 25 + this.rng.range(0, 30) });
      }
      for (const r of this.resources)
        if (r.kind === 'wood' && Math.hypot(r.x - f.x, r.z - f.z) < 4) r.amount *= 0.96;
    }
    this.fires.push(...spread);
    this.fires = this.fires.filter(f => f.life > 0);

    // resources regrow by season; new nodes appear (rarely in winter)
    for (const r of this.resources)
      if (r.amount < r.max) r.amount = Math.min(r.max, r.amount + 0.05 * this.growth);
    if (this.rng.next() < 0.004 * this.growth && this.resources.length < 95) this._spawnResource();

    // structures decay; unmaintained ones collapse and leave a scar
    for (const b of this.structures) {
      b.hp -= b.kind === 'stone' ? 0.012 : 0.03;
      for (const f of this.fires)
        if (Math.hypot(b.x - f.x, b.z - f.z) < 4) b.hp -= 0.8;
    }
    const fell = this.structures.filter(b => b.hp <= 0);
    for (const b of fell) this.addScar(b.x, b.z, 0.25);
    if (fell.length) this.structures = this.structures.filter(b => b.hp > 0);
  }
}
