/**
 * Разбор выгрузки JCAT (ССК, формат Яндекс.Недвижимости) на обрезанном куске
 * живого фида: bx.sskuban.ru/local/integrat/feed/jcat/15005800 и …/53704 (2026-11-20).
 * Запуск: npm test (в каталоге profitbase-sync)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseProfitbaseXml } from "./profitbaseFeed.js";
import { parseCianXml } from "./cianFeed.js";
import { LiveGridClient, finishingKind } from "./livegridClient.js";
import { keepExistingFinishing } from "./syncFeed.js";

const XML = readFileSync(new URL("./fixtures/jcat-ssk-sample.xml", import.meta.url), "utf8");
const [krylova, serdtse] = parseProfitbaseXml(XML);

function client(finishings = []) {
  const lg = new LiveGridClient("http://api.test", "a@test", "x");
  lg.regionId = 1;
  lg.roomTypeByRooms = new Map([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]);
  lg.setFinishings(finishings);
  return lg;
}

test("JCAT: номер квартиры из <location><apartment>, а не <FlatNumber>", () => {
  // FlatNumber=2 — позиция на плане этажа (…_n02.png), квартира — № 34
  assert.equal(krylova.number, "34");
  assert.equal(serdtse.number, "99");
  const payload = client().buildApartmentPayload(krylova, 10);
  assert.equal(payload.apartment.number, "34");
});

test("JCAT: этажность и год сдачи читаются прямо из лота", () => {
  assert.equal(krylova.floorsTotal, 12);
  assert.equal(krylova.builtYear, 2027);
  assert.equal(serdtse.floorsTotal, 23);
  assert.equal(client().buildApartmentPayload(serdtse, 10).apartment.floorsTotal, 23);
});

test("Profitbase: этажность из <house> по-прежнему в приоритете", () => {
  const xml = `<realty-feed><offer internal-id="1"><house><floors-total>9</floors-total></house><floors-total>5</floors-total><price><value>1</value></price></offer></realty-feed>`;
  assert.equal(parseProfitbaseXml(xml)[0].floorsTotal, 9);
});

test("JCAT: 5-комнатная остаётся 5-комнатной", () => {
  assert.equal(serdtse.rooms, 5);
  assert.equal(client().buildApartmentPayload(serdtse, 10).apartment.roomTypeId, 6);
  assert.equal(krylova.rooms, 0); // <studio>да</studio>
});

test("JCAT: корпус и секция — как раньше, одной строкой", () => {
  assert.equal(krylova.buildingName, "Литер 1.1, секция 2");
  assert.equal(serdtse.buildingName, "Литер 1");
});

test("отделка: <renovation> сопоставляется со справочником по смыслу", () => {
  assert.equal(krylova.finishing, "предчистовая отделка");
  const lg = client([
    { id: 7, name: "Без отделки" },
    { id: 8, name: "Предчистовая (White box)" },
    { id: 9, name: "Чистовая" },
  ]);
  assert.equal(lg.buildApartmentPayload(krylova, 10).apartment.finishingId, 8);
  assert.equal(lg.finishingIdFor("чистовая"), 9);
  assert.equal(lg.finishingIdFor("Черновая"), 7);
  assert.equal(lg.finishingIdFor("что-то своё"), undefined);
});

test("отделка: пустой справочник — поле не передаётся", () => {
  const payload = client([]).buildApartmentPayload(krylova, 10);
  assert.equal("finishingId" in JSON.parse(JSON.stringify(payload.apartment)), false);
});

test("отделка: «предчистовая» не путается с «чистовой»", () => {
  assert.equal(finishingKind("предчистовая отделка"), "prefine");
  assert.equal(finishingKind("Чистовая отделка"), "fine");
  assert.equal(finishingKind("без отделки"), "none");
  assert.equal(finishingKind("под ключ"), "turnkey");
});

test("отделка, выбранная менеджером, при обновлении не перезаписывается", () => {
  const apt = { finishingId: 8, floor: 2 };
  keepExistingFinishing(apt, { apartment: { finishingId: 9 } });
  assert.equal(apt.finishingId, undefined);
  assert.equal(apt.floor, 2);
  const empty = { finishingId: 8 };
  keepExistingFinishing(empty, { apartment: { finishingId: null } });
  assert.equal(empty.finishingId, 8);
});

test("без общей площади новый лот не создаётся, жилая не подставляется", () => {
  const xml = XML.replace("<area><value>32.45</value><unit>кв. м</unit></area>", "");
  const [noArea] = parseProfitbaseXml(xml);
  assert.equal(noArea.area, null);
  assert.equal(noArea.livingArea, 21.9);
  const lg = client();
  assert.equal(lg.buildApartmentPayload(noArea, 10, false), null);
  // Существующее объявление: цена и статус обновляются, площадь не трогаем
  const upd = lg.buildApartmentPayload(noArea, 10, true);
  assert.equal(upd.price, 8112500);
  assert.equal(upd.apartment.areaTotal, undefined);
});

test("ЦИАН: свободная планировка (7) — не 5-комнатная, отделка из Decoration", () => {
  const xml = `<feed><feed_version>2</feed_version>
<object><ExternalId>1</ExternalId><Category>newBuildingFlatSale</Category><FlatRoomsCount>7</FlatRoomsCount><TotalArea>40</TotalArea><Decoration>preFine</Decoration><BargainTerms><Price>1</Price></BargainTerms></object>
<object><ExternalId>2</ExternalId><Category>newBuildingFlatSale</Category><FlatRoomsCount>5</FlatRoomsCount><TotalArea>140</TotalArea><BargainTerms><Price>1</Price></BargainTerms></object>
</feed>`;
  const [free, five] = parseCianXml(xml);
  assert.equal(free.rooms, null);
  assert.equal(free.finishing, "Предчистовая");
  assert.equal(five.rooms, 5);
});

test("ДомКлик: <renovation> уходит в отделку", async () => {
  const { parseDomclickXml } = await import("./domclickFeed.js");
  const xml = `<complexes><complex><name>Eden</name><buildings><building><name>Корпус 1</name><flats><flat><flat_id>1</flat_id><room>2</room><price>1</price><area>50</area><renovation>чистовая</renovation></flat></flats></building></buildings></complex></complexes>`;
  const [flat] = parseDomclickXml(xml);
  assert.equal(flat.finishing, "чистовая");
  assert.equal(client([{ id: 9, name: "Чистовая" }]).buildApartmentPayload(flat, 10).apartment.finishingId, 9);
});
