#!/usr/bin/env node
/**
 * Справочник отделок для квартир из фидов (служба синхронизации сопоставляет <renovation>
 * «предчистовая отделка» и т. п. с этими записями). Создаёт только недостающие, повторный запуск
 * ничего не дублирует. По умолчанию — план, запись: --apply.
 *   DOTENV_CONFIG_PATH=/etc/yugaktsent/profitbase-sync.env \
 *     node -r dotenv/config deploy/yugaktsent/scripts/seed-finishings.mjs [--apply]
 */
const APPLY = process.argv.includes("--apply");
const NAMES = ["Без отделки", "Черновая", "Предчистовая", "Чистовая", "Под ключ"];
const BASE = (process.env.LG_API_BASE || "").replace(/\/$/, "");
if (!BASE || !process.env.LG_ADMIN_EMAIL || !process.env.LG_ADMIN_PASSWORD) {
  console.error("Нужны LG_API_BASE, LG_ADMIN_EMAIL, LG_ADMIN_PASSWORD");
  process.exit(1);
}
let token = null;
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
token = (await api("/auth/login", { method: "POST", body: { email: process.env.LG_ADMIN_EMAIL, password: process.env.LG_ADMIN_PASSWORD } })).accessToken;
const existing = await api("/admin/reference/finishings");
const have = new Set((Array.isArray(existing) ? existing : existing.data ?? []).map((r) => String(r.name).trim().toLowerCase()));
for (const name of NAMES) {
  if (have.has(name.toLowerCase())) {
    console.log(`= ${name}`);
    continue;
  }
  console.log(`${APPLY ? "+" : "·"} ${name}`);
  if (APPLY) await api("/admin/reference/finishings", { method: "POST", body: { name } });
}
if (!APPLY) console.log("Это план. Для записи добавьте --apply");
