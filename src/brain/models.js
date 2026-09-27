/* ═══════════════════════════ Models the visitor can pick ═══════════════════════════ */

export const MODELS = {
  "onnx-community/Qwen3.5-0.8B-ONNX-OPT": { name: "Qwen3.5 0.8B", size: "600 MB", bytes: 602e6 },
  "onnx-community/Qwen3.5-2B-ONNX-OPT": { name: "Qwen3.5 2B", size: "1.4 GB", bytes: 1402e6 },
};

/* Transformers.js stores each file in the Cache API under its Hugging Face URL. */
export async function isCached(id) {
  try {
    const cache = await caches.open("transformers-cache");
    return !!(await cache.match(`https://huggingface.co/${id}/resolve/main/onnx/decoder_model_merged_q4f16.onnx_data`));
  } catch {
    return false;
  }
}
