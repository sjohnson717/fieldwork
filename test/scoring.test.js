// Team gap scoring: importance against execution on 0–3, and the one respondent's
// version of it that their own summary shows.
//
// These are the numbers a client reads. What is pinned here is each rule a
// comment in scoring.js or self-gap.js argues for, because those are the ones a
// tidy-looking refactor would undo without noticing: the gap as an average of
// per-response gaps rather than a difference of averages, "I don't know" kept
// out of the owner tally but in its denominator, and a thresholds table that
// three files must agree on.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  responseGap, gapLabel, gapBucket, facetRank, FACET_ORDER, fmt,
  computeActivityStats, computeGapMix,
} from "@/lib/scoring.js";
import { computeSelfGapProfile, computeSelfGapMix } from "@/lib/self-gap.js";
import { NO_OWNER, UNKNOWN_OWNER } from "@/lib/ownership.js";

const act = (id, facet = "DEFINE") => ({ id, name: id, facet });
const resp = (activity_id, importance, execution, over = {}) =>
  ({ activity_id, importance, execution, ...over });

test("a gap needs both sides answered", () => {
  assert.equal(responseGap(resp("a", "Critical", "Not done")), 3);
  assert.equal(responseGap(resp("a", "Nice to have", "Excellent")), -2);
  assert.equal(responseGap(resp("a", "Critical", undefined)), null);
  assert.equal(responseGap(resp("a", undefined, "Good")), null);
  assert.equal(responseGap(undefined), null);
});

test("label and bucket agree at every threshold", () => {
  const cases = [[null, "No data", "nodata"], [3, "Immediate attention", "critical"], [2, "Immediate attention", "critical"],
    [1.99, "Worth discussing", "attention"], [1, "Worth discussing", "attention"],
    [0.99, "Performing well", "ontrack"], [-2, "Performing well", "ontrack"]];
  for (const [gap, label, bucket] of cases) {
    assert.equal(gapLabel(gap), label, `label at ${gap}`);
    assert.equal(gapBucket(gap), bucket, `bucket at ${gap}`);
  }
  assert.equal(gapBucket(undefined), "nodata");
});

test("an unknown facet sorts last, not first", () => {
  assert.equal(facetRank("DEFINE"), 0);
  assert.equal(facetRank("LEARN"), FACET_ORDER.length - 1);
  assert.equal(facetRank("NOPE"), FACET_ORDER.length);
});

test("fmt reads undefined as missing rather than throwing", () => {
  assert.equal(fmt(null), "—");
  assert.equal(fmt(undefined), "—");
  assert.equal(fmt(0), "0.0");
  assert.equal(fmt(1.25), "1.3");
});

test("the gap is the average of each response's own gap, not the difference of the averages", () => {
  // One person answered both sides, one only importance. Averages alone would
  // say importance 3, execution 0, gap 3; only the first person has a gap, and
  // theirs is 1.
  const stats = computeActivityStats([act("a")], [
    resp("a", "Critical", "Good"),
    resp("a", "Critical", undefined),
  ]);
  assert.equal(stats.a.avgImp, 3);
  assert.equal(stats.a.avgExec, 2);
  assert.equal(stats.a.avgGap, 1);
  assert.equal(stats.a.n, 2);
});

test("an activity nobody answered has no numbers, not zeros", () => {
  const stats = computeActivityStats([act("a")], []);
  assert.deepEqual(
    { avgImp: stats.a.avgImp, avgExec: stats.a.avgExec, avgGap: stats.a.avgGap, n: stats.a.n, topOwner: stats.a.topOwner, ownerAgreement: stats.a.ownerAgreement },
    { avgImp: null, avgExec: null, avgGap: null, n: 0, topOwner: null, ownerAgreement: null },
  );
});

test("\"I don't know\" never wins ownership, but dilutes agreement", () => {
  const stats = computeActivityStats([act("a")], [
    resp("a", "Important", "Good", { suggested_owner: "PM" }),
    resp("a", "Important", "Good", { suggested_owner: "PM" }),
    resp("a", "Important", "Good", { suggested_owner: UNKNOWN_OWNER }),
    resp("a", "Important", "Good", { suggested_owner: UNKNOWN_OWNER }),
    resp("a", "Important", "Good", { suggested_owner: UNKNOWN_OWNER }),
    resp("a", "Important", "Good", { suggested_owner: NO_OWNER }),
    resp("a", "Important", "Good"),
  ]);
  assert.equal(stats.a.topOwner, "PM");
  // Two of the six who answered the ownership question, not two of two.
  assert.equal(stats.a.ownerAgreement, 2 / 6);
  assert.equal(stats.a.ownerUnknown, 3);
  assert.equal(stats.a.ownerNone, 1);
  assert.deepEqual(stats.a.ownerEntries, [["PM", 2]]);
});

test("an activity where everyone says \"I don't know\" has no owner and no agreement", () => {
  const stats = computeActivityStats([act("a")], [
    resp("a", "Important", "Good", { suggested_owner: UNKNOWN_OWNER }),
  ]);
  assert.equal(stats.a.topOwner, null);
  assert.equal(stats.a.ownerAgreement, null);
});

test("the gap mix counts every activity, unanswered ones included", () => {
  const activities = [act("a", "DEFINE"), act("b", "DEFINE"), act("c", "LEARN"), act("d", "LEARN")];
  const stats = computeActivityStats(activities, [
    resp("a", "Critical", "Not done"),      // 3: critical
    resp("b", "Important", "Inconsistent"), // 1: attention
    resp("c", "Important", "Excellent"),    // -1: on track
  ]);
  const mix = computeGapMix(activities, stats, FACET_ORDER);
  assert.equal(mix.total, 4);
  assert.deepEqual(mix.overall.map(s => [s.key, s.count, s.share]),
    [["critical", 1, 0.25], ["attention", 1, 0.25], ["ontrack", 1, 0.25], ["nodata", 1, 0.25]]);
  // Only facets with activities appear, in canonical order.
  assert.deepEqual(mix.byFacet.map(f => [f.facet, f.count]), [["DEFINE", 2], ["LEARN", 2]]);
  assert.equal(mix.facetMax, 2);
});

// ── One respondent's own summary ────────────────────────────────────────────

test("a respondent's buckets use the report's thresholds, and split the no-gap rows by importance", () => {
  const activities = ["crit", "watch", "keep", "low", "dunno", "blank"].map(id => act(id));
  const profile = computeSelfGapProfile(activities, [
    resp("crit", "Critical", "Inconsistent"), // 2
    resp("watch", "Important", "Inconsistent"), // 1
    resp("keep", "Important", "Good"), // 0, and it matters
    resp("low", "Nice to have", "Good"), // -1, and it doesn't
    resp("dunno", "Critical", "I don't know"),
  ], FACET_ORDER);
  const bucketOf = Object.fromEntries(profile.rows.map(r => [r.activity.id, r.bucket]));
  assert.deepEqual(bucketOf, { crit: "critical", watch: "watch", keep: "keeping", low: "low", dunno: null, blank: null });
  assert.equal(profile.answeredCount, 5);
});

test("\"important, and I can't see how it's going\" is kept as its own finding", () => {
  const profile = computeSelfGapProfile([act("a"), act("b")], [
    resp("a", "Critical", "I don't know"),
    resp("b", "Critical", undefined),
  ], FACET_ORDER);
  // A skipped execution answer is an omission, not a sightline.
  assert.deepEqual(profile.unknowns.map(r => r.activity.id), ["a"]);
});

test("the good-news bucket leads with its best examples", () => {
  const profile = computeSelfGapProfile([act("good"), act("excellent")], [
    resp("good", "Important", "Good"),
    resp("excellent", "Important", "Excellent"),
  ], FACET_ORDER);
  assert.deepEqual(profile.buckets.keeping.map(r => r.activity.id), ["excellent", "good"]);
});

test("the gap buckets lead with the widest gap", () => {
  const profile = computeSelfGapProfile([act("two"), act("three")], [
    resp("two", "Critical", "Inconsistent"),
    resp("three", "Critical", "Not done"),
  ], FACET_ORDER);
  assert.deepEqual(profile.buckets.critical.map(r => r.activity.id), ["three", "two"]);
});

test("the respondent's mix accounts for every row, unrated last", () => {
  const activities = [act("a", "DEFINE"), act("b", "DEFINE"), act("c", "LEARN")];
  const profile = computeSelfGapProfile(activities, [
    resp("a", "Critical", "Not done"),
    resp("c", "Critical", "I don't know"),
  ], FACET_ORDER);
  const mix = computeSelfGapMix(profile);
  assert.equal(mix.total, 3);
  assert.deepEqual(mix.overall.map(s => [s.key, s.count]), [["critical", 1], ["unrated", 2]]);
  assert.deepEqual(mix.byFacet.map(f => [f.facet, f.count]), [["DEFINE", 2], ["LEARN", 1]]);
  assert.equal(mix.overall.reduce((n, s) => n + s.count, 0), mix.total);
});
