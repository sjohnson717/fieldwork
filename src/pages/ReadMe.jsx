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