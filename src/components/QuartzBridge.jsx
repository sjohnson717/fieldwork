// The closing section of the Fractional CPO Practice Profile.
//
// Unlike ChaosAssessmentPlug, this one prints. That component is screen-only
// because it rides at the foot of a report about a team, which gets forwarded
// to a manager or handed to a client — a pitch travelling inside somebody
// else's document. This report has one reader, it is about their own practice,
// and the offer is the reason the instrument exists. Muted on paper rather
// than removed: no tint, no button, just the sentence and the address.
//
// The copy names what Quartz supplies and does not argue from the reader's
// score. A low dimension turning into a sales line is the thing the instrument
// was written to avoid — the diagnostic commentary above has already done the
// useful work, and this is where it says where the infrastructure comes from.
//
// The instrument's written definition linked to
// /program/fractional-product-leadership. That page is real, but it is the
// wrong one; the program this offers is quartz-product-leadership.
export default function QuartzBridge() {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 break-inside-avoid">
      <h2 className="text-base font-bold text-gray-900">
        Want more leverage from your practice?
      </h2>
      <div className="text-sm text-gray-600 leading-relaxed mt-2 space-y-2">
        <p>
          You just experienced one of the ideas behind Quartz Assessments. Instead of starting
          with advice, start with evidence.
        </p>
        <p>
          Quartz Product Leadership was built for experienced product leaders who want to make
          their consulting practices more repeatable without making them formulaic.
        </p>
        <p>
          You bring the experience. Quartz brings the infrastructure: assessments, a Product
          Operating Model, facilitation materials, learning programs, and a community of
          experienced practitioners.
        </p>
      </div>
      <p className="text-sm mt-4">
        {/* A real anchor with the address as its visible text, so the line
            survives being printed or pasted somewhere else. */}
        <a
          href="https://www.productgrowthleaders.com/program/quartz-product-leadership"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:text-blue-700 print:text-gray-600 print:no-underline break-words"
        >
          See how Quartz could support your Fractional CPO practice →
        </a>
      </p>
      {/* Printed only, because on screen the link above is clickable and the
          address underneath is clutter. On paper a link is a dead end without
          it. */}
      <p className="hidden print:block text-xs text-gray-500 mt-1 break-words">
        www.productgrowthleaders.com/program/quartz-product-leadership
      </p>
    </section>
  );
}
