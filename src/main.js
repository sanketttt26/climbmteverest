// Integration entry. Module contracts:
//  render/lighting.js    createLighting({scene, camera, Q}) -> {update(hours, cloud, altFrac, focus), sky, day, setupMaterials(root)}
//  render/pipeline.js    createPipeline({renderer, scene, camera, Q}) -> {render(dt), setSize(w, h)}
//  world/terrain.js      buildTerrain() -> Mesh; heightAt/slopeAt/routeAt/pointAt queries; ROUTE
//  world/mountain.js     new World(scene) -> {groundAt(x, z), colliders, ropes, crevasses, interactables, nearestRope(p)}
//  world/weather.js      new Weather(scene, snowCount) -> {update(...), p (fog, snow, wind, cloud), speed, windDir, airTemp(alt, day)}
//  player/player.js      createPlayer({scene, world, camera}) -> {update(dt, I), animate(dt), teleport(x, z, heading), s, cam, rig}
//  ui/hud.js             createHud({player}) -> {update(info), frame(info), toast, flash, fade, ...}
//  game/systems/index.js initSystems(ctx) -> {flow, expedition, ...}; pushes {update(dt, I)} into ctx.systems
//  shots.js              ?shot=<name> deterministic scenes for screenshots
import * as THREE from 'three';
import './ui/style.css';
import { getQuality } from './render/quality.js';
import { createLighting } from './render/lighting.js';
import { createPipeline } from './render/pipeline.js';
import { buildTerrain, heightAt, yToAlt, ROUTE } from './world/terrain.js';
import { World } from './world/mountain.js';
import { Weather } from './world/weather.js';
import { createInput } from './player/input.js';
import { createPlayer } from './player/player.js';
import { createHud } from './ui/hud.js';
import { initSystems } from './game/systems/index.js';
import { applyShot } from './shots.js';

const boot = window.__boot || { stage: async () => {}, done() {} };
const params = new URLSearchParams(location.search), shotName = params.get('shot');
const Q = getQuality();

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb3cfea, 0.0003);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, 6000);
scene.add(camera);
const lighting = createLighting({ scene, camera, Q });

await boot.stage('terrain');
const terrain = buildTerrain();
terrain.castShadow = lighting.terrainShadows;
scene.add(terrain);
await boot.stage('world');
const world = new World(scene);
const weather = new Weather(scene, Q.snow);
await boot.stage('player');
const input = createInput(renderer.domElement);
const player = createPlayer({ scene, world, camera });
const hud = createHud({ player });
const pipeline = createPipeline({ renderer, scene, camera, Q });
const ctx = window.__ctx = { THREE, Q, renderer, scene, camera, lighting, pipeline, world, weather, input, player, hud, systems: [] };
const sys = initSystems(ctx);
lighting.setupMaterials(scene);

await boot.stage('shaders');
const altFrac = () => Math.min(1, Math.max(0, (yToAlt(player.s.pos.y) - ROUTE[0].alt) / (ROUTE.at(-1).alt - ROUTE[0].alt)));
const shot = shotName ? applyShot(ctx, shotName) : null;
if (!shot) sys.expedition.spawnAt(sys.expedition.hasSave ? sys.save.state.expedition.camp : 0);
lighting.update(ctx.clock.hours, weather.p.cloud, altFrac(), player.s.pos);
await renderer.compileAsync(scene, camera).catch(() => {}); // link shader programs during loading, not as hitches in play
await boot.stage('frame');
sys.flow.set(shot ? 'shot' : 'menu');

// title screen: a slow orbit around the climber, looking up toward the summit
function menuCamera(t) {
  const p = player.s.pos, a = t * 0.04 + 2.4, x = p.x + Math.sin(a) * 9, z = p.z + Math.cos(a) * 9;
  camera.position.set(x, Math.max(p.y + 2.6, heightAt(x, z) + 1.5), z);
  camera.lookAt(p.x, p.y + 1.6, p.z);
}

let last = performance.now(), frames = 0, hudT = 0, shotFrames = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const I = input.poll(dt), mode = sys.flow.mode;
  if (mode === 'play') {
    player.update(dt, I);
    for (const s of ctx.systems) s.update(dt, I);
  } else if (mode === 'shot') {
    shot.tick(dt);
    if (++shotFrames === 45) window.__shotReady = true;
  } else {
    player.animate(dt);
    if (mode === 'menu') menuCamera(now / 1000);
  }
  weather.update(dt, player.s.pos.y, altFrac(), lighting.day, camera.position);
  lighting.update(ctx.clock.hours, weather.p.cloud, altFrac(), player.s.pos);
  scene.fog.color.copy(lighting.sky.fogColor);
  scene.fog.density = weather.p.fog;
  const info = sys.expedition.info();
  if ((hudT -= dt) <= 0) { hudT = 0.1; hud.update(info); }
  hud.frame(info);
  hud.effects(sys.expedition.surv);
  pipeline.render(dt);
  if (++frames === 3) boot.done();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  pipeline.setSize(innerWidth, innerHeight);
  lighting.resize();
});
