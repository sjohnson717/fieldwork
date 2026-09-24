// Which kind an assessment is. The instrument decides whenever there is one;
// the case worth pinning is the one that used to go wrong, where an
// own-questions assessment carries no assessment_type and a "not personal"
// check filed it under team gap.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kindOf, TEAM_GAP, PERSONAL, OWN_QUESTIONS, TABS, isOwnReport, asksOwnQuestions,
} from "@/lib/instrument-kind.js";

const teamGap = { question_source: "library", report_style: "gap" };
const personal = { question_source: "library", report_style: "profile" };
const chaos = { question_source: "instrument", report_style: "distribution" };
const practice = { question_source: "instrument", report_style: "dimension" };

test("the instrument decides", () => {
  assert.equal(kindOf({}, teamGap), TEAM_GAP);
  assert.equal(kindOf({}, personal), PERSONAL);
  assert.equal(kindOf({}, chaos), OWN_QUESTIONS);
  // Even against a stored type that says otherwise.
  assert.equal(kindOf({ assessment_type: "team_gap" }, chaos), OWN_QUESTIONS);
  assert.equal(kindOf({ assessment_type: "team_gap" }, personal), PERSONAL);
});

test("with no instrument, the stored type, and absent means team gap", () => {
  assert.equal(kindOf({ assessment_type: "personal" }, null), PERSONAL);
  assert.equal(kindOf({ assessment_type: "team_gap" }, null), TEAM_GAP);
  assert.equal(kindOf({}, undefined), TEAM_GAP);
  assert.equal(kindOf(null, null), TEAM_GAP);
});

test("each kind has its tabs, and only team gap asks about ownership", () => {
  assert.ok(TABS[TEAM_GAP].includes("Ownership Roles"));
  assert.ok(!TABS[PERSONAL].includes("Ownership Roles"));
  assert.ok(!TABS[PERSONAL].includes("Discussion"));
  assert.deepEqual(TABS[OWN_QUESTIONS], ["Overview", "Results", "Discussion"]);
});

test("a report is the respondent's own for personal and for a dimension report only", () => {
  assert.equal(isOwnReport(PERSONAL, personal), true);
  assert.equal(isOwnReport(OWN_QUESTIONS, practice), true);
  assert.equal(isOwnReport(OWN_QUESTIONS, chaos), false);
  assert.equal(isOwnReport(TEAM_GAP, teamGap), false);
});

test("asksOwnQuestions reads the instrument only", () => {
  assert.equal(asksOwnQuestions(chaos), true);
  assert.equal(asksOwnQuestions(teamGap), false);
  assert.equal(asksOwnQuestions(null), false);
});
