import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { roleLabel, assignableRoles, sameOrg, NO_ACCESS_ROLE } from "@/lib/roles";

export default function TeamPage({ orgFilter = null, onClearOrgFilter, onBackToOrganizations }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const isOrgAdmin = currentUser?.role === "org_admin";

  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("facilitator");
  const [inviteOrgId, setInviteOrgId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  // Arriving from an organization's "View team" link — preselect that org so
  // an invite sent from here lands in the organization you were looking at.
  useEffect(() => {
    if (orgFilter) setInviteOrgId(orgFilter);
  }, [orgFilter]);

  const [invitations, setInvitations] = useState([]);

  const loadUsers = async () => {
    setLoading(true);
    setLoadError("");
    try {
      if (isAdmin) {
        const [all, invites, allOrgs] = await Promise.all([
          base44.entities.User.list(),
          base44.entities.Invitation.filter({ status: "pending" }),
          base44.entities.Organization.list(),
        ]);
        setUsers(sortUsers(all));
        const acceptedEmails = new Set(all.map(u => u.email?.toLowerCase()));
        setInvitations(invites.filter(inv => !acceptedEmails.has(inv.email?.toLowerCase())));
        setOrgs(allOrgs);
      } else {
        // org_admin: scoped to their own org via the listUsers backend
        // function (base44's User entity ignores custom RLS for list
        // operations, so a direct entities.User.list() call would only
        // ever return this user's own record).
        const [res, invites] = await Promise.all([
          base44.functions.invoke("listUsers", {}),
          base44.entities.Invitation.filter({ status: "pending" }),
        ]);
        const all = res?.data?.users || [];
        setUsers(sortUsers(all));
        const acceptedEmails = new Set(all.map(u => u.email?.toLowerCase()));
        setInvitations(invites.filter(inv =>
          !acceptedEmails.has(inv.email?.toLowerCase()) && sameOrg(inv.org_id, currentUser.org_id)
        ));
      }
    } catch (e) {
      console.error("Failed to load team", e);
      setLoadError(e?.response?.data?.error || e?.message || "Failed to load team members.");
    }
    setLoading(false);
  };

  const sortUsers = (list) => [...list].sort((a, b) => {
    const aAccepted = !!a.full_name;
    const bAccepted = !!b.full_name;
    if (aAccepted !== bAccepted) return bAccepted ? 1 : -1;
    return (a.full_name || a.email).localeCompare(b.full_name || b.email);
  });

  const handleInvite = async () => {
    setInviteError("");
    setInviteSuccess("");
    if (!inviteEmail.trim()) return setInviteError("Please enter an email address.");
    setInviting(true);
    const email = inviteEmail.trim();
    const orgId = isAdmin ? (inviteOrgId || undefined) : currentUser.org_id;
    try {
      // Base44's invite API only accepts its own platform roles ("user" or
      // "admin") and rejects ours outright. Invite at the platform level, and
      // carry the application role on the Invitation — acceptInvitation
      // applies it when they first sign in.
      const platformRole = inviteRole === "admin" ? "admin" : "user";
      await base44.users.inviteUser(email, platformRole);
      await base44.entities.Invitation.create({ email, role: inviteRole, status: "pending", org_id: orgId || undefined });
      setInviteSuccess(`Invite sent to ${email}.`);
      setInviteEmail("");
      setInviteRole("facilitator");
      setInviteOrgId("");
    } catch (e) {
      console.error("Failed to invite", e);
      setInviteError(e?.message || "Failed to send invite. Please try again.");
    }
    setInviting(false);
    await loadUsers();
  };

  // All edits to *other* users go through the updateTeamMember function.
  // User's RLS only permits self-updates and super-admin writes now, so this
  // is the one path that can change someone else's role or organization —
  // and it enforces the org and grantable-role limits server-side.
  const updateMember = async (userId, changes) => {
    const res = await base44.functions.invoke("updateTeamMember", { userId, ...changes });
    const error = res?.data?.error;
    if (error) throw new Error(error);
    return res.data.user;
  };

  const handleRoleChange = async (user, newRole) => {
    if (user.id === currentUser.id) return;
    setUpdatingId(user.id);
    setLoadError("");
    try {
      const updated = await updateMember(user.id, { role: newRole });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch (e) {
      console.error("Failed to change role", e);
      setLoadError(e?.response?.data?.error || e?.message || "Failed to change role.");
    }
    setUpdatingId(null);
  };

  const handleOrgChange = async (user, newOrgId) => {
    if (user.id === currentUser.id) return;
    setUpdatingId(user.id);
    setLoadError("");
    try {
      const updated = await updateMember(user.id, { orgId: newOrgId || null });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch (e) {
      console.error("Failed to change organization", e);
      setLoadError(e?.response?.data?.error || e?.message || "Failed to change organization.");
    }
    setUpdatingId(null);
  };

  const handleRevokeAccess = async (user) => {
    if (user.id === currentUser.id) return;
    if (!confirm(`Revoke access for ${user.full_name || user.email}? They'll lose their role and organization membership.`)) return;
    setRemovingId(user.id);
    setLoadError("");
    try {
      const updated = await updateMember(user.id, { role: NO_ACCESS_ROLE });
      setUsers(prev => prev.filter(u => u.id !== updated.id));
    } catch (e) {
      console.error("Failed to revoke access", e);
      setLoadError(e?.response?.data?.error || e?.message || "Failed to revoke access.");
    }
    setRemovingId(null);
  };

  const handleRevokeInvite = async (invitation) => {
    if (!confirm(`Revoke invitation for ${invitation.email}?`)) return;
    setRemovingId(invitation.id);
    try {
      await base44.entities.Invitation.update(invitation.id, { status: "revoked" });
      setInvitations(prev => prev.filter(i => i.id !== invitation.id));
    } catch (e) {
      console.error("Failed to revoke invite", e);
    }
    setRemovingId(null);
  };

  const inviteRoleOptions = assignableRoles(currentUser?.role);
  // Legacy accounts may still sit on the no-access "user" role. It isn't
  // grantable, but it has to appear in that row's select or the control would
  // render with the wrong value selected.
  const rowRoleOptions = (u) =>
    u.role === NO_ACCESS_ROLE ? [NO_ACCESS_ROLE, ...inviteRoleOptions] : inviteRoleOptions;
  const orgName = (orgId) => orgs.find(o => o.id === orgId)?.name || "—";

  // A super admin can narrow the page to a single organization from the
  // Organizations page. Org admins are already scoped to their own org by
  // the listUsers function, so there's nothing to narrow.
  const visibleUsers = orgFilter ? users.filter(u => sameOrg(u.org_id, orgFilter)) : users;
  const visibleInvitations = orgFilter
    ? invitations.filter(inv => sameOrg(inv.org_id, orgFilter))
    : invitations;

  const acceptedCount = visibleUsers.length;
  const pendingCount = visibleInvitations.length;

  return (
    <div className="p-8 max-w-5xl space-y-8">

      {/* Invite section */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">
          {isAdmin ? "Invite a team member" : "Invite someone to your organization"}
        </h3>
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
          {/* Org admins pick too — they may invite facilitators or a
              co-admin for their own organization. */}
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF] bg-white"
          >
            {inviteRoleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          {isAdmin && (
            <select
              value={inviteOrgId}
              onChange={e => setInviteOrgId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF] bg-white"
            >
              <option value="">No organization</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
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
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              {orgFilter ? orgName(orgFilter) : isOrgAdmin ? "Your organization" : "Team members"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {acceptedCount} accepted
              {pendingCount > 0 && <span className="ml-2 text-amber-500 font-medium">· {pendingCount} pending invite{pendingCount !== 1 ? "s" : ""}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {orgFilter && (
              <>
                <button
                  onClick={onBackToOrganizations}
                  className="text-xs text-gray-400 hover:text-[#3366FF] transition-colors"
                >
                  ← Organizations
                </button>
                <button
                  onClick={onClearOrgFilter}
                  className="text-xs text-gray-400 hover:text-[#3366FF] transition-colors"
                >
                  Show all
                </button>
              </>
            )}
            <button onClick={loadUsers} className="text-xs text-gray-400 hover:text-[#3366FF] transition-colors">Refresh</button>
          </div>
        </div>

        {loadError && (
          <p className="text-xs text-red-500 px-6 py-3">{loadError}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : visibleUsers.length === 0 && visibleInvitations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium w-36">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium w-28">Role</th>
                {isAdmin && <th className="text-left px-4 py-3 font-medium w-36">Organization</th>}
                <th className="text-left px-4 py-3 font-medium w-24">Status</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map(u => {
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
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#eef2ff] text-[#2952CC]">{roleLabel(u.role)}</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={isUpdating}
                          onChange={e => handleRoleChange(u, e.target.value)}
                          className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3366FF] disabled:opacity-50 cursor-pointer"
                        >
                          {rowRoleOptions(u).map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                        </select>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className="text-xs text-gray-500">{orgName(u.org_id)}</span>
                        ) : (
                          <select
                            value={u.org_id || ""}
                            disabled={isUpdating}
                            onChange={e => handleOrgChange(u, e.target.value)}
                            className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3366FF] disabled:opacity-50 cursor-pointer"
                          >
                            <option value="">No organization</option>
                            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">Accepted</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => handleRevokeAccess(u)}
                          disabled={isRemoving}
                          className="text-xs text-gray-300 hover:text-red-400 disabled:opacity-40 transition-colors font-medium"
                        >
                          {isRemoving ? "…" : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleInvitations.map(inv => (
                <tr key={inv.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 opacity-70">
                  <td className="px-4 py-3 font-medium text-gray-400 italic">Not joined yet</td>
                  <td className="px-4 py-3 text-gray-500">{inv.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-500">{roleLabel(inv.role)}</span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{orgName(inv.org_id)}</span>
                    </td>
                  )}
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
          </div>
        )}
      </section>
    </div>
  );
}
