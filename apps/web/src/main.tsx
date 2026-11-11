import { createRoot } from "react-dom/client";
import { captureUtmFromLocation } from "@/shared/lib/utm";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import "./shared/lib/boot-diagnostics";
import { reloadForStaleChunks } from "./shared/lib/lazy-route";

// Vite не смог догрузить чанк (вкладка открыта со старой версии сайта) — берём свежую
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForStaleChunks()) event.preventDefault();
});

const sentryDsn = (import.meta.env.VITE_SENTRY_DSN_WEB as string | undefined)?.trim();

if (sentryDsn) {
  const tracesSampleRate = Math.min(
    1,
    Math.max(0, Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1") || 0.1),
  );
  Sentry.init({
    dsn: sentryDsn,
    environment:
      (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined)?.trim() ||
      import.meta.env.MODE,
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate,
  });
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Root element "#root" not found');
}

const app = <App />;

captureUtmFromLocation();
createRoot(rootEl).render(
  sentryDsn ? (
    <Sentry.ErrorBoundary fallback={<p>Что-то пошло не так. Обновите страницу.</p>}>{app}</Sentry.ErrorBoundary>
  ) : (
    app
  ),
);
