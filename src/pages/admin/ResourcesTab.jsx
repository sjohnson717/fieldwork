import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FACET_ORDER } from "@/lib/scoring";
import ConfirmDialog from "@/components/ConfirmDialog";
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
  { key: "quartz_book",   label: "Quartz book" },
  { key: "quartz_course", label: "Course or workshop" },
];

const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.key, t.label]));

const EMPTY = {
  title: "", resource_type: "free_article", source: "", url: "", note: "", activity_ids: [],
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

function ResourceForm({ draft, setDraft, activities, onSave, onCancel, saving, saveLabel }) {
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
      <div className="flex gap-3">
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
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
        />
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
          Offered for these activities ({draft.activity_ids.length} selected). A resource attached to nothing never appears on a report.
        </p>
        <ActivityPicker activities={activities} selectedIds={draft.activity_ids} onToggle={toggle} />
      </div>
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

export default function ResourcesTab() {
  const [resources, setResources] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [res, acts] = await Promise.all([
        base44.entities.Resource.list("sort_order"),
        base44.entities.Activity.filter({ active: true }, "sort_order")
          .then(all => all.filter(a => !a.assessment_id)),
      ]);
      setResources(res);
      setActivities(acts);
    } catch (e) { console.error(e); }
    setLoading(false);
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
      setResources(prev => [...prev, created]);
      setDraft(EMPTY);
      setShowAddForm(false);
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
      setDraft(EMPTY);
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

  const activityName = (id) => activities.find(a => a.id === id)?.name;

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

      <div className="space-y-2">
        {resources.map(r => (
          <div key={r.id} className={`bg-white rounded-xl border px-4 py-3 ${r.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
            {editingId === r.id ? (
              <ResourceForm
                draft={draft} setDraft={setDraft} activities={activities}
                onSave={() => handleSaveEdit(r.id)}
                onCancel={() => { setEditingId(null); setDraft(EMPTY); }}
                saving={saving} saveLabel="Save"
              />
            ) : (
              <div className="group">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                    {TYPE_LABEL[r.resource_type] || r.resource_type}
                  </span>
                  <span className={`text-sm font-medium ${r.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                    {r.title}
                  </span>
                  {r.source && <span className="text-xs text-gray-400">{r.source}</span>}
                  <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingId(r.id);
                        setDraft({
                          title: r.title || "", resource_type: r.resource_type || "free_article",
                          source: r.source || "", url: r.url || "", note: r.note || "",
                          activity_ids: r.activity_ids || [],
                        });
                      }}
                      className="text-xs text-gray-400 hover:text-[#3366FF] font-medium transition-colors"
                    >
                      Edit
                    </button>
                    <button onClick={() => handleToggleActive(r)} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                      {r.active ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => setDeleting(r)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
                {r.note && <p className="text-xs text-gray-500 mt-1">{r.note}</p>}
                {r.url && <p className="text-[11px] text-blue-600 mt-0.5 truncate font-mono">{r.url}</p>}
                <p className="text-[11px] text-gray-400 mt-1">
                  {(r.activity_ids || []).length === 0
                    ? "Not attached to any activity — will never appear on a report"
                    : (r.activity_ids || []).map(activityName).filter(Boolean).join(" · ")}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {showAddForm ? (
        <div className="bg-white rounded-xl border border-[#a3b8ff] px-4 py-3">
          <ResourceForm
            draft={draft} setDraft={setDraft} activities={activities}
            onSave={handleAdd}
            onCancel={() => { setShowAddForm(false); setDraft(EMPTY); }}
            saving={saving} saveLabel="Add"
          />
        </div>
      ) : (
        <button
          onClick={() => { setDraft(EMPTY); setShowAddForm(true); }}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#3366FF] transition-colors px-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add resource
        </button>
      )}

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
