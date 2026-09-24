// Which questions an assessment asks.
//
// The case that went wrong in September: every assessment made from the New
// Assessment panel carries an instrument_id, team gap and personal included.
// The rule read any instrument_id as "this instrument asks its own list" and
// looked for questions tagged with it, which library questions never are, so a
// team gap survey opened with no questions at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAssignedActivities } from "@/lib/activity-kind.js";

const teamGap = { id: "tg", key: "team_gap", question_source: "library" };
const personal = { id: "pe", key: "personal", question_source: "library" };
const chaos = { id: "ch", key: "chaos", question_source: "instrument" };

const all = [
  { id: "lib-define", facet: "DEFINE", sort_order: 1 },
  { id: "lib-learn", facet: "LEARN", sort_order: 1 },
  { id: "lib-learn-2", facet: "LEARN", sort_order: 2 },
  { id: "chaos-1", instrument_ids: ["ch"], section: "Your Challenges" },
  { id: "chaos-2", instrument_ids: ["ch"], section: "Your Challenges" },
  { id: "custom-a1", assessment_id: "a1", facet: "LEARN", sort_order: 3 },
  { id: "custom-other", assessment_id: "someone-else", facet: "LEARN" },
];
const ids = (rows) => rows.map((r) => r.id).sort();

test("a panel-made team gap asks its selected library questions, plus its own", () => {
  const assessment = { id: "a1", instrument_id: "tg", activity_ids: ["lib-learn", "lib-define"] };
  assert.deepEqual(
    ids(selectAssignedActivities(assessment, teamGap, all)),
    ["custom-a1", "lib-define", "lib-learn"],
  );
});

test("a panel-made team gap with no selection asks the whole library, plus its own", () => {
  const assessment = { id: "a1", instrument_id: "tg", activity_ids: [] };
  assert.deepEqual(
    ids(selectAssignedActivities(assessment, teamGap, all)),
    ["custom-a1", "lib-define", "lib-learn", "lib-learn-2"],
  );
});

test("a panel-made personal assessment asks library questions too", () => {
  const assessment = { id: "p1", instrument_id: "pe", activity_ids: ["lib-learn"] };
  assert.deepEqual(ids(selectAssignedActivities(assessment, personal, all)), ["lib-learn"]);
});

test("an assessment from before instruments asks library questions", () => {
  const assessment = { id: "old", assessment_type: "team_gap", activity_ids: [] };
  assert.deepEqual(
    ids(selectAssignedActivities(assessment, null, all)),
    ["lib-define", "lib-learn", "lib-learn-2"],
  );
});

test("an instrument with its own list asks only those, never the library", () => {
  const assessment = { id: "c1", instrument_id: "ch", activity_ids: [] };
  assert.deepEqual(ids(selectAssignedActivities(assessment, chaos, all)), ["chaos-1", "chaos-2"]);
});

test("library questions come back in facet order, then sort order", () => {
  const assessment = { id: "a1", instrument_id: "tg", activity_ids: [] };
  assert.deepEqual(
    selectAssignedActivities(assessment, teamGap, all).map((r) => r.id),
    ["lib-define", "lib-learn", "lib-learn-2", "custom-a1"],
  );
});
