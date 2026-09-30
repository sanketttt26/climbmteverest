import * as THREE from 'three';
import { heightAt, slopeAt, pointAt, ROUTE, PATH_LEN } from './terrain.js';

function rng(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(1953); // seeded, so the mountain is the same every visit
const pick = a => a[Math.floor(rand() * a.length)];
const mat = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const side = (p, off) => [p.x - p.tz * off, p.z + p.tx * off]; // lateral offset from the trail, + is left
const FLAG_COLORS = [0x1e5bd6, 0xf2f2f2, 0xd8261c, 0x1f9e4a, 0xf5d10c].map(c => new THREE.Color(c));

// Everything placed on the mountain: camps, gear, ladders, fixed ropes, seracs, flags.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; this.crevasses = []; this.ropes = []; this.interactables = []; this.flags = []; this.flagStrings = [];
    const [a, b, c, d] = [ROUTE[1].s, ROUTE[3].s, ROUTE[4].s, ROUTE[6].s];
    this.crevS = [a + (b - a) * 0.22, a + (b - a) * 0.5, a + (b - a) * 0.8, c + (d - c) * 0.3, c + (d - c) * 0.62];
    this.buildCrevasses(); this.buildWands(); this.buildCamps(); this.buildBaseCamp();
    this.buildSeracs(); this.buildRopes(); this.buildSummit(); this.buildStashes(); this.buildFlags();
  }

  // Ground under a point, including ladders over crevasses and the crevasses themselves.
  groundAt(x, z) {
    for (const c of this.crevasses) {
      const dx = x - c.x, dz = z - c.z, a = dx * c.tx + dz * c.tz, b = dx * c.nx + dz * c.nz;
      if (b > c.l0 && b < c.l1 && Math.abs(a) < c.halfW * taper(b, c)) {
        if (Math.abs(b) < 0.5) return { h: c.yA + (c.yB - c.yA) * (a + c.len / 2) / c.len + 0.04, surface: 'ladder' };
        return { h: heightAt(x, z) - 80, surface: 'crevasse' };
      }
    }
    return { h: heightAt(x, z), surface: 'snow' };
  }

  nearestRope(p, only) {
    let best = { d: Infinity };
    for (const pts of only ? [only] : this.ropes) {
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i], d = Math.hypot(q.x - p.x, q.z - p.z, (q.y - 0.9 - p.y) * 0.5);
        if (d < best.d) best = { d, rope: pts, i, q };
      }
    }
    return best;
  }

  buildCrevasses() {
    const m = new THREE.MeshLambertMaterial({ map: crevasseTexture(), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const rail = new THREE.BoxGeometry(0.06, 0.07, 1).translate(0, 0, 0.5), rung = new THREE.BoxGeometry(0.76, 0.04, 0.05);
    const metal = mat(0xc4c8cf, { metalness: 0.85, roughness: 0.35 });
    for (const s of this.crevS) {
      const p = pointAt(s), cv = { x: p.x, z: p.z, tx: p.tx, tz: p.tz, nx: -p.tz, nz: p.tx, halfW: 2.8, len: 7.6 };
      // the slot runs out to each side until the wall is too steep to walk around it
      const reach = dir => { let u = 4; while (u < 70 && slopeAt(p.x + cv.nx * u * dir, p.z + cv.nz * u * dir).angle < 0.72) u++; return u + 2; };
      cv.l0 = -reach(-1); cv.l1 = reach(1);
      const geo = new THREE.PlaneGeometry(1, 1, 48, 3), v = geo.attributes.position;
      for (let i = 0; i < v.count; i++) {
        const u = cv.l0 + (v.getX(i) + 0.5) * (cv.l1 - cv.l0), w = v.getY(i) * cv.halfW * 2 * taper(u, cv), x = p.x + cv.nx * u + p.tx * w, z = p.z + cv.nz * u + p.tz * w;
        v.setXYZ(i, x, heightAt(x, z) + 0.05, z);
      }
      geo.computeVertexNormals();
      this.scene.add(new THREE.Mesh(geo, m));
      // aluminium ladder bridging the slot, the way the Icefall Doctors rig them
      const A = new THREE.Vector3(p.x - p.tx * cv.len / 2, 0, p.z - p.tz * cv.len / 2), B = new THREE.Vector3(p.x + p.tx * cv.len / 2, 0, p.z + p.tz * cv.len / 2);
      A.y = cv.yA = heightAt(A.x, A.z) + 0.08; B.y = cv.yB = heightAt(B.x, B.z) + 0.08;
      const L = A.distanceTo(B), lad = new THREE.Group();
      for (const x of [-0.38, 0.38]) { const r = new THREE.Mesh(rail, metal); r.scale.z = L; r.position.x = x; r.castShadow = true; lad.add(r); }
      for (let k = 0.2; k < L; k += 0.34) { const r = new THREE.Mesh(rung, metal); r.position.z = k; lad.add(r); }
      lad.position.copy(A); lad.lookAt(B);
      this.scene.add(lad);
      this.crevasses.push(cv);
    }
  }

  // Bamboo marker wands every 16 units: the only way to find the trail in a whiteout.
  buildWands() {
    const spots = [];
    for (let s = 30, k = 0; s < PATH_LEN - 10; s += 16, k++) {
      if (!this.crevS.some(c => Math.abs(c - s) < 6)) spots.push(side(pointAt(s), k % 2 ? 2.4 : -2.4));
    }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5).translate(0, 0.9, 0), mat(0x7a5a33), spots.length);
    const flag = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.45, 0.28).translate(0.23, 1.64, 0), mat(0xff4d1a, { side: THREE.DoubleSide, emissive: 0x551500 }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => { m.makeRotationY(rand() * 6.28).setPosition(x, heightAt(x, z) - 0.1, z); pole.setMatrixAt(i, m); flag.setMatrixAt(i, m); });
    pole.castShadow = true;
    this.scene.add(pole, flag);
  }

  buildCamps() {
    const tent = new THREE.SphereGeometry(1.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const tentMats = [0xf29f05, 0xe0431a, 0xf5d10c, 0x2f7de0, 0xd8261c].map(c => mat(c, { roughness: 0.55 }));
    ROUTE.forEach((w, i) => {
      if (!w.camp) return;
      const p = pointAt(w.s), big = i === 0;
      for (let k = 0; k < (big ? 14 : 6); k++) {
        const [x, z] = side(p, (k % 2 ? 1 : -1) * (6 + rand() * (big ? 16 : 5)));
        const along = (rand() - 0.5) * (big ? 44 : 16), tx = x + p.tx * along, tz = z + p.tz * along;
        const t = new THREE.Mesh(tent, pick(tentMats));
        t.scale.set(1.3, 0.85, 1); t.position.set(tx, heightAt(tx, tz) - 0.15, tz); t.rotation.y = rand() * 3;
        t.castShadow = t.receiveShadow = true;
        this.scene.add(t);
        this.colliders.push({ x: tx, z: tz, r: 1.8 });
        this.interactables.push({ type: 'rest', camp: i, x: tx, z: tz, r: 3.6, label: `Rest in tent (${w.name})` });
      }
      const [cx, cz] = side(pointAt(w.s + 3), -3.2);
      this.crate(cx, cz, i >= 8);
      this.interactables.push({ type: 'cache', camp: i, x: cx, z: cz, r: 2.8, label: `Resupply from the ${w.name} cache` });
    });
  }

  crate(x, z, oxygen) {
    const g = new THREE.Group(), y = heightAt(x, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.9), mat(0x1f5fa8));
    box.position.y = 0.4; box.castShadow = true; g.add(box);
    if (oxygen) for (let k = 0; k < 3; k++) g.add(bottle(-0.4 + k * 0.4, 0.93, 0));
    g.position.set(x, y, z); g.rotation.y = rand() * 3;
    this.scene.add(g);
    this.colliders.push({ x, z, r: 0.9 });
    return g;
  }

  buildBaseCamp() {
    const [dx, dz] = side(pointAt(9), 3.5);
    const depot = this.crate(dx, dz, true);
    const duffel = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8).rotateZ(Math.PI / 2), mat(0xd8261c));
    duffel.position.set(0.1, 1.08, 0); depot.add(duffel);
    this.interactables.push({ type: 'depot', x: dx, z: dz, r: 3, label: 'Collect climbing gear (crampons, ice axe, harness, down suit)' });

    // puja chorten with prayer flags strung from its mast
    const [cx, cz] = side(pointAt(16), -10), cy = heightAt(cx, cz), stone = mat(0x8f8a84, { flatShading: true });
    [[3, 1.2, 0.6], [2.2, 1, 1.7], [1.4, 0.8, 2.6]].forEach(([s, h, y]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), stone); b.position.set(cx, cy + y - 0.2, cz); b.castShadow = true; this.scene.add(b); });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 6), mat(0x7a5a33));
    mast.position.set(cx, cy + 3.5, cz); this.scene.add(mast);
    this.colliders.push({ x: cx, z: cz, r: 2 });
    const top = new THREE.Vector3(cx, cy + 6.8, cz);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.3, r = 16 + rand() * 6, ex = cx + Math.cos(a) * r, ez = cz + Math.sin(a) * r;
      this.flagLine(top, new THREE.Vector3(ex, heightAt(ex, ez) + 0.4, ez), 26, 1.4);
    }

    // the famous painted boulder
    const [sx, sz] = side(pointAt(22), 7), rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2, 0), stone);
    rock.scale.set(1.5, 0.9, 0.8); rock.position.set(sx, heightAt(sx, sz) + 0.9, sz); rock.castShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshLambertMaterial({ map: signTexture(), transparent: true }));
    const trail = pointAt(12);
    rock.lookAt(trail.x, rock.position.y, trail.z);
    sign.position.set(0, 0.35, 2.05); sign.scale.set(1 / 1.5, 1 / 0.9, 1);
    rock.add(sign);
    this.scene.add(rock);
    this.colliders.push({ x: sx, z: sz, r: 2.6 });

    // moraine boulders around camp, and loose rock on the summit ridge
    const spots = [];
    for (let k = 0; k < 160; k++) {
      const a = rand() * 6.28, r = 30 + rand() * 150, x = ROUTE[0].x + Math.cos(a) * r, z = ROUTE[0].z + Math.sin(a) * r;
      spots.push([x, z, 0.4 + rand() * 1.8]);
    }
    for (let k = 0; k < 60; k++) {
      const s = ROUTE[11].s + 20 + rand() * (PATH_LEN - ROUTE[11].s - 30);
      spots.push([...side(pointAt(s), (rand() < 0.5 ? -1 : 1) * (7 + rand() * 9)), 0.5 + rand() * 1.5]);
    }
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0x5a534d, { flatShading: true }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    spots.forEach(([x, z, s], i) => {
      q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
      rocks.setMatrixAt(i, m.compose(v.set(x, heightAt(x, z) + s * 0.2, z), q, sc.set(s, s * 0.6, s * 0.9)));
    });
    rocks.castShadow = rocks.receiveShadow = true;
    this.scene.add(rocks);
  }

  // Ice towers of the Khumbu Icefall, plus a few in the Western Cwm. The trail threads between them.
  buildSeracs() {
    const list = [];
    const zone = (s0, s1, count, min, max) => {
      for (let k = 0; k < count; k++) {
        const s = s0 + rand() * (s1 - s0);
        if (this.crevS.some(c => Math.abs(c - s) < 5)) continue;
        const [x, z] = side(pointAt(s), (rand() < 0.5 ? -1 : 1) * (min + rand() * (max - min)));
        if (slopeAt(x, z).angle > 0.5) continue; // no towers perched on the valley walls
        list.push({ x, z, w: 2 + rand() * 4, h: 3 + rand() * 9, d: 2 + rand() * 4 });
      }
    };
    zone(ROUTE[1].s - 10, ROUTE[3].s + 15, 180, 5.5, 42);
    zone(ROUTE[4].s + 30, ROUTE[6].s - 30, 40, 20, 45);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05, emissive: 0x0b2a44, emissiveIntensity: 0.35 }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((b, i) => {
      q.setFromEuler(e.set((rand() - 0.5) * 0.35, rand() * 3, (rand() - 0.5) * 0.35));
      mesh.setMatrixAt(i, m.compose(v.set(b.x, heightAt(b.x, b.z) + b.h / 2 - 1.2, b.z), q, sc.set(b.w, b.h, b.d)));
      mesh.setColorAt(i, c.setHSL(0.56, 0.55, 0.8 + rand() * 0.12));
      this.colliders.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) * 0.5 });
    });
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // Fixed lines on the steep sections: upper Icefall, Lhotse Face, summit ridge.
  buildRopes() {
    const picket = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5).translate(0, 0.45, 0), steel = mat(0x9aa0a6, { metalness: 0.7 });
    const sections = [[ROUTE[2].s - 30, ROUTE[3].s - 5, 0x2e6fd8], [ROUTE[7].s - 25, ROUTE[11].s - 8, 0xd8322c], [ROUTE[11].s + 6, PATH_LEN - 3, 0xe8b418]];
    for (const [s0, s1, color] of sections) {
      const pts = [];
      for (let s = s0; s <= s1; s += 3) {
        const [x, z] = side(pointAt(s), 1.4);
        pts.push(new THREE.Vector3(x, heightAt(x, z) + 0.9, z));
        if (pts.length % 5 === 1) { const pk = new THREE.Mesh(picket, steel); pk.position.set(x, heightAt(x, z) - 0.1, z); this.scene.add(pk); }
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 0.035, 5), mat(color, { roughness: 0.6 }));
      tube.castShadow = true;
      this.scene.add(tube);
      this.ropes.push(pts);
    }
  }

  buildSummit() {
    const w = ROUTE.at(-1), top = new THREE.Vector3(w.x, heightAt(w.x, w.z) + 1.6, w.z);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * 6.283, ex = w.x + Math.cos(a) * 4.5, ez = w.z + Math.sin(a) * 4.5;
      this.flagLine(top, new THREE.Vector3(ex, heightAt(ex, ez) + 0.1, ez), 12, 0.3);
    }
    // the rock step of the Hillary Step beside the fixed line
    const [rx, rz] = side(pointAt(ROUTE[14].s), -4.5), rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat(0x3d3834, { flatShading: true }));
    rock.scale.set(4, 5, 3); rock.position.set(rx, heightAt(rx, rz) + 1.5, rz); rock.castShadow = true;
    this.scene.add(rock);
    this.colliders.push({ x: rx, z: rz, r: 3.5 });
  }

  // Oxygen stashes above Camp IV, as Sherpa teams leave them on summit day.
  buildStashes() {
    for (const i of [12, 13]) {
      const [x, z] = side(pointAt(ROUTE[i].s + 2), -2.4), g = new THREE.Group();
      g.add(bottle(0, 0.13, 0), bottle(0.1, 0.13, 0.3));
      g.position.set(x, heightAt(x, z), z);
      this.scene.add(g);
      this.interactables.push({ type: 'o2', x, z, r: 2.5, label: 'Take oxygen cylinder from the stash', mesh: g });
    }
  }

  flagLine(a, b, n, sag) {
    const rotY = Math.atan2(-(b.z - a.z), b.x - a.x);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      this.flags.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t, rotY]);
    }
    this.flagStrings.push(a, b);
  }

  buildFlags() {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.3).translate(0, -0.16, 0), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }), this.flags.length);
    const m = new THREE.Matrix4();
    this.flags.forEach(([x, y, z, r], i) => { im.setMatrixAt(i, m.makeRotationY(r).setPosition(x, y, z)); im.setColorAt(i, FLAG_COLORS[i % 5]); });
    this.scene.add(im);
  }
}

// crevasses pinch out over the last quarter of their length
const taper = (b, c) => Math.min(1, (1 - b / (b < 0 ? c.l0 : c.l1)) * 4);

function bottle(x, y, z) {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.65, 10).rotateZ(Math.PI / 2), mat(0xf26b0f, { metalness: 0.4, roughness: 0.4 }));
  b.position.set(x, y, z); b.castShadow = true;
  return b;
}

function crevasseTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  [[0, '#eef8ff'], [0.07, '#9fd3f0'], [0.2, '#2d6f9e'], [0.38, '#0b2238'], [0.5, '#02070d'], [0.62, '#0b2238'], [0.8, '#2d6f9e'], [0.93, '#9fd3f0'], [1, '#eef8ff']].forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b3231a'; g.textAlign = 'center';
  g.font = 'bold 76px sans-serif'; g.fillText('EVEREST', 256, 92);
  g.font = 'bold 50px sans-serif'; g.fillText('BASE CAMP', 256, 158); g.fillText('5364 m', 256, 222);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
