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

// Against the branch or not at all.
//
// loadContent falls back to the copy bundled into this build when GitHub
// cannot be read, which is right for the sync screen — it says which one it
// compared and the person is standing there reading it. It is wrong here: a
// check has one line to say something with, and "everything is committed"
// measured against a snapshot from the last deploy is the one wrong answer
// this page can give. So an unreadable branch throws, and System Health marks
// both checks unchecked, as it does for any source that did not load.
export async function loadContentStatus() {
  const [loaded, live] = await Promise.all([loadContent(), liveContentSnapshot()]);
  if (loaded.source !== "branch") {
    throw new Error(loaded.warning || "Could not read the content branch, so nothing could be compared against it.");
  }
  return {
    rows: contentStatus(readContent(loaded.files), loaded.files, live),
    branch: loaded.branch,
    sha: loaded.sha,
  };
}
