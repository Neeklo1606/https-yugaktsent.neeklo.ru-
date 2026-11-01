import { File } from "node:buffer";

const OFFER_TO_LISTING = {
  available: { status: "ACTIVE", isPublished: true },
  reserved: { status: "RESERVED", isPublished: true },
  sold: { status: "SOLD", isPublished: false },
  closed: { status: "INACTIVE", isPublished: false },
};

export class LiveGridClient {
  constructor(baseUrl, email, password) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.email = email;
    this.password = password;
    this.token = null;
    this.regionId = null;
    this.blocksByName = new Map();
  }

  async login() {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Login failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    this.token = data.accessToken;
    return this.token;
  }

  async api(path, { method = "GET", body } = {}) {
    if (!this.token) await this.login();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      await this.login();
      return this.api(path, { method, body });
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async loadFeedLinks() {
    const rows = await this.api("/admin/feed-links?enabled=1");
    return Array.isArray(rows) ? rows : [];
  }

  async markFeedSynced(feedLinkId, stats = {}) {
    return this.api(`/admin/feed-links/${feedLinkId}/mark-synced`, {
      method: "POST",
      body: stats,
    });
  }

  async refreshCatalogCache() {
    return this.api("/admin/feed-import/refresh-cache", { method: "POST", body: {} });
  }

  /** Sitemap квартир — снимок; без пересборки в нём остаются проданные и снятые лоты */
  async regenerateSitemap() {
    return this.api("/admin/sitemap/generate", { method: "POST", body: {} });
  }

  async ensureRegion() {
    const code = process.env.YUGAKTSENT_REGION_CODE || "anapa";
    const name = process.env.YUGAKTSENT_REGION_NAME || "Анапа";
    const lat = Number(process.env.YUGAKTSENT_MAP_LAT || 44.895);
    const lng = Number(process.env.YUGAKTSENT_MAP_LNG || 37.3163);

    const regions = await this.api("/admin/regions");
    const list = Array.isArray(regions) ? regions : regions?.data ?? [];
    let region = list.find((r) => r.code === code);
    if (!region) {
      region = await this.api("/admin/regions", {
        method: "POST",
        body: {
          code,
          name,
          isEnabled: true,
          mapCenterLat: lat,
          mapCenterLng: lng,
          publicSiteUrl: process.env.PUBLIC_SITE_URL || "https://yugaktsent.neeklo.ru",
        },
      });
      console.log(`[profitbase-sync] created region ${code} id=${region.id}`);
    }
    this.regionId = region.id;
    return region;
  }

  slugify(name) {
    return String(name)
      .toLowerCase()
      .replace(/&amp;/g, "and")
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "complex";
  }

  async ensureBlock(name) {
    if (this.blocksByName.has(name)) return this.blocksByName.get(name);
    const blocksResp = await this.api(`/admin/blocks?region_id=${this.regionId}&per_page=200`);
    const blocks = Array.isArray(blocksResp?.data)
      ? blocksResp.data
      : Array.isArray(blocksResp)
        ? blocksResp
        : blocksResp?.items ?? [];

    let block = blocks.find((b) => b.name === name);
    if (!block) {
      block = await this.api("/admin/blocks", {
        method: "POST",
        body: {
          regionId: this.regionId,
          name,
          slug: this.slugify(name),
          status: "BUILDING",
          dataSource: "MANUAL",
        },
      });
      console.log(`[profitbase-sync] created block "${name}" id=${block.id}`);
    }
    this.blocksByName.set(name, block);
    return block;
  }

  async uploadRemoteImage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      (url.match(/\.png(\?|$)/i) ? "image/png" : "image/jpeg");
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const filename = `profitbase-${Date.now()}.${ext}`;
    const form = new FormData();
    form.append("file", new File([buf], filename, { type: contentType }));

    // Прогон по большому фиду идёт дольше, чем живёт токен. В api()
    // переавторизация уже была, а загрузка файлов ходила мимо неё —
    // и со второго часа все картинки отваливались по 401.
    const send = () =>
      fetch(`${this.baseUrl}/admin/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
      });

    let uploadRes = await send();
    if (uploadRes.status === 401) {
      await this.login();
      uploadRes = await send();
    }
    if (!uploadRes.ok) {
      const t = await uploadRes.text();
      throw new Error(`upload failed: HTTP ${uploadRes.status} ${t.slice(0, 200)}`);
    }
    const data = await uploadRes.json();
    return data.url || data.publicUrl || data.path;
  }

  /**
   * Справочник типов комнат: заводим недостающие и держим карту
   * «число комнат → id». Без неё комнатность не доезжает до базы,
   * и карточка не может показать прайс по типам квартир.
   */
  async ensureRoomTypes() {
    if (this.roomTypeByRooms) return this.roomTypeByRooms;

    const NAMES = [
      [0, 'Студия'],
      [1, '1-комнатная'],
      [2, '2-комнатная'],
      [3, '3-комнатная'],
      [4, '4-комнатная'],
      [5, '5-комнатная'],
    ];

    let existing = [];
    try {
      existing = (await this.api('/admin/reference/room-types')) ?? [];
    } catch {
      existing = [];
    }

    const byName = new Map(existing.map((r) => [String(r.name).trim().toLowerCase(), r.id]));
    const map = new Map();

    for (const [rooms, name] of NAMES) {
      let id = byName.get(name.toLowerCase());
      if (!id) {
        try {
          const created = await this.api('/admin/reference/room-types', {
            method: 'POST',
            body: { name, nameOne: name },
          });
          id = created?.id;
        } catch (err) {
          console.warn(`[sync] не удалось завести тип комнат «${name}»: ${err.message}`);
        }
      }
      if (id) map.set(rooms, id);
    }

    this.roomTypeByRooms = map;
    return map;
  }

  /**
   * @param {boolean} isUpdate Для существующего объявления площадь
   *   необязательна, для нового — обязательна по контракту API.
   */
  /**
   * Корпус со сроком сдачи. Из него карточка ЖК берёт строку «1 кв. 2027»:
   * без корпусов срок сдачи показать неоткуда.
   * Повторные вызовы не плодят корпуса — ищем по имени внутри ЖК.
   */
  /**
   * API корпусов принимает срок сдачи датой YYYY-MM-DD, а в фидах он приходит
   * текстом «1 кв. 2027». Переводим в первый месяц квартала: витрина обратно
   * считает квартал из месяца, так что подпись получается та же.
   */
  static deadlineToDate(label) {
    if (!label) return null;
    const raw = String(label).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const q = raw.match(/(\d)\s*кв\.?\s*(\d{4})/i);
    if (q) {
      const month = String((Number(q[1]) - 1) * 3 + 1).padStart(2, "0");
      return `${q[2]}-${month}-01`;
    }
    const yearOnly = raw.match(/^(\d{4})$/);
    if (yearOnly) return `${yearOnly[1]}-01-01`;
    return null;
  }

  async ensureBuilding(blockId, name, deadlineLabel) {
    if (!name) return null;
    this.buildingsByBlock ??= new Map();
    const cacheKey = `${blockId}:${name}`;
    if (this.buildingsByBlock.has(cacheKey)) return this.buildingsByBlock.get(cacheKey);

    let found = null;
    try {
      const list = await this.api(`/admin/buildings?block_id=${blockId}&per_page=200`);
      const rows = Array.isArray(list) ? list : (list?.data ?? []);
      found = rows.find((b) => String(b.name).trim() === String(name).trim()) ?? null;
    } catch {
      found = null;
    }

    const deadline = LiveGridClient.deadlineToDate(deadlineLabel);
    const payload = {
      regionId: this.regionId,
      blockId,
      name,
      deadline: deadline ?? undefined,
    };

    try {
      if (found) {
        // Срок сдачи мог измениться между прогонами
        if (deadline && String(found.deadline ?? "").slice(0, 10) !== deadline) {
          found = await this.api(`/admin/buildings/${found.id}`, {
            method: "PATCH",
            body: { deadline },
          });
        }
      } else {
        found = await this.api("/admin/buildings", { method: "POST", body: payload });
      }
    } catch (err) {
      console.warn(`[sync] корпус «${name}» не заведён: ${err.message}`);
      found = null;
    }

    this.buildingsByBlock.set(cacheKey, found);
    return found;
  }

  /** Обложка ЖК: ставится один раз за прогон, адрес — уже сохранённый у нас файл */
  async setBlockCover(blockId, url) {
    if (!url) return;
    this.coversSet ??= new Set();
    if (this.coversSet.has(blockId)) return;
    this.coversSet.add(blockId);
    try {
      await this.api(`/admin/blocks/${blockId}/cover`, { method: "PUT", body: { url } });
    } catch (err) {
      console.warn(`[sync] обложка ЖК ${blockId} не поставлена: ${err.message}`);
    }
  }

  /** Текущая обложка ЖК (первый рендер) — чтобы не затирать фото, загруженное в админке */
  async blockCoverUrl(blockId) {
    const block = await this.api(`/admin/blocks/${blockId}`);
    const images = (block?.images ?? []).filter((i) => i.kind === "RENDER");
    return images[0]?.url ?? null;
  }

  /** Все квартиры ЖК в любом статусе: для привязки лотов фида и снятия устаревших */
  async loadBlockListings(blockId) {
    const out = [];
    for (let page = 1; page < 100; page++) {
      const resp = await this.api(
        `/admin/listings?block_id=${blockId}&kind=APARTMENT&statuses=ACTIVE,RESERVED,SOLD,INACTIVE&admin_view=true&per_page=200&page=${page}`,
      );
      const rows = Array.isArray(resp?.data) ? resp.data : [];
      out.push(...rows);
      const totalPages = resp?.meta?.total_pages ?? 1;
      if (page >= totalPages || rows.length === 0) break;
    }
    return out;
  }

  /** Снять с витрины: данные остаются в базе, в админке объявление видно как неактивное */
  async hideListing(listingId) {
    return this.updateListing(listingId, { status: "INACTIVE", isPublished: false });
  }

  buildApartmentPayload(offer, blockId, isUpdate = false) {
    const vis = OFFER_TO_LISTING[offer.status] ?? OFFER_TO_LISTING.available;
    if (!offer.price || offer.price <= 0) return null;

    // Площадь не выдумываем: раньше здесь стояла единица, и 658 объявлений
    // уехали в базу с площадью 1 м², а карточки показывали это рядом с ценой.
    const rawArea = offer.area || offer.livingArea || null;
    const areaTotal = rawArea && rawArea >= 10 ? rawArea : null;
    // Без площади новое объявление создать нельзя, а у существующего
    // можно обновить цену и статус, не трогая площадь.
    if (!areaTotal && !isUpdate) return null;

    const roomTypeId =
      offer.rooms != null && this.roomTypeByRooms
        ? this.roomTypeByRooms.get(Math.min(offer.rooms, 5))
        : undefined;

    return {
      regionId: this.regionId,
      blockId,
      price: offer.price,
      status: vis.status,
      isPublished: vis.isPublished,
      apartment: {
        areaTotal: areaTotal ?? undefined,
        roomTypeId: roomTypeId ?? undefined,
        areaKitchen: offer.kitchenArea ?? undefined,
        floor: offer.floor ?? undefined,
        floorsTotal: offer.floorsTotal ?? undefined,
        marketSegment: "NEW_BUILDING",
        buildingName: offer.buildingName ?? undefined,
        number: offer.number ?? undefined,
      },
    };
  }

  async createListing(payload) {
    return this.api("/admin/listings/manual-apartment", {
      method: "POST",
      body: payload,
    });
  }

  async updateListing(listingId, payload) {
    return this.api(`/admin/listings/${listingId}/manual-apartment`, {
      method: "PATCH",
      body: payload,
    });
  }
}

export { OFFER_TO_LISTING };
