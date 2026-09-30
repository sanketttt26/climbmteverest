import * as THREE from 'three';

// World units are a 1:5 miniature of the real mountain (1 unit = 5 m) so a human-sized
// climber covers the 3.5 km of vertical on the South Col route in minutes, not weeks.
export const UNIT_M = 5;
export const BASE_ALT = 5364;
export const yToAlt = y => BASE_ALT + y * UNIT_M;
export const altToY = alt => (alt - BASE_ALT) / UNIT_M;

// The South Col route. `area` names the stretch of mountain after a camp.
export const ROUTE = [
  { name: 'Everest Base Camp', short: 'EBC', x: -1000, z: 400, alt: 5364, camp: true, area: 'Khumbu Glacier' },
  { name: 'Khumbu Icefall', short: 'Icefall', x: -880, z: 330, alt: 5450 },
  { name: 'Khumbu Icefall', x: -720, z: 250, alt: 5750 },
  { name: 'Top of the Icefall', x: -560, z: 190, alt: 6000 },
  { name: 'Camp I', short: 'C1', x: -480, z: 160, alt: 6065, camp: true, area: 'Western Cwm' },
  { name: 'Western Cwm', x: -200, z: 80, alt: 6250 },
  { name: 'Camp II', short: 'C2', x: 60, z: 20, alt: 6400, camp: true, area: 'Western Cwm' },
  { name: 'Lhotse Face', short: 'Lhotse', x: 200, z: -20, alt: 6700 },
  { name: 'Camp III', short: 'C3', x: 330, z: -80, alt: 7160, camp: true, area: 'Lhotse Face' },
  { name: 'Yellow Band', x: 430, z: -60, alt: 7500 },
  { name: 'Geneva Spur', x: 480, z: 10, alt: 7800 },
  { name: 'Camp IV', short: 'C4', x: 520, z: 80, alt: 7950, camp: true, area: 'South Col' },
  { name: 'The Balcony', short: 'Balcony', x: 560, z: 170, alt: 8400 },
  { name: 'South Summit', x: 600, z: 250, alt: 8750 },
  { name: 'Hillary Step', x: 620, z: 275, alt: 8790 },
  { name: 'Summit', short: 'Summit', x: 650, z: 310, alt: 8849 },
];

// Surrounding giants as [x, z, height, radius]: Lhotse, Nuptse, West Shoulder, Pumori,
// Lingtren, Changtse, Makalu, Ama Dablam.
const PEAKS = [
  [400, -330, 630, 380], [-250, -260, 500, 420], [-320, 430, 440, 330], [-1350, 760, 380, 420],
  [-760, 720, 300, 300], [720, 820, 430, 380], [1350, -150, 560, 420], [-1100, -520, 340, 260],
];

const CX = -150, CZ = 150, SIZE = 3600, SEG = 360, CELL = SIZE / SEG, N1 = SEG + 1;
const X0 = CX - SIZE / 2, Z0 = CZ - SIZE / 2;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) { // value noise in -1..1
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv) * 2 - 1;
}
function fbm(x, y, oct) { let s = 0, a = 0.5; for (let i = 0; i < oct; i++) { s += a * noise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; }
function ridged(x, y, oct) { let s = 0, a = 0.5; for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x, y)); s += a * n * n; x *= 2.1; y *= 2.1; a *= 0.5; } return s; }

// The route as a dense polyline; ps is cumulative horizontal distance along it.
const P = new THREE.CatmullRomCurve3(ROUTE.map(p => new THREE.Vector3(p.x, altToY(p.alt), p.z)), false, 'centripetal').getSpacedPoints(170);
const N = P.length, px = new Float64Array(N), py = new Float64Array(N), pz = new Float64Array(N), ps = new Float64Array(N);
P.forEach((p, i) => { px[i] = p.x; py[i] = p.y; pz[i] = p.z; ps[i] = i ? ps[i - 1] + Math.hypot(p.x - px[i - 1], p.z - pz[i - 1]) : 0; });
export const PATH_LEN = ps[N - 1];

// Nearest point on the route: distance off it, progress s along it, trail height and direction there.
export function routeAt(x, z) {
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < N - 1; i++) {
    const ax = px[i], az = pz[i], dx = px[i + 1] - ax, dz = pz[i + 1] - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - x, qz = az + dz * t - z, d2 = qx * qx + qz * qz;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  const dx = px[bi + 1] - px[bi], dz = pz[bi + 1] - pz[bi], l = Math.hypot(dx, dz);
  const s = ps[bi] + (ps[bi + 1] - ps[bi]) * bt;
  return { d: Math.sqrt(best), s, f: s / PATH_LEN, y: py[bi] + (py[bi + 1] - py[bi]) * bt, tx: dx / l, tz: dz / l };
}

export function pointAt(s) {
  s = Math.min(Math.max(s, 0), PATH_LEN);
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ps[m] <= s) lo = m; else hi = m; }
  const t = (s - ps[lo]) / (ps[hi] - ps[lo] || 1), dx = px[hi] - px[lo], dz = pz[hi] - pz[lo], l = Math.hypot(dx, dz) || 1;
  return { x: px[lo] + dx * t, y: py[lo] + (py[hi] - py[lo]) * t, z: pz[lo] + dz * t, tx: dx / l, tz: dz / l };
}

for (const w of ROUTE) w.s = routeAt(w.x, w.z).s;
const CAMPS = ROUTE.filter(w => w.camp).map(w => ({ x: w.x, z: w.z, y: altToY(w.alt) }));
const SUMMIT = { x: ROUTE.at(-1).x, z: ROUTE.at(-1).z, y: altToY(ROUTE.at(-1).alt) };

// Terrain field, build-time only. The trail height comes from the nearest route point; the
// wall/ridge shape uses a soft-min over all route segments so distant parts of the route blend
// into each other without seams.
const segD = new Float64Array(N - 1), segY = new Float64Array(N - 1), segS = new Float64Array(N - 1);
const F = { d: 0, yN: 0, yS: 0, f: 0, past: 0 };
function field(x, z) {
  let dmin = Infinity;
  for (let i = 0; i < N - 1; i++) {
    const ax = px[i], az = pz[i], dx = px[i + 1] - ax, dz = pz[i + 1] - az;
    const raw = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    const qx = ax + dx * t - x, qz = az + dz * t - z, d = Math.sqrt(qx * qx + qz * qz);
    segD[i] = d; segY[i] = py[i] + (py[i + 1] - py[i]) * t; segS[i] = ps[i] + (ps[i + 1] - ps[i]) * t;
    if (d < dmin) { dmin = d; F.yN = segY[i]; F.past = i === N - 2 && raw > 1 ? d : 0; } // past the summit end of the route
  }
  let w = 0, ys = 0, ss = 0;
  for (let i = 0; i < N - 1; i++) {
    const k = segD[i] - dmin;
    if (k > 150) continue;
    const e = Math.exp(-k / 35);
    w += e; ys += e * segY[i]; ss += e * segS[i];
  }
  F.d = dmin; F.yS = ys / w; F.f = ss / w / PATH_LEN;
  return F;
}

function shape(x, z) {
  const { d, yN, yS, f, past } = field(x, z);
  const top = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
  const ridge = smooth(0.72, 0.9, f); // near the top the trail rides a ridge instead of a valley floor
  const W = lerp(26, 8, smooth(0.8, 0.95, f));
  const mask = smooth(W, W + lerp(200, 70, ridge), d);
  // the summit is a true peak: the snow falls away beyond the end of the route, and the surface noise fades out near it
  const trail = yN - past * 0.6 + fbm(x * 0.012, z * 0.012, 3) * 1.8 * smooth(10, 60, top);
  let out = yS + 220 * (1 - smooth(0.55, 0.8, f)) - 180 * ridge
    + (ridged(x * 0.005, z * 0.005, 5) - 0.35) * 180 * (1 - ridge * 0.6) + fbm(x * 0.02, z * 0.02, 3) * 12;
  out = lerp(out, -40 + ridged(x * 0.0022 + 11, z * 0.0022, 5) * 300, smooth(300, 1000, d));
  let h = lerp(trail, out, mask);
  for (const [cx, cz, ch, cr] of PEAKS) {
    const r = Math.hypot(x - cx, z - cz);
    if (r >= cr) continue;
    const k = 1 - r / cr, c = ch * Math.pow(k, 1.4) + (ridged(x * 0.01, z * 0.01, 4) - 0.35) * 70 * k;
    if (c > h) h = lerp(h, c, mask);
  }
  for (const c of CAMPS) { // camps sit on dug-out ledges
    const r = Math.hypot(x - c.x, z - c.z);
    if (r < 24) h = lerp(c.y, h, smooth(10, 24, r));
  }
  if (top < 8) h = lerp(SUMMIT.y, h, smooth(2, 8, top)); // the summit itself: a snow dome the size of a table, exactly 8,849 m
  // distant ranges around the edge so the map never ends in a cliff
  const e = Math.max(Math.abs(x - CX), Math.abs(z - CZ)) / (SIZE / 2);
  return h + smooth(0.7, 0.97, e) * (250 + ridged(x * 0.004, z * 0.004, 4) * 300);
}

const H = new Float32Array(N1 * N1);

export function buildTerrain() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2).translate(CX, 0, CZ);
  const pos = geo.attributes.position, D = new Float32Array(pos.count), Fs = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const h = shape(pos.getX(i), pos.getZ(i));
    H[i] = h; D[i] = F.d; Fs[i] = F.f;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  const snow = new THREE.Color(0xf4f7fb), ice = new THREE.Color(0xb4d6ee), rock = new THREE.Color(0x5e5751);
  const moraine = new THREE.Color(0x776a5d), band = new THREE.Color(0x9c8450), c = new THREE.Color(), r = new THREE.Color();
  const col = new Float32Array(pos.count * 3), nrm = geo.attributes.normal, bc = ROUTE[0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = H[i], d = D[i], f = Fs[i];
    c.copy(snow).lerp(ice, (1 - smooth(8, 34, d)) * (1 - smooth(0.36, 0.46, f)) * (0.45 + 0.35 * noise(x * 0.05, z * 0.05)));
    c.lerp(moraine, (1 - smooth(50, 170, Math.hypot(x - bc.x, z - bc.z))) * smooth(-0.2, 0.4, noise(x * 0.04, z * 0.04)) * 0.9);
    const bare = Math.max(smooth(0.66, 0.45, nrm.getY(i)), smooth(10, -60, y) * 0.6); // steep faces shed their snow
    r.copy(rock).lerp(band, (1 - smooth(0, 35, Math.abs(y - 432))) * 0.8);          // the Yellow Band
    c.lerp(r, bare).multiplyScalar(0.94 + noise(x * 0.3, z * 0.3) * 0.06);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grainTexture(), roughness: 0.92 }));
  mesh.receiveShadow = true;
  return mesh;
}

function grainTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 212 + Math.random() * 43; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(SIZE / 6, SIZE / 6); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Height of the rendered mesh (same triangle split as PlaneGeometry), so feet never float or sink.
export function heightAt(x, z) {
  let fx = Math.min(Math.max((x - X0) / CELL, 0), SEG - 1e-6), fz = Math.min(Math.max((z - Z0) / CELL, 0), SEG - 1e-6);
  const ix = fx | 0, iz = fz | 0; fx -= ix; fz -= iz;
  const a = H[ix + iz * N1], b = H[ix + (iz + 1) * N1], c = H[ix + 1 + (iz + 1) * N1], d = H[ix + 1 + iz * N1];
  return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}

export function slopeAt(x, z) {
  const e = 0.6, gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return { gx, gz, angle: Math.atan(Math.hypot(gx, gz)) };
}

export function clampToMap(p) {
  p.x = Math.min(Math.max(p.x, X0 + 40), X0 + SIZE - 40);
  p.z = Math.min(Math.max(p.z, Z0 + 40), Z0 + SIZE - 40);
}
