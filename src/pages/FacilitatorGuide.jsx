import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

const sections = [
  {
    id: "setup",
    title: "Setup",
    content: `Complete setup before sending any links to the client. Everything is done in the Fieldwork Admin screen.

## Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Create the assessment** | Click **New Assessment** at the bottom of the navigation panel. Enter an assessment title and client company name. |
| 2 | **Choose an activity preset** | Go to the **Activities** tab. Click a preset — Default (32), Extended (42), Brief (22), or Executive (6). Ownership roles are pre-populated automatically. |
| 3 | **Review ownership roles** | Go to the **Overview** tab. Check the **Ownership Roles** section. Add or remove roles to match the client's actual team structure. |
| 4 | **Set status to Active** | In the Overview tab, set the assessment status to **Active**. Participants cannot access the survey until this is done. |

## Activity Presets

| Preset | Activities | Best for |
|--------|------------|----------|
| Executive | 6 | C-suite or VP-level. Strategic outcomes only. ~5 min. |
| Brief | 22 | Focused teams or short on time. Core activities. ~15 min. |
| Default | 32 | Standard engagement. All six phases. ~20 min. |
| Extended | 42 | Deep-dive diagnostic. Full activity library. ~30 min. |

> **Which preset should I use?** Default works well for most teams. Use Brief for time-constrained teams. Use Extended for a thorough diagnostic. Use Executive for leadership-only assessments focused on strategic outcomes.`,
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

> **Who gets which link?** All participants get the Access link. Alternatively, you use the team leader's Status Dashboard to create links for each individual. Share the Dashboard and Report links only with team leaders. 

## Distributing the Survey

- For facilitators: Get a list of names and emails from the team leader. You can email the participants with the generic **Access** code or use the the **STATUS Dashboard** to get custom links to share.
- For team leaders: Share the **STATUS Dashboard** link from the Overview tab. They can add names and emails for the assessments.
- Suggested message: *"Please take 15–20 minutes to complete this assessment before [DATE]. Your responses are anonymous. [LINK]"*
- Set a deadline. Two business days is usually sufficient.

## Monitoring Completion

Check the **Respondents table** in the Overview tab. It shows each participant's name, title, status (completed or pending), response count, and completion date. This information is confidential. *Do not share this page with team leaders*. 

> **Minimum responses:** Aim for at least 4–5 completed responses before running the debrief. The report will not display until the minimum threshold is reached. Follow up with non-completers 24 hours before the deadline.`,
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
          <Link to="/admin" className="text-xs font-semibold text-indigo-600 uppercase tracking-wide hover:text-indigo-800 transition-colors">
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
                  ? "bg-indigo-50 text-indigo-900"
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
                className="w-full font-mono text-sm text-gray-800 border border-gray-200 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
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
                  prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded
                  prose-blockquote:border-l-indigo-300 prose-blockquote:text-gray-500 prose-blockquote:bg-indigo-50/50 prose-blockquote:py-0.5
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