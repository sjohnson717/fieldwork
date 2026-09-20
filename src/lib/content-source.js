// Where the content files come from.
//
// Two places, in order. The content branch on GitHub is the live copy — edited
// there by hand or written back by the app — and it is fetched at apply time so
// a file committed a minute ago is the one that applies. The copy inside this
// build is the fallback, so a cold start still seeds what was running when the
// build was made, and so the screen works when GitHub is unreachable.
//
// That ordering is the point of the arrangement. The files also live on main,
// where they go stale between merges; nothing reads them from there, so a stale
// main can no longer make the app wrong — which is what the old seed could do.
//
// The branch is not main on purpose: Base44 syncs main and only main, and a
// wording fix should not re-sync the Builder or rebuild the app.



export const OWNER = "sjohnson717";
export const REPO = "fieldwork";
export const CONTENT_BRANCH = "content";
// The reading of what was fetched is pure, and lives next door so it can be
// tested without a bundler standing up the virtual module below. Both are
// re-exported here, because reading the files is what callers of this module
// came for and one directory name should not be written down twice.
import { readContent, CONTENT_DIR } from "@/lib/content-read";
export { readContent, CONTENT_DIR };

// Read at build time by the content-files plugin in vite.config.js, keyed by
// repository path — which is what everything downstream names a file by, so
// the bundled copy and the fetched copy are the same shape.
import bundled from "virtual:content-files";

export const bundledFiles = () => ({ ...bundled });

const rawUrl = (branch, path) =>
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${branch}/${path}`;

const apiUrl = (branch, path) =>
  `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(branch)}`;

// Named after the commit it came from, so the screen can say what it compared
// against and the push direction can tell "both sides changed" from "only one
// did" later on.
async function branchHead(branch, fetchImpl) {
  const res = await fetchImpl(`https://api.github.com/repos/${OWNER}/${REPO}/commits/${encodeURIComponent(branch)}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const body = await res.json();
  return { sha: body.sha, committedAt: body.commit?.committer?.date || null };
}

export async function loadFromBranch({ branch = CONTENT_BRANCH, fetchImpl = fetch } = {}) {
  const head = await branchHead(branch, fetchImpl);
  // Both directories, and a directory that is not there yet is not an error:
  // the library and the resources have no file until the app writes one, and
  // the screen has to be able to say so rather than fail to load.
  const listDir = async (dir) => {
    const res = await fetchImpl(apiUrl(branch, `${CONTENT_DIR}/${dir}`), {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Could not list ${CONTENT_DIR}/${dir} on ${branch} (${res.status}).`);
    return (await res.json()).filter((e) => e.type === "file" && e.name.endsWith(".md")).map((e) => e.path);
  };
  const [instrumentPaths, libraryPaths] = await Promise.all([listDir("instruments"), listDir("library")]);
  const paths = [
    `${CONTENT_DIR}/scales.md`, `${CONTENT_DIR}/resources.md`, `${CONTENT_DIR}/job-titles.md`,
    `${CONTENT_DIR}/activity-sets.md`, `${CONTENT_DIR}/skipped-posts.md`,
    ...instrumentPaths, ...libraryPaths,
  ];
  // The commit is pinned rather than the branch name, so a push landing
  // between the listing and the reads cannot produce a half-and-half set —
  // and it sidesteps the raw CDN serving a file from a few minutes ago.
  const texts = await Promise.all(paths.map(async (path) => {
    const res = await fetchImpl(rawUrl(head.sha, path));
    // A file that is not there yet is absent, not a failure. content/resources.md
    // does not exist until somebody commits it.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not read ${path} on ${branch} (${res.status}).`);
    return [path, await res.text()];
  }));
  return { source: "branch", branch, ...head, files: Object.fromEntries(texts.filter(Boolean)) };
}

export async function loadContent({ branch = CONTENT_BRANCH, fetchImpl = fetch, preferBranch = true } = {}) {
  if (preferBranch) {
    try {
      return await loadFromBranch({ branch, fetchImpl });
    } catch (e) {
      return {
        source: "build",
        branch: null,
        sha: null,
        files: bundledFiles(),
        // Said plainly rather than swallowed: comparing against the build is a
        // different thing from comparing against the branch, and which one
        // happened has to be on the screen.
        warning: `Could not read the ${branch} branch (${e?.message || e}). Comparing against the copy in this build instead.`,
      };
    }
  }
  return { source: "build", branch: null, sha: null, files: bundledFiles() };
}
