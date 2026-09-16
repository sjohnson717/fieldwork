import { useState } from "react";
import { STATUS_COLORS, badgeFor, UnreadBadge, PinButton } from "./assessment-labels";
import { unreadCount, relativeDate } from "@/lib/unread-responses";

// The Assessments page: where /admin opens, and where the list of assessments
// lives now instead of in the sidebar.
//
// The sidebar list was built for someone who can see everything. A consultant
// with four clients got a column of group headings, most of them wrapping a
// single row, with titles truncated to fit 250px beside two badges. Given the
// whole window, the same list becomes a table: full titles, one column per
// fact, and the two things people actually come here to check — who has
// responded, and what changed — readable without opening anything.

// Open is the default rather than All. Closed engagements are finished work;
// they stay one click away, but they are not what anyone opens the page for.
const STATUS_FILTERS = [
  { key: "open", label: "Open", test: (a) => a.status !== "closed" },
  { key: "closed", label: "Closed", test: (a) => a.status === "closed" },
  { key: "all", label: "All", test: () => true },
];

const SORTS = {
  title: (a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }),
  client: (a, b) => (a.company_name || "￿").localeCompare(b.company_name || "￿", undefined, { sensitivity: "base" }),
  responses: (a, b) => a._completed - b._completed,
  activity: (a, b) => (a._activity || "").localeCompare(b._activity || ""),
};

// Mine or Everyone's, decided in one place because two things read it: this
// page's list, and the count and unread total beside Assessments in the
// sidebar. When they were computed separately the sidebar said 10 while the
// page said 5, which reads as five assessments gone missing.
//
// Mine is assessments you created or were added to as a collaborator — yours to
// work on. The switch is only offered once there is somebody else's work in the
// list; a facilitator only ever sees their own and what they were invited to,
// so for them it would switch between two identical lists. Mine is the default,
// but only when something is yours: a super-admin who has created nothing
// would otherwise open on an empty page.
export const scopeByOwner = (assessments, userId, choice) => {
  const mine = (a) => a.created_by_id === userId || (a.collaborator_ids || []).includes(userId);
  const showOwnerFilter = assessments.some(a => !mine(a));
  const ownerFilter = choice ?? (assessments.some(mine) ? "mine" : "all");
  const ownerScoped = showOwnerFilter && ownerFilter === "mine" ? assessments.filter(mine) : assessments;
  return { showOwnerFilter, ownerFilter, ownerScoped };
};

// One entry per client, from the Client company typed on each assessment.
//
// Matched ignoring case and surrounding spaces, so "Public" and "public " are
// one client; the name shown is the spelling most of its assessments use.
// Nothing cleverer than that — "Alert Media" and "AlertMedia" stay two entries,
// the same limit tags had before the picker. The dropdown is where that shows
// up, which is also where someone can see it and fix the name.
//
// Assessments with no client get an entry of their own, last, rather than
// vanishing from every choice but "All clients".
const NO_CLIENT = "__none__";
const clientKey = (a) => (a.company_name || "").trim().toLowerCase() || NO_CLIENT;

export const clientsIn = (assessments) => {
  const byKey = new Map();
  for (const a of assessments) {
    const key = clientKey(a);
    if (!byKey.has(key)) byKey.set(key, { key, count: 0, spellings: new Map() });
    const entry = byKey.get(key);
    entry.count += 1;
    const name = (a.company_name || "").trim();
    if (name) entry.spellings.set(name, (entry.spellings.get(name) || 0) + 1);
  }
  const clients = [...byKey.values()].map(e => ({
    key: e.key,
    count: e.count,
    // Most-used spelling; on a tie, the one with capitals, since "public"
    // beside "Public" is the lapse rather than the intent.
    label: e.key === NO_CLIENT ? "No client" : [...e.spellings.entries()]
      .sort((x, y) => (y[1] - x[1]) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))[0][0],
  }));
  return clients.sort((x, y) => {
    if ((x.key === NO_CLIENT) !== (y.key === NO_CLIENT)) return x.key === NO_CLIENT ? 1 : -1;
    return x.label.localeCompare(y.label, undefined, { sensitivity: "base" });
  });
};

export default function AssessmentsHome({
  assessments, tags, instrumentOf, ownerNames, userId,
  summary, seen, onOpen, onNew, isPinned, onTogglePin,
  ownerChoice, onOwnerChoice, clientChoice, onClientChoice,
}) {
  // Search and filters are not remembered, for the reason the sidebar never
  // remembered its search: coming back to a list silently narrowed by something
  // typed yesterday gets reported as assessments going missing.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [sort, setSort] = useState({ key: "activity", dir: "desc" });

  // Held by AdminPage, which also counts from it; see scopeByOwner.
  const { showOwnerFilter, ownerFilter, ownerScoped } = scopeByOwner(assessments, userId, ownerChoice);
  const setOwnerFilter = onOwnerChoice;

  // Clients are counted within Mine or Everyone's, so the numbers in the
  // dropdown are the rows you will get. Offered only when there are two or
  // more: a filter with one choice is a label. A chosen client that is no
  // longer in the list — switching to Mine can remove it — falls back to all.
  const clients = clientsIn(ownerScoped);
  const showClientFilter = clients.length > 1;
  const activeClient = showClientFilter ? clients.find(c => c.key === clientChoice) || null : null;
  const clientScoped = activeClient ? ownerScoped.filter(a => clientKey(a) === activeClient.key) : ownerScoped;

  // Search matches what the row shows — title, client, tag names — plus the
  // access code, which is what a respondent reads out when they cannot get in.
  // Terms are ANDed and order-independent, so "sas roles" finds "Product Team
  // Roles" at SAS without knowing which field holds which word.
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (a) => {
    if (terms.length === 0) return true;
    const haystack = [
      a.title || "",
      a.company_name || "",
      a.access_code || "",
      ...(a.tag_ids || []).map(id => tags.find(t => t.id === id)?.name || ""),
    ].join(" ").toLowerCase();
    return terms.every(t => haystack.includes(t));
  };
  const searched = clientScoped.filter(matches);

  const statusCount = (f) => searched.filter(f.test).length;
  const activeFilter = STATUS_FILTERS.find(f => f.key === statusFilter);

  // Last activity is the last respondent to do anything — join, save a page, or
  // finish — and nothing else. It used to take the assessment's own edits too,
  // so renaming a client on three assessments put all three at the top of the
  // list as "Just now" while none had a response. What this column is read for
  // is whether people are answering; an assessment nobody has answered shows a
  // dash and sorts last.
  const rows = searched
    .filter(activeFilter.test)
    .map(a => {
      const s = summary?.[a.id];
      const activity = s?.last_activity || null;
      return { ...a, _summary: s, _completed: s?.completed || 0, _activity: activity, _unread: unreadCount(s, seen, a.id) };
    })
    .sort((a, b) => {
      // Unread first, whatever the sort. That is the point of the badge: news
      // should not be sitting on page two under a stale draft.
      if (!!b._unread !== !!a._unread) return b._unread ? 1 : -1;
      // Nobody has answered: last in either direction, since there is no
      // activity to put first or last.
      if (sort.key === "activity" && !!a._activity !== !!b._activity) return a._activity ? -1 : 1;
      const c = SORTS[sort.key](a, b);
      return sort.dir === "asc" ? c : -c;
    });

  const toggleSort = (key) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "title" || key === "client" ? "asc" : "desc" });

  const SortHeader = ({ k, children, className = "" }) => (
    <th className={`px-4 py-2.5 font-semibold ${className}`} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-700">
        {children}
        <span className={sort.key === k ? "text-gray-600" : "invisible"} aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );

  const totalUnread = ownerScoped.reduce((n, a) => n + unreadCount(summary?.[a.id], seen, a.id), 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900">Assessments</h2>
          {totalUnread > 0 && (
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-red-600">{totalUnread}</span> new {totalUnread === 1 ? "response" : "responses"} since you last looked
            </span>
          )}
          <button
            onClick={onNew}
            className="ml-auto inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New assessment
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[16rem]">
            <input
              id="assessments-search"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, client, tag, or access code"
              aria-label="Search assessments"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {showClientFilter && (
            <select
              id="assessments-client"
              aria-label="Filter by client"
              value={activeClient?.key || ""}
              onChange={e => onClientChoice(e.target.value || null)}
              className={`border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                activeClient ? "border-gray-900 text-gray-900 font-medium" : "border-gray-200 text-gray-600"
              }`}
            >
              <option value="">All clients · {ownerScoped.length}</option>
              {clients.map(c => (
                <option key={c.key} value={c.key}>{c.label} · {c.count}</option>
              ))}
            </select>
          )}
          {showOwnerFilter && (
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Whose assessments">
              {[["mine", "Mine"], ["all", "Everyone's"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setOwnerFilter(key)}
                  aria-pressed={ownerFilter === key}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${ownerFilter === key ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* What one client's work adds up to, once you are looking at one
            client. Counted from every status, not the chip below it: "how is
            SAS going" is about the whole engagement. */}
        {activeClient && (
          <ClientSummary client={activeClient} assessments={clientScoped} summary={summary} onClear={() => onClientChoice(null)} />
        )}

        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              aria-pressed={statusFilter === f.key}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                statusFilter === f.key
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {f.label} · {statusCount(f)}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            assessments={assessments}
            ownerScoped={ownerScoped}
            clientScoped={clientScoped}
            clientLabel={activeClient?.label}
            onClearClient={() => onClientChoice(null)}
            searched={searched}
            search={search}
            statusLabel={activeFilter.label}
            onClearSearch={() => setSearch("")}
            onShowEveryone={() => setOwnerFilter("all")}
            onShowAll={() => setStatusFilter("all")}
            onNew={onNew}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-left text-[11px] text-gray-500">
                <tr>
                  <SortHeader k="title">Assessment</SortHeader>
                  <SortHeader k="client">Client</SortHeader>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide">Type</th>
                  {showOwnerFilter && ownerFilter === "all" && (
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide">Owner</th>
                  )}
                  <SortHeader k="responses">Responses</SortHeader>
                  <SortHeader k="activity">Last activity</SortHeader>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(a => {
                  const badge = badgeFor(a, instrumentOf(a));
                  const s = a._summary;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => onOpen(a.id, a._unread ? "Results" : "Overview")}
                      className="group cursor-pointer hover:bg-blue-50/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* A real button for keyboard users; the row click is
                              a convenience for the mouse. */}
                          <button
                            onClick={e => { e.stopPropagation(); onOpen(a.id, a._unread ? "Results" : "Overview"); }}
                            className="font-medium text-gray-900 text-left hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                          >
                            {a.title}
                          </button>
                          <UnreadBadge count={a._unread} />
                          {/* Faint until the row is hovered or focused, and
                              always shown once pinned, so the table does not
                              carry a column of icons nobody asked about. */}
                          <PinButton
                            compact
                            pinned={isPinned(a.id)}
                            onToggle={() => onTogglePin(a.id)}
                            className={isPinned(a.id) ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}
                          />
                        </div>
                        {(a.tag_ids || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(a.tag_ids || [])
                              .map(id => tags.find(t => t.id === id))
                              .filter(Boolean)
                              .map(t => (
                                <span key={t.id} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t.name}</span>
                              ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{a.company_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${badge.tone}`}>{badge.label}</span>
                      </td>
                      {showOwnerFilter && ownerFilter === "all" && (
                        <td className="px-4 py-3 text-gray-500">{ownerNames.get(a.created_by_id) || "—"}</td>
                      )}
                      <td className="px-4 py-3 tabular-nums">
                        {/* Unknown is not zero. A summary that failed to load
                            must not tell a consultant nobody has responded. */}
                        {summary === null ? (
                          <span className="text-gray-300">…</span>
                        ) : !s ? (
                          <span className="text-gray-300">—</span>
                        ) : s.completed + s.started === 0 ? (
                          <span className="text-gray-400">None yet</span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); onOpen(a.id, "Results"); }}
                            className="text-left hover:text-blue-700"
                            title="Open results"
                          >
                            <span className="font-medium text-gray-900">{s.completed}</span>
                            <span className="text-gray-500"> done</span>
                            {s.started > 0 && <span className="text-gray-400"> · {s.started} in progress</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap" title={a._activity ? new Date(a._activity).toLocaleString() : ""}>
                        {relativeDate(a._activity)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[a.status] || STATUS_COLORS.draft}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {summary === undefined && (
          <p className="text-xs text-gray-400">Response counts could not be loaded. Open an assessment's Results to see them.</p>
        )}
      </div>
    </div>
  );
}

// Every empty list says which filter emptied it and offers the one click that
// undoes it. "No assessments" against a list the user knows is full is a
// puzzle, and the likeliest answer is a filter they forgot they had on.
function EmptyState({ assessments, ownerScoped, clientScoped, clientLabel, onClearClient, searched, search, statusLabel, onClearSearch, onShowEveryone, onShowAll, onNew }) {
  const box = "bg-white border border-dashed border-gray-200 rounded-xl py-12 px-6 text-center text-sm text-gray-500";
  const link = "text-blue-600 hover:underline";
  if (assessments.length === 0) {
    return (
      <div className={box}>
        <p className="font-medium text-gray-700 mb-1">No assessments yet</p>
        <button onClick={onNew} className={link}>Create your first assessment</button>
      </div>
    );
  }
  if (ownerScoped.length === 0) {
    return (
      <div className={box}>
        You haven't created or been invited to any assessments.{" "}
        <button onClick={onShowEveryone} className={link}>Show everyone's</button>
      </div>
    );
  }
  if (searched.length === 0 && clientScoped.length > 0) {
    return (
      <div className={box}>
        Nothing matching <span className="font-medium text-gray-700">{search.trim()}</span>
        {clientLabel && <> for <span className="font-medium text-gray-700">{clientLabel}</span></>}.{" "}
        <button onClick={onClearSearch} className={link}>Clear search</button>
        {clientLabel && <> · <button onClick={onClearClient} className={link}>Show all clients</button></>}
      </div>
    );
  }
  return (
    <div className={box}>
      No {statusLabel.toLowerCase()} assessments here.{" "}
      <button onClick={onShowAll} className={link}>Show all</button>
    </div>
  );
}

// "Public · 3 assessments · 4 done · 2 in progress". Unknown is not zero: while
// the counts are loading or failed to load, the response half is left off
// rather than claiming nobody has answered.
function ClientSummary({ client, assessments, summary, onClear }) {
  let done = 0;
  let inProgress = 0;
  for (const a of assessments) {
    done += summary?.[a.id]?.completed || 0;
    inProgress += summary?.[a.id]?.started || 0;
  }
  const n = assessments.length;
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500">
      <span className="font-semibold text-gray-900">{client.label}</span>
      <span>· {n} {n === 1 ? "assessment" : "assessments"}</span>
      {summary && (
        <>
          <span>· <span className="font-medium text-gray-900 tabular-nums">{done}</span> done</span>
          {inProgress > 0 && <span>· <span className="tabular-nums">{inProgress}</span> in progress</span>}
        </>
      )}
      <button onClick={onClear} className="text-blue-600 hover:underline text-sm ml-1">Show all clients</button>
    </div>
  );
}
