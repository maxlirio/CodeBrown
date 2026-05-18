// Limited, human-like awareness. A cube only knows what is near it
// and what it remembers — never global state.

import { dist2 } from './util.js';

export const VISION = 16;

export function perceive(cube, cubes, world) {
  const v2 = VISION * VISION;
  const near = [];
  for (const o of cubes) {
    if (o === cube || !o.alive) continue;
    if (dist2(cube.x, cube.z, o.x, o.z) < v2) near.push(o);
  }

  // classify neighbours via remembered relationships
  let allies = [], threats = [], strangers = [];
  for (const o of near) {
    const r = cube.rel.get(o.id);
    if (r && (r.fear > 0.4 || r.friend < -0.3)) threats.push(o);
    else if (r && (r.friend > 0.3 || r.trust > 0.3)) allies.push(o);
    else strangers.push(o);
  }

  const resource = world.nearestResource(cube.x, cube.z, VISION);
  const hazard = world.hazardAt(cube.x, cube.z);
  const shelter = world.shelterAt(cube.x, cube.z);

  // local advantage: how outnumbered/outmatched the cube is
  let allyPower = 1 + cube.traits.aggression;
  for (const a of allies) allyPower += 0.6;
  let threatPower = 0;
  for (const t of threats) threatPower += 0.8 + t.traits.aggression * 0.5;
  const advantage = allyPower - threatPower;

  return { near, allies, threats, strangers, resource, hazard, shelter, advantage };
}
