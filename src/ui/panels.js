/* ═══════════════════════════ Panels over the view ═══════════════════════════
   The model offer, the download, ready, errors and the end of a game. `m` is an entry of MODELS. */

import { $, escapeHtml } from "./dom.js";

function panel(html) {
  $("panel").innerHTML = html;
  $("overlay").classList.remove("hidden");
}
export const hidePanel = () => $("overlay").classList.add("hidden");

/* Nothing is downloaded until the visitor asks for it: the model weighs hundreds of MB. */
export function showOffer(m, cached, { onLoad, onBot }) {
  panel(`
    <h3>Let a language model play</h3>
    <p>${m.name} runs entirely on your GPU, inside this page.
       ${cached ? "It is already on this device: nothing to download."
                : `It needs a one-time download of ${m.size}; your browser then keeps it for later visits.`}</p>
    <button class="btn primary" id="consent">${cached ? `Load ${m.name}` : `Download ${m.name} · ${m.size}`}</button>
    <div class="note">Nothing is sent anywhere. <a href="#" id="botInstead">Watch the rule-based bot instead</a>, no download.</div>`);
  $("consent").onclick = onLoad;
  $("botInstead").onclick = e => { e.preventDefault(); onBot(); };
}

export function showLoading(m) {
  panel(`
    <h3>Loading the model</h3>
    <p>${m.name}, ${m.size}. Downloaded once, then served from your browser's cache on later visits.</p>
    <div class="progress"><div id="progressBar"></div></div>
    <div class="progress-meta"><span id="progressStep">Downloading weights</span><span id="progressBytes"></span></div>
    <div class="note">Everything runs locally on your GPU through WebGPU. No server, nothing is sent anywhere.</div>`);
}

export function showProgress(loaded, total, m) {
  if (!$("progressBar")) return;
  // Files are discovered one after another: the known size keeps the bar from jumping back.
  total = Math.max(total, m.bytes);
  $("progressBar").style.width = `${(loaded / total * 100).toFixed(1)}%`;
  $("progressBytes").textContent = `${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)} MB`;
}

export function showStep(text) {
  if ($("progressStep")) $("progressStep").textContent = text;
}

export function showReady(m, info, exampleCount, onStart) {
  panel(`
    <h3>Ready</h3>
    <p>${m.name} is loaded on your GPU in ${(info.loadMs / 1000).toFixed(1)} s.
       Its instructions and ${exampleCount} worked examples are cached: ${info.prefixTokens} tokens
       that never need recomputing.</p>
    <button class="btn primary" id="go">Start the game</button>`);
  $("go").onclick = onStart;
}

export function showError(err, onBot) {
  const webgpu = err.code === "webgpu";
  panel(`
    <h3>${webgpu ? "WebGPU is not available here" : "The model could not load"}</h3>
    <p>${webgpu
      ? "This demo runs the model on your GPU and needs WebGPU: Chrome or Edge 113+, Safari 26+, or Firefox 141+ on Windows and 145+ on Apple Silicon Macs."
      : `The browser reported: ${escapeHtml(err.message)}`}</p>
    <button class="btn primary" id="useBot">Watch the rule-based bot instead</button>`);
  $("useBot").onclick = onBot;
}

/* `pilot` names who played; `latency` is the mean time per decision in ms, or null. */
export function showEnd(world, pilot, latency, onAgain) {
  const s = world.stats, won = world.state === "won";
  panel(`
    <h3>${won ? "Victory" : "Destroyed"}</h3>
    <p>${won ? "Every monster is down." : "The robot ran out of health."} Pilot: ${pilot}.</p>
    <div class="end-stats">
      <div><b>${Math.round(world.time)} s</b><span>game time</span></div>
      <div><b>${s.decisions}</b><span>decisions</span></div>
      <div><b>${s.shots ? Math.round(s.hits / s.shots * 100) : 0}%</b><span>shots on target</span></div>
      <div><b>${s.kills}/${world.enemies.length}</b><span>monsters destroyed</span></div>
      <div><b>${s.damageTaken}</b><span>damage taken</span></div>
      <div><b>${latency ? latency + " ms" : "–"}</b><span>per decision</span></div>
    </div>
    <button class="btn primary" id="again">Play again</button>`);
  $("again").onclick = onAgain;
}
