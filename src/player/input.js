// createInput(el) -> { poll(dt) -> state, press(code), release(code), releaseAll() }
// Keyboard + mouse (pointer lock, or drag to look without it) + Gamepad API, sampled once per frame.
// state: move {x right, y forward} -1..1, look {dx, dy} (pixel-equivalent), held actions, and for each action
// <name>Pressed on the frame it went down (taps between frames are latched so they are never lost).
// press()/release() inject synthetic keys for automated playtests.
const ACTIONS = {
  sprint: ['ShiftLeft', 'ShiftRight'], jump: ['Space'], arrest: ['KeyQ'], interact: ['KeyE'], o2: ['KeyO'], eat: ['Digit1'], drink: ['Digit2'],
  lamp: ['KeyL'], view: ['KeyV'], sit: ['KeyC'], help: ['KeyH'], mute: ['KeyM'], pause: ['Escape', 'KeyP'],
};
// standard-mapping gamepad buttons per action
const PAD = { jump: [0], sit: [1], interact: [2], o2: [3], eat: [4], drink: [5], arrest: [6], sprint: [7], view: [8], pause: [9], lamp: [12], help: [13] };

export function createInput(el) {
  const keys = new Set(), tapped = new Set(), synthetic = new Set(), prev = {};
  const mouse = { dx: 0, dy: 0, down: false };
  addEventListener('keydown', e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
    if (!e.repeat) tapped.add(e.code);
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  el.addEventListener('mousedown', () => { mouse.down = true; });
  addEventListener('mouseup', () => { mouse.down = false; });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement === el || mouse.down) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });

  const has = c => keys.has(c) || tapped.has(c) || synthetic.has(c);
  const dz = v => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
  const state = { move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, usingPad: false };

  function poll(dt = 1 / 60) {
    let mx = (has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0);
    let my = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
    let lx = mouse.dx, ly = mouse.dy;
    mouse.dx = mouse.dy = 0;
    const held = {};
    for (const [a, codes] of Object.entries(ACTIONS)) held[a] = codes.some(has);
    state.usingPad = false;
    for (const p of navigator.getGamepads?.() || []) {
      if (!p || p.mapping !== 'standard') continue;
      const ax = dz(p.axes[0]), ay = dz(p.axes[1]), rx = dz(p.axes[2]), ry = dz(p.axes[3]);
      mx += ax; my -= ay; lx += rx * 900 * dt; ly += ry * 600 * dt;
      for (const [a, btns] of Object.entries(PAD)) if (btns.some(b => p.buttons[b]?.value > 0.3)) held[a] = true;
      if (ax || ay || rx || ry || p.buttons.some(b => b.pressed)) state.usingPad = true;
    }
    tapped.clear();
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    state.move.x = mx; state.move.y = my; state.look.dx = lx; state.look.dy = ly;
    for (const a in held) { state[a] = held[a]; state[a + 'Pressed'] = held[a] && !prev[a]; prev[a] = held[a]; }
    return state;
  }

  return { poll, state, keys, press: c => { synthetic.add(c); tapped.add(c); }, release: c => synthetic.delete(c), releaseAll: () => synthetic.clear() };
}
