import { ROUTE, PATH_LEN, pointAt } from './world/terrain.js';
import { WEATHER } from './world/weather.js';

// Deterministic compositions for screenshots and the loading-screen stills: ?shot=<name> (add &hud=0 for a clean frame).
//   s: distance along the route (or a function of the world), side: offset from the trail (+ left), hour, weather,
//   sub: animation sub-state (walking poses advance their gait), yaw: camera angle relative to the climber's heading
//   (0 = behind), pitch/dist: camera, rope: clip into the nearest fixed rope, lamp: headlamp on, fp: first person.
export const SHOTS = {
  basecamp: { s: 16, side: -1, hour: 10.5, sub: 'idle', yaw: 2.5, pitch: 0.08, dist: 5 },
  icefall: { s: () => ROUTE[2].s - 34, hour: 9.2, sub: 'walk', yaw: 0.55, pitch: 0.14, dist: 5.2 },
  ladder: { s: w => w.crevS[1] - 1.2, hour: 11, sub: 'ladderWalk', yaw: 2.3, pitch: 0.28, dist: 4.4 },
  cwm: { s: () => ROUTE[5].s - 40, hour: 13.5, sub: 'walk', yaw: 0.35, pitch: 0.1, dist: 5.5 },
  lhotse: { s: () => ROUTE[8].s - 40, hour: 15.6, sub: 'ropeClimb', rope: true, yaw: 1.9, pitch: 0.2, dist: 5 },
  ridge: { s: () => ROUTE[13].s - 18, hour: 6.25, sub: 'ropeClimb', rope: true, yaw: 0.25, pitch: 0.06, dist: 5.5 },
  summit: { s: () => PATH_LEN - 1, hour: 8.5, sub: 'idle', yaw: 3.0, pitch: 0.1, dist: 5 },
  night: { s: () => ROUTE[12].s + 25, hour: 1.5, sub: 'ropeClimb', rope: true, lamp: true, yaw: 0.2, pitch: 0.15, dist: 4.5 },
  blizzard: { s: () => ROUTE[5].s, hour: 12, weather: 'blizzard', sub: 'walk', yaw: 0.4, pitch: 0.12, dist: 4.8 },
  fp: { s: () => ROUTE[1].s + 20, hour: 10, sub: 'walk', fp: true, pitch: 0.05 },
  nightfp: { s: () => ROUTE[12].s + 25, hour: 1.5, sub: 'ropeClimb', rope: true, lamp: true, fp: true, pitch: 0.25 },
};

// applyShot(ctx, name) -> {tick(dt)}: poses the climber, camera, time and weather; tick animates the pose in place.
export function applyShot(ctx, name) {
  const sh = SHOTS[name];
  if (!sh) throw new Error('unknown shot ' + name);
  const { player, world, weather, clock } = ctx;
  const s = typeof sh.s === 'function' ? sh.s(world) : sh.s, p = pointAt(s), a = pointAt(s + 6);
  const x = p.x - p.tz * (sh.side || 0), z = p.z + p.tx * (sh.side || 0), heading = Math.atan2(a.x - p.x, a.z - p.z);
  clock.hours = sh.hour;
  weather.current = sh.weather || 'clear';
  Object.assign(weather.p, WEATHER[weather.current]);
  player.teleport(x, z, heading);
  if (sh.rope) player.trav.clip(world.nearestRope(player.s.pos).rope);
  player.setGear({ axe: true, crampons: true, harness: true, lamp: sh.lamp, mask: s > ROUTE[11].s });
  for (const k in ctx.sys.expedition.surv.gear) ctx.sys.expedition.surv.gear[k] = true; // HUD shows the climb, not the depot
  player.lamp.intensity = sh.lamp ? 4 : 0;
  const cam = player.cam;
  cam.fp = !!sh.fp;
  cam.yaw = heading + (sh.yaw || 0); cam.pitch = sh.pitch ?? 0.15; cam.dist = sh.dist || cam.dist; cam.collDist = cam.dist;
  const anim = player.anim;
  Object.assign(anim, { mode: sh.sub.startsWith('rope') ? 'rope' : sh.sub.startsWith('ladder') ? 'ladder' : 'ground', sub: sh.sub, uphill: 0, tired: 0 });
  const moving = /walk|Climb/.test(sh.sub);
  return {
    tick(dt) {
      if (moving) anim.phase += dt * 5;
      player.animate(dt);
    },
  };
}
