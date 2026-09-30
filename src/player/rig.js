import * as THREE from 'three';

// createClimber() -> rig
//   rig.object                      root at the feet, faces +Z (rotate .rotation.y = heading)
//   rig.update(dt, anim, time)      procedural pose for anim.mode/sub (contract written by traversal.js), blended per joint
//   rig.setGear({axe, crampons, harness, mask, lamp}), rig.setBodyVisible(b), rig.head (joint the headlamp hangs on)
// Joint conventions (character space, X = left): limbs hang along -Y, so rotation.x < 0 swings a limb forward;
// knees flex with +x, elbows with -x; the spine leans forward with +x. rotation.z > 0 raises the LEFT arm sideways.
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'ankleL', 'legR', 'kneeR', 'ankleR'];
const M = (color, roughness = 0.75, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));

export function createClimber() {
  const mat = {
    suit: M(0xd8321c, 0.8), pants: M(0x1d2433), boot: M(0xf2b705, 0.55), helmet: M(0xf4f4f0, 0.35), glove: M(0x15181d), pack: M(0x1b3f73),
    dark: M(0x202328, 0.9), lens: M(0xff8a2b, 0.15, 0.8), steel: M(0xb8bcc2, 0.3, 0.9), bottle: M(0xf26b0f, 0.4, 0.4), harness: M(0xe8c21a, 0.6),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff4d6, emissiveIntensity: 0 }),
  };
  const object = new THREE.Group(), body = new THREE.Group(); // body pitches about the feet for slides and self-arrest
  object.add(body);
  const J = {}, meshes = [];
  const joint = (name, parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); (J[parent] || parent).add(j); J[name] = j; };
  const part = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true;
    J[parent].add(mesh); meshes.push(mesh); return mesh;
  };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 12);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

  joint('hips', body, 0, 0.98, 0);
  part('hips', cap(0.15, 0.34).rotateZ(Math.PI / 2), mat.pants, 0, -0.02, 0);
  const harness = part('hips', new THREE.TorusGeometry(0.17, 0.025, 6, 18).rotateX(Math.PI / 2), mat.harness, 0, 0.03, 0);
  joint('spine', 'hips', 0, 0.06, 0);
  part('spine', cap(0.2, 0.42).translate(0, 0.2, 0), mat.suit).scale.set(1.2, 1, 0.9); // puffy down suit
  joint('chest', 'spine', 0, 0.3, 0);
  part('chest', cap(0.21, 0.34).translate(0, 0.08, 0), mat.suit).scale.set(1.25, 1, 0.95);
  part('chest', box(0.38, 0.55, 0.24), mat.pack, 0, 0.02, -0.25);
  part('chest', new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), mat.bottle, 0.12, 0.1, -0.4);
  joint('neck', 'chest', 0, 0.25, 0);
  joint('head', 'neck', 0, 0.07, 0);
  part('head', new THREE.SphereGeometry(0.12, 14, 10), mat.dark, 0, 0.06, 0);                        // balaclava
  part('head', new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.helmet, 0, 0.09, -0.005);
  part('head', box(0.2, 0.065, 0.06), mat.lens, 0, 0.075, 0.1);                                      // goggles
  const mask = part('head', box(0.09, 0.08, 0.07), mat.dark, 0, 0.005, 0.11);                         // oxygen mask
  part('head', box(0.05, 0.035, 0.04), mat.lamp, 0, 0.16, 0.115);                                     // headlamp
  for (const [S, sx] of [['L', 1], ['R', -1]]) {
    joint('arm' + S, 'chest', 0.25 * sx, 0.17, 0);
    part('arm' + S, cap(0.075, 0.32).translate(0, -0.15, 0), mat.suit);
    joint('elbow' + S, 'arm' + S, 0, -0.3, 0);
    part('elbow' + S, cap(0.065, 0.28).translate(0, -0.13, 0), mat.suit);
    part('elbow' + S, box(0.085, 0.11, 0.09), mat.glove, 0, -0.3, 0);
    joint('leg' + S, 'hips', 0.1 * sx, -0.04, 0);
    part('leg' + S, cap(0.1, 0.46).translate(0, -0.22, 0), mat.pants);
    joint('knee' + S, 'leg' + S, 0, -0.44, 0);
    part('knee' + S, cap(0.085, 0.45).translate(0, -0.21, 0), mat.pants);
    joint('ankle' + S, 'knee' + S, 0, -0.43, 0);
    part('ankle' + S, box(0.14, 0.13, 0.3), mat.boot, 0, -0.005, 0.05);
  }
  const crampons = ['L', 'R'].map(S => part('ankle' + S, box(0.12, 0.025, 0.28), mat.steel, 0, -0.075, 0.05));
  // ice axe held like a cane: head in the right fist, spike down
  const axe = new THREE.Group();
  axe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.62, 6).translate(0, -0.31, 0), mat.dark), new THREE.Mesh(box(0.025, 0.035, 0.3), mat.steel));
  axe.position.set(0, -0.3, 0.02);
  axe.children.forEach(m => { m.castShadow = true; meshes.push(m); });
  J.elbowR.add(axe);

  // ---- pose targets
  const T = {}; for (const j of JOINTS) T[j] = [0, 0, 0];
  let hipsY = 0, pitch = 0, rate = 10;
  const set = (j, x, y = 0, z = 0) => { const t = T[j]; t[0] = x; t[1] = y; t[2] = z; };
  const leg = (S, hip, knee, ankle, spread = 0) => { set('leg' + S, hip, 0, S === 'L' ? spread : -spread); set('knee' + S, knee); set('ankle' + S, ankle); };
  const arm = (S, sh, out, elbow) => { set('arm' + S, sh, 0, S === 'L' ? out : -out); set('elbow' + S, elbow); };
  const flatFoot = (hip, knee) => -(hip + knee) * 0.85;

  function pose(a, time) {
    for (const j of JOINTS) T[j].fill(0);
    hipsY = 0; pitch = 0; rate = 10;
    const s = Math.sin(a.phase), c = Math.cos(a.phase), breath = Math.sin(time * (1.6 + a.tired * 2.6));
    switch (a.mode === 'land' ? 'land' : a.sub) {
      case 'walk': case 'run': case 'ladderWalk': {
        const run = a.sub === 'run' ? 1 : 0, ladder = a.sub === 'ladderWalk', up = Math.min(1, Math.max(0, a.uphill));
        const A = ladder ? 0.28 : 0.42 + run * 0.35, K = 0.55 + run * 0.45 + up * 0.5;
        const hL = -s * A - up * 0.2, kL = 0.1 + K * Math.max(0, c), hR = s * A - up * 0.2, kR = 0.1 + K * Math.max(0, -c);
        leg('L', hL, kL, flatFoot(hL, kL), 0.02); leg('R', hR, kR, flatFoot(hR, kR), 0.02);
        if (ladder) { arm('L', -0.25, 1.0, -0.3); arm('R', -0.25, 1.0, -0.3); set('neck', 0.35); set('spine', 0.1); }
        else {
          arm('L', s * A * 0.8, 0.12, -0.25 - run * 0.7); arm('R', -s * A * 0.5 - 0.1, 0.1, -0.35 - run * 0.6);
          set('spine', 0.08 + run * 0.2 + up * 0.35); set('chest', 0, -s * 0.12); set('hips', 0, s * 0.1);
        }
        hipsY = -0.045 * Math.abs(s) - run * 0.04 - up * 0.04;
        rate = 22;
        break;
      }
      case 'ropeClimb': case 'ropeIdle': { // jumaring: left fist pushes the ascender up the rope, high steps into the slope
        const k = a.sub === 'ropeClimb' ? 1 : 0.2, pL = Math.max(0, s) * k, pR = Math.max(0, -s) * k;
        arm('L', -2.3 - 0.3 * s * k, 0.12, -0.5 - 0.4 * Math.max(0, c) * k);
        arm('R', -1.0 + 0.3 * s * k, 0.2, -0.9);
        leg('L', -0.35 - 0.6 * pL, 0.35 + 0.9 * pL, flatFoot(-0.35 - 0.6 * pL, 0.35 + 0.9 * pL) - 0.2, 0.04);
        leg('R', -0.35 - 0.6 * pR, 0.35 + 0.9 * pR, flatFoot(-0.35 - 0.6 * pR, 0.35 + 0.9 * pR) - 0.2, 0.04);
        set('spine', 0.38 + breath * 0.02); set('neck', -0.35); hipsY = -0.1;
        rate = 16;
        break;
      }
      case 'slide': // glissade: sitting back, feet first, arms braking
        pitch = -0.3; hipsY = -0.5;
        leg('L', -1.35, 0.25, 0.3, 0.14); leg('R', -1.35, 0.25, 0.3, 0.14);
        set('spine', -0.15); arm('L', 0.7, 0.5, -0.2); arm('R', 0.7, 0.5, -0.2);
        rate = 8;
        break;
      case 'arrest': // face down into the slope, axe pick driven in above the head
        pitch = 1.2; hipsY = -0.12;
        leg('L', 0.05, 0.2, 0.2, 0.14); leg('R', 0.05, 0.2, 0.2, 0.14);
        arm('L', -2.8, 0.25, -0.4); arm('R', -2.8, 0.12, -0.5); set('neck', -0.7);
        rate = 7;
        break;
      case 'jump':
        leg('L', -0.7, 1.0, -0.3); leg('R', -0.25, 0.55, -0.2);
        arm('L', -0.7, 0.35, -0.5); arm('R', -0.5, 0.35, -0.6); set('spine', 0.12);
        rate = 12;
        break;
      case 'fall': {
        const f = time * 9;
        leg('L', -0.5 + 0.3 * Math.sin(f), 0.7, -0.2, 0.15); leg('R', -0.4 - 0.3 * Math.sin(f), 0.6, -0.2, 0.15);
        arm('L', -0.6 + 0.5 * Math.sin(f * 1.3), 1.4, -0.4); arm('R', -0.6 + 0.5 * Math.sin(f * 1.3 + 1), 1.4, -0.4);
        rate = 8;
        break;
      }
      case 'sit':
        hipsY = -0.58;
        leg('L', -1.45, 1.35, 0.1, 0.12); leg('R', -1.45, 1.35, 0.1, 0.12);
        set('spine', 0.28 + breath * 0.02); arm('L', -0.95, 0.05, -0.55); arm('R', -0.95, 0.05, -0.55); set('neck', 0.15);
        rate = 5;
        break;
      case 'land': {
        const v = a.landSev, h = -0.5 - 0.5 * v, k = 0.9 + 0.8 * v;
        hipsY = -0.12 - 0.25 * v;
        leg('L', h, k, flatFoot(h, k), 0.06); leg('R', h, k, flatFoot(h, k), 0.06);
        set('spine', 0.3 + 0.3 * v); arm('L', -0.5, 0.3, -0.5); arm('R', -0.5, 0.3, -0.5);
        rate = 18;
        break;
      }
      default: { // idle; when exhausted, hands on knees gasping for air
        const g = a.tired, h = -g * 0.35, k = g * 0.45;
        set('spine', 0.04 + breath * 0.02 + g * 0.7); set('chest', breath * 0.03 * (1 + g * 2));
        arm('L', 0.05 - g * 0.8, 0.14, -0.2 - g * 0.3); arm('R', 0.1 - g * 0.8, 0.12, -0.35 - g * 0.2);
        leg('L', h, k, flatFoot(h, k), 0.05); leg('R', h, k, flatFoot(h, k), 0.05);
        hipsY = -g * 0.08; set('neck', -g * 0.5);
        if (a.sub === 'ladderIdle') { arm('L', -0.2, 1.0, -0.3); arm('R', -0.2, 1.0, -0.3); set('neck', 0.35); }
        rate = 5;
      }
    }
    T.head[0] += a.lookPitch; // the head (and headlamp) follows where you look
  }

  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const rig = { object, head: J.head };
  rig.update = (dt, a, time) => {
    pose(a, time);
    const k = 1 - Math.exp(-rate * dt);
    for (const j of JOINTS) { const t = T[j]; J[j].quaternion.slerp(q.setFromEuler(e.set(t[0], t[1], t[2])), k); }
    J.hips.position.y = damp(J.hips.position.y, 0.98 + hipsY, rate, dt);
    body.rotation.x = damp(body.rotation.x, pitch, rate, dt);
  };
  // a mesh shows when the body is shown (not first person) and its gear is carried (userData.on)
  let shown = true;
  const refresh = () => { for (const m of meshes) m.visible = shown && m.userData.on !== false; };
  rig.setGear = g => {
    for (const m of axe.children) m.userData.on = !!g.axe;
    for (const c of crampons) c.userData.on = !!g.crampons;
    harness.userData.on = !!g.harness; mask.userData.on = !!g.mask;
    mat.lamp.emissiveIntensity = g.lamp ? 1.2 : 0;
    refresh();
  };
  // first person hides only the meshes: the headlamp light hangs under the head joint and must keep shining
  rig.setBodyVisible = v => { if (v !== shown) { shown = v; refresh(); } };
  rig.setGear({});
  return rig;
}
