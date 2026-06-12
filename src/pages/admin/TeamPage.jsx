import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export default function TeamPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const all = await base44.entities.User.list();
    setUsers(all.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)));
    setLoading(false);
  };

  const handleRoleChange = async (user, newRole) => {
    if (user.id === currentUser.id) return; // prevent self-demotion
    setUpdatingId(user.id);
    const updated = await base44.auth.updateMe
      ? await base44.entities.User.update(user.id, { role: newRole })
      : await base44.entities.User.update(user.id, { role: newRole });
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setUpdatingId(null);
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900">Team</h2>
        <p className="text-sm text-gray-400 mt-1">Manage user roles for this app.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No users found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 font-medium">Name</th>
                <th className="text-left px-6 py-3 font-medium">Email</th>
                <th className="text-left px-6 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === currentUser?.id;
                const isUpdating = updatingId === u.id;
                return (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-6 py-3 font-medium text-gray-800">
                      {u.full_name || "—"}
                      {isSelf && (
                        <span className="ml-2 text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">you</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{u.email}</td>
                    <td className="px-6 py-3">
                      {isSelf ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                          {u.role}
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={isUpdating}
                          onChange={e => handleRoleChange(u, e.target.value)}
                          className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}