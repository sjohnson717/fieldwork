import { SELF_BUCKETS, MIX_SEGMENTS, computeSelfGapMix } from "@/lib/self-gap";
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

// The whole set of answers as one band of colour, then the same band split by
// phase of product work.
//
// The personal report's summary card, rebuilt around what a team gap asks. The
// four sections below answer "what did I say about each activity" and nothing
// answered "what shape is this" — and here the shape is the more useful of the
// two, because someone whose answers are mostly red is describing a team under
// pressure everywhere rather than reporting fifteen separate problems.
//
// The per-phase split is what earns the space. The facet was already on every
// row as a grey word in the margin doing nothing; stacked per phase it shows
// whether the pressure is spread evenly or piled into one part of the
// lifecycle, which is the difference between a general complaint and something
// a workshop can be pointed at.
//
// No numbers on the bands themselves — a one-activity band has no room, and a
// count that only appears on the wide ones reads as a ranking. Totals sit at the
// end of each row and in the key.
function ShapeOfAnswers({ mix }) {
  if (mix.total === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-sm font-bold text-gray-900">The shape of your answers</h3>
        <span className="text-[11px] text-gray-400 shrink-0">
          {mix.total} {mix.total === 1 ? "activity" : "activities"}
        </span>
      </div>

      {/* Hairline gaps rather than one continuous bar. Printed in black and
          white — which is most of the time, because the PDF is what gets
          shared — red, amber and green collapse to much the same grey, and
          without a gap the bands stop being countable at all.

          Each band carries its own corners instead of the row being one
          rounded strip with the ends clipped off. The unrated band is drawn as
          an outline, and a clipped outline loses the side the clip lands on,
          which read as a broken bar rather than an empty one. It also matches
          the per-phase rows below. */}
      <div className="flex h-7 gap-px mb-2">
        {mix.overall.map(seg => (
          <div
            key={seg.key}
            className={`rounded-sm ${MIX_SEGMENTS[seg.key].fill}`}
            style={{ width: `${seg.share * 100}%` }}
          />
        ))}
      </div>

      {/* The key is the section headings verbatim, not shorter labels invented
          for it: the bar is only decodable if a band can be matched to the
          block it stands for.

          Saying the order out loud is what makes this survive a black and white
          printer — the swatches go grey with everything else, and position is
          then the only thing left that identifies a band. Every bar on this
          card uses the same order, including the per-phase ones. */}
      <p className="text-[11px] text-gray-400 mb-2.5">Bands run left to right in the order of this key.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 mb-5">
        {mix.overall.map(seg => (
          <div key={seg.key} className="flex items-baseline gap-2">
            <span className={`w-2.5 h-2.5 rounded-sm shrink-0 translate-y-0.5 ${MIX_SEGMENTS[seg.key].fill}`} />
            <span className="text-[11px] text-gray-600 leading-snug flex-1">{MIX_SEGMENTS[seg.key].label}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{seg.count}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="text-[11px] text-gray-400 mb-3">Where they sit across the product lifecycle</div>
        <div className="space-y-2">
          {mix.byFacet.map(row => (
            <div key={row.facet} className="flex items-center gap-3">
              <div className="w-20 sm:w-28 shrink-0 text-right leading-tight">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-900">{row.facet}</div>
                <div className="text-[10px] text-gray-400 hidden sm:block">{FACET_SUBTITLES[row.facet]}</div>
              </div>
              {/* Scaled against the busiest phase rather than each row filling
                  the width: a phase holding two activities should look smaller
                  than one holding six, which is most of what this view is for. */}
              <div className="flex-1 flex gap-0.5 h-4">
                {row.segments.map(seg => (
                  <div
                    key={seg.key}
                    className={`rounded-sm ${MIX_SEGMENTS[seg.key].fill}`}
                    style={{ width: `${(seg.count / mix.facetMax) * 100}%` }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-gray-400 w-4 shrink-0 text-right">{row.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const mix = computeSelfGapMix(profile);

  return (
    <>
      {/* ── 1. Where you'd focus first ── */}
      <SectionHeading
        eyebrow="Part one"
        title="Where you'd focus first"
        blurb="Your answers sorted by the distance between how much an activity matters and how well you think it's being done. Importance and execution are kept apart on purpose — the gap between them is the finding, and one combined score would hide it."
      />

      <ShapeOfAnswers mix={mix} />

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
              {/* Wider gaps on a phone, where each row is two lines: at 1.5 the
                  space between a name and its own pills matched the space
                  between one activity and the next, and the rows read as six
                  loose lines rather than three answers. */}
              <div className="space-y-3 sm:space-y-1.5">
                {/* The same pills, at the same width, as the answer table in the
                    appendix. As free text the two labels floated in a column
                    that was only as wide as its longest word, so no two rows
                    lined up and the eye couldn't run down either answer. */}
                {bucket.map(row => (
                  /* On a phone the pills drop to a line of their own beneath the
                     activity name. The four columns below need about 330px of
                     fixed width and a phone card offers under 300, so the name's
                     flex-1 collapsed to nothing and its wrapped text ran
                     underneath the pills. From sm up — which includes any
                     printed page, since print media queries measure the sheet —
                     the wrapper is display:contents and this is the same single
                     aligned line it has always been. */
                  <div key={row.activity.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-sm text-gray-800 sm:flex-1 sm:min-w-0">{row.activity.name}</span>
                    <div className="flex items-center gap-2 sm:contents">
                      <span
                        className={`whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium text-center flex-1 min-w-0 sm:flex-none sm:shrink-0 sm:w-[110px] ${IMPORTANCE_BADGE[row.importance] || BADGE_FALLBACK}`}
                      >
                        {row.importance}
                      </span>
                      <span
                        className={`whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium text-center flex-1 min-w-0 sm:flex-none sm:shrink-0 sm:w-[110px] ${EXECUTION_BADGE[row.execution] || BADGE_FALLBACK}`}
                      >
                        {row.execution}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-gray-400 shrink-0 w-16 text-right">
                        {row.activity.facet}
                      </span>
                    </div>
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
            You marked execution as "I don't know" here. That isn't a gap, it's a sightline — and it's worth raising in a workshop, because someone in the room can probably close it in a sentence.
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
        blurb="Phase by phase again, but the two ratings underneath rather than the gaps they added up to. Two bars, never one combined score — where the blue bar runs well ahead of the grey one is where you see the most pressure."
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
