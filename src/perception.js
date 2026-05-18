// Limited, human-like awareness. A cube only knows what is near it
// and what it remembers. Vision shrinks at night.

import { dist2 } from './util.js';

export const VISION = 16;

export function perceive(cube, cubes, world, predators) {
  const range = VISION * (0.5 + world.daylight * 0.5) * (0.85 + cube.traits.curiosity * 0.3);
  const v2 = range * range;

  const near = [], allies = [], threats = [], strangers = [], kin = [];
  for (const o of cubes) {
    if (o === cube || !o.alive) continue;
    if (dist2(cube.x, cube.z, o.x, o.z) >= v2) continue;
    near.push(o);
    const r = cube.rel.get(o.id);
    if (cube.isKin(o)) { kin.push(o); allies.push(o); }
    else if (r && (r.fear > 0.4 || r.friend < -0.3)) threats.push(o);
    else if (r && (r.friend > 0.3 || r.trust > 0.3)) allies.push(o);
    else strangers.push(o);
  }

  // nearest predator (a non-cube threat)
  let predator = null, pd = v2;
  for (const p of predators) {
    if (!p.alive) continue;
    const d = dist2(cube.x, cube.z, p.x, p.z);
    if (d < pd) { pd = d; predator = p; }
  }

  const resource = world.nearestResource(cube.x, cube.z, range, 'food');
  const wood = world.nearestResource(cube.x, cube.z, range, 'wood');
  const stone = world.nearestResource(cube.x, cube.z, range, 'stone');
  const hazard = world.hazardAt(cube.x, cube.z);
  const shelter = world.shelterAt(cube.x, cube.z);

  let allyPower = 1 + cube.traits.aggression + cube.health * 0.005;
  for (const a of allies) allyPower += 0.6;
  let threatPower = predator ? 2 : 0;
  for (const t of threats) threatPower += 0.8 + t.traits.aggression * 0.5;
  const advantage = allyPower - threatPower;

  return { near, allies, threats, strangers, kin, predator,
           resource, wood, stone, hazard, shelter, advantage };
}
