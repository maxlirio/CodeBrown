// The World: a small persistent living planet.
// Terrain heightmap + resources + moving storm hazards + cliffs +
// landmarks + structures (placed blocks) + scars of past generations.

import { RNG, makeNoise, clamp } from './util.js';

export const WORLD = {
  size: 120,        // world spans [-size/2, size/2] on x and z
  hMax: 14,         // max terrain height
};

export class World {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.noise = makeNoise(this.seed);
    this.size = WORLD.size;

    this.resources = [];   // {x,z,amount,max}
    this.storms = [];      // {x,z,r,vx,vz} moving hazard zones
    this.landmarks = [];   // {x,z,name}  navigation/memory anchors
    this.structures = [];  // {x,y,z,owner} placed shelter blocks (persistent)
    this.scars = [];       // {x,z,intensity} history of violence/death (persistent)

    this._buildTerrain();
    this._seedResources(70);
    this._seedStorms(3);
    this._seedLandmarks();
  }

  // ---- terrain ----
  _buildTerrain() {
    const n = this.noise, S = this.size;
    this.height = (x, z) => {
      const u = (x + S / 2) / S, v = (z + S / 2) / S;
      let h = n(u * 5, v * 5) * 0.7 + n(u * 13, v * 13) * 0.3;
      // island falloff so the planet has edges (water/void around it)
      const cx = (u - 0.5) * 2, cz = (v - 0.5) * 2;
      const fall = clamp(1.15 - Math.sqrt(cx * cx + cz * cz) * 1.15);
      h *= fall;
      return h * WORLD.hMax;
    };
  }

  inBounds(x, z) {
    const b = this.size / 2 - 2;
    return x > -b && x < b && z > -b && z < b;
  }

  // steepness ~ cliff hazard
  slope(x, z) {
    const d = 1.2;
    const hx = this.height(x + d, z) - this.height(x - d, z);
    const hz = this.height(x, z + d) - this.height(x, z - d);
    return Math.sqrt(hx * hx + hz * hz) / d;
  }

  // ---- resources ----
  _seedResources(count) {
    for (let i = 0; i < count; i++) this._spawnResource();
  }
  _spawnResource() {
    const S = this.size / 2 - 6;
    for (let t = 0; t < 12; t++) {
      const x = this.rng.range(-S, S), z = this.rng.range(-S, S);
      if (this.height(x, z) > 1.5 && this.slope(x, z) < 4) {
        const max = this.rng.range(40, 100);
        this.resources.push({ x, z, amount: max, max });
        return;
      }
    }
  }

  // ---- storms (moving circular hazard) ----
  _seedStorms(count) {
    const S = this.size / 2 - 10;
    for (let i = 0; i < count; i++) {
      this.storms.push({
        x: this.rng.range(-S, S), z: this.rng.range(-S, S),
        r: this.rng.range(8, 16),
        vx: this.rng.range(-0.05, 0.05), vz: this.rng.range(-0.05, 0.05),
      });
    }
  }

  _seedLandmarks() {
    // find a few high points as natural landmarks
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

  // ---- hazard query ----
  hazardAt(x, z) {
    let h = 0;
    for (const s of this.storms) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) h = Math.max(h, 1 - d / s.r);
    }
    if (this.slope(x, z) > 7) h = Math.max(h, 0.6); // cliff
    if (!this.inBounds(x, z)) h = 1;                  // the void
    return h;
  }

  // safety bonus near structures (shelter)
  shelterAt(x, z) {
    let best = 0;
    for (const b of this.structures) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < 6) best = Math.max(best, 1 - d / 6);
    }
    return best;
  }

  nearestResource(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const r of this.resources) {
      if (r.amount <= 0) continue;
      const dx = r.x - x, dz = r.z - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  addStructure(x, z, owner) {
    this.structures.push({ x, y: this.height(x, z) + 0.5, z, owner });
  }
  addScar(x, z, intensity = 1) {
    this.scars.push({ x, z, intensity: Math.min(intensity, 1) });
    if (this.scars.length > 600) this.scars.shift();
  }

  // per-tick world evolution
  step() {
    const S = this.size / 2 - 8;
    for (const s of this.storms) {
      s.x += s.vx; s.z += s.vz;
      if (s.x < -S || s.x > S) s.vx *= -1;
      if (s.z < -S || s.z > S) s.vz *= -1;
    }
    // resources slowly regrow; occasionally a new node appears
    for (const r of this.resources) {
      if (r.amount < r.max) r.amount = Math.min(r.max, r.amount + 0.02);
    }
    if (this.rng.next() < 0.004 && this.resources.length < 90) this._spawnResource();
  }
}
