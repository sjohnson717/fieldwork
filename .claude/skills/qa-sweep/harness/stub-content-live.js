// The real content-live module, with one loader replaced, aliased over
// @/lib/content-live.
//
// loadContentStatus reads the content branch on GitHub, which a harness should
// not reach over the network: a sweep that passes or fails on GitHub's
// availability is not measuring the app. It reports everything committed, so
// System Health's two content checks read clean and every other check runs on
// the fixtures. The real module is imported by path, which the alias does not
// match, so everything else in it is the real code.
export * from "../src/lib/content-live.js";

export async function loadContentStatus() {
  return { rows: [], branch: "content", sha: "qa-harness" };
}
