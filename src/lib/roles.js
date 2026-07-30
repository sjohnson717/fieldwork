// Stored role values are kept as-is ("admin", "org_admin", "facilitator",
// "user") because Base44 treats "admin"/"user" as platform roles and every RLS
// rule keys off them. Only the display labels differ.
//
//   admin       — Super Admin. Every org, every assessment.
//   org_admin   — Organization Admin. Their own org's assessments and people.
//   facilitator — Invited per assessment via Assessment.collaborator_ids.
//   user        — Base44's default role on signup. Not assignable in the UI;
//                 it means "no admin access" and is also what we reset a
//                 revoked account to.

export const ROLE_LABELS = {
  admin: "Super Admin",
  org_admin: "Organization Admin",
  facilitator: "Facilitator",
  user: "No access",
};

export const roleLabel = (role) => ROLE_LABELS[role] || role;

// Roles each actor is allowed to hand out. "user" is deliberately absent —
// it's the no-access default, not something you grant.
export const assignableRoles = (actorRole) =>
  actorRole === "admin"
    ? ["facilitator", "org_admin", "admin"]
    : ["facilitator", "org_admin"];

export const NO_ACCESS_ROLE = "user";

export const isSuperAdmin = (user) => user?.role === "admin";
export const isOrgAdmin = (user) => user?.role === "org_admin";
export const canAccessAdmin = (user) =>
  ["admin", "org_admin", "facilitator"].includes(user?.role);

// Absent/null org_id is its own shared "no org" bucket, so accounts and
// assessments created before Organizations existed keep working.
export const sameOrg = (a, b) => (a || null) === (b || null);
