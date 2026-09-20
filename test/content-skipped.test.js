// The blog posts deliberately not made resources. Each row is a judgement
// somebody made about one post, and nothing reproduces it: losing the list
// means reading the whole blog again.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writeSkippedPosts, parseSkippedPosts, normalizeSkippedPost, validateSkippedPosts, ENTITY_FIELDS,
} from "@/lib/content-format.js";
import { planSkippedPosts, applySkippedPosts, skippedPostsFromLive, rowsDiff } from "@/lib/content-apply.js";
import { sameAddress } from "@/lib/same-address.js";

const POSTS = [
  { id: "the-product-manager-is-not-the-ceo", title: "The Product Manager Is Not the CEO", url: "https://www.productgrowthleaders.com/post/the-product-manager-is-not-the-ceo" },
  { id: "our-new-office", title: "Our New Office", url: "https://www.productgrowthleaders.com/post/our-new-office" },
];

function backend(rows = []) {
  const store = { SkippedPost: rows };
  let n = 0;
  return {
    store,
    entities: {
      SkippedPost: {
        create: async (p) => { const r = { id: `SkippedPost-${++n}`, ...p }; store.SkippedPost.push(r); return { ...r }; },
        update: async (id, p) => { const r = store.SkippedPost.find((x) => x.id === id); Object.assign(r, p); return { ...r }; },
      },
    },
    live: () => ({ skippedPosts: store.SkippedPost.map((r) => ({ ...r })) }),
  };
}

test("a skipped post round-trips, and the file is canonical", () => {
  const text = writeSkippedPosts(POSTS);
  assert.deepEqual(parseSkippedPosts(text), POSTS.map(normalizeSkippedPost));
  assert.equal(writeSkippedPosts(parseSkippedPosts(text)), text);
  assert.match(text, /## Skipped: Our New Office\nid: our-new-office\nurl: https/);
});

test("the id is the article's slug, not a slug of the title", () => {
  // A title edited on the blog is the same post; the address is what the rest
  // of the app identifies one by.
  const p = normalizeSkippedPost({ title: "Something Else Entirely", url: "https://www.productgrowthleaders.com/post/our-new-office/" });
  assert.equal(p.id, "our-new-office");
  // No address to go on, and a title is better than nothing.
  assert.equal(normalizeSkippedPost({ title: "Our New Office" }).id, "our-new-office");
});

test("the field map covers every field the format carries", () => {
  assert.deepEqual(Object.keys(normalizeSkippedPost(POSTS[0])).sort(), Object.keys(ENTITY_FIELDS.skipped_post).sort());
});

test("two rows for one article are refused, loosely", () => {
  assert.deepEqual(validateSkippedPosts(POSTS, { sameAddress }), []);
  // /post/ and /reading/ are one Wix article, which is the duplicate that
  // actually turns up.
  const twice = [POSTS[0], { id: "same-again", title: "The Product Manager Is Not the CEO", url: "https://productgrowthleaders.com/reading/the-product-manager-is-not-the-ceo/" }];
  assert.match(validateSkippedPosts(twice, { sameAddress }).join(" "), /are the same post/);
  assert.match(validateSkippedPosts([{ id: "no-address", title: "No Address" }]).join(" "), /has no address/);
});

test("skips apply, and a second run does nothing", async () => {
  const be = backend();
  const plan = planSkippedPosts(POSTS, be.live());
  assert.equal(plan.counts.create, 2);
  await applySkippedPosts(be, plan);
  assert.deepEqual(be.store.SkippedPost.map((r) => r.content_key), POSTS.map((p) => p.id));
  assert.equal(planSkippedPosts(POSTS, be.live()).writes, 0);
});

test("a skip made before the file existed is adopted by address, not duplicated", async () => {
  const be = backend([
    // Skipped from the feed, which serves /post/; the file says /reading/.
    { id: "old-1", title: "Our New Office", url: "https://www.productgrowthleaders.com/post/our-new-office", created_date: "2026-01-01" },
  ]);
  const file = [{ ...POSTS[1], url: "https://productgrowthleaders.com/reading/our-new-office/" }];
  const plan = planSkippedPosts(file, be.live());
  assert.equal(plan.counts.adopted, 1);
  assert.equal(plan.counts.create, 0);
  await applySkippedPosts(be, plan);
  assert.equal(be.store.SkippedPost.length, 1, "adopted, not skipped twice");
  assert.equal(be.store.SkippedPost[0].content_key, "our-new-office");
});

test("a skip the file has not seen is reported, never unskipped", async () => {
  const be = backend();
  await applySkippedPosts(be, planSkippedPosts(POSTS, be.live()));
  const plan = planSkippedPosts([POSTS[0]], be.live());
  assert.deepEqual(plan.orphans.map((o) => o.title), ["Our New Office"]);
  const { notes } = await applySkippedPosts(be, plan);
  assert.match(notes.join(" "), /Left alone — unskip it on Resources/);
  assert.equal(be.store.SkippedPost.length, 2);
});

test("the app reads back as the file, oldest first", async () => {
  const be = backend([
    { id: "a", content_key: "our-new-office", title: "Our New Office", url: POSTS[1].url, created_date: "2026-02-02" },
    { id: "b", content_key: "the-product-manager-is-not-the-ceo", title: "The Product Manager Is Not the CEO", url: POSTS[0].url, created_date: "2026-01-01" },
  ]);
  // A new skip appends rather than landing in the middle of the file.
  assert.deepEqual(skippedPostsFromLive(be.live()).map((p) => p.id), ["the-product-manager-is-not-the-ceo", "our-new-office"]);
  assert.equal(writeSkippedPosts(skippedPostsFromLive(be.live())), writeSkippedPosts(POSTS));
});

test("a re-titled post is an edit, not a second skip", async () => {
  const be = backend();
  await applySkippedPosts(be, planSkippedPosts(POSTS, be.live()));
  const retitled = [{ ...POSTS[0], title: "The Product Manager Is Not a CEO" }, POSTS[1]];
  const plan = planSkippedPosts(retitled, be.live());
  assert.equal(plan.counts.create, 0);
  assert.deepEqual(rowsDiff("skipped post", plan.posts).map((d) => [d.name, d.field]), [["The Product Manager Is Not a CEO", "title"]]);
});
