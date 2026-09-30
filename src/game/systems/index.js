import { on } from './events.js';
import { createSave } from './save.js';
import { createFlow } from './flow.js';
import { Sound } from './audio.js';
import { Hazards } from './hazards.js';
import { createMarkers } from './markers.js';
import { createExpedition } from './expedition.js';
import { createMenus } from '../../ui/menus.js';

// initSystems(ctx) -> sys. Called once from main.js. Pushes one {update(dt, I)} into ctx.systems (run only while playing)
// and sets ctx.flow / ctx.sys. Handy from devtools: __ctx.sys.expedition.surv, __ctx.player.s.pos
export function initSystems(ctx) {
  const save = createSave();
  const flow = ctx.flow = createFlow(ctx);
  const sound = new Sound();
  const hazards = new Hazards(ctx.scene, sound, ctx.hud);
  ctx.lighting.setupMaterial(hazards.iceMat);
  const markers = createMarkers(ctx.scene);
  const expedition = createExpedition(ctx, { save, flow, sound, hazards, markers });
  createMenus(ctx, { save, flow, expedition, sound });
  on('toast', ({ msg, kind }) => ctx.hud.toast(msg, kind));
  on('mode', m => { if (m === 'play') sound.init(); }); // audio may only start from a user gesture: the button that began play
  ctx.systems.push({ update: (dt, I) => expedition.update(dt, I) });
  return ctx.sys = { save, flow, sound, hazards, markers, expedition };
}
