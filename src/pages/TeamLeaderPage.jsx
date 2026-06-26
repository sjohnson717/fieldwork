import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const PGL_LOGO = "https://static.wixstatic.com/media/739bca_d49790dff653441fae7d036110019dc2~mv2.png";

function statusBadge(status) {
  if (status === "completed") {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
        Completed
      </span>
    );
  }
  if (status === "started") {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
        In progress
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
      Invited
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-xs font-medium text-[#3366FF] hover:text-[#2952CC] border border-[#a3b8ff] hover:border-[#4d80ff] px-2 py-1 rounded-lg transition-colors"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

export default function TeamLeaderPage() {
  const { token } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [respondents, setRespondents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [submitting, setSubmitting] = useState(false);
  const [lastLink, setLastLink] = useState(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (token) loadPage();
  }, [token]);

  useEffect(() => { document.title = "Team | Quartz Assessments"; }, []);

  const loadPage = async () => {
    setLoading(true);
    try {
      const allAssessments = await base44.entities.Assessment.list();
      const found = allAssessments.find(a => a.team_token === token);
      if (!found) {
        setError("Team link not found. Please check your link.");
        setLoading(false);
        return;
      }
      setAssessment(found);
      const rList = await base44.entities.Respondent.filter({ assessment_id: found.id });
      setRespondents(rList);
    } catch (e) {
      setError("Something went wrong loading this page.");
    }
    setLoading(false);
  };

  const personalLink = (respondentToken) =>
    `${window.location.origin}/assess?code=${assessment.access_code}&t=${respondentToken}`;

  const handleInvite = async () => {
    setFormError("");
    if (!name.trim()) return setFormError("Please enter a name.");
    if (!email.trim()) return setFormError("Please enter an email.");
    setSubmitting(true);
    const respondentToken = crypto.randomUUID();
    const created = await base44.entities.Respondent.create({
      assessment_id: assessment.id,
      name: name.trim(),
      email: email.trim(),
      role,
      token: respondentToken,
      status: "invited",
    });
    setLastLink(personalLink(respondentToken));
    setName("");
    setEmail("");
    setRole("user");
    setSubmitting(false);
    // Refresh roster
    const rList = await base44.entities.Respondent.filter({ assessment_id: assessment.id });
    setRespondents(rList);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#3366FF]/20 border-t-[#3366FF] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-sm shadow-sm">
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <img src={PGL_LOGO} alt="Product Growth Leaders" className="h-8 object-contain" />
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Team Management</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{assessment.company_name || assessment.title}</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your team's participation in this assessment.</p>
        </div>

        {/* Invite form */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Invite a team member</h2>
          <p className="text-xs text-gray-400 mb-4">Create a personal assessment link for each participant.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 items-start">
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
            />
            <div>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF] bg-white"
              >
                <option value="user">Team member</option>
                <option value="team_leader">Team leader</option>
              </select>
              <p className="text-xs text-gray-400 mt-1.5">
                {role === "team_leader"
                  ? "Completes the assessment and can also access this page to invite others and check the team's status."
                  : "Completes the assessment. Won't have access to this page."}
              </p>
            </div>
          </div>

          {formError && <p className="text-red-500 text-xs mb-3">{formError}</p>}

          <button
            onClick={handleInvite}
            disabled={submitting}
            className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {submitting ? "Creating…" : "Create link"}
          </button>

          {lastLink && (
            <div className="mt-4 flex items-center gap-3 bg-[#eef2ff] border border-[#a3b8ff] rounded-lg px-4 py-3">
              <p className="text-xs text-[#2952CC] font-mono flex-1 truncate">{lastLink}</p>
              <CopyButton text={lastLink} />
            </div>
          )}
        </section>

        {/* Roster */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Participants</h2>
            <p className="text-xs text-gray-400 mt-0.5">{respondents.length} total</p>
          </div>

          {respondents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No participants yet. Invite someone above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium w-28">Role</th>
                  <th className="text-left px-4 py-3 font-medium w-28">Status</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {respondents.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.email || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {r.role === "team_leader" ? "Team leader" : "Team member"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <CopyButton text={personalLink(r.token)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}