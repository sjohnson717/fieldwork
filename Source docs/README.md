# Source docs

Where a thing was written down before it became data in the app.

Instrument definitions, blog exports, and whatever else came out of Wix. These
are sources, not the master copy: once an instrument has been applied,
`Settings → Instruments` is where its questions, commentary, bands, and
dimension prose are edited, and a document in here is a record of what was
imported rather than something the app reads.

Nothing in this folder is loaded at build time or at run time.

- `Fractional_CPO_Practice_Profile_Survey_Definition.docx` — the written
  definition behind the seventh instrument, seeded in
  `src/lib/instrument-seed.js`. The scale differs from the document on purpose:
  it was specified 1–5 and built four-point, 0–3, to match every other rating
  scale in the app and to deny respondents a safe midpoint.
- `Posts.csv`, `Limericks.csv` — Wix blog exports behind the Resources library.
- `customer-proof.md`, `stop-selling-at-trade-shows.md` — drafts.
