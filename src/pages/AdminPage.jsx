import { useState, useEffect } from "react";
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
// dump you on a different one. Session-scoped on purpose: restoring a
// selection from days ago would be more surprising than helpful.
const SELECTED_ASSESSMENT_KEY = "qa_admin_selected_assessment";

// How the sidebar list is grouped, remembered the same way and for the same
// reason: coming back to a differently-shaped list is disorienting.
const GROUP_BY_KEY = "qa_admin_group_by";

// One axis at a time rather than a fixed nesting of all three. Organization →
// owner → client company is four levels deep before you reach an assessment,
// in a column narrow enough that titles already truncate — and most of those
// groups would hold one or two rows. Choosing the axis keeps the tree one level
// deep whichever question is being asked today.
//
// `client` is the default because it is the only axis that means something to
// every role. An org admin or facilitator sees one organization, and a
// facilitator usually owns most of what they can see, so those two axes are a
// single heading wrapping everything unless you are the super-admin.
const GROUP_OPTIONS = [
  { key: "client", label: "Client company" },
  { key: "org", label: "Organization" },
  { key: "owner", label: "Owner" },
  { key: "none", label: "Nothing" },
];

// What the leftovers bucket is called, per axis — the assessments the axis
// cannot name at all.
const UNGROUPED_LABEL = { client: "No company", org: "No organization", owner: "Unknown owner" };

// Assessments already arrive newest-first and stay that way inside each group,
// so the grouping only decides the headings and their order.
//
// Labels are resolved through the maps rather than stored on the assessment:
// org_id and created_by_id are plain id strings that nothing enforces, so an
// id with no row behind it has to degrade to the leftovers bucket instead of
// printing a raw uuid as though it were a company name.
//
// Group keys are prefixed by kind rather than being the label itself. They are
// React keys and the identity the collapsed set remembers, so a client actually
// called "No company" must not land on the leftovers bucket's key — and the
// prefix removes the need for a sentinel value that has to be unlike every
// possible company name.
export const groupAssessments = (assessments, groupBy, { orgNames, ownerNames }) => {
  if (groupBy === "none") return [{ key: "all", label: null, items: assessments }];

  const nameFor = (a) => {
    if (groupBy === "client") return (a.company_name || "").trim();
    if (groupBy === "org") return orgNames.get(a.org_id) || "";
    if (groupBy === "owner") return ownerNames.get(a.created_by_id) || "";
    return "";
  };

  const named = new Map();
  const leftovers = [];
  for (const a of assessments) {
    const name = nameFor(a);
    if (!name) { leftovers.push(a); continue; }
    if (!named.has(name)) named.set(name, []);
    named.get(name).push(a);
  }

  const groups = [...named.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([label, items]) => ({ key: `name:${label}`, label, items }));

  // Appended rather than sorted in: it is the leftovers, and "No company"
  // sitting between "Northwind" and "SAS" reads as a client called No company.
  if (leftovers.length) {
    groups.push({ key: "ungrouped", label: UNGROUPED_LABEL[groupBy], items: leftovers });
  }
  return groups;
};

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-500",
  active: "bg-green-100 text-green-700",
  closed: "bg-red-100 text-red-600",
};

// Every assessment says which kind it is. Only "Personal" used to be labelled,
// on the reasoning that team gap is the default and the default needs no badge
// — but a missing badge is not a statement, it's an absence, and the reader has
// to know the rule to decode it. A list where one row is tagged and the next is
// bare reads as "this one is special", not "these are two kinds".
//
// The type also decides which questions get asked and which results view opens,
// so it is worth reading at a glance from the list rather than after a click.
//
// Rounded-md and bottom-left, against the status pill's rounded-full top-right:
// shape and position carry the distinction, so the two never trade places even
// when teal sits near the green of "active".
const TYPE_BADGE = {
  team_gap: { label: "Team",     tone: "text-teal-700 bg-teal-50" },
  personal: { label: "Personal", tone: "text-indigo-600 bg-indigo-50" },
};

// Absent means team_gap — the field was added after the first assessments
// existed, and the Assessment schema documents the same default.
const assessmentType = (a) => (a.assessment_type === "personal" ? "personal" : "team_gap");

// The badge an assessment carries in the list. An instrument names itself, and
// the four imported ones are neither Team nor Personal — labelling a Chaos
// Assessment "Team" because assessment_type is absent would be worse than the
// unlabelled rows this badge was added to fix.
//
// Short, because the badge sits in a 250px column beside a status pill: the
// first word of the instrument's name is enough to tell six apart, and the row
// already carries the full title above it.
const badgeFor = (assessment, instrument) => {
  if (!instrument) return TYPE_BADGE[assessmentType(assessment)];
  if (instrument.question_source === "library") {
    return TYPE_BADGE[instrument.report_style === "profile" ? "personal" : "team_gap"];
  }
  return { label: instrument.name.split(" ")[0], tone: "text-amber-700 bg-amber-50" };
};

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
  // Narrows the sidebar list. Not persisted: a filter you set days ago and
  // forgot looks exactly like an assessment that has gone missing.
  const [groupBy, setGroupBy] = useState(() => sessionStorage.getItem(GROUP_BY_KEY) || "client");
  // Deliberately not remembered, unlike the grouping. Coming back to a sidebar
  // silently hiding most of the list behind a search typed yesterday is the
  // kind of thing that gets reported as missing assessments.
  const [search, setSearch] = useState("");
  // Names for the two id-based axes. Empty maps are fine: groupAssessments
  // drops anything it cannot name into the leftovers bucket, so the sidebar
  // renders correctly while these are still loading or if either call fails.
  // The six instruments, by id. Drives the New Assessment panel, the badge on
  // each sidebar row, and which tabs an assessment gets. Read-open, so every
  // role that can reach this page can load them.
  const [instruments, setInstruments] = useState([]);
  const [questionCounts, setQuestionCounts] = useState(() => new Map());
  const [orgNames, setOrgNames] = useState(() => new Map());
  const [ownerNames, setOwnerNames] = useState(() => new Map());
  // Collapsed by heading label, not index — regrouping or a new assessment
  // would otherwise silently collapse a different group. Deliberately not
  // persisted: reopening the admin page showing everything is the better
  // default, and a stored set would only grow.
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => { document.title = "Admin | Quartz Assessments"; }, []);

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
      loadGroupNames();
      loadInstruments();
    }
  }, [isAuthenticated, user]);

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

  useEffect(() => {
    sessionStorage.setItem(GROUP_BY_KEY, groupBy);
  }, [groupBy]);

  // Display names for the organization and owner axes.
  //
  // Both are best-effort and neither blocks the list: a failure here costs the
  // headings on two of the four groupings, not the sidebar. Organization.read
  // is open, so the first call works for every role. listUsers is scoped —
  // a facilitator only gets their own organization's people — so the owner of
  // an assessment shared in from elsewhere resolves to nothing and lands in
  // "Unknown owner", which is honest: they cannot see that person anyway.
  const loadGroupNames = async () => {
    try {
      const orgs = await base44.entities.Organization.list("name");
      setOrgNames(new Map(orgs.map(o => [o.id, o.name])));
    } catch (e) {
      console.error("Could not load organization names for grouping", e);
    }
    try {
      const res = await base44.functions.invoke("listUsers", {});
      const users = res?.data?.users || [];
      setOwnerNames(new Map(users.map(u => [u.id, u.full_name || u.email])));
    } catch (e) {
      console.error("Could not load owner names for grouping", e);
    }
  };

  // Tags are still loaded with no filter to drive: the sidebar rows show their
  // chips, and search matches on their names. Both resolve ids against this
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
      setSelectedId(created.id);
      setShowNewForm(false);
      setActiveTab("Overview");
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
      console.error("deleteAssessment failed", e?.response?.data ?? e);
      setDeleteError(functionErrorMessage(e));
    }
    setDeleting(false);
  };

  // One explanation of this state, on one page, rather than three screens that
  // each say "denied" and none of which say why. /no-access names the address
  // they are signed in as, which is the fact that resolves it nearly every time.
  if (!canAccessAdmin) return <Navigate to="/no-access" replace />;

  // The sidebar list, narrowed by the tag filter. The selected assessment is
  // still resolved against the full list, so filtering never blanks the pane
  // you are currently reading.
  //
  // Search matches the three things printed on the row — title, client company
  // and tag names — so every hit can be explained by looking at it. Matching on
  // anything the row does not show produces results that look like bugs.
  //
  // Terms are ANDed and order-independent, so "sas roles" finds "Product Team
  // Roles" at SAS without knowing which field holds which word. That is the way
  // a half-remembered assessment is actually recalled: a client and a fragment.
  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearch = (a) => {
    if (searchTerms.length === 0) return true;
    const haystack = [
      a.title || "",
      a.company_name || "",
      ...(a.tag_ids || []).map(id => tags.find(t => t.id === id)?.name || ""),
    ].join(" ").toLowerCase();
    return searchTerms.every(term => haystack.includes(term));
  };

  const visibleAssessments = assessments.filter(matchesSearch);

  // An axis that can only ever draw one heading is not a grouping, it is a box
  // around the whole list. Organization is that for every org admin and most
  // facilitators, and owner is that for a facilitator working alone — so each
  // is offered only once the list actually spans more than one of them.
  const distinctCount = (pick) => new Set(assessments.map(pick).map(v => v || null)).size;
  const groupOptions = GROUP_OPTIONS.filter(o => {
    if (o.key === "org") return distinctCount(a => a.org_id) > 1;
    if (o.key === "owner") return distinctCount(a => a.created_by_id) > 1;
    return true;
  });

  // A remembered grouping can outlive the reason it was available — the org
  // axis disappears when the last assessment from a second organization goes.
  // Falling back keeps the list grouped by something rather than silently
  // ungrouped under a control offering a value it no longer holds.
  const activeGroupBy = groupOptions.some(o => o.key === groupBy) ? groupBy : "client";

  const groups = groupAssessments(visibleAssessments, activeGroupBy, { orgNames, ownerNames });

  const toggleGroup = (key) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selected = assessments.find(a => a.id === selectedId);
  const canDeleteSelected = !!selected && (isAdmin || selected.created_by_id === user?.id);
  // Selecting a personal assessment while a team-only tab is active would
  // otherwise render an empty pane. Falling back beats blanking.
  const instrumentById = new Map(instruments.map(i => [i.id, i]));
  const instrumentOf = (a) => (a?.instrument_id ? instrumentById.get(a.instrument_id) : null);
  const selectedInstrument = instrumentOf(selected);
  const visibleTabs = tabsFor(selected, selectedInstrument);
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

          {/* Opens the panel rather than an inline form. Choosing among six
              instruments, each with a description worth reading, does not fit
              a 250px column — and the choice decides what every respondent is
              asked. */}
          <button
            onClick={() => { setShowNewForm(true); setCreateError(""); }}
            className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New assessment
          </button>

          {/* Search and grouping, at a threshold: below it the whole list is on
              screen at once, and a control that narrows four rows costs more
              attention than it saves.

              There was a tag filter here too. Search matches tag names, so it
              did the same job with one control instead of two — and did it
              better where it mattered, since a dropdown lists two tags that
              share a name as two entries and splits their assessments between
              them, while typing the name finds both. */}
          {assessments.length > 3 && (
            <div className="px-3 mb-2 space-y-1.5">
              <div className="relative">
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search assessments"
                  aria-label="Search assessments by title, company or tag"
                  className="w-full border border-gray-200 rounded-lg pl-2 pr-7 py-1.5 text-xs text-gray-700 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <select
                aria-label="Group assessments by"
                value={activeGroupBy}
                onChange={e => setGroupBy(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {groupOptions.map(o => (
                  <option key={o.key} value={o.key}>Group by: {o.label}</option>
                ))}
              </select>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : visibleAssessments.length === 0 && searchTerms.length > 0 ? (
            /* Names the search term, because "nothing matches" against a list
               you can see is full is a puzzle rather than an answer. */
            <p className="text-xs text-gray-400 text-center py-4 px-2">
              Nothing matching <span className="font-medium text-gray-500">{search.trim()}</span>.{" "}
              <button onClick={() => setSearch("")} className="text-blue-600 hover:underline">
                Show all
              </button>
            </p>
          ) : assessments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4 px-2">
              {isAdmin
                ? "No assessments yet."
                : isOrgAdmin
                  ? "No assessments for your organization yet."
                  : "No assessments have been shared with you yet."}
            </p>
          ) : (
            /* One code path for grouped and ungrouped: "Group by: Nothing"
               returns a single group with no label, so the flat list is the
               same render without a heading. */
            groups.map(group => {
              // A search overrides collapse. A hit hiding inside a folded group
              // is a search that answered "nothing here" while holding the
              // thing you asked for; the collapsed set is remembered, so the
              // groups fold back as soon as the box is cleared.
              const collapsed = searchTerms.length === 0 && collapsedGroups.has(group.key);
              // A collapsed group still has to show the assessment you are
              // reading, or the sidebar stops agreeing with the pane beside it.
              const holdsSelected = group.items.some(a => a.id === selectedId);
              return (
            <div key={group.key} className={group.label ? "mb-2" : ""}>
              {group.label && (
                <button
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!collapsed}
                  className="w-full flex items-center gap-1.5 px-3 py-1 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition-colors"
                >
                  <svg
                    className={`w-3 h-3 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="truncate" title={group.label}>{group.label}</span>
                  <span className="ml-auto shrink-0 font-normal normal-case tracking-normal text-gray-300">
                    {group.items.length}
                  </span>
                </button>
              )}
            <ul className={`space-y-1 ${collapsed && !holdsSelected ? "hidden" : ""}`}>
              {(collapsed && holdsSelected
                ? group.items.filter(a => a.id === selectedId)
                : group.items
              ).map(a => (
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
                      {/* Hovering shows the full name. The sidebar is narrow
                          enough that a title ending in an activity count —
                          "Product Team Quick Review [7]" — loses the part that
                          distinguishes it from its neighbour. */}
                      <span className="text-sm font-medium truncate" title={a.title}>{a.title}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[a.status] || STATUS_COLORS.draft}`}>
                        {a.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badgeFor(a, instrumentOf(a)).tone}`}>
                        {badgeFor(a, instrumentOf(a)).label}
                      </span>
                      {a.company_name && (
                        <p className="text-xs text-gray-400 truncate">{a.company_name}</p>
                      )}
                    </div>
                    {/* Tags on the row, so a group is visible without having
                        to filter for it. Names only — resolved against the
                        loaded tags, so a deleted tag simply stops appearing. */}
                    {(a.tag_ids || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(a.tag_ids || [])
                          .map(id => tags.find(t => t.id === id))
                          .filter(Boolean)
                          .map(t => (
                            <span key={t.id} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {t.name}
                            </span>
                          ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            </div>
              );
            })
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