import "dotenv/config";
import cron from "node-cron";
import { runSync, findPendingFeeds } from "./syncFeed.js";

const args = process.argv.slice(2);

async function waitForApi(maxAttempts = 30) {
  const base = process.env.LG_API_BASE || "http://127.0.0.1:3025/api/v1";
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${base.replace(/\/api\/v1$/, "")}/api/v1/health`);
      if (res.ok) return;
    } catch {
      /* API still starting */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("API сайта не отвечает");
}

async function runOnce(opts) {
  console.log(`[profitbase-sync] run started @ ${new Date().toISOString()}${opts?.only ? ` only=${opts.only.join(",")}` : ""}`);
  try {
    await waitForApi();
    await runSync(opts);
  } catch (err) {
    console.error("[profitbase-sync] fatal:", err.message);
    throw err;
  }
}

/**
 * Новый или изменённый в админке фид не ждёт расписания (раз в 6 часов):
 * служба раз в пару минут проверяет, есть ли такие, и синхронизирует только их.
 * Параллельный запуск исключает замок в runSync.
 */
function watchPending() {
  const everyMs = Number(process.env.PENDING_POLL_SECONDS || 120) * 1000;
  setInterval(async () => {
    try {
      const ids = await findPendingFeeds();
      if (ids.length > 0) await runOnce({ only: ids });
    } catch (err) {
      console.warn(`[profitbase-sync] pending check: ${err.message}`);
    }
  }, everyMs);
}

if (args.includes("--watch-cron")) {
  const schedule = process.env.CRON_SCHEDULE || "0 */6 * * *";
  console.log(`[profitbase-sync] cron "${schedule}"`);
  cron.schedule(schedule, () => {
    runOnce().catch((err) => console.error("[profitbase-sync] unhandled:", err));
  });
  runOnce().catch((err) => console.error("[profitbase-sync] unhandled:", err));
  watchPending();
} else {
  runOnce()
    .catch((err) => {
      console.error("[profitbase-sync] unhandled:", err);
      process.exitCode = 1;
    });
}
