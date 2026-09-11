import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { loadInstrument } from "@/lib/instruments";
import { functionErrorMessage } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

// One instrument's content, edited where it lives.
//
// The questions, their commentary, the bands, and the reading used to be
// authored in src/lib/instrument-seed.js and pushed here by Apply source,
// which meant every change went through the repository. They are edited here
// now, and the app is the master copy: Apply source leaves an instrument alone
// once it has questions, so nothing typed on this screen is reverted by the
// next run.
//
// Questions are never deleted while anything points at them — answers key on
// them, and so do workshop notes. Retiring takes one out of the survey and the
// reports and keeps its answers. Delete appears only on a question nothing
// references, which in practice means one added here by mistake.

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "block text-xs font-medium text-gray-500 mb-1";

const EMPTY_QUESTION = { name: "", description: "", commentary: "", section: "", critical: false, required: false, question_type: "rating" };

// The most one rated question can earn. "I don't know" and its kind carry no
// points and never count toward a score, exactly as in the reports.
const topPoints = (axis) => {
  const rated = (axis?.options || []).filter((o) => o.points !== null && o.points !== undefined);
  return rated.length ? Math.max(...rated.map((o) => o.points)) : null;
};

// Where the bands fail to cover every possible score exactly once. A score
// that lands in no band prints no verdict; two bands claiming it print
// whichever sorts first. Both are silent in a report, so they are said here.
export function bandProblems(bands, max) {
  if (!bands.length || max === null) return [];
  const sorted = [...bands].sort((a, b) => (a.min_score ?? 0) - (b.min_score ?? 0));
  const problems = [];
  if ((sorted[0].min_score ?? 0) > 0) problems.push(`Scores 0–${sorted[0].min_score - 1} fall in no band.`);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b.min_score > a.max_score + 1) problems.push(`Scores ${a.max_score + 1}–${b.min_score - 1} fall between ${a.name} and ${b.name}.`);
    if (b.min_score <= a.max_score) problems.push(`${a.name} and ${b.name} both claim ${b.min_score}–${Math.min(a.max_score, b.max_score)}.`);
  }
  const last = sorted[sorted.length - 1];
  if (last.max_score < max) problems.push(`Scores ${last.max_score + 1}–${max} fall in no band.`);
  if (last.max_score > max) problems.push(`${last.name} runs to ${last.max_score}, past the maximum score of ${max}.`);
  return problems;
}

function QuestionForm({ draft, setDraft, sections, isNew, addsPoints, onSave, onCancel, busy }) {
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <div className="p-4 space-y-3 bg-blue-50/40">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Name</label>
          <input autoFocus value={draft.name} onChange={set("name")} className={inputClass} placeholder="Short label, e.g. Revenue Opportunity" />
        </div>
        <div>
          <label className={labelClass}>Section</label>
          <select value={draft.section} onChange={set("section")} className={inputClass}>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Question, as the respondent reads it</label>
          <textarea rows={2} value={draft.description} onChange={set("description")} className={`${inputClass} resize-y`} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Commentary</label>
          <textarea rows={4} value={draft.commentary} onChange={set("commentary")} className={`${inputClass} resize-y`}
            placeholder="Why this question matters. Shown under it on the respondent's copy and the team report, whatever the answer." />
        </div>
        {isNew && (
          <div>
            <label className={labelClass}>Kind</label>
            <select value={draft.question_type} onChange={set("question_type")} className={inputClass}>
              <option value="rating">Rated on the instrument's scale</option>
              <option value="text">Written answer</option>
            </select>
          </div>
        )}
        <div className={`flex items-end gap-5 pb-2 ${isNew ? "" : "col-span-2"}`}>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={draft.critical} onChange={set("critical")} className="rounded border-gray-300" />
            Critical
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={draft.required} onChange={set("required")} className="rounded border-gray-300" />
            Required
          </label>
        </div>
      </div>
      {isNew && draft.question_type === "rating" && addsPoints && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{addsPoints}</p>
      )}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy || !draft.name.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
          {busy ? "Saving…" : isNew ? "Add question" : "Save"}
        </button>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
      </div>
    </div>
  );
}

export default function InstrumentEditor({ instrument, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [bands, setBands] = useState([]);
  const [axis, setAxis] = useState(null);
  const [resources, setResources] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null); // a question id, or `new:<section>`
  const [draft, setDraft] = useState(EMPTY_QUESTION);
  const [editingBand, setEditingBand] = useState(null);
  const [bandDraft, setBandDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { load(); }, [instrument.id]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [loaded, all, res, usageRes] = await Promise.all([
        loadInstrument({ instrument_id: instrument.id }),
        base44.entities.Activity.list(),
        base44.entities.Resource.list("sort_order"),
        // Only gates Delete. If it fails, Delete stays hidden rather than
        // appearing on a question that turns out to have answers.
        base44.functions.invoke("listLibraryActivityUsage", {}).catch(() => null),
      ]);
      setQuestions(all.filter((a) => (a.instrument_ids || []).includes(instrument.id)));
      setBands(loaded?.bands || []);
      setAxis(loaded?.axes?.[0] || null);
      setResources(res);
      setUsage(usageRes?.data?.usage || null);
    } catch (e) {
      console.error("Failed to load the instrument", e);
      setError(functionErrorMessage(e, "Could not load this instrument."));
    }
    setLoading(false);
  };

  // The instrument's own sections, in its order, plus any a question names that
  // the instrument does not — so no question can go missing from this screen.
  const sections = useMemo(() => {
    const named = instrument.sections || [];
    const extra = [...new Set(questions.map((q) => q.section).filter((s) => s && !named.includes(s)))];
    return [...named, ...extra];
  }, [instrument.sections, questions]);

  const inSection = (s) =>
    questions.filter((q) => q.section === s).sort((a, b) => (a.section_sort ?? 0) - (b.section_sort ?? 0));

  const top = topPoints(axis);
  const ratedCount = questions.filter((q) => q.active !== false && q.question_type !== "text").length;
  const maxScore = top === null ? null : top * ratedCount;
  const problems = bandProblems(bands, maxScore);

  // Numbered as the survey numbers them: live questions only, in order.
  const numbers = new Map();
  let running = 0;
  for (const s of sections) for (const q of inSection(s)) if (q.active !== false) numbers.set(q.id, ++running);

  const run = async (fn, fallback) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      console.error(fallback, e);
      setError(functionErrorMessage(e, fallback));
    }
    setBusy(false);
  };

  const replaceQuestion = (row) => setQuestions((prev) => prev.map((q) => (q.id === row.id ? row : q)));
  const nextSort = (section) => questions.filter((q) => q.section === section).reduce((m, q) => Math.max(m, q.section_sort ?? 0), 0) + 1;

  const startEdit = (q) => {
    setEditingBand(null);
    setEditingId(q.id);
    setDraft({
      name: q.name || "",
      description: q.description || "",
      commentary: q.commentary || "",
      section: q.section || sections[0] || "",
      critical: !!q.critical,
      required: !!q.required,
      question_type: q.question_type || "rating",
    });
  };
  const startAdd = (section) => {
    setEditingBand(null);
    setEditingId(`new:${section}`);
    setDraft({ ...EMPTY_QUESTION, section });
  };

  // Names tell questions apart in reading and in reports, so two the same on
  // one instrument would be indistinguishable there.
  const nameTaken = (name, exceptId) =>
    questions.some((q) => q.id !== exceptId && (q.name || "").trim().toLowerCase() === name.toLowerCase());

  const saveQuestion = () => run(async () => {
    const name = draft.name.trim();
    const isNew = editingId.startsWith("new:");
    if (nameTaken(name, isNew ? null : editingId)) {
      setError(`"${name}" is already a question on this instrument. Give it a name of its own.`);
      return;
    }
    const fields = {
      name,
      description: draft.description.trim(),
      commentary: draft.commentary.trim(),
      section: draft.section,
      critical: draft.critical,
      required: draft.required,
    };
    if (isNew) {
      const made = await base44.entities.Activity.create({
        ...fields,
        instrument_ids: [instrument.id],
        section_sort: nextSort(draft.section),
        question_type: draft.question_type,
        // Every written answer these instruments ask is read back to the room.
        reportable_text: draft.question_type === "text",
        // Required by the entity and meaningless here; these questions page by
        // section. LEARN is what the seed wrote, so nothing distinguishes a
        // question added here from one that arrived with the instrument.
        facet: "LEARN",
        active: true,
      });
      setQuestions((prev) => [...prev, made]);
    } else {
      const current = questions.find((q) => q.id === editingId);
      // Moving section puts it last in its new section rather than wherever its
      // old position number happens to fall there.
      const patch = current.section !== fields.section ? { ...fields, section_sort: nextSort(fields.section) } : fields;
      replaceQuestion(await base44.entities.Activity.update(editingId, patch));
    }
    setEditingId(null);
  }, "Could not save the question.");

  // Renumbered 1..n on every move, so tied or missing positions — which the
  // survey would order arbitrarily — cannot survive a reorder.
  const move = (q, dir) => run(async () => {
    const list = inSection(q.section);
    const i = list.findIndex((x) => x.id === q.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const changes = reordered.map((x, k) => ({ x, sort: k + 1 })).filter(({ x, sort }) => x.section_sort !== sort);
    const updated = await Promise.all(changes.map(({ x, sort }) => base44.entities.Activity.update(x.id, { section_sort: sort })));
    setQuestions((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
  }, "Could not reorder the questions.");

  const toggleRetired = (q) => run(async () => {
    replaceQuestion(await base44.entities.Activity.update(q.id, { active: q.active === false }));
  }, "Could not change the question.");

  const usageOf = (id) => {
    const u = usage?.[id];
    return u ? u.assessments + u.sets + u.responses + u.notes + u.flags : 0;
  };
  const canDelete = (q) => usage !== null && usageOf(q.id) === 0;

  const confirmDelete = () => {
    const q = deleting;
    setDeleting(null);
    run(async () => {
      // Through the function rather than Activity.delete: it re-checks every
      // reference as service role, refuses if anything points at the question,
      // and detaches it from any reading first.
      const res = await base44.functions.invoke("deleteLibraryActivity", { activityId: q.id });
      if (res?.data?.error) throw new Error(res.data.error);
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
      setResources((prev) => prev.map((r) => ((r.activity_ids || []).includes(q.id)
        ? { ...r, activity_ids: r.activity_ids.filter((id) => id !== q.id) }
        : r)));
    }, "Could not delete the question.");
  };

  const readingFor = (q) => resources.filter((r) => (r.activity_ids || []).includes(q.id));

  const link = (q, resourceId) => run(async () => {
    const r = resources.find((x) => x.id === resourceId);
    if (!r) return;
    const updated = await base44.entities.Resource.update(r.id, { activity_ids: [...(r.activity_ids || []), q.id] });
    setResources((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
  }, "Could not attach the reading.");

  const unlink = (q, r) => run(async () => {
    const updated = await base44.entities.Resource.update(r.id, { activity_ids: (r.activity_ids || []).filter((id) => id !== q.id) });
    setResources((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
  }, "Could not remove the reading.");

  const startBand = (b) => {
    setEditingId(null);
    setEditingBand(b.id);
    setBandDraft({ name: b.name || "", min_score: String(b.min_score ?? ""), max_score: String(b.max_score ?? ""), advice: b.advice || "" });
  };
  const saveBand = () => run(async () => {
    const min = Number(bandDraft.min_score);
    const max = Number(bandDraft.max_score);
    if (!bandDraft.name.trim() || bandDraft.min_score.trim() === "" || bandDraft.max_score.trim() === "" ||
        !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
      setError("A band needs a name and two whole-number scores, the lower one first.");
      return;
    }
    const updated = await base44.entities.Band.update(editingBand, {
      name: bandDraft.name.trim(), min_score: min, max_score: max, advice: bandDraft.advice.trim(),
    });
    setBands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)).sort((a, b) => (a.min_score ?? 0) - (b.min_score ?? 0)));
    setEditingBand(null);
  }, "Could not save the band.");

  const addsPoints = top !== null && bands.length > 0
    ? `Adding a rated question raises the maximum score from ${maxScore} to ${maxScore + top}. Check the bands below cover the new range.`
    : null;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <section className="max-w-4xl bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-5 border-b border-gray-100">
          <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-700 mb-2">← All instruments</button>
          <h2 className="text-lg font-semibold text-gray-900">{instrument.name}</h2>
          {instrument.tagline && <p className="text-sm text-gray-500 mt-0.5">{instrument.tagline}</p>}
          {!loading && (
            <p className="text-xs text-gray-400 mt-2 tabular-nums">
              {numbers.size} question{numbers.size === 1 ? "" : "s"} in the survey
              {questions.length > numbers.size ? ` · ${questions.length - numbers.size} retired` : ""}
              {maxScore !== null ? ` · maximum score ${maxScore}` : ""}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border-b border-red-100 px-6 py-3" role="alert">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {sections.map((section) => (
              <div key={section} className="border-b border-gray-100">
                <div className="flex items-baseline justify-between px-6 pt-5 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">{section}</h3>
                  <button onClick={() => startAdd(section)} disabled={busy}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                    + Add a question
                  </button>
                </div>
                <ul className="divide-y divide-gray-50">
                  {inSection(section).map((q, idx, list) => {
                    const retired = q.active === false;
                    const reading = readingFor(q);
                    const offer = resources
                      .filter((r) => r.active !== false && !(r.activity_ids || []).includes(q.id))
                      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
                    return (
                      <li key={q.id} className={retired ? "bg-gray-50/60" : ""}>
                        {editingId === q.id ? (
                          <QuestionForm draft={draft} setDraft={setDraft} sections={sections} isNew={false}
                            onSave={saveQuestion} onCancel={() => setEditingId(null)} busy={busy} />
                        ) : (
                          <div className={`px-6 py-3 ${retired ? "opacity-60" : ""}`}>
                            <div className="flex items-baseline gap-3">
                              <span className="text-xs font-bold text-gray-300 w-5 shrink-0 tabular-nums">{numbers.get(q.id) || "—"}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <p className="text-sm font-semibold text-gray-900">{q.name}</p>
                                  {q.critical && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Critical</span>}
                                  {q.required && <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Required</span>}
                                  {q.question_type === "text" && <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Written answer</span>}
                                  {retired && <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">Retired</span>}
                                </div>
                                {q.description && <p className="text-sm text-gray-600 mt-0.5">{q.description}</p>}
                                {q.commentary
                                  ? <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{q.commentary}</p>
                                  : q.question_type !== "text" && <p className="text-xs text-amber-700 mt-1.5">No commentary yet.</p>}
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                  {reading.map((r) => (
                                    <span key={r.id} className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
                                      {r.title}
                                      <button onClick={() => unlink(q, r)} disabled={busy} aria-label={`Remove ${r.title} from ${q.name}`}
                                        className="text-gray-400 hover:text-red-600 disabled:opacity-50 px-0.5">×</button>
                                    </span>
                                  ))}
                                  {offer.length > 0 && (
                                    <select value="" disabled={busy} onChange={(e) => e.target.value && link(q, e.target.value)}
                                      aria-label={`Add reading to ${q.name}`}
                                      className="text-[11px] text-blue-700 bg-transparent border border-dashed border-blue-200 rounded px-1 py-0.5 max-w-[14rem]">
                                      <option value="">+ Reading</option>
                                      {offer.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                                    </select>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 text-xs">
                                <button onClick={() => move(q, -1)} disabled={busy || idx === 0} aria-label={`Move ${q.name} up`}
                                  className="px-1.5 py-1 text-gray-400 hover:text-gray-800 disabled:opacity-30">↑</button>
                                <button onClick={() => move(q, 1)} disabled={busy || idx === list.length - 1} aria-label={`Move ${q.name} down`}
                                  className="px-1.5 py-1 text-gray-400 hover:text-gray-800 disabled:opacity-30">↓</button>
                                <button onClick={() => startEdit(q)} disabled={busy} className="px-2 py-1 text-blue-600 hover:text-blue-800 disabled:opacity-50">Edit</button>
                                <button onClick={() => toggleRetired(q)} disabled={busy} className="px-2 py-1 text-gray-500 hover:text-gray-800 disabled:opacity-50">
                                  {retired ? "Restore" : "Retire"}
                                </button>
                                {canDelete(q) && (
                                  <button onClick={() => setDeleting(q)} disabled={busy} className="px-2 py-1 text-gray-400 hover:text-red-600 disabled:opacity-50">Delete</button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {editingId === `new:${section}` && (
                    <li>
                      <QuestionForm draft={draft} setDraft={setDraft} sections={sections} isNew addsPoints={addsPoints}
                        onSave={saveQuestion} onCancel={() => setEditingId(null)} busy={busy} />
                    </li>
                  )}
                  {inSection(section).length === 0 && editingId !== `new:${section}` && (
                    <li className="px-6 py-3 text-xs text-gray-400">No questions in this section.</li>
                  )}
                </ul>
              </div>
            ))}

            {bands.length > 0 && (
              <div className="px-6 py-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Bands</h3>
                <p className="text-xs text-gray-400 mb-3">
                  The verdict on a respondent's own copy, chosen by where their score falls.
                  {maxScore !== null ? ` Scores run from 0 to ${maxScore}.` : ""}
                </p>
                {problems.length > 0 && (
                  <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 space-y-0.5" role="status">
                    {problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                )}
                <ul className="space-y-2">
                  {bands.map((b) => (
                    <li key={b.id} className="border border-gray-100 rounded-lg">
                      {editingBand === b.id ? (
                        <div className="p-4 space-y-3 bg-blue-50/40">
                          <div className="grid grid-cols-4 gap-3">
                            <div className="col-span-2">
                              <label className={labelClass}>Name</label>
                              <input autoFocus value={bandDraft.name} onChange={(e) => setBandDraft((d) => ({ ...d, name: e.target.value }))} className={inputClass} />
                            </div>
                            <div>
                              <label className={labelClass}>From score</label>
                              <input inputMode="numeric" value={bandDraft.min_score} onChange={(e) => setBandDraft((d) => ({ ...d, min_score: e.target.value }))} className={inputClass} />
                            </div>
                            <div>
                              <label className={labelClass}>To score</label>
                              <input inputMode="numeric" value={bandDraft.max_score} onChange={(e) => setBandDraft((d) => ({ ...d, max_score: e.target.value }))} className={inputClass} />
                            </div>
                            <div className="col-span-4">
                              <label className={labelClass}>Advice</label>
                              <textarea rows={4} value={bandDraft.advice} onChange={(e) => setBandDraft((d) => ({ ...d, advice: e.target.value }))} className={`${inputClass} resize-y`} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={saveBand} disabled={busy}
                              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
                              {busy ? "Saving…" : "Save"}
                            </button>
                            <button onClick={() => setEditingBand(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-3 px-4 py-3">
                          <span className="text-xs font-semibold text-gray-500 w-14 shrink-0 tabular-nums">{b.min_score}–{b.max_score}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{b.name}</p>
                            {b.advice && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{b.advice}</p>}
                          </div>
                          <button onClick={() => startBand(b)} disabled={busy} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 shrink-0 disabled:opacity-50">Edit</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!deleting}
        destructive
        title="Delete this question?"
        message={`"${deleting?.name}" will be removed from ${instrument.name}. Nothing references it — no answer, assessment, or workshop note — so nothing else changes, and any reading offered for it stops listing it. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
