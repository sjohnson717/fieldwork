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

// The same three steps by device. Visits counted before devices were, and
// respondents who started before then, land on "unknown" rather than being
// guessed at, and the row is dropped when it is empty.
const DEVICE_ORDER = ["phone", "tablet", "desktop", "unknown"];

export function deviceRows(arrivalDevices, respondents) {
  const rows = Object.fromEntries(DEVICE_ORDER.map((d) => [d, { device: d, arrived: 0, started: 0, completed: 0 }]));
  for (const [device, count] of Object.entries(arrivalDevices || {})) {
    (rows[device] || rows.unknown).arrived += count;
  }
  for (const r of respondents) {
    const row = rows[r.device] || rows.unknown;
    row.started += 1;
    if (r.status === "completed") row.completed += 1;
  }
  return DEVICE_ORDER.map((d) => rows[d]).filter((r) => r.arrived || r.started);
}

// The median minutes from entering a name to first finishing, over everyone
// who has finished. First finishing, because completed_date moves with every
// revision; respondents who finished before that was recorded fall back to it.
// The median rather than the mean: one person who left the tab open overnight
// would drag a mean into hours.
export function medianMinutes(respondents) {
  const spans = respondents
    .filter((r) => r.status === "completed")
    .map((r) => (Date.parse(r.first_completed_date || r.completed_date) - Date.parse(r.created_date)) / 60000)
    .filter((m) => Number.isFinite(m) && m >= 0)
    .sort((a, b) => a - b);
  if (!spans.length) return null;
  const mid = Math.floor(spans.length / 2);
  const minutes = spans.length % 2 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2;
  return { minutes: Math.round(minutes), count: spans.length };
}
