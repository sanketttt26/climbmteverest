import * as THREE from 'three';
import { routeAt, pointAt, yToAlt, ROUTE, PATH_LEN, UNIT_M } from '../../world/terrain.js';
import { WEATHER } from '../../world/weather.js';
import { Survival } from './survival.js';
import { emit } from './events.js';

const SUMMIT = ROUTE.at(-1);
const SURV_KEYS = ['health', 'stamina', 'spo2', 'warmth', 'food', 'water', 'acclim', 'tanks', 'tankLevel', 'rations', 'bottles'];
const pad = n => String(Math.floor(n)).padStart(2, '0');
const fmtClock = h => `Day ${Math.floor(h / 24) + 1} · ${pad(h % 24)}:${pad(h % 1 * 60)}`;
const fmtDist = m => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
const fmtAlt = a => `${Math.round(a).toLocaleString('en-US')} m`;
const fmtDuration = s => `${Math.floor(s / 60)} min ${pad(s % 60)} s`;
const toast = (msg, kind = 'info') => emit('toast', { msg, kind });
const $ = id => document.getElementById(id);

// createExpedition(ctx, {save, flow, sound, hazards, markers}) -> expedition
// The climb itself: body (survival), camps as checkpoints, interactions (tents, caches, depot, oxygen, ropes),
// hazards, rescue after death, the summit. One real second is one minute on the mountain (ctx.clock.hours).
export function createExpedition(ctx, { save, flow, sound, hazards, markers }) {
  const { player, world, weather, lighting, hud } = ctx;
  const surv = new Survival();
  const fresh = () => ({ hours: 8, elapsed: 0, camp: 0, visited: new Set([0]), rests: 0, rescues: 0, highest: 5364, summited: false, deathZone: false, lamp: false });
  const g = ctx.clock = { ...fresh(), weather: weather.current };
  const windAcc = new THREE.Vector3();
  player.tuning = () => ({
    speedMul: surv.speedMul * (surv.stamina < 1 ? 0.55 : 1), maxSlope: surv.maxSlope,
    canSprint: surv.stamina > 8, canJump: surv.stamina > 10, hasAxe: surv.gear.axe, wind: windAcc,
  });
  const altFrac = () => Math.min(1, Math.max(0, (yToAlt(player.s.pos.y) - ROUTE[0].alt) / (SUMMIT.alt - ROUTE[0].alt)));
  let focus = null, prompt = '', breathT = 0, beatT = 0, slideWarn = 0, gearKey = '';

  // ---------- checkpoints
  function snapshot() {
    save.state.expedition = { camp: g.camp, hours: g.hours, elapsed: g.elapsed, visited: [...g.visited], rests: g.rests, rescues: g.rescues,
      highest: g.highest, summited: g.summited, body: Object.fromEntries(SURV_KEYS.map(k => [k, surv[k]])), gear: { ...surv.gear } };
    save.write();
  }
  function restore(e, rescued) {
    const num = (v, d) => Number.isFinite(v) ? v : d;
    surv.reset();
    for (const k of SURV_KEYS) surv[k] = num(e.body?.[k], surv[k]);
    for (const k in surv.gear) surv.gear[k] = !!e.gear?.[k];
    Object.assign(g, fresh(), { camp: e.camp, hours: num(e.hours, 8), elapsed: num(e.elapsed, 0), visited: new Set(Array.isArray(e.visited) ? e.visited : [0]),
      rests: num(e.rests, 0), rescues: num(e.rescues, 0), highest: num(e.highest, 5364), summited: !!e.summited });
    if (rescued) {
      g.rescues++;
      Object.assign(surv, { health: Math.max(surv.health, 70), warmth: Math.max(surv.warmth, 80), stamina: 100, food: Math.max(surv.food, 50), water: Math.max(surv.water, 50) });
    }
    start(e.camp, rescued ? `Your Sherpa team brought you down to ${ROUTE[e.camp].name}. Recover, then try again.` : `Expedition resumed at ${ROUTE[e.camp].name}.`);
  }
  function spawnAt(camp) {
    const w = ROUTE[camp], p = pointAt(w.s + 5), a = pointAt(w.s + 30);
    player.teleport(p.x, p.z, Math.atan2(a.x - p.x, a.z - p.z));
  }
  function start(camp, msg) {
    spawnAt(camp);
    hazards.reset();
    for (const it of world.interactables) {
      if (it.type === 'o2') { it.used = false; it.mesh.visible = true; }
      if (it.type === 'depot') it.used = surv.gear.crampons;
    }
    g.weather = weather.current;
    flow.set('play');
    toast(msg, 'good');
  }

  // ---------- interactions
  function interactions() {
    const p = player.s.pos;
    let best = Infinity;
    focus = null; prompt = '';
    for (const it of world.interactables) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (!it.used && d < it.r && d < best) { best = d; focus = it; }
    }
    if (player.s.rope) prompt = player.s.ropeEnd ? '[E] Unclip: end of the fixed rope' : 'Clipped to the fixed rope · [E] unclip';
    else if (focus) prompt = `[E] ${focus.label}`;
    else {
      const n = world.nearestRope(p);
      if (n.d < 2.8) { focus = { type: 'rope', rope: n.rope }; prompt = surv.gear.harness ? '[E] Clip into the fixed rope' : 'Fixed rope: you need a harness from Base Camp'; }
    }
    if (player.s.sliding) prompt = surv.gear.axe ? 'Hold [Q] to self-arrest!' : 'Sliding!';
  }
  function interact() {
    if (player.s.rope) { player.trav.unclip(); sound.click(); toast('Unclipped from the fixed rope.'); return; }
    const f = focus;
    if (!f) return;
    if (f.type === 'rope' && surv.gear.harness) {
      player.trav.clip(f.rope); sound.click();
      toast('Clipped in. The jumar holds you on steep ice and against the wind.', 'good');
    } else if (f.type === 'depot') {
      for (const k in surv.gear) surv.gear[k] = true;
      surv.rations = Math.max(surv.rations, 3); surv.bottles = Math.max(surv.bottles, 3);
      f.used = true; sound.chime(); snapshot();
      toast('Gear collected: crampons, ice axe, harness with jumar, down suit. Head up into the Khumbu Icefall!', 'good');
    } else if (f.type === 'rest') rest(f.camp);
    else if (f.type === 'cache') {
      surv.rations = Math.max(surv.rations, 4); surv.bottles = Math.max(surv.bottles, 4);
      const o2 = f.camp === 8 ? 2 : f.camp === 11 ? 3 : 0; // oxygen is only stocked from Camp III up
      if (surv.tanks < o2) { if (!surv.tanks) surv.tankLevel = 1; surv.tanks = o2; }
      sound.click();
      toast(`Resupplied: rations and water${o2 ? `, oxygen (${surv.tanks} cylinders)` : ''}.`, 'good');
    } else if (f.type === 'o2') {
      surv.tanks = Math.min(4, surv.tanks + 1);
      if (surv.tankLevel <= 0) surv.tankLevel = 1;
      f.used = true; f.mesh.visible = false; sound.click();
      toast(`Picked up an oxygen cylinder (${surv.tanks} carried).`, 'good');
    }
  }

  // ---------- fades: a night in a tent, a haul out of a crevasse
  function fadeThen(ms, fn) {
    flow.set('rest'); hud.fade(true);
    setTimeout(() => { fn(); hud.fade(false); if (flow.mode === 'rest') flow.set('play'); }, ms);
  }
  function rest(i) {
    player.trav.unclip(); player.s.sitting = false;
    fadeThen(1300, () => {
      g.hours += 4; g.rests++; g.camp = i;
      surv.rest(yToAlt(player.s.pos.y));
      weather.advance(altFrac());
      snapshot();
      toast(`Rested 4 hours at ${ROUTE[i].name}. Acclimatization ${Math.round(surv.acclim * 100)}%. Forecast: ${WEATHER[weather.next].label}. Progress saved.`, 'good');
    });
  }
  function crevasseFall() {
    surv.damage(30, 'Fell into a crevasse');
    hud.flash(); sound.thud();
    if (surv.health <= 0) return die();
    player.trav.unclip();
    fadeThen(900, () => {
      const s = player.s;
      s.pos.copy(s.lastSafe); s.vel.set(0, 0, 0); s.push.set(0, 0, 0); s.grounded = true;
      toast('You fell into a crevasse! Your rope team hauled you out. Cross on the ladders.', 'warn');
    });
  }
  function die() {
    $('dead-cause').textContent = surv.cause || 'The mountain claimed you.';
    $('dead-stats').textContent = `Highest point ${fmtAlt(g.highest)} · ${fmtDuration(g.elapsed)} on the mountain`;
    flow.set('dead');
  }
  function win() {
    g.summited = true; snapshot();
    sound.chime(true);
    $('win-stats').textContent = `${fmtDuration(g.elapsed)} on the mountain · ${fmtClock(g.hours)} · ${g.rests} rests · ${g.rescues} rescues · ${Math.round(surv.acclim * 100)}% acclimatized`;
    flow.set('won');
  }

  // ---------- where you are, where to go
  function areaName(r) {
    let name = ROUTE[0].area;
    for (const w of ROUTE) {
      if (w.camp && Math.abs(r.s - w.s) < 28 && r.d < 40) return w.name;
      if (r.s >= w.s - 4) name = w.area || w.name;
    }
    return r.d > 45 ? `${name} (off route)` : name;
  }
  function goal(r) {
    if (!surv.gear.crampons) { const d = world.interactables.find(i => i.type === 'depot'); return { name: 'Gear depot', x: d.x, z: d.z, s: r.s }; }
    const w = ROUTE.find(w => w.s > r.s + 10 && (w.camp || w === SUMMIT)) || SUMMIT;
    return { name: w.name, x: w.x, z: w.z, s: w.s, alt: w.alt };
  }
  function progress(r, alt) {
    g.highest = Math.max(g.highest, alt);
    ROUTE.forEach((w, i) => {
      if (!w.camp || g.camp === i || Math.abs(r.s - w.s) > 28 || r.d > 40) return;
      const first = !g.visited.has(i);
      g.camp = i; g.visited.add(i); snapshot();
      if (first) { toast(`${w.name} reached, ${fmtAlt(w.alt)}. Checkpoint saved.`, 'good'); sound.chime(); }
    });
    if (alt > 8000 && !g.deathZone) { g.deathZone = true; toast('You have entered the Death Zone. Above 8,000 m the body cannot acclimatize.', 'danger'); }
    if (weather.current !== g.weather) {
      g.weather = weather.current;
      toast(`Weather turning: ${WEATHER[weather.current].label}`, ['blizzard', 'fog', 'windy'].includes(weather.current) ? 'warn' : 'info');
    }
    if (!g.summited && Math.hypot(player.s.pos.x - SUMMIT.x, player.s.pos.z - SUMMIT.z) < 6) win();
  }

  function update(dt, I) {
    if (I.interactPressed) interact();
    if (I.o2Pressed) { toast(surv.toggleO2()); sound.click(); }
    if (I.eatPressed) toast(surv.eat());
    if (I.drinkPressed) toast(surv.drink());
    if (I.lampPressed) { g.lamp = !g.lamp; sound.click(); }
    if (I.viewPressed) player.cam.fp = !player.cam.fp;
    if (I.helpPressed) hud.toggleHelp();
    if (I.mutePressed) toast(sound.toggleMute() ? 'Sound muted' : 'Sound on');
    if (I.pausePressed) return flow.set('pause');

    g.elapsed += dt;
    g.hours += dt / 60;
    const s = player.s, p = s.pos, alt = yToAlt(p.y), r = routeAt(p.x, p.z), area = areaName(r);
    windAcc.copy(weather.windDir).multiplyScalar(Math.max(0, weather.speed - 12) * 0.12);
    for (const e of player.events) { // this frame's events (player.update runs before the systems)
      if (e === 'step') sound.step(surv.gear.crampons, s.surface === 'ladder');
      else if (e === 'jump') surv.stamina = Math.max(0, surv.stamina - 10);
      else if (e === 'crevasse') return crevasseFall();
      else if (e[0] === 'land' && e[1] > 12) { surv.damage((e[1] - 12) * 5, `A fatal fall on the ${area}`); hud.flash(); sound.thud(); }
    }
    if (s.slideSpeed > 12) surv.damage((s.slideSpeed - 12) * 3 * dt, `An uncontrolled slide down the ${area}`);
    if (s.sliding && (slideWarn -= dt) <= 0) {
      slideWarn = 8;
      toast(surv.gear.axe ? 'Too steep! Hold Q to self-arrest, or clip into a fixed rope.' : 'Too steep without crampons and an ice axe!', 'warn');
    }

    const msgs = surv.update(dt, { alt, airTemp: weather.airTemp(alt, lighting.day), wind: weather.speed, moving: s.moving && s.grounded, sprinting: s.sprinting,
      climbing: !!s.rope && s.moving, uphill: s.uphill, sitting: s.sitting, arresting: s.arresting });
    for (const m of msgs) toast(m, 'warn');
    hazards.update(dt, player, surv, r.s, weather.p.snow);

    sound.update({ wind: weather.speed, rumble: hazards.rumble, hiss: surv.o2On, t: g.elapsed });
    const strain = Math.min(1, Math.max(0, (85 - surv.spo2) / 40 + (s.sprinting ? 0.4 : 0) + (1 - surv.stamina / 100) * 0.3));
    if ((breathT -= dt) <= 0) { breathT = 3.6 - strain * 2.6; sound.breath(strain); }
    if (surv.health < 30 && (beatT -= dt) <= 0) { beatT = 0.4 + surv.health / 40; sound.heartbeat(); }
    if (r.s > hazards.icefall[0] && r.s < hazards.icefall[1] && Math.random() < dt / 20) sound.crack(0.15); // the icefall creaks and groans

    // what the climber looks like right now
    player.lamp.intensity = g.lamp ? 4 : 0;
    const key = `${surv.gear.axe}${surv.gear.crampons}${surv.gear.harness}${surv.o2On}${g.lamp}`;
    if (key !== gearKey) { gearKey = key; player.setGear({ ...surv.gear, mask: surv.o2On, lamp: g.lamp }); }
    player.anim.tired = Math.min(1, Math.max(0, (30 - surv.stamina) / 25, (55 - surv.spo2) / 20));

    progress(r, alt);
    if (flow.mode !== 'play') return;
    interactions();
    const gl = goal(r);
    markers.beacon(gl.x, ctx.world.groundAt(gl.x, gl.z).h, gl.z, Math.hypot(gl.x - p.x, gl.z - p.z));
    if (surv.health <= 0) die();
  }

  function info() {
    const p = player.s.pos, alt = yToAlt(p.y), r = routeAt(p.x, p.z), air = weather.airTemp(alt, lighting.day), vis = weather.visibility * UNIT_M;
    const gl = goal(r), aim = pointAt(r.d > 30 ? r.s : r.s + 25); // steer back to the trail, else along it
    const objective = !surv.gear.crampons ? 'Collect your climbing gear at the Base Camp depot'
      : alt > 7900 && surv.tanks && !surv.o2On ? 'Death zone: press O to breathe bottled oxygen'
      : gl.name === SUMMIT.name ? 'Summit push: reach the top of the world, 8,849 m' : `Climb to ${gl.name} (${fmtAlt(gl.alt)})`;
    const dist = gl.alt ? Math.max(0, gl.s - r.s) : Math.hypot(gl.x - p.x, gl.z - p.z);
    return {
      s: surv, loc: areaName(r), alt, time: fmtClock(g.hours), weather: WEATHER[weather.current].label, temp: air, feels: air - weather.speed * 0.6,
      wind: weather.speed, vis: vis > 5000 ? '> 5 km' : fmtDist(vis), progress: r.s / PATH_LEN, objective, objDist: fmtDist(dist * UNIT_M),
      goal: gl, aim, prompt,
    };
  }

  return {
    surv, g, update, info, spawnAt, altFrac,
    get hasSave() { return !!ROUTE[save.state.expedition?.camp]?.camp; },
    newGame() { surv.reset(); Object.assign(g, fresh()); start(0, 'Welcome to Everest Base Camp, 5,364 m. Collect your climbing gear at the depot (blue crate).'); snapshot(); },
    continueGame() { restore(save.state.expedition, false); },
    retry() { this.hasSave ? restore(save.state.expedition, true) : this.newGame(); },
    toTitle() { flow.set('menu'); },
  };
}
