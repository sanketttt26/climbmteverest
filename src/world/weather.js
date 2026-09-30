import * as THREE from 'three';

// fog = FogExp2 density, snow = particle amount 0..1, wind = base speed (m/s, grows with altitude), cloud = sky overcast 0..1
export const WEATHER = {
  clear:    { label: 'Clear',      fog: 0.00022, snow: 0,    wind: 4,  cloud: 0 },
  cloudy:   { label: 'Overcast',   fog: 0.0009,  snow: 0.08, wind: 7,  cloud: 0.55 },
  windy:    { label: 'High winds', fog: 0.0006,  snow: 0.3,  wind: 18, cloud: 0.25 },
  snow:     { label: 'Snowfall',   fog: 0.004,   snow: 0.6,  wind: 9,  cloud: 0.75 },
  fog:      { label: 'Whiteout',   fog: 0.014,   snow: 0.05, wind: 3,  cloud: 0.85 },
  blizzard: { label: 'Blizzard',   fog: 0.011,   snow: 1,    wind: 26, cloud: 0.95 },
};
const BOX = 70;

export class Weather {
  constructor(scene, N = 7000) {
    this.N = N;
    this.current = 'clear'; this.next = 'cloudy'; this.timer = 110;
    this.p = { ...WEATHER.clear }; this.t = 0; this.speed = 4;
    this.windDir = new THREE.Vector3(1, 0, 0); this.drift = new THREE.Vector3();

    // Snow lives in a 70-unit box that wraps around the camera entirely on the GPU.
    const g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3).map(() => Math.random() * BOX), rnd = new Float32Array(N).map(Math.random);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    this.u = { uCam: { value: new THREE.Vector3() }, uDrift: { value: this.drift }, uOpacity: { value: 0 }, uBright: { value: 1 }, uSize: { value: 1 } };
    this.snow = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false,
      vertexShader: `uniform vec3 uCam, uDrift; uniform float uSize; attribute float aRand;
        void main() {
          vec3 p = position + uDrift * (0.75 + aRand * 0.5);
          p.x += sin(uDrift.y * 0.35 + aRand * 60.0) * 0.8;
          p = mod(p - uCam, ${BOX}.0) - ${BOX / 2}.0 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (0.5 + aRand) * 60.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uOpacity, uBright;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(uBright), uOpacity * (1.0 - d * 2.0)); }`,
    }));
    this.snow.frustumCulled = false;
    scene.add(this.snow);
  }

  // Next weather is rolled a cycle ahead so camps can give a forecast. Storms get likelier higher up.
  advance(altFrac) {
    this.current = this.next; this.timer = 70 + Math.random() * 90;
    const w = { clear: 4, cloudy: 3, windy: 1.5 + altFrac * 2, snow: 2, fog: 1.5, blizzard: 0.4 + altFrac * 1.6 };
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b);
    for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) { this.next = k; break; }
  }

  update(dt, y, altFrac, day, cam) {
    this.t += dt;
    if ((this.timer -= dt) <= 0) this.advance(altFrac);
    const target = WEATHER[this.current], k = Math.min(1, dt * 0.07);
    for (const key of ['fog', 'snow', 'wind', 'cloud']) this.p[key] += (target[key] - this.p[key]) * k;
    const a = Math.sin(this.t * 0.013) * 0.6 + Math.sin(this.t * 0.051) * 0.2; // jet stream from the west, wandering
    this.windDir.set(Math.cos(a), 0, Math.sin(a));
    const gust = 0.75 + 0.25 * Math.sin(this.t * 1.1) * Math.sin(this.t * 0.37 + 1);
    this.speed = this.p.wind * (1 + Math.max(0, y) / 600) * gust;
    this.drift.x += this.windDir.x * this.speed * 0.7 * dt;
    this.drift.z += this.windDir.z * this.speed * 0.7 * dt;
    this.drift.y -= (2.2 + this.p.snow) * dt;
    this.u.uCam.value.copy(cam);
    this.u.uOpacity.value = Math.min(1, this.p.snow * 1.6) * 0.85;
    this.u.uBright.value = 0.25 + day * 0.75;
    this.u.uSize.value = 0.8 + this.p.snow * 0.6;
    this.snow.geometry.setDrawRange(0, Math.floor(this.N * Math.min(1, this.p.snow + 0.02)));
  }

  airTemp(alt, day) { return -4 - (alt - 5364) * 0.0065 - (1 - day) * 9 - this.p.cloud * 3 - this.p.snow * 4; }
  get visibility() { return 1.5 / this.p.fog; } // distance where FogExp2 hits ~90%
}
