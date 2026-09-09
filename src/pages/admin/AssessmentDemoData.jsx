import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { ownerOptionsFor } from "@/lib/ownership";
import { EXPERIENCE_OPTIONS, SKILLS_OPTIONS, INTEREST_OPTIONS } from "@/lib/personal-scoring";
import { IMPORTANCE_LABEL, EXECUTION_LABEL } from "@/lib/scoring";
import { orderQuestions } from "@/lib/instruments";

// Same lists as the survey offers, from the file that scores them. Retyped
// here, generated demo data could carry a label nothing knows how to score.
const IMPORTANCE_OPTIONS = IMPORTANCE_LABEL;
const EXECUTION_OPTIONS  = EXECUTION_LABEL;

// Realistic fake respondent profiles
const FAKE_RESPONDENTS = [
  { name: "Alex Rivera",    title: "Product Manager / Product Owner" },
  { name: "Jordan Chen",    title: "Engineering" },
  { name: "Morgan Lee",     title: "Design / UX" },
  { name: "Taylor Okafor",  title: "Product Manager / Product Owner" },
  { name: "Sam Nguyen",     title: "Head of Product Management / Principal Product Manager" },
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
  DEFINE:   { "Product Manager / Product Owner": [0,0,1,3], "Engineering": [0,1,2,1], "Design / UX": [0,1,2,1], "Head of Product Management / Principal Product Manager": [0,0,1,3], default: [0,1,2,1] },
  COMMIT:   { "Product Manager / Product Owner": [0,0,1,2], "Engineering": [1,2,1,0], "Executive": [0,0,1,3], default: [0,1,2,1] },
  DESCRIBE: { "Product Manager / Product Owner": [0,0,1,3], "Engineering": [0,0,2,2], "Design / UX": [0,0,1,3], default: [0,1,2,1] },
  CREATE:   { "Engineering": [0,0,1,3], "Product Manager / Product Owner": [0,0,2,2], "Design / UX": [0,0,1,3], default: [0,1,2,1] },
  PREPARE:  { "Sales / Sales Engineering": [0,0,1,3], "Customer Success": [0,0,1,2], "Product Manager / Product Owner": [0,1,2,1], default: [0,1,2,1] },
  DELIVER:  { "Head of Product Management / Principal Product Manager": [0,0,1,3], "Product Manager / Product Owner": [0,0,2,2], default: [0,1,2,1] },
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
  "Problem Discovery":                 { "Product Manager / Product Owner": 3, "Head of Product Management / Principal Product Manager": 2, "Sales / Sales Engineering": 1, "Customer Success": 1 },
  "Persona Definition":                { "Product Manager / Product Owner": 3, "Design / UX": 2, "Head of Product Management / Principal Product Manager": 1 },
  "Solution Validation":               { "Product Manager / Product Owner": 3, "Head of Product Management / Principal Product Manager": 2, "Design / UX": 1 },
  "Strategic Fit (ASPIRE)":            { "Head of Product Management / Principal Product Manager": 2, "Executive": 2, "Product Manager / Product Owner": 2 },
  "Competitive Research":              { "Product Manager / Product Owner": 2, "Product Marketing Manager": 2, "Sales / Sales Engineering": 2 },
  "Product Brief":                     { "Product Manager / Product Owner": 3, "Head of Product Management / Principal Product Manager": 2 },
  "DEFINE Go/No-Go Decision":          { "Head of Product Management / Principal Product Manager": 3, "Executive": 2, "Product Manager / Product Owner": 1 },
  "Manage Feature Requests":           { "Product Manager / Product Owner": 2, "Engineering": 1, "Customer Success": 2, "Sales / Sales Engineering": 1 },

  // COMMIT
  "Develop Product Vision":            { "Head of Product Management / Principal Product Manager": 3, "Executive": 2, "Product Manager / Product Owner": 1 },
  "Product Roadmap":                   { "Product Manager / Product Owner": 3, "Head of Product Management / Principal Product Manager": 2, "Engineering": 1 },
  "Size Market Opportunity":           { "Head of Product Management / Principal Product Manager": 2, "Executive": 2, "Product Marketing Manager": 2 },
  "Pricing":                           { "Product Marketing Manager": 2, "Executive": 2, "Head of Product Management / Principal Product Manager": 1, "Sales / Sales Engineering": 1 },
  "Develop Success Metrics":           { "Head of Product Management / Principal Product Manager": 2, "Product Manager / Product Owner": 2, "Executive": 2 },
  "COMMIT Go/No-Go Decision":          { "Head of Product Management / Principal Product Manager": 3, "Executive": 2 },
  "Business Plan":                     { "Head of Product Management / Principal Product Manager": 2, "Executive": 2, "Product Marketing Manager": 1 },
  "Competitive Strategy":              { "Head of Product Management / Principal Product Manager": 2, "Product Marketing Manager": 2, "Executive": 1 },
  "Portfolio Management":              { "Head of Product Management / Principal Product Manager": 2, "Executive": 2 },
  "Build, Buy, or Partner":            { "Engineering": 2, "Head of Product Management / Principal Product Manager": 2, "Executive": 1 },

  // DESCRIBE
  "Problem Stories & Scenarios":       { "Product Manager / Product Owner": 4, "Design / UX": 2 },

  // CREATE
  "Prioritize Potential Capabilities": { "Product Manager / Product Owner": 4, "Head of Product Management / Principal Product Manager": 2, "Engineering": 1 },
  "Requirements & Technical Briefing": { "Product Manager / Product Owner": 4, "Engineering": 2 },
  "Release Brief":                     { "Product Manager / Product Owner": 3, "Engineering": 2 },
  "Interaction Design":                { "Design / UX": 4, "Engineering": 1 },
  "Usability Testing":                 { "Design / UX": 3, "Product Manager / Product Owner": 1 },
  "Manage Project Schedules":          { "Engineering": 4, "Product Manager / Product Owner": 1 },

  // PREPARE
  "Brief the Go-to-Market Teams":      { "Product Marketing Manager": 4, "Product Manager / Product Owner": 1, "Sales / Sales Engineering": 1 },
  "Propose the Scope of the Launch":   { "Product Marketing Manager": 3, "Head of Product Management / Principal Product Manager": 1, "Product Manager / Product Owner": 1 },
  "Launch Planning":                   { "Product Marketing Manager": 4, "Product Manager / Product Owner": 1 },
  "Readiness Planning":                { "Product Marketing Manager": 1, "Customer Success": 1, "Sales / Sales Engineering": 1, "Engineering": 1 },
  "Sales Enablement":                  { "Sales / Sales Engineering": 3, "Product Marketing Manager": 3, "Product Manager / Product Owner": 1 },
  "Positioning":                       { "Product Marketing Manager": 4, "Product Manager / Product Owner": 1 },
  "Buyer Experience":                  { "Product Marketing Manager": 2, "Sales / Sales Engineering": 2, "Design / UX": 1 },
  "Marketing Plan":                    { "Product Marketing Manager": 4, "Executive": 1 },
  "Communicate Status to Stakeholders":{ "Product Manager / Product Owner": 2, "Head of Product Management / Principal Product Manager": 1, "Product Marketing Manager": 1 },

  // DELIVER
  "DELIVER Go/No-Go Decision":         { "Head of Product Management / Principal Product Manager": 3, "Executive": 2, "Product Marketing Manager": 1 },
  "Monitor Performance & Metrics":     { "Product Manager / Product Owner": 2, "Head of Product Management / Principal Product Manager": 2, "Executive": 1 },
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

// Personal assessments. Uniform noise would put every activity in the same
// quadrant for everyone, so each fake person gets a strong facet and a weak
// one; that is what makes the Results tab show real strengths, real gaps, and
// the occasional keen-but-untrained row worth talking about.
function personalProfileFor(facets) {
  const shuffled = [...facets].sort(() => Math.random() - 0.5);
  return { strong: shuffled[0], weak: shuffled[shuffled.length - 1] };
}

function generatePersonalResponse(activity, profile) {
  const facet = activity.facet || "DEFINE";
  const band = facet === profile.strong ? "strong" : facet === profile.weak ? "weak" : "middle";

  // Weights run lowest → highest option on each scale. All three scales are
  // four points, so all three weight arrays are length four — a mismatch here
  // silently biases the generator toward the low end, since weightedRandom
  // would never reach the options past the end of the array.
  const expWeights   = { strong: [0, 1, 3, 4], middle: [1, 3, 3, 1], weak: [4, 3, 1, 0] };
  const skillWeights = { strong: [0, 1, 3, 4], middle: [1, 3, 3, 1], weak: [4, 3, 1, 0] };
  // Interest is drawn independently of ability on purpose: someone keen but
  // untrained is the finding the assessment exists to surface.
  const intWeights   = [1, 2, 3, 2];

  return {
    experience: EXPERIENCE_OPTIONS[weightedRandom(expWeights[band])],
    skills:     SKILLS_OPTIONS[weightedRandom(skillWeights[band])],
    interest:   INTEREST_OPTIONS[weightedRandom(intWeights)],
  };
}

// The four instruments that ask their own questions. One scale, and a finding
// that is not a gap but a spread — where a room disagrees with itself — so the
// generator's job here is different from the two above. Uniform random answers
// would split every question equally and make the agenda meaningless; a
// per-respondent lean on its own would make every question equally agreed.
//
// So each question is given its own centre once per run, and each respondent a
// lean applied across all of them. What comes out is a set the report can
// actually say something about: questions the room lines up on, questions it
// splits down the middle, and a score per person that lands in different bands.
function questionPlan(questions) {
  const plan = new Map();
  for (const q of questions) {
    plan.set(q.id, {
      // Where the room sits on this question, 0 (worst) to 1 (best).
      centre: 0.1 + Math.random() * 0.8,
      // A third of the questions put the room in two camps rather than
      // scattering it around the centre. That is what disagreement in a real
      // team looks like — half of them call it the biggest problem they have
      // and half have never noticed it — and it is also the only thing that
      // reaches the report's "Split" badge at 0.6 spread. Widening a bell
      // instead was tried and does not get there: the challenge scale scores
      // 0/3/5/8, so a blurrier middle stays bunched on Somewhat and Not so
      // much and every question came back Agreed.
      camps: Math.random() < 0.35,
    });
  }
  return plan;
}

// Box–Muller. A bell around the question's centre is what makes a distribution
// look like a room rather than a dice roll — most people near the middle, a
// couple out at the edges.
function gaussian() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Written answers, so the report's free-text sections have something in them.
//
// Keyed by question name, falling back to the instrument's key and then to a
// generic pool. Portfolio Health's magic wand is the only free-text question
// any of these instruments currently asks, and it asks something specific —
// generic filler under it would tell a reader nothing about whether that
// section of the report reads well. The other three had their comments boxes
// retired; if one is revived, give it a pool here.
const TEXT_ANSWERS = {
  "Magic wand": [
    "Hire two more product managers. We have four products and two people, and the maths has never worked.",
    "Customer research. We are guessing what people want and calling it a roadmap.",
    "Pay down the platform debt so we can ship in weeks instead of quarters.",
    "Sales enablement. The product is fine; nobody can explain it in a meeting.",
    "Kill two of the products and put everything behind the one that is growing.",
    "A proper analytics stack, so we stop arguing about what customers actually do.",
  ],
  default: [
    "The biggest issue is that nobody agrees on what we are trying to achieve this year.",
    "We are stretched thin. Everything gets some attention and nothing gets enough.",
    "Honestly, the process is fine — it is the decisions that keep getting reopened.",
    "We need to say no to more things. That is the whole answer.",
    "Communication between product and sales is where most of this falls apart.",
  ],
};

function writtenAnswer(question, instrumentKey) {
  const pool = TEXT_ANSWERS[question.name] || TEXT_ANSWERS[instrumentKey] || TEXT_ANSWERS.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// One person's answer to one instrument question.
//
// `lean` is that respondent's own bias, -1 to 1 as a fraction of the scale:
// the optimist and the person who has had a bad quarter both answer every
// question, and the difference between them is what the spread is measuring.
function generateInstrumentResponse(question, axis, plan, lean, instrumentKey) {
  if (question.question_type === "text") {
    return { answer: "", answer_text: writtenAnswer(question, instrumentKey) };
  }

  const options = axis?.options || [];
  if (options.length === 0) return { answer: "", answer_text: "" };

  // A non-required question somebody skipped. Left blank rather than omitted,
  // which is the row saveResponses writes when a respondent moves past a
  // question — and the case the report's "unanswered" count exists for.
  if (!question.required && Math.random() < 0.08) return { answer: "", answer_text: "" };

  const { centre, camps } = plan.get(question.id) || { centre: 0.5, camps: false };
  const top = options.length - 1;
  // Everything here is a fraction of the scale rather than a count of options,
  // and only becomes a position at the end. These four instruments run scales
  // of two, three and four points; a lean measured in options would be a nudge
  // on the challenge scale and a coin flip on the Product Success yes/no, which
  // is how half a demo room came to answer No to everything and land in Sunset.
  //
  // Which camp somebody falls in follows their lean, but not slavishly — the
  // same people are not on the same side of every argument, and a room that
  // divides identically on each split question reads as two blocs rather than
  // as a team.
  //
  // The jitter inside a camp is what keeps somebody in the middle. Without it
  // a split question comes back as two towers and a hollow centre on every
  // run, which no real room produces and which reads immediately as generated.
  const fraction = camps
    ? centre + (lean + gaussian() * 0.45 >= 0 ? 0.4 : -0.4) + gaussian() * 0.12
    : centre + lean * 0.2 + gaussian() * 0.07;
  const position = top * fraction;
  // Options are stored in the order a respondent reads them, worst first on
  // all four of these scales, so a position is an index straight off.
  return { answer: options[Math.round(clamp(position, 0, top))].label, answer_text: "" };
}

// Somebody has to answer a non-negotiable badly, or the Product Success veto —
// critical questions first, ahead of whatever the spread says — never shows up
// in a demo report at all. This forces the worst option onto a critical
// question for one respondent in the set, which is also the honest case: a
// product with one red flag and a decent total.
function vetoTargets(questions, respondentIndex) {
  if (respondentIndex !== 0) return new Set();
  return new Set(questions.filter(q => q.critical && Math.random() < 0.6).map(q => q.id));
}

export default function AssessmentDemoData({ assessment, instrument }) {
  // An instrument that asks its own questions scores them on one scale, which
  // is the axis every generated answer is drawn from. Everything else — the
  // library pair — keeps the two paths that were already here.
  const isInstrument = instrument?.question_source === "instrument";
  const axis = isInstrument ? instrument.axes?.[0] : null;

  const [respondentCount, setRespondentCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState(false);

  const handleGenerate = async () => {
    if (!assessment) return;

    setGenerating(true);
    setDone(false);
    setProgress("Starting…");

    const raw = await getAssignedActivities(assessment);
    // An instrument's questions come back unsorted on purpose — section order
    // belongs to the instrument — and the survey applies that order itself.
    // Doing the same here keeps the generated rows in the order a real
    // respondent would have produced them.
    const activities = isInstrument ? orderQuestions(instrument, raw) : raw;
    // Seeded answers should look like real ones, which means picking from what
    // the survey actually offers rather than from stored roles.
    const ownerOptions = ownerOptionsFor(activities, assessment.roles || []);
    if (activities.length === 0) {
      setProgress(isInstrument
        ? "This instrument has no active questions. Apply the instrument seed from Settings › Instruments first."
        : "No activities assigned to this assessment. Add an activity set first.");
      setGenerating(false);
      return;
    }
    if (isInstrument && !axis) {
      setProgress("This instrument has no scale. Apply the instrument seed from Settings › Instruments first.");
      setGenerating(false);
      return;
    }

    const isPersonal = assessment.assessment_type === "personal";
    const facets = [...new Set(activities.map(a => a.facet).filter(Boolean))];
    const plan = isInstrument ? questionPlan(activities) : null;

    const count = Math.min(respondentCount, FAKE_RESPONDENTS.length);
    const pool = [...FAKE_RESPONDENTS].sort(() => Math.random() - 0.5).slice(0, count);

    try {
      for (let i = 0; i < pool.length; i++) {
        const { name, title } = pool[i];
        setProgress(`Creating respondent ${i + 1} of ${count}: ${name}…`);

        const token = crypto.randomUUID();
        const respondent = await base44.entities.Respondent.create({
          assessment_id: assessment.id,
          name,
          title,
          token,
          status: "completed",
          completed_date: new Date().toISOString(),
        });

        setProgress(`Generating responses for ${name}…`);
        const personalProfile = isPersonal ? personalProfileFor(facets) : null;
        // This respondent's own bias across the whole instrument, in scale
        // positions, and the non-negotiables they answer badly.
        const lean = isInstrument ? Math.random() * 2 - 1 : 0;
        const vetoed = isInstrument ? vetoTargets(activities, i) : new Set();
        for (const activity of activities) {
          const answers = isInstrument
            ? (vetoed.has(activity.id)
                ? { answer: axis.options[0].label, answer_text: "" }
                : generateInstrumentResponse(activity, axis, plan, lean, instrument.key))
            : isPersonal
              ? generatePersonalResponse(activity, personalProfile)
              : generateResponse(activity, title, ownerOptions);
          await base44.entities.Response.create({
            assessment_id: assessment.id,
            respondent_id: respondent.id,
            activity_id: activity.id,
            ...answers,
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
          {isInstrument ? (
            <p>{instrument.name} · its own questions, answered on {axis ? axis.label : "no scale"}</p>
          ) : (
            <p>{assessment.activity_ids?.length > 0 ? assessment.activity_ids.length : "All"} activities assigned · {assessment.roles?.length || 0} ownership roles configured</p>
          )}
          {/* Ownership is a library question. An instrument never asks it, so
              the warning below would be an instruction to go and fix something
              that is not missing. */}
          {!isInstrument && (!assessment.roles || assessment.roles.length === 0) && (
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
