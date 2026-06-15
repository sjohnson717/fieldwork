import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AssessmentActivities from "./AssessmentActivities";

const STATUS_TRANSITIONS = {
  draft: ["active"],
  active: ["closed"],
  closed: ["active"],
};

const STATUS_LABELS = {
  draft: { active: "Open for responses" },
  active: { closed: "Close assessment" },
  closed: { active: "Reopen assessment" },
};

export default function AssessmentOverview({ assessment, onUpdate }) {
  const [respondents, setRespondents] = useState([]);
  const [responseCountMap, setResponseCountMap] = useState({}); // respondentId -> count
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(null); // 'report' | 'team'
  const [newRole, setNewRole] = useState("");
  const [savingRoles, setSavingRoles] = useState(false);
  const [masterTitles, setMasterTitles] = useState([]);
  const [roles, setRoles] = useState(assessment.roles || []);
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(assessment.title);
  const [companyDraft, setCompanyDraft] = useState(assessment.company_name || "");
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    loadRespondents();
    loadMasterTitles();
  }, [assessment.id]);

  useEffect(() => {
    setRoles(assessment.roles || []);
    setTitleDraft(assessment.title);
    setCompanyDraft(assessment.company_name || "");
  }, [assessment.id]);

  const loadRespondents = async () => {
    setLoading(true);
    try {
      const [all, allResponses] = await Promise.all([
        base44.entities.Respondent.filter({ assessment_id: assessment.id }),
        base44.entities.Response.filter({ assessment_id: assessment.id }),
      ]);
      setRespondents(all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      const counts = {};
      for (const r of allResponses) {
        counts[r.respondent_id] = (counts[r.respondent_id] || 0) + 1;
      }
      setResponseCountMap(counts);
    } catch (e) {
      console.error("Failed to load respondents", e);
    }
    setLoading(false);
  };

  const loadMasterTitles = async () => {
    try {
      const all = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
      setMasterTitles(all);
    } catch (e) { console.error("Failed to load job titles", e); }
  };

  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const updated = await base44.entities.Assessment.update(assessment.id, { status: newStatus });
      onUpdate(updated);
    } catch (e) {
      console.error("Failed to update status", e);
    }
    setUpdatingStatus(false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(assessment.access_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/assess?code=${assessment.access_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const handleSaveTitle = async () => {
    if (!titleDraft.trim()) return;
    setSavingTitle(true);
    try {
      const saved = await base44.entities.Assessment.update(assessment.id, {
        title: titleDraft.trim(),
        company_name: companyDraft.trim(),
      });
      onUpdate(saved);
      setEditingTitle(false);
    } catch (e) {
      console.error("Failed to save title", e);
    }
    setSavingTitle(false);
  };

  const handleDeleteRespondent = async (id) => {
    if (!confirm("Remove this respondent and their responses?")) return;
    try {
      // delete their responses first
      const resps = await base44.entities.Response.filter({ respondent_id: id });
      for (const r of resps) {
        await base44.entities.Response.delete(r.id);
      }
      await base44.entities.Respondent.delete(id);
      setRespondents(prev => prev.filter(r => r.id !== id));
      setResponseCountMap(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e) {
      console.error("Failed to delete respondent", e);
    }
  };

  const nextStatuses = STATUS_TRANSITIONS[assessment.status] || [];
  const completedCount = respondents.filter(r => r.status === "completed").length;

  return (
    <div className="p-8 max-w-3xl space-y-8">

      {/* Assessment details */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Details</h3>
          {!editingTitle && (
            <button
              onClick={() => setEditingTitle(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Edit
            </button>
          )}
        </div>
        {editingTitle ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
              <input
                autoFocus
                type="text"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
              <input
                type="text"
                value={companyDraft}
                onChange={e => setCompanyDraft(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveTitle}
                disabled={savingTitle || !titleDraft.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                {savingTitle ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingTitle(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-900">{assessment.title}</p>
            {assessment.company_name && <p className="text-sm text-gray-500">{assessment.company_name}</p>}
          </div>
        )}
      </section>

      {/* Access */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Access</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
            <span className="text-lg font-mono font-bold tracking-widest text-gray-800">{assessment.access_code}</span>
          </div>
          <button
            onClick={handleCopyCode}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
          >
            {copied ? "Copied!" : "Copy code"}
          </button>
          <button
            onClick={handleCopyLink}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Copy link
          </button>
        </div>
      </section>

      {/* Status */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Status</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-sm text-gray-600">
            Currently <span className="font-semibold text-gray-900">{assessment.status}</span>
          </div>
          {nextStatuses.map(s => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={updatingStatus}
              className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                s === "closed"
                  ? "border-red-200 text-red-600 hover:bg-red-50"
                  : "border-green-200 text-green-700 hover:bg-green-50"
              }`}
            >
              {updatingStatus ? "Updating…" : STATUS_LABELS[assessment.status]?.[s] || s}
            </button>
          ))}
        </div>
      </section>

      {/* Links */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Links to share</h3>
        <p className="text-xs text-gray-400 mb-4">Copy or open links to the team leader pages.</p>
        <div className="space-y-3">
          {/* Status link */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-700 font-medium w-56 shrink-0">STATUS Dashboard</span>
            {assessment.team_token ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/team/${assessment.team_token}`);
                    setCopiedLink('team');
                    setTimeout(() => setCopiedLink(null), 2000);
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  {copiedLink === 'team' ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => window.open(`${window.location.origin}/team/${assessment.team_token}`, '_blank')}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Open
                </button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
                  const updated = await base44.entities.Assessment.update(assessment.id, { team_token: token });
                  onUpdate(updated);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Generate
              </button>
            )}
          </div>
          {/* Report link */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-700 font-medium w-56 shrink-0">REPORT and action plan</span>
            {assessment.buyer_token ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/report/${assessment.buyer_token}`);
                    setCopiedLink('report');
                    setTimeout(() => setCopiedLink(null), 2000);
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  {copiedLink === 'report' ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => window.open(`${window.location.origin}/report/${assessment.buyer_token}`, '_blank')}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Open
                </button>
              </div>
            ) : (
              <span className="text-sm text-gray-400 italic">Not available</span>
            )}
          </div>
        </div>
      </section>

      {/* Ownership Roles */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Ownership roles</h3>
          {savingRoles && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
        <p className="text-xs text-gray-400 mb-4">Roles are pre-selected when you apply an activity preset. Add or remove roles to match your client's team structure.</p>

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
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-blue-500"
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
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors"
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

      {/* Respondents */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Respondents</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {respondents.length} total · {completedCount} completed · {respondents.filter(r => !responseCountMap[r.id]).length} empty
            </p>
          </div>
          <button
            onClick={loadRespondents}
            className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : respondents.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No responses yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Name</th>
                <th className="text-left pb-2 font-medium">Title</th>
                <th className="text-left pb-2 font-medium">Status</th>
                <th className="text-left pb-2 font-medium">Responses</th>
                <th className="text-left pb-2 font-medium">Date</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {respondents.map(r => {
                const count = responseCountMap[r.id] || 0;
                const isEmpty = count === 0;
                return (
                <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${isEmpty ? "bg-red-50/40" : ""}`}>
                  <td className="py-2.5 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2.5 text-gray-500">{r.title}</td>
                  <td className="py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className={`text-xs font-semibold ${isEmpty ? "text-red-400" : "text-gray-500"}`}>
                      {isEmpty ? "0 — empty" : count}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400 text-xs">
                    {new Date(r.created_date).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => handleDeleteRespondent(r.id)}
                      className={`text-xs transition-colors ${isEmpty ? "text-red-300 hover:text-red-500 font-medium" : "text-gray-300 hover:text-red-400"}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}