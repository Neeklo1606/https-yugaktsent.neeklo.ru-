import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { parseDomclickXml, isDomclickXml } from "./domclickFeed.js";

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
        : { url: text(img), type: img["@_type"] ?? null },
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
  return byType("building") ?? byType("house") ?? null;
}

/**
 * Срок сдачи корпуса одной строкой: «2 кв. 2027».
 *
 * В выгрузке год и квартал лежат в разных полях. Раньше наружу уходил
 * только номер квартала, и дальше по цепочке он разбирался как дата —
 * так у «Хозяина Морей» в базе оказался срок сдачи 2001 года.
 */
function completionLabel(house) {
  const year = num(house?.["built-year"]);
  const quarter = num(house?.["ready-quarter"]);
  if (!year) return null;
  return quarter ? `${quarter} кв. ${year}` : String(year);
}

export function normalizeOffer(offer) {
  const externalId = text(offer["@_internal-id"]) ?? text(offer.number) ?? text(offer.id);
  if (!externalId) return null;

  const custom = customFields(offer);
  const area = num(offer.area?.value ?? offer.area) ?? num(offer["living-space"]?.value);

  const images = offerImages(offer);
  return {
    externalId: String(externalId),
    number: text(offer.number),
    rooms: num(offer.rooms) ?? (String(offer.studio).toLowerCase() === "true" ? 0 : null),
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
    complexName: text(offer.object?.name) ?? custom.Комплекс,
    buildingName: text(offer.house?.name) ?? custom.Корпус,
    buildingSection: text(offer["building-section"]) ?? custom.Секция,
    floorsTotal: num(offer.house?.["floors-total"]),
    completionQuarter: completionLabel(offer.house) ?? custom["Срок сдачи"],
    builtYear: num(offer.house?.["built-year"]),
    buildingState: text(offer.house?.["building-state"]),
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
  const res = await fetch(feedUrl);
  // Адрес фида содержит токен доступа — в лог уходит только хост
  if (!res.ok) throw new Error(`Failed to download feed from ${new URL(feedUrl).host}: HTTP ${res.status}`);
  const xml = await res.text();
  // Формат определяем по содержимому: выгрузки ДомКлик и обычный фид
  // Profitbase лежат по одинаковым адресам и различаются только корнем.
  return isDomclickXml(xml) ? parseDomclickXml(xml) : parseProfitbaseXml(xml);
}
