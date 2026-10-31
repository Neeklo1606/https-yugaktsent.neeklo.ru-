/**
 * Тесты разбора выгрузки ДомКлик.
 * Запуск: node --test deploy/yugaktsent/profitbase-sync/src/domclickFeed.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDomclickXml, isDomclickXml, normalizeDomclickFlat } from "./domclickFeed.js";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<complexes>
  <complex>
    <id>120534</id>
    <name>Eden Family Hotel</name>
    <address>Анапа, Краснодарский край</address>
    <buildings>
      <building>
        <id>181403</id>
        <name>Корпус 1</name>
        <floors>5</floors>
        <built_year>2027</built_year>
        <ready_quarter>1</ready_quarter>
        <building_type>монолитный</building_type>
        <image>https://example.test/house.jpg</image>
        <flats>
          <flat>
            <flat_id>13495533</flat_id>
            <apartment>101</apartment>
            <floor>1</floor>
            <room>3</room>
            <plans><plan>https://example.test/a.jpg</plan><plan>https://example.test/b.jpg</plan></plans>
            <price>21199200</price>
            <area>80.3</area>
            <renovation>чистовая</renovation>
          </flat>
          <flat>
            <flat_id>13495534</flat_id>
            <room>студия</room>
            <price>9000000</price>
            <area>25.5</area>
          </flat>
        </flats>
      </building>
    </buildings>
  </complex>
</complexes>`;

test("узнаёт формат по корневому тегу", () => {
  assert.equal(isDomclickXml(SAMPLE), true);
  assert.equal(isDomclickXml('<?xml version="1.0"?><realty-feed><offers/></realty-feed>'), false);
});

test("разбирает все лоты всех корпусов", () => {
  const rows = parseDomclickXml(SAMPLE);
  assert.equal(rows.length, 2);
});

test("комнатность, площадь и цена читаются как числа", () => {
  const [first] = parseDomclickXml(SAMPLE);
  assert.equal(first.rooms, 3);
  assert.equal(first.area, 80.3);
  assert.equal(first.price, 21199200);
  assert.equal(first.floor, 1);
});

test("студия превращается в ноль комнат", () => {
  const [, studio] = parseDomclickXml(SAMPLE);
  assert.equal(studio.rooms, 0);
});

test("срок сдачи собирается из года и квартала", () => {
  const [first] = parseDomclickXml(SAMPLE);
  assert.equal(first.completionQuarter, "1 кв. 2027");
  assert.equal(first.builtYear, 2027);
});

test("без года срок сдачи не выдумывается", () => {
  const row = normalizeDomclickFlat({ flat_id: "1" }, { ready_quarter: 2 }, { name: "ЖК" });
  assert.equal(row.completionQuarter, null);
});

test("планировки собираются списком", () => {
  const [first] = parseDomclickXml(SAMPLE);
  assert.deepEqual(first.images.map((i) => i.url), ["https://example.test/a.jpg", "https://example.test/b.jpg"]);
});

test("название ЖК, корпуса, адрес и фото корпуса прокидываются в лот", () => {
  const [first] = parseDomclickXml(SAMPLE);
  assert.equal(first.complexName, "Eden Family Hotel");
  assert.equal(first.buildingName, "Корпус 1");
  assert.equal(first.complexAddress, "Анапа, Краснодарский край");
  assert.equal(first.buildingImage, "https://example.test/house.jpg");
});

test("лот без идентификатора отбрасывается", () => {
  assert.equal(normalizeDomclickFlat({ room: "2" }, {}, {}), null);
});

test("планировки отдаются как { url, type }, как у Profitbase XML", () => {
  const [first] = parseDomclickXml(SAMPLE);
  assert.deepEqual(first.images[0], { url: "https://example.test/a.jpg", type: "plan" });
});

test("фото корпуса берётся и при нескольких <image>", () => {
  const xml = SAMPLE.replace(
    "<image>https://example.test/house.jpg</image>",
    "<image>https://example.test/h1.jpg</image><image>https://example.test/h2.jpg</image>",
  );
  const [first] = parseDomclickXml(xml);
  assert.equal(first.buildingImage, "https://example.test/h1.jpg");
});
