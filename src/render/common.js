/* ═══════════════════════════ Shared by the render modules ═══════════════════════════
   Colours of the luminous effects and small helpers. */

import * as THREE from "three";

export const RED = 0xff2e4d, GOLD = 0xffb43d, MINT = 0x3dffb0, BEAM = 0xffc46b;
export const FIRE = 0xff6a1f, EMBER = 0xffc04a, TOXIC = 0x9dff3d;

export const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const approach = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-dt * rate));

/* Settings shared by every luminous effect: added on top of the scene, never hiding what is behind. */
export const additive = params => new THREE.MeshBasicMaterial({
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, ...params });

/* Frees the GPU buffers of a subtree. Sprites share one geometry across three.js: it stays. */
export const dispose = root => root.traverse(o => {
  if (!o.isSprite) o.geometry?.dispose();
  o.material?.dispose();
});

/* Deterministic noise so the textures look the same on every visit. */
export function random(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
