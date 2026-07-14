import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FACET_ORDER } from "@/lib/scoring";
import DraggableList from "@/components/DraggableList";

// ── Activity checklist inside an expanded set ─────────────────────────────────

function ActivityChecklist({ set, activities, onToggle }) {
  const selectedIds = new Set(set.activity_ids || []);

  const byFacet = FACET_ORDER.map(facet => ({
    facet,
    items: activities.filter(a => a.facet === facet),
  })).filter(f => f.items.length > 0);

  const handleFacetSelectAll = async (facetItems, selectAll) => {
    let ids = new Set(selectedIds);
    facetItems.forEach(a => selectAll ? ids.add(a.id) : ids.delete(a.id));
    await onToggle([...ids]);
  };

  const handleToggleOne = async (activityId) => {
    let ids = new Set(selectedIds);
    ids.has(activityId) ? ids.delete(activityId) : ids.add(activityId);
    await onToggle([...ids]);
  };

  const handleSelectAll = async () => {
    await onToggle(activities.map(a => a.id));
  };

  const handleDeselectAll = async () => {
    await onToggle([]);
  };

  return (
    <div className="px-4 pb-4 space-y-4">
      {/* Global controls */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={handleSelectAll}
          className="text-xs text-[#3366FF] hover:text-[#2952CC] font-medium transition-colors"
        >
          Select all
        </button>
        <span className="text-gray-200">·</span>
        <button
          onClick={handleDeselectAll}
          className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
        >
          Deselect all
        </button>
      </div>

      {byFacet.map(({ facet, items }) => {
        const allSelected = items.every(a => selectedIds.has(a.id));
        const noneSelected = items.every(a => !selectedIds.has(a.id));
        return (
          <div key={facet}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#4d80ff]">{facet}</span>
              <button
                onClick={() => handleFacetSelectAll(items, !allSelected)}
                className="text-[10px] text-gray-400 hover:text-[#3366FF] font-medium transition-colors"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="space-y-1">
              {items.map(activity => (
                <label key={activity.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(activity.id)}
                    onChange={() => handleToggleOne(activity.id)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#3366FF] focus:ring-[#3366FF] cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                    {activity.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ActivitySetsTab ───────────────────────────────────────────────────────────

export default function ActivitySetsTab() {
  const [sets, setSets] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allSets, allActivities] = await Promise.all([
        base44.entities.ActivitySet.list("sort_order"),
        base44.entities.Activity.filter({ active: true }, "sort_order").then(all => all.filter(a => !a.assessment_id)),
      ]);
      setSets(allSets);
      setActivities(allActivities);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const persistOrder = async (reordered) => {
    setSets(reordered);
    try {
      await Promise.all(
        reordered.map((s, i) => base44.entities.ActivitySet.update(s.id, { sort_order: i }))
      );
    } catch (e) { console.error("Failed to save order", e); }
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updated = await base44.entities.ActivitySet.update(id, { name: editName.trim() });
      setSets(prev => prev.map(s => s.id === id ? updated : s));
      setEditingId(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleToggleActive = async (set) => {
    try {
      const updated = await base44.entities.ActivitySet.update(set.id, { active: !set.active });
      setSets(prev => prev.map(s => s.id === set.id ? updated : s));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this activity set? This cannot be undone.")) return;
    try {
      await base44.entities.ActivitySet.delete(id);
      setSets(prev => prev.filter(s => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) { console.error(e); }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const maxOrder = sets.length > 0 ? Math.max(...sets.map(s => s.sort_order ?? 0)) : -1;
      const created = await base44.entities.ActivitySet.create({
        name: newName.trim(),
        activity_ids: [],
        sort_order: maxOrder + 1,
        active: true,
      });
      setSets(prev => [...prev, created]);
      setNewName("");
      setShowAddForm(false);
    } catch (e) { console.error(e); }
    setAdding(false);
  };

  const handleActivityToggle = async (setId, newIds) => {
    try {
      const updated = await base44.entities.ActivitySet.update(setId, { activity_ids: newIds });
      setSets(prev => prev.map(s => s.id === setId ? updated : s));
    } catch (e) { console.error(e); }
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400">
        {sets.filter(s => s.active).length} active sets · drag to reorder · click a set to manage its activities
      </p>

      <DraggableList
        items={sets}
        onReorder={persistOrder}
        renderItem={(set) => {
          const selectedCount = (set.activity_ids || []).length;
          const isExpanded = expandedId === set.id;

          return (
            <div className={`bg-white rounded-xl border ${set.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
              {editingId === set.id ? (
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(set.id); if (e.key === "Escape") setEditingId(null); }}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                  />
                  <button
                    onClick={() => handleSaveEdit(set.id)}
                    disabled={saving || !editName.trim()}
                    className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {saving ? "…" : "Save"}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 group">
                    {/* Drag handle */}
                    <div className="cursor-grab text-gray-200 hover:text-gray-400 shrink-0 transition-colors">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                      </svg>
                    </div>

                    {/* Name + count — click to expand */}
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => setExpandedId(isExpanded ? null : set.id)}
                    >
                      <span className={`text-sm font-medium ${set.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                        {set.name}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">
                        {selectedCount} of {activities.length} activities
                      </span>
                    </button>

                    {/* Expand chevron + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(set.id); setEditName(set.name); }}
                          className="text-xs text-gray-400 hover:text-[#3366FF] font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(set)}
                          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          {set.active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDelete(set.id)}
                          className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        onClick={() => setExpandedId(isExpanded ? null : set.id)}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-50">
                      <ActivityChecklist
                        set={set}
                        activities={activities}
                        onToggle={(newIds) => handleActivityToggle(set.id, newIds)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        }}
      />

      {/* Add form */}
      {showAddForm ? (
        <div className="flex items-center gap-3 bg-white rounded-xl border border-[#a3b8ff] px-4 py-3">
          <input
            autoFocus
            placeholder="Activity set name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAddForm(false); setNewName(""); } }}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {adding ? "Adding…" : "Add"}
          </button>
          <button onClick={() => { setShowAddForm(false); setNewName(""); }} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#3366FF] transition-colors px-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add activity set
        </button>
      )}
    </div>
  );
}