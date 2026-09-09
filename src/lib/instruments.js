import { base44 } from "@/api/base44Client";

// Loading an instrument and the scales it asks with.
//
// Instrument, Scale and ScaleOption all read open, so the unauthenticated
// survey and report pages fetch them directly rather than through
// publicAssessment. That is deliberate and safe: they are the questions and the
// answer options, which every respondent is about to be shown anyway. Nothing
// about a person, an assessment or an answer travels with them.

// One axis, ready to render: the label and hint a respondent reads, and the
// ordered options with their points.
//
// Options keep their stored order rather than being sorted by points, because
// order is presentation and points are scoring, and they disagree on purpose —
// the team gap's "I don't know" sits last with no points at all.
const buildScale = (scale, options) => ({
  id: scale.id,
  key: scale.key,
  label: scale.name,
  hint: scale.hint || "",
  unknownLabel: scale.unknown_label || null,
  unknownTreatment: scale.unknown_treatment || "excluded",
  options: options
    .filter((o) => o.scale_id === scale.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((o) => ({ label: o.label, points: o.points ?? null })),
});

// Everything the survey and the report need to render one instrument. Returns
// null when the assessment names no instrument, which is every assessment made
// before they existed — callers fall back to their old path on null rather than
// branching on the assessment's type.
export async function loadInstrument(assessment) {
  if (!assessment?.instrument_id) return null;
  const [instruments, scales, options] = await Promise.all([
    base44.entities.Instrument.filter({ id: assessment.instrument_id }),
    base44.entities.Scale.list("sort_order"),
    base44.entities.ScaleOption.list("sort_order"),
  ]);
  const instrument = instruments?.[0];
  if (!instrument) return null;

  // Ordered as the instrument names them, not as the Scale table happens to
  // sort: scale_ids is the order the axes are asked in, and for the library
  // instruments that order is the survey's own — importance before execution.
  const byId = new Map(scales.map((s) => [s.id, s]));
  const axes = (instrument.scale_ids || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((s) => buildScale(s, options));

  return { ...instrument, axes };
}

// The questions an instrument asks, in survey order.
//
// Sorted by the instrument's own section order rather than alphabetically or by
// a stored rank: `sections` is the order the pages appear in, and a question
// whose section is not on that list sorts last rather than first — the same
// trap facetRank exists to avoid, where indexOf returning -1 quietly promotes
// an unknown value to the top.
export function orderQuestions(instrument, questions) {
  const rank = new Map((instrument.sections || []).map((s, i) => [s, i]));
  const at = (q) => (rank.has(q.section) ? rank.get(q.section) : (instrument.sections || []).length);
  return [...questions].sort((a, b) => {
    const d = at(a) - at(b);
    if (d !== 0) return d;
    return (a.section_sort ?? 0) - (b.section_sort ?? 0);
  });
}

// The sections that actually hold a question, in the instrument's order. An
// instrument can name a section whose questions were all deactivated, and a
// survey page with nothing on it is worse than one page fewer.
export function sectionsWithQuestions(instrument, questions) {
  const present = new Set(questions.map((q) => q.section));
  return (instrument.sections || []).filter((s) => present.has(s));
}
