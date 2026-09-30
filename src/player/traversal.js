import * as THREE from 'three';
import { heightAt, slopeAt, clampToMap } from '../world/terrain.js';

const GRAVITY = 22;
const angDamp = (a, b, r, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-r * dt));

// createTraversal(world) -> { s, anim, events, update(dt, I, T), teleport(x, z, heading), clip(rope), unclip() }
// Climbing state machine. Modes (sub-states):
//   ground (idle | walk | run | sit)   air (jump | fall)   land (landLight | landHard)
//   slide (slide | arrest)             rope (ropeIdle | ropeClimb)   ladder (ladderIdle | ladderWalk)
// Slopes steeper than the gear allows (T.maxSlope) send you sliding; the ice axe (hold arrest) brakes it; a fixed rope
// (clip) lets you climb anything and holds you against wind and avalanches. s.pos is the feet; `push` carries all
// motion that isn't your legs: sliding, wind, avalanches.
// T (tuning, from the expedition system): speedMul, maxSlope, canSprint, canJump, hasAxe, wind (accel), camYaw, fp.
// events: 'step', 'jump', ['land', impactSpeed], 'crevasse'.
// anim (read by rig.js): mode, sub, t, speed, phase (gait, rad), uphill, landSev, tired, lookPitch.
export function createTraversal(world) {
  const s = {
    mode: 'ground', sub: 'idle', t: 0, heading: 0, grounded: true, rope: null, ropeEnd: false, surface: 'snow',
    sitting: false, moving: false, sprinting: false, sliding: false, arresting: false, uphill: 0, slideSpeed: 0,
    safeT: 0, airT: 0, landT: 0, landSev: 0, phase: 0,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), push: new THREE.Vector3(), lastSafe: new THREE.Vector3(),
  };
  const anim = { mode: 'ground', sub: 'idle', t: 0, speed: 0, phase: 0, uphill: 0, landSev: 0, tired: 0, lookPitch: 0 };
  const events = [];

  function teleport(x, z, heading) {
    s.pos.set(x, world.groundAt(x, z).h, z);
    s.lastSafe.copy(s.pos); s.vel.set(0, 0, 0); s.push.set(0, 0, 0);
    Object.assign(s, { heading: heading ?? s.heading, rope: null, sitting: false, grounded: true, airT: 0, landT: 0, mode: 'ground', sub: 'idle' });
  }

  function update(dt, I, T) {
    events.length = 0;
    const p = s.pos;
    let mx = I.move.x, my = I.move.y;
    if (s.sitting && (mx || my || I.jumpPressed)) s.sitting = false;
    if (I.sitPressed && s.grounded && !s.rope && !s.sliding) s.sitting = !s.sitting;
    if (s.sitting) mx = my = 0;
    // camera-relative direction: forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw)
    const sy = Math.sin(T.camYaw), cy = Math.cos(T.camYaw);
    let dx = sy * my - cy * mx, dz = cy * my + sy * mx;
    const mag = Math.min(1, Math.hypot(dx, dz));
    s.moving = mag > 0.05;
    if (s.moving) { const l = Math.hypot(dx, dz); dx /= l; dz /= l; }

    const slope = slopeAt(p.x, p.z);
    s.uphill = s.moving ? dx * slope.gx + dz * slope.gz : 0;
    s.sprinting = s.moving && I.sprint && T.canSprint && my > 0.3 && !s.rope;
    const steep = s.grounded && s.surface === 'snow' && !s.rope && slope.angle > T.maxSlope;
    let speed = (s.rope ? 3.4 : s.sprinting ? 7.5 : 4.4) * T.speedMul * mag * (s.landT > 0 ? 0.4 : 1);
    if (s.uphill > 0) speed /= 1 + s.uphill * (s.rope ? 0.6 : 1.4);

    const k = Math.min(1, (s.grounded ? (steep ? 1.2 : 12) : 1.5) * dt);
    s.vel.x += ((s.moving ? dx * speed : 0) - s.vel.x) * k;
    s.vel.z += ((s.moving ? dz * speed : 0) - s.vel.z) * k;

    s.sliding = steep;
    if (steep) {
      const gl = Math.hypot(slope.gx, slope.gz), a = GRAVITY * Math.sin(slope.angle) * 0.65 * dt;
      s.push.x -= slope.gx / gl * a; s.push.z -= slope.gz / gl * a;
    }
    s.arresting = I.arrest && T.hasAxe && (steep || s.slideSpeed > 1.5);
    const friction = !s.grounded ? 0.2 : steep ? (s.arresting ? 5 : 0.3) : (s.arresting ? 8 : 5);
    s.push.multiplyScalar(Math.max(0, 1 - friction * dt));
    s.push.addScaledVector(T.wind, dt * (s.rope ? 0.25 : s.grounded ? 1 : 1.5));
    s.slideSpeed = Math.hypot(s.push.x, s.push.z);

    if (I.jumpPressed && s.grounded && T.canJump && !steep && !s.sitting) { s.vel.y = 6.2; s.grounded = false; events.push('jump'); }
    s.vel.y -= GRAVITY * dt;

    const ox = p.x, oz = p.z;
    p.x += (s.vel.x + s.push.x) * dt;
    p.z += (s.vel.z + s.push.z) * dt;
    p.y += s.vel.y * dt;

    for (const c of world.colliders) {
      const cx = p.x - c.x, cz = p.z - c.z, rr = c.r + 0.4, d2 = cx * cx + cz * cz;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3; p.x = c.x + cx / d * rr; p.z = c.z + cz / d * rr; }
    }
    // the jumar keeps you within reach of the fixed rope
    if (s.rope) {
      const n = world.nearestRope(p, s.rope), hd = Math.hypot(p.x - n.q.x, p.z - n.q.z);
      if (hd > 2.6) { p.x = n.q.x + (p.x - n.q.x) * 2.6 / hd; p.z = n.q.z + (p.z - n.q.z) * 2.6 / hd; }
      s.ropeEnd = n.i === 0 || n.i === s.rope.length - 1;
    }
    clampToMap(p);

    const g = world.groundAt(p.x, p.z), hs = Math.hypot(p.x - ox, p.z - oz);
    const snap = s.grounded && s.vel.y <= 0 ? 0.3 + hs * 2.5 : 0; // stick to the ground walking downhill
    if (p.y <= g.h + snap) {
      if (!s.grounded && s.vel.y < -5) {
        s.landSev = Math.min(1, (-s.vel.y - 5) / 15); s.landT = 0.2 + s.landSev * 0.35;
        events.push(['land', -s.vel.y]);
      }
      p.y = g.h; s.vel.y = 0; s.grounded = true;
    } else s.grounded = false;
    s.surface = g.surface;
    if (g.surface === 'crevasse' && p.y < heightAt(p.x, p.z) - 2.5) events.push('crevasse');
    // last solid footing, for hauling you out of a crevasse
    if ((s.safeT -= dt) <= 0 && s.grounded && g.surface === 'snow' && !steep && s.slideSpeed < 1) { s.safeT = 0.5; s.lastSafe.copy(p); }

    // facing: the view in first person; downhill while sliding, uphill while arresting; else where you walk
    if (T.fp) s.heading = T.camYaw;
    else if (steep) s.heading = angDamp(s.heading, Math.atan2(slope.gx, slope.gz) + (s.arresting ? 0 : Math.PI), 6, dt);
    else if (s.moving) s.heading = angDamp(s.heading, Math.atan2(dx, dz), s.rope ? 6 : 10, dt);

    // gait: one cycle per stride, a footstep every half cycle
    if (s.grounded && s.moving) {
      const stride = s.rope ? 1.4 : s.surface === 'ladder' ? 1.2 : s.sprinting ? 4.2 : 3.0, before = s.phase;
      s.phase += hs / stride * Math.PI * 2;
      if (Math.floor(before / Math.PI) !== Math.floor(s.phase / Math.PI)) events.push('step');
    }

    s.airT = s.grounded ? 0 : s.airT + dt;
    s.landT = Math.max(0, s.landT - dt);
    let mode, sub;
    if (!s.grounded && s.airT > 0.08) { mode = 'air'; sub = s.vel.y < -7 || s.airT > 0.7 ? 'fall' : 'jump'; }
    else if (s.landT > 0) { mode = 'land'; sub = s.landSev > 0.5 ? 'landHard' : 'landLight'; }
    else if (steep) { mode = 'slide'; sub = s.arresting ? 'arrest' : 'slide'; }
    else if (s.rope) { mode = 'rope'; sub = s.moving ? 'ropeClimb' : 'ropeIdle'; }
    else if (s.surface === 'ladder') { mode = 'ladder'; sub = s.moving ? 'ladderWalk' : 'ladderIdle'; }
    else { mode = 'ground'; sub = s.sitting ? 'sit' : !s.moving ? 'idle' : s.sprinting ? 'run' : 'walk'; }
    s.t = sub === s.sub ? s.t + dt : 0;
    s.mode = mode; s.sub = sub;
    Object.assign(anim, { mode, sub, t: s.t, speed: hs / Math.max(dt, 1e-4), phase: s.phase, uphill: s.uphill, landSev: s.landSev });
  }

  return {
    s, anim, events, update, teleport,
    clip(rope) { s.rope = rope; s.sitting = false; },
    unclip() { s.rope = null; },
  };
}
