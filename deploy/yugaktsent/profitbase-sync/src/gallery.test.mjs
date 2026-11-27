import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryCandidates, syncGallery } from "./syncFeed.js";

const offers = [
  { buildingImage: "https://x/0113_SSK_Fontany_0002.jpg", images: [{ url: "https://x/0113_SSK_Fontany_0003.jpg", type: null }, { url: "https://x/p/fnt_l19_p3_n05.png", type: "plan" }] },
  { buildingImage: null, images: [{ url: "https://x/0113_SSK_Fontany_0004.jpg", type: null }, { url: "https://x/upload/planers/p/plan_n01.png", type: null }] },
];

test("галерея: без обложки и без планировок", () => {
  assert.deepEqual(galleryCandidates(offers), ["https://x/0113_SSK_Fontany_0003.jpg", "https://x/0113_SSK_Fontany_0004.jpg"]);
});

function fakeLg(gallery = []) {
  const calls = { uploads: 0, set: null };
  return {
    calls,
    blockContent: async () => ({ videos: ["v"], gallery }),
    uploadRemoteImage: async (src) => {
      calls.uploads += 1;
      return `/uploads/media/${src.split("/").pop()}`;
    },
    setBlockGallery: async (_id, g) => {
      calls.set = g;
    },
  };
}

test("ставит галерею в пустой ЖК и не трогает ручную", async () => {
  const state = {};
  const lg = fakeLg([]);
  const r = await syncGallery(lg, state, 1, galleryCandidates(offers));
  assert.equal(r, "uploaded");
  assert.equal(lg.calls.uploads, 2);
  assert.equal(lg.calls.set.length, 2);
  const manual = fakeLg(["https://site/uploads/manual.jpg"]);
  assert.equal(await syncGallery(manual, state, 1, galleryCandidates(offers)), "admin");
  assert.equal(manual.calls.set, null);
});

test("повторный прогон не качает фото заново", async () => {
  const state = {};
  const first = fakeLg([]);
  await syncGallery(first, state, 1, galleryCandidates(offers));
  const again = fakeLg(first.calls.set);
  assert.equal(await syncGallery(again, state, 1, galleryCandidates(offers)), "kept");
  assert.equal(again.calls.uploads, 0);
});
