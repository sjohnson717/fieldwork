// What happened around the survey, in totals: which devices people came on,
// how long a first pass took, what finishers did with their report, and where
// the ones who did not finish stopped.
//
// Counts only, by decision. The roster underneath names people; this never
// does, and nothing it is built from carries a name to the browser. A list of
// who clicked the Quartz link would read as surveillance to anyone shown this
// page, and would be one screenshot from a sales list.
//
// Every part renders only when it has something to say, so an assessment from
// before any of this was counted looks as it did.

import { deviceRows, medianMinutes } from "@/lib/arrival-funnel";

const DEVICE_LABELS = { phone: "Phone", tablet: "Tablet", desktop: "Desktop", unknown: "Not recorded" };

// In the order a reader moves through a report, with the words a facilitator
// would use for them.
const ACTIONS = [
  ["report_reopened", "came back to their report"],
  ["printed", "saved it as a PDF or printed it"],
  ["resource_clicked", "clicked a reading link"],
  ["quartz_clicked", "clicked the Quartz Product Leadership link"],
  ["chaos_clicked", "clicked the Chaos Assessment link"],
];

// Library facets are stored in capitals; an instrument's sections are already
// written as titles.
const pageLabel = (page) => {
  if (!page) return "before their first answer";
  return page === page.toUpperCase() ? page.charAt(0) + page.slice(1).toLowerCase() : page;
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Stat({ label, children }) {
  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{children}</p>
    </div>
  );
}

export default function AfterFinishing({ funnel, respondents }) {
  const devices = deviceRows(funnel.arrivalDevices, respondents);
  const showDevices = devices.some((d) => d.device !== "unknown");
  const timing = medianMinutes(respondents);
  const completed = respondents.filter((r) => r.status === "completed").length;
  const unfinished = respondents.length - completed;
  const actions = ACTIONS.filter(([key]) => funnel.afterFinishing?.[key] > 0);
  const stopped = unfinished > 0 ? funnel.stoppedIn : [];

  if (!showDevices && !timing && !actions.length && !stopped.length) return null;

  return (
    <div className="mb-4">
      {showDevices && (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Device</th>
                <th className="text-right pb-2 font-medium w-20 sm:w-28">Arrived</th>
                <th className="text-right pb-2 font-medium w-20 sm:w-28">Started</th>
                <th className="text-right pb-2 font-medium w-20 sm:w-28">Completed</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.device} className="border-b border-gray-50 last:border-0">
                  <td className={`py-2 ${d.device === "unknown" ? "text-gray-400" : "text-gray-800"}`}>
                    {DEVICE_LABELS[d.device]}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{d.arrived}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{d.started}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{d.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {timing && (
        <Stat label="Time to complete">
          {plural(timing.minutes, "minute", "minutes")} for most people (the median of{" "}
          {plural(timing.count, "finisher", "finishers")}, timed to their first finish)
        </Stat>
      )}

      {actions.length > 0 && (
        <Stat label={`After finishing · of ${completed}`}>
          {actions.map(([key, words], i) => (
            <span key={key}>
              {i > 0 && " · "}
              <span className="tabular-nums font-medium text-gray-900">{funnel.afterFinishing[key]}</span> {words}
            </span>
          ))}
        </Stat>
      )}

      {stopped.length > 0 && (
        <Stat label={`Didn't finish · ${unfinished}`}>
          {stopped.map((s, i) => (
            <span key={s.page || "none"}>
              {i > 0 && " · "}
              <span className="tabular-nums font-medium text-gray-900">{s.count}</span>{" "}
              {s.page ? "stopped in " : "stopped "}{pageLabel(s.page)}
            </span>
          ))}
        </Stat>
      )}

      <p className="text-xs text-gray-400 mt-2 leading-relaxed">
        Devices and what people did after finishing are counted from 28 Sept 2026, as totals, never by
        name. Printing from the share menu in iPhone Safari is not counted; the Save as PDF button is.
      </p>
    </div>
  );
}
