import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { loadRespondentSummary } from "@/lib/unread-responses";
import { runChecks } from "@/lib/health-checks";
import { loadContentStatus } from "@/lib/content-live";
import { isLibraryActivity } from "@/lib/activities";
import { functionErrorMessage } from "@/lib/utils";
import { ResourceForm, EMPTY_RESOURCE } from "./ResourcesTab";

// Settings → System Health: what a super-admin should look at, gathered on one page.
//
// Read-only. Each finding links to the screen that deals with it, and every
// change is made there, where its own guards already live. The rules and their
// thresholds are in lib/health-checks.js.

// Every source is loaded on its own, so one that fails marks only the checks
// that need it as unchecked, rather than taking the page down or, worse,
// letting those checks pass on an empty list.
const SOURCES = {
  assessments: () => base44.entities.Assessment.list("created_date"),
  summary: () => loadRespondentSummary(),
  resources: () => base44.entities.Resource.list(),
  activities: () => base44.entities.Activity.list(),
  instruments: () => base44.entities.Instrument.list(),
  jobTitles: () => base44.entities.JobTitle.list(),
  invitations: () => base44.entities.Invitation.filter({ status: "pending" }),
  skippedPosts: () => base44.entities.SkippedPost.list(),
  blogPosts: () => base44.functions.invoke("fetchBlogFeed", {}).then(res => res?.data?.posts || []),
  // The content branch beside the app's own copy of the same content. The
  // slowest source here by some way — a GitHub read and ten lists — and the
  // only one that can say the repository has stopped being a backup.
  contentStatus: () => loadContentStatus(),
};

// Reading for an activity that has none, added without leaving the page: attach
// an article already in Resources, or write a new one with the activity ticked.
// The saved row goes back into the page's data, so the check updates at once.
function AddReadingPanel({ activity, resources, activities, onSaved, onClose }) {
  const [choice, setChoice] = useState("");
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_RESOURCE, activity_ids: [activity.id] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existing = resources
    .filter(r => r.active !== false)
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const pickable = activities.filter(a => a.active !== false && isLibraryActivity(a));

  const save = async (write) => {
    setSaving(true);
    setError("");
    try {
      onSaved(await write());
    } catch (e) {
      console.error("Failed to add reading", e);
      setError(functionErrorMessage(e, "The reading could not be saved."));
      setSaving(false);
    }
  };

  const attach = () => save(() => {
    const r = resources.find(x => x.id === choice);
    return base44.entities.Resource.update(r.id, { activity_ids: [...(r.activity_ids || []), activity.id] });
  });

  const create = () => save(() => base44.entities.Resource.create({
    ...draft,
    title: draft.title.trim(),
    sort_order: resources.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) + 1,
    active: true,
  }));

  return (
    <div className="px-4 md:pl-16 pr-4 pb-4 pt-1 space-y-3">
      {!writing ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={choice}
              onChange={e => setChoice(e.target.value)}
              aria-label={`Resource to attach to ${activity.name}`}
              className="flex-1 min-w-[12rem] border border-gray-300 rounded-lg px-3 h-11 md:h-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
            >
              <option value="">Attach a resource already in the list…</option>
              {existing.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <button
              onClick={attach}
              disabled={!choice || saving}
              className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 h-11 md:h-9 rounded-lg"
            >
              {saving ? "Saving…" : "Attach"}
            </button>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button onClick={() => setWriting(true)} className="text-[#3366FF] hover:text-[#2952CC] font-medium min-h-[44px] md:min-h-0">
              Or add a new resource
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 min-h-[44px] md:min-h-0">Cancel</button>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-[#a3b8ff] px-4 py-3">
          <p className="text-[11px] text-gray-400 mb-2">
            New reading for <span className="font-medium text-gray-600">{activity.name}</span>, ticked below. Tick anything else it helps with too.
          </p>
          <ResourceForm
            draft={draft} setDraft={setDraft} activities={pickable}
            onSave={create}
            onCancel={() => setWriting(false)}
            saving={saving} saveLabel="Add"
          />
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

const SECTIONS = [
  ["fix", "Needs fixing"],
  ["review", "Worth a look"],
];

function Tile({ count, label, note }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-2xl font-semibold text-gray-700">{count ?? "—"}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </div>
  );
}

export default function HealthPage({ onOpen }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  // The item whose Add reading panel is open, if any.
  const [addingFor, setAddingFor] = useState(null);

  const load = async () => {
    setLoading(true);
    const keys = Object.keys(SOURCES);
    const settled = await Promise.allSettled(keys.map(k => SOURCES[k]()));
    const next = {};
    const bad = new Set();
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") next[keys[i]] = s.value;
      else { bad.add(keys[i]); console.error(`Health: could not load ${keys[i]}`, s.reason); }
    });
    setData(next);
    setFailed(bad);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const report = data ? runChecks(data) : null;
  const checks = report ? report.checks.map(c => ({ ...c, unchecked: c.needs.some(n => failed.has(n)) })) : [];
  const countOf = (severity) => checks.filter(c => c.severity === severity && !c.unchecked).reduce((n, c) => n + c.items.length, 0);
  const toFix = countOf("fix");
  const toReview = countOf("review");
  const totals = report?.totals;
  const uncheckedCount = checks.filter(c => c.unchecked).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">System Health</h2>
            {data && (
              <p className="text-sm font-medium text-gray-700">
                {toFix === 0 ? "Nothing needs fixing" : `${toFix} ${toFix === 1 ? "thing" : "things"} to fix`} · {toReview} worth a look
              </p>
            )}
            <p className="text-sm text-gray-400">
              What needs tidying across every organization: gaps in the library, old reading, and assessments that have gone quiet. Nothing here changes anything; each item opens the screen where you deal with it.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto shrink-0 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg px-3 h-11 md:h-8 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Recheck"}
          </button>
        </div>
        {!loading && uncheckedCount > 0 && (
          <p className="text-xs text-red-500 mt-2">
            {uncheckedCount} {uncheckedCount === 1 ? "check" : "checks"} could not run because {failed.size === 1 ? "a list" : "some lists"} did not load. Recheck to try again.
          </p>
        )}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-4 md:px-8 py-6 max-w-3xl space-y-6">
          {/* Also where a failed list shows: a dash, never a zero. */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile
              count={failed.has("assessments") ? null : totals.assessments}
              label="Assessments"
              note={failed.has("assessments") ? null : `${totals.open} open · ${totals.closed} closed`}
            />
            <Tile
              count={failed.has("resources") ? null : totals.resources}
              label="Resources"
              note={failed.has("resources") || !totals.disabledResources ? null : `${totals.disabledResources} disabled`}
            />
            <Tile count={failed.has("activities") ? null : totals.activities} label="Library activities" />
            <Tile
              count={failed.has("activities") || failed.has("instruments") ? null : totals.questions}
              label="Instrument questions"
              note={failed.has("instruments") ? null : `${totals.instruments} instruments`}
            />
            <Tile
              count={failed.has("blogPosts") || failed.has("resources") || failed.has("skippedPosts") ? null : totals.blogPending}
              label="Blog posts pending"
              note={failed.has("skippedPosts") ? null : `${totals.blogSkipped} skipped` + (failed.has("blogPosts") || failed.has("resources") ? "" : ` · ${totals.blogAdded} added`)}
            />
          </div>

          {SECTIONS.map(([severity, heading]) => (
            <section key={severity}>
              <h3 className="text-base font-bold text-gray-900 mb-2">{heading}</h3>
              <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {checks.filter(c => c.severity === severity).map(c => {
                  const count = c.items.length;
                  const open = expanded === c.key;
                  const canOpen = !c.unchecked && count > 0;
                  return (
                    <li key={c.key}>
                      <button
                        onClick={() => canOpen && setExpanded(open ? null : c.key)}
                        aria-expanded={canOpen ? open : undefined}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 min-h-[44px] ${canOpen ? "hover:bg-gray-50" : "cursor-default"}`}
                      >
                        <span className={`shrink-0 w-9 text-center text-xs font-semibold rounded-full py-0.5 mt-0.5 ${
                          c.unchecked ? "bg-gray-100 text-gray-400"
                            : count > 0 ? (severity === "fix" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")
                            : "bg-green-50 text-green-600"
                        }`}>
                          {c.unchecked ? "?" : count > 0 ? count : "✓"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${count > 0 && !c.unchecked ? "font-medium text-gray-800" : "text-gray-500"}`}>{c.title}</span>
                          {(open || c.unchecked) && (
                            <span className="block text-xs text-gray-400 mt-0.5">
                              {c.unchecked ? "Could not check: a list it needs did not load." : c.why}
                            </span>
                          )}
                        </span>
                        {canOpen && (
                          <svg className={`w-4 h-4 mt-0.5 text-gray-300 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                      {open && (
                        <ul className="border-t border-gray-100 bg-gray-50/60 divide-y divide-gray-100">
                          {c.items.map(item => (
                            <li key={item.key}>
                              <div className="flex items-center gap-3 pl-4 md:pl-16 pr-2 py-1.5">
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm text-gray-700 truncate" title={item.label}>{item.label}</span>
                                  {item.detail && <span className="block text-xs text-gray-400 break-words">{item.detail}</span>}
                                </span>
                                {/* An activity with no reading is fixed here, in a panel under
                                    it, rather than on another page. */}
                                <button
                                  onClick={() => item.addReadingFor
                                    ? setAddingFor(addingFor === item.key ? null : item.key)
                                    : onOpen(item.target)}
                                  aria-expanded={item.addReadingFor ? addingFor === item.key : undefined}
                                  className="shrink-0 text-sm text-[#3366FF] hover:text-[#2952CC] font-medium px-3 h-11 md:h-8 rounded-lg hover:bg-white"
                                >
                                  {item.addReadingFor ? "Add reading" : "Open"}
                                </button>
                              </div>
                              {item.addReadingFor && addingFor === item.key && (
                                <AddReadingPanel
                                  activity={item.addReadingFor}
                                  resources={data.resources || []}
                                  activities={data.activities || []}
                                  onClose={() => setAddingFor(null)}
                                  onSaved={(saved) => {
                                    setAddingFor(null);
                                    setData(d => ({
                                      ...d,
                                      resources: d.resources.some(r => r.id === saved.id)
                                        ? d.resources.map(r => r.id === saved.id ? saved : r)
                                        : [...d.resources, saved],
                                    }));
                                  }}
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
