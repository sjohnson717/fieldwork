// Where respondents came from, and how far each source got: arrived, started,
// completed.
//
// Arrivals are visits to the code link (one per tab), recorded server-side
// when the code resolves. Starts are Respondent rows, which exist only once
// someone enters a name and title, so the gap between the first two columns
// is the intro card's drop-off — the number Wix's click count cannot show.
//
// Counts only, never names, so it sits above the confidentiality note's
// territory rather than inside it; but it is on the Results tabs because that
// is where a facilitator asks "is anyone answering?".
//
// Renders nothing for an assessment nobody has tagged or visited since
// arrivals began being counted: an older engagement would otherwise show a
// table of zeros under respondents who plainly arrived.

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { funnelRows, funnelKey } from "@/lib/arrival-funnel";
import { removeArrival } from "@/lib/public-assessment";

const NO_SOURCE = "No source";

export default function ArrivalFunnel({ assessmentId, arrivals, respondents, onChanged }) {
  // The row whose visit is about to be removed, while the confirm is open.
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totalArrived = arrivals.reduce((n, a) => n + a.count, 0);
  const tagged = respondents.some((r) => r.source || r.campaign);
  if (!totalArrived && !tagged) return null;

  const rows = funnelRows(arrivals, respondents);
  // One untagged row says nothing a total does not; the table earns its place
  // once there are sources to compare.
  // A visit with no start behind it is the only kind worth offering to remove:
  // a test click, or a check that the link works. A visit someone started
  // from goes when their respondent is removed.
  const removable = (r) => r.arrived > r.started;
  const showTable = rows.length > 1 || rows.some((r) => r.source || r.campaign || removable(r));

  const confirmRemove = async () => {
    setBusy(true);
    setError("");
    try {
      await removeArrival(assessmentId, removing);
      onChanged?.();
    } catch (e) {
      console.error("Failed to remove a visit", e);
      setError("That visit could not be removed. Please try again.");
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div className="mb-4">
      {showTable && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Source</th>
                <th className="text-right pb-2 font-medium">Arrived</th>
                <th className="text-right pb-2 font-medium">Started</th>
                <th className="text-right pb-2 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={funnelKey(r.source, r.campaign)} className="border-b border-gray-50 last:border-0">
                  {/* Remove sits with the label rather than in a column of its
                      own: at phone width a fifth column is pushed past the edge
                      of the card, and this wraps under the label instead. */}
                  <td className="py-1 text-gray-800">
                    <div className="flex flex-wrap items-center gap-x-3">
                      <span>
                        {r.source || <span className="text-gray-400">{NO_SOURCE}</span>}
                        {r.campaign && <span className="text-gray-400"> · {r.campaign}</span>}
                      </span>
                      {removable(r) && (
                        <button
                          onClick={() => setRemoving(r)}
                          title="Remove a visit, such as a test click"
                          className="text-xs text-gray-300 hover:text-red-400 transition-colors min-h-[44px] whitespace-nowrap"
                        >
                          Remove a visit
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-1 text-right tabular-nums text-gray-700">{r.arrived}</td>
                  <td className="py-1 text-right tabular-nums text-gray-700">{r.started}</td>
                  <td className="py-1 text-right tabular-nums text-gray-700">{r.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <p className="text-xs text-gray-400 mt-2 leading-relaxed">
        Arrived counts visits to the code link, once per browser tab, since 28 Sept 2026. Started means
        they entered a name. For a row per place you post it, copy the link from Overview → Access.
        Removing a respondent removes their visit too.
      </p>
      <ConfirmDialog
        open={!!removing}
        destructive
        busy={busy}
        title="Remove a visit?"
        message={`One visit from ${removing?.source || "no source"}${removing?.campaign ? ` · ${removing.campaign}` : ""} will be taken out of the Arrived count. Use this for a test click. It cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
