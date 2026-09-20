import { base44 } from "@/api/base44Client";
import { loadContent, readContent } from "@/lib/content-source";
import { contentStatus } from "@/lib/content-status";

// Reading both sides: the app's own rows, and the content branch. Split from
// content-status.js because this half cannot be tested without a backend
// client and a bundler, and the comparison it feeds can.

export async function liveContentSnapshot() {
  const [instruments, activities, bands, sections, resources, scales, scaleOptions, jobTitles, activitySets, skippedPosts] = await Promise.all([
    base44.entities.Instrument.list("sort_order"),
    base44.entities.Activity.list(),
    base44.entities.Band.list(),
    base44.entities.InstrumentSection.list("sort_order"),
    base44.entities.Resource.list("sort_order"),
    base44.entities.Scale.list("sort_order"),
    base44.entities.ScaleOption.list("sort_order"),
    base44.entities.JobTitle.list("sort_order"),
    base44.entities.ActivitySet.list("sort_order"),
    base44.entities.SkippedPost.list("created_date"),
  ]);
  return { instruments, activities, bands, sections, resources, scales, scaleOptions, jobTitles, activitySets, skippedPosts };
}

export async function loadContentStatus() {
  const [loaded, live] = await Promise.all([loadContent(), liveContentSnapshot()]);
  return {
    rows: contentStatus(readContent(loaded.files), loaded.files, live),
    source: loaded.source,
    branch: loaded.branch,
    sha: loaded.sha,
    // Comparing against the copy inside this build is a different fact from
    // comparing against the branch, and a check that did the first while
    // saying the second would be worse than no check.
    warning: loaded.warning || null,
  };
}
