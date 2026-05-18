// HUD: stats, controls, event log, top-down minimap.

export class UI {
  constructor(sim, renderer, loop) {
    this.sim = sim; this.r = renderer; this.loop = loop;
    this.statsEl = document.getElementById('stats');
    this.logEl = document.getElementById('log');
    this.mini = document.getElementById('minimap').getContext('2d');

    const $ = id => document.getElementById(id);
    $('btnPause').onclick = e => { loop.paused = !loop.paused; e.target.textContent = loop.paused ? 'Resume' : 'Pause'; };
    $('btnSpeed').onclick = e => { loop.speed = loop.speed >= 8 ? 1 : loop.speed * 2; e.target.textContent = `Speed: ${loop.speed}x`; };
    $('btnFollow').onclick = e => { renderer.follow = !renderer.follow; e.target.textContent = renderer.follow ? 'Free cam' : 'Follow'; };
    $('btnReset').onclick = () => { sim.reset(); renderer.rebuildWorld(); };
  }

  draw() {
    const s = this.sim.stats();
    const bar = (v) => '█'.repeat(Math.round(v * 8)).padEnd(8, '·');
    this.statsEl.innerHTML =
`generation  <b>${s.generation}</b>   tick ${s.tick}/${s.genTicks}
alive       <b>${s.alive}</b> / ${s.pop}     groups <b>${s.groups}</b>
structures  <b>${s.structures}</b>   scars ${s.scars}
─ culture (avg traits) ─
aggression  ${bar(s.avg.aggression)}
sociability ${bar(s.avg.sociability)}
loyalty     ${bar(s.avg.loyalty)}
curiosity   ${bar(s.avg.curiosity)}
caution     ${bar(s.avg.caution)}
ambition    ${bar(s.avg.ambition)}`;

    this.logEl.innerHTML = this.sim.events.slice(0, 9)
      .map(e => `<div class="e ${e.cls}">› ${e.msg}</div>`).join('');

    this._minimap();
  }

  _minimap() {
    const g = this.mini, W = 200, S = this.sim.world.size, k = W / S;
    const px = v => (v + S / 2) * k;
    g.fillStyle = '#0e1318'; g.fillRect(0, 0, W, W);

    g.fillStyle = '#3a2b2b';
    for (const sc of this.sim.world.scars) g.fillRect(px(sc.x) - 1, px(sc.z) - 1, 2, 2);
    g.fillStyle = '#c9a04f';
    for (const b of this.sim.world.structures) g.fillRect(px(b.x) - 1, px(b.z) - 1, 2, 2);
    g.fillStyle = '#4fd1a1';
    for (const r of this.sim.world.resources) if (r.amount > 1) g.fillRect(px(r.x) - 1, px(r.z) - 1, 2, 2);

    g.strokeStyle = 'rgba(217,83,79,.5)';
    for (const st of this.sim.world.storms) {
      g.beginPath(); g.arc(px(st.x), px(st.z), st.r * k, 0, 7); g.stroke();
    }
    for (const c of this.sim.cubes) {
      if (!c.alive) continue;
      const [r, gr, b] = c.color;
      g.fillStyle = `rgb(${r * 255 | 0},${gr * 255 | 0},${b * 255 | 0})`;
      g.fillRect(px(c.x) - 1, px(c.z) - 1, 2.5, 2.5);
    }
  }
}
