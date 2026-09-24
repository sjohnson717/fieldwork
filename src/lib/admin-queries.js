import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { listRespondents } from "@/lib/public-assessment";
import { loadInstrument } from "@/lib/instruments";

// The admin's reads of one assessment, cached by React Query.
//
// Every tab used to load its own copy on mount, so going Results → Overview →
// Results, or from one assessment to another and back, fetched the same rows
// again from scratch, and Base44 spikes to several seconds on any call at
// random. Cached here, a tab opened before shows what it had at once and
// refreshes behind it.
//
// Nothing is trusted to stay fresh. staleTime is left at zero, so every mount
// still refetches: a facilitator watching answers arrive sees them on the next
// visit to Results exactly as before, only without the spinner in between.
//
// The keys are the contract. A write that changes one of these reads updates
// or invalidates its key, which is what `useAdminCache` below is for; a key
// nobody invalidates is only ever as stale as the next time a tab opens.

export const adminKeys = {
  // Keyed on what decides the list, not only the assessment: activity_ids
  // changes on the Activities tab, and the instrument decides library or own
  // questions. Custom activities are edited in place, so that tab invalidates
  // the assessment's prefix after a write as well.
  activities: (a) => ["assigned-activities", a.id, a.instrument_id || null, (a.activity_ids || []).join(",")],
  respondents: (assessmentId) => ["respondents", assessmentId],
  responses: (assessmentId) => ["responses", assessmentId],
  instrument: (a) => ["instrument", a.id, a.instrument_id || null, a.assessment_type || null],
  notes: (assessmentId) => ["discussion-notes", assessmentId],
  assessment: (assessmentId) => ["assessment", assessmentId],
};

const EMPTY = [];

// Each hook returns its data, or an empty list while it loads or if it fails.
// That is what the tabs did before on a failure, which was log and render
// empty, and it spares every caller a guard.
const listQuery = (key, fn, enabled = true) => ({
  queryKey: key,
  queryFn: async () => {
    try {
      return await fn();
    } catch (e) {
      console.error(`Failed to load ${key[0]}`, e);
      throw e;
    }
  },
  enabled,
});

export function useAssignedActivities(assessment) {
  const q = useQuery(listQuery(adminKeys.activities(assessment), () => getAssignedActivities(assessment)));
  return { ...q, data: q.data || EMPTY };
}

// Respondent names come from a backend function, not a direct read: the
// entity's RLS cannot express "only for assessments you may see".
export function useRespondents(assessmentId) {
  const q = useQuery(listQuery(adminKeys.respondents(assessmentId), () => listRespondents(assessmentId), !!assessmentId));
  return { ...q, data: q.data || EMPTY };
}

export function useResponses(assessmentId) {
  const q = useQuery(listQuery(
    adminKeys.responses(assessmentId),
    () => base44.entities.Response.filter({ assessment_id: assessmentId }),
    !!assessmentId,
  ));
  return { ...q, data: q.data || EMPTY };
}

// Null rather than an empty list: no instrument is an answer, and callers
// branch on it.
export function useInstrument(assessment) {
  return useQuery(listQuery(adminKeys.instrument(assessment), () => loadInstrument(assessment)));
}

export function useDiscussionNotes(assessmentId) {
  const q = useQuery(listQuery(
    adminKeys.notes(assessmentId),
    () => base44.entities.DiscussionNote.filter({ assessment_id: assessmentId }),
    !!assessmentId,
  ));
  return { ...q, data: q.data || EMPTY };
}

// Optional: a facilitator can be invited to a personal assessment without being
// invited to the team one it links to, so a refusal here is expected and drops
// the cross-analysis rather than the page.
export function useLinkedAssessment(assessmentId) {
  return useQuery({
    queryKey: adminKeys.assessment(assessmentId),
    queryFn: () => base44.entities.Assessment.get(assessmentId),
    enabled: !!assessmentId,
    retry: false,
  });
}

// The writes the tabs make to data these hooks hold, applied to the cache so
// every tab that reads it agrees at once rather than on its next refetch.
export function useAdminCache() {
  const qc = useQueryClient();
  return {
    // Answers first, then the person, the same order the server delete runs
    // in. Dropping only the person left their answers in the team's averages
    // until the page was reloaded.
    removeRespondent(assessmentId, respondentId) {
      qc.setQueryData(adminKeys.responses(assessmentId), (rows) => (rows || []).filter((r) => r.respondent_id !== respondentId));
      qc.setQueryData(adminKeys.respondents(assessmentId), (rows) => (rows || []).filter((r) => r.id !== respondentId));
    },
    patchRespondent(assessmentId, respondentId, patch) {
      qc.setQueryData(adminKeys.respondents(assessmentId), (rows) =>
        (rows || []).map((r) => (r.id === respondentId ? { ...r, ...patch } : r)));
    },
    // Drops what the cache holds for an assessment, so the next tab to open
    // loads it fresh behind a spinner rather than showing the old rows first.
    // For writes that change what Results counts: demo data, and an
    // assessment's own custom activities. Wording edits elsewhere are left to
    // the refetch every mount already does.
    forgetAssessment(assessmentId) {
      for (const prefix of ["assigned-activities", "respondents", "responses", "discussion-notes", "instrument"]) {
        qc.removeQueries({ queryKey: [prefix, assessmentId] });
      }
    },
    // An assessment's own custom activities, added, edited, or deleted on the
    // Activities tab. The list's key follows activity_ids, but a custom row is
    // matched by its assessment_id, so nothing else would notice.
    forgetActivities(assessmentId) {
      qc.removeQueries({ queryKey: ["assigned-activities", assessmentId] });
    },
    // Decisions written on a Discussion tab, which the instrument Results tab
    // reports.
    forgetNotes(assessmentId) {
      qc.removeQueries({ queryKey: adminKeys.notes(assessmentId) });
    },
  };
}
