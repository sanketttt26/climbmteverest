import * as THREE from 'three';

const C = h => new THREE.Color(h);
const DAY_TOP = C(0x1b4f9e), HIGH_TOP = C(0x0a2466), DAY_HOR = C(0xb3cfea), SET_TOP = C(0x2c3f72), SET_HOR = C(0xf29a5e);
const NIGHT_TOP = C(0x02040b), NIGHT_HOR = C(0x0c1528), STORM_DAY = C(0x9aa3ad), STORM_NIGHT = C(0x15181d);
const ss = THREE.MathUtils.smoothstep;

// createSky(scene) -> { update(hours, cloud, altFrac, center), sunDir, day, fogColor }
// Gradient sky dome with sun disc and halo, stars at night. The sky darkens toward indigo as you climb (thinner air),
// and the fog colour is the horizon colour so distant terrain melts into the sky.
export function createSky(scene) {
  const u = { top: { value: C(0) }, horizon: { value: C(0) }, storm: { value: C(0) }, cloud: { value: 0 }, sunDir: { value: new THREE.Vector3() } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, horizon, storm, sunDir; uniform float cloud; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(horizon, top, pow(max(d.y, 0.0), 0.45));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.9, 0.7) * (pow(s, 900.0) * 12.0 + pow(s, 12.0) * 0.3) * step(-0.05, sunDir.y) * (1.0 - cloud);
        gl_FragColor = vec4(mix(col, storm, cloud), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.frustumCulled = false; dome.renderOrder = -1;

  const n = 1600, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = 0.05 + Math.random() * 0.95, r = Math.sqrt(1 - y * y), a = Math.random() * Math.PI * 2;
    p.set([Math.cos(a) * r * 4000, y * 4000, Math.sin(a) * r * 4000], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  stars.frustumCulled = false;
  scene.add(dome, stars);

  const sky = { sunDir: u.sunDir.value, day: 1, dusk: 0, fogColor: C(0), top: u.top.value };
  sky.update = (hours, cloud, altFrac, center) => {
    const a = (hours - 6) / 12 * Math.PI; // sunrise 06:00 in the east (+x), sunset 18:00
    const sd = u.sunDir.value.set(Math.cos(a), Math.sin(a) * 0.9, -0.42).normalize();
    const day = sky.day = ss(sd.y, -0.08, 0.22), dusk = sky.dusk = Math.max(0, 1 - Math.abs(sd.y) / 0.22);
    u.top.value.copy(NIGHT_TOP).lerp(_t.copy(DAY_TOP).lerp(HIGH_TOP, altFrac * 0.7), day).lerp(SET_TOP, dusk * 0.5);
    u.horizon.value.copy(NIGHT_HOR).lerp(DAY_HOR, day).lerp(SET_HOR, dusk * 0.75);
    u.storm.value.copy(STORM_NIGHT).lerp(STORM_DAY, day);
    u.cloud.value = cloud;
    sky.fogColor.copy(u.horizon.value).lerp(u.storm.value, cloud);
    dome.position.copy(center); stars.position.copy(center);
    stars.material.opacity = (1 - day) * (1 - cloud);
  };
  return sky;
}
const _t = new THREE.Color();
