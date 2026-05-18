// Simulation orchestrator: holds the world + population, runs ticks,
// the social layer (signals, groups, combat), reinforcement &
// social learning, and the generational cycle.

import { World } from './world.js';
import { Cube, TRAITS } from './cube.js';
import { perceive, VISION } from './perception.js';
import { think } from './behavior.js';
import { snapshot, nextGeneration } from './generation.js';
import { clamp } from './util.js';

export class Sim {
  constructor(opts = {}) {
    this.popSize = opts.popSize || 110;
    this.genTicks = opts.genTicks || 2200;     // soft generation length
    this.minPop = 6;
    this.reset(opts.seed);
  }

  reset(seed) {
    this.world = new World(seed ?? Date.now());
    this.generation = 1;
    this.tick = 0;
    this.snap = null;
    this.events = [];
    this.cubes = nextGeneration(this.world, null, this.popSize, 1);
    for (const c of this.cubes) for (const t of TRAITS) c.traits[t] = 0.4 + Math.random() * 0.2;
    this.log(`gen 1: ${this.cubes.length} cubes wake on a new planet`, 'gen');
  }

  get alive() { return this.cubes.filter(c => c.alive); }

  log(msg, cls = '') {
    this.events.unshift({ msg, cls, gen: this.generation });
    if (this.events.length > 40) this.events.pop();
  }

  // ---- social layer ----
  broadcast(cube, type) {
    cube.signal = { type, x: cube.x, z: cube.z, ttl: 8 };
  }

  nearestAlly(cube, p) {
    let best = null, bd = 1e9;
    for (const o of p.allies) {
      const d = (o.x - cube.x) ** 2 + (o.z - cube.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  formGroup(a, b) {
    if (a.group && b.group && a.group === b.group) return;
    const g = a.group || b.group || ++this._gid;
    if (!this._groups) this._groups = new Map();
    a.group = g; b.group = g;
    a.remember(b.id, 0.04, 0, 0.06);
    b.remember(a.id, 0.04, 0, 0.06);
  }

  fight(att, def) {
    const power = 0.6 + att.traits.aggression + Math.random() * 0.4;
    const dmg = power * (4 + att.energy * 0.04);
    def.energy -= dmg;
    def.lastDamage = 4;
    att.energy -= 1.2;

    // memory of betrayal/help spreads through the social graph
    def.remember(att.id, -0.3, 0.5, -0.4);
    for (const o of this.cubes) {
      if (o.alive && o.group && o.group === def.group && o !== def)
        o.remember(att.id, -0.1, 0.2, -0.15);
    }
    att.remember(def.id, -0.1, 0.1, -0.2);
    this.world.addScar(def.x, def.z, 0.6);

    if (def.energy <= 0) {
      att.kills++; att.reinforce(0.8);
      att.energy = clamp(att.energy + 12, 0, 100);
      this.kill(def, 'combat');
      if (att.kills === 1 || att.kills % 5 === 0)
        this.log(`gen ${this.generation}: cube #${att.id} defeated #${def.id}`, 'big');
    } else {
      att.reinforce(0.2);
    }
  }

  hazardDir(cube) {
    let x = 0, z = 0;
    for (const s of this.world.storms) {
      const d = Math.hypot(cube.x - s.x, cube.z - s.z);
      if (d < s.r + 4) { x += (cube.x - s.x) / d; z += (cube.z - s.z) / d; }
    }
    return { x, z };
  }

  kill(cube, cause) {
    if (!cube.alive) return;
    cube.alive = false;
    cube.action = 'dead';
    this.world.addScar(cube.x, cube.z, cause === 'combat' ? 0.5 : 0.3);
  }

  // hearing signals from neighbours alters internal state
  _hearSignals(cube, p) {
    for (const o of p.near) {
      if (!o.signal || o.signal.ttl <= 0) continue;
      const r = cube.relOf(o.id);
      if (o.signal.type === 'danger') {
        cube.energy -= 0; r.trust += 0.005;
        if (cube.traits.caution > 0.4) cube.target = null; // re-evaluate
      } else if (o.signal.type === 'gather' && cube.traits.sociability > 0.4) {
        cube.target = { x: o.signal.x, z: o.signal.z };
      }
    }
  }

  // simple social learning: occasionally imitate a thriving neighbour
  _socialLearn(cube, p) {
    if (Math.random() > 0.01) return;
    let role = null, be = cube.energy + 8;
    for (const o of p.allies.concat(p.strangers))
      if (o.energy > be) { be = o.energy; role = o; }
    if (role) {
      const t = TRAITS[(Math.random() * TRAITS.length) | 0];
      cube.traits[t] = clamp(cube.traits[t] * 0.85 + role.traits[t] * 0.15);
    }
  }

  step() {
    this.world.step();

    for (const c of this.cubes) {
      if (!c.alive) continue;
      const p = perceive(c, this.cubes, this.world);
      this._hearSignals(c, p);
      think(c, p, this.world, this);
      this._socialLearn(c, p);
      if (c.signal) { c.signal.ttl--; if (c.signal.ttl <= 0) c.signal = null; }
      if (c.lastDamage > 0) c.lastDamage--;
    }

    this.tick++;
    const alive = this.alive.length;

    // generation ends: soft timer reached, or population collapsed
    if (this.tick >= this.genTicks || alive <= this.minPop) {
      this._advanceGeneration();
    }
  }

  _advanceGeneration() {
    this.snap = snapshot(this.cubes, this.world, this.generation);
    const summary = TRAITS.map(t => `${t[0]}${this.snap.traits[t].toFixed(2)}`).join(' ');
    this.log(
      `gen ${this.generation} ended — ${this.snap.survivors} survived · ` +
      `${this.snap.builds} structures · culture[${summary}]`, 'gen');

    this.generation++;
    this.tick = 0;
    this.cubes = nextGeneration(this.world, this.snap, this.popSize, this.generation);
    this.log(
      `gen ${this.generation}: ${this.cubes.length} descendants inherit the world ` +
      `(${this.world.structures.length} standing structures, ` +
      `${this.world.scars.length} scars)`, 'gen');
  }

  stats() {
    const a = this.alive;
    const avg = {};
    for (const t of TRAITS) avg[t] = a.reduce((s, c) => s + c.traits[t], 0) / (a.length || 1);
    const groups = new Set(a.map(c => c.group).filter(Boolean)).size;
    return {
      generation: this.generation, tick: this.tick, genTicks: this.genTicks,
      alive: a.length, pop: this.popSize, groups,
      structures: this.world.structures.length, scars: this.world.scars.length,
      avg,
    };
  }
}
Sim.prototype._gid = 0;
