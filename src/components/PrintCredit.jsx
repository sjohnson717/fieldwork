// The Product Growth Leaders credit at the foot of a printed report.
//
// Print-only, and once at the end rather than on every sheet. These reports get
// saved as PDFs and forwarded to managers and coaches, which is exactly when a
// credit earns its place — but a report about someone's own skills is not an
// advertisement, so it closes the document instead of running through it.

export default function PrintCredit() {
  return (
    <div className="print-only print-footer">
      <p className="text-sm text-gray-600">Prepared for you by Product Growth Leaders</p>
      <p className="text-xs text-gray-400 mt-0.5">productgrowthleaders.com</p>
    </div>
  );
}
