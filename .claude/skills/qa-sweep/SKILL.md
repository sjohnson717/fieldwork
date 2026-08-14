---
name: qa-sweep
description: Run the full QA sweep over Quartz Assessments — every respondent, team leader and buyer route, at every phone-to-desktop width, plus the survey flows that write answers, print output, and a manual pass for real Safari. Use before a publish, after any change to a report or the survey, or when asked to check the app across browsers and phones.
---

# QA sweep

Verifies the app the way its bugs actually arrive: a screen that only breaks at
375px, a save that only fails the second time, a report that only splits when
printed. Everything here exists because this codebase shipped the thing it looks
for.

## Run it

```bash
node .claude/skills/qa-sweep/start.mjs
```

Then `preview_start({ name: "qa-harness" })` and, in another shell:

```bash
QA_PUPPETEER=$(node -e "console.log(require.resolve('puppeteer').replace(/\/lib\/.*/,''))" 2>/dev/null) node .claude/skills/qa-sweep/sweep.mjs qa-report
```

If puppeteer is not installed anywhere, `npm i --no-save puppeteer` first — it
must not become a project dependency. The sweep prints its report, writes
`qa-report/report.md`, `report.json` and screenshots at 375 and 1280, and exits
non-zero if anything in the gate failed.

Print output is a separate pass, because it needs the print stylesheet applied:

```bash
node .claude/skills/qa-sweep/print-check.mjs qa-print
```

Read the PDFs it produces. Page counts, split blocks and clipped tables are
visual; no assertion catches them.

When finished:

```bash
node .claude/skills/qa-sweep/start.mjs --clean && git checkout .claude/launch.json
```

## What it covers

**Layout, at 320 / 375 / 390 / 430 / 768 / 1280.** Per route: sideways page
scroll, elements clipped by a non-scrolling ancestor, text drawn over other text,
console errors, failed requests, and any attempt to read an entity the caller is
not permitted to read. Each route also asserts a string that proves the page
actually rendered, so a blank screen cannot pass as clean.

**Flows that write**, driven at 390px:

| Flow | What would regress |
| --- | --- |
| registration is single-submit | two respondents from one press — a phantom non-responder on the roster |
| back then forward re-saves | the RLS refusal that produced "Error saving responses" |
| next is single-submit | duplicate saves from a double tap |
| finishing completes the respondent | a full set of answers stuck at "started" |
| revise re-reads and rewrites | a revision that starts blank, or writes a second row |

**Permissions.** The stub enforces the real rules: `Response.update`,
`Response.create` and unauthenticated reads of `Response` all throw, exactly as
the platform does for an anonymous respondent. Any page that regresses to a
direct entity write or read fails here rather than in production. This is the
check that would have caught the June save bug on the day it shipped.

## What it does not cover

Be straight about this in any report you write from it.

| Not covered | Why, and what to do instead |
| --- | --- |
| Real Safari, real iOS | No Xcode or simulator on this machine, and Safari's automation is off. Manual pass below. |
| Real Android | No device available. Chromium at a phone width is the closest approximation and is not the same thing. |
| Firefox | Not installed. Optional: `npx playwright install firefox webkit` and adapt `sweep.mjs`. |
| Edge | Chromium, same engine as the sweep. Covered in substance. |
| Real printers | Only PDFs are produced. |
| The live backend | The sweep runs against fixtures. It proves the app's behaviour, not the deployment's — see the live checks at the end. |

Playwright's WebKit is worth adding if cross-engine coverage matters, but it is
not Safari: it does not reproduce Safari's print header, its PDF pipeline, or iOS
viewport quirks — which is precisely the class of bug that has bitten this app.

## The manual pass

Ten minutes on an iPhone, and it covers what nothing here can. Steve has an
iPhone and no Android device.

1. **Survey on iOS Safari.** Register, answer a page, Next, Back, change an
   answer, Next. No error. Finish.
2. **Save as PDF from iOS Safari.** Check the footer on every sheet: no
   `?t=<token>` in the printed address. iOS stamps the address and fires no
   `beforeprint`, so this leaked until the token was taken out of the address
   entirely (lib/token-address.js). print-check.mjs now asserts the same thing
   without the event, which is the only version of the check that would have
   caught it — but iOS is where it actually happens, so look at a real one.
3. **The report on a phone**, scrolled end to end: pills aligned, nothing sliced
   at the right edge, no name printed under its own badges.
4. **Resume from the emailed link** after closing the tab: answers come back.
5. **Buyer report and team dashboard** on the phone, both scrolled fully.
6. **Desktop Safari print preview** of a report: the credit block must not split
   across sheets.

## Reading the report

Two verdicts, deliberately separate.

**The gate** — clipping, overlap, sideways scroll, console errors, failed
requests, refused permissions, blank pages. These are regressions. Fix or
explain each one.

**Standing questions** — contrast below AA, touch targets under 44px. These are
design decisions that report identically on every run until someone changes
them. They are listed once, grouped by cause, and they do not fail the run. A
gate that is always red is a gate nobody reads.

Known standing findings when this was written (2026-08-14), so a future run is
not mistaken for a new regression:

- `text-gray-400` on white or `gray-50` is 2.43–2.54:1 against a 4.5
  requirement, used widely for captions and eyebrows.
- The exec summary's coloured counters (`#11CC77`, `#D69E2E`, `#FFCC00`) run
  1.4–2.4:1.
- Rating pills are 36px tall against a 44px guideline.
- Layout gate failures open at the time of writing: the buyer report and the
  personal profile report clip and overlap below 430px, and the team dashboard's
  participant table clips at 320–375px. The respondent's own report, both
  registration screens, the resumed survey and the dead-link screen are clean at
  every width.

## Extending

**A new route:** add it to `ROUTES` in `sweep.mjs` with an `expect` string that
survives `text-transform` — `innerText` returns what is rendered, so a heading
written "Executive Summary" arrives as "EXECUTIVE SUMMARY". Matching is
case-insensitive.

**A new flow:** add a `flow(...)` block. Assert against `window.__qa` — the
stub's server-side state — not against the DOM alone. "The screen looks right"
and "one row changed" are different claims, and the second is the one that
matters.

**Admin pages:** they need a signed-in user. Alias `@/lib/AuthContext` to a stub
alongside the base44 alias in the generated `vite.config.js`, and set
`window.__qa.user = { role: "admin" }` so the stub permits staff reads. Never log
in with real credentials to test.

**Awkward data belongs in `fixtures.js`**, not in the driver. The fixtures
already carry the long activity names, the half-answered activity, the activity
nobody rated, and `"I don't know"` — every layout bug this app has had came from
one of those, not from tidy data.

## After a publish

The sweep runs against fixtures, so it cannot tell you the deploy is good. Three
live checks, in order:

1. The bundle is the new build: fetch the page's `index-*.js` and grep for a
   string only the new code contains.
2. Any new backend function answers: POST it an empty body and check the
   validation message is the function's own, not "not found or not deployed".
3. The data moved: after someone re-saves an answer, its `updated_date` should be
   later than its `created_date`.
