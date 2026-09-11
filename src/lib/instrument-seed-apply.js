import { INSTRUMENT_SEED } from "@/lib/instrument-seed";

// Where the reading lives. One constant, because the destination is a policy
// decision rather than a property of any one article: the articles stay on the
// site that owns them rather than being duplicated here, and when the CTA-free
// partner version of the blog exists this is the line that points at it.
const ARTICLE_BASE = "https://www.productgrowthleaders.com";

// The path the reading links point at, built from the slug rather than stored
// per article. The blog serves the same piece at more than one address, and the
// one a report should open is the version without the "Talk to a coach" nav and
// the newsletter capture — a report a fractional CPO hands their own client
// should not open onto somebody else's booking page.
//
// Changing where that lives is this one line and a re-run.
//
// /reading/ rather than the public /article/: the same pieces, served without
// the nav and the newsletter capture. Those pages are set to noindex, which is
// why three addresses for one article costs nothing here — search never has to
// arbitrate between them.
const ARTICLE_PREFIX = "/reading/";
const articlePath = (slug) => `${ARTICLE_PREFIX}${slug}`;

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
    resources: { created: 0, updated: 0, unchanged: 0 },
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

  // Instruments whose content now lives in the app. Once an instrument has
  // questions, they, its bands, and its reading are edited on the Instruments
  // screen and the seed stops speaking for them: re-applying would revert every
  // edit, and matching by label would turn a renamed question into a second
  // copy under its old name. The seed still brings a new instrument in, and
  // still owns the scales and the instrument records themselves.
  const adopted = new Set(
    seed.instruments
      .filter((i) => i.question_source === "instrument")
      .map((i) => instrumentId.get(i.key))
      .filter((id) => existingActivities.some((a) => (a.instrument_ids || []).includes(id))),
  );
  const adoptedKeys = new Set(seed.instruments.filter((i) => adopted.has(instrumentId.get(i.key))).map((i) => i.key));
  const seededKeys = new Set(seed.instruments.filter((i) => i.question_source === "instrument").map((i) => i.key));
  // The rows as they end up, collected here because the reading below needs to
  // attach itself to them. `existingActivities` is the snapshot taken before
  // this loop, so on a first run it holds none of these — reading built from it
  // would attach every article to nothing, then quietly fix itself on the
  // second run and report thirteen updates for a seed nobody had touched.
  const questionRows = new Map();
  for (const q of seed.questions) {
    const instIds = q.instrument_keys.map((k) => instrumentId.get(k));
    if (instIds.some((id) => adopted.has(id))) {
      tally.questions.unchanged++;
      continue;
    }
    const row = await upsert(e.Activity, existingActivities,
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
        // Honours the seed rather than forcing true, which is what makes
        // retiring a question possible at all: `active: false` is how one is
        // taken out of the survey and the report without deleting the row that
        // answers point at. Hardcoding true here would quietly revive every
        // retired question on the next run.
        active: q.active !== false,
      }, tally.questions);
    questionRows.set(q.label, row);
  }

  // A question the seed no longer lists is reported, never removed — see the
  // note at the top of this file.
  const orphans = existingActivities.filter((a) => {
    const ids = a.instrument_ids || [];
    if (ids.length === 0) return false;
    const keys = [...instrumentId.entries()].filter(([, id]) => ids.includes(id)).map(([k]) => k);
    if (!keys.some((k) => seededKeys.has(k) && !adoptedKeys.has(k))) return false;
    return !seed.questions.some((q) => q.label === a.name && q.instrument_keys.some((k) => keys.includes(k)));
  });
  for (const o of orphans) {
    notes.push(`"${o.name}" is on an instrument but not in the seed. Left alone — deactivate it if it is finished with.`);
  }

  // ── Reading ────────────────────────────────────────────────────────────────
  //
  // The articles behind each question, as Resource rows attached to it.
  //
  // Stored as a path in the seed and composed against ARTICLE_BASE here, rather
  // than fifteen absolute URLs. The plan is a partner version of the blog
  // without the "Talk to a coach" nav and the newsletter capture — a report a
  // fractional CPO hands their own client should not open onto somebody else's
  // booking page. When that exists, this is one constant to change and a re-run,
  // instead of thirteen rows to edit.
  //
  // free_article, deliberately and for all of them. The type is what tells a
  // reader a free article from a paid course before they click, and it is also
  // the natural switch for showing quartz_book and quartz_course only on our
  // own engagements — asking a CPO to recommend our course to their client is a
  // different thing from giving their client something worth reading.
  say("Reading");
  const existingResources = await e.Resource.list();
  const duplicates = [];
  let readingSeeded = 0;
  for (const [i, r] of (seed.resources || []).entries()) {
    // Reading on an instrument edited in the app is the app's too: a link
    // removed there must stay removed.
    if (!r.question_labels.some((label) => questionRows.has(label))) {
      tally.resources.unchanged++;
      continue;
    }
    readingSeeded++;
    // Matched to questions by label across every instrument that asks them, so
    // one article serving two questions is one row pointing at both — which is
    // how three of these arrived from Wix.
    const mine = r.question_labels
      .map((label) => questionRows.get(label)?.id)
      .filter(Boolean);

    // Matched on the slug, not the whole url and not the title.
    //
    // Title is editable on the blog. Url looked stable and is not: moving these
    // links from /article/ to /reading/ changed every one of them, so a run
    // matching on url could not find the rows it had written itself and created
    // fifteen more — thirty rows for fifteen articles, each one showing twice
    // under its question. The slug is the part that survives both.
    const slugOf = (u) => (u || "").split("?")[0].replace(/\/$/, "").split("/").pop();
    const sameArticle = existingResources.filter((row) => slugOf(row.url) === r.slug);

    // Merged, never replaced. The same article can legitimately be offered for
    // a library activity and for an instrument question, and the field is
    // many-to-many for exactly that reason — overwriting would silently strip
    // an article off every library activity somebody had curated it for, and
    // the personal profile's reading list is built from those.
    const activity_ids = [...new Set([
      ...sameArticle.flatMap((row) => row.activity_ids || []),
      ...mine,
    ])];

    // Where duplicates already exist, the oldest is kept and the rest are
    // retired: it is the one anything else in the app is most likely to point
    // at, and its links have been folded into it above. Retired rather than
    // deleted, like everything else here.
    const [keep, ...extras] = sameArticle;
    const url = `${ARTICLE_BASE}${articlePath(r.slug)}`;

    // An article already in the library is the library's. The seed used to
    // write every field on a match, and nine blog articles someone had added
    // through Library → Resources had their notes replaced, their order moved
    // to the end of every reading list, and would have lost a fallback flag or
    // been switched back on had anyone set one. Now it touches only what it
    // owns: the address, because where reading points is this file's policy
    // and moving it is one line and a re-run; and the questions, merged in
    // above. A note or author is filled only when the library left it blank.
    // Title, type, order, fallback, and active stay as someone set them — so
    // an article switched off in the library stays off.
    //
    // A new article gets the lot, as before.
    const blank = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());
    const patch = keep
      ? {
          url,
          activity_ids,
          ...(blank(keep.note) && r.note ? { note: r.note } : {}),
          ...(blank(keep.source) && r.author ? { source: r.author } : {}),
        }
      : {
          title: r.title,
          resource_type: "free_article",
          // The author, not the firm. Resource.source exists so attribution
          // travels with the recommendation, and some of these are a partner's
          // work — putting the practice's name on them would take the credit
          // off the person who earned it. The footer already badges the
          // framework.
          source: r.author || undefined,
          url,
          note: r.note || undefined,
          activity_ids,
          fallback: false,
          sort_order: i,
          active: true,
        };
    await upsert(e.Resource, existingResources, (row) => row === keep, patch, tally.resources);

    // Every extra row is reported, not only the ones retired on this run.
    // Reporting only what it just changed made the note vanish the moment a
    // duplicate had been retired once — so a row retired last time and never
    // deleted looked exactly like a clean library, which is the wrong way round
    // for a check whose whole job is answering "did I miss any".
    for (const dup of extras) {
      if (dup.active !== false) {
        await e.Resource.update(dup.id, { active: false, activity_ids: [] });
        tally.resources.updated++;
      }
      duplicates.push(r.title);
    }
  }

  // ── Bands ──────────────────────────────────────────────────────────────────
  say("Bands");
  const existingBands = await e.Band.list();
  for (const b of seed.bands) {
    const iid = instrumentId.get(b.instrument_key);
    if (adopted.has(iid)) {
      tally.bands.unchanged++;
      continue;
    }
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
  if (adoptedKeys.size) {
    const names = seed.instruments.filter((i) => adoptedKeys.has(i.key)).map((i) => i.name);
    notes.push(`Edited in the app, so left as they are: ${names.join(", ")} — their questions, bands, and reading.`);
  }
  for (const inst of seed.instruments) {
    if (inst.question_source !== "instrument" || adoptedKeys.has(inst.key)) continue;
    const qs = seed.questions.filter((q) => q.instrument_keys.includes(inst.key) && q.question_type === "rating" && q.active !== false);
    const missing = qs.filter((q) => !q.commentary).length;
    if (missing) notes.push(`${inst.name}: ${missing} of ${qs.length} questions have no commentary yet.`);
  }
  if (duplicates.length) {
    const titles = [...new Set(duplicates)];
    notes.push(
      `${duplicates.length} duplicate reading row${duplicates.length === 1 ? "" : "s"} still present, retired and emptied — ` +
      `${titles.slice(0, 4).join(", ")}${titles.length > 4 ? `, and ${titles.length - 4} more` : ""}. ` +
      `Their links are on the rows that were kept. Delete them in Library > Resources; this note goes away when they are gone.`,
    );
  } else if (readingSeeded) {
    notes.push("No duplicate reading rows — one row per article.");
  }

  const linked = new Set((seed.resources || []).flatMap((r) => r.question_labels));
  const unlinked = seed.questions.filter(
    (q) => q.question_type === "rating" && q.active !== false && (q.blog_id || "").trim() && !linked.has(q.label) &&
      !q.instrument_keys.some((k) => adoptedKeys.has(k)),
  );
  if (unlinked.length) {
    notes.push(
      `${unlinked.length} question${unlinked.length === 1 ? "" : "s"} reference an article that is not in Posts.csv — ` +
      `${unlinked.map((q) => q.label).join(", ")}. Add the title and path to the seed to link them.`,
    );
  }
  const noReading = seed.instruments.filter(
    (i) => i.question_source === "instrument" && !adoptedKeys.has(i.key) &&
      !seed.questions.some((q) => q.instrument_keys.includes(i.key) && linked.has(q.label)),
  );
  for (const i of noReading) notes.push(`${i.name}: no reading attached to any question yet.`);

  return { tally, notes };
}
