// What kind of assessment this is, answered in one place.
//
// There are three kinds, and they differ in everything that matters to a page:
// which questions are asked, which tabs the admin shows, which report is
// written, and whose report it is.
//
//   team_gap        library activities rated on importance and execution,
//                   plus who should own them. Reported to the team, in
//                   aggregate.
//   personal        library activities rated on experience, skills, and
//                   interest. Reported to the one person who answered.
//   own_questions   an instrument's own fixed list on its own scale: Chaos,
//                   Portfolio Health, Idea Reality, Product Success, and the
//                   practice profile.
//
// Every page used to work this out for itself, from `assessment_type` in some
// places, `instrument.question_source` in others, and `report_style` in a few,
// with a different fallback in each. They disagreed exactly where it hurt: an
// own-questions assessment has no `assessment_type`, so a check written as
// "not personal" filed a Chaos Assessment under team gap.
//
// The instrument decides whenever there is one. `assessment_type` is only read
// when no instrument could be loaded, which is an assessment made before
// instruments existed and read by a page that could not derive one, or a failed
// load. loadInstrument derives the instrument from `assessment_type` for those
// older rows, so a page that loaded one never needs the fallback.
//
// Kept free of imports so it can be tested without a client, like
// activity-kind.js.

export const TEAM_GAP = "team_gap";
export const PERSONAL = "personal";
export const OWN_QUESTIONS = "own_questions";

// An instrument with its own fixed question list, as opposed to team gap and
// personal, which are instruments too but ask from the shared library.
export const asksOwnQuestions = (instrument) => instrument?.question_source === "instrument";

export function kindOf(assessment, instrument) {
  if (instrument) {
    if (asksOwnQuestions(instrument)) return OWN_QUESTIONS;
    return instrument.report_style === "profile" ? PERSONAL : TEAM_GAP;
  }
  // Absent means team gap, as the Assessment schema says.
  return assessment?.assessment_type === "personal" ? PERSONAL : TEAM_GAP;
}

// The admin tabs each kind has.
//
// Personal never asks who should own an activity and produces no team gap to
// discuss, so those two tabs would be empty rather than merely unused. An
// instrument that asks its own questions has no activity picker and no
// ownership question, since the questions are the instrument's, not the
// assessment's. It keeps Discussion: DiscussionNote keys on assessment plus
// question, and a question is an Activity row like any other.
export const TABS = {
  [TEAM_GAP]: ["Overview", "Activities", "Ownership Roles", "Results", "Discussion"],
  [PERSONAL]: ["Overview", "Activities", "Results"],
  [OWN_QUESTIONS]: ["Overview", "Results", "Discussion"],
};

// Whether the report belongs to the one person who answered rather than to a
// room. Personal always does. Of the own-questions instruments, only a
// dimension report does: the practice profile is read by the practitioner. The
// rest are aggregated for a team like the gap analysis is.
export const isOwnReport = (kind, instrument) =>
  kind === PERSONAL || (kind === OWN_QUESTIONS && instrument?.report_style === "dimension");
