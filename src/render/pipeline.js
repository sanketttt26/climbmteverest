import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

// createPipeline({renderer, scene, camera, Q}) -> { render(dt), setSize(w, h) }
// scene (HDR) -> ambient occlusion (N8AO) -> bloom -> ACES tone mapping -> vignette -> SMAA -> screen
export function createPipeline({ renderer, scene, camera, Q }) {
  renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the effect pass
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  if (Q.ao) {
    const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    ao.setQualityMode(Q.aoQuality);
    Object.assign(ao.configuration, { aoRadius: 1.6, distanceFalloff: 1, intensity: 2.2, halfRes: Q.aoHalfRes, gammaCorrection: false, color: new THREE.Color(0x10192a) });
    composer.addPass(ao);
  }
  const effects = [];
  if (Q.bloom) effects.push(new BloomEffect({ intensity: 0.5, luminanceThreshold: 0.85, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 }));
  effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), new VignetteEffect({ offset: 0.32, darkness: 0.5 }));
  composer.addPass(new EffectPass(camera, ...effects));
  if (Q.smaa) composer.addPass(new EffectPass(camera, new SMAAEffect())); // after tone mapping, on display-range colours
  return {
    render: dt => composer.render(dt),
    setSize: (w, h) => composer.setSize(w, h),
  };
}
