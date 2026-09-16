import { base44 } from "@/api/base44Client";
import source from "../../RELEASE_NOTES.md?raw";

// Release notes for the announcement bar and What's new in /admin.
//
// RELEASE_NOTES.md at the repo root is the only copy: bundled as text at build
// time and parsed here, so adding an entry there is the whole of announcing it.
// Everything above the first `##` is for whoever edits the file and is ignored.
//
// Each entry is keyed by its title. The key is what a user's read list holds,
// so renaming an entry announces it again — deliberate, since a rename is
// usually a rewrite worth reading.

const RELEASED = /^Released:\s*(\d{4}-\d{2}-\d{2})\s*$/m;

export const parseReleaseNotes = (text) =>
  text
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [firstLine, ...rest] = chunk.split("\n");
      const title = firstLine.trim();
      const body = rest.join("\n");
      const date = body.match(RELEASED)?.[1] || null;
      return { id: title, title, date, body: body.replace(RELEASED, "").trim() };
    })
    // An entry with no date is half-written; showing it would announce a
    // capability with no release attached.
    .filter((n) => n.title && n.date)
    // Newest first, whatever order the file is in. Stable, so entries released
    // the same day keep the file's order.
    .sort((a, b) => b.date.localeCompare(a.date));

export const RELEASE_NOTES = parseReleaseNotes(source);

// Dates are calendar days, not instants, so they are formatted in UTC: parsing
// "2026-09-16" gives UTC midnight, which is the 15th anywhere west of London.
export const formatReleaseDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

// Stored on the user (User.release_notes_read) rather than in the browser, like
// pinned assessments: an announcement dismissed on a laptop should not come
// back on a phone.
export const readReleaseNotes = (user) =>
  Array.isArray(user?.release_notes_read) ? user.release_notes_read : [];

export const unreadReleaseNotes = (readIds) => {
  const read = new Set(readIds);
  return RELEASE_NOTES.filter((n) => !read.has(n.id));
};

// Reading and dismissing are the same act: either way the person has decided
// what they've been told is enough, so every current note is marked read.
// Ids of entries since removed from the file are dropped rather than kept
// forever. Returned before the write lands so the bar goes on click; a failed
// write only means it comes back on the next load.
export const markAllReleaseNotesRead = () => {
  const next = RELEASE_NOTES.map((n) => n.id);
  base44.auth.updateMe({ release_notes_read: next })
    .catch((e) => console.error("Could not save read release notes", e));
  return next;
};
