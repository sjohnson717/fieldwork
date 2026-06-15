import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSearchParams } from "react-router-dom";

const sections = [
  {
    id: "overview",
    group: null,
    title: "Overview",
    content: `This application was built on the Base44 platform using React, Tailwind CSS, and a built-in backend-as-a-service infrastructure.

All entities, pages, and logic are defined manually by the developer. This README serves as a living reference document for understanding the app's architecture, data models, and page structure.`,
  },
  {
    id: "entities",
    group: null,
    title: "Entities",
    content: `No entities have been defined yet.

Entities are data models stored in the Base44 backend. Each entity has built-in fields:
- **id** — unique identifier
- **created_date** — timestamp of creation
- **updated_date** — timestamp of last update
- **created_by_id** — ID of the user who created the record

Add your custom entities here as you define them.`,
  },
  {
    id: "pages",
    group: null,
    title: "Pages",
    content: `No pages have been defined yet.

Pages are React components registered as routes in App.jsx. Document each page here with its route path and purpose.

Example:
- \`/\` — Home page
- \`/dashboard\` — Main dashboard`,
  },
  {
    id: "architecture",
    group: null,
    title: "Architecture",
    content: `- **Frontend:** React + Tailwind CSS + shadcn/ui
- **Backend:** Base44 backend-as-a-service (entities, auth, integrations)
- **Routing:** React Router v6
- **Data fetching:** TanStack React Query
- **Auth:** Base44 built-in authentication

The app uses the Base44 SDK (\`@/api/base44Client\`) for all entity operations and integrations.`,
  },
  {
    id: "notes",
    group: null,
    title: "Developer Notes",
    content: `Add any important notes, decisions, or conventions here.

Examples:
- Naming conventions used
- External APIs integrated
- Known limitations
- Deployment instructions`,
  },
  {
    id: "guide-setup",
    group: "Facilitator Guide",
    title: "Setup",
    content: `Complete setup before sending any links to the client. Everything is done in the Fieldwork Admin screen.

## Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Create the assessment** | Click **New Assessment**. Enter the assessment title and client company name. |
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
    id: "guide-fielding",
    group: "Facilitator Guide",
    title: "Fielding",
    content: `Distribute links to the client team and monitor completion. All links are in the assessment Overview tab.

## Links

| Link | What the recipient sees | Where to find it |
|------|------------------------|------------------|
| **Team link** | Participant survey. Anonymous. Also shown to the team leader. | Overview tab → Copy team link |
| **Report link** | Client-facing report. Shows findings, gaps, and ownership analysis. After closing, also shows debrief decisions. | Overview tab → Copy report link |

> **Who gets which link?** Send the Team link to all participants including the team leader. Share the Report link with the team leader only — after the assessment closes.

## Distributing the Survey

- Copy the **Team link** from the Overview tab.
- Send to the team leader to forward, or send directly if you have the contact list.
- Suggested message: *"Please take 15–20 minutes to complete this assessment before [DATE]. Your responses are anonymous. [LINK]"*
- Set a deadline. Two business days is usually sufficient.

## Monitoring Completion

Check the **Respondents table** in the Overview tab. It shows each participant's name, title, status (completed or pending), response count, and completion date.

> **Minimum responses:** Aim for at least 4–5 completed responses before running the debrief. The report will not display until the minimum threshold is reached. Follow up with non-completers 24 hours before the deadline.`,
  },
  {
    id: "guide-facilitation",
    group: "Facilitator Guide",
    title: "Facilitation & Delivery",
    content: `The debrief is the core of the engagement. Use the Discussion tab as your working document during the session. The report link updates automatically when you close the assessment.

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

const groups = ["Facilitator Guide"];

export default function ReadMe() {
  const [searchParams] = useSearchParams();
  const initialSection = searchParams.get("section") || "overview";
  const [activeSection, setActiveSection] = useState(initialSection);

  const current = sections.find((s) => s.id === activeSection);
  const currentIndex = sections.findIndex((s) => s.id === activeSection);

  const ungrouped = sections.filter((s) => !s.group);
  const grouped = groups.map((g) => ({
    label: g,
    items: sections.filter((s) => s.group === g),
  }));

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#e8e8e8] font-mono flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 p-6 flex flex-col gap-1 sticky top-0 h-screen overflow-y-auto">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-white/30 mb-1">Documentation</div>
          <div className="text-lg font-bold text-white">README.md</div>
        </div>
        <nav className="flex flex-col gap-1">
          {ungrouped.map((s) => (
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

          {grouped.map(({ label, items }) => (
            <div key={label} className="mt-4">
              <div className="text-[10px] uppercase tracking-widest text-white/25 px-3 mb-1">{label}</div>
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`text-left px-3 py-2 rounded text-sm transition-all duration-150 w-full ${
                    activeSection === s.id
                      ? "bg-white/10 text-white"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  {activeSection === s.id && <span className="text-white/30 mr-2">#</span>}
                  {s.title}
                </button>
              ))}
            </div>
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
          {current.group ? `${current.group} · ${current.id}` : current.id}
        </div>
        <h1 className="text-3xl font-bold text-white mb-8 leading-tight">
          {current.title}
        </h1>

        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          {current.content ? (
            <ReactMarkdown
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