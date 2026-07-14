import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export default function TeamPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const [invitations, setInvitations] = useState([]);

  const loadUsers = async () => {
    setLoading(true);
    const [all, invites] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Invitation.filter({ status: "pending" })
    ]);
    setUsers(all.sort((a, b) => {
      const aAccepted = !!a.full_name;
      const bAccepted = !!b.full_name;
      if (aAccepted !== bAccepted) return bAccepted ? 1 : -1;
      return (a.full_name || a.email).localeCompare(b.full_name || b.email);
    }));
    // Filter out invitations for emails that already accepted
    const acceptedEmails = new Set(all.map(u => u.email?.toLowerCase()));
    setInvitations(invites.filter(inv => !acceptedEmails.has(inv.email?.toLowerCase())));
    setLoading(false);
  };

  const handleInvite = async () => {
    setInviteError("");
    setInviteSuccess("");
    if (!inviteEmail.trim()) return setInviteError("Please enter an email address.");
    setInviting(true);
    const email = inviteEmail.trim();
    await base44.users.inviteUser(email, inviteRole);
    await base44.entities.Invitation.create({ email, role: inviteRole, status: "pending" });
    setInviteSuccess(`Invite sent to ${email}.`);
    setInviteEmail("");
    setInviteRole("user");
    setInviting(false);
    await loadUsers();
  };

  const handleRoleChange = async (user, newRole) => {
    if (user.id === currentUser.id) return;
    setUpdatingId(user.id);
    const updated = await base44.entities.User.update(user.id, { role: newRole });
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setUpdatingId(null);
  };

  const handleRemove = async (user) => {
    if (user.id === currentUser.id) return;
    if (!confirm(`Remove ${user.full_name || user.email} from the team?`)) return;
    setRemovingId(user.id);
    await base44.entities.User.delete(user.id);
    setUsers(prev => prev.filter(u => u.id !== user.id));
    setRemovingId(null);
  };

  const handleRevokeInvite = async (invitation) => {
    if (!confirm(`Revoke invitation for ${invitation.email}?`)) return;
    setRemovingId(invitation.id);
    await base44.entities.Invitation.update(invitation.id, { status: "revoked" });
    setInvitations(prev => prev.filter(i => i.id !== invitation.id));
    setRemovingId(null);
  };

  const acceptedCount = users.length;
  const pendingCount = invitations.length;

  return (
    <div className="p-8 max-w-3xl space-y-8">

      {/* Invite section */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Invite a team member</h3>
        <p className="text-xs text-gray-400 mb-4">They'll receive an email to join the app.</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            placeholder="email@company.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleInvite()}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF] flex-1 min-w-48"
          />
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF] bg-white"
          >
            <option value="user">user</option>
            <option value="facilitator">facilitator</option>
            <option value="admin">admin</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
        {inviteError && <p className="text-red-500 text-xs mt-2">{inviteError}</p>}
        {inviteSuccess && <p className="text-green-600 text-xs mt-2">{inviteSuccess}</p>}
      </section>

      {/* Users table */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Team members</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {acceptedCount} accepted
              {pendingCount > 0 && <span className="ml-2 text-amber-500 font-medium">· {pendingCount} pending invite{pendingCount !== 1 ? "s" : ""}</span>}
            </p>
          </div>
          <button onClick={loadUsers} className="text-xs text-gray-400 hover:text-[#3366FF] transition-colors">Refresh</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : users.length === 0 && invitations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No users found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium w-36">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium w-28">Role</th>
                <th className="text-left px-4 py-3 font-medium w-24">Status</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === currentUser?.id;
                const isUpdating = updatingId === u.id;
                const isRemoving = removingId === u.id;
                return (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {u.full_name}
                      {isSelf && (
                        <span className="ml-2 text-[10px] font-semibold text-[#4d80ff] bg-[#eef2ff] px-1.5 py-0.5 rounded-full">you</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#eef2ff] text-[#2952CC]">{u.role}</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={isUpdating}
                          onChange={e => handleRoleChange(u, e.target.value)}
                          className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3366FF] disabled:opacity-50 cursor-pointer"
                        >
                          <option value="user">user</option>
                          <option value="facilitator">facilitator</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">Accepted</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => handleRemove(u)}
                          disabled={isRemoving}
                          className="text-xs text-gray-300 hover:text-red-400 disabled:opacity-40 transition-colors font-medium"
                        >
                          {isRemoving ? "…" : "Remove"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invitations.map(inv => (
                <tr key={inv.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 opacity-70">
                  <td className="px-4 py-3 font-medium text-gray-400 italic">Not joined yet</td>
                  <td className="px-4 py-3 text-gray-500">{inv.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-500">{inv.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Invited</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRevokeInvite(inv)}
                      disabled={removingId === inv.id}
                      className="text-xs text-gray-300 hover:text-red-400 disabled:opacity-40 transition-colors font-medium"
                    >
                      {removingId === inv.id ? "…" : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}