// The naming standard for assessments.
//
// Every assessment name is three parts joined the same way:
//
//   Team Gap Analysis - Blackbaud - Initial assessment 260917
//   instrument          client      what this run is
//
// It exists because the name is not only a label in our list. It is the
// heading on every report a buyer, a team leader, and each respondent reads,
// and the thing a facilitator searches when a client comes back eighteen
// months later wanting the same diagnostic run again. A name that says only
// "Team Gap Analysis" cannot answer either question.
//
// So the parts are collected separately at creation and joined here, rather
// than being typed freehand into one box and hoped for. The title stays a
// plain string in the record — nothing downstream parses it back apart — so
// renaming later on the Overview tab is still ordinary free text.

export const NAMING_SEPARATOR = " - ";

// Lower-cased inside a title, but never as the first or last word. The usual
// house list; "vs" and "via" are in it because activity names use them.
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
  "nor", "of", "on", "onto", "or", "over", "per", "the", "to", "up", "vs",
  "via", "with",
]);

// Title Case, the way the standard means it: "Team gap analysis" becomes
// "Team Gap Analysis".
//
// A word that already carries an inner capital is left exactly as typed —
// that covers acronyms (CPO), product names (iOS), and anything hyphenated
// the client spells their own way. Only all-lower and all-upper words are
// reshaped, so title-casing a name twice changes nothing the second time.
export function titleCase(text) {
  const words = String(text || "").split(/(\s+)/);
  const indices = words.map((w, i) => (w.trim() ? i : -1)).filter(i => i >= 0);
  const first = indices[0];
  const last = indices[indices.length - 1];
  return words.map((word, i) => {
    if (!word.trim()) return word;
    const bare = word.replace(/[^A-Za-z]/g, "");
    // Already mixed case (iOS, McKinsey) or an acronym (CPO): leave it be.
    if (bare && bare !== bare.toLowerCase()) return word;
    const lower = word.toLowerCase();
    if (MINOR_WORDS.has(lower.replace(/[^a-z]/g, "")) && i !== first && i !== last) return lower;
    // Capitalise after a hyphen, slash, or bracket too, minding minor words
    // inside a compound: "Go-to-Market", "Yes/No".
    return lower.replace(/(^|[-/(])([a-z]+)/g, (whole, edge, segment) =>
      edge && MINOR_WORDS.has(segment) ? whole : edge + segment.charAt(0).toUpperCase() + segment.slice(1));
  }).join("");
}

// The join. Empty parts drop out rather than leaving a stranded separator,
// which matters while an older assessment is being renamed a piece at a time.
export function composeAssessmentTitle({ name, company, modifier }) {
  return [name, company, modifier]
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(NAMING_SEPARATOR);
}

// YYMMDD, the date shorthand the standard's examples use. Local time on
// purpose: a facilitator naming an engagement means the day they are having.
export function dateStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

// What the placeholders and the note show. One example, built today, so the
// date in it is never stale enough to be copied wrongly.
export const NAMING_EXAMPLE = {
  get name() { return "Team Gap Analysis"; },
  get company() { return "Blackbaud"; },
  get modifier() { return `Initial assessment ${dateStamp()}`; },
  get full() { return composeAssessmentTitle(NAMING_EXAMPLE); },
};

// Said once, here, so the creation panel and the rename form cannot drift
// into describing the standard two different ways.
export const NAMING_NOTE =
  "Name it the same way every time: instrument, client, then what this particular run is. Use Public when there is no client.";

export const GENERIC_COMPANY = "Public";
