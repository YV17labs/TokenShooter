/* ═══════════════════════════ Demo shell: game loop, brain, interface ═══════════════════════════
   Entry point of the page. It holds the demo's state and wires the parts together: game/ (the
   rules, DOM-free), brain/ (the model, in a Web Worker), render/ (three.js), audio/ and ui/ (the
   cards and layers around the view). */

// Fonts are bundled with the page: no request leaves for a font CDN.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import * as G from "./game/index.js";
import { World3D } from "./render/scene.js";
import { Sound } from "./audio/sound.js";
import { Brain } from "./brain/client.js";
import { MODELS, isCached } from "./brain/models.js";
import { $, store } from "./ui/dom.js";
import * as hud from "./ui/hud.js";
import * as panels from "./ui/panels.js";
import { DecisionView } from "./ui/decision.js";
import { showPerception, clearPerception } from "./ui/perception.js";
import { drawMap } from "./ui/tactical-map.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const params = new URLSearchParams(location.search);

const PILOTS = { model: "language model", bot: "rule-based bot", human: "you" };

let world = G.createWorld(Number(params.get("seed")) || 7);
let perception = null, running = false, frozen = false;
// Own keys only: `?pilot=toString` must not pass for a pilot.
let pilot = Object.hasOwn(PILOTS, params.get("pilot")) ? params.get("pilot") : "model";
let pace = ["turns", "live"].includes(params.get("pace")) ? params.get("pace") : store.get("pace", "live");
let modelId = Object.hasOwn(MODELS, params.get("model")) ? params.get("model") : store.get("model", Object.keys(MODELS)[0]);
if (!Object.hasOwn(MODELS, modelId)) modelId = Object.keys(MODELS)[0];
let brainState = "idle";                     // idle | loading | ready | failed
let brainInfo = null;

const scene = new World3D($("viewport"));
scene.reset(world);
const decisions = new DecisionView();

/* Sound can only start after the visitor's first click or key press. */
const sound = new Sound(store.get("sound", "on") === "on");
for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => sound.unlock(), { capture: true });

/* ═══════════════════════════ Brain ═══════════════════════════ */

const brain = new Brain({
  progress: (loaded, total) => panels.showProgress(loaded, total, MODELS[modelId]),
  step: panels.showStep,
  ready: brainReady,
  prompt: info => { $("strategyHint").textContent = `Prompt cache rebuilt: ${info.tokens} tokens in ${Math.round(info.ms)} ms.`; },
  error: brainError,
});

const watchBot = () => { setPilot("bot"); setRunning(true); };

/* Nothing is downloaded until the visitor asks for it: the model weighs hundreds of MB. */
async function offerModel() {
  brainState = "idle";
  running = false;
  updatePlayButton();
  $("chipModelText").textContent = "Model not loaded";
  if (pilot !== "model") return;
  const gpu = navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
  if (!gpu) { brainError({ code: "webgpu" }); return; }
  const m = MODELS[modelId], cached = await isCached(modelId);
  if (brainState !== "idle" || pilot !== "model") return;       // the visitor moved on meanwhile
  panels.showOffer(m, cached, { onLoad: loadBrain, onBot: watchBot });
}

function loadBrain() {
  brainState = "loading";
  running = false;
  updatePlayButton();
  showLoading();
  brain.load({
    model: modelId, system: G.systemPrompt($("strategy").value),
    examples: G.examples(), answers: G.ANSWERS, mirroredAnswer: G.MIRRORED_ANSWER,
  });
}

function showLoading() {
  $("chipModelText").textContent = `Loading ${MODELS[modelId].name}`;
  panels.showLoading(MODELS[modelId]);
}

function brainReady(info) {
  if (info.model !== modelId) return;          // a load the visitor switched away from
  brainState = "ready";
  brainInfo = info;
  $("chipModelText").textContent = `${MODELS[modelId].name} · WebGPU`;
  updatePlayButton();
  if (pilot !== "model") return;
  panels.showReady(MODELS[modelId], info, G.examples().length, () => setRunning(true));
  updatePlayButton();
  if (params.has("autostart")) setRunning(true);
}

function brainError(err) {
  brainState = "failed";
  $("chipModelText").textContent = "Model unavailable";
  panels.showError(err, watchBot);
  updatePlayButton();
}

/* ═══════════════════════════ Decisions ═══════════════════════════ */

function botDecision(p, w) {
  return { probs: G.heuristic(p, G.blockedActions(w)), ms: 0, mass: 1, bot: true };
}

function mask(probs, blocked) {
  const out = {};
  let total = 0;
  for (const a of G.ACTIONS) { out[a] = blocked.includes(a) ? 0 : probs[a]; total += out[a]; }
  if (total === 0) return Object.fromEntries(G.ACTIONS.map(a => [a, a === "Turn right" ? 1 : 0]));
  for (const a of G.ACTIONS) out[a] /= total;
  return out;
}

async function decisionLoop() {
  for (;;) {
    const ready = pilot === "bot" || (pilot === "model" && brainState === "ready");
    if (!running || world.state !== "playing" || !ready) { await sleep(80); continue; }
    const w = world;                               // a restart swaps the world: drop stale decisions
    const p = G.perceive(w);
    const state = G.userPrompt(G.describe(p));
    w.damageSinceDecision = 0;
    perception = p;
    showPerception(state);
    scene.showPerception(p, w);
    if (pace === "turns") frozen = true;
    hud.setThinking(true);
    let res;
    try {
      if (pilot === "bot") res = botDecision(p, w);
      else {
        const mirrored = $("mirror").checked ? G.userPrompt(G.describe(G.mirror(p))) : null;
        const r = await brain.decide(state, mirrored);
        res = { ...r, probs: Object.fromEntries(G.ACTIONS.map((a, i) => [a, r.probs[i]])) };
      }
    } catch (err) {
      console.error(err);
      res = botDecision(p, w);
    }
    hud.setThinking(false);
    frozen = false;
    if (w !== world || !running || w.state !== "playing") continue;

    const blocked = G.blockedActions(w);
    const probs = mask(res.probs, blocked);
    const choice = G.ACTIONS.reduce((a, b) => probs[b] > probs[a] ? b : a);
    decisions.show(res, probs, choice, blocked, brainInfo?.prefixTokens);
    w.stats.decisions++;
    G.applyAction(w, choice);
    await sleep(G.ACTION_TIME[choice] * 1000);
  }
}

/* ═══════════════════════════ Keyboard pilot ═══════════════════════════ */

const KEYS = {
  ArrowUp: "Move forward", KeyW: "Move forward",
  ArrowLeft: "Turn left", KeyA: "Turn left", ArrowRight: "Turn right", KeyD: "Turn right", Space: "Shoot",
};
let humanBusy = false;
addEventListener("keydown", e => {
  if (pilot !== "human" || e.target.closest("textarea, select, input") || !KEYS[e.code]) return;
  e.preventDefault();
  if (!running) setRunning(true);
  if (humanBusy || world.state !== "playing") return;
  const action = KEYS[e.code];
  if (G.blockedActions(world).includes(action)) return;
  humanBusy = true;
  G.applyAction(world, action);
  world.stats.decisions++;
  perception = G.perceive(world);
  showPerception(G.userPrompt(G.describe(perception)));
  scene.showPerception(perception, world);
  decisions.addToTimeline(action, 1);
  setTimeout(() => { humanBusy = false; }, G.ACTION_TIME[action] * 850);
});

/* ═══════════════════════════ Frame loop ═══════════════════════════ */

let last = performance.now(), frames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running && !frozen && world.state === "playing") G.updateWorld(world, dt);
  for (const ev of world.events.splice(0)) onEvent(ev);
  scene.update(world, dt);
  scene.render();
  hud.updateHud(world);
  hud.updateLock(world, perception, scene);
  if (++frames % 2 === 0) drawMap($("map"), world, perception);
  requestAnimationFrame(frame);
}

/* Where a sound comes from, as the robot hears it: panned left or right, quieter far away. */
function heard(x, y) {
  const r = G.relative(world.player, x, y), d = Math.hypot(r.f, r.l);
  return { pan: r.l / (Math.abs(r.f) + Math.abs(r.l) + 0.6) * 0.85, volume: Math.min(1, 1.6 / (1 + d * 0.3)) };
}

function onEvent(ev) {
  scene.handle(ev, world);
  if (ev.type === "hurt") {
    hud.flashDamage();
    hud.showHurtDirection(world, ev.x, ev.y);
    sound.hurt();
  } else if (ev.type === "pickup") {
    hud.toast(ev.kind === "ammo" ? `+${G.RULES.ammoPickup} ammo` : `+${G.RULES.healthPickup} health`);
    sound.pickup(ev.kind);
  } else if (ev.type === "shot") {
    sound.shot();
    if (ev.hit) {
      if (ev.killed || ev.flinched) sound.stopCharge(ev.enemy);     // otherwise its fireball still comes
      if (ev.killed) { hud.toast(`${G.MONSTERS[ev.kind].name} destroyed`); sound.death(ev.kind, heard(ev.x, ev.y)); }
      else sound.pain(ev.kind, heard(ev.x, ev.y));
    }
  } else if (ev.type === "wake") {
    sound.roar(ev.kind, heard(ev.x, ev.y));
  } else if (ev.type === "charge") {
    sound.charge(ev.enemy, heard(ev.x, ev.y), ev.time);
  } else if (ev.type === "fireball") {
    sound.fireball(ev.enemy, heard(ev.x, ev.y));
  } else if (ev.type === "impact") {
    if (!ev.hit) sound.explosion(heard(ev.x, ev.y), 0.6);
    else sound.explosion({ volume: 0.8 }, 0.7);
  } else if (ev.type === "bite") {
    sound.bite(heard(ev.x, ev.y));
  } else if (ev.type === "end") {
    sound.end(ev.result === "won");
    sound.ambience(false);
    setTimeout(showEnd, 1100);
  }
}

/* ═══════════════════════════ Game flow ═══════════════════════════ */

function setRunning(on) {
  if (on && pilot === "model" && brainState !== "ready") return;
  running = on;
  if (on) panels.hidePanel();
  sound.ambience(on && world.state === "playing");
  updatePlayButton();
}

function updatePlayButton() {
  const b = $("play");
  const needsModel = pilot === "model" && brainState !== "ready";
  b.disabled = needsModel && brainState !== "idle";
  b.textContent = !needsModel ? (running ? "Pause" : world.stats.decisions ? "Resume" : "Start")
    : brainState === "idle" ? "Load model" : brainState === "loading" ? "Loading…" : "Unavailable";
}

function setPilot(value) {
  pilot = value;
  $("pilot").value = value;
  $("chipPilot").textContent = `Pilot: ${PILOTS[value]}`;
  if (value === "human") hud.toast("Arrow keys to move, Space to shoot");
  if (value === "model") {
    if (brainState === "idle") offerModel();
    else if (brainState === "loading") showLoading();
  } else if (brainState !== "ready") panels.hidePanel();
  updatePlayButton();
}

function restart() {
  world = G.createWorld(Number(params.get("seed")) || 7);
  scene.reset(world);
  perception = null;
  decisions.reset();
  clearPerception();
  hud.clearHurtDirections();
  if (pilot !== "model" || brainState === "ready") panels.hidePanel();
  updatePlayButton();
}

function showEnd() {
  const l = decisions.latencies;
  const latency = l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null;
  const who = `${PILOTS[pilot]}${pilot === "model" ? `, ${MODELS[modelId].name}` : ""}`;
  panels.showEnd(world, who, latency, () => { restart(); setRunning(true); });
  running = false;
  updatePlayButton();
}

/* ═══════════════════════════ Controls ═══════════════════════════ */

$("strategy").value = G.STRATEGY;
$("model").value = modelId;
$("pace").value = pace;
setPilot(pilot);

$("play").onclick = () => pilot === "model" && brainState === "idle" ? loadBrain() : setRunning(!running);
$("restart").onclick = restart;
const showSound = () => { $("sound").classList.toggle("off", !sound.on); $("sound").title = sound.on ? "Mute" : "Unmute"; };
$("sound").onclick = () => { sound.unlock(); sound.setOn(!sound.on); store.set("sound", sound.on ? "on" : "off"); showSound(); };
showSound();
$("pilot").onchange = e => setPilot(e.target.value);
$("pace").onchange = e => { pace = e.target.value; store.set("pace", pace); };
$("model").onchange = e => { modelId = e.target.value; store.set("model", modelId); offerModel(); };

let strategyTimer = null;
$("strategy").addEventListener("input", () => {
  clearTimeout(strategyTimer);
  strategyTimer = setTimeout(() => {
    if (brainState !== "ready") return;
    $("strategyHint").textContent = "Rebuilding the prompt cache…";
    brain.setPrompt(G.systemPrompt($("strategy").value), G.examples());
  }, 700);
});

// Handle for debugging and automated checks.
window.demo = {
  get world() { return world; }, get history() { return decisions.history; }, get latencies() { return decisions.latencies; },
  scene, sound,
};

// ?autostart=1 is an explicit opt-in carried by the link: the model loads straight away.
if (params.has("autostart")) {
  if (pilot === "model") loadBrain();
  else setRunning(true);
}
requestAnimationFrame(frame);
decisionLoop();
