// The five bars, and the two dimensions worth reading first.
//
// Everything else a respondent sees on their own copy is about one question at
// a time. This is the only block that says something about the shape of all
// fifteen answers together, which is the whole reason the instrument groups
// them into dimensions rather than asking a flat list.
//
// Scores sit on the same 0-3 the survey was answered on, and the bar is
// mean/3 — the denominator GapBar already uses, because every rating scale in
// this app tops out at three points.
//
// No number is printed beside a bar. Three statements make a coarse average,
// and "2.33" invites arithmetic the instrument cannot support: the difference
// between 2.33 and 2.67 is one person choosing Usually over Consistently on
// one statement. The bar shows the shape, the callouts name the two ends, and
// the prose does the work.

// The word for where a dimension landed, on the same four steps the bands use.
// Shown instead of the figure, for the reason above.
const STANDING = [
  { min: 2.5, label: "Systematic" },
  { min: 2, label: "Established" },
  { min: 1.25, label: "Developing" },
  { min: 0, label: "Ad hoc" },
];
const standingFor = (mean) =>
  mean === null ? "Not answered" : (STANDING.find((s) => mean >= s.min)?.label ?? "Ad hoc");

function Bar({ dimension, blurb, emphasis }) {
  const pct = dimension.mean === null ? 0 : (dimension.mean / 3) * 100;
  return (
    <li className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-700">{dimension.name}</p>
        <p className="text-[11px] text-gray-500 shrink-0">{standingFor(dimension.mean)}</p>
      </div>
      <div className="bg-gray-100 rounded-full h-2.5 mt-1.5">
        <div
          className={`h-2.5 rounded-full transition-all ${emphasis ? "bg-[#3366FF]" : "bg-[#a3b8ff]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {blurb && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{blurb}</p>}
      {/* A dimension is three statements, so a skipped one moves the bar
          noticeably. Said where the bar is rather than in a footnote, and only
          where it happened. */}
      {dimension.score.answered > 0 && dimension.score.answered < dimension.score.of && (
        <p className="text-[11px] text-gray-400 mt-1">
          Based on the {dimension.score.answered} of {dimension.score.of} you answered.
        </p>
      )}
    </li>
  );
}

// One end of the profile, with the prose written for landing there.
//
// Plural when the numbers tie, rather than nominating one of two identical
// dimensions: which of them is "the" strongest is a question the answers did
// not settle, and the reader can see both bars anyway.
function Callout({ title, dimensions, prose, tone }) {
  if (!dimensions.length) return null;
  const border = tone === "strong" ? "border-l-[#11CC77]" : "border-l-[#3366FF]";
  return (
    <section className={`bg-white rounded-xl border border-gray-200 border-l-4 ${border} p-5 break-inside-avoid`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {dimensions.length === 1 ? title.one : title.many}
      </p>
      <p className="text-base font-bold text-gray-900 mt-0.5">
        {dimensions.map((d) => d.name).join(" and ")}
      </p>
      {dimensions.map((d) => {
        const text = prose(d);
        return text ? (
          <p key={d.name} className="text-sm text-gray-600 leading-relaxed mt-2">{text}</p>
        ) : null;
      })}
    </section>
  );
}

export default function DimensionProfile({ dimensions, sections, callouts }) {
  const byName = new Map((sections || []).map((s) => [s.name, s]));
  const emphasised = new Set(
    [...callouts.strongest, ...callouts.leverage].map((d) => d.name),
  );

  // Nothing to show before anything is answered. The page still has the
  // person's answers below it, which is the honest thing to show somebody who
  // opened their summary having skipped the survey.
  if (!dimensions.some((d) => d.mean !== null)) return null;

  return (
    <>
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
          Your practice profile
        </h2>
        <ul className="space-y-4">
          {dimensions.map((d) => (
            <Bar
              key={d.name}
              dimension={d}
              blurb={byName.get(d.name)?.blurb}
              emphasis={emphasised.has(d.name)}
            />
          ))}
        </ul>
      </section>

      <Callout
        title={{ one: "Your strongest area", many: "Your strongest areas" }}
        dimensions={callouts.strongest}
        prose={(d) => byName.get(d.name)?.strong}
        tone="strong"
      />
      <Callout
        title={{ one: "Your greatest leverage opportunity", many: "Your greatest leverage opportunities" }}
        dimensions={callouts.leverage}
        prose={(d) => byName.get(d.name)?.opportunity}
        tone="opportunity"
      />
    </>
  );
}
