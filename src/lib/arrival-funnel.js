// The Results tabs' arrivals funnel, as rows: one per source and campaign, with
// how many arrived on the code link, started, and completed. See
// components/ArrivalFunnel.

const untagged = (row) => (row.source || row.campaign ? 0 : 1);

export const funnelKey = (source, campaign) => `${source || ""}\u0000${campaign || ""}`;

export function funnelRows(arrivals, respondents) {
  const rows = new Map();
  const row = (source, campaign) => {
    const k = funnelKey(source, campaign);
    if (!rows.has(k)) rows.set(k, { source: source || "", campaign: campaign || "", arrived: 0, started: 0, completed: 0 });
    return rows.get(k);
  };
  for (const a of arrivals) row(a.source, a.campaign).arrived += a.count;
  for (const r of respondents) {
    const target = row(r.source, r.campaign);
    target.started += 1;
    if (r.status === "completed") target.completed += 1;
  }
  // Busiest first, untagged last: the untagged row is a residue, not a source.
  return [...rows.values()].sort((a, b) =>
    untagged(a) - untagged(b) || b.arrived - a.arrived || b.started - a.started);
}
