# Entity RLS notes

The `.jsonc` files in this folder must stay **strict JSON with no comments**.
Despite the extension, Base44 stores and regenerates them as plain JSON, so any
comment risks the entity sync and would be stripped on the next round-trip
anyway. This file is where the reasoning lives instead.

## The `data.` prefix rule

Custom fields must be addressed with a `data.` prefix in RLS rules. Only
built-ins sit at the root: `id`, `created_by_id`, `created_date`, `updated_date`.

```jsonc
{ "data.collaborator_ids": "{{user.id}}" }   // correct
{ "collaborator_ids": "{{user.id}}" }        // silently never matches
```

A missing prefix does not raise an error — the clause just never matches, so the
rule fails closed and quietly removes access. Available template variables are
`{{user.id}}`, `{{user.email}}`, `{{user.role}}`, and `{{user.data.<field>}}`;
a custom field on the *user* (such as `org_id`) is `{{user.data.org_id}}`.

Verified supported: `$and`, `$or`, `$in`, `$nin`, and array containment
(matching a scalar against an array field).

## Why each non-obvious rule is the way it is

**Assessment.read is `{}` (open).** The respondent (`/assess`), buyer report
(`/report/:token`) and team leader (`/team/:token`) flows are unauthenticated and
find their assessment by listing all assessments and matching a token
client-side. Narrowing this read rule breaks all three. They have to move behind
service-role functions first.

**Assessment.update is per-assessment, not per-role.** It grants the creator,
anyone in `collaborator_ids`, and super-admin. It previously granted any
`facilitator` or `org_admin` unconditionally, which let any facilitator edit
every assessment in the system including other organizations' client data.
Because org admins are not covered by role here, `AdminPage` seeds an
organization's admins into `collaborator_ids` when an assessment is created.

**User.update excludes `org_admin` deliberately.** It previously allowed any org
admin blanket write access to the User entity, which meant they could promote
themselves to `admin` or move users between organizations. Org admins manage
their own people through the `updateTeamMember` function, which enforces the org
boundary and the set of grantable roles server-side.

**Invitation.read needs `data.email`.** Without the prefix an invited user cannot
read their own invitation, and `reconcileOrgId` in `src/lib/AuthContext.jsx`
silently fails to stamp their `org_id` — leaving accounts stranded with no
organization even though their invitation named one.

**The built-in User entity ignores custom RLS on list operations.** Confirmed by
Base44 support. A direct `entities.User.list()` only ever returns the caller's
own record regardless of the read rule, which is why `listUsers` exists.

## Platform roles vs application roles

Base44's `users.inviteUser(email, role)` only accepts its own **platform** roles,
`user` and `admin`. Passing an application role is rejected:

```
Invalid role: "facilitator". Role must be either "user" or "admin".
```

So the two are kept separate. Everyone is invited at the platform level
(`admin` maps through, everything else becomes `user`), and the intended
application role travels on the `Invitation` record. The `acceptInvitation`
function applies it the first time that person signs in, matched to their own
authenticated email, and marks the invitation `accepted` so it is consumed
exactly once — otherwise a stale pending invitation would re-promote someone
after an admin demoted them.

Role assignment is deliberately server-side — see the next section for why
self-update is no longer permitted at all.

## Why User.update is super-admin only

Measured, not assumed. Base44 protects the `role` field itself: an attempt by a
non-admin to change their own role — sideways or upward — is rejected with
*"Only platform users can update user roles"*, whatever the RLS rule says.

`org_id` gets no such protection. It is an ordinary custom field, so while
`User.update` permitted self-update (`{"id": "{{user.id}}"}`), any user could
rewrite their own organization in a single API call, then read and manage
another tenant's data. That defeats org scoping entirely, including the
`listUsers` and `updateTeamMember` functions, which both derive authority from
the caller's stored `org_id`.

`User.update` is therefore super-admin only. Nothing in the app needs a user to
write to their own record; `acceptInvitation` and `updateTeamMember` both use
the service role, which bypasses RLS.

**Any org boundary keyed on `org_id` is only as strong as this rule.** If a
self-service profile page is ever added, do not restore the blanket
self-update clause — use per-field RLS inside `properties` so `org_id` stays
protected.

## The no-org bucket

Absent/null `org_id` is treated as its own shared bucket by `sameOrg()` in
`src/lib/roles.js`, so records predating Organizations keep working. Note this
means *all* null-org users share a tenant — assign real orgs before relying on
org scoping for isolation.
