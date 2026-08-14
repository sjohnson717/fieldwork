#!/usr/bin/env node
// Builds the throwaway QA harness and registers it in .claude/launch.json.
//
//   node .claude/skills/qa-sweep/start.mjs          # create harness + launch entry
//   node .claude/skills/qa-sweep/start.mjs --clean  # remove both
//
// The harness directory has to live inside the repo: vite resolves its plugins
// from the config file's own directory, so a config under /tmp fails outright
// with "Cannot find package '@vitejs/plugin-react'". It is created fresh each
// run and deleted by --clean, and launch.json is restored with git checkout.

import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "../../..");
const SKILL = path.join(REPO, ".claude/skills/qa-sweep");
const HARNESS = path.join(REPO, ".qa-harness");
const LAUNCH = path.join(REPO, ".claude/launch.json");
const PORT = 5199;
const NAME = "qa-harness";

const clean = process.argv.includes("--clean");

const readLaunch = async () => JSON.parse(await readFile(LAUNCH, "utf8"));

const writeLaunch = async (config) => {
  await writeFile(LAUNCH, JSON.stringify(config, null, 2) + "\n");
};

if (clean) {
  await rm(HARNESS, { recursive: true, force: true });
  if (existsSync(LAUNCH)) {
    const config = await readLaunch();
    config.configurations = config.configurations.filter(c => c.name !== NAME);
    await writeLaunch(config);
  }
  console.log("removed .qa-harness and its launch.json entry");
  process.exit(0);
}

await rm(HARNESS, { recursive: true, force: true });
await mkdir(HARNESS, { recursive: true });
await cp(path.join(SKILL, "harness"), HARNESS, { recursive: true });

await writeFile(path.join(HARNESS, "index.html"), `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>QA harness</title></head>
  <body><div id="root"></div><script type="module" src="/main.jsx"></script></body>
</html>
`);

// Absolute paths, because this config is loaded from a directory that is not the
// repo root and ESM has no __dirname.
await writeFile(path.join(HARNESS, "vite.config.js"), `import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const REPO = ${JSON.stringify(REPO)}
const DIR = ${JSON.stringify(HARNESS)}

export default defineConfig({
  root: DIR,
  plugins: [react()],
  // The base44 client and the auth context are the only two modules the pages
  // cannot reach in a harness: one needs a live backend, the other a signed-in
  // user. Everything else is the real code.
  resolve: {
    alias: [
      { find: '@/api/base44Client', replacement: DIR + '/stub-base44.js' },
      { find: '@/lib/AuthContext', replacement: DIR + '/stub-auth.jsx' },
      { find: '@', replacement: REPO + '/src' },
    ],
  },
  appType: 'spa',
  server: { port: ${PORT}, fs: { allow: [REPO, DIR] } },
})
`);

await writeFile(path.join(HARNESS, "postcss.config.js"), `export default {
  plugins: { tailwindcss: { config: ${JSON.stringify(path.join(REPO, "tailwind.config.js"))} }, autoprefixer: {} },
}
`);

// launch.json is tracked: append, never overwrite.
const config = await readLaunch();
config.configurations = config.configurations.filter(c => c.name !== NAME);
config.configurations.push({
  name: NAME,
  runtimeExecutable: "npx",
  runtimeArgs: ["vite", "--config", path.join(HARNESS, "vite.config.js")],
  port: PORT,
});
await writeLaunch(config);

console.log(`harness ready at .qa-harness — preview_start({ name: "${NAME}" }), then open http://localhost:${PORT}/`);
console.log(`when finished: node .claude/skills/qa-sweep/start.mjs --clean && git checkout .claude/launch.json`);
