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
    const roles = ['gatherer', 'scout', 'builder', 'fighter']
      .map(r => `${r[0]}${s.roles[r] || 0}`).join(' ');
    this.statsEl.innerHTML =
`generation  <b>${s.generation}</b>   tick ${s.tick}/${s.genTicks}
alive       <b>${s.alive}</b> / ${s.pop}     groups <b>${s.groups}</b>
species ${s.species}   predators ${s.predators}   fires ${s.fires}
${s.season}${s.night ? ' · night' : ' · day'}   roles[${roles}]
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
    const w = this.sim.world;
    g.fillStyle = w.isNight ? '#070a12' : '#0e1318'; g.fillRect(0, 0, W, W);

    g.fillStyle = '#3a2b2b';
    for (const sc of w.scars) g.fillRect(px(sc.x) - 1, px(sc.z) - 1, 2, 2);
    for (const b of w.structures) {
      g.fillStyle = b.kind === 'stone' ? '#9aa0aa' : '#c9a04f';
      g.fillRect(px(b.x) - 1, px(b.z) - 1, 2, 2);
    }
    for (const r of w.resources) {
      if (r.amount <= 1) continue;
      g.fillStyle = r.kind === 'food' ? '#4fd1a1' : r.kind === 'wood' ? '#8a6a3a' : '#8f96a0';
      g.fillRect(px(r.x) - 1, px(r.z) - 1, 2, 2);
    }

    // soft territory rings
    g.strokeStyle = 'rgba(111,179,224,.35)';
    const seen = new Set();
    for (const c of this.sim.cubes) {
      if (!c.alive || !c.group || seen.has(c.group)) continue;
      seen.add(c.group);
      const t = this.sim.territory(c.group);
      if (t) { g.beginPath(); g.arc(px(t.x), px(t.z), t.r * k, 0, 7); g.stroke(); }
    }

    g.fillStyle = '#ff7a18';
    for (const f of w.fires) g.fillRect(px(f.x) - 1, px(f.z) - 1, 2.5, 2.5);
    g.strokeStyle = 'rgba(159,184,216,.5)';
    for (const st of w.storms) {
      g.beginPath(); g.arc(px(st.x), px(st.z), st.r * k, 0, 7); g.stroke();
    }
    g.fillStyle = '#d9534f';
    for (const pr of this.sim.predators) if (pr.alive)
      g.fillRect(px(pr.x) - 2, px(pr.z) - 2, 4, 4);

    for (const c of this.sim.cubes) {
      if (!c.alive) continue;
      const [r, gr, b] = c.color;
      g.fillStyle = `rgb(${r * 255 | 0},${gr * 255 | 0},${b * 255 | 0})`;
      g.fillRect(px(c.x) - 1, px(c.z) - 1, 2.5, 2.5);
    }
  }
}
