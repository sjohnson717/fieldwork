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
  planResources, applyResources, resourcesFromLive,
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
