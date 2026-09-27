/* ═══════════════════════════ Decision card and timeline ═══════════════════════════ */

import { ACTIONS } from "../game/index.js";
import { $ } from "./dom.js";

const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  "Move forward": icon('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  "Turn left": icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  "Turn right": icon('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  "Shoot": icon('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
};

export class DecisionView {
  constructor() {
    this.rows = new Map();
    for (const a of ACTIONS) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="key">${ICONS[a]}</div>
        <div><div class="name"><span>${a}</span><em></em></div><div class="track"><div class="fill"></div></div></div>
        <div class="val">–</div>`;
      $("rows").appendChild(row);
      this.rows.set(a, { row, fill: row.querySelector(".fill"), val: row.querySelector(".val"), tag: row.querySelector("em") });
    }
    this.history = [];       // latest decisions, for the timeline
    this.stamps = [];        // when the latest decisions were shown, for the pace
    this.latencies = [];     // time the model took for each decision, in ms
  }

  /* `prefixTokens`: how many tokens the model keeps cached (model decisions only). */
  show(res, probs, choice, blocked, prefixTokens) {
    for (const a of ACTIONS) {
      const r = this.rows.get(a);
      r.fill.style.width = `${(probs[a] * 100).toFixed(1)}%`;
      r.val.textContent = probs[a].toFixed(2);
      r.row.classList.toggle("chosen", a === choice);
      r.row.classList.toggle("blocked", blocked.includes(a));
      r.tag.textContent = blocked.includes(a) ? "blocked" : "";
    }
    $("actionNow").textContent = choice;
    $("actionProb").textContent = probs[choice].toFixed(2);
    const stamps = this.stamps;
    stamps.push(performance.now());
    if (stamps.length > 10) stamps.shift();
    if (stamps.length > 1) $("rate").textContent = `${((stamps.length - 1) / ((stamps.at(-1) - stamps[0]) / 1000)).toFixed(1)}/s`;
    if (res.bot) {
      $("latency").textContent = "–"; $("mass").textContent = "–";
      $("decisionMeta").textContent = "rule-based bot, no model";
      $("tokens").textContent = "";
    } else {
      this.latencies.push(res.ms);
      $("latency").textContent = `${Math.round(res.ms)} ms`;
      $("mass").textContent = `${(res.mass * 100).toFixed(1)}%`;
      $("decisionMeta").textContent = $("mirror").checked ? "2 forward passes, averaged" : "one forward pass, no text generated";
      $("tokens").textContent = `${prefixTokens} cached + ${res.computedTokens} new tokens`;
      $("prompt").textContent = res.prompt;
    }
    this.addToTimeline(choice, probs[choice], $("perception").textContent);
  }

  addToTimeline(action, prob, seen = "") {
    const history = this.history;
    history.push({ action, prob, seen });
    if (history.length > 48) history.shift();
    $("timeline").innerHTML = history.map(h =>
      `<span class="step${h.action === "Shoot" ? " shoot" : ""}${h.prob < 0.5 ? " unsure" : ""}" title="${h.action} · ${h.prob.toFixed(2)}">${ICONS[h.action]}</span>`).join("");
  }

  reset() {
    this.history = []; this.stamps = []; this.latencies = [];
    $("timeline").innerHTML = '<span class="empty">No decision yet.</span>';
    for (const r of this.rows.values()) { r.row.className = "row"; r.fill.style.width = "0"; r.val.textContent = "–"; }
    $("actionNow").textContent = "–"; $("actionProb").textContent = "";
  }
}
