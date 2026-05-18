// A Cube: a small autonomous being. Not a machine.
// Internal state, evolving personality, limited memory & relationships,
// a life cycle, spatial memory, and a lineage.

import { clamp } from './util.js';

export const TRAITS = [
  'aggression', 'sociability', 'loyalty',
  'curiosity', 'caution', 'ambition',
];

export const ACTIONS = ['gather', 'flee', 'group', 'explore', 'attack', 'build', 'rest', 'share'];

const CELL = 6;                     // spatial-memory grid resolution
let _id = 1;
let _lineage = 1;

export class Cube {
  constructor(world, x, z, traits, generation = 1, parents = null) {
    this.id = _id++;
    this.world = world;
    this.alive = true;
    this.generation = generation;
    this.age = 0;
    this.maxAge = 1400 + Math.random() * 1400;   // natural mortality

    this.x = x; this.z = z;
    this.y = world.height(x, z);
    this.heading = Math.random() * Math.PI * 2;

    // two pools: energy fuels movement, health absorbs damage
    this.energy = 70 + Math.random() * 20;
    this.health = 100;
    this.wood = 0;
    this.stone = 0;
    this.sick = 0;                  // disease load 0..1

    // personality (0..1), inherited + mutated each generation
    this.traits = {};
    for (const t of TRAITS) this.traits[t] = clamp(traits?.[t] ?? 0.5);

    // lineage / kinship
    this.parents = parents ? parents.slice() : [];
    this.lineage = parents && parents.length ? parents[0].lineage : _lineage++;
    this.kin = new Set(this.parents.map(p => p.id));
    for (const p of this.parents) for (const k of p.kin) this.kin.add(k);

    // relationships: id -> {trust, fear, friend}
    this.rel = new Map();
    // reinforcement bias per action (cultural/learned tendency)
    this.bias = {};
    for (const a of ACTIONS) this.bias[a] = 0;
    // spatial memory: cellKey -> {x,z,food,hazard,shelter}
    this.places = new Map();

    this._cool = 0;                 // reproduction cooldown
    this.group = null;
    this.isLeader = false;
    this.target = null;             // current move target {x,z}
    this.action = 'explore';
    this.signal = null;             // broadcast: {type, x, z, ttl}

    // lifetime stats — feed the generation snapshot
    this.gathered = 0;
    this.builtCount = 0;
    this.kills = 0;
    this.children = 0;
    this.shared = 0;
    this.highGroundTime = 0;
    this.lastDamage = 0;
  }

  relOf(id) {
    let r = this.rel.get(id);
    if (!r) { r = { trust: 0, fear: 0, friend: 0 }; this.rel.set(id, r); }
    return r;
  }

  remember(id, dTrust = 0, dFear = 0, dFriend = 0) {
    const r = this.relOf(id);
    r.trust = clamp(r.trust + dTrust, -1, 1);
    r.fear = clamp(r.fear + dFear, 0, 1);
    r.friend = clamp(r.friend + dFriend, -1, 1);
  }

  // ---- spatial memory ----
  _cell(x, z) {
    const gx = Math.round(x / CELL), gz = Math.round(z / CELL);
    const key = gx * 1000 + gz;
    let p = this.places.get(key);
    if (!p) { p = { x: gx * CELL, z: gz * CELL, food: 0, hazard: 0, shelter: 0 }; this.places.set(key, p); }
    return p;
  }
  notePlace(kind, amount) {
    const p = this._cell(this.x, this.z);
    p[kind] = clamp(p[kind] + amount, -2, 2);
  }
  // nearest cell whose value of `kind` beats `min`
  recall(kind, min) {
    let best = null, bd = Infinity;
    for (const p of this.places.values()) {
      if (p[kind] <= min) continue;
      const d = (p.x - this.x) ** 2 + (p.z - this.z) ** 2;
      if (d < bd && d > 9) { bd = d; best = p; }
    }
    return best;
  }

  // reinforcement: outcome reinforces last action, and tags the place
  reinforce(outcome) {
    this.bias[this.action] = clamp(this.bias[this.action] + outcome * 0.06, -1, 1);
  }

  // slow forgetting — enables reconciliation & rediscovery
  decay() {
    for (const r of this.rel.values()) {
      r.trust *= 0.9992; r.fear *= 0.9988; r.friend *= 0.9992;
    }
    if (this.places.size > 80) {
      // drop the faintest memory
      let wk = null, wv = Infinity;
      for (const [k, p] of this.places) {
        const v = Math.abs(p.food) + Math.abs(p.hazard) + Math.abs(p.shelter);
        if (v < wv) { wv = v; wk = k; }
      }
      if (wk != null) this.places.delete(wk);
    }
  }

  isKin(o) { return o.lineage === this.lineage || this.kin.has(o.id) || o.kin.has(this.id); }

  get role() {
    const t = this.traits, b = this.bias;
    const s = {
      builder: t.caution + b.build,
      scout: t.curiosity + b.explore,
      fighter: t.aggression + b.attack,
      gatherer: 0.4 + b.gather,
    };
    let best = 'gatherer', bv = -9;
    for (const k in s) if (s[k] > bv) { bv = s[k]; best = k; }
    return best;
  }

  // color from personality, for the renderer
  get color() {
    const t = this.traits;
    return [0.35 + t.aggression * 0.6, 0.35 + t.sociability * 0.55, 0.35 + t.curiosity * 0.6];
  }
}
