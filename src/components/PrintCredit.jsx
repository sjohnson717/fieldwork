// The credit at the foot of a printed report.
//
// Print-only, and on the cover rather than at the end. These reports get saved
// as PDFs and forwarded to managers and coaches, which is exactly when a credit
// earns its place — but a report about someone's own skills is not an
// advertisement, so it appears once. The Chaos Assessment pointer is not here:
// it closes the report on screen, where it can be clicked, and stays off the
// paper — a saved PDF travels to managers and coaches, and a pitch riding along
// on someone's own answers is the wrong thing to put in front of them.
//
// The firm is named from the data, not hardcoded, because an assessment can be
// run by another firm's facilitator through this app — publicAssessment resolves
// it from the assessment's organisation, or the creator's. FALLBACK_ORG covers
// the records that predate organisations and carry neither, which is most of
// them today; it is the app owner, which is who prepared those.

const FALLBACK_ORG = "Product Growth Leaders";

export default function PrintCredit({ orgName }) {
  return (
    <div className="print-only print-footer">
      <p className="text-sm text-gray-600">Prepared for you by {orgName || FALLBACK_ORG}</p>
      {/* Scoped on purpose. What Product Growth Leaders owns is the framework —
          the activity library, the facets, the interpretation. What it does not
          own is the answers, and this page tells the reader in plain words that
          the report is theirs to keep. A bare notice under that sentence would
          read as a claim over their own data on a document that just asked them
          to be candid about their weaknesses.

          The year is derived rather than typed, so a report printed years from
          now doesn't carry a stale one. */}
      <p className="text-[10px] text-gray-400 mt-2">
        Assessment framework © {new Date().getFullYear()} Product Growth Leaders.
        Your responses are your own.
      </p>
    </div>
  );
}
