import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fetchProfitbaseFeed } from "./profitbaseFeed.js";
import { LiveGridClient } from "./livegridClient.js";

async function loadState(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { feeds: {}, regionId: null };
  }
}

async function saveState(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2));
}

/** Адрес картинки: в разных форматах фида это строка или { url, type } */
const imageUrl = (img) => (typeof img === "string" ? img : img?.url) || null;

/** Планировка лота: сначала явная «plan», иначе первая картинка */
export function planImage(offer) {
  const images = offer.images ?? [];
  // «plan floor» — поэтажный план, не планировка квартиры: нужен точный тип
  const plan = images.find((i) => typeof i === "object" && i?.type === "plan");
  return imageUrl(plan) || imageUrl(images[0]);
}

/**
 * Планировку качаем к себе только если её адрес у источника поменялся.
 * Раньше каждая синхронизация (каждые 6 часов) заново скачивала и сохраняла
 * планировку каждого лота: ~3–5 тыс. новых файлов за прогон в uploads,
 * при том что сами картинки не менялись.
 */
/**
 * Уже сохранённые планировки по адресу источника — из всего состояния.
 * Одна планировка повторяется на десятках этажей: файл на неё нужен один.
 */
export function storedPlansBySource(state) {
  const map = new Map();
  for (const bucket of Object.values(state?.feeds ?? {})) {
    for (const entry of Object.values(bucket ?? {})) {
      if (entry?.planSrc && entry?.planUrl) map.set(entry.planSrc, entry.planUrl);
    }
  }
  return map;
}

export function needsPlanUpload(entry, planUrl) {
  if (!planUrl) return false;
  return !(entry?.planSrc === planUrl && entry?.planUrl);
}

/** /uploads/media/x.png → <MEDIA_ROOT>/media/x.png (так их раздаёт API) */
export function localMediaPath(url, mediaRoot = process.env.MEDIA_ROOT) {
  if (!mediaRoot || typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const rel = url.slice("/uploads/".length);
  if (!rel || rel.includes("..")) return null;
  return join(mediaRoot, rel);
}

/**
 * Ключ квартиры для привязки лота к объявлению: корпус + номер.
 * В разных выгрузках корпус пишется как «Корпус 4» и «4» — служебные слова
 * отбрасываем. Номер квартиры сам по себе не уникален (повторяется в корпусах).
 */
export function lotKey(building, number) {
  const norm = (s) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/корпус|корп\.?|литер|дом|№/g, "")
      .replace(/[\s.]+/g, "");
  const n = norm(number);
  return n ? `${norm(building)}|${n}` : null;
}

const listingKey = (l) => lotKey(l.apartment?.buildingName ?? l.building?.name, l.apartment?.number);

/**
 * Лоты фида, которых нет в состоянии, привязываем к уже существующим
 * объявлениям ЖК по корпусу и номеру. Так состояние восстанавливается после
 * переезда сервера, а «Граф Толстой» (в фиде нет площадей, создать новые
 * объявления нельзя) снова получает цены и статусы.
 * Если ключ в фиде не уникален — не привязываем: лучше пропустить, чем перепутать.
 * Из нескольких копий одной квартиры берём ту, что на сайте, иначе последнюю обновлённую.
 * @returns {Map<string, number>} externalId → listingId
 */
export function bindOffers(offers, bucket, listings) {
  const tracked = new Set(Object.values(bucket ?? {}).map((e) => e?.listingId).filter(Boolean));
  const feedCount = new Map();
  for (const o of offers) {
    const k = lotKey(o.buildingName, o.number);
    if (k) feedCount.set(k, (feedCount.get(k) ?? 0) + 1);
  }
  // Из копий одной квартиры — та, что сейчас на сайте, затем последняя обновлённая
  const onShow = (l) => (l.status === "ACTIVE" || l.status === "RESERVED" ? 1 : 0);
  const better = (a, b) =>
    onShow(a) !== onShow(b) ? onShow(a) > onShow(b) : String(a.updatedAt ?? "") > String(b.updatedAt ?? "");
  const byKey = new Map();
  for (const l of listings) {
    if (tracked.has(l.id)) continue;
    const k = listingKey(l);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || better(l, prev)) byKey.set(k, l);
  }
  const bound = new Map();
  for (const o of offers) {
    if (bucket?.[o.externalId]?.listingId) continue;
    const k = lotKey(o.buildingName, o.number);
    if (!k || feedCount.get(k) !== 1) continue;
    const l = byKey.get(k);
    if (!l) continue;
    bound.set(o.externalId, l.id);
    byKey.delete(k);
  }
  return bound;
}

/**
 * Объявления ЖК, которые висят на витрине, хотя в фиде их уже нет:
 * старые копии с прошлых импортов и проданные лоты, пропавшие из выгрузки.
 * Объявления агентов и продавцов (у них есть владелец) не трогаем.
 */
export function staleListings(listings, liveIds) {
  return listings.filter(
    (l) =>
      (l.status === "ACTIVE" || l.status === "RESERVED") &&
      !liveIds.has(l.id) &&
      !l.ownerUserId &&
      !l.sellerId,
  );
}

/** Доля снимаемых, выше которой считаем, что фид отдал неполные данные, и ничего не снимаем */
const MAX_HIDE_SHARE = Number(process.env.SYNC_MAX_HIDE_SHARE || 0.6);

/**
 * Обложка ЖК — копия на нашем сервере, а не ссылка на сайт поставщика.
 * Фото, загруженное в админке, не перезаписываем.
 */
/** API обложек принимает только полный адрес: /uploads/… → https://сайт/uploads/… */
export function absoluteMediaUrl(url, site = process.env.PUBLIC_SITE_URL || "https://yugaktsent.neeklo.ru") {
  return typeof url === "string" && url.startsWith("/") ? `${site.replace(/\/$/, "")}${url}` : url;
}

async function syncCover(lg, state, blockId, src, skipMedia) {
  const covers = (state.covers ??= {});
  const saved = covers[blockId];
  const savedAbs = saved?.url ? absoluteMediaUrl(saved.url) : null;
  let current = null;
  try {
    current = await lg.blockCoverUrl(blockId);
  } catch {
    current = null;
  }
  // Наша обложка — пустая, ссылка поставщика или ранее скачанная нами копия
  const isOurs = !current || /profitbase\.ru\//i.test(current) || current === savedAbs || current === saved?.url;
  if (!isOurs) return "admin";
  if (saved?.src === src && savedAbs) {
    if (current !== savedAbs) await lg.setBlockCover(blockId, savedAbs);
    return "kept";
  }
  if (skipMedia) {
    await lg.setBlockCover(blockId, src);
    return "remote";
  }
  try {
    const url = await lg.uploadRemoteImage(src);
    covers[blockId] = { src, url };
    await lg.setBlockCover(blockId, absoluteMediaUrl(url));
    return "uploaded";
  } catch (err) {
    console.warn(`[profitbase-sync] обложка ЖК ${blockId} не скачана: ${err.message}`);
    return "failed";
  }
}

/**
 * Первый прогон после обновления: в состоянии ещё нет planSrc, но у объявления
 * в базе уже может быть планировка. Если её файл на диске есть — берём его,
 * а не качаем заново (на сервере мало места). Если файла нет (не доехал при
 * переезде сервера) — вернём null, и планировка загрузится заново.
 */
async function adoptStoredPlan(lg, entry) {
  if (!entry?.listingId || entry.planSrc) return null;
  try {
    const listing = await lg.api(`/listings/${entry.listingId}`);
    const stored = listing?.apartment?.planUrl;
    const path = localMediaPath(stored);
    return path && existsSync(path) ? stored : null;
  } catch {
    return null;
  }
}

export async function syncFeed(feedConfig, lg, state, feedKey) {
  const feedUrl = feedConfig.feed_url;
  if (!feedUrl) return { skipped: true, reason: "no feed_url" };

  if (feedConfig.regionId) {
    lg.regionId = feedConfig.regionId;
    lg.blocksByName.clear();
  } else {
    await lg.ensureRegion();
  }

  const blockName =
    feedConfig.block_name ||
    feedConfig.name ||
    feedConfig.development_name ||
    "ЖК";
  const offers = await fetchProfitbaseFeed(feedUrl);
  const block = await lg.ensureBlock(blockName);
  const bucket = state.feeds[feedKey] || (state.feeds[feedKey] = {});

  const skipMedia =
    process.env.FEED_SKIP_MEDIA === "1" || process.env.FEED_SKIP_MEDIA === "true";
  const plansBySource = storedPlansBySource(state);

  // Корпуса и обложку заводим один раз на фид, до разбора лотов:
  // из корпусов карточка ЖК берёт срок сдачи, из обложки — фото.
  const seenBuildings = new Map();
  for (const offer of offers) {
    if (!offer.buildingName) continue;
    if (!seenBuildings.has(offer.buildingName)) {
      seenBuildings.set(offer.buildingName, offer.completionQuarter ?? null);
    }
  }
  for (const [name, deadline] of seenBuildings) {
    await lg.ensureBuilding(block.id, name, deadline);
  }

  const cover = offers.find((o) => o.buildingImage)?.buildingImage;
  const coverState = cover ? await syncCover(lg, state, block.id, cover, skipMedia) : null;

  const blockListings = offers.length > 0 ? await lg.loadBlockListings(block.id) : [];
  const bound = bindOffers(offers, bucket, blockListings);
  for (const [externalId, listingId] of bound) bucket[externalId] = { listingId };

  const result = {
    feed: feedKey,
    block: blockName,
    total: offers.length,
    created: 0,
    updated: 0,
    skipped: 0,
    plansUploaded: 0,
    plansReused: 0,
    plansFailed: 0,
    withoutPlan: 0,
    hasCover: Boolean(cover),
    cover: coverState,
    bound: bound.size,
    hidden: 0,
    errors: [],
  };
  const liveIds = new Set();

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    try {
      // Существующее объявление обновляем даже без площади в фиде:
      // цена и статус важнее, а площадь в базе уже есть.
      const isUpdate = Boolean(bucket[offer.externalId]?.listingId);
      const payload = lg.buildApartmentPayload(offer, block.id, isUpdate);
      if (!payload) {
        result.skipped += 1;
        continue;
      }

      const existing = bucket[offer.externalId];
      const planSrc = planImage(offer);
      let planStored = null;
      if (!skipMedia && planSrc) {
        const adopted = await adoptStoredPlan(lg, existing);
        if (adopted) {
          planStored = adopted;
          plansBySource.set(planSrc, adopted);
          result.plansReused += 1;
        } else if (needsPlanUpload(existing, planSrc) && plansBySource.has(planSrc)) {
          planStored = plansBySource.get(planSrc);
          result.plansReused += 1;
        } else if (needsPlanUpload(existing, planSrc)) {
          try {
            planStored = await lg.uploadRemoteImage(planSrc);
            plansBySource.set(planSrc, planStored);
            result.plansUploaded += 1;
          } catch (err) {
            result.plansFailed += 1;
            console.warn(
              `[profitbase-sync] media skip ${offer.externalId}: ${err.message}`,
            );
          }
        } else {
          planStored = existing.planUrl;
        }
        if (planStored) payload.apartment.planUrl = planStored;
      }
      if (!planSrc) result.withoutPlan += 1;

      if (!existing?.listingId) {
        const created = await lg.createListing(payload);
        bucket[offer.externalId] = {
          listingId: created.id,
          price: offer.price,
          status: offer.status,
          ...(planStored ? { planSrc, planUrl: planStored } : {}),
        };
        result.created += 1;
      } else {
        await lg.updateListing(existing.listingId, {
          price: payload.price,
          status: payload.status,
          isPublished: payload.isPublished,
          apartment: payload.apartment,
        });
        bucket[offer.externalId].price = offer.price;
        bucket[offer.externalId].status = offer.status;
        if (planStored) {
          bucket[offer.externalId].planSrc = planSrc;
          bucket[offer.externalId].planUrl = planStored;
        }
        result.updated += 1;
      }
      liveIds.add(bucket[offer.externalId].listingId);

      if ((i + 1) % 25 === 0) {
        console.log(
          `[profitbase-sync] ${feedKey}: ${i + 1}/${offers.length} created=${result.created} updated=${result.updated}`,
        );
      }
    } catch (err) {
      result.errors.push({ externalId: offer.externalId, error: err.message });
      // Лот есть в фиде, просто не обновился — снимать его с витрины нельзя
      const id = bucket[offer.externalId]?.listingId;
      if (id) liveIds.add(id);
    }
  }

  // Пропущенные лоты (без цены, без площади) тоже есть в фиде — их не снимаем
  for (const offer of offers) {
    const id = bucket[offer.externalId]?.listingId;
    if (id) liveIds.add(id);
  }

  // Снимаем с витрины то, чего в фиде больше нет. Только при полном и
  // успешном прогоне: если фид пришёл урезанным, лучше ничего не трогать.
  const stale = staleListings(blockListings, liveIds);
  // База для проверки — сколько квартир на витрине или в фиде: после привязки
  // на сайт выходят лоты, которые до прогона были скрыты
  const onShow = Math.max(
    blockListings.filter((l) => l.status === "ACTIVE" || l.status === "RESERVED").length,
    liveIds.size,
  );
  if (stale.length > 0) {
    if (result.errors.length > result.total * 0.05) {
      console.warn(`[profitbase-sync] ${feedKey}: много ошибок, устаревшие не снимаем`);
    } else if (stale.length > onShow * MAX_HIDE_SHARE) {
      console.warn(
        `[profitbase-sync] ${feedKey}: к снятию ${stale.length} из ${onShow} — похоже на неполный фид, пропускаем`,
      );
    } else if (process.env.SYNC_HIDE_DRY_RUN === "1") {
      result.wouldHide = stale.length;
    } else {
      for (const l of stale) {
        try {
          await lg.hideListing(l.id);
          result.hidden += 1;
        } catch (err) {
          console.warn(`[profitbase-sync] не снято ${l.id}: ${err.message}`);
        }
      }
    }
  }

  if (feedConfig.id) {
    try {
      const status =
        result.total === 0
          ? "empty"
          : result.errors?.length
            ? "error"
            : "ok";
      await lg.markFeedSynced(feedConfig.id, {
        status,
        total: result.total,
        created: result.created,
        updated: result.updated,
        errors: result.errors?.length ?? 0,
      });
    } catch (err) {
      console.warn(`[profitbase-sync] mark-synced ${feedConfig.id}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Фиды, которые ждут внеочередной синхронизации: новые (ещё ни разу не
 * синхронизированы) и изменённые в админке после последнего прогона.
 * Кнопка «Синхронизировать» в админке просто обновляет запись фида.
 * Отметка о синхронизации сама обновляет запись, поэтому нужен запас в пару секунд.
 */
export function pendingFeedIds(rows) {
  return rows
    .filter((r) => r.isEnabled !== false)
    .filter((r) => {
      if (!r.lastSyncedAt) return true;
      return new Date(r.updatedAt).getTime() - new Date(r.lastSyncedAt).getTime() > 5000;
    })
    .map((r) => r.id);
}

/** Есть ли что синхронизировать вне расписания — для опроса из службы */
export async function findPendingFeeds() {
  const base = process.env.LG_API_BASE || "http://127.0.0.1:3025/api/v1";
  const lg = new LiveGridClient(base, requireEnv("LG_ADMIN_EMAIL"), requireEnv("LG_ADMIN_PASSWORD"));
  return pendingFeedIds(await lg.loadFeedLinks());
}

async function resolveFeeds(lg) {
  try {
    const rows = await lg.loadFeedLinks();
    if (Array.isArray(rows) && rows.length > 0) {
      console.log(`[profitbase-sync] loaded ${rows.length} feed(s) from API`);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        feed_url: row.feedUrl,
        block_name: row.blockName || row.name,
        regionId: row.regionId,
        region: row.region,
      }));
    }
  } catch (err) {
    console.warn(`[profitbase-sync] feed-links API unavailable: ${err.message}`);
  }

  if (process.env.FEEDS_JSON) {
    console.log("[profitbase-sync] using FEEDS_JSON env fallback");
    return JSON.parse(process.env.FEEDS_JSON);
  }

  return [];
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Не задана переменная окружения ${name} — укажите её в .env на сервере`,
    );
  }
  return v;
}

/**
 * Простая блокировка от параллельных прогонов.
 *
 * Без неё два запуска (служба по cron и ручной) читают одно состояние,
 * оба не находят объявления и создают их заново — так в каталоге появились
 * дубли на 889 лотов. Состояние в файле не спасает: его перезаписывает
 * тот, кто финишировал последним.
 */
async function withLock(stateFile, fn) {
  const { open, unlink, readFile } = await import("node:fs/promises");
  const lockPath = `${stateFile}.lock`;
  const STALE_MS = 30 * 60 * 1000;

  let handle;
  try {
    handle = await open(lockPath, "wx");
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    // Замок мог остаться от упавшего прогона: считаем его протухшим,
    // если процесса уже нет или он держится дольше получаса.
    let stale = true;
    try {
      const raw = await readFile(lockPath, "utf8");
      const { pid, startedAt } = JSON.parse(raw);
      const tooOld = Date.now() - Number(startedAt || 0) > STALE_MS;
      let alive = false;
      if (pid) {
        try {
          process.kill(Number(pid), 0);
          alive = true;
        } catch {
          alive = false;
        }
      }
      stale = tooOld || !alive;
    } catch {
      stale = true;
    }
    if (!stale) {
      console.log("[profitbase-sync] другой прогон уже идёт — пропускаем");
      return;
    }
    console.warn("[profitbase-sync] снимаю протухший замок");
    await unlink(lockPath).catch(() => {});
    handle = await open(lockPath, "wx");
  }

  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    await handle.close();
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

export async function runSync(opts = {}) {
  const stateFile = process.env.STATE_FILE || "./state.json";
  return withLock(stateFile, () => runSyncUnlocked(opts));
}

/** @param {{ persist?: Function, only?: number[] }} opts only — синхронизировать только эти фиды */
async function runSyncUnlocked({ persist, only } = {}) {
  const base = process.env.LG_API_BASE || "http://127.0.0.1:3025/api/v1";
  // Учётка только из окружения: значений по умолчанию быть не должно.
  const email = requireEnv("LG_ADMIN_EMAIL");
  const password = requireEnv("LG_ADMIN_PASSWORD");
  const stateFile = process.env.STATE_FILE || "./state.json";

  const lg = new LiveGridClient(base, email, password);
  await lg.login();
  // Справочник типов комнат нужен до разбора лотов: без него комнатность
  // некуда записать, и прайс по типам квартир в карточке остаётся пустым.
  await lg.ensureRoomTypes();

  const allFeeds = await resolveFeeds(lg);
  const feeds = only?.length ? allFeeds.filter((f) => only.includes(f.id)) : allFeeds;
  if (!Array.isArray(feeds) || feeds.length === 0) {
    console.log("[profitbase-sync] no feeds configured — nothing to sync");
    return;
  }

  const region = await lg.ensureRegion();

  const state = await loadState(stateFile);
  state.regionId = region.id;
  if (!state.feeds) state.feeds = {};

  console.log(
    `[profitbase-sync] region=${region.code} (${region.id}), feeds=${feeds.length}`,
  );

  for (let idx = 0; idx < feeds.length; idx++) {
    const feed = feeds[idx];
    const key = feed.id || feed.name || `feed-${idx}`;
    console.log(`[profitbase-sync] syncing "${key}"…`);
    // Один недоступный фид (битый сертификат, 404 у источника) не должен
    // останавливать синхронизацию остальных ЖК.
    let result;
    try {
      result = await syncFeed(feed, lg, state, key);
    } catch (err) {
      console.error(`[profitbase-sync] feed "${key}" failed: ${err.message}`);
      if (feed.id) {
        await lg.markFeedSynced(feed.id, { status: "error", total: 0, created: 0, updated: 0, errors: 1 }).catch(() => {});
      }
      continue;
    }
    console.log(`[profitbase-sync]   → ${JSON.stringify({ ...result, errors: result.errors?.slice(0, 3) })}`);
    if (persist) await persist(state);
    else await saveState(stateFile, state);
  }

  await saveState(stateFile, state);

  try {
    await lg.refreshCatalogCache();
    console.log("[profitbase-sync] catalog cache refreshed");
  } catch (err) {
    console.warn(`[profitbase-sync] refresh-cache failed: ${err.message}`);
  }

  try {
    await lg.regenerateSitemap();
    console.log("[profitbase-sync] sitemap regenerated");
  } catch (err) {
    console.warn(`[profitbase-sync] sitemap failed: ${err.message}`);
  }

  console.log(`[profitbase-sync] done @ ${new Date().toISOString()}`);
}
