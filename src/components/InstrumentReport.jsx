import { distributionFor, agendaOrder } from "@/lib/instrument-scoring";
import PrintCredit from "@/components/PrintCredit";

// The team report for an instrument that asks its own questions.
//
// It leads with distribution, not with a score. A mean placed in a band is a
// verdict, and a verdict is what the individual's own summary is for; here the
// point is the shape of the room. Eight people answering "Absolutely" and two
// answering "Never" average to "Somewhat", which is the one reading that is
// certainly wrong, and it is exactly the reading a headline number would print.
//
// Questions are ordered by how much the team disagreed, with any non-negotiable
// somebody answered badly ahead of all of them. That order is the agenda: the
// Chaos Assessment's own closing advice tells a buyer to gather the team and
// work out where perceptions differ, and this is that, computed.

// The diverging ramp, worst answer to best.
//
// Red for the problem end, blue for the other, strong at the extremes and pale
// in the middle, with a neutral grey for an option that sits exactly on the
// scale's midpoint. Not the rose/amber/lime/emerald ramp this replaced: those
// four were one row each with their label beside them, so colour carried
// nothing. A stacked bar has no room for a label per segment, and measured,
// amber-400 and lime-400 — the two middle options of the challenge scale, side
// by side in every question — sit 1.4 apart under deuteranopia and 14.7 with
// full colour vision, under the 15 floor for telling two colours apart at all.
//
// These clear it: worst adjacent pair 16.1 under protanopia, 22.0 normal
// vision, on both the white sheet and the dark one.
const PROBLEM_STRONG = "#a82a20";
const PROBLEM_WEAK   = "#e8877c";
const FINE_WEAK      = "#6da7ec";
const FINE_STRONG    = "#184f95";
const NEUTRAL        = "#9ca3af";

// Where the line falls, and what colour each option takes.
//
// Options are split by the scale's own midpoint in points: below it they belong
// to the problem arm, above it to the other, and an option sitting exactly on
// the midpoint straddles the line in grey — by the scale's own arithmetic it is
// neither side. That rule is the same on all three scales these instruments
// use. The challenge scale's four points (0/3/5/8) divide two and two; Yes/No
// divides one and one; Yes/No/Unknown puts Unknown on the problem arm, Yes on
// the other, and No — exactly midway — astride the line.
//
// An option carrying no points at all is not a position on the scale and gets
// no place on the axis; it is counted beside the bar instead, with the people
// who never answered.
function armsFor(counts) {
  const rated = counts.filter(c => c.points !== null);
  if (rated.length === 0) return null;
  const lo = Math.min(...rated.map(c => c.points));
  const hi = Math.max(...rated.map(c => c.points));
  const mid = (lo + hi) / 2;
  const left = [];   // built outward from the centre
  const right = [];
  for (const c of rated) {
    if (c.points < mid) left.unshift({ ...c, side: "left", share: 1 });
    else if (c.points > mid) right.push({ ...c, side: "right", share: 1 });
    else {
      // Half a straddling option each side, so the bar stays centred on the
      // line rather than the option picking a side it does not have.
      left.unshift({ ...c, side: "left", share: 0.5, neutral: true });
      right.unshift({ ...c, side: "right", share: 0.5, neutral: true });
    }
  }
  // Strongest colour at each far end, palest beside the line. `left` runs
  // outward from the centre, so its last entry is the extreme.
  const paint = (arr, strong, weak) => arr.map((c, i) => ({
    ...c,
    color: c.neutral ? NEUTRAL : (i === arr.length - 1 ? strong : weak),
  }));
  return {
    left: paint(left, PROBLEM_STRONG, PROBLEM_WEAK),
    right: paint(right, FINE_STRONG, FINE_WEAK),
  };
}

// Every option in scale order, worst on the left and best on the right, each
// carrying the colour it takes in both drawings. One source for the key, the
// diverging bar and the share bar, so a colour can never mean one thing in the
// legend and another in the picture beneath it.
function paletteFor(counts) {
  const arms = armsFor(counts);
  if (!arms) return [];
  const seen = new Set();
  const out = [];
  for (const c of [...arms.left].reverse().concat(arms.right)) {
    if (seen.has(c.label)) continue;
    seen.add(c.label);
    out.push(c);
  }
  return out;
}

// Dark ink on the pale steps and the neutral, light on the strong ends, so a
// count never sits on a colour it cannot be read against.
const onColor = (c) =>
  c.neutral || c.color === PROBLEM_WEAK || c.color === FINE_WEAK ? "#1f2937" : "#ffffff";

function Legend({ axis }) {
  const counts = axis.options.map(o => ({ label: o.label, points: o.points ?? null, n: 0 }));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {paletteFor(counts).map(c => (
        <span key={c.label} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

// Percentages that add up to a hundred.
//
// Rounding each share on its own gives three thirds of 33% and a reader who
// adds them up and gets 99. Largest remainder hands the leftover points to the
// shares that lost the most in the rounding, so the printed numbers total what
// the reader expects them to.
function wholePercents(values, total) {
  if (!total) return values.map(() => 0);
  const exact = values.map(v => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem);
  const out = [...floors];
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

// One question, as a single bar divided by how the room answered.
//
// The buyer's drawing. Every bar is the same length, so what it compares is
// composition — the shape of one question against the shape of the next — and
// a percentage is the unit a client audience reads without translating.
//
// What it gives up is the denominator: a question two people skipped draws the
// same length as one everybody answered, which is why the count of people who
// did answer is printed beside it rather than left to the footnote.
function ShareDistribution({ dist, expected }) {
  const missing = Math.max(0, (expected ?? dist.given) - dist.given);
  const options = paletteFor(dist.counts).filter(c => c.n > 0);
  const total = options.reduce((s, c) => s + c.n, 0);
  const unrated = dist.counts.filter(c => c.points === null && c.n > 0);
  if (total === 0) return null;

  const percents = wholePercents(options.map(c => c.n), total);

  return (
    <div className="space-y-1.5">
      <div className="flex h-6 gap-[2px]">
        {options.map((c, i) => (
          <div
            key={c.label}
            className="h-6 flex items-center justify-center text-[11px] font-semibold tabular-nums overflow-hidden first:rounded-l-sm last:rounded-r-sm"
            style={{
              flex: `${c.n} 0 0%`,
              backgroundColor: c.color,
              color: onColor(c),
            }}
            title={`${c.label} — ${c.n} of ${total}`}
          >
            {percents[i] >= 12 ? `${percents[i]}%` : ""}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        {total} of {expected ?? total} answered
        {unrated.length > 0 && unrated.map(c => ` · ${c.n} answered ${c.label.toLowerCase()}`).join("")}
        {missing > 0 && ` · ${missing} didn\u2019t answer this`}
      </p>
    </div>
  );
}

// One question, as a bar centred on the line.
//
// The scale is the roster, not this question's own answers: one person is the
// same width on every question, so a question two people skipped draws a
// visibly shorter bar rather than stretching eight answers to the width of ten.
function Distribution({ dist, expected }) {
  // Counted against the roster, not against the rows this question happens to
  // have. Someone who stopped before reaching the page leaves no row at all, so
  // a blank measured from the rows alone would report nobody skipped anything.
  const missing = Math.max(0, (expected ?? dist.given) - dist.given);
  const arms = armsFor(dist.counts);
  if (!arms) return null;

  // Half the track holds the whole roster, so both arms are on one scale and
  // the widest possible bar still fits.
  const people = Math.max(1, expected ?? dist.given);
  const unit = 50 / people;
  const width = (c) => c.n * c.share * unit;
  const armWidth = (arm) => arm.reduce((s, c) => s + width(c), 0);

  // Answers that are not a position on the scale — the team gap's "I don't
  // know", and anything like it a later instrument adds.
  const unrated = dist.counts.filter(c => c.points === null && c.n > 0);

  const segments = (arm) => arm.map((c) => {
    const w = width(c);
    if (w <= 0) return null;
    // Sized by flex rather than by a width percentage. A percentage inside the
    // arm resolves against the arm, not against the track, so every segment
    // came out as a fraction of a fraction; growing them in proportion puts
    // each one back on the track's own scale.
    return (
      <div
        key={`${c.label}-${c.side}`}
        className="h-6 flex items-center justify-center text-[11px] font-semibold tabular-nums overflow-hidden"
        style={{
          flex: `${w} 0 0%`,
          backgroundColor: c.color,
          color: onColor(c),
        }}
        title={`${c.label} — ${c.n}`}
      >
        {/* A straddling option is one block cut by the line, so its count is
            written once, on the right half — printing it on both would read as
            twice as many people as answered. */}
        {w >= 4.5 && (c.share !== 0.5 || c.side === "right") ? c.n : ""}
      </div>
    );
  });

  return (
    <div className="space-y-1.5">
      <div className="relative h-6">
        {/* The line every question is measured against, and the reason this
            drawing is worth more than four rows of bars. It has to be visible
            in print: at gray-300 and a bar's own height it disappeared into the
            page, leaving each bar floating with nothing to be centred on. */}
        <div className="absolute left-1/2 -top-2 -bottom-2 w-px bg-gray-400" aria-hidden="true" />
        <div
          className="absolute top-0 h-6 flex flex-row-reverse gap-[2px] justify-start"
          style={{ right: "50%", width: `${armWidth(arms.left)}%` }}
        >
          {segments(arms.left)}
        </div>
        <div
          className="absolute top-0 h-6 flex gap-[2px]"
          style={{ left: "50%", width: `${armWidth(arms.right)}%` }}
        >
          {segments(arms.right)}
        </div>
      </div>
      {(missing > 0 || unrated.length > 0) && (
        <p className="text-[11px] text-gray-400">
          {unrated.map(c => `${c.n} answered ${c.label.toLowerCase()}`).join(" · ")}
          {unrated.length > 0 && missing > 0 && " · "}
          {missing > 0 && `${missing} didn\u2019t answer this`}
        </p>
      )}
    </div>
  );
}

// Whether what the room agreed on is the worst answer the scale offers.
//
// `top` is the modal answer and is null on a tie, so this is only ever true
// when there is a clear majority and that majority picked the bottom option.
const agreedOnTheWorst = (dist) => {
  if (!dist.top) return false;
  const rated = dist.counts.filter(c => c.points !== null);
  if (rated.length === 0) return false;
  const worst = Math.min(...rated.map(c => c.points));
  return rated.some(c => c.label === dist.top && c.points === worst);
};

// How split the room was, in words. A number between 0 and 1 is precise and
// tells a facilitator nothing they can act on; these three bands are what the
// agenda actually turns on.
//
// The badge measures agreement, not health, and those two came apart at the
// only place it mattered: eight people answering No to a non-negotiable — the
// worst finding on the page — carried a green "Agreed" beside a solid red bar.
// The word was right and the colour was not, so the word stays and unanimity on
// the worst answer loses the green. Split and Some disagreement need no such
// handling; nothing about rose or amber reads as reassurance.
const splitLabel = (spread, grim) => {
  if (spread === null) return null;
  if (spread >= 0.6) return { text: "Split", tone: "text-rose-700 bg-rose-50 border-rose-200" };
  if (spread >= 0.25) return { text: "Some disagreement", tone: "text-amber-800 bg-amber-50 border-amber-200" };
  return {
    text: "Agreed",
    tone: grim
      ? "text-gray-600 bg-gray-50 border-gray-200"
      : "text-emerald-700 bg-emerald-50 border-emerald-200",
  };
};

// `chart` picks the drawing, not the numbers.
//
// **Nothing passes it today.** Both callers — the facilitator's results tab and
// the buyer's link — take the default, deliberately: the two are the same
// report seen twice, and that holds for the picture as much as for the figures.
// The buyer's copy was drawn as "share" for one commit and pulled back before
// it shipped, because a client and a facilitator looking at different pictures
// of the same question in the same meeting is exactly the divergence
// InstrumentResults warns about.
//
// "share" is kept because it is written, verified and one prop from being used
// if a reader ever genuinely needs it — a slide, an export, a client who reads
// percentages and nothing else. Wire it up only for a reader who is not in the
// room with somebody holding the other version.
export default function InstrumentReport({
  instrument,
  assessment,
  questions,
  responsesByActivity,
  respondentCount,
  completedCount,
  chart = "diverging",
}) {
  const axis = instrument.axes?.[0];
  if (!axis) return null;

  const rated = questions.filter(q => q.question_type !== "text");
  const distributions = {};
  for (const q of rated) {
    distributions[q.id] = distributionFor(q, responsesByActivity[q.id] || [], axis);
  }
  const ordered = agendaOrder(rated, distributions);

  // Written answers, gathered rather than counted. Seven people's answers to
  // "where would you put an extra million" side by side is a page a facilitator
  // reads out; it is not a statistic and there is nothing to average.
  //
  // Only questions the instrument marks reportable appear. The respondent's own
  // closing fields are a different thing on a different entity and stay out of
  // every report by construction.
  const textQuestions = questions.filter(q => q.question_type === "text" && q.reportable_text);

  const splitCount = ordered.filter(q => (distributions[q.id]?.spread ?? 0) >= 0.6).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 print-plain">
      <header className="mb-8">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
          {instrument.name}
        </p>
        <h1 className="text-2xl font-bold text-gray-900">{assessment.title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {assessment.company_name && <>{assessment.company_name} · </>}
          {completedCount} of {respondentCount} {respondentCount === 1 ? "person has" : "people have"} finished
          {assessment.subject && <> · about <span className="font-medium text-gray-700">{assessment.subject}</span></>}
        </p>
      </header>

      {/* No overall score. Said out loud rather than left as an absence: a
          reader who took this instrument on Wix got a number, and its absence
          here is a decision, not an omission. */}
      <section className="mb-8 border-l-2 border-gray-300 pl-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          There is no team score. The questions below are ordered by how much this team
          disagreed with itself, because that is what a session is for — a number averaged
          across {respondentCount} {respondentCount === 1 ? "person" : "people"} would hide
          exactly the splits worth an hour of the room&rsquo;s time.
          {splitCount > 0 && (
            <> {splitCount === 1 ? "One question" : `${splitCount} questions`} came back genuinely split.</>
          )}
        </p>
      </section>

      {/* One key for the whole report. Colour is the only thing naming an
          answer now that the options no longer each have their own labelled
          row, so it is stated once here rather than repeated per question. */}
      <div className="mb-6 pb-4 border-b border-gray-100">
        <Legend axis={axis} />
      </div>

      <ol className="space-y-8">
        {ordered.map((q, i) => {
          const d = distributions[q.id];
          const split = splitLabel(d.spread, agreedOnTheWorst(d));
          const worst = Math.min(...d.counts.filter(c => c.points !== null).map(c => c.points));
          const flagged = q.critical && d.counts.some(c => c.points === worst && c.n > 0);
          return (
            <li key={q.id} className="break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-gray-900">
                  <span className="text-gray-300 mr-2 tabular-nums">{i + 1}</span>
                  {q.name}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                  {flagged && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border text-rose-700 bg-rose-50 border-rose-200">
                      Non-negotiable
                    </span>
                  )}
                  {split && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${split.tone}`}>
                      {split.text}
                    </span>
                  )}
                </div>
              </div>
              {q.description && <p className="text-sm text-gray-500 mb-3">{q.description}</p>}
              {chart === "share"
                ? <ShareDistribution dist={d} expected={completedCount} />
                : <Distribution dist={d} expected={completedCount} />}
              {q.commentary && (
                <p className="text-sm text-gray-600 leading-relaxed mt-3 pt-3 border-t border-gray-100">
                  {q.commentary}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {textQuestions.map(q => {
        const written = (responsesByActivity[q.id] || [])
          .map(r => (r?.answer_text || "").trim())
          .filter(Boolean);
        if (written.length === 0) return null;
        return (
          <section key={q.id} className="mt-10 break-inside-avoid">
            <h2 className="text-base font-semibold text-gray-900">{q.name}</h2>
            {q.description && <p className="text-sm text-gray-500 mt-0.5 mb-3">{q.description}</p>}
            {/* Unattributed, and in the order they arrived. The survey promises
                answers are read in aggregate, and a paragraph is recognisable
                enough without a name on it. */}
            <ul className="space-y-2">
              {written.map((t, i) => (
                <li key={i} className="text-sm text-gray-700 border-l-2 border-gray-200 pl-3 leading-relaxed">
                  {t}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <PrintCredit orgName={assessment.org_name} />
    </div>
  );
}
