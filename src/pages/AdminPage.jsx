import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AssessmentOverview from "./admin/AssessmentOverview";
import AssessmentActivitiesTab from "./admin/AssessmentActivitiesTab";
import AssessmentOwnershipRoles from "./admin/AssessmentOwnershipRoles";
import AssessmentResults from "./admin/AssessmentResults";
import PersonalResults from "./admin/PersonalResults";
import AssessmentDiscussion from "./admin/AssessmentDiscussion";
import LibraryPage from "./admin/LibraryPage";
import TeamPage from "./admin/TeamPage";
import OrganizationsPage from "./admin/OrganizationsPage";
import ConfirmDialog from "@/components/ConfirmDialog";

// A personal assessment never asks who should own an activity and produces no
// team gap to discuss, so those two tabs would be empty rather than merely
// unused. Everything else is common to both types.
const TEAM_TABS = ["Overview", "Activities", "Ownership Roles", "Results", "Discussion"];
const PERSONAL_TABS = ["Overview", "Activities", "Results"];
const tabsFor = (assessment) => (assessment?.type === "personal" ? PERSONAL_TABS : TEAM_TABS);

// Which assessment was open, so leaving the admin page and coming back doesn't
// dump you on a different one. Session-scoped on purpose: restoring a
// selection from days ago would be more surprising than helpful.
const SELECTED_ASSESSMENT_KEY = "qa_admin_selected_assessment";

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-500",
  active: "bg-green-100 text-green-700",
  closed: "bg-red-100 text-red-600",
};

export default function AdminPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSection, setSelectedSection] = useState("assessments"); // assessments | library | organizations | team
  // Super-admin only: when set, the team page is narrowed to one organization
  // (set by following an org's "View team" link on the Organizations page).
  const [teamOrgFilter, setTeamOrgFilter] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newType, setNewType] = useState("team_gap");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => { document.title = "Admin | Quartz Assessment"; }, []);

  // One place to remember the selection, so creating, deleting and clicking a
  // row all persist it without each having to.
  //
  // Only ever writes. This effect also runs on mount, when selectedId is still
  // null — clearing the key there would wipe the stored selection before
  // loadAssessments got a chance to read it, which is exactly the bug this
  // whole feature was meant to fix. A stale id left behind is harmless:
  // loadAssessments ignores any id that isn't still in the user's list.
  useEffect(() => {
    if (selectedId) sessionStorage.setItem(SELECTED_ASSESSMENT_KEY, selectedId);
  }, [selectedId]);

  const isAdmin = user?.role === "admin";
  const isOrgAdmin = user?.role === "org_admin";
  const isFacilitator = user?.role === "facilitator";
  const canAccessAdmin = isAdmin || isOrgAdmin || isFacilitator;
  const sameOrg = (a, b) => (a || null) === (b || null);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (!canAccessAdmin) return; // no access for plain "user" role
      loadAssessments();
    }
  }, [isAuthenticated, user]);

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const results = await base44.entities.Assessment.list("created_date");
      // Super admin sees everything. An org admin sees their whole
      // organization's work, not just what they personally created or were
      // invited to. A facilitator sees only the assessments they were
      // invited to (or created themselves).
      const invitedTo = (a) =>
        a.created_by_id === user.id || (a.collaborator_ids || []).includes(user.id);
      const scoped = isAdmin
        ? results
        : isOrgAdmin
          ? results.filter(a => sameOrg(a.org_id, user.org_id) || invitedTo(a))
          : results.filter(invitedTo);
      // list() returns oldest first; the sidebar shows newest first.
      const ordered = [...scoped].reverse();
      setAssessments(ordered);
      if (ordered.length > 0 && !selectedId) {
        // Come back to whatever was open before navigating away. The stored id
        // is only trusted if it's still in this user's list — it may have been
        // deleted, or access to it withdrawn, since.
        const remembered = sessionStorage.getItem(SELECTED_ASSESSMENT_KEY);
        const stillVisible = remembered && ordered.some(a => a.id === remembered);
        setSelectedId(stillVisible ? remembered : ordered[0].id);
      }
    } catch (e) {
      console.error("Failed to load assessments", e);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(36)).join('').substring(0, 5).toUpperCase();
      const buyerToken = crypto.randomUUID();
      // Assessment write access is per-assessment (see Assessment.jsonc), so
      // seed the org's admins as collaborators. Otherwise an org admin could
      // see an assessment their facilitator created but not edit it.
      let collaboratorIds = [];
      try {
        const res = await base44.functions.invoke("listUsers", {});
        collaboratorIds = (res?.data?.users || [])
          .filter(u => u.role === "org_admin" && u.id !== user.id && sameOrg(u.org_id, user.org_id))
          .map(u => u.id);
      } catch (e) {
        console.error("Could not seed org admins as collaborators", e);
      }
      const created = await base44.entities.Assessment.create({
        title: newTitle.trim(),
        company_name: newCompany.trim(),
        access_code: code,
        buyer_token: buyerToken,
        status: "draft",
        type: newType,
        roles: [],
        collaborator_ids: collaboratorIds,
        org_id: user.org_id || undefined,
      });
      setAssessments(prev => [created, ...prev]);
      setSelectedId(created.id);
      setShowNewForm(false);
      setNewTitle("");
      setNewCompany("");
      setNewType("team_gap");
      setActiveTab("Overview");
    } catch (e) {
      console.error("Failed to create assessment", e);
      setCreateError(e?.message || "Failed to create assessment. Please try again.");
    }
    setCreating(false);
  };

  const handleAssessmentUpdate = (updated) => {
    setAssessments(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAssessment = () => {
    if (!selected) return;
    setDeleteError("");
    setConfirmingDelete(true);
  };

  const performDeleteAssessment = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      // The cascade runs in deleteAssessment, which checks authority once
      // before deleting anything. Done from here it was five independent RLS
      // decisions that disagreed: every child entity lets a facilitator delete
      // by role, Assessment does not, so a facilitator wiped the respondents
      // and responses and then failed on the assessment itself.
      await base44.functions.invoke("deleteAssessment", { assessmentId: selected.id });

      setAssessments(prev => {
        const next = prev.filter(a => a.id !== selected.id);
        setSelectedId(next.length > 0 ? next[0].id : null);
        if (next.length > 0) setSelectedSection("assessments");
        return next;
      });
      setConfirmingDelete(false);
    } catch (e) {
      // Kept in the dialog rather than an alert(): the failure belongs next to
      // the action that caused it, and alert() blocks the renderer the same
      // way window.confirm() did.
      setDeleteError(e?.message || "Something went wrong. Please try again.");
    }
    setDeleting(false);
  };

  if (!canAccessAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center max-w-sm">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Access denied</h2>
          <p className="text-sm text-gray-500">This page is only available to admins.</p>
        </div>
      </div>
    );
  }

  const selected = assessments.find(a => a.id === selectedId);
  const canDeleteSelected = !!selected && (isAdmin || selected.created_by_id === user?.id);
  // Selecting a personal assessment while a team-only tab is active would
  // otherwise render an empty pane. Falling back beats blanking.
  const visibleTabs = tabsFor(selected);
  const effectiveTab = visibleTabs.includes(activeTab) ? activeTab : "Overview";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">Quartz Assessment</p>
          <h1 className="text-base font-bold text-gray-900">Admin</h1>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3">
          {/* Assessments section */}
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5 mt-1">Assessments</p>

          {showNewForm ? (
            <div className="px-3 mb-3 space-y-2">
              {createError && (
                <p className="text-xs text-red-500">{createError}</p>
              )}
              <input
                autoFocus
                type="text"
                placeholder="Assessment title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Company name (optional)"
                value={newCompany}
                onChange={e => setNewCompany(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {/* Set at creation and not editable afterwards: the type decides
                  which questions were asked, so changing it on an assessment
                  that already has responses would relabel answers that were
                  given to a different question. */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {[
                  { value: "team_gap", label: "Team gap" },
                  { value: "personal", label: "Personal" },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => setNewType(t.value)}
                    className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      newType === t.value ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                {newType === "personal"
                  ? "Each person rates their own experience, skills and interest in each activity."
                  : "The team rates importance, execution and ownership of each activity."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-1.5 rounded-lg transition-colors"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setNewTitle(""); setNewCompany(""); setNewType("team_gap"); setCreateError(""); }}
                  className="px-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New assessment
            </button>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : assessments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4 px-2">
              {isAdmin
                ? "No assessments yet."
                : isOrgAdmin
                  ? "No assessments for your organization yet."
                  : "No assessments have been shared with you yet."}
            </p>
          ) : (
            <ul className="space-y-1">
              {assessments.map(a => (
                <li key={a.id}>
                  <button
                    onClick={() => { setSelectedId(a.id); setSelectedSection("assessments"); setActiveTab("Overview"); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                      selectedSection === "assessments" && selectedId === a.id
                        ? "bg-blue-50 text-blue-900"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{a.title}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[a.status] || STATUS_COLORS.draft}`}>
                        {a.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {a.type === "personal" && (
                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">Personal</span>
                      )}
                      {a.company_name && (
                        <p className="text-xs text-gray-400 truncate">{a.company_name}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Settings section */}
          {(isAdmin || isOrgAdmin) && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5 mt-5">Settings</p>
              {isAdmin && (
                <button
                  onClick={() => setSelectedSection("library")}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                    selectedSection === "library"
                      ? "bg-blue-50 text-blue-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  Library
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setSelectedSection("organizations")}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                    selectedSection === "organizations"
                      ? "bg-blue-50 text-blue-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  Organizations
                </button>
              )}
              <button
                onClick={() => { setSelectedSection("team"); setTeamOrgFilter(null); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  selectedSection === "team"
                    ? "bg-blue-50 text-blue-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                Facilitators
              </button>
            </>
          )}
          <a
            href="/facilitator-guide"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-1.5"
          >
            Facilitator Guide
            <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        <div className="px-3 py-2 border-t border-gray-100">
          {user?.email && (
            <p className="px-3 py-1 text-xs text-gray-400 truncate" title={user.email}>{user.email}</p>
          )}
          <button
            onClick={() => logout()}
            className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedSection === "organizations" ? (
          <OrganizationsPage
            onViewTeam={orgId => { setTeamOrgFilter(orgId); setSelectedSection("team"); }}
          />
        ) : selectedSection === "library" ? (
          <LibraryPage />
        ) : selectedSection === "team" ? (
          <TeamPage
            orgFilter={teamOrgFilter}
            onClearOrgFilter={() => setTeamOrgFilter(null)}
            onBackToOrganizations={() => { setTeamOrgFilter(null); setSelectedSection("organizations"); }}
          />
        ) : !selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            {loading ? "" : "Select or create an assessment"}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-8 py-4">
              <div className="mb-3">
                <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                {selected.company_name && (
                  <p className="text-sm text-gray-400">{selected.company_name}</p>
                )}
              </div>
              {/* Tabs */}
              <div className="flex gap-1">
                {visibleTabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      effectiveTab === tab
                        ? "bg-blue-600 text-white"
                        : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {effectiveTab === "Overview" && (
                <AssessmentOverview
                  assessment={selected}
                  onUpdate={handleAssessmentUpdate}
                  // Deleting is creator-or-super-admin, matching both
                  // Assessment's delete rule and deleteAssessment's check.
                  // Anyone else was shown a button that could only half-work.
                  onDelete={canDeleteSelected ? handleDeleteAssessment : null}
                  deleting={deleting}
                />
              )}
              {effectiveTab === "Activities" && (
                <AssessmentActivitiesTab
                  assessment={selected}
                  onUpdate={handleAssessmentUpdate}
                />
              )}
              {effectiveTab === "Ownership Roles" && (
                <AssessmentOwnershipRoles
                  assessment={selected}
                  onUpdate={handleAssessmentUpdate}
                />
              )}
              {effectiveTab === "Results" && (
                selected.type === "personal"
                  ? <PersonalResults assessment={selected} />
                  : <AssessmentResults assessment={selected} />
              )}
              {effectiveTab === "Discussion" && (
                <AssessmentDiscussion assessment={selected} />
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        destructive
        title={`Delete "${selected?.title}"?`}
        message={
          deleteError
            ? `Delete failed: ${deleteError}`
            : "This permanently removes the assessment and all its respondents, responses, and discussion notes. This cannot be undone."
        }
        confirmLabel={deleting ? "Deleting…" : "Delete assessment"}
        busy={deleting}
        onConfirm={performDeleteAssessment}
        onCancel={() => { setConfirmingDelete(false); setDeleteError(""); }}
      />
    </div>
  );
}