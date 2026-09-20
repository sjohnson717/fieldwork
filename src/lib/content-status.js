import {
  planInstrument, planScales, planLibrary, planResources, planJobTitles, planActivitySets, planSkippedPosts,
  contentFromLive, scalesFromLive, libraryFromLive, resourcesFromLive, jobTitlesFromLive,
  activitySetsFromLive, skippedPostsFromLive,
} from "@/lib/content-apply";
import {
  writeInstrument, writeScales, writeLibrary, writeResources, writeJobTitles,
  writeActivitySets, writeSkippedPosts, FACETS,
} from "@/lib/content-format";
import { CONTENT_DIR } from "@/lib/content-read";

// Whether the app and the repository still say the same thing.
//
// Content files answers this one file at a time, for somebody who came to that
// screen to sync something. This answers it for somebody who did not: the
// whole set, reduced to a state per file, so System Health can say that an
// afternoon's editing has never been committed — which is the failure nobody
// goes looking for, because nothing about the app looks wrong while it is
// happening.
//
// The comparison itself is not reimplemented here. It is the same plan and
// writer functions the sync screen uses, so a file that reads "up to date"
// there cannot read as drift here.
//
// Pure, and reading no files itself: the reading is content-live.js, which is
// the module that builds the backend client and imports the bundled copy of
// the branch. Neither of those can be stood up in a test, and this is the part
// worth testing.

// One row per file, in the order the sync screen lists them.
//
//   missing  the app holds this content and no file does — nothing would bring
//            it back, which is the only state here with one right answer
//   drift    both sides have it and they differ
//   ok       they agree
//
// `writes` and `differs` are kept apart because they are different facts: a
// file that would write to the app is an edit made in the repository, and an
// app that differs from its file is an edit made in the app. A row can be both.
const row = (key, label, path, { present, writes = 0, appText = null, fileText = null, problems = [] }) => {
  const differs = !!appText && appText !== fileText;
  return {
    key, label, path, present, writes, differs, problems,
    state: !present ? "missing" : (differs || writes > 0) ? "drift" : "ok",
  };
};

export function contentStatus(content, files, live) {
  const problemsFor = (path) => content.problems.filter((p) => p.path === path).flatMap((p) => p.errors);
  const rows = [];

  const scalesPath = `${CONTENT_DIR}/scales.md`;
  rows.push(row("scales", "Answer scales", scalesPath, {
    present: files[scalesPath] !== undefined,
    writes: planScales(content.scales, live).writes,
    appText: live.scales.length ? writeScales(scalesFromLive(live)) : null,
    fileText: files[scalesPath] ?? null,
    problems: problemsFor(scalesPath),
  }));

  const back = libraryFromLive(live);
  rows.push(row("library", "Activity library", `${CONTENT_DIR}/library/`, {
    present: content.library.present,
    writes: content.library.present ? planLibrary(content.library.byFacet, live).writes : 0,
    // One row for seven files: they are one library, and a phase file that
    // differs is the library differing.
    appText: FACETS.map((f) => writeLibrary(f, back[f])).join("\n"),
    fileText: FACETS.map((f) => files[`${CONTENT_DIR}/library/${f.toLowerCase()}.md`] ?? "").join("\n"),
    problems: problemsFor(`${CONTENT_DIR}/library`),
  }));

  const flat = [
    ["resources", "Resources", "resources.md", content.resources, resourcesFromLive, writeResources,
      (rowsIn) => planResources(rowsIn, live, {
        libraryIdByKey: new Map(
          (live.activities || [])
            .filter((a) => !a.assessment_id && !(a.instrument_ids || []).length && a.content_key)
            .map((a) => [a.content_key, a.id]),
        ),
      })],
    ["activity-sets", "Activity sets", "activity-sets.md", content.activitySets, activitySetsFromLive, writeActivitySets,
      (rowsIn) => planActivitySets(rowsIn, live, {
        libraryIdByKey: new Map(
          (live.activities || [])
            .filter((a) => !a.assessment_id && !(a.instrument_ids || []).length && a.content_key)
            .map((a) => [a.content_key, a.id]),
        ),
      })],
    ["skipped-posts", "Skipped posts", "skipped-posts.md", content.skippedPosts, skippedPostsFromLive, writeSkippedPosts,
      (rowsIn) => planSkippedPosts(rowsIn, live)],
    ["job-titles", "Job titles", "job-titles.md", content.jobTitles, jobTitlesFromLive, writeJobTitles,
      (rowsIn) => planJobTitles(rowsIn, live)],
  ];
  for (const [key, label, name, read, fromLive, write, plan] of flat) {
    const path = `${CONTENT_DIR}/${name}`;
    rows.push(row(key, label, path, {
      present: read.present,
      writes: read.present ? plan(read.rows).writes : 0,
      appText: write(fromLive(live)),
      fileText: files[path] ?? null,
      problems: problemsFor(path),
    }));
  }

  // The instruments, from both directions: a file with no instrument is one
  // waiting to be applied, and an instrument with no file is content nothing
  // would restore.
  const filed = new Set();
  for (const entry of content.instruments) {
    filed.add(entry.content.key);
    const inApp = (live.instruments || []).find((i) => i.key === entry.content.key) || null;
    rows.push(row(`instrument:${entry.content.key}`, entry.content.name, entry.path, {
      present: true,
      writes: planInstrument(entry.content, live).writes,
      appText: inApp ? writeInstrument(contentFromLive(inApp, live)) : null,
      fileText: files[entry.path] ?? null,
      problems: problemsFor(entry.path),
    }));
  }
  for (const i of live.instruments || []) {
    if (filed.has(i.key)) continue;
    rows.push(row(`instrument:${i.key}`, i.name, `${CONTENT_DIR}/instruments/${i.key}.md`, { present: false }));
  }
  // A file that could not be read at all is reported as missing rather than as
  // agreement: it holds nothing this could compare against.
  for (const p of content.problems) {
    if (!p.path.startsWith(`${CONTENT_DIR}/instruments/`) || rows.some((r) => r.path === p.path)) continue;
    rows.push(row(`instrument-file:${p.path}`, p.name || p.path.split("/").pop(), p.path, { present: false, problems: p.errors }));
  }

  return rows;
}

