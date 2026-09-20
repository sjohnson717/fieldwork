import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// The content files, read here and handed to the app as one object.
//
// This was `import.meta.glob("/content/**/*.md", { query: "?raw" })`, which is
// the idiomatic way and builds perfectly well locally — and fails in the
// Builder, where something in the chain drops the ?raw and gives a Markdown
// file to the JavaScript parser. Reading them at config time needs no query,
// no plugin ordering and no agreement anywhere about what a .md file is: by
// the time Vite sees this module it is ordinary JavaScript.
//
// These are the fallback copy. The screen prefers the content branch and says
// which one it read, so a stale bundle is never mistaken for the truth.
const VIRTUAL = "virtual:content-files";
const contentFiles = () => {
  const dir = fileURLToPath(new URL("./content", import.meta.url));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".md") ? [join(d, e.name)] : []);
  return {
    name: "content-files",
    enforce: "pre",
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : null),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return null;
      let paths = [];
      // A build without the directory is a build with no fallback, which is a
      // thing the screen can say. It is not a build that fails.
      try { paths = walk(dir); } catch { paths = []; }
      const files = {};
      for (const path of paths.sort()) {
        files[`content/${relative(dir, path)}`] = readFileSync(path, "utf8");
        this.addWatchFile(path);
      }
      return `export default ${JSON.stringify(files)};`;
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    contentFiles(),
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ]
});