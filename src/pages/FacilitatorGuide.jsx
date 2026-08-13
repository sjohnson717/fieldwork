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
| **Access** | Participant confidential input. Ends on a summary of that person's own answers — see **What participants see**. | Overview tab → Access |
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
    id: "participants",
    title: "What participants see",
    content: `Both assessment types now end on a summary of what that person said. It replaces the thank-you dialog, and it is the same idea in both instruments: report someone's own answers back to them, organised, and say nothing about whether they are right.

That last part matters. A summary that graded anyone would make the next answer less honest, and it would pre-empt the debrief — **discrepancies between people are the room's work, not the report's**.

## The two summaries

| | Personal | Team gap |
|---|---|---|
| **Part one** | *Your product profile* — activities sorted into the five categories | *Where you'd focus first* — activities bucketed by the distance between how much they matter and how well they're done |
| **Part two** | *Your Quartz profile* — experience, skills and interest per facet, three separate bars | *Your view by phase* — importance and execution per facet, two bars |
| **Part three** | *Development opportunities* — up to five, each with a **Try this** step | — |
| **Part four** | *Suggested resources* for those opportunities | — |
| **Also carries** | Questions to take into a development conversation | Anything they marked **"I don't know"**, named as a sightline rather than a gap |
| **Appendix** | Every answer they gave | Every answer they gave |

Neither ever combines its axes into one number. On the team gap side the distance between "this matters" and "this is being done" *is* the finding, and a single score would hide it — the same reason the personal report has no overall grade.

> **The team gap summary carries one thing the client report cannot.** An activity someone called important and marked "I don't know" on is a fact about that person's sightlines. Averaged across a team it disappears into a smaller sample. On an individual summary it is worth raising out loud, and it is usually closed in one sentence by someone else in the room.

## Nothing is submitted at the end

Answers are saved as they are given, in both instruments. The last page of the survey says **Finish and review** rather than "Preview your responses", and the button below the team gap summary says **Done** rather than "Submit" — by then the submission has already happened, and a button promising otherwise implied that closing the tab would lose the work.

Respondents can still revise. Their own link reopens their answers until the assessment closes; on a personal assessment, indefinitely.

## Saving it as a PDF

Both summaries print. The first sheet is a cover — assessment title, client, the person's name and title, the date they submitted — so **a report left on a desk or handed across a table shows a name rather than someone's answers**. Every page after that is the summary and then the full answer table.

Just above the closing credit, every report ends with a line pointing to the Chaos Assessment at productgrowthleaders.com/assess. It shows on screen as well as on paper — on screen it is a live link, which is where most people finish reading — and it sits at the very end rather than alongside anyone's answers.

The foot of the first and last pages reads *Prepared for you by Product Growth Leaders*, with the address as a real link. The cover carries the Quartz mark, not a PGL logo: this is the respondent's document, and a consultancy's letterhead over someone's own self-assessment reads as a sales piece rather than a deliverable.

> **What to tell a team leader who asks for everyone's summary.** The same thing as for personal profiles: each person has their own, sharing is theirs to do, and the aggregate view — which is what a leader actually needs — is the client report. A per-person link permits editing, so forwarding it hands over write access to someone's answers.`,
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
| **People** | One person's activities sorted into the five categories, plus every answer | Preparing a one-to-one or a development conversation |
| **Matrix** | Activity × person heatmap for any axis, or capability overall | Spotting where the team is thin, and who is strong where |
| **Coverage** | Best-fit person per activity, against the linked gap analysis | Building the engagement case: important, badly executed, and nobody capable |

The five categories come from all three axes read separately. Skill and interest decide the category; experience separates the two development cases:

| Category | Experience | Skill | Interest | Meaning |
|----------|------------|-------|----------|---------|
| **Strength** | — | high | high | Skilled and interested. Hand it over. |
| **Develop** | low | low | high | Wants it, hasn't done it. Exposure first, then coaching. |
| **Under-skilled** | **high** | low | high | Has done it, wants it, rates own skill low. Sharpen an existing practice. |
| **Reluctant** | — | high | low | Skilled but disengaged. A retention risk worth talking about. |
| **Poor fit** | — | low | low | Little of any of it. Don't assign it. |

> **Under-skilled is the one to look for.** It is the category the old four-quadrant model could not express, because that model averaged experience and skills into a single "capability" number — which cannot tell a beginner apart from someone who has done a job for years and never been shown a better way to do it. Those two people need completely different help, and only one of them needs training. Expect this category to appear most in self-taught practitioners and in teams that grew fast without anyone senior to learn from.

> **These labels are yours, not theirs.** The person's own report never uses them — it says "strengths you enjoy using", "development opportunities", "skills to strengthen", "strengths you may not want to emphasize", "lower-priority development areas". Keep it that way in what you write and say. The moment people believe a low interest rating is read as a verdict, the interest data stops being honest.

## No overall score, ever

There is deliberately no "73% Product Manager" number, and there will not be one. A single score would be read as a grade, quoted without its context, and would require experience, skills and interest to mean the same kind of thing — which is exactly what this instrument exists to keep apart.

If a client asks for one, the honest answer is that the three axes disagreeing with each other *is* the finding. High skill with low interest, or long experience with low self-rated skill, are the two most useful things this assessment produces, and both of them vanish into an average.

## What each person gets

The report appears as soon as they finish — they don't have to come back for it, and there is no "submit" step to press. It is a four-part document, and it is theirs:

| Part | Contains |
|------|----------|
| **1 · Your product profile** | Their activities sorted into the five categories |
| **2 · Your Quartz profile** | Experience, skills and interest per facet, as three separate bars |
| **3 · Development opportunities** | A shortlist of up to five, each with the reason it was chosen and one concrete **Try this** step, plus questions to take into a development conversation |
| **4 · Suggested resources** | Reading and practice for those opportunities. Only appears if resources have been attached to the recommended activities |
| **Appendix** | Every answer they gave |

**Save as PDF to share** and their own bookmark link sit above the appendix, at the top of the report. Sharing is the PDF, deliberately not their link — the link permits editing, so forwarding it hands a manager write access to someone's own self-assessment.

The development shortlist is drawn only from activities they said they're interested in. Low interest is a legitimate answer, not a gap to be corrected, so nothing is recommended on the strength of a low score alone. If someone's answers produce no shortlist at all, the report says so plainly rather than inventing one — and that is usually a conversation about scope, not about skills.

Nothing pushes a profile to a manager. The person decides whether to share theirs, and when. If a team leader asks you to tell them who won't cut it, the honest answer is to give each person their own results and let them bring the conversation.

The survey says the same thing before anyone answers: *"The profile is yours to keep, and sharing it is your call."* Use that wording when someone asks who sees this — it is what they were told, and it is what the software does. It deliberately names no recipient, not even a manager as a suggestion, because the same screen fields the open assessments taken by people with no engagement behind them. What you must not say is that the answers go to their leader. They do not, and a participant who believes they do will answer accordingly.

## Suggested resources

Resources are managed in **Library → Resources**. Each one is typed — free article, external resource, Quartz book, or course or workshop — and attached to the activities it serves. The type is shown to the reader, so they know what they're being sent before they click.

**The library is loaded.** All 65 activities carry a resource: 35 Product Growth Leaders articles and 10 third-party books, attached to the activities they serve. One activity — Staff Promotional Events — deliberately has none, and shows only its Try this step. A resource serving several activities is listed **once**, under the highest-ranked opportunity that claims it, so a shortlist doesn't repeat the same article three times.

## Try this

Every activity also carries a one-line **Try this** step: something a person could do this week. It appears inside each development opportunity, next to the reason that opportunity was offered, so five opportunities read as a plan rather than sixty-five reading as homework.

Edit them in **Library → Activities**, in the same form as the name and description, and they round-trip through the activity CSV as a **Try This** column. A CSV exported before that column existed imports safely — a file that doesn't carry the column leaves every tip alone.

> **Try this is deliberately absent from the team gap summary.** A personal development gap is that person's own to close; a team gap frequently belongs to someone else entirely, and handing an individual a to-do for work they don't own misreads the instrument.

Part four only lists resources attached to an activity that person was actually advised to develop. That's deliberate: a page listing everything available is a catalogue, and a catalogue is what makes a recommendation read as advertising.

> **Training is one possible recommendation, not the automatic answer.** A report where every gap resolves to a Quartz course is a sales document, and people can tell. Attach a free article or an external book wherever one genuinely serves better — the section is only worth having if a reader trusts it.

An activity with no resources attached simply doesn't appear in part four, and if nothing at all is attached the whole section is omitted rather than printing an empty promise.

## Staying open

A personal assessment ignores **Closed**. People keep access to their own profile and can revise it whenever — a development plan doesn't expire because your engagement did.

The cost is that late edits move the numbers. Closing the assessment stamps the date, and the Results tab warns you if anyone has changed answers since — so you find out before you're in a room presenting figures that have shifted.

## When one bucket dominates

If two thirds of someone's activities land in one category, their report opens with a sentence naming that shape rather than listing forty items. The one worth watching for is a profile that is nearly all "lower-priority": that is a person and a role's scope pointing in different directions, and it usually is not a training problem.

The other shape worth naming is a profile heavy in **Under-skilled** — experience and appetite everywhere, self-rated skill below both. That pattern is rarely a training gap in the usual sense. It more often means someone learned the job by doing it, alone, and has never seen a better version of the practice to measure themselves against.`,
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

> **Everyone in the room has already seen their own answers summarised.** They arrive knowing where *they* said the gaps are, which changes the debrief: less time explaining what was asked, more time on why two people who do the same work answered differently. Expect people to arrive with a position. That is the point — the discrepancies are what the session exists to surface, and nobody's summary told them they were right.

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