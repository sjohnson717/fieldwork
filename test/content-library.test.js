// The activity library and the resources, which have no seed and no file until
// the app writes one — so these run against rows built here rather than against
// anything committed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writeLibrary, parseLibrary, normalizeActivity, validateLibrary,
  writeResources, parseResources, normalizeResource, validateResources, FACETS, ENTITY_FIELDS,
} from "@/lib/content-format.js";
import {
  planLibrary, applyLibrary, libraryFromLive,
  planResources, applyResources, resourcesFromLive, rowsDiff,
} from "@/lib/content-apply.js";

const LIBRARY = {
  DEFINE: [
    { id: "understand-the-market", name: "Understand the Market", owner: "Product Manager", description: "Know who buys and why.\n\nAnd what they do instead.", try_this: "Interview three customers this week.", active: true },
    { id: "persona-definition", name: "Persona Definition", owner: "Product Manager", description: "Who you are building for.", try_this: "", active: true },
  ],
  COMMIT: [
    { id: "roadmap", name: "Roadmap", owner: "Head of Product", description: "What you have agreed to do.", try_this: "Cut the fourth quarter.", active: false },
  ],
};
const RESOURCES = [
  { id: "aspire", title: "ASPIRE to Your Capabilities", type: "free_article", source: "Steve Johnson", published: "2025-03-01", url: "https://example.com/aspire", note: "A note somebody wrote.", activities: ["understand-the-market", "persona-definition"], fallback: false, active: true },
  { id: "the-quad", title: "Release Planning with the Quad", type: "quartz_course", source: "", published: "", url: "https://example.com/quad", note: "", activities: ["roadmap"], fallback: true, active: true },
];

function backend(rows = {}) {
  const store = { Activity: [], Resource: [], ...rows };
  let n = 0;
  const entity = (name) => ({
    create: async (p) => { const r = { id: `${name}-${++n}`, ...p }; store[name].push(r); return { ...r }; },
    update: async (id, p) => { const r = store[name].find((x) => x.id === id); Object.assign(r, p); return { ...r }; },
    list: async () => store[name].map((r) => ({ ...r })),
  });
  return {
    store,
    entities: { Activity: entity("Activity"), Resource: entity("Resource") },
    live: () => ({ activities: store.Activity.map((r) => ({ ...r })), resources: store.Resource.map((r) => ({ ...r })) }),
  };
}

const libraryIds = (be) => new Map(
  be.store.Activity.filter((a) => !a.instrument_ids).map((a) => [a.content_key, a.id]),
);

test("a phase file round-trips every field", () => {
  for (const [facet, activities] of Object.entries(LIBRARY)) {
    const text = writeLibrary(facet, activities);
    assert.deepEqual(parseLibrary(text), activities.map(normalizeActivity), `${facet} did not round-trip`);
    assert.equal(writeLibrary(facet, parseLibrary(text)), text, `${facet} is not canonical`);
  }
});

test("resources round-trip, including the activities they are offered for", () => {
  const text = writeResources(RESOURCES);
  assert.deepEqual(parseResources(text), RESOURCES.map(normalizeResource));
  assert.equal(writeResources(parseResources(text)), text);
  assert.match(text, /\*\*For\.\*\*\n- understand-the-market\n- persona-definition/);
});

test("the field maps cover every field the two formats carry", () => {
  const a = normalizeActivity(LIBRARY.DEFINE[0]);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(ENTITY_FIELDS.activity).sort());
  const r = normalizeResource(RESOURCES[0]);
  assert.deepEqual(Object.keys(r).filter((k) => k !== "activities").sort(), Object.keys(ENTITY_FIELDS.resource).sort());
});

test("the library applies, and the phase comes from the file it is in", async () => {
  const be = backend();
  const plan = planLibrary(LIBRARY, be.live());
  assert.equal(plan.activities.length, 3);
  await applyLibrary(be, plan);
  const rows = be.store.Activity;
  assert.equal(rows.find((r) => r.content_key === "understand-the-market").facet, "DEFINE");
  assert.equal(rows.find((r) => r.content_key === "roadmap").facet, "COMMIT");
  // Position runs across the phases in their own order, which is what the
  // assessment pages through.
  assert.deepEqual(rows.map((r) => r.sort_order), [0, 1, 2]);
  assert.equal(rows.find((r) => r.content_key === "roadmap").active, false, "a retired activity stays retired");
  // Nothing about the library touches an instrument question.
  assert.equal(planLibrary(LIBRARY, { activities: [...be.store.Activity, { id: "q1", name: "A Question", instrument_ids: ["i1"] }] }).orphans.length, 0);
});

test("a second run of the library has nothing to do, and reads back as the same files", async () => {
  const be = backend();
  await applyLibrary(be, planLibrary(LIBRARY, be.live()));
  assert.equal(planLibrary(LIBRARY, be.live()).writes, 0);
  const back = libraryFromLive(be.live());
  for (const facet of FACETS) {
    assert.equal(writeLibrary(facet, back[facet]), writeLibrary(facet, LIBRARY[facet] || []), `${facet} did not come back the same`);
  }
});

test("moving an activity between phases is named, not buried in a field list", async () => {
  const be = backend();
  await applyLibrary(be, planLibrary(LIBRARY, be.live()));
  const moved = { ...LIBRARY, DEFINE: [LIBRARY.DEFINE[0]], COMMIT: [...LIBRARY.COMMIT, LIBRARY.DEFINE[1]] };
  const plan = planLibrary(moved, be.live());
  assert.deepEqual(plan.moved, [{ name: "Persona Definition", from: "DEFINE", to: "COMMIT" }]);
  const { notes } = await applyLibrary(be, plan);
  assert.match(notes.join(" "), /moved from DEFINE to COMMIT/);
});

test("an activity dropped from the files is reported, never deleted", async () => {
  const be = backend();
  await applyLibrary(be, planLibrary(LIBRARY, be.live()));
  const plan = planLibrary({ ...LIBRARY, COMMIT: [] }, be.live());
  assert.equal(plan.orphans.length, 1);
  assert.equal(plan.orphans[0].name, "Roadmap");
  await applyLibrary(be, plan);
  assert.equal(be.store.Activity.length, 3, "assessments still point at it");
});

test("applying resources leaves every instrument link alone", async () => {
  const be = backend();
  await applyLibrary(be, planLibrary(LIBRARY, be.live()));
  // A question on an instrument, and an article already offered for it.
  be.store.Activity.push({ id: "q1", name: "A Question", instrument_ids: ["i1"] });
  be.store.Resource.push({
    id: "Resource-existing", content_key: "aspire", title: "ASPIRE to Your Capabilities",
    url: "https://example.com/aspire", activity_ids: ["q1"], note: "A note somebody wrote.",
  });

  const plan = planResources(RESOURCES, be.live(), { libraryIdByKey: libraryIds(be) });
  await applyResources(be, plan);

  const row = be.store.Resource.find((r) => r.content_key === "aspire");
  assert.ok(row.activity_ids.includes("q1"), "the instrument question's link survived");
  assert.equal(row.activity_ids.length, 3, "plus the two library activities");
  assert.equal(planResources(RESOURCES, be.live(), { libraryIdByKey: libraryIds(be) }).writes, 0, "a second run does nothing");
});

test("resources read back as the file, with only the library half of the links", async () => {
  const be = backend();
  await applyLibrary(be, planLibrary(LIBRARY, be.live()));
  be.store.Activity.push({ id: "q1", name: "A Question", instrument_ids: ["i1"] });
  await applyResources(be, planResources(RESOURCES, be.live(), { libraryIdByKey: libraryIds(be) }));
  be.store.Resource.find((r) => r.content_key === "aspire").activity_ids.push("q1");

  const back = resourcesFromLive(be.live());
  assert.equal(writeResources(back), writeResources(RESOURCES), "the instrument link must not appear in resources.md");
});

test("validation catches what would break a report", () => {
  assert.deepEqual(validateLibrary(LIBRARY), []);
  const clash = { DEFINE: LIBRARY.DEFINE, COMMIT: [{ id: "understand-the-market", name: "Understand the Market" }] };
  assert.match(validateLibrary(clash).join(" "), /One id is one activity/);
  assert.match(validateLibrary({ NOWHERE: [] }).join(" "), /is not a phase/);

  assert.deepEqual(validateResources(RESOURCES, { activityIds: ["understand-the-market", "persona-definition", "roadmap"] }), []);
  assert.match(validateResources(RESOURCES, { activityIds: ["roadmap"] }).join(" "), /not an activity in the library/);
  assert.match(validateResources([{ title: "No Address", activities: [] }]).join(" "), /has no address/);
  assert.match(
    validateResources([RESOURCES[0], { ...RESOURCES[0], id: "second" }]).join(" "),
    /are the same address/,
  );
});

// ── Job titles ──────────────────────────────────────────────────────────────

import { writeJobTitles, parseJobTitles, normalizeJobTitle, validateJobTitles } from "@/lib/content-format.js";
import { planJobTitles, applyJobTitles, jobTitlesFromLive } from "@/lib/content-apply.js";

const TITLES = [
  { id: "head-of-product", name: "Head of Product Management / Principal Product Manager", active: true },
  { id: "product-manager", name: "Product Manager / Product Owner", active: true },
  { id: "product-marketing", name: "Product Marketing Manager", active: true },
  { id: "sales-engineer", name: "Sales Engineer", active: false },
];

const titleBackend = (titles = [], activities = []) => {
  const store = { JobTitle: [...titles], Activity: [...activities] };
  let n = 0;
  const entity = (name) => ({
    create: async (p) => { const r = { id: `${name}-${++n}`, ...p }; store[name].push(r); return { ...r }; },
    update: async (id, p) => { const r = store[name].find((x) => x.id === id); Object.assign(r, p); return { ...r }; },
  });
  return {
    store,
    entities: { JobTitle: entity("JobTitle"), Activity: entity("Activity") },
    live: () => ({ jobTitles: store.JobTitle.map((r) => ({ ...r })), activities: store.Activity.map((r) => ({ ...r })) }),
  };
};

test("job titles round-trip, and a slash in a name survives", () => {
  const text = writeJobTitles(TITLES);
  assert.deepEqual(parseJobTitles(text), TITLES.map(normalizeJobTitle));
  assert.equal(writeJobTitles(parseJobTitles(text)), text);
  assert.match(text, /## Title: Head of Product Management \/ Principal Product Manager/);
  assert.match(text, /active: no/, "a retired title says so");
});

test("applying writes them in file order and reads back the same", async () => {
  const be = titleBackend();
  await applyJobTitles(be, planJobTitles(TITLES, be.live()));
  assert.deepEqual(be.store.JobTitle.map((t) => t.sort_order), [0, 1, 2, 3]);
  assert.equal(be.store.JobTitle.find((t) => t.content_key === "sales-engineer").active, false);
  assert.equal(planJobTitles(TITLES, be.live()).writes, 0, "a second run does nothing");
  assert.equal(writeJobTitles(jobTitlesFromLive(be.live())), writeJobTitles(TITLES));
});

test("a rename is allowed, counted, and never silent", async () => {
  const be = titleBackend([], [
    { id: "a1", name: "Win-Loss Analysis", preferred_owner: "Product Marketing Manager" },
    { id: "a2", name: "Launch Plan", preferred_owner: "Product Marketing Manager" },
    { id: "a3", name: "Roadmap", preferred_owner: "Product Manager / Product Owner" },
  ]);
  await applyJobTitles(be, planJobTitles(TITLES, be.live()));

  const renamed = TITLES.map((t) => (t.id === "product-marketing" ? { ...t, name: "Product Marketing" } : t));
  const plan = planJobTitles(renamed, be.live());
  assert.equal(plan.renames.length, 1);
  assert.deepEqual(plan.renames[0], { from: "Product Marketing Manager", to: "Product Marketing", activities: 2 });

  const { notes } = await applyJobTitles(be, plan);
  assert.match(notes[0], /2 activities still recommend the old name/);
  assert.match(notes[0], /answers already given keep it/);
  // The rename lands on the row that was already there, rather than making a second.
  assert.equal(be.store.JobTitle.length, 4);
  assert.equal(be.store.JobTitle.find((t) => t.content_key === "product-marketing").name, "Product Marketing");
  // And it changes nothing else, which is the point of saying so.
  assert.equal(be.store.Activity.filter((a) => a.preferred_owner === "Product Marketing Manager").length, 2);
});

test("a title dropped from the file is reported, never deleted", async () => {
  const be = titleBackend();
  await applyJobTitles(be, planJobTitles(TITLES, be.live()));
  const plan = planJobTitles(TITLES.slice(0, 3), be.live());
  assert.equal(plan.orphans.length, 1);
  const { notes } = await applyJobTitles(be, plan);
  assert.equal(be.store.JobTitle.length, 4);
  assert.match(notes.join(" "), /Left alone \(already retired\) — answers name it/);
});

test("validation refuses two titles with one name", () => {
  assert.deepEqual(validateJobTitles(TITLES), []);
  assert.match(validateJobTitles([...TITLES, { id: "other", name: "Sales Engineer" }]).join(" "), /Two titles are called/);
  assert.match(validateJobTitles([...TITLES, { id: "sales-engineer", name: "Another" }]).join(" "), /share the id/);
});

// The screen reads a flat plan through rowsDiff, and the thing it has to be
// able to say is which of two opposite events a write count describes. A first
// run against an app that already holds the library writes to every row —
// exactly as many writes as a run that would create the library a second time.
test("an adoption reads as an adoption, not as a library about to be duplicated", () => {
  const be = backend({
    Activity: [
      { id: "a1", name: "Understand the Market", description: "Know who buys and why.\n\nAnd what they do instead.", preferred_owner: "Product Manager", try_this: "Interview three customers this week.", active: true },
      { id: "a2", name: "Persona Definition", description: "Who you are building for.", preferred_owner: "Product Manager", active: true },
      { id: "a3", name: "Roadmap", description: "What you have agreed to do.", preferred_owner: "Head of Product", try_this: "Cut the fourth quarter.", active: false },
    ],
  });
  const plan = planLibrary(LIBRARY, be.live());
  // Every row is written, and not one of them is new.
  assert.equal(plan.writes, 3);
  assert.equal(plan.counts.create, 0);
  assert.equal(plan.counts.update, 3);
  assert.equal(plan.counts.adopted, 3);
  assert.equal(plan.orphans.length, 0);

  const diff = rowsDiff("activity", plan.activities);
  // Nothing a person typed is changing: it is ids and positions, which is what
  // the row now says out loud instead of "3 to write".
  assert.deepEqual(diff.filter((d) => d.group === "content"), []);
  assert.equal(diff.filter((d) => d.field === "content_key").length, 3);
  assert.ok(diff.every((d) => d.action === "update"));
});

test("a library that is genuinely absent reads as new rows, field by field", () => {
  const plan = planLibrary(LIBRARY, backend().live());
  const diff = rowsDiff("activity", plan.activities);
  assert.equal(plan.counts.create, 3);
  assert.equal(plan.counts.adopted, 0);
  assert.ok(diff.every((d) => d.action === "create"));
  assert.deepEqual(
    [...new Set(diff.filter((d) => d.group === "content").map((d) => d.name))].sort(),
    ["Persona Definition", "Roadmap", "Understand the Market"],
  );
});

test("a resource is named by its title, and a wording change is content", () => {
  const be = backend({
    Resource: [{ id: "r1", content_key: "aspire", title: "ASPIRE to Your Capabilities", url: "https://example.com/aspire", note: "An older note.", resource_type: "free_article", source: "Steve Johnson", published_date: "2025-03-01", sort_order: 0, activity_ids: [], is_fallback: false, active: true }],
  });
  const plan = planResources(RESOURCES, be.live(), { libraryIdByKey: new Map() });
  const diff = rowsDiff("resource", plan.resources, (r) => r.title);
  const note = diff.find((d) => d.field === "note");
  assert.equal(note.name, "ASPIRE to Your Capabilities");
  assert.equal(note.group, "content");
  assert.equal(note.from, "An older note.");
  assert.equal(note.to, "A note somebody wrote.");
});
