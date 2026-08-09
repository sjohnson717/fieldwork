import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { parseCSV, toActivities, diffActivities } from "@/lib/activity-csv";

// Bulk import for the library activity list, in the same CSV shape the Export
// button produces.
//
// Nothing is written until the preview has been reviewed and confirmed. Rebuilding
// the library is a rare, wide-reaching action — a bad file could silently rewrite
// every description or delete rows that live assessments reference — so the diff
// is shown first and the treatment of absent rows is an explicit choice rather
// than a default.

const MISSING_ACTIONS = {
  keep: {
    label: "Leave them alone",
    hint: "Treat the file as a partial update. Nothing is removed.",
  },
  deactivate: {
    label: "Mark them inactive",
    hint: "They stop appearing in new assessments but stay attached to existing responses.",
  },
  delete: {
    label: "Delete them",
    hint: "Permanent. Any assessment or activity set still referencing them loses that row.",
  },
};

function Count({ n, label, tone = "gray" }) {
  const tones = {
    gray:  "text-gray-700 bg-gray-100",
    green: "text-emerald-700 bg-emerald-50",
    blue:  "text-blue-700 bg-blue-50",
    amber: "text-amber-700 bg-amber-50",
  };
  return (
    <div className={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <div className="text-lg font-bold leading-none">{n}</div>
      <div className="text-[11px] mt-1 opacity-80">{label}</div>
    </div>
  );
}

export default function ActivityImportDialog({ open, existing, onClose, onImported }) {
  const [fileName, setFileName] = useState(null);
  const [errors, setErrors] = useState([]);
  const [diff, setDiff] = useState(null);
  const [missingAction, setMissingAction] = useState("keep");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [failure, setFailure] = useState(null);
  const inputRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  // Reset between openings, so a previous file's preview never carries over.
  useEffect(() => {
    if (open) return;
    setFileName(null); setErrors([]); setDiff(null);
    setMissingAction("keep"); setProgress(null); setFailure(null);
  }, [open]);

  if (!open) return null;

  const handleFile = async (file) => {
    if (!file) return;
    setFailure(null);
    setFileName(file.name);
    const text = await file.text();
    const { activities, errors: errs } = toActivities(parseCSV(text));
    setErrors(errs);
    setDiff(activities.length > 0 ? diffActivities(activities, existing) : null);
  };

  const handleApply = async () => {
    setBusy(true);
    setFailure(null);
    const total =
      diff.created.length + diff.updated.length +
      (missingAction === "keep" ? 0 : diff.missing.length);
    let done = 0;
    const tick = () => { done++; setProgress({ done, total }); };

    try {
      // Sequential rather than Promise.all: a library rebuild is ~65 writes, and
      // firing them all at once has been enough to get rate-limited mid-import,
      // which leaves the library in a half-updated state that is worse than slow.
      for (const item of diff.created) {
        await base44.entities.Activity.create(item);
        tick();
      }
      for (const { existing: row, changes } of diff.updated) {
        await base44.entities.Activity.update(row.id, changes);
        tick();
      }
      if (missingAction === "deactivate") {
        for (const row of diff.missing) {
          await base44.entities.Activity.update(row.id, { active: false });
          tick();
        }
      } else if (missingAction === "delete") {
        for (const row of diff.missing) {
          await base44.entities.Activity.delete(row.id);
          tick();
        }
      }
      await onImported();
      onClose();
    } catch (e) {
      console.error("Import failed", e);
      // Deliberately does not roll back: the writes that already landed are
      // valid, and re-running the same file is idempotent — the diff will simply
      // find fewer things left to do.
      setFailure(
        `${e?.message || "Something went wrong"}. ${done} of ${total} changes were applied — ` +
        `re-importing the same file will pick up where it stopped.`
      );
    }
    setBusy(false);
  };

  const hasFatalError = errors.some(e => e.row === 0);
  const canApply =
    diff && !hasFatalError &&
    (diff.created.length > 0 || diff.updated.length > 0 ||
      (missingAction !== "keep" && diff.missing.length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
      <div className="absolute inset-0 bg-gray-900/40" onClick={() => { if (!busy) onClose(); }} />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 id="import-dialog-title" className="text-base font-semibold text-gray-900">Import activities from CSV</h2>
          <p className="text-sm text-gray-500 mt-1">
            Columns: <span className="font-mono text-xs">Facet, Activity, Description, Recommended Owner, Active</span>.
            Activities are matched by name; row order sets the library order.
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-5">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {fileName ? "Choose a different file" : "Choose CSV file"}
            </button>
            {fileName && <span className="ml-3 text-sm text-gray-500">{fileName}</span>}
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-800 mb-1">
                {hasFatalError ? "This file cannot be read" : `${errors.length} row${errors.length === 1 ? "" : "s"} skipped`}
              </p>
              <ul className="text-xs text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                {errors.map((e, i) => (
                  <li key={i}>{e.row > 0 && <span className="font-mono">line {e.row}: </span>}{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {diff && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <Count n={diff.created.length} label="new" tone="green" />
                <Count n={diff.updated.length} label="updated" tone="blue" />
                <Count n={diff.unchanged.length} label="unchanged" />
                <Count n={diff.missing.length} label="not in file" tone={diff.missing.length > 0 ? "amber" : "gray"} />
              </div>

              {diff.created.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                    {diff.created.length} activity{diff.created.length === 1 ? "" : " records"} will be created
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs text-gray-500 max-h-40 overflow-y-auto pl-4">
                    {diff.created.map(a => (
                      <li key={a.name}><span className="font-mono text-[#4d80ff]">{a.facet}</span> {a.name}</li>
                    ))}
                  </ul>
                </details>
              )}

              {diff.updated.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                    {diff.updated.length} will be updated
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs text-gray-500 max-h-40 overflow-y-auto pl-4">
                    {diff.updated.map(({ existing: row, changes }) => (
                      <li key={row.id}>
                        <span className="font-mono text-[#4d80ff]">{row.facet}</span> {row.name}
                        <span className="text-gray-400"> — {Object.keys(changes).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {diff.missing.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900 mb-1">
                    {diff.missing.length} library activit{diff.missing.length === 1 ? "y is" : "ies are"} not in this file
                  </p>
                  <ul className="text-xs text-amber-800 mb-3 max-h-24 overflow-y-auto">
                    {diff.missing.map(a => <li key={a.id}>{a.facet} · {a.name}</li>)}
                  </ul>
                  <div className="space-y-1.5">
                    {Object.entries(MISSING_ACTIONS).map(([key, { label, hint }]) => (
                      <label key={key} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="missing-action"
                          checked={missingAction === key}
                          onChange={() => setMissingAction(key)}
                          disabled={busy}
                          className="mt-0.5"
                        />
                        <span className="text-xs">
                          <span className="font-medium text-amber-900">{label}</span>
                          <span className="text-amber-700"> — {hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {failure && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-800">{failure}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {busy && progress ? `Applying ${progress.done} of ${progress.total}…` : ""}
          </span>
          <div className="flex gap-2">
            <button
              ref={closeRef}
              onClick={onClose}
              disabled={busy}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply || busy}
              className={`text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-40 transition-colors ${
                missingAction === "delete" && diff?.missing.length > 0
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-[#3366FF] hover:bg-[#2952CC]"
              }`}
            >
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
