import { SELF_BUCKETS } from "@/lib/self-gap";
import { FACET_SUBTITLES, IMPORTANCE_BADGE, EXECUTION_BADGE, BADGE_FALLBACK } from "@/lib/scoring";

// What one respondent said, summarized, above the answer table they already had.
//
// The personal report's shape, rebuilt around the two things a team gap asks:
// how much an activity matters and how well it is being done. The distance
// between those is the whole finding, which is why nothing here ever combines
// them into a single number.
//
// No "Try this" tips, unlike the personal report. A personal development gap is
// the person's own to close this week; a team gap frequently belongs to someone
// else entirely, and handing an individual a to-do for work they do not own
// would misread the instrument.

// Both axes run 0–3, so one divisor serves both bars.
const pct = (v) => (v === null || v === undefined ? 0 : Math.round((v / 3) * 100));

function SectionHeading({ eyebrow, title, blurb }) {
  return (
    <div className="print-section mb-5 pt-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{eyebrow}</p>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {blurb && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{blurb}</p>}
    </div>
  );
}

export default function TeamGapSelfSummary({ profile }) {
  const { buckets, facets, unknowns } = profile;

  return (
    <>
      {/* ── 1. Where you'd focus first ── */}
      <SectionHeading
        eyebrow="Part one"
        title="Where you'd focus first"
        blurb="Your answers sorted by the distance between how much an activity matters and how well you think it's being done. Importance and execution are kept apart on purpose — the gap between them is the finding, and one combined score would hide it."
      />

      <div className="space-y-4 mb-6">
        {Object.entries(SELF_BUCKETS).map(([key, b]) => {
          const bucket = buckets[key];
          if (!bucket || bucket.length === 0) return null;
          return (
            /* No break-inside-avoid: a fifteen-row bucket that cannot fit in
               what's left of a page jumped to the next one whole, leaving 40%
               of a sheet blank. Splitting mid-bucket costs nothing — the
               heading is pinned to the rows that follow it. */
            <div key={key} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${b.accent} p-5`}>
              <h3 className={`text-base font-bold ${b.heading}`}>{b.label} · {bucket.length}</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">{b.hint}</p>
              <div className="space-y-1.5">
                {/* The same pills, at the same width, as the answer table in the
                    appendix. As free text the two labels floated in a column
                    that was only as wide as its longest word, so no two rows
                    lined up and the eye couldn't run down either answer. */}
                {bucket.map(row => (
                  <div key={row.activity.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-800 flex-1 min-w-0">{row.activity.name}</span>
                    <span
                      className={`inline-block shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium text-center ${IMPORTANCE_BADGE[row.importance] || BADGE_FALLBACK}`}
                      style={{ width: "110px" }}
                    >
                      {row.importance}
                    </span>
                    <span
                      className={`inline-block shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium text-center ${EXECUTION_BADGE[row.execution] || BADGE_FALLBACK}`}
                      style={{ width: "110px" }}
                    >
                      {row.execution}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 shrink-0 w-16 text-right">
                      {row.activity.facet}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Only an individual report can carry this: "important, and I can't see
          how it's going" is a fact about one person's sightlines, and averaging
          it across a team turns it into a missing data point. */}
      {unknowns.length > 0 && (
        <div className="bg-[#eef2ff] rounded-xl border border-[#a3b8ff] p-5 mb-6 break-inside-avoid">
          <h3 className="text-sm font-bold text-[#1a2e7a] mb-1">
            {unknowns.length === 1 ? "One thing you couldn't answer" : `${unknowns.length} things you couldn't answer`}
          </h3>
          <p className="text-xs text-[#1a2e7a]/70 mb-3 leading-relaxed">
            You marked execution as "I don't know" here. That isn't a gap, it's a sightline — and it's worth raising in the workshop, because someone in the room can probably close it in a sentence.
          </p>
          <ul className="space-y-1.5">
            {unknowns.map(row => (
              <li key={row.activity.id} className="text-sm text-[#1a2e7a] leading-relaxed flex gap-2">
                <span className="text-[#4d80ff] shrink-0">·</span>
                <span>
                  <span className="font-semibold">{row.activity.name}</span> — you called it {row.importance.toLowerCase()},
                  and said you can't see how well it's being done.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 2. Your view by phase ── */}
      <SectionHeading
        eyebrow="Part two"
        title="Your view by phase"
        blurb="The same answers grouped by phase of product work. Two bars, never one combined score — where the blue bar runs well ahead of the grey one is where you see the most pressure."
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="space-y-4">
          {facets.map(row => (
            <div key={row.facet} className="break-inside-avoid">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-900">{row.facet}</span>
                <span className="text-xs text-gray-400">{FACET_SUBTITLES[row.facet]}</span>
                <span className="ml-auto text-[11px] text-gray-400">
                  {row.count} {row.count === 1 ? "activity" : "activities"}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-500 w-20 shrink-0">Matters</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
                    <div className="h-full bg-[#3366FF]" style={{ width: `${pct(row.importance)}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-500 w-20 shrink-0">Done well</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
                    <div className="h-full bg-[#7C8B9E]" style={{ width: `${pct(row.execution)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </>
  );
}
