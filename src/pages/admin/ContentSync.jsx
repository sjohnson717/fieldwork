import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { loadContent, readContent, CONTENT_BRANCH } from "@/lib/content-source";
import { planInstrument, applyPlan, planDiff, planScales, applyScales, contentFromLive, scalesFromLive, NEW_INSTRUMENT } from "@/lib/content-apply";
import { writeInstrument, writeScales, parseInstrument, validateInstrument } from "@/lib/content-format";
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

const liveSnapshot = async () => {
  const [instruments, activities, bands, sections, resources, scales, scaleOptions] = await Promise.all([
    base44.entities.Instrument.list("sort_order"),
    base44.entities.Activity.list(),
    base44.entities.Band.list(),
    base44.entities.InstrumentSection.list("sort_order"),
    base44.entities.Resource.list("sort_order"),
    base44.entities.Scale.list("sort_order"),
    base44.entities.ScaleOption.list("sort_order"),
  ]);
  return { instruments, activities, bands, sections, resources, scales, scaleOptions };
};

const download = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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
      const { scales, instruments, problems } = readContent(loaded.files);
      const live = await liveSnapshot();
      // Shown rather than hidden behind a toggle: a difference is the result,
      // and the choice of which side is right cannot be made without reading
      // both values. Collapsing is still there for an instrument with a lot of
      // them.
      const opening = {};
      setCompared({
        loaded,
        live,
        problems,
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
          if (planDiff(plan).length) opening[i.content.key] = true;
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

          {compared.instruments.map((entry) => {
            const { plan } = entry;
            const key = entry.content.key;
            const diff = planDiff(plan);
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
                    {diff.length > 0 && (
                      <button onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} className="text-xs font-medium text-gray-500 hover:text-gray-800">
                        {isOpen ? "Hide" : `Show ${diff.length} change${diff.length === 1 ? "" : "s"}`}
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

                {isOpen && (
                  <dl className="mt-3 space-y-2 border-l-2 border-gray-100 pl-3">
                    {diff.map((d, i) => (
                      <div key={i} className="text-xs">
                        <dt className="text-gray-500">
                          <span className="uppercase tracking-wide text-[10px] text-gray-400">{d.kind}</span>{" "}
                          <span className="font-medium text-gray-700">{d.name}</span>
                          {d.field && <span className="font-mono text-[11px] text-gray-400"> · {d.field}</span>}
                          {d.action === "create" && <span className="ml-1 text-[10px] uppercase tracking-wide text-[#3366FF]">new</span>}
                        </dt>
                        {d.field && (
                          <dd className="mt-0.5 space-y-1">
                            {/* Labelled rather than struck through. A strikethrough
                                says the file has won, and nothing here has decided
                                that — Apply makes the file right, Commit makes the
                                app right, and the person reading the two values is
                                the one who knows which. */}
                            <p className="flex gap-2">
                              <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-400 pt-0.5">App</span>
                              <span className="text-gray-700">{short(d.from)}</span>
                            </p>
                            <p className="flex gap-2">
                              <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-400 pt-0.5">File</span>
                              <span className="text-gray-700">{short(d.to)}</span>
                            </p>
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                )}

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
