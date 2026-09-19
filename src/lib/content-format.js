// The content file format: one Markdown file per instrument, read and written
// by the same field map.
//
// This file exists because there used to be two hand-written serializers of
// one thing — the seed in instrument-seed.js and the export on the Instruments
// screen — kept in agreement only by memory. They fell out of agreement: an
// export that looked complete was missing ten of the practice profile's
// fifteen prose fields, because whoever added InstrumentSection updated the
// seed and not the export. There is one field map here, both directions read
// it, and test/content-format.test.js round-trips every instrument through
// both. A field added to one direction and not the other now fails a test
// instead of going missing from a backup.
//
// Two rules the format follows, both of them deliberate:
//
//   Order is document order. Nothing carries a sort number, because a number
//   in a file somebody edits by hand is a number that goes wrong. Moving a
//   question means moving its block.
//
//   Every block carries an `id` that never changes. Names are editable — that
//   is the point of editing — and matching on a name means a renamed question
//   arrives as a new one, taking its answers off the report. The id is how the
//   applier knows an edit from an addition.
//
// Prose is stored verbatim, line breaks and all. Band advice carries
// single-newline lists ("RECOMMENDED NEXT ACTIONS" and the lines under it), so
// the parser trims the ends of a block and touches nothing inside it.

const STR = "string", NUM = "number", FLAG = "flag", LIST = "list", LINKS = "links";

// ── The field map ───────────────────────────────────────────────────────────
//
// [name, type, default]. A field at its default is left out of the file, which
// is what keeps the four instruments with no dimensions reading as they did —
// nothing invented around them.

const INSTRUMENT_ATTRS = [
  ["key", STR],
  ["name", STR],
  ["tagline", STR],
  ["question_source", STR, "instrument"],
  ["report_style", STR],
  ["band_basis", STR, "points"],
  ["scales", LIST],
  ["subject_label", STR],
  ["ask_ownership", FLAG, false],
  ["internal", FLAG, false],
  ["active", FLAG, true],
  ["sort_order", NUM],
];

// `type` rather than question_type, and `from`/`to` rather than
// min_score/max_score: the file is read by a person, and the entity names are
// translated once, in entity-names below, rather than leaking their history
// into every file.
const BLOCKS = [
  {
    kind: "dimension",
    heading: "Dimension",
    collection: "dimensions",
    attrs: [["id", STR]],
    prose: "blurb",
    labels: [["Strong", "strong"], ["Opportunity", "opportunity"]],
  },
  {
    kind: "question",
    heading: "Question",
    collection: "questions",
    attrs: [
      ["id", STR],
      ["type", STR, "rating"],
      ["section", STR],
      ["critical", FLAG, false],
      ["required", FLAG, false],
      ["active", FLAG, true],
    ],
    prose: "text",
    labels: [["Commentary", "commentary"], ["Reading", "reading", LINKS]],
  },
  {
    kind: "band",
    heading: "Band",
    collection: "bands",
    attrs: [["id", STR], ["from", NUM], ["to", NUM]],
    prose: "advice",
    labels: [],
  },
];

const SCALE_ATTRS = [
  ["id", STR],
  ["hint", STR],
  ["unknown_label", STR],
  ["unknown_treatment", STR, "excluded"],
];

export const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "untitled";

// ── Normalising ─────────────────────────────────────────────────────────────
//
// Both directions end here, which is what makes the round trip an equality
// rather than an approximation: the writer normalises what it is given, the
// parser normalises what it read, and the test compares the two.

const defaultFor = (type, dflt) => {
  if (dflt !== undefined) return dflt;
  if (type === STR) return "";
  if (type === LIST || type === LINKS) return [];
  return null;
};

const coerce = (v, type, dflt) => {
  if (v === undefined || v === null || v === "") return defaultFor(type, dflt);
  if (type === FLAG) return v === true || v === "yes" || v === "true";
  if (type === NUM) return typeof v === "number" ? v : Number(v);
  if (type === LIST) return Array.isArray(v) ? v.map((x) => String(x)) : [String(v)];
  if (type === LINKS) return (Array.isArray(v) ? v : []).map((l) => ({ title: String(l.title || ""), slug: String(l.slug || "") }));
  return String(v);
};

const normalizeAttrs = (src, attrs) => {
  const out = {};
  for (const [name, type, dflt] of attrs) out[name] = coerce(src?.[name], type, dflt);
  return out;
};

const normalizeProse = (v) => String(v || "").replace(/\r\n/g, "\n").trim();

const normalizeBlock = (spec, src) => {
  const out = { name: normalizeProse(src?.name), ...normalizeAttrs(src, spec.attrs) };
  if (!out.id) out.id = slugify(out.name);
  out[spec.prose] = normalizeProse(src?.[spec.prose]);
  for (const [, field, type] of spec.labels) {
    out[field] = type === LINKS
      ? coerce(src?.[field], LINKS).filter((l) => l.slug)
      : normalizeProse(src?.[field]);
  }
  return out;
};

// Questions are grouped by section, in the order the dimensions are declared,
// and within a section they keep the order they were written in. A section no
// dimension declares sorts after the declared ones, by name.
//
// Grouping is part of the canonical form rather than a courtesy, because the
// order has to be reproducible from the app as well as from the file: a
// question's place in the app is its section plus its position inside it, and a
// question sitting in an undeclared section had no defined place at all. Three
// retired comment boxes are in exactly that position, and reading them back out
// of the app put them somewhere the file had not said.
//
// It also means a hand edit that moves a question to another section is tidied
// into that section on the next write, rather than leaving the file in an order
// the survey does not ask in.
const orderQuestions = (questions, dimensions) => {
  const declared = dimensions.map((d) => d.name);
  const extra = [...new Set(questions.map((q) => q.section).filter((s) => s && !declared.includes(s)))].sort();
  const rank = new Map([...declared, ...extra].map((name, i) => [name, i]));
  const at = (q) => (rank.has(q.section) ? rank.get(q.section) : rank.size);
  // Stable, so position within a section is document order.
  return questions.map((q, i) => [q, i]).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map(([q]) => q);
};

export function normalizeInstrument(src) {
  const out = normalizeAttrs(src, INSTRUMENT_ATTRS);
  out.description = normalizeProse(src?.description);
  for (const spec of BLOCKS) {
    out[spec.collection] = (src?.[spec.collection] || []).map((b) => normalizeBlock(spec, b));
  }
  out.questions = orderQuestions(out.questions, out.dimensions);
  return out;
}

export function normalizeScale(src) {
  const out = normalizeAttrs(src, SCALE_ATTRS);
  out.name = normalizeProse(src?.name);
  if (!out.id) out.id = slugify(out.name);
  out.options = (src?.options || []).map((o) => ({
    label: normalizeProse(o.label),
    points: o.points === null || o.points === undefined || o.points === "" ? null : Number(o.points),
  }));
  return out;
}

// ── Writing ─────────────────────────────────────────────────────────────────

// Quoted only where a bare value would be read back as something else: a
// value carrying ": ", one that looks like a list, a flag or a number when it
// is meant as text, or one with an edge of whitespace.
const needsQuote = (s) =>
  s === "" ||
  /^[[\-#]/.test(s) ||
  /: /.test(s) ||
  s !== s.trim() ||
  /^(yes|no|true|false|null)$/i.test(s) ||
  (s !== "" && !Number.isNaN(Number(s)));

const fmtValue = (v, type) => {
  if (type === LIST) return `[${v.join(", ")}]`;
  if (type === FLAG) return v ? "yes" : "no";
  if (type === NUM) return String(v);
  return needsQuote(v) ? JSON.stringify(v) : v;
};

const atDefault = (v, type, dflt) => {
  const d = defaultFor(type, dflt);
  if (type === LIST) return v.length === 0;
  return v === d;
};

const attrLines = (row, attrs) => {
  const lines = [];
  for (const [name, type, dflt] of attrs) {
    const v = row[name];
    if (atDefault(v, type, dflt)) continue;
    lines.push(`${name}: ${fmtValue(v, type)}`);
  }
  return lines;
};

const labelBlock = (label, field, type, row) => {
  const v = row[field];
  if (type === LINKS) {
    if (!v.length) return null;
    return [`**${label}.**`, ...v.map((l) => `- [${l.title}](${l.slug})`)].join("\n");
  }
  if (!v) return null;
  return `**${label}.** ${v}`;
};

const blockText = (spec, row) => {
  const parts = [`## ${spec.heading}: ${row.name}`];
  const attrs = attrLines(row, spec.attrs);
  if (attrs.length) parts.push(attrs.join("\n"));
  if (row[spec.prose]) parts.push(row[spec.prose]);
  for (const [label, field, type] of spec.labels) {
    const t = labelBlock(label, field, type, row);
    if (t) parts.push(t);
  }
  // The heading and its attribute lines are one paragraph: the attribute block
  // ends at the first blank line, so a blank line between them would make the
  // parser read the attributes as prose.
  return [parts[0] + (attrs.length ? "\n" + parts[1] : ""), ...parts.slice(attrs.length ? 2 : 1)].join("\n\n");
};

export function writeInstrument(input) {
  const c = normalizeInstrument(input);
  const sections = [];
  sections.push(["---", ...attrLines(c, INSTRUMENT_ATTRS), "---"].join("\n"));
  if (c.description) sections.push(c.description);
  for (const spec of BLOCKS) {
    for (const row of c[spec.collection]) sections.push(blockText(spec, row));
  }
  return sections.join("\n\n") + "\n";
}

export function writeScales(scales) {
  const sections = ["<!-- The answer scales every instrument shares. Referenced by id from an instrument's `scales:` list. -->"];
  for (const raw of scales) {
    const s = normalizeScale(raw);
    const parts = [`## Scale: ${s.name}`];
    const attrs = attrLines(s, SCALE_ATTRS);
    const head = parts[0] + (attrs.length ? "\n" + attrs.join("\n") : "");
    const options = s.options.map((o) => (o.points === null ? `- ${o.label}` : `- ${o.label}: ${o.points}`));
    sections.push([head, options.join("\n")].filter(Boolean).join("\n\n"));
  }
  return sections.join("\n\n") + "\n";
}

// ── Parsing ─────────────────────────────────────────────────────────────────

const HEADING = /^## (Dimension|Question|Band|Scale): (.+?)\s*$/;
const LABEL = /^\*\*([A-Za-z]+)\.\*\*\s*/;
const ATTR = /^([a-z_]+):[ \t]*(.*)$/;

const parseValue = (raw) => {
  const s = raw.trim();
  if (s === "") return "";
  if (s.startsWith('"')) { try { return JSON.parse(s); } catch { return s; } }
  if (s.startsWith("[")) {
    return s.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
  }
  return s;
};

// Splits a body into its unlabelled prose and its **Label.** sections. The
// prose runs to the first label; each label runs to the next one. Nothing
// inside is reflowed.
const splitLabels = (body) => {
  const lines = body.split("\n");
  const out = { prose: [], labels: new Map() };
  let current = null;
  for (const line of lines) {
    const m = line.match(LABEL);
    if (m) {
      current = m[1];
      out.labels.set(current, [line.slice(m[0].length)]);
      continue;
    }
    (current ? out.labels.get(current) : out.prose).push(line);
  }
  return {
    prose: out.prose.join("\n").trim(),
    labels: new Map([...out.labels].map(([k, v]) => [k, v.join("\n").trim()])),
  };
};

const parseLinks = (text) =>
  [...text.matchAll(/^-\s*\[([^\]]*)\]\(([^)]+)\)\s*$/gm)].map((m) => ({ title: m[1].trim(), slug: m[2].trim() }));

// The heading line, its attribute lines, and everything after the first blank
// line as body.
const parseSegment = (text) => {
  const lines = text.split("\n");
  const heading = lines.shift().match(HEADING);
  const attrs = {};
  while (lines.length && lines[0].trim() !== "") {
    const m = lines.shift().match(ATTR);
    if (m) attrs[m[1]] = parseValue(m[2]);
  }
  return { kind: heading[1], name: heading[2].trim(), attrs, body: lines.join("\n").trim() };
};

const segmentsOf = (text) => {
  const lines = text.split("\n");
  const cuts = [];
  lines.forEach((l, i) => { if (HEADING.test(l)) cuts.push(i); });
  const preamble = lines.slice(0, cuts.length ? cuts[0] : lines.length).join("\n").trim();
  const segments = cuts.map((start, n) =>
    parseSegment(lines.slice(start, cuts[n + 1] ?? lines.length).join("\n").trim()));
  return { preamble, segments };
};

export function parseInstrument(text) {
  const src = String(text).replace(/\r\n/g, "\n");
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const front = {};
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = line.match(ATTR);
      if (m) front[m[1]] = parseValue(m[2]);
    }
  }
  const { preamble, segments } = segmentsOf(fm ? src.slice(fm[0].length) : src);
  const content = { ...front, description: preamble };
  for (const spec of BLOCKS) content[spec.collection] = [];
  for (const seg of segments) {
    const spec = BLOCKS.find((b) => b.heading === seg.kind);
    if (!spec) continue;
    const { prose, labels } = splitLabels(seg.body);
    const row = { name: seg.name, ...seg.attrs, [spec.prose]: prose };
    for (const [label, field, type] of spec.labels) {
      const raw = labels.get(label) || "";
      row[field] = type === LINKS ? parseLinks(raw) : raw;
    }
    content[spec.collection].push(row);
  }
  return normalizeInstrument(content);
}

export function parseScales(text) {
  const { segments } = segmentsOf(String(text).replace(/\r\n/g, "\n"));
  return segments.filter((s) => s.kind === "Scale").map((seg) => {
    const options = [...seg.body.matchAll(/^-\s*(.+?)(?::\s*(-?\d+(?:\.\d+)?))?\s*$/gm)]
      .map((m) => ({ label: m[1].trim(), points: m[2] === undefined ? null : Number(m[2]) }));
    return normalizeScale({ name: seg.name, ...seg.attrs, options });
  });
}

// ── Validating ──────────────────────────────────────────────────────────────
//
// Run before anything is written to the app, because the failure this guards
// against is the quiet one: a question naming a dimension that does not exist
// used to be absorbed silently and print a heading with no prose under it.

export function validateInstrument(content, { scaleKeys = null } = {}) {
  const c = normalizeInstrument(content);
  const errors = [];
  const notes = [];
  const say = (m) => errors.push(m);
  const note = (m) => notes.push(m);

  if (!c.key) say("The file has no `key`.");
  if (!c.name) say("The file has no `name`.");
  if (!c.report_style) say("The file has no `report_style`.");
  if (!c.scales.length) say("The file names no scales.");
  if (scaleKeys) {
    for (const k of c.scales) if (!scaleKeys.includes(k)) say(`Scale "${k}" is not in content/scales.md.`);
  }
  if (c.band_basis !== "points" && c.band_basis !== "mean") say(`band_basis is "${c.band_basis}" — it has to be points or mean.`);

  const dimensionNames = c.dimensions.map((d) => d.name);
  for (const spec of BLOCKS) {
    const seen = new Set();
    for (const row of c[spec.collection]) {
      if (!row.name) say(`A ${spec.kind} has no name.`);
      if (seen.has(row.id)) say(`Two ${spec.kind}s share the id "${row.id}". Ids have to be unique within a file.`);
      seen.add(row.id);
      if (!/^[a-z0-9-]+$/.test(row.id)) say(`"${row.id}" is not a usable id — lower case, digits, and hyphens.`);
    }
  }
  for (const q of c.questions) {
    if (!q.text) say(`Question "${q.name}" has no text.`);
    if (q.type !== "rating" && q.type !== "text") say(`Question "${q.name}" has type "${q.type}" — it has to be rating or text.`);
    // An active question in a section no Dimension declares never reaches the
    // survey: the pages are built from the instrument's section list, so the
    // question is asked of nobody. A retired one carries its old section
    // harmlessly, and three of them do — the comment boxes retired when the
    // closing questions took over. Worth saying once, not worth blocking.
    if (q.section && dimensionNames.length && !dimensionNames.includes(q.section)) {
      const m = `Question "${q.name}" is in section "${q.section}", which no Dimension block declares.`;
      if (q.active) say(`${m} An active question there is asked of nobody.`);
      else note(`${m} It is retired, so nothing reads it.`);
    }
    for (const l of q.reading) {
      if (!l.title) say(`A reading link on "${q.name}" has no title.`);
      if (/^https?:/.test(l.slug)) say(`Reading on "${q.name}" carries a full address ("${l.slug}") — reading is a slug, and the site it lives on is one line in content-apply.js.`);
    }
  }
  const bands = [...c.bands].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  for (const [i, b] of bands.entries()) {
    if (b.from === null || b.to === null) say(`Band "${b.name}" is missing its from/to range.`);
    else if (b.to < b.from) say(`Band "${b.name}" ends below where it starts.`);
    const next = bands[i + 1];
    if (next && b.to !== null && next.from !== null && next.from <= b.to) {
      say(`Bands "${b.name}" and "${next.name}" overlap — a score in the overlap has two answers.`);
    }
  }
  // A line that would be read back as a marker. Rare, and worth naming here
  // rather than discovering it as a truncated paragraph after a round trip.
  const prose = [c.description, ...c.questions.flatMap((q) => [q.text, q.commentary]),
    ...c.bands.map((b) => b.advice), ...c.dimensions.flatMap((d) => [d.blurb, d.strong, d.opportunity])];
  for (const p of prose) {
    if (/^## (Dimension|Question|Band|Scale): /m.test(p)) say("A paragraph begins with a heading the parser would read as a new block.");
    if (LABEL.test(p.split("\n").slice(1).join("\n"))) say("A paragraph begins with a **Label.** the parser would read as a field.");
  }
  return { errors, notes };
}

// The id a new row keeps for the rest of its life. Written when a question or
// a dimension is created — in the editor, or by applying a file — and never
// again, because a renamed row has to stay the same row.
//
// Two questions can legitimately be called the same thing in different
// sections, so a taken id gets a suffix. It is arbitrary and permanent, which
// is fine: an id is only ever compared, never read for meaning.
export function nextContentKey(name, taken = []) {
  const base = slugify(name);
  const used = new Set(taken.filter(Boolean));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

// A content_key is global across the files, because one row can serve two
// instruments — the closing "Final Thoughts" is asked by both the idea screen
// and the product quiz, and it is one question with one set of answers. That
// only works while both files say the same thing about it: there is a single
// row, so the second file applied would otherwise quietly overwrite what the
// first one said.
export function validateAcross(contents) {
  const errors = [];
  const seen = new Map();
  for (const c of contents) {
    for (const q of normalizeInstrument(c).questions) {
      const before = seen.get(q.id);
      if (!before) { seen.set(q.id, { q, key: c.key }); continue; }
      if (JSON.stringify(before.q) !== JSON.stringify(q)) {
        errors.push(
          `"${q.name}" (${q.id}) is in both ${before.key} and ${c.key}, and the two do not match. ` +
          `A shared question is one row, so both files have to say the same thing about it.`,
        );
      }
    }
  }
  return errors;
}

// The entity fields each file field maps to, declared once so the applier
// cannot drift from the format. Read by content-apply.js.
export const ENTITY_FIELDS = {
  // `scales` is the one entry the applier cannot copy across: the file names
  // scales by key and the entity holds ids, so content-apply.js resolves them.
  // It is listed anyway, because a field map with a hole in it is how the last
  // one drifted.
  instrument: { scales: "scale_ids", key: "key", name: "name", tagline: "tagline", description: "description",
    question_source: "question_source", report_style: "report_style", band_basis: "band_basis",
    subject_label: "subject_label", ask_ownership: "ask_ownership", internal: "internal",
    active: "active", sort_order: "sort_order" },
  question: { id: "content_key", name: "name", text: "description", type: "question_type",
    section: "section", commentary: "commentary", critical: "critical", required: "required", active: "active" },
  band: { id: "content_key", name: "name", from: "min_score", to: "max_score", advice: "advice" },
  dimension: { id: "content_key", name: "name", blurb: "blurb", strong: "strong", opportunity: "opportunity" },
};
