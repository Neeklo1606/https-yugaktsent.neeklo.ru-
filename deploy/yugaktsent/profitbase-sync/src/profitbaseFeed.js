import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { gunzipSync } from "node:zlib";
import { safeFetch } from "./safeFetch.js";
import { parseDomclickXml, isDomclickXml } from "./domclickFeed.js";
import { parseCianXml, isCianXml } from "./cianFeed.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

const HUMAN_STATUS_MAP = {
  свободно: "available",
  free: "available",
  available: "available",
  продано: "sold",
  sold: "sold",
  забронировано: "reserved",
  reserved: "reserved",
  "постоянная бронь": "reserved",
  "закрыто для продажи": "closed",
  "не для продажи": "closed",
};

function text(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return value["#text"] ?? null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function num(value) {
  const raw = typeof value === "object" ? text(value) : value;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function customFields(offer) {
  const raw = offer["custom-field"];
  if (!raw) return {};
  const list = Array.isArray(raw) ? raw : [raw];
  const out = {};
  for (const item of list) {
    const name = text(item?.name);
    if (!name) continue;
    out[name] = text(item?.value);
  }
  return out;
}

function normalizeStatus(offer) {
  const code = (text(offer.status) ?? "").toUpperCase();
  if (code.startsWith("AVAILABLE")) return "available";
  if (code.startsWith("SOLD")) return "sold";
  if (code.startsWith("BOOKED")) return "reserved";
  if (code.startsWith("UNAVAILABLE")) return "closed";

  const human = (text(offer["status-humanized"]) ?? "").toLowerCase().trim();
  return HUMAN_STATUS_MAP[human] ?? "available";
}

function offerImages(offer) {
  const images = offer.image;
  if (!images) return [];
  const list = Array.isArray(images) ? images : [images];
  const seen = new Set();
  return list
    .map((img) =>
      typeof img === "string"
        ? { url: img, type: null }
        : { url: text(img), type: img["@_type"] ?? img["@_tag"] ?? null },
    )
    .filter((img) => {
      if (!img.url || seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
}

/**
 * Обложка комплекса: в выгрузке это кадр дома, а не планировка квартиры.
 * Без неё карточки ЖК со старых фидов оставались без фотографии.
 */
function buildingImageOf(images) {
  const byType = (t) => images.find((i) => (i.type ?? "").split(/\s+/).includes(t))?.url ?? null;
  // JCAT/Яндекс: у фото комплекса нет типа, у планировки tag="plan" — берём первое фото без типа
  return byType("building") ?? byType("house") ?? images.find((i) => !i.type)?.url ?? null;
}

/**
 * Срок сдачи корпуса одной строкой: «2 кв. 2027».
 *
 * В выгрузке год и квартал лежат в разных полях. Раньше наружу уходил
 * только номер квартала, и дальше по цепочке он разбирался как дата —
 * так у «Хозяина Морей» в базе оказался срок сдачи 2001 года.
 */
function completionLabel(house, offer) {
  // Profitbase кладёт срок в <house>, выгрузки JCAT/Яндекс — прямо в лот
  const year = num(house?.["built-year"]) ?? num(offer?.["built-year"]);
  const quarter = num(house?.["ready-quarter"]) ?? num(offer?.["ready-quarter"]);
  if (!year) return null;
  return quarter ? `${quarter} кв. ${year}` : String(year);
}

export function normalizeOffer(offer) {
  const externalId = text(offer["@_internal-id"]) ?? text(offer.number) ?? text(offer.id);
  if (!externalId) return null;

  const custom = customFields(offer);
  // Только общая площадь: жилая вместо неё показывала квартиру меньше, чем она есть
  const area = num(offer.area?.value ?? offer.area);

  const images = offerImages(offer);
  return {
    externalId: String(externalId),
    // JCAT (ССК): номер квартиры в <location><apartment>. <FlatNumber> у ССК — позиция
    // на поэтажном плане (n02 в имени файла планировки), а не номер квартиры
    number: text(offer.number) ?? text(offer.location?.apartment),
    // JCAT (ССК) пишет <studio>да</studio>, Profitbase — "true": без этого 408 студий ССК шли без комнатности
    rooms: num(offer.rooms) ?? (/^(true|1|да|yes)$/i.test(String(offer.studio ?? "").trim()) ? 0 : null),
    floor: num(offer.floor),
    area,
    livingArea: num(offer["living-space"]?.value),
    kitchenArea: num(offer["kitchen-space"]?.value),
    terraceArea: num(custom["Площадь террасы, м2"] ?? custom["Площадь террасы"]),
    price: num(offer.price?.value ?? offer.price),
    pricePerMeter: num(offer["price-meter"]?.value ?? offer["price-meter"]),
    status: normalizeStatus(offer),
    propertyTypeLabel: text(offer.property_type),
    windowView: text(offer["window-view"]),
    description: text(offer.description),
    // JCAT: имя ЖК в <building-name>; синхронизация ЖК берёт из настроек фида, поле — для пробы и админки
    complexName: text(offer.object?.name) ?? custom.Комплекс ?? text(offer["building-name"]),
    // JCAT/Яндекс: <house> нет, корпус — это «Литер N» в building-section
    buildingName:
      text(offer.house?.name) ??
      custom.Корпус ??
      (/литер|корпус|дом/i.test(text(offer["building-section"]) ?? "") ? text(offer["building-section"]) : null),
    buildingSection: text(offer["building-section"]) ?? custom.Секция,
    // Profitbase кладёт этажность и год в <house>, JCAT/Яндекс — прямо в лот
    floorsTotal: num(offer.house?.["floors-total"]) ?? num(offer["floors-total"]),
    completionQuarter: completionLabel(offer.house, offer) ?? custom["Срок сдачи"],
    builtYear: num(offer.house?.["built-year"]) ?? num(offer["built-year"]),
    buildingState: text(offer.house?.["building-state"]) ?? text(offer["building-state"]),
    // Яндекс/JCAT: <renovation>предчистовая отделка</renovation>; Profitbase — custom «Отделка»
    finishing: text(offer.renovation) ?? custom.Отделка ?? null,
    layoutType: custom["Тип планировки"],
    features: custom.Особенности,
    custom,
    images,
    buildingImage: buildingImageOf(images),
  };
}

export function parseProfitbaseXml(xml) {
  const doc = parser.parse(xml);
  const root = doc["realty-feed"] ?? doc.feed ?? doc;
  const rawOffers = root?.offers?.offer ?? root?.offer ?? [];
  const offers = Array.isArray(rawOffers) ? rawOffers : [rawOffers];
  return offers.map(normalizeOffer).filter(Boolean);
}

export async function fetchProfitbaseFeed(feedUrl) {
  const res = await safeFetch(feedUrl);
  // Адрес фида содержит токен доступа — в лог уходит только хост
  if (!res.ok) throw new Error(`Failed to download feed from ${new URL(feedUrl).host}: HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  // Выгрузку ЦИАН Profitbase отдаёт gzip-сжатой без Content-Encoding
  const body = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  const xml = body.toString("utf8");
  return parseFeedXml(xml);
}

/** Формат определяем по содержимому: ДомКлик, ЦИАН, Profitbase/JCAT (Яндекс) */
export function parseFeedXml(xml) {
  if (isDomclickXml(xml)) return parseDomclickXml(xml);
  if (isCianXml(xml)) return parseCianXml(xml);
  return parseProfitbaseXml(xml);
}
