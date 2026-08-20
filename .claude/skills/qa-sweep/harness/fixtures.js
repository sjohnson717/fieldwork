// Fixture data for the QA harness.
//
// Chosen to be awkward on purpose. A sweep over tidy data proves the layout
// survives tidy data, which is not the failure mode: every layout bug this app
// has had came from a long activity name, an unanswered question, or an option
// ("I don't know") that the scoring treats as a non-answer. So the set below
// carries the longest real activity names, every rating value including the odd
// ones, a half-answered activity, an activity nobody rated, and both assessment
// types.

export const FACETS = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER", "LEARN"];

// One activity per facet, so the survey pages exactly as production does, plus
// a second DEFINE activity so at least one page carries more than one card.
// Names are the real library's longest, which is what breaks pill alignment.
export const ACTIVITIES = [
  { id: "act-1", name: "Understand the Market", facet: "DEFINE", sort_order: 0, preferred_owner: "Product Management", description: "Develop and maintain an understanding of customers, market needs, trends, technologies, and changes that may affect product opportunities and decisions." },
  { id: "act-2", name: "Go/No-Go Decision to Pursue Initiative", facet: "DEFINE", sort_order: 1, description: "Decide whether an opportunity is worth pursuing." },
  { id: "act-3", name: "Set Strategic Direction & Priorities", facet: "COMMIT", sort_order: 2, preferred_owner: "Product Management", description: "Agree where the product is going and what comes first." },
  { id: "act-4", name: "Define & Communicate Product Direction", facet: "DESCRIBE", sort_order: 3, description: "Turn direction into something teams can build against." },
  { id: "act-5", name: "Explore Solution Concepts", facet: "CREATE", sort_order: 4, description: "Try more than one shape of answer before committing." },
  { id: "act-6", name: "Coordinate Launch Readiness", facet: "PREPARE", sort_order: 5, preferred_owner: "Product Marketing", description: "Make sure everyone who meets the customer is ready." },
  { id: "act-7", name: "Drive Outcomes & Improvement", facet: "DELIVER", sort_order: 6, preferred_owner: "Sales / Sales Engineering", description: "Watch what happens after release and act on it." },
  { id: "act-8", name: "Review Outcomes Against Assumptions", facet: "LEARN", sort_order: 7, description: "Compare what happened with what was predicted." },
].map(a => ({ ...a, active: true, assessment_id: null }));

export const TEAM_GAP = {
  id: "asmt-gap",
  title: "Product Team Effectiveness",
  assessment_type: "team_gap",
  status: "active",
  company_name: "Northwind Systems",
  org_name: "Product Growth Leaders",
  tagline: "Where the team agrees, and where it doesn't",
  roles: ["Product Management", "Product Marketing"],
  activity_ids: ACTIVITIES.map(a => a.id),
  access_code: "QA111",
  created_date: "2026-08-01T10:00:00.000Z",
};

export const PERSONAL = {
  ...TEAM_GAP,
  id: "asmt-personal",
  title: "Product Manager Self-Assessment",
  assessment_type: "personal",
  access_code: "QA222",
  roles: [],
};

// Ownership answers are job titles, which is what the survey offers — the
// library recommends functions, so act-1 exercises a title satisfying its own
// function, act-3 a product title satisfying the *other* product function,
// act-6 a respondent who doesn't know, and act-7 a genuine mismatch against a
// non-product recommendation. Those four are the whole of ownership.js.
//
// Every execution value the survey offers, including "I don't know", which is
// absent from the entity's enum and is scored as no opinion rather than a low
// rating. act-6 is half answered and act-8 unrated, which is what puts the
// "couldn't answer" and unanswered paths on screen.
export const OWN_ANSWERS = [
  { activity_id: "act-1", importance: "Critical", execution: "Inconsistent", suggested_owner: "Product Manager / Product Owner" },
  { activity_id: "act-2", importance: "Nice to have", execution: "Good", suggested_owner: null },
  { activity_id: "act-3", importance: "Critical", execution: "Not done", suggested_owner: "Product Marketing Manager" },
  { activity_id: "act-4", importance: "Important", execution: "Excellent", suggested_owner: null },
  { activity_id: "act-5", importance: "Not needed", execution: "Good", suggested_owner: null },
  { activity_id: "act-6", importance: "Critical", execution: "I don't know", suggested_owner: "I don't know" },
  { activity_id: "act-7", importance: "Nice to have", execution: "Not done", suggested_owner: "Product Manager / Product Owner" },
  { activity_id: "act-8", importance: null, execution: null, suggested_owner: null },
];

export const PERSONAL_ANSWERS = [
  { activity_id: "act-1", experience: "Extensive", skills: "Excellent", interest: "Passionate" },
  { activity_id: "act-2", experience: "Limited", skills: "Basic", interest: "Moderate" },
  { activity_id: "act-3", experience: "Some", skills: "Good", interest: "Limited" },
  { activity_id: "act-4", experience: "None", skills: "None", interest: "None" },
  { activity_id: "act-5", experience: "Extensive", skills: "Good", interest: "Passionate" },
  { activity_id: "act-6", experience: "Some", skills: "Excellent", interest: "Moderate" },
  { activity_id: "act-7", experience: "Limited", skills: "Good", interest: "Limited" },
  { activity_id: "act-8", experience: null, skills: null, interest: null },
];

// A roster wide enough for an aggregate to mean something, and deliberately
// mixed: two people who never finished, so the report's "answered" and "scored"
// counts differ and the difference is visible on screen.
export const RESPONDENTS = [
  { id: "resp-1", name: "Sam Okafor", title: "Director of Product", token: "TOKEN-RESP-1", status: "completed", completed_date: "2026-08-12T15:04:00.000Z", created_date: "2026-08-11T09:00:00.000Z" },
  { id: "resp-2", name: "Priya Raman", title: "Principal Product Manager", token: "TOKEN-RESP-2", status: "completed", completed_date: "2026-08-12T16:20:00.000Z", created_date: "2026-08-11T09:05:00.000Z" },
  { id: "resp-3", name: "Wei Zhang", title: "VP Product & Engineering Operations", token: "TOKEN-RESP-3", status: "completed", completed_date: "2026-08-13T11:00:00.000Z", created_date: "2026-08-11T09:10:00.000Z" },
  { id: "resp-4", name: "Dani Brooks", title: "Product Marketing Lead", token: "TOKEN-RESP-4", status: "started", completed_date: null, created_date: "2026-08-11T09:15:00.000Z" },
  { id: "resp-5", name: "Alex Fitzwilliam-Hargreaves", title: "Group Product Manager, Platform & Integrations", token: "TOKEN-RESP-5", status: "started", completed_date: null, created_date: "2026-08-11T09:20:00.000Z" },
];

// Spread across the rating scales so the report has genuine gaps, agreement,
// and at least one activity every respondent skipped.
const RATINGS = [
  ["Critical", "Not done"], ["Critical", "Inconsistent"], ["Critical", "Good"],
  ["Important", "Inconsistent"], ["Important", "Excellent"], ["Nice to have", "Good"],
  ["Not needed", "Not done"], ["Critical", "I don't know"],
];

const OWNER_CYCLE = [
  "Product Manager / Product Owner",
  "Product Marketing Manager",
  "I don't know",
  null,
  "Engineering",
];

export const ALL_ANSWERS = RESPONDENTS.filter(r => r.status === "completed" || r.id === "resp-4").flatMap((r, ri) =>
  ACTIVITIES.map((a, ai) => {
    if (a.id === "act-8") return null; // nobody rated this one
    if (r.id === "resp-4" && ai > 2) return null; // stopped part-way through
    const [importance, execution] = RATINGS[(ri + ai) % RATINGS.length];
    return {
      respondent_id: r.id,
      activity_id: a.id,
      importance,
      execution,
      // Job titles, which is what the survey collects, plus "I don't know" and
      // some skips. Rotated by respondent as well as activity so tallies
      // actually disagree — a column where everyone picks the same role proves
      // nothing about agreement, unclear ownership, or the mismatch badge.
      suggested_owner: OWNER_CYCLE[(ri * 2 + ai) % OWNER_CYCLE.length],
    };
  }).filter(Boolean)
);

export const DISCUSSION_NOTES = [
  { id: "note-1", assessment_id: TEAM_GAP.id, activity_id: "act-3", decision: "Product owns the roadmap; marketing owns launch scope.", status: "decided", note: "Agreed in the 12 Aug session." },
  { id: "note-2", assessment_id: TEAM_GAP.id, activity_id: "act-7", decision: "", status: "parked", note: "Revisit once the analytics work lands." },
];

export const TEAM_TOKEN = "TOKEN-TEAM";
export const BUYER_TOKEN = "TOKEN-BUYER";
