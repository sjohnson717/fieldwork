// Personal scoring: experience, skills, and interest on 0/1/3/5, normalised to
// 0–1 before anything crosses axes.
//
// The rule most worth pinning is the category table. It deliberately does not
// use capability(), because averaging experience with skills would erase the
// person who has done the work for years and rates their own skill low — the
// one the instrument exists to find. A refactor that "simplified" category()
// onto capability() would still produce five well-formed buckets.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize, score, capability, category, CATEGORIES,
  computePersonProfile, computeActivityCapability, dominantBucket, DOMINANT_SHARE,
  computeCategoryMix, computeDevelopmentOpportunities, computeCoverage, strongestOf,
} from "@/lib/personal-scoring.js";
import { FACET_ORDER } from "@/lib/scoring.js";

const act = (id, facet = "DEFINE") => ({ id, name: id, facet });
const resp = (activity_id, experience, skills, interest, respondent_id = "p1") =>
  ({ activity_id, respondent_id, experience, skills, interest });

test("each axis normalises its own labels onto 0–1", () => {
  assert.equal(normalize("experience", "None"), 0);
  assert.equal(normalize("experience", "Limited"), 0.2);
  assert.equal(normalize("skills", "Good"), 0.6);
  assert.equal(normalize("interest", "Passionate"), 1);
  // A label from another axis is not a score on this one.
  assert.equal(normalize("skills", "Extensive"), null);
  assert.equal(normalize("nope", "Good"), null);
  assert.equal(score("skills", "Good"), 3);
  assert.equal(score("skills", undefined), null);
});

test("capability blends experience and skills, and leaves interest out", () => {
  assert.equal(capability({ experience: "Extensive", skills: "None", interest: "Passionate" }), 0.5);
  assert.equal(capability({ skills: "Good" }), 0.6);
  assert.equal(capability({ interest: "Passionate" }), null);
});

test("the five categories, from skill and interest, with experience splitting the development pair", () => {
  const cases = [
    [["None", "Good", "Moderate"], "enjoy"],
    [["None", "Excellent", "Limited"], "deemphasize"],
    [["Some", "Basic", "Passionate"], "strengthen"],
    [["Limited", "Basic", "Passionate"], "develop"],
    [["Extensive", "None", "None"], "lower"],
  ];
  for (const [[experience, skills, interest], expected] of cases) {
    assert.equal(category({ experience, skills, interest }), expected, `${experience}/${skills}/${interest}`);
  }
  assert.deepEqual(Object.keys(CATEGORIES).sort(), cases.map(c => c[1]).sort());
});

test("a seasoned practitioner who rates their skill low is strengthen, not develop", () => {
  const veteran = { experience: "Extensive", skills: "Basic", interest: "Moderate" };
  // Capability averages this to 0.6, the same number as "Good" skill alone.
  assert.equal(capability(veteran), capability({ skills: "Good" }));
  assert.equal(category(veteran), "strengthen");
  // Skipping experience falls to the conservative development case.
  assert.equal(category({ skills: "Basic", interest: "Moderate" }), "develop");
});

test("no category without both skill and interest", () => {
  assert.equal(category({ experience: "Extensive", skills: "Good" }), null);
  assert.equal(category({ experience: "Extensive", interest: "Moderate" }), null);
  assert.equal(category(undefined), null);
});

test("a person's profile reads only their own answers, and counts only the classifiable ones", () => {
  const activities = [act("a"), act("b"), act("c")];
  const profile = computePersonProfile(activities, [
    resp("a", "Some", "Good", "Moderate"),
    resp("b", "Some", "Good", undefined),
    resp("c", "None", "None", "None", "someone-else"),
  ], "p1");
  assert.equal(profile.rows.length, 3);
  assert.equal(profile.answeredCount, 1);
  assert.deepEqual(profile.buckets.enjoy.map(r => r.activity.id), ["a"]);
  assert.equal(profile.rows[2].response, null);
});

test("a dominant category needs two thirds of the answered activities", () => {
  const activities = ["a", "b", "c"].map(id => act(id));
  const enjoy = (id) => resp(id, "Some", "Good", "Moderate");
  const two = computePersonProfile(activities, [enjoy("a"), enjoy("b"), resp("c", "None", "None", "None")], "p1");
  assert.deepEqual(dominantBucket(two), { key: "enjoy", share: DOMINANT_SHARE, count: 2 });
  const one = computePersonProfile(activities, [enjoy("a"), resp("b", "None", "None", "None"), resp("c", "Some", "Basic", "Passionate")], "p1");
  assert.equal(dominantBucket(one), null);
  assert.equal(dominantBucket(computePersonProfile(activities, [], "p1")), null);
});

test("the category mix totals the answered activities, per facet and whole", () => {
  const activities = [act("a", "DEFINE"), act("b", "DEFINE"), act("c", "LEARN")];
  const profile = computePersonProfile(activities, [
    resp("a", "Some", "Good", "Moderate"),
    resp("b", "None", "None", "Passionate"),
  ], "p1");
  const mix = computeCategoryMix(profile, FACET_ORDER);
  assert.equal(mix.total, 2);
  assert.deepEqual(mix.overall.map(s => [s.key, s.count, s.share]), [["enjoy", 1, 0.5], ["develop", 1, 0.5]]);
  // LEARN has an activity but no answer, so it has no bar.
  assert.deepEqual(mix.byFacet.map(f => f.facet), ["DEFINE"]);
});

test("development opportunities rank by interest, then by how far skill trails it, and advise once per kind", () => {
  const activities = ["a", "b", "c"].map(id => act(id));
  const profile = computePersonProfile(activities, [
    resp("a", "None", "None", "Moderate"),     // develop, interest 0.6
    resp("b", "Extensive", "Basic", "Passionate"), // strengthen, interest 1
    resp("c", "None", "None", "Passionate"),   // develop, interest 1, wider gap
  ], "p1");
  const ops = computeDevelopmentOpportunities(profile);
  assert.deepEqual(ops.map(o => o.activity.id), ["c", "b", "a"]);
  assert.ok(ops[0].advice && ops[1].advice);
  assert.equal(ops[2].advice, null);
  assert.equal(ops[0].answers, "You reported passionate interest, no experience yet and no skill yet.");
});

test("capability across a team names the best fit", () => {
  const stats = computeActivityCapability([act("a")], [
    resp("a", "Some", "Good", "None", "p1"),
    resp("a", "Extensive", "Excellent", "None", "p2"),
  ], [{ id: "p1", name: "Ann" }, { id: "p2", name: "Bo" }]);
  assert.deepEqual(stats.a.bestFit, { respondent_id: "p2", name: "Bo", capability: 1 });
  assert.equal(stats.a.axisAvg.skills, 4);
  assert.equal(stats.a.n, 2);
});

test("coverage puts an important, badly executed, uncovered activity first", () => {
  const activities = [act("safe"), act("risky")];
  const cap = computeActivityCapability(activities, [
    resp("safe", "Extensive", "Excellent", "Moderate"),
    resp("risky", "Limited", "Basic", "Moderate"),
  ]);
  const team = {
    safe: { avgImp: 3, avgGap: 0, topOwner: "PM" },
    risky: { avgImp: 3, avgGap: 2, topOwner: null },
  };
  const rows = computeCoverage(activities, cap, team);
  assert.deepEqual(rows.map(r => [r.activity.id, r.covered, r.risk]), [["risky", false, 3], ["safe", true, 1]]);
});

test("strongest-of only singles out a short list from a long enjoy bucket", () => {
  const row = (s, i, e = 1) => ({ skills: s, interest: i, experience: e });
  const long = [row(1, 1), row(1, 1), row(0.6, 0.6), row(0.6, 0.6), row(0.6, 0.6), row(0.6, 0.6)];
  assert.equal(strongestOf(long, "enjoy").length, 2);
  assert.deepEqual(strongestOf(long, "develop"), []);
  assert.deepEqual(strongestOf(long.slice(0, 5), "enjoy"), []);
  // Everyone at the top is not a subset worth naming.
  assert.deepEqual(strongestOf(long.map(() => row(1, 1)), "enjoy"), []);
});
