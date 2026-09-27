/* ═══════════════════════════ Particles ═══════════════════════════
   Sparks, flames and debris: one pool of points, drawn in a single call. */

import * as THREE from "three";
import { BEAM, EMBER, hdr } from "./common.js";

export class Particles {
  constructor(scene, max = 2400) {
    this.max = max;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3); this.a = new Float32Array(max);
    this.s = new Float32Array(max); this.life = new Float32Array(max); this.span = new Float32Array(max);
    this.g = new Float32Array(max);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.p, 3));
    geo.setAttribute("pcolor", new THREE.BufferAttribute(this.c, 3));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.a, 1));
    geo.setAttribute("size", new THREE.BufferAttribute(this.s, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 300 } },
      vertexShader: `
        attribute vec3 pcolor; attribute float alpha; attribute float size;
        uniform float scale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = pcolor; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = alpha > 0.0 ? size * scale / -mv.z : 0.0;   // dead: nothing to draw
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float k = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vColor * k, k);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  /* `count` particles thrown from `from`: a point, or a function giving each one its own starting
     point (the flames around a skull). `ember` is the share drawn in the ember colour instead. */
  burst(from, { count = 40, color = BEAM, ember = 0, speed = 2, life = 0.6, size = 0.05, gravity = 3, intensity = 3, spread = 1 }) {
    if (count <= 0) return;
    const main = hdr(color, intensity), alt = ember > 0 ? hdr(EMBER, intensity) : main;
    for (let n = 0; n < count; n++) {
      const i = this.next = (this.next + 1) % this.max, k = i * 3;
      const at = typeof from === "function" ? from() : from, col = Math.random() < ember ? alt : main;
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.p[k] = at.x; this.p[k + 1] = at.y; this.p[k + 2] = at.z;
      this.v[k] = r * Math.cos(th) * sp * spread; this.v[k + 1] = u * sp + speed * 0.3; this.v[k + 2] = r * Math.sin(th) * sp * spread;
      this.c[k] = col.r; this.c[k + 1] = col.g; this.c[k + 2] = col.b;
      this.s[i] = size * (0.5 + Math.random());
      this.life[i] = this.span[i] = life * (0.5 + Math.random() * 0.5);
      this.g[i] = gravity;
    }
    const geo = this.points.geometry;
    geo.attributes.pcolor.needsUpdate = geo.attributes.size.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.a[i] = 0; continue; }
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= this.g[i] * dt;
      for (let k = 0; k < 3; k++) this.p[i * 3 + k] += this.v[i * 3 + k] * dt;
      if (this.p[i * 3 + 1] < 0.01) { this.p[i * 3 + 1] = 0.01; this.v[i * 3 + 1] *= -0.35; }
      this.a[i] = Math.max(0, this.life[i] / this.span[i]);
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = geo.attributes.alpha.needsUpdate = true;
  }
}
