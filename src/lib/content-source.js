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

import { parseInstrument, parseScales, validateInstrument, validateAcross } from "@/lib/content-format";

export const OWNER = "sjohnson717";
export const REPO = "fieldwork";
export const CONTENT_BRANCH = "content";
export const CONTENT_DIR = "content";

// Vite reads these at build time. The keys are repository paths, which is what
// everything downstream names a file by, so the bundled copy and the fetched
// copy are the same shape.
const bundled = import.meta.glob("/content/**/*.md", { query: "?raw", import: "default", eager: true });

export const bundledFiles = () =>
  Object.fromEntries(Object.entries(bundled).map(([path, text]) => [path.replace(/^\//, ""), text]));

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
  const listed = await fetchImpl(apiUrl(branch, `${CONTENT_DIR}/instruments`), {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!listed.ok) throw new Error(`Could not list ${CONTENT_DIR}/instruments on ${branch} (${listed.status}).`);
  const entries = await listed.json();
  const paths = [
    `${CONTENT_DIR}/scales.md`,
    ...entries.filter((e) => e.type === "file" && e.name.endsWith(".md")).map((e) => e.path),
  ];
  // The commit is pinned rather than the branch name, so a push landing
  // between the listing and the reads cannot produce a half-and-half set —
  // and it sidesteps the raw CDN serving a file from a few minutes ago.
  const texts = await Promise.all(paths.map(async (path) => {
    const res = await fetchImpl(rawUrl(head.sha, path));
    if (!res.ok) throw new Error(`Could not read ${path} on ${branch} (${res.status}).`);
    return [path, await res.text()];
  }));
  return { source: "branch", branch, ...head, files: Object.fromEntries(texts) };
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

// Parsed, validated, and named by file — so an error says which file it is in.
export function readContent(files) {
  const scalesText = files[`${CONTENT_DIR}/scales.md`];
  const scales = scalesText ? parseScales(scalesText) : [];
  const scaleKeys = scales.map((s) => s.id);
  const instruments = [];
  const problems = [];
  if (!scalesText) problems.push({ path: `${CONTENT_DIR}/scales.md`, errors: ["The scales file is missing."] });

  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith(`${CONTENT_DIR}/instruments/`)) continue;
    let content;
    try {
      content = parseInstrument(text);
    } catch (e) {
      problems.push({ path, errors: [`Could not be read: ${e?.message || e}`] });
      continue;
    }
    const { errors, notes } = validateInstrument(content, { scaleKeys });
    // A file with errors is not offered for applying at all. Reporting the
    // errors and leaving an Apply button beside them is an invitation to write
    // content that has already been judged wrong.
    if (errors.length) problems.push({ path, errors, name: content.name });
    else instruments.push({ path, content, notes });
  }
  instruments.sort((a, b) => (a.content.sort_order ?? 99) - (b.content.sort_order ?? 99));

  const across = validateAcross(instruments.map((i) => i.content));
  if (across.length) problems.push({ path: "content/instruments", errors: across });

  return { scales, instruments, problems };
}
