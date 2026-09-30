import { heightAt, pointAt, ROUTE, PATH_LEN } from '../world/terrain.js';

const $ = id => document.getElementById(id);
const STATS = [['health', 'Health'], ['stamina', 'Stamina'], ['spo2', 'SpO₂'], ['warmth', 'Warmth'], ['food', 'Food'], ['water', 'Water']];
const GEAR = [['crampons', 'Crampons'], ['axe', 'Ice axe'], ['harness', 'Harness'], ['suit', 'Down suit']];
const MAP = { x0: -1300, z0: -450, x1: 950, z1: 700, upp: 2 }; // relief around the route, world units per pixel
const VIEW = 170;                                                // minimap radius in world units
const LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const bearing = (x, z) => Math.atan2(x, -z);                     // north is -Z, clockwise
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// createHud({player}) -> hud
//   update(info)   text and bars (call ~10 Hz)      frame(info)  compass + minimap (every frame)
//   toast(msg, kind), prompt(text), flash(), fade(on), effects(surv), setVisible(b), toggleHelp()
export function createHud({ player }) {
  const el = {};
  for (const id of ['hud', 'loc', 'alt', 'time', 'weather', 'temp', 'wind', 'vis', 'obj-text', 'obj-dist', 'route-me', 'o2', 'supplies', 'gear',
    'prompt', 'toasts', 'fx-hypoxia', 'fx-cold', 'fx-damage', 'fade', 'help']) el[id] = $(id);
  const bars = {};
  for (const [k, label] of STATS) {
    const row = document.createElement('div');
    row.className = 'stat ' + k;
    row.innerHTML = `<label>${label}</label><div class="bar"><i></i></div><span></span>`;
    $('vitals').append(row);
    bars[k] = { row, i: row.querySelector('i'), v: row.querySelector('span') };
  }
  for (const w of ROUTE) {
    if (!w.short) continue;
    const m = document.createElement('div');
    m.className = 'mark' + (w.camp ? ' camp' : '');
    m.style.left = (w.s / PATH_LEN * 100) + '%';
    m.dataset.label = w.short;
    $('route').append(m);
  }
  el.help.append(Object.assign($('controls').cloneNode(true), { id: '' }));

  // ---- shaded relief of the route area, painted once from the real terrain
  const relief = document.createElement('canvas');
  relief.width = (MAP.x1 - MAP.x0) / MAP.upp; relief.height = (MAP.z1 - MAP.z0) / MAP.upp;
  {
    const c = relief.getContext('2d'), img = c.createImageData(relief.width, relief.height), u = MAP.upp;
    for (let j = 0; j < relief.height; j++) for (let i = 0; i < relief.width; i++) {
      const x = MAP.x0 + (i + 0.5) * u, z = MAP.z0 + (j + 0.5) * u, h = heightAt(x, z);
      const gx = (heightAt(x + u, z) - h) / u, gz = (heightAt(x, z + u) - h) / u;
      const shade = (0.6 * gx + 0.6 * gz + 0.7) / Math.sqrt(gx * gx + gz * gz + 1) / 1.1; // lit from the north-west
      const t = Math.min(1, Math.max(0, 0.1 + 0.6 * shade + 0.3 * Math.min(1, Math.max(0, (h + 50) / 750))));
      const k = (j * relief.width + i) * 4;
      img.data[k] = 18 + t * 196; img.data[k + 1] = 36 + t * 192; img.data[k + 2] = 71 + t * 184; img.data[k + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const P = (x, z) => [(x - MAP.x0) / u, (z - MAP.z0) / u];
    c.beginPath();
    for (let s = 0; s <= PATH_LEN; s += 4) c.lineTo(...P(pointAt(s).x, pointAt(s).z));
    c.strokeStyle = '#ff6a2b'; c.lineWidth = 2.5; c.setLineDash([6, 4]); c.stroke();
    for (const w of ROUTE.filter(w => w.camp || w === ROUTE.at(-1))) {
      const [x, y] = P(w.x, w.z);
      c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 6, y + 4); c.lineTo(x - 6, y + 4); c.closePath();
      c.fillStyle = w === ROUTE.at(-1) ? '#ffd35a' : '#fff'; c.strokeStyle = '#0b1a33'; c.lineWidth = 1.5; c.setLineDash([]); c.fill(); c.stroke();
    }
  }

  const fit = cv => { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio, 2); cv.width = r.width * d; cv.height = r.height * d; return d; };
  const compass = $('compass').querySelector('canvas'), mini = $('minimap').querySelector('canvas');
  let dpr = 1;
  const resize = () => { dpr = fit(compass); fit(mini); };
  addEventListener('resize', resize);

  function drawCompass(info) {
    const c = compass.getContext('2d'), W = compass.width, H = compass.height, span = Math.PI * 0.8, px = W / span;
    c.clearRect(0, 0, W, H);
    const cb = bearing(Math.sin(player.cam.yaw), Math.cos(player.cam.yaw));
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 5) {
      const x = W / 2 + wrap(d * Math.PI / 180 - cb) * px;
      if (x < 0 || x > W) continue;
      const major = d % 45 === 0;
      c.fillStyle = major ? '#fff' : 'rgba(255,255,255,.45)';
      if (major) { c.font = `700 ${13 * dpr}px 'Barlow Condensed', sans-serif`; c.fillText(LABELS[d / 45], x, H * 0.62); }
      else c.fillRect(x - 0.5 * dpr, H * (d % 15 ? 0.72 : 0.58), dpr, H * 0.2);
    }
    // objective diamond, pinned to the edge when it's behind you
    const p = player.s.pos, a = wrap(bearing(info.aim.x - p.x, info.aim.z - p.z) - cb);
    const x = Math.min(W - 8 * dpr, Math.max(8 * dpr, W / 2 + a * px)), y = H * 0.24, r = 5 * dpr;
    c.fillStyle = '#ff6a2b'; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.fill();
  }

  function drawMinimap(info) {
    const c = mini.getContext('2d'), W = mini.width, R = W / 2, k = R / VIEW, p = player.s.pos, yaw = player.cam.yaw;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw)); // camera forward points up
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(R, R, R - dpr, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0b1a33'; c.fillRect(0, 0, W, W);
    c.translate(R, R); c.rotate(rot); c.scale(k, k);
    c.drawImage(relief, MAP.x0 - p.x, MAP.z0 - p.z, relief.width * MAP.upp, relief.height * MAP.upp);
    // the climber: an arrow along their heading
    const h = player.s.heading, fx = Math.sin(h), fz = Math.cos(h), L = 9 / k * dpr;
    c.beginPath(); c.moveTo(fx * L, fz * L); c.lineTo(-fx * L * 0.6 + fz * L * 0.55, -fz * L * 0.6 - fx * L * 0.55); c.lineTo(-fx * L * 0.3, -fz * L * 0.3);
    c.lineTo(-fx * L * 0.6 - fz * L * 0.55, -fz * L * 0.6 + fx * L * 0.55); c.closePath();
    c.fillStyle = '#ff6a2b'; c.strokeStyle = '#fff'; c.lineWidth = 1.5 / k * dpr; c.fill(); c.stroke();
    c.restore();
    // objective, pinned to the rim when out of range; north marker on the rim
    const pin = (wx, wz, max) => {
      const cs = Math.cos(rot), sn = Math.sin(rot), dx = (wx - p.x) * k, dz = (wz - p.z) * k;
      let x = dx * cs - dz * sn, y = dx * sn + dz * cs; const l = Math.hypot(x, y);
      if (l > max) { x *= max / l; y *= max / l; }
      return [R + x, R + y];
    };
    const [gx, gy] = pin(info.goal.x, info.goal.z, R - 10 * dpr), r = 6 * dpr;
    c.fillStyle = '#ffd35a'; c.strokeStyle = '#0b1a33'; c.lineWidth = 1.5 * dpr;
    c.beginPath(); c.moveTo(gx, gy - r); c.lineTo(gx + r, gy); c.lineTo(gx, gy + r); c.lineTo(gx - r, gy); c.closePath(); c.fill(); c.stroke();
    const [nx, ny] = pin(p.x, p.z - 1e6, R - 11 * dpr);
    c.fillStyle = '#fff'; c.font = `800 ${12 * dpr}px 'Barlow Condensed', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny);
    c.beginPath(); c.arc(R, R, R - dpr, 0, Math.PI * 2); c.strokeStyle = 'rgba(190,210,255,.55)'; c.lineWidth = 1.5 * dpr; c.stroke();
  }

  const recent = new Map();
  let lastPrompt = null;
  const hud = {
    update(d) {
      const s = d.s;
      el.loc.textContent = d.loc;
      el.alt.textContent = `${Math.round(d.alt).toLocaleString('en-US')} m`;
      el.time.textContent = d.time;
      el.weather.textContent = d.weather;
      el.temp.textContent = `${Math.round(d.temp)}°C · feels ${Math.round(d.feels)}°`;
      el.wind.textContent = `Wind ${Math.round(d.wind * 3.6)} km/h`;
      el.vis.textContent = `Visibility ${d.vis}`;
      for (const [k] of STATS) {
        const b = bars[k], v = s[k];
        b.i.style.width = v + '%';
        b.v.textContent = Math.round(v);
        b.row.classList.toggle('low', v < (k === 'spo2' ? 60 : 30));
      }
      el.o2.innerHTML = s.tanks
        ? `O₂ <b>${s.tanks}</b> cyl · ${Math.round(s.tankLevel * 100)}% ${s.o2On ? '<em class="on">flowing</em>' : '<em>off · O</em>'}`
        : 'O₂ <em>no cylinders</em>';
      el.supplies.innerHTML = `Rations <b>${s.rations}</b> <kbd>1</kbd> · Water <b>${s.bottles}</b> <kbd>2</kbd>`;
      el.gear.innerHTML = GEAR.map(([k, n]) => `<span class="${s.gear[k] ? 'on' : ''}">${n}</span>`).join('');
      el['route-me'].style.left = d.progress * 100 + '%';
      el['obj-text'].textContent = d.objective;
      el['obj-dist'].textContent = `${d.goal.name} · ${d.objDist}`;
      hud.prompt(d.prompt);
    },
    frame(d) {
      if (el.hud.hidden) return;
      if (compass.width < 2) resize();
      drawCompass(d); drawMinimap(d);
    },
    effects(s) {
      el['fx-hypoxia'].style.opacity = Math.min(0.85, Math.max(0, (62 - s.spo2) / 25));
      el['fx-cold'].style.opacity = Math.min(0.8, Math.max(0, (45 - s.warmth) / 40));
    },
    toast(msg, kind = 'info') {
      if (!msg || performance.now() - (recent.get(msg) || -1e9) < 4000) return;
      recent.set(msg, performance.now());
      const t = document.createElement('div');
      t.className = 'toast ' + kind; t.textContent = msg;
      el.toasts.prepend(t);
      while (el.toasts.children.length > 4) el.toasts.lastChild.remove();
      setTimeout(() => t.classList.add('out'), 5500);
      setTimeout(() => t.remove(), 6200);
    },
    prompt(text) {
      if (text === lastPrompt) return;
      lastPrompt = text; el.prompt.textContent = text; el.prompt.hidden = !text;
    },
    flash() { const e = el['fx-damage']; e.classList.remove('hit'); void e.offsetWidth; e.classList.add('hit'); },
    fade(on) { el.fade.classList.toggle('on', on); },
    setVisible(v) { el.hud.hidden = !v; if (v) requestAnimationFrame(resize); },
    toggleHelp() { el.help.hidden = !el.help.hidden; },
  };
  return hud;
}
