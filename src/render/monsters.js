/* ═══════════════════════════ Monsters ═══════════════════════════
   One entry per species. Each builds its model on the parts all monsters share (monsterBase) and
   returns them with what sets the species apart, which the scene uses without asking which it is:
     hover(t)                  height of the monster above the floor
     animate(e, t, dt, awake)  poses it for this frame from its game state e, and returns how
                               brightly it glows (about 0..3), for its light and its floor glow
     attack()                  plays its attack: the watcher spits, the seeker bites
     debris                    the particle bursts it dies in */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MONSTERS } from "../game/index.js";
import { FIRE, EMBER, TOXIC, hdr, additive, approach } from "./common.js";

export const SPECIES = { watcher: makeWatcher, seeker: makeSeeker };

/* A placement: position, then rotation as Euler angles or a quaternion. */
const pose = (pos, rot = [0, 0, 0]) => new THREE.Matrix4().compose(new THREE.Vector3(...pos),
  rot.isQuaternion ? rot : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));

/* Copies of one small part (spikes, a row of teeth) baked into a single geometry: one draw call
   for all of them rather than one each. */
const merged = (geo, poses) => mergeGeometries(poses.map(m => geo.clone().applyMatrix4(m)));

/* Parts shared by every monster: a group that moves, a body that faces the robot, a white flash
   shell for hits and a glow on the floor. Its light comes from the pool (see glowLights).
   `scene` is the World3D. */
function monsterBase(scene, radius, color) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), additive({ color: hdr(0xffd6c8, 2), opacity: 0 }));
  flash.visible = false;
  body.add(flash);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40).rotateX(-Math.PI / 2),
    additive({ map: scene.glow, color: hdr(color, 0.8), opacity: 0.5 }));
  return { g, body, flash, pool, lightColor: color, lightLevel: 0,
           yaw: Math.random() * 6, idleYaw: Math.random() * 6, phase: Math.random() * 6, hit: 0, kick: 0 };
}

/* Watcher: a floating demonic eye with horns, a fanged mouth and glowing veins. Asleep, its
   eyelid is shut; awake, it stares at the robot, and its mouth opens and glows as it charges. */
function makeWatcher(scene) {
  const R = 0.27, v = monsterBase(scene, R * 1.05, 0xff5a2a), body = v.body;
  const skin = new THREE.MeshStandardMaterial({ map: scene.tex.skin, emissiveMap: scene.tex.veins, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6, metalness: 0.05 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd9ccae, roughness: 0.5, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c0508, roughness: 0.4, metalness: 0.2 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), skin);
  shell.scale.set(1, 0.92, 0.95);
  shell.castShadow = true;
  body.add(shell);

  // Horns and spikes stand on the hide, pointing outward.
  const up = new THREE.Vector3(0, 1, 0);
  const planted = (dir, lift) => {
    const n = new THREE.Vector3(...dir).normalize();
    return pose(n.clone().multiplyScalar(R * 0.9 + lift).toArray(), new THREE.Quaternion().setFromUnitVectors(up, n));
  };
  const spikes = [[0, 1, -0.35], [0.7, 0.45, -0.5], [-0.7, 0.45, -0.5], [0.95, 0, -0.2], [-0.95, 0, -0.2],
                  [0, 0.35, -0.95], [0.5, -0.45, -0.75], [-0.5, -0.45, -0.75], [0, -1, -0.2]];
  body.add(new THREE.Mesh(merged(new THREE.ConeGeometry(0.034, 0.2, 14), [-1, 1].map(side => planted([side * 0.55, 0.8, 0.1], 0.08))), bone),
           new THREE.Mesh(merged(new THREE.ConeGeometry(0.02, 0.085, 10), spikes.map(d => planted(d, 0.03))), dark));

  const eye = new THREE.Group();
  eye.position.set(0, 0.045, R * 0.78);
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xe6dcc0, emissive: 0xfff0c8, emissiveIntensity: 0.06, roughness: 0.2 }));
  const irisMat = new THREE.MeshBasicMaterial({ color: hdr(TOXIC, 1.1), toneMapped: false });
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.1015, 32, 12, 0, Math.PI * 2, 0, 0.52).rotateX(Math.PI / 2), irisMat);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: 0x030303 }));
  pupil.scale.set(0.35, 1.9, 0.5);
  pupil.position.z = 0.097;
  // Upper lid: a cap rotating about the eye. -0.7 wide open, 1.2 shut.
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.108, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2 + 0.05), skin);
  lid.rotation.x = 1.2;
  eye.add(sclera, iris, pupil, lid);
  body.add(eye);

  const mouth = new THREE.Group();
  const n = new THREE.Vector3(0, -0.52, 0.85).normalize();
  mouth.position.copy(n).multiplyScalar(R * 0.9);
  mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const jaw = new THREE.Group();                       // scaled vertically to open the mouth
  const throat = new THREE.Mesh(new THREE.CircleGeometry(0.09, 36), additive({ map: scene.glow, color: hdr(FIRE, 3), opacity: 0 }));
  throat.position.z = 0.003;
  throat.visible = false;
  jaw.add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 36), new THREE.MeshBasicMaterial({ color: 0x0d0103 })), throat,
          new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 10, 40), skin));
  mouth.add(jaw);
  // The fangs sit on the rim, whose height follows the jaw's opening. They are one mesh: its morph
  // target holds them where the rim is with the jaw wide open, and its weight is the opening.
  const closed = [], open = [];
  for (let i = -3; i <= 3; i++) for (const side of [1, -1]) {
    const x = i * 0.025 + (side < 0 ? 0.012 : 0);
    if (Math.abs(x) > 0.085) continue;
    const rot = [0, 0, side > 0 ? Math.PI : 0];      // upper fangs point down
    closed.push(pose([x, -side * 0.014, 0.01], rot));
    open.push(pose([x, side * (0.1 * Math.sqrt(1 - (x / 0.1) ** 2) - 0.014), 0.01], rot));
  }
  const tooth = new THREE.ConeGeometry(0.01, 0.038, 6), fangs = merged(tooth, closed);
  fangs.morphAttributes.position = [merged(tooth, open).attributes.position];
  const teeth = new THREE.Mesh(fangs, bone);
  mouth.add(teeth);
  // The fireball growing in its mouth while it charges.
  const ball = new THREE.Group();
  ball.position.z = 0.05;
  ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: hdr(0xffe2a8, 4), toneMapped: false })),
           scene.glowSprite(FIRE, 0.95, 0.42));
  ball.scale.setScalar(0.001);
  mouth.add(ball);
  body.add(mouth);
  v.g.add(scene.glowSprite(0xff3a2a, 0.22, 1.15));

  const hot = new THREE.Color(EMBER);
  let gape = 0.2, spit = 0, blinkAt = 0, blinkEnd = 0;
  return Object.assign(v, {
    hover: t => 0.58 + Math.sin(t * 1.6 + v.phase) * 0.035,
    attack() { spit = 1; v.kick = 0.5; },
    animate(e, t, dt, awake) {
      const charge = e.charge > 0 ? 1 - e.charge / MONSTERS.watcher.charge : 0;
      spit = Math.max(0, spit - dt * 3.5);
      gape = approach(gape, Math.max(0.2 + charge * 0.8, spit), 18, dt);
      jaw.scale.y = teeth.morphTargetInfluences[0] = gape;
      throat.material.opacity = Math.max(charge, spit * 0.8);
      throat.visible = throat.material.opacity > 0;
      ball.scale.setScalar(Math.max(0.001, charge));
      if (awake && t > blinkAt) { blinkEnd = t + 0.13; blinkAt = t + 2 + Math.random() * 3; }
      const shut = !awake ? 1.2 : e.pain > 0 ? 0.45 : t < blinkEnd ? 1.2 : -0.7;
      lid.rotation.x = approach(lid.rotation.x, shut, awake ? 16 : 3, dt);
      irisMat.color.setHex(TOXIC).lerp(hot, charge).multiplyScalar(1.1 + charge * 1.4);
      skin.emissiveIntensity = (awake ? 1 : 0.55) + Math.max(0, Math.sin(t * (awake ? 5 : 2) + v.phase)) * 0.5 + charge * 1.6;
      body.position.set(0, 0, -v.kick * 0.1);
      return 0.45 + charge * 1.6 + spit;
    },
    debris: [
      { count: 160, color: 0xff3a2a, speed: 3.6, life: 1.1, size: 0.07, gravity: 2.5, intensity: 4 },
      { count: 70, color: EMBER, speed: 1.6, life: 0.8, size: 0.05, gravity: 0.5, intensity: 3 },
    ],
  });
}

/* Seeker: a burning skull with ember eyes and a chattering jaw, trailing flames. */
function makeSeeker(scene) {
  const v = monsterBase(scene, 0.165, 0xff7a2a), body = v.body;
  const bone = new THREE.MeshStandardMaterial({ color: 0x9c907c, roughness: 0.75, metalness: 0.05, emissive: FIRE, emissiveIntensity: 0.05 });
  const hollow = new THREE.MeshBasicMaterial({ color: 0x060203 });
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.125, 32, 24), bone);
  cranium.scale.set(0.9, 0.92, 1.05);
  cranium.position.set(0, 0.03, -0.01);
  cranium.castShadow = true;
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.09), bone);
  face.position.set(0, -0.052, 0.052);
  body.add(cranium, face);
  // Left and right halves of each pair baked together: eye sockets, ember eyes, horns.
  const pair = (geo, place) => merged(geo, [-1, 1].map(place));
  const embers = new THREE.MeshBasicMaterial({ color: hdr(EMBER, 5), toneMapped: false });
  body.add(new THREE.Mesh(pair(new THREE.SphereGeometry(0.034, 16, 12), side => pose([side * 0.046, 0, 0.098])), hollow),
           new THREE.Mesh(pair(new THREE.SphereGeometry(0.015, 12, 8), side => pose([side * 0.046, 0, 0.12])), embers),
           new THREE.Mesh(pair(new THREE.ConeGeometry(0.018, 0.09, 10), side => pose([side * 0.075, 0.12, -0.01], [-0.3, 0, -side * 0.6])), bone));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.03, 3), hollow);
  nose.position.set(0, -0.04, 0.1);
  nose.rotation.x = Math.PI;
  body.add(nose);
  // Each row of teeth is one mesh.
  const tooth = new THREE.BoxGeometry(0.014, 0.018, 0.01);
  const row = (y, z) => new THREE.Mesh(merged(tooth, [-2, -1, 0, 1, 2].map(i => pose([i * 0.022, y, z]))), bone);
  body.add(row(-0.094, 0.094));
  const jaw = new THREE.Group();                       // hinged at the back
  jaw.position.set(0, -0.088, 0);
  const mandible = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.1), bone);
  mandible.position.set(0, -0.012, 0.055);
  jaw.add(mandible, row(0.008, 0.1));
  body.add(jaw);
  v.g.add(scene.glowSprite(0xff7a2a, 0.16, 0.8));

  // Flames rise from an arc behind the skull, whichever way it faces.
  const spot = new THREE.Vector3(), at = v.g.position;
  let emit = 0, lunge = 0, back = 0;
  const flame = () => {
    const a = back + (Math.random() - 0.5) * 2.6, r = 0.07 + Math.random() * 0.07;
    return spot.set(at.x + Math.sin(a) * r, at.y + Math.random() * 0.13, at.z + Math.cos(a) * r);
  };
  return Object.assign(v, {
    hover: t => 0.5 + Math.sin(t * 5 + v.phase) * 0.03,
    attack() { lunge = 1; },
    animate(e, t, dt, awake) {
      lunge = Math.max(0, lunge - dt * 4);
      const chatter = awake ? 0.1 + Math.abs(Math.sin(t * 16 + v.phase)) * 0.3 : 0.05;
      jaw.rotation.x = Math.max(chatter, lunge * 0.9);
      body.position.set(0, 0, lunge * 0.28 - v.kick * 0.12);
      embers.color.setHex(EMBER).multiplyScalar(3.5 + Math.random() * 2);
      // More flames once it hunts, a trail when it dashes; each frame's flames go out in one burst.
      const dashing = e.step > 0 && e.stepTime === MONSTERS.seeker.dash;
      emit += dt * (!e.alive ? 0 : dashing ? 110 : awake ? 75 : 40);
      const count = Math.floor(emit);
      emit -= count;
      back = v.yaw + Math.PI;
      scene.particles.burst(flame, { count, color: FIRE, ember: 0.35, speed: 0.3, life: 0.55, size: 0.13, gravity: -1.6, intensity: 2.2, spread: 0.5 });
      return 0.6 + Math.random() * 0.25 + lunge;
    },
    debris: [
      { count: 110, color: FIRE, speed: 2.6, life: 0.8, size: 0.08, gravity: -0.8, intensity: 3.5 },
      { count: 40, color: 0xfff0dc, speed: 3, life: 0.5, size: 0.035, gravity: 3, intensity: 2.5 },
    ],
  });
}
