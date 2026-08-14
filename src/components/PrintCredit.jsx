import ChaosAssessmentPlug from "@/components/ChaosAssessmentPlug";

// The Product Growth Leaders credit at the foot of a printed report.
//
// Print-only, and once at the end rather than on every sheet. These reports get
// saved as PDFs and forwarded to managers and coaches, which is exactly when a
// credit earns its place — but a report about someone's own skills is not an
// advertisement, so it sits on the cover and nowhere else. `plug` adds the
// Chaos Assessment pointer as a last line, which is how these reports carry it
// on paper: it used to close the document, where it cost a near-empty final
// sheet of its own for two lines of text.

export default function PrintCredit({ plug = false }) {
  return (
    <div className="print-only print-footer">
      <p className="text-sm text-gray-600">Prepared for you by Product Growth Leaders</p>
      {/* A real anchor, not plain text. Printing an address as text leaves every
          PDF viewer to guess where the link starts, and they guess badly: one
          reader turned this line into "http://ctgrowthleaders.com", five
          characters short, and offered it to the reader as the destination. An
          anchor puts a proper link annotation in the PDF with the address
          spelled out, so there is nothing left to infer. */}
      <p className="text-xs text-gray-400 mt-0.5">
        <a href="https://www.productgrowthleaders.com" className="text-gray-400 no-underline">
          productgrowthleaders.com
        </a>
      </p>
      {plug && <ChaosAssessmentPlug compact />}
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
