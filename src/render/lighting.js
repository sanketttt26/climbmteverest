import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { createSky } from './sky.js';

const WARM = new THREE.Color(0xffb070), WHITE = new THREE.Color(0xffffff), MOON = new THREE.Color(0x9fb4ff);
const ss = THREE.MathUtils.smoothstep;

// createLighting({scene, camera, Q}) -> lighting
//   update(hours, cloud, altFrac, focus)  sun by day, a cold moon by night; fits the shadows around `focus` (the climber)
//   setupMaterials(root)                  CSM needs every lit material registered (else each cascade light adds up)
//   sky                                   the sky dome (fog colour, day factor)
// Quality with cascades > 1: cascaded shadow maps, and the terrain casts (ridges throw shadows across the valleys).
// Otherwise one 140-unit shadow box follows the climber.
export function createLighting({ scene, camera, Q }) {
  const sky = createSky(scene);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8d949c, 1);
  scene.add(hemi);
  const dir = new THREE.Vector3(), color = new THREE.Color();
  let csm = null, sun = null;
  if (Q.cascades > 1) {
    csm = new CSM({ maxFar: Q.shadowFar, cascades: Q.cascades, mode: 'practical', parent: scene, shadowMapSize: Q.shadowMapSize,
      lightDirection: new THREE.Vector3(-1, -1, 0.4).normalize(), camera, lightIntensity: 3, lightMargin: 900, lightFar: 3000, shadowBias: -0.0003 });
    csm.fade = true;
    for (const l of csm.lights) l.shadow.normalBias = 0.06;
  } else {
    sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    const c = sun.shadow.camera; c.left = c.bottom = -70; c.right = c.top = 70; c.near = 10; c.far = 900;
    sun.shadow.mapSize.set(Q.shadowMapSize, Q.shadowMapSize); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
  }

  const lighting = { sky, hemi, csm, terrainShadows: !!csm, get day() { return sky.day; } };
  lighting.update = (hours, cloud, altFrac, focus) => {
    sky.update(hours, cloud, altFrac, camera.position);
    const sd = sky.sunDir, moon = sd.y < 0;
    dir.copy(sd); if (moon) dir.negate();
    const intensity = moon ? 0.9 * ss(dir.y, 0, 0.2) * (1 - cloud * 0.8) : 3.2 * ss(sd.y, -0.02, 0.2) * (1 - cloud * 0.7);
    color.copy(moon ? MOON : WARM).lerp(WHITE, moon ? 0 : ss(sd.y, 0, 0.35));
    if (csm) {
      csm.lightDirection.copy(dir).negate();
      for (const l of csm.lights) { l.intensity = intensity; l.color.copy(color); }
      csm.update();
    } else {
      sun.position.copy(focus).addScaledVector(dir, 400); sun.target.position.copy(focus);
      sun.intensity = intensity; sun.color.copy(color);
    }
    hemi.intensity = 0.3 + sky.day * (1.0 + cloud * 0.4); // snow in shade glows with skylight; moonlit snow is never pitch black
    hemi.color.copy(sky.top).lerp(WHITE, 0.6);
  };
  const seen = new WeakSet();
  lighting.setupMaterial = m => {
    if (!csm || !m || seen.has(m) || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
    seen.add(m); csm.setupMaterial(m);
  };
  lighting.setupMaterials = root => root.traverse(o => [].concat(o.material || []).forEach(lighting.setupMaterial));
  lighting.resize = () => csm?.updateFrustums();
  return lighting;
}
