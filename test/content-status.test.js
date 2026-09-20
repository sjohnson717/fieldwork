// Whether the app and the repository still say the same thing — the question
// System Health asks on behalf of somebody who did not come looking.
//
// The states are what matter: "missing" means nothing would bring this content
// back, and it must never be reported for content that is merely different.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readContent } from "@/lib/content-read.js";
import { contentStatus } from "@/lib/content-status.js";
import { runChecks } from "@/lib/health-checks.js";
import {
  writeLibrary, writeResources, writeJobTitles, writeActivitySets, writeSkippedPosts, writeScales, FACETS,
} from "@/lib/content-format.js";

const ACTIVITY = { id: "act-1", content_key: "understand-the-market", name: "Understand the Market", facet: "DEFINE", description: "Know who buys and why.", preferred_owner: "Product Manager", try_this: "", active: true, sort_order: 0 };
const TITLE = { id: "jt-1", content_key: "product-manager", name: "Product Manager", active: true, sort_order: 0 };
const SET = { id: "set-1", content_key: "brief", name: "Brief", description: "Half a day.", activity_ids: ["act-1"], sort_order: 0, active: true };
const SKIP = { id: "sk-1", content_key: "our-new-office", title: "Our New Office", url: "https://www.productgrowthleaders.com/post/our-new-office", created_date: "2026-01-01" };

const live = (over = {}) => ({
  instruments: [], activities: [ACTIVITY], bands: [], sections: [], resources: [],
  scales: [], scaleOptions: [], jobTitles: [TITLE], activitySets: [SET], skippedPosts: [SKIP], ...over,
});

// The files the app would commit, which is the definition of "in step".
const filesFor = (l) => {
  const files = {
    "content/scales.md": writeScales([]),
    "content/resources.md": writeResources([]),
    "content/job-titles.md": writeJobTitles(l.jobTitles.map((t) => ({ id: t.content_key, name: t.name, active: t.active }))),
    "content/activity-sets.md": writeActivitySets(l.activitySets.map((s) => ({ id: s.content_key, name: s.name, description: s.description, activities: ["understand-the-market"], active: s.active }))),
    "content/skipped-posts.md": writeSkippedPosts(l.skippedPosts.map((p) => ({ id: p.content_key, title: p.title, url: p.url }))),
  };
  for (const facet of FACETS) {
    files[`content/library/${facet.toLowerCase()}.md`] = writeLibrary(
      facet,
      facet === "DEFINE" ? [{ id: ACTIVITY.content_key, name: ACTIVITY.name, owner: ACTIVITY.preferred_owner, description: ACTIVITY.description, try_this: "", active: true }] : [],
    );
  }
  return files;
};

const statusOf = (files, l) => contentStatus(readContent(files), files, l);
const byKey = (rows, key) => rows.find((r) => r.key === key);

test("everything committed reads as in step", () => {
  const l = live();
  const rows = statusOf(filesFor(l), l);
  assert.deepEqual(rows.filter((r) => r.state !== "ok").map((r) => [r.key, r.state]), []);
  assert.deepEqual(byKey(rows, "activity-sets").state, "ok");
});

test("a file that does not exist is missing, not merely different", () => {
  const l = live();
  const files = filesFor(l);
  delete files["content/skipped-posts.md"];
  const row = byKey(statusOf(files, l), "skipped-posts");
  assert.equal(row.state, "missing");
  assert.match(row.path, /skipped-posts\.md$/);
});

test("an edit made in the app is drift, and says which side it is on", () => {
  const l = live({ activitySets: [{ ...SET, description: "A whole morning, actually." }] });
  const row = byKey(statusOf(filesFor(live()), l), "activity-sets");
  assert.equal(row.state, "drift");
  assert.ok(row.differs, "the app has something the file does not");
});

test("an edit made in the file counts as drift too, as a write waiting", () => {
  const l = live();
  const files = filesFor(l);
  files["content/job-titles.md"] = writeJobTitles([{ id: "product-manager", name: "Product Owner", active: true }]);
  const row = byKey(statusOf(files, l), "job-titles");
  assert.equal(row.state, "drift");
  assert.equal(row.writes, 1);
});

test("an instrument in the app with no file at all is missing", () => {
  const l = live({ instruments: [{ id: "i1", key: "team_gap", name: "Team Gap Analysis", active: true, sections: [] }] });
  const row = byKey(statusOf(filesFor(l), l), "instrument:team_gap");
  assert.equal(row.state, "missing");
  assert.equal(row.label, "Team Gap Analysis");
});

test("the library is one row across its seven files", () => {
  const l = live();
  const files = filesFor(l);
  files["content/library/define.md"] = writeLibrary("DEFINE", []);
  const rows = statusOf(files, l);
  assert.equal(rows.filter((r) => r.key === "library").length, 1);
  assert.equal(byKey(rows, "library").state, "drift");
});

test("System Health reports the two as different kinds of thing", () => {
  const l = live();
  const files = filesFor(l);
  delete files["content/skipped-posts.md"];
  files["content/job-titles.md"] = writeJobTitles([{ id: "product-manager", name: "Product Owner", active: true }]);
  const { checks } = runChecks({ contentStatus: { rows: statusOf(files, l) } });

  const missing = checks.find((c) => c.key === "content-missing");
  assert.equal(missing.severity, "fix", "nothing would bring it back");
  assert.deepEqual(missing.items.map((i) => i.label), ["Skipped posts"]);
  assert.match(missing.items[0].detail, /Nothing in content\/skipped-posts\.md/);
  assert.deepEqual(missing.items[0].target, { section: "instruments" });

  const drift = checks.find((c) => c.key === "content-drift");
  assert.equal(drift.severity, "review", "which side is right is a judgement");
  assert.deepEqual(drift.items.map((i) => i.label), ["Job titles"]);
  assert.match(drift.items[0].detail, /1 row the file would write to the app/);

});

test("a branch that could not be read is not a green tick", () => {
  // Every check names the lists it needs; these need the comparison, and with
  // none the page marks them unchecked rather than passing them. content-live
  // throws rather than comparing against the copy bundled into the build, so
  // this is the state an unreachable GitHub produces.
  const { checks } = runChecks({});
  for (const key of ["content-missing", "content-drift"]) {
    const c = checks.find((x) => x.key === key);
    assert.deepEqual(c.items, []);
    assert.deepEqual(c.needs, ["contentStatus"], "so the page can mark it unchecked");
  }
});
