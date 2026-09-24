import { isLibraryActivity, asksOwnQuestions, selectAssignedActivities } from "@/lib/activity-kind";
import { sameAddress } from "@/lib/same-address";

// The checks behind Settings → System Health: things a super-admin should look at,
// not things that are broken. Every one is a judgement call — an old article
// may be a classic, a quiet assessment may be waiting on a client — so the page
// lists and links, and never changes anything itself.
//
// Pure: given the loaded records and a clock, returns totals and the checks. Kept out of
// the page so the rules can be read, and changed, in one place.

// How old is old. Change them here; the page prints them in each check's title.
export const THRESHOLDS = {
  resourceYears: 5,          // a resource published longer ago than this
  quietActiveDays: 90,       // an open assessment with no response for this long
  unansweredActiveDays: 30,  // an open assessment nobody has started, this long after it was made
  closedYears: 2,            // a closed assessment, kept this long after closing
  pendingInviteDays: 30,     // an invitation nobody has accepted
};

const DAY = 24 * 60 * 60 * 1000;

// Base44's built-in dates come back without a zone and are UTC; a date the app
// wrote itself (closed_date) carries one. Both parse the same way here.
export const parseDate = (d) => {
  if (!d) return null;
  const s = String(d);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00`)
    : new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(t.getTime()) ? null : t;
};

export const ago = (date, now) => {
  const days = Math.floor((now - date) / DAY);
  if (days < 1) return "today";
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(months / 12)} years ago`;
};

const olderThan = (date, days, now) => !!date && now - date > days * DAY;

// "fix" is a defect with one right answer: a resource no report can show, an
// owner no respondent can pick. "review" is a judgement call. Only fixes count
// in the page's headline, as on Wisdom Studio's Health page, so that a pile of old
// but perfectly good articles never reads as a broken app.
//
// `needs` names the lists a check reads. A check whose data did not load
// reports that rather than a pass: a green tick over a list that was never
// read is the one wrong answer this page can give.
const check = (key, severity, title, why, needs, items) => ({ key, severity, title, why, needs, items });

export function runChecks(data, now = new Date()) {
  const T = THRESHOLDS;
  const {
    assessments = [], summary = {}, resources = [], activities = [], instruments = [],
    jobTitles = [], invitations = [], blogPosts = [], skippedPosts = [],
    contentStatus = null,
  } = data;

  const assessmentLabel = (a) => a.company_name ? `${a.title} · ${a.company_name}` : a.title;
  const openAssessment = (a) => ({ section: "assessments", assessmentId: a.id });

  const activeResources = resources.filter(r => r.active !== false);
  const activityName = new Map(activities.map(a => [a.id, a.name]));
  const readingCount = new Map();
  for (const r of activeResources) {
    for (const id of r.activity_ids || []) readingCount.set(id, (readingCount.get(id) || 0) + 1);
  }

  // ── Assessments ──
  const quiet = [];
  const unanswered = [];
  for (const a of assessments.filter(a => a.status !== "closed")) {
    const s = summary[a.id];
    const last = parseDate(s?.last_activity);
    const created = parseDate(a.created_date);
    if (last) {
      if (olderThan(last, T.quietActiveDays, now)) {
        quiet.push({ key: a.id, label: assessmentLabel(a), detail: `Last response ${ago(last, now)}`, target: openAssessment(a) });
      }
    } else if (s && olderThan(created, T.unansweredActiveDays, now)) {
      unanswered.push({ key: a.id, label: assessmentLabel(a), detail: `Opened ${ago(created, now)}, nobody has started it`, target: openAssessment(a) });
    }
  }

  // closed_date is written when an assessment closes; ones closed before it
  // existed fall back to their last edit, which is usually the closing.
  const longClosed = assessments
    .filter(a => a.status === "closed")
    .map(a => ({ a, closed: parseDate(a.closed_date) || parseDate(a.updated_date) }))
    .filter(({ closed }) => olderThan(closed, T.closedYears * 365, now))
    .map(({ a, closed }) => ({ key: a.id, label: assessmentLabel(a), detail: `Closed ${ago(closed, now)}`, target: openAssessment(a) }));

  // ── Resources ──
  const oldResources = activeResources
    .map(r => ({ r, published: parseDate(r.published_date) }))
    .filter(({ published }) => olderThan(published, T.resourceYears * 365, now))
    .sort((x, y) => x.published - y.published)
    .map(({ r, published }) => {
      // What retiring it would cost: the activities this is the only reading for.
      const only = (r.activity_ids || []).filter(id => readingCount.get(id) === 1).map(id => activityName.get(id)).filter(Boolean);
      return {
        key: r.id,
        label: r.title,
        detail: `Published ${published.getFullYear()}` + (only.length ? ` · the only reading for ${only.join(", ")}` : ""),
        target: { section: "resources", resourceIds: [r.id] },
      };
    });

  const undated = activeResources
    .filter(r => !parseDate(r.published_date))
    .map(r => ({ key: r.id, label: r.title, detail: r.url || "", target: { section: "resources", resourceIds: [r.id] } }));

  const unattached = activeResources
    .filter(r => !(r.activity_ids || []).length && !r.fallback)
    .map(r => ({ key: r.id, label: r.title, detail: "Attached to nothing, so it never reaches a report", target: { section: "resources", resourceIds: [r.id] } }));

  const byAddress = new Map();
  for (const r of resources) {
    if (!r.url) continue;
    const k = sameAddress(r.url);
    byAddress.set(k, [...(byAddress.get(k) || []), r]);
  }
  const duplicates = [...byAddress.values()]
    .filter(rows => rows.length > 1)
    .map(rows => ({ key: rows[0].id, label: rows[0].title, detail: `${rows.length} resources link to this article`, target: { section: "resources", resourceIds: rows.map(r => r.id) } }));

  const added = new Set(resources.map(r => sameAddress(r.url)));
  const skipped = new Set(skippedPosts.map(r => sameAddress(r.url)));
  const newPosts = blogPosts
    .filter(p => !added.has(sameAddress(p.url)) && !skipped.has(sameAddress(p.url)))
    .map(p => ({ key: p.url, label: p.title, detail: p.published ? `Posted ${ago(new Date(p.published), now)}` : "", target: { section: "resources", showFeed: true } }));

  // ── Library ──
  const libraryActivities = activities.filter(a => a.active !== false && isLibraryActivity(a));
  const noReading = libraryActivities
    .filter(a => !readingCount.get(a.id))
    .map(a => ({ key: a.id, label: a.name, detail: a.facet || "", target: { section: "resources", addForActivityId: a.id }, addReadingFor: a }));

  const liveInstruments = new Map(instruments.filter(i => i.active !== false).map(i => [i.id, i]));
  const questionsNoReading = activities
    .filter(a => a.active !== false && (a.instrument_ids || []).some(id => liveInstruments.has(id)) && !readingCount.get(a.id))
    .map(a => ({
      key: a.id,
      label: a.name,
      detail: (a.instrument_ids || []).map(id => liveInstruments.get(id)?.name).filter(Boolean).join(", "),
      target: { section: "instruments", instrumentId: (a.instrument_ids || []).find(id => liveInstruments.has(id)), questionId: a.id },
    }));

  // A live question in a section its instrument does not list is asked of
  // nobody: the survey's pages are built from Instrument.sections, and a
  // section that is not in that list has no page. The question sits in the
  // app looking perfectly normal — it is active, it has its text, it shows in
  // the editor — and no respondent ever sees it.
  //
  // It has one right answer either way round (add the section to the
  // instrument, or move the question into a section it has), which is what
  // makes it a fix rather than a judgement call. Three retired comment boxes
  // are in this position on purpose and are excluded with every other
  // inactive question.
  const askedOfNobody = activities
    .filter(a => a.active !== false && (a.instrument_ids || []).some(id => liveInstruments.has(id)))
    .map(a => {
      const instrument = (a.instrument_ids || []).map(id => liveInstruments.get(id)).find(Boolean);
      return { a, instrument };
    })
    .filter(({ a, instrument }) => a.section && instrument && !(instrument.sections || []).includes(a.section))
    .map(({ a, instrument }) => ({
      key: a.id,
      label: a.name,
      detail: `In "${a.section}", which ${instrument.name} does not list`,
      target: { section: "instruments", instrumentId: instrument.id, questionId: a.id },
    }));

  const titleNames = new Set(jobTitles.filter(t => t.active !== false).map(t => t.name));
  const unknownOwner = libraryActivities
    .filter(a => a.preferred_owner && !titleNames.has(a.preferred_owner))
    .map(a => ({ key: a.id, label: a.name, detail: `Recommended owner "${a.preferred_owner}" is not an active job title`, target: { section: "library", tab: "Activities", activityId: a.id } }));

  // ── The repository ──
  //
  // Whether the app and the content branch still say the same thing. This is
  // the failure nobody goes looking for: nothing about the app looks wrong
  // while an afternoon's editing sits uncommitted, and the repository is only
  // a backup for as long as it agrees.
  //
  // Two findings, because they are two different events. Content with no file
  // has one right answer — commit it, since nothing would bring it back — and
  // content that differs from its file is a judgement about which side is
  // right, which is the sync screen's whole business.
  const contentRows = contentStatus?.rows || [];
  // Content files sits at the top of the Instruments screen.
  const openContent = { section: "instruments" };
  const uncommitted = contentRows
    .filter((r) => r.state === "missing")
    .map((r) => ({
      key: r.key,
      label: r.label,
      detail: r.problems.length
        ? `${r.path} cannot be read: ${r.problems[0]}`
        : `Nothing in ${r.path} — losing the app loses this`,
      target: openContent,
    }));

  const drifted = contentRows
    .filter((r) => r.state === "drift")
    .map((r) => ({
      key: r.key,
      label: r.label,
      detail: [
        r.differs ? "the app has edits the file does not" : null,
        r.writes ? `${r.writes} row${r.writes === 1 ? "" : "s"} the file would write to the app` : null,
      ].filter(Boolean).join(" · "),
      target: openContent,
    }));

  // ── People ──
  const staleInvites = invitations
    .filter(i => i.status === "pending" && olderThan(parseDate(i.created_date), T.pendingInviteDays, now))
    .map(i => ({ key: i.id, label: i.email, detail: `Invited ${ago(parseDate(i.created_date), now)}`, target: { section: "team" } }));

  // An open assessment whose survey would open with nothing to answer. Worked
  // out with the survey's own rule rather than a second reading of the fields,
  // so it catches whatever empties one, not only the causes already known: in
  // September 2026 every team gap made from the New Assessment panel opened
  // empty for two weeks, because the rule read its instrument_id as "asks its
  // own list", and nothing said so until a client's survey showed it. An
  // instrument's question counts only in a section the instrument lists, which
  // is the one it is asked in.
  const liveActivities = activities.filter(a => a.active !== false);
  const instrumentById = new Map(instruments.map(i => [i.id, i]));
  const asksNothing = assessments
    .filter(a => a.status !== "closed")
    .map(a => ({ a, instrument: instrumentById.get(a.instrument_id) || null }))
    .filter(({ a, instrument }) => {
      const asked = selectAssignedActivities(a, instrument, liveActivities);
      const reachable = asksOwnQuestions(instrument)
        ? asked.filter(q => (instrument.sections || []).includes(q.section))
        : asked;
      return reachable.length === 0;
    })
    .map(({ a, instrument }) => {
      const selected = (a.activity_ids || []).length;
      const detail = asksOwnQuestions(instrument)
        ? `${instrument.name} has no active question in a section it lists`
        : selected
          ? `None of its ${selected} selected activit${selected === 1 ? "y is" : "ies are"} active in the library`
          : "The library has no active activities";
      return { key: a.id, label: assessmentLabel(a), detail, target: openAssessment(a) };
    });

  const totals = {
    assessments: assessments.length,
    open: assessments.filter(a => a.status !== "closed").length,
    closed: assessments.filter(a => a.status === "closed").length,
    resources: activeResources.length,
    disabledResources: resources.length - activeResources.length,
    activities: libraryActivities.length,
    questions: activities.filter(a => a.active !== false && (a.instrument_ids || []).some(id => liveInstruments.has(id))).length,
    instruments: liveInstruments.size,
    // Of the posts in the feed, which only ever holds the newest 20. Skipped
    // counts every skip, including posts that have since dropped out of it.
    blogPending: newPosts.length,
    blogAdded: blogPosts.filter(p => added.has(sameAddress(p.url))).length,
    blogSkipped: skippedPosts.length,
  };

  return { totals, checks: [
    check("quiet", "review", `Open assessments with no response in ${T.quietActiveDays} days`,
      "Still collecting answers but nobody has answered lately. Close them, or chase the client.",
      ["assessments", "summary"], quiet),
    check("unanswered", "review", `Open assessments nobody has started after ${T.unansweredActiveDays} days`,
      "The link may never have been sent.", ["assessments", "summary"], unanswered),
    check("asks-nothing", "fix", "Open assessments whose survey has no questions",
      "Anyone opening the link gets nothing to answer. Pick activities on the assessment, or restore the instrument's questions.",
      ["assessments", "activities", "instruments"], asksNothing),
    check("closed", "review", `Assessments closed more than ${T.closedYears} years ago`,
      "Kept with every respondent's answers. Delete the ones nobody will read again.", ["assessments"], longClosed),

    check("old-resources", "review", `Resources published more than ${T.resourceYears} years ago`,
      "Worth a look for anything outdated. Oldest first; where it is the only reading for an activity, disabling it leaves that activity with none.",
      ["resources", "activities"], oldResources),
    check("undated", "fix", "Resources with no published date", "Without a date they cannot be checked for age.", ["resources"], undated),
    check("unattached", "fix", "Resources attached to nothing",
      "Enabled, but offered for no activity and not for thin shortlists, so no report shows them.", ["resources"], unattached),
    check("duplicates", "fix", "Articles added more than once", "Two resources with the same article, perhaps at different addresses.", ["resources"], duplicates),
    check("blog", "review", "Blog posts waiting for a decision", "In the blog feed but neither added as a resource nor skipped. Decide on Settings → Resources → New from the blog.",
      ["resources", "blogPosts", "skippedPosts"], newPosts),

    check("no-reading", "fix", "Library activities with no reading",
      "A report recommending one of these offers nothing to read for it.", ["resources", "activities"], noReading),
    check("questions-no-reading", "review", "Instrument questions with no reading",
      "Set their reading on the Instruments screen.", ["resources", "activities", "instruments"], questionsNoReading),
    check("asked-of-nobody", "fix", "Questions in a section their instrument does not list",
      "The survey's pages come from the instrument's section list, so these are never asked. Add the section to the instrument, or move the question.",
      ["activities", "instruments"], askedOfNobody),
    check("unknown-owner", "fix", "Activities whose recommended owner is not a job title",
      "The owner suggestion will not match anything a respondent can pick.", ["activities", "jobTitles"], unknownOwner),

    check("content-missing", "fix", "Content the repository does not have",
      "Nothing in the content branch holds this, so it exists only in the app. Commit it on Instruments → Content files.",
      ["contentStatus"], uncommitted),
    check("content-drift", "review", "Content that differs from the repository",
      "Edited on one side since the last sync. Instruments → Content files names the field and lets you choose which side is right.",
      ["contentStatus"], drifted),

    check("invites", "review", `Invitations pending more than ${T.pendingInviteDays} days`,
      "Follow up with the person, or revoke the invitation on Facilitators.", ["invitations"], staleInvites),
  ] };
}
