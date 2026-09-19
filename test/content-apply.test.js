// The applier, against an in-memory backend.
//
// The cases here are the ones that went wrong the day this was designed: a
// spelling fix in the repository that changed nothing live, a re-run that
// reported everything unchanged when the file said otherwise, and a rename that
// would have arrived as a new question with its answers left behind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseInstrument, parseScales, validateAcross, writeInstrument, writeScales } from "@/lib/content-format.js";
import { planInstrument, applyPlan, planDiff, planScales, applyScales, contentFromLive, scalesFromLive } from "@/lib/content-apply.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fileFor = (name) => readFileSync(join(root, "content", "instruments", `${name}.md`), "utf8");
const scales = parseScales(readFileSync(join(root, "content", "scales.md"), "utf8"));

// A backend that behaves like the platform in the way that matters: a field the
// entity schema has not been given is dropped on write with no error.
function backend({ drop = [] } = {}) {
  const store = { Instrument: [], Activity: [], Band: [], InstrumentSection: [], Resource: [], Scale: [], ScaleOption: [] };
  let n = 0;
  const strip = (name, row) => {
    if (drop.includes(name)) delete row.content_key;
    return row;
  };
  const entity = (name) => ({
    create: async (patch) => {
      const row = strip(name, { id: `${name}-${++n}`, ...patch });
      store[name].push(row);
      return { ...row };
    },
    update: async (id, patch) => {
      const row = store[name].find((r) => r.id === id);
      if (!row) throw new Error(`${name} ${id} not found`);
      Object.assign(row, patch);
      strip(name, row);
      return { ...row };
    },
    delete: async (id) => { store[name] = store[name].filter((r) => r.id !== id); },
    list: async () => store[name].map((r) => ({ ...r })),
  });
  const entities = Object.fromEntries(Object.keys(store).map((k) => [k, entity(k)]));
  return {
    entities,
    store,
    live: () => ({
      instruments: store.Instrument.map((r) => ({ ...r })),
      activities: store.Activity.map((r) => ({ ...r })),
      bands: store.Band.map((r) => ({ ...r })),
      sections: store.InstrumentSection.map((r) => ({ ...r })),
      resources: store.Resource.map((r) => ({ ...r })),
      scales: scales.map((s) => ({ key: s.id, id: `scale-${s.id}` })),
    }),
  };
}

const applyFile = async (be, name, opts) => {
  const content = parseInstrument(fileFor(name));
  const plan = planInstrument(content, be.live());
  const result = await applyPlan(be, plan, opts);
  return { content, plan, result };
};

test("a first run creates everything the file describes", async () => {
  const be = backend();
  const { plan, result } = await applyFile(be, "fractional-cpo-practice");
  assert.equal(plan.instrument.action, "create");
  assert.equal(result.written.questions, 15);
  assert.equal(result.written.bands, 4);
  assert.equal(result.written.dimensions, 5);

  const inst = be.store.Instrument[0];
  assert.deepEqual(inst.sections, ["DIAGNOSE", "ALIGN", "ENABLE", "DEMONSTRATE", "SCALE"], "section order comes from the dimension blocks");
  assert.deepEqual(inst.scale_ids, ["scale-consistency"]);
  assert.equal(inst.band_basis, "mean");
  assert.equal(inst.internal, true);

  // section_sort is derived from document order, counted within each section.
  const diagnose = be.store.Activity.filter((a) => a.section === "DIAGNOSE").map((a) => a.section_sort);
  assert.deepEqual(diagnose, [1, 2, 3]);
  assert.ok(be.store.Activity.every((a) => a.content_key), "every question carries its id");
  assert.ok(be.store.Activity.every((a) => a.facet === "LEARN"));
});

test("a second run with an unchanged file writes nothing", async () => {
  const be = backend();
  await applyFile(be, "fractional-cpo-practice");
  const { plan, result } = await applyFile(be, "fractional-cpo-practice");
  assert.equal(plan.writes, 0, `expected no writes, got: ${JSON.stringify(planDiff(plan))}`);
  assert.equal(plan.instrument.action, "unchanged");
  assert.equal(result.written.questions, 0);
  assert.equal(result.written.reading, 0);
  assert.equal(plan.counts.questions.unchanged, 15);
});

test("a spelling fix in the file reaches the app, and only that field", async () => {
  const be = backend();
  await applyFile(be, "fractional-cpo-practice");
  // The case that failed: four British spellings fixed in the repository,
  // "0 updated, 54 unchanged", and the live text untouched.
  const edited = fileFor("fractional-cpo-practice").replace("moves with the mood of the room", "moves with the mood of the meeting");
  assert.notEqual(edited, fileFor("fractional-cpo-practice"), "the fixture no longer contains the phrase this test edits");
  const plan = planInstrument(parseInstrument(edited), be.live());
  assert.equal(plan.writes, 1);
  const diff = planDiff(plan);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "question");
  assert.equal(diff[0].field, "commentary");
  assert.match(diff[0].to, /mood of the meeting/);
  assert.match(diff[0].from, /mood of the room/);
  await applyPlan(be, plan);
  assert.ok(be.store.Activity.some((a) => /mood of the meeting/.test(a.commentary || "")), "the edit is live");
});

test("renaming a question is an edit, not a new question", async () => {
  const be = backend();
  await applyFile(be, "fractional-cpo-practice");
  const before = be.store.Activity.find((a) => a.content_key === "repeatable-diagnosis");
  const edited = fileFor("fractional-cpo-practice")
    .replace("## Question: Repeatable Diagnosis", "## Question: A Repeatable Diagnosis");
  const plan = planInstrument(parseInstrument(edited), be.live());
  const q = plan.questions.find((x) => x.id === "repeatable-diagnosis");
  assert.equal(q.action, "update");
  assert.equal(q.rowId, before.id, "the row keeps its identity, so its answers stay attached");
  await applyPlan(be, plan);
  assert.equal(be.store.Activity.filter((a) => a.content_key === "repeatable-diagnosis").length, 1, "no second copy");
  assert.equal(be.store.Activity.find((a) => a.id === before.id).name, "A Repeatable Diagnosis");
});

test("rows that predate the format are adopted by name, once", async () => {
  const be = backend();
  await applyFile(be, "idea-reality");
  // Everything the old seeder wrote has no content_key.
  for (const a of be.store.Activity) delete a.content_key;
  for (const b of be.store.Band) delete b.content_key;
  const plan = planInstrument(parseInstrument(fileFor("idea-reality")), be.live());
  assert.ok(plan.counts.questions.adopted > 0, "questions are matched by name for the adoption");
  assert.equal(plan.counts.questions.create, 0, "adoption must not create duplicates");
  assert.equal(plan.counts.bands.create, 0);
  await applyPlan(be, plan);
  const after = planInstrument(parseInstrument(fileFor("idea-reality")), be.live());
  assert.equal(after.writes, 0, "once adopted, the next run has nothing to do");
});

test("a question shared by two instruments keeps both", async () => {
  const be = backend();
  await applyFile(be, "idea-reality");
  await applyFile(be, "product-success");
  const shared = be.store.Activity.filter((a) => a.content_key === "final-thoughts");
  assert.equal(shared.length, 1, "one row, not one per instrument");
  assert.equal(shared[0].instrument_ids.length, 2, "applying the second file did not unlink the first");
  // And applying the first again does not drop the second.
  await applyFile(be, "idea-reality");
  assert.equal(be.store.Activity.find((a) => a.content_key === "final-thoughts").instrument_ids.length, 2);
});

test("a question dropped from the file is reported, never deleted", async () => {
  const be = backend();
  await applyFile(be, "chaos");
  const count = be.store.Activity.length;
  const edited = fileFor("chaos").replace(/\n## Question: Process Standardization[\s\S]*?(?=\n## )/, "\n");
  const plan = planInstrument(parseInstrument(edited), be.live());
  assert.equal(plan.orphans.length, 1);
  assert.equal(plan.orphans[0].name, "Process Standardization");
  const { notes } = await applyPlan(be, plan);
  assert.equal(be.store.Activity.length, count, "nothing was deleted");
  assert.match(notes.join(" "), /not in the file/);
});

test("a band dropped from the file waits for a confirmation", async () => {
  const be = backend();
  await applyFile(be, "product-success");
  // The last band in the file, whichever it is — naming one meant the test
  // broke the day the band order was corrected, and for a reason that had
  // nothing to do with what it checks.
  const whole = fileFor("product-success");
  const edited = whole.slice(0, whole.lastIndexOf("\n## Band: ")) + "\n";
  const plan = planInstrument(parseInstrument(edited), be.live());
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.deletes[0].kind, "band");
  const { notes } = await applyPlan(be, plan);
  assert.equal(be.store.Band.length, 4, "left in place without a confirmation");
  assert.match(notes.join(" "), /still catches scores/);
  await applyPlan(be, planInstrument(parseInstrument(edited), be.live()), { confirmDeletes: true });
  assert.equal(be.store.Band.length, 3, "removed once confirmed");
});

test("reading follows the file, and leaves the library's links alone", async () => {
  const be = backend();
  await applyFile(be, "chaos");
  const row = be.store.Resource.find((r) => /aspire-to-your-capabilities/.test(r.url));
  assert.ok(row, "the article was created");
  const linkedQuestions = row.activity_ids.length;
  assert.ok(linkedQuestions >= 1);

  // A library activity curates the same article, and a note somebody wrote.
  row.activity_ids = [...row.activity_ids, "library-activity-1"];
  row.note = "Written by hand in Settings → Resources";

  const edited = fileFor("chaos").replace("- [ASPIRE to Your Capabilities](aspire-to-your-capabilities)\n", "");
  const plan = planInstrument(parseInstrument(edited), be.live());
  await applyPlan(be, plan);
  const after = be.store.Resource.find((r) => r.id === row.id);
  assert.ok(after.activity_ids.includes("library-activity-1"), "the library's link survived");
  assert.equal(after.activity_ids.length, linkedQuestions + 1 - 1, "one question's link was removed");
  assert.equal(after.note, "Written by hand in Settings → Resources", "the note nobody asked to change is untouched");
});

test("a missing content_key column stops the run instead of reporting success", async () => {
  const be = backend({ drop: ["Activity"] });
  await assert.rejects(
    () => applyFile(be, "portfolio-health"),
    /content_key column yet[\s\S]*publish/,
  );
  assert.equal(be.store.Activity.length, 1, "it stopped at the first row rather than writing them all");
});

test("a file naming a scale that does not exist is refused before anything is written", async () => {
  const be = backend();
  const content = parseInstrument(fileFor("chaos"));
  content.scales = ["nonesuch"];
  const plan = planInstrument(content, be.live());
  await assert.rejects(() => applyPlan(be, plan), /no scale called nonesuch/);
  assert.equal(be.store.Instrument.length, 0);
});

test("the scales apply once and then have nothing to do", async () => {
  const be = backend();
  // Nothing seeded: the scale ids the other tests fake are built here for real.
  const live = { scales: [], scaleOptions: [] };
  const plan = planScales(scales, live);
  assert.equal(plan.scales.filter((s) => s.action === "create").length, scales.length);
  const { written } = await applyScales(be, plan);
  assert.equal(written.scales, scales.length);
  assert.equal(written.options, scales.reduce((n, s) => n + s.options.length, 0));

  const after = planScales(scales, { scales: be.store.Scale, scaleOptions: be.store.ScaleOption });
  assert.equal(after.writes, 0, "a second run has nothing to do");

  // The one that must not become a zero.
  const execution = be.store.Scale.find((s) => s.key === "execution");
  const dunno = be.store.ScaleOption.find((o) => o.scale_id === execution.id && o.label === "I don't know");
  assert.equal(dunno.points, undefined, "a non-scoring option must not arrive as zero");
});

test("an option dropped from the file is reported, not removed", async () => {
  const be = backend();
  await applyScales(be, planScales(scales, { scales: [], scaleOptions: [] }));
  const fewer = scales.map((s) => (s.id === "challenge" ? { ...s, options: s.options.slice(0, 3) } : s));
  const plan = planScales(fewer, { scales: be.store.Scale, scaleOptions: be.store.ScaleOption });
  assert.equal(plan.orphans.length, 1);
  const { notes } = await applyScales(be, plan);
  // "Never" is an option on the consistency scale too, so this counts only the
  // one the edited file dropped.
  const challenge = be.store.Scale.find((s) => s.key === "challenge");
  assert.equal(be.store.ScaleOption.filter((o) => o.scale_id === challenge.id && o.label === "Never").length, 1, "the option is still there");
  assert.match(notes.join(" "), /no longer lists/);
});

test("a question shared by two files has to say the same thing in both", () => {
  const a = parseInstrument(fileFor("idea-reality"));
  const b = parseInstrument(fileFor("product-success"));
  assert.deepEqual(validateAcross([a, b]), [], "the committed files agree about Final Thoughts");

  const drifted = parseInstrument(fileFor("product-success").replace("Anything else you want to share?", "Anything else to add?"));
  const errors = validateAcross([a, drifted]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Final Thoughts[\s\S]*do not match/);
});

test("the whole loop: files in, files out, byte for byte", async () => {
  const be = backend();
  await applyScales(be, planScales(scales, { scales: [], scaleOptions: [] }));
  const liveScales = () => ({ scales: be.store.Scale, scaleOptions: be.store.ScaleOption });

  // The real scale rows, rather than the fake ids the other tests use.
  const live = () => ({ ...be.live(), ...liveScales() });
  // All seven, including the two whose questions come from the activity library
  // and which therefore have no Question blocks at all.
  const names = ["team-gap", "personal", "chaos", "idea-reality", "portfolio-health", "product-success", "fractional-cpo-practice"];

  for (const name of names) {
    const plan = planInstrument(parseInstrument(fileFor(name)), live());
    await applyPlan(be, plan);
  }
  // Applying every file leaves nothing to do, in any order.
  for (const name of [...names].reverse()) {
    const plan = planInstrument(parseInstrument(fileFor(name)), live());
    assert.equal(plan.writes, 0, `${name} still had ${plan.writes} write(s): ${JSON.stringify(planDiff(plan))}`);
  }
  // And what the app now holds writes back as exactly the file that went in.
  // This is the property the old export did not have.
  for (const name of names) {
    const row = be.store.Instrument.find((i) => i.key === name.replace(/-/g, "_"));
    assert.ok(row, `${name} is in the app`);
    assert.equal(writeInstrument(contentFromLive(row, live())), fileFor(name), `${name} did not come back out the same`);
  }
  assert.equal(writeScales(scalesFromLive(liveScales())), readFileSync(join(root, "content", "scales.md"), "utf8"));

  // Only the dimensions that carry prose became rows: the practice profile's
  // five. The other twenty-four sections are names in their instrument's own
  // list, which is what the survey and the reports read.
  assert.equal(be.store.InstrumentSection.length, 5);
  assert.equal(be.store.Instrument.length, 7);
  const teamGap = be.store.Instrument.find((i) => i.key === "team_gap");
  assert.equal(teamGap.sections.length, 7, "a library instrument still declares its sections");
  assert.equal(be.store.Activity.filter((a) => (a.instrument_ids || []).includes(teamGap.id)).length, 0,
    "a library instrument's questions come from the activity library, not from a file");
});

test("a reordering is reported as the sequence, not as four numbers", async () => {
  const be = backend();
  await applyFile(be, "product-success");

  // What the first live sync found: the app holding its bands in the reverse
  // of the file's order. As numbers it reads "App 4, File 0" and says nothing.
  const bands = be.store.Band.filter((b) => b.instrument_id === be.store.Instrument[0].id);
  const reversed = [...bands].reverse();
  reversed.forEach((b, i) => { b.sort_order = i; });

  const plan = planInstrument(parseInstrument(fileFor("product-success")), be.live());
  assert.equal(plan.order.bands.changed, true);
  assert.deepEqual(plan.order.bands.before, reversed.map((b) => b.name));
  assert.deepEqual(plan.order.bands.after, bands.map((b) => b.name));

  // And it is not filed as bookkeeping, where it would be counted and hidden.
  const diff = planDiff(plan);
  assert.ok(diff.some((d) => d.field === "sort_order" && d.group === "order"));
  assert.ok(!diff.some((d) => d.group === "content"), "no content differs, only the order");
});

test("numbering that changes nothing is not reported as a reordering", async () => {
  const be = backend();
  await applyFile(be, "fractional-cpo-practice");
  // Every position shifted by one, in the same sequence — which is what five
  // dimensions numbered from one instead of zero look like.
  for (const row of [...be.store.Band, ...be.store.InstrumentSection, ...be.store.Activity]) {
    if (row.sort_order !== undefined) row.sort_order += 1;
    if (row.section_sort !== undefined) row.section_sort += 1;
  }
  const plan = planInstrument(parseInstrument(fileFor("fractional-cpo-practice")), be.live());
  assert.equal(plan.order.bands.changed, false);
  assert.equal(plan.order.questions.changed, false);
  assert.equal(plan.order.dimensions.changed, false);
  // The fields are still written; they are simply not worth reading about.
  assert.ok(plan.writes > 0);
  assert.ok(planDiff(plan).every((d) => d.group !== "content"));
});

test("the ids written on a first sync are bookkeeping, and nothing else is confused with them", async () => {
  const be = backend();
  await applyFile(be, "chaos");
  for (const a of be.store.Activity) delete a.content_key;
  const diff = planDiff(planInstrument(parseInstrument(fileFor("chaos")), be.live()));
  const ids = diff.filter((d) => d.field === "content_key");
  assert.equal(ids.length, 11, "every question adopts an id");
  assert.ok(ids.every((d) => d.group === "bookkeeping"));
  assert.ok(!diff.some((d) => d.group === "content"), "the wording is untouched by an adoption");
});
