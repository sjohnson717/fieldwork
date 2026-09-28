// The arrivals funnel on the Results tabs: visits to the code link, starts, and
// completions, lined up by where people came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { funnelRows } from "@/lib/arrival-funnel.js";

test("lines arrivals, starts, and completions up by source and campaign", () => {
  const arrivals = [
    { source: "newsletter", campaign: "2026-10", count: 40 },
    { source: "linkedin.com", campaign: null, count: 12 },
    { source: null, campaign: null, count: 5 },
  ];
  const respondents = [
    { source: "newsletter", campaign: "2026-10", status: "completed" },
    { source: "newsletter", campaign: "2026-10", status: "started" },
    { source: "linkedin.com", campaign: null, status: "completed" },
    { source: null, campaign: null, status: "started" },
  ];
  assert.deepEqual(funnelRows(arrivals, respondents), [
    { source: "newsletter", campaign: "2026-10", arrived: 40, started: 2, completed: 1 },
    { source: "linkedin.com", campaign: "", arrived: 12, started: 1, completed: 1 },
    { source: "", campaign: "", arrived: 5, started: 1, completed: 0 },
  ]);
});

test("keeps the untagged row last however busy it is", () => {
  const rows = funnelRows(
    [{ source: null, campaign: null, count: 100 }, { source: "newsletter", campaign: null, count: 3 }],
    [],
  );
  assert.deepEqual(rows.map((r) => r.source), ["newsletter", ""]);
});

test("gives a respondent who started before arrivals were counted a row of their own", () => {
  // Older respondents carry no source and have no arrival, so started can
  // exceed arrived on the untagged row. That is expected, not a miscount.
  const rows = funnelRows([], [{ status: "completed" }]);
  assert.deepEqual(rows, [{ source: "", campaign: "", arrived: 0, started: 1, completed: 1 }]);
});

test("builds each channel's link, with the month only on the newsletter", async () => {
  const { SHARE_CHANNELS, taggedSurveyLink } = await import("@/lib/arrival-source.js");
  const by = (key) => SHARE_CHANNELS.find((c) => c.key === key);
  const when = new Date("2026-10-03T12:00:00Z");
  assert.equal(
    taggedSurveyLink("https://quartzassessments.com", "ABCD", by("newsletter"), when),
    "https://quartzassessments.com/assess?code=ABCD&utm_source=newsletter&utm_medium=email&utm_campaign=2026-10",
  );
  assert.equal(
    taggedSurveyLink("https://quartzassessments.com", "ABCD", by("linkedin"), when),
    "https://quartzassessments.com/assess?code=ABCD&utm_source=linkedin&utm_medium=social",
  );
});
