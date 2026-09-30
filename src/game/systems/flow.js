import { emit } from './events.js';

// Screens shown per mode; the HUD shows in the rest. Menus release the mouse, play captures it.
const SCREEN = { menu: 'menu', pause: 'pause', settings: 'settings', dead: 'dead', won: 'win' };

// createFlow(ctx) -> { mode, prev, set(mode) }
// Modes: menu | play | pause | settings | rest (fading in a tent / out of a crevasse) | dead | won | shot (?shot= capture).
// main.js only simulates in 'play'. Losing pointer lock while playing (Esc) pauses.
export function createFlow(ctx) {
  const canvas = ctx.renderer.domElement;
  const flow = { mode: 'boot', prev: 'menu' };
  let hadLock = false;
  const lock = () => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* retried on the next click */ } };

  flow.set = m => {
    if (m === flow.mode) return;
    flow.prev = flow.mode; flow.mode = m;
    for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== SCREEN[m];
    ctx.hud.setVisible(!SCREEN[m] && (m !== 'shot' || new URLSearchParams(location.search).get('hud') !== '0'));
    if (m === 'play') lock();
    else if (SCREEN[m] && document.pointerLockElement) document.exitPointerLock();
    emit('mode', m);
  };
  canvas.addEventListener('click', () => { if (flow.mode === 'play' && document.pointerLockElement !== canvas) lock(); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) hadLock = true;
    else if (flow.mode === 'play' && hadLock) { hadLock = false; flow.set('pause'); }
  });
  return flow;
}
