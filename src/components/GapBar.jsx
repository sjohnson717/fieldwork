import { IMPORTANCE_LABEL, EXECUTION_LABEL } from "@/lib/scoring";

// Importance against execution, as two bars.
//
// One definition, because there were two and they drifted. The buyer report's
// copy read `LABEL[Math.round(v)] || "—"`, and Math.round(null) is 0, so a
// missing average resolved to LABEL[0] — "Not needed" and "Not done" — which is
// truthy, so the fallback never ran. An activity nobody rated was reported to a
// paying client as one the team considers unimportant and does not do. The
// admin copy guarded null explicitly and was right; this is that version.
export default function GapBar({ importance, execution }) {
  const pct = (v) => (v !== null && v !== undefined ? (v / 3) * 100 : 0);
  const label = (labels, v) =>
    v !== null && v !== undefined ? labels[Math.round(v)] ?? "—" : "—";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">Importance</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[200px]">
          <div className="h-2 rounded-full bg-[#3366FF] transition-all" style={{ width: `${pct(importance)}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-20 shrink-0">{label(IMPORTANCE_LABEL, importance)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">Execution</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[200px]">
          <div className="h-2 rounded-full bg-[#11CC77] transition-all" style={{ width: `${pct(execution)}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-20 shrink-0">{label(EXECUTION_LABEL, execution)}</span>
      </div>
    </div>
  );
}
