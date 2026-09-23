// The instruments' descriptive fields as a spreadsheet, for sharing with
// somebody who does not have the app. Deliberately not the content files: no
// questions, bands, or reading, only what each instrument is called, what it is
// for, and the wording that invites people to take it.

const COLUMNS = [
  ["Instrument", (i) => i.name],
  ["Tagline", (i) => i.tagline],
  ["Call to action", (i) => i.cta],
  ["Button label", (i) => i.cta_label],
  ["For the consultant", (i) => i.summary],
  ["For the participant", (i) => i.description],
  ["Questions", (i, counts) => (i.question_source === "library" ? "From the activity library" : counts[i.id] ?? 0)],
  ["Ours only", (i) => (i.internal ? "Yes" : "")],
  ["Key", (i) => i.key],
];

// A field is quoted when it holds a comma, a quote, or a line break; quotes
// inside it are doubled.
const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function instrumentMetadataCsv(instruments, counts = {}) {
  const rows = [...instruments]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => COLUMNS.map(([, get]) => cell(get(i, counts))).join(","));
  // The leading BOM is what makes Excel read the curly quotes as UTF-8.
  return "﻿" + [COLUMNS.map(([h]) => cell(h)).join(","), ...rows].join("\r\n") + "\r\n";
}
