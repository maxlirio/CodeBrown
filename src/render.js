// Three.js view of the planet. Instanced cubes/resources/structures
// so it stays light enough for a browser with a few hundred beings.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD } from './world.js';

export class Renderer {
  constructor(sim) {
    this.sim = sim;
    const S = WORLD.size;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d10);
    this.scene.fog = new THREE.Fog(0x0b0d10, 80, 180);

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(0, 70, 90);

    this.cv = document.createElement('canvas');
    this.cv.id = 'scene';
    document.body.appendChild(this.cv);
    this.gl = new THREE.WebGLRenderer({ canvas: this.cv, antialias: true });
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.gl.setSize(innerWidth, innerHeight);

    this.controls = new OrbitControls(this.camera, this.cv);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 4, 0);

    this.scene.add(new THREE.HemisphereLight(0x8fb6d6, 0x202428, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.1);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);

    this._buildTerrain(S);
    this._buildWater(S);
    this._buildPools();
    this._buildLandmarks();

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.gl.setSize(innerWidth, innerHeight);
    });
    this.follow = true;
    this._m = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  _buildTerrain(S) {
    const seg = 160;
    const geo = new THREE.PlaneGeometry(S, S, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const lo = new THREE.Color(0x2f5d3a), mid = new THREE.Color(0x6b6a45),
          hi = new THREE.Color(0x9aa0a8), snow = new THREE.Color(0xdfe6ec);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.sim.world.height(x, z);
      pos.setY(i, h);
      const t = h / WORLD.hMax;
      const c = new THREE.Color();
      if (t < 0.18) c.copy(lo);
      else if (t < 0.5) c.copy(lo).lerp(mid, (t - 0.18) / 0.32);
      else if (t < 0.78) c.copy(mid).lerp(hi, (t - 0.5) / 0.28);
      else c.copy(hi).lerp(snow, (t - 0.78) / 0.22);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    this.scene.add(this.terrain);
  }

  _buildWater(S) {
    const w = new THREE.Mesh(
      new THREE.PlaneGeometry(S * 1.6, S * 1.6),
      new THREE.MeshStandardMaterial({ color: 0x16323f, transparent: true, opacity: 0.85 }));
    w.rotation.x = -Math.PI / 2;
    w.position.y = 0.6;
    this.scene.add(w);
  }

  _inst(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    this.scene.add(m);
    return m;
  }

  _buildPools() {
    this.cubeMesh = this._inst(new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({ vertexColors: false }), 400);
    this.cubeMesh.instanceColor =
      new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);

    this.resMesh = this._inst(new THREE.IcosahedronGeometry(0.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x4fd1a1, emissive: 0x123, roughness: .4 }), 150);
    this.bldMesh = this._inst(new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xc9a04f, roughness: .9 }), 800);
    this.scarMesh = this._inst(new THREE.CircleGeometry(1.4, 6),
      new THREE.MeshBasicMaterial({ color: 0x5a3b3b, transparent: true, opacity: .5 }), 600);

    // storms: a puffy raincloud over a falling-rain volume
    this.storms = this.sim.world.storms.map(() => this._makeStorm());
  }

  _makeStorm() {
    const g = new THREE.Group();
    const TOP = 4.5, BOT = -15, LEN = 1.0;

    // cloud — a cluster of flattened dark puffs
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x39414c, roughness: 1, flatShading: true });
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 11; i++) {
      const p = new THREE.Mesh(puff, cloudMat);
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.7;
      const s = 0.32 + Math.random() * 0.42;
      p.position.set(Math.cos(a) * rr, 5.4 + Math.random() * 1.3, Math.sin(a) * rr);
      p.scale.set(s, s * 0.55, s);
      g.add(p);
    }

    // rain — line segments cycling from cloud to ground
    const N = 170;
    const pos = new Float32Array(N * 6);
    const heads = new Float32Array(N), xz = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
      xz[i * 2] = Math.cos(a) * rr; xz[i * 2 + 1] = Math.sin(a) * rr;
      heads[i] = TOP - Math.random() * (TOP - BOT);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
      color: 0x9fb8d8, transparent: true, opacity: 0.45 }));
    g.add(rain);

    g.userData = { rg, heads, xz, N, TOP, BOT, LEN };
    this.scene.add(g);
    return g;
  }

  _buildLandmarks() {
    for (const lm of this.sim.world.landmarks) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 4),
        new THREE.MeshStandardMaterial({ color: 0xf0c674, emissive: 0x332600 }));
      p.position.set(lm.x, this.sim.world.height(lm.x, lm.z) + 3, lm.z);
      this.scene.add(p);
    }
  }

  // call after sim.reset() so visuals match the new world
  rebuildWorld() {
    this.scene.remove(this.terrain);
    this.terrain.geometry.dispose();
    this._buildTerrain(WORLD.size);
    for (const s of this.storms) this.scene.remove(s);
    this.storms = this.sim.world.storms.map(() => this._makeStorm());
  }

  sync() {
    const w = this.sim.world, m = this._m;

    // cubes
    let i = 0;
    for (const c of this.sim.cubes) {
      if (!c.alive) continue;
      m.position.set(c.x, c.y + 0.7, c.z);
      const scale = c.action === 'rest' ? 0.8 : 1;
      m.scale.setScalar(scale + (c.lastDamage > 0 ? 0.25 : 0));
      m.rotation.set(0, c.heading, 0);
      m.updateMatrix();
      this.cubeMesh.setMatrixAt(i, m.matrix);
      const [r, g, b] = c.color;
      const flash = c.lastDamage > 0 ? 0.5 : 0;
      this.cubeMesh.instanceColor.setXYZ(i, r + flash, g, b);
      i++;
    }
    this.cubeMesh.count = i;
    this.cubeMesh.instanceMatrix.needsUpdate = true;
    this.cubeMesh.instanceColor.needsUpdate = true;

    // resources
    i = 0;
    for (const r of w.resources) {
      if (r.amount <= 1) continue;
      m.position.set(r.x, w.height(r.x, r.z) + 0.7, r.z);
      m.scale.setScalar(0.5 + r.amount / r.max);
      m.rotation.set(0, r.amount, 0);
      m.updateMatrix();
      this.resMesh.setMatrixAt(i++, m.matrix);
    }
    this.resMesh.count = i; this.resMesh.instanceMatrix.needsUpdate = true;

    // structures
    i = 0;
    for (const b of w.structures) {
      m.position.set(b.x, b.y + 0.4, b.z);
      m.scale.setScalar(1); m.rotation.set(0, 0, 0);
      m.updateMatrix();
      this.bldMesh.setMatrixAt(i++, m.matrix);
      if (i >= 800) break;
    }
    this.bldMesh.count = i; this.bldMesh.instanceMatrix.needsUpdate = true;

    // scars
    i = 0;
    for (const s of w.scars) {
      m.position.set(s.x, w.height(s.x, s.z) + 0.08, s.z);
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.scale.setScalar(0.6 + s.intensity);
      m.updateMatrix();
      this.scarMesh.setMatrixAt(i++, m.matrix);
      if (i >= 600) break;
    }
    this.scarMesh.count = i; this.scarMesh.instanceMatrix.needsUpdate = true;

    // storms — drift the cloud, animate the rain falling
    this.storms.forEach((g, k) => {
      const st = w.storms[k];
      if (!st) { g.visible = false; return; }
      g.visible = true;
      g.position.set(st.x, 12, st.z);
      g.scale.set(st.r, 1, st.r);
      const u = g.userData, p = u.rg.attributes.position.array;
      for (let n = 0; n < u.N; n++) {
        let h = u.heads[n] - 0.7;
        if (h < u.BOT) h = u.TOP + Math.random() * 2;
        u.heads[n] = h;
        const x = u.xz[n * 2], z = u.xz[n * 2 + 1], o = n * 6;
        p[o] = x; p[o + 1] = h; p[o + 2] = z;
        p[o + 3] = x; p[o + 4] = h - u.LEN; p[o + 5] = z;
      }
      u.rg.attributes.position.needsUpdate = true;
    });

    // camera follow: track the centroid of the living population
    if (this.follow && this.cubeMesh.count) {
      let cx = 0, cz = 0, n = 0;
      for (const c of this.sim.cubes) if (c.alive) { cx += c.x; cz += c.z; n++; }
      cx /= n; cz /= n;
      this.controls.target.lerp(new THREE.Vector3(cx, 5, cz), 0.04);
    }
    this.controls.update();
    this.gl.render(this.scene, this.camera);
  }
}
