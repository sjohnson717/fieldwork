# Entity RLS notes

The `.jsonc` files in this folder must stay **strict JSON with no comments**.
Despite the extension, Base44 stores and regenerates them as plain JSON, so any
comment risks the entity sync and would be stripped on the next round-trip
anyway. This file is where the reasoning lives instead.

**Every entity is one `.jsonc` file, and that file is the schema.** Base44
re-applies all of them on publish. Adding a field through the platform API
works immediately and then disappears at the next publish, because the publish
overwrites the schema with whatever the file says — and the write path then
discards the missing field silently, with `create` returning a record where the
column simply isn't there. If a field vanishes with no error, this is why.

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

**Assessment.read mirrors `listRespondents`'s own check, clause for clause.**
The three unauthenticated flows — `/assess`, `/report/:token`, `/team/:token` —
used to find their assessment by listing every assessment and matching a token
client-side, which is why the rule stayed open long after it should have. They
now resolve tokens through `publicAssessment` as service role, so the rule was
narrowed to super-admin, creator, `collaborator_ids` membership, or an
`org_admin` whose `org_id` matches.

Note the org clause is deliberately `$and`-ed with `role: org_admin` rather
than standing alone. An org match on its own would also admit a plain `user` —
and revoking someone resets their role to `user` while leaving `org_id` in
place, so a revoked account would have kept reading its former organisation's
assessments.

`AdminPage` still filters the same way client-side. That is now redundant, and
worth keeping: with both layers a mistake in either one fails closed.

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

One derived field travels with the assessment: `org_name`, the firm the printed
report names. It is resolved here because these pages are unauthenticated and
cannot read `Organization` for themselves, and it looks in two places —
`Assessment.org_id`, then the creator's own `org_id`, since assessments
predating organizations carry none. A name, never an id: attribution rather than
a handle onto anything, so it widens nothing a token already exposes. It returns
null rather than throwing, because a footer that cannot name the firm is a line
short while a lookup that throws is a broken deliverable.

Respondents are **self-registering**: the team leader broadcasts one
`/assess?code=…` link, and a Respondent row is created when each person enters
their name and job title. Nobody is pre-added, so there is no "invited" state —
a row exists only once someone has actually signed in. "In progress" is derived
from whether they have answered anything, not stored, so it cannot drift out of
step with the responses.

Token strength matters here. `buyer_token`, `team_token` and the per-respondent
token are `crypto.randomUUID()`. `access_code` is deliberately short so it can
be read aloud to a room — treat it as a convenience credential, not a secret.

## Why deleting an assessment goes through a function

The child entities — `Response`, `Respondent`, `DiscussionNote`,
`TeamLeaderFlag` — all permit deletion by role, including `facilitator`.
`Assessment.delete` permits only its creator or a super-admin. Those rules are
individually defensible and collectively wrong: the cascade used to run in the
browser, children first, so a facilitator was *permitted* to destroy every
respondent and response in an engagement and then denied the final step,
leaving an empty assessment and an error alert.

`deleteAssessment` checks authority once — creator or super-admin, matching
`Assessment.delete` — and then cascades as service role. `AdminPage` also hides
the button from anyone who would fail that check, so the UI and the rule agree.

The general lesson: when one user action spans several entities, the permission
that matters is the *whole action's*, and RLS can only answer one entity at a
time. Put the check in a function before the first write.

**The cascade includes custom activities.** An `Activity` with an
`assessment_id` belongs to that one assessment and means nothing without it, but
until August 2026 the cascade deleted the four obvious children and left those
rows behind. The leak was invisible from the app — `LibraryPage` lists only
rows with no `assessment_id`, and every other reader looks activities up *from*
an assessment that no longer exists — so it surfaced only as stray records whose
`assessment_id` pointed at nothing. Eight such orphans predate the fix and are
still there; nothing reads them, and there is no UI that would.

The lesson generalises past this function: "everything hanging off it" has to be
enumerated from the schema, not from memory. Any new entity carrying an
`assessment_id` needs adding to this cascade, and nothing enforces that.

**Failures name their stage.** Each step is wrapped so the thrown message says
which entity and which batch failed, because the alternative — one uniform 500 —
tells you nothing about how far a half-finished delete got. Note the message
only reaches the user if the caller reads the *response body*: the SDK rejects
with an axios error whose `message` is always `"Request failed with status code
500"`, so `e.message` silently discards it. Use `functionErrorMessage()` in
`src/lib/utils.js` for any function call whose failure is shown to someone.

## Deleting a library activity is the app's most dangerous delete

`getAssignedActivities()` in `src/lib/activities.js` resolves an assessment's
`activity_ids` against the *live* `Activity` rows. So deleting a library activity
does not leave assessments holding their own copy of anything, which is what the
Library's confirmation dialog used to claim. It removes that question from every
assessment referencing it at once — including ones in flight, and ones already
submitted, whose `Response` rows keep an `activity_id` pointing at nothing and
whose report lines simply stop appearing. Until August 2026 this was a bare
`Activity.delete()` in the browser whose only failure handling was
`console.error`.

`deleteLibraryActivity` refuses while any assessment, activity set, response,
discussion note or team-leader flag references the activity, and points at the
`active` flag instead — deactivating keeps it out of new assessments and leaves
existing data whole, which is what "delete" almost always meant here.
`listLibraryActivityUsage` supplies the counts so the tab shows *In use* rather
than a Delete that can only fail. It scans `Response` as service role, which no
browser call should attempt: it is the largest table in the system, and a count
that came back short would put a Delete on a question people have answered.

**Resources are the one thing cleaned rather than blocked on.**
`Resource.activity_ids` points *outwards* — "here is some reading for that
activity" — so those rows are updated to drop the id. Refusing on them would
block a delete over a link the operator cannot see from the Activities tab.

**An empty `activity_ids` is no longer proof a resource is dead.** It used to
be: a resource attached to nothing could never appear on a report, and the
Library tab says so on the row. `Resource.fallback` breaks that — a resource
carrying the flag is offered whenever a report's shortlist comes to one or two
items, whatever was recommended, and the ones worth flagging are exactly the
general ones that belong to no single activity. So the cleanup above can strip a
fallback resource's last id and leave it working, which is correct and worth
knowing before anything starts treating unattached rows as orphans. The tab
prints a different sentence on those rows for the same reason.

**The other three Library tabs need no reference check, for reasons worth
stating.** Nothing anywhere stores an `ActivitySet` id: creating an assessment
copies the set's `activity_ids` onto the assessment, so a set is read once and
never consulted again. Nothing stores a `Resource` id either; reports resolve
resources *from* the activity. And `JobTitle` is referenced by **name** —
`Assessment.roles`, `Activity.preferred_owner` and `Respondent.title` all hold
the text — so deleting the row removes it from the pickers and changes nothing
that already names it. It is a controlled vocabulary, not the owner of the data.
All three did, however, swallow their errors into `console.error`, which made a
refused delete look exactly like one that worked until the page was reloaded.

## Deleting an organization or an account refuses rather than cascades

`deleteAssessment` cascades because its children are meaningless without it. The
two admin-list deletes added in August 2026 — `deleteOrganization` and
`deleteTeamMember` — do the opposite: they read what still references the row
and refuse if anything does. An assessment is not meaningless without its
organization, and neither is somebody else's engagement without the account that
happens to have created it.

**Nothing enforces these references.** `User.org_id`, `Assessment.org_id`,
`Invitation.org_id`, `Assessment.created_by_id` and `Assessment.collaborator_ids`
are plain strings holding ids. Delete the row they name and they keep the id: an
org name renders as `—`, an org admin's own assessment stops matching the org
condition that let them see it, an invitation assigns a new joiner to a ghost,
and an assessment whose `created_by_id` points at nothing can only ever be
deleted by a super-admin. So the check is the function's whole reason to exist —
`Organization.delete` is already permitted from the browser by RLS.

**Both refusals name every blocker at once**, not the first one found. Told one
at a time, an operator clears it, clicks again, and is refused for the next.

**`deleteTeamMember` only touches `user` (No access) rows**, which is what makes
it safe to be blunt: revoking is the reversible step, and it already showed the
operator what was being taken away. `User.jsonc` sets `"delete": null`, so the
service role is the only path that can do this at all — and unlike `User`'s
*read* rule, which the platform ignores for list operations, the delete does go
through as service role. Verified against the live app in August 2026 by
deleting a real no-access row. It is also super-admin
only — revoking clears `org_id`, so a no-access row is never inside any
organization for an org admin to be scoped to.

**It does not delete the login.** Base44 owns the auth account; this deletes the
application's record. Signing in again recreates a row on the default `user`
role — no access to anything, which is the state that was deleted, so the
outcome is a re-created row rather than a re-created problem. The dialog says
so, because a delete the other party can undo is not what an operator assumes.

## Why Respondent reads go through a function

`Respondent` holds team members' names and job titles. Together with
`Assessment.company_name` that is the data one consultant must not see from
another's engagement, so both need scoping.

`Assessment` can be scoped with RLS directly — super-admin, or `org_id` match,
or membership of `collaborator_ids`, all of which RLS can express.

`Respondent` cannot. The real rule is "may this user see the *parent
assessment*?", and RLS cannot join. Denormalising `org_id` onto Respondent
would answer the wrong question: a facilitator invited to a single assessment
in another consultant's organisation is exactly the case the role model exists
to support, and an org-scoped rule would deny them. Denormalising
`collaborator_ids` as well would go stale whenever collaborators change.

So `listRespondents` performs the parent-assessment check server-side, mirroring
Assessment's own rules, and reads as service role. The public flows get theirs
from `publicAssessment` the same way. Nothing reads `Respondent` directly from
the client any more, which is what allowed its read rule to be narrowed to
super-admin only.

`create` and `update` stay open, because `/assess` is unauthenticated and each
respondent registers themselves. The open question was whether Base44 applies
the read rule to the record a `create` or `update` returns — the `/assess`
page uses that returned record, so if it did, self-registration would break
for everyone who is not a super-admin.

**Measured on 2026-07-30: it does not.** With `read` closed to super-admin only,
an anonymous respondent still registered and answered normally. So a write rule
is what governs a write's return value, not the read rule. Still worth walking
one respondent through `/assess?code=…` after any change here, because a green
build proves nothing about RLS.

## Two assessment types on one entity

`Assessment.assessment_type` is `team_gap` or `personal`, and `Response` carries
both sets of answer fields. Absent means `team_gap`, which is what every record
predating the field is — nothing was backfilled, and nothing needs to be.

Not backfilling is cheap on the write side and a standing trap on the read
side. `team_gap` is the value the schema *means* by an empty column and never
the value stored in one, so `assessment_type === "team_gap"` is false for
precisely the oldest records — they fall to the else branch and take the
personal path. Read it as `=== "personal"` and let everything else be team, or
normalise once before branching. Adding the sidebar's `Team` badge was the
first place that wanted the positive test for team gap, and the obvious
`=== "team_gap"` would have left exactly the oldest assessments unbadged — the
same silent gap the badge existed to close.

The name is `assessment_type` rather than `type` purely to avoid reading like
JSON Schema's own keyword. That is a preference, not a fix — see below for what
was actually wrong.

## The duplicate `.json` files, and why they're gone

Until August 2026 this folder held a second file for five of the entities —
`Assessment.json` beside `Assessment.jsonc`, and the same for Activity,
DiscussionNote, Respondent and Response. They were leftovers from before the
format settled, and nothing read them. They have been deleted.

They were worth deleting rather than ignoring, because they read exactly like
the schema and are not. Adding `assessment_type` to `Assessment.json` had no
effect at all, which cost several rounds of debugging: the field was added
through the platform API, worked, and then vanished at the next publish when
the schema was re-applied from the `.jsonc`. The `.json` copy had meanwhile
drifted far enough to be missing `activity_ids`, `team_token`, `tagline` and
`org_id`, and it carried no `rls` block whatsoever.

That missing `rls` is also the answer to the folklore around these files. The
story was that deleting the `.json` files broke something in June 2026. The
history says otherwise: `de16adf` "removed jsonc files" at 22:38 on 10 June,
`c4b71fd` "reverted to jsonc files" at 22:40. It was the **`.jsonc`** files
that were deleted, and the breakage was immediate and total — with only the
`.json` copies left, every entity was re-applied with no RLS rules at all.

So the two file types were never interchangeable, and the surviving `.jsonc`
files are the ones that always mattered.

A second entity was the obvious alternative and would have been worse. The two
types share the activity library, respondent self-registration, the access code,
the token flows and the whole `/assess` journey; only the questions differ. A
parallel `PersonalResponse` would have meant a second set of RLS rules to keep
in step with this one, a second branch in `publicAssessment`, and a second
cascade in `deleteAssessment` that would fail closed the day someone forgot it.

The cost of one entity is that a Response has fields it never uses. The
`/assess` page writes only the fields its type asks about, so a type change on
an assessment that already has responses cannot silently blank the other half — though nothing
offers to change type, and the create form deliberately doesn't let you.

**`parent_assessment_id` is optional in both directions.** It links a personal
assessment to a team gap assessment so the Results tab can cross capability
against importance. RLS cannot enforce a join here any more than it can for
Respondent, and it doesn't need to: a facilitator invited to the personal
assessment but not the team one simply cannot read the parent, and
`PersonalResults` catches that and drops the cross-analysis rather than the
page. Failing to a narrower report is the right failure.

The pairing also drives the team leader dashboard, because the common setup is
that the leaders answer the gap analysis while their team answers the personal
one. `publicAssessment`'s `team` mode follows the link in both directions and
returns the sibling's roster alongside its own, so one dashboard link covers
both. What it returns for the sibling is deliberately thinner than for the
primary: title, status, access code and roster statuses, but **no
per-respondent tokens**. A respondent token is a resume link that reopens and
edits that person's answers, and a personal assessment is one individual's
account of their own skills — a leader needs to see that it arrived, not to be
able to rewrite it. The primary roster still carries tokens, unchanged, because
handing out those links is what that page is for.

## Tags are flat on purpose

`Assessment.tag_ids` groups assessments — a client, a cohort, a support group,
people you know. Many per assessment, no hierarchy, no ordering.

The design considered and rejected was a `Client → Engagement → Assessment`
hierarchy, on the reasoning that an engagement is really several instruments
(a VP survey, a director deep dive, the team's personal assessments) run for
one company, with a refresh a year later. That is a fair description of the
common case and a bad description of the others. Not every group is a company:
a cohort of individuals from different employers weighing a career move is a
real engagement with no client to hang it off, and forcing it to be a fake
client is how a data model starts lying about the business.

The hierarchy would also only have earned its keep by inferring things — which
gap analysis a personal assessment crosses against, say. The facilitator
already knows that, and `parent_assessment_id` states it explicitly. A
structure that saves one dropdown at the cost of not fitting the third
engagement is a bad trade.

**Tags are records, not strings, and that is the whole point.** `company_name`
is free text and has always been able to split "Alert Media" from "AlertMedia"
silently, which is exactly what a grouping mechanism must not do. The picker
offers a create option only when no existing tag matches, so a duplicate takes
deliberate effort.

Deleting a tag leaves its id behind on any assessment referencing it. That is
tolerated rather than cascaded: the UI resolves ids against the tags it can
read and drops the ones it can't, so a stale id renders as nothing. It also
means a tag whose *read* rule excludes you is indistinguishable from a deleted
one, which is the correct behaviour for a grouping that carries client names.

**Which is why the Tags settings page only deletes unused ones.** That tolerance
is what makes a bad delete quiet: the grouping vanishes from every assessment
carrying it, the chips simply stop rendering, and nothing anywhere says it ever
existed. `deleteTag` refuses while any assessment references the tag, and
`listTags` supplies the usage counts the page shows.

**Both count as service role, across assessments the caller cannot read.** This
is the point of the pair existing rather than the page calling `Tag.list()` and
counting for itself. `Assessment`'s read rule scopes a facilitator to their own
engagements, so a browser-side count of a tag used only by another consultant's
client comes back zero — and zero is exactly the number that offers a Delete
button. The count is a number and never a list of titles: which engagements use
a grouping is another organization's business, and the page is reachable by every
org admin.

Removing a tag from an assessment (the `×` in `TagPicker`) writes to
`Assessment.tag_ids` and leaves the `Tag` alone, which is why the picker's list
only ever grew before this page existed. The two actions live in different
places on purpose — they are different sizes of destructive.

Tags are org-scoped, and their read rule is deliberately looser than
Assessment's — any facilitator in the org can read them, where assessments need
per-record collaborator membership. The picker cannot work otherwise, and a tag
name is a far smaller disclosure than an assessment's contents. Note this does
mean tag names leak client names across an organization's facilitators; that is
the intended trade, not an oversight.

## The no-org bucket

Absent/null `org_id` is treated as its own shared bucket by `sameOrg()` in
`src/lib/roles.js`, so records predating Organizations keep working. Note this
means *all* null-org users share a tenant — assign real orgs before relying on
org scoping for isolation.
