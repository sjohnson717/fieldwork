import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AssessmentDemoData from "./AssessmentDemoData";

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

export default function AssessmentOverview({ assessment, onUpdate, onDelete, deleting }) {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [selectedNewCollaborator, setSelectedNewCollaborator] = useState("");
  const [savingCollaborators, setSavingCollaborators] = useState(false);
  const [collaboratorError, setCollaboratorError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(null); // 'report' | 'team'
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(assessment.title);
  const [companyDraft, setCompanyDraft] = useState(assessment.company_name || "");
  const [taglineDraft, setTaglineDraft] = useState(assessment.tagline || "");
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setUsersError("");
    try {
      // The built-in User entity ignores custom RLS for list operations, so
      // this goes through a backend function using the service role instead
      // of base44.entities.User.list() directly.
      const res = await base44.functions.invoke("listUsers", {});
      setAllUsers(res?.data?.users || []);
    } catch (e) {
      console.error("Failed to load users", e);
      setUsersError(e?.response?.data?.error || e?.message || "Failed to load facilitators/admins.");
    }
    setLoadingUsers(false);
  };

  useEffect(() => {
    setTitleDraft(assessment.title);
    setCompanyDraft(assessment.company_name || "");
    setTaglineDraft(assessment.tagline || "");
  }, [assessment.id]);

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

  const handleSaveTitle = async () => {
    if (!titleDraft.trim()) return;
    setSavingTitle(true);
    try {
      const saved = await base44.entities.Assessment.update(assessment.id, {
        title: titleDraft.trim(),
        company_name: companyDraft.trim(),
        tagline: taglineDraft.trim(),
      });
      onUpdate(saved);
      setEditingTitle(false);
    } catch (e) {
      console.error("Failed to save title", e);
    }
    setSavingTitle(false);
  };

  const collaboratorIds = assessment.collaborator_ids || [];
  const owner = allUsers.find(u => u.id === assessment.created_by_id);
  const currentCollaborators = allUsers.filter(u => collaboratorIds.includes(u.id));
  const availableToAdd = allUsers.filter(u =>
    u.id !== currentUser?.id &&
    u.id !== assessment.created_by_id &&
    !collaboratorIds.includes(u.id)
  );

  const handleAddCollaborator = async () => {
    if (!selectedNewCollaborator) return;
    setSavingCollaborators(true);
    setCollaboratorError("");
    try {
      const updated = await base44.entities.Assessment.update(assessment.id, {
        collaborator_ids: [...collaboratorIds, selectedNewCollaborator],
      });
      onUpdate(updated);
      setSelectedNewCollaborator("");
    } catch (e) {
      console.error("Failed to add collaborator", e);
      setCollaboratorError(e?.message || "Failed to add collaborator. Please try again.");
    }
    setSavingCollaborators(false);
  };

  const handleRemoveCollaborator = async (userId) => {
    setSavingCollaborators(true);
    setCollaboratorError("");
    try {
      const updated = await base44.entities.Assessment.update(assessment.id, {
        collaborator_ids: collaboratorIds.filter(id => id !== userId),
      });
      onUpdate(updated);
    } catch (e) {
      console.error("Failed to remove collaborator", e);
      setCollaboratorError(e?.message || "Failed to remove collaborator. Please try again.");
    }
    setSavingCollaborators(false);
  };

  const nextStatuses = STATUS_TRANSITIONS[assessment.status] || [];

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
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tagline</label>
              <input
                type="text"
                value={taglineDraft}
                onChange={e => setTaglineDraft(e.target.value)}
                placeholder="e.g. Q2 2026 Product Team Diagnostic"
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
            {assessment.tagline && <p className="text-xs text-gray-400">{assessment.tagline}</p>}
          </div>
        )}
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

        {onDelete && (
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Delete this assessment</p>
              <p className="text-xs text-gray-400 mt-0.5">Permanently removes it along with all respondents, responses, and discussion notes.</p>
            </div>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting…" : "Delete assessment"}
            </button>
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
            className="text-sm text-[#3366FF] hover:text-[#2952CC] font-medium border border-[#a3b8ff] px-3 py-2 rounded-lg hover:bg-[#eef2ff] transition-colors"
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
                  className="text-sm text-[#3366FF] hover:text-[#2952CC] font-medium border border-[#a3b8ff] px-3 py-1.5 rounded-lg hover:bg-[#eef2ff] transition-colors"
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
                className="text-sm text-[#3366FF] hover:text-[#2952CC] font-medium border border-[#a3b8ff] px-3 py-1.5 rounded-lg hover:bg-[#eef2ff] transition-colors"
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
                  className="text-sm text-[#3366FF] hover:text-[#2952CC] font-medium border border-[#a3b8ff] px-3 py-1.5 rounded-lg hover:bg-[#eef2ff] transition-colors"
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

      {/* Collaborators */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Collaborators</h3>
        <p className="text-xs text-gray-400 mb-4">Other facilitators or admins who can fully manage this assessment.</p>

        {usersError && (
          <p className="text-xs text-red-500 mb-3">{usersError}</p>
        )}
        {collaboratorError && (
          <p className="text-xs text-red-500 mb-3">{collaboratorError}</p>
        )}

        {loadingUsers && (
          <p className="text-xs text-gray-400 italic py-2">Loading…</p>
        )}

        {!loadingUsers && (
          <div className="space-y-1 mb-3">
            {owner && (
              <div className="flex items-center justify-between gap-4 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-800">{owner.full_name || owner.email}</span>
                  <span className="ml-2 text-xs text-gray-400">{owner.email}</span>
                </div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Owner</span>
              </div>
            )}
            {currentCollaborators.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">No collaborators yet.</p>
            ) : (
              currentCollaborators.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-4 py-2 border-t border-gray-50">
                  <div>
                    <span className="text-sm text-gray-700">{u.full_name || u.email}</span>
                    <span className="ml-2 text-xs text-gray-400">{u.email}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveCollaborator(u.id)}
                    disabled={savingCollaborators}
                    className="text-xs text-gray-300 hover:text-red-400 disabled:opacity-40 transition-colors font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {!loadingUsers && availableToAdd.length > 0 && (
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            <select
              value={selectedNewCollaborator}
              onChange={e => setSelectedNewCollaborator(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select a facilitator or admin…</option>
              {availableToAdd.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
            <button
              onClick={handleAddCollaborator}
              disabled={savingCollaborators || !selectedNewCollaborator}
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
        )}
      </section>

      <AssessmentDemoData assessment={assessment} />

    </div>
  );
}
