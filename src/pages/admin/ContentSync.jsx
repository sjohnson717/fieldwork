import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { loadContent, readContent, CONTENT_BRANCH } from "@/lib/content-source";
import {
  planInstrument, applyPlan, planDiff, planScales, applyScales, contentFromLive, scalesFromLive, NEW_INSTRUMENT,
  planLibrary, applyLibrary, libraryFromLive, planResources, applyResources, resourcesFromLive,
  planJobTitles, applyJobTitles, jobTitlesFromLive, rowsDiff,
  planActivitySets, applyActivitySets, activitySetsFromLive, unresolvedSetLinks,
  planSkippedPosts, applySkippedPosts, skippedPostsFromLive,
} from "@/lib/content-apply";
import {
  writeInstrument, writeScales, parseInstrument, validateInstrument,
  writeLibrary, writeResources, writeJobTitles, writeActivitySets, writeSkippedPosts, FACETS,
} from "@/lib/content-format";
import { liveContentSnapshot } from "@/lib/content-live";
import { functionErrorMessage } from "@/lib/utils";

// Comparing the content files with the app, and applying one instrument at a
// time after somebody has read what will change.
//
// This screen exists because the alternative was worse in both directions. Apply
// source used to refuse to touch an instrument that had questions, so a
// correction made in the repository silently did nothing — "0 updated, 54
// unchanged" — and the fix was retyping it here. The opposite, applying
// everything on a button, would overwrite an afternoon's editing with whatever
// the file happened to say.
//
// So: read first, apply one instrument, and nothing is guessed at. Every field
// that changes is named with its old value beside its new one, because "14
// fields have drifted" is true and useless.
//
// A difference is symmetric, and the screen says so. If a question's commentary
// is one thing in the file and another in the app, neither of those facts makes
// either side right — somebody edited one of them last and knows which. So a
// difference offers both directions: Apply writes the file into the app, Commit
// writes the app into the branch, and the choice belongs to whoever is looking
// at the two values.

const short = (v, n = 160) => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => (x === NEW_INSTRUMENT ? "this instrument" : x)).join(", ") : "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = String(v).replace(/\s+/g, " ");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

// What is pending, counting the removals a plan will not make on its own. A
// plan whose only outstanding item is a removal used to read as "up to date"
// with no Apply button beside it, so the confirmation could be ticked and never
// acted on.
const statusLine = (plan) => {
  if (plan.instrument.action === "create") return "not in the app yet";
  const parts = [];
  if (plan.writes > 0) parts.push(`${plan.writes} to write`);
  if (plan.deletes.length > 0) parts.push(`${plan.deletes.length} to remove`);
  return parts.length ? parts.join(" · ") : "up to date";
};


const download = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

// The fields a person typed, one line each, with the two values side by side.
// Shared by the instruments and the three flat files so a difference reads the
// same wherever it is found.
// Two long values whose difference is past the cut read as identical, which is
// worse than not printing them at all: the screen asks for a decision and then
// hides the thing to decide about. One resource's note differed somewhere in
// its third line and both columns said the same words followed by an ellipsis.
// So a long pair is shown from just before the point where the two part
// company.
const WINDOW = 40;
const divergence = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

const clip = (s, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);
const collapse = (s) => s.replace(/\s+/g, " ").trim();

// Whitespace, made visible for the one case where it is the whole difference.
// Two notes that differ by a line break print as the same sentence twice —
// which is the screen saying "these differ" and "these are identical" at once,
// and the second one is the lie. A paragraph break is a real edit: it is what
// the report renders as two paragraphs.
// Every space, not only a run of them: the first difference this was built to
// show turned out to be one character of trailing whitespace, and a single
// space left unmarked is exactly as invisible as the thing it was hiding.
const whitespace = (s) => s.replace(/\r/g, "␍").replace(/\n/g, "⏎").replace(/\t/g, "→").replace(/ /g, "·");

const FieldList = ({ content, names = null }) => {
  // A link is stored as an id and read as a name. "activity-210 → —" is a true
  // description of a link being dropped and tells nobody which link it was.
  // Both columns of one field, windowed together so the lines stay comparable
  // side by side, and cut from the raw text the index was found in — measuring
  // the divergence on a tidied copy and slicing the original put the window in
  // the wrong place and printed the same tail twice.
  const pair = (d) => {
    const { from, to } = d;
    if (names && Array.isArray(to)) {
      const named = (v) => short((Array.isArray(v) ? v : []).map((x) => names.get(x) || x));
      return { from: named(from), to: named(to), spacing: false };
    }
    if (typeof from !== "string" || typeof to !== "string") {
      return { from: short(from), to: short(to), spacing: false };
    }
    const spacing = collapse(from) === collapse(to);
    const at = divergence(from, to);
    const cut = at > WINDOW * 2 ? at - WINDOW : 0;
    const one = (v) => {
      const rest = v.slice(cut);
      return `${cut ? "…" : ""}${spacing ? clip(whitespace(rest)) : short(rest)}`;
    };
    return { from: one(from), to: one(to), spacing };
  };
  return (
  <dl className="mt-3 space-y-2 border-l-2 border-gray-100 pl-3">
    {content.map((d, i) => {
      const shown = pair(d);
      return (
      <div key={i} className="text-xs">
        <dt className="text-gray-500">
          <span className="uppercase tracking-wide text-[10px] text-gray-400">{d.kind}</span>{" "}
          <span className="font-medium text-gray-700">{d.name}</span>
          {d.field && <span className="font-mono text-[11px] text-gray-400"> · {d.field}</span>}
          {d.action === "create" && <span className="ml-1 text-[10px] uppercase tracking-wide text-[#3366FF]">new</span>}
        </dt>
        {d.field && (
          <dd className="mt-0.5 space-y-1">
            {shown.spacing && (
              <p className="text-[10px] uppercase tracking-wide text-gray-400">spacing only · ⏎ line break · · space</p>
            )}
            {/* Labelled rather than struck through. A strikethrough says the
                file has won, and nothing here has decided that — Apply makes
                the file right, Commit makes the app right, and the person
                reading the two values is the one who knows which. */}
            <p className="flex gap-2">
              <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-400 pt-0.5">App</span>
              <span className="text-gray-700 whitespace-pre-wrap">{shown.from}</span>
            </p>
            <p className="flex gap-2">
              <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-400 pt-0.5">File</span>
              <span className="text-gray-700 whitespace-pre-wrap">{shown.to}</span>
            </p>
          </dd>
        )}
      </div>
      );
    })}
  </dl>
  );
};

const contentOf = (diff) => diff.filter((d) => d.group === "content" || d.action === "create");

// How the writes break down, which is the one thing a count cannot say. A first
// run against a live app writes to every row it matches by name, so "65 to
// write" beside a file of exactly 65 activities is either the whole library
// taking its ids or the whole library about to be created a second time. Those
// are the same number and opposite events, and the difference is here.
const writeSummary = (counts) => {
  const parts = [];
  if (counts.update) parts.push(`${counts.update} already in the app`);
  if (counts.create) parts.push(`${counts.create} not in the app yet`);
  // "matched" rather than "matched by name": a resource and a skipped post are
  // matched on their address, and an adoption reported as a name match would
  // send somebody looking for a renamed row.
  if (counts.adopted) parts.push(`${counts.adopted} matched to a row already there, taking an id for the first time`);
  return parts.join(" · ");
};

// What a flat file will do, read before it is applied: the library, the
// resources, the job titles. Content is named a field at a time; ids and
// positions are counted, because sixty-five ids written for the first time is
// one fact and not sixty-five.
//
// Unlike an instrument's, this never opens on its own. These files hold ninety
// rows and a first run has something to say about every one of them.
const FileChanges = ({ diff, counts, isOpen, names = null }) => {
  const content = contentOf(diff);
  const bookkeeping = diff.filter((d) => d.group === "bookkeeping");
  const ordering = diff.filter((d) => d.group === "order");
  const ids = bookkeeping.filter((d) => d.field === "content_key").length;
  return (
    <>
      <p className="text-xs text-gray-500 mt-1">{writeSummary(counts)}</p>
      {(bookkeeping.length > 0 || ordering.length > 0) && (
        <p className="mt-0.5 text-xs text-gray-400">
          Also {bookkeeping.length} field{bookkeeping.length === 1 ? "" : "s"} the app keeps for itself
          {ids > 0 && `, including ${ids} id${ids === 1 ? "" : "s"} written for the first time`}
          {ordering.length > 0 && `, and ${ordering.length} row${ordering.length === 1 ? "" : "s"} taking the file's position`}
          .
        </p>
      )}
      {isOpen && content.length > 0 && <FieldList content={content} names={names} />}
    </>
  );
};

export default function ContentSync({ onApplied = null }) {
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [compared, setCompared] = useState(null);
  const [open, setOpen] = useState({});
  const [confirmDeletes, setConfirmDeletes] = useState({});
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [applied, setApplied] = useState({});
  const [committed, setCommitted] = useState({});

  // `keepApplied` is for the re-read that follows an apply: the plan has to be
  // rebuilt from what the app now holds, but wiping what was just applied takes
  // the only confirmation off the screen at the moment it is wanted.
  const compare = async ({ keepApplied = false } = {}) => {
    setComparing(true);
    setError("");
    if (!keepApplied) { setApplied({}); setCommitted({}); }
    try {
      const loaded = await loadContent();
      const { scales, instruments, problems, library, resources, jobTitles, activitySets, skippedPosts } = readContent(loaded.files);
      const live = await liveContentSnapshot();
      // Shown rather than hidden behind a toggle: a difference is the result,
      // and the choice of which side is right cannot be made without reading
      // both values. Collapsing is still there for an instrument with a lot of
      // them.
      const opening = {};
      const libraryIdByKey = new Map(
        live.activities
          .filter((a) => !a.assessment_id && !(a.instrument_ids || []).length)
          .map((a) => [a.content_key || null, a.id])
          .filter(([k]) => k),
      );
      const libraryAppText = () => {
        const back = libraryFromLive(live);
        return Object.fromEntries(FACETS.map((f) => [`content/library/${f.toLowerCase()}.md`, writeLibrary(f, back[f])]));
      };
      setCompared({
        loaded,
        live,
        problems,
        library: {
          ...library,
          plan: library.present ? planLibrary(library.byFacet, live) : null,
          files: libraryAppText(),
          differs: library.present
            ? FACETS.some((f) => loaded.files[`content/library/${f.toLowerCase()}.md`] !== libraryAppText()[`content/library/${f.toLowerCase()}.md`])
            : true,
        },
        jobTitles: {
          ...jobTitles,
          plan: jobTitles.present ? planJobTitles(jobTitles.rows, live) : null,
          appText: writeJobTitles(jobTitlesFromLive(live)),
          differs: !jobTitles.present || loaded.files["content/job-titles.md"] !== writeJobTitles(jobTitlesFromLive(live)),
        },
        resources: {
          ...resources,
          plan: resources.present ? planResources(resources.rows, live, { libraryIdByKey }) : null,
          appText: writeResources(resourcesFromLive(live)),
          differs: !resources.present || loaded.files["content/resources.md"] !== writeResources(resourcesFromLive(live)),
        },
        activitySets: {
          ...activitySets,
          plan: activitySets.present ? planActivitySets(activitySets.rows, live, { libraryIdByKey }) : null,
          appText: writeActivitySets(activitySetsFromLive(live)),
          differs: !activitySets.present || loaded.files["content/activity-sets.md"] !== writeActivitySets(activitySetsFromLive(live)),
          // What a commit cannot carry: ids in a live set that name no library
          // activity. Said on the screen rather than dropped in silence.
          unresolved: unresolvedSetLinks(live),
        },
        skippedPosts: {
          ...skippedPosts,
          plan: skippedPosts.present ? planSkippedPosts(skippedPosts.rows, live) : null,
          appText: writeSkippedPosts(skippedPostsFromLive(live)),
          differs: !skippedPosts.present || loaded.files["content/skipped-posts.md"] !== writeSkippedPosts(skippedPostsFromLive(live)),
        },
        scales: {
          rows: scales,
          plan: planScales(scales, live),
          appText: live.scales.length ? writeScales(scalesFromLive(live)) : null,
          fileText: loaded.files["content/scales.md"] || null,
        },
        instruments: instruments.map((i) => {
          const row = live.instruments.find((r) => r.key === i.content.key) || null;
          // What the app would commit, compared with the file as text. Text
          // rather than field by field, because it is the file that gets
          // committed and a difference the writer would produce is a difference
          // worth showing, whatever caused it.
          const appText = row ? writeInstrument(contentFromLive(row, live)) : null;
          const plan = planInstrument(i.content, live);
          if (planDiff(plan).some((d) => d.group === "content" || d.action === "create")) opening[i.content.key] = true;
          return { ...i, row, appText, fileText: loaded.files[i.path], plan };
        }),
      });
      setOpen(opening);
    } catch (e) {
      console.error("Could not compare the content files", e);
      setError(e?.message || "Could not read the content files.");
    }
    setComparing(false);
  };

  const applyInstrument = async (entry) => {
    setBusy(entry.content.key);
    setError("");
    try {
      const res = await applyPlan(base44, entry.plan, {
        onProgress: setProgress,
        confirmDeletes: !!confirmDeletes[entry.content.key],
      });
      setApplied((a) => ({ ...a, [entry.content.key]: res }));
      // Re-read rather than patch what is on screen: the next plan has to be
      // built from what the app actually holds, and an apply that half
      // succeeded must show as it is.
      await compare({ keepApplied: true });
      await onApplied?.();
    } catch (e) {
      console.error("Could not apply the content file", e);
      setError(e?.message || "Could not apply the file.");
    }
    setBusy("");
    setProgress("");
  };

  const applyLibraryFiles = async () => {
    setBusy("library");
    setError("");
    try {
      const res = await applyLibrary(base44, compared.library.plan, { onProgress: setProgress });
      setApplied((a) => ({ ...a, library: res }));
      await compare({ keepApplied: true });
      await onApplied?.();
    } catch (e) {
      console.error("Could not apply the library files", e);
      setError(e?.message || "Could not apply the library.");
    }
    setBusy("");
    setProgress("");
  };

  const applyTheJobTitles = async () => {
    setBusy("job-titles");
    setError("");
    try {
      const res = await applyJobTitles(base44, compared.jobTitles.plan, { onProgress: setProgress });
      setApplied((a) => ({ ...a, jobTitles: res }));
      await compare({ keepApplied: true });
    } catch (e) {
      console.error("Could not apply the job titles", e);
      setError(e?.message || "Could not apply the job titles.");
    }
    setBusy("");
    setProgress("");
  };

  const applyTheResources = async () => {
    setBusy("resources");
    setError("");
    try {
      const res = await applyResources(base44, compared.resources.plan, { onProgress: setProgress });
      setApplied((a) => ({ ...a, resources: res }));
      await compare({ keepApplied: true });
    } catch (e) {
      console.error("Could not apply the resources", e);
      setError(e?.message || "Could not apply the resources.");
    }
    setBusy("");
    setProgress("");
  };

  const applyTheSets = async () => {
    setBusy("activity-sets");
    setError("");
    try {
      const res = await applyActivitySets(base44, compared.activitySets.plan, { onProgress: setProgress });
      setApplied((a) => ({ ...a, activitySets: res }));
      await compare({ keepApplied: true });
    } catch (e) {
      console.error("Could not apply the activity sets", e);
      setError(e?.message || "Could not apply the activity sets.");
    }
    setBusy("");
    setProgress("");
  };

  const applyTheSkipped = async () => {
    setBusy("skipped-posts");
    setError("");
    try {
      const res = await applySkippedPosts(base44, compared.skippedPosts.plan, { onProgress: setProgress });
      setApplied((a) => ({ ...a, skippedPosts: res }));
      await compare({ keepApplied: true });
    } catch (e) {
      console.error("Could not apply the skipped posts", e);
      setError(e?.message || "Could not apply the skipped posts.");
    }
    setBusy("");
    setProgress("");
  };

  const applyTheScales = async () => {
    setBusy("scales");
    setError("");
    try {
      const res = await applyScales(base44, compared.scales.plan, { onProgress: setProgress });
      setApplied((a) => ({ ...a, scales: res }));
      await compare({ keepApplied: true });
    } catch (e) {
      console.error("Could not apply the scales", e);
      setError(e?.message || "Could not apply the scales.");
    }
    setBusy("");
    setProgress("");
  };

  // The app's content as the file it would be committed as. The same text the
  // commit sends, so saving it and committing it cannot disagree.
  const saveFile = (entry) => {
    if (!entry.appText) return;
    download(entry.path.split("/").pop(), entry.appText);
  };

  // The other direction: what the app holds, committed to the content branch.
  //
  // expectedSha is the commit this screen compared against. If the branch has
  // moved since — somebody editing on GitHub, or another window of this screen
  // — the function refuses and says so, rather than writing over whatever
  // arrived in between. That refusal is the whole reason the sha is carried
  // around.
  const commit = async (key, files, message) => {
    // Read back before it goes anywhere. The app will hold content the file
    // format refuses — an active question typed into a section the instrument
    // does not declare is the one that turned up, and it is asked of nobody,
    // because the survey pages are built from the section list. Committing it
    // would put a file on the branch that this same screen then refuses to
    // read, which is a worse place to discover it than here.
    const scaleKeys = compared.scales.rows.map((sc) => sc.id);
    const refusals = files.flatMap((f) => {
      if (!f.path.includes("/instruments/")) return [];
      const { errors } = validateInstrument(parseInstrument(f.text), { scaleKeys });
      return errors;
    });
    if (refusals.length) {
      setError(`Not committed — the app holds content the file format refuses: ${refusals.join(" ")} Fix it with Edit content, then commit.`);
      return;
    }
    setBusy(key);
    setError("");
    try {
      const res = await base44.functions.invoke("syncContent", {
        files,
        message,
        expectedSha: compared.loaded.source === "branch" ? compared.loaded.sha : undefined,
      });
      setCommitted((c) => ({ ...c, [key]: res.data }));
      await compare({ keepApplied: true });
    } catch (e) {
      console.error("Could not commit the content file", e);
      setError(functionErrorMessage(e, "Could not commit to the content branch."));
    }
    setBusy("");
  };

  // The three flat files' plans, flattened once for the row that shows them.
  // Built here rather than in the compare so that a plan and the reading of it
  // cannot fall out of step.
  const fileDiffs = compared ? {
    library: compared.library.plan ? rowsDiff("activity", compared.library.plan.activities) : [],
    resources: compared.resources.plan ? rowsDiff("resource", compared.resources.plan.resources, (r) => r.title) : [],
    jobTitles: compared.jobTitles.plan ? rowsDiff("job title", compared.jobTitles.plan.titles) : [],
    activitySets: compared.activitySets.plan ? rowsDiff("set", compared.activitySets.plan.sets) : [],
    skippedPosts: compared.skippedPosts.plan ? rowsDiff("skipped post", compared.skippedPosts.plan.posts) : [],
  } : { library: [], resources: [], jobTitles: [], activitySets: [], skippedPosts: [] };

  const activityNames = new Map((compared?.live.activities || []).map((a) => [a.id, a.name]));

  const showChanges = (key, diff) => {
    const n = contentOf(diff).length;
    if (!n) return null;
    return (
      <button onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} className="text-xs font-medium text-gray-500 hover:text-gray-800">
        {open[key] ? "Hide" : `Show ${n} change${n === 1 ? "" : "s"}`}
      </button>
    );
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Content files</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {compared
              ? compared.loaded.source === "branch"
                ? `${CONTENT_BRANCH} branch · ${compared.loaded.sha?.slice(0, 7)}`
                : "the copy in this build"
              : `content/ on the ${CONTENT_BRANCH} branch`}
          </p>
        </div>
        <button
          onClick={() => compare()}
          disabled={comparing || !!busy}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-[#3366FF] hover:bg-[#2952CC] text-white disabled:opacity-50 transition-colors"
        >
          {comparing ? "Reading…" : compared ? "Sync again" : "Sync with files"}
        </button>
      </div>

      <p className="text-xs text-gray-400 px-6 py-3 border-b border-gray-100">
        Each instrument is one file in content/instruments, edited here or on
        GitHub. Syncing reads the files and lists every field that differs, with
        the app's value beside the file's — neither is automatically right, and
        choosing is the point. Apply makes the file right, and never deletes a
        question: Response rows key on it, so one dropped from a file is
        reported instead. Commit makes the app right, writing to the{" "}
        {CONTENT_BRANCH} branch, which nothing rebuilds from. Save file is that
        same text as a download, for committing by hand.
      </p>

      {error && <p className="text-xs text-red-500 px-6 py-3">{error}</p>}
      {compared?.loaded.warning && <p className="text-xs text-amber-600 px-6 py-3 bg-amber-50/50">{compared.loaded.warning}</p>}

      {compared?.problems.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-100 bg-red-50/50 space-y-1">
          <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">Not applied — these files have to be fixed first</p>
          {compared.problems.map((p) => (
            <div key={p.path} className="text-xs text-gray-600">
              <span className="font-mono text-[11px] text-gray-500">{p.path}</span>
              {p.name && <span className="ml-2 text-gray-500">{p.name}</span>}
              <ul className="list-disc pl-4">{p.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      {compared && (
        <ul className="divide-y divide-gray-50">
          {/* The scales come first because everything else refers to them: a
              file naming a scale the app has not got is refused rather than
              applied halfway. */}
          <li className="px-6 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">Answer scales</p>
              <span className="flex items-baseline gap-3 shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">
                  {compared.scales.plan.writes === 0
                    ? compared.scales.appText && compared.scales.appText !== compared.scales.fileText
                      ? "the app differs"
                      : "up to date"
                    : `${compared.scales.plan.writes} to write`}
                </span>
                {compared.scales.plan.writes > 0 && (
                  <button
                    onClick={applyTheScales}
                    disabled={!!busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {busy === "scales" ? `${progress || "Applying"}…` : "Apply"}
                  </button>
                )}
                {compared.scales.appText && compared.scales.appText !== compared.scales.fileText && (
                  <button
                    onClick={() => commit("scales", [{ path: "content/scales.md", text: compared.scales.appText }], "Sync the answer scales from the app")}
                    disabled={!!busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {busy === "scales" ? "Committing…" : "Commit"}
                  </button>
                )}
              </span>
            </div>
            {committed.scales && (
              <p className="text-xs text-green-700 mt-1">
                {committed.scales.unchanged
                  ? "The branch already had this."
                  : <>Committed to {committed.scales.branch}. <a href={committed.scales.url} target="_blank" rel="noreferrer" className="underline">{committed.scales.sha?.slice(0, 7)}</a></>}
              </p>
            )}
            {applied.scales && (
              <p className="text-xs text-green-700 mt-1">
                {applied.scales.written.scales} scale{applied.scales.written.scales === 1 ? "" : "s"} and {applied.scales.written.options} option{applied.scales.written.options === 1 ? "" : "s"} written.
              </p>
            )}
          </li>

          {/* The activity library, a file per phase. Absent until somebody
              commits it — and absent is said out loud, because an empty set of
              files must never read as "the library is unchanged". */}
          <li className="px-6 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">
                Activity library
                <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">library/</span>
              </p>
              <span className="flex items-baseline gap-3 shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">
                  {!compared.library.present
                    ? "not in the files yet"
                    : compared.library.plan.writes > 0
                      ? `${compared.library.plan.writes} to write`
                      : compared.library.differs ? "the app differs" : "up to date"}
                </span>
                <button
                  onClick={() => Object.entries(compared.library.files).forEach(([path, text]) => download(path.split("/").pop(), text))}
                  className="text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  Save files
                </button>
                {compared.library.present && showChanges("library", fileDiffs.library)}
                {compared.library.present && compared.library.plan.writes > 0 && (
                  <button onClick={applyLibraryFiles} disabled={!!busy} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                    {busy === "library" ? `${progress || "Applying"}…` : "Apply"}
                  </button>
                )}
                {compared.library.differs && (
                  <button
                    onClick={() => commit("library", Object.entries(compared.library.files).map(([path, text]) => ({ path, text })), "Sync the activity library from the app")}
                    disabled={!!busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {busy === "library" ? "Committing…" : compared.library.present ? "Commit" : "Commit to create"}
                  </button>
                )}
              </span>
            </div>
            {compared.library.present && compared.library.plan.writes > 0 && (
              <FileChanges diff={fileDiffs.library} counts={compared.library.plan.counts} isOpen={!!open.library} />
            )}
            {applied.library && (
              <p className="text-xs text-green-700 mt-1">
                {applied.library.written.activities} activit{applied.library.written.activities === 1 ? "y" : "ies"} written.
              </p>
            )}
            {committed.library && (
              <p className="text-xs text-green-700 mt-1">
                {committed.library.unchanged ? "The branch already had this." : <>Committed to {committed.library.branch}. <a href={committed.library.url} target="_blank" rel="noreferrer" className="underline">{committed.library.sha?.slice(0, 7)}</a></>}
              </p>
            )}
            {(applied.library?.notes || []).map((n, i) => <p key={i} className="text-xs text-gray-500 mt-0.5">{n}</p>)}
            {compared.library.present && compared.library.plan.orphans.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {compared.library.plan.orphans.length} activit{compared.library.plan.orphans.length === 1 ? "y is" : "ies are"} in the app and not in the files. Left alone — assessments point at them.
              </p>
            )}
          </li>

          <li className="px-6 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">
                Resources
                <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">resources.md</span>
              </p>
              <span className="flex items-baseline gap-3 shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">
                  {!compared.resources.present
                    ? "not in the files yet"
                    : compared.resources.plan.writes > 0
                      ? `${compared.resources.plan.writes} to write`
                      : compared.resources.differs ? "the app differs" : "up to date"}
                </span>
                <button
                  onClick={() => download("resources.md", compared.resources.appText)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  Save file
                </button>
                {compared.resources.present && showChanges("resources", fileDiffs.resources)}
                {compared.resources.present && compared.resources.plan.writes > 0 && (
                  <button onClick={applyTheResources} disabled={!!busy} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                    {busy === "resources" ? `${progress || "Applying"}…` : "Apply"}
                  </button>
                )}
                {compared.resources.differs && (
                  <button
                    onClick={() => commit("resources", [{ path: "content/resources.md", text: compared.resources.appText }], "Sync the resources from the app")}
                    disabled={!!busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {busy === "resources" ? "Committing…" : compared.resources.present ? "Commit" : "Commit to create"}
                  </button>
                )}
              </span>
            </div>
            {compared.resources.present && compared.resources.plan.writes > 0 && (
              <FileChanges diff={fileDiffs.resources} counts={compared.resources.plan.counts} isOpen={!!open.resources} names={activityNames} />
            )}
            {/* The order these two are applied in is not a preference. A
                resource names its activities by content_key, and the key is
                looked up among library rows that have one — so applying the
                resources to a library that has not taken its ids yet resolves
                nothing, and writes every one of those links away. Said here,
                before the button, because afterwards it is eighty-odd links to
                put back. */}
            {compared.resources.present && compared.resources.plan.unknownActivities.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                {compared.resources.plan.unknownActivities.length} link{compared.resources.plan.unknownActivities.length === 1 ? "" : "s"} name{compared.resources.plan.unknownActivities.length === 1 ? "s" : ""} an activity the library has no id for
                {compared.library.present && compared.library.plan.counts.adopted > 0
                  ? ". Apply the activity library first — applied now, those links are dropped."
                  : ". Applied now, those links are dropped."}
              </p>
            )}
            {/* Said before the apply, not only after it: an app resource the
                file has forgotten is left alone, and somebody deciding whether
                to apply wants to know it is there. */}
            {compared.resources.present && compared.resources.plan.orphans.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {compared.resources.plan.orphans.length} resource{compared.resources.plan.orphans.length === 1 ? " is" : "s are"} in the app and not in the file. Left alone.
              </p>
            )}
            {applied.resources && (
              <p className="text-xs text-green-700 mt-1">{applied.resources.written.resources} resource{applied.resources.written.resources === 1 ? "" : "s"} written.</p>
            )}
            {committed.resources && (
              <p className="text-xs text-green-700 mt-1">
                {committed.resources.unchanged ? "The branch already had this." : <>Committed to {committed.resources.branch}. <a href={committed.resources.url} target="_blank" rel="noreferrer" className="underline">{committed.resources.sha?.slice(0, 7)}</a></>}
              </p>
            )}
            {(applied.resources?.notes || []).slice(0, 5).map((n, i) => <p key={i} className="text-xs text-gray-500 mt-0.5">{n}</p>)}
          </li>

          <li className="px-6 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">
                Activity sets
                <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">activity-sets.md</span>
              </p>
              <span className="flex items-baseline gap-3 shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">
                  {!compared.activitySets.present
                    ? "not in the file yet"
                    : compared.activitySets.plan.writes > 0
                      ? `${compared.activitySets.plan.writes} to write`
                      : compared.activitySets.differs ? "the app differs" : "up to date"}
                </span>
                <button onClick={() => download("activity-sets.md", compared.activitySets.appText)} className="text-xs font-medium text-gray-500 hover:text-gray-800">
                  Save file
                </button>
                {compared.activitySets.present && showChanges("activity-sets", fileDiffs.activitySets)}
                {compared.activitySets.present && compared.activitySets.plan.writes > 0 && (
                  <button onClick={applyTheSets} disabled={!!busy} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                    {busy === "activity-sets" ? `${progress || "Applying"}…` : "Apply"}
                  </button>
                )}
                {compared.activitySets.differs && (
                  <button
                    onClick={() => commit("activity-sets", [{ path: "content/activity-sets.md", text: compared.activitySets.appText }], "Sync the activity sets from the app")}
                    disabled={!!busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {busy === "activity-sets" ? "Committing…" : compared.activitySets.present ? "Commit" : "Commit to create"}
                  </button>
                )}
              </span>
            </div>
            {compared.activitySets.present && compared.activitySets.plan.writes > 0 && (
              <FileChanges diff={fileDiffs.activitySets} counts={compared.activitySets.plan.counts} isOpen={!!open["activity-sets"]} names={activityNames} />
            )}
            {/* The same ordering hazard the resources have, and worth more
                here: a set is a hand-picked list nothing else reproduces, so a
                member dropped for want of an id is a judgement somebody has to
                make again. */}
            {compared.activitySets.present && compared.activitySets.plan.unknownActivities.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                {compared.activitySets.plan.unknownActivities.length} activit{compared.activitySets.plan.unknownActivities.length === 1 ? "y is" : "ies are"} named by a set and have no id in the library
                {compared.library.present && compared.library.plan.counts.adopted > 0
                  ? ". Apply the activity library first — applied now, those members are left out."
                  : ". Applied now, those members are left out."}
              </p>
            )}
            {compared.activitySets.unresolved.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                {compared.activitySets.unresolved.map((u) => `"${u.name}" holds ${u.count}`).join(", ")} activit{compared.activitySets.unresolved.reduce((n, u) => n + u.count, 0) === 1 ? "y" : "ies"} the library no longer has. A commit cannot carry them.
              </p>
            )}
            {/* Nothing here is deleted. A set dropped from the file is the app's
                to retire, and a set in the app the file has not seen is one to
                commit rather than lose. */}
            {compared.activitySets.present && compared.activitySets.plan.orphans.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {compared.activitySets.plan.orphans.length} set{compared.activitySets.plan.orphans.length === 1 ? " is" : "s are"} in the app and not in the file. Left alone — commit first if they are ones to keep.
              </p>
            )}
            {applied.activitySets && (
              <p className="text-xs text-green-700 mt-1">{applied.activitySets.written.sets} set{applied.activitySets.written.sets === 1 ? "" : "s"} written.</p>
            )}
            {committed["activity-sets"] && (
              <p className="text-xs text-green-700 mt-1">
                {committed["activity-sets"].unchanged ? "The branch already had this." : <>Committed to {committed["activity-sets"].branch}. <a href={committed["activity-sets"].url} target="_blank" rel="noreferrer" className="underline">{committed["activity-sets"].sha?.slice(0, 7)}</a></>}
              </p>
            )}
            {(applied.activitySets?.notes || []).slice(0, 5).map((n, i) => <p key={i} className="text-xs text-gray-500 mt-0.5">{n}</p>)}
          </li>

          <li className="px-6 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">
                Skipped posts
                <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">skipped-posts.md</span>
              </p>
              <span className="flex items-baseline gap-3 shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">
                  {!compared.skippedPosts.present
                    ? "not in the file yet"
                    : compared.skippedPosts.plan.writes > 0
                      ? `${compared.skippedPosts.plan.writes} to write`
                      : compared.skippedPosts.differs ? "the app differs" : "up to date"}
                </span>
                <button onClick={() => download("skipped-posts.md", compared.skippedPosts.appText)} className="text-xs font-medium text-gray-500 hover:text-gray-800">
                  Save file
                </button>
                {compared.skippedPosts.present && showChanges("skipped-posts", fileDiffs.skippedPosts)}
                {compared.skippedPosts.present && compared.skippedPosts.plan.writes > 0 && (
                  <button onClick={applyTheSkipped} disabled={!!busy} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                    {busy === "skipped-posts" ? `${progress || "Applying"}…` : "Apply"}
                  </button>
                )}
                {compared.skippedPosts.differs && (
                  <button
                    onClick={() => commit("skipped-posts", [{ path: "content/skipped-posts.md", text: compared.skippedPosts.appText }], "Sync the skipped posts from the app")}
                    disabled={!!busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {busy === "skipped-posts" ? "Committing…" : compared.skippedPosts.present ? "Commit" : "Commit to create"}
                  </button>
                )}
              </span>
            </div>
            {compared.skippedPosts.present && compared.skippedPosts.plan.writes > 0 && (
              <FileChanges diff={fileDiffs.skippedPosts} counts={compared.skippedPosts.plan.counts} isOpen={!!open["skipped-posts"]} />
            )}
            {/* Worth reading before applying: a post unskipped in the app comes
                back if the file still names it, because Apply is the file
                winning. Unskipping is followed by a commit. */}
            {compared.skippedPosts.present && compared.skippedPosts.plan.counts.create > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                {compared.skippedPosts.plan.counts.create} post{compared.skippedPosts.plan.counts.create === 1 ? " is" : "s are"} skipped in the file and not in the app. Applying skips {compared.skippedPosts.plan.counts.create === 1 ? "it" : "them"} again — if {compared.skippedPosts.plan.counts.create === 1 ? "it was" : "they were"} unskipped on purpose, commit instead.
              </p>
            )}
            {compared.skippedPosts.present && compared.skippedPosts.plan.orphans.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {compared.skippedPosts.plan.orphans.length} post{compared.skippedPosts.plan.orphans.length === 1 ? " is" : "s are"} skipped in the app and not in the file. Left alone — commit to keep the decision.
              </p>
            )}
            {applied.skippedPosts && (
              <p className="text-xs text-green-700 mt-1">{applied.skippedPosts.written.posts} post{applied.skippedPosts.written.posts === 1 ? "" : "s"} written.</p>
            )}
            {committed["skipped-posts"] && (
              <p className="text-xs text-green-700 mt-1">
                {committed["skipped-posts"].unchanged ? "The branch already had this." : <>Committed to {committed["skipped-posts"].branch}. <a href={committed["skipped-posts"].url} target="_blank" rel="noreferrer" className="underline">{committed["skipped-posts"].sha?.slice(0, 7)}</a></>}
              </p>
            )}
            {(applied.skippedPosts?.notes || []).slice(0, 5).map((n, i) => <p key={i} className="text-xs text-gray-500 mt-0.5">{n}</p>)}
          </li>

          <li className="px-6 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">
                Job titles
                <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">job-titles.md</span>
              </p>
              <span className="flex items-baseline gap-3 shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">
                  {!compared.jobTitles.present
                    ? "not in the file yet"
                    : compared.jobTitles.plan.writes > 0
                      ? `${compared.jobTitles.plan.writes} to write`
                      : compared.jobTitles.differs ? "the app differs" : "up to date"}
                </span>
                <button onClick={() => download("job-titles.md", compared.jobTitles.appText)} className="text-xs font-medium text-gray-500 hover:text-gray-800">
                  Save file
                </button>
                {compared.jobTitles.present && showChanges("job-titles", fileDiffs.jobTitles)}
                {compared.jobTitles.present && compared.jobTitles.plan.writes > 0 && (
                  <button onClick={applyTheJobTitles} disabled={!!busy} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                    {busy === "job-titles" ? `${progress || "Applying"}…` : "Apply"}
                  </button>
                )}
                {compared.jobTitles.differs && (
                  <button
                    onClick={() => commit("job-titles", [{ path: "content/job-titles.md", text: compared.jobTitles.appText }], "Sync the job titles from the app")}
                    disabled={!!busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {busy === "job-titles" ? "Committing…" : compared.jobTitles.present ? "Commit" : "Commit to create"}
                  </button>
                )}
              </span>
            </div>
            {/* A rename is the one thing here worth reading before it happens:
                an activity's recommended owner and every answer ever given hold
                the name as text, so nothing follows the title when it changes. */}
            {compared.jobTitles.present && compared.jobTitles.plan.writes > 0 && (
              <FileChanges diff={fileDiffs.jobTitles} counts={compared.jobTitles.plan.counts} isOpen={!!open["job-titles"]} />
            )}
            {compared.jobTitles.present && compared.jobTitles.plan.orphans.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {compared.jobTitles.plan.orphans.length} title{compared.jobTitles.plan.orphans.length === 1 ? " is" : "s are"} in the app and not in the file. Left alone — answers name them.
              </p>
            )}
            {compared.jobTitles.plan?.renames.map((r, i) => (
              <p key={i} className="text-xs text-amber-700 mt-1">
                "{r.from}" becomes "{r.to}". {r.activities === 0 ? "No activity recommends the old name" : `${r.activities} activit${r.activities === 1 ? "y" : "ies"} still recommend${r.activities === 1 ? "s" : ""} the old name`}, and answers already given keep it. Neither changes.
              </p>
            ))}
            {applied.jobTitles && (
              <p className="text-xs text-green-700 mt-1">{applied.jobTitles.written.titles} title{applied.jobTitles.written.titles === 1 ? "" : "s"} written.</p>
            )}
            {committed["job-titles"] && (
              <p className="text-xs text-green-700 mt-1">
                {committed["job-titles"].unchanged ? "The branch already had this." : <>Committed to {committed["job-titles"].branch}. <a href={committed["job-titles"].url} target="_blank" rel="noreferrer" className="underline">{committed["job-titles"].sha?.slice(0, 7)}</a></>}
              </p>
            )}
            {(applied.jobTitles?.notes || []).map((n, i) => <p key={i} className="text-xs text-gray-500 mt-0.5">{n}</p>)}
          </li>

          {compared.instruments.map((entry) => {
            const { plan } = entry;
            const key = entry.content.key;
            const diff = planDiff(plan);
            const content = diff.filter((d) => d.group === "content" || d.action === "create");
            const bookkeeping = diff.filter((d) => d.group === "bookkeeping");
            const reordered = Object.entries(plan.order).filter(([, o]) => o.changed);
            const isOpen = !!open[key];
            const result = applied[key];
            const commitResult = committed[key];
            // The app holds something the file does not say. Compared as text
            // because text is what gets committed.
            const differs = !!entry.appText && entry.appText !== entry.fileText;
            return (
              <li key={key} className="px-6 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-800">
                    {entry.content.name}
                    <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">{entry.path.split("/").pop()}</span>
                  </p>
                  <span className="flex items-baseline gap-3 shrink-0">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {statusLine(plan)}
                      {differs && plan.writes === 0 && plan.deletes.length === 0 && " · the app differs"}
                    </span>
                    <button onClick={() => saveFile(entry)} disabled={!plan.instrumentId} className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40">
                      Save file
                    </button>
                    {content.length > 0 && (
                      <button onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} className="text-xs font-medium text-gray-500 hover:text-gray-800">
                        {isOpen ? "Hide" : `Show ${content.length} change${content.length === 1 ? "" : "s"}`}
                      </button>
                    )}
                    {(plan.writes > 0 || plan.deletes.length > 0) && (
                      <button
                        onClick={() => applyInstrument(entry)}
                        disabled={!!busy}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        title="Write the file into the app"
                      >
                        {busy === key ? `${progress || "Applying"}…` : "Apply"}
                      </button>
                    )}
                    {differs && (
                      <button
                        onClick={() => commit(key, [{ path: entry.path, text: entry.appText }], `Sync ${entry.content.name} from the app`)}
                        disabled={!!busy}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        title="Commit what the app holds to the content branch"
                      >
                        {busy === key ? "Committing…" : "Commit"}
                      </button>
                    )}
                  </span>
                </div>

                {result && (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-green-700">
                      {Object.values(result.written).every((n) => n === 0)
                        ? "Nothing was written."
                        : `Applied: ${result.written.questions} question${result.written.questions === 1 ? "" : "s"}, ` +
                          `${result.written.dimensions} dimension${result.written.dimensions === 1 ? "" : "s"}, ` +
                          `${result.written.bands} band${result.written.bands === 1 ? "" : "s"}, ` +
                          `${result.written.reading} reading row${result.written.reading === 1 ? "" : "s"}` +
                          `${result.written.deleted ? `, ${result.written.deleted} removed` : ""}.`}
                    </p>
                    {/* What the run itself had to say, rather than only what the
                        next plan can work out. A removal left in place because
                        nobody confirmed it is reported here. */}
                    {result.notes.length > 0 && (
                      <ul className="text-xs text-gray-500 list-disc pl-4 space-y-0.5">
                        {result.notes.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {commitResult && (
                  <p className="text-xs text-green-700 mt-1">
                    {commitResult.unchanged
                      ? "The branch already had this."
                      : <>Committed to {commitResult.branch}. <a href={commitResult.url} target="_blank" rel="noreferrer" className="underline">{commitResult.sha?.slice(0, 7)}</a></>}
                  </p>
                )}

                {/* Order, as the sequence it produces. The numbers behind it are
                    unreadable and the sequence is the decision: applying puts
                    the questions in the file's order, committing keeps the
                    app's. */}
                {reordered.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {reordered.map(([what, o]) => (
                      <div key={what} className="text-xs">
                        <p className="text-gray-500">
                          <span className="uppercase tracking-wide text-[10px] text-gray-400">order</span>{" "}
                          <span className="font-medium text-gray-700">{what}</span>
                          {what === "questions" && " — the order they are asked in"}
                          {what === "bands" && " — the order they are listed in"}
                        </p>
                        <p className="flex gap-2 mt-0.5">
                          <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-400 pt-0.5">App</span>
                          <span className="text-gray-700">{o.before.join(" · ")}</span>
                        </p>
                        <p className="flex gap-2">
                          <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-400 pt-0.5">File</span>
                          <span className="text-gray-700">{o.after.join(" · ")}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Counted, not listed. An id has no meaning to read and a
                    position that changes nothing has nothing to decide — and
                    printed in full they buried the wording changes they were
                    sitting beside. */}
                {bookkeeping.length > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    Also {bookkeeping.length} field{bookkeeping.length === 1 ? "" : "s"} the app keeps for itself
                    {bookkeeping.some((d) => d.field === "content_key") &&
                      `, including ${bookkeeping.filter((d) => d.field === "content_key").length} id${bookkeeping.filter((d) => d.field === "content_key").length === 1 ? "" : "s"} written for the first time`}
                    .
                  </p>
                )}

                {isOpen && content.length > 0 && <FieldList content={content} />}

                {plan.deletes.length > 0 && (
                  <label className="flex items-start gap-2 mt-3 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={!!confirmDeletes[key]}
                      onChange={(e) => setConfirmDeletes((c) => ({ ...c, [key]: e.target.checked }))}
                      className="mt-0.5"
                    />
                    <span>
                      Also remove {plan.deletes.map((d) => `${d.name} (${d.kind})`).join(", ")}, which the file no
                      longer defines. A band left in place still catches scores, so leaving it is not the safe option.
                    </span>
                  </label>
                )}

                {plan.orphans.length > 0 && (
                  <ul className="mt-2 text-xs text-gray-500 list-disc pl-4 space-y-0.5">
                    {plan.orphans.map((o) => (
                      <li key={o.rowId}>
                        <span className="font-medium">{o.name}</span> is on this instrument but not in the file. {o.advice}
                      </li>
                    ))}
                  </ul>
                )}

                {entry.notes.length > 0 && (
                  <ul className="mt-2 text-xs text-gray-400 list-disc pl-4 space-y-0.5">
                    {entry.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {compared && (
        <div className="px-6 py-3 border-t border-gray-100">
          <button
            onClick={() => download("scales.md", writeScales(scalesFromLive(compared.live)))}
            className="text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            Save scales.md
          </button>
        </div>
      )}
    </section>
  );
}
