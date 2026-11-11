/**
 * Сборка пререндера разметки (Node). Всё в один файл, без node_modules на сервере:
 *   vite build --config vite.ssr.config.ts  →  dist-ssr/prerender-entry.js
 */
import { defineConfig, mergeConfig, type ConfigEnv } from "vite";
import base from "./vite.config";

export default defineConfig((env: ConfigEnv) =>
  mergeConfig(typeof base === "function" ? base(env) : base, {
    ssr: { noExternal: true, target: "node" },
    publicDir: false,
    build: {
      ssr: "src/ssr/prerender-entry.tsx",
      outDir: "dist-ssr",
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: { output: { format: "esm", inlineDynamicImports: true, entryFileNames: "prerender-entry.mjs" } },
    },
  }),
);
