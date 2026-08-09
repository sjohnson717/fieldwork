import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { getAssessmentByCode, getRespondentSession } from "@/lib/public-assessment";
import {
  PERSONAL_AXES,
  QUADRANTS,
  computePersonProfile,
  dominantBucket,
  DOMINANT_SUMMARY,
} from "@/lib/personal-scoring";
import { FACET_ORDER } from "@/lib/scoring";

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
  const [arrivedWithCode, setArrivedWithCode] = useState(false);
  // This person's own resume token. Held separately because the two entry
  // paths learn it differently: the code path generates it here at
  // registration, while the token path reads it from the URL — publicAssessment
  // deliberately never sends it back, since a respondent lookup shouldn't
  // return a credential the caller didn't already have.
  const [myToken, setMyToken] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    const urlToken = params.get("t");

    if (urlToken) {
      loadFromToken(urlToken);
    } else if (urlCode) {
      setCode(urlCode.toUpperCase());
      setArrivedWithCode(true);
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
        setStep("token-error");
        return;
      }
      const r = session.respondent;
      const a = session.assessment;
      if (!a) {
        setError("This link is no longer valid.");
        setStep("token-error");
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
        setStep("token-error");
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
      setStep("token-error");
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

  const handleCodeSubmit = async () => {
    setError("");
    if (!code.trim()) return setError("Please enter an assessment code.");
    try {
      const result = await getAssessmentByCode(code);
      const found = result?.assessment;
      if (!found) return setError("Code not found. Please check and try again.");
      if (found.status === "closed") return setError("This assessment is no longer accepting responses.");
      setAssessment(found);
      setStep("intro");
    } catch (e) {
      setError("Something went wrong. Please try again.");
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
  const introBlurb = isPersonal
    ? "Your answers describe your own experience, skills and interests. They're shared with your team leader to shape assignments and development plans."
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

  // ── Token error ───────────────────────────────────────────────────────────
  if (step === "token-error") return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm p-8 w-full max-w-md text-center">
          <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessments" className="h-10 w-10 mx-auto mb-4 object-contain" />
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
            <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessments" className="h-10 w-10 mb-3 object-contain" />
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
            <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessments" className="h-10 w-10 mb-3 object-contain" />
            <h1 className="text-2xl font-bold text-gray-900">Quartz Assessments</h1>
            <p className="text-gray-500 mt-2">{arrivedWithCode ? "Press continue to begin." : "Enter the code you received to begin."}</p>
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
            onClick={handleCodeSubmit}
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
            <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessments" className="h-10 w-10 mb-3 object-contain" />
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
            {saving ? "Saving..." : currentFacetIndex < availableFacets.length - 1 ? "Next →" : "Preview your responses"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === "done") {
    const IMPORTANCE_BADGE = {
      "Not needed":   "bg-gray-100 text-gray-600",
      "Nice to have": "bg-blue-100 text-blue-700",
      "Important":    "bg-blue-500 text-white",
      "Critical":     "bg-blue-800 text-white",
    };
    const EXECUTION_BADGE = {
      "Not done":     "bg-rose-100 text-rose-700",
      "Inconsistent": "bg-amber-100 text-amber-800",
      "Good":         "bg-green-100 text-green-700",
      "Excellent":    "bg-green-600 text-white",
    };

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

    return (
      <div className="min-h-screen bg-gray-50 print-plain">
        <div className="max-w-3xl mx-auto px-4 py-10">
          {/* Paper-only header: the on-screen one is conversational and has no
              assessment name or date, which a saved PDF needs to be useful. */}
          <div className="print-only mb-6">
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
                {isPersonal
                  ? `Your profile, ${name.split(" ")[0]}`
                  : returningCompleted ? `Your responses, ${name}` : `Thank you, ${name}!`}
              </h1>
              <p className="text-sm text-gray-500">
                {isPersonal
                  // No mention of the assessment's status: this is theirs, and
                  // it stays available and editable whatever the facilitator's
                  // engagement is doing.
                  // Says "saved" explicitly because there is no Submit button on
                  // this page. Without a final action to press, silence about
                  // whether anything was recorded reads as an unfinished form.
                  ? "Your answers are saved. This is yours to keep — save it as a PDF to share with your manager or a coach, and come back and change any answer whenever you like."
                  : !returningCompleted
                    ? "Your responses have been recorded. Here's a summary of what you submitted."
                    : assessment?.status === "closed"
                      ? "Here's what you submitted. This assessment is now closed, so your answers can't be changed."
                      : "Here's what you submitted. You can still change any of it."}
              </p>
            </div>
          </div>

          {/* The profile itself. This is the payoff for having answered, and
              it sits above the raw answer table because almost nobody comes
              back for it later — it has to land now, at submission, or not at
              all. Quadrant wording here is the person-facing set; see
              QUADRANTS in personal-scoring.js for why it differs from the
              facilitator's. */}
          {hasProfile && (() => {
            const profile = personalProfile;
            const dominant = dominantBucket(profile);

            return (
              <div className="mb-8 space-y-4">
                {/* When one bucket holds two thirds of the answers, that shape
                    is the finding — say it before the lists, or the person
                    reads a long column as a tally of shortfalls. */}
                {dominant && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 break-inside-avoid">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {DOMINANT_SUMMARY[dominant.key](dominant.count, profile.answeredCount)}
                    </p>
                  </div>
                )}
                {Object.entries(QUADRANTS).map(([key, q]) => {
                  const bucket = profile.buckets[key];
                  if (bucket.length === 0) return null;
                  return (
                    <section key={key} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${q.selfAccent} p-5 break-inside-avoid`}>
                      <h2 className={`text-base font-semibold ${q.selfHeading}`}>{q.selfLabel}</h2>
                      <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">{q.selfHint}</p>
                      <ul className="space-y-1.5">
                        {bucket.map(row => (
                          <li key={row.activity.id} className="flex items-baseline gap-2 text-sm">
                            <span className="flex-1 text-gray-800 leading-snug">{row.activity.name}</span>
                            <span className="text-[10px] text-gray-400 shrink-0">{row.activity.facet}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            );
          })()}

          {/* Keeping the report's own actions with the report, above the answers
              table rather than after it. They used to sit at the very bottom,
              which on a 24-activity assessment put the PDF button and the resume
              link below 24 rows of detail — so the two things this page exists to
              hand over were the least findable things on it. */}
          {isPersonal && (
            <div className="no-print mb-8 space-y-3">
              <div className="flex flex-wrap gap-3">
                {/* window.print() rather than a PDF library: every print dialog
                    offers "Save as PDF", and the result is real selectable text
                    instead of a screenshot. Deliberately a PDF and not their
                    link: the token permits editing, so forwarding it would hand
                    a manager write access to someone's own self-assessment. */}
                <button
                  onClick={() => window.print()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                >
                  Save as PDF to share
                </button>
                <button
                  onClick={handleRevise}
                  className="border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                >
                  ← Revise my answers
                </button>
              </div>
              {/* Shown, not just implied by the address bar — the address bar is
                  where the wrong link lived for a week and nobody noticed.
                  no-print is deliberate: this link opens and edits their answers,
                  and the PDF is the thing they hand to a manager. It must never
                  be printed into the artefact they share. */}
              {myToken && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">
                    Bookmark your own link to come back to this and update it at any time. It's yours — anyone with it can change your answers.
                  </p>
                  <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 max-w-lg">
                    <p className="text-[11px] text-gray-500 font-mono flex-1 truncate">
                      {`${window.location.origin}/assess?t=${myToken}`}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/assess?t=${myToken}`);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      {copiedLink ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* The detail tables get their own titled section starting on a
              fresh page. This used to be a one-line "your full answers are
              below" tacked onto the end of the profile — which then sat at the
              foot of page one introducing something overleaf, so page two
              opened with a bare facet label and no idea what it belonged to.
              print-section-break is print-only, so on screen this is just a
              heading and the page keeps flowing. */}
          {hasProfile && (
            <div className="print-section-break mb-5 pt-1">
              <h2 className="text-lg font-bold text-gray-900">Activities you rated</h2>
              <p className="text-xs text-gray-500 mt-1">
                All {personalProfile.answeredCount} {personalProfile.answeredCount === 1 ? "activity" : "activities"}, and how you rated each one.
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
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Owner</th>
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
                                ? <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${IMPORTANCE_BADGE[r.importance] || "bg-gray-100 text-gray-600"}`} style={{ width: '110px', textAlign: 'center' }}>{r.importance}</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-3 align-middle" style={{ width: '120px' }}>
                              {r.execution
                                ? <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${EXECUTION_BADGE[r.execution] || "bg-gray-100 text-gray-600"}`} style={{ width: '110px', justifyContent: 'center' }}>{r.execution}</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            {assessment?.roles?.length > 0 && (
                              <td className="px-3 py-3 text-gray-600 text-xs align-middle">{r.suggested_owner || <span className="text-gray-300">—</span>}</td>
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
                <button
                  onClick={() => setStep(returningCompleted ? "already-done" : "thankyou")}
                  className="font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {returningCompleted ? "Close" : "Submit"}
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
          <img src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png" alt="Quartz Assessments" className="h-10 w-10 mx-auto mb-6 object-contain" />
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