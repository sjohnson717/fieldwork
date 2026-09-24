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
  // resp-4 answered act-1 and act-2 (DEFINE) and act-3 (COMMIT), so the first
  // page with anything left to do is DESCRIBE. Asserting the facet name makes
  // this route a regression test for where a resumed survey opens — it used to
  // open on page one regardless, and send someone back through finished pages.
  { name: "resume-partial", url: "/assess?t=TOKEN-RESP-4", expect: "DESCRIBE" },
  // A team gap made from the New Assessment panel, carrying an instrument_id.
  // Asserting an activity's name, not a heading: the empty survey this guards
  // against still drew its chrome.
  { name: "survey-panel-team-gap", url: "/assess?t=TOKEN-PANEL", expect: "Understand the Market" },
  { name: "respondent-report", url: "/assess?t=TOKEN-RESP-1", review: true, expect: "where you'd focus first" },
  { name: "personal-profile", url: "/assess?t=TOKEN-PERSONAL", review: true, expect: "part one" },
  // The personal counterparts of survey-panel-team-gap: a personal assessment
  // made from the panel, carrying the personal instrument's id. The profile's
  // own sentence rather than "part one", which an empty report would draw too.
  { name: "survey-panel-personal", url: "/assess?t=TOKEN-PANEL-P", expect: "Understand the Market" },
  { name: "personal-profile-panel", url: "/assess?t=TOKEN-PANEL-P-DONE", review: true, expect: "Strengths you enjoy using" },
  // Revise mode carries the section strip, which is the widest thing on the
  // survey page at a phone width. One library assessment, one instrument —
  // instrument section names run longer than facet names.
  { name: "revise-team-gap", url: "/assess?t=TOKEN-RESP-1", revise: true, expect: "Save and return" },
  { name: "revise-instrument", url: "/assess?t=TOKEN-CHAOS-1", revise: true, expect: "Save and return" },
  { name: "buyer-report", url: "/report/TOKEN-BUYER", expect: "executive summary" },
  // The distribution report, which is a different renderer from the one above
  // and went uncovered until it shipped broken: publicAssessment's buyer
  // payload named the team gap's answer fields inline, so this page received
  // rows with no answer and drew every question as empty bars reading
  // "1 didn't answer this".
  //
  // The assertion has to be a sentence the page can only produce from real
  // answers. Headings and option labels render either way; so does the word
  // "split", which appears in the standing intro ("the splits worth an hour"),
  // and so does "agreed", which is inside "disagreed" in the same paragraph.
  // Matching is a case-insensitive substring, so all three would have passed
  // against the very payload this route exists to catch.
  //
  // "came back genuinely split" is emitted only when some question scores a
  // spread of 0.6 or more, which needs at least two people's answers to have
  // arrived. ch-1 in the fixtures is a deliberate dead split for exactly this.
  { name: "buyer-report-instrument", url: "/report/TOKEN-BUYER-CHAOS", expect: "came back genuinely split" },
  { name: "team-dashboard", url: "/team/TOKEN-TEAM" },
  { name: "survey-wrapup", url: "/assess?t=TOKEN-RESP-4", wrapup: true, expect: "two last questions" },
  { name: "dead-link", url: "/assess?t=NOT-A-TOKEN", expect: "no longer valid" },
  {
    // Where /admin opens: the table of assessments with its search, filters,
    // response counts and unread badges. Every width, unlike the admin routes
    // below: below 768 the sidebar is a menu and the table becomes one card per
    // assessment, so a phone is a width this page is meant to work at.
    name: "admin-assessments-home",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    expect: "Product Team Effectiveness",
  },
  {
    name: "admin-results-team-gap",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    admin: { assessment: "Product Team Effectiveness", tab: "Results" },
    // Desktop only. The sidebar collapses on a phone, but the tabs inside an
    // assessment are still laid out for a laptop; measuring them at phone
    // widths reports sideways scroll nobody intends to fix yet, which is how a
    // gate stops being read.
    widths: [768, 1280],
    expect: "respondents",
  },
  {
    name: "admin-results-personal",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    admin: { assessment: "Product Manager Self-Assessment", tab: "Results" },
    widths: [768, 1280],
    expect: "capability",
  },
  {
    // The Discussion tab on an instrument that asks its own questions: the
    // report's agenda order and bars, with the gap tab's notes and decisions.
    name: "admin-discussion-instrument",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    admin: { assessment: "Chaos Assessment — Northwind", tab: "Discussion" },
    widths: [375, 768, 1280],
    expect: "flagged for discussion",
  },
  {
    // Settings → Resources with the blog panel open: the triage row, which
    // carries three controls per post and is the widest row in the panel.
    name: "admin-resources",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    admin: { section: "Resources", blogFeed: true },
    widths: [768, 1280],
    expect: "new from the blog",
  },
  {
    // The suggestion box's review page, super-admin only: the filed ideas, the
    // status chips that decide what a working session picks up, and the note
    // saying why. Desktop widths, like the rest of the admin pages behind the
    // fixed sidebar.
    name: "admin-ideas",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    admin: { section: "Ideas" },
    widths: [768, 1280],
    expect: "the problem",
  },
  {
    // System Health, super-admin only: every check, with the unattached
    // resources opened so the Keep and Undo buttons and the kept count render.
    name: "admin-health",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    admin: { section: "System Health", openCheck: "Resources attached to nothing" },
    widths: [375, 768, 1280],
    expect: "1 new · 1 kept",
  },
  {
    // The content editor on Settings → Instruments, on the fixture's small
    // Product Success instrument: sections, commentary, reading chips, bands.
    name: "admin-instrument-editor",
    url: "/admin",
    signIn: { email: "qa@example.com", role: "admin" },
    admin: { section: "Instruments", edit: "Product Success Quiz" },
    widths: [768, 1280],
    expect: "maximum score 3",
  },
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
// The survey in revise mode: the finished report, then Revise — which the
// instrument report labels "Change my answers". Returns whether the button was
// there, so a flow can fail with a reason rather than a mysterious count.
const openRevise = async (page) => {
  await openReview(page);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /Revise|Change my answers/.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  });
  if (clicked) await wait(900);
  return clicked;
};

// The wrap-up page is reachable only by finishing the survey, so the layout
// matrix has to page through to it. Two free-text boxes and a two-button footer
// are exactly the shape that breaks at 320px.
// Every facet's button reads "Next", the last one included; "Finish and review"
// lives on the wrap-up itself. Paging by "Next" alone therefore cannot overshoot
// into the wrap-up's own primary button, which is what would happen the moment
// a driver advanced by whichever label it found.
const onWrapup = (page) => page.evaluate(() => !!document.getElementById("closing-comments"));

// Twenty, not ten: a page with nothing selected now takes two presses of Next
// — the first says nothing is selected, the second goes through — so a survey
// paged from start to finish without answering needs twice the clicks it used
// to. Ten was one short of a seven-facet survey resumed at page three.
const pageToWrapup = async (page) => {
  for (let i = 0; i < 20; i++) {
    if (await onWrapup(page)) return true;
    const advanced = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /Next/.test(x.textContent));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!advanced) break;
    await wait(600);
  }
  return await onWrapup(page);
};

// Admin pages need a signed-in staff user and two clicks: pick an assessment
// in the sidebar, then open a tab. They were outside this sweep entirely, which
// left the two results tabs — the screens holding every respondent's answers —
// checked at no width at all.
// Settings → Instruments, then an instrument's content editor when `edit`
// names one. The sidebar sections are buttons like the assessments, but they
// open a page of their own rather than an assessment's tabs.
const openAdminSection = async (page, { section, edit, blogFeed, openCheck }) => {
  await page.evaluate((label) => {
    const b = [...document.querySelectorAll("aside button")].find(x => x.textContent.trim() === label);
    if (b) b.click();
  }, section);
  await wait(700);
  if (openCheck) {
    await page.evaluate((title) => {
      const b = [...document.querySelectorAll("button[aria-expanded]")].find(x => x.textContent.includes(title));
      if (b) b.click();
    }, openCheck);
    await wait(300);
  }
  if (blogFeed) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /new from the blog/i.test(x.textContent.trim()));
      if (b) b.click();
    });
    await wait(900);
  }
  if (edit) {
    await page.evaluate((name) => {
      const li = [...document.querySelectorAll("li")].find(x =>
        x.textContent.includes(name) && [...x.querySelectorAll("button")].some(b => b.textContent.trim() === "Edit content"));
      if (li) [...li.querySelectorAll("button")].find(b => b.textContent.trim() === "Edit content").click();
    }, edit);
    await wait(900);
  }
};

// Assessments are picked from the table on the Assessments page, which /admin
// opens on. "All" first, so a closed fixture assessment is not hidden by the
// page's default Open filter.
const openAdminTab = async (page, { assessment, tab }) => {
  await page.evaluate((title) => {
    const all = [...document.querySelectorAll("button")].find(x => /^All · \d+$/.test(x.textContent.trim()));
    if (all) all.click();
  }, assessment);
  await wait(200);
  await page.evaluate((title) => {
    const b = [...document.querySelectorAll("table td button")]
      .find(x => x.textContent.includes(title));
    if (b) b.click();
  }, assessment);
  await wait(500);
  await page.evaluate((label) => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === label);
    if (b) b.click();
  }, tab);
  await wait(900);
};

await mkdir(outDir, { recursive: true });
await mkdir(path.join(outDir, "screens"), { recursive: true });

const browser = await puppeteer.launch();
const layout = [];
const flows = [];

// ── Part one: layout and a11y across the matrix ──────────────────────────────
for (const route of ROUTES) {
  for (const width of (route.widths || WIDTHS)) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
    if (route.signIn) {
      // sessionStorage needs an origin, so land somewhere on it first, sign in,
      // then go to the route. Anonymous routes must never do this — the stub's
      // permission checks key off the signed-in user, and a stray session would
      // hide exactly the refusals this sweep exists to catch.
      await page.goto(baseUrl + "/landing", { waitUntil: "domcontentloaded" });
      await page.evaluate((u) => window.qaSignIn(u), route.signIn);
    }
    await page.goto(baseUrl + route.url, { waitUntil: "networkidle0" });
    if (route.admin) await (route.admin.section ? openAdminSection(page, route.admin) : openAdminTab(page, route.admin));
    if (route.review) await openReview(page);
    if (route.revise) await openRevise(page);
    if (route.wrapup) await pageToWrapup(page);
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
  // Which flow is running, for when one hangs: the report is written only at
  // the end, so a timeout otherwise says nothing about where it happened.
  if (process.env.QA_VERBOSE) console.error(`flow: ${name}`);
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
    // Whichever activity this page happens to hold, read from the first save
    // rather than named here. Hard-coding act-1 only worked while a resumed
    // survey always opened on page one; it now opens on the first unfinished
    // page, and a test pinned to the old behaviour would fail for the wrong
    // reason.
    const saveCalls = window.__qa.calls.filter(c => c.name === "fn:saveResponses");
    const firstEdited = saveCalls[0]?.payload?.answers?.[0]?.activity_id;
    const rows = window.__qa.responses.filter(r => r.respondent_id === "resp-4" && r.activity_id === firstEdited);
    return { activity: firstEdited, count: rows.length, importance: rows[0]?.importance, saves: saveCalls.length };
  });
  const errorShown = await page.evaluate(() => /Error saving responses/.test(document.body.innerText));
  return {
    pass: state.count === 1 && state.importance === "Not needed" && !errorShown,
    detail: `${state.count} row(s) for ${state.activity}, importance=${state.importance}, ${state.saves} saves, errorShown=${errorShown}`,
  };
});

// A panel-made team gap asks its selected library questions and saves both
// ratings. The survey once came up empty for these, and saveResponses would have
// kept only `answer`; this is the whole path, page to stored row.
await flow("a panel-made team gap asks its questions and saves both ratings", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-PANEL", { waitUntil: "networkidle0" });
  const text = await page.evaluate(() => document.body.innerText);
  const asked = text.includes("Understand the Market");
  // act-2 shares act-1's page but is not in the selection.
  const unselected = text.includes("Go/No-Go Decision to Pursue Initiative");
  await clickText(page, "Critical");
  await clickText(page, "Good");
  await clickText(page, "Next");
  await wait(1000);
  const row = await page.evaluate(() => {
    const r = window.__qa.responses.find(x => x.respondent_id === "resp-panel" && x.activity_id === "act-1");
    return r ? { importance: r.importance, execution: r.execution } : null;
  });
  return {
    pass: asked && !unselected && row?.importance === "Critical" && row?.execution === "Good",
    detail: `asked act-1=${asked}, asked unselected act-2=${unselected}, stored ${JSON.stringify(row)}`,
  };
});

// The same for a panel-made personal assessment, whose three ratings are
// experience, skills, and interest. saveResponses picks the fields by type, so
// this is the path that would drop them if personal were ever read as an
// instrument with its own list.
await flow("a panel-made personal assessment asks its questions and saves all three ratings", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-PANEL-P", { waitUntil: "networkidle0" });
  const text = await page.evaluate(() => document.body.innerText);
  const asked = text.includes("Understand the Market");
  const unselected = text.includes("Go/No-Go Decision to Pursue Initiative");
  await clickText(page, "Extensive");
  await clickText(page, "Excellent");
  await clickText(page, "Passionate");
  await clickText(page, "Next");
  await wait(1000);
  const row = await page.evaluate(() => {
    const r = window.__qa.responses.find(x => x.respondent_id === "resp-panel-p" && x.activity_id === "act-1");
    return r ? { experience: r.experience, skills: r.skills, interest: r.interest } : null;
  });
  return {
    pass: asked && !unselected && row?.experience === "Extensive" && row?.skills === "Excellent" && row?.interest === "Passionate",
    detail: `asked act-1=${asked}, asked unselected act-2=${unselected}, stored ${JSON.stringify(row)}`,
  };
});

// Keep takes a resource out of System Health's count and writes the decision to
// the row; Undo puts it back. Asserted on the stored row as well as the screen:
// a count that changes without a save would come back on the next Recheck.
await flow("keeping an unattached resource takes it out of the count, and Undo puts it back", async (page) => {
  await page.goto(baseUrl + "/landing", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.qaSignIn({ email: "qa@example.com", role: "admin" }));
  await page.goto(baseUrl + "/admin", { waitUntil: "networkidle0" });
  await openAdminSection(page, { section: "System Health", openCheck: "Resources attached to nothing" });
  const summary = () => page.evaluate(() => document.body.innerText.match(/\d+ new · \d+ kept/)?.[0] || null);
  const stored = () => page.evaluate(() => !!window.__qa.resources.find(r => r.id === "res-ms")?.kept_unattached);
  const press = (label) => page.evaluate((l) => {
    // The innermost match: the check's own <li> holds every row's text too.
    const row = [...document.querySelectorAll("li")].filter(li => li.textContent.includes("Market Sizing That Doesn't Suck") && li.querySelector("button")).pop();
    const b = row && [...row.querySelectorAll("button")].find(x => x.textContent.trim() === l);
    if (b) b.click();
    return !!b;
  }, label);
  const before = await summary();
  const kept = await press("Keep");
  await wait(600);
  const afterKeep = { summary: await summary(), stored: await stored() };
  const undone = await press("Undo");
  await wait(600);
  const afterUndo = { summary: await summary(), stored: await stored() };
  return {
    pass: before === "1 new · 1 kept" && kept && afterKeep.summary === "0 new · 2 kept" && afterKeep.stored === true
      && undone && afterUndo.summary === "1 new · 1 kept" && afterUndo.stored === false,
    detail: `before "${before}", Keep ${kept} → "${afterKeep.summary}" stored=${afterKeep.stored}, Undo ${undone} → "${afterUndo.summary}" stored=${afterUndo.stored}`,
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
  // Same doubling as pageToWrapup: this flow answers nothing, so every page it
  // crosses is blank and costs two presses.
  for (let i = 0; i < 20; i++) {
    const advanced = await clickText(page, "Next");
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
  if (!(await pageToWrapup(page))) return { pass: false, detail: "never reached the wrap-up page" };

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
  if (!(await clickText(page, "Finish and review"))) return { pass: false, detail: "no Finish and review button on the wrap-up" };
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
  if (!(await pageToWrapup(page))) return { pass: false, detail: "never reached the wrap-up page" };

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

// Revising without changing anything writes nothing at all. Saving an untouched
// page again only made someone wait at each Next. resp-1's act-8 row is stored
// with every answer blank, so even its blank page is unchanged. The respondent
// stays complete throughout, because Revise no longer marks them started.
await flow("revising without changes saves nothing", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-1", { waitUntil: "networkidle0" });
  await openReview(page);
  if (!(await clickText(page, "Revise"))) return { pass: false, detail: "no Revise button on the report" };
  await wait(900);
  const before = await page.evaluate(() => window.__qa.calls.filter(c => c.name === "fn:saveResponses").length);

  // Next until the wrap-up. act-8 is unrated, so its page is blank and costs a
  // second press.
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(() => !!document.getElementById("closing-comments"))) break;
    if (!(await clickText(page, "Next"))) break;
    await wait(500);
  }

  const state = await page.evaluate(() => {
    const saves = window.__qa.calls.filter(c => c.name === "fn:saveResponses");
    return {
      saves: saves.length,
      complete: saves.slice(-1)[0]?.payload?.complete,
      status: window.__qa.respondents.find(x => x.id === "resp-1")?.status,
      wrapup: !!document.getElementById("closing-comments"),
    };
  });
  const made = state.saves - before;
  return {
    pass: state.wrapup && made === 0 && state.status === "completed",
    detail: `${made} save(s) across the revision (expected 0), status=${state.status}, reached wrap-up=${state.wrapup}`,
  };
});

const saveCount = (page) => page.evaluate(() => window.__qa.calls.filter(c => c.name === "fn:saveResponses").length);
const act1Of = (page, respondentId) => page.evaluate((id) =>
  window.__qa.responses.find(r => r.respondent_id === id && r.activity_id === "act-1")?.importance, respondentId);

// The section strip. Leaving a page for another saves it only when it changed,
// and lands on the section asked for.
await flow("jumping sections saves only a changed page", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-1", { waitUntil: "networkidle0" });
  if (!(await openRevise(page))) return { pass: false, detail: "no Revise button on the report" };
  const before = await saveCount(page);
  const target = (await act1Of(page, "resp-1")) === "Critical" ? "Nice to have" : "Critical";
  await clickText(page, target);
  await clickText(page, "LEARN");
  await wait(900);
  const mid = { saves: await saveCount(page), h1: await page.evaluate(() => document.querySelector("h1")?.textContent), act1: await act1Of(page, "resp-1") };
  await clickText(page, "COMMIT");
  await wait(700);
  const end = { saves: await saveCount(page), h1: await page.evaluate(() => document.querySelector("h1")?.textContent) };
  return {
    pass: mid.saves - before === 1 && mid.h1 === "LEARN" && mid.act1 === target && end.saves === mid.saves && end.h1 === "COMMIT",
    detail: `changed page: ${mid.saves - before} save(s), landed on ${mid.h1}, act-1=${mid.act1} (wanted ${target}); untouched page: ${end.saves - mid.saves} save(s), landed on ${end.h1}`,
  };
});

// The way back to the report without walking the rest of the pages: one save
// for the changed page, carrying completion, then the report.
await flow("save and return finishes a revision in one save", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-1", { waitUntil: "networkidle0" });
  if (!(await openRevise(page))) return { pass: false, detail: "no Revise button on the report" };
  const before = await saveCount(page);
  const target = (await act1Of(page, "resp-1")) === "Critical" ? "Nice to have" : "Critical";
  await clickText(page, target);
  if (!(await clickText(page, "Save and return to my report"))) return { pass: false, detail: "no Save and return button while revising" };
  await wait(900);
  const state = await page.evaluate(() => ({
    complete: window.__qa.calls.filter(c => c.name === "fn:saveResponses").slice(-1)[0]?.payload?.complete,
    status: window.__qa.respondents.find(x => x.id === "resp-1")?.status,
    onReport: !document.querySelector('nav[aria-label="Sections"]') && [...document.querySelectorAll("button")].some(b => /Revise/.test(b.textContent)),
  }));
  const made = (await saveCount(page)) - before;
  const act1 = await act1Of(page, "resp-1");
  return {
    pass: made === 1 && state.complete === true && state.status === "completed" && state.onReport && act1 === target,
    detail: `${made} save(s), complete flag=${state.complete}, status=${state.status}, back on report=${state.onReport}, act-1=${act1} (wanted ${target})`,
  };
});

// Opening Revise must not mark the respondent unfinished. It used to, and
// anyone who opened it and closed the tab stayed "started" on the roster.
await flow("abandoning a revision leaves the respondent finished", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-1", { waitUntil: "networkidle0" });
  if (!(await openRevise(page))) return { pass: false, detail: "no Revise button on the report" };
  const state = await page.evaluate(() => ({
    status: window.__qa.respondents.find(x => x.id === "resp-1")?.status,
    updates: window.__qa.calls.filter(c => c.name === "Respondent.update").length,
    strip: !!document.querySelector('nav[aria-label="Sections"]'),
  }));
  return {
    pass: state.status === "completed" && state.updates === 0 && state.strip,
    detail: `status=${state.status}, Respondent.update calls=${state.updates}, strip shown=${state.strip}`,
  };
});

// Back saves a page it is leaving when that page changed. It used to save
// nothing and rely on a later Next, so an answer changed and then left by Back
// was lost if the tab closed.
await flow("back saves a changed page", async (page) => {
  await page.goto(baseUrl + "/assess?t=TOKEN-RESP-4", { waitUntil: "networkidle0" });
  const before = await saveCount(page);
  const h1Before = await page.evaluate(() => document.querySelector("h1")?.textContent);
  await clickText(page, "Important");
  if (!(await clickText(page, "Back"))) return { pass: false, detail: "no Back button on the resumed page" };
  await wait(900);
  const state = await page.evaluate(() => {
    const last = window.__qa.calls.filter(c => c.name === "fn:saveResponses").slice(-1)[0];
    const id = last?.payload?.answers?.[0]?.activity_id;
    return {
      h1: document.querySelector("h1")?.textContent,
      stored: window.__qa.responses.find(r => r.respondent_id === "resp-4" && r.activity_id === id)?.importance,
    };
  });
  const made = (await saveCount(page)) - before;
  return {
    pass: made === 1 && state.h1 !== h1Before && state.stored === "Important",
    detail: `${made} save(s), moved ${h1Before}→${state.h1}, stored importance=${state.stored}`,
  };
});

// ── The Assessments page ────────────────────────────────────────────────────
// Signed in with a seen-state older than two of the team gap's completions, so
// the page has unread responses to show. The user owns none of the fixture
// assessments, which also exercises the page falling back to Everyone's rather
// than opening on an empty Mine. Asserted against the stub: the badge
// on screen and the seen time written to the user are separate claims.
const openHomeWithUnread = async (page) => {
  await page.goto(baseUrl + "/landing", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.qaSignIn({
    id: "user-1", email: "qa@example.com", role: "admin",
    responses_seen_at: { since: "2026-08-12T16:00:00.000Z", assessments: {} },
  }));
  await page.goto(baseUrl + "/admin", { waitUntil: "networkidle0" });
  await wait(500);
};

await flow("assessments page counts new responses, and Results clears them", async (page) => {
  await openHomeWithUnread(page);
  const badge = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find(r => r.textContent.includes("Product Team Effectiveness"));
    return row?.querySelector("[aria-label$='new responses'], [aria-label$='new response']")?.textContent || null;
  });
  const title = await page.evaluate(() => document.title);
  // A row with news opens on Results, which is what marks it seen.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("table td button")].find(x => x.textContent.includes("Product Team Effectiveness"));
    if (b) b.click();
  });
  await wait(900);
  const after = await page.evaluate(() => ({
    onResults: [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Results" && b.className.includes("bg-blue-600")),
    seen: window.__qa.user?.responses_seen_at?.assessments || {},
    title: document.title,
  }));
  const seenIt = Object.keys(after.seen).length === 1;
  // The tab title counts every visible assessment, so it drops by this row's
  // two rather than to zero.
  const before = Number((title.match(/^\((\d+)\)/) || [])[1] || 0);
  const left = Number((after.title.match(/^\((\d+)\)/) || [])[1] || 0);
  return {
    pass: badge === "2" && before >= 2 && left === before - 2 && after.onResults && seenIt,
    detail: `badge ${badge}, title "${title}" → on Results ${after.onResults}, seen ${JSON.stringify(after.seen)}, title "${after.title}"`,
  };
});

await flow("switcher opens an assessment from the keyboard", async (page) => {
  await openHomeWithUnread(page);
  await page.keyboard.down("Control");
  await page.keyboard.press("k");
  await page.keyboard.up("Control");
  await wait(300);
  const opened = await page.evaluate(() => !!document.querySelector("[cmdk-input]"));
  await page.keyboard.type("self assessment");
  await wait(300);
  const hits = await page.evaluate(() => [...document.querySelectorAll("[cmdk-item]")].map(i => i.textContent));
  await page.keyboard.press("Enter");
  await wait(900);
  const heading = await page.evaluate(() => document.querySelector("h2")?.textContent || "");
  return {
    pass: opened && heading === "Product Manager Self-Assessment",
    detail: `dialog ${opened}, ${hits.length} item(s): ${hits.map(h => h.slice(0, 40)).join(" | ")}, opened "${heading}"`,
  };
});

await flow("pinning puts an assessment in the sidebar, survives a reload, and unpins", async (page) => {
  await openHomeWithUnread(page);
  const sidebarPinned = () => page.evaluate(() => {
    const heading = [...document.querySelectorAll("aside p")].find(p => p.textContent.trim() === "Pinned");
    return heading ? [...heading.parentElement.querySelectorAll("li")].map(li => li.textContent.trim()) : [];
  });
  // Pinned from its row on the Assessments page.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find(r => r.textContent.includes("Product Manager Self-Assessment"));
    row?.querySelector("button[aria-label='Pin to sidebar']")?.click();
  });
  await wait(300);
  const afterPin = await sidebarPinned();
  // At rest a pinned row shows the solid pin; the slashed one is only the
  // hover preview of unpinning.
  const restingIcon = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find(r => r.textContent.includes("Product Manager Self-Assessment"));
    const svg = [...(row?.querySelectorAll("button[aria-label='Unpin from sidebar'] svg") || [])].find(el => getComputedStyle(el).display !== "none");
    return svg ? svg.getAttribute("class") : null;
  });
  // Beside Assessments the sidebar shows the unread total when there is one,
  // and the count otherwise. Either way it must agree with the page under the
  // same Mine or Everyone's: the unread total with the page's "N new
  // responses", the count with its All filter.
  const counts = await page.evaluate(() => {
    const nav = [...document.querySelectorAll("aside button")].find(b => b.textContent.trim().startsWith("Assessments"));
    const badge = nav?.querySelector("[aria-label*='new response']");
    const sidebar = nav?.textContent.replace("Assessments", "").trim();
    const page = badge
      ? (document.body.innerText.match(/(\d+) new responses? since you last looked/) || [])[1]
      : [...document.querySelectorAll("button")].map(b => b.textContent.trim()).find(t => /^All · \d+$/.test(t))?.replace("All · ", "");
    return { kind: badge ? "unread" : "count", sidebar, page };
  });
  const stored = await page.evaluate(() => window.__qa.user?.pinned_assessment_ids || null);
  // The stub writes the user back to the session, as the real User record
  // would persist, so a reload is the cross-load check.
  await page.reload({ waitUntil: "networkidle0" });
  await wait(500);
  const afterReload = await sidebarPinned();
  // Recent must not repeat a pinned assessment.
  const recentRepeats = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("aside p")].find(p => p.textContent.trim() === "Recent");
    return heading ? [...heading.parentElement.querySelectorAll("li")].some(li => li.textContent.includes("Product Manager Self-Assessment")) : false;
  });
  // Unpinned from the assessment's own header.
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("aside p")].find(p => p.textContent.trim() === "Pinned");
    heading?.parentElement.querySelector("li button")?.click();
  });
  await wait(600);
  await page.evaluate(() => document.querySelector("button[aria-label='Unpin from sidebar']")?.click());
  await wait(300);
  const afterUnpin = await sidebarPinned();
  const storedAfter = await page.evaluate(() => window.__qa.user?.pinned_assessment_ids || null);
  const one = (list) => list.length === 1 && list[0].includes("Product Manager Self-Assessment");
  return {
    pass: one(afterPin) && JSON.stringify(stored) === '["asmt-personal"]' && one(afterReload) && !recentRepeats
      && /lucide-pin(\s|$)/.test(restingIcon || "") && !/pin-off/.test(restingIcon || "")
      && !!counts.sidebar && counts.sidebar === counts.page
      && afterUnpin.length === 0 && Array.isArray(storedAfter) && storedAfter.length === 0,
    detail: `pinned ${JSON.stringify(afterPin)} stored ${JSON.stringify(stored)}, resting icon "${restingIcon}", counts ${JSON.stringify(counts)}, after reload ${JSON.stringify(afterReload)}, repeated in Recent ${recentRepeats}, after unpin ${JSON.stringify(afterUnpin)} stored ${JSON.stringify(storedAfter)}`,
  };
});

await flow("client filter narrows the list, merges spellings, and survives opening an assessment", async (page) => {
  await openHomeWithUnread(page);
  // Every fixture assessment is Northwind Systems, which would hide the
  // filter. Give one a second client and one a lower-case copy of the first,
  // then remount /admin in-page so it reloads from the stub's state.
  await page.evaluate(() => {
    const byId = Object.fromEntries(window.__qa.assessments.map(a => [a.id, a]));
    byId["asmt-personal"].company_name = "Acme";
    byId["asmt-gap"].company_name = "  northwind systems ";
    const go = (path) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); };
    go("/landing");
    setTimeout(() => go("/admin"), 50);
  });
  await wait(1200);
  const options = await page.evaluate(() => [...(document.querySelector("#assessments-client")?.options || [])].map(o => o.textContent));
  const setClient = (label) => page.evaluate((l) => {
    const sel = document.querySelector("#assessments-client");
    const opt = [...sel.options].find(o => o.textContent.startsWith(l));
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, label);
  const titles = () => page.evaluate(() => [...document.querySelectorAll("table td button")].map(b => b.textContent.trim()).filter(t => t && !/done|^\d+$/.test(t)));
  // "All" first, so the default Open chip cannot hide a row.
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => /^All · \d+$/.test(b.textContent.trim()))?.click());
  await setClient("Northwind");
  await wait(300);
  const northwind = await titles();
  const summaryLine = await page.evaluate(() => document.body.innerText.match(/Northwind Systems\n?\s*· \d+ assessments?[^\n]*/)?.[0] || null);
  // Open one of that client's assessments and come back.
  await page.evaluate(() => [...document.querySelectorAll("table td button")].find(b => b.textContent.includes("Product Team Effectiveness"))?.click());
  await wait(700);
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "← Assessments")?.click());
  await wait(700);
  const kept = await page.evaluate(() => document.querySelector("#assessments-client")?.selectedOptions[0]?.textContent || null);
  await setClient("Acme");
  await wait(300);
  const acme = await titles();
  // Northwind is the gap, Chaos, and the two panel-made fixtures; Acme is the
  // older personal.
  const ok = options.length === 3 && options[0].startsWith("All clients · 5")
    && options.some(o => o === "Northwind Systems · 4") && options.some(o => o === "Acme · 1")
    && northwind.length === 4 && !northwind.some(t => t.includes("Self-Assessment"))
    && !!summaryLine && (kept || "").startsWith("Northwind Systems")
    && acme.length === 1 && acme[0].includes("Product Manager Self-Assessment");
  return {
    pass: ok,
    detail: `options ${JSON.stringify(options)}, Northwind rows ${JSON.stringify(northwind)}, summary "${summaryLine}", kept after opening "${kept}", Acme rows ${JSON.stringify(acme)}`,
  };
});

// The team dashboard hands a leader resume links, which reopen and edit
// someone's answers. Right for a team gap; wrong where the report belongs to
// the person who answered. No fixture is a practice profile, so this one turns
// the Chaos fixture into one before the page loads: a dimension report is
// the whole difference, and nothing else on the dashboard reads it.
await flow("the team dashboard withholds resume links where the report is the person's own", async (page) => {
  // Per-person links only: the roster's rows. The invite and co-leader links
  // above it are Copy link buttons too, and belong on every dashboard.
  const copyLinks = () => page.evaluate(() =>
    [...document.querySelectorAll("tbody tr button")].filter(b => b.textContent.trim() === "Copy link").length);
  await page.goto(baseUrl + "/team/" + "TOKEN-TEAM", { waitUntil: "networkidle0" });
  await wait(500);
  const teamGapLinks = await copyLinks();
  await page.evaluateOnNewDocument(() => {
    window.__qaSetup = (s) => {
      s.assessments.find(a => a.id === "asmt-chaos").team_token = "TOKEN-PRACTICE";
      s.instruments.find(i => i.id === "inst-chaos").report_style = "dimension";
    };
  });
  await page.goto(baseUrl + "/team/TOKEN-PRACTICE", { waitUntil: "networkidle0" });
  await wait(500);
  const practiceLinks = await copyLinks();
  const listed = await page.evaluate(() => document.body.innerText.includes("Ada Okonjo"));
  const sent = await page.evaluate(() => document.body.innerText.includes("undefined"));
  return {
    pass: teamGapLinks > 0 && practiceLinks === 0 && listed && !sent,
    detail: `team gap Copy link ×${teamGapLinks}, practice profile Copy link ×${practiceLinks}, roster listed=${listed}, "undefined" on page=${sent}`,
  };
});

// A team leader flags library activities for their consultant to swap out of
// the set. An instrument that asks its own questions has no set to change, and
// until September 2026 its dashboard offered "Flag for discussion" on each of
// them, filed under LEARN, the placeholder facet those questions carry.
await flow("the team dashboard offers activity flags only where the set can change", async (page) => {
  const flagSection = () => page.evaluate(() => ({
    heading: document.body.innerText.toLowerCase().includes("activities in this assessment"),
    buttons: [...document.querySelectorAll("button")].filter(b => b.textContent.trim() === "Flag for discussion").length,
  }));
  await page.goto(baseUrl + "/team/" + "TOKEN-TEAM", { waitUntil: "networkidle0" });
  await wait(500);
  const teamGap = await flagSection();
  await page.evaluateOnNewDocument(() => {
    window.__qaSetup = (s) => { s.assessments.find(a => a.id === "asmt-chaos").team_token = "TOKEN-CHAOS-TEAM"; };
  });
  await page.goto(baseUrl + "/team/TOKEN-CHAOS-TEAM", { waitUntil: "networkidle0" });
  await wait(500);
  const chaos = await flagSection();
  const listed = await page.evaluate(() => document.body.innerText.includes("Ada Okonjo"));
  return {
    pass: teamGap.heading && teamGap.buttons > 0 && listed && !chaos.heading && chaos.buttons === 0,
    detail: `team gap ${JSON.stringify(teamGap)}, chaos ${JSON.stringify(chaos)}, chaos roster listed=${listed}`,
  };
});

// Results reads through React Query (lib/admin-queries.js): a tab opened
// before shows its rows at once and refreshes behind them. Every visit used to
// wait for listRespondents from scratch, and on Base44 that is the call that
// spikes to several seconds. The stub is slowed to 1.5s here so waiting and not
// waiting look different, and the call count proves the refresh still runs.
await flow("results shows what it has on a return visit, and still refreshes", async (page) => {
  await page.evaluateOnNewDocument(() => { window.__qaSetup = (s) => { s.latencyMs = 1500; }; });
  await openHomeWithUnread(page);
  const calls = () => page.evaluate(() => window.__qa.calls.filter(c => c.name === "fn:listRespondents").length);
  const showsRoster = () => page.evaluate(() => document.body.innerText.includes("Sam Okafor"));
  const clickTab = (label) => page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === l);
    if (b) b.click();
  }, label);
  await openAdminTab(page, { assessment: "Product Team Effectiveness", tab: "Results" });
  await wait(1800);
  const firstVisit = await showsRoster();
  const before = await calls();
  await clickTab("Overview");
  await wait(400);
  await clickTab("Results");
  await wait(150);
  const instant = await showsRoster();
  await wait(1800);
  const after = await calls();
  return {
    pass: firstVisit && instant && after > before,
    detail: `first visit roster=${firstVisit}, return visit roster within 150ms=${instant}, listRespondents ${before}→${after}`,
  };
});

// The Discussion tabs keep only what has been typed and not yet saved; the
// saved note comes from the query cache (lib/admin-queries.js). Two ways that
// goes wrong: a saved note that the tab no longer shows once it comes back, and
// a decision the instrument Results tab cannot see until it refetches.
const openRow = (page, name) => page.evaluate((n) => {
  const row = [...document.querySelectorAll("[role=button]")].find(el => el.textContent.includes(n));
  if (row) row.click();
  return !!row;
}, name);
const typeInto = async (page, placeholder, text) => {
  // By placeholder, whatever the element: the instrument tab's decision is a
  // one-line input where the team gap's is a textarea.
  await page.click(`[placeholder="${placeholder}"]`);
  await page.type(`[placeholder="${placeholder}"]`, text);
};
// The Save beside that field: the nearest ancestor holding one.
const saveBeside = (page, placeholder) => page.evaluate((ph) => {
  let el = document.querySelector(`[placeholder="${ph}"]`);
  while (el && ![...el.querySelectorAll("button")].some(b => b.textContent.trim() === "Save")) el = el.parentElement;
  const b = el && [...el.querySelectorAll("button")].find(x => x.textContent.trim() === "Save");
  if (b) b.click();
  return !!b;
}, placeholder);
const clickTabNamed = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === l);
  if (b) b.click();
}, label);

await flow("a note saved on Discussion is still there on coming back", async (page) => {
  await openHomeWithUnread(page);
  await openAdminTab(page, { assessment: "Product Team Effectiveness", tab: "Discussion" });
  const opened = await openRow(page, "Understand the Market");
  await wait(200);
  await typeInto(page, "Add notes for the debrief conversation…", "Raised by three of four.");
  const saved = await saveBeside(page, "Add notes for the debrief conversation…");
  await wait(600);
  const stored = await page.evaluate(() => window.__qa.notes.find(n => n.assessment_id === "asmt-gap" && n.activity_id === "act-1")?.note || null);
  await clickTabNamed(page, "Overview");
  await wait(400);
  await clickTabNamed(page, "Discussion");
  await wait(300);
  await openRow(page, "Understand the Market");
  await wait(200);
  const shown = await page.evaluate(() => document.querySelector('textarea[placeholder="Add notes for the debrief conversation…"]')?.value || null);
  return {
    pass: opened && saved && stored === "Raised by three of four." && shown === stored,
    detail: `row opened=${opened}, saved=${saved}, stored ${JSON.stringify(stored)}, shown on return ${JSON.stringify(shown)}`,
  };
});

await flow("a decision saved on an instrument's Discussion is on its Results at once", async (page) => {
  // Decisions reach Results once the assessment is closed, the gap report's
  // rule; and slowed, so a Results tab that has to refetch to see the decision
  // is told apart from one that already has it.
  await page.evaluateOnNewDocument(() => {
    window.__qaSetup = (s) => { s.assessments.find(a => a.id === "asmt-chaos").status = "closed"; s.latencyMs = 1500; };
  });
  await openHomeWithUnread(page);
  await openAdminTab(page, { assessment: "Chaos Assessment — Northwind", tab: "Discussion" });
  await wait(1800);
  const opened = await openRow(page, "Prioritization Challenges");
  await wait(200);
  await typeInto(page, "What was decided or committed to?", "Say no in the planning meeting, in writing.");
  const saved = await saveBeside(page, "What was decided or committed to?");
  await wait(600);
  const stored = await page.evaluate(() => window.__qa.notes.find(n => n.assessment_id === "asmt-chaos")?.decision || null);
  await clickTabNamed(page, "Results");
  await wait(150);
  const onResults = await page.evaluate(() => document.body.innerText.includes("Say no in the planning meeting, in writing."));
  return {
    pass: opened && saved && stored === "Say no in the planning meeting, in writing." && onResults,
    detail: `row opened=${opened}, saved=${saved}, stored ${JSON.stringify(stored)}, on Results within 150ms=${onResults}`,
  };
});

// A personal assessment links to a team gap, and only a team gap: Results
// crosses the two on importance and execution. The list used to be "anything
// not personal", and the Chaos fixture carries no assessment_type, which is
// exactly what every own-questions assessment looks like.
await flow("a personal assessment offers only team gaps to link to", async (page) => {
  await openHomeWithUnread(page);
  await openAdminTab(page, { assessment: "Product Manager Self-Assessment", tab: "Overview" });
  const offered = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h3")].find(h => h.textContent.trim() === "Linked team assessment");
    const select = heading?.parentElement.querySelector("select");
    return select ? [...select.options].map(o => o.textContent.trim()) : null;
  });
  const has = (t) => (offered || []).some(o => o.startsWith(t));
  return {
    pass: !!offered && has("Product Team Effectiveness") && has("Team Roles") && !has("Chaos Assessment") && !has("Product Manager Profile"),
    detail: `offered ${JSON.stringify(offered)}`,
  };
});

// ── The Instruments content editor ──────────────────────────────────────────
// Signed in as an admin, on the fixture's Product Success instrument. Each flow
// asserts against the stub's state, not the screen: "the page shows the edit"
// and "the row changed" are different claims.
const openEditor = async (page) => {
  await page.goto(baseUrl + "/landing", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.qaSignIn({ email: "qa@example.com", role: "admin" }));
  await page.goto(baseUrl + "/admin", { waitUntil: "networkidle0" });
  await openAdminSection(page, { section: "Instruments", edit: "Product Success Quiz" });
};
// A button in the row whose name is `row` (a question or a band), by its text
// or its aria-label.
const inRow = (page, row, label) => page.evaluate((r, l) => {
  const li = [...document.querySelectorAll("li")].find(x => x.querySelector("p")?.textContent === r);
  const b = li && [...li.querySelectorAll("button")].find(x => x.textContent.trim() === l || x.getAttribute("aria-label") === l);
  if (!b) return false;
  b.click();
  return true;
}, row, label);
// Sets a controlled field the way typing would, so React sees the change.
const setField = (page, selector, value) => page.evaluate((sel, v) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  return true;
}, selector, value);
const qa = (page, fn) => page.evaluate(fn);

await flow("instrument editor saves a question edit", async (page) => {
  await openEditor(page);
  if (!(await inRow(page, "Support Costs", "Edit"))) return { pass: false, detail: "no Edit on Support Costs" };
  await wait(300);
  await setField(page, "textarea[placeholder^='Why this question matters']", "Every product carries a tax.");
  await clickText(page, "Save");
  await wait(700);
  const c = await qa(page, () => window.__qa.activities.find(a => a.id === "ps-2").commentary);
  return { pass: c === "Every product carries a tax.", detail: `ps-2 commentary=${JSON.stringify(c)}` };
});

await flow("instrument editor retires and restores a question", async (page) => {
  await openEditor(page);
  await inRow(page, "Market Growth", "Retire");
  await wait(600);
  const retired = await qa(page, () => window.__qa.activities.find(a => a.id === "ps-3").active);
  await inRow(page, "Market Growth", "Restore");
  await wait(600);
  const restored = await qa(page, () => window.__qa.activities.find(a => a.id === "ps-3").active);
  return { pass: retired === false && restored === true, detail: `after Retire active=${retired}, after Restore active=${restored}` };
});

await flow("adding a question warns about the bands and lands last", async (page) => {
  await openEditor(page);
  await clickText(page, "+ Add a question");
  await wait(300);
  await setField(page, "input[placeholder^='Short label']", "Pricing Power");
  await setField(page, "textarea:not([placeholder])", "Can this product hold its price?");
  await wait(200);
  const warned = await qa(page, () => /raises the maximum score from 3 to 4/.test(document.body.innerText));
  await clickText(page, "Add question");
  await wait(700);
  const made = await qa(page, () => window.__qa.activities.find(a => a.name === "Pricing Power"));
  const bandGap = await qa(page, () => /Scores 4–4 fall in no band/.test(document.body.innerText));
  return {
    pass: warned && made?.section === "Performance" && made?.section_sort === 3 && (made?.instrument_ids || []).includes("inst-ps") && bandGap,
    detail: `warned=${warned}, section=${made?.section}, position=${made?.section_sort}, band gap flagged=${bandGap}`,
  };
});

await flow("reordering renumbers the section", async (page) => {
  await openEditor(page);
  await inRow(page, "Revenue Opportunity", "Move Revenue Opportunity down");
  await wait(700);
  const s = await qa(page, () => Object.fromEntries(window.__qa.activities.filter(a => ["ps-1", "ps-2"].includes(a.id)).map(a => [a.id, a.section_sort])));
  return { pass: s["ps-1"] === 2 && s["ps-2"] === 1, detail: `positions ${JSON.stringify(s)}` };
});

await flow("reading attaches to a question and comes off again", async (page) => {
  await openEditor(page);
  await setField(page, "select[aria-label='Add reading to Market Growth']", "res-ms");
  await wait(700);
  const on = await qa(page, () => window.__qa.resources.find(r => r.id === "res-ms").activity_ids.includes("ps-3"));
  await inRow(page, "Market Growth", "Remove Market Sizing That Doesn't Suck from Market Growth");
  await wait(700);
  const off = await qa(page, () => !window.__qa.resources.find(r => r.id === "res-ms").activity_ids.includes("ps-3"));
  return { pass: on && off, detail: `attached=${on}, detached=${off}` };
});

await flow("delete is offered only on an unreferenced question, and works", async (page) => {
  await openEditor(page);
  const offered = await qa(page, () => {
    const has = (name) => {
      const li = [...document.querySelectorAll("li")].find(x => x.querySelector("p")?.textContent === name);
      return !!li && [...li.querySelectorAll("button")].some(b => b.textContent.trim() === "Delete");
    };
    return { answered: has("Revenue Opportunity"), unanswered: has("Market Growth") };
  });
  await inRow(page, "Market Growth", "Delete");
  await wait(300);
  await page.evaluate(() => { const bs = [...document.querySelectorAll("button")].filter(b => b.textContent.trim() === "Delete"); bs[bs.length - 1]?.click(); });
  await wait(800);
  const gone = await qa(page, () => !window.__qa.activities.some(a => a.id === "ps-3"));
  return {
    pass: !offered.answered && offered.unanswered && gone,
    detail: `Delete on the answered question=${offered.answered}, on the unanswered one=${offered.unanswered}, deleted=${gone}`,
  };
});

await flow("band edits save", async (page) => {
  await openEditor(page);
  if (!(await inRow(page, "Invest", "Edit"))) return { pass: false, detail: "no Edit on the Invest band" };
  await wait(300);
  await setField(page, "textarea", "Keep investing, and say why in the plan.");
  await clickText(page, "Save");
  await wait(700);
  const advice = await qa(page, () => window.__qa.bands.find(b => b.id === "band-ps-high").advice);
  return { pass: advice === "Keep investing, and say why in the plan.", detail: `advice=${JSON.stringify(advice)}` };
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
md.push(`- Admin pages other than the Assessments page, the two results tabs and the instrument editor. Those run signed in as an admin; the Assessments page at every width, the rest at desktop widths only.`);
md.push(`- The live backend. This sweep runs against the stub, which enforces the RLS rules but holds fixture data.`);

await writeFile(path.join(outDir, "report.md"), md.join("\n") + "\n");
await writeFile(path.join(outDir, "report.json"), JSON.stringify({ layout, flows }, null, 2));

console.log(md.join("\n"));
console.log(`\nreport: ${path.join(outDir, "report.md")}`);
process.exit(layoutFailures.length || flowFailures.length ? 1 : 0);
