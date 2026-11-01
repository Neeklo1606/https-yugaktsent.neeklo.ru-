/**
 * Запуск: node --test deploy/yugaktsent/profitbase-sync/src/syncFeed.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planImage, needsPlanUpload } from "./syncFeed.js";

test("планировка из Profitbase XML: предпочитаем type=plan", () => {
  const offer = { images: [{ url: "h.jpg", type: "house" }, { url: "p.png", type: "plan" }] };
  assert.equal(planImage(offer), "p.png");
});

test("поэтажный план (type='plan floor') не выдаётся за планировку квартиры", () => {
  const offer = { images: [{ url: "f.png", type: "plan floor" }, { url: "p.png", type: "plan" }] };
  assert.equal(planImage(offer), "p.png");
});

test("старый формат ДомКлик со строками тоже работает", () => {
  assert.equal(planImage({ images: ["a.jpg", "b.jpg"] }), "a.jpg");
});

test("без картинок — null", () => {
  assert.equal(planImage({ images: [] }), null);
  assert.equal(planImage({}), null);
});

test("повторно не качаем ту же планировку", () => {
  assert.equal(needsPlanUpload({ planSrc: "p.png", planUrl: "/uploads/media/x.png" }, "p.png"), false);
  assert.equal(needsPlanUpload({ planSrc: "old.png", planUrl: "/uploads/media/x.png" }, "p.png"), true);
  assert.equal(needsPlanUpload({ listingId: 1 }, "p.png"), true);
  assert.equal(needsPlanUpload(undefined, null), false);
});

test("локальный путь файла планировки", async () => {
  const { localMediaPath } = await import("./syncFeed.js");
  assert.equal(localMediaPath("/uploads/media/a.png", "/srv/u"), "/srv/u/media/a.png");
  assert.equal(localMediaPath("/uploads/../etc/passwd", "/srv/u"), null);
  assert.equal(localMediaPath("https://pb1.profitbase.ru/x.png", "/srv/u"), null);
  assert.equal(localMediaPath("/uploads/media/a.png", undefined), null);
});

test("карта сохранённых планировок собирается из всех фидов", async () => {
  const { storedPlansBySource } = await import("./syncFeed.js");
  const map = storedPlansBySource({
    feeds: {
      a: { 1: { listingId: 1, planSrc: "s1", planUrl: "/uploads/media/1.png" }, 2: { listingId: 2 } },
      b: { 3: { listingId: 3, planSrc: "s2", planUrl: "/uploads/media/2.png" } },
    },
  });
  assert.equal(map.get("s1"), "/uploads/media/1.png");
  assert.equal(map.get("s2"), "/uploads/media/2.png");
  assert.equal(map.size, 2);
});

import { lotKey, bindOffers, staleListings } from "./syncFeed.js";

const apt = (id, building, number, extra = {}) => ({
  id,
  status: "ACTIVE",
  updatedAt: "2026-10-07",
  apartment: { buildingName: building, number },
  ...extra,
});

test("ключ лота: «Корпус 4» и «4» — один корпус", () => {
  assert.equal(lotKey("Корпус 4", "8030"), lotKey("4", "8030"));
  assert.notEqual(lotKey("Толстого 26", "101"), lotKey("Толстого 27", "101"));
  assert.equal(lotKey("4", ""), null);
});

test("привязка: лот без состояния находит объявление по корпусу и номеру, берём свежую копию", () => {
  const offers = [{ externalId: "a", buildingName: "Толстого 26", number: "101" }];
  const listings = [
    apt(1, "Толстого 26", "101", { updatedAt: "2026-10-01" }),
    apt(2, "Толстого 26", "101", { updatedAt: "2026-10-07" }),
    apt(3, "Толстого 27", "101"),
  ];
  assert.deepEqual([...bindOffers(offers, {}, listings)], [["a", 2]]);
});

test("привязка: уже отслеживаемые объявления и неоднозначные ключи не трогаем", () => {
  const offers = [
    { externalId: "a", buildingName: "1", number: "5" },
    { externalId: "b", buildingName: "1", number: "6" },
    { externalId: "c", buildingName: "1", number: "6" },
  ];
  const listings = [apt(1, "1", "5"), apt(2, "1", "6")];
  assert.equal(bindOffers(offers, { x: { listingId: 1 } }, listings).size, 0);
});

test("снимаем с витрины только активные объявления без владельца, которых нет в фиде", () => {
  const listings = [
    apt(1, "1", "1"),
    apt(2, "1", "2"),
    apt(3, "1", "3", { status: "SOLD" }),
    apt(4, "1", "4", { ownerUserId: "u1" }),
    apt(5, "1", "5", { status: "RESERVED" }),
  ];
  assert.deepEqual(staleListings(listings, new Set([1])).map((l) => l.id), [2, 5]);
});

import { pendingFeedIds } from "./syncFeed.js";

test("внеочередная синхронизация: новый и изменённый после прогона фид, но не выключенный", () => {
  const rows = [
    { id: 1, isEnabled: true, lastSyncedAt: null, updatedAt: "2026-11-01T10:00:00Z" },
    { id: 2, isEnabled: true, lastSyncedAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00.400Z" },
    { id: 3, isEnabled: true, lastSyncedAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:05:00Z" },
    { id: 4, isEnabled: false, lastSyncedAt: null, updatedAt: "2026-11-01T10:00:00Z" },
  ];
  assert.deepEqual(pendingFeedIds(rows), [1, 3]);
});

test("привязка: из копий квартиры берём ту, что на сайте", () => {
  const offers = [{ externalId: "a", buildingName: "1", number: "7" }];
  const listings = [
    apt(1, "1", "7", { status: "ACTIVE", updatedAt: "2026-10-01" }),
    apt(2, "1", "7", { status: "SOLD", updatedAt: "2026-10-07" }),
  ];
  assert.deepEqual([...bindOffers(offers, {}, listings)], [["a", 1]]);
});

import { absoluteMediaUrl } from "./syncFeed.js";

test("обложка: локальный путь → полный адрес сайта, внешний не трогаем", () => {
  assert.equal(absoluteMediaUrl("/uploads/media/x.jpg", "https://s.ru/"), "https://s.ru/uploads/media/x.jpg");
  assert.equal(absoluteMediaUrl("https://pb1.profitbase.ru/x.jpg", "https://s.ru"), "https://pb1.profitbase.ru/x.jpg");
});
