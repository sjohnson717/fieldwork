import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Committing the content files to GitHub, so an edit made in the app reaches
// the repository instead of waiting to be noticed.
//
// A function rather than a fetch in the browser for the obvious reason: the
// credential. A token that can write to the repository has no business in a
// bundle every respondent downloads, and the browser could not hold one safely
// even if it were only ever shown to a super-admin.
//
// What it will write is deliberately small. The branch is fixed, the path
// pattern is fixed, and nothing else is reachable — a token with contents:write
// on this repository could otherwise be pointed at the app's own source, which
// Base44 syncs from main and would happily rebuild. So: the content branch,
// and files matching content/scales.md or content/instruments/<name>.md. Every
// other path is refused before a single call goes to GitHub.
//
// The branch is not main on purpose. Base44 syncs main and only main, and a
// wording fix should not re-sync the Builder or rebuild the app. Merging the
// branch into main is a separate, deliberate act.
//
// One commit per call, whatever the file count, because the tree API takes them
// together: two files that changed for one reason belong in one commit, and a
// half-applied pair is the state nothing here should be able to produce.

const OWNER = "sjohnson717";
const REPO = "fieldwork";
const BRANCH = "content";
const FALLBACK_BASE = "main";

// The only paths this function will write. Anchored at both ends, no "..",
// lower case and hyphens in the name — a path is the one piece of this request
// that decides what part of the repository is reachable.
const ALLOWED = /^content\/(scales\.md|resources\.md|instruments\/[a-z0-9][a-z0-9-]*\.md|library\/[a-z0-9][a-z0-9-]*\.md)$/;

const API = "https://api.github.com";

type GH = { status: number; body: any };

async function gh(token: string, path: string, init: RequestInit = {}): Promise<GH> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub refuses a request with no user agent.
      "User-Agent": "quartz-assessments-content-sync",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

const fail = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
  Response.json({ error: message, ...extra }, { status });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      return fail("Unauthorized", 403);
    }
    // Super-admin only, matching the screen this is called from. Instrument
    // content is authored content that every organization reads; a facilitator
    // picks an instrument, they do not get to rewrite the questions in it, and
    // they certainly do not get to commit to the repository.
    if (!user || user.role !== "admin") return fail("not_found", 404);

    const token = Deno.env.get("GITHUB_TOKEN");
    if (!token) {
      return fail(
        "No GITHUB_TOKEN is set for this app, so nothing can be committed. Add a fine-grained token with Contents: read and write on this repository, then try again.",
        503,
      );
    }

    const { files, message, expectedSha } = await req.json();
    if (!Array.isArray(files) || files.length === 0) return fail("files is required.");
    if (files.length > 20) return fail("Too many files in one commit.");

    for (const f of files) {
      if (!f || typeof f.path !== "string" || typeof f.text !== "string") {
        return fail("Each file needs a path and text.");
      }
      if (!ALLOWED.test(f.path)) {
        return fail(`${f.path} is not a content file. Only content/scales.md, content/resources.md, content/instruments/<name>.md and content/library/<phase>.md can be written.`);
      }
      // A file the writer produced is never empty, and an empty one would be a
      // bug upstream arriving as a deletion of somebody's content.
      if (!f.text.trim()) return fail(`${f.path} is empty. Nothing was committed.`);
    }

    // The branch, created from main the first time if it is not there yet.
    let head = await gh(token, `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    let created = false;
    if (head.status === 404) {
      const base = await gh(token, `/repos/${OWNER}/${REPO}/git/ref/heads/${FALLBACK_BASE}`);
      if (base.status !== 200) return fail(`Could not read ${FALLBACK_BASE} to create the ${BRANCH} branch (${base.status}).`, 502);
      const made = await gh(token, `/repos/${OWNER}/${REPO}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: base.body.object.sha }),
      });
      if (made.status !== 201) return fail(`Could not create the ${BRANCH} branch (${made.status}).`, 502);
      head = { status: 200, body: made.body };
      created = true;
    }
    if (head.status !== 200) return fail(`Could not read the ${BRANCH} branch (${head.status}).`, 502);

    const headSha = head.body.object.sha;

    // Both sides moved. Said as its own answer rather than as a failed write:
    // the caller compared against a commit, and something has been committed
    // since — by a person on GitHub, or by another session of this screen.
    // Overwriting it silently is the one outcome this whole arrangement exists
    // to prevent.
    if (expectedSha && expectedSha !== headSha) {
      return Response.json(
        {
          error: `The ${BRANCH} branch has moved since you compared. Compare again to see what changed, then commit.`,
          conflict: { expected: expectedSha, actual: headSha },
        },
        { status: 409 },
      );
    }

    const headCommit = await gh(token, `/repos/${OWNER}/${REPO}/git/commits/${headSha}`);
    if (headCommit.status !== 200) return fail(`Could not read the head commit (${headCommit.status}).`, 502);

    const tree = await gh(token, `/repos/${OWNER}/${REPO}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: headCommit.body.tree.sha,
        tree: files.map((f: { path: string; text: string }) => ({
          path: f.path,
          mode: "100644",
          type: "blob",
          content: f.text,
        })),
      }),
    });
    if (tree.status !== 201) return fail(`Could not build the tree (${tree.status}).`, 502, { detail: tree.body?.message });

    // Identical content produces the identical tree, so this is how a commit
    // with nothing in it is avoided without comparing the files by hand.
    if (tree.body.sha === headCommit.body.tree.sha) {
      return Response.json({ unchanged: true, branch: BRANCH, sha: headSha, created });
    }

    const commit = await gh(token, `/repos/${OWNER}/${REPO}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: String(message || "Update the instrument content from the app").slice(0, 500),
        tree: tree.body.sha,
        parents: [headSha],
      }),
    });
    if (commit.status !== 201) return fail(`Could not create the commit (${commit.status}).`, 502, { detail: commit.body?.message });

    // force stays false, so a branch that moved between the check above and
    // here is refused by GitHub rather than overwritten by this.
    const moved = await gh(token, `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.body.sha, force: false }),
    });
    if (moved.status !== 200) {
      return fail(
        `The ${BRANCH} branch moved while this was being written, so nothing was committed to it. Compare again and retry.`,
        409,
        { detail: moved.body?.message },
      );
    }

    return Response.json({
      committed: files.map((f: { path: string }) => f.path),
      branch: BRANCH,
      sha: commit.body.sha,
      url: `https://github.com/${OWNER}/${REPO}/commit/${commit.body.sha}`,
      created,
    });
  } catch (error) {
    console.error("syncContent", error);
    return Response.json({ error: (error as Error)?.message || String(error) }, { status: 500 });
  }
});
