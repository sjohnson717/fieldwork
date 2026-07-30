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

export const getAssessmentByCode = (code) => resolve('code', code);
export const getRespondentSession = (token) => resolve('respondent', token);
export const getTeamLeaderView = (teamToken) => resolve('team', teamToken);
export const getBuyerReport = (buyerToken) => resolve('buyer', buyerToken);
