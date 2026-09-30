import * as THREE from 'three';
import { heightAt, pointAt, ROUTE } from '../../world/terrain.js';

const AV_N = 1500;

// Falling seracs in the Icefall and avalanches off the valley walls and the Lhotse Face.
// Crevasses live in the world (they're terrain); extreme altitude and cold live in survival.
export class Hazards {
  constructor(scene, sound, hud) {
    Object.assign(this, { scene, sound, hud, blocks: [], av: null, rumble: 0 });
    this.icefall = [ROUTE[1].s - 15, ROUTE[3].s + 10];
    this.zones = [[ROUTE[1].s, ROUTE[3].s], [ROUTE[7].s - 20, ROUTE[11].s - 15]];

    this.seed = new Float32Array(AV_N * 4).map(Math.random);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AV_N * 3), 3));
    this.cloud = new THREE.Points(geo, new THREE.PointsMaterial({ size: 9, map: puffTexture(), transparent: true, depthWrite: false, color: 0xeef3f8 }));
    this.cloud.frustumCulled = false;
    scene.add(this.cloud);

    this.iceGeo = new THREE.IcosahedronGeometry(1, 0);
    this.iceMat = new THREE.MeshStandardMaterial({ color: 0xcde8f7, roughness: 0.3, flatShading: true });
    this.markGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    this.markMat = new THREE.MeshBasicMaterial({ color: 0x000814, transparent: true, opacity: 0.4, depthWrite: false });
    this.reset();
  }

  reset() {
    for (const b of this.blocks) this.scene.remove(b.mesh, b.mark);
    Object.assign(this, { blocks: [], av: null, iceTimer: 6, avTimer: 45, rumble: 0 });
    this.cloud.visible = false;
  }

  update(dt, player, surv, s, snow) {
    const p = player.pos;

    // --- falling ice: a shadow grows on the snow, then the block comes down
    if (s > this.icefall[0] && s < this.icefall[1] && (this.iceTimer -= dt) <= 0) {
      this.iceTimer = 4 + Math.random() * 8;
      const a = player.yaw + (Math.random() - 0.5) * 2.2, r = 3 + Math.random() * 10;
      const x = p.x - Math.sin(a) * r, z = p.z - Math.cos(a) * r, g = heightAt(x, z), size = 0.9 + Math.random() * 1.3;
      const mesh = new THREE.Mesh(this.iceGeo, this.iceMat), mark = new THREE.Mesh(this.markGeo, this.markMat);
      mesh.scale.setScalar(size); mesh.visible = false; mesh.castShadow = true;
      mark.position.set(x, g + 0.06, z);
      this.scene.add(mesh, mark);
      this.blocks.push({ mesh, mark, x, z, g, size, y: g + 45, vy: 0, warn: 1.8, life: 7 });
      this.sound.crack(0.5);
      if (!this.iceWarned) { this.iceWarned = true; this.hud.toast('Seracs are collapsing! Watch for shadows on the snow and move away.', 'warn'); }
    }
    for (const b of this.blocks) {
      if (b.warn > 0) {
        b.warn -= dt;
        b.mark.scale.setScalar(b.size * (1.6 - Math.max(0, b.warn) * 0.7));
        if (b.warn <= 0) b.mesh.visible = true;
      } else if (!b.landed) {
        b.vy -= 35 * dt; b.y += b.vy * dt;
        if (b.y <= b.g + b.size * 0.6) {
          b.y = b.g + b.size * 0.6; b.landed = true;
          this.scene.remove(b.mark);
          this.sound.thud();
          const d = Math.hypot(p.x - b.x, p.z - b.z);
          player.shake = Math.max(player.shake, 1 - d / 25);
          if (d < b.size + 0.9 && p.y < b.g + 3) { surv.damage(35, 'Crushed by a collapsing serac in the Khumbu Icefall'); this.hud.flash(); }
        }
        b.mesh.position.set(b.x, b.y, b.z); b.mesh.rotation.x += dt * 3;
      } else if ((b.life -= dt) <= 0) { this.scene.remove(b.mesh); b.dead = true; }
    }
    this.blocks = this.blocks.filter(b => !b.dead);

    // --- avalanches: a wall of snow sweeps across the trail from the higher side
    if (!this.av && this.zones.some(([a, b]) => s > a && s < b) && (this.avTimer -= dt * (1 + snow * 2)) <= 0) {
      this.avTimer = 60 + Math.random() * 90;
      this.spawnAvalanche(s);
    }
    this.rumble = 0;
    const av = this.av;
    if (!av) return;
    av.travel += av.speed * dt; av.t += dt;
    const fx = av.x + av.dx * av.travel, fz = av.z + av.dz * av.travel, pos = this.cloud.geometry.attributes.position.array, sd = this.seed;
    for (let i = 0; i < AV_N; i++) {
      const u = -sd[i * 4] * 35 + Math.sin(sd[i * 4 + 1] * 9 + av.t * 2) * 3, v = (sd[i * 4 + 1] - 0.5) * av.width;
      const h = sd[i * 4 + 2] ** 2 * 16 * (0.7 + 0.3 * Math.sin(av.t * 3 + sd[i * 4 + 3] * 20));
      const x = fx + av.dx * u + av.tx * v, z = fz + av.dz * u + av.tz * v;
      pos[i * 3] = x; pos[i * 3 + 1] = heightAt(x, z) + h + 1; pos[i * 3 + 2] = z;
    }
    this.cloud.geometry.attributes.position.needsUpdate = true;
    this.cloud.material.opacity = 0.9 * Math.min(1, av.t) * Math.min(1, (av.total - av.travel) / 40);

    const rx = p.x - fx, rz = p.z - fz, along = rx * av.dx + rz * av.dz, lat = rx * av.tx + rz * av.tz;
    if (along < 3 && along > -32 && Math.abs(lat) < av.width / 2) {
      surv.damage((player.rope ? 12 : 30) * dt, 'Swept away by an avalanche');
      player.push.addScaledVector(new THREE.Vector3(av.dx, 0, av.dz), (player.rope ? 4 : 30) * dt);
      player.shake = 1.5;
      if (!av.hit) { av.hit = true; this.hud.flash(); this.hud.toast('Caught in the avalanche!', 'danger'); }
    }
    this.rumble = Math.max(0, 1 - Math.hypot(rx, rz) / 300) * Math.min(1, (av.total - av.travel) / 60);
    player.shake = Math.max(player.shake, this.rumble * 0.6);
    if (av.travel > av.total) { this.av = null; this.cloud.visible = false; }
  }

  spawnAvalanche(s) {
    const c = pointAt(s + 12 + Math.random() * 25), nx = -c.tz, nz = c.tx;
    const up = heightAt(c.x + nx * 90, c.z + nz * 90) > heightAt(c.x - nx * 90, c.z - nz * 90) ? 1 : -1;
    this.av = { x: c.x + nx * up * 170, z: c.z + nz * up * 170, dx: -nx * up, dz: -nz * up, tx: c.tx, tz: c.tz, width: 44, speed: 17, travel: 0, total: 300, t: 0 };
    this.cloud.visible = true;
    this.hud.toast('AVALANCHE! Run along the trail to get out of its path!', 'danger');
  }
}

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
