// Addresses are compared loosely: the feed and a hand-typed resource can differ
// by scheme, "www.", a trailing slash, or a tracking query. And by the path in
// front of the slug: Wix shows one article at /post/<slug> in the feed and at
// /reading/<slug> on the site, and resources were added under both. So the
// key is the site plus the last segment.
export const sameAddress = (url) => {
  const parts = String(url || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .split("/");
  return parts.length > 1 ? `${parts[0]}/${parts[parts.length - 1]}` : parts[0];
};
