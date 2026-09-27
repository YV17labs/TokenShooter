/* ═══════════════════════════ Brain, page side ═══════════════════════════
   Talks to the Web Worker that runs the model (worker.js). The worker, and the half megabyte of
   Transformers.js it imports, only start with the first load: a visitor who watches the bot never
   downloads them.
   `on` receives the worker's notices: progress(loaded, total), step(text), ready(info),
   prompt(info) and error(err) for failures that are not the answer to a decision. */

export class Brain {
  constructor(on) {
    this.on = on;
    this.worker = null;
    this.pending = new Map();          // decision id → { resolve, reject }
    this.nextId = 1;
  }

  start() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data }) => {
      if (data.type === "progress") this.on.progress(data.loaded, data.total);
      else if (data.type === "step") this.on.step(data.text);
      else if (data.type === "ready") this.on.ready(data);
      else if (data.type === "prompt") this.on.prompt(data);
      else if (data.type === "decision") { this.pending.get(data.id)?.resolve(data); this.pending.delete(data.id); }
      else if (data.type === "error") this.failed(data);
    };
  }

  failed(err) {
    const call = this.pending.get(err.id);
    if (!call) { this.on.error(err); return; }
    call.reject(new Error(err.message));
    this.pending.delete(err.id);
  }

  /* Downloads (or reads from the cache) the model, then caches the system prompt and examples. */
  load({ model, system, examples, answers, mirroredAnswer }) {
    this.start();
    this.worker.postMessage({ type: "load", model, system, examples, answers, mirroredAnswer });
  }

  /* A new system prompt: the worker rebuilds its cached prefix. */
  setPrompt(system, examples) {
    this.worker?.postMessage({ type: "prompt", system, examples });
  }

  /* One decision: the probability of each answer word, averaged with the mirrored state if given. */
  decide(state, mirrored) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "decide", id, state, mirrored });
    });
  }
}
