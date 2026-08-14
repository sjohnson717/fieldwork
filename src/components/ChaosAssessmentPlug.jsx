// A pointer to the Chaos Assessment at the foot of a finished report.
//
// Screen only — every caller wraps it in no-print. The invitation is worth
// something where it can be clicked, and the screen is where most people
// finish reading; on paper it is a pitch travelling inside a document about
// someone's own answers, forwarded to their manager or handed to a client.
export default function ChaosAssessmentPlug() {
  return (
    <div className="report-outro">
      <p className="text-sm text-gray-500">
        If you found this helpful, check out the Chaos Assessment at{" "}
        {/* A real anchor, with the address as its visible text — clickable, and
            readable if someone copies the line elsewhere. */}
        <a
          href="https://www.productgrowthleaders.com/assess"
          className="text-blue-600 hover:text-blue-700 print:text-gray-500 print:no-underline"
        >
          www.productgrowthleaders.com/assess
        </a>
      </p>
    </div>
  );
}
