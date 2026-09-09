import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { seedInstruments } from "@/lib/instrument-seed-apply";
import { INSTRUMENT_SEED } from "@/lib/instrument-seed";

// The six instruments, and the one button that brings them up to date.
//
// The seed in src/lib/instrument-seed.js is the source of truth — committed
// content, so a change to a question's wording arrives in a diff and a review
// rather than by somebody editing a live row. This screen applies it.
//
// Super-admin only, matching the Library next to it and for the same reason:
// these are authored content that every organization reads and nobody else
// should be able to rewrite. A fractional CPO picks an instrument; they do not
// get to edit the questions inside it.
//
// Applying is safe to repeat. Everything is matched on a stable key, so a
// second run reports "unchanged" rather than doubling the library, and nothing
// is ever deleted — a question that vanished from the seed is named in the
// notes and left alone, because Response rows key on it and dropping it would
// take its answers with it.
export default function InstrumentsPage() {
  const [instruments, setInstruments] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [applyError, setApplyError] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [rows, questions] = await Promise.all([
        base44.entities.Instrument.list("sort_order"),
        base44.entities.Activity.list(),
      ]);
      setInstruments(rows);
      const per = {};
      for (const q of questions) {
        for (const id of q.instrument_ids || []) per[id] = (per[id] || 0) + 1;
      }
      setCounts(per);
    } catch (e) {
      console.error("Failed to load instruments", e);
      // Before the first publish after these entities were added, the table
      // does not exist yet and the failure is confusing rather than alarming.
      setLoadError("Could not load instruments. If these entities were only just added, publish first — the schema is applied on publish.");
    }
    setLoading(false);
  };

  const handleApply = async () => {
    setApplying(true);
    setApplyError("");
    setResult(null);
    setProgress("");
    try {
      const res = await seedInstruments(base44, { onProgress: setProgress });
      setResult(res);
      await load();
    } catch (e) {
      console.error("Failed to apply the instrument seed", e);
      setApplyError(e?.message || "Failed to apply the seed.");
    }
    setApplying(false);
    setProgress("");
  };

  const seededCount = INSTRUMENT_SEED.instruments.length;
  const line = (t) => `${t.created} added · ${t.updated} updated · ${t.unchanged} unchanged`;

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Instruments</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? "Loading…" : `${instruments.length} in the app · ${seededCount} in the source`}
            </p>
          </div>
          <button
            onClick={handleApply}
            disabled={applying}
            className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg bg-[#3366FF] hover:bg-[#2952CC] text-white disabled:opacity-50 transition-colors"
          >
            {applying ? (progress ? `${progress}…` : "Applying…") : "Apply source"}
          </button>
        </div>

        <p className="text-xs text-gray-400 px-6 py-3 border-b border-gray-100">
          The questions, scales and bands live in the repository, not in this
          screen. Applying brings the app up to date with them: safe to repeat,
          and it never deletes — a question dropped from the source is named
          below and left in place, because answers point at it.
        </p>

        {loadError && <p className="text-xs text-red-500 px-6 py-3">{loadError}</p>}
        {applyError && <p className="text-xs text-red-500 px-6 py-3">{applyError}</p>}

        {result && (
          <div className="px-6 py-4 border-b border-gray-100 bg-green-50/50 space-y-2">
            <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Applied</p>
            <dl className="text-xs text-gray-600 space-y-0.5">
              {Object.entries(result.tally).map(([what, t]) => (
                <div key={what} className="flex gap-2">
                  <dt className="w-24 shrink-0 capitalize text-gray-500">{what}</dt>
                  <dd className="tabular-nums">{line(t)}</dd>
                </div>
              ))}
            </dl>
            {result.notes.length > 0 && (
              <ul className="text-xs text-gray-500 list-disc pl-4 space-y-0.5 pt-1">
                {result.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : instruments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            Nothing yet. Apply the source to create them.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {instruments.map(i => (
              <li key={i.id} className="px-6 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-800">{i.name}</p>
                  <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                    {i.question_source === "library"
                      ? "from the activity library"
                      : `${counts[i.id] || 0} question${(counts[i.id] || 0) === 1 ? "" : "s"}`}
                  </span>
                </div>
                {i.tagline && <p className="text-xs text-gray-500 mt-0.5">{i.tagline}</p>}
                {i.description && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{i.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(i.sections || []).map(s => (
                    <span key={s} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
