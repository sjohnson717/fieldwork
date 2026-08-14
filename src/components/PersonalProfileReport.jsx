import {
  CATEGORIES,
  PERSONAL_AXES,
  computeFacetProfile,
  computeDevelopmentOpportunities,
  dominantBucket,
  DOMINANT_SUMMARY,
} from "@/lib/personal-scoring";
import { FACET_ORDER, FACET_SUBTITLES } from "@/lib/scoring";
import PrintCredit from "@/components/PrintCredit";
import ChaosAssessmentPlug from "@/components/ChaosAssessmentPlug";

const QUARTZ_ICON = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png";

// The person's own report. Advisory first: the interpretation is the document,
// and the raw answers are an appendix behind it.
//
// It used to be the other way round — a table of the labels someone had just
// picked, with a short interpretation above it. That is a receipt, not a report.
// Nobody needs to be told what they just typed; what they cannot do for
// themselves is see the shape of it.
//
// Deliberately produces no overall score. "73% Product Manager" would be read as
// a grade, would be quoted out of context, and would need experience, skills and
// interest to mean the same kind of thing — which is exactly what this
// assessment exists to keep apart.

const RESOURCE_TYPES = {
  free_article:  { label: "Free article",        tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  external:      { label: "External resource",   tone: "bg-blue-50 text-blue-700 border-blue-200" },
  quartz_book:   { label: "Quartz book",         tone: "bg-violet-50 text-violet-700 border-violet-200" },
  quartz_course: { label: "Course or workshop",  tone: "bg-amber-50 text-amber-800 border-amber-200" },
};

// Questions for the person to take into a development conversation. Phrased for
// them to ask, not for a manager to ask about them — this document belongs to
// the person, and handing their manager an interview script would change what it
// is for.
const CONVERSATION_QUESTIONS = [
  "Which of these strengths are most valuable in my current role?",
  "Which development opportunities would most benefit the team?",
  "Where could I get more experience?",
  "Am I spending significant time on work I'm capable of doing but don't particularly want to emphasize?",
  "Does my current role align with the kind of product work I want to do more of?",
];

// A bar rather than a number, and no number alongside it. An average of
// "Some" and "Extensive" is not 0.8 of anything a person can act on; the bar
// says "more here than there", which is the only claim the data supports.
function AxisBar({ value }) {
  const pct = value === null || value === undefined ? 0 : Math.round(value * 100);
  return (
    <div className="flex-1 h-2 rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
      <div className="h-full bg-[#3366FF]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionHeading({ eyebrow, title, blurb, first = false }) {
  return (
    <div className={`${first ? "" : "print-section"} mb-5 pt-1`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{eyebrow}</p>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {blurb && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{blurb}</p>}
    </div>
  );
}

export default function PersonalProfileReport({
  profile,
  activities,
  assessment,
  respondent,
  name,
  title,
  myToken,
  returningCompleted,
  onRevise,
  onCopyLink,
  copiedLink,
  resources = [],
  // Set by the facilitator's preview, which renders someone else's profile:
  // revising is theirs to do, and the resume link is theirs to hold.
  readOnly = false,
}) {
  const facetRows = computeFacetProfile(profile, FACET_ORDER);
  const opportunities = computeDevelopmentOpportunities(profile);
  const dominant = dominantBucket(profile);

  // Only resources attached to something actually recommended. A page of
  // everything in the library would be a catalogue, and a catalogue is the thing
  // that makes a recommendation read as advertising.
  //
  // Listed once each, under the highest-ranked opportunity that claims them: a
  // third of the library serves several activities, so without this the same
  // article can appear three times on one page and the section starts to read as
  // padding rather than a shortlist.
  const resourcesByActivity = [];
  const alreadyListed = new Set();
  for (const o of opportunities) {
    const items = resources.filter(
      r => (r.activity_ids || []).includes(o.activity.id) && !alreadyListed.has(r.id)
    );
    if (items.length === 0) continue;
    items.forEach(r => alreadyListed.add(r.id));
    resourcesByActivity.push({ activity: o.activity, items });
  }

  return (
    <>
      {/* Paper-only header: the on-screen one is conversational and carries no
          assessment name or date, which a saved PDF needs to be useful. */}
      <div className="print-only print-cover mb-6">
        <img src={QUARTZ_ICON} alt="" className="h-8 w-8 mb-4 object-contain" />
        <h1 className="text-xl font-bold text-gray-900">{assessment?.title}</h1>
        {assessment?.company_name && <p className="text-sm text-gray-600">{assessment.company_name}</p>}
        <p className="text-sm text-gray-600 mt-2">{name}{title ? ` · ${title}` : ""}</p>
        {(() => {
          // The submission date, not the print date — this is a record of what
          // they said and when. Revising re-stamps it, so a reprinted copy always
          // matches the answers shown on it.
          const submitted = respondent?.completed_date
            ? new Date(respondent.completed_date)
            : returningCompleted ? null : new Date();
          if (!submitted) return null;
          return (
            <p className="text-xs text-gray-500">
              Submitted {submitted.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          );
        })()}
        <PrintCredit />
      </div>

      <div className="flex items-center gap-3 mb-8 no-print">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Your profile, {name.split(" ")[0]}</h1>
          {/* Same reasoning as the team gap report: the invitation to come
              back and change an answer belongs to the person whose answers
              they are, not to a facilitator reading over their shoulder. */}
          <p className="text-sm text-gray-500">
            {readOnly
              ? "Their answers are saved, and this is the report they can keep."
              : "Your answers are saved. This is yours to keep — save it as a PDF to share with your manager or a coach, and come back and change any answer whenever you like."}
          </p>
        </div>
      </div>

      <div className="no-print mb-8 space-y-3">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            Save as PDF to share
          </button>
          {!readOnly && (
            <button
              onClick={onRevise}
              className="border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              ← Revise my answers
            </button>
          )}
        </div>
        {myToken && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">
              Bookmark your own link to come back to this and update it at any time. It's yours — anyone with it can change your answers.
            </p>
            <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 max-w-lg">
              <p className="text-[11px] text-gray-500 font-mono flex-1 truncate">
                {`${window.location.origin}/assess?t=${myToken}`}
              </p>
              <button
                onClick={onCopyLink}
                className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition-colors"
              >
                {copiedLink ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 1. Your Product Profile ── */}
      <SectionHeading
        first
        eyebrow="Part one"
        title="Your product profile"
        blurb="Your answers sorted by what they suggest you might do next. Experience, skills and interest are kept apart on purpose — they tell you different things, and combining them into a single score would hide the most useful findings."
      />

      {dominant && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 break-inside-avoid">
          <p className="text-sm text-gray-700 leading-relaxed">
            {DOMINANT_SUMMARY[dominant.key](dominant.count, profile.answeredCount)}
          </p>
        </div>
      )}

      <div className="space-y-4 mb-2">
        {Object.entries(CATEGORIES).map(([key, c]) => {
          const bucket = profile.buckets[key];
          if (!bucket || bucket.length === 0) return null;
          return (
            <div key={key} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${c.selfAccent} p-5 break-inside-avoid`}>
              <h3 className={`text-base font-bold ${c.selfHeading}`}>{c.selfLabel}</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">{c.selfHint}</p>
              <div className="space-y-1.5">
                {bucket.map(row => (
                  <div key={row.activity.id} className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-gray-800">{row.activity.name}</span>
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 shrink-0">{row.activity.facet}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2. Your Quartz Profile ── */}
      <SectionHeading
        eyebrow="Part two"
        title="Your Quartz profile"
        blurb="The same answers by phase of product work. Three separate bars, never one combined score — where they disagree is usually the interesting part."
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        {/* No axis legend here. The bars are stacked rows and each carries its
            own label, so a row of the three axis names at the top read as column
            headings for a table that doesn't exist. */}
        <div className="mb-4 text-[11px] text-gray-400">Longer bar = higher self-rating</div>
        <div className="space-y-4">
          {facetRows.map(row => (
            <div key={row.facet} className="break-inside-avoid">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-900">{row.facet}</span>
                <span className="text-xs text-gray-400">{FACET_SUBTITLES[row.facet]}</span>
                <span className="ml-auto text-[11px] text-gray-400">
                  {row.count} {row.count === 1 ? "activity" : "activities"}
                </span>
              </div>
              <div className="space-y-1">
                {PERSONAL_AXES.map(axis => (
                  <div key={axis.key} className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-500 w-20 shrink-0">{axis.label}</span>
                    <AxisBar value={row[axis.key]} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Development Opportunities ── */}
      <SectionHeading
        eyebrow="Part three"
        title="Development opportunities"
        blurb="Drawn only from work you said you're interested in. Low interest is a legitimate answer, not a gap to be corrected, so nothing here is recommended on the strength of a low score alone."
      />

      {opportunities.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            Nothing in this assessment combines high interest with a lower self-rated skill, so there's no development shortlist to draw. That isn't a gap in the data — it usually means the scope you were asked about is work you already do well, and the more useful conversation is about scope than about skills.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {opportunities.map((o, i) => (
            <div key={o.activity.id} className="bg-white rounded-xl border border-gray-200 p-5 break-inside-avoid">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-xs font-bold text-gray-300">{i + 1}</span>
                <h3 className="text-sm font-bold text-gray-900 flex-1">{o.activity.name}</h3>
                <span className="text-[10px] uppercase tracking-widest text-gray-400 shrink-0">{o.activity.facet}</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed pl-6">{o.reason}</p>
              {o.activity.description && (
                <p className="text-xs text-gray-400 leading-relaxed pl-6 mt-1.5">{o.activity.description}</p>
              )}
              {/* Attached to the opportunity rather than collected into a list of
                  its own: a tip is only useful next to the reason it was offered,
                  and five of these read as a plan where sixty-five would read as
                  homework. */}
              {o.activity.try_this && (
                <p className="text-xs text-gray-700 leading-relaxed pl-6 mt-2.5">
                  <span className="font-semibold text-gray-900">Try this: </span>
                  {o.activity.try_this}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#eef2ff] rounded-xl border border-[#a3b8ff] p-5 mb-4 break-inside-avoid">
        <h3 className="text-sm font-bold text-[#1a2e7a] mb-1">Questions worth asking</h3>
        <p className="text-xs text-[#1a2e7a]/70 mb-3 leading-relaxed">
          Take these into a conversation with your manager or a coach. The answers are not in this report — they depend on your role and your team.
        </p>
        <ul className="space-y-1.5">
          {CONVERSATION_QUESTIONS.map(q => (
            <li key={q} className="text-sm text-[#1a2e7a] leading-relaxed flex gap-2">
              <span className="text-[#4d80ff] shrink-0">·</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── 4. Suggested Resources ──
          Omitted entirely when nothing is attached, rather than printing an
          empty promise. */}
      {resourcesByActivity.length > 0 && (
        <>
          <SectionHeading
            eyebrow="Part four"
            title="Suggested resources"
            blurb="Reading for the opportunities above — mostly free articles, plus a few books worth owning. None of it is a prerequisite: the tips above are the part you can act on this week."
          />
          <div className="space-y-4 mb-4">
            {resourcesByActivity.map(({ activity, items }) => (
              <div key={activity.id} className="bg-white rounded-xl border border-gray-200 p-5 break-inside-avoid">
                <h3 className="text-sm font-bold text-gray-900 mb-3">{activity.name}</h3>
                <div className="space-y-3">
                  {items.map(r => {
                    const type = RESOURCE_TYPES[r.resource_type] || RESOURCE_TYPES.external;
                    return (
                      <div key={r.id}>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${type.tone}`}>
                            {type.label}
                          </span>
                          <span className="text-sm text-gray-800 font-medium">{r.title}</span>
                          {r.source && <span className="text-xs text-gray-400">{r.source}</span>}
                        </div>
                        {r.note && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.note}</p>}
                        {r.url && (
                          /* A link whose visible text is the address itself. The
                             address has to be readable on paper, where a link is
                             just underlined words — but showing it as plain text
                             left someone reading on screen retyping an article
                             URL by hand. This prints the same and clicks. */
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[11px] text-blue-600 hover:text-blue-800 hover:underline mt-0.5 break-all"
                          >
                            {r.url}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Appendix ── */}
      {/* Counted from the rows the table actually prints, not from
          answeredCount — that excludes anything left unrated, so a person who
          skipped an activity was told "all 6 activities" above a table of 7 and
          had to wonder which answer had gone missing. Skipped rows are still
          shown, as a dash, so the count has to include them. */}
      <SectionHeading
        eyebrow="Appendix"
        title="Your responses"
        blurb={
          activities.length === profile.answeredCount
            ? `All ${activities.length} ${activities.length === 1 ? "activity" : "activities"}, and how you rated each one.`
            : activities.length - profile.answeredCount === 1
              ? `All ${activities.length} activities. The one you didn't rate shows as a dash.`
              : `All ${activities.length} activities. The ${activities.length - profile.answeredCount} you didn't rate show as a dash.`
        }
      />
      {FACET_ORDER.filter(f => activities.some(a => a.facet === f)).map(facet => {
        const facetActs = activities.filter(a => a.facet === facet);
        return (
          <div key={facet} className="mb-6">
            <div className="facet-heading text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 px-1">{facet}</div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-2/5">Activity</th>
                    {PERSONAL_AXES.map(axis => (
                      <th key={axis.key} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">{axis.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {facetActs.map(activity => {
                    const row = profile.rows.find(r => r.activity.id === activity.id);
                    const resp = row?.response || {};
                    return (
                      <tr key={activity.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5 text-gray-800">{activity.name}</td>
                        {PERSONAL_AXES.map(axis => (
                          <td key={axis.key} className="px-3 py-2.5 text-center">
                            {resp[axis.key] ? (
                              <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                                {resp[axis.key]}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <ChaosAssessmentPlug />
      <PrintCredit />
    </>
  );
}
