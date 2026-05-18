// Emotion-driven utility AI. Cubes have drives, not rules.
// Each tick they feel survival / safety / social / exploration / dominance
// pressure, score every action emotionally, then act.

import { clamp } from './util.js';
import { VISION } from './perception.js';

const SPEED = 0.42;

function drives(cube, p) {
  const t = cube.traits;
  const survival = clamp(1 - cube.energy / 100) * 1.2;
  const safety = clamp(p.hazard * (0.6 + t.caution) +
    p.threats.length * 0.25 * (0.5 + t.caution) - p.shelter * 0.4);
  const lonely = clamp(0.5 - p.allies.length * 0.2);
  const social = clamp(t.sociability * lonely +
    (p.threats.length ? t.sociability * 0.5 : 0));
  const explore = clamp(t.curiosity * 0.8 - p.hazard * 0.5 - survival * 0.4);
  const dominance = clamp(t.ambition * 0.7 * clamp(p.advantage / 3));
  return { survival, safety, social, explore, dominance };
}

function score(cube, p, d) {
  const t = cube.traits, b = cube.bias, s = {};

  s.gather = (p.resource ? 1 : 0) * (d.survival * 1.3 + 0.2) + b.gather;
  s.flee = d.safety * (0.7 + t.caution) * (p.hazard > 0.05 || p.threats.length ? 1 : 0.1) + b.flee;
  s.group = d.social * (0.6 + t.loyalty) + (p.threats.length ? d.safety * 0.5 : 0) + b.group;
  s.explore = d.explore * (0.6 + t.curiosity) + b.explore;
  s.attack = (p.threats.length || p.strangers.length ? 1 : 0) *
    (t.aggression * 0.9 + d.dominance) * clamp(p.advantage / 2) + b.attack;
  s.build = (cube.materials > 8 ? 1 : 0) * (d.safety * 0.8 + t.caution * 0.4) *
    (1 - p.shelter) + b.build;
  s.rest = (cube.energy < 45 && p.hazard < 0.1 && !p.threats.length ? 1 : 0) *
    (1 - d.survival * 0.5) + b.rest;

  // a little noise so cubes hesitate and diverge
  for (const k in s) s[k] += Math.random() * 0.12;
  return s;
}

function pickAction(s) {
  let best = 'explore', bv = -1e9;
  for (const k in s) if (s[k] > bv) { bv = s[k]; best = k; }
  return best;
}

function moveToward(cube, tx, tz, world) {
  const dx = tx - cube.x, dz = tz - cube.z;
  const d = Math.hypot(dx, dz) || 1;
  let nx = cube.x + (dx / d) * SPEED;
  let nz = cube.z + (dz / d) * SPEED;
  // avoid walking off the planet / down sheer cliffs
  if (!world.inBounds(nx, nz) || world.slope(nx, nz) > 7) {
    cube.heading += 2.1;
    nx = cube.x + Math.cos(cube.heading) * SPEED;
    nz = cube.z + Math.sin(cube.heading) * SPEED;
  }
  if (world.inBounds(nx, nz)) {
    cube.x = nx; cube.z = nz;
    cube.heading = Math.atan2(dz, dx);
  }
  cube.y += (world.height(cube.x, cube.z) - cube.y) * 0.3;
}

function wander(cube, world) {
  if (!cube.target || Math.hypot(cube.target.x - cube.x, cube.target.z - cube.z) < 2) {
    // curious cubes bias toward landmarks / high ground (cultural memory)
    if (Math.random() < cube.traits.curiosity * 0.5 && world.landmarks.length) {
      const lm = world.landmarks[(Math.random() * world.landmarks.length) | 0];
      cube.target = { x: lm.x + (Math.random() - 0.5) * 16, z: lm.z + (Math.random() - 0.5) * 16 };
    } else {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 20;
      cube.target = { x: clamp(cube.x + Math.cos(a) * r, -55, 55),
                      z: clamp(cube.z + Math.sin(a) * r, -55, 55) };
    }
  }
  moveToward(cube, cube.target.x, cube.target.z, world);
}

export function think(cube, p, world, sim) {
  const d = drives(cube, p);
  const s = score(cube, p, d);
  cube.action = pickAction(s);

  switch (cube.action) {
    case 'gather': {
      if (p.resource) {
        const r = p.resource;
        if (Math.hypot(r.x - cube.x, r.z - cube.z) < 1.6) {
          const got = Math.min(r.amount, 1.4);
          r.amount -= got; cube.energy = clamp(cube.energy + got * 2.2, 0, 100);
          cube.materials += got * 0.4; cube.gathered += got;
          cube.reinforce(0.5);
        } else moveToward(cube, r.x, r.z, world);
      } else wander(cube, world);
      break;
    }
    case 'flee': {
      // run from the strongest threat / hazard, toward shelter if known
      let fx = cube.x, fz = cube.z;
      for (const e of p.threats) { fx -= (e.x - cube.x); fz -= (e.z - cube.z); }
      if (p.hazard > 0.05) { fx -= (sim.hazardDir(cube).x); fz -= (sim.hazardDir(cube).z); }
      moveToward(cube, cube.x + fx * 0.5 + (Math.random() - .5),
                       cube.z + fz * 0.5 + (Math.random() - .5), world);
      if (cube.traits.sociability > 0.5) sim.broadcast(cube, 'danger');
      break;
    }
    case 'group': {
      const a = sim.nearestAlly(cube, p) || p.strangers[0];
      if (a) {
        moveToward(cube, a.x, a.z, world);
        if (Math.hypot(a.x - cube.x, a.z - cube.z) < 4) {
          sim.formGroup(cube, a);
          cube.remember(a.id, 0.05, 0, 0.05);
        }
      } else { sim.broadcast(cube, 'gather'); wander(cube, world); }
      break;
    }
    case 'attack': {
      const tgt = p.threats[0] || p.strangers[0];
      if (tgt && tgt.alive) {
        if (Math.hypot(tgt.x - cube.x, tgt.z - cube.z) < 2) {
          sim.fight(cube, tgt);
        } else moveToward(cube, tgt.x, tgt.z, world);
      } else wander(cube, world);
      break;
    }
    case 'build': {
      if (cube.materials > 8 && world.slope(cube.x, cube.z) < 3) {
        world.addStructure(cube.x, cube.z, cube.id);
        cube.materials -= 8; cube.builtCount++;
        cube.reinforce(0.4);
        sim.log(`gen ${cube.generation}: cube #${cube.id} built shelter`);
      } else wander(cube, world);
      break;
    }
    case 'rest': {
      cube.energy = clamp(cube.energy + 0.5, 0, 100);
      break;
    }
    default: wander(cube, world);
  }

  // metabolism + environment
  const moveCost = cube.action === 'rest' ? 0 : 0.18;
  cube.energy -= moveCost + p.hazard * 1.4;
  if (p.hazard > 0.05) { cube.lastDamage = 3; cube.reinforce(-0.6); }
  if (p.shelter > 0.3) cube.energy = clamp(cube.energy + p.shelter * 0.15, 0, 100);
  if (world.height(cube.x, cube.z) > 8) cube.highGroundTime++;
  cube.age++;

  if (cube.energy <= 0) sim.kill(cube, p.hazard > 0.3 ? 'storm' : 'starvation');
}
