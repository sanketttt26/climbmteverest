// Quality presets: ?q=low|med|high, else the saved setting, else high.
//   cascades: 1 = one shadow light around the climber; >1 = cascaded shadow maps with the terrain casting (mountain shadows)
const PRESETS = {
  low: { name: 'low', pixelRatio: 1, cascades: 1, shadowMapSize: 1024, shadowFar: 0, ao: false, bloom: false, smaa: false, snow: 3500 },
  med: { name: 'med', pixelRatio: 1.25, cascades: 3, shadowMapSize: 1024, shadowFar: 500, ao: true, aoHalfRes: true, aoQuality: 'Low', bloom: true, smaa: true, snow: 5500 },
  high: { name: 'high', pixelRatio: 1.5, cascades: 4, shadowMapSize: 2048, shadowFar: 700, ao: true, aoHalfRes: false, aoQuality: 'Medium', bloom: true, smaa: true, snow: 7000 },
};

export const SAVE_KEY = 'everest.save.v2';

let q = null;
export function getQuality() {
  if (q) return q;
  let name = new URLSearchParams(location.search).get('q');
  if (!PRESETS[name]) {
    try { name = JSON.parse(localStorage.getItem(SAVE_KEY))?.settings?.quality; } catch { /* storage blocked */ }
  }
  q = { ...PRESETS[PRESETS[name] ? name : 'high'] };
  return q;
}
