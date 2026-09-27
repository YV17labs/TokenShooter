/* ═══════════════════════════ Small DOM helpers ═══════════════════════════ */

export const $ = id => document.getElementById(id);

export const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* Per-viewer conveniences only: the page behaves the same when storage is unavailable. */
export const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
