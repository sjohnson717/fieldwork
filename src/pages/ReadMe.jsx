import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSearchParams } from "react-router-dom";

const sections = [
  {
    id: "overview",
    group: null,
    title: "Overview",
    content: `Quartz Assessment runs two kinds of assessment over one shared library of product-team activities.

**Team gap analysis** — a team rates each activity on *importance* and *current execution*, and suggests who should own it. The gap between importance and execution is the finding, and it drives the consulting engagement.

**Personal assessment** — an individual rates their own *experience*, *skills* and *interest* in the same activities. The output is a development plan belonging to that person.

The two are separate records that can be linked, so a report can cross what a team needs against what its people can actually do. Built on Base44: React, Tailwind, and a backend-as-a-service providing entities, auth and row-level security.

> The deep reasoning behind the data model and its security rules lives in \`base44/entities/README.md\`. Read that before changing any entity.`,
  },
  {
    id: "entities",
    group: null,
    title: "Entities",
    content: `Schemas live in \`base44/entities/<Name>.jsonc\`. **Those files are the source of truth** — publishing re-applies every schema from them, so a field added only through the platform API disappears at the next publish, silently and with no error.

| Entity | Holds |
|---|---|
| **Assessment** | One instrument. \`assessment_type\` is \`team_gap\` or \`personal\`; \`parent_assessment_id\` optionally links a personal assessment to a gap analysis; \`tag_ids\` group related assessments. Carries the access code and the buyer/team tokens. |
| **Activity** | The library. Carries \`try_this\`, the one-line step shown on a personal report's development opportunity. Each belongs to a facet: the six Quartz facets (DEFINE, COMMIT, DESCRIBE, CREATE, PREPARE, DELIVER) plus LEARN, which runs across the whole cycle and reports as its own standalone section. Library activities have no \`assessment_id\`; custom ones name their assessment. |
| **ActivitySet** | Named presets of activities for quick assessment setup. \`description\` says what the set is for, and shows wherever a preset is picked. |
| **Respondent** | One person answering one assessment. Self-registering; \`token\` is their credential. Also carries \`closing_comments\` and \`missing_coverage\`, the two free-text answers from the wrap-up page — instrument feedback, admin-only, never reported. |
| **Response** | One person's answer for one activity. Carries both question sets — importance/execution/suggested_owner, or experience/skills/interest — and only the fields its assessment type asks about are written. |
| **DiscussionNote** | Facilitator's debrief notes and recorded decisions per activity. |
| **TeamLeaderFlag** | Activities a team leader flagged for discussion before fielding. |
| **Tag** | Free grouping for assessments — a client, a cohort, a support group. Flat and many-to-many. |
| **Organization** | The consulting org. The tenant boundary; \`org_id\` on other records points here. |
| **Invitation** | Carries an application role until an invited user first signs in. |
| **JobTitle** | The picklist of roles offered when suggesting an owner. |
| **Resource** | Authored learning resources for the personal report. Typed (free article / external / book / course), attached to activities by \`activity_ids\`. Read is open — the personal report renders unauthenticated. |
| **User** | Base44 built-in, extended with \`org_id\` and an application \`role\`. |

Built-in fields on every entity: \`id\`, \`created_date\`, \`updated_date\`, \`created_by_id\`.`,
  },
  {
    id: "pages",
    group: null,
    title: "Pages",
    content: `Routes are registered in \`src/App.jsx\`.

## Authenticated

| Route | Purpose |
|---|---|
| \`/admin\` | Everything the facilitator does. Assessment list, setup, results, discussion, library, tags, organizations, facilitators. The only route behind \`ProtectedRoute\`. |

## Token-authenticated — no account needed

| Route | Purpose |
|---|---|
| \`/assess?code=…\` | Where a respondent joins. Self-registers with name and job title, after an intro stating what the assessment is, what it asks, how many activities and roughly how long. |
| \`/assess?t=…\` | Their own resume link. Registration rewrites the URL to this, so the page they bookmark is theirs. |
| \`/team/:token\` | Team leader dashboard. Roster and completion status, plus any paired assessment's roster. |
| \`/report/:token\` | Buyer report for a gap analysis. Refuses a personal assessment's token. |

## Public

\`/\` landing · \`/login\` · \`/register\` · \`/forgot-password\` · \`/reset-password\` · \`/readme\` · \`/facilitator-guide\`

## Backend functions

\`publicAssessment\` resolves every public token server-side and returns only the fields that flow needs, plus \`org_name\` — the firm the printed report names, resolved from the assessment's organisation or its creator's, since the pages that render it are unauthenticated and cannot read \`Organization\` themselves · \`saveResponses\` upserts a page of answers by activity against the token, and carries the wrap-up's free text and the completion flag in the same call · \`listRespondents\` and \`listUsers\` read as service role where RLS cannot express the rule · \`deleteAssessment\` cascades a delete after one authority check · \`deleteOrganization\`, \`deleteTeamMember\`, \`deleteTag\` and \`deleteLibraryActivity\` do the reverse, refusing while anything still references the row · \`listTags\` and \`listLibraryActivityUsage\` count usage across records the caller cannot read, so a Delete is only offered where it can work · \`acceptInvitation\` and \`updateTeamMember\` manage roles server-side — the latter refuses every self-edit except one, a super-admin setting their own organisation, whose access does not derive from it.`,
  },
  {
    id: "architecture",
    group: null,
    title: "Architecture",
    content: `- **Frontend:** React + Tailwind + shadcn/ui
- **Backend:** Base44 (entities, auth, row-level security, Deno functions)
- **Routing:** React Router v6
- **Data:** Base44 SDK via \`@/api/base44Client\`

## Shared logic

| Module | Responsibility |
|---|---|
| \`src/lib/scoring.js\` | Gap analysis. Importance and execution are 0–3. **Also the single source of \`FACET_ORDER\`, \`FACET_SUBTITLES\` and \`THEME_GROUPS\`** — everything that sorts, pages or groups by facet imports from here. Plus \`computeGapMix\` for the buyer report's shape card. |
| \`src/lib/personal-scoring.js\` | Personal assessment. All three axes are 0/1/3/5, normalised before any cross-axis maths. Owns the five categories, both label vocabularies, and the per-facet, shape-card and development-shortlist aggregations. \`PERSONAL_AXES\` also carries each axis's respondent-facing \`hint\`, so the survey and its intro cannot word a question two ways. |
| \`src/lib/self-gap.js\` | One respondent's own gap analysis, for the summary they see after submitting. Deliberately not \`computeActivityStats\` with a single response fed in — every field that function returns is a claim about a group. Also \`computeSelfGapMix\` for its shape card. |
| \`src/lib/activities.js\` | Resolves which activities an assessment actually asks about. |
| \`src/lib/activity-csv.js\` | Parses, validates and diffs the library CSV. No UI, no writes — the import dialog decides what to do with the diff. |
| \`src/lib/responses.js\` | Response rows to answers keyed by activity id — the shape both the survey and the summary work in. Shared so the facilitator's preview reshapes a respondent's answers exactly as their own page did. |
| \`src/lib/public-assessment.js\` | Client wrapper over the \`publicAssessment\` function. |
| \`src/lib/roles.js\` | Application roles and org comparison. |

The two scoring modules are deliberately separate: a "3" does not mean the same thing in each, so nothing can be shared between them without introducing a bug that looks like a rounding error.

## Facets

Seven: \`DEFINE COMMIT DESCRIBE CREATE PREPARE DELIVER LEARN\`, in that order. The first six pair into the three \`THEME_GROUPS\` the report is built around; LEARN is a single-facet group flagged \`standalone\`, which renders it after the three pairs and suppresses the per-facet sub-header that would otherwise print its name twice.

Adding a facet means \`FACET_ORDER\`, \`FACET_SUBTITLES\`, a \`THEME_GROUPS\` entry, and the entity enum in \`base44/entities/Activity.jsonc\`. Miss the enum and writes fail; miss \`THEME_GROUPS\` and the activities score correctly but render nowhere.

## Authentication

Facilitators have accounts. **Respondents, team leaders and buyers never do** — an unguessable URL is the credential. Tokens are \`crypto.randomUUID()\`; the access code is short and shoutable but only permits joining, never reading anyone's data.`,
  },
  {
    id: "notes",
    group: null,
    title: "Developer Notes",
    content: `## Things that have already bitten

**\`.jsonc\` is the schema.** Publishing re-applies every entity schema from those files. A field added only through the API works right up until the next publish, then vanishes — \`create\` succeeds and returns a record with the column simply absent. If a field disappears with no error, check the \`.jsonc\` before suspecting anything else.

**RLS fails closed and quietly.** A custom field in a rule needs a \`data.\` prefix; without it the clause never matches and access silently disappears. A green build proves nothing here — walk a real respondent through \`/assess?code=…\` after any change.

**The User entity ignores entity-level RLS.** Only per-field rules bind on it. Treat any new field on User as unprotected until it has one.

**A copied constant goes stale in every copy at once.** \`FACET_ORDER\` lived in four files. \`LEARN\` was removed from the six code copies but never from the entity enum, so the backend accepted a LEARN activity and the UI then made it unreachable — unanswerable in \`Assessment\`, invisible in every picker, absent from the report. All four now import from \`scoring.js\`.

**\`indexOf\` returns \`-1\`, not \`undefined\`.** \`FACET_ORDER.indexOf(f) ?? 99\` never fires its fallback, so an unrecognised facet sorted *first* rather than last. Use \`facetRank()\`.

**A function's error message never reaches the user by default.** The SDK rejects with an axios error whose \`message\` is always \`"Request failed with status code 500"\`; the reason the function returned is in \`e.response.data\`. Use \`functionErrorMessage()\` from \`src/lib/utils.js\` anywhere a function failure is shown to someone.

**\`category()\` must not go back through \`capability()\`.** It looks like it could — capability is right there, and averaging experience with skills is one line shorter. That average is exactly what makes the \`strengthen\` category impossible: someone with long experience and low self-rated skill scores the same as a capable beginner, and they need opposite help. Skill and interest choose the bucket; experience only splits \`develop\` from \`strengthen\`. \`capability()\` is for the facilitator's Coverage view, which genuinely does want one number.

**Adding a column to the activity CSV can blank that column library-wide.** \`diffActivities\` compares every field it knows about, so a file exported *before* a column existed looked like an instruction to empty it on every row. The diff now skips fields the incoming file does not carry at all; an empty cell in a file that *has* the column is still a deliberate clear.

**No overall personal score.** Not an oversight and not a missing feature. Three axes that deliberately measure different things cannot be averaged into a grade without destroying the findings the instrument exists to surface.

**A field with a documented default is absent on the oldest records, not set to it.** \`assessment_type\` was added after assessments already existed, so \`team_gap\` is what the schema *means* by an empty column, never what it stores there. Any \`=== "team_gap"\` test therefore misses exactly the earliest records — they fall through to whatever the else branch does. Testing for \`personal\` has always been safe, which is why nothing had tripped on this until the sidebar needed a positive test for team gap; written the obvious way it would have left the oldest assessments unbadged, the very gap the badge was added to close. Normalise first (\`assessment_type === "personal" ? "personal" : "team_gap"\`) and branch on the result. The same applies to \`org_id\`, whose absence means the legacy no-org bucket.

**A delete the schema permits can still be the wrong delete.** Every id-holding field here is a plain string that nothing enforces — \`Assessment.activity_ids\`, \`tag_ids\`, \`org_id\`, \`created_by_id\`, \`ActivitySet.activity_ids\`. Delete the row an id names and the id stays, and because every reader resolves ids against live rows and drops what it cannot find, the damage is *silent*: a library activity deleted in August 2026 would have vanished from every assessment using it, answered ones included, leaving report lines that simply stop appearing. RLS cannot see any of this — it answers for one entity at a time. So a delete that spans entities goes through a function that counts references first and refuses, naming every blocker at once. Cascade only where the children are meaningless alone (\`deleteAssessment\`).

**An unknown count must never read as "unused".** The counts that decide whether a Delete appears come from a function, and a failed call returns nothing at all. Defaulting that to zero would offer a Delete on every row in the library simultaneously. Distinguish *loaded and empty* from *not loaded* — \`usage === null\` hides the control; \`usage[id]\` being absent shows it.

**Deactivate is usually what "delete" meant.** \`active\` exists on activities, sets and job titles, and it does the thing an operator actually wants — out of new assessments, existing data untouched. A refusal that only says no is worse than one that names the alternative.

**A list loaded once on mount goes stale the moment another page writes to it.** \`AdminPage\` loads tags when it mounts; the Tags settings page deleted one and updated only its own state, so the sidebar filter kept offering a tag that no longer existed and the delete looked like it had failed. Any page that mutates a collection another page loaded has to say so — \`TagsPage\` calls \`onTagsChanged\`. Clear derived selections too: a filter naming a deleted tag matches nothing and reads as "no assessments".

**A missing badge is not a label.** The sidebar tagged only \`Personal\`, on the reasoning that team gap is the default and a default needs no marker. But absence carries no meaning to anyone who does not already know the rule — a list where one row is tagged and the next is bare reads as *this one is special*, not *these are two kinds*. Both types are labelled now. The rule generalises: when a distinction changes what the software does — and this one picks the question set, the results view and the report — every value in it gets said out loud.

## Print is a separate surface, and only visible in a PDF

Both summaries are read as PDFs at least as often as on screen, and every print rule is invisible in the browser. **Render the page to check it** — the defects below were each found in a rendered file and in no other way.

**Forcing a page break per section wastes sheets.** \`break-before: page\` on every heading turned a 25-activity report into eight pages, three of them nearly empty and one carrying a single table row. Only the cover forces a break now (\`.print-cover\`); \`.print-section\` keeps a heading with its content and nothing more. The same rule applies one level down: a long card with \`break-inside-avoid\` jumps to the next sheet whole rather than splitting.

**Viewport units are the window, not the page.** The cover fills its sheet so the credit can sit at the foot of it, and that height was \`calc(100vh - 28mm)\`. Chrome's headless PDF resolves \`vh\` against the page box, so it looked right everywhere it was tested; a browser printing from a tall window does not. Measured from a 1200px window, \`100vh\` is 317mm against a 279mm sheet — the cover ran 35mm past the trim and pushed the credit onto a page of its own. It is \`calc(11in - 28mm - 2.5rem - 22mm)\` now: paper, less the 28mm the page margins take from it, less the column's own padding, less slack for a browser that reserves more than it is asked to. Sizing to Letter is deliberate — A4 is taller, so the shorter sheet can only leave the credit high, never overflow. The 28mm predates the page margins and meant the container's top padding plus a matching bottom trim; when the margins moved to \`@page\` the arithmetic came out the same, which is why the number never changed.

**Trailing padding makes a blank page.** Bottom padding at the end of the document buys nothing — it does not affect the pages between — and it was enough to push a credit onto a sheet of its own.

**The tab title becomes the filename.** Every browser offers \`document.title\` as the name when you Save as PDF, so a constant one meant every report ever saved was called "Report | Quartz Assessment" — useless in a folder of client work. All three printable surfaces set it from the assessment's own title, keyed on that title so a rename is picked up. The third was found late: the facilitator's preview inherited \`/admin\`'s title and saved as "Admin | Quartz Assessment". Anything that prints needs its own title, including a view that only borrows the page it opens over.

**Print an address as a link, never as text.** A PDF viewer's auto-detector read plain-text \`productgrowthleaders.com\` as \`http://ctgrowthleaders.com\`, five characters short, and offered it as the destination. An \`<a>\` whose visible text is the address prints identically and puts a real URI annotation in the file.

**\`@page { margin: 0 }\` was a Chrome-only guarantee holding up a credential, and it is gone.** Zero margins suppress the browser's own header and footer, and that was the defence: every page that prints is token-authenticated, and on those pages the URL *was* the credential. Safari ignores the rule. A respondent's Safari-saved PDF came back with \`…/assess?t=<their resume token>\` stamped on all six sheets — a link that reopens and edits their answers, on the document they are invited to send to a manager.

\`usePrintSafeUrl\` was the second attempt, stripping the address on \`beforeprint\`; iOS Safari's share-sheet route to a PDF never fires that event, so it protected only what it had been tested on. The fix that holds is \`claimToken\` in \`lib/token-address.js\`: the token is read once on arrival, moved to \`sessionStorage\`, and the address rewritten without it. **Nothing can print what is not there** — and that is the rule, not any CSS or event hook. \`usePrintSafeUrl\` survives as a secondary for any surface that has not moved over.

**Every sheet needs a head and a foot, and container padding cannot give it one.** Vertical padding applies once at the start of a document, not on each sheet a column is fragmented across — so \`.print-plain\`'s \`14mm\` top inset reached page one and no other, and every later page ran to the trim, inside the border most printers cannot reach. \`@page\` is \`margin: 14mm 0\` now: the page box owns top and bottom, the container keeps the sides, because horizontal padding *does* repeat down a fragmented column. That costs roughly a tenth of a Letter sheet, which is worth paying — see the note below on what print is actually for. It also gives the browser room to draw its header and footer band again, which is now a page number and a token-free URL.

**Leave room for a browser that keeps its own margins.** The same Safari behaviour shortens the printable area, so a cover sized to the full sheet overran it and split the credit across two pages. The cover reserves 22mm for it now, which is why the credit sits low on Chrome rather than flush: sized for the browser that gives the least room.

**A fixed overlay prints on every sheet.** The facilitator's preview of a respondent's report is \`position: fixed\`, so printing from it repeated the cover on every page while \`/admin\` carried on flowing into its own sheets underneath, sidebar bleeding across the top. Covering a page on screen does not remove it. The preview is portalled to \`<body>\` for this reason alone — as a sibling of \`#root\` it can be printed by itself, and while it is open \`body.preview-open\` hides \`#root\` and drops the overlay back to \`position: static\` so it flows.

**Screen chrome escapes unless it is told not to.** The closing nudge under the team gap buttons sat outside the \`no-print\` row it belonged to, so it printed beneath the credit and split the one block meant to close the document. \`no-print\` goes on the element, not on a container that happens to include it.

**Optimise print correctness, not page count.** These PDFs are saved and sent far more often than they are put on paper, so the page total is close to free while a wrong page break is just as visible in a viewer as in a printer tray. Nothing clipped, no heading orphaned at a foot, no blank trailing sheet, cover on one page — those are worth sheets. An extra page carrying real content is not a defect, and no legibility should ever be traded for it. Greyscale survivability stays worth its small cost as insurance rather than a constraint.

## Conventions

- Response labels are stored as text, never numbers. Scoring maps them, so re-scoring an axis never touches stored data.
- **All three reports open on the same shape card, and it computes nothing.** \`computeCategoryMix\`, \`computeSelfGapMix\` and \`computeGapMix\` re-count the classification the sections below are already built from — a summary able to disagree with the lists it summarises would be worse than none. Three rules keep it honest: no band may be dropped, so anything unrated or unanswerable gets an outlined band of its own and the per-phase totals still equal the activities in that phase; the bands run in the order of the key, and the card says so, because a black-and-white printer is where the colour stops identifying anything; and per-phase bars are scaled against the busiest phase, not stretched to the width, since the comparison between phases is the whole point. Fills live beside the section accents (\`selfFill\`, \`fill\`) so a band and the block it stands for cannot drift onto different colours. It is deliberately not a pie: the denominator is how many activities a facilitator put in scope, which is a fact about the assessment rather than about the person or team.
- **The buyer report's shape card and its facet wheel are not duplicates.** The wheel badges each phase by its *average* gap and its counts are the links that filter the list; averaging hides one severe gap among five healthy activities, which the card's bands keep visible. Keep the navigation in the wheel — making the card's phase labels clickable put seven 13px tap targets on a phone to duplicate it.
- The facilitator's vocabulary and the respondent's are separate by design. \`Reluctant\`, \`Poor fit\` and \`Under-skilled\` are diagnostic shorthand and must never reach the person they describe. \`CATEGORIES\` carries both sets: \`label\`/\`hint\` are the facilitator's, \`selfLabel\`/\`selfHint\` are the person's.
- A personal assessment ignores \`closed\`. The profile belongs to the person, so they can still revise it; \`closed_date\` lets Results flag answers changed after a report was delivered.
- Sharing a profile means the PDF, never the link. The token permits editing.
- **A \`Resource\` marked \`fallback\` is offered when a report's shortlist comes to one or two items, whatever was recommended.** It exists because a resources section holding a single item reads as an afterthought, which happens whenever someone's opportunities land on the activities the library covers least. Two limits are the point: it never pads a list that already has three, or the house reading sits in front of advice chosen for this person; and it never makes the section appear on its own, because a section carrying only the house reading is an advertisement whatever the heading says. It renders under a heading that is plainly not an activity name — these were not chosen for this reader the way the cards above were, and dressing them as though they had been is what would cost the section its credibility.
- Nothing pushes a personal profile to a manager, and no screen implies otherwise. The team leader dashboard withholds answers and per-person tokens on a personal assessment, the buyer report is aggregate and nameless, and the survey intro names no recipient at all — the same code fields the open lead-gen assessments, where a taker may have no manager they would want reading this. The report suggests a manager or a coach later, once the profile exists and the choice is concrete.
- \`[n]\` in an assessment title is its activity count, and it is internal. It belongs in the admin list and on the assessment; it is left off landing pages, where it reads as a version number. The three public assessments draw from named activity sets — Quick Review [7] from **Executive**, Team Effectiveness [25] from **Core**, Self-Assessment [40] from **Standard** — so a count that stops matching its set means one of the two was edited alone.
- The app is maintainable from the app. Anything that accumulates — organizations, accounts, tags, library activities, sets, resources, job titles — is removable in \`/admin\`, guarded. "Delete it in the Base44 Builder's data view" is not an answer: the Builder is a developer surface with no reference checks, so it both risks the silent damage above and leaves the app unable to describe its own state. When adding anything that creates records, the delete is part of the feature.
- A control that can only fail should not be there. A Delete appears on the rows that can actually go; the rest show what they are instead — \`In use\`, or nothing. The function still refuses independently, because the page's counts can be a moment out of date.
- Every function failure shown to someone goes through \`functionErrorMessage()\`. A refusal's whole value is the sentence naming what is in the way, and that sentence is in the response body — \`catch (e) { console.error(e) }\` makes a refused write look exactly like one that worked.
- The respondent's own summary is one component, rendered from the same code whether the respondent or the facilitator is looking at it. \`TeamGapSelfReport\` and \`PersonalProfileReport\` take \`readOnly\`, which drops Revise, Done and the resume link; \`RespondentPreview\` builds them from the admin's already-loaded activities and responses. A second rendering of "what they saw" would drift, and a preview that had drifted would be worse than none.
- **The preview never touches a respondent token.** That token is not a viewing key but the resume credential — anyone holding it can rewrite the answers it opens. \`listRespondents\` withholds it and \`publicAssessment\` never returns it, so the preview answers "can I see what they saw" without asking for it back. Super-admin only, gated on the row link and again on the overlay.
- Reports name the firm that prepared them from the data, never a constant: an assessment can be run by another firm's facilitator through this app. The copyright notice is scoped for the same reason it exists — the framework is authored here, the answers are not, and a bare notice on a page that tells someone the report is theirs to keep reads as a claim over their own data.
- The Chaos Assessment pointer is screen-only. On paper it is a pitch travelling inside a document about someone's own answers, forwarded to their manager or handed to a client.
- Colour on a person's own answers is an intensity ramp, never a good/bad palette. \`heatClass\` is one ramp shared by the report and the facilitator's matrix, and every band clears AA contrast — two did not, and the fix for the darkest was the background rather than the letters, since white was already the best text on it. Red on a low answer would be wrong twice: the document is handed to a manager, and on Interest a low answer is a preference rather than a deficiency.
- **The survey's two free-text answers are the one thing collected that is never reported.** The wrap-up page after the last facet asks what else someone wants to say and what the assessment failed to ask about; both are for improving the instrument. Free text cannot be aggregated and is often recognisable as its author, so it is held apart from the promise the intro screen makes — it reaches the browser through \`listRespondents\` and through no payload \`publicAssessment\` serves to a buyer or a team leader, and the discussion never sees it. The page says so where it asks, because a box added under an intro promising aggregate-only reporting would otherwise contradict it silently. The wrap-up comes before the review page rather than after, since that page is the one people print and share; and it never gates completion, which the last facet's save has already recorded, so skipping it costs a respondent nothing.
- **Every rating axis states what it means, on every card.** \`PERSONAL_AXES\` and \`TEAM_GAP_AXES\` each carry a \`hint\`, and the intro screen renders its glossary from the same constants — so the screen describing the survey cannot describe it differently from the survey. The team gap's two axes were hardcoded JSX while the personal three came from a list, which is exactly how one of them would have been reworded and not the other. This is not decoration: a respondent who reads Experience and Skills as the same question rates them identically, which produces well-formed answers and empties the one category that needs those answers to disagree. Not a tooltip, because hover does not exist on the phones these are answered on; not once on the intro, because it is forgotten by the third activity. \`gray-500\`, not \`gray-400\` — that is a standing 2.43:1 contrast finding and this is text written for people who are unsure.
- **The intro loads the activities before it renders.** It used to fetch them in its submit handler, which made the one screen asking for a commitment the one screen that could not say to what. Both submit handlers stopped re-fetching afterwards, so starting is a state change rather than a second wait.
- **Every facet page ends on "Next", including the last one.** The final facet said "Finish and review" and stopped being true the moment the wrap-up went in behind it — it promised the summary and delivered two more questions, which reads as something having gone wrong. That label now sits on the wrap-up. Anything driving the survey should page by "Next" alone; advancing by whichever label it finds will click straight through the wrap-up.
- Nothing in the app calls a suggested owner an owner. The field is \`suggested_owner\`, the respondent's column reads **Suggested owner**, and the team tally reads **Most suggested** — a respondent proposes a role, and no part of the assessment assigns one.`,
  },
];

export default function ReadMe() {
  const [searchParams] = useSearchParams();
  const initialSection = searchParams.get("section") || "overview";
  const [activeSection, setActiveSection] = useState(initialSection);

  const current = sections.find((s) => s.id === activeSection);
  const currentIndex = sections.findIndex((s) => s.id === activeSection);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#e8e8e8] font-mono flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 p-6 flex flex-col gap-1 sticky top-0 h-screen overflow-y-auto">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-white/30 mb-1">Documentation</div>
          <div className="text-lg font-bold text-white">README.md</div>
        </div>
        <nav className="flex flex-col gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`text-left px-3 py-2 rounded text-sm transition-all duration-150 ${
                activeSection === s.id
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/5"
              }`}
            >
              {activeSection === s.id && <span className="text-white/30 mr-2">#</span>}
              {s.title}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="text-xs text-white/20">Base44 Platform</div>
          <div className="text-xs text-white/20 mt-0.5">React · Tailwind · SDK</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-12 max-w-3xl">
        <div className="mb-2 text-xs text-white/30 uppercase tracking-widest">
          {current.id}
        </div>
        <h1 className="text-3xl font-bold text-white mb-8 leading-tight">
          {current.title}
        </h1>

        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          {current.content ? (
            <ReactMarkdown
              // Without remark-gfm every table on this page rendered as literal
              // pipe characters. The prose-th/prose-td styling below was written
              // for tables that were never being parsed.
              remarkPlugins={[remarkGfm]}
              className="prose prose-invert prose-sm max-w-none
                prose-headings:font-bold prose-headings:text-white
                prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3
                prose-p:text-white/70 prose-p:leading-relaxed
                prose-strong:text-white
                prose-li:text-white/70
                prose-code:text-emerald-400 prose-code:bg-white/10 prose-code:px-1 prose-code:rounded
                prose-blockquote:border-l-white/20 prose-blockquote:text-white/50
                prose-table:text-sm
                prose-th:text-white/60 prose-th:font-semibold prose-th:text-left prose-th:pb-2 prose-th:border-b prose-th:border-white/10
                prose-td:text-white/70 prose-td:py-2 prose-td:border-b prose-td:border-white/5"
            >
              {current.content}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-white/30 italic">No content yet.</p>
          )}
        </div>

        {/* Section nav at bottom */}
        <div className="flex justify-between mt-10">
          {currentIndex > 0 ? (
            <button
              onClick={() => setActiveSection(sections[currentIndex - 1].id)}
              className="text-sm text-white/40 hover:text-white transition-colors"
            >
              ← Previous
            </button>
          ) : (
            <span />
          )}
          {currentIndex < sections.length - 1 ? (
            <button
              onClick={() => setActiveSection(sections[currentIndex + 1].id)}
              className="text-sm text-white/40 hover:text-white transition-colors"
            >
              Next →
            </button>
          ) : (
            <span />
          )}
        </div>
      </main>
    </div>
  );
}