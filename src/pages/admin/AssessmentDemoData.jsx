import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";

const IMPORTANCE_OPTIONS = ["Not needed", "Nice to have", "Important", "Critical"];
const EXECUTION_OPTIONS  = ["Not done", "Inconsistent", "Good", "Excellent"];

// Realistic fake respondent profiles
const FAKE_RESPONDENTS = [
  { name: "Alex Rivera",    title: "Product Manager / Product Owner" },
  { name: "Jordan Chen",    title: "Engineering" },
  { name: "Morgan Lee",     title: "Design / UX" },
  { name: "Taylor Okafor",  title: "Product Manager / Product Owner" },
  { name: "Sam Nguyen",     title: "Head of Product / Principal Product Manager" },
  { name: "Casey Patel",    title: "Engineering" },
  { name: "Drew Kimura",    title: "Customer Success" },
  { name: "Riley Torres",   title: "Sales / Sales Engineering" },
  { name: "Quinn Abbott",   title: "Product Marketing Manager" },
  { name: "Avery Walsh",    title: "Executive" },
];

// Biased response weights by activity facet — makes data more realistic
// PMs rate LEARN/DEFINE high importance but admit low execution
// Engineers rate CREATE high, PREPARE/DELIVER low
const IMPORTANCE_WEIGHTS = {
  DEFINE:   { "Product Manager / Product Owner": [0,0,1,3], "Engineering": [0,1,2,1], "Design / UX": [0,1,2,1], "Head of Product / Principal Product Manager": [0,0,1,3], default: [0,1,2,1] },
  COMMIT:   { "Product Manager / Product Owner": [0,0,1,2], "Engineering": [1,2,1,0], "Executive": [0,0,1,3], default: [0,1,2,1] },
  DESCRIBE: { "Product Manager / Product Owner": [0,0,1,3], "Engineering": [0,0,2,2], "Design / UX": [0,0,1,3], default: [0,1,2,1] },
  CREATE:   { "Engineering": [0,0,1,3], "Product Manager / Product Owner": [0,0,2,2], "Design / UX": [0,0,1,3], default: [0,1,2,1] },
  PREPARE:  { "Sales / Sales Engineering": [0,0,1,3], "Customer Success": [0,0,1,2], "Product Manager / Product Owner": [0,1,2,1], default: [0,1,2,1] },
  DELIVER:  { "Head of Product / Principal Product Manager": [0,0,1,3], "Product Manager / Product Owner": [0,0,2,2], default: [0,1,2,1] },
};

// Execution is generally lower than importance — that's the whole point
const EXECUTION_WEIGHTS = {
  DEFINE:   { "Product Manager / Product Owner": [2,3,1,0], "Engineering": [1,2,1,0], default: [1,2,2,1] },
  COMMIT:   { default: [1,2,2,1] },
  DESCRIBE: { "Product Manager / Product Owner": [1,2,2,1], "Engineering": [0,1,3,2], default: [1,2,2,1] },
  CREATE:   { "Engineering": [0,1,2,3], "Product Manager / Product Owner": [1,2,2,1], default: [1,2,2,1] },
  PREPARE:  { "Sales / Sales Engineering": [1,2,2,1], default: [2,3,1,0] },
  DELIVER:  { default: [1,2,2,1] },
};

// Ownership suggestions — some activities have clear consensus, some don't.
// DEFINE/COMMIT activities are deliberately scattered across roles —
// this reflects the real-world pattern where strategic activities often
// have no clear owner without a Head of Product role.
const OWNER_WEIGHTS = {
  // DEFINE
  "Problem Discovery":                 { "Product Manager / Product Owner": 3, "Head of Product / Principal Product Manager": 2, "Sales / Sales Engineering": 1, "Customer Success": 1 },
  "Persona Definition":                { "Product Manager / Product Owner": 3, "Design / UX": 2, "Head of Product / Principal Product Manager": 1 },
  "Solution Validation":               { "Product Manager / Product Owner": 3, "Head of Product / Principal Product Manager": 2, "Design / UX": 1 },
  "Strategic Fit (ASPIRE)":            { "Head of Product / Principal Product Manager": 2, "Executive": 2, "Product Manager / Product Owner": 2 },
  "Competitive Research":              { "Product Manager / Product Owner": 2, "Product Marketing Manager": 2, "Sales / Sales Engineering": 2 },
  "Product Brief":                     { "Product Manager / Product Owner": 3, "Head of Product / Principal Product Manager": 2 },
  "DEFINE Go/No-Go Decision":          { "Head of Product / Principal Product Manager": 3, "Executive": 2, "Product Manager / Product Owner": 1 },
  "Manage Feature Requests":           { "Product Manager / Product Owner": 2, "Engineering": 1, "Customer Success": 2, "Sales / Sales Engineering": 1 },

  // COMMIT
  "Develop Product Vision":            { "Head of Product / Principal Product Manager": 3, "Executive": 2, "Product Manager / Product Owner": 1 },
  "Product Roadmap":                   { "Product Manager / Product Owner": 3, "Head of Product / Principal Product Manager": 2, "Engineering": 1 },
  "Size Market Opportunity":           { "Head of Product / Principal Product Manager": 2, "Executive": 2, "Product Marketing Manager": 2 },
  "Pricing":                           { "Product Marketing Manager": 2, "Executive": 2, "Head of Product / Principal Product Manager": 1, "Sales / Sales Engineering": 1 },
  "Develop Success Metrics":           { "Head of Product / Principal Product Manager": 2, "Product Manager / Product Owner": 2, "Executive": 2 },
  "COMMIT Go/No-Go Decision":          { "Head of Product / Principal Product Manager": 3, "Executive": 2 },
  "Business Plan":                     { "Head of Product / Principal Product Manager": 2, "Executive": 2, "Product Marketing Manager": 1 },
  "Competitive Strategy":              { "Head of Product / Principal Product Manager": 2, "Product Marketing Manager": 2, "Executive": 1 },
  "Portfolio Management":              { "Head of Product / Principal Product Manager": 2, "Executive": 2 },
  "Build, Buy, or Partner":            { "Engineering": 2, "Head of Product / Principal Product Manager": 2, "Executive": 1 },

  // DESCRIBE
  "Problem Stories & Scenarios":       { "Product Manager / Product Owner": 4, "Design / UX": 2 },

  // CREATE
  "Prioritize Potential Capabilities": { "Product Manager / Product Owner": 4, "Head of Product / Principal Product Manager": 2, "Engineering": 1 },
  "Requirements & Technical Briefing": { "Product Manager / Product Owner": 4, "Engineering": 2 },
  "Release Brief":                     { "Product Manager / Product Owner": 3, "Engineering": 2 },
  "Interaction Design":                { "Design / UX": 4, "Engineering": 1 },
  "Usability Testing":                 { "Design / UX": 3, "Product Manager / Product Owner": 1 },
  "Manage Project Schedules":          { "Engineering": 4, "Product Manager / Product Owner": 1 },

  // PREPARE
  "Brief the Go-to-Market Teams":      { "Product Marketing Manager": 4, "Product Manager / Product Owner": 1, "Sales / Sales Engineering": 1 },
  "Propose the Scope of the Launch":   { "Product Marketing Manager": 3, "Head of Product / Principal Product Manager": 1, "Product Manager / Product Owner": 1 },
  "Launch Planning":                   { "Product Marketing Manager": 4, "Product Manager / Product Owner": 1 },
  "Readiness Planning":                { "Product Marketing Manager": 1, "Customer Success": 1, "Sales / Sales Engineering": 1, "Engineering": 1 },
  "Sales Enablement":                  { "Sales / Sales Engineering": 3, "Product Marketing Manager": 3, "Product Manager / Product Owner": 1 },
  "Positioning":                       { "Product Marketing Manager": 4, "Product Manager / Product Owner": 1 },
  "Buyer Experience":                  { "Product Marketing Manager": 2, "Sales / Sales Engineering": 2, "Design / UX": 1 },
  "Marketing Plan":                    { "Product Marketing Manager": 4, "Executive": 1 },
  "Communicate Status to Stakeholders":{ "Product Manager / Product Owner": 2, "Head of Product / Principal Product Manager": 1, "Product Marketing Manager": 1 },

  // DELIVER
  "DELIVER Go/No-Go Decision":         { "Head of Product / Principal Product Manager": 3, "Executive": 2, "Product Marketing Manager": 1 },
  "Monitor Performance & Metrics":     { "Product Manager / Product Owner": 2, "Head of Product / Principal Product Manager": 2, "Executive": 1 },
  "Win/Loss Analysis":                 { "Sales / Sales Engineering": 3, "Product Marketing Manager": 2, "Customer Success": 2 },
  "Revenue Growth":                    { "Product Marketing Manager": 3, "Sales / Sales Engineering": 2 },
  "Revenue Retention":                 { "Customer Success": 3, "Product Marketing Manager": 2, "Sales / Sales Engineering": 1 },
  "Customer Success Stories":          { "Customer Success": 3, "Product Marketing Manager": 2 },
  "Deliver Presentations & Demos":     { "Sales / Sales Engineering": 3, "Product Marketing Manager": 2 },
  "Sales Support":                     { "Sales / Sales Engineering": 4, "Product Marketing Manager": 1 },
  "Staffing Promotional Events":       { "Product Marketing Manager": 2, "Sales / Sales Engineering": 1, "Customer Success": 1 },
};

function weightedRandom(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function pickOwner(activityName, roles) {
  if (!roles || roles.length === 0) return "";
  const weights = OWNER_WEIGHTS[activityName];
  if (!weights) return roles[Math.floor(Math.random() * roles.length)];
  // Filter to roles available in this assessment
  const available = Object.entries(weights).filter(([role]) => roles.includes(role));
  if (available.length === 0) return roles[Math.floor(Math.random() * roles.length)];
  const total = available.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [role, w] of available) {
    r -= w;
    if (r <= 0) return role;
  }
  return available[available.length - 1][0];
}

function generateResponse(activity, respondentTitle, assessmentRoles) {
  const facet = activity.facet || "DEFINE";
  const impWeights = IMPORTANCE_WEIGHTS[facet]?.[respondentTitle]
    || IMPORTANCE_WEIGHTS[facet]?.default
    || [0, 1, 2, 1];
  const execWeights = EXECUTION_WEIGHTS[facet]?.[respondentTitle]
    || EXECUTION_WEIGHTS[facet]?.default
    || [1, 2, 2, 1];

  return {
    importance: IMPORTANCE_OPTIONS[weightedRandom(impWeights)],
    execution:  EXECUTION_OPTIONS[weightedRandom(execWeights)],
    suggested_owner: assessmentRoles?.length > 0
      ? pickOwner(activity.name, assessmentRoles)
      : "",
  };
}

export default function AssessmentDemoData({ assessment }) {
  const [respondentCount, setRespondentCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState(false);

  const handleGenerate = async () => {
    if (!assessment) return;

    setGenerating(true);
    setDone(false);
    setProgress("Starting…");

    const activities = await getAssignedActivities(assessment);
    if (activities.length === 0) {
      setProgress("No activities assigned to this assessment. Add an activity set first.");
      setGenerating(false);
      return;
    }

    const count = Math.min(respondentCount, FAKE_RESPONDENTS.length);
    const pool = [...FAKE_RESPONDENTS].sort(() => Math.random() - 0.5).slice(0, count);

    try {
      for (let i = 0; i < pool.length; i++) {
        const { name, title } = pool[i];
        setProgress(`Creating respondent ${i + 1} of ${count}: ${name}…`);

        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const respondent = await base44.entities.Respondent.create({
          assessment_id: assessment.id,
          name,
          title,
          token,
          status: "completed",
          completed_date: new Date().toISOString(),
        });

        setProgress(`Generating responses for ${name}…`);
        for (const activity of activities) {
          const { importance, execution, suggested_owner } = generateResponse(
            activity, title, assessment.roles
          );
          await base44.entities.Response.create({
            assessment_id: assessment.id,
            respondent_id: respondent.id,
            activity_id: activity.id,
            importance,
            execution,
            suggested_owner,
          });
          await new Promise(r => setTimeout(r, 50));
        }
      }
      setProgress(`Done — created ${count} respondents with ${count * activities.length} responses.`);
      setDone(true);
    } catch (e) {
      console.error(e);
      setProgress("Error generating data. Check console.");
    }
    setGenerating(false);
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Demo Data</h3>
        <p className="text-xs text-gray-400 mt-0.5">Generate realistic fake respondents and responses for testing this assessment.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of fake respondents
          </label>
          <div className="flex gap-2 flex-wrap">
            {[3, 5, 6, 8, 10].map(n => (
              <button
                key={n}
                onClick={() => setRespondentCount(n)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  respondentCount === n
                    ? "bg-[#3366FF] text-white border-transparent"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p>{assessment.activity_ids?.length > 0 ? assessment.activity_ids.length : "All"} activities assigned · {assessment.roles?.length || 0} ownership roles configured</p>
          {(!assessment.roles || assessment.roles.length === 0) && (
            <p className="text-amber-500">⚠ No ownership roles set — suggested_owner will be blank. Add roles in the Ownership Roles tab first.</p>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {generating ? "Generating…" : `Generate ${respondentCount} respondents`}
        </button>

        {progress && (
          <div className={`rounded-xl border px-5 py-4 text-sm ${
            done
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-[#eef2ff] border-[#a3b8ff] text-[#1a2e7a]"
          }`}>
            {done && <span className="font-semibold mr-2">✓</span>}
            {progress}
            {done && (
              <p className="text-xs mt-2 text-green-600">
                View results in the assessment's Results tab, or open the report link.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
