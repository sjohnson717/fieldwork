import { Children } from "react";

// The note under a question, told apart from the question and the answer.
//
// These blocks used to be one column of text: the question, what the person
// said, and then a paragraph explaining what the question is about, separated
// by a hairline rule. On screen that reads as one continuous statement, and
// the paragraph — which is ours, written once for everybody — looked like part
// of what this particular reader had just said.
//
// So it moves into a panel of its own, with a label saying whose voice it is.
// A grey a step darker than the page rather than the app's usual card tint:
// this sits on the grey plane of a report on screen and on white paper, and
// gray-50 is invisible against the first of those.
// The tint survives printing (print-color-adjust is exact, see index.css), so
// the separation holds on paper, where it matters most: a saved PDF is read
// away from the session, by someone who was not told which part was advice.
//
// Shared by the person's own copy and the team report, because the same
// paragraph appears in both and two copies of this markup would drift.
export default function Commentary({ text, children }) {
  // Children.count rather than a truth test: the reading is passed as the
  // result of a .map(), and an empty array is truthy. Testing the prop itself
  // printed an empty panel carrying nothing but its own label under every
  // question that had neither commentary nor reading.
  if (!text && Children.count(children) === 0) return null;
  return (
    <div className="mt-3 rounded-lg bg-gray-100 border border-gray-200 px-4 py-3 break-inside-avoid">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
        Why this matters
      </p>
      {text && <p className="text-sm text-gray-600 leading-relaxed">{text}</p>}
      {children}
    </div>
  );
}
