import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const IMPORTANCE_OPTIONS = ["Not needed", "Nice to have", "Important", "Critical"];
const EXECUTION_OPTIONS = ["Not done", "Inconsistent", "Good", "Excellent"];
const FACET_ORDER = ["LEARN", "DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

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
  const [titleQuery, setTitleQuery] = useState("");
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const titleRef = useRef(null);
  const [respondent, setRespondent] = useState(null);
  const [activities, setActivities] = useState([]);
  const [responses, setResponses] = useState({});
  const [currentFacetIndex, setCurrentFacetIndex] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode) setCode(urlCode.toUpperCase());
  }, []);

  const handleCodeSubmit = async () => {
    setError("");
    if (!code.trim()) return setError("Please enter an assessment code.");
    try {
      const results = await base44.entities.Assessment.filter({
        access_code: code.trim().toUpperCase()
      });
      if (!results || results.length === 0) return setError("Code not found. Please check and try again.");
      const found = results[0];
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
      const acts = await base44.entities.Activity.filter({ active: true }, "sort_order");
      setActivities(acts);
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
        setStep("done");
      }
    } catch (e) {
      setError("Error saving responses. Please try again.");
    }
    setSaving(false);
  };

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
            <label className="block text-sm font-medium text-gray-700 mb-1">Your job title</label>
            {assessment?.job_titles?.length > 0 ? (
              <div className="relative" ref={titleRef}>
                <input
                  type="text"
                  value={titleQuery}
                  onChange={e => {
                    setTitleQuery(e.target.value);
                    setTitle("");
                    setShowTitleSuggestions(true);
                  }}
                  onFocus={() => setShowTitleSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 150)}
                  className={`w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    title ? "border-indigo-300 bg-indigo-50" : "border-gray-300"
                  }`}
                  placeholder="Search or select your title…"
                  autoComplete="off"
                />
                {title && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {showTitleSuggestions && (() => {
                  const filtered = assessment.job_titles.filter(t =>
                    t.toLowerCase().includes(titleQuery.toLowerCase())
                  );
                  if (filtered.length === 0) return null;
                  return (
                    <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {filtered.map(t => (
                        <li key={t}>
                          <button
                            type="button"
                            onMouseDown={() => {
                              setTitle(t);
                              setTitleQuery(t);
                              setShowTitleSuggestions(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors ${
                              title === t ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700"
                            }`}
                          >
                            {t}
                          </button>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            ) : (
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Senior Product Manager"
              />
            )}
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
                      <div className="flex gap-2 flex-wrap">
                        {assessment.roles.map(role => (
                          <button
                            key={role}
                            onClick={() => handleRatingChange(activity.id, "suggested_owner", role)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                              r.suggested_owner === role
                                ? "bg-amber-500 text-white border-transparent"
                                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                            }`}
                          >
                            {role}
                          </button>
                        ))}
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