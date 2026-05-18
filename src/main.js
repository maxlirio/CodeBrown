// Bootstrap: wire the simulation, renderer and UI into one loop.

import { Sim } from './sim.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

const sim = new Sim({ popSize: 110, genTicks: 2200 });
const renderer = new Renderer(sim);

const loop = { paused: false, speed: 1 };
const ui = new UI(sim, renderer, loop);

document.getElementById('loading').remove();

let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(now - last, 100); last = now;

  if (!loop.paused) {
    // ~30 sim ticks/sec at 1x, scaled by speed
    acc += dt * loop.speed;
    let budget = 0;
    while (acc >= 33 && budget < 12) { sim.step(); acc -= 33; budget++; }
  }
  renderer.sync();
  ui.draw();
}
requestAnimationFrame(frame);
