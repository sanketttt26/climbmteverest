import { on } from '../game/systems/events.js';

const $ = id => document.getElementById(id);

// Title, pause, settings, death and summit screens. Settings apply live and persist; graphics quality reloads.
export function createMenus(ctx, { save, flow, expedition, sound }) {
  const st = save.state.settings, form = $('settings-form'), cam = ctx.player.cam;
  const apply = () => { cam.sens = st.sensitivity; cam.invertY = st.invertY; cam.baseFov = st.fov; sound.setVolume(st.volume); };
  form.quality.value = st.quality; form.sensitivity.value = st.sensitivity; form.fov.value = st.fov; form.volume.value = st.volume; form.invertY.checked = st.invertY;
  form.addEventListener('input', e => {
    if (e.target.name === 'quality') return;
    Object.assign(st, { sensitivity: +form.sensitivity.value, fov: +form.fov.value, volume: +form.volume.value, invertY: form.invertY.checked });
    apply(); save.write();
  });
  form.quality.addEventListener('change', () => {
    st.quality = form.quality.value; save.write();
    const u = new URL(location.href); u.searchParams.delete('q'); location.replace(u);
  });
  form.addEventListener('submit', e => e.preventDefault());

  for (const b of document.querySelectorAll('[data-open="settings"]')) b.onclick = () => flow.set('settings');
  $('btn-settings-back').onclick = () => flow.set(flow.prev);
  $('btn-new').onclick = () => expedition.newGame();
  $('btn-continue').onclick = () => expedition.continueGame();
  $('btn-resume').onclick = () => flow.set('play');
  $('btn-title').onclick = () => expedition.toTitle();
  $('btn-retry').onclick = () => expedition.retry();
  $('btn-restart').onclick = () => expedition.newGame();
  $('btn-explore').onclick = () => flow.set('play');
  on('mode', m => { if (m === 'menu') $('btn-continue').hidden = !expedition.hasSave; });
  apply();
}
