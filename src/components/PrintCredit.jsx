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
    </div>
  );
}
