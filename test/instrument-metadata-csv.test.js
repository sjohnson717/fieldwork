import test from "node:test";
import assert from "node:assert/strict";
import { instrumentMetadataCsv } from "@/lib/instrument-metadata-csv";

const rows = [
  { id: "b", name: "Second", key: "second", sort_order: 2, question_source: "instrument", cta: "Say \"hi\", then go", summary: "Line one.\n\nLine two." },
  { id: "a", name: "First", key: "first", sort_order: 1, question_source: "library", internal: true },
];

test("one header row, then the instruments in sort order", () => {
  const lines = instrumentMetadataCsv(rows, { b: 12 }).replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0].split(",")[0], "Instrument");
  assert.ok(lines[1].startsWith("First,"));
  assert.ok(lines[1].includes("From the activity library,Yes,first"));
});

test("commas, quotes, and line breaks survive inside a cell", () => {
  const csv = instrumentMetadataCsv(rows, { b: 12 });
  assert.ok(csv.includes('"Say ""hi"", then go"'));
  assert.ok(csv.includes('"Line one.\n\nLine two."'));
  assert.ok(csv.includes(",12,,second"));
});
