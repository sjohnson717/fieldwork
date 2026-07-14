import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

// ── OwnerTypeahead (same pattern as LibraryPage) ──────────────────────────────

function OwnerTypeahead({ value, onChange, jobTitleNames }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const suggestions = value.trim()
    ? [...jobTitleNames].filter(t => t.toLowerCase().includes(value.toLowerCase()))
    : [...jobTitleNames];

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Optional"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map(title => (
            <li key={title}>
              <button
                type="button"
                onMouseDown={() => { onChange(title); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#eef2ff] hover:text-[#2952CC] transition-colors ${value === title ? "bg-[#eef2ff] text-[#2952CC] font-medium" : "text-gray-700"}`}
              >
                {title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Facet-grouped display helpers ─────────────────────────────────────────────

function FacetGroup({ facet, children }) {
  return (
    <div>
      <div className="mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#4d80ff]">{facet}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AssessmentActivities({ assessment, onUpdate }) {
  const [activitySets, setActivitySets] = useState([]);
  const [libraryActivities, setLibraryActivities] = useState([]); // no assessment_id
  const [customActivities, setCustomActivities] = useState([]); // assessment_id = this assessment
  const [jobTitleNames, setJobTitleNames] = useState(new Set());
  const [loading, setLoading] = useState(true);

  // local copy of activity_ids so we can update optimistically
  const [activityIds, setActivityIds] = useState(assessment.activity_ids || []);

  // custom activity editing
  const [editingCustomId, setEditingCustomId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [savingCustom, setSavingCustom] = useState(false);

  // add custom form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", description: "", facet: "DEFINE", preferred_owner: "" });
  const [adding, setAdding] = useState(false);
  const [customError, setCustomError] = useState("");

  useEffect(() => {
    setActivityIds(assessment.activity_ids || []);
  }, [assessment.id]);

  useEffect(() => {
    loadData();
  }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sets, allActive, titles] = await Promise.all([
        base44.entities.ActivitySet.filter({ active: true }, "sort_order"),
        base44.entities.Activity.filter({ active: true }, "sort_order"),
        base44.entities.JobTitle.filter({ active: true }, "sort_order"),
      ]);
      setActivitySets(sets);
      setLibraryActivities(allActive.filter(a => !a.assessment_id));
      setCustomActivities(allActive.filter(a => a.assessment_id === assessment.id));
      setJobTitleNames(new Set(titles.map(t => t.name)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ── Persist activity_ids ────────────────────────────────────────────────────

  const saveActivityIds = async (newIds) => {
    setActivityIds(newIds);
    try {
      const updated = await base44.entities.Assessment.update(assessment.id, { activity_ids: newIds });
      onUpdate(updated);
    } catch (e) {
      console.error(e);
      setActivityIds(activityIds); // revert
    }
  };

  // ── Preset (ActivitySet) ────────────────────────────────────────────────────

  const handleApplyPreset = async (set) => {
    if (activityIds.length > 0) {
      if (!confirm(`Replace current selection (${activityIds.length} activities) with the "${set.name}" preset?`)) return;
    }
    const newIds = set.activity_ids || [];

    // Derive preferred_owner values from the preset's activities
    const presetActivities = libraryActivities.filter(a => newIds.includes(a.id));
    const derivedRoles = [
      ...new Set(
        presetActivities
          .map(a => a.preferred_owner)
          .filter(o => o && jobTitleNames.has(o))
      ),
    ];

    // Merge with existing roles, preserving any the admin already added
    const existingRoles = assessment.roles || [];
    const mergedRoles = [...new Set([...derivedRoles, ...existingRoles])];

    setActivityIds(newIds);
    try {
      const updated = await base44.entities.Assessment.update(assessment.id, {
        activity_ids: newIds,
        roles: mergedRoles,
      });
      onUpdate(updated);
    } catch (e) {
      console.error(e);
      setActivityIds(activityIds); // revert
    }
  };

  // ── Library checklist ───────────────────────────────────────────────────────

  const selectedSet = new Set(activityIds);

  const handleToggleLibrary = (id) => {
    const next = new Set(selectedSet);
    next.has(id) ? next.delete(id) : next.add(id);
    saveActivityIds([...next]);
  };

  const handleFacetSelect = (facetItems, selectAll) => {
    const next = new Set(selectedSet);
    facetItems.forEach(a => selectAll ? next.add(a.id) : next.delete(a.id));
    saveActivityIds([...next]);
  };

  const handleSelectAll = () => saveActivityIds(libraryActivities.map(a => a.id));
  const handleDeselectAll = () => saveActivityIds([]);

  // ── Custom activities ────────────────────────────────────────────────────────

  const handleSaveCustomEdit = async (id) => {
    setSavingCustom(true);
    setCustomError("");
    try {
      const updated = await base44.entities.Activity.update(id, editDraft);
      setCustomActivities(prev => prev.map(a => a.id === id ? updated : a));
      setEditingCustomId(null);
    } catch (e) {
      console.error(e);
      setCustomError(e?.message || "Failed to save changes. Please try again.");
    }
    setSavingCustom(false);
  };

  const handleDeleteCustom = async (id) => {
    if (!confirm("Delete this custom activity? This cannot be undone.")) return;
    setCustomError("");
    try {
      await base44.entities.Activity.delete(id);
      setCustomActivities(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error(e);
      setCustomError(e?.message || "Failed to delete activity. Please try again.");
    }
  };

  const handleAddCustom = async () => {
    if (!newItem.name.trim()) return;
    setAdding(true);
    setCustomError("");
    try {
      const created = await base44.entities.Activity.create({
        ...newItem,
        name: newItem.name.trim(),
        description: newItem.description.trim(),
        preferred_owner: newItem.preferred_owner.trim(),
        assessment_id: assessment.id,
        active: true,
      });
      setCustomActivities(prev => [...prev, created]);
      setNewItem({ name: "", description: "", facet: "DEFINE", preferred_owner: "" });
      setShowAddForm(false);
    } catch (e) {
      console.error(e);
      setCustomError(e?.message || "Failed to add activity. Please try again.");
    }
    setAdding(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
    </div>
  );

  const byFacetLibrary = FACET_ORDER.map(f => ({
    facet: f,
    items: libraryActivities.filter(a => a.facet === f),
  })).filter(f => f.items.length > 0);

  const byFacetCustom = FACET_ORDER.map(f => ({
    facet: f,
    items: customActivities.filter(a => a.facet === f),
  })).filter(f => f.items.length > 0);

  return (
    <div className="space-y-6">

      {/* ── Presets ── */}
      {activitySets.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Apply a preset</p>
          <div className="flex flex-wrap gap-2">
            {activitySets.map(set => (
              <button
                key={set.id}
                onClick={() => handleApplyPreset(set)}
                className="text-sm font-medium px-3 py-1.5 rounded-lg border border-[#a3b8ff] text-[#3366FF] hover:bg-[#eef2ff] transition-colors"
              >
                {set.name}
                <span className="ml-1.5 text-xs text-[#4d80ff]">({(set.activity_ids || []).length})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Library checklist ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500">
            Library activities
            <span className="ml-2 font-semibold text-gray-700">
              {activityIds.length} of {libraryActivities.length} selected
            </span>
            {customActivities.length > 0 && (
              <span className="ml-3 text-gray-500">· Custom activities: <span className="font-semibold text-gray-700">{customActivities.length}</span></span>
            )}
          </p>
          <div className="flex gap-3">
            <button onClick={handleSelectAll} className="text-xs text-[#3366FF] hover:text-[#2952CC] font-medium transition-colors">
              Select all
            </button>
            <span className="text-gray-200">·</span>
            <button onClick={handleDeselectAll} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">
              Deselect all
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {byFacetLibrary.map(({ facet, items }) => {
            const allSelected = items.every(a => selectedSet.has(a.id));
            return (
              <FacetGroup key={facet} facet={facet}>
                <div className="flex items-center justify-between mb-1">
                  <span />
                  <button
                    onClick={() => handleFacetSelect(items, !allSelected)}
                    className="text-[10px] text-gray-400 hover:text-[#3366FF] font-medium transition-colors"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {items.map(activity => (
                  <label key={activity.id} className="flex items-center gap-2.5 cursor-pointer group px-1">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(activity.id)}
                      onChange={() => handleToggleLibrary(activity.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#3366FF] focus:ring-[#3366FF] cursor-pointer"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                      {activity.name}
                    </span>
                  </label>
                ))}
              </FacetGroup>
            );
          })}
        </div>
      </div>

      {/* ── Custom activities ── */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">
          Custom activities
          {customActivities.length > 0 && (
            <span className="ml-1 text-gray-400">(always included in this assessment)</span>
          )}
        </p>

        {customError && (
          <p className="text-xs text-red-500 mb-3">{customError}</p>
        )}

        {customActivities.length === 0 && !showAddForm && (
          <p className="text-xs text-gray-400 italic mb-3">No custom activities yet.</p>
        )}

        {byFacetCustom.length > 0 && (
          <div className="space-y-4 mb-4">
            {byFacetCustom.map(({ facet, items }) => (
              <FacetGroup key={facet} facet={facet}>
                {items.map(activity => (
                  <div key={activity.id}>
                    {editingCustomId === activity.id ? (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <input
                              autoFocus
                              value={editDraft.name}
                              onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                              placeholder="Name"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              value={editDraft.description}
                              onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                              placeholder="Description (optional)"
                            />
                          </div>
                          <div>
                            <select
                              value={editDraft.facet}
                              onChange={e => setEditDraft(d => ({ ...d, facet: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                            >
                              {FACET_ORDER.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <OwnerTypeahead
                              value={editDraft.preferred_owner}
                              onChange={val => setEditDraft(d => ({ ...d, preferred_owner: val }))}
                              jobTitleNames={jobTitleNames}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveCustomEdit(activity.id)}
                            disabled={savingCustom || !editDraft.name?.trim()}
                            className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {savingCustom ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEditingCustomId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-1 py-1.5 group">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-700">{activity.name}</span>
                          {activity.description && (
                            <span className="text-xs text-gray-400 ml-2">{activity.description}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => {
                              setEditingCustomId(activity.id);
                              setEditDraft({
                                name: activity.name,
                                description: activity.description || "",
                                facet: activity.facet,
                                preferred_owner: activity.preferred_owner || "",
                              });
                            }}
                            className="text-xs text-gray-400 hover:text-[#3366FF] font-medium transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCustom(activity.id)}
                            className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </FacetGroup>
            ))}
          </div>
        )}

        {/* Add custom form */}
        {showAddForm ? (
          <div className="bg-gray-50 rounded-lg border border-[#a3b8ff] p-4 space-y-3">
            <p className="text-xs font-medium text-gray-600">New custom activity</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <input
                  autoFocus
                  placeholder="Activity name"
                  value={newItem.name}
                  onChange={e => setNewItem(d => ({ ...d, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                />
              </div>
              <div className="col-span-2">
                <input
                  placeholder="Description (optional)"
                  value={newItem.description}
                  onChange={e => setNewItem(d => ({ ...d, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                />
              </div>
              <div>
                <select
                  value={newItem.facet}
                  onChange={e => setNewItem(d => ({ ...d, facet: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                >
                  {FACET_ORDER.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <OwnerTypeahead
                  value={newItem.preferred_owner}
                  onChange={val => setNewItem(d => ({ ...d, preferred_owner: val }))}
                  jobTitleNames={jobTitleNames}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddCustom}
                disabled={adding || !newItem.name.trim()}
                className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                {adding ? "Adding…" : "Add activity"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewItem({ name: "", description: "", facet: "DEFINE", preferred_owner: "" }); }}
                className="text-sm text-gray-400 hover:text-gray-600 px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#3366FF] transition-colors px-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add custom activity
          </button>
        )}
      </div>
    </div>
  );
}