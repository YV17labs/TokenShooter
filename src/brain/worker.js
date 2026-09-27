/* ═══════════════════════════ Brain: the model, on the visitor's GPU ═══════════════════════════
   Web Worker. Transformers.js runs Qwen3.5 through WebGPU. One decision = one forward pass:
   we read the logits of the first token of each answer word at the last position, and never
   generate text.
   The system prompt and the worked examples go through the model once; their KV cache is
   reused for every decision, which therefore only computes the tokens of the game state. */

import { AutoTokenizer, AutoModelForCausalLM, Tensor, DynamicCache, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const MARKER = "@@STATE@@";

let tokenizer = null, model = null, modelId = null;
let answerIds = null;     // first token of each answer word
let mirrorIndex = null;   // answer index → same answer in the mirrored world (Left ↔ Right)
let template = null;      // { before, after }: the chat template split around the game state
let prefix = null;        // { ids, cache }: system prompt + examples, already computed

/* One GPU computation at a time: messages are handled in arrival order. */
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(() => handle(data)).catch(err => {
    self.postMessage({ type: "error", id: data.id, code: err.code || "other", message: String(err?.message || err) });
  });
};

async function handle(msg) {
  if (msg.type === "load") await load(msg);
  else if (msg.type === "prompt") {
    const t0 = performance.now();
    await preparePrefix(msg.system, msg.examples);
    self.postMessage({ type: "prompt", tokens: prefix.ids.length, ms: performance.now() - t0 });
  }
  else if (msg.type === "decide") self.postMessage({ type: "decision", id: msg.id, ...(await decide(msg.state, msg.mirrored)) });
}

/* ═══════════════════════════ Loading ═══════════════════════════ */

async function load({ model: id, system, examples, answers, mirroredAnswer }) {
  if (!self.navigator.gpu || !(await self.navigator.gpu.requestAdapter())) {
    throw Object.assign(new Error("WebGPU is not available in this browser"), { code: "webgpu" });
  }
  if (prefix) { await prefix.cache.dispose(); prefix = null; }
  if (model) { await model.dispose(); model = null; }

  // Progress summed over every file (tokenizer, then model weights).
  // Throttled to 10 updates per second: one message per network chunk flooded the page.
  const files = {};
  let lastPost = 0;
  const onProgress = info => {
    if (info.status !== "progress" || !info.total) return;
    files[info.file] = { loaded: info.loaded, total: info.total };
    const now = performance.now();
    if (now - lastPost < 100 && info.loaded < info.total) return;
    lastPost = now;
    let loaded = 0, total = 0;
    for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
    self.postMessage({ type: "progress", loaded, total });
  };

  const t0 = performance.now();
  tokenizer = await AutoTokenizer.from_pretrained(id, { progress_callback: onProgress });
  model = await AutoModelForCausalLM.from_pretrained(id, {
    device: "webgpu",
    dtype: { embed_tokens: "q4f16", decoder_model_merged: "q4f16" },
    progress_callback: onProgress,
  });
  modelId = id;
  const loadMs = performance.now() - t0;

  answerIds = answers.map(a => tokenizer.encode(a, { add_special_tokens: false })[0]);
  if (new Set(answerIds).size !== answerIds.length)
    throw new Error(`Answers must start with distinct tokens: ${answers} → ${answerIds}`);
  mirrorIndex = mirroredAnswer;

  self.postMessage({ type: "step", text: "Caching the system prompt" });
  const t1 = performance.now();
  await preparePrefix(system, examples);
  const prefixMs = performance.now() - t1;

  // WebGPU shaders compile on the first pass: warm up before the game starts.
  self.postMessage({ type: "step", text: "Compiling GPU shaders" });
  for (let i = 0; i < 2; i++) await decide("Place: room.\nCrosshair: empty, no enemy in sight.\n\nYour action?");

  self.postMessage({ type: "ready", model: modelId, loadMs, prefixMs, prefixTokens: prefix.ids.length, answerIds });
}

/* ═══════════════════════════ Forward passes ═══════════════════════════ */

const isQwen35 = () => model.config.model_type.startsWith("qwen3_5");
const encode = text => tokenizer.encode(text, { add_special_tokens: false });
const int64 = (values, dims) => new Tensor("int64", BigInt64Array.from(values, BigInt), dims);

/* Absolute positions: the suffix continues after the prefix. Qwen3.5 expects 3 rows (M-RoPE). */
function positions(start, n) {
  const p = Array.from({ length: n }, (_, i) => start + i);
  return isQwen35() ? int64([...p, ...p, ...p], [3, 1, n]) : int64(p, [1, n]);
}

function forward(ids, start, cache) {
  const n = ids.length;
  return model({
    input_ids: int64(ids, [1, n]),
    attention_mask: int64(new Array(start + n).fill(1), [1, start + n]),
    position_ids: positions(start, n),
    past_key_values: cache,
    num_logits_to_keep: new Tensor("int64", [1n], []),   // logits of the last token only
  });
}

/* The present.* outputs become the past_* inputs of a DynamicCache. */
function toCache(output) {
  const entries = {};
  for (const [name, t] of Object.entries(output)) {
    if (!name.startsWith("present")) continue;
    entries[name
      .replace("present_recurrent", "past_recurrent")
      .replace("present_conv", "past_conv")
      .replace("present", "past_key_values")] = t;
  }
  return new DynamicCache(entries);
}

async function release(output) {
  for (const [name, t] of Object.entries(output))
    if (name.startsWith("present") && t.location === "gpu-buffer") await t.dispose();
}

async function preparePrefix(system, examples) {
  const messages = [{ role: "system", content: system }];
  for (const ex of examples) messages.push({ role: "user", content: ex.state }, { role: "assistant", content: ex.answer });
  messages.push({ role: "user", content: MARKER });
  const text = tokenizer.apply_chat_template(messages,
    { tokenize: false, add_generation_prompt: true, enable_thinking: false });
  const i = text.indexOf(MARKER);
  template = { before: text.slice(0, i), after: text.slice(i + MARKER.length) };
  if (prefix) await prefix.cache.dispose();
  const ids = encode(template.before);
  prefix = { ids, cache: toCache(await forward(ids, 0, null)) };
}

/* ═══════════════════════════ Decision ═══════════════════════════ */

function softmax(logits) {
  const peak = Math.max(...logits);
  const weights = logits.map(v => Math.exp(v - peak));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

function readAnswers(logits) {
  let d = logits.data;
  if (logits.type === "float16" && d instanceof Uint16Array) d = logits.to("float32").data;
  const V = logits.dims.at(-1), base = d.length - V;
  let max = -Infinity;
  for (let i = base; i < base + V; i++) if (d[i] > max) max = d[i];
  let sum = 0;
  for (let i = base; i < base + V; i++) sum += Math.exp(d[i] - max);
  const raw = answerIds.map(id => Number(d[base + id]));
  // Share of the whole next-token distribution that lands on the answer words.
  const mass = raw.reduce((s, v) => s + Math.exp(v - max), 0) / sum;
  return { logits: raw, mass };
}

async function score(state) {
  const ids = encode(template.before + state + template.after);
  const n = prefix.ids.length;
  const reused = ids.length > n && prefix.ids.every((v, i) => ids[i] === v);
  const toCompute = reused ? ids.slice(n) : ids;
  const output = await forward(toCompute, reused ? n : 0, reused ? prefix.cache : null);
  const answers = readAnswers(output.logits);
  await release(output);
  return { ...answers, tokens: ids.length, computedTokens: toCompute.length, reused };
}

/* With a mirrored state, both versions are scored and their logits averaged (the mirrored one
   with Left and Right swapped back). A constant preference of the model for one side adds the
   same amount to both, so it cancels out exactly. */
async function decide(state, mirrored) {
  const t0 = performance.now();
  const a = await score(state);
  let logits = a.logits, mass = a.mass;
  if (mirrored) {
    const b = await score(mirrored);
    logits = a.logits.map((v, i) => (v + b.logits[mirrorIndex[i]]) / 2);
    mass = (a.mass + b.mass) / 2;
  }
  return {
    probs: softmax(logits), rawProbs: softmax(a.logits), logits, mass,
    ms: performance.now() - t0,
    tokens: a.tokens, computedTokens: a.computedTokens, reused: a.reused,
    prompt: template.before + state + template.after,
  };
}
