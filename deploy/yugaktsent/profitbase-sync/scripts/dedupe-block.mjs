/**
 * Разовая чистка ЖК, чей фид недоступен и синхронизация его не обновляет
 * (на 31.10.2026 — «Хозяин Морей»):
 *  - одна и та же квартира (корпус + номер + площадь) из повторных импортов
 *    висит на сайте дважды → оставляем копию с живой планировкой, иначе свежую;
 *  - кладовые на подземных этажах заведены студиями → снимаем с витрины квартир.
 * Ничего не удаляет: объявления переводятся в «неактивные» через админский API.
 *
 *   node --env-file=/etc/yugaktsent/profitbase-sync.env scripts/dedupe-block.mjs <blockId>          # только подсчёт
 *   node --env-file=/etc/yugaktsent/profitbase-sync.env scripts/dedupe-block.mjs <blockId> --apply
 */
import { existsSync } from "node:fs";
import { LiveGridClient } from "../src/livegridClient.js";
import { lotKey, localMediaPath } from "../src/syncFeed.js";

const blockId = Number(process.argv[2]);
const apply = process.argv.includes("--apply");
if (!blockId) throw new Error("Укажите id ЖК");

const lg = new LiveGridClient(
  process.env.LG_API_BASE || "http://127.0.0.1:3025/api/v1",
  process.env.LG_ADMIN_EMAIL,
  process.env.LG_ADMIN_PASSWORD,
);
const all = await lg.loadBlockListings(blockId);
const onShow = all.filter((l) => (l.status === "ACTIVE" || l.status === "RESERVED") && !l.ownerUserId && !l.sellerId);

const planOk = (l) => {
  const p = localMediaPath(l.apartment?.planUrl);
  return Boolean(p && existsSync(p));
};
const area = (l) => Number(l.apartment?.areaTotal ?? 0);
const isStorage = (l) => (l.apartment?.floor ?? 1) < 1 && area(l) > 0 && area(l) < 20;

const groups = new Map();
for (const l of onShow) {
  const k = `${lotKey(l.apartment?.buildingName ?? l.building?.name, l.apartment?.number)}|${area(l).toFixed(1)}`;
  groups.set(k, [...(groups.get(k) ?? []), l]);
}
const duplicates = [];
for (const list of groups.values()) {
  if (list.length < 2) continue;
  list.sort((a, b) => Number(planOk(b)) - Number(planOk(a)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  duplicates.push(...list.slice(1));
}
const dupIds = new Set(duplicates.map((l) => l.id));
const storage = onShow.filter((l) => isStorage(l) && !dupIds.has(l.id));
const keep = onShow.length - duplicates.length - storage.length;

console.log(
  JSON.stringify({
    blockId,
    onShow: onShow.length,
    duplicates: duplicates.length,
    storage: storage.length,
    remain: keep,
    remainWithPlanFile: onShow.filter((l) => !dupIds.has(l.id) && !isStorage(l) && planOk(l)).length,
  }),
);

if (apply) {
  let hidden = 0;
  for (const l of [...duplicates, ...storage]) {
    try {
      await lg.hideListing(l.id);
      hidden += 1;
    } catch (err) {
      console.warn(`не снято ${l.id}: ${err.message}`);
    }
  }
  await lg.refreshCatalogCache().catch(() => {});
  console.log(`снято ${hidden}`);
}
