// The test that makes the format trustworthy.
//
// The bug this exists for: an export that looked complete was missing ten of
// the practice profile's fifteen prose fields, because the writer and the
// reader were two hand-written serializers and only one of them had been
// taught about dimensions. So the first test below sets *every* field in the
// map to a distinctive value and insists it comes back. A field added to one
// direction and not the other fails here instead of going missing quietly from
// somebody's backup.
//
//   node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  writeInstrument, parseInstrument, normalizeInstrument,
  writeScales, parseScales, validateInstrument, ENTITY_FIELDS, slugify,
} from "../src/lib/content-format.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");
const files = readdirSync(join(contentDir, "instruments")).filter((f) => f.endsWith(".md"));

// Every field, at a value nothing else would produce.
const FULL = {
  key: "every_field", name: "Every Field", tagline: "A tagline: with a colon",
  description: "First paragraph.\n\nSecond paragraph, after a blank line.\nThird line, after a single break.",
  question_source: "instrument", report_style: "dimension", band_basis: "mean",
  scales: ["agreement", "consistency"], subject_label: "Client",
  ask_ownership: true, internal: true, active: false, sort_order: 9,
  dimensions: [{
    id: "first-dimension", name: "FIRST", blurb: "What it is about.",
    strong: "Read when it is their strongest.", opportunity: "Read when it is their weakest.",
  }],
  questions: [{
    id: "a-question", name: "A Question", text: "Does every field survive?",
    type: "rating", section: "FIRST", commentary: "Commentary prose.\n\nWith two paragraphs.",
    critical: true, required: true, active: false,
    reading: [{ title: "An Article", slug: "an-article" }, { title: "Another", slug: "another" }],
  }],
  bands: [{ id: "low", name: "Low", from: 0, to: 2.4, advice: "Advice.\nOn two lines." }],
};

test("every field in the map survives a round trip", () => {
  const back = parseInstrument(writeInstrument(FULL));
  assert.deepEqual(back, normalizeInstrument(FULL));
  // Named individually, so a failure says which field went missing rather than
  // printing two large objects side by side.
  for (const [field, value] of Object.entries(normalizeInstrument(FULL))) {
    assert.deepEqual(back[field], value, `${field} did not survive`);
  }
});

test("the entity field map covers every field the format carries", () => {
  const c = normalizeInstrument(FULL);
  const instrumentFields = Object.keys(c).filter((k) => !["dimensions", "questions", "bands"].includes(k));
  assert.deepEqual(instrumentFields.sort(), Object.keys(ENTITY_FIELDS.instrument).sort());
  for (const [kind, collection] of [["question", "questions"], ["band", "bands"], ["dimension", "dimensions"]]) {
    const fields = Object.keys(c[collection][0]).filter((k) => k !== "reading");
    assert.deepEqual(fields.sort(), Object.keys(ENTITY_FIELDS[kind]).sort(), `${kind} field map`);
  }
});

test("writing is canonical: the committed files are exactly what the app would write", () => {
  for (const f of files) {
    const text = readFileSync(join(contentDir, "instruments", f), "utf8");
    assert.equal(writeInstrument(parseInstrument(text)), text, `${f} is not in canonical form`);
  }
});

test("the committed files round-trip and validate", () => {
  const scaleKeys = parseScales(readFileSync(join(contentDir, "scales.md"), "utf8")).map((s) => s.id);
  assert.ok(scaleKeys.length, "no scales");
  for (const f of files) {
    const text = readFileSync(join(contentDir, "instruments", f), "utf8");
    const c = parseInstrument(text);
    assert.deepEqual(parseInstrument(writeInstrument(c)), c, `${f} does not round-trip`);
    const { errors } = validateInstrument(c, { scaleKeys });
    assert.deepEqual(errors, [], `${f} has validation errors`);
    assert.equal(f, `${c.key.replace(/_/g, "-")}.md`, `${f} is not named after its key`);
  }
});

test("scales round-trip, including an option that does not score", () => {
  const text = readFileSync(join(contentDir, "scales.md"), "utf8");
  const scales = parseScales(text);
  assert.deepEqual(parseScales(writeScales(scales)), scales);
  const execution = scales.find((s) => s.id === "execution");
  assert.equal(execution.options.at(-1).label, "I don't know");
  assert.equal(execution.options.at(-1).points, null, "a non-scoring option must stay null, not become 0");
});

test("prose keeps its single line breaks", () => {
  const advice = "RECOMMENDED NEXT ACTIONS\nDecide which gaps matter\nFund the validation work";
  const c = parseInstrument(writeInstrument({ ...FULL, bands: [{ id: "b", name: "B", from: 0, to: 1, advice }] }));
  assert.equal(c.bands[0].advice, advice);
});

test("order is document order, not a number in the file", () => {
  const text = writeInstrument({
    ...FULL, sort_order: null,
    questions: [
      { id: "one", name: "One", text: "First?", section: "FIRST" },
      { id: "two", name: "Two", text: "Second?", section: "FIRST" },
    ],
  });
  // No sort of any kind: not section_sort on a question, and not the
  // instrument's own sort_order, which is the only one the format has and is
  // left out when it has no value.
  assert.ok(!/sort/.test(text), "the file should carry no sort numbers");
  // Swapping the two blocks in the file swaps them in the content.
  const swapped = text.replace(/(## Question: One[\s\S]*?)(\n\n## Question: Two[\s\S]*)/, (_, a, b) => b.trimStart() + "\n\n" + a.trim());
  assert.deepEqual(parseInstrument(swapped).questions.map((q) => q.id), ["two", "one"]);
});

test("a hand edit survives: loose flags, extra blank lines, and a missing id", () => {
  const c = parseInstrument([
    "---", "key: hand_edited", "name: Hand Edited", "report_style: distribution", "scales: [challenge]", "---",
    "", "", "A description.", "", "",
    "## Question: Typed By Hand", "type: text", "required: true", "",
    "", "Did this survive?", "",
    "**Commentary.**  Two spaces after the label.", "",
  ].join("\n"));
  assert.equal(c.questions.length, 1);
  const q = c.questions[0];
  assert.equal(q.required, true, "required: true should read as a flag");
  assert.equal(q.type, "text");
  assert.equal(q.text, "Did this survive?");
  assert.equal(q.commentary, "Two spaces after the label.");
  assert.equal(q.id, slugify("Typed By Hand"), "a block with no id falls back to its name");
  assert.equal(c.description, "A description.");
});

test("validation catches what used to pass silently", () => {
  const bad = {
    ...FULL,
    scales: ["nonesuch"],
    questions: [
      { id: "a", name: "A", text: "?", section: "NOT A DIMENSION", active: true },
      { id: "a", name: "Duplicate id", text: "?", section: "FIRST" },
      { id: "c", name: "C", text: "", section: "FIRST" },
      { id: "d", name: "D", text: "?", section: "FIRST", reading: [{ title: "T", slug: "https://example.com/x" }] },
    ],
    bands: [
      { id: "low", name: "Low", from: 0, to: 5, advice: "a" },
      { id: "high", name: "High", from: 4, to: 9, advice: "b" },
    ],
  };
  const { errors } = validateInstrument(bad, { scaleKeys: ["challenge"] });
  const has = (re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}\ngot: ${errors.join("\n")}`);
  has(/not in content\/scales\.md/);
  has(/asked of nobody/);
  has(/share the id/);
  has(/has no text/);
  has(/full address/);
  has(/overlap/);
});

test("a retired question in an undeclared section is a note, not an error", () => {
  const c = { ...FULL, questions: [{ id: "old", name: "Comments", text: "?", type: "text", section: "Comments", active: false }] };
  const { errors, notes } = validateInstrument(c, { scaleKeys: ["agreement", "consistency"] });
  assert.deepEqual(errors, []);
  assert.match(notes.join(" "), /retired/);
});
