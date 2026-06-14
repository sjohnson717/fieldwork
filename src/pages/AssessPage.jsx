import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";

const IMPORTANCE_OPTIONS = ["Not needed", "Nice to have", "Important", "Critical"];
const EXECUTION_OPTIONS = ["Not done", "Inconsistent", "Good", "Excellent"];
const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

function RatingButton({ options, value, onChange, colorClass }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
            value === opt
              ? `${colorClass} text-white border-transparent`
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          }`}
        >
          {opt}
        </button>
      ))}
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    const urlToken = params.get("t");

    if (urlToken) {
      loadFromToken(urlToken);
    } else if (urlCode) {
      setCode(urlCode.toUpperCase());
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
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
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

  const handleRatingChange = (activityId, field, value) => {
    setResponses(prev => ({
      ...prev,
      [activityId]: { ...prev[activityId], [field]: value }
    }));
  };

  const currentFacet = FACET_ORDER[currentFacetIndex];
  const facetActivities = activities.filter(a => a.facet === currentFacet);
  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));

  const handleNext = async () => {
    setSaving(true);
    setError("");
    try {
      for (const activity of facetActivities) {
        const r = responses[activity.id] || {};
        await base44.entities.Response.create({
          assessment_id: assessment.id,
          respondent_id: respondent.id,
          activity_id: activity.id,
          importance: r.importance || "",
          execution: r.execution || "",
          suggested_owner: r.suggested_owner || ""
        });
      }
      if (currentFacetIndex < availableFacets.length - 1) {
        setCurrentFacetIndex(i => i + 1);
        window.scrollTo(0, 0);
      } else {
        // Mark as completed
        await base44.entities.Respondent.update(respondent.id, {
          status: "completed",
          completed_date: new Date().toISOString()
        });
        setStep("done");
      }
    } catch (e) {
      setError("Error saving responses. Please try again.");
    }
    setSaving(false);
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (step === "loading") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  // ── Token error ───────────────────────────────────────────────────────────
  if (step === "token-error") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md text-center">
        <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-4">Product Growth Leaders</p>
        <p className="text-gray-500">{error}</p>
      </div>
    </div>
  );

  // ── Already done ──────────────────────────────────────────────────────────
  if (step === "already-done") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all done{name ? `, ${name.split(" ")[0]}` : ""}!</h1>
        <p className="text-gray-500">You've already completed this assessment. Thanks!</p>
      </div>
    </div>
  );

  // ── Token-based intro (title only) ────────────────────────────────────────
  if (step === "token-intro") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md">
        <div className="mb-8">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-1">Product Growth Leaders</p>
          <h1 className="text-2xl font-bold text-gray-900">Before we begin</h1>
          <p className="text-gray-500 mt-2">Your responses are confidential and will only be seen in aggregate by your team leader.</p>
        </div>
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <p className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">{name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What's your title or role?</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTokenIntroSubmit()}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Senior Product Manager"
            />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          onClick={handleTokenIntroSubmit}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Start Assessment
        </button>
      </div>
    </div>
  );

  // ── Entry (access code) ───────────────────────────────────────────────────
  if (step === "entry") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md">
        <div className="mb-8">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-1">Product Growth Leaders</p>
          <h1 className="text-2xl font-bold text-gray-900">Fieldwork Assessment</h1>
          <p className="text-gray-500 mt-2">Enter the code you received to begin.</p>
        </div>
        <input
          type="text"
          placeholder="Assessment code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && handleCodeSubmit()}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          onClick={handleCodeSubmit}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );

  // ── Intro (access-code flow) ──────────────────────────────────────────────
  if (step === "intro") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md">
        <div className="mb-8">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-1">Product Growth Leaders</p>
          <h1 className="text-2xl font-bold text-gray-900">Before we begin</h1>
          <p className="text-gray-500 mt-2">Your responses are confidential and will only be seen in aggregate by your team leader. Only Product Growth Leaders staff will see individual responses.</p>
        </div>
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What's your title or role?</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Senior Product Manager"
            />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          onClick={handleIntroSubmit}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Start Assessment
        </button>
      </div>
    </div>
  );

  // ── Rating ────────────────────────────────────────────────────────────────
  if (step === "rating") return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-1">Product Growth Leaders · Fieldwork</p>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">{currentFacet}</h1>
            <span className="text-sm text-gray-400">{currentFacetIndex + 1} of {availableFacets.length}</span>
          </div>
          <div className="mt-3 h-1.5 bg-gray-200 rounded-full">
            <div
              className="h-1.5 bg-indigo-500 rounded-full transition-all"
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
                      colorClass="bg-indigo-500"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Execution</p>
                    <RatingButton
                      options={EXECUTION_OPTIONS}
                      value={r.execution}
                      onChange={val => handleRatingChange(activity.id, "execution", val)}
                      colorClass="bg-emerald-500"
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

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleNext}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            {saving ? "Saving..." : currentFacetIndex < availableFacets.length - 1 ? "Next →" : "Submit Assessment"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === "done") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Thank you, {name}!</h1>
        <p className="text-gray-500">Your responses have been recorded. Your feedback will help shape the team's development plan.</p>
      </div>
    </div>
  );
}