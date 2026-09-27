/* ═══════════════════════════ HUD: the layers over the 3D view ═══════════════════════════ */

import { MONSTERS, relative, distance } from "../game/index.js";
import { $ } from "./dom.js";

export function updateHud(world) {
  const p = world.player;
  $("health").textContent = p.health;
  $("healthBar").style.width = `${p.health}%`;
  $("statHealth").classList.toggle("low", p.health <= 30);
  $("ammo").textContent = p.ammo;
  $("enemies").textContent = world.enemies.filter(e => e.alive).length;
}

/* The lock-on reticle follows the monster in the crosshair. */
export function updateLock(world, perception, scene) {
  const lock = $("lock"), c = perception?.crosshair;
  const alive = c && world.enemies[c.id].alive && world.state === "playing";
  if (!alive) { lock.classList.remove("on"); return; }
  const s = scene.screenPosition(c.id);
  lock.style.left = `${s.x}px`;
  lock.style.top = `${s.y}px`;
  $("lockLabel").textContent = `${MONSTERS[c.kind].name} · ${distance(c)}`.toUpperCase();
  lock.classList.toggle("on", s.visible);
}

export function setThinking(on) {
  $("chipModel").classList.toggle("thinking", on);
}

export function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("on"), 1300);
}

/* A red flash over the whole view when the robot is hit. */
export function flashDamage() {
  const d = $("damage");
  d.classList.add("on");
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove("on")));
}

/* A red arc around the crosshair, on the side the hit came from (top = ahead). */
export function showHurtDirection(world, x, y) {
  const r = relative(world.player, x, y);
  if (!r.f && !r.l) return;
  const arc = document.createElement("div");
  arc.className = "hurt-dir";
  arc.style.setProperty("--angle", `${Math.atan2(r.l, r.f) * 180 / Math.PI}deg`);
  $("viewport").appendChild(arc);
  arc.addEventListener("animationend", () => arc.remove());
}

export function clearHurtDirections() {
  for (const arc of document.querySelectorAll(".hurt-dir")) arc.remove();
}
