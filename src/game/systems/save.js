import { SAVE_KEY } from '../../render/quality.js';

export const DEFAULT_SETTINGS = { quality: 'high', sensitivity: 1, invertY: false, fov: 60, volume: 0.8 };
const RANGES = { sensitivity: [0.3, 2.5], fov: [50, 85], volume: [0, 1] };

// createSave() -> { state: {v, expedition, settings}, persistent, write() }
// One JSON blob in localStorage. ?shot= and ?playtest= runs keep it in memory only, so they never touch a real save.
export function createSave() {
  const q = new URLSearchParams(location.search);
  const persistent = !q.has('shot') && !q.has('playtest');
  const state = { v: 2, expedition: null, settings: { ...DEFAULT_SETTINGS } };
  if (persistent) {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s?.v === 2) { state.expedition = s.expedition || null; Object.assign(state.settings, s.settings); }
    } catch { /* corrupt or blocked storage: start fresh */ }
  }
  // stored values are untrusted: coerce them back into range
  const st = state.settings;
  for (const [k, [lo, hi]] of Object.entries(RANGES)) st[k] = Number.isFinite(+st[k]) ? Math.min(hi, Math.max(lo, +st[k])) : DEFAULT_SETTINGS[k];
  st.invertY = !!st.invertY;
  if (!['low', 'med', 'high'].includes(st.quality)) st.quality = DEFAULT_SETTINGS.quality;
  return {
    state, persistent,
    write() { if (persistent) try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* play on without saves */ } },
  };
}
