import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ActivityLogger } from "@/utils/activityLogger";
import { getAssignedActivities } from "@/lib/activities";

const HERO_IMAGE = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/2ffc15b8c_curated-lifestyle-H3ZVdxBRIW0-unsplash.jpg";

const IMPORTANCE_OPTIONS = ["Not needed", "Nice to have", "Important", "Critical"];
const EXECUTION_OPTIONS = ["Not done", "Inconsistent", "Good", "Excellent", "I don't know"];
const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

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

  const loadFromToken = async (t) => {
    setStep("loading");
    try {
      const respondents = await base44.entities.Respondent.filter({ token: t });
      if (!respondents || respondents.length === 0) {
        setError("This link is no longer valid.");
        setStep("token-error");
        return;
      }
      const r = respondents[0];

      if (r.status === "completed") {
        setName(r.name);
        setStep("already-done");
        return;
      }

      // Load parent assessment
      const assessments = await base44.entities.Assessment.list();
      const a = assessments.find(a => a.id === r.assessment_id);
      if (!a) {
        setError("This link is no longer valid.");
        setStep("token-error");
        return;
      }
      if (a.status === "closed") {
        setError("This assessment is no longer accepting responses.");
        setStep("token-error");
        return;
      }

      setAssessment(a);
      setName(r.name);

      // Mark as started if still invited
      let updatedRespondent = r;
      if (r.status === "invited") {
        updatedRespondent = await base44.entities.Respondent.update(r.id, { status: "started" });
      }
      setRespondent(updatedRespondent);

      if (r.title) {
        // Has title — go straight to rating
        setTitle(r.title);
        const acts = await getAssignedActivities(a);
        setActivities(acts);
        const titles = await base44.entities.JobTitle.filter({ active: true }, "sort_order");
        setAllTitles(titles.map(t => t.name));
        // Pre-populate any previously saved answers
        const allResponses = await base44.entities.Response.list();
        const saved = allResponses.filter(resp => resp.respondent_id === r.id);
        const rebuilt = {};
        for (const resp of saved) {
          rebuilt[resp.activity_id] = {
            id: resp.id,
            importance: resp.importance || "",
            execution: resp.execution || "",
            suggested_owner: resp.suggested_owner || ""
          };
        }
        setResponses(rebuilt);
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
      const allAssessments = await base44.entities.Assessment.list();
      const found = allAssessments.find(a => a.access_code === code.trim().toUpperCase());
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
    const rebuilt = {};
    for (const r of saved) {
      rebuilt[r.activity_id] = {
        id: r.id,
        importance: r.importance || "",
        execution: r.execution || "",
        suggested_owner: r.suggested_owner || ""
      };
    }
    setResponses(rebuilt);
  };

  const handleRevise = async () => {
    ActivityLogger.log('action', { event: 'revise_started' });
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
    ActivityLogger.log('action', {
      event: 'answer_selected',
      facet: currentFacet,
      activityId,
      [field]: value
    });
  };

  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));
  const currentFacet = availableFacets[currentFacetIndex];
  const facetActivities = activities.filter(a => a.facet === currentFacet);

const handleNext = async () => {
  setSaving(true);
  setError("");
  try {
    for (const activity of facetActivities) {
      const r = responses[activity.id] || {};
      const payload = {
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
        const fullLog = ActivityLogger.getLog();
        const assessLog = fullLog.filter(e =>
          e.type === 'error' ||
          e.type === 'action' ||
          (e.type === 'nav' && e.path && e.path.startsWith('/assess'))
        );
        await base44.entities.Respondent.update(respondent.id, {
          status: "completed",
          completed_date: new Date().toISOString(),
          activity_log: JSON.stringify(assessLog)
        });
        setStep("done");
      }
    } catch (e) {
      console.error("handleNext error:", e);
      ActivityLogger.log('error', { message: e?.message || String(e), context: 'handleNext' });
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
          <p className="text-gray-500">You've already completed this assessment. Thanks!</p>
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
            <p className="text-gray-500 mt-2">Your responses are confidential and will only be seen in aggregate by your team leader.</p>
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
            <p className="text-gray-500 mt-2">Your responses are confidential and will only be seen in aggregate by your team leader.</p>
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
                  ActivityLogger.log('action', { event: 'nav_button', label: 'back', fromFacet: currentFacet, pageIndex: currentFacetIndex });
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
            onClick={() => {
              ActivityLogger.log('action', { event: 'nav_button', label: currentFacetIndex < availableFacets.length - 1 ? 'next' : 'submit', fromFacet: currentFacet, pageIndex: currentFacetIndex });
              handleNext();
            }}
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

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Thank you, {name}!</h1>
              <p className="text-sm text-gray-500">Your responses have been recorded. Here's a summary of what you submitted.</p>
            </div>
          </div>

          {/* Summary table grouped by facet */}
          {availableFacets.map(facet => {
            const facetActs = activities.filter(a => a.facet === facet);
            return (
              <div key={facet} className="mb-6">
                <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 px-1">{facet}</div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-2/5">Activity</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>Importance</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>Execution</th>
                        {assessment?.roles?.length > 0 && (
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Owner</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {facetActs.map((activity, idx) => {
                        const r = responses[activity.id] || {};
                        return (
                          <tr key={activity.id} className={idx < facetActs.length - 1 ? "border-b border-gray-50" : ""}>
                            <td className="px-4 py-3 text-gray-800 font-medium align-middle">{activity.name}</td>
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="flex justify-center gap-4 mt-8 mb-4">
            <button
              onClick={handleRevise}
              className="border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              ← Revise my answers
            </button>
            <button
              onClick={() => setStep("thankyou")}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              Submit
              </button>
              </div>
              <p className="text-center text-xs text-gray-400">Your feedback will help shape the team's professional development plan.</p>
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