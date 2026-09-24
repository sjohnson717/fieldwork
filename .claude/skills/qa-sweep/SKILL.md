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
| a panel-made team gap asks its questions and saves both ratings | a team gap made from the New Assessment panel opening with no questions, or its importance and execution dropped on save |
| a panel-made personal assessment asks its questions and saves all three ratings | the same for personal: an empty survey, or experience, skills, and interest dropped on save |
| keeping an unattached resource takes it out of the count, and Undo puts it back | a Keep that changes the count without saving, so the resource comes back on the next Recheck, or an Undo that cannot take it back |
| next is single-submit | duplicate saves from a double tap |
| finishing completes the respondent | a full set of answers stuck at "started" |
| revise re-reads and rewrites | a revision that starts blank, or writes a second row |
| revising without changes saves nothing | every untouched page re-saved on a revision |
| jumping sections saves only a changed page | an edit lost when leaving by the section strip, or a save for a page nobody touched |
| save and return finishes a revision in one save | a revision that has to walk every page to get back to the report |
| abandoning a revision leaves the respondent finished | someone who opened Revise and closed the tab showing as unfinished |
| back saves a changed page | an answer changed and then left by Back, lost when the tab closes |
| wrap-up saves feedback, never gates completion | free text lost, or an optional page costing someone their submission |
| skipping the wrap-up writes nothing | a Skip that saves anyway, or strands the respondent |
| instrument editor saves a question edit | commentary typed on Settings → Instruments that never reaches the row |
| instrument editor retires and restores a question | a retire that deletes, or a restore that does nothing |
| adding a question warns about the bands and lands last | a new question in the wrong section or position, or a maximum score the bands no longer cover without a word |
| reordering renumbers the section | two questions left tied on one position, which the survey orders arbitrarily |
| reading attaches to a question and comes off again | a reading link that cannot be removed, or one removed from the wrong question |
| delete is offered only on an unreferenced question, and works | Delete on a question with answers behind it |
| band edits save | band advice edited on screen and never written |
| assessments page counts new responses, and Results clears them | a badge that never appears, never clears, or clears without recording what was seen |
| switcher opens an assessment from the keyboard | ⌘K/Ctrl+K doing nothing, or a search that cannot reach an assessment |
| client filter narrows the list, merges spellings, and survives opening an assessment | a client listed twice for a capital letter, rows from the wrong client, or the choice lost on coming back |
| pinning puts an assessment in the sidebar, survives a reload, and unpins | a pin that is lost on reload, repeated under Recent, or cannot be taken off |
| the team dashboard withholds resume links where the report is the person's own | a practice profile's team leader able to reopen and edit a practitioner's answers, or a roster of Copy link buttons pointing at tokens the server withheld |
| the team dashboard offers activity flags only where the set can change | a Chaos, Portfolio Health or practice profile dashboard asking its leader to flag fixed questions for a set nobody can change |
| results shows what it has on a return visit, and still refreshes | the Results tab back behind a spinner on every visit, or cached rows shown with no refresh behind them |
| a note saved on Discussion is still there on coming back | a saved note that the tab shows blank after leaving and returning, now that drafts hold only unsaved typing |
| a decision saved on an instrument's Discussion is on its Results at once | a decision the Results tab cannot show until it refetches, or never |
| a personal assessment offers only team gaps to link to | a Chaos or other own-questions assessment offered as the team side, which Results cannot cross against because it has no importance or execution answers |

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
| `/readme`, `/facilitator-guide` | The harness does not mount them, so they render as its index page. Both need nothing but a `MemoryRouter` — router hooks and no backend — so a throwaway harness alongside this one is enough. |
| Admin pages other than the Assessments page, the two results tabs and the instrument editor | `/admin` is mounted, and the Assessments page it opens on, the Results tab of each assessment type and Settings → Instruments → Edit content (on the fixture's small Product Success instrument) and the Chaos fixture's Discussion tab are swept, signed in as an admin. The other tabs — Overview, Activities, Ownership Roles, and the gap analysis's Discussion — are not, and adding one is a `ROUTES` entry with `signIn` and `admin: { assessment, tab }`. |
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
  registration screens, the resumed survey, the survey wrap-up and the dead-link
  screen are clean at every width.
- As of 2026-09-17 all three of those are fixed: the buyer report (see below),
  and the team dashboard's roster, which puts status and Copy link under the
  name below sm. The personal profile report was already clean. The only layout
  finding left is `admin-results-team-gap` scrolling 10px at 768.
- The two admin results tabs joined the sweep in September 2026 and open with
  their own baseline: `admin-results-personal` clean at both widths,
  `admin-results-team-gap` 10px of sideways scroll at 768 — page padding plus
  the fixed sidebar, not the tables. Both carry contrast findings on the
  `text-gray-300` Remove control and the `text-gray-400` tag name, same class as
  everything else in this list.
- Three routes joined on 2026-09-10 and 2026-09-11 and open clean at every
  width they run at: `revise-team-gap` and `revise-instrument` (the section
  strip a revision shows) and `admin-instrument-editor` (768 and 1280 only).
- `survey-panel-team-gap` joined on 2026-09-24 with its flow, and opens clean
  at every width. It is the first fixture assessment to carry an
  `instrument_id` for a library instrument, which is what every assessment
  made from the New Assessment panel looks like; the older fixtures predate the
  panel, which is how an empty team gap survey went unnoticed for two weeks.
  The stub's `saveResponses` now applies the real function's rules — the
  assessment's activities and its type's fields — rather than writing whatever
  it is sent, so a save the real function would half discard fails here too.
  The Assessments page lists four fixtures now, and the client-filter flow
  counts accordingly. `QA_VERBOSE=1` prints each flow's name as it starts, for
  when one hangs.
- `survey-panel-personal` and `personal-profile-panel` joined the same day
  with their flow, and open clean at every width: the personal counterpart,
  carrying the personal instrument's id. No panel-made personal assessment had
  been answered on the live app when they were added. The profile route
  asserts "Strengths you enjoy using", which only real answers produce. The
  client-filter flow counts five fixtures now.
- `admin-health` joined on 2026-09-24 with Keep on unattached resources, and
  opens clean at 375, 768, and 1280 with that check opened. The stub gained
  `JobTitle.list` and `Invitation.filter`, which System Health reads, and
  `@/lib/content-live` is aliased to `harness/stub-content-live.js`, which is
  the real module with `loadContentStatus` replaced: it reports everything
  committed, so the sweep never reaches GitHub. The fixtures carry one
  unattached resource that is kept (`res-kept`) beside one that is not.
- `admin-resources` joined on 2026-09-18, with the blog panel open: three
  controls to a row now that a post can be read before it is triaged. Clean at
  768 and 1280. Its one contrast finding is the `text-gray-300` Delete on a
  resource card, the same class as the rest of this list. The stub answers
  `fetchBlogFeed` with two posts and holds one `SkippedPost`, so both branches
  of the panel render.
- `admin-ideas` joined on 2026-09-17 with the suggestion box, and opens clean
  at 768 and 1280. The same run found two things worth keeping in mind. The
  sidebar grew past the viewport and did not scroll — `flex-1` without
  `min-h-0`, so the nav was drawn over the email and Log out, which is a real
  bug the sweep caught the day it appeared. And the overlap check had no notion
  of a scrolling ancestor: an item scrolled out of the sidebar still reported a
  rect where it would have been, on top of whatever sat below the container. It
  now clips every rect to its clipping ancestors and the viewport before
  comparing, the same reasoning the clipping check already used. Any route with
  a scrollable region was liable to the old false positive.
- `admin-assessments-home` joined on 2026-09-16, when the Assessments page
  replaced the sidebar list, and opens clean at 768 and 1280. Its one contrast
  finding is the `text-gray-400` count beside the Assessments link, same class
  as the rest.
- On 2026-09-17 the buyer report went clean at every width. The facet
  overview's status badge wraps under the facet name (one column below
  360px), the activity rows put their badges on a line under the name below
  md, the key finding's counts wrap, and Save as PDF drops under a long title.
  Any buyer-report finding from here on is a regression, and the overlap
  history below is only background.
- The buyer report's overlap counts rose again on 2026-08-20, to 8 at 320, 375
  and 390 and 1 at 430, with clipping up in step. Nothing on that page changed:
  the fixtures gained `preferred_owner` on four activities, so rows now carry a
  "Discuss owner" badge that previously could not render at all, and a denser
  row collides more. This is the current baseline, and the findings are the same
  class as before — a category badge drawn over a facet heading.
- The buyer report's overlap counts dropped in August 2026 (12→7 at 320px, 8→6
  at 375 and 390, 2→0 at 430) without anything on that page changing. The
  overlap check had been measuring bounding rects, which for a *wrapped inline*
  element is the union of its line boxes and therefore always intersects the
  inline sibling before it. It now measures per line box. The surviving findings
  are real — a category badge drawn over a facet heading — and the numbers above
  are the corrected baseline, not an improvement anyone made.

## Extending

**A new route:** add it to `ROUTES` in `sweep.mjs` with an `expect` string that
survives `text-transform` — `innerText` returns what is rendered, so a heading
written "Executive Summary" arrives as "EXECUTIVE SUMMARY". Matching is
case-insensitive.

**A new flow:** add a `flow(...)` block. Assert against `window.__qa` — the
stub's server-side state — not against the DOM alone. "The screen looks right"
and "one row changed" are different claims, and the second is the one that
matters.

**Admin pages:** add a `ROUTES` entry with `signIn: { email, role }` and
`admin: { assessment, tab }` — the driver signs in through the auth stub, picks
that assessment from the table on the Assessments page and opens that tab. Give it
`widths: [768, 1280]`: admin sits behind a 256px fixed sidebar and is used on a
laptop, so phone widths report sideways scroll nobody intends to fix.

Never log in with real credentials to test. The stub's permission checks key off
the signed-in user, so a route that should be anonymous must not carry `signIn` —
a stray session hides exactly the refusals this sweep exists to catch.

**A fixture changed for one flow** goes through `window.__qaSetup`, set with
`page.evaluateOnNewDocument` before the page loads; the stub calls it with its
state before anything reads it. Changing `window.__qa` after load does not move
a page that reads its token once, and a new fixture assessment changes the
counts the Assessments page flows assert. The practice-profile dashboard flow
is the example. `start.mjs` copies the harness when it starts, so restart it
after editing anything under `harness/`.

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
