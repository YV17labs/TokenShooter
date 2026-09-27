import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", ".venv/"] },
  js.configs.recommended,
  { files: ["src/**/*.js"], languageOptions: { globals: globals.browser } },
  { files: ["src/brain/worker.js"], languageOptions: { globals: globals.worker } },
  { files: ["tests/**/*.js", "scripts/**/*.js", "*.config.js"], languageOptions: { globals: globals.node } },
];
