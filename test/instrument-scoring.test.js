// Scoring for the fixed-question instruments: one scale, a score, a band, and
// how a room spread its answers.
//
// The rule running through the module is that a skipped question is missing
// data, not a bad answer — on Wix a blank scored zero, and an abandoned survey
// read as a finding. Most of what is pinned here is that rule turning up in a
// different place each time.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreFor, meanFor, bandFor, dimensionScores, dimensionCallouts, distributionFor, agendaOrder,
} from "@/lib/instrument-scoring.js";

// Non-linear on purpose, with a non-scoring option, like the real scales.
const axis = {
  options: [
    { label: "Never", points: 0 },
    { label: "Sometimes", points: 1 },
    { label: "Usually", points: 2 },
    { label: "Consistently", points: 4 },
    { label: "Can't say", points: null },
  ],
};
const yesNo = { options: [{ label: "Yes", points: 1 }, { label: "No", points: 0 }] };
const q = (id, over = {}) => ({ id, section: "S", ...over });
const answers = (map) => Object.fromEntries(Object.entries(map).map(([id, answer]) => [id, { answer }]));

test("a score is earned over possible on the questions actually rated", () => {
  const questions = [q("a"), q("b"), q("c"), q("d"), q("t", { question_type: "text" })];
  const s = scoreFor(questions, answers({ a: "Consistently", b: "Sometimes", c: "Can't say", t: "words" }), axis);
  // c is an answer but not a rating, d was skipped, t is not rated at all.
  assert.deepEqual(s, { earned: 5, possible: 8, answered: 2, of: 4 });
  assert.equal(meanFor(s), 2.5);
});

test("nothing answered has no mean, which is not a mean of zero", () => {
  const none = scoreFor([q("a")], {}, axis);
  assert.equal(meanFor(none), null);
  assert.equal(meanFor(scoreFor([q("a")], answers({ a: "Never" }), axis)), 0);
});

test("points bands are inclusive at both ends, and no band for no answers", () => {
  const bands = [{ name: "Low", min_score: 0, max_score: 3 }, { name: "High", min_score: 4, max_score: 8 }];
  const at = (earned, answered = 1) => bandFor(bands, { earned, answered })?.name ?? null;
  assert.equal(at(3), "Low");
  assert.equal(at(4), "High");
  assert.equal(at(8), "High");
  assert.equal(at(9), null);
  assert.equal(at(0, 0), null);
});

test("a mean band is a ladder, so a score between two written ranges still lands", () => {
  const bands = [
    { name: "Top", min_score: 2.5, max_score: 4 },
    { name: "Low", min_score: 0, max_score: 1.24 },
    { name: "Mid", min_score: 1.25, max_score: 2.49 },
  ];
  const band = (earned, answered) => bandFor(bands, { earned, answered }, { basis: "mean" })?.name;
  assert.equal(band(2.495 * 2, 2), "Mid"); // in the hairline between 2.49 and 2.50
  assert.equal(band(5, 2), "Top");
  assert.equal(band(0, 3), "Low");
  // Measured against what they said: 13 good answers of 15 bands on the mean.
  assert.equal(band(13 * 4, 13), "Top");
});

test("a dimension all of whose statements were skipped is absent, not zero", () => {
  const instrument = { sections: ["One", "Two", "Three"] };
  const questions = [q("a", { section: "One" }), q("b", { section: "One" }), q("c", { section: "Two" })];
  const dims = dimensionScores(instrument, questions, answers({ a: "Consistently", b: "Never" }), axis);
  assert.deepEqual(dims.map(d => [d.name, d.mean, d.worst]), [["One", 2, 0], ["Two", null, null]]);
});

test("callouts break a tie on the lowest single answer, and keep a tie that survives", () => {
  const d = (name, mean, worst) => ({ name, mean, worst });
  // Same average; the one holding a Never has more in it to talk about.
  const tied = dimensionCallouts([d("Steady", 2, 2), d("Uneven", 2, 0), d("Best", 4, 4)]);
  assert.deepEqual(tied.leverage.map(x => x.name), ["Uneven"]);
  assert.deepEqual(tied.strongest.map(x => x.name), ["Best"]);
  const dead = dimensionCallouts([d("A", 1, 1), d("B", 1, 1), d("C", 3, 2)]);
  assert.deepEqual(dead.leverage.map(x => x.name), ["A", "B"]);
});

test("a flat profile, or one with too few dimensions, names nothing", () => {
  const d = (name, mean) => ({ name, mean, worst: mean });
  assert.deepEqual(dimensionCallouts([d("A", 2), d("B", 2)]), { strongest: [], leverage: [] });
  assert.deepEqual(dimensionCallouts([d("A", 2), d("B", null)]), { strongest: [], leverage: [] });
});

test("a distribution counts a non-scoring answer but leaves it out of the arithmetic", () => {
  const rows = [{ answer: "Consistently" }, { answer: "Never" }, { answer: "Can't say" }, { answer: "" }];
  const dist = distributionFor(q("a"), rows, axis);
  assert.equal(dist.answered, 2);
  assert.equal(dist.given, 3);
  assert.equal(dist.unanswered, 1);
  assert.equal(dist.responded, 3);
  assert.equal(dist.mean, 2);
  // Split between the two extremes is the widest the scale allows.
  assert.equal(dist.spread, 1);
  assert.equal(dist.top, null, "a three-way tie at one each picks no winner");
});

test("one opinion has no spread, and unanimity has a spread of zero", () => {
  assert.equal(distributionFor(q("a"), [{ answer: "Usually" }], axis).spread, null);
  const same = distributionFor(q("a"), [{ answer: "Usually" }, { answer: "Usually" }], axis);
  assert.equal(same.spread, 0);
  assert.equal(same.top, "Usually");
});

test("spread respects the scale's uneven spacing", () => {
  // Usually→Consistently is two points; Sometimes→Usually is one.
  const wide = distributionFor(q("a"), [{ answer: "Usually" }, { answer: "Consistently" }], axis).spread;
  const narrow = distributionFor(q("a"), [{ answer: "Sometimes" }, { answer: "Usually" }], axis).spread;
  assert.ok(wide > narrow);
});

test("a yes/no split is read as how even the division is, in a straight line", () => {
  const split = (yes, no) => distributionFor(
    q("a"), [...Array(yes).fill({ answer: "Yes" }), ...Array(no).fill({ answer: "No" })], yesNo,
  ).spread;
  assert.equal(split(6, 0), 0);
  assert.equal(split(5, 1), 2 / 6);
  assert.equal(split(4, 2), 4 / 6);
  assert.equal(split(3, 3), 1);
});

test("the agenda opens on a non-negotiable answered badly, then sorts by disagreement", () => {
  const questions = [
    q("calm", { section_sort: 1 }),
    q("split", { section_sort: 2 }),
    q("veto", { critical: true, section_sort: 3 }),
    q("veto-fine", { critical: true, section_sort: 4 }),
  ];
  const d = (rows, ax = yesNo) => distributionFor(null, rows.map(answer => ({ answer })), ax);
  const distributions = {
    calm: d(["Yes", "Yes"]),
    split: d(["Yes", "No"]),
    veto: d(["Yes", "Yes", "No", "Yes", "Yes", "Yes"]),
    "veto-fine": d(["Yes", "Yes"]),
  };
  assert.deepEqual(agendaOrder(questions, distributions).map(x => x.id), ["veto", "split", "calm", "veto-fine"]);
});
