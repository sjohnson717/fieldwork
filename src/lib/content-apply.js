// Applying a content file to the app, as a plan somebody reads first.
//
// What this replaces: seedInstruments refused to touch an instrument that had
// questions in the app. That was the right guard for the wrong reason — it
// protected edits by making the repository write-only, so a British spelling
// fixed in the seed reported "0 updated, 54 unchanged" and changed nothing
// live, and three questions were then retyped by hand.
//
// The guard here is a diff instead of a refusal. Nothing is written until the
// plan has been read, and the plan says which field on which row changes from
// what to what. An edit in a file and an edit in the app are the same kind of
// thing, and the one that loses is the one somebody chose to overwrite.
//
// Identity is `content_key`, never the name. A reworded question is an edit to
// a row that keeps its answers; matching by name would have made it a new row
// with the answers stranded on the old one.
//
// What is never written:
//
//   A question is never deleted. Response rows key on it, and readers drop what
//   they cannot resolve, so deleting a question removes it from every report
//   that ever asked it with nothing to say it was asked. One dropped from a
//   file is reported, and retiring it (active: no) is the reversible thing.
//
//   Nothing outside the instrument's own content. Library activities carry no
//   instrument_ids and are not touched; a Resource shared with the library
//   keeps its title, note, type, and order, and only the links this instrument
//   owns are added or removed.
//
// A band or a dimension that leaves a file is different, and deliberately so: a
// band left behind is still read by the scoring, so a score can land in a band
// the content no longer defines. Those are listed as deletes for somebody to
// confirm rather than quietly kept.

import { ENTITY_FIELDS, slugify, FACETS } from "@/lib/content-format";


// Where reading points. One line, as before: the articles stay on the site that
// owns them, and the CTA-free partner version of the blog is this constant.
const ARTICLE_BASE = "https://www.productgrowthleaders.com";
const ARTICLE_PREFIX = "/reading/";
export const articleUrl = (slug) => `${ARTICLE_BASE}${ARTICLE_PREFIX}${slug}`;
export const slugOfUrl = (u) => (u || "").split("?")[0].replace(/\/$/, "").split("/").pop();

// facet is required by Activity and means nothing for a question. LEARN is the
// one facet that runs across the whole cycle rather than sitting at a point in
// it, which makes it the least wrong constant; nothing reads it for these rows,
// which page by section.
const QUESTION_FACET = "LEARN";

// Stands in for an instrument that does not exist yet, so a plan built against
// a fresh app can still say what it is going to do. A question shared with an
// instrument already in the app looked unchanged without this — the row was
// right in every field, and the link to the instrument being created in the
// same run was the one thing missing, which is exactly the kind of silence
// this rewrite exists to remove. applyPlan swaps it for the real id.
export const NEW_INSTRUMENT = "(this instrument)";

const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());

// Same comparison the old seeder used, and for the same reason: a re-run with
// nothing to say should make no requests and report "unchanged" honestly rather
// than counting every row as an update.
const changedFields = (row, patch) => {
  const out = [];
  for (const [field, to] of Object.entries(patch)) {
    const from = row?.[field];
    if (Array.isArray(to)) {
      const a = Array.isArray(from) ? from : [];
      if (a.length !== to.length || to.some((x, i) => a[i] !== x)) out.push({ field, from: a, to });
      continue;
    }
    if (isBlank(to) ? !isBlank(from) : from !== to) out.push({ field, from, to });
  }
  return out;
};

// ── Turning a file into the rows it describes ───────────────────────────────
//
// Every derived value is derived here, in one place. section_sort and the two
// sort_orders come from document order, reportable_text from the question type,
// and the instrument's section list from its dimension blocks — so a file that
// says nothing about ordering still produces the order it reads in.

const mapFields = (kind, src) => {
  const out = {};
  for (const [from, to] of Object.entries(ENTITY_FIELDS[kind])) out[to] = src[from];
  return out;
};

export function rowsFor(content, { scaleIdByKey }) {
  const instrument = mapFields("instrument", content);
  instrument.scale_ids = content.scales.map((k) => scaleIdByKey.get(k)).filter(Boolean);
  instrument.sections = content.dimensions.map((d) => d.name);

  const perSection = new Map();
  const questions = content.questions.map((q) => {
    const n = (perSection.get(q.section) ?? 0) + 1;
    perSection.set(q.section, n);
    return {
      content: q,
      patch: {
        ...mapFields("question", q),
        section_sort: n,
        reportable_text: q.type === "text",
        facet: QUESTION_FACET,
      },
    };
  });

  const bands = content.bands.map((b, i) => ({ content: b, patch: { ...mapFields("band", b), sort_order: i } }));
  // A dimension earns a row when it has prose to hold. Its name is already in
  // the instrument's own section list, which is what the survey pages and the
  // reports read, so a dimension block with nothing written under it is a
  // heading rather than a record — and every section of the four Wix
  // instruments and both library instruments is one of those. Twenty-odd empty
  // rows that nothing reads is not a neutral cost: it is twenty-odd rows
  // somebody has to understand later.
  const dimensions = content.dimensions.map((d, i) => ({
    content: d,
    patch: { ...mapFields("dimension", d), sort_order: i },
    prose: !!(d.blurb || d.strong || d.opportunity),
  }));

  return { instrument, questions, bands, dimensions };
}

// ── The plan ────────────────────────────────────────────────────────────────

const action = (row, changes) => (!row ? "create" : changes.length ? "update" : "unchanged");

// Matched on content_key, and on name only for a row that has no content_key
// yet — the one-time adoption of everything that existed before this format.
// After that a name is just a field, free to change.
// The id pool is wider than the name pool on purpose. A content_key is global
// across the content files — two files using one id mean one question, which is
// how the closing "Final Thoughts" serves both the idea screen and the product
// quiz — so a row is looked up by id among every instrument's questions.
// Adoption by name stays inside this instrument, because a name is not an
// identity and two instruments can easily ask something similarly named.
const matcher = (byIdPool, byNamePool, key, name) => {
  const byKey = byIdPool.find((r) => r.content_key && r.content_key === key);
  if (byKey) return byKey;
  return byNamePool.find((r) => !r.content_key && r.name === name) || null;
};

export function planInstrument(content, live) {
  const scaleIdByKey = new Map((live.scales || []).map((s) => [s.key, s.id]));
  const { instrument, questions, bands, dimensions } = rowsFor(content, { scaleIdByKey });

  const existing = (live.instruments || []).find((i) => i.key === content.key) || null;
  const iid = existing?.id || null;
  const selfId = iid || NEW_INSTRUMENT;
  const mine = (rows) => rows.filter((r) => r.instrument_id === iid);
  const myQuestions = iid
    ? (live.activities || []).filter((a) => (a.instrument_ids || []).includes(iid))
    : [];
  // Instrument questions, whichever instrument they are on. Library activities
  // carry no instrument_ids and are never in here.
  const allQuestions = (live.activities || []).filter((a) => (a.instrument_ids || []).length);

  const plan = {
    key: content.key,
    name: content.name,
    instrumentId: iid,
    instrument: { action: action(existing, changedFields(existing, instrument)), patch: instrument, changes: changedFields(existing, instrument), row: existing },
    questions: [],
    bands: [],
    dimensions: [],
    reading: [],
    orphans: [],
    deletes: [],
    missingScales: content.scales.filter((k) => !scaleIdByKey.has(k)),
  };

  for (const { content: q, patch } of questions) {
    const row = matcher(allQuestions, myQuestions, q.id, q.name);
    // Never narrowed. One question can serve two instruments — the closing
    // "Final Thoughts" does — and applying one file must not unlink the other.
    const instrument_ids = [...new Set([...(row?.instrument_ids || []), selfId])];
    const full = { ...patch, content_key: q.id, instrument_ids };
    plan.questions.push({
      id: q.id, name: q.name, rowId: row?.id || null, row,
      adopted: !!row && !row.content_key,
      changes: changedFields(row, full), action: action(row, changedFields(row, full)), patch: full,
    });
  }

  for (const [collection, rows, liveRows] of [
    ["bands", bands, mine(live.bands || [])],
    ["dimensions", dimensions, mine(live.sections || [])],
  ]) {
    for (const { content: c, patch, prose } of rows) {
      const row = matcher(liveRows, liveRows, c.id, c.name);
      // No prose and no row: nothing to write. A row that exists is kept in the
      // plan, so prose deleted from a file is cleared rather than left behind.
      if (prose === false && !row) continue;
      const full = { ...patch, content_key: c.id, instrument_id: selfId };
      plan[collection].push({
        id: c.id, name: c.name, rowId: row?.id || null, row,
        adopted: !!row && !row.content_key,
        changes: changedFields(row, full), action: action(row, changedFields(row, full)), patch: full,
      });
    }
  }

  // Reading, per article rather than per link: one Resource row serves every
  // question that lists it, which is how three of these arrived from Wix.
  const wanted = new Map();
  for (const { content: q } of questions) {
    for (const l of q.reading) {
      if (!wanted.has(l.slug)) wanted.set(l.slug, { slug: l.slug, title: l.title, questionIds: [] });
      wanted.get(l.slug).questionIds.push(q.id);
    }
  }
  const myQuestionIds = new Set(plan.questions.map((q) => q.rowId).filter(Boolean));
  const resourcesBySlug = new Map();
  for (const r of live.resources || []) {
    const s = slugOfUrl(r.url);
    if (!resourcesBySlug.has(s)) resourcesBySlug.set(s, []);
    resourcesBySlug.get(s).push(r);
  }
  // A link this instrument's questions used to carry and the file no longer
  // lists. Unlinked, never deleted: the row may be a library article too, and
  // removing a link is the edit that was asked for.
  const slugsNow = new Set(wanted.keys());
  for (const [slug, rows] of resourcesBySlug) {
    if (slugsNow.has(slug)) continue;
    for (const r of rows) {
      const keep = (r.activity_ids || []).filter((id) => !myQuestionIds.has(id));
      if (keep.length !== (r.activity_ids || []).length) {
        plan.reading.push({ slug, title: r.title, action: "unlink", rowId: r.id, patch: { activity_ids: keep }, questionIds: [] });
      }
    }
  }
  // The row ids this instrument's questions will have. A question being created
  // in this run has none yet, which is the one case a link cannot be compared
  // and is written unconditionally.
  const rowIdFor = new Map(plan.questions.map((q) => [q.id, q.rowId]));
  const sameIds = (a, b) => {
    const x = [...new Set(a)].sort(), y = [...new Set(b)].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  };

  for (const w of wanted.values()) {
    const [keep, ...extras] = resourcesBySlug.get(w.slug) || [];
    const questionRowIds = w.questionIds;
    if (!keep) {
      plan.reading.push({
        slug: w.slug, title: w.title, action: "create", rowId: null, questionIds: questionRowIds,
        patch: { title: w.title, resource_type: "free_article", url: articleUrl(w.slug), fallback: false, active: true },
      });
    } else {
      // Only what this owns: the address, and the links. Title, type, note,
      // order, fallback, and active stay as somebody set them — nine blog
      // articles added through Settings → Resources once had their notes
      // replaced and their order moved to the end of every reading list.
      //
      // Compared before being written, like everything else here: a reading
      // list that has not moved used to be restated on every run, which made a
      // re-run with nothing to do report a dozen writes.
      const resolved = questionRowIds.map((k) => rowIdFor.get(k));
      const unknown = resolved.some((id) => !id);
      const others = (keep.activity_ids || []).filter((id) => !myQuestionIds.has(id));
      const desired = [...others, ...resolved.filter(Boolean)];
      const changed = unknown || !sameIds(keep.activity_ids || [], desired) || keep.url !== articleUrl(w.slug);
      if (changed) {
        plan.reading.push({
          slug: w.slug, title: keep.title || w.title, action: "link", rowId: keep.id, questionIds: questionRowIds,
          patch: { url: articleUrl(w.slug) }, row: keep,
        });
      }
    }
    for (const dup of extras) {
      if (dup.active !== false) {
        plan.reading.push({ slug: w.slug, title: dup.title, action: "retire-duplicate", rowId: dup.id, patch: { active: false, activity_ids: [] }, questionIds: [] });
      }
    }
  }

  // What the app has and the file does not.
  const fileQuestionKeys = new Set(plan.questions.map((q) => q.id));
  for (const a of myQuestions) {
    const key = a.content_key || slugify(a.name);
    if (fileQuestionKeys.has(key)) continue;
    plan.orphans.push({
      kind: "question", name: a.name, rowId: a.id, retired: a.active === false,
      // Named rather than removed. The answers are the reason.
      advice: a.active === false ? "Retired already — left alone." : "Left alone. Retire it in the editor if it is finished with.",
    });
  }
  for (const [kind, liveRows, planned] of [
    ["band", mine(live.bands || []), plan.bands],
    ["dimension", mine(live.sections || []), plan.dimensions],
  ]) {
    const keys = new Set(planned.map((p) => p.id));
    for (const r of liveRows) {
      if (keys.has(r.content_key || slugify(r.name))) continue;
      // A band the file no longer defines is still read by the scoring, so
      // leaving it is not the safe option. Listed for confirmation.
      plan.deletes.push({ kind, name: r.name, rowId: r.id });
    }
  }

  // The order each collection ends up in, against the order it is in now. Only
  // the rows both sides have are compared: a question the file adds is not a
  // reordering of the ones already there.
  const resequence = (before, after) => {
    const shared = new Set(after.filter((n) => before.includes(n)));
    const b = before.filter((n) => shared.has(n));
    const a = after.filter((n) => shared.has(n));
    return { before: b, after: a, changed: b.length === a.length && b.some((n, i) => n !== a[i]) };
  };
  const rank = new Map((existing?.sections || []).map((n, i) => [n, i]));
  const appQuestionOrder = [...myQuestions].sort((x, y) => {
    const at = (q) => (rank.has(q.section) ? rank.get(q.section) : rank.size);
    return at(x) - at(y) || (x.section_sort ?? 0) - (y.section_sort ?? 0);
  });
  plan.order = {
    questions: resequence(appQuestionOrder.map((q) => q.name), plan.questions.map((q) => q.name)),
    bands: resequence(
      [...mine(live.bands || [])].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)).map((b) => b.name),
      plan.bands.map((b) => b.name),
    ),
    dimensions: resequence(existing?.sections || [], content.dimensions.map((d) => d.name)),
  };

  plan.counts = {
    questions: tally(plan.questions), bands: tally(plan.bands), dimensions: tally(plan.dimensions),
    reading: { create: plan.reading.filter((r) => r.action === "create").length, link: plan.reading.filter((r) => r.action === "link").length, unlink: plan.reading.filter((r) => r.action === "unlink").length },
  };
  plan.writes = writeCount(plan);
  return plan;
}

const tally = (rows) => ({
  create: rows.filter((r) => r.action === "create").length,
  update: rows.filter((r) => r.action === "update").length,
  unchanged: rows.filter((r) => r.action === "unchanged").length,
  adopted: rows.filter((r) => r.adopted).length,
});

const writeCount = (plan) =>
  (plan.instrument.action === "unchanged" ? 0 : 1) +
  [...plan.questions, ...plan.bands, ...plan.dimensions].filter((r) => r.action !== "unchanged").length +
  plan.reading.length;

// Fields nobody wrote. An id, a position, a link, and the two flags derived
// from a question's type: all of them real changes that have to be applied, and
// none of them anything a person typed or would recognise as content.
//
// The distinction earns its place on the first run against a live app. Eleven
// questions adopting their ids and ten taking their position from the file is
// twenty-one true differences and nothing to decide about — and printed beside
// the wording changes, it buries them. The first real sync reported "28 to
// write" on one instrument, of which nought were content.
const BOOKKEEPING = new Set([
  "content_key", "reportable_text", "facet", "instrument_ids", "scale_ids", "instrument_id",
]);

// Position, which is neither content nor bookkeeping and must not be filed as
// either. A position printed as a number is unreadable — "App 4, File 0" on one
// band and "App 1, File 3" on another is the app holding its bands in reverse,
// and nothing about those four numbers says so. So the two ordering fields are
// pulled out of the field list entirely and reported as the sequence they
// produce, which is the thing somebody can actually decide about.
const ORDERING = new Set(["section_sort", "sort_order"]);

export const isBookkeeping = (field) => BOOKKEEPING.has(field);
export const isOrdering = (field) => ORDERING.has(field);

// Every field that changes, flattened for the screen. One line per field, which
// is the level the last round of this needed: "14 fields drifted" was true and
// useless, and naming them was a bespoke script.
export function planDiff(plan) {
  const out = [];
  const push = (kind, name, changes, act) => {
    for (const c of changes) {
      out.push({
        kind, name, action: act, ...c,
        group: isOrdering(c.field) ? "order" : isBookkeeping(c.field) ? "bookkeeping" : "content",
      });
    }
    if (!changes.length && act === "create") out.push({ kind, name, action: act, field: null, from: null, to: null });
  };
  push("instrument", plan.name, plan.instrument.changes, plan.instrument.action);
  for (const q of plan.questions) if (q.action !== "unchanged") push("question", q.name, q.changes, q.action);
  for (const d of plan.dimensions) if (d.action !== "unchanged") push("dimension", d.name, d.changes, d.action);
  for (const b of plan.bands) if (b.action !== "unchanged") push("band", b.name, b.changes, b.action);
  return out;
}

// ── Writing it ──────────────────────────────────────────────────────────────
//
// Ordered by dependency: the instrument exists before the rows that carry its
// id, and the questions exist before the reading that points at them.
//
// `content_key` is checked on the first row that carries it, because a field
// the entity schema has not been given is dropped on write with no error at
// all — create succeeds and returns a record with the column simply missing.
// That is worth one honest stop rather than a run that reports success and
// matched nothing on the next pass.

export async function applyPlan(base44, plan, { onProgress, confirmDeletes = false } = {}) {
  const e = base44.entities;
  const say = (m) => onProgress?.(m);
  const written = { instruments: 0, questions: 0, bands: 0, dimensions: 0, reading: 0, deleted: 0 };
  const notes = [];

  if (plan.missingScales.length) {
    throw new Error(`content/scales.md has no scale called ${plan.missingScales.join(", ")}. Apply the scales first.`);
  }

  say("Instrument");
  let iid = plan.instrumentId;
  if (plan.instrument.action === "create") {
    const row = await e.Instrument.create(plan.instrument.patch);
    iid = row.id;
    written.instruments++;
  } else if (plan.instrument.action === "update") {
    await e.Instrument.update(iid, plan.instrument.patch);
    written.instruments++;
  }

  let schemaChecked = false;
  const checkSchema = (row, entity) => {
    if (schemaChecked || !row) return;
    schemaChecked = true;
    if (row.content_key === undefined || row.content_key === null) {
      throw new Error(
        `${entity} has no content_key column yet, so nothing here can be matched on a second run. ` +
        `The field is in base44/entities/${entity}.jsonc — publish the app, then apply again. Nothing further was written.`,
      );
    }
  };

  const resolveIds = (ids) => [...new Set((ids || []).map((x) => (x === NEW_INSTRUMENT ? iid : x)))];

  say("Questions");
  const questionRowId = new Map();
  for (const q of plan.questions) {
    if (q.action === "create") {
      const row = await e.Activity.create({ ...q.patch, instrument_ids: resolveIds(q.patch.instrument_ids) });
      checkSchema(row, "Activity");
      questionRowId.set(q.id, row.id);
      written.questions++;
    } else if (q.action === "update") {
      const row = await e.Activity.update(q.rowId, { ...q.patch, instrument_ids: resolveIds(q.patch.instrument_ids) });
      checkSchema(row, "Activity");
      questionRowId.set(q.id, q.rowId);
      written.questions++;
    } else {
      questionRowId.set(q.id, q.rowId);
    }
  }

  for (const [collection, entity, counter] of [["dimensions", e.InstrumentSection, "dimensions"], ["bands", e.Band, "bands"]]) {
    say(collection === "bands" ? "Bands" : "Dimensions");
    for (const r of plan[collection]) {
      if (r.action === "create") { await entity.create({ ...r.patch, instrument_id: iid }); written[counter]++; }
      else if (r.action === "update") { await entity.update(r.rowId, { ...r.patch, instrument_id: iid }); written[counter]++; }
    }
  }

  say("Reading");
  for (const r of plan.reading) {
    const ids = r.questionIds.map((k) => questionRowId.get(k)).filter(Boolean);
    if (r.action === "create") {
      await e.Resource.create({ ...r.patch, activity_ids: ids, sort_order: 0 });
    } else if (r.action === "link") {
      // Merged with whatever else points at the row, minus this instrument's
      // questions, which are being restated: a link removed in the file is
      // removed here, and a library activity's link is not.
      const mineNow = new Set(plan.questions.map((q) => questionRowId.get(q.id)).filter(Boolean));
      const others = (r.row?.activity_ids || []).filter((id) => !mineNow.has(id));
      await e.Resource.update(r.rowId, { ...r.patch, activity_ids: [...new Set([...others, ...ids])] });
    } else {
      await e.Resource.update(r.rowId, r.patch);
    }
    written.reading++;
  }

  if (plan.deletes.length) {
    if (confirmDeletes) {
      say("Removing what the file no longer defines");
      for (const d of plan.deletes) {
        await (d.kind === "band" ? e.Band : e.InstrumentSection).delete(d.rowId);
        written.deleted++;
      }
    } else {
      notes.push(
        `${plan.deletes.length} ${plan.deletes.length === 1 ? "row is" : "rows are"} no longer in the file and ${plan.deletes.length === 1 ? "was" : "were"} left in place: ` +
        `${plan.deletes.map((d) => `${d.name} (${d.kind})`).join(", ")}. A band left behind still catches scores — confirm the removal to apply it.`,
      );
    }
  }
  for (const o of plan.orphans) notes.push(`"${o.name}" is on this instrument but not in the file. ${o.advice}`);

  return { written, notes };
}

// ── Scales ──────────────────────────────────────────────────────────────────
//
// Shared by every instrument, so they live in one file and are applied on their
// own. Options are matched on their label within their scale, and an option
// carrying no points stays without them: a non-rating answer written as zero
// would score as the worst possible answer rather than as no answer at all,
// which is the difference between "I don't know" and "not done".

export function planScales(scales, live) {
  const existing = live.scales || [];
  const existingOptions = live.scaleOptions || [];
  const plan = { scales: [], options: [], orphans: [] };
  for (const [i, s] of scales.entries()) {
    const row = existing.find((r) => r.key === s.id) || null;
    const patch = {
      key: s.id, name: s.name, hint: s.hint || undefined,
      unknown_label: s.unknown_label || undefined,
      unknown_treatment: s.unknown_treatment, sort_order: i, active: true,
    };
    const changes = changedFields(row, patch);
    plan.scales.push({ id: s.id, name: s.name, rowId: row?.id || null, action: action(row, changes), changes, patch });
    for (const [n, o] of s.options.entries()) {
      const oRow = row ? existingOptions.find((r) => r.scale_id === row.id && r.label === o.label) || null : null;
      const oPatch = { scale_id: row?.id || NEW_INSTRUMENT, label: o.label, points: o.points === null ? undefined : o.points, sort_order: n };
      const oChanges = changedFields(oRow, oPatch);
      plan.options.push({ scale: s.id, label: o.label, rowId: oRow?.id || null, action: action(oRow, oChanges), changes: oChanges, patch: oPatch });
    }
    // An option the file no longer lists. Named, not removed: Response rows
    // carry the label they were answered with.
    for (const r of existingOptions.filter((r) => row && r.scale_id === row.id)) {
      if (!s.options.some((o) => o.label === r.label)) plan.orphans.push({ scale: s.id, label: r.label });
    }
  }
  plan.writes = [...plan.scales, ...plan.options].filter((r) => r.action !== "unchanged").length;
  return plan;
}

export async function applyScales(base44, plan, { onProgress } = {}) {
  const e = base44.entities;
  onProgress?.("Scales");
  const written = { scales: 0, options: 0 };
  const idFor = new Map();
  for (const s of plan.scales) {
    if (s.action === "create") { const row = await e.Scale.create(s.patch); idFor.set(s.id, row.id); written.scales++; }
    else { idFor.set(s.id, s.rowId); if (s.action === "update") { await e.Scale.update(s.rowId, s.patch); written.scales++; } }
  }
  onProgress?.("Scale options");
  for (const o of plan.options) {
    if (o.action === "unchanged") continue;
    const patch = { ...o.patch, scale_id: o.patch.scale_id === NEW_INSTRUMENT ? idFor.get(o.scale) : o.patch.scale_id };
    if (o.action === "create") await e.ScaleOption.create(patch);
    else await e.ScaleOption.update(o.rowId, patch);
    written.options++;
  }
  const notes = plan.orphans.map((o) => `"${o.label}" is an option on ${o.scale} that content/scales.md no longer lists. Left alone — answers carry their label.`);
  return { written, notes };
}

// ── Back out again ──────────────────────────────────────────────────────────
//
// The live rows as a content file. This is the direction that used to be a
// separate hand-written export, and the reason ten prose fields went missing
// from a backup: it read the same field map as the applier, and it does now.
//
// Order is read from the app and written as document order — the instrument's
// own section list first, then each question's section_sort within it, which is
// the order the survey asks them in.

const reverse = (kind) => Object.entries(ENTITY_FIELDS[kind]).map(([file, entity]) => [file, entity]);

const unmap = (kind, row) => {
  const out = {};
  for (const [file, entity] of reverse(kind)) out[file] = row?.[entity];
  return out;
};

export function contentFromLive(instrument, live) {
  const iid = instrument.id;
  const keyForScale = new Map((live.scales || []).map((s) => [s.id, s.key]));
  const content = unmap("instrument", instrument);
  content.scales = (instrument.scale_ids || []).map((id) => keyForScale.get(id)).filter(Boolean);

  // Matches the canonical order in content-format.js: declared sections first,
  // in the instrument's own order, then any section only a question names.
  const questionsHere = (live.activities || []).filter((a) => (a.instrument_ids || []).includes(iid));
  const declared = instrument.sections || [];
  const extra = [...new Set(questionsHere.map((a) => a.section).filter((s) => s && !declared.includes(s)))].sort();
  const order = new Map([...declared, ...extra].map((n, i) => [n, i]));
  const at = (name) => (order.has(name) ? order.get(name) : order.size);

  // From the instrument's own section list, which is the ordered, authoritative
  // one, with the prose attached where a row holds any. Reading the rows instead
  // would drop every section that has no prose — which is most of them, and was
  // how a dimension came out of the old export as a bare name.
  const sectionRows = (live.sections || []).filter((r) => r.instrument_id === iid);
  // The declared list, plus any row that holds prose for a section the list has
  // lost — never the sections that only a question names. Those are ordered
  // after the declared ones and are not dimensions: writing them out as blocks
  // would declare three retired comment boxes' sections as dimensions of the
  // instrument.
  const undeclaredWithProse = sectionRows.map((r) => r.name).filter((n) => !declared.includes(n));
  content.dimensions = [...declared, ...new Set(undeclaredWithProse)].map((name) => {
    const row = sectionRows.find((r) => r.name === name);
    return row
      ? { ...unmap("dimension", row), name, id: row.content_key || slugify(name) }
      : { name, id: slugify(name) };
  });

  content.questions = questionsHere
    .slice()
    .sort((a, b) => at(a.section) - at(b.section) || (a.section_sort ?? 0) - (b.section_sort ?? 0))
    .map((a) => ({
      ...unmap("question", a),
      id: a.content_key || slugify(a.name),
      reading: (live.resources || [])
        .filter((r) => (r.activity_ids || []).includes(a.id) && r.active !== false)
        .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
        .map((r) => ({ title: r.title, slug: slugOfUrl(r.url) })),
    }));

  content.bands = (live.bands || [])
    .filter((r) => r.instrument_id === iid)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.min_score ?? 0) - (b.min_score ?? 0))
    .map((r) => ({ ...unmap("band", r), id: r.content_key || slugify(r.name) }));

  return content;
}

export function scalesFromLive(live) {
  return (live.scales || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => ({
      id: s.key, name: s.name, hint: s.hint, unknown_label: s.unknown_label,
      unknown_treatment: s.unknown_treatment,
      options: (live.scaleOptions || [])
        .filter((o) => o.scale_id === s.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((o) => ({ label: o.label, points: o.points === undefined ? null : o.points })),
    }));
}

// ── The activity library ────────────────────────────────────────────────────
//
// A file per phase, and the phase is the file: an activity's facet comes from
// which file it is in, and its position from where it sits in that file.
//
// Nothing is ever deleted here either, and the reason is the same shape as a
// question's. Assessment.activity_ids, ActivitySet.activity_ids, Response and
// DiscussionNote all point at these rows, and an assessment that used an
// activity keeps pointing at it long after the library stops offering it.
// Retiring is `active: no`, which takes it out of the picker and leaves every
// answer where it is.

export function planLibrary(byFacet, live) {
  const existing = (live.activities || []).filter((a) => !a.assessment_id && !(a.instrument_ids || []).length);
  const plan = { activities: [], orphans: [], moved: [] };
  let position = 0;
  for (const facet of FACETS) {
    for (const a of (byFacet[facet] || [])) {
      const row = matcher(existing, existing, a.id, a.name);
      const patch = { ...mapFields("activity", a), content_key: a.id, facet, sort_order: position++ };
      const changes = changedFields(row, patch);
      plan.activities.push({
        id: a.id, name: a.name, facet, rowId: row?.id || null, row,
        adopted: !!row && !row.content_key,
        changes, action: action(row, changes), patch,
      });
      // Worth naming rather than leaving in a list of field changes: moving an
      // activity between phases moves it between pages of the survey.
      if (row && row.facet && row.facet !== facet) plan.moved.push({ name: a.name, from: row.facet, to: facet });
    }
  }
  const ids = new Set(plan.activities.map((a) => a.id));
  for (const row of existing) {
    if (ids.has(row.content_key || slugify(row.name))) continue;
    plan.orphans.push({
      name: row.name, rowId: row.id, retired: row.active === false,
      advice: row.active === false ? "Retired already — left alone." : "Left alone. Retire it in the Library if it is finished with.",
    });
  }
  plan.counts = tally(plan.activities);
  plan.writes = plan.activities.filter((a) => a.action !== "unchanged").length;
  return plan;
}

export async function applyLibrary(base44, plan, { onProgress } = {}) {
  const e = base44.entities;
  onProgress?.("Library");
  const written = { activities: 0 };
  let schemaChecked = false;
  for (const a of plan.activities) {
    if (a.action === "unchanged") continue;
    const row = a.action === "create" ? await e.Activity.create(a.patch) : await e.Activity.update(a.rowId, a.patch);
    if (!schemaChecked) {
      schemaChecked = true;
      if (row.content_key === undefined || row.content_key === null) {
        throw new Error("Activity has no content_key column yet, so nothing here can be matched on a second run. Publish the app, then apply again.");
      }
    }
    written.activities++;
  }
  const notes = plan.orphans.map((o) => `"${o.name}" is in the library but not in the files. ${o.advice}`);
  for (const m of plan.moved) notes.push(`"${m.name}" moved from ${m.from} to ${m.to}.`);
  return { written, notes };
}

export function libraryFromLive(live) {
  const rows = (live.activities || [])
    .filter((a) => !a.assessment_id && !(a.instrument_ids || []).length)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const byFacet = {};
  for (const facet of FACETS) byFacet[facet] = [];
  for (const row of rows) {
    const facet = FACETS.includes(row.facet) ? row.facet : FACETS[0];
    byFacet[facet].push({ ...unmap("activity", row), id: row.content_key || slugify(row.name) });
  }
  return byFacet;
}

// ── Resources ───────────────────────────────────────────────────────────────
//
// The record and the library activities it is offered for. An instrument
// question's reading stays in the instrument's file: one link declared in two
// places is the drift this format exists to remove, so applying a resource file
// merges its library links and leaves every instrument link exactly as it is.

export function planResources(resources, live, { libraryIdByKey = new Map() } = {}) {
  const existing = live.resources || [];
  const instrumentQuestionIds = new Set(
    (live.activities || []).filter((a) => (a.instrument_ids || []).length).map((a) => a.id),
  );
  const plan = { resources: [], orphans: [], unknownActivities: [] };
  for (const [i, r] of resources.entries()) {
    const row = existing.find((x) => x.content_key && x.content_key === r.id)
      || existing.find((x) => !x.content_key && slugOfUrl(x.url) === slugOfUrl(r.url))
      || null;
    const wanted = [];
    for (const key of r.activities) {
      const id = libraryIdByKey.get(key);
      if (id) wanted.push(id);
      else plan.unknownActivities.push({ resource: r.title, activity: key });
    }
    // Instrument links are the instrument files' business and are carried
    // across untouched; only the library half of the list is restated here.
    const keptInstrumentLinks = (row?.activity_ids || []).filter((id) => instrumentQuestionIds.has(id));
    const patch = {
      ...mapFields("resource", r),
      content_key: r.id,
      sort_order: i,
      activity_ids: [...new Set([...keptInstrumentLinks, ...wanted])],
    };
    const changes = changedFields(row, patch);
    plan.resources.push({
      id: r.id, title: r.title, rowId: row?.id || null, row,
      adopted: !!row && !row.content_key,
      changes, action: action(row, changes), patch,
    });
  }
  const ids = new Set(resources.map((r) => r.id));
  for (const row of existing) {
    if (ids.has(row.content_key || slugify(row.title))) continue;
    plan.orphans.push({ title: row.title, rowId: row.id, active: row.active !== false });
  }
  plan.counts = tally(plan.resources);
  plan.writes = plan.resources.filter((r) => r.action !== "unchanged").length;
  return plan;
}

export async function applyResources(base44, plan, { onProgress } = {}) {
  const e = base44.entities;
  onProgress?.("Resources");
  const written = { resources: 0 };
  for (const r of plan.resources) {
    if (r.action === "unchanged") continue;
    if (r.action === "create") await e.Resource.create(r.patch);
    else await e.Resource.update(r.rowId, r.patch);
    written.resources++;
  }
  const notes = plan.orphans.map((o) =>
    `"${o.title}" is in Settings → Resources but not in content/resources.md. Left alone${o.active ? "" : " (already switched off)"}.`);
  for (const u of plan.unknownActivities) {
    notes.push(`"${u.resource}" names "${u.activity}", which is not an activity in the library. That link was not made.`);
  }
  return { written, notes };
}

export function resourcesFromLive(live) {
  const libraryKeyById = new Map(
    (live.activities || [])
      .filter((a) => !a.assessment_id && !(a.instrument_ids || []).length)
      .map((a) => [a.id, a.content_key || slugify(a.name)]),
  );
  return (live.resources || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((row) => ({
      ...unmap("resource", row),
      id: row.content_key || slugify(row.title),
      // Only the library half. The instrument half is written in the
      // instrument's own file, and repeating it here would be two places to
      // keep in step.
      activities: (row.activity_ids || []).map((id) => libraryKeyById.get(id)).filter(Boolean),
    }));
}
