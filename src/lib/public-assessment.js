import { base44 } from '@/api/base44Client';

// Token lookups for the unauthenticated flows go through the publicAssessment
// backend function rather than listing every assessment and matching
// client-side. See base44/functions/publicAssessment/entry.ts.
//
// Returns null when the token doesn't resolve, so callers can show their own
// "link not valid" message. Any other failure throws.
const resolve = async (mode, token) => {
  try {
    const res = await base44.functions.invoke('publicAssessment', { mode, token });
    return res?.data ?? null;
  } catch (e) {
    if (e?.response?.status === 404 || e?.status === 404) return null;
    throw e;
  }
};

// Admin-side counterpart: respondents for one assessment, gated server-side on
// whether the caller may see that assessment. See
// base44/functions/listRespondents/entry.ts.
export const listRespondents = async (assessmentId) => {
  const res = await base44.functions.invoke('listRespondents', { assessmentId });
  return res?.data?.respondents ?? [];
};

// A respondent's own answers, written server-side against their token.
//
// Not entity writes from the browser: Response.rls.update permits only admin,
// org_admin and facilitator, and a respondent is none of those — so the second
// save of any page (Back and forward, a resumed link, Revise) was refused while
// the first, a create, went through. See base44/functions/saveResponses.
//
// `answers` is [{ activity_id, ...fields }]; the function upserts by activity,
// so no row ids travel to the browser or back. `complete` marks the respondent
// finished in the same call as their last page of answers.
export const saveRespondentAnswers = async (token, answers, { complete = false } = {}) => {
  const res = await base44.functions.invoke('saveResponses', { token, answers, complete });
  return res?.data ?? null;
};

export const getAssessmentByCode = (code) => resolve('code', code);
export const getRespondentSession = (token) => resolve('respondent', token);
export const getTeamLeaderView = (teamToken) => resolve('team', teamToken);
export const getBuyerReport = (buyerToken) => resolve('buyer', buyerToken);
