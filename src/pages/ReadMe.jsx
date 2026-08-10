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
| **Activity** | The library. Each belongs to a facet: the six Quartz facets (DEFINE, COMMIT, DESCRIBE, CREATE, PREPARE, DELIVER) plus LEARN, which runs across the whole cycle and reports as its own standalone section. Library activities have no \`assessment_id\`; custom ones name their assessment. |
| **ActivitySet** | Named presets of activities for quick assessment setup. \`description\` says what the set is for, and shows wherever a preset is picked. |
| **Respondent** | One person answering one assessment. Self-registering; \`token\` is their credential. |
| **Response** | One person's answer for one activity. Carries both question sets — importance/execution/suggested_owner, or experience/skills/interest — and only the fields its assessment type asks about are written. |
| **DiscussionNote** | Facilitator's debrief notes and recorded decisions per activity. |
| **TeamLeaderFlag** | Activities a team leader flagged for discussion before fielding. |
| **Tag** | Free grouping for assessments — a client, a cohort, a support group. Flat and many-to-many. |
| **Organization** | The consulting org. The tenant boundary; \`org_id\` on other records points here. |
| **Invitation** | Carries an application role until an invited user first signs in. |
| **JobTitle** | The picklist of roles offered when suggesting an owner. |
| **Resource** | Authored learning resources for the personal report. Typed (free article / external / Quartz book / course), attached to activities by \`activity_ids\`. Read is open — the personal report renders unauthenticated. |
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
| \`/admin\` | Everything the facilitator does. Assessment list, setup, results, discussion, library, organizations, team. The only route behind \`ProtectedRoute\`. |

## Token-authenticated — no account needed

| Route | Purpose |
|---|---|
| \`/assess?code=…\` | Where a respondent joins. Self-registers with name and job title. |
| \`/assess?t=…\` | Their own resume link. Registration rewrites the URL to this, so the page they bookmark is theirs. |
| \`/team/:token\` | Team leader dashboard. Roster and completion status, plus any paired assessment's roster. |
| \`/report/:token\` | Buyer report for a gap analysis. Refuses a personal assessment's token. |

## Public

\`/\` landing · \`/login\` · \`/register\` · \`/forgot-password\` · \`/reset-password\` · \`/readme\` · \`/facilitator-guide\`

## Backend functions

\`publicAssessment\` resolves every public token server-side and returns only the fields that flow needs · \`listRespondents\` and \`listUsers\` read as service role where RLS cannot express the rule · \`deleteAssessment\` cascades a delete after one authority check · \`acceptInvitation\` and \`updateTeamMember\` manage roles server-side.`,
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
| \`src/lib/scoring.js\` | Gap analysis. Importance and execution are 0–3. **Also the single source of \`FACET_ORDER\`, \`FACET_SUBTITLES\` and \`THEME_GROUPS\`** — everything that sorts, pages or groups by facet imports from here. |
| \`src/lib/personal-scoring.js\` | Personal assessment. All three axes are 0/1/3/5, normalised before any cross-axis maths. Owns the five categories, both label vocabularies, and the per-facet and development-shortlist aggregations. |
| \`src/lib/activities.js\` | Resolves which activities an assessment actually asks about. |
| \`src/lib/activity-csv.js\` | Parses, validates and diffs the library CSV. No UI, no writes — the import dialog decides what to do with the diff. |
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

**A copied constant goes stale in every copy at once.** \`FACET_ORDER\` lived in four files. \`LEARN\` was removed from the six code copies but never from the entity enum, so the backend accepted a LEARN activity and the UI then made it unreachable — unanswerable in \`AssessPage\`, invisible in every picker, absent from the report. All four now import from \`scoring.js\`.

**\`indexOf\` returns \`-1\`, not \`undefined\`.** \`FACET_ORDER.indexOf(f) ?? 99\` never fires its fallback, so an unrecognised facet sorted *first* rather than last. Use \`facetRank()\`.

**A function's error message never reaches the user by default.** The SDK rejects with an axios error whose \`message\` is always \`"Request failed with status code 500"\`; the reason the function returned is in \`e.response.data\`. Use \`functionErrorMessage()\` from \`src/lib/utils.js\` anywhere a function failure is shown to someone.

**\`category()\` must not go back through \`capability()\`.** It looks like it could — capability is right there, and averaging experience with skills is one line shorter. That average is exactly what makes the \`strengthen\` category impossible: someone with long experience and low self-rated skill scores the same as a capable beginner, and they need opposite help. Skill and interest choose the bucket; experience only splits \`develop\` from \`strengthen\`. \`capability()\` is for the facilitator's Coverage view, which genuinely does want one number.

**No overall personal score.** Not an oversight and not a missing feature. Three axes that deliberately measure different things cannot be averaged into a grade without destroying the findings the instrument exists to surface.

## Conventions

- Response labels are stored as text, never numbers. Scoring maps them, so re-scoring an axis never touches stored data.
- The facilitator's vocabulary and the respondent's are separate by design. \`Reluctant\`, \`Poor fit\` and \`Under-skilled\` are diagnostic shorthand and must never reach the person they describe. \`CATEGORIES\` carries both sets: \`label\`/\`hint\` are the facilitator's, \`selfLabel\`/\`selfHint\` are the person's.
- A personal assessment ignores \`closed\`. The profile belongs to the person, so they can still revise it; \`closed_date\` lets Results flag answers changed after a report was delivered.
- Sharing a profile means the PDF, never the link. The token permits editing.`,
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