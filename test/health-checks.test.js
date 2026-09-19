// The check added with the content sync: a question nobody is ever asked.
//
// Only this one is covered here, because it is the one whose rule is easy to
// get subtly wrong — a retired question in an undeclared section is ordinary
// and there are three of them, so a check that counted those would cry wolf on
// a healthy app and be switched off in a week.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "@/lib/health-checks.js";

const instrument = { id: "i1", name: "Chaos Assessment", sections: ["Your Challenges"], active: true };
const question = (over) => ({
  id: "q1", name: "A Question", active: true, instrument_ids: ["i1"], section: "Your Challenges", ...over,
});
const found = (data) => runChecks({ instruments: [instrument], ...data }).checks.find(c => c.key === "asked-of-nobody");

test("a question in a section the instrument lists is fine", () => {
  assert.deepEqual(found({ activities: [question()] }).items, []);
});

test("an active question in a section it does not list is a fix", () => {
  const items = found({ activities: [question({ section: "Challenges" })] }).items;
  assert.equal(items.length, 1);
  assert.match(items[0].detail, /In "Challenges", which Chaos Assessment does not list/);
  // Openable from the health screen, at the question.
  assert.deepEqual(items[0].target, { section: "instruments", instrumentId: "i1", questionId: "q1" });
});

test("a retired one is not", () => {
  assert.deepEqual(found({ activities: [question({ section: "Comments", active: false })] }).items, []);
});

test("a library activity is not, having no instrument and no section list to be in", () => {
  assert.deepEqual(found({ activities: [{ id: "a1", name: "An Activity", active: true, section: "Anything" }] }).items, []);
});

test("a question with no section at all is not", () => {
  assert.deepEqual(found({ activities: [question({ section: "" })] }).items, []);
});

test("it is a fix, and it says what to do about it", () => {
  const c = found({ activities: [] });
  assert.equal(c.severity, "fix");
  assert.match(c.why, /never asked/);
  // A check whose data did not load has to report that rather than pass.
  assert.deepEqual(c.needs, ["activities", "instruments"]);
});
