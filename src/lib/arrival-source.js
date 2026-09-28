// Where a respondent came from, for the funnel on the Results tabs.
//
// A newsletter button, a LinkedIn post, and the website can all carry the same
// /assess?code=… link. Wix counts the clicks on its side; this counts who
// arrived, who started, and who finished, per source, so the two can be read
// against each other.
//
// The source is the link's utm_source when it has one, and the referring
// site's host when it does not. Email apps send no referrer, so a newsletter
// link without utm parameters reads as "no source". Nobody tags a link by
// hand, so the Overview tab's Access section copies tagged links ready-made:
// SHARE_CHANNELS and taggedSurveyLink below.
//
// Labels only. Nothing here identifies a person, and nothing is sent to anyone
// but this app's own backend.
//
// Kept in sessionStorage so a reload, or a code typed after the link's own
// failed, still carries what the first page load saw. Like the token, it does
// not outlive the tab.

// The places a facilitator posts a survey link. The newsletter carries the
// month as its campaign, so each issue is its own row without anyone naming
// it; the others are ongoing, and a month would only split one channel into
// many rows.
export const SHARE_CHANNELS = [
  { key: "newsletter", label: "Newsletter", medium: "email", monthly: true },
  { key: "linkedin", label: "LinkedIn", medium: "social" },
  { key: "website", label: "Website", medium: "web" },
  { key: "email", label: "Email", medium: "email" },
];

export function taggedSurveyLink(origin, code, channel, now = new Date()) {
  const params = new URLSearchParams({ code, utm_source: channel.key, utm_medium: channel.medium });
  if (channel.monthly) params.set("utm_campaign", now.toISOString().slice(0, 7));
  return `${origin}/assess?${params}`;
}

const SOURCE_KEY = "quartz.arrival.source";
const visitKey = (code) => `quartz.arrival.counted.${code}`;

const read = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private mode or storage disabled: the source still travels for this
    // render, and a reload may count the visit twice. Neither stops a survey.
  }
};

// The same trim, case, and cap the server applies to an arrival, so the
// Respondent row a person creates later lands on the same funnel row as their
// visit. "Newsletter" and "newsletter" are one source.
const label = (v) => (v || "").trim().toLowerCase().slice(0, 80);

const referrerHost = () => {
  try {
    if (!document.referrer) return "";
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    // Our own pages are not a source: arriving at the survey from the landing
    // page is still whatever brought them to the landing page.
    return host === window.location.hostname.replace(/^www\./, "") ? "" : host;
  } catch {
    return "";
  }
};

/**
 * The source this tab arrived with: { source, medium, campaign }, each a
 * string, empty when unknown. Read from the address the first time, and from
 * this tab's storage after that.
 */
export function arrivalSource() {
  const stored = read(SOURCE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fall through and read the address again.
    }
  }
  const params = new URLSearchParams(window.location.search);
  const found = {
    source: label(params.get("utm_source") || referrerHost()),
    medium: label(params.get("utm_medium")),
    campaign: label(params.get("utm_campaign")),
  };
  write(SOURCE_KEY, JSON.stringify(found));
  return found;
}

/**
 * phone, tablet, or desktop. Touch support separates a phone or tablet from a
 * laptop, and the screen's shorter side separates the two touch devices, so
 * turning a phone sideways does not make it a tablet. An iPad reports itself
 * as a Mac but still has touch points, so it lands on tablet, not desktop.
 */
export function deviceKind() {
  try {
    const shortSide = Math.min(window.screen.width, window.screen.height);
    if (navigator.maxTouchPoints > 0) return shortSide < 600 ? "phone" : "tablet";
    return "desktop";
  } catch {
    return "";
  }
}

/**
 * True the first time this tab resolves a given code, false after. A reload of
 * the link, or Back to the intro, is the same visit and should not count again.
 * Marks the visit as counted in the same step.
 */
export function isNewVisit(code) {
  const key = visitKey(code);
  if (read(key)) return false;
  write(key, "1");
  return true;
}
