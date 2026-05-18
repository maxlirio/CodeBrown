// A predator: a non-cube threat species. It hunts lone cubes,
// which makes grouping defensively valuable.

let _pid = 1;

export class Predator {
  constructor(world, x, z) {
    this.id = _pid++;
    this.world = world;
    this.alive = true;
    this.x = x; this.z = z;
    this.y = world.height(x, z);
    this.heading = Math.random() * 6.28;
    this.energy = 80;
    this.health = 55;
  }

  step(cubes) {
    // sense the nearest cube within range
    let prey = null, bd = 18 * 18;
    for (const c of cubes) {
      if (!c.alive) continue;
      const d = (c.x - this.x) ** 2 + (c.z - this.z) ** 2;
      if (d < bd) { bd = d; prey = c; }
    }

    let tx, tz, speed = 0.3;
    if (prey) {
      tx = prey.x; tz = prey.z; speed = 0.38;          // a touch slower than a cube
      if (Math.hypot(prey.x - this.x, prey.z - this.z) < 2.2) {
        prey.health -= 1.8; prey.lastDamage = 4;
        this.energy = Math.min(100, this.energy + 2.2);
      }
    } else {
      if (!this._t || Math.hypot(this._t.x - this.x, this._t.z - this.z) < 3) {
        const a = Math.random() * 6.28, r = 14 + Math.random() * 20;
        this._t = { x: this.x + Math.cos(a) * r, z: this.z + Math.sin(a) * r };
      }
      tx = this._t.x; tz = this._t.z;
    }

    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    let nx = this.x + (dx / d) * speed, nz = this.z + (dz / d) * speed;
    if (!this.world.inBounds(nx, nz) || this.world.slope(nx, nz) > 7) {
      this.heading += 2.0;
      nx = this.x + Math.cos(this.heading) * speed;
      nz = this.z + Math.sin(this.heading) * speed;
    }
    if (this.world.inBounds(nx, nz)) { this.x = nx; this.z = nz; this.heading = Math.atan2(dz, dx); }
    this.y += (this.world.height(this.x, this.z) - this.y) * 0.3;

    this.energy -= prey ? 0.06 : 0.12;                   // starves if it can't hunt
    if (this.world.hazardAt(this.x, this.z) > 0.3) this.health -= 1;
    if (this.energy <= 0 || this.health <= 0) this.alive = false;
  }
}
