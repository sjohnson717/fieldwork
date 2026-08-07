// Scoring for the personal assessment type: what each person brings to the
// same activity library the team gap assessment rates.
//
// Kept separate from scoring.js on purpose. Importance and execution are 0–3;
// these are 0–5 with non-linear spacing, so nothing here can share the gap
// helpers over there — a "3" does not mean the same thing in the two files.

// The three scales, in the order they are asked and reported.
// `label` is what is stored on the Response record; the numbers are display
// only, so re-scoring an axis never requires touching stored data.
export const EXPERIENCE_SCORE = { "None": 0, "Limited": 1, "Some": 3, "Extensive": 5 };
export const SKILLS_SCORE     = { "None": 1, "Untrained": 2, "Good": 3, "Very good": 4, "Excellent": 5 };
export const INTEREST_SCORE   = { "None": 0, "Limited": 1, "Moderate": 3, "Passionate": 5 };

export const EXPERIENCE_OPTIONS = ["None", "Limited", "Some", "Extensive"];
export const SKILLS_OPTIONS     = ["None", "Untrained", "Good", "Very good", "Excellent"];
export const INTEREST_OPTIONS   = ["None", "Limited", "Moderate", "Passionate"];

// The three axes as data, so the survey, the results grid and the report all
// iterate the same list instead of each hard-coding three of everything.
export const PERSONAL_AXES = [
  { key: "experience", label: "Experience", options: EXPERIENCE_OPTIONS, scores: EXPERIENCE_SCORE },
  { key: "skills",     label: "Skills",     options: SKILLS_OPTIONS,     scores: SKILLS_SCORE },
  { key: "interest",   label: "Interest",   options: INTEREST_OPTIONS,   scores: INTEREST_SCORE },
];

export const AXIS_BY_KEY = Object.fromEntries(PERSONAL_AXES.map(a => [a.key, a]));

// Skills floors at 1 while experience and interest floor at 0, so raw scores
// are not comparable across axes: someone with nothing at all reads 0/0/1, and
// a naive average of the three is pulled up by an axis that cannot reach zero.
// Every cross-axis number below is computed on this 0–1 normalisation instead,
// which is why the floor mismatch is a display quirk here rather than a bias.
export const normalize = (axisKey, label) => {
  const axis = AXIS_BY_KEY[axisKey];
  if (!axis) return null;
  const raw = axis.scores[label];
  if (raw === undefined) return null;
  const values = Object.values(axis.scores);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (raw - min) / (max - min);
};

export const score = (axisKey, label) => AXIS_BY_KEY[axisKey]?.scores[label] ?? null;

export const avg = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);
export const fmt = (n) => (n === null || n === undefined ? "—" : n.toFixed(1));
export const pct = (n) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);

// ── Capability and its four quadrants ──────────────────────────────────────
// Capability blends experience and skills — what someone can do today. Interest
// is kept out of it deliberately: willingness is not ability, and mixing them
// hides exactly the case worth finding (keen and untrained).
export const capability = (resp) => {
  const parts = [normalize("experience", resp?.experience), normalize("skills", resp?.skills)]
    .filter(v => v !== null);
  return parts.length === 0 ? null : avg(parts);
};

export const interestLevel = (resp) => normalize("interest", resp?.interest);

// Capability × interest, at the midpoint of each normalised axis.
//
// Two vocabularies, deliberately. `label`/`hint` are the facilitator's, and
// they are blunt because they are diagnostic notes for someone preparing a
// coaching engagement. `selfLabel`/`selfHint` are what the person themselves
// reads, and none of the facilitator's words survive the translation —
// "Reluctant" and "Poor fit" are fair shorthand between consultants and
// indefensible addressed to the individual they describe.
//
// The self-facing set files "capable but not energised" under strengths on
// purpose. Both it and `strength` are things the person does well; the only
// difference is what the work costs them. Filed anywhere else it reads as a
// deficiency, which is both untrue and the fastest way to make people answer
// the interest question dishonestly next time.
// `color` is the facilitator's and carries valence on purpose — amber on
// "capable but not interested" is a real warning to someone staffing a team.
//
// `selfAccent` deliberately carries none. Four quadrants are categories, not a
// ranking, and a green→amber→grey ramp asserts an order that doesn't exist:
// grey reads as "dead" under a heading that says "that's information, not a
// verdict", and colour wins that argument every time, because a swatch is
// decoded before a sentence. So the person's report gets four hues of equal
// weight, used as a left border and a heading tint rather than a fill. It also
// has to survive greyscale printing, since the PDF is the share artefact —
// which means colour can navigate but must never be the message.
export const QUADRANTS = {
  strength: {
    label: "Strength",
    hint: "Capable and interested — hand this over",
    selfLabel: "Strengths that energize you",
    selfHint: "You do this well, and it's the kind of work you'd choose more of.",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    selfAccent: "border-l-teal-400",
    selfHeading: "text-teal-900",
  },
  develop: {
    label: "Develop",
    hint: "Interested but not yet capable — train here",
    selfLabel: "Where you want to grow",
    selfHint: "The pull is there ahead of the practice. This is where coaching pays off fastest.",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    selfAccent: "border-l-sky-400",
    selfHeading: "text-sky-900",
  },
  sustain: {
    label: "Reluctant",
    hint: "Capable but not interested — a retention risk",
    selfLabel: "Strengths that don't energize you",
    selfHint: "You have the skills to do this well. It just doesn't seem to be the kind of work that gives you energy, or that you'd choose to spend most of your time on.",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    selfAccent: "border-l-indigo-400",
    selfHeading: "text-indigo-900",
  },
  avoid: {
    label: "Poor fit",
    hint: "Neither capable nor interested — don't assign",
    selfLabel: "Not your focus right now",
    selfHint: "Neither the experience nor the pull is here yet. That's information, not a verdict.",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    selfAccent: "border-l-violet-400",
    selfHeading: "text-violet-900",
  },
};

// When one quadrant holds most of someone's answers, the list stops being the
// finding and the shape becomes it. Someone whose profile is almost entirely
// "not your focus" is not being told forty separate things — they are being
// told the role's scope and their own centre of gravity are different places,
// and reading that as a column of forty shortfalls gets it exactly backwards.
//
// Two thirds is the threshold: enough to be the story, not so low that a
// merely lopsided profile trips it.
export const DOMINANT_SHARE = 2 / 3;

export const dominantBucket = (profile) => {
  if (profile.answeredCount === 0) return null;
  for (const [key, rows] of Object.entries(profile.buckets)) {
    const share = rows.length / profile.answeredCount;
    if (share >= DOMINANT_SHARE) return { key, share, count: rows.length };
  }
  return null;
};

// Addressed to the person, and none of these is a verdict on them — each names
// a relationship between someone and a scope of work, which is the thing that
// can actually be changed.
// "9 of the 9" is how a machine counts, not how a person writes.
const portion = (n, total) => (n === total ? `all ${total}` : `${n} of the ${total}`);

export const DOMINANT_SUMMARY = {
  strength: (n, total) =>
    `You rated yourself capable and engaged across ${portion(n, total)} activities here. This scope fits you well — the useful conversation is probably about which of these you want to go deepest on, not which to shore up.`,
  develop: (n, total) =>
    `The pull is there ahead of the practice across ${portion(n, total)} activities here. That's an unusually clear development agenda: you know where you want to go, and the work is building the reps to get there.`,
  sustain: (n, total) =>
    `You rated yourself capable across ${portion(n, total)} activities here, but few of them are work you'd choose more of. Being good at something isn't the same as wanting it, and a profile shaped like this is worth talking about before it turns into quiet burnout.`,
  avoid: (n, total) =>
    `Most of this scope — ${portion(n, total)} activities — sits outside both your experience and your interest. That says more about the shape of this role than about you: the question worth asking is whether this scope is the work you actually want, and if not, which parts of it you'd keep.`,
};

export const quadrant = (resp) => {
  const cap = capability(resp);
  const int = interestLevel(resp);
  if (cap === null || int === null) return null;
  const capable = cap >= 0.5;
  const keen = int >= 0.5;
  if (capable && keen) return "strength";
  if (!capable && keen) return "develop";
  if (capable && !keen) return "sustain";
  return "avoid";
};

// Heat for the results grid. One ramp shared by all three axes, fed the
// normalised value so the bands mean the same thing on each.
export const heatClass = (norm) => {
  if (norm === null || norm === undefined) return "bg-gray-50 text-gray-300";
  if (norm >= 0.8) return "bg-[#3366FF] text-white";
  if (norm >= 0.6) return "bg-[#7f9dff] text-[#12235c]";
  if (norm >= 0.4) return "bg-[#c3d1ff] text-[#12235c]";
  if (norm >= 0.2) return "bg-[#e6ecff] text-[#2952CC]";
  return "bg-gray-100 text-gray-500";
};

// ── Aggregation ────────────────────────────────────────────────────────────

// Per activity, across everyone who answered: the three axis averages (raw,
// for display), plus normalised capability and interest for cross-axis work.
// `bestFit` is the strongest capability on the team for that activity, which is
// what turns "nobody here can do this" into a named coverage gap.
export function computeActivityCapability(activities, responses, respondents = []) {
  const nameById = Object.fromEntries(respondents.map(r => [r.id, r.name]));
  const stats = {};
  for (const act of activities) {
    const actResps = responses.filter(r => r.activity_id === act.id);

    const axisAvg = {};
    for (const axis of PERSONAL_AXES) {
      const vals = actResps.map(r => score(axis.key, r[axis.key])).filter(v => v !== null);
      axisAvg[axis.key] = avg(vals);
    }

    const caps = actResps.map(capability).filter(v => v !== null);
    const ints = actResps.map(interestLevel).filter(v => v !== null);

    let bestFit = null;
    for (const r of actResps) {
      const cap = capability(r);
      if (cap === null) continue;
      if (!bestFit || cap > bestFit.capability) {
        bestFit = { respondent_id: r.respondent_id, name: nameById[r.respondent_id] || null, capability: cap };
      }
    }

    stats[act.id] = {
      axisAvg,
      avgCapability: avg(caps),
      avgInterest: avg(ints),
      bestFit,
      n: actResps.length,
    };
  }
  return stats;
}

// Per person: their answers bucketed into the four quadrants, strongest first.
// This is the individual development plan, and the input to any staffing call.
export function computePersonProfile(activities, responses, respondentId) {
  const mine = responses.filter(r => r.respondent_id === respondentId);
  const byActivity = Object.fromEntries(mine.map(r => [r.activity_id, r]));

  const rows = activities.map(act => {
    const resp = byActivity[act.id];
    return {
      activity: act,
      response: resp || null,
      capability: capability(resp),
      interest: interestLevel(resp),
      quadrant: quadrant(resp),
    };
  });

  const buckets = { strength: [], develop: [], sustain: [], avoid: [] };
  for (const row of rows) if (row.quadrant) buckets[row.quadrant].push(row);
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => (b.capability + b.interest) - (a.capability + a.interest));
  }

  const answered = rows.filter(r => r.capability !== null);
  return {
    rows,
    buckets,
    answeredCount: answered.length,
    avgCapability: avg(answered.map(r => r.capability)),
    avgInterest: avg(rows.filter(r => r.interest !== null).map(r => r.interest)),
  };
}

// ── Crossing a personal assessment against its parent team assessment ───────

// Coverage thresholds are normalised, so they hold whatever the underlying
// scales are. 0.5 capability is "Some experience / Good skills" territory.
const COVERED = 0.5;
const IMPORTANT = 1.5; // on the parent's 0–3 importance scale

// Where the team says an activity matters and nobody has the capability for it.
// This is the finding neither assessment can produce alone: the gap analysis
// knows what is important and going badly, the personal assessment knows who
// could actually fix it, and the interesting rows are the ones where the answer
// is nobody.
export function computeCoverage(activities, capabilityStats, teamStats) {
  const rows = [];
  for (const act of activities) {
    const cap = capabilityStats[act.id];
    const team = teamStats?.[act.id];
    if (!cap || cap.n === 0) continue;

    const best = cap.bestFit?.capability ?? null;
    const covered = best !== null && best >= COVERED;
    const matters = team?.avgImp != null && team.avgImp >= IMPORTANT;

    rows.push({
      activity: act,
      avgImp: team?.avgImp ?? null,
      avgGap: team?.avgGap ?? null,
      topOwner: team?.topOwner ?? null,
      bestFit: cap.bestFit,
      avgCapability: cap.avgCapability,
      avgInterest: cap.avgInterest,
      covered,
      // Ranked worst first: important, badly executed, and nobody capable.
      risk: (matters ? 1 : 0) + (covered ? 0 : 1) + ((team?.avgGap ?? 0) >= 1 ? 1 : 0),
    });
  }
  return rows.sort((a, b) => b.risk - a.risk || (b.avgGap ?? 0) - (a.avgGap ?? 0));
}
