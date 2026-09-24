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
import InstrumentDiscussion from "./admin/InstrumentDiscussion";
import LibraryPage from "./admin/LibraryPage";
import InstrumentsPage from "./admin/InstrumentsPage";
import TeamPage from "./admin/TeamPage";
import OrganizationsPage from "./admin/OrganizationsPage";
import TagsPage from "./admin/TagsPage";
import HealthPage from "./admin/HealthPage";
import ResourcesPage from "./admin/ResourcesPage";
import AssessmentsHome, { scopeByOwner } from "./admin/AssessmentsHome";
import { UnreadBadge, PinButton } from "./admin/assessment-labels";
import AssessmentSwitcher from "@/components/AssessmentSwitcher";
import {
  loadRespondentSummary, ensureSeenState, unreadCount, markSeen,
  readRecent, pushRecent, visibleRecent,
} from "@/lib/unread-responses";
import { readPinned, togglePinned, pinnedIn } from "@/lib/pinned-assessments";
import { loadReleaseNotes, readReleaseNotes, unreadReleaseNotes, markAllReleaseNotesRead } from "@/lib/release-notes";
import { ReleaseNotesBar, ReleaseNotesDialog, useReleaseNotesDialog } from "@/components/ReleaseNotes";
import ConfirmDialog from "@/components/ConfirmDialog";
import NewAssessmentPanel from "@/components/NewAssessmentPanel";
import IdeaDialog from "@/components/IdeaDialog";
import IdeasPage from "./admin/IdeasPage";
import { functionErrorMessage } from "@/lib/utils";
import { kindOf, TABS, PERSONAL, OWN_QUESTIONS } from "@/lib/instrument-kind";

// If assessment_type ever starts arriving as undefined on freshly created
// team gap or personal assessments, the cause is almost certainly
// base44/entities/Assessment.jsonc rather than anything here — a publish
// re-applies schemas from those files and drops any field they don't declare.
// See that folder's README.
//
// Which tabs an assessment has is decided by its kind; see instrument-kind.js.
const tabsFor = (assessment, instrument) => TABS[kindOf(assessment, instrument)];

// Which assessment was open, so leaving the admin page and coming back doesn't
// dump you somewhere else. Session-scoped on purpose: restoring a selection
// from days ago would be more surprising than helpful. Cleared on going back to
// the Assessments page, so a return visit lands where you left rather than on
// the last assessment you happened to open before that.
const SELECTED_ASSESSMENT_KEY = "qa_admin_selected_assessment";

// The sidebar's height and sticky offset while the release notes bar is showing:
// the bar's h-10, taken off the top. Spelt out whole so Tailwind finds it.
// Desktop only: on a phone the sidebar is a drawer over everything, bar included.
const RELEASE_BAR_OFFSET = "md:h-[calc(100vh-2.5rem)] md:top-10";

// The list used to live in this sidebar, grouped by client, organization or
// owner. It moved to AssessmentsHome, which has the width for a table; the
// sidebar keeps Pinned and Recent lists and the ⌘K switcher, so moving between two
// assessments never needs a trip back through the list.

export default function AdminPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSection, setSelectedSection] = useState("assessments"); // assessments | instruments | library | resources | tags | organizations | team | health | ideas
  // The Library tab to land on, and a counter that remounts the page so a
  // second jump from Health to the same tab still resets it.
  const [libraryTab, setLibraryTab] = useState({ tab: "Activities", n: 0 });
  // The record System Health's Open pointed at, for the page it opens. The
  // counter remounts that page, so a second Open lands afresh; going to a page
  // from the sidebar clears the target.
  const [focus, setFocus] = useState({ n: 0, target: null });
  const goToSection = (section, target = null) => {
    setFocus(prev => ({ n: prev.n + 1, target }));
    setSelectedSection(section);
  };
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
  const [pinnedIds, setPinnedIds] = useState([]);
  // Release note titles this user has read or dismissed. null until the user
  // loads, so the bar never flashes up for someone who has read everything.
  const [readNoteIds, setReadNoteIds] = useState(null);
  const [releaseNotes, setReleaseNotes] = useState([]);
  // Mine or Everyone's on the Assessments page. Held here rather than on the
  // page because the sidebar's count and unread total follow it too, and so it
  // survives opening an assessment and coming back. Not persisted across
  // reloads, like the page's other filters. null means the default.
  const [ownerChoice, setOwnerChoice] = useState(null);
  // The client chosen on the Assessments page, held here for the same reason:
  // opening one of a client's assessments and coming back should land on that
  // client's list, not on everything. null is all clients.
  const [clientChoice, setClientChoice] = useState(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Below md the sidebar is a drawer behind a menu button: at phone width a
  // 256px column leaves the page under 150px to work in.
  const [menuOpen, setMenuOpen] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(false);
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
      setPinnedIds(readPinned(user));
      setReadNoteIds(readReleaseNotes(user));
      loadReleaseNotes().then(setReleaseNotes);
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
      // `internal` keeps one of ours out of a customer organization's choices
      // — the Fractional CPO Practice Profile is run by us, on practitioners,
      // and is not a thing a client's admin should be able to send their team.
      //
      // Presentation and not protection, and the difference matters: instrument
      // content reads open so the unauthenticated survey can render it, so this
      // hides the instrument from a list rather than hiding its questions from
      // anybody. Nothing here is treated as confidential.
      setInstruments(rows.filter(i => i.active !== false && (isAdmin || !i.internal)));
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

  const handleCreate = async ({ instrument, title, company_name, tagline, subject }) => {
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
        tagline: tagline || undefined,
        access_code: code,
        buyer_token: buyerToken,
        // Born open. There was a draft state before this, and nothing ever
        // enforced it — the access code worked from the moment it existed, so
        // "draft" only ever meant a grey pill on a row that was already
        // collecting responses. An assessment is active until it is closed.
        status: "active",
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

  const unreadNotes = readNoteIds ? unreadReleaseNotes(releaseNotes, readNoteIds) : [];
  const markNotesRead = () => setReadNoteIds(markAllReleaseNotesRead(releaseNotes));
  const whatsNew = useReleaseNotesDialog(unreadNotes, markNotesRead);

  // ⌘K on a Mac, Ctrl+K elsewhere, from anywhere on the admin page — including
  // inside a text field, since that is where people are when they want out.
  const toggleSwitcher = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setSwitcherOpen(open => !open);
    }
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    if (!canAccessAdmin) return;
    window.addEventListener("keydown", toggleSwitcher);
    return () => window.removeEventListener("keydown", toggleSwitcher);
  }, [canAccessAdmin, toggleSwitcher]);

  const unreadFor = (a) => unreadCount(respondentSummary?.[a.id], seen, a.id);
  // The sidebar's count and unread total cover what the Assessments page lists
  // under its current Mine or Everyone's, never more, so the two cannot
  // disagree about how many there are.
  const { ownerScoped } = scopeByOwner(assessments, user?.id, ownerChoice);
  const totalUnread = ownerScoped.reduce((n, a) => n + unreadFor(a), 0);

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
  const selectedKind = kindOf(selected, selectedInstrument);
  const visibleTabs = tabsFor(selected, selectedInstrument);
  const effectiveTab = visibleTabs.includes(activeTab) ? activeTab : "Overview";
  const pinned = pinnedIn(pinnedIds, assessments);
  const isPinned = (id) => pinned.some(a => a.id === id);
  const togglePin = (id) => setPinnedIds(togglePinned(pinnedIds, id, assessments));
  // Recent leaves out what is pinned. The same title twice in a six-row
  // sidebar reads as two assessments, and it pushes a genuinely recent one off.
  const recent = visibleRecent(recentIds.filter(id => !pinnedIds.includes(id)), assessments);
  const onHome = selectedSection === "assessments" && !selected;
  // Opens the panel rather than an inline form: choosing among six instruments,
  // each with a description worth reading, needs the room, and the choice
  // decides what every respondent is asked. Reached from the Assessments page
  // and the ⌘K switcher. The sidebar no longer carries it — the page's own
  // button sits beside the list the new assessment joins.
  const openNewForm = () => { setShowNewForm(true); setCreateError(""); };
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const navClass = (active) => `w-full text-left px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
    active ? "bg-blue-50 text-blue-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  }`;

  // Straight after What's new, wherever What's new lands — under Settings for
  // an admin, and on its own for a facilitator, who has no Settings section.
  //
  // The two belong together. They are the halves of one conversation: what we
  // built, and what you think we should build. Each explains the other, which a
  // row on its own further down does not. They also behave alike — both open
  // over the page you are on, where Tags and Facilitators navigate and the
  // Facilitator Guide leaves the app — so the pairing is honest about what a
  // click does. It sat between Facilitators and the Facilitator Guide before,
  // which split those two and put it between the only two items in the list
  // that share a word with it.
  const shareAnIdea = (
    <button onClick={() => setIdeaOpen(true)} className={navClass(false)}>
      <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0012 3z" />
      </svg>
      Share an idea
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Across the whole screen rather than the main column, so it reads as
          news about the app and not about whatever page is open. Sticky, so it
          stays in view until it is read or dismissed; the sidebar sits below it
          rather than under it, or Log out would drop off the bottom. */}
      <ReleaseNotesBar unread={unreadNotes} onOpen={whatsNew.openDialog} onDismiss={markNotesRead} />
      <div className="flex">
        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
        {/* Sidebar. One element at every width rather than a copy in a sheet,
            so the menu on a phone cannot drift from the sidebar on a laptop.
            Below md it is a fixed drawer; inset-y-0 rather than h-screen, which
            on iOS Safari runs under the toolbar and hides Log out. Any button or
            link inside closes it, since every one of them goes somewhere. */}
        <aside
          id="admin-menu"
          onClick={(e) => { if (e.target.closest("button, a")) setMenuOpen(false); }}
          className={`w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-50 transition-transform md:sticky md:inset-auto md:z-auto md:translate-x-0 md:transition-none ${
            menuOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
          } ${unreadNotes.length > 0 ? RELEASE_BAR_OFFSET : "md:h-screen md:top-0"}`}
        >
          <div className="px-5 py-5 border-b border-gray-100 flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">Quartz Assessment</p>
              <h1 className="text-base font-bold text-gray-900">Admin</h1>
            </div>
            <button aria-label="Close menu" className="md:hidden -mr-3 -mt-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 active:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* min-h-0 with the flex-1: without it a flex child will not shrink
              below its content, so the column grew past the sidebar instead of
              scrolling and the nav was drawn over the email and Log out. It
              only looked right while the list was short enough to fit. */}
          <div className="flex-1 min-h-0 overflow-y-auto py-3 px-3">
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
                  : <span className="text-xs font-normal text-gray-400">{ownerScoped.length || ""}</span>}
              </span>
            </button>

            {/* Pinned first, then Recent. Recent is five at most whatever the
                size of the list, which is what keeps the sidebar quiet for a
                super-admin with a hundred assessments; Pinned is only as long as
                someone chose to make it. One line per row: the title and its
                unread count, nothing else. */}
            {[["Pinned", pinned], ["Recent", recent]].map(([heading, rows]) => rows.length > 0 && (
              <div key={heading}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1 mt-5">{heading}</p>
                <ul className="space-y-0.5">
                  {rows.map(a => (
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
              </div>
            ))}

            {/* Settings, then a separate section for what only we can see.
                An org admin's Settings is the whole of their app; everything
                below the rule is ours — the shared library, the instruments,
                every organization, and the checks that read across all of them.
                Split so it is obvious at a glance which is which. */}
            {(isAdmin || isOrgAdmin) && (
              <>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5 mt-5">Settings</p>
                {/* Always here, so a dismissed announcement can still be read.
                    First in Settings, where anyone looking for news finds it. */}
                <button onClick={whatsNew.openDialog} className={navClass(false)}>
                  What's new
                  {/* Blue, not the red count: red means new responses everywhere else. */}
                  {unreadNotes.length > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-blue-500" aria-label="Unread" />}
                </button>
                {shareAnIdea}
                {/* Tags, unlike the authored content below, is open to org admins:
                    Tag's own rules let them manage their organization's tags, and
                    listTags scopes the page to those. */}
                <button onClick={() => setSelectedSection("tags")} className={navClass(selectedSection === "tags")}>
                  Tags
                </button>
                <button
                  onClick={() => { setSelectedSection("team"); setTeamOrgFilter(null); }}
                  className={navClass(selectedSection === "team")}
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
            {/* A facilitator has no Settings, so What's new — and the idea box
                that belongs beside it — sit here for them instead. */}
            {!(isAdmin || isOrgAdmin) && (
              <>
                <button onClick={whatsNew.openDialog} className={navClass(false)}>
                  What's new
                  {unreadNotes.length > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-blue-500" aria-label="Unread" />}
                </button>
                {shareAnIdea}
              </>
            )}

            {isAdmin && (
              <>
                <div className="border-t border-gray-200 mt-5 pt-4">
                  <p className="text-[10px] font-semibold text-[#3366FF] uppercase tracking-widest px-3 mb-0.5">Product Growth Leaders</p>
                  <p className="text-[10px] text-gray-400 px-3 mb-1.5">Only super-admins see this</p>
                </div>
                {/* Named for someone who has never seen it: "Health" alone did
                    not say whose. It reads across every organization. */}
                <button onClick={() => setSelectedSection("health")} className={navClass(selectedSection === "health")}>
                  System Health
                </button>
                <button
                  onClick={() => { setLibraryTab(prev => ({ tab: "Activities", n: prev.n + 1 })); goToSection("library"); }}
                  className={navClass(selectedSection === "library")}
                >
                  Library
                </button>
                {/* Next to the Library: both are authored content every
                    organization reads and only we may rewrite. */}
                <button onClick={() => goToSection("instruments")} className={navClass(selectedSection === "instruments")}>
                  Instruments
                </button>
                {/* After both, since it serves both: a resource can be reading for
                    a library activity and for an instrument's question. */}
                <button onClick={() => goToSection("resources")} className={navClass(selectedSection === "resources")}>
                  Resources
                </button>
                <button onClick={() => setSelectedSection("organizations")} className={navClass(selectedSection === "organizations")}>
                  Organizations
                </button>
                {/* What everyone else has asked for, and what we decided.
                    Last, because it is read on purpose rather than passed
                    through on the way somewhere else. */}
                <button onClick={() => setSelectedSection("ideas")} className={navClass(selectedSection === "ideas")}>
                  Ideas
                </button>
              </>
            )}
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
          {/* Phones only: the way into the sidebar. Carries the unread total,
              which is otherwise inside the closed drawer where nobody sees it. */}
          <div className={`md:hidden sticky z-20 h-12 pr-2 flex items-center gap-1 bg-white border-b border-gray-200 ${
            unreadNotes.length > 0 ? "top-12" : "top-0"
          }`}>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="admin-menu"
              // The icon and the word together, the full height of the bar: a
              // 36px icon alone was hard to hit with a thumb on an iPhone.
              className="h-12 pl-3 pr-4 flex items-center gap-3 text-gray-600 active:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-sm font-bold text-gray-900">Admin</span>
            </button>
            <UnreadBadge count={totalUnread} />
          </div>
          {selectedSection === "ideas" ? (
            <IdeasPage />
          ) : selectedSection === "organizations" ? (
            <OrganizationsPage
              onViewTeam={orgId => { setTeamOrgFilter(orgId); setSelectedSection("team"); }}
            />
          ) : selectedSection === "instruments" ? (
            <InstrumentsPage key={focus.n} focus={focus.target} onApplied={loadInstruments} />
          ) : selectedSection === "library" ? (
            <LibraryPage key={`${libraryTab.n}-${focus.n}`} initialTab={libraryTab.tab} focus={focus.target} />
          ) : selectedSection === "resources" ? (
            <ResourcesPage key={focus.n} focus={focus.target} />
          ) : selectedSection === "health" ? (
            <HealthPage
              onOpen={(target) => {
                if (target.assessmentId) return openAssessment(target.assessmentId);
                if (target.section === "library") setLibraryTab(prev => ({ tab: target.tab || "Activities", n: prev.n + 1 }));
                goToSection(target.section, target);
              }}
            />
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
                isPinned={isPinned}
                onTogglePin={togglePin}
                ownerChoice={ownerChoice}
                onOwnerChoice={setOwnerChoice}
                clientChoice={clientChoice}
                onClientChoice={setClientChoice}
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
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                    <PinButton pinned={isPinned(selected.id)} onToggle={() => togglePin(selected.id)} />
                  </div>
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
                    instrumentOf={instrumentOf}
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
                  selectedKind === OWN_QUESTIONS
                    ? <InstrumentResults assessment={selected} />
                    : selectedKind === PERSONAL
                      ? <PersonalResults assessment={selected} />
                      : <AssessmentResults assessment={selected} />
                )}
                {effectiveTab === "Discussion" && (
                  selectedKind === OWN_QUESTIONS
                    ? <InstrumentDiscussion assessment={selected} />
                    : <AssessmentDiscussion assessment={selected} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ReleaseNotesDialog notes={releaseNotes} open={whatsNew.open} onOpenChange={whatsNew.setOpen} newIds={whatsNew.newIds} />

      {/* The lightbulb, on every admin page and always in the same corner.
          The sidebar entry needs scrolling to on a laptop and the drawer
          opened on a phone, which is a long way to go for a thought that
          arrives while you are looking at something else — and the thought is
          usually *about* the thing you are looking at.

          Hidden while a dialog is open: it would otherwise float over the
          modal backdrop, including over the idea dialog it opens. Hidden in
          print for the same reason as every other control. */}
      {!ideaOpen && !showNewForm && !switcherOpen && !confirmingDelete && (
        <button
          onClick={() => setIdeaOpen(true)}
          title="Share an idea"
          aria-label="Share an idea"
          className="no-print fixed bottom-5 right-5 z-30 w-12 h-12 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-lg text-amber-500 hover:text-amber-600 hover:border-amber-200 hover:shadow-xl active:scale-95 transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0012 3z" />
          </svg>
        </button>
      )}

      {/* Where they were when they had the thought, captured rather than
          asked: the section, and the assessment if they were inside one. */}
      <IdeaDialog
        open={ideaOpen}
        onClose={() => setIdeaOpen(false)}
        context={selected ? `${selectedSection} · ${selected.title}` : selectedSection}
      />

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
        pinned={pinned}
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