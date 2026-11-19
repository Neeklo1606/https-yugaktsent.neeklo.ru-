#!/usr/bin/env node
/**
 * Подключение 10 фидов ССК по югу (решение заказчика 19.11.2026): Анапа, Новороссийск, Краснодар.
 * Создаёт недостающие регионы и записи feed_links через Admin API — те же проверки, что в админке
 * (SSRF, валидация). Повторный запуск ничего не дублирует: фид ищется по URL, регион по коду.
 *
 * По умолчанию — только показывает план. Запись: --apply.
 *
 * На сервере:
 *   DOTENV_CONFIG_PATH=/etc/yugaktsent/profitbase-sync.env \
 *     node -r dotenv/config deploy/yugaktsent/scripts/add-south-feeds.mjs [--apply]
 * Нужны LG_API_BASE, LG_ADMIN_EMAIL, LG_ADMIN_PASSWORD.
 */

const APPLY = process.argv.includes("--apply");

const REGIONS = [
  { code: "anapa", name: "Анапа" },
  { code: "novorossiysk", name: "Новороссийск", mapCenterLat: 44.7235, mapCenterLng: 37.7686 },
  { code: "krasnodar", name: "Краснодар", mapCenterLat: 45.0355, mapCenterLng: 38.9753 },
];

// JCAT-фиды ССК без токенов в адресе; блок = название ЖК на сайте. Лоты — проба 19.11.
const SSK = "https://bx.sskuban.ru/local/integrat/feed/jcat/";
const FEEDS = [
  { region: "anapa", name: "ССК · На высоком берегу", blockName: "На высоком берегу", id: "15005800" }, // 2012
  { region: "anapa", name: "ССК · Усадьба Гостагаевская", blockName: "Усадьба Гостагаевская", id: "9019077" }, // 1045
  { region: "anapa", name: "ССК · Мореград", blockName: "Мореград", id: "6135842" }, // 785
  { region: "anapa", name: "ССК · Корсаков", blockName: "Корсаков", id: "4275607" }, // 391
  { region: "novorossiysk", name: "ССК · Резиденция морей", blockName: "Резиденция морей", id: "7510490" }, // 1199
  { region: "novorossiysk", name: "ССК · Южно", blockName: "Южно", id: "23117073" }, // 267
  { region: "krasnodar", name: "ССК · Традиции", blockName: "Традиции", id: "14983571" }, // 307
  { region: "krasnodar", name: "ССК · Сердце", blockName: "Сердце", id: "53704" }, // 163
  { region: "krasnodar", name: "ССК · Фонтаны", blockName: "Фонтаны", id: "53706" }, // 59
  { region: "krasnodar", name: "ССК · Борский", blockName: "Борский", id: "23574554" }, // 52
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Не задана переменная окружения ${name}`);
    process.exit(1);
  }
  return v;
}

const base = (process.env.LG_API_BASE || "http://127.0.0.1:3025/api/v1").replace(/\/$/, "");

async function call(token, path, { method = "GET", body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const list = (r) => (Array.isArray(r) ? r : r?.data ?? []);

async function main() {
  const { accessToken } = await call(null, "/auth/login", {
    method: "POST",
    body: { email: requireEnv("LG_ADMIN_EMAIL"), password: requireEnv("LG_ADMIN_PASSWORD") },
  });

  const regions = list(await call(accessToken, "/admin/regions"));
  const regionId = {};
  for (const r of REGIONS) {
    const found = regions.find((x) => x.code === r.code);
    if (found) {
      regionId[r.code] = found.id;
      if (!found.isEnabled) {
        console.log(`регион ${r.code}: выключен → включить`);
        if (APPLY) await call(accessToken, `/admin/regions/${found.id}`, { method: "PATCH", body: { isEnabled: true } });
      } else console.log(`регион ${r.code}: есть (id ${found.id})`);
      continue;
    }
    console.log(`регион ${r.code}: создать «${r.name}»`);
    if (APPLY) {
      const created = await call(accessToken, "/admin/regions", { method: "POST", body: { ...r, isEnabled: true } });
      regionId[r.code] = created.id;
    }
  }

  const links = list(await call(accessToken, "/admin/feed-links"));
  let sortOrder = Math.max(0, ...links.map((l) => l.sortOrder ?? 0));
  for (const f of FEEDS) {
    const feedUrl = SSK + f.id;
    const existing = links.find((l) => l.feedUrl === feedUrl);
    if (existing) {
      console.log(`фид ${f.name}: уже есть (id ${existing.id}, регион ${existing.region?.code ?? existing.regionId})`);
      continue;
    }
    console.log(`фид ${f.name}: добавить → ${f.region}`);
    if (APPLY) {
      if (!regionId[f.region]) throw new Error(`нет региона ${f.region}`);
      await call(accessToken, "/admin/feed-links", {
        method: "POST",
        body: {
          regionId: regionId[f.region],
          name: f.name,
          feedUrl,
          blockName: f.blockName,
          provider: "profitbase",
          isEnabled: true,
          sortOrder: ++sortOrder,
          mediaMode: "remote",
        },
      });
    }
  }
  console.log(APPLY ? "Готово. Синхронизация подхватит фиды в течение 2 минут (опрос новых фидов)." : "Это план. Для записи: --apply");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
