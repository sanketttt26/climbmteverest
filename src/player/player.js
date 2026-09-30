import * as THREE from 'three';
import { createTraversal } from './traversal.js';
import { createClimber } from './rig.js';
import { createChaseCamera } from './camera.js';

const DEFAULT_TUNING = { speedMul: 1, maxSlope: 0.7, canSprint: true, canJump: true, hasAxe: true, wind: new THREE.Vector3() };
const _head = new THREE.Vector3();

// createPlayer({scene, world, camera}) -> player
//   update(dt, I)        input -> camera look -> traversal -> animation -> camera
//   animate(dt)          pose + camera only, no simulation (menus, ?shot=)
//   tuning()             replaced by the expedition system: what the body and gear allow right now
//   teleport(x, z, heading), setGear(g), lamp (SpotLight on the helmet), s (traversal state), cam, rig
export function createPlayer({ scene, world, camera }) {
  const trav = createTraversal(world);
  const rig = createClimber();
  const cam = createChaseCamera(camera);
  scene.add(rig.object);
  const lamp = new THREE.SpotLight(0xfff4e0, 0, 90, 0.6, 0.6, 1);
  lamp.position.set(0, 0.16, 0.12); lamp.target.position.set(0, -1.5, 6);
  rig.head.add(lamp, lamp.target);
  let time = 0;

  const player = { trav, s: trav.s, anim: trav.anim, rig, cam, lamp, events: trav.events, tuning: () => DEFAULT_TUNING };
  player.update = (dt, I) => {
    cam.applyLook(I.look);
    trav.update(dt, I, { ...player.tuning(), camYaw: cam.yaw, fp: cam.fp });
    for (const e of trav.events) if (e[0] === 'land') cam.impact(Math.min(1, (e[1] - 5) / 15));
    player.animate(dt);
  };
  player.animate = dt => {
    const s = trav.s;
    time += dt;
    rig.object.position.copy(s.pos);
    rig.object.rotation.y = s.heading;
    trav.anim.lookPitch = cam.fp ? cam.pitch * 0.6 : 0; // the lamp follows your gaze, a little above it
    rig.update(dt, trav.anim, time);
    cam.update(dt, { pos: s.pos, vel: s.vel, heading: s.heading, mode: s.mode, moving: s.moving, sprinting: s.sprinting, uphill: s.uphill, eye: s.sitting ? 0.95 : 1.65 });
    // never render the lens inside the climber
    rig.setBodyVisible(!cam.fp && camera.position.distanceTo(rig.head.getWorldPosition(_head)) > 0.5);
  };
  player.teleport = (x, z, heading) => {
    trav.teleport(x, z, heading);
    cam.reset(trav.s.pos, heading);
    player.animate(1); // settle the pose and the camera
  };
  player.setGear = g => rig.setGear(g);
  return player;
}
