import { XMLParser } from "fast-xml-parser";

/**
 * Выгрузка в формате ЦИАН (feed_version 2): <feed><object>…</object></feed>.
 * Profitbase отдаёт её gzip-сжатой — распаковка в fetchProfitbaseFeed.
 * Приводим лоты к той же форме, что parseProfitbaseXml / parseDomclickXml,
 * чтобы синхронизация не знала, из какого формата пришли данные.
 */
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

const QUARTERS = { first: 1, second: 2, third: 3, fourth: 4 };

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/\s+/g, ""));
  return Number.isFinite(n) ? n : null;
};
const text = (v) => (v == null ? null : String(v).trim() || null);

export function isCianXml(xml) {
  const head = xml.slice(0, 2000);
  return /<feed[\s>]/i.test(head) && /<feed_version>/i.test(head) && /<object[\s>]/i.test(xml.slice(0, 20000));
}

function deadlineLabel(building) {
  const d = building?.Deadline;
  if (!d) return null;
  const year = num(d.Year);
  const quarter = QUARTERS[String(d.Quarter ?? "").toLowerCase()] ?? num(d.Quarter);
  if (!year) return null;
  return quarter ? `${quarter} кв. ${year}` : String(year);
}

function photoList(obj) {
  const out = [];
  const layout = obj.LayoutPhoto;
  const layoutUrl = text(layout?.FullUrl ?? layout);
  if (layoutUrl) out.push({ url: layoutUrl, type: "plan" });
  const photos = obj.Photos?.PhotoSchema;
  const list = photos ? (Array.isArray(photos) ? photos : [photos]) : [];
  for (const p of list) {
    const u = text(p?.FullUrl ?? p);
    if (u) out.push({ url: u, type: "photo" });
  }
  return out;
}

export function normalizeCianObject(obj) {
  const externalId = text(obj.ExternalId);
  if (!externalId) return null;
  const category = String(obj.Category ?? "");
  // Только продажа квартир/апартаментов в новостройке и вторичке
  if (category && !/flatSale$/i.test(category)) return null;
  const house = obj.JKSchema?.House;
  const rooms = num(obj.FlatRoomsCount);
  return {
    externalId,
    number: text(house?.Flat?.FlatNumber),
    rooms: obj.FlatRoomsCount === 9 || /studio/i.test(String(obj.FlatRoomsCount)) ? 0 : rooms,
    floor: num(obj.FloorNumber),
    area: num(obj.TotalArea),
    livingArea: num(obj.LivingArea),
    kitchenArea: num(obj.KitchenArea),
    price: num(obj.BargainTerms?.Price),
    // В выгрузку ЦИАН попадают только лоты в продаже
    status: "available",
    description: text(obj.Description),
    complexName: text(obj.JKSchema?.Name)?.replace(/^ЖК\s+/i, "") ?? null,
    buildingName: text(house?.Name),
    buildingSection: text(house?.Flat?.SectionNumber),
    floorsTotal: num(obj.Building?.FloorsCount),
    completionQuarter: deadlineLabel(obj.Building),
    isApartments: obj.IsApartments === true || obj.IsApartments === "true",
    images: photoList(obj),
    buildingImage: null,
  };
}

export function parseCianXml(xml) {
  const doc = parser.parse(xml);
  const raw = doc?.feed?.object ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(normalizeCianObject).filter(Boolean);
}
