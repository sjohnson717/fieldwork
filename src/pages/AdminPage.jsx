import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AssessmentOverview from "./admin/AssessmentOverview";
import AssessmentResults from "./admin/AssessmentResults";
import AssessmentDiscussion from "./admin/AssessmentDiscussion";
import LibraryPage from "./admin/LibraryPage";
import DemoDataPage from "./admin/DemoDataPage";
import TeamPage from "./admin/TeamPage";

const NAV_TABS = ["Overview", "Results", "Discussion"];

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-500",
  active: "bg-green-100 text-green-700",
  closed: "bg-red-100 text-red-600",
};

export default function AdminPage() {
  const { user, isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSection, setSelectedSection] = useState("assessments"); // assessments | library
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [creating, setCreating] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      navigateToLogin();
    }
  }, [isLoadingAuth, isAuthenticated, navigateToLogin]);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role !== "admin") return; // non-admins see nothing
      loadAssessments();
    }
  }, [isAuthenticated, user]);

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const results = await base44.entities.Assessment.list("created_date");
      setAssessments(results.reverse());
      if (results.length > 0 && !selectedId) {
        setSelectedId(results[results.length - 1].id); // pick most recent
      }
    } catch (e) {
      console.error("Failed to load assessments", e);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const code = Math.random().toString(36).substring(2, 7).toUpperCase();
      const buyerToken = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const teamToken = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const created = await base44.entities.Assessment.create({
        title: newTitle.trim(),
        company_name: newCompany.trim(),
        access_code: code,
        buyer_token: buyerToken,
        team_token: teamToken,
        status: "draft",
        roles: [],
      });
      setAssessments(prev => [created, ...prev]);
      setSelectedId(created.id);
      setShowNewForm(false);
      setNewTitle("");
      setNewCompany("");
    } catch (e) {
      console.error("Failed to create assessment", e);
    }
    setCreating(false);
  };

  const handleAssessmentUpdate = (updated) => {
    setAssessments(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  const [deleting, setDeleting] = useState(false);

  const handleDeleteAssessment = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete "${selected.title}"? This permanently removes the assessment and all its respondents, responses, and discussion notes. This cannot be undone.`
    );
    if (!confirmed) return;
    setDeleting(true);
    const [respondents, responses, notes] = await Promise.all([
      base44.entities.Respondent.filter({ assessment_id: selected.id }),
      base44.entities.Response.filter({ assessment_id: selected.id }),
      base44.entities.DiscussionNote.filter({ assessment_id: selected.id }),
    ]);
    await Promise.all([
      ...respondents.map(r => base44.entities.Respondent.delete(r.id)),
      ...responses.map(r => base44.entities.Response.delete(r.id)),
      ...notes.map(n => base44.entities.DiscussionNote.delete(n.id)),
    ]);
    await base44.entities.Assessment.delete(selected.id);
    setAssessments(prev => {
      const next = prev.filter(a => a.id !== selected.id);
      setSelectedId(next.length > 0 ? next[0].id : null);
      if (next.length > 0) setSelectedSection("assessments");
      return next;
    });
    setDeleting(false);
  };

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center max-w-sm">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Access denied</h2>
          <p className="text-sm text-gray-500">This page is only available to admins.</p>
        </div>
      </div>
    );
  }

  const selected = assessments.find(a => a.id === selectedId);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-0.5">Fieldwork</p>
          <h1 className="text-base font-bold text-gray-900">Admin</h1>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3">
          {/* Assessments section */}
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5 mt-1">Assessments</p>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : assessments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4 px-2">No assessments yet.</p>
          ) : (
            <ul className="space-y-1">
              {assessments.map(a => (
                <li key={a.id}>
                  <button
                    onClick={() => { setSelectedId(a.id); setSelectedSection("assessments"); setActiveTab("Overview"); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                      selectedSection === "assessments" && selectedId === a.id
                        ? "bg-indigo-50 text-indigo-900"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{a.title}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[a.status] || STATUS_COLORS.draft}`}>
                        {a.status}
                      </span>
                    </div>
                    {a.company_name && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{a.company_name}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Library section */}
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5 mt-5">Settings</p>
          <button
            onClick={() => setSelectedSection("library")}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              selectedSection === "library"
                ? "bg-indigo-50 text-indigo-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Library
          </button>
          <button
            onClick={() => setSelectedSection("demo")}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              selectedSection === "demo"
                ? "bg-indigo-50 text-indigo-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Demo Data
          </button>
          <button
            onClick={() => setSelectedSection("team")}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              selectedSection === "team"
                ? "bg-indigo-50 text-indigo-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Team
          </button>
        </div>

        <div className="p-3 border-t border-gray-100">
          {showNewForm ? (
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Assessment title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="Company name (optional)"
                value={newCompany}
                onChange={e => setNewCompany(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim()}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-1.5 rounded-lg transition-colors"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setNewTitle(""); setNewCompany(""); }}
                  className="px-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New assessment
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedSection === "library" ? (
          <LibraryPage />
        ) : selectedSection === "demo" ? (
          <DemoDataPage />
        ) : selectedSection === "team" ? (
          <TeamPage />
        ) : !selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            {loading ? "" : "Select or create an assessment"}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-8 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                  {selected.company_name && (
                    <p className="text-sm text-gray-400">{selected.company_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[selected.status] || STATUS_COLORS.draft}`}>
                    {selected.status}
                  </span>
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {selected.access_code}
                  </span>
                  {selected.buyer_token && (
                    <>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/report/${selected.buyer_token}`;
                          navigator.clipboard.writeText(url);
                        }}
                        className="text-xs font-medium text-[#3366FF] border border-[#3366FF]/30 px-2 py-1 rounded hover:bg-[#3366FF]/5 transition-colors"
                        title="Copy report link for buyer"
                      >
                        Copy report link
                      </button>
                      <button
                        onClick={() => window.open(`${window.location.origin}/report/${selected.buyer_token}`, "_blank")}
                        className="text-xs font-medium text-[#3366FF] border border-[#3366FF]/30 px-2 py-1 rounded hover:bg-[#3366FF]/5 transition-colors"
                        title="Open report in new tab"
                      >
                        Open report
                      </button>
                    </>
                  )}
                  {selected.team_token ? (
                    <>
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/team/${selected.team_token}`)}
                        className="text-xs font-medium text-[#3366FF] border border-[#3366FF]/30 px-2 py-1 rounded hover:bg-[#3366FF]/5 transition-colors"
                        title="Copy team link"
                      >
                        Copy team link
                      </button>
                      <button
                        onClick={() => window.open(`${window.location.origin}/team/${selected.team_token}`, "_blank")}
                        className="text-xs font-medium text-[#3366FF] border border-[#3366FF]/30 px-2 py-1 rounded hover:bg-[#3366FF]/5 transition-colors"
                        title="Open team link in new tab"
                      >
                        Open team link
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={async () => {
                        const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
                        const updated = await base44.entities.Assessment.update(selected.id, { team_token: token });
                        handleAssessmentUpdate(updated);
                      }}
                      className="text-xs font-medium text-[#3366FF] border border-[#3366FF]/30 px-2 py-1 rounded hover:bg-[#3366FF]/5 transition-colors"
                    >
                      Generate team link
                    </button>
                  )}
                  <button
                    onClick={handleDeleteAssessment}
                    disabled={deleting}
                    className="ml-2 text-xs font-medium text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
              {/* Tabs */}
              <div className="flex gap-1">
                {NAV_TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "bg-indigo-600 text-white"
                        : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === "Overview" && (
                <AssessmentOverview
                  assessment={selected}
                  onUpdate={handleAssessmentUpdate}
                />
              )}
              {activeTab === "Results" && (
                <AssessmentResults assessment={selected} />
              )}
              {activeTab === "Discussion" && (
                <AssessmentDiscussion assessment={selected} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}