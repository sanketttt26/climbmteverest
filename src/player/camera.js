import * as THREE from 'three';
import { heightAt } from '../world/terrain.js';

const clamp = THREE.MathUtils.clamp;
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
// Critically damped spring (Game Programming Gems 4 "SmoothDamp"): frame-rate independent, continuous position and
// velocity, so mode changes ease in and out instead of kinking. o[k] = value, o[k + 'V'] = its velocity.
function sd(o, k, target, st, dt) {
  const w = 2 / Math.max(1e-4, st), x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  if (!Number.isFinite(o[k])) { o[k] = target; o[k + 'V'] = 0; return target; }
  const v = o[k + 'V'] || 0, ch = o[k] - target, tmp = (v + w * ch) * dt;
  o[k + 'V'] = (v - w * tmp) * e; o[k] = target + (ch + tmp) * e;
  return o[k];
}
const sdA = (o, k, target, st, dt) => sd(o, k, o[k] + wrapA(target - o[k]), st, dt);
const noise = (t, s) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 3.1 + s * 2.3) * 0.3 + Math.sin(t * 5.3 + s * 4.1) * 0.2;
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

// createChaseCamera(camera) -> cam
// Third person: orbit with mouse/stick; after 1.5 s without looking it eases back behind the direction of travel.
// Spring-follow pivot at shoulder height, over-the-shoulder offset, pulls in against the slope behind you (never under
// the snow), FOV widens when sprinting. First person (cam.fp): eye height, body faces the view.
// cam.impact(severity) / cam.shake(amount): trauma shake + FOV punch.
// Convention: yaw 0 looks along +Z; forward = (sin yaw, 0, cos yaw); pitch > 0 looks down.
export function createChaseCamera(camera) {
  const c = { yaw: 0, pitch: 0.18, dist: 4.6, fp: false, trauma: 0, time: 0, lastLook: 99, sens: 1, invertY: false, baseFov: 60, punch: 0,
    pivot: new THREE.Vector3(), collDist: 4.6 };
  c.forwardFlat = (out = new THREE.Vector3()) => out.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
  c.rightFlat = (out = new THREE.Vector3()) => out.set(-Math.cos(c.yaw), 0, Math.sin(c.yaw));
  c.forward = (out = new THREE.Vector3()) => out.set(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
  c.reset = (pos, yaw) => { c.yaw = yaw; c.pitch = 0.18; c.pivot.set(pos.x, pos.y + 1.45, pos.z); c.pivotY = NaN; c.collDist = c.dist; c.lastLook = 99; };
  c.shake = a => { c.trauma = Math.min(1, c.trauma + a); };
  c.impact = sev => { c.trauma = Math.min(1, c.trauma + 0.12 + 0.5 * sev); c.punchV = (c.punchV || 0) - 30 * sev; };

  c.applyLook = look => {
    if (Math.abs(look.dx) + Math.abs(look.dy) > 0.5) c.lastLook = 0;
    const k = 0.0023 * c.sens;
    c.yaw -= look.dx * k;
    c.pitch = clamp(c.pitch + look.dy * k * (c.invertY ? -1 : 1), c.fp ? -1.45 : -0.75, c.fp ? 1.45 : 1.25);
  };

  // p: { pos (feet), vel, heading, mode, moving, sprinting, uphill, eye }
  c.update = (dt, p) => {
    dt = Math.min(dt, 0.1);
    c.time += dt; c.lastLook += dt;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    // ease back behind the climber once they stop steering the camera
    if (!c.fp && c.lastLook > 1.5 && p.moving && hs > 1) {
      const k = clamp((c.lastLook - 1.5) * 0.8, 0, 1);
      sdA(c, 'yaw', p.heading, 1.6 / k, dt);
      sd(c, 'pitch', p.mode === 'rope' ? 0.08 : clamp(0.2 - p.uphill * 0.18, -0.1, 0.35), 1.8 / k, dt);
    }
    // springs keep the punch / trauma smooth
    c.punchV = (c.punchV || 0) + (-c.punch * 120 - (c.punchV || 0) * 14) * dt; c.punch += c.punchV * dt;
    c.trauma = Math.max(0, c.trauma - dt * 1.2);
    const sh = c.trauma * c.trauma;

    if (c.fp) {
      camera.position.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
      camera.lookAt(_v.copy(camera.position).add(c.forward(_f)));
    } else {
      // pivot: horizontal follows tightly, height through a spring so steps and ladders don't jolt the view
      c.pivot.x = p.pos.x; c.pivot.z = p.pos.z;
      c.pivot.y = sd(c, 'pivotY', p.pos.y + 1.45, 0.12, dt);
      const right = c.rightFlat(_v).multiplyScalar(0.45), back = c.forward(_f).multiplyScalar(-1);
      // pull in fast when the slope behind would swallow the lens, ease back out slowly
      let want = c.dist;
      for (let i = 1; i <= 12; i++) {
        const d = c.dist * i / 12, x = c.pivot.x + back.x * d + right.x, z = c.pivot.z + back.z * d + right.z, y = c.pivot.y + back.y * d;
        if (y < heightAt(x, z) + 0.45) { want = Math.max(0.6, d - c.dist / 12); break; }
      }
      c.collDist = want < c.collDist ? want : c.collDist + (want - c.collDist) * (1 - Math.exp(-2 * dt));
      camera.position.copy(c.pivot).addScaledVector(back, c.collDist).add(right);
      camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.35);
      camera.lookAt(_f.copy(c.pivot).add(right));
    }
    if (sh > 0) {
      camera.position.x += noise(c.time * 9, 1) * sh * 0.25; camera.position.y += noise(c.time * 9, 7) * sh * 0.25;
      camera.rotateZ(noise(c.time * 7, 3) * sh * 0.03);
    }
    const fov = c.baseFov + (p.sprinting ? 5 : 0) + c.punch;
    c.fov = sd(c, 'fovS', fov, 0.35, dt);
    if (Math.abs(camera.fov - c.fov) > 0.01) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
  };
  return c;
}
