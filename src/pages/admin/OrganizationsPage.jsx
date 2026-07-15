import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    loadOrgs();
  }, []);

  const loadOrgs = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [allOrgs, allUsers] = await Promise.all([
        base44.entities.Organization.list(),
        base44.entities.User.list(),
      ]);
      setOrgs(allOrgs.sort((a, b) => a.name.localeCompare(b.name)));
      setUsers(allUsers);
    } catch (e) {
      console.error("Failed to load organizations", e);
      setLoadError(e?.message || "Failed to load organizations.");
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    const name = newOrgName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await base44.entities.Organization.create({ name });
      setOrgs(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewOrgName("");
    } catch (e) {
      console.error("Failed to create organization", e);
      setCreateError(e?.message || "Failed to create organization. Please try again.");
    }
    setCreating(false);
  };

  const membersFor = (orgId) => users.filter(u => u.org_id === orgId);

  return (
    <div className="p-8 max-w-3xl space-y-8">

      {/* Create organization */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Add organization</h3>
        <p className="text-xs text-gray-400 mb-4">Create an organization, then invite its admin from the Facilitators page — pick "org_admin" as the role and this organization when inviting.</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Organization name"
            value={newOrgName}
            onChange={e => setNewOrgName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newOrgName.trim()}
            className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {creating ? "Adding…" : "Add"}
          </button>
        </div>
        {createError && <p className="text-red-500 text-xs mt-2">{createError}</p>}
      </section>

      {/* Organizations list */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Organizations</h3>
            <p className="text-xs text-gray-400 mt-0.5">{orgs.length} organization{orgs.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={loadOrgs} className="text-xs text-gray-400 hover:text-[#3366FF] transition-colors">Refresh</button>
        </div>

        {loadError && (
          <p className="text-xs text-red-500 px-6 py-3">{loadError}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No organizations yet. Add one above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Organization</th>
                <th className="text-left px-4 py-3 font-medium">Members</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(org => {
                const members = membersFor(org.id);
                return (
                  <tr key={org.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800 align-top">{org.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {members.length === 0 ? (
                        <span className="text-gray-400 italic">No members yet</span>
                      ) : (
                        <div className="space-y-1">
                          {members.map(m => (
                            <div key={m.id} className="flex items-center gap-2">
                              <span>{m.full_name || m.email}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#eef2ff] text-[#2952CC]">{m.role}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
