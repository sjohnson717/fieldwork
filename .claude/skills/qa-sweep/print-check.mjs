#!/usr/bin/env node
// Renders the printable routes as PDFs, with print CSS applied.
//
//   node .claude/skills/qa-sweep/print-check.mjs <outDir> [baseUrl]
//
// Screen checks cannot see print bugs. Every print regression this app has had —
// a credit split across two sheets, a cover overrunning the page, a resume token
// stamped into Safari's header — was invisible until something rendered the
// paper. This does that for Chromium; the Safari half of print behaviour cannot
// be automated here and stays on the manual checklist in SKILL.md.
//
// Needs puppeteer. It is not a project dependency, so install it where it does
// no harm:  npm i --no-save puppeteer

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [outDir = "qa-print", baseUrl = "http://localhost:5199"] = process.argv.slice(2);

// Resolved from the repo, or from QA_PUPPETEER when you would rather not add a
// dependency to a project that has none: point it at any existing install, e.g.
//   QA_PUPPETEER=/path/to/node_modules/puppeteer node ... sweep.mjs
// NODE_PATH does not work here — ESM imports ignore it.
let puppeteer;
try {
  const from = process.env.QA_PUPPETEER;
  if (from) {
    // Read the package's own entry point rather than guessing index.js —
    // puppeteer's is lib/puppeteer/puppeteer.js, and guessing gets it wrong.
    const pkg = JSON.parse(await readFile(path.join(from, "package.json"), "utf8"));
    const entry = pkg.exports?.["."]?.import || pkg.module || pkg.main || "index.js";
    puppeteer = (await import(pathToFileURL(path.join(from, entry)).href)).default;
  } else {
    puppeteer = (await import("puppeteer")).default;
  }
} catch (e) {
  console.error(`puppeteer not found (${e.message}).\nEither: npm i --no-save puppeteer\nOr: QA_PUPPETEER=/abs/path/to/node_modules/puppeteer node <script>`);
  process.exit(2);
}

// The routes that carry a "Save as PDF" button, and the paper each is saved on.
const ROUTES = [
  { name: "respondent-team-gap", url: "/assess?t=TOKEN-RESP-1", review: true },
  { name: "respondent-personal", url: "/assess?t=TOKEN-PERSONAL", review: true },
  { name: "buyer-report", url: "/report/TOKEN-BUYER" },
];

const FORMATS = ["letter", "a4"];

await mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch();
const summary = [];

for (const route of ROUTES) {
  for (const format of FORMATS) {
    const page = await browser.newPage();
    const problems = [];
    page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
    page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`); });

    await page.goto(baseUrl + route.url, { waitUntil: "networkidle0" });

    // A completed respondent lands on a confirmation, not the report; the paper
    // version is behind the review button.
    if (route.review) {
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find(x => /Review my responses/.test(x.textContent));
        if (b) { b.click(); return true; }
        return false;
      });
      if (clicked) await new Promise(r => setTimeout(r, 600));
    }

    await page.emulateMediaType("print");

    // Two addresses, because there are two print paths and they do not agree.
    //
    // `addressWithoutEvent` is what iOS Safari stamps: its share-sheet route to
    // a PDF fires no beforeprint at all, so anything that strips the address in
    // that handler never runs. A respondent's saved PDF came back with their
    // resume token in the footer of all six sheets precisely because the only
    // protection was event-based. This is the check that catches that, and the
    // one that matters most — the token must not be in the address at all.
    //
    // `addressWithEvent` covers Chrome and desktop Safari, which do fire it.
    const carriesToken = (href) => /[?&]t=|\/report\/[^/]|\/team\/[^/]/.test(href);
    const addressWithoutEvent = await page.evaluate(() => location.href);
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const addressWithEvent = await page.evaluate(() => location.href);
    const tokenLeak = carriesToken(addressWithoutEvent) || carriesToken(addressWithEvent);
    const iosLeak = carriesToken(addressWithoutEvent);
    const addressDuringPrint = addressWithoutEvent;

    // The body is the other place a token can print. The resume link is shown on
    // screen deliberately and marked no-print; this proves the marking holds.
    const tokenInPrintedBody = await page.evaluate(() =>
      /[?&]t=[0-9a-zA-Z-]{6,}/.test(document.body.innerText)
    );

    const file = path.join(outDir, `${route.name}-${format}.pdf`);
    await page.pdf({ path: file, format, printBackground: true });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

    summary.push({ route: route.name, format, file, problems, addressDuringPrint, addressWithEvent, tokenLeak, iosLeak, tokenInPrintedBody });
    await page.close();
  }
}

await browser.close();
await writeFile(path.join(outDir, "print-summary.json"), JSON.stringify(summary, null, 2));

for (const row of summary) {
  const flags = [
    row.problems.length ? `${row.problems.length} console errors` : null,
    row.iosLeak ? `TOKEN IN ADDRESS WITH NO beforeprint — iOS would print it: ${row.addressDuringPrint}` : null,
    !row.iosLeak && row.tokenLeak ? `token in address after beforeprint: ${row.addressWithEvent}` : null,
    row.tokenInPrintedBody ? "TOKEN IN PRINTED BODY — a no-print marking is missing" : null,
  ].filter(Boolean);
  console.log(`${row.route} ${row.format}: ${row.file}${flags.length ? " — " + flags.join("; ") : ""}`);
}
console.log(`\n${summary.length} PDFs in ${outDir}. Read them — page count, split blocks, and clipped tables are visual.`);
