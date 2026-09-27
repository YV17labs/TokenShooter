/* ═══════════════════════════ Textures ═══════════════════════════
   Drawn on canvases when the page starts: no image files to download. */

import * as THREE from "three";
import { SIZE } from "../game/index.js";
import { random } from "./common.js";

function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const glowTexture = () => canvasTexture(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

function grain(g, s, n, rnd) {
  for (let i = 0; i < n; i++) {
    const light = rnd() > 0.5;
    g.fillStyle = `rgba(${light ? "200,215,240" : "0,0,0"},${0.02 + rnd() * 0.035})`;
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

export const wallTexture = () => canvasTexture(512, (g, s) => {
  const rnd = random(11);
  const grad = g.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, "#1b212d");
  grad.addColorStop(1, "#11151d");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  grain(g, s, 14000, rnd);
  // Panel seams with a faint highlight on their lower edge.
  const seams = [[0, s * 0.64, s, 3], [s * 0.5 - 1, 0, 3, s * 0.64], [s * 0.25, s * 0.64, 3, s * 0.36], [s * 0.75, s * 0.64, 3, s * 0.36]];
  for (const [x, y, w, h] of seams) {
    g.fillStyle = "#07090d"; g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(140,160,200,.10)"; g.fillRect(x + (w > h ? 0 : w), y + (w > h ? h : 0), w > h ? w : 1, w > h ? 1 : h);
  }
  g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 6; g.strokeRect(0, 0, s, s);
  g.fillStyle = "rgba(160,180,220,.16)";
  for (const [x, y] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.58], [0.94, 0.58]]) g.fillRect(x * s - 3, y * s - 3, 6, 6);
});

export const floorTexture = () => canvasTexture(2048, (g, s) => {
  const rnd = random(23), c = s / SIZE;
  g.fillStyle = "#0a0d13";
  g.fillRect(0, 0, s, s);
  grain(g, s, 60000, rnd);
  g.strokeStyle = "rgba(120,145,195,.16)";
  g.lineWidth = 2;
  for (let i = 0; i <= SIZE; i++) {
    g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, s); g.stroke();
    g.beginPath(); g.moveTo(0, i * c); g.lineTo(s, i * c); g.stroke();
  }
  g.fillStyle = "rgba(170,195,240,.32)";
  for (let y = 0; y <= SIZE; y++) for (let x = 0; x <= SIZE; x++) {
    g.fillRect(x * c - 7, y * c - 1, 14, 2);
    g.fillRect(x * c - 1, y * c - 7, 2, 14);
  }
});

/* Watcher hide: mottled crimson, and a separate map of glowing veins for the emissive channel. */
export const skinTexture = () => canvasTexture(512, (g, s) => {
  const rnd = random(31);
  g.fillStyle = "#5a121b";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 34, dark = rnd() > 0.45;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, dark ? "rgba(25,3,8,.35)" : "rgba(160,45,50,.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${rnd() > 0.5 ? "220,130,120" : "20,0,5"},${0.06 + rnd() * 0.08})`;
    g.beginPath(); g.arc(rnd() * s, rnd() * s, 1 + rnd() * 2.5, 0, Math.PI * 2); g.fill();
  }
});

export const veinTexture = () => canvasTexture(512, (g, s) => {
  const rnd = random(47);
  g.fillStyle = "#000";
  g.fillRect(0, 0, s, s);
  g.lineCap = g.lineJoin = "round";
  g.shadowColor = "rgba(255,80,20,1)";
  g.shadowBlur = 8;
  for (let i = 0; i < 26; i++) {
    let x = rnd() * s, y = rnd() * s, a = rnd() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 6 + Math.floor(rnd() * 10); k > 0; k--) {
      a += (rnd() - 0.5) * 1.2;
      x += Math.cos(a) * 14; y += Math.sin(a) * 14;
      g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(255,110,40,.9)";
    g.lineWidth = 1 + rnd() * 2;
    g.stroke();
  }
});

/* Burn mark left on the floor where a monster died. */
export const scorchTexture = () => canvasTexture(256, (g, s) => {
  const rnd = random(61);
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(0,0,0,.92)");
  r.addColorStop(0.5, "rgba(0,0,0,.6)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = s * (0.18 + rnd() * 0.28);
    g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.4})`;
    g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 2 + rnd() * 8, 0, Math.PI * 2); g.fill();
  }
});
