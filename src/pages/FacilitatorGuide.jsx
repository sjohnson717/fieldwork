import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

const sections = [
  {
    id: "setup",
    title: "Setup",
    content: `Complete setup before sending any links to the client. Everything is done in the Gap Analysis Admin screen.

## Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Create the assessment** | Click **New Assessment** in the navigation panel. Enter a title and client company name, then choose the type — **Team gap** or **Personal**. |
| 2 | **Choose an activity preset** | Go to the **Activities** tab. Click a preset — Default (36), Extended (65), Brief (22), or Executive (6). Each card says what the set is for. Ownership roles are pre-populated automatically. |
| 3 | **Review ownership roles** | Open the **Ownership Roles** tab. Add or remove roles to match the client's actual team structure. Team gap assessments only. |
| 4 | **Tag it** | In the **Overview** tab, add tags — the client, a cohort, whatever groups this with related work. |
| 5 | **Set status to Active** | In the Overview tab, set the status to **Active**. Participants cannot access the survey until this is done. |

> **Choose the type carefully — it can't be changed later.** The type decides which questions get asked, so switching it on an assessment that already has responses would relabel answers people gave to a different question.

## Which type?

| Type | Asks | Produces |
|------|------|----------|
| **Team gap** | How important is this activity, how well is it done today, and who should own it? | The gap analysis and the buyer report. Reported in aggregate — no individual is ever identified. |
| **Personal** | How much experience, skill and interest do *you* have in this activity? | A development profile belonging to each person. Attributed, not anonymous. |

## Tags

Tags group related assessments — a client, a cohort, a support group. An assessment can carry several, and they're only for finding things: they don't affect who can see what. Once you have a few assessments, a tag filter appears above the list in the navigation panel.

Pick an existing tag rather than typing a new one where you can. The picker only offers to create when nothing matches, which keeps "Alert Media" and "AlertMedia" from becoming two separate groups.

## Facilitators & Collaborators

Each facilitator only sees assessments they created themselves, plus any they've been explicitly added to as a collaborator — admins see every assessment across every client. If another facilitator or admin needs to help run this specific engagement (for example, a colleague co-leading the debrief), add them from the **Overview** tab → **Collaborators** section. Collaborators can fully manage the assessment (Setup, Results, Discussion) the same as the original creator, but can't delete it.

## Activity Presets

| Preset | Activities | Best for |
|--------|------------|----------|
| Executive | 6 | C-suite or VP-level. One broad activity for each of the six cycle facets. ~5 min. |
| Brief | 22 | Focused teams or short on time. Core activities. ~15 min. |
| Default | 36 | Standard engagement. All seven facets. ~25 min. |
| Extended | 65 | Deep-dive diagnostic. The entire activity library. ~45 min. |

> **Which preset should I use?** Default works well for most teams. Use Brief for time-constrained teams. Use Executive for leadership-only assessments focused on strategic outcomes.

> **Extended is now the whole library — budget for it.** At 65 activities it asks roughly half again as much of each respondent as it used to. Worth it for a deep-dive diagnostic; too much to send a busy team without warning them first.

Presets are a starting point, not a cage. After applying one, tick and untick individual activities in the same tab, or add custom activities specific to this client.

## The seven facets

Six facets describe the product cycle in order, and each pair is a theme in the report:

| Theme | Facets |
|-------|--------|
| Plan the right things | DEFINE · COMMIT |
| Build what you plan | DESCRIBE · CREATE |
| Sell what you build | PREPARE · DELIVER |

**LEARN is the seventh, and it sits on its own.** The other six happen at a point in the cycle; learning runs across all of it — maintaining product knowledge, synthesising what the evidence says, checking outcomes against the assumptions that justified the work, and getting that back to the people who need it. In the report it appears as its own section after the three themes, with its own facet tile in the overview.

LEARN is in **Default** and **Extended**. Executive and Brief deliberately leave it out — Executive covers the six cycle facets one activity at a time by design, and Brief is the shortest useful instrument. If learning is the reason for the engagement, use Default or add the four LEARN activities to whatever preset you start from.`,
  },
  {
    id: "fielding",
    title: "Share the survey",
    content: `Distribute links to the client team and monitor completion. All links are in the assessment Overview tab.

## Links to share

| Link | What the recipient sees | Where to find it |
|------|------------------------|------------------|
| **Access** | Participant confidential input. No summary provided. | Overview tab → Access |
| **Dashboard** | Team leader status dashboard. Does not show individual responses. | Overview tab → Links to share |
| **Report** | Client-facing report. Used during or after the assessment completion. Shows findings, gaps, and ownership analysis. After closing the assessment, also shows debrief decisions, if any. | Overview tab → Links to share |

> **Who gets which link?** All participants get the Access link. For a team gap assessment you can also hand out per-person links from the Team Leader Dashboard. Share the Dashboard and Report links only with team leaders.

> **Personal assessments work differently here.** The dashboard shows who has responded but offers no per-person links, and there is no buyer report. A personal link reopens and *edits* that person's answers, so it stays with them — a team leader needs to know a response arrived, not to be able to rewrite it. If someone loses their link, they re-join with the access code and you remove the empty duplicate from the Results tab.

## Distributing the Survey

- For facilitators: Get a list of names and emails from the team leader. You can email the participants with the generic **Access** code or use the the **Team Leader Dashboard** to get custom links to share.
- For team leaders: Share the **Team Leader Dashboard** link from the Overview tab. They can add names and emails for the assessments.
- Suggested message: *"Please take 15–20 minutes to complete this assessment before [DATE]. Your responses are anonymous. [LINK]"*
- Set a deadline. Two business days is usually sufficient.

## Monitoring Completion

Check the **Respondents table** in the Results tab. It shows each participant's name, title, status (completed or pending), response count, and completion date. This information is confidential. *Do not share this page with team leaders*.

> **Minimum responses:** Aim for at least 4–5 completed responses before running the debrief. The report will not display until the minimum threshold is reached. Follow up with non-completers 24 hours before the deadline.`,
  },
  {
    id: "personal",
    title: "Personal assessments",
    content: `A personal assessment asks each person about their own experience, skills and interest in the same activities the team rates. It produces a development profile for the individual and a capability picture for you.

## Ordering

Run the leadership gap analysis first where you can. It tells you which activities actually matter to this business, and it gives the personal results something to be measured against. A capability profile on its own says what people can do; crossed with the gap analysis it says whether that matches what the team needs.

That said, a personal assessment stands alone perfectly well — a cohort weighing whether product management is for them has no team and no gap analysis, and seeing the true scope of the role is the whole value.

## Linking

On a personal assessment, the **Overview** tab has a **Linked team assessment** picker. Choose the gap analysis it belongs with. That link is what powers the Coverage view and what puts both rosters on one team leader dashboard.

You can link at any time, including after responses are in.

## Reading the results

| View | Shows | Use it for |
|------|-------|-----------|
| **People** | One person's activities sorted into four quadrants, plus every answer | Preparing a one-to-one or a development conversation |
| **Matrix** | Activity × person heatmap for any axis, or capability overall | Spotting where the team is thin, and who is strong where |
| **Coverage** | Best-fit person per activity, against the linked gap analysis | Building the engagement case: important, badly executed, and nobody capable |

The four quadrants come from capability (experience and skills combined) crossed with interest:

| Quadrant | Meaning |
|----------|---------|
| **Strength** | Capable and interested. Hand it over. |
| **Develop** | Interested but not yet capable. Coaching pays off fastest here. |
| **Reluctant** | Capable but not interested. A retention risk worth talking about. |
| **Poor fit** | Neither. Don't assign it. |

> **These labels are yours, not theirs.** The person's own report never uses them — it says "strengths that energize you", "where you want to grow", "strengths that don't energize you", "not your focus right now". Keep it that way in what you write and say. The moment people believe a low interest rating is read as a verdict, the interest data stops being honest.

## What each person gets

The profile appears as soon as they submit — they don't have to come back for it. It shows their quadrants, all their answers, and a **Save as PDF to share** button. Sharing is the PDF, deliberately not their link.

Nothing pushes a profile to a manager. The person decides whether to share theirs, and when. If a team leader asks you to tell them who won't cut it, the honest answer is to give each person their own results and let them bring the conversation.

## Staying open

A personal assessment ignores **Closed**. People keep access to their own profile and can revise it whenever — a development plan doesn't expire because your engagement did.

The cost is that late edits move the numbers. Closing the assessment stamps the date, and the Results tab warns you if anyone has changed answers since — so you find out before you're in a room presenting figures that have shifted.

## When one bucket dominates

If two thirds of someone's activities land in one quadrant, their report opens with a sentence naming that shape rather than listing forty items. The one worth watching for is a profile that is nearly all "not your focus": that is a person and a role's scope pointing in different directions, and it usually is not a training problem.`,
  },
  {
    id: "facilitation",
    title: "Facilitation & Delivery",
    content: `The debrief is the core of the engagement. Use the Discussion tab as your working document during the session. The client report updates with action items automatically when you close the assessment.

## Before the Session

- Open **Results → Summary view**. Review the gap table sorted by gap score.
- Note activities with the highest gaps and any **"Discuss owner"** flags.
- Open the **Discussion tab**. Flag the 3–5 activities you plan to focus on.
- Prepare 1–2 open questions per flagged activity.

> **Pre-session framing:** The goal is not to critique execution — it's to surface where expectations and reality diverge, and to agree on who owns what. The data is a conversation starter, not a verdict.

## Running the Session

**Opening (5 min)** — Share your screen showing the report. Walk through the Key Finding and What This Means sections. Let the numbers land before opening discussion.

*Suggested opener: "Before we dig in, I want to acknowledge what's strong here — [bright spots]. Now let's talk about where the team sees the biggest gaps."*

**Structured discussion (30–40 min)** — Work through flagged activities one at a time. For each:

1. Share the gap and ownership data
2. Ask an open question to surface the story behind the number
3. Record key observations in the **Discussion Notes** field
4. Agree on a decision and record it in the **Decision / Action** field
5. Click **Save** before moving on

**Discussion Questions**

| Situation | Question |
|-----------|----------|
| High gap | "The team sees this as important but rates execution low. What's getting in the way?" |
| Discuss owner flag | "Three different roles were suggested as owner here. Who actually feels accountable for this today?" |
| Needs attention | "Is this a resource issue, a process issue, or a priority issue?" |
| All on track in a theme | "Your team rates this whole area as strong. Is that consistent with what you see day to day?" |
| Execution outpacing importance | "Your team rates execution here higher than importance. Are you over-investing in this area?" |
| Gaps in LEARN | "You rate learning as important but it isn't happening. What would have to stop for someone to have time to look back at whether the last release did what you expected?" |

> **LEARN gaps read differently.** A gap in DEFINE or CREATE usually means a capability or a process is missing. A gap in LEARN is almost always a time and priority problem — teams know they should review outcomes and rarely protect the space to do it. Expect "we never get to it" rather than "we don't know how", and steer the decision toward a specific commitment (who reviews what, when) rather than a training action.

**Closing (5–10 min)** — Summarize decisions recorded in the Discussion tab. Confirm the team leader has them. Explain the report link will update once you close the assessment.

## After the Session

- Review and clean up **Decision / Action** fields in the Discussion tab.
- Change the assessment status to **Closed** in the Overview tab.
- Send the team leader the **Report link**. It now includes the "What we decided" section.
- Optionally share the report link more broadly with participants.

> **Timing tip:** Close the assessment and send the report link within 24 hours of the debrief while the conversation is still fresh.`,
  },
];

export default function FacilitatorGuide() {
  const [activeId, setActiveId] = useState("setup");
  const [editing, setEditing] = useState(false);
  const [contents, setContents] = useState(
    Object.fromEntries(sections.map(s => [s.id, s.content]))
  );

  const current = sections.find(s => s.id === activeId);
  const currentContent = contents[activeId];

  const handleSectionChange = (id) => {
    setActiveId(id);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <Link to="/admin" className="text-xs font-semibold text-[#3366FF] uppercase tracking-wide hover:text-[#2952CC] transition-colors">
            ← Admin
          </Link>
          <h1 className="text-base font-bold text-gray-900 mt-1">Facilitator Guide</h1>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-1">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => handleSectionChange(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                activeId === s.id
                  ? "bg-[#eef2ff] text-[#1a2e7a]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{current.title}</h2>
            <button
              onClick={() => setEditing(e => !e)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
            >
              {editing ? "Done" : "Edit"}
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-8 py-8">
            {editing ? (
              <textarea
                value={currentContent}
                onChange={e => setContents(prev => ({ ...prev, [activeId]: e.target.value }))}
                className="w-full font-mono text-sm text-gray-800 border border-gray-200 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-[#3366FF] resize-y"
                style={{ minHeight: "400px" }}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                className="prose prose-sm max-w-none
                  prose-headings:font-bold prose-headings:text-gray-900
                  prose-h2:text-base prose-h2:mt-6 prose-h2:mb-3
                  prose-p:text-gray-600 prose-p:leading-relaxed
                  prose-strong:text-gray-900
                  prose-li:text-gray-600
                  prose-code:text-[#3366FF] prose-code:bg-[#eef2ff] prose-code:px-1 prose-code:rounded
                  prose-blockquote:border-l-[#a3b8ff] prose-blockquote:text-gray-500 prose-blockquote:bg-[#eef2ff]/50 prose-blockquote:py-0.5
                  prose-table:text-sm
                  prose-th:text-gray-500 prose-th:font-semibold prose-th:text-left prose-th:pb-2 prose-th:border-b prose-th:border-gray-200
                  prose-td:text-gray-600 prose-td:py-2 prose-td:border-b prose-td:border-gray-100"
              >
                {currentContent}
              </ReactMarkdown>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}