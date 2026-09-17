import { useState, useEffect, useRef } from "react";
import { isLibraryActivity } from "@/lib/activities";
import { base44 } from "@/api/base44Client";
import { FACET_ORDER } from "@/lib/scoring";
import ConfirmDialog from "@/components/ConfirmDialog";
import BlogFeedPanel from "@/pages/admin/BlogFeedPanel";
import { scrollToRecord, FOCUS_RING } from "@/lib/focus-record";
import { functionErrorMessage } from "@/lib/utils";

// Learning resources offered on a personal report, against the activities
// someone was actually advised to develop.
//
// The type is a first-class field rather than a note, because a reader needs to
// know what they are being sent before they click. A page that mixes a free
// article with a paid workshop and labels neither reads as advertising however
// good the advice is — and this section only works if it is trusted.
//
// Nothing is generated. Every row here is written by a person, which is the
// point: a recommendation nobody chose is a recommendation nobody stands behind.

const TYPES = [
  { key: "free_article",  label: "Free article" },
  { key: "external",      label: "External resource" },
  // The label is what the reader sees on the report, so the picker has to use
  // the same word. The key stays as it is — it is on every stored record.
  { key: "quartz_book",   label: "Book" },
  { key: "quartz_course", label: "Course or workshop" },
];

const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.key, t.label]));

export const EMPTY_RESOURCE = {
  title: "", resource_type: "free_article", source: "", published_date: "", url: "", note: "", activity_ids: [],
  fallback: false,
};

// Stored as YYYY-MM-DD. Parsed as a local date: new Date("2026-08-10") is
// midnight UTC, which reads as 9 Aug anywhere west of Greenwich.
const formatPublished = (ymd) => {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

function ActivityPicker({ activities, selectedIds, onToggle }) {
  const byFacet = FACET_ORDER
    .map(facet => ({ facet, items: activities.filter(a => a.facet === facet) }))
    .filter(f => f.items.length > 0);

  return (
    <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto p-3 space-y-3">
      {byFacet.map(({ facet, items }) => (
        <div key={facet}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#4d80ff] mb-1">{facet}</div>
          <div className="space-y-1">
            {items.map(a => (
              <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(a.id)}
                  onChange={() => onToggle(a.id)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#3366FF] focus:ring-[#3366FF] cursor-pointer"
                />
                <span className="text-sm text-gray-700">{a.name}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResourceForm({ draft, setDraft, activities, onSave, onCancel, saving, saveLabel }) {
  // The picker lists library activities only. A link to anything else — an
  // instrument's question, or a retired activity — is kept, and counted apart
  // so the number matches what the picker shows.
  const listedCount = draft.activity_ids.filter(id => activities.some(a => a.id === id)).length;
  const unlistedCount = draft.activity_ids.length - listedCount;
  const toggle = (id) => setDraft(d => ({
    ...d,
    activity_ids: d.activity_ids.includes(id)
      ? d.activity_ids.filter(x => x !== id)
      : [...d.activity_ids, id],
  }));

  return (
    <div className="space-y-3">
      <input
        autoFocus
        placeholder="Title"
        value={draft.title}
        onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
      />
      <div className="flex flex-wrap gap-3">
        <select
          value={draft.resource_type}
          onChange={e => setDraft(d => ({ ...d, resource_type: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
        >
          {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input
          placeholder="Author, publication, or book and chapter"
          value={draft.source}
          onChange={e => setDraft(d => ({ ...d, source: e.target.value }))}
          className="flex-1 min-w-[12rem] border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
        />
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Published
          <input
            type="date"
            value={draft.published_date}
            onChange={e => setDraft(d => ({ ...d, published_date: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
          />
        </label>
      </div>
      <input
        placeholder="https://…"
        value={draft.url}
        onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
      />
      <textarea
        rows={2}
        placeholder="Why is this worth someone's time? One line, shown under the title."
        value={draft.note}
        onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
      />
      <div>
        <p className="text-xs text-gray-500 mb-1.5">
          Offered for these activities ({listedCount} selected
          {unlistedCount > 0 ? `, plus ${unlistedCount} not listed here — instrument questions are set on the Instruments screen` : ""}).{" "}
          {draft.fallback
            ? "Attached to nothing, this still reaches a report whose shortlist comes out thin."
            : "A resource attached to nothing never appears on a report."}
        </p>
        <ActivityPicker activities={activities} selectedIds={draft.activity_ids} onToggle={toggle} />
      </div>
      {/* Below the activity picker on purpose: it is the exception to the rule
          the picker states, and reads as one there. */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!draft.fallback}
          onChange={e => setDraft(d => ({ ...d, fallback: e.target.checked }))}
          className="w-3.5 h-3.5 mt-0.5 rounded border-gray-300 text-[#3366FF] focus:ring-[#3366FF] cursor-pointer"
        />
        <span className="text-xs text-gray-500 leading-relaxed">
          Also offer this when a report's shortlist comes out thin — one or two items — whatever
          was recommended. For the few things worth reading whatever someone is working on. It never
          makes the section appear on its own.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving || !draft.title.trim()}
          className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          {saving ? "Saving…" : saveLabel}
        </button>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

// `focus` comes from System Health's Open: resources to point at, an activity
// to start new reading for, or the blog feed to open.
export default function ResourcesTab({ focus = null }) {
  const [resources, setResources] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allActivities, setAllActivities] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_RESOURCE);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  // The blog post the add form was filled from, for the category hint.
  const [feedPost, setFeedPost] = useState(null);
  const addFormRef = useRef(null);
  const [highlighted] = useState(() => new Set(focus?.resourceIds || []));
  // The activity the add form was opened for, named above the form.
  const [addingFor, setAddingFor] = useState(null);

  // Add on a post far down the feed opens the form above it, out of sight.
  useEffect(() => {
    if (showAddForm && (feedPost || addingFor)) addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showAddForm, feedPost, addingFor]);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [res, acts] = await Promise.all([
        // Newest first, so a resource just added sits under the form that
        // made it. sort_order still sets the order a report shows them in.
        base44.entities.Resource.list("-created_date"),
        base44.entities.Activity.filter({ active: true }, "sort_order")
          .then(all => all.filter(a => !a.assessment_id)),
      ]);
      setResources(res);
      // The picker offers library activities only; an instrument's questions
      // get their reading on the Instruments screen. Names are looked up from
      // both, so an article's line below still says where it is offered.
      setActivities(acts.filter(isLibraryActivity));
      setAllActivities(acts);
      if (focus?.addForActivityId) {
        const activity = acts.find(a => a.id === focus.addForActivityId);
        if (activity) {
          setDraft({ ...EMPTY_RESOURCE, activity_ids: [activity.id] });
          setAddingFor(activity);
          setShowAddForm(true);
        }
      }
      if (focus?.showFeed) setShowFeed(true);
    } catch (e) { console.error(e); }
    setLoading(false);
    scrollToRecord("data-resource-id", focus?.resourceIds?.[0]);
  };

  const handleAdd = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const maxOrder = resources.length > 0 ? Math.max(...resources.map(r => r.sort_order ?? 0)) : -1;
      const created = await base44.entities.Resource.create({
        ...draft,
        title: draft.title.trim(),
        sort_order: maxOrder + 1,
        active: true,
      });
      setResources(prev => [created, ...prev]);
      setDraft(EMPTY_RESOURCE);
      setShowAddForm(false);
      setFeedPost(null);
      setAddingFor(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSaveEdit = async (id) => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const updated = await base44.entities.Resource.update(id, { ...draft, title: draft.title.trim() });
      setResources(prev => prev.map(r => r.id === id ? updated : r));
      setEditingId(null);
      setDraft(EMPTY_RESOURCE);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleToggleActive = async (r) => {
    try {
      const updated = await base44.entities.Resource.update(r.id, { active: !r.active });
      setResources(prev => prev.map(x => x.id === r.id ? updated : x));
    } catch (e) { console.error(e); }
  };

  // No reference check: nothing points at a resource. Resource.activity_ids
  // points outwards, at the activities this reading is offered for, so deleting
  // one removes an offer and breaks nothing. Reports resolve resources from the
  // activity, never the other way round.
  const handleDelete = async (id) => {
    setDeleting(null);
    setError("");
    try {
      await base44.entities.Resource.delete(id);
      setResources(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error("Failed to delete resource", e);
      setError(functionErrorMessage(e, "Failed to delete the resource."));
    }
  };

  const activityName = (id) => allActivities.find(a => a.id === id)?.name;

  // A function rather than a component: declared in here, a component would
  // be a new type every render and remount its buttons.
  const rowActions = (r, className, buttonClassName) => (
    <div className={`items-center gap-2 ${className}`}>
      <button
        onClick={() => {
          setEditingId(r.id);
          setDraft({
            title: r.title || "", resource_type: r.resource_type || "free_article",
            source: r.source || "", published_date: r.published_date || "", url: r.url || "", note: r.note || "",
            activity_ids: r.activity_ids || [],
            fallback: !!r.fallback,
          });
        }}
        className={`${buttonClassName} text-gray-400 hover:text-[#3366FF] font-medium transition-colors`}
      >
        Edit
      </button>
      <button onClick={() => handleToggleActive(r)} className={`${buttonClassName} text-gray-400 hover:text-gray-700 transition-colors`}>
        {r.active ? "Disable" : "Enable"}
      </button>
      <button onClick={() => setDeleting(r)} className={`${buttonClassName} text-gray-400 [@media(hover:hover)]:text-gray-300 hover:text-red-400 transition-colors`}>
        Delete
      </button>
    </div>
  );

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400">
        Offered on a personal report against the activities someone was advised to develop. Only resources attached to a recommended activity appear, so a person sees a short relevant list rather than a catalogue.
      </p>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {showAddForm ? (
        <div ref={addFormRef} className="bg-white rounded-xl border border-[#a3b8ff] px-4 py-3 scroll-mt-4">
          {addingFor && (
            <p className="text-[11px] text-gray-400 mb-2">
              New reading for <span className="font-medium text-gray-600">{addingFor.name}</span>, ticked below. Tick anything else it helps with too.
            </p>
          )}
          {feedPost && (
            <p className="text-[11px] text-gray-400 mb-2">
              From the blog{feedPost.categories.length > 0 ? ` · filed under ${feedPost.categories.join(", ")}` : ""}.
              The note is the post's teaser; say why it helps with the activities you pick.
            </p>
          )}
          <ResourceForm
            draft={draft} setDraft={setDraft} activities={activities}
            onSave={handleAdd}
            onCancel={() => { setShowAddForm(false); setDraft(EMPTY_RESOURCE); setFeedPost(null); setAddingFor(null); }}
            saving={saving} saveLabel="Add"
          />
        </div>
      ) : (
        <div className="flex items-center gap-5 flex-wrap">
          <button
            onClick={() => { setDraft(EMPTY_RESOURCE); setFeedPost(null); setShowAddForm(true); }}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#3366FF] transition-colors px-1 min-h-[44px] md:min-h-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add resource
          </button>
          {!showFeed && (
            <button
              onClick={() => setShowFeed(true)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#3366FF] transition-colors px-1 min-h-[44px] md:min-h-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
              New from the blog
            </button>
          )}
        </div>
      )}

      {showFeed && (
        <BlogFeedPanel
          resources={resources}
          onClose={() => setShowFeed(false)}
          onAdd={(post) => {
            setDraft({
              ...EMPTY_RESOURCE, title: post.title, url: post.url, note: post.description,
              published_date: post.published ? post.published.slice(0, 10) : "",
            });
            setFeedPost(post);
            setShowAddForm(true);
          }}
        />
      )}

      <div className="space-y-2">
        {resources.map(r => (
          <div key={r.id} data-resource-id={r.id} className={`bg-white rounded-xl border px-4 py-3 scroll-mt-4 ${r.active ? "border-gray-200" : "border-gray-100 opacity-60"} ${highlighted.has(r.id) ? FOCUS_RING : ""}`}>
            {editingId === r.id ? (
              <ResourceForm
                draft={draft} setDraft={setDraft} activities={activities}
                onSave={() => handleSaveEdit(r.id)}
                onCancel={() => { setEditingId(null); setDraft(EMPTY_RESOURCE); }}
                saving={saving} saveLabel="Save"
              />
            ) : (
              <div className="group relative">
                <div className="flex items-baseline gap-2 flex-wrap [@media(hover:hover)]:pr-36">
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                    {TYPE_LABEL[r.resource_type] || r.resource_type}
                  </span>
                  <span className={`text-sm font-medium ${r.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                    {r.title}
                  </span>
                  {r.source && <span className="text-xs text-gray-400">{r.source}</span>}
                  {r.published_date && <span className="text-xs text-gray-400">{formatPublished(r.published_date)}</span>}
                  {/* Pinned to the corner, with the title line padded to clear
                      them, rather than placed in the line: invisible, they
                      still took up room, and beside a long title they wrapped
                      onto a blank line of their own. */}
                  {rowActions(r, "absolute top-0 right-0 hidden [@media(hover:hover)]:flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity", "text-xs")}
                </div>
                {r.note && <p className="text-xs text-gray-500 mt-1">{r.note}</p>}
                {r.url && <p className="text-[11px] text-blue-600 mt-0.5 truncate font-mono">{r.url}</p>}
                <p className="text-[11px] text-gray-400 mt-1">
                  {(r.activity_ids || []).length === 0
                    ? r.fallback
                      // Not the dead end that message describes: a fallback with
                      // no activities still reaches a thin report.
                      ? "Not attached to any activity — offered only when a shortlist is thin"
                      : "Not attached to any activity — will never appear on a report"
                    : (r.activity_ids || []).map(activityName).filter(Boolean).join(" · ")}
                </p>
                {r.fallback && (
                  <p className="text-[11px] text-[#1a2e7a] mt-0.5">Also offered when a shortlist is thin</p>
                )}
                {/* A phone has no hover to reveal the actions above, so they sit
                    here instead, always shown and big enough to tap. */}
                {rowActions(r, "flex [@media(hover:hover)]:hidden -ml-3 -mb-2 mt-1", "text-sm h-11 px-3")}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleting}
        destructive
        title="Delete this resource?"
        message={`"${deleting?.title}" will no longer be offered on any report. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => handleDelete(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
