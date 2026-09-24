import { useState, useEffect } from "react";
import { Lock, LockOpen } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { roleLabel, NO_ACCESS_ROLE } from "@/lib/roles";
import AssessmentDemoData from "./AssessmentDemoData";
import TagPicker from "@/components/TagPicker";
import { displayStatus } from "./assessment-labels";
import { NAMING_EXAMPLE, NAMING_NOTE, GENERIC_COMPANY } from "@/lib/assessment-naming";
import { kindOf, PERSONAL, TEAM_GAP } from "@/lib/instrument-kind";

// Two states. An assessment is open from the moment it exists — the access
// code works immediately — and the only real event in its life is being closed.
// See displayStatus in assessment-labels.jsx for the draft records that
// predate this.
const STATUS_TRANSITIONS = {
  active: ["closed"],
  closed: ["active"],
};

const STATUS_LABELS = {
  active: { closed: "Close assessment" },
  closed: { active: "Reopen assessment" },
};

export default function AssessmentOverview({ assessment, instrument, instrumentOf = () => null, onUpdate, onDelete, deleting }) {
  const { user: currentUser } = useAuth();
  // Delete is locked until somebody says otherwise, every time this screen is
  // opened. There was already a confirmation, and a confirmation is a thing you
  // click through — it arrives under the cursor that was already moving. The
  // lock is a separate act on a separate control, which is the point: it cannot
  // be satisfied by the same reflex that started the delete.
  //
  // Not a field on the assessment. A stored flag has to be remembered when the
  // assessment is made, and the one that gets deleted by accident is the one
  // nobody thought to protect. This way every assessment is locked, always,
  // including the client engagement created five minutes ago.
  const [unlocked, setUnlocked] = useState(false);
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
  const [otherAssessments, setOtherAssessments] = useState([]);
  const [savingParent, setSavingParent] = useState(false);
  const [tagError, setTagError] = useState("");

  const isPersonal = kindOf(assessment, instrument) === PERSONAL;

  useEffect(() => {
    loadUsers();
  }, []);

  // Locked again the moment the screen moves to another assessment. Without
  // this the component is reused across assessments and an unlock meant for one
  // would be sitting open on the next one somebody clicked into.
  useEffect(() => {
    setUnlocked(false);
  }, [assessment.id]);

  // Candidate parents for a personal assessment. RLS already limits this to
  // assessments the caller may read, so no extra scoping is needed here.
  //
  useEffect(() => {
    if (!isPersonal) return;
    base44.entities.Assessment.list("created_date")
      .then(setOtherAssessments)
      .catch(e => console.error("Failed to load team assessments", e));
  }, [isPersonal]);

  // Team gap only. This read "anything not personal", which let a Chaos or
  // Portfolio Health assessment be linked as the team side, and Results then
  // looked for importance and execution answers it had never collected.
  //
  // A link already made to one stays listed, so it shows as what it is rather
  // than as "Not linked" while still being stored. Filtered here rather than on
  // load because this component is reused as the selection moves between
  // assessments, and the one kept depends on which is open.
  const teamAssessments = otherAssessments.filter(a =>
    kindOf(a, instrumentOf(a)) === TEAM_GAP || a.id === assessment.parent_assessment_id);

  const handleParentChange = async (parentId) => {
    setSavingParent(true);
    try {
      const updated = await base44.entities.Assessment.update(assessment.id, {
        parent_assessment_id: parentId || null,
      });
      onUpdate(updated);
    } catch (e) {
      console.error("Failed to link team assessment", e);
    }
    setSavingParent(false);
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    setUsersError("");
    try {
      // The built-in User entity ignores custom RLS for list operations, so
      // this goes through a backend function using the service role instead
      // of base44.entities.User.list() directly.
      // listUsers returns everyone in scope including no-access accounts;
      // only people who can actually run an assessment belong here.
      const res = await base44.functions.invoke("listUsers", {});
      setAllUsers((res?.data?.users || []).filter(u => u.role !== NO_ACCESS_ROLE));
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
      // Stamped on close so Results can spot answers revised afterwards.
      // Personal assessments stay editable once closed, so the aggregate can
      // legitimately move under a report that has already been presented —
      // worth knowing about, not worth preventing.
      const updated = await base44.entities.Assessment.update(assessment.id, {
        status: newStatus,
        ...(newStatus === "closed" ? { closed_date: new Date().toISOString() } : {}),
      });
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

  const status = displayStatus(assessment);
  const nextStatuses = STATUS_TRANSITIONS[status] || [];

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
            {/* Renaming is free text — the three parts are only collected
                separately at creation — so the standard is restated here,
                where the whole name is being retyped. */}
            <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2.5">
              <p className="text-[11px] font-medium text-blue-900">How assessments are named</p>
              <p className="text-[11px] text-blue-900/70 leading-snug mt-0.5">{NAMING_NOTE}</p>
              <p className="text-[11px] text-blue-900/60 mt-1 font-mono break-words">{NAMING_EXAMPLE.full}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
              <input
                autoFocus
                type="text"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                placeholder={NAMING_EXAMPLE.full}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
              <input
                type="text"
                value={companyDraft}
                onChange={e => setCompanyDraft(e.target.value)}
                placeholder={`${NAMING_EXAMPLE.company} — or ${GENERIC_COMPANY}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description <span className="text-gray-400 font-normal">— optional</span>
              </label>
              <input
                type="text"
                value={taglineDraft}
                onChange={e => setTaglineDraft(e.target.value)}
                placeholder="A line of context, shown under the title on reports"
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
        {/* The instrument says what it is, when the assessment names one. The
            two hard-coded sentences below it are the fallback for every
            assessment created before instruments existed. */}
        <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
          {instrument
            ? `${instrument.name}${instrument.tagline ? ` — ${instrument.tagline.replace(/\.$/, "")}` : ""}`
            : isPersonal
              ? "Personal assessment — each person rates their own experience, skills, and interest."
              : "Team gap assessment — importance, execution, and ownership of each activity."}
        </p>
        {assessment.subject && (
          <p className="text-xs text-gray-500 mt-2">
            <span className="text-gray-400">Subject: </span>
            <span className="font-medium">{assessment.subject}</span>
          </p>
        )}
      </section>

      {/* Tags */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Tags</h3>
        <p className="text-xs text-gray-400 mb-4">
          Group this with related assessments — a client, a cohort, a support group. An assessment can carry several, and tags are just for finding things; they don't affect who can see what.
        </p>
        <TagPicker
          value={assessment.tag_ids || []}
          orgId={assessment.org_id}
          onChange={async (next) => {
            setTagError("");
            try {
              const updated = await base44.entities.Assessment.update(assessment.id, { tag_ids: next });
              onUpdate(updated);
            } catch (e) {
              console.error("Failed to save tags", e);
              setTagError(e?.message || "Couldn't save that change.");
            }
          }}
        />
        {tagError && <p className="text-xs text-red-500 mt-2">{tagError}</p>}
      </section>

      {/* Linked team assessment — personal assessments only, and optional */}
      {isPersonal && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Linked team assessment</h3>
          <p className="text-xs text-gray-400 mb-4">
            Optional. Linking lets the Results tab cross what people can do against what the team said matters and where execution is weak. This assessment works on its own without it.
          </p>
          <select
            value={assessment.parent_assessment_id || ""}
            onChange={e => handleParentChange(e.target.value)}
            disabled={savingParent}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
          >
            <option value="">Not linked</option>
            {teamAssessments.map(a => (
              <option key={a.id} value={a.id}>
                {a.title}{a.company_name ? ` · ${a.company_name}` : ""}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* Status */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Status</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-sm text-gray-600">
            Currently <span className="font-semibold text-gray-900">{status}</span>
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
              {updatingStatus ? "Updating…" : STATUS_LABELS[status]?.[s] || s}
            </button>
          ))}
        </div>

        {onDelete && (
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Delete this assessment</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {unlocked
                  ? "Permanently removes it along with all respondents, responses, and discussion notes."
                  : "Locked. Open the lock to delete this assessment."}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {/* 44px square, because it is a control on a phone as well as a
                  screen, and a 36px one was hard to hit. */}
              <button
                onClick={() => setUnlocked((u) => !u)}
                disabled={deleting}
                aria-pressed={unlocked}
                aria-label={unlocked ? "Lock deleting again" : "Unlock deleting"}
                title={unlocked ? "Lock deleting again" : "Unlock deleting"}
                className={`w-11 h-11 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
                  unlocked
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                }`}
              >
                {unlocked ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </button>
              <button
                onClick={onDelete}
                disabled={deleting || !unlocked}
                // Not hidden while locked. A control that disappears reads as a
                // permission somebody does not have; one that is visibly
                // disabled beside a lock reads as the step it is.
                className="text-sm font-medium px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? "Deleting…" : "Delete assessment"}
              </button>
            </div>
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
          {/* Team leader dashboard link */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-700 font-medium w-56 shrink-0">Team Leader Dashboard</span>
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
                  // Must be a CSPRNG: this token is the only thing protecting
                  // the team leader page, which exposes the roster and the
                  // team leader's identity. Math.random() is predictable.
                  const token = crypto.randomUUID();
                  const updated = await base44.entities.Assessment.update(assessment.id, { team_token: token });
                  onUpdate(updated);
                }}
                className="text-sm text-[#3366FF] hover:text-[#2952CC] font-medium border border-[#a3b8ff] px-3 py-1.5 rounded-lg hover:bg-[#eef2ff] transition-colors"
              >
                Generate
              </button>
            )}
          </div>
          {/* Report link. The buyer report is a gap analysis — importance,
              execution and the priorities that fall out of them — none of
              which a personal assessment collects, so it is withheld rather
              than shown empty. Personal results live on the Results tab. */}
          {!isPersonal && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-700 font-medium w-56 shrink-0">Report and Action Plan</span>
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
          )}
        </div>
      </section>

      {/* Collaborators */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Collaborators</h3>
        <p className="text-xs text-gray-400 mb-4">Facilitators and admins invited to this assessment. This is what grants a facilitator access — they can see and manage this assessment and nothing else.</p>

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
                    <span className="ml-2 text-xs text-gray-400">· {roleLabel(u.role)}</span>
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

      {/* Demo data fabricates answers on the library axes against an
          assessment's chosen activities, or on the instrument's own scale
          against its own questions — which is the same tool, generating for
          whichever survey this assessment runs. The instrument is handed down
          rather than loaded again; this page already has it. */}
      <AssessmentDemoData assessment={assessment} instrument={instrument} />

    </div>
  );
}
