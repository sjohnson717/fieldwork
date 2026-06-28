import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActivityLogger } from "@/utils/activityLogger";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function elapsed(first, last) {
  const ms = new Date(last) - new Date(first);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatActionLine(entry) {
  if (entry.type === "nav") {
    return `📍 Navigated to ${entry.path}${entry.search ? entry.search : ""}`;
  }
  if (entry.type === "error") {
    return `⚠ ${entry.message || JSON.stringify(entry)}`;
  }
  if (entry.type === "action") {
    const ev = entry.event;
    if (ev === "answer_selected") {
      const parts = [];
      if (entry.importance) parts.push(`importance=${entry.importance}`);
      if (entry.execution) parts.push(`execution=${entry.execution}`);
      if (entry.suggested_owner) parts.push(`owner=${entry.suggested_owner}`);
      return `${entry.facet || "?"}: answered ${parts.join(", ")}`;
    }
    if (ev === "nav_button") {
      const arrow = entry.label === "submit" ? "✓ Submit" : entry.label === "back" ? "← Back" : `→ ${entry.label}`;
      return `${arrow}  (${entry.fromFacet || ""} page ${(entry.pageIndex ?? "") + 1})`;
    }
    return `action: ${ev} ${JSON.stringify({ ...entry, ts: undefined, type: undefined, event: undefined })}`;
  }
  return JSON.stringify(entry);
}

// Split log into "passes" — a new pass starts on each 'nav' event to /assess
function buildPasses(log) {
  const passes = [];
  let current = null;
  for (const entry of log) {
    const isAssessNav = entry.type === "nav" && entry.path && entry.path.includes("/assess");
    if (isAssessNav || current === null) {
      current = { entries: [entry], startTs: entry.ts, path: entry.path || "" };
      passes.push(current);
    } else {
      current.entries.push(entry);
    }
  }
  return passes;
}

function SummaryTab({ log }) {
  if (log.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">No activity recorded yet.</p>;

  const passes = buildPasses(log);

  return (
    <div className="space-y-6">
      {passes.map((pass, pi) => {
        const last = pass.entries[pass.entries.length - 1];
        const dur = pass.entries.length > 1 ? elapsed(pass.startTs, last.ts) : null;
        return (
          <div key={pi} className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                {formatTime(pass.startTs)} — {pass.path || "(unknown path)"}
              </span>
              {dur && <span className="text-xs text-gray-400">{dur}</span>}
            </div>
            <ul className="divide-y divide-gray-50">
              {pass.entries.map((entry, ei) => {
                const isError = entry.type === "error";
                const line = formatActionLine(entry);
                return (
                  <li key={ei} className={`px-4 py-1.5 flex items-start gap-3 text-xs ${isError ? "bg-red-50" : ""}`}>
                    <span className="text-gray-300 shrink-0 w-16 tabular-nums">{formatTime(entry.ts)}</span>
                    <span className={isError ? "text-red-600 font-medium" : "text-gray-700"}>{line}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function ActivityLogModal({ open, onClose }) {
  const [tab, setTab] = useState("summary");
  const [copied, setCopied] = useState(false);
  const log = ActivityLogger.getLog();

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Activity Log</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
          {["summary", "raw"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "summary" ? "Summary" : "Raw Log"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === "summary" ? (
            <SummaryTab log={log} />
          ) : (
            <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(log, null, 2)}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-gray-100 shrink-0">
          <button
            onClick={handleCopy}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            {copied ? "Copied!" : "Copy Raw JSON"}
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}