// Scoring for the personal assessment type: what each person brings to the
// same activity library the team gap assessment rates.
//
// Kept separate from scoring.js on purpose. Importance and execution are 0–3;
// these are 0–5 with non-linear spacing, so nothing here can share the gap
// helpers over there — a "3" does not mean the same thing in the two files.

// The three scales, in the order they are asked and reported.
// `label` is what is stored on the Response record; the numbers are display
// only, so re-scoring an axis never requires touching stored data.
//
// All three are four points on the same 0/1/3/5 spacing. Skills was briefly
// five points — None/Untrained/Good/Very good/Excellent scored 1–5 — and both
// of those choices were wrong. Three positive grades gave self-raters a
// comfortable middle to park in, and "Very good" versus "Excellent" is not a
// distinction people can make reliably about themselves, so the extra point
// bought noise rather than resolution. Starting at 1 also meant someone with
// no capability at all read 0/0/1.
//
// "Untrained" went with it, and is not missed: the self-taught practitioner it
// named is better found as Experience: Extensive crossed with Skills: Basic,
// which is a sharper signal than any single checkbox and already shows up in
// the Matrix view.
export const EXPERIENCE_SCORE = { "None": 0, "Limited": 1, "Some": 3, "Extensive": 5 };
export const SKILLS_SCORE     = { "None": 0, "Basic": 1, "Good": 3, "Excellent": 5 };
export const INTEREST_SCORE   = { "None": 0, "Limited": 1, "Moderate": 3, "Passionate": 5 };

export const EXPERIENCE_OPTIONS = ["None", "Limited", "Some", "Extensive"];
export const SKILLS_OPTIONS     = ["None", "Basic", "Good", "Excellent"];
export const INTEREST_OPTIONS   = ["None", "Limited", "Moderate", "Passionate"];

// The three axes as data, so the survey, the results grid and the report all
// iterate the same list instead of each hard-coding three of everything.
export const PERSONAL_AXES = [
  { key: "experience", label: "Experience", options: EXPERIENCE_OPTIONS, scores: EXPERIENCE_SCORE },
  { key: "skills",     label: "Skills",     options: SKILLS_OPTIONS,     scores: SKILLS_SCORE },
  { key: "interest",   label: "Interest",   options: INTEREST_OPTIONS,   scores: INTEREST_SCORE },
];

export const AXIS_BY_KEY = Object.fromEntries(PERSONAL_AXES.map(a => [a.key, a]));

// All three axes share a range today, so this is currently the identity
// mapping onto 0–1. It stays because the alternative is that every cross-axis
// number silently assumes they always will: capability averages experience
// with skills, and the moment one scale gains a point or shifts its floor, raw
// averages start favouring whichever axis reaches highest. Normalising first
// makes that a non-event rather than a bias nobody notices.
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

// Five categories, from all three axes at the midpoint of each normalised
// scale. "High" is therefore Some/Good/Moderate and above.
//
// This deliberately does not use `capability()`. Averaging experience with
// skills — which is what capability does, and defensibly, for staffing calls —
// destroys the one distinction that matters most here: someone who has done a
// lot of this work and still rates their own skill low. That person needs
// coaching on an established practice, not exposure to a new one, and the
// merged number cannot tell them apart from a beginner.
//
// So skill and interest choose the bucket, and experience only splits the two
// development cases:
//
//   skill high, interest high                   -> enjoy
//   skill high, interest low                    -> deemphasize
//   skill low,  interest high, experience high  -> strengthen
//   skill low,  interest high, experience low   -> develop
//   skill low,  interest low                    -> lower
//
// Exhaustive and order-independent. `capability()` survives untouched for the
// facilitator's Coverage view, where "who is the best fit" genuinely does want
// one number; it just no longer appears anywhere the person themselves reads.
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
// `selfAccent` deliberately carries none. These are categories, not a ranking,
// and a green→amber→grey ramp asserts an order that doesn't exist: grey reads
// as "dead" under a heading that says "that's information, not a verdict", and
// colour wins that argument every time, because a swatch is decoded before a
// sentence. So the person's report gets five hues of equal weight, used as a
// left border and a heading tint rather than a fill. It also has to survive
// greyscale printing, since the PDF is the share artefact — which means colour
// can navigate but must never be the message.
//
// The first attempt at that was teal→sky→indigo→violet, which failed on its
// own terms: four adjacent hues are a ramp, and the two purples were not
// tellable apart in print. These are spread much wider.
//
// Slate on the last one is a deliberate reversal of the reasoning above, and
// the distinction is narrow enough to be worth stating. Grey is damning as the
// terminus of a green→amber→grey sequence, because the sequence is what says
// "and this is the bad end". Grey as the one neutral among three unrelated
// hues says only "neutral", which is what that quadrant honestly is — least
// experience, least pull. It is also the only option that separates cleanly
// from the other three without borrowing red, amber or green and dragging
// their meanings along.
// Declaration order is report order, and it is not arbitrary: what you have,
// then what you could build, then the two that are questions about your role
// rather than your ability, then what isn't a priority. Ending on "lower
// priority" also keeps the longest, least actionable list off the top of page
// one.
export const CATEGORIES = {
  enjoy: {
    label: "Strength",
    hint: "Skilled and interested — hand this over",
    selfLabel: "Strengths you enjoy using",
    selfHint: "You report strong skills in this work and a high level of interest in doing it. These are activities you may want to continue using and developing.",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    selfAccent: "border-l-teal-500",
    selfHeading: "text-teal-800",
  },
  develop: {
    label: "Develop",
    hint: "Wants it, hasn't done it — exposure and coaching",
    selfLabel: "Development opportunities",
    selfHint: "You're interested in this work but report less experience or skill. These may be good areas to explore, practice, or develop.",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    selfAccent: "border-l-blue-500",
    selfHeading: "text-blue-800",
  },
  deemphasize: {
    label: "Reluctant",
    hint: "Skilled but disengaged — a retention risk",
    selfLabel: "Strengths you may not want to emphasize",
    selfHint: "You have the experience and skills to do this work well, but you report less interest in doing it. Consider whether you want these activities to remain part of your role or become a larger part of it.",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    selfAccent: "border-l-violet-500",
    selfHeading: "text-violet-800",
  },
  // The category the old four-bucket model could not express, and the reason
  // this file stopped merging experience with skills.
  strengthen: {
    label: "Under-skilled",
    hint: "Experienced and keen, but rates own skill low — sharpen an existing practice",
    selfLabel: "Skills to strengthen",
    selfHint: "You have experience with this work and an interest in doing it, but you rate your current skills lower. Focused learning, practice, or feedback may help turn experience into greater capability.",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    selfAccent: "border-l-amber-500",
    selfHeading: "text-amber-800",
  },
  lower: {
    label: "Poor fit",
    hint: "Little experience, skill or interest — don't assign",
    selfLabel: "Lower-priority development areas",
    selfHint: "You report relatively little experience, skill, or interest in these activities. They may not be priorities for your development right now.",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    selfAccent: "border-l-slate-400",
    selfHeading: "text-slate-700",
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
  enjoy: (n, total) =>
    `You rated yourself skilled and engaged across ${portion(n, total)} activities here. This scope fits you well — the useful conversation is probably about which of these you want to go deepest on, not which to shore up.`,
  develop: (n, total) =>
    `The pull is there ahead of the practice across ${portion(n, total)} activities here. That's an unusually clear development agenda: you know where you want to go, and the work is building the reps to get there.`,
  deemphasize: (n, total) =>
    `You rated yourself skilled across ${portion(n, total)} activities here, but few of them are work you'd choose more of. Being good at something isn't the same as wanting it, and a profile shaped like this is worth talking about before it turns into quiet burnout.`,
  strengthen: (n, total) =>
    `Across ${portion(n, total)} activities here you have both the experience and the appetite, and rate your own skill below either. That pattern is rarely a training gap in the usual sense — it more often means the practice was learned on the job without anyone ever showing you a better version of it.`,
  lower: (n, total) =>
    `Most of this scope — ${portion(n, total)} activities — sits outside your experience, skills and interest alike. That says more about the shape of this role than about you: the question worth asking is whether this scope is the work you actually want, and if not, which parts of it you'd keep.`,
};

// Skill and interest choose the bucket; experience only separates the two
// low-skill/high-interest cases. See the block above CATEGORIES for why this
// deliberately does not go through capability().
//
// Skills and interest must both be answered. Experience missing is survivable —
// it falls to `develop`, the gentler of the two, rather than asserting an
// established practice nobody reported.
export const category = (resp) => {
  const exp = normalize("experience", resp?.experience);
  const skl = normalize("skills", resp?.skills);
  const int = normalize("interest", resp?.interest);
  if (skl === null || int === null) return null;

  const skilled = skl >= 0.5;
  const keen = int >= 0.5;

  if (skilled) return keen ? "enjoy" : "deemphasize";
  if (!keen) return "lower";
  return exp !== null && exp >= 0.5 ? "strengthen" : "develop";
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

// Per person: their answers bucketed into the five categories, strongest first.
// This is the individual development plan, and the input to any staffing call.
export function computePersonProfile(activities, responses, respondentId) {
  const mine = responses.filter(r => r.respondent_id === respondentId);
  const byActivity = Object.fromEntries(mine.map(r => [r.activity_id, r]));

  const rows = activities.map(act => {
    const resp = byActivity[act.id];
    return {
      activity: act,
      response: resp || null,
      // All three kept separate on the row. Anything that wants them merged can
      // merge them; nothing that wants them apart can un-merge them afterwards.
      experience: normalize("experience", resp?.experience),
      skills: normalize("skills", resp?.skills),
      interest: interestLevel(resp),
      capability: capability(resp),
      category: category(resp),
    };
  });

  const buckets = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, []]));
  for (const row of rows) if (row.category) buckets[row.category].push(row);
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => ((b.skills ?? 0) + b.interest) - ((a.skills ?? 0) + a.interest));
  }

  // Answered means classifiable, which is what every count on the report is
  // actually reporting — "all 7 activities, and how you rated each one".
  const answered = rows.filter(r => r.category !== null);
  return {
    rows,
    buckets,
    answeredCount: answered.length,
    avgCapability: avg(answered.map(r => r.capability).filter(v => v !== null)),
    avgInterest: avg(rows.filter(r => r.interest !== null).map(r => r.interest)),
  };
}

// ── The Quartz profile: all three axes, per facet ──────────────────────────
//
// Deliberately three numbers per facet and no fourth combining them. A single
// per-facet score is exactly the "73% Product Manager" grade this assessment
// refuses to produce — and it would hide the finding that matters most, which
// is where the three axes disagree with each other.
export function computeFacetProfile(profile, facetOrder) {
  return facetOrder
    .map(facet => {
      const rows = profile.rows.filter(r => r.activity.facet === facet && r.category !== null);
      if (rows.length === 0) return null;
      const axis = (key) => avg(rows.map(r => r[key]).filter(v => v !== null));
      return {
        facet,
        count: rows.length,
        experience: axis("experience"),
        skills: axis("skills"),
        interest: axis("interest"),
      };
    })
    .filter(Boolean);
}

// ── Development opportunities ──────────────────────────────────────────────
//
// Drawn only from the two categories where the person has already said they
// want the work. Recommending development someone has no appetite for is how a
// report earns the reaction "this wasn't written for me" — and low interest is
// a legitimate answer, not a deficit to be corrected.
//
// Ranked by interest first, then by how far skill trails it. Interest leads
// because it is the thing the person controls least and predicts follow-through
// most; the gap breaks ties by where effort would show up soonest.
export function computeDevelopmentOpportunities(profile, limit = 5) {
  const candidates = [...profile.buckets.strengthen, ...profile.buckets.develop];

  return candidates
    .map(row => ({
      ...row,
      gap: (row.interest ?? 0) - (row.skills ?? 0),
      // Why this one, in the person's own terms. The two categories are
      // different recommendations, not two grades of the same one.
      reason: row.category === "strengthen"
        ? "You already do this work and want to keep doing it, but rate your own skill below both. Sharpening an established practice usually pays off faster than starting a new one."
        : "You want this work and have had little chance at it so far. The first move here is exposure — a real example to work on, with someone to learn from.",
    }))
    .sort((a, b) => (b.interest ?? 0) - (a.interest ?? 0) || b.gap - a.gap)
    .slice(0, limit);
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
