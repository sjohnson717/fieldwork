import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AssessmentOverview from "./admin/AssessmentOverview";
import AssessmentActivitiesTab from "./admin/AssessmentActivitiesTab";
import AssessmentOwnershipRoles from "./admin/AssessmentOwnershipRoles";
import AssessmentResults from "./admin/AssessmentResults";
import PersonalResults from "./admin/PersonalResults";
import InstrumentResults from "./admin/InstrumentResults";
import AssessmentDiscussion from "./admin/AssessmentDiscussion";
import LibraryPage from "./admin/LibraryPage";
import InstrumentsPage from "./admin/InstrumentsPage";
import TeamPage from "./admin/TeamPage";
import OrganizationsPage from "./admin/OrganizationsPage";
import TagsPage from "./admin/TagsPage";
import AssessmentsHome from "./admin/AssessmentsHome";
import { UnreadBadge } from "./admin/assessment-labels";
import AssessmentSwitcher from "@/components/AssessmentSwitcher";
import {
  loadRespondentSummary, ensureSeenState, unreadCount, markSeen,
  readRecent, pushRecent, visibleRecent,
} from "@/lib/unread-responses";
import ConfirmDialog from "@/components/ConfirmDialog";
import NewAssessmentPanel from "@/components/NewAssessmentPanel";
import { functionErrorMessage } from "@/lib/utils";

// If assessment_type ever starts arriving as undefined on freshly created
// assessments, the cause is almost certainly base44/entities/Assessment.jsonc
// rather than anything here — a publish re-applies schemas from those files
// and drops any field they don't declare. See that folder's README.
//
// A personal assessment never asks who should own an activity and produces no
// team gap to discuss, so those two tabs would be empty rather than merely
// unused. Everything else is common to both types.
const TEAM_TABS = ["Overview", "Activities", "Ownership Roles", "Results", "Discussion"];
const PERSONAL_TABS = ["Overview", "Activities", "Results"];

// Instruments that ask their own fixed question list have no activity picker
// and no ownership question — the questions are the instrument's, not the
// assessment's. Discussion is left out for now rather than for good: it is the
// facilitated workspace, DiscussionNote already keys on assessment plus
// question and knows nothing about axes, and pointing it here is the next
// piece of work rather than a line in this list.
const INSTRUMENT_TABS = ["Overview", "Results"];

const tabsFor = (assessment, instrument) => {
  if (instrument && instrument.question_source === "instrument") return INSTRUMENT_TABS;
  if (instrument) return instrument.report_style === "profile" ? PERSONAL_TABS : TEAM_TABS;
  // Assessments predating instruments, which is every one of them until the
  // library pair is migrated. Absent means team_gap, as the schema says.
  return assessment?.assessment_type === "personal" ? PERSONAL_TABS : TEAM_TABS;
};

// Which assessment was open, so leaving the admin page and coming back doesn't
// dump you somewhere else. Session-scoped on purpose: restoring a selection
// from days ago would be more surprising than helpful. Cleared on going back to
// the Assessments page, so a return visit lands where you left rather than on
// the last assessment you happened to open before that.
const SELECTED_ASSESSMENT_KEY = "qa_admin_selected_assessment";

// The list used to live in this sidebar, grouped by client, organization or
// owner. It moved to AssessmentsHome, which has the width for a table; the
// sidebar keeps a Recent list and the ⌘K switcher, so moving between two
// assessments never needs a trip back through the list.

export default function AdminPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSection, setSelectedSection] = useState("assessments"); // assessments | instruments | library | tags | organizations | team
  // Super-admin only: when set, the team page is narrowed to one organization
  // (set by following an org's "View team" link on the Organizations page).
  const [teamOrgFilter, setTeamOrgFilter] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [tags, setTags] = useState([]);
  // The six instruments, by id. Drives the New Assessment panel, the badge on
  // each sidebar row, and which tabs an assessment gets. Read-open, so every
  // role that can reach this page can load them.
  const [instruments, setInstruments] = useState([]);
  const [questionCounts, setQuestionCounts] = useState(() => new Map());
  // For the Owner column when a super-admin or org admin shows everyone's.
  // Empty is fine: the column prints a dash for anyone it cannot name.
  const [ownerNames, setOwnerNames] = useState(() => new Map());
  // Respondent counts per assessment. null while loading and undefined if the
  // call failed — kept distinct, because a failure must not render as "nobody
  // has responded".
  const [respondentSummary, setRespondentSummary] = useState(null);
  const [seen, setSeen] = useState(null);
  const [recentIds, setRecentIds] = useState([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

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
      loadTags();
      loadOwnerNames();
      loadInstruments();
      loadResponseBadges();
      setRecentIds(readRecent(user.id));
    }
  }, [isAuthenticated, user]);

  // Best-effort like everything else feeding the list: without it the
  // Responses column says it could not load, and every assessment still opens.
  const loadResponseBadges = async () => {
    try {
      const [summary, seenState] = await Promise.all([loadRespondentSummary(), ensureSeenState(user)]);
      setRespondentSummary(summary);
      setSeen(seenState);
    } catch (e) {
      console.error("Could not load respondent summary", e);
      setRespondentSummary(undefined);
    }
  };

  // Best-effort, like the grouping names: an assessment whose instrument will
  // not load still lists and still opens, on the tabs its assessment_type
  // implies. Before the first publish that creates the entity this simply
  // returns nothing, and the New Assessment panel says so rather than
  // presenting an empty list as a choice.
  const loadInstruments = async () => {
    try {
      const rows = await base44.entities.Instrument.list("sort_order");
      setInstruments(rows.filter(i => i.active !== false));
    } catch (e) {
      console.error("Could not load instruments", e);
      return;
    }
    // How many questions each one asks, which is half of what a facilitator is
    // choosing between. Counted here rather than stored on the instrument: a
    // stored count is a second source of truth that goes stale the moment a
    // question is added, which is exactly how Wix's MaxScore worked.
    try {
      const activities = await base44.entities.Activity.list();
      const per = new Map();
      for (const a of activities) {
        for (const id of a.instrument_ids || []) per.set(id, (per.get(id) || 0) + 1);
      }
      setQuestionCounts(per);
    } catch (e) {
      console.error("Could not count instrument questions", e);
    }
  };

  // Best-effort. listUsers is scoped — a facilitator only gets their own
  // organization's people — so the owner of an assessment shared in from
  // elsewhere resolves to nothing and prints a dash, which is honest: they
  // cannot see that person anyway.
  const loadOwnerNames = async () => {
    try {
      const res = await base44.functions.invoke("listUsers", {});
      const users = res?.data?.users || [];
      setOwnerNames(new Map(users.map(u => [u.id, u.full_name || u.email])));
    } catch (e) {
      console.error("Could not load owner names", e);
    }
  };

  // Tags are still loaded with no filter to drive: the Assessments page shows
  // their chips, and both searches match on their names. Both resolve ids against this
  // list and drop what they cannot find, so a tag deleted or merged in settings
  // has to reach here or its chip outlives it until the browser is reloaded —
  // which reads as the delete having failed. Hence still named rather than
  // inline in the effect, so the Tags page can re-run it.
  const loadTags = () =>
    base44.entities.Tag.list("name")
      .then(setTags)
      .catch(e => console.error("Failed to load tags", e));

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
      if (!selectedId) {
        // Come back to whatever was open before navigating away. The stored id
        // is only trusted if it's still in this user's list — it may have been
        // deleted, or access to it withdrawn, since. Otherwise the Assessments
        // page, rather than whichever assessment happens to be newest.
        const remembered = sessionStorage.getItem(SELECTED_ASSESSMENT_KEY);
        if (remembered && ordered.some(a => a.id === remembered)) setSelectedId(remembered);
      }
    } catch (e) {
      console.error("Failed to load assessments", e);
    }
    setLoading(false);
  };

  const handleCreate = async ({ instrument, title, company_name, subject }) => {
    if (!title) return;
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
        title,
        company_name,
        access_code: code,
        buyer_token: buyerToken,
        status: "draft",
        instrument_id: instrument.id,
        // Written alongside instrument_id, and only where it means something.
        // The two library instruments keep it because everything still branches
        // on it; the other four leave it unset rather than widening an enum
        // that instrument_id is about to make redundant. Nothing reads it for
        // them — tabsFor and the badge both go through the instrument.
        assessment_type: instrument.question_source === "library"
          ? (instrument.report_style === "profile" ? "personal" : "team_gap")
          : undefined,
        subject: subject || undefined,
        roles: [],
        collaborator_ids: collaboratorIds,
        org_id: user.org_id || undefined,
      });
      setAssessments(prev => [created, ...prev]);
      openAssessment(created.id);
      setShowNewForm(false);
    } catch (e) {
      console.error("Failed to create assessment", e);
      setCreateError(e?.message || "Failed to create assessment. Please try again.");
    }
    setCreating(false);
  };

  const handleAssessmentUpdate = (updated) => {
    setAssessments(prev => prev.map(a => a.id === updated.id ? updated : a));
    // A tag created from the Overview picker is unknown to this list, so the
    // sidebar row would carry an id it cannot render a name for. Cheap enough
    // to just re-read on any assessment change.
    base44.entities.Tag.list("name").then(setTags).catch(() => {});
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

      setAssessments(prev => prev.filter(a => a.id !== selected.id));
      goHome();
      setConfirmingDelete(false);
    } catch (e) {
      // Kept in the dialog rather than an alert(): the failure belongs next to
      // the action that caused it, and alert() blocks the renderer the same
      // way window.confirm() did.
      console.error("deleteAssessment failed", e?.response?.data ?? e);
      setDeleteError(functionErrorMessage(e));
    }
    setDeleting(false);
  };

  // Every way into an assessment — a table row, a Recent link, the switcher,
  // creating one — goes through here, so the recent list and the tab it opens
  // on cannot disagree between them.
  const openAssessment = (id, tab = "Overview") => {
    setSelectedId(id);
    setSelectedSection("assessments");
    setActiveTab(tab);
    if (user) setRecentIds(pushRecent(user.id, id));
  };

  const goHome = () => {
    setSelectedId(null);
    setSelectedSection("assessments");
    sessionStorage.removeItem(SELECTED_ASSESSMENT_KEY);
    // Counts are cheap to refresh and this is the moment someone reads them.
    loadResponseBadges();
  };

  // ⌘K on a Mac, Ctrl+K elsewhere, from anywhere on the admin page — including
  // inside a text field, since that is where people are when they want out.
  const toggleSwitcher = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setSwitcherOpen(open => !open);
    }
  }, []);
  useEffect(() => {
    if (!canAccessAdmin) return;
    window.addEventListener("keydown", toggleSwitcher);
    return () => window.removeEventListener("keydown", toggleSwitcher);
  }, [canAccessAdmin, toggleSwitcher]);

  const unreadFor = (a) => unreadCount(respondentSummary?.[a.id], seen, a.id);
  const totalUnread = assessments.reduce((n, a) => n + unreadFor(a), 0);

  // Reading Results is what clears the badge, however you got there — the
  // table, the switcher, or the tab bar of an assessment already open.
  const selectedUnread = selectedId && activeTab === "Results"
    ? unreadCount(respondentSummary?.[selectedId], seen, selectedId)
    : 0;
  useEffect(() => {
    if (selectedUnread > 0 && seen) setSeen(markSeen(seen, selectedId));
  }, [selectedUnread, selectedId]);

  // The unread total in the tab title, the way a mail client shows it, so a
  // consultant with /admin open in a background tab can see news arrive.
  useEffect(() => {
    document.title = `${totalUnread > 0 ? `(${totalUnread}) ` : ""}Admin | Quartz Assessments`;
  }, [totalUnread]);

  // One explanation of this state, on one page, rather than three screens that
  // each say "denied" and none of which say why. /no-access names the address
  // they are signed in as, which is the fact that resolves it nearly every time.
  if (!canAccessAdmin) return <Navigate to="/no-access" replace />;

  const selected = assessments.find(a => a.id === selectedId);
  const canDeleteSelected = !!selected && (isAdmin || selected.created_by_id === user?.id);
  // Selecting a personal assessment while a team-only tab is active would
  // otherwise render an empty pane. Falling back beats blanking.
  const instrumentById = new Map(instruments.map(i => [i.id, i]));
  const instrumentOf = (a) => (a?.instrument_id ? instrumentById.get(a.instrument_id) : null);
  const selectedInstrument = instrumentOf(selected);
  const visibleTabs = tabsFor(selected, selectedInstrument);
  const effectiveTab = visibleTabs.includes(activeTab) ? activeTab : "Overview";
  const recent = visibleRecent(recentIds, assessments);
  const onHome = selectedSection === "assessments" && !selected;
  const openNewForm = () => { setShowNewForm(true); setCreateError(""); };
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const navClass = (active) => `w-full text-left px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
    active ? "bg-blue-50 text-blue-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  }`;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">Quartz Assessment</p>
          <h1 className="text-base font-bold text-gray-900">Admin</h1>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3">
          {/* Looks like a search box because that is what it does, and shows
              its shortcut so the keyboard route is learnt by seeing it. */}
          <button
            onClick={() => setSwitcherOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 mb-3 text-xs text-gray-400 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            Find assessment
            <kbd className="ml-auto font-mono text-[10px] text-gray-400 border border-gray-200 rounded px-1">{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>

          <button onClick={goHome} className={navClass(onHome)}>
            Assessments
            <span className="ml-auto">
              {totalUnread > 0
                ? <UnreadBadge count={totalUnread} />
                : <span className="text-xs font-normal text-gray-400">{assessments.length || ""}</span>}
            </span>
          </button>

          {/* Opens the panel rather than an inline form. Choosing among six
              instruments, each with a description worth reading, does not fit
              a 250px column — and the choice decides what every respondent is
              asked. */}
          <button
            onClick={openNewForm}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New assessment
          </button>

          {/* Five at most, whatever the size of the list — which is what keeps
              the sidebar quiet for a super-admin with a hundred assessments.
              One line per row: the title and its unread count, nothing else. */}
          {recent.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1 mt-5">Recent</p>
              <ul className="space-y-0.5">
                {recent.map(a => (
                  <li key={a.id}>
                    <button
                      onClick={() => openAssessment(a.id, unreadFor(a) ? "Results" : "Overview")}
                      className={navClass(selectedSection === "assessments" && selectedId === a.id)}
                      title={a.company_name ? `${a.title} · ${a.company_name}` : a.title}
                    >
                      <span className="truncate font-normal">{a.title}</span>
                      <UnreadBadge count={unreadFor(a)} className="ml-auto shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
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
              {/* Next to the Library and gated the same way: both are authored
                  content every organization reads and only we may rewrite. */}
              {isAdmin && (
                <button
                  onClick={() => setSelectedSection("instruments")}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                    selectedSection === "instruments"
                      ? "bg-blue-50 text-blue-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  Instruments
                </button>
              )}
              {/* Tags, unlike the rest of Settings, is open to org admins too:
                  Tag's own rules let them manage their organization's tags, and
                  listTags scopes the page to those. */}
              <button
                onClick={() => setSelectedSection("tags")}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  selectedSection === "tags"
                    ? "bg-blue-50 text-blue-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                Tags
              </button>
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
        ) : selectedSection === "instruments" ? (
          <InstrumentsPage />
        ) : selectedSection === "library" ? (
          <LibraryPage />
        ) : selectedSection === "tags" ? (
          <TagsPage onTagsChanged={loadTags} />
        ) : selectedSection === "team" ? (
          <TeamPage
            orgFilter={teamOrgFilter}
            onClearOrgFilter={() => setTeamOrgFilter(null)}
            onBackToOrganizations={() => { setTeamOrgFilter(null); setSelectedSection("organizations"); }}
          />
        ) : !selected ? (
          loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <AssessmentsHome
              assessments={assessments}
              tags={tags}
              instrumentOf={instrumentOf}
              ownerNames={ownerNames}
              userId={user?.id}
              summary={respondentSummary}
              seen={seen}
              onOpen={openAssessment}
              onNew={openNewForm}
            />
          )
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-8 py-4">
              <div className="mb-3">
                {/* The way back to the list, now that the list is a page. */}
                <button onClick={goHome} className="text-xs text-gray-400 hover:text-blue-600 transition-colors mb-0.5">
                  ← Assessments
                </button>
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
                  instrument={selectedInstrument}
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
                // Routed by the instrument where there is one, and by
                // assessment_type where there is not — which is every
                // assessment made before instruments existed.
                selectedInstrument?.question_source === "instrument"
                  ? <InstrumentResults assessment={selected} />
                  : selected.assessment_type === "personal"
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

      <AssessmentSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        assessments={assessments}
        recent={recent}
        tags={tags}
        instrumentOf={instrumentOf}
        unreadFor={unreadFor}
        onOpenAssessment={openAssessment}
        onGoHome={goHome}
        onNew={openNewForm}
      />

      {showNewForm && (
        instruments.length > 0 ? (
          <NewAssessmentPanel
            instruments={instruments.map(i => ({
              ...i,
              question_count: questionCounts.get(i.id) || 0,
            }))}
            creating={creating}
            error={createError}
            onCreate={handleCreate}
            onCancel={() => { setShowNewForm(false); setCreateError(""); }}
          />
        ) : (
          // Before the seed has been applied there is nothing to choose from,
          // and an empty list presented as a choice reads as a broken page.
          <ConfirmDialog
            open
            title="No instruments yet"
            message="Apply the source in Settings → Instruments first. That creates the six an assessment can be built from."
            confirmLabel="Go to Instruments"
            cancelLabel="Close"
            onConfirm={() => { setShowNewForm(false); setSelectedSection("instruments"); }}
            onCancel={() => setShowNewForm(false)}
          />
        )
      )}
    </div>
  );
}