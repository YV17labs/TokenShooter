/* ═══════════════════════════ "What the model perceives" card ═══════════════════════════ */

import { $, escapeHtml } from "./dom.js";

export function showPerception(text) {
  const html = escapeHtml(text.replace(/\n\nYour action\?$/, ""))
    .split("\n")
    .map(line => {
      if (/^(Crosshair: ENEMY|Enemy )/.test(line)) return `<span class="threat">${line}</span>`;
      if (/^Crosshair: empty/.test(line)) return `<span class="dim">${line}</span>`;
      if (/^Unexplored area: (?!none)/.test(line)) return `<span class="fresh">${line}</span>`;
      return line;
    }).join("\n");
  $("perception").innerHTML = html;
}

export function clearPerception() {
  $("perception").textContent = "Waiting for the first decision…";
}
