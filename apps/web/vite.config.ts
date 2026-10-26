import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { isLocalTarget, stagingGuard } from "./staging-guard";

const repoRoot = path.resolve(__dirname, "../..");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const publicSiteUrl = (
    env.VITE_PUBLIC_SITE_URL ||
    env.PUBLIC_SITE_URL ||
    "https://yugaktsent.neeklo.ru"
  ).replace(/\/+$/, "");
  const defaultRegionCode = env.VITE_DEFAULT_REGION_CODE || "";
  /** Куда проксировать /api и /uploads в dev (по умолчанию локальный API) */
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";
  /** Dev смотрит в чужой (боевой) API — пускаем только чтение, см. staging-guard.ts */
  const stagingReadOnly = !isLocalTarget(apiProxyTarget) && env.STAGING_ALLOW_WRITES !== "1";

  return {
    envDir: repoRoot,
    define: {
      /** Время сборки фронта — в подвале админки, чтобы отличить старый dist на сервере */
      __LG_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      "import.meta.env.VITE_PUBLIC_SITE_URL": JSON.stringify(publicSiteUrl),
      "import.meta.env.VITE_DEFAULT_REGION_CODE": JSON.stringify(defaultRegionCode),
      "import.meta.env.VITE_STAGING_READONLY": JSON.stringify(mode !== "production" && stagingReadOnly ? "1" : ""),
    },
    server: {
      host: "::",
      port: 5173,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/uploads": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [stagingGuard(stagingReadOnly), react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
