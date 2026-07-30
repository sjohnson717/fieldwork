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

**Assessment.read is still `{}` (open), but no longer needs to be.** The three
unauthenticated flows — `/assess`, `/report/:token`, `/team/:token` — used to
find their assessment by listing every assessment and matching a token
client-side, which is why the rule had to stay open. They now resolve tokens
through the `publicAssessment` function using the service role, so this rule can
be narrowed (see the phased plan below). Do not narrow it without first checking
that nothing else reads Assessment anonymously.

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

## The built-in User entity ignores entity-level RLS

This one is measured, not assumed, and it is the opposite of what the rules
imply. On `User` specifically:

| Protection | Enforced? |
|---|---|
| Entity-level `rls.update` | **No** |
| Entity-level `rls.read` on list operations | **No** (confirmed by Base44 support) |
| Per-field `properties.<field>.rls` | **Yes** |
| Base44's own rule on the `role` field | **Yes**, always |

Setting `rls.update` to super-admin only did *not* stop a non-admin from
rewriting their own record — the rule went live and the write still landed.
Only the per-field rule on `org_id` actually blocked it:

```
You're not allowed to modify the following fields: data.org_id
```

`role` needs no rule of ours; Base44 rejects any non-admin attempt to change it
with *"Only platform users can update user roles"*.

**So `org_id`'s protection is the per-field rule inside `properties`, not the
entity-level one.** Do not remove it. Every org boundary in the app rests on it:
`listUsers` and `updateTeamMember` both derive authority from the caller's
stored `org_id`, so a user who could rewrite that field could read and manage
another tenant's data — and `updateTeamMember` writes as service role, which
bypasses even Base44's own role protection.

The entity-level `update` rule is kept as defence in depth, but it is not what
is doing the work. Treat any *new* custom field on `User` as unprotected until
it has a per-field rule, and verify with a probe rather than assuming.

## Public token flows

`/assess`, `/team/:token` and `/report/:token` are unauthenticated by design —
the token in the URL *is* the credential, so buyers and team leaders never need
an account. That only holds if the tokens cannot be enumerated, and originally
they could: every one of those pages listed all assessments client-side, so
anyone could read `access_code`, `team_token` and `buyer_token` off the records.

All three now go through `publicAssessment`, which resolves the token with the
service role and returns only the fields that flow renders. Redaction is part of
the point: a team leader never receives the buyer's report token, a buyer never
receives the access code, and a respondent receives no tokens at all. Failures
return a uniform `not_found` so a caller cannot probe which tokens exist.

Respondents are **self-registering**: the team leader broadcasts one
`/assess?code=…` link, and a Respondent row is created when each person enters
their name and job title. Nobody is pre-added, so there is no "invited" state —
a row exists only once someone has actually signed in. "In progress" is derived
from whether they have answered anything, not stored, so it cannot drift out of
step with the responses.

Token strength matters here. `buyer_token`, `team_token` and the per-respondent
token are `crypto.randomUUID()`. `access_code` is deliberately short so it can
be read aloud to a room — treat it as a convenience credential, not a secret.

## The no-org bucket

Absent/null `org_id` is treated as its own shared bucket by `sameOrg()` in
`src/lib/roles.js`, so records predating Organizations keep working. Note this
means *all* null-org users share a tenant — assign real orgs before relying on
org scoping for isolation.
