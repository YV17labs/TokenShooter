/* ═══════════════════════════ Tactical map: what the robot knows ═══════════════════════════ */

import * as G from "../game/index.js";

const diamond = (g, x, y, r) => { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); };
const ZONE = { "1": "#6b8fd6", "2": "#e8805f", "3": "#3fd0bb", "4": "#a283ff" };

export function drawMap(map, w, perception) {
  const size = map.clientWidth * devicePixelRatio;
  if (map.width !== size) map.width = map.height = size;
  const c = size / G.SIZE, g = map.getContext("2d"), p = w.player;
  let latest = -Infinity;
  for (const t of w.seen) if (t > latest) latest = t;
  g.fillStyle = "#07090e";
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < G.SIZE; y++) for (let x = 0; x < G.SIZE; x++) {
    const type = G.wallAt(x, y), t = w.seen[y * G.SIZE + x];
    if (type) {
      g.fillStyle = "#151a24";
      g.fillRect(x * c, y * c, c, c);
      g.fillStyle = ZONE[type] + "55";
      g.fillRect(x * c + c * 0.42, y * c + c * 0.42, c * 0.16, c * 0.16);
      continue;
    }
    g.fillStyle = t === latest ? "#1d2536" : G.seenRecently(w, x, y) ? "#121824" : t > -Infinity ? "#0d1119" : "#090b10";
    g.fillRect(x * c + 0.5, y * c + 0.5, c - 1, c - 1);
  }
  for (const it of w.items) {
    if (it.taken || w.seen[it.y * G.SIZE + it.x] === -Infinity) continue;
    g.fillStyle = it.kind === "ammo" ? "#ffb43d" : "#3dffb0";
    g.beginPath();
    diamond(g, (it.x + 0.5) * c, (it.y + 0.5) * c, c * 0.25);
    g.fill();
  }
  // Rays: what the sensors report in each direction.
  const cx = (p.x + 0.5) * c, cy = (p.y + 0.5) * c;
  if (perception) {
    g.lineCap = "round";
    g.font = `600 ${Math.round(c * 0.36)}px "JetBrains Mono Variable", monospace`;
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const [side, turn] of [["ahead", 0], ["right", 1], ["behind", 2], ["left", 3]]) {
      const s = perception.sides[side], [dx, dy] = G.DIRS[(p.dir + turn) % 4];
      const color = s.unexplored ? "#6fb7ff" : "#ffb547";
      const ex = cx + dx * (s.free + 0.5) * c, ey = cy + dy * (s.free + 0.5) * c;
      g.strokeStyle = color + (side === "ahead" ? "ee" : "88");
      g.lineWidth = side === "ahead" ? c * 0.12 : c * 0.07;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
      // Short tick across the ray where it meets the wall.
      g.lineWidth = c * 0.1;
      g.beginPath(); g.moveTo(ex - dy * c * 0.3, ey + dx * c * 0.3); g.lineTo(ex + dy * c * 0.3, ey - dx * c * 0.3); g.stroke();
      if (s.free > 0) {
        const lx = cx + dx * (s.free * 0.5 + 0.25) * c + dy * c * 0.32, ly = cy + dy * (s.free * 0.5 + 0.25) * c - dx * c * 0.32;
        g.fillStyle = "#e7ecf6";
        g.fillText(String(s.free), lx, ly);
      }
    }
    for (const o of perception.openings) {
      g.strokeStyle = o.unexplored ? "#6fb7ff" : "#ffb54799";
      g.lineWidth = c * 0.06;
      g.strokeRect(o.x * c + c * 0.2, o.y * c + c * 0.2, c * 0.6, c * 0.6);
    }
  }
  // Monsters the robot currently perceives: watchers as circles, seekers as diamonds.
  const seenIds = new Set(perception?.enemiesSeen.map(e => e.id) || []);
  const heardIds = new Set(perception?.heard.map(e => e.id) || []);
  for (const e of w.enemies) {
    if (!e.alive || (!seenIds.has(e.id) && !heardIds.has(e.id))) continue;
    const ex = (e.x + 0.5) * c, ey = (e.y + 0.5) * c, r = c * 0.28;
    g.beginPath();
    if (e.kind === "watcher") g.arc(ex, ey, r, 0, Math.PI * 2);
    else diamond(g, ex, ey, r);
    if (seenIds.has(e.id)) { g.fillStyle = "#ff4d64"; g.shadowColor = "#ff4d64"; g.shadowBlur = c * 0.6; g.fill(); g.shadowBlur = 0; }
    else { g.strokeStyle = "#ff4d64"; g.lineWidth = c * 0.07; g.setLineDash([c * 0.12, c * 0.1]); g.stroke(); g.setLineDash([]); }
  }
  // Fireballs in flight.
  g.fillStyle = "#ff8a3d"; g.shadowColor = "#ff6a1f"; g.shadowBlur = c * 0.5;
  for (const b of w.projectiles) { g.beginPath(); g.arc((b.x + 0.5) * c, (b.y + 0.5) * c, c * 0.14, 0, Math.PI * 2); g.fill(); }
  g.shadowBlur = 0;
  // Player.
  const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][p.dir];
  g.save();
  g.translate(cx, cy); g.rotate(a);
  g.fillStyle = "#ffb547"; g.shadowColor = "#ffb547"; g.shadowBlur = c * 0.5;
  g.beginPath(); g.moveTo(c * 0.36, 0); g.lineTo(-c * 0.26, c * 0.24); g.lineTo(-c * 0.14, 0); g.lineTo(-c * 0.26, -c * 0.24); g.closePath(); g.fill();
  g.restore();
}
