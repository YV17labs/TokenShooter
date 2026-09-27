import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig } from "vite";

/* ONNX Runtime points to its WebAssembly engine next to its own code, so the build would copy that
   27 MB file. Transformers.js loads it from the jsDelivr CDN instead (compressed, with the right
   MIME type, pinned to the bundled version): the copy would never be requested. */
const dropUnusedWasm = {
  name: "drop-unused-wasm",
  generateBundle(_, bundle) {
    for (const name of Object.keys(bundle)) if (name.endsWith(".wasm")) delete bundle[name];
  },
};

/* The picture that link previews show (Open Graph, X). It stays in assets/ with the README images,
   and ships next to the page, whose meta tags point to it. */
const socialPreview = {
  name: "social-preview",
  generateBundle() {
    const source = readFileSync(new URL("./assets/social-preview.png", import.meta.url));
    this.emitFile({ type: "asset", fileName: "social-preview.png", source });
  },
};

/* Minifying drops the license headers of the bundled packages, and their licenses ask for them to
   travel with the code. This writes the license and notice files of every package that ends up in
   the page or in the worker to third-party-licenses.md. Vite's own `build.license` misses the
   worker, which is bundled separately. */
function bundledLicenses() {
  // Packages whose published build already contains the code of other packages.
  const INLINED = { "@huggingface/transformers": ["@huggingface/jinja", "@huggingface/tokenizers"] };
  // MIT packages published without their license file: the copyright line at the top of their sources.
  const MIT_WITHOUT_FILE = {
    "onnxruntime-common": "Copyright (c) Microsoft Corporation",
    "onnxruntime-web": "Copyright (c) Microsoft Corporation",
  };
  const packages = new Map();                            // package folder → its package.json

  function packageDir(id) {
    let dir = dirname(id.split("?")[0]);
    while (dir.includes("/node_modules/")) {
      const file = join(dir, "package.json");
      if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).version) return dir;  // not a { "type": "module" } stub
      dir = dirname(dir);
    }
    return null;
  }

  function add(dir) {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    packages.set(dir, pkg);
    const root = dir.slice(0, dir.lastIndexOf("/node_modules/") + "/node_modules/".length);
    for (const name of INLINED[pkg.name] ?? []) {
      const nested = join(dir, "node_modules", name);
      add(existsSync(nested) ? nested : join(root, name));
    }
  }

  function collect(bundle) {
    for (const chunk of Object.values(bundle)) {
      for (const id of chunk.moduleIds ?? []) {
        const dir = id.includes("/node_modules/") && packageDir(id);
        if (dir) add(dir);
      }
    }
  }

  function render() {
    const parts = ["# Third-party licenses\n\nThis site bundles the packages below. Each one is listed with its license and notice files.\n"];
    const sorted = [...packages].sort(([, a], [, b]) => a.name.localeCompare(b.name));
    for (const [dir, pkg] of sorted) {
      parts.push(`## ${pkg.name} ${pkg.version} (${pkg.license})\n`);
      const files = readdirSync(dir).filter(f => /^(licen[sc]e|copying|notice)/i.test(f)).sort();
      const texts = files.map(f => readFileSync(join(dir, f), "utf8"));
      if (!texts.length && pkg.license === "MIT" && MIT_WITHOUT_FILE[pkg.name]) {
        texts.push(readFileSync(new URL("./LICENSE", import.meta.url), "utf8").replace(/^Copyright .*$/m, MIT_WITHOUT_FILE[pkg.name]));
      }
      if (!texts.length) throw new Error(`${pkg.name} has no license file: add its text before publishing.`);
      for (const text of texts) parts.push("```text\n" + text.trim() + "\n```\n");
    }
    return parts.join("\n");
  }

  return {
    worker: { name: "collect-worker-licenses", generateBundle: (_, bundle) => collect(bundle) },
    page: {
      name: "bundled-licenses",
      generateBundle(_, bundle) {                        // the worker is bundled before the page
        collect(bundle);
        this.emitFile({ type: "asset", fileName: "third-party-licenses.md", source: render() });
      },
    },
  };
}

const licenses = bundledLicenses();

export default defineConfig({
  plugins: [dropUnusedWasm, socialPreview, licenses.page],
  // Relative asset URLs: the built site works from any folder of a website, not only its root.
  base: "./",
  // The browser caches the model per address: port 8000 is the one the demo has always used
  // locally, so an existing download is not repeated.
  server: { port: 8000 },
  preview: { port: 8000 },
  // The brain worker is an ES module: it imports Transformers.js.
  worker: { format: "es", plugins: () => [licenses.worker] },
  build: {
    // three.js (main bundle) and Transformers.js (worker) are large by nature; above this, warn.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ["tests/**/*.test.js"],
  },
});
