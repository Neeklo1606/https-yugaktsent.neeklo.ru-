#!/usr/bin/env node
/**
 * Описания ЖК (задача со встречи 23.11: «оригинальные, перефразированные описания в карточки»).
 * Источник: deploy/yugaktsent/content/complex-descriptions.json — тексты своими словами,
 * у каждого ЖК список источников и пометка надёжности.
 *
 * Пишет через Admin API (те же проверки, что в админке):
 *   - описание — только если у ЖК описания нет (правки менеджера не трогаем; --force перезапишет);
 *   - подзаголовок, преимущества, застройщик текстом — в blocks.content, остальное содержимое сохраняется;
 *   - адрес — только если у ЖК адреса нет и надёжность не low.
 * Координаты — только если у ЖК их нет и в файле есть точка, проверенная геокодером (дом или короткая
 * улица в своём городе); длинные трассы и сомнительные адреса в файл не попадают.
 *
 * По умолчанию только показывает план. Запись: --apply.
 *   DOTENV_CONFIG_PATH=/etc/yugaktsent/profitbase-sync.env \
 *     node -r dotenv/config deploy/yugaktsent/scripts/apply-complex-descriptions.mjs [--apply] [--force]
 * Нужны LG_API_BASE, LG_ADMIN_EMAIL, LG_ADMIN_PASSWORD.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const here = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(here, "../content/complex-descriptions.json"), "utf8"));

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Нет переменной ${name}`);
    process.exit(1);
  }
  return v;
}
const BASE = requireEnv("LG_API_BASE").replace(/\/$/, "");
let token = null;

async function api(path, { method = "GET", body } = {}) {
  if (!token && !path.startsWith("/auth/")) {
    const r = await api("/auth/login", {
      method: "POST",
      body: { email: requireEnv("LG_ADMIN_EMAIL"), password: requireEnv("LG_ADMIN_PASSWORD") },
    });
    token = r.accessToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

let changed = 0;
for (const it of items) {
  let pub;
  try {
    pub = await api(`/blocks/${encodeURIComponent(it.slug)}`);
  } catch (e) {
    console.log(`— ${it.slug}: нет на сайте (${e.message.slice(0, 80)})`);
    continue;
  }
  const block = await api(`/admin/blocks/${pub.id}`);
  const content = block.content && typeof block.content === "object" ? { ...block.content } : {};
  const patch = {};
  const plan = [];

  if (it.description && (FORCE || !block.description?.trim())) {
    patch.description = it.description.trim();
    plan.push(`описание ${patch.description.length} зн.`);
  }
  let contentChanged = false;
  if (it.tagline && (FORCE || !content.tagline)) {
    content.tagline = it.tagline;
    contentChanged = true;
    plan.push("подзаголовок");
  }
  if (it.highlights?.length && (FORCE || !content.highlights?.length)) {
    content.highlights = it.highlights;
    contentChanged = true;
    plan.push(`преимущества ×${it.highlights.length}`);
  }
  if (it.builder && !block.builderId && it.confidence !== "low" && (FORCE || !content.builderName)) {
    content.builderName = it.builder;
    contentChanged = true;
    plan.push(`застройщик «${it.builder}»`);
  }
  if (contentChanged) patch.content = content;
  if (it.lat && it.lng && (block.latitude == null || block.longitude == null)) {
    patch.latitude = it.lat;
    patch.longitude = it.lng;
    plan.push(`координаты ${it.lat}, ${it.lng}`);
  }
  if (it.address && it.confidence !== "low" && !(block.addresses?.length > 0)) {
    patch.address = it.address;
    plan.push(`адрес «${it.address}»`);
  }

  if (!plan.length) {
    console.log(`= ${it.slug}: всё уже заполнено`);
    continue;
  }
  console.log(`${APPLY ? "✓" : "·"} ${it.slug} (#${pub.id}, надёжность ${it.confidence}): ${plan.join(", ")}`);
  if (APPLY) {
    await api(`/admin/blocks/${pub.id}`, { method: "PUT", body: patch });
    changed += 1;
  }
}
console.log(APPLY ? `Обновлено ЖК: ${changed}` : "Это план. Для записи добавьте --apply");
