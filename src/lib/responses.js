import { PERSONAL_AXES } from "@/lib/personal-scoring";

// Both assessment types load and save the same Response record, so state is
// rebuilt for every field either type uses rather than branching here. The
// unused half is empty strings, which never reach the server: handleNext sends
// only what the current assessment type collects.
//
// Every field an answer can carry. Team gap uses the first three, a personal
// assessment the axes; a row simply leaves the others blank.
export const ANSWER_FIELDS = [
  "importance",
  "execution",
  "suggested_owner",
  ...PERSONAL_AXES.map(a => a.key),
];

// Response rows → answers keyed by activity id, which is the shape both the
// survey's own state and the summary screen work in. Shared so the
// facilitator's preview reshapes a respondent's answers exactly the way the
// respondent's own page did.
export const rebuildResponses = (saved) => {
  const rebuilt = {};
  for (const resp of saved) {
    const entry = { id: resp.id };
    for (const f of ANSWER_FIELDS) entry[f] = resp[f] || "";
    rebuilt[resp.activity_id] = entry;
  }
  return rebuilt;
};
