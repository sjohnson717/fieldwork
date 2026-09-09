import { INSTRUMENT_SEED } from "@/lib/instrument-seed";

// Applying the six instruments to the backend.
//
// Idempotent by construction, because it will be run more than once: the seed
// is committed content, and editing a question's commentary means re-applying
// it. Everything is matched on a stable key rather than on identity —
// `Scale.key`, `Instrument.key`, a question's name within its instrument, a
// band's name within its instrument — so a second run updates in place instead
// of doubling the library.
//
// Nothing is ever deleted. A question removed from the seed is reported as an
// orphan and left alone, because deleting it would take its answers with it:
// Response rows key on activity_id, and readers drop what they cannot resolve,
// so a delete here removes a question from every report that ever asked it
// with nothing to say it was asked. Retiring one is `active: false`, which is
// the reversible thing, and it belongs to whoever is looking at the data.
//
// Ordering matters and is not incidental. Scales exist before the options that
// point at them and before the instruments that name them; instruments exist
// before the questions and bands that reference their ids. Each phase resolves
// the previous phase's keys to real ids.

// Compared before writing, so a re-run with nothing to say makes no requests
// and the report can honestly say "unchanged" rather than counting every row
// as an update.
const differs = (row, patch) =>
  Object.entries(patch).some(([k, v]) => {
    const before = row[k];
    if (Array.isArray(v)) {
      const a = before || [];
      return a.length !== v.length || v.some((x, i) => a[i] !== x);
    }
    // null and undefined both mean "not set" on a Base44 record, and a field
    // the schema has never been given is absent rather than null.
    if (v === null || v === undefined) return before !== null && before !== undefined;
    return before !== v;
  });

async function upsert(entity, existing, matchOn, patch, tally) {
  const found = existing.find(matchOn);
  if (!found) {
    const created = await entity.create(patch);
    tally.created++;
    return created;
  }
  if (differs(found, patch)) {
    const updated = await entity.update(found.id, patch);
    tally.updated++;
    return updated;
  }
  tally.unchanged++;
  return found;
}

export async function seedInstruments(base44, { onProgress } = {}) {
  const e = base44.entities;
  const seed = INSTRUMENT_SEED;
  const tally = {
    scales: { created: 0, updated: 0, unchanged: 0 },
    options: { created: 0, updated: 0, unchanged: 0 },
    instruments: { created: 0, updated: 0, unchanged: 0 },
    questions: { created: 0, updated: 0, unchanged: 0 },
    bands: { created: 0, updated: 0, unchanged: 0 },
  };
  const notes = [];
  const say = (m) => { onProgress?.(m); };

  // ── Scales and their options ───────────────────────────────────────────────
  say("Scales");
  const existingScales = await e.Scale.list();
  const scaleId = new Map();
  for (const [i, s] of seed.scales.entries()) {
    const row = await upsert(e.Scale, existingScales, (r) => r.key === s.key, {
      key: s.key,
      name: s.name,
      hint: s.hint || undefined,
      unknown_label: s.unknown_label || undefined,
      unknown_treatment: s.unknown_treatment,
      sort_order: i,
      active: true,
    }, tally.scales);
    scaleId.set(s.key, row.id);
  }

  say("Scale options");
  const existingOptions = await e.ScaleOption.list();
  for (const s of seed.scales) {
    const sid = scaleId.get(s.key);
    for (const [i, o] of s.options.entries()) {
      await upsert(e.ScaleOption, existingOptions,
        (r) => r.scale_id === sid && r.label === o.label,
        {
          scale_id: sid,
          label: o.label,
          // An option with no points is a non-rating answer — the team gap's
          // "I don't know". Left undefined rather than zero, which would score
          // it as the worst possible answer instead of no answer at all.
          points: o.points === null ? undefined : o.points,
          sort_order: i,
        }, tally.options);
    }
  }

  // ── Instruments ────────────────────────────────────────────────────────────
  say("Instruments");
  const existingInstruments = await e.Instrument.list();
  const instrumentId = new Map();
  for (const inst of seed.instruments) {
    const row = await upsert(e.Instrument, existingInstruments, (r) => r.key === inst.key, {
      key: inst.key,
      name: inst.name,
      tagline: inst.tagline || undefined,
      description: inst.description || undefined,
      question_source: inst.question_source,
      sections: inst.sections,
      scale_ids: inst.scale_keys.map((k) => scaleId.get(k)),
      ask_ownership: !!inst.ask_ownership,
      report_style: inst.report_style,
      subject_label: inst.subject_label || undefined,
      sort_order: inst.sort_order,
      active: true,
    }, tally.instruments);
    instrumentId.set(inst.key, row.id);
  }

  // ── Questions ──────────────────────────────────────────────────────────────
  //
  // Written to Activity, which is the question entity under an older name. It
  // is not renamed: Response.activity_id, Resource.activity_ids,
  // DiscussionNote.activity_id, ActivitySet.activity_ids and
  // Assessment.activity_ids all point at it with live answers behind them.
  //
  // Matched on name *within an instrument*. Library activities carry no
  // instrument_ids at all, so a seeded question can never collide with one that
  // happens to share a name.
  say("Questions");
  const existingActivities = await e.Activity.list();
  const seededKeys = new Set(seed.instruments.filter((i) => i.question_source === "instrument").map((i) => i.key));
  for (const q of seed.questions) {
    const instIds = q.instrument_keys.map((k) => instrumentId.get(k));
    await upsert(e.Activity, existingActivities,
      (r) => r.name === q.label && (r.instrument_ids || []).some((id) => instIds.includes(id)),
      {
        name: q.label,
        description: q.text,
        instrument_ids: instIds,
        section: q.section,
        section_sort: q.section_sort,
        question_type: q.question_type,
        commentary: q.commentary || undefined,
        critical: !!q.critical,
        required: !!q.required,
        // Every free-text question these four ask is asked of the room and read
        // back to it. The respondent's own closing fields stay unreportable,
        // and they are a different thing on a different entity.
        reportable_text: q.question_type === "text",
        // facet is required by the entity and means nothing here. LEARN is the
        // one facet that runs across the whole cycle rather than sitting at a
        // point in it, which makes it the least wrong constant; nothing reads
        // it for these questions, which page by `section`.
        facet: "LEARN",
        active: true,
      }, tally.questions);
  }

  // A question the seed no longer lists is reported, never removed — see the
  // note at the top of this file.
  const orphans = existingActivities.filter((a) => {
    const ids = a.instrument_ids || [];
    if (ids.length === 0) return false;
    const keys = [...instrumentId.entries()].filter(([, id]) => ids.includes(id)).map(([k]) => k);
    if (!keys.some((k) => seededKeys.has(k))) return false;
    return !seed.questions.some((q) => q.label === a.name && q.instrument_keys.some((k) => keys.includes(k)));
  });
  for (const o of orphans) {
    notes.push(`"${o.name}" is on an instrument but not in the seed. Left alone — deactivate it if it is finished with.`);
  }

  // ── Bands ──────────────────────────────────────────────────────────────────
  say("Bands");
  const existingBands = await e.Band.list();
  for (const b of seed.bands) {
    const iid = instrumentId.get(b.instrument_key);
    await upsert(e.Band, existingBands,
      (r) => r.instrument_id === iid && r.name === b.name,
      {
        instrument_id: iid,
        name: b.name,
        min_score: b.min_score,
        max_score: b.max_score,
        advice: b.advice,
        sort_order: b.sort,
      }, tally.bands);
  }

  // Content gaps worth naming on the screen rather than leaving to be noticed
  // in a client's report.
  for (const inst of seed.instruments) {
    if (inst.question_source !== "instrument") continue;
    const qs = seed.questions.filter((q) => q.instrument_keys.includes(inst.key) && q.question_type === "rating");
    const missing = qs.filter((q) => !q.commentary).length;
    if (missing) notes.push(`${inst.name}: ${missing} of ${qs.length} questions have no commentary yet.`);
  }
  notes.push("Linked articles were not imported — the export carries Wix post ids with no titles or URLs.");

  return { tally, notes };
}
