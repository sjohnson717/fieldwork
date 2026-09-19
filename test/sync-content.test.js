// The path guard in the sync function, read out of the function's own source.
//
// This is the one check standing between a token that can write to the
// repository and the repository. The token is scoped to Contents on one repo,
// which means the app's own source is within its reach — and Base44 syncs main
// and rebuilds from it. So the pattern is tested rather than trusted, and it is
// read from entry.ts rather than copied here, because a copy would pass this
// test long after the function stopped matching it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "base44", "functions", "syncContent", "entry.ts"),
  "utf8",
);

const literal = source.match(/^const ALLOWED = (\/.*\/);$/m);
assert.ok(literal, "ALLOWED is not declared in entry.ts the way this test reads it");
const ALLOWED = new RegExp(literal[1].slice(1, literal[1].lastIndexOf("/")));

test("the content files are writable", () => {
  for (const p of [
    "content/scales.md",
    "content/instruments/chaos.md",
    "content/instruments/fractional-cpo-practice.md",
    "content/instruments/team-gap.md",
    "content/resources.md",
    "content/library/define.md",
    "content/library/learn.md",
  ]) {
    assert.ok(ALLOWED.test(p), `${p} should be writable`);
  }
});

test("nothing else is", () => {
  for (const p of [
    "src/App.jsx",
    "package.json",
    "base44/entities/Activity.jsonc",
    ".github/workflows/deploy.yml",
    "content/instruments/../../src/App.jsx",
    "content/instruments/sub/dir/x.md",
    "content/../src/App.jsx",
    "content/instruments/chaos.md/../../../src/App.jsx",
    "content/instruments/Chaos.md",
    "content/instruments/chaos.jsx",
    "content/instruments/.env",
    "content/README.md",
    "/content/instruments/chaos.md",
    "content/instruments/chaos.md ",
    "content/instruments/chaos.md\nsrc/App.jsx",
    "content/library/define.md/../../../src/App.jsx",
    "content/library/sub/define.md",
    "content/Resources.md",
    "content/resources.md\n",
    "content/scales.md\n",
    "\ncontent/instruments/chaos.md",
    "",
  ]) {
    assert.ok(!ALLOWED.test(p), `${JSON.stringify(p)} must not be writable`);
  }
});

test("the branch it writes to is not main", () => {
  const branch = source.match(/^const BRANCH = "([^"]+)";$/m);
  assert.ok(branch, "BRANCH is not declared the way this test reads it");
  assert.notEqual(branch[1], "main", "committing to main would re-sync the Builder on every wording fix");
});

test("it refuses anyone who is not a super-admin", () => {
  assert.match(source, /user\.role !== "admin"/, "the role check is gone");
});
