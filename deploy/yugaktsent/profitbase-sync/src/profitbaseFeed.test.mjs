import test from "node:test";
import assert from "node:assert/strict";
import { parseProfitbaseXml } from "./profitbaseFeed.js";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<realty-feed>
  <offer internal-id="1">
    <object><id>5</id><name>ЖК Пример</name></object>
    <house>
      <id>9</id>
      <name>Литер 1</name>
      <floors-total>12</floors-total>
      <built-year>2027</built-year>
      <ready-quarter>2</ready-quarter>
    </house>
    <price><value>1000000</value></price>
    <area><value>37.8</value></area>
    <rooms>1</rooms>
    <floor>3</floor>
    <image type="plan">https://example.test/plan.png</image>
    <image type="plan floor">https://example.test/floor.png</image>
    <image type="house">https://example.test/house.png</image>
    <image type="building">https://example.test/building.jpg</image>
  </offer>
  <offer internal-id="2">
    <object><id>5</id><name>ЖК Пример</name></object>
    <house><id>9</id><name>Литер 2</name><built-year>2028</built-year></house>
    <price><value>2000000</value></price>
    <area><value>50</value></area>
  </offer>
</realty-feed>`;

test("срок сдачи собирается из года и квартала", () => {
  const [first] = parseProfitbaseXml(SAMPLE);
  assert.equal(first.completionQuarter, "2 кв. 2027");
});

test("без квартала остаётся только год", () => {
  const [, second] = parseProfitbaseXml(SAMPLE);
  assert.equal(second.completionQuarter, "2028");
});

test("обложкой берём кадр дома, а не планировку", () => {
  const [first] = parseProfitbaseXml(SAMPLE);
  assert.equal(first.buildingImage, "https://example.test/building.jpg");
});

test("составной тип изображения разбирается по словам", () => {
  const [first] = parseProfitbaseXml(SAMPLE);
  const floorPlan = first.images.find((i) => i.url.endsWith("floor.png"));
  assert.equal(floorPlan.type, "plan floor");
});

test("JCAT: студия «да» — 0 комнат, имя ЖК из building-name", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<realty-feed>
  <offer internal-id="77">
    <building-name>Мореград</building-name>
    <studio>да</studio>
    <price><value>5000000</value></price>
    <area><value>24</value></area>
  </offer>
  <offer internal-id="78">
    <studio>нет</studio>
    <rooms>2</rooms>
    <price><value>8000000</value></price>
    <area><value>55</value></area>
  </offer>
</realty-feed>`;
  const [studio, twoRoom] = parseProfitbaseXml(xml);
  assert.equal(studio.rooms, 0);
  assert.equal(studio.complexName, "Мореград");
  assert.equal(twoRoom.rooms, 2);
});
