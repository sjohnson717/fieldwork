#!/usr/bin/env node
// The sweep: every public route at every viewport, then the flows that write.
//
//   node .claude/skills/qa-sweep/sweep.mjs [outDir] [baseUrl]
//
// Needs puppeteer, which is not a project dependency:
//   npm i --no-save puppeteer
// or point NODE_PATH at a copy you already have.
//
// Writes report.md, report.json and screenshots. The exit code is 1 if any
// layout, error or permission finding survived, so this can gate a release; a
// contrast finding does not fail the run (see audit.js for why).

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [outDir = "qa-report", baseUrl = "http://localhost:5199"] = process.argv.slice(2);

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

// Widths, not device names. A device name implies an engine and a UA this cannot
// provide; a width is exactly what is being tested. 320 is the oldest iPhone SE,
// 375/390/430 the current range, 768 tablet, 1280 laptop.
const WIDTHS = [320, 375, 390, 430, 768, 1280];

const ROUTES = [
  { name: "registration-team-gap", url: "/assess?code=QA111", expect: "Before we begin" },
  { name: "registration-personal", url: "/assess?code=QA222", expect: "Before we begin" },
  { name: "resume-partial", url: "/assess?t=TOKEN-RESP-4", expect: "DEFINE" },
  { name: "respondent-report", url: "/assess?t=TOKEN-RESP-1", review: true, expect: "where you'd focus first" },
  { name: "personal-profile", url: "/assess?t=TOKEN-PERSONAL", review: true, expect: "part one" },
  { name: "buyer-report", url: "/report/TOKEN-BUYER", expect: "executive summary" },
  { name: "team-dashboard", url: "/team/TOKEN-TEAM" },
  { name: "survey-wrapup", url: "/assess?t=TOKEN-RESP-4", wrapup: true, expect: "two last questions" },
  { name: "dead-link", url: "/assess?t=NOT-A-TOKEN", expect: "no longer valid" },
];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const openReview = async (page) => {
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /Review my responses/.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  });
  if (clicked) await wait(700);
};

// The wrap-up page is reachable only by finishing the survey, so the layout
// matrix has to page through to it. Two free-text boxes and a two-button footer
// are exactly the shape that breaks at 320px.
const openWrapup = async (page) => {
  for (let i = 0; i < 10; i++) {
    const advanced = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /Next|Finish and review/.test(x.textContent));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!advanced) break;
    await wait(600);
    const there = await page.evaluate(() => /Two last questions/.test(document.body.innerText));
    if (there) break;
  }
};

await mkdir(outDir, { recursive: true });
await mkdir(path.join(outDir, "screens"), { recursive: true });

const browser = await puppeteer.launch();
const layout = [];
const flows = [];

// ── Part one: layout and a11y across the matrix ──────────────────────────────
for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
    await page.goto(baseUrl + route.url, { waitUntil: "networkidle0" });
    if (route.review) await openReview(page);
    if (route.wrapup) await openWrapup(page);
    await wait(400);

    const audit = await page.evaluate(() => (window.__qaAudit ? window.__qaAudit() : { error: "audit module did not load" }));
    // Content assertion, so a blank page cannot pass as clean layout.
    // Case-insensitive: innerText reflects text-transform, so a heading written
    // "Executive Summary" in the source arrives here as "EXECUTIVE SUMMARY".
    const rendered = route.expect
      ? await page.evaluate((needle) => document.body.innerText.toLowerCase().includes(needle.toLowerCase()), route.expect)
      : await page.evaluate(() => document.body.innerText.trim().length > 200);

    layout.push({ route: route.name, width, rendered, ...audit });

    if (width === 375 || width === 1280) {
      await page.screenshot({ path: path.join(outDir, "screens", `${route.name}-${width}.png`), fullPage: true });
    }
    await page.close();
  }
}

// ── Part two: the flows that write ───────────────────────────────────────────
const flow = async (name, fn) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true });
  const problems = [];
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`); });
  let result;
  try {
    result = await fn(page);
  } catch (e) {
    result = { pass: false, detail: `threw: ${e.message}` };
  }
  const violations = await page.evaluate(() => [...new Set((window.__qa && window.__qa.violations) || [])]);
  flows.push({ name, ...result, problems, rlsViolations: violations, pass: result.pass && problems.length === 0 && violations.length === 0 });
  await page.close();
};

const fill = async (page, values) => {
  await page.evaluate((vals) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    document.querySelectorAll("input[type=text]").forEach((el, i) => {
      if (vals[i] === undefined) return;
      setter.call(el, vals[i]);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }, values);
  await wait(200);
};

const clickText = (page, needle) => page.evaluate((n) => {
  const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === n || x.textContent.includes(n));
  if (!b) return false;
  b.click();
  return true;
}, needle);

// Registration must not create two respondents from one press. Three clicks in
// a single frame is the real double tap: a guard held in React state only takes
// effect after a re-render, so this is the case it misses.
await flow("registration is single-submit", async (page) => {
  await page.goto(baseUrl + "/assess?code=QA111", { waitUntil: "networkidle0" });
  await fill(page, ["QA Sweep", "Product Manager"]);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /Start Assessment/.test(x.textContent));
    b.click(); b.click(); b.click();
  });
  await wait(1500);
  const created = await page.evaluate(() => window.__qa.calls.filter(c => c.name === "Respondent.create").length);
  return { pass: created === 1, detail: `Respondent.create called ${created}x (expected 1)` };
});

// The bug that started this: page one saved, page two, back, change, save again.
// The second save is an update, which respondents are not permitted to make
// directly — it has to go through saveResponses.
await flow("back then forward re-saves without duplicating", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-4", { waitUntil: "networkidle0" });
  await clickText(page, "Critical");
  await clickText(page, "Good");
  await clickText(page, "Next");
  await wait(800);
  await clickText(page, "Back");
  await wait(500);
  await clickText(page, "Not needed");
  await clickText(page, "Next");
  await wait(1000);
  const state = await page.evaluate(() => {
    const rows = window.__qa.responses.filter(r => r.respondent_id === "resp-4" && r.activity_id === "act-1");
    return { count: rows.length, importance: rows[0]?.importance, saves: window.__qa.calls.filter(c => c.name === "fn:saveResponses").length };
  });
  const errorShown = await page.evaluate(() => /Error saving responses/.test(document.body.innerText));
  return {
    pass: state.count === 1 && state.importance === "Not needed" && !errorShown,
    detail: `${state.count} row(s) for act-1, importance=${state.importance}, ${state.saves} saves, errorShown=${errorShown}`,
  };
});

// Three rapid Nexts must produce one save and one page advance.
await flow("next is single-submit", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-4", { waitUntil: "networkidle0" });
  await clickText(page, "Important");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /Next/.test(x.textContent));
    b.click(); b.click(); b.click();
  });
  await wait(1200);
  const saves = await page.evaluate(() => window.__qa.calls.filter(c => c.name === "fn:saveResponses").length);
  const heading = await page.evaluate(() => document.querySelector("h1")?.textContent);
  return { pass: saves === 1, detail: `${saves} save(s) (expected 1), now on ${heading}` };
});

// Finishing marks the respondent complete in the same call as the last page.
await flow("finishing completes the respondent", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-4", { waitUntil: "networkidle0" });
  for (let i = 0; i < 9; i++) {
    const advanced = (await clickText(page, "Next")) || (await clickText(page, "Finish and review"));
    if (!advanced) break;
    await wait(700);
  }
  const state = await page.evaluate(() => {
    const r = window.__qa.respondents.find(x => x.id === "resp-4");
    const last = window.__qa.calls.filter(c => c.name === "fn:saveResponses").slice(-1)[0];
    return { status: r?.status, completed: !!r?.completed_date, completeFlag: last?.payload?.complete };
  });
  return {
    pass: state.status === "completed" && state.completed && state.completeFlag === true,
    detail: `status=${state.status}, completed_date=${state.completed}, last save complete=${state.completeFlag}`,
  };
});

// The wrap-up saves its free text without touching the answers, and without
// re-completing a respondent the previous page already completed. It comes
// after that save on purpose: skipping it must cost a respondent nothing, so
// this asserts completion is already true when the page is reached.
await flow("wrap-up saves feedback and never gates completion", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-4", { waitUntil: "networkidle0" });
  for (let i = 0; i < 10; i++) {
    const advanced = (await clickText(page, "Next")) || (await clickText(page, "Finish and review"));
    if (!advanced) break;
    await wait(700);
    if (await page.evaluate(() => /Two last questions/.test(document.body.innerText))) break;
  }
  const onWrapup = await page.evaluate(() => !!document.getElementById("closing-comments"));
  if (!onWrapup) return { pass: false, detail: "never reached the wrap-up page" };

  const completedBefore = await page.evaluate(() =>
    window.__qa.respondents.find(x => x.id === "resp-4")?.status);

  const rowsBefore = await page.evaluate(() =>
    window.__qa.responses.filter(r => r.respondent_id === "resp-4").length);

  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    // Padded deliberately: the server trims, and the sweep should notice if it stops.
    set("closing-comments", "   The importance scale felt blunt.   ");
    set("missing-coverage", "Pricing research.");
  });
  await wait(200);
  if (!(await clickText(page, "Continue"))) return { pass: false, detail: "no Continue button on the wrap-up" };
  await wait(900);

  const after = await page.evaluate(() => {
    const r = window.__qa.respondents.find(x => x.id === "resp-4");
    const last = window.__qa.calls.filter(c => c.name === "fn:saveResponses").slice(-1)[0];
    return {
      cc: r?.closing_comments,
      mc: r?.missing_coverage,
      answersSent: last?.payload?.answers?.length,
      completeFlag: last?.payload?.complete,
      rows: window.__qa.responses.filter(x => x.respondent_id === "resp-4").length,
      onReport: !document.getElementById("closing-comments"),
    };
  });

  const pass =
    completedBefore === "completed" &&
    after.cc === "The importance scale felt blunt." &&
    after.mc === "Pricing research." &&
    after.answersSent === 0 &&
    after.completeFlag !== true &&
    after.rows === rowsBefore &&
    after.onReport;

  return {
    pass,
    detail: `completed before wrap-up=${completedBefore}, trimmed=${JSON.stringify(after.cc)}, answers sent=${after.answersSent}, complete flag=${after.completeFlag}, rows ${rowsBefore}\u2192${after.rows}, advanced=${after.onReport}`,
  };
});

// Skipping the wrap-up writes nothing at all.
await flow("skipping the wrap-up writes nothing", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-4", { waitUntil: "networkidle0" });
  for (let i = 0; i < 10; i++) {
    const advanced = (await clickText(page, "Next")) || (await clickText(page, "Finish and review"));
    if (!advanced) break;
    await wait(700);
    if (await page.evaluate(() => /Two last questions/.test(document.body.innerText))) break;
  }
  if (!(await page.evaluate(() => !!document.getElementById("closing-comments"))))
    return { pass: false, detail: "never reached the wrap-up page" };

  const before = await page.evaluate(() => window.__qa.calls.filter(c => c.name === "fn:saveResponses").length);
  if (!(await clickText(page, "Skip"))) return { pass: false, detail: "no Skip button on the wrap-up" };
  await wait(900);
  const after = await page.evaluate(() => ({
    calls: window.__qa.calls.filter(c => c.name === "fn:saveResponses").length,
    status: window.__qa.respondents.find(x => x.id === "resp-4")?.status,
    onReport: !document.getElementById("closing-comments"),
  }));
  return {
    pass: after.calls === before && after.status === "completed" && after.onReport,
    detail: `${after.calls - before} extra save(s), status=${after.status}, advanced=${after.onReport}`,
  };
});

// Revise re-reads the saved answers and writes changes back to the same rows.
await flow("revise re-reads and rewrites", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-1", { waitUntil: "networkidle0" });
  await openReview(page);
  const before = await page.evaluate(() => ({
    rows: window.__qa.responses.filter(r => r.respondent_id === "resp-1").length,
    act1: window.__qa.responses.find(r => r.respondent_id === "resp-1" && r.activity_id === "act-1")?.importance,
  }));
  if (!(await clickText(page, "Revise"))) return { pass: false, detail: "no Revise button on the report" };
  await wait(900);

  // Their saved answer should be selected already — a revision that starts from
  // a blank page is how someone loses the answers they came back to adjust.
  const prefilled = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some(b => /border-transparent/.test(b.className))
  );

  const target = before.act1 === "Critical" ? "Nice to have" : "Critical";
  await clickText(page, target);
  await clickText(page, "Next");
  await wait(900);

  const after = await page.evaluate(() => ({
    rows: window.__qa.responses.filter(r => r.respondent_id === "resp-1").length,
    act1: window.__qa.responses.find(r => r.respondent_id === "resp-1" && r.activity_id === "act-1")?.importance,
  }));
  return {
    pass: prefilled && after.rows === before.rows && after.act1 === target,
    detail: `prefilled=${prefilled}, rows ${before.rows}→${after.rows}, act-1 ${before.act1}→${after.act1} (wanted ${target})`,
  };
});

await browser.close();

// ── Report ──────────────────────────────────────────────────────────────────
const layoutFailures = layout.filter(r => !r.clean || !r.rendered);
const flowFailures = flows.filter(f => !f.pass);

const md = [];
md.push(`# QA sweep\n`);
md.push(`${new Date().toISOString()} · ${baseUrl} · headless Chromium\n`);
md.push(`**${layout.length} route/viewport combinations, ${flows.length} flows.** `);
md.push(`${layoutFailures.length} layout findings, ${flowFailures.length} flow failures.\n`);

md.push(`\n## Flows\n`);
md.push(`| Flow | Result | Detail |`);
md.push(`| --- | --- | --- |`);
for (const f of flows) md.push(`| ${f.name} | ${f.pass ? "pass" : "**FAIL**"} | ${f.detail || ""}${f.problems.length ? ` · ${f.problems.length} console errors` : ""}${f.rlsViolations.length ? ` · refused: ${f.rlsViolations.join(", ")}` : ""} |`);

md.push(`\n## Layout matrix\n`);
md.push(`| Route | ${WIDTHS.join(" | ")} |`);
md.push(`| --- | ${WIDTHS.map(() => "---").join(" | ")} |`);
for (const route of ROUTES) {
  const cells = WIDTHS.map(w => {
    const row = layout.find(r => r.route === route.name && r.width === w);
    if (!row) return "—";
    if (!row.rendered) return "**blank**";
    if (!row.clean) {
      const bits = [];
      if (row.pageScroll) bits.push(`scroll ${row.pageScroll.overflowPx}px`);
      if (row.overflow?.length) bits.push(`${row.overflow.length} clipped`);
      if (row.overlap?.length) bits.push(`${row.overlap.length} overlap`);
      if (row.consoleErrors?.length) bits.push(`${row.consoleErrors.length} errors`);
      if (row.rlsViolations?.length) bits.push(`refused read`);
      return `**${bits.join(", ")}**`;
    }
    return "ok";
  });
  md.push(`| ${route.name} | ${cells.join(" | ")} |`);
}

if (layoutFailures.length) {
  md.push(`\n### Layout detail\n`);
  for (const row of layoutFailures) {
    md.push(`\n**${row.route} @ ${row.width}px**\n`);
    if (!row.rendered) md.push(`- rendered nothing recognisable — check the route and fixtures`);
    if (row.pageScroll) md.push(`- page scrolls sideways by ${row.pageScroll.overflowPx}px`);
    for (const o of row.overflow || []) md.push(`- clipped ${o.cutPx}px: ${o.element} inside ${o.clippedBy}`);
    for (const o of (row.overlap || []).slice(0, 5)) md.push(`- overlap ${o.overlapPx.x}×${o.overlapPx.y}px: ${o.a} over ${o.b}`);
    for (const e of row.consoleErrors || []) md.push(`- console: ${e}`);
    for (const v of row.rlsViolations || []) md.push(`- asked for a permission it does not have: ${v}`);
  }
}

// Contrast is reported once, not per viewport: it does not vary with width.
const contrastByRoute = {};
for (const row of layout) {
  for (const g of row.contrastGroups || []) {
    const key = `${row.route}|${g.color}|${g.background}|${g.fontSizePx}`;
    contrastByRoute[key] = contrastByRoute[key] || { route: row.route, ...g };
  }
}
const contrastRows = Object.values(contrastByRoute).sort((a, b) => a.ratio - b.ratio);
md.push(`\n## Contrast (standing, does not fail the run)\n`);
if (!contrastRows.length) md.push(`Nothing below AA.`);
else {
  md.push(`| Route | Ratio | Needs | Size | Colour on background | Example |`);
  md.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const c of contrastRows.slice(0, 30)) {
    md.push(`| ${c.route} | ${c.ratio} | ${c.required} | ${c.fontSizePx}px${c.bold ? " bold" : ""} | ${c.color} on ${c.background} | ${c.example} |`);
  }
}

// Touch targets, once, narrowest width first — the size does not change with the
// viewport, only whether the check applies.
const tapRows = {};
for (const row of layout) {
  for (const t of row.tapTargets || []) {
    const key = `${row.route}|${t.element}`;
    if (!tapRows[key] || t.size.h < tapRows[key].size.h) tapRows[key] = { route: row.route, ...t };
  }
}
const taps = Object.values(tapRows).sort((a, b) => a.size.h * a.size.w - b.size.h * b.size.w);
md.push(`\n## Touch targets under 44px (standing, does not fail the run)\n`);
if (!taps.length) md.push(`Nothing under 44px.`);
else {
  md.push(`| Route | Size | Control |`);
  md.push(`| --- | --- | --- |`);
  for (const t of taps.slice(0, 25)) md.push(`| ${t.route} | ${t.size.w}×${t.size.h} | ${t.element} |`);
}

md.push(`\n## What this run did not cover\n`);
md.push(`- Real Safari or iOS WebKit. Chromium only. See SKILL.md for the manual pass.`);
md.push(`- Real Android hardware.`);
md.push(`- Print output: run print-check.mjs and read the PDFs.`);
md.push(`- Admin pages: they need an authenticated user; see SKILL.md.`);
md.push(`- The live backend. This sweep runs against the stub, which enforces the RLS rules but holds fixture data.`);

await writeFile(path.join(outDir, "report.md"), md.join("\n") + "\n");
await writeFile(path.join(outDir, "report.json"), JSON.stringify({ layout, flows }, null, 2));

console.log(md.join("\n"));
console.log(`\nreport: ${path.join(outDir, "report.md")}`);
process.exit(layoutFailures.length || flowFailures.length ? 1 : 0);
