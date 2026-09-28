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

import { funnelRows, funnelKey } from "@/lib/arrival-funnel";

const NO_SOURCE = "No source";

export default function ArrivalFunnel({ arrivals, respondents }) {
  const totalArrived = arrivals.reduce((n, a) => n + a.count, 0);
  const tagged = respondents.some((r) => r.source || r.campaign);
  if (!totalArrived && !tagged) return null;

  const rows = funnelRows(arrivals, respondents);
  // One untagged row says nothing a total does not; the table earns its place
  // once there are sources to compare.
  const showTable = rows.length > 1 || rows.some((r) => r.source || r.campaign);

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
                  <td className="py-2 text-gray-800">
                    {r.source || <span className="text-gray-400">{NO_SOURCE}</span>}
                    {r.campaign && <span className="text-gray-400"> · {r.campaign}</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{r.arrived}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{r.started}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{r.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2 leading-relaxed">
        Arrived counts visits to the code link, once per browser tab, since 28 Sept 2026. Started means
        they entered a name. For a row per place you post it, copy the link from Overview → Access.
      </p>
    </div>
  );
}
