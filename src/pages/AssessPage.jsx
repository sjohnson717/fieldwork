import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { getAssessmentByCode, getRespondentSession } from "@/lib/public-assessment";
import { PERSONAL_AXES, computePersonProfile } from "@/lib/personal-scoring";
import { FACET_ORDER, IMPORTANCE_BADGE, EXECUTION_BADGE, BADGE_FALLBACK } from "@/lib/scoring";
import PersonalProfileReport from "@/components/PersonalProfileReport";
import TeamGapSelfSummary from "@/components/TeamGapSelfSummary";
import PrintCredit from "@/components/PrintCredit";
import { computeSelfGapProfile } from "@/lib/self-gap";

const QUARTZ_ICON = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png";
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

// Both assessment types load and save the same Response record, so state is
// rebuilt for every field either type uses rather than branching here. The
// unused half is empty strings, which never reach the server: handleNext sends
// null for anything blank.
const ANSWER_FIELDS = ["importance", "execution", "suggested_owner", ...PERSONAL_AXES.map(a => a.key)];

const rebuildResponses = (saved) => {
  const rebuilt = {};
  for (const resp of saved) {
    const entry = { id: resp.id };
    for (const f of ANSWER_FIELDS) entry[f] = resp[f] || "";
    rebuilt[resp.activity_id] = entry;
  }
  return rebuilt;
};

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


export default function AssessPage() {
  const [step, setStep] = useState("entry");
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
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

  // Swap ?code=… for ?t=… once we know who this is, so the address bar holds
  // their personal link rather than the broadcast one. Without this, anyone
  // bookmarking the page they registered on gets the shared code link back,
  // which starts a brand new registration — the URL is the only credential in
  // this design, so it has to actually be in the URL.
  const rememberInUrl = (token) => {
    setMyToken(token);
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.set("t", token);
    window.history.replaceState({}, "", url);
  };

  useEffect(() => { document.title = "Assess | Quartz Assessment"; }, []);

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
    const urlToken = params.get("t");

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
  const loadSurveyData = async (a, respondentId) => {
    const acts = await getAssignedActivities(a);
    setActivities(acts);
    const titles = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
    setAllTitles(titles.map(t => t.name));

    const allResponses = await base44.entities.Response.list();
    const saved = allResponses.filter(resp => resp.respondent_id === respondentId);
    setResponses(rebuildResponses(saved));
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

      // Someone returning to their own link after finishing can look back at
      // what they submitted. Their answers are loaded up front so the review
      // page is one click away, and this deliberately sits above the "closed"
      // check — once an assessment closes they can still see their own
      // answers, they just can't change them.
      if (r.status === "completed") {
        setReturningCompleted(true);
        if (r.title) setTitle(r.title);
        await loadSurveyData(a, r.id);
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
        await loadSurveyData(a, r.id);
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

  const handleTokenIntroSubmit = async () => {
    setError("");
    if (!title.trim()) return setError("Please enter your job title.");
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
    }
  };

  // Takes the code explicitly so the URL path can submit one before the state
  // update lands. A code they can fix by retyping sends them back to the entry
  // card; a closed assessment is a dead end, since the code was right and
  // trying it again changes nothing.
  const handleCodeSubmit = async (submitted = code) => {
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
    try {
      const result = await getAssessmentByCode(submitted);
      const found = result?.assessment;
      if (!found) return retry("Code not found. Please check and try again.");
      if (found.status === "closed") return deadEnd("This assessment is no longer accepting responses.");
      setAssessment(found);
      setStep("intro");
    } catch (e) {
      retry("Something went wrong. Please try again.");
    }
  };

  const handleIntroSubmit = async () => {
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!title.trim()) return setError("Please enter your job title.");
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
      rememberInUrl(token);
      const acts = await getAssignedActivities(assessment);
      setActivities(acts);
      const titles = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
      setAllTitles(titles.map(t => t.name));
      setStep("rating");
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }
  };

  const loadExistingResponses = async () => {
    const allResponses = await base44.entities.Response.list();
    const saved = allResponses.filter(r => r.respondent_id === respondent.id);
    setResponses(rebuildResponses(saved));
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

const handleNext = async () => {
  setSaving(true);
  setError("");
  try {
    for (const activity of facetActivities) {
      const r = responses[activity.id] || {};
      // Only the fields this assessment type asks about are written. Sending
      // the other type's fields as null would be harmless on a fresh record
      // but would wipe real answers if an assessment's type were ever changed
      // after responses existed.
      const payload = isPersonal
        ? Object.fromEntries(PERSONAL_AXES.map(a => [a.key, r[a.key] || null]))
        : {
            importance: r.importance || null,
            execution: r.execution || null,
            suggested_owner: r.suggested_owner || null
          };

      const existingId = r.id; // use the id already in state, loaded at init
      if (existingId) {
        await base44.entities.Response.update(existingId, payload);
      } else {
        const created = await base44.entities.Response.create({
          assessment_id: assessment.id,
          respondent_id: respondent.id,
          activity_id: activity.id,
          ...payload
        });
        // Store the new id in state so a second Next on this page also updates
        setResponses(prev => ({
          ...prev,
          [activity.id]: { ...prev[activity.id], id: created.id }
        }));
      }
    }

      if (currentFacetIndex < availableFacets.length - 1) {
        setCurrentFacetIndex(i => i + 1);
        window.scrollTo(0, 0);
      } else {
        await base44.entities.Respondent.update(respondent.id, {
          status: "completed",
          completed_date: new Date().toISOString()
        });
        setStep("done");
      }
    } catch (e) {
      console.error("handleNext error:", e);
      setError("Error saving responses. Please try again.");
    }
    setSaving(false);
  };

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
          <button
            onClick={handleTokenIntroSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Start Assessment
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Continue
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
          <button
            onClick={handleIntroSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Start Assessment
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

    // Same trick for the team gap side: local answer state keyed by activity,
    // reshaped into the Response rows the profile wants.
    const selfGapProfile = !isPersonal
      ? computeSelfGapProfile(
          activities,
          activities.map(act => ({ ...(responses[act.id] || {}), activity_id: act.id })),
          availableFacets,
        )
      : null;

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
                navigator.clipboard.writeText(`${window.location.origin}/assess?t=${myToken}`);
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
      <div className="min-h-screen bg-gray-50 print-plain">
        <div className="max-w-3xl mx-auto px-4 py-10">
          {/* Paper-only header: the on-screen one is conversational and has no
              assessment name or date, which a saved PDF needs to be useful. */}
          <div className="print-only print-cover mb-6">
            <img src={QUARTZ_ICON} alt="" className="h-8 w-8 mb-4 object-contain" />
            <h1 className="text-xl font-bold text-gray-900">{assessment?.title}</h1>
            {assessment?.company_name && (
              <p className="text-sm text-gray-600">{assessment.company_name}</p>
            )}
            <p className="text-sm text-gray-600 mt-2">
              {name}{title ? ` · ${title}` : ""}
            </p>
            {/* The submission date, not the print date — this is a record of
                what they said and when. Revising re-stamps it, so a reprinted
                copy always matches the answers shown on it.
                When someone has just submitted, "now" is the submission time.
                When they're revisiting and the stored date is missing, print
                no date at all: guessing today would date a week-old
                submission as though it were made this morning. */}
            {(() => {
              const submitted = respondent?.completed_date
                ? new Date(respondent.completed_date)
                : returningCompleted ? null : new Date();
              if (!submitted) return null;
              return (
                <p className="text-xs text-gray-500">
                  Submitted {submitted.toLocaleDateString(undefined, {
                    year: "numeric", month: "long", day: "numeric"
                  })}
                </p>
              );
            })()}
            <PrintCredit />
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 mb-8 no-print">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {returningCompleted ? `Your responses, ${name}` : `Thank you, ${name}!`}
              </h1>
              <p className="text-sm text-gray-500">
                {!returningCompleted
                  ? "Your responses have been recorded. Here's a summary of what you submitted."
                  : assessment?.status === "closed"
                    ? "Here's what you submitted. This assessment is now closed, so your answers can't be changed."
                    : "Here's what you submitted. You can still change any of it."}
              </p>
            </div>
          </div>

          {/* The summary of what they said, above the answers themselves —
              the same order as the personal report. Suppressed when nothing is
              classifiable, which leaves the page as the plain confirmation it
              used to be rather than a run of empty sections. */}
          {selfGapProfile?.answeredCount > 0 && (
            <TeamGapSelfSummary profile={selfGapProfile} />
          )}

          {/* The detail tables get their own titled section. It used to be a
              one-line "your full answers are below" tacked onto the end of the
              profile — which then sat at the foot of a page introducing
              something overleaf, so the next page opened with a bare facet
              label and no idea what it belonged to. A real heading pinned to
              what follows fixes that without a forced page break. */}
          {selfGapProfile?.answeredCount > 0 && (
            <div className="print-section mb-5 pt-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Appendix</p>
              <h2 className="text-lg font-bold text-gray-900">Your responses</h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                All {activities.length} {activities.length === 1 ? "activity" : "activities"}, and how you rated each one.
              </p>
            </div>
          )}

          {/* Summary table grouped by facet */}
          {availableFacets.map(facet => {
            const facetActs = activities.filter(a => a.facet === facet);
            return (
              <div key={facet} className="mb-6">
                <div className="facet-heading text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 px-1">{facet}</div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-2/5">Activity</th>
                        {isPersonal ? PERSONAL_AXES.map(axis => (
                          // Centred to sit over the pills below rather than
                          // hanging off their left edge.
                          <th key={axis.key} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>{axis.label}</th>
                        )) : <>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>Importance</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>Execution</th>
                        {assessment?.roles?.length > 0 && (
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Suggested owner</th>
                        )}
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {facetActs.map((activity, idx) => {
                        const r = responses[activity.id] || {};
                        return (
                          <tr key={activity.id} className={idx < facetActs.length - 1 ? "border-b border-gray-50" : ""}>
                            <td className="px-4 py-3 text-gray-800 font-medium align-middle">{activity.name}</td>
                            {isPersonal ? PERSONAL_AXES.map(axis => (
                              <td key={axis.key} className="px-3 py-3 align-middle text-center" style={{ width: '120px' }}>
                                {r[axis.key]
                                  ? <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" style={{ width: '104px', textAlign: 'center' }}>{r[axis.key]}</span>
                                  : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                            )) : <>
                            <td className="px-3 py-3 align-middle" style={{ width: '120px' }}>
                              {r.importance
                                ? <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${IMPORTANCE_BADGE[r.importance] || BADGE_FALLBACK}`} style={{ width: '110px', textAlign: 'center' }}>{r.importance}</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-3 align-middle" style={{ width: '120px' }}>
                              {r.execution
                                ? <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${EXECUTION_BADGE[r.execution] || BADGE_FALLBACK}`} style={{ width: '110px', justifyContent: 'center' }}>{r.execution}</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            {assessment?.roles?.length > 0 && (
                              <td className="px-3 py-3 text-gray-600 text-xs align-middle whitespace-nowrap">{r.suggested_owner || <span className="text-gray-300">—</span>}</td>
                            )}
                            </>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Team gap only: the personal report closes itself, inside its own
              component, after the same tables. */}
          {!isPersonal && <PrintCredit />}

          {/* Team gap only. A personal assessment carries its actions above the
              answers table instead, and duplicating them here would put two
              copies of the resume link on one page — the one control on this
              page that hands over write access to someone's answers. */}
          {!isPersonal && (
            <>
              <div className="flex flex-wrap justify-center gap-4 mt-8 mb-4 no-print">
                {/* window.print() rather than a PDF library: every print dialog
                    offers "Save as PDF", and the result is real selectable text
                    instead of a screenshot. */}
                <button
                  onClick={() => window.print()}
                  className="font-medium px-6 py-2.5 rounded-lg transition-colors text-sm border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800"
                >
                  Save as PDF
                </button>
                {/* A closed team assessment is read-only, even to someone
                    reviewing their own submission. */}
                {assessment?.status !== "closed" && (
                  <button
                    onClick={handleRevise}
                    className="border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                  >
                    ← Revise my answers
                  </button>
                )}
                {/* "Done", not "Submit": submission already happened on the last
                    facet page, which wrote the responses and stamped the
                    respondent completed. This button only advances the screen, so
                    naming it after a write implies answers are lost by closing
                    the tab here — and the neighbouring Revise button is the one
                    that actually writes. */}
                <button
                  onClick={() => setStep(returningCompleted ? "already-done" : "thankyou")}
                  className="font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {returningCompleted ? "Close" : "Done"}
                </button>
              </div>
              {!returningCompleted && (
                <p className="text-center text-xs text-gray-400">Your feedback will help shape the team's professional development plan.</p>
              )}
            </>
          )}
        </div>
      </div>
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