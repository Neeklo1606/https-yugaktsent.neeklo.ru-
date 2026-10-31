/**
 * Разбор выгрузок Profitbase в формате ДомКлик.
 *
 * Зачем отдельный разбор: в нашем текущем фиде у квартир нет комнатности
 * (0 из 9817), а площадь у части объектов приходит ровно единицей. В выгрузке
 * ДомКлик по тем же объектам комнатность заполнена у всех, площади настоящие,
 * у корпусов есть срок сдачи и фото, у комплекса — адрес.
 *
 * Наружу отдаём ту же форму, что и profitbaseFeed.normalizeOffer, поэтому
 * остальной конвейер синхронизации не меняется.
 *
 * Структура: complexes > complex > buildings > building > flats > flat
 */
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function text(v) {
  if (v == null) return null;
  if (typeof v === "object") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v) {
  const s = text(v);
  if (s == null) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Ссылка из узла фида: строка либо узел с атрибутами ({ "#text": url, "@_type": … }). */
function urlOf(v) {
  if (v != null && typeof v === "object") return text(v["#text"]);
  return text(v);
}

/**
 * Планировки квартиры: в фиде это список ссылок внутри <plans>.
 * Отдаём в той же форме, что и profitbaseFeed ({ url, type }): раньше здесь
 * были голые строки, синхронизация искала у них поле url, не находила —
 * и у ЖК из выгрузок ДомКлик (Eden, Sun Garden) не было ни одной планировки.
 */
function flatPlans(flat) {
  return asArray(flat?.plans?.plan)
    .map(urlOf)
    .filter(Boolean)
    .map((url) => ({ url, type: "plan" }));
}

/** Фото корпуса: <image> бывает один, несколько или с атрибутами */
function buildingImageOf(building) {
  return asArray(building?.image).map(urlOf).find(Boolean) ?? null;
}

/**
 * «1 кв. 2027» из built_year и ready_quarter.
 * Если года нет, срок сдачи не выдумываем.
 */
function completionLabel(building) {
  const year = num(building?.built_year);
  if (!year) return null;
  const quarter = num(building?.ready_quarter);
  return quarter ? `${quarter} кв. ${year}` : String(year);
}

/**
 * Комнатность. В выгрузке студия обозначается нулём либо словом,
 * остальное — целым числом комнат.
 */
function roomsOf(flat) {
  const raw = text(flat?.room);
  if (raw == null) return null;
  if (/студ/i.test(raw)) return 0;
  const n = num(raw);
  return n == null ? null : n;
}

export function normalizeDomclickFlat(flat, building, complex) {
  const externalId = text(flat?.flat_id);
  if (!externalId) return null;

  const area = num(flat?.area);

  return {
    externalId: String(externalId),
    number: text(flat?.apartment),
    rooms: roomsOf(flat),
    floor: num(flat?.floor),
    area,
    livingArea: num(flat?.living_area),
    kitchenArea: num(flat?.kitchen_area),
    terraceArea: null,
    price: num(flat?.price),
    pricePerMeter: area && area > 0 ? Math.round((num(flat?.price) ?? 0) / area) || null : null,
    // В выгрузке ДомКлик публикуются только доступные лоты: проданных там нет.
    status: "ACTIVE",
    propertyTypeLabel: text(flat?.housing_type),
    windowView: text(flat?.window_view),
    description: text(complex?.description_main),
    complexName: text(complex?.name),
    buildingName: text(building?.name),
    buildingSection: null,
    floorsTotal: num(building?.floors),
    completionQuarter: completionLabel(building),
    builtYear: num(building?.built_year),
    buildingState: text(building?.building_type),
    layoutType: null,
    features: text(flat?.renovation),
    custom: {
      Адрес: text(complex?.address),
      Отделка: text(flat?.renovation),
      Балкон: text(flat?.balcony),
      Лоджия: text(flat?.loggia),
      Санузел: text(flat?.bathroom),
    },
    images: flatPlans(flat),
    /** Фото корпуса — для обложки ЖК, в старом фиде его не было */
    buildingImage: buildingImageOf(building),
    complexAddress: text(complex?.address),
  };
}

export function parseDomclickXml(xml) {
  const doc = parser.parse(xml);
  const root = doc?.complexes ?? doc;
  const complexes = asArray(root?.complex);

  const out = [];
  for (const complex of complexes) {
    for (const building of asArray(complex?.buildings?.building)) {
      for (const flat of asArray(building?.flats?.flat)) {
        const normalized = normalizeDomclickFlat(flat, building, complex);
        if (normalized) out.push(normalized);
      }
    }
  }
  return out;
}

/** Выгрузка ДомКлик узнаётся по корневому тегу complexes. */
export function isDomclickXml(xml) {
  return /<complexes[\s>]/i.test(xml.slice(0, 4000));
}
