import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

// ── Shared drag-to-reorder list ──────────────────────────────────────────────

function DraggableList({ items, onReorder, renderItem }) {
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) {
      setDragOverIndex(null);
      return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex.current, 1);
    reordered.splice(index, 0, moved);
    dragIndex.current = null;
    setDragOverIndex(null);
    onReorder(reordered);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div
          key={item.id}
          draggable
          onDragStart={e => handleDragStart(e, index)}
          onDragOver={e => handleDragOver(e, index)}
          onDrop={e => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={`transition-all ${
            dragOverIndex === index ? "opacity-50 scale-[0.98]" : ""
          }`}
        >
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}

// ── Activities tab ───────────────────────────────────────────────────────────

function ActivitiesTab() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", description: "", facet: "DEFINE", preferred_owner: "" });
  const [adding, setAdding] = useState(false);
  const [selectedFacet, setSelectedFacet] = useState("ALL");

  useEffect(() => { loadActivities(); }, []);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.Activity.list("sort_order");
      setActivities(all);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const persistOrder = async (reordered) => {
    setActivities(reordered);
    try {
      await Promise.all(
        reordered.map((a, i) => base44.entities.Activity.update(a.id, { sort_order: i }))
      );
    } catch (e) { console.error("Failed to save order", e); }
  };

  const handleEdit = (activity) => {
    setEditingId(activity.id);
    setEditDraft({
      name: activity.name,
      description: activity.description || "",
      facet: activity.facet,
      preferred_owner: activity.preferred_owner || "",
    });
  };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    try {
      const updated = await base44.entities.Activity.update(id, editDraft);
      setActivities(prev => prev.map(a => a.id === id ? updated : a));
      setEditingId(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleToggleActive = async (activity) => {
    try {
      const updated = await base44.entities.Activity.update(activity.id, { active: !activity.active });
      setActivities(prev => prev.map(a => a.id === activity.id ? updated : a));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this activity? This cannot be undone.")) return;
    try {
      await base44.entities.Activity.delete(id);
      setActivities(prev => prev.filter(a => a.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleAdd = async () => {
    if (!newItem.name.trim()) return;
    setAdding(true);
    try {
      const maxOrder = activities.length > 0 ? Math.max(...activities.map(a => a.sort_order ?? 0)) : -1;
      const created = await base44.entities.Activity.create({
        ...newItem,
        name: newItem.name.trim(),
        description: newItem.description.trim(),
        preferred_owner: newItem.preferred_owner.trim(),
        sort_order: maxOrder + 1,
        active: true,
      });
      setActivities(prev => [...prev, created]);
      setNewItem({ name: "", description: "", facet: "DEFINE", preferred_owner: "" });
      setShowAddForm(false);
    } catch (e) { console.error(e); }
    setAdding(false);
  };

  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));
  const filtered = selectedFacet === "ALL" ? activities : activities.filter(a => a.facet === selectedFacet);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Facet filter */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap w-fit">
        <button
          onClick={() => setSelectedFacet("ALL")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedFacet === "ALL" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          All
        </button>
        {availableFacets.map(f => (
          <button key={f} onClick={() => setSelectedFacet(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedFacet === f ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400">Drag rows to reorder. Order is shared across all assessments.</p>

      <DraggableList
        items={filtered}
        onReorder={(reordered) => {
          // Merge reordered filtered items back into full list preserving other facets
          if (selectedFacet === "ALL") {
            persistOrder(reordered);
          } else {
            const others = activities.filter(a => a.facet !== selectedFacet);
            // Rebuild full list: interleave by original position isn't trivial;
            // easier: replace the filtered items in-place in the full list
            const newFull = [...activities];
            let ri = 0;
            for (let i = 0; i < newFull.length; i++) {
              if (newFull[i].facet === selectedFacet) {
                newFull[i] = reordered[ri++];
              }
            }
            persistOrder(newFull);
          }
        }}
        renderItem={(activity) => (
          <div className={`bg-white rounded-xl border ${activity.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
            {editingId === activity.id ? (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <input
                      autoFocus
                      value={editDraft.name}
                      onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <input
                      value={editDraft.description}
                      onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Facet</label>
                    <select
                      value={editDraft.facet}
                      onChange={e => setEditDraft(d => ({ ...d, facet: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {FACET_ORDER.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Preferred owner</label>
                    <input
                      value={editDraft.preferred_owner}
                      onChange={e => setEditDraft(d => ({ ...d, preferred_owner: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleSaveEdit(activity.id)} disabled={saving || !editDraft.name.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 group">
                {/* Drag handle */}
                <div className="cursor-grab text-gray-200 hover:text-gray-400 shrink-0 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                    <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${activity.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                      {activity.name}
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
                      {activity.facet}
                    </span>
                  </div>
                  {activity.description && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{activity.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => handleEdit(activity)}
                    className="text-xs text-gray-400 hover:text-indigo-600 font-medium transition-colors">
                    Edit
                  </button>
                  <button onClick={() => handleToggleActive(activity)}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                    {activity.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => handleDelete(activity.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      />

      {/* Add form */}
      {showAddForm ? (
        <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">New activity</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input
                autoFocus
                placeholder="Activity name"
                value={newItem.name}
                onChange={e => setNewItem(d => ({ ...d, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="col-span-2">
              <input
                placeholder="Description (optional)"
                value={newItem.description}
                onChange={e => setNewItem(d => ({ ...d, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <select
                value={newItem.facet}
                onChange={e => setNewItem(d => ({ ...d, facet: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {FACET_ORDER.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <input
                placeholder="Preferred owner (optional)"
                value={newItem.preferred_owner}
                onChange={e => setNewItem(d => ({ ...d, preferred_owner: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding || !newItem.name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
              {adding ? "Adding…" : "Add activity"}
            </button>
            <button onClick={() => { setShowAddForm(false); setNewItem({ name: "", description: "", facet: "DEFINE", preferred_owner: "" }); }}
              className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-indigo-600 transition-colors px-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add activity
        </button>
      )}
    </div>
  );
}

// ── Job Titles tab ───────────────────────────────────────────────────────────

function JobTitlesTab() {
  const [titles, setTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { loadTitles(); }, []);

  const loadTitles = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.JobTitle.list("sort_order");
      setTitles(all);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const persistOrder = async (reordered) => {
    setTitles(reordered);
    try {
      await Promise.all(
        reordered.map((t, i) => base44.entities.JobTitle.update(t.id, { sort_order: i }))
      );
    } catch (e) { console.error("Failed to save order", e); }
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updated = await base44.entities.JobTitle.update(id, { name: editName.trim() });
      setTitles(prev => prev.map(t => t.id === id ? updated : t));
      setEditingId(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleToggleActive = async (title) => {
    try {
      const updated = await base44.entities.JobTitle.update(title.id, { active: !title.active });
      setTitles(prev => prev.map(t => t.id === title.id ? updated : t));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this job title? This cannot be undone.")) return;
    try {
      await base44.entities.JobTitle.delete(id);
      setTitles(prev => prev.filter(t => t.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const maxOrder = titles.length > 0 ? Math.max(...titles.map(t => t.sort_order ?? 0)) : -1;
      const created = await base44.entities.JobTitle.create({
        name: newName.trim(),
        sort_order: maxOrder + 1,
        active: true,
      });
      setTitles(prev => [...prev, created]);
      setNewName("");
      setShowAddForm(false);
    } catch (e) { console.error(e); }
    setAdding(false);
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400">
        {titles.filter(t => t.active).length} active titles · drag to reorder · disabled titles won't appear in assessments
      </p>

      <DraggableList
        items={titles}
        onReorder={persistOrder}
        renderItem={(title) => (
          <div className={`bg-white rounded-xl border ${title.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
            {editingId === title.id ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(title.id); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={() => handleSaveEdit(title.id)} disabled={saving || !editName.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                  {saving ? "…" : "Save"}
                </button>
                <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 group">
                <div className="cursor-grab text-gray-200 hover:text-gray-400 shrink-0 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                    <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                  </svg>
                </div>
                <span className={`flex-1 text-sm ${title.active ? "text-gray-800 font-medium" : "text-gray-400 line-through"}`}>
                  {title.name}
                </span>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => { setEditingId(title.id); setEditName(title.name); }}
                    className="text-xs text-gray-400 hover:text-indigo-600 font-medium transition-colors">
                    Edit
                  </button>
                  <button onClick={() => handleToggleActive(title)}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                    {title.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => handleDelete(title.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      />

      {showAddForm ? (
        <div className="flex items-center gap-3 bg-white rounded-xl border border-indigo-200 px-4 py-3">
          <input
            autoFocus
            placeholder="Job title name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAddForm(false); setNewName(""); } }}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={handleAdd} disabled={adding || !newName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
            {adding ? "Adding…" : "Add"}
          </button>
          <button onClick={() => { setShowAddForm(false); setNewName(""); }}
            className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-indigo-600 transition-colors px-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add job title
        </button>
      )}
    </div>
  );
}

// ── Main LibraryPage ─────────────────────────────────────────────────────────

const TABS = ["Activities", "Job Titles"];

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState("Activities");

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900">Library</h2>
          <p className="text-sm text-gray-400">Manage the master list of activities and job titles used across all assessments.</p>
        </div>
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        {activeTab === "Activities" && <ActivitiesTab />}
        {activeTab === "Job Titles" && <JobTitlesTab />}
      </div>
    </div>
  );
}
