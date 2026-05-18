// Simulation orchestrator: world + population + predators, the social
// layer (signals, groups, leadership, territory, gossip, combat,
// sharing), reproduction, disease, reinforcement, social learning,
// and the generational/cultural cycle.

import { World } from './world.js';
import { Cube, TRAITS } from './cube.js';
import { perceive } from './perception.js';
import { think } from './behavior.js';
import { Predator } from './predator.js';
import { snapshot, nextGeneration } from './generation.js';
import { clamp } from './util.js';

const SPECIES_GAP = 0.42;            // trait distance beyond which cubes won't cooperate/breed

function traitDist(a, b) {
  let s = 0;
  for (const t of TRAITS) s += Math.abs(a.traits[t] - b.traits[t]);
  return s / TRAITS.length;
}

export class Sim {
  constructor(opts = {}) {
    this.popSize = opts.popSize || 110;
    this.genTicks = opts.genTicks || 2600;
    this.minPop = 6;
    this.maxPop = Math.round(this.popSize * 1.35);
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
    this.predators = [];
    this._spawnPredators(3);
    this.log(`gen 1: ${this.cubes.length} cubes wake on a new planet`, 'gen');
  }

  get alive() { return this.cubes.filter(c => c.alive); }

  log(msg, cls = '') {
    this.events.unshift({ msg, cls, gen: this.generation });
    if (this.events.length > 40) this.events.pop();
  }

  _spawnPredators(n) {
    const S = this.world.size / 2 - 10;
    for (let i = 0; i < n; i++)
      this.predators.push(new Predator(this.world,
        (Math.random() * 2 - 1) * S, (Math.random() * 2 - 1) * S));
  }

  // ---- signals / groups / leadership ----
  broadcast(cube, type) { cube.signal = { type, x: cube.x, z: cube.z, ttl: 8 }; }

  nearestAlly(cube, p) {
    let best = null, bd = 1e9;
    for (const o of p.allies) {
      const d = (o.x - cube.x) ** 2 + (o.z - cube.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  formGroup(a, b) {
    if (traitDist(a, b) > SPECIES_GAP && !a.isKin(b)) return;   // different species
    if (a.group && b.group && a.group === b.group) return;
    const g = a.group || b.group || ++this._gid;
    a.group = g; b.group = g;
    a.remember(b.id, 0.04, 0, 0.06);
    b.remember(a.id, 0.04, 0, 0.06);
  }

  // group's soft territory: centroid + spread of its members
  territory(group) {
    if (!group) return null;
    let n = 0, cx = 0, cz = 0;
    for (const c of this.cubes) if (c.alive && c.group === group) { cx += c.x; cz += c.z; n++; }
    if (n < 3) return null;
    return { x: cx / n, z: cz / n, r: 16 + n * 0.6, n };
  }

  trespass(att, intruder) {
    if (!intruder || !att.group || att.group === intruder.group) return false;
    const t = this.territory(att.group);
    if (!t) return false;
    return Math.hypot(intruder.x - t.x, intruder.z - t.z) < t.r;
  }

  fight(att, def) {
    const power = 0.6 + att.traits.aggression + Math.random() * 0.4;
    const dmg = power * (4 + att.energy * 0.04);
    def.health -= dmg;
    def.lastDamage = 4;
    att.energy -= 1.2;

    def.remember(att.id, -0.3, 0.5, -0.4);
    for (const o of this.cubes)               // the victim's group remembers
      if (o.alive && o.group && o.group === def.group && o !== def)
        o.remember(att.id, -0.1, 0.2, -0.15);
    att.remember(def.id, -0.1, 0.1, -0.2);
    this.world.addScar(def.x, def.z, 0.6);

    if (def.health <= 0) {
      att.kills++; att.reinforce(0.8);
      att.energy = clamp(att.energy + 12, 0, 100);
      this.kill(def, 'combat');
      if (att.kills === 1 || att.kills % 5 === 0)
        this.log(`gen ${this.generation}: #${att.id} defeated #${def.id}`, 'big');
    } else att.reinforce(0.2);
  }

  fightPredator(att, pred) {
    pred.health -= 6 + att.traits.aggression * 6 + Math.random() * 4;
    att.health -= 4 + Math.random() * 4;
    att.lastDamage = 4;
    if (pred.health <= 0) {
      pred.alive = false;
      att.kills++; att.energy = clamp(att.energy + 18, 0, 100); att.reinforce(0.9);
      this.log(`gen ${this.generation}: #${att.id} drove off a predator`, 'big');
    }
  }

  hazardDir(cube) {
    let x = 0, z = 0;
    for (const s of this.world.storms) {
      const d = Math.hypot(cube.x - s.x, cube.z - s.z);
      if (d < s.r + 4) { x += (cube.x - s.x) / d; z += (cube.z - s.z) / d; }
    }
    for (const f of this.world.fires) {
      const d = Math.hypot(cube.x - f.x, cube.z - f.z);
      if (d < 8) { x += (cube.x - f.x) / d; z += (cube.z - f.z) / d; }
    }
    return { x, z };
  }

  kill(cube, cause) {
    if (!cube.alive) return;
    cube.alive = false;
    cube.action = 'dead';
    this.world.addScar(cube.x, cube.z, cause === 'combat' ? 0.5 : 0.3);
  }

  // ---- reproduction (within a generation) ----
  _tryReproduce(a, b) {
    if (this.cubes.filter(c => c.alive).length >= this.maxPop) return;
    if (a.energy < 58 || b.energy < 58 || a.age < 60 || b.age < 60) return;
    if (a._cool > 0 || b._cool > 0) return;
    if (traitDist(a, b) > SPECIES_GAP && !a.isKin(b)) return;       // reproductive isolation
    const traits = {};
    for (const t of TRAITS) traits[t] = clamp((a.traits[t] + b.traits[t]) / 2 + (Math.random() - 0.5) * 0.14);
    const x = clamp((a.x + b.x) / 2 + (Math.random() - .5) * 4, -55, 55);
    const z = clamp((a.z + b.z) / 2 + (Math.random() - .5) * 4, -55, 55);
    const child = new Cube(this.world, x, z, traits, this.generation, [a, b]);
    child.group = a.group || b.group;
    a.energy -= 16; b.energy -= 16; a._cool = 850; b._cool = 850;
    a.children++; b.children++;
    this.cubes.push(child);
  }

  // ---- perception-time effects: signals + gossip ----
  _hearSignals(cube, p) {
    for (const o of p.near) {
      if (o.signal && o.signal.ttl > 0) {
        if (o.signal.type === 'danger') {
          cube.relOf(o.id).trust += 0.005;
          if (cube.traits.caution > 0.4) cube.target = null;
        } else if (o.signal.type === 'gather' && cube.traits.sociability > 0.4) {
          cube.target = { x: o.signal.x, z: o.signal.z };
        }
      }
    }
    // gossip: trusted allies share their strongest opinion about a third party
    if (p.allies.length && Math.random() < 0.05) {
      const src = p.allies[(Math.random() * p.allies.length) | 0];
      let strong = null, mag = 0.5;
      for (const [id, r] of src.rel) {
        const m = Math.abs(r.fear) + Math.abs(r.friend);
        if (m > mag && id !== cube.id) { mag = m; strong = [id, r]; }
      }
      if (strong) cube.remember(strong[0], strong[1].trust * 0.1, strong[1].fear * 0.15, strong[1].friend * 0.15);
    }
  }

  _socialLearn(cube, p) {
    if (Math.random() > 0.01) return;
    let role = null, be = cube.energy + 8;
    for (const o of p.allies.concat(p.strangers))
      if (o.energy > be) { be = o.energy; role = o; }
    if (role && traitDist(cube, role) < SPECIES_GAP) {
      const t = TRAITS[(Math.random() * TRAITS.length) | 0];
      cube.traits[t] = clamp(cube.traits[t] * 0.85 + role.traits[t] * 0.15);
    }
  }

  // ---- disease ----
  _contagion() {
    if (this.tick % 5) return;
    if (Math.random() < 0.02) {                 // a new infection emerges
      const a = this.alive;
      if (a.length) a[(Math.random() * a.length) | 0].sick = 0.8;
    }
    for (const c of this.cubes) {
      if (!c.alive || c.sick < 0.2) continue;
      for (const o of this.cubes) {
        if (o === c || !o.alive || o.sick > 0.1) continue;
        if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 < 12 && Math.random() < 0.25) o.sick = 0.7;
      }
    }
  }

  // periodically appoint group leaders (highest ambition * vitality)
  _leadership() {
    if (this.tick % 60) return;
    const byGroup = new Map();
    for (const c of this.cubes) {
      if (!c.alive) continue;
      c.isLeader = false;
      if (!c.group) continue;
      const cur = byGroup.get(c.group);
      const score = c.traits.ambition * (c.energy + c.health);
      if (!cur || score > cur.s) byGroup.set(c.group, { c, s: score });
    }
    for (const { c } of byGroup.values()) c.isLeader = true;
  }

  step() {
    this.world.step();

    for (const pr of this.predators) if (pr.alive) pr.step(this.cubes);
    this.predators = this.predators.filter(p => p.alive);
    // keep a small, roughly constant pack — scaled to population
    const target = Math.max(2, Math.round(this.alive.length / 28));
    if (this.predators.length < target && Math.random() < 0.01) this._spawnPredators(1);

    const order = this.cubes;
    for (const c of order) {
      if (!c.alive) continue;
      if (c._cool > 0) c._cool--;
      const p = perceive(c, this.cubes, this.world, this.predators);
      this._hearSignals(c, p);
      think(c, p, this.world, this);
      this._socialLearn(c, p);

      // mate with a compatible, willing neighbour (kin/allies preferred,
      // but any nearby compatible cube will do)
      if (c.energy > 58 && c._cool <= 0) {
        for (const o of p.near) {
          if (o.alive && o.energy > 58 && o._cool <= 0 &&
              (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < 14) { this._tryReproduce(c, o); break; }
        }
      }
      if (c.signal) { c.signal.ttl--; if (c.signal.ttl <= 0) c.signal = null; }
      if (c.lastDamage > 0) c.lastDamage--;
    }

    this._contagion();
    this._leadership();

    this.tick++;
    const alive = this.alive.length;
    if (this.tick >= this.genTicks || alive <= this.minPop) this._advanceGeneration();
  }

  _advanceGeneration() {
    this.snap = snapshot(this.cubes, this.world, this.generation);
    const summary = TRAITS.map(t => `${t[0]}${this.snap.traits[t].toFixed(2)}`).join(' ');
    this.log(
      `gen ${this.generation} ended — ${this.snap.survivors} survived · ` +
      `${this.snap.births} born · ${this.snap.builds} built · culture[${summary}]`, 'gen');

    this.generation++;
    this.tick = 0;
    this.cubes = nextGeneration(this.world, this.snap, this.popSize, this.generation);
    this.predators = this.predators.slice(0, 3);
    this.log(
      `gen ${this.generation}: ${this.cubes.length} descendants inherit the world ` +
      `(${this.world.structures.length} structures, ${this.world.scars.length} scars)`, 'gen');
  }

  stats() {
    const a = this.alive;
    const avg = {};
    for (const t of TRAITS) avg[t] = a.reduce((s, c) => s + c.traits[t], 0) / (a.length || 1);
    const groups = new Set(a.map(c => c.group).filter(Boolean)).size;
    const species = new Set(a.map(c => c.lineage)).size;
    const roles = {};
    for (const c of a) roles[c.role] = (roles[c.role] || 0) + 1;
    return {
      generation: this.generation, tick: this.tick, genTicks: this.genTicks,
      alive: a.length, pop: this.popSize, groups, species,
      predators: this.predators.length,
      structures: this.world.structures.length, scars: this.world.scars.length,
      fires: this.world.fires.length, season: this.world.season,
      night: this.world.isNight, roles, avg,
    };
  }
}
Sim.prototype._gid = 0;
