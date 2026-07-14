import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AssessmentActivities from "./AssessmentActivities";

export default function AssessmentSetup({ assessment, onUpdate }) {
  const [newRole, setNewRole] = useState("");
  const [savingRoles, setSavingRoles] = useState(false);
  const [masterTitles, setMasterTitles] = useState([]);
  const [roles, setRoles] = useState(assessment.roles || []);

  useEffect(() => {
    loadMasterTitles();
  }, [assessment.id]);

  useEffect(() => {
    setRoles(assessment.roles || []);
  }, [assessment.id]);

  const loadMasterTitles = async () => {
    try {
      const all = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
      setMasterTitles(all);
    } catch (e) { console.error("Failed to load job titles", e); }
  };

  const saveRoles = async (updated) => {
    setRoles(updated);
    setSavingRoles(true);
    try {
      const saved = await base44.entities.Assessment.update(assessment.id, { roles: updated });
      onUpdate(saved);
    } catch (e) {
      console.error("Failed to save roles", e);
      setRoles(roles);
    }
    setSavingRoles(false);
  };

  const handleToggleRole = (name) => {
    const updated = roles.includes(name)
      ? roles.filter(r => r !== name)
      : [...roles, name];
    saveRoles(updated);
  };

  const handleSelectAllRoles = () => {
    const allNames = masterTitles.map(t => t.name);
    const allSelected = allNames.every(n => roles.includes(n));
    saveRoles(allSelected ? [] : allNames);
  };

  const handleAddCustomRole = () => {
    const name = newRole.trim();
    if (!name || roles.includes(name)) return;
    setNewRole("");
    saveRoles([...roles, name]);
  };

  const handleRemoveCustomRole = (name) => {
    saveRoles(roles.filter(r => r !== name));
  };

  return (
    <div className="p-8 max-w-3xl space-y-8">

      {/* Ownership Roles */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Ownership roles</h3>
          {savingRoles && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
        <p className="text-xs text-gray-400 mb-4">Add or remove roles to match your client's team structure. Preferred roles from activity presets will be added automatically.</p>
        {masterTitles.length === 0 ? (
          <p className="text-sm text-gray-400 italic mb-3">
            No job titles in the library yet. Add some under Settings → Library.
          </p>
        ) : (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{roles.length} selected</span>
              <button
                onClick={handleSelectAllRoles}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {masterTitles.every(t => roles.includes(t.name)) ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
              {masterTitles.map(t => (
                <label key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={roles.includes(t.name)}
                    onChange={() => handleToggleRole(t.name)}
                    className="w-4 h-4 rounded border-gray-300 text-[#3366FF] focus:ring-[#3366FF]"
                  />
                  <span className="text-sm text-gray-700">{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Custom roles not in master list */}
        {roles.filter(r => !masterTitles.some(m => m.name === r)).length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Custom (assessment-specific)</p>
            <div className="flex flex-wrap gap-2">
              {roles
                .filter(r => !masterTitles.some(m => m.name === r))
                .map(r => (
                  <span key={r} className="flex items-center gap-1.5 bg-amber-50 text-amber-800 text-sm font-medium px-3 py-1 rounded-full border border-amber-200">
                    {r}
                    <button onClick={() => handleRemoveCustomRole(r)} className="text-amber-400 hover:text-amber-700 ml-0.5">×</button>
                  </span>
                ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            placeholder="Add a custom role…"
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddCustomRole()}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 max-w-xs"
          />
          <button
            onClick={handleAddCustomRole}
            disabled={savingRoles || !newRole.trim()}
            className="text-sm font-medium text-[#3366FF] hover:text-[#2952CC] disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
      </section>

      {/* Activities */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Activities</h3>
          <p className="text-xs text-gray-400 mt-0.5">Choose which activities respondents will rate, or add custom ones for this assessment.</p>
        </div>
        <AssessmentActivities assessment={assessment} onUpdate={onUpdate} />
      </section>

    </div>
  );
}
