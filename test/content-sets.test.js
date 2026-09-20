// The curated presets, which are the one thing in the content files that
// nothing else could reproduce: a set is a judgement about which activities
// belong together, and the file is its only backup.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writeActivitySets, parseActivitySets, normalizeActivitySet, validateActivitySets, ENTITY_FIELDS,
  writeLibrary, parseLibrary,
} from "@/lib/content-format.js";
import {
  planLibrary, applyLibrary,
  planActivitySets, applyActivitySets, activitySetsFromLive, unresolvedSetLinks, rowsDiff,
} from "@/lib/content-apply.js";

const LIBRARY = {
  DEFINE: [
    { id: "understand-the-market", name: "Understand the Market", owner: "Product Manager", description: "Know who buys and why.", try_this: "", active: true },
    { id: "persona-definition", name: "Persona Definition", owner: "Product Manager", description: "Who you are building for.", try_this: "", active: true },
  ],
  COMMIT: [
    { id: "roadmap", name: "Roadmap", owner: "Head of Product", description: "What you have agreed to do.", try_this: "", active: true },
  ],
};

const SETS = [
  { id: "brief", name: "Brief", description: "Half a day with a new team.\n\nThe short one.", activities: ["understand-the-market", "roadmap"], active: true },
  { id: "full-discovery", name: "Full Discovery", description: "Everything before a commitment.", activities: ["understand-the-market", "persona-definition", "roadmap"], active: false },
];

function backend(rows = {}) {
  const store = { Activity: [], ActivitySet: [], ...rows };
  let n = 0;
  const entity = (name) => ({
    create: async (p) => { const r = { id: `${name}-${++n}`, ...p }; store[name].push(r); return { ...r }; },
    update: async (id, p) => { const r = store[name].find((x) => x.id === id); Object.assign(r, p); return { ...r }; },
  });
  return {
    store,
    entities: { Activity: entity("Activity"), ActivitySet: entity("ActivitySet") },
    live: () => ({ activities: store.Activity.map((r) => ({ ...r })), activitySets: store.ActivitySet.map((r) => ({ ...r })) }),
  };
}

const libraryIds = (be) => new Map(
  be.store.Activity.filter((a) => a.content_key).map((a) => [a.content_key, a.id]),
);

const seeded = async () => {
  const be = backend();
  await applyLibrary(be, planLibrary(LIBRARY, be.live()));
  return be;
};

test("a set file round-trips every field", () => {
  const text = writeActivitySets(SETS);
  assert.deepEqual(parseActivitySets(text), SETS.map(normalizeActivitySet));
  assert.equal(writeActivitySets(parseActivitySets(text)), text, "the file is not canonical");
  assert.match(text, /\*\*Activities\.\*\*\n- understand-the-market\n- roadmap/);
  // The prose is the description, line breaks and all.
  assert.equal(parseActivitySets(text)[0].description, "Half a day with a new team.\n\nThe short one.");
});

test("the field map covers every field the format carries", () => {
  const set = normalizeActivitySet(SETS[0]);
  assert.deepEqual(Object.keys(set).filter((k) => k !== "activities").sort(), Object.keys(ENTITY_FIELDS.activity_set).sort());
});

test("a set is refused when it names an activity the library has not got", () => {
  const ids = Object.values(LIBRARY).flat().map((a) => a.id);
  assert.deepEqual(validateActivitySets(SETS, { activityIds: ids }), []);
  const wrong = [{ ...SETS[0], activities: ["understand-the-market", "the-one-that-moved"] }];
  assert.match(validateActivitySets(wrong, { activityIds: ids }).join(" "), /not an activity in the library/);
  assert.match(validateActivitySets([{ ...SETS[0], activities: [] }]).join(" "), /holds no activities/);
  assert.match(validateActivitySets([SETS[0], { ...SETS[1], name: "Brief" }]).join(" "), /Two sets are called "Brief"/);
  assert.match(validateActivitySets([{ ...SETS[0], activities: ["roadmap", "roadmap"] }]).join(" "), /holds "roadmap" twice/);
});

test("sets apply, holding row ids the library gave out", async () => {
  const be = await seeded();
  const plan = planActivitySets(SETS, be.live(), { libraryIdByKey: libraryIds(be) });
  assert.equal(plan.sets.length, 2);
  await applyActivitySets(be, plan);
  const brief = be.store.ActivitySet.find((s) => s.content_key === "brief");
  const idOf = (key) => be.store.Activity.find((a) => a.content_key === key).id;
  assert.deepEqual(brief.activity_ids, [idOf("understand-the-market"), idOf("roadmap")]);
  assert.equal(brief.sort_order, 0);
  assert.equal(be.store.ActivitySet.find((s) => s.content_key === "full-discovery").active, false, "a switched-off set stays off");
  assert.equal(planActivitySets(SETS, be.live(), { libraryIdByKey: libraryIds(be) }).writes, 0, "a second run does nothing");
});

test("a member the library has no id for is named and left out, not written away", async () => {
  const be = await seeded();
  const sets = [{ ...SETS[0], activities: ["understand-the-market", "the-one-that-moved"] }];
  const plan = planActivitySets(sets, be.live(), { libraryIdByKey: libraryIds(be) });
  assert.deepEqual(plan.unknownActivities, [{ set: "Brief", activity: "the-one-that-moved" }]);
  const { notes } = await applyActivitySets(be, plan);
  assert.match(notes.join(" "), /not an activity in the library/);
  assert.equal(be.store.ActivitySet[0].activity_ids.length, 1);
});

test("a set adopts its id by name the first time, and reads back as the file", async () => {
  const be = await seeded();
  const idOf = (key) => be.store.Activity.find((a) => a.content_key === key).id;
  be.store.ActivitySet.push({
    id: "ActivitySet-old", name: "Brief", description: "Half a day with a new team.\n\nThe short one.",
    activity_ids: [idOf("roadmap"), idOf("understand-the-market")], sort_order: 0, active: true,
  });
  const plan = planActivitySets(SETS, be.live(), { libraryIdByKey: libraryIds(be) });
  assert.equal(plan.counts.adopted, 1, "matched by name, taking an id for the first time");
  // Membership is a set, so the app holding the two ids the other way round is
  // not a difference to apply.
  assert.deepEqual(plan.sets[0].changes.map((c) => c.field), ["content_key"]);
  await applyActivitySets(be, plan);
  assert.equal(be.store.ActivitySet.length, 2, "adopted, not duplicated");
  assert.equal(writeActivitySets(activitySetsFromLive(be.live())), writeActivitySets(SETS), "did not come back the same");
});

test("a set is written in library order, whatever order the app holds it in", async () => {
  const be = await seeded();
  await applyActivitySets(be, planActivitySets(SETS, be.live(), { libraryIdByKey: libraryIds(be) }));
  const row = be.store.ActivitySet.find((s) => s.content_key === "brief");
  row.activity_ids = [...row.activity_ids].reverse();
  assert.deepEqual(activitySetsFromLive(be.live())[0].activities, ["understand-the-market", "roadmap"]);
});

test("a set dropped from the file is reported, never deleted", async () => {
  const be = await seeded();
  await applyActivitySets(be, planActivitySets(SETS, be.live(), { libraryIdByKey: libraryIds(be) }));
  const plan = planActivitySets([SETS[0]], be.live(), { libraryIdByKey: libraryIds(be) });
  assert.deepEqual(plan.orphans.map((o) => o.name), ["Full Discovery"]);
  const { notes } = await applyActivitySets(be, plan);
  assert.match(notes.join(" "), /commit first if it is one to keep/);
  assert.equal(be.store.ActivitySet.length, 2);
});

test("a member the library no longer has is counted rather than dropped in silence", async () => {
  const be = await seeded();
  await applyActivitySets(be, planActivitySets(SETS, be.live(), { libraryIdByKey: libraryIds(be) }));
  be.store.ActivitySet[0].activity_ids.push("Activity-gone");
  assert.deepEqual(unresolvedSetLinks(be.live()), [{ name: "Brief", count: 1 }]);
  assert.deepEqual(unresolvedSetLinks({ activities: [], activitySets: [] }), []);
});

test("what changes is readable a row at a time", async () => {
  const be = await seeded();
  await applyActivitySets(be, planActivitySets(SETS, be.live(), { libraryIdByKey: libraryIds(be) }));
  const edited = [{ ...SETS[0], description: "Half a day with a new team." }, SETS[1]];
  const diff = rowsDiff("set", planActivitySets(edited, be.live(), { libraryIdByKey: libraryIds(be) }).sets);
  assert.deepEqual(diff.map((d) => [d.name, d.field, d.group]), [["Brief", "description", "content"]]);
});

test("the library file these ids come from is the one the library writes", () => {
  // Guards the join rather than the two halves: the ids a set names are the
  // ids a phase file carries, and nothing else reconciles them.
  const keys = parseLibrary(writeLibrary("DEFINE", LIBRARY.DEFINE)).map((a) => a.id);
  assert.ok(keys.includes(normalizeActivitySet(SETS[0]).activities[0]));
});
