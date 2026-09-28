import { base44 } from "@/api/base44Client";

// What a respondent does with their report, for the Results tabs' After
// finishing counts: came back to it, saved it as a PDF, followed a reading link,
// or followed one of the two offers. Totals only; see
// base44/functions/recordEvent.
//
// The token is held here rather than passed down to every link, because the
// links sit several components deep in reports that the admin side also
// renders — RespondentPreview shows a respondent's own report to a
// facilitator. Only the survey page sets a token, so a facilitator clicking a
// reading link in a preview records nothing, and nobody has to remember to
// pass a flag through to make that true.
//
// Fire and forget. Base44 calls spike to several seconds at random, and a link
// that waited for its own count would be a link that felt broken. A count that
// fails is a count lost; nothing on screen depends on it.

let token = null;

export const setEventToken = (t) => {
  token = t || null;
};

export function track(event, detail) {
  if (!token) return;
  base44.functions
    .invoke("recordEvent", { token, event, detail: detail || "" })
    .catch(() => {});
}

/**
 * Counts the browser's own print command while the report is on screen, for
 * people who print from the menu or with a shortcut rather than the Save as PDF
 * button. Chrome, Edge, Firefox, and desktop Safari announce it; iOS Safari's
 * share-sheet route does not, so on an iPhone only the button is counted.
 * Returns the cleanup for an effect.
 */
export function watchPrint() {
  const onPrint = () => track("printed");
  window.addEventListener("beforeprint", onPrint);
  return () => window.removeEventListener("beforeprint", onPrint);
}
