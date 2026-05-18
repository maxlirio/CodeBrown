// Generation system: behavior evolves like culture, not just biology.
// Survivors' traits + what worked are recorded, then the next
// generation spawns with inherited (mutated) traits, partial memory
// bias, and learned culture signals.

import { RNG, clamp } from './util.js';
import { Cube, TRAITS, ACTIONS } from './cube.js';

export function snapshot(cubes, world, gen) {
  const survivors = cubes.filter(c => c.alive);
  const pool = survivors.length ? survivors : cubes; // fall back to the last to die

  // weight contribution by how well a cube did
  const fitness = c => 1 + c.gathered * 0.4 + c.builtCount * 6 +
    c.kills * 3 + c.age * 0.02 + (c.alive ? 10 : 0);

  const tAvg = {}, bAvg = {};
  for (const t of TRAITS) tAvg[t] = 0;
  for (const a of ACTIONS) bAvg[a] = 0;
  let wsum = 0;
  for (const c of pool) {
    const w = fitness(c); wsum += w;
    for (const t of TRAITS) tAvg[t] += c.traits[t] * w;
    for (const a of ACTIONS) bAvg[a] += c.bias[a] * w;
  }
  for (const t of TRAITS) tAvg[t] /= wsum;
  for (const a of ACTIONS) bAvg[a] /= wsum;

  const highGroundCulture = pool.reduce((s, c) => s + c.highGroundTime, 0) /
    (pool.reduce((s, c) => s + c.age, 0) || 1);

  return {
    gen, traits: tAvg, bias: bAvg,
    survivors: survivors.length,
    highGroundCulture,                       // 0..1 "high ground is safe"
    builds: pool.reduce((s, c) => s + c.builtCount, 0),
  };
}

export function nextGeneration(world, snap, count, gen) {
  const rng = new RNG((world.seed + gen * 7919) >>> 0);
  const cubes = [];
  for (let i = 0; i < count; i++) {
    // inherited traits + slight mutation (cultural + biological drift)
    const traits = {};
    for (const t of TRAITS) {
      let base = snap ? snap.traits[t] : 0.5;
      if (t === 'caution' && snap && snap.highGroundCulture > 0.25) base += 0.08;
      traits[t] = clamp(base + rng.gauss(0, 0.12));
    }
    // spawn near a remembered safe place (a landmark) — geography as history
    const lm = world.landmarks[rng.int(world.landmarks.length)];
    let x = lm.x + rng.gauss(0, 12), z = lm.z + rng.gauss(0, 12);
    x = clamp(x, -55, 55); z = clamp(z, -55, 55);

    const c = new Cube(world, x, z, traits, gen);
    if (snap) {
      // partial memory bias: tendencies carry over, not full memory
      for (const a of ACTIONS) c.bias[a] = snap.bias[a] * 0.5 + rng.gauss(0, 0.05);
    }
    cubes.push(c);
  }
  return cubes;
}
