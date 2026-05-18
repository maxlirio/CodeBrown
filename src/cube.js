// A Cube: a small autonomous being. Not a machine.
// Internal state, evolving personality, limited memory & relationships.

import { clamp } from './util.js';

export const TRAITS = [
  'aggression', 'sociability', 'loyalty',
  'curiosity', 'caution', 'ambition',
];

export const ACTIONS = ['gather', 'flee', 'group', 'explore', 'attack', 'build', 'rest'];

let _id = 1;

export class Cube {
  constructor(world, x, z, traits, generation = 1) {
    this.id = _id++;
    this.world = world;
    this.alive = true;
    this.generation = generation;
    this.age = 0;

    this.x = x; this.z = z;
    this.y = world.height(x, z);
    this.heading = Math.random() * Math.PI * 2;

    this.energy = 70 + Math.random() * 20;
    this.materials = 0;

    // personality (0..1), inherited + mutated each generation
    this.traits = {};
    for (const t of TRAITS) this.traits[t] = clamp(traits?.[t] ?? 0.5);

    // relationships: id -> {trust, fear, friend}
    this.rel = new Map();
    // reinforcement bias per action (cultural/learned tendency)
    this.bias = {};
    for (const a of ACTIONS) this.bias[a] = 0;

    this.group = null;
    this.target = null;       // current move target {x,z}
    this.action = 'explore';
    this.signal = null;       // broadcast: {type, x, z, ttl}
    this.heard = [];          // signals perceived this tick

    // lifetime stats — feed the generation snapshot
    this.gathered = 0;
    this.builtCount = 0;
    this.kills = 0;
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

  // reinforcement: outcome>0 reinforces last action, <0 discourages it
  reinforce(outcome) {
    const a = this.action;
    this.bias[a] = clamp(this.bias[a] + outcome * 0.06, -1, 1);
  }

  // average color from personality, for the renderer
  get color() {
    const t = this.traits;
    const r = 0.35 + t.aggression * 0.6;
    const g = 0.35 + t.sociability * 0.55;
    const b = 0.35 + t.curiosity * 0.6;
    return [r, g, b];
  }
}
