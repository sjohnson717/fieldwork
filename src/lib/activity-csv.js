import { FACET_ORDER } from "@/lib/scoring";

// Import/export format for the library activity list. The columns are exactly
// what LibraryPage's "Export CSV" emits, so a round-trip through a spreadsheet
// is lossless and an exported file can be re-imported unchanged.
export const CSV_COLUMNS = ["Facet", "Activity", "Description", "Recommended Owner", "Try This", "Active"];

/**
 * Parses CSV text into an array of row objects keyed by header name.
 *
 * Hand-rolled rather than pulled from a library because the format is fixed and
 * small, but it does handle the two things that actually break naive splitting:
 * quoted fields containing commas, and quoted fields containing newlines — both
 * of which appear routinely in activity descriptions.
 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM — Excel writes one, and it would otherwise become part of
  // the first header name and break the column lookup.
  // \uFEFF as an escape, not the character itself: this used to hold a
  // literal BOM, which is invisible in an editor and silently deleted by a
  // careless edit to the line.
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else field += c;
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* handled by the \n that follows */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  // Last line, if the file does not end with a newline.
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter(r => r.some(cell => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], records: [] };

  const headers = nonEmpty[0].map(h => h.trim());
  const records = nonEmpty.slice(1).map(r =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))
  );
  return { headers, records };
}

const truthy = (v) => ["yes", "true", "1", "y"].includes(String(v).trim().toLowerCase());

/**
 * Validates parsed rows into activity shape, collecting per-row errors rather
 * than throwing — the import preview shows every problem at once, so a file with
 * three bad facets takes one round trip to fix instead of three.
 *
 * `sort_order` comes from file order, so the spreadsheet's row sequence is what
 * the assessment pages page through.
 */
export function toActivities({ headers, records }) {
  const missing = ["Facet", "Activity"].filter(c => !headers.includes(c));
  if (missing.length > 0) {
    return { activities: [], errors: [{ row: 0, message: `Missing required column(s): ${missing.join(", ")}` }] };
  }

  const activities = [];
  const errors = [];
  const seen = new Map();

  records.forEach((r, idx) => {
    const line = idx + 2; // 1-based, and the header occupies line 1
    const name = r["Activity"];
    const facet = (r["Facet"] || "").toUpperCase();

    if (!name) { errors.push({ row: line, message: "Activity name is empty" }); return; }
    if (!FACET_ORDER.includes(facet)) {
      errors.push({ row: line, message: `"${r["Facet"]}" is not a facet (expected one of ${FACET_ORDER.join(", ")})` });
      return;
    }
    if (seen.has(name.toLowerCase())) {
      errors.push({ row: line, message: `Duplicate activity name "${name}" (first seen on line ${seen.get(name.toLowerCase())})` });
      return;
    }
    seen.set(name.toLowerCase(), line);

    activities.push({
      name,
      facet,
      description: r["Description"] || "",
      preferred_owner: r["Recommended Owner"] || "",
      // Left undefined when the column is absent, which is how a file exported
      // before this column existed re-imports without erasing every tip. The
      // diff skips undefined fields; an empty cell in a file that *has* the
      // column is still a deliberate clear.
      ...(headers.includes("Try This") ? { try_this: r["Try This"] || "" } : {}),
      // A missing Active column means active; only an explicit falsy value turns
      // an activity off, so a two-column file is still a valid import.
      active: r["Active"] === undefined || r["Active"] === "" ? true : truthy(r["Active"]),
      sort_order: activities.length,
    });
  });

  return { activities, errors };
}

const FIELDS = ["facet", "description", "preferred_owner", "try_this", "active", "sort_order"];

/**
 * Diffs incoming activities against the existing library, matched on name
 * (case-insensitively — a casing-only edit in the spreadsheet is a rename of the
 * same activity, not a new one).
 *
 * `missing` is everything in the library that the file does not mention. It is
 * returned rather than acted on: whether an absent row means "delete this" or
 * "this file is a partial update" is the caller's decision, and guessing wrong
 * destroys library activities that assessments still reference.
 */
export function diffActivities(incoming, existing) {
  const byName = new Map(existing.map(a => [a.name.toLowerCase(), a]));
  const created = [];
  const updated = [];
  const unchanged = [];

  for (const inc of incoming) {
    const match = byName.get(inc.name.toLowerCase());
    if (!match) { created.push(inc); continue; }

    const changes = {};
    if (match.name !== inc.name) changes.name = inc.name;
    for (const f of FIELDS) {
      // A field the file does not carry at all is not a change to it. Without
      // this, adding a column to the export would make every older file look
      // like an instruction to blank that column library-wide.
      if (inc[f] === undefined) continue;
      const before = f === "active" ? match[f] !== false : (match[f] ?? (f === "sort_order" ? 0 : ""));
      if (before !== inc[f]) changes[f] = inc[f];
    }

    if (Object.keys(changes).length === 0) unchanged.push(match);
    else updated.push({ existing: match, changes });
  }

  const incomingNames = new Set(incoming.map(a => a.name.toLowerCase()));
  const missing = existing.filter(a => !incomingNames.has(a.name.toLowerCase()));

  return { created, updated, unchanged, missing };
}
