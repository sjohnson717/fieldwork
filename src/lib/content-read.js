import {
  parseInstrument, parseScales, validateInstrument, validateAcross,
  parseLibrary, parseResources, validateLibrary, validateResources, FACETS,
  parseJobTitles, validateJobTitles,
  parseActivitySets, validateActivitySets,
  parseSkippedPosts, validateSkippedPosts,
} from "@/lib/content-format";
import { sameAddress } from "@/lib/same-address";

export const CONTENT_DIR = "content";

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

  // The library, a file per phase. Absent until somebody commits it, and absent
  // is reported as absent: an empty set of files read as "the library is
  // unchanged" would be the screen's most dangerous lie, since it would make
  // every activity in the app look like one the files had dropped.
  const byFacet = {};
  let libraryPresent = false;
  for (const facet of FACETS) {
    const path = `${CONTENT_DIR}/library/${facet.toLowerCase()}.md`;
    if (files[path] === undefined) continue;
    libraryPresent = true;
    try {
      byFacet[facet] = parseLibrary(files[path]);
    } catch (e) {
      problems.push({ path, errors: [`Could not be read: ${e?.message || e}`] });
    }
  }
  const libraryErrors = libraryPresent ? validateLibrary(byFacet) : [];
  if (libraryErrors.length) problems.push({ path: `${CONTENT_DIR}/library`, errors: libraryErrors });

  const activityIds = Object.values(byFacet).flat().map((a) => a.id);
  const resourcesPath = `${CONTENT_DIR}/resources.md`;
  let resources = [];
  let resourcesPresent = files[resourcesPath] !== undefined;
  if (resourcesPresent) {
    try {
      resources = parseResources(files[resourcesPath]);
    } catch (e) {
      resourcesPresent = false;
      problems.push({ path: resourcesPath, errors: [`Could not be read: ${e?.message || e}`] });
    }
  }
  const resourceErrors = resourcesPresent
    ? validateResources(resources, { activityIds: libraryPresent ? activityIds : null })
    : [];
  if (resourceErrors.length) problems.push({ path: resourcesPath, errors: resourceErrors });

  // The presets, which like the library and the resources have no file until
  // the app writes one — and which name library activities, so they are read
  // against the same ids.
  const setsPath = `${CONTENT_DIR}/activity-sets.md`;
  let activitySets = [];
  let setsPresent = files[setsPath] !== undefined;
  if (setsPresent) {
    try {
      activitySets = parseActivitySets(files[setsPath]);
    } catch (e) {
      setsPresent = false;
      problems.push({ path: setsPath, errors: [`Could not be read: ${e?.message || e}`] });
    }
  }
  const setErrors = setsPresent
    ? validateActivitySets(activitySets, { activityIds: libraryPresent ? activityIds : null })
    : [];
  if (setErrors.length) problems.push({ path: setsPath, errors: setErrors });

  // The posts judged not to belong here. Nothing points at them and they point
  // at nothing, so they are read on their own — but they are read loosely, the
  // way the app compares one address with another.
  const skippedPath = `${CONTENT_DIR}/skipped-posts.md`;
  let skippedPosts = [];
  let skippedPresent = files[skippedPath] !== undefined;
  if (skippedPresent) {
    try {
      skippedPosts = parseSkippedPosts(files[skippedPath]);
    } catch (e) {
      skippedPresent = false;
      problems.push({ path: skippedPath, errors: [`Could not be read: ${e?.message || e}`] });
    }
  }
  const skippedErrors = skippedPresent ? validateSkippedPosts(skippedPosts, { sameAddress }) : [];
  if (skippedErrors.length) problems.push({ path: skippedPath, errors: skippedErrors });

  const titlesPath = `${CONTENT_DIR}/job-titles.md`;
  let jobTitles = [];
  let titlesPresent = files[titlesPath] !== undefined;
  if (titlesPresent) {
    try {
      jobTitles = parseJobTitles(files[titlesPath]);
    } catch (e) {
      titlesPresent = false;
      problems.push({ path: titlesPath, errors: [`Could not be read: ${e?.message || e}`] });
    }
  }
  const titleErrors = titlesPresent ? validateJobTitles(jobTitles) : [];
  if (titleErrors.length) problems.push({ path: titlesPath, errors: titleErrors });

  return {
    scales,
    instruments,
    problems,
    jobTitles: { rows: jobTitles, present: titlesPresent && !titleErrors.length },
    library: { byFacet, present: libraryPresent && !libraryErrors.length },
    resources: { rows: resources, present: resourcesPresent && !resourceErrors.length },
    activitySets: { rows: activitySets, present: setsPresent && !setErrors.length },
    skippedPosts: { rows: skippedPosts, present: skippedPresent && !skippedErrors.length },
  };
}
