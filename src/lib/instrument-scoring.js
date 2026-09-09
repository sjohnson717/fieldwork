// Scoring for the instruments that ask their own questions on a single scale.
//
// Kept apart from scoring.js and personal-scoring.js on purpose, the same way
// those two are kept apart from each other. Those measure a distance between
// axes — importance against execution, experience against skills — and these
// have one axis, so their finding is not a gap but a spread: where a room
// disagrees with itself.
//
// The one rule that runs through everything here: an unanswered question is
// missing data, not a bad answer. It leaves the numerator and the denominator
// alike, and every number that comes out of this file says what it was based
// on. On Wix a blank scored zero, which made an abandoned Idea Reality Check
// read as genuine high uncertainty and told the reader to go and do discovery.

// An option that carries no points is an answer to the question but not a
// rating — the team gap's "I don't know", and any scale that adds one. It
// counts in the distribution, because "four people cannot say" is a finding,
// and stays out of the arithmetic, because it is not a position on the scale.
const isRated = (option) => option && option.points !== null && option.points !== undefined;

const pointsByLabel = (axis) => {
  const map = new Map();
  for (const o of axis.options) map.set(o.label, isRated(o) ? o.points : null);
  return map;
};

// One person's score: the points they earned over the points they could have
// earned on the questions they actually answered.
//
// `possible` is built from the answered questions rather than from every
// question the instrument asks, which is what keeps a partly-finished survey
// honest instead of penalised. `of` and `answered` travel with it so a report
// can say "11 of 12, based on 6 of 9 answers" rather than presenting a
// fraction that quietly means something else.
export function scoreFor(questions, answersByActivity, axis) {
  const points = pointsByLabel(axis);
  const top = Math.max(...axis.options.filter(isRated).map((o) => o.points));
  let earned = 0;
  let possible = 0;
  let answered = 0;
  const rated = questions.filter((q) => q.question_type !== "text");
  for (const q of rated) {
    const label = answersByActivity[q.id]?.answer;
    if (!label) continue;
    const p = points.get(label);
    if (p === null || p === undefined) continue;
    earned += p;
    possible += top;
    answered += 1;
  }
  return { earned, possible, answered, of: rated.length };
}

// Which band a score falls in. Inclusive at both ends, and null when the score
// is based on nothing — a band is a verdict, and there is nothing to give a
// verdict on until somebody has answered something.
export function bandFor(bands, score) {
  if (!score || score.answered === 0) return null;
  return (
    bands.find(
      (b) =>
        typeof b.min_score === "number" &&
        typeof b.max_score === "number" &&
        score.earned >= b.min_score &&
        score.earned <= b.max_score,
    ) || null
  );
}

// How a group answered one question.
//
// `spread` is the normalised standard deviation of the points behind the
// answers — 0 when everyone agrees, 1 at the widest disagreement the scale
// allows. Computed on points rather than on positions so the scales' deliberate
// non-linearity is respected: on the challenge scale, Absolutely and Never sit
// further apart than Somewhat and Not so much, and the report should say so.
//
// A question one person answered has no spread rather than a spread of zero.
// One opinion is not agreement, and sorting it alongside genuine consensus
// would bury the questions where a team actually lines up.
export function distributionFor(question, rows, axis) {
  const points = pointsByLabel(axis);
  const counts = axis.options.map((o) => ({ label: o.label, points: o.points ?? null, n: 0 }));
  const byLabel = new Map(counts.map((c) => [c.label, c]));
  let unanswered = 0;
  const values = [];
  for (const row of rows) {
    const label = row?.answer;
    if (!label) { unanswered += 1; continue; }
    const c = byLabel.get(label);
    if (c) c.n += 1;
    const p = points.get(label);
    if (p !== null && p !== undefined) values.push(p);
  }

  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
  let spread = null;
  if (n > 1) {
    const rated = axis.options.filter(isRated).map((o) => o.points);
    const lo = Math.min(...rated);
    const hi = Math.max(...rated);
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    // The widest a standard deviation can be on this scale: half the range,
    // reached when the group splits evenly between the two extremes.
    const widest = (hi - lo) / 2;
    spread = widest === 0 ? 0 : Math.min(1, sd / widest);
  }

  return {
    counts,
    answered: n,
    // Blanks this function could see: a row that exists carrying no answer,
    // which is what saveResponses writes when somebody clears one or moves past
    // a question. It is not the whole story — a respondent who never reached
    // the page has no row here at all — so a report that wants to say how many
    // people skipped a question counts against its own roster instead. `given`
    // is what that subtraction needs.
    unanswered,
    given: counts.reduce((s, c) => s + c.n, 0),
    responded: n + unanswered,
    mean,
    spread,
    // The answer most people gave, and null when two tie — a modal answer that
    // silently picks a winner from a dead heat is the same mistake as averaging
    // a split.
    top: (() => {
      const best = [...counts].sort((a, b) => b.n - a.n);
      if (!best[0] || best[0].n === 0) return null;
      return best[1] && best[1].n === best[0].n ? null : best[0].label;
    })(),
  };
}

// The facilitator's agenda: what to open the conversation with.
//
// Critical questions come first whatever the numbers say. That is the Product
// Success veto, which arrived as prose in a CMS field nothing read — a product
// could answer No to all four of its non-negotiables, score 5 of 9 and be told
// to Maintain. Implemented here as placement rather than arithmetic, because
// the useful form of "this outranks the total" in a facilitated session is
// "start here", not a different number.
//
// Everything else sorts by disagreement. A question a team splits on is worth
// more of a room's time than one it is unanimously gloomy about, and unanimity
// is not a problem a discussion solves.
export function agendaOrder(questions, distributions) {
  const flagged = (q) => {
    if (!q.critical) return false;
    const d = distributions[q.id];
    if (!d) return false;
    // A non-negotiable only earns the top of the list when somebody actually
    // answered it badly. Flagging it regardless would put four questions at the
    // top of every report and stop meaning anything.
    const worst = Math.min(...d.counts.filter((c) => c.points !== null).map((c) => c.points));
    return d.counts.some((c) => c.points === worst && c.n > 0);
  };
  return [...questions].sort((a, b) => {
    const fa = flagged(a), fb = flagged(b);
    if (fa !== fb) return fa ? -1 : 1;
    const sa = distributions[a.id]?.spread ?? -1;
    const sb = distributions[b.id]?.spread ?? -1;
    if (sa !== sb) return sb - sa;
    // Stable tail: instrument order, so two questions nobody split on do not
    // swap places between two loads of the same report.
    return (a.section_sort ?? 0) - (b.section_sort ?? 0);
  });
}
