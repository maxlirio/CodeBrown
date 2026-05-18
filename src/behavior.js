// Emotion-driven utility AI. Cubes have drives, not rules.
// Survival / safety / social / exploration / dominance pressure,
// scored emotionally, informed by spatial memory and the clock.

import { clamp } from './util.js';

const SPEED = 0.42;

function drives(cube, p, world) {
  const t = cube.traits;
  const hunger = clamp(1 - cube.energy / 100);
  const hurt = clamp(1 - cube.health / 100);
  const survival = (hunger * 1.1 + hurt * 0.6) * 1.1;
  const predator = p.predator ? 0.6 : 0;
  const safety = clamp(p.hazard * (0.6 + t.caution) +
    p.threats.length * 0.25 * (0.5 + t.caution) + predator - p.shelter * 0.4);
  const lonely = clamp(0.5 - p.allies.length * 0.2);
  const social = clamp(t.sociability * lonely +
    (p.threats.length || p.predator ? t.sociability * 0.5 : 0));
  const explore = clamp(t.curiosity * 0.8 - p.hazard * 0.5 - survival * 0.4 -
    (world.isNight ? 0.3 : 0));
  const dominance = clamp(t.ambition * 0.7 * clamp(p.advantage / 3));
  return { survival, safety, social, explore, dominance, hunger, hurt };
}

function score(cube, p, d, world) {
  const t = cube.traits, b = cube.bias, s = {};
  const knowsFood = p.resource || cube.recall('food', 0.3);

  s.gather = (knowsFood ? 1 : 0.15) * (d.survival * 1.3 + 0.2) + b.gather;
  s.flee = d.safety * (0.7 + t.caution) *
    (p.hazard > 0.05 || p.threats.length || p.predator ? 1 : 0.1) + b.flee;
  s.group = d.social * (0.6 + t.loyalty) +
    ((p.threats.length || p.predator) ? d.safety * 0.5 : 0) + b.group;
  s.explore = d.explore * (0.6 + t.curiosity) + b.explore;
  s.attack = ((p.threats.length || p.strangers.length || p.predator) ? 1 : 0) *
    (t.aggression * 0.9 + d.dominance) * clamp(p.advantage / 2) + b.attack;
  // cautious cubes pursue shelter even before they have materials —
  // the build action itself routes them to wood/stone first
  s.build = (0.25 + d.safety * 0.7 + t.caution * 0.6 +
    (world.isNight ? 0.35 : 0)) * (1 - p.shelter) +
    ((cube.wood + cube.stone) > 4 ? 0.4 : 0) + b.build;
  s.rest = (cube.energy < 50 && p.hazard < 0.1 && !p.threats.length && !p.predator ? 1 : 0) *
    (1 - d.survival * 0.5) * (world.isNight ? 1.6 : 1) * (0.5 + p.shelter) + b.rest;
  s.share = (cube.energy > 65 ? 1 : 0) * t.sociability * 0.7 *
    (p.allies.some(a => a.energy < 35) ? 1 : 0.05) + b.share;

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
    const danger = cube.recall('hazard', 0.5);
    if (Math.random() < cube.traits.curiosity * 0.5 && world.landmarks.length) {
      const lm = world.landmarks[(Math.random() * world.landmarks.length) | 0];
      cube.target = { x: lm.x + (Math.random() - 0.5) * 16, z: lm.z + (Math.random() - 0.5) * 16 };
    } else {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 20;
      cube.target = { x: clamp(cube.x + Math.cos(a) * r, -55, 55),
                      z: clamp(cube.z + Math.sin(a) * r, -55, 55) };
    }
    // steer away from a place remembered as dangerous
    if (danger && Math.hypot(danger.x - cube.target.x, danger.z - cube.target.z) < 14) {
      cube.target.x += (cube.target.x - danger.x);
      cube.target.z += (cube.target.z - danger.z);
    }
  }
  moveToward(cube, cube.target.x, cube.target.z, world);
}

function harvest(cube, r, world) {
  const got = Math.min(r.amount, 1.4);
  r.amount -= got;
  if (r.kind === 'food') { cube.energy = clamp(cube.energy + got * 3.6, 0, 100); cube.notePlace('food', 0.3); }
  else if (r.kind === 'wood') cube.wood += got * 0.7;
  else cube.stone += got * 0.6;
  cube.gathered += got;
  cube.reinforce(0.5);
}

export function think(cube, p, world, sim) {
  const d = drives(cube, p, world);
  const s = score(cube, p, d, world);
  cube.action = pickAction(s);

  switch (cube.action) {
    case 'gather': {
      let r = p.resource;
      if (!r) { const m = cube.recall('food', 0.3); if (m) { moveToward(cube, m.x, m.z, world); break; } }
      if (r) {
        if (Math.hypot(r.x - cube.x, r.z - cube.z) < 1.6) harvest(cube, r, world);
        else moveToward(cube, r.x, r.z, world);
      } else wander(cube, world);
      break;
    }
    case 'flee': {
      let fx = 0, fz = 0;
      for (const e of p.threats) { fx -= (e.x - cube.x); fz -= (e.z - cube.z); }
      if (p.predator) { fx -= (p.predator.x - cube.x) * 2; fz -= (p.predator.z - cube.z) * 2; }
      if (p.hazard > 0.05) { const h = sim.hazardDir(cube); fx -= h.x; fz -= h.z; }
      const sh = world.nearestStructure(cube.x, cube.z, 30);
      if (sh && cube.traits.caution > 0.4) { fx += (sh.x - cube.x) * 0.6; fz += (sh.z - cube.z) * 0.6; }
      moveToward(cube, cube.x + fx + (Math.random() - .5), cube.z + fz + (Math.random() - .5), world);
      if (cube.traits.sociability > 0.45) sim.broadcast(cube, 'danger');
      break;
    }
    case 'group': {
      const a = sim.nearestAlly(cube, p) || p.kin[0] || p.strangers[0];
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
      // prefer prey: the predator if outmatched-safe, else a non-kin cube
      if (p.predator && p.advantage > 1.5) {
        if (Math.hypot(p.predator.x - cube.x, p.predator.z - cube.z) < 2) sim.fightPredator(cube, p.predator);
        else moveToward(cube, p.predator.x, p.predator.z, world);
        break;
      }
      let tgt = p.threats[0] || p.strangers.find(o => !cube.isKin(o));
      if (sim.trespass(cube, tgt)) cube.remember(tgt.id, -0.05, 0.1, -0.1);
      if (tgt && tgt.alive) {
        if (Math.hypot(tgt.x - cube.x, tgt.z - cube.z) < 2) sim.fight(cube, tgt);
        else moveToward(cube, tgt.x, tgt.z, world);
      } else wander(cube, world);
      break;
    }
    case 'build': {
      // maintain a decaying nearby structure before raising a new one
      const near = world.nearestStructure(cube.x, cube.z, 5);
      if (near && near.hp < near.maxHp * 0.6) {
        if (Math.hypot(near.x - cube.x, near.z - cube.z) < 3) {
          near.hp = Math.min(near.maxHp, near.hp + 8);
          cube.wood = Math.max(0, cube.wood - 0.5);
          cube.reinforce(0.25);
        } else moveToward(cube, near.x, near.z, world);
        break;
      }
      const useStone = cube.stone > 5 && cube.traits.caution > 0.55;
      const enough = useStone ? cube.stone > 5 : cube.wood > 5;
      if (enough && world.slope(cube.x, cube.z) < 3 && p.shelter < 0.2) {
        world.addStructure(cube.x, cube.z, cube.id, useStone ? 'stone' : 'wood');
        if (useStone) cube.stone -= 5; else cube.wood -= 5;
        cube.builtCount++; cube.notePlace('shelter', 0.6); cube.reinforce(0.4);
        if (cube.builtCount === 1) sim.log(`gen ${cube.generation}: #${cube.id} built a ${useStone ? 'stone' : 'wood'} shelter`);
      } else {
        // need materials: go cut wood / quarry stone (visible or remembered)
        const want = useStone || cube.stone > cube.wood ? p.stone : p.wood;
        if (want) {
          if (Math.hypot(want.x - cube.x, want.z - cube.z) < 1.6) harvest(cube, want, world);
          else moveToward(cube, want.x, want.z, world);
        } else wander(cube, world);
      }
      break;
    }
    case 'share': {
      const needy = p.allies.filter(a => a.energy < 40)
        .sort((x, y) => x.energy - y.energy)[0];
      if (needy) {
        if (Math.hypot(needy.x - cube.x, needy.z - cube.z) < 3) {
          const gift = Math.min(15, cube.energy - 50);
          if (gift > 0) {
            cube.energy -= gift; needy.energy = clamp(needy.energy + gift, 0, 100);
            cube.shared += gift; cube.reinforce(0.3);
            needy.remember(cube.id, 0.25, 0, 0.3);
            cube.remember(needy.id, 0.1, 0, 0.15);
          }
        } else moveToward(cube, needy.x, needy.z, world);
      } else wander(cube, world);
      break;
    }
    case 'rest': {
      cube.energy = clamp(cube.energy + 0.6, 0, 100);
      if (cube.health < 100 && p.hazard < 0.05) cube.health = clamp(cube.health + 0.3, 0, 100);
      break;
    }
    default: wander(cube, world);
  }

  // ---- metabolism, environment, life cycle ----
  const moveCost = cube.action === 'rest' ? 0.02 : 0.14;
  cube.energy -= moveCost + cube.sick * 0.4;
  if (p.hazard > 0.05) {
    cube.health -= p.hazard * 1.2;
    cube.lastDamage = 3; cube.notePlace('hazard', 0.4); cube.reinforce(-0.6);
  }
  if (p.shelter > 0.3) {
    cube.energy = clamp(cube.energy + p.shelter * 0.12, 0, 100);
    cube.notePlace('shelter', 0.05);
  }
  if (cube.energy <= 0) { cube.energy = 0; cube.health -= 0.8; }       // starving
  if (cube.sick > 0) { cube.sick = clamp(cube.sick - 0.002); cube.health -= cube.sick * 0.2; }
  if (world.height(cube.x, cube.z) > 8) cube.highGroundTime++;
  cube.age++;
  cube.decay();

  if (cube.health <= 0)
    sim.kill(cube, p.predator ? 'predator' : p.hazard > 0.3 ? 'storm' : 'starvation');
  else if (cube.age > cube.maxAge) sim.kill(cube, 'age');
}
