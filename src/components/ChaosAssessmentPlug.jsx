// A pointer to the Chaos Assessment at the foot of a finished report.
//
// Unlike the credit below it, this shows on screen as well as on paper: the
// invitation is only worth anything if it can be clicked, and the screen is
// where most people finish reading. It closes the document — a report about
// someone's own skills earns the right to suggest a next step at the end, not
// alongside their answers.
// `compact` is the printed form: the same sentence and the same link, as one
// more line inside the cover's credit block rather than a bordered section of
// its own. The sentence lives here in both cases so the two can't drift.
export default function ChaosAssessmentPlug({ compact = false }) {
  if (compact) {
    return (
      <p className="text-xs text-gray-400 mt-1.5">
        If you found this helpful, check out the Chaos Assessment at{" "}
        <a
          href="https://www.productgrowthleaders.com/assess"
          className="text-gray-400 no-underline"
        >
          www.productgrowthleaders.com/assess
        </a>
      </p>
    );
  }

  return (
    <div className="report-outro">
      <p className="text-sm text-gray-500">
        If you found this helpful, check out the Chaos Assessment at{" "}
        {/* A real anchor, with the address as its visible text: on paper a PDF
            viewer has nothing left to guess about where the link goes, and on
            screen it is simply clickable. */}
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
