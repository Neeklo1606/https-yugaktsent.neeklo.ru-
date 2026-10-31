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
