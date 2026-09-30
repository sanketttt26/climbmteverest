import * as THREE from 'three';

// createMarkers(scene) -> { beacon(x, y, z, dist) }
// A tall additive light pillar over the next objective, visible through cloud so you can steer by it in a whiteout.
// It fades out as you arrive.
export function createMarkers(scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(0xff8a3d) }, uOpacity: { value: 0 } },
    vertexShader: 'varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vY; void main() { float k = 1.0 - vY; gl_FragColor = vec4(uColor * 2.0, uOpacity * k * k); }',
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 16, 1, true).translate(0, 0.5, 0), mat);
  beam.scale.y = 320; beam.frustumCulled = false;
  scene.add(beam);
  return {
    beacon(x, y, z, dist) {
      beam.position.set(x, y, z);
      mat.uniforms.uOpacity.value = 0.45 * THREE.MathUtils.smoothstep(dist, 25, 90);
      beam.visible = mat.uniforms.uOpacity.value > 0.001;
    },
  };
}
