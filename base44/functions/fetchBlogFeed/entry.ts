import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// The blog's RSS feed, for "New from the blog" on Settings → Resources.
//
// A function rather than a fetch in the browser because the Wix site sends no
// CORS header, so the browser refuses to hand the feed to the app. Nothing here
// writes: the page decides what is new by comparing addresses with the
// resources and skipped posts it already has, and a person attaches the
// activities before anything is saved.
//
// The feed carries the newest 20 posts, which is plenty at a post a week.

const FEED_URL = "https://www.productgrowthleaders.com/blog-feed.xml";

const decode = (s: string) =>
  s
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

const tags = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))]
    .map((m) => decode(m[1]))
    .filter(Boolean);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    const allowedRoles = ["admin", "org_admin", "facilitator"];
    if (!user || !allowedRoles.includes(user.role)) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const res = await fetch(FEED_URL, { headers: { Accept: "application/rss+xml, application/xml" } });
    if (!res.ok) {
      return Response.json({ error: `The blog feed could not be read (status ${res.status}).` }, { status: 502 });
    }
    const xml = await res.text();

    const posts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map(([, item]) => {
        const date = new Date(tag(item, "pubDate"));
        return {
          title: tag(item, "title"),
          url: tag(item, "link"),
          // The teaser written for the post. Offered as a draft note, not a
          // finished one: it sells the post rather than saying why it helps.
          description: tag(item, "description").replace(/\s+/g, " "),
          categories: tags(item, "category"),
          published: isNaN(date.getTime()) ? null : date.toISOString(),
        };
      })
      .filter((p) => p.title && p.url);

    return Response.json({ posts });
  } catch (error) {
    console.error("fetchBlogFeed", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
