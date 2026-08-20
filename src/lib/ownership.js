// Ownership vocabulary for the team gap survey.
//
// The activity library recommends *functions* — every one of the 65 library
// activities carries a `preferred_owner` drawn from the JobTitle list, so
// Win/Loss Analysis recommends "Product Marketing" rather than a job title.
// Respondents, though, answer with the title of the person who actually does
// the work. Without a mapping between the two, every product activity would
// read as a mismatch.

// Offered last on every activity. "Who does this currently?" has an honest
// answer that is not a role, and without it a respondent who doesn't know
// either guesses — which manufactures a consensus that isn't there — or leaves
// the question blank, which is indistinguishable from skipping it.
export const UNKNOWN_OWNER = "I don't know";

// Always offered, in every survey, whatever the activities recommend.
export const PRODUCT_TITLES = [
  "Head of Product Management / Principal Product Manager",
  "Product Manager / Product Owner",
  "Product Marketing Manager",
];

// The functions these titles stand in for. All three satisfy either one.
//
// Not split by title, and that is the point. Customers disagree about what
// these words mean — Microsoft's "product manager" is what Quartz calls product
// marketing — so a title cannot be trusted to say which side of the line
// someone works on. Splitting them would report a title-vocabulary difference
// as an ownership problem on every go-to-market activity, which is a finding
// about the customer's dictionary rather than about their team.
//
// What the activity is stays legible without it: Win/Loss Analysis recommends
// Product Marketing and sits in the prepare and deliver phases, so the report
// still shows recommended against named and the facilitator can read the
// difference. It simply stops being flagged to the client as a problem.
const PRODUCT_FUNCTIONS = ["Product Management", "Product Marketing"];

// The same two functions drop out of the picker, so a respondent is never
// choosing between "Product Management" and "Product Manager / Product Owner"
// for the same activity — that choice has no right answer and would split the
// tally between two spellings of one idea.
const REPLACED_BY_TITLES = PRODUCT_FUNCTIONS;

// What a respondent picks from, for one assessment.
//
//   the functions its activities recommend (minus the two above)
// + the three product titles, always
// + anything the facilitator added by hand on the Ownership Roles tab
//
// Derived rather than stored, so an assessment can never end up offering a
// role none of its activities recommend, or missing one they do.
export const ownerOptionsFor = (activities = [], extraRoles = []) => {
  const recommended = [...new Set(
    activities.map(a => a.preferred_owner).filter(Boolean)
  )].filter(fn => !REPLACED_BY_TITLES.includes(fn));

  return [...new Set([
    ...PRODUCT_TITLES,
    ...recommended.sort((a, b) => a.localeCompare(b)),
    ...extraRoles,
    UNKNOWN_OWNER,
  ])];
};

// Does what the team says happens today satisfy what the library recommends?
// Exact function match, or a title that stands in for that function.
export const ownerMatchesRecommendation = (suggested, preferred) => {
  if (!suggested || !preferred) return false;
  if (suggested === preferred) return true;
  return PRODUCT_TITLES.includes(suggested) && PRODUCT_FUNCTIONS.includes(preferred);
};
