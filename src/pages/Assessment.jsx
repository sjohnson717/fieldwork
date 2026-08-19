import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { getAssessmentByCode, getRespondentSession, saveRespondentAnswers } from "@/lib/public-assessment";
import { PERSONAL_AXES, computePersonProfile } from "@/lib/personal-scoring";
import { rebuildResponses } from "@/lib/responses";
import { usePrintSafeUrl } from "@/lib/print-safe-url";
import { claimToken, resumeLinkFor } from "@/lib/token-address";
import { FACET_ORDER } from "@/lib/scoring";
import PersonalProfileReport from "@/components/PersonalProfileReport";
import TeamGapSelfReport from "@/components/TeamGapSelfReport";

const HERO_IMAGE = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/2ffc15b8c_curated-lifestyle-H3ZVdxBRIW0-unsplash.jpg";

const IMPORTANCE_OPTIONS = ["Not needed", "Nice to have", "Important", "Critical"];
const EXECUTION_OPTIONS = ["Not done", "Inconsistent", "Good", "Excellent", "I don't know"];

const IMPORTANCE_COLORS = {
  "Not needed":   { border: "border-gray-400",   bg: "bg-gray-400",   text: "text-gray-700" },
  "Nice to have": { border: "border-blue-300",    bg: "bg-blue-300",   text: "text-blue-900" },
  "Important":    { border: "border-blue-500",    bg: "bg-blue-500",   text: "text-white" },
  "Critical":     { border: "border-blue-700",  bg: "bg-blue-700", text: "text-white" },
};

const EXECUTION_COLORS = {
  "Not done":     { border: "border-rose-300",    bg: "bg-rose-300",   text: "text-rose-900" },
  "Inconsistent": { border: "border-amber-400",   bg: "bg-amber-400",  text: "text-amber-900" },
  "Good":         { border: "border-green-400",   bg: "bg-green-400",  text: "text-green-900" },
  "Excellent":    { border: "border-green-600",   bg: "bg-green-600",  text: "text-white" },
  "I don't know": { border: "border-gray-300",    bg: "bg-gray-200",   text: "text-gray-600" },
};

// Personal assessment. All three axes run none → most, so one ramp keyed by
// position serves all of them and a new scale needs no new colour map.
const PERSONAL_RAMP = [
  { border: "border-gray-400",  bg: "bg-gray-400",  text: "text-gray-700" },
  { border: "border-blue-200",  bg: "bg-blue-200",  text: "text-blue-900" },
  { border: "border-blue-400",  bg: "bg-blue-400",  text: "text-white" },
  { border: "border-blue-600",  bg: "bg-blue-600",  text: "text-white" },
  { border: "border-blue-800",  bg: "bg-blue-800",  text: "text-white" },
];

const rampFor = (options) =>
  Object.fromEntries(options.map((opt, i) => {
    // Spread the ramp across however many options the scale has, so a
    // four-point axis still ends on the darkest swatch.
    const step = options.length === 1 ? 0 : i / (options.length - 1);
    return [opt, PERSONAL_RAMP[Math.round(step * (PERSONAL_RAMP.length - 1))]];
  }));

const PERSONAL_COLORS = Object.fromEntries(
  PERSONAL_AXES.map(axis => [axis.key, rampFor(axis.options)])
);

function RatingButton({ options, value, onChange, colorMap }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => {
        const colors = colorMap[opt] || { border: "border-gray-300", bg: "bg-gray-300", text: "text-gray-700" };
        const selected = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
              selected
                ? `${colors.bg} ${colors.text} border-transparent`
                : `bg-white border ${colors.border} text-gray-600 hover:bg-gray-50`
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}


export default function Assessment() {
  const [step, setStep] = useState("entry");
  // The URL is the credential on this page; keep it out of the printed header.
  usePrintSafeUrl();
  // True when this visit began with an already-completed submission, which
  // changes the review page from "confirm and submit" to "look back".
  const [returningCompleted, setReturningCompleted] = useState(false);
  const [code, setCode] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [respondent, setRespondent] = useState(null);
  const [activities, setActivities] = useState([]);
  const [responses, setResponses] = useState({});
  const [currentFacetIndex, setCurrentFacetIndex] = useState(0);
  // The two closing questions. Held apart from `responses` because they are not
  // answers about an activity — they live on Respondent, and the wrap-up page
  // saves them on its own after the last facet has already marked the
  // respondent complete.
  const [closingComments, setClosingComments] = useState("");
  const [missingCoverage, setMissingCoverage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // One request at a time, latched in a ref rather than in `saving`.
  //
  // `disabled={saving}` only stops the second click once React has re-rendered
  // with the new state. Two taps in the same frame — a double tap on a phone,
  // or a touch and click pair from one press — both read the pre-render value
  // and both run. That is how two Respondent records came to exist for one
  // person 5ms apart, one of which then collected every answer while the other
  // stayed empty and read on the facilitator's roster as someone who never
  // responded. A ref is written and seen synchronously, so the second call
  // returns before it can create anything.
  const inFlight = useRef(false);
  const once = (fn) => async (...args) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      return await fn(...args);
    } finally {
      inFlight.current = false;
    }
  };
  const [allTitles, setAllTitles] = useState([]);
  // This person's own resume token. Held separately because the two entry
  // paths learn it differently: the code path generates it here at
  // registration, while the token path reads it from the URL — publicAssessment
  // deliberately never sends it back, since a respondent lookup shouldn't
  // return a credential the caller didn't already have.
  const [myToken, setMyToken] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  // Only the personal report uses these, and only once someone has finished, so
  // they are fetched lazily rather than on every page of the survey. Failure is
  // deliberately silent: an empty list drops the Suggested Resources section,
  // which is a section quietly missing rather than a broken report.
  const [resources, setResources] = useState([]);

  // Their token, held for this tab and kept out of the address.
  //
  // This used to write ?t=… into the address bar so the page could be
  // bookmarked, and the broadcast ?code=… removed so a bookmark could not start
  // a second registration. The first half is what iOS Safari then printed into
  // the footer of every sheet of their saved PDF — see lib/token-address.js.
  // The code still has to go: a reload carrying it would register them twice.
  const rememberToken = (token) => {
    setMyToken(token);
    claimToken("respondent", token, "/assess");
  };

  // Same reasoning as the buyer report: this page's summary is saved as a PDF,
  // and the browser names that file after the tab title. The assessment's own
  // name is what makes it findable later; the cover inside already carries the
  // person's, so it stays out of the filename.
  useEffect(() => {
    document.title = assessment?.title
      ? `${assessment.title} | Quartz Assessments`
      : "Assess | Quartz Assessments";
  }, [assessment?.title]);

  const isPersonalAssessment = assessment?.assessment_type === "personal";
  useEffect(() => {
    if (!isPersonalAssessment || step !== "done") return;
    base44.entities.Resource
      .filter({ active: true }, "sort_order")
      .then(setResources)
      .catch(() => setResources([]));
  }, [isPersonalAssessment, step]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    // Claimed, not read: the token moves into this tab's storage and out of the
    // address in the same step, before any paint that a print could capture. On
    // a reload of the cleaned address it comes back from storage, so refreshing
    // a survey still works.
    const urlToken = claimToken("respondent", params.get("t"), "/assess");

    if (urlToken) {
      loadFromToken(urlToken);
    } else if (urlCode) {
      // The code is the only thing the entry card collects, so a link that
      // carries one has nothing left to ask: validate it and go straight to
      // name and title.
      const normalized = urlCode.toUpperCase();
      setCode(normalized);
      setStep("loading");
      handleCodeSubmit(normalized);
    }
  }, []);

  // Activities, job titles and any answers this respondent already saved.
  // Shared by the resume path and the review-after-completing path.
  //
  // The answers arrive with the session rather than being fetched here. This
  // used to be Response.list() — every answer in the app — narrowed to one
  // respondent in the browser, which is a filter, not a permission: it needed
  // Response.read open to the world, and anyone who asked got the lot.
  // publicAssessment now returns only the rows belonging to the presented
  // token.
  const loadSurveyData = async (a, saved) => {
    const acts = await getAssignedActivities(a);
    setActivities(acts);
    const titles = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
    setAllTitles(titles.map(t => t.name));
    setResponses(rebuildResponses(saved || []));
  };

  const loadFromToken = async (t) => {
    setStep("loading");
    setMyToken(t);
    try {
      // The respondent token and its parent assessment are both resolved
      // server-side in one call.
      const session = await getRespondentSession(t);
      if (!session?.respondent) {
        setError("This link is no longer valid.");
        setStep("dead-end");
        return;
      }
      const r = session.respondent;
      const a = session.assessment;
      if (!a) {
        setError("This link is no longer valid.");
        setStep("dead-end");
        return;
      }

      setAssessment(a);
      setName(r.name);

      // Respondents self-register through the shared code link and are
      // created as "started", so there is no earlier state to promote from.
      setRespondent(r);
      // Anything they wrote on the wrap-up page last time, so revising brings
      // it back rather than presenting an empty box that would overwrite it.
      setClosingComments(r.closing_comments || "");
      setMissingCoverage(r.missing_coverage || "");

      // Someone returning to their own link after finishing can look back at
      // what they submitted. Their answers are loaded up front so the review
      // page is one click away, and this deliberately sits above the "closed"
      // check — once an assessment closes they can still see their own
      // answers, they just can't change them.
      if (r.status === "completed") {
        setReturningCompleted(true);
        if (r.title) setTitle(r.title);
        await loadSurveyData(a, session.responses);
        // Someone returning to a personal assessment came back for their
        // profile, so hand it straight to them rather than making them click
        // through a confirmation that tells them what they already know.
        setStep(a.assessment_type === "personal" ? "done" : "already-done");
        return;
      }

      // Closing a team assessment ends it for everyone — the aggregate has
      // been reported and late answers would move numbers already presented.
      //
      // A personal assessment is not the facilitator's to close on someone's
      // behalf. The profile is that person's own, they may well revise it
      // after seeing it, and locking them out of their development plan
      // because an engagement wrapped up would be the wrong default. Note
      // this only protects people who already have a token: handleCodeSubmit
      // still refuses *new* registrations once closed.
      if (a.status === "closed" && a.assessment_type !== "personal") {
        setError("This assessment is no longer accepting responses.");
        setStep("dead-end");
        return;
      }

      if (r.title) {
        // Has title — go straight to rating
        setTitle(r.title);
        await loadSurveyData(a, session.responses);
        setStep("rating");
      } else {
        // Needs title — show minimal intro
        setStep("token-intro");
      }
    } catch (e) {
      setError("Something went wrong. Please try again.");
      setStep("dead-end");
    }
  };

  const handleTokenIntroSubmit = once(async () => {
    setError("");
    if (!title.trim()) return setError("Please enter your job title.");
    setSaving(true);
    try {
      const updated = await base44.entities.Respondent.update(respondent.id, { title: title.trim() });
      setRespondent(updated);
      const acts = await getAssignedActivities(assessment);
      setActivities(acts);
      const titles = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
      setAllTitles(titles.map(t => t.name));
      setStep("rating");
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  });

  // Takes the code explicitly so the URL path can submit one before the state
  // update lands. A code they can fix by retyping sends them back to the entry
  // card; a closed assessment is a dead end, since the code was right and
  // trying it again changes nothing.
  const handleCodeSubmit = once(async (submitted = code) => {
    setError("");
    const retry = (message) => {
      setError(message);
      setStep("entry");
    };
    const deadEnd = (message) => {
      setError(message);
      setStep("dead-end");
    };
    if (!submitted.trim()) return retry("Please enter an assessment code.");
    setSaving(true);
    try {
      const result = await getAssessmentByCode(submitted);
      const found = result?.assessment;
      if (!found) return retry("Code not found. Please check and try again.");
      if (found.status === "closed") return deadEnd("This assessment is no longer accepting responses.");
      setAssessment(found);
      setStep("intro");
    } catch (e) {
      retry("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  });

  const handleIntroSubmit = once(async () => {
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!title.trim()) return setError("Please enter your job title.");
    setSaving(true);
    try {
      const token = crypto.randomUUID();
      const r = await base44.entities.Respondent.create({
        assessment_id: assessment.id,
        name: name.trim(),
        title: title.trim(),
        token,
        status: "started"
      });
      setRespondent(r);
      rememberToken(token);
      const acts = await getAssignedActivities(assessment);
      setActivities(acts);
      const titles = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
      setAllTitles(titles.map(t => t.name));
      setStep("rating");
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  });

  // Re-read this respondent's own answers from the session, for the revise
  // path. State already holds them, but a resumed tab can be looking at a
  // submission that was edited elsewhere since, and starting a revision from
  // stale answers would quietly re-save the old ones over the new.
  const loadExistingResponses = async () => {
    const session = await getRespondentSession(myToken);
    setResponses(rebuildResponses(session?.responses || []));
    // The wrap-up answers come back for the same reason the ratings do: a
    // revision that started from stale text would re-save the old text over
    // whatever is stored now.
    setClosingComments(session?.respondent?.closing_comments || "");
    setMissingCoverage(session?.respondent?.missing_coverage || "");
  };

  const handleRevise = async () => {
    // They're answering again, so the end of the flow should read as a fresh
    // submission rather than a look-back.
    setReturningCompleted(false);
    await base44.entities.Respondent.update(respondent.id, { status: "started" });
    await loadExistingResponses();
    setCurrentFacetIndex(0);
    setStep("rating");
  };

  const handleRatingChange = (activityId, field, value) => {
    setResponses(prev => ({
      ...prev,
      [activityId]: { ...prev[activityId], [field]: value }
    }));
  };

  // Which questions this assessment asks. Everything else about the flow —
  // code entry, facet paging, resume, review, submission — is identical, so
  // this is the only thing the two types disagree about.
  const isPersonal = assessment?.assessment_type === "personal";

  // The team assessment is only ever reported in aggregate. A personal
  // assessment is the opposite — it is read per person, and promising
  // anonymity here would be a promise the report breaks.
  //
  // It does not follow that the answers go to a manager, which is what this
  // line used to claim. Nothing pushes a profile anywhere: the team leader
  // dashboard shows a personal roster with names and status only, never answers
  // or resume tokens, and the report tells the person the PDF is theirs to
  // share. The intro was the one screen contradicting both.
  //
  // It also names no recipient. The same code fields the open lead-gen
  // assessments, where plenty of takers have no engagement behind them and no
  // manager they would want reading this, and suggesting one on the screen that
  // asks for the answers reads as a hint about who is watching. The report
  // still suggests a manager or a coach, once the profile exists and the choice
  // is concrete.
  const introBlurb = isPersonal
    ? "Your answers describe your own experience, skills and interests. The profile is yours to keep, and sharing it is your call."
    : "Your responses are confidential and will only be seen in aggregate by your team leader.";

  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));
  const currentFacet = availableFacets[currentFacetIndex];
  const facetActivities = activities.filter(a => a.facet === currentFacet);

const handleNext = once(async () => {
  setSaving(true);
  setError("");
  try {
    const isLastFacet = currentFacetIndex >= availableFacets.length - 1;

    // Answers keyed by activity, not by row id. The browser used to hold the
    // Response id and choose create or update for itself, which is how this
    // page came to depend on a write respondents are not permitted to make —
    // Response.rls.update is admin, org_admin and facilitator only, so every
    // second save of a page was refused. saveResponses resolves the token
    // server-side and upserts by activity instead. Only the fields this
    // assessment type asks about are sent; the function writes no others.
    const answers = facetActivities.map(activity => {
      const r = responses[activity.id] || {};
      return {
        activity_id: activity.id,
        ...(isPersonal
          ? Object.fromEntries(PERSONAL_AXES.map(a => [a.key, r[a.key] || null]))
          : {
              importance: r.importance || null,
              execution: r.execution || null,
              suggested_owner: r.suggested_owner || null
            }),
      };
    });

    // Completion travels with the last page's answers rather than as a second
    // call after it.
    await saveRespondentAnswers(myToken, answers, { complete: isLastFacet });

    if (!isLastFacet) {
      setCurrentFacetIndex(i => i + 1);
      window.scrollTo(0, 0);
    } else {
      // The wrap-up sits between the last facet and the review page, not after
      // it: the review page is the one people print and share, and free text
      // written for us has no business in a PDF that leaves the building.
      setStep("wrapup");
      window.scrollTo(0, 0);
    }
    } catch (e) {
      console.error("handleNext error:", e);
      setError("Error saving responses. Please try again.");
    }
    setSaving(false);
  });

  // Saving the wrap-up is a call of its own, with no answers attached: the
  // respondent was already marked complete by the last facet's save, so this
  // page can be skipped, failed or abandoned without costing them their
  // submission. That is also why a failure here does not block the review page
  // — losing an optional comment is not a reason to strand someone short of
  // the report they came for.
  const handleWrapup = once(async () => {
    setSaving(true);
    setError("");
    try {
      await saveRespondentAnswers(myToken, [], {
        feedback: {
          closing_comments: closingComments.trim(),
          missing_coverage: missingCoverage.trim(),
        },
      });
    } catch (e) {
      console.error("handleWrapup error:", e);
    }
    setSaving(false);
    setStep("done");
    window.scrollTo(0, 0);
  });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (step === "loading") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  // ── Dead end (bad token, or a closed assessment) ──────────────────────────
  // Message-only, with nothing to retry: whatever brought them here won't work
  // on a second attempt.
  if (step === "dead-end") return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm p-8 w-full max-w-md text-center">
          <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessment" className="h-10 w-10 mx-auto mb-4 object-contain" />
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    </div>
  );

  // ── Already done ──────────────────────────────────────────────────────────
  if (step === "already-done") return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all done{name ? `, ${name.split(" ")[0]}` : ""}!</h1>
          <p className="text-gray-500 mb-6">You've already completed this assessment. Thanks!</p>
          <button
            onClick={() => setStep("done")}
            className="border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            Review my responses
          </button>
        </div>
      </div>
    </div>
  );

  // ── Token-based intro (title only) ────────────────────────────────────────
  if (step === "token-intro") return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm p-8 w-full max-w-md">
          <div className="mb-8">
            <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessment" className="h-10 w-10 mb-3 object-contain" />
            <h1 className="text-2xl font-bold text-gray-900">Before we begin</h1>
            <p className="text-gray-500 mt-2">{introBlurb}</p>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Your name</label>
              <p className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">{name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">What's your title or role?</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleTokenIntroSubmit()}
                autoFocus
                className="w-full border border-gray-300 bg-white text-gray-900 placeholder-gray-400 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. Senior Product Manager"
              />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {/* Disabled while the request is out, and it says so. The latch above
              is what actually prevents a second registration; this is what stops
              someone tapping again because nothing appeared to happen. */}
          <button
            onClick={handleTokenIntroSubmit}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {saving ? "Starting…" : "Start Assessment"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Entry (access code) ───────────────────────────────────────────────────
  if (step === "entry") return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm p-8 w-full max-w-md">
          <div className="mb-8">
            <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessment" className="h-10 w-10 mb-3 object-contain" />
            <h1 className="text-2xl font-bold text-gray-900">Quartz Assessment</h1>
            <p className="text-gray-500 mt-2">Enter the code you received to begin.</p>
          </div>
          <input
            type="text"
            placeholder="Assessment code"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleCodeSubmit()}
            className="w-full border border-gray-300 bg-white text-gray-900 placeholder-gray-400 rounded-lg px-4 py-3 text-lg font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
          />
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <button
            onClick={() => handleCodeSubmit()}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {saving ? "Checking…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Intro (access-code flow) ──────────────────────────────────────────────
  if (step === "intro") return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm p-8 w-full max-w-md">
          <div className="mb-8">
            <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessment" className="h-10 w-10 mb-3 object-contain" />
            <h1 className="text-2xl font-bold text-gray-900">Before we begin</h1>
            <p className="text-gray-500 mt-2">{introBlurb}</p>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-gray-300 bg-white text-gray-900 placeholder-gray-400 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">What's your title or role?</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 bg-white text-gray-900 placeholder-gray-400 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. Senior Product Manager"
              />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {/* The one button on this page that creates a record. Registering
              twice makes two respondents out of one person, and only one of
              them ends up holding the answers. */}
          <button
            onClick={handleIntroSubmit}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {saving ? "Starting…" : "Start Assessment"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Rating ────────────────────────────────────────────────────────────────
  if (step === "rating") return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-1">Quartz · Product Assessment</p>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">{currentFacet}</h1>
            <span className="text-sm text-gray-400">{currentFacetIndex + 1} of {availableFacets.length}</span>
          </div>
          <div className="mt-3 h-1.5 bg-gray-200 rounded-full">
            <div
              className="h-1.5 bg-blue-500 rounded-full transition-all"
              style={{ width: `${((currentFacetIndex + 1) / availableFacets.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-4">
          {facetActivities.map(activity => {
            const r = responses[activity.id] || {};
            return (
              <div key={activity.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900">{activity.name}</h3>
                  {activity.description && <p className="text-sm text-gray-500 mt-0.5">{activity.description}</p>}
                </div>
                <div className="space-y-3">
                  {isPersonal ? PERSONAL_AXES.map(axis => (
                    <div key={axis.key}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{axis.label}</p>
                      <RatingButton
                        options={axis.options}
                        value={r[axis.key]}
                        onChange={val => handleRatingChange(activity.id, axis.key, val)}
                        colorMap={PERSONAL_COLORS[axis.key]}
                      />
                    </div>
                  )) : <>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Importance</p>
                    <RatingButton
                      options={IMPORTANCE_OPTIONS}
                      value={r.importance}
                      onChange={val => handleRatingChange(activity.id, "importance", val)}
                      colorMap={IMPORTANCE_COLORS}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Execution</p>
                    <RatingButton
                      options={EXECUTION_OPTIONS}
                      value={r.execution}
                      onChange={val => handleRatingChange(activity.id, "execution", val)}
                      colorMap={EXECUTION_COLORS}
                    />
                  </div>
                  {assessment?.roles?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Who should own this?</p>
                      <div className="space-y-2">
                        {assessment.roles.map(role => (
                          <label key={role} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name={`owner-${activity.id}`}
                              checked={r.suggested_owner === role}
                              onChange={() => handleRatingChange(activity.id, "suggested_owner", role)}
                              className="w-4 h-4 text-amber-500 border-gray-300 focus:ring-amber-400"
                            />
                            <span className="text-sm text-gray-700">{role}</span>
                          </label>
                        ))}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name={`owner-${activity.id}`}
                            checked={!!r.suggested_owner && !assessment.roles.includes(r.suggested_owner)}
                            onChange={() => {}}
                            className="w-4 h-4 text-amber-500 border-gray-300 focus:ring-amber-400"
                          />
                          <select
                            value={!!r.suggested_owner && !assessment.roles.includes(r.suggested_owner) ? r.suggested_owner : ""}
                            onChange={e => {
                              if (e.target.value) handleRatingChange(activity.id, "suggested_owner", e.target.value);
                            }}
                            className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400 text-gray-700"
                          >
                            <option value="">Other…</option>
                            {allTitles
                              .filter(t => !assessment.roles.includes(t))
                              .map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}
                  </>}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}

        <div className="mt-6 flex justify-between items-center">
          <div>
            {currentFacetIndex > 0 && (
              <button
                onClick={() => {
                  // Paging away clears any failed-save message. Back saves
                  // nothing, so a message left over from the page they are
                  // leaving would sit under a page it never described — which
                  // is how a save failure came to look like a Back button that
                  // reports an error.
                  setError("");
                  setCurrentFacetIndex(i => i - 1);
                  window.scrollTo(0, 0);
                }}
                disabled={saving}
                className="text-gray-500 hover:text-gray-800 disabled:opacity-50 font-medium px-4 py-3 rounded-lg transition-colors"
              >
                ← Back
              </button>
            )}
          </div>
          <button
            onClick={handleNext}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            {/* "Finish and review" rather than "Preview your responses": answers
                are saved as they are given in both flows, so nothing here is a
                preview of something not yet committed. It also has to fit two
                different destinations — the personal profile report and the team
                gap answer table — so it names the moment rather than the page. */}
            {saving ? "Saving..." : currentFacetIndex < availableFacets.length - 1 ? "Next →" : "Finish and review"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Wrap-up ───────────────────────────────────────────────────────────────
  //
  // Two optional questions after the last facet, and the only free text the
  // survey collects. Both exist to improve the instrument: the first catches
  // whatever the rating scales had no room for, and the second asks — in the
  // respondent's own language rather than a survey designer's — for work the
  // activity library is missing.
  //
  // The note about where these go is not decoration. The intro screen promises
  // a team respondent that their answers are "seen in aggregate by your team
  // leader", and a paragraph of free text cannot be aggregated and is often
  // recognisable as its author. These answers are held to a narrower promise
  // instead, and the page has to say so where it asks.
  if (step === "wrapup") return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-1">Quartz · Product Assessment</p>
          <h1 className="text-xl font-bold text-gray-900">Two last questions</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Both are optional. They go to the Quartz team, who use them to make the
            assessment better — they are not part of {isPersonal ? "your profile" : "your team's report"}.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label htmlFor="closing-comments" className="block font-semibold text-gray-900 mb-1">
              What else do you want to tell us?
            </label>
            <p className="text-sm text-gray-500 mb-3">Anything the questions above didn't give you room to say.</p>
            <textarea
              id="closing-comments"
              value={closingComments}
              onChange={e => setClosingComments(e.target.value)}
              maxLength={2000}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label htmlFor="missing-coverage" className="block font-semibold text-gray-900 mb-1">
              Is there anything you do in your role that we didn't ask about?
            </label>
            <p className="text-sm text-gray-500 mb-3">Work that matters but never came up in the questions.</p>
            <textarea
              id="missing-coverage"
              value={missingCoverage}
              onChange={e => setMissingCoverage(e.target.value)}
              maxLength={2000}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-6">
          <button
            onClick={() => { setStep("done"); window.scrollTo(0, 0); }}
            disabled={saving}
            className="text-gray-500 hover:text-gray-800 disabled:opacity-50 font-medium px-4 py-3 rounded-lg transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleWrapup}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === "done") {
    // Computed once here rather than inside the quadrant block, because the
    // detail section's heading needs the same count.
    const personalProfile = isPersonal
      ? computePersonProfile(
          activities,
          // Local answer state is keyed by activity; computePersonProfile
          // wants Response-shaped rows.
          activities.map(act => ({
            ...(responses[act.id] || {}),
            activity_id: act.id,
            respondent_id: respondent?.id,
          })),
          respondent?.id,
        )
      : null;
    const hasProfile = (personalProfile?.answeredCount ?? 0) > 0;

    // The personal report is a five-part advisory document and lives in its own
    // component. What follows below is the team gap confirmation, which is a
    // different thing with a different job: confirm what you sent, then submit.
    if (isPersonal && hasProfile) {
      return (
        <div className="min-h-screen bg-gray-50 print-plain">
          <div className="max-w-3xl mx-auto px-4 py-10">
            <PersonalProfileReport
              profile={personalProfile}
              activities={activities}
              assessment={assessment}
              respondent={respondent}
              name={name}
              title={title}
              myToken={myToken}
              returningCompleted={returningCompleted}
              onRevise={handleRevise}
              onCopyLink={() => {
                navigator.clipboard.writeText(resumeLinkFor(myToken));
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              copiedLink={copiedLink}
              resources={resources}
            />
          </div>
        </div>
      );
    }

    return (
      <TeamGapSelfReport
        myToken={myToken}
        onCopyLink={() => {
          navigator.clipboard.writeText(resumeLinkFor(myToken));
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2000);
        }}
        copiedLink={copiedLink}
        assessment={assessment}
        respondent={respondent}
        name={name}
        title={title}
        activities={activities}
        responses={responses}
        isPersonal={isPersonal}
        returningCompleted={returningCompleted}
        onRevise={handleRevise}
        onDone={() => setStep(returningCompleted ? "already-done" : "thankyou")}
      />
    );
  }

  if (step === "thankyou") return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm p-10 w-full max-w-md text-center">
          <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessment" className="h-10 w-10 mx-auto mb-6 object-contain" />
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Thank you, {name ? name.split(" ")[0] : ""}!
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Thanks for completing this assessment. We look forward to working with you and your team.
          </p>
        </div>
      </div>
    </div>
  );
}