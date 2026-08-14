// The layout and accessibility audit, run in the page at each viewport.
//
// Every check here exists because this app shipped the bug it looks for. That is
// the selection rule: a check that has never caught anything in this codebase is
// noise in the report, and a report full of noise stops being read.
//
//   overflow / clipped   the appendix pill sliced off by overflow-hidden
//   overlap              the activity name printed underneath its own pills
//   pageScroll           a phone layout wider than the phone
//   tapTargets           controls too small to hit on a touch screen (standing)
//   contrast             the heat ramp that failed AA before it was fixed
//   console / network    a silent 403 behind a page that still renders
//   rlsViolations        a page reaching for an entity it may not read
//
// Call window.__qaAudit() and read the returned object. Nothing is logged; the
// driver decides what to do with the findings.

const errors = [];
const failedRequests = [];

// Installed at import time so anything during load is captured, not just what
// happens after the audit is called.
if (typeof window !== "undefined") {
  const nativeError = console.error;
  console.error = (...args) => {
    errors.push(args.map(a => (a && a.stack) || String(a)).join(" ").slice(0, 300));
    nativeError.apply(console, args);
  };
  window.addEventListener("error", e => errors.push(`uncaught: ${e.message}`));
  window.addEventListener("unhandledrejection", e => errors.push(`unhandled rejection: ${e.reason?.message || e.reason}`));
  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const res = await nativeFetch(...args);
      if (!res.ok) failedRequests.push(`${res.status} ${String(args[0]).slice(0, 120)}`);
      return res;
    } catch (e) {
      failedRequests.push(`network error ${String(args[0]).slice(0, 120)}`);
      throw e;
    }
  };
}

const VISIBLE = (el) => {
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

// Print-only and screen-only blocks share the DOM, so an audit that ignores the
// media each element belongs to reports the cover page as broken on a phone.
const inPrintOnly = (el) => !!el.closest(".print-only, .print-cover");

const describe = (el) => {
  const id = el.id ? `#${el.id}` : "";
  const cls = (el.className || "").toString().trim().split(/\s+/).slice(0, 3).join(".");
  const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
  return `${el.tagName.toLowerCase()}${id}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
};

// The nearest ancestor that would clip this element.
const clippingParent = (el) => {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const s = getComputedStyle(p);
    if (/hidden|clip/.test(s.overflow + s.overflowX + s.overflowY)) return p;
    p = p.parentElement;
  }
  return null;
};

const parseColor = (c) => {
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
};

const luminance = ({ r, g, b }) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// Walks up for the first opaque background, which is what the text is actually
// read against.
const backgroundOf = (el) => {
  let p = el;
  while (p && p !== document.documentElement) {
    const c = parseColor(getComputedStyle(p).backgroundColor);
    if (c && c.a > 0.5) return c;
    p = p.parentElement;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
};

const contrastRatio = (fg, bg) => {
  const l1 = luminance(fg), l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

export function qaAudit(options = {}) {
  const { skipContrast = false, tapTargetMin = 44 } = options;
  const findings = { overflow: [], overlap: [], tapTargets: [], contrast: [], pageScroll: null };

  const root = document.documentElement;
  const scrollOverflow = root.scrollWidth - root.clientWidth;
  if (scrollOverflow > 1) findings.pageScroll = { overflowPx: scrollOverflow };

  const all = [...document.body.querySelectorAll("*")].filter(el => VISIBLE(el) && !inPrintOnly(el));

  // 1. Anything sliced off by an ancestor that clips.
  for (const el of all) {
    const clip = clippingParent(el);
    if (!clip) continue;
    const a = el.getBoundingClientRect(), b = clip.getBoundingClientRect();
    // A scroll container is not a bug: the content is reachable. Only clipping
    // that cannot be scrolled to counts.
    const s = getComputedStyle(clip);
    const scrollable = /auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY);
    if (scrollable) continue;
    const cutRight = a.right - b.right, cutLeft = b.left - a.left;
    if (cutRight > 1 || cutLeft > 1) {
      findings.overflow.push({ element: describe(el), clippedBy: describe(clip), cutPx: Math.round(Math.max(cutRight, cutLeft)) });
    }
  }

  // 2. Text drawn over other text. Leaf text nodes only, and only siblings that
  //    share a line box region — the case where a collapsed flex item spills
  //    across the element beside it.
  const textLeaves = all.filter(el =>
    el.children.length === 0 &&
    (el.textContent || "").trim().length > 0 &&
    getComputedStyle(el).position !== "absolute"
  );
  for (let i = 0; i < textLeaves.length; i++) {
    for (let j = i + 1; j < textLeaves.length; j++) {
      const a = textLeaves[i].getBoundingClientRect(), b = textLeaves[j].getBoundingClientRect();
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // 4px of tolerance: descenders and line-height padding routinely touch.
      if (overlapX > 4 && overlapY > 4) {
        findings.overlap.push({
          a: describe(textLeaves[i]), b: describe(textLeaves[j]),
          overlapPx: { x: Math.round(overlapX), y: Math.round(overlapY) },
        });
      }
    }
  }

  // 3. Touch targets. Only on narrow viewports, where the pointer is a finger.
  if (window.innerWidth < 768) {
    for (const el of document.querySelectorAll("button, a[href], input, select, [role=button]")) {
      if (!VISIBLE(el) || inPrintOnly(el)) continue;
      const r = el.getBoundingClientRect();
      // Inline links inside a paragraph are exempt: they are text, and padding
      // them to 44px would break the sentence they sit in.
      const inProse = el.tagName === "A" && el.closest("p");
      if (inProse) continue;
      if (r.height < tapTargetMin || r.width < tapTargetMin) {
        findings.tapTargets.push({ element: describe(el), size: { w: Math.round(r.width), h: Math.round(r.height) } });
      }
    }
  }

  // 4. Contrast of visible text against its real background.
  if (!skipContrast) {
    for (const el of textLeaves) {
      const s = getComputedStyle(el);
      const fg = parseColor(s.color);
      if (!fg || fg.a < 0.5) continue;
      const size = parseFloat(s.fontSize);
      const bold = Number(s.fontWeight) >= 700;
      // WCAG's large-text threshold: 18.66px bold, or 24px.
      const large = size >= 24 || (bold && size >= 18.66);
      const required = large ? 3 : 4.5;
      const bg = backgroundOf(el);
      const ratio = contrastRatio(fg, bg);
      if (ratio < required) {
        findings.contrast.push({
          element: describe(el), ratio: Math.round(ratio * 100) / 100, required,
          fontSizePx: Math.round(size), bold,
          color: s.color, background: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
        });
      }
    }
  }

  const dedupe = (rows, key) => {
    const seen = new Set();
    return rows.filter(r => { const k = key(r); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  // Contrast is grouped by the colour pair that caused it, not listed per
  // element. A single design decision — text-gray-400 on white — produces
  // dozens of elements, and a report that lists all of them buries the four
  // decisions actually under review. Counted, with one example each.
  const contrastGroups = Object.values(
    findings.contrast.reduce((acc, c) => {
      const key = `${c.color}|${c.background}|${c.fontSizePx}|${c.bold}`;
      acc[key] = acc[key] || { color: c.color, background: c.background, fontSizePx: c.fontSizePx, bold: c.bold, ratio: c.ratio, required: c.required, count: 0, example: c.element };
      acc[key].count++;
      acc[key].ratio = Math.min(acc[key].ratio, c.ratio);
      return acc;
    }, {})
  ).sort((a, b) => a.ratio - b.ratio);

  const violations = [...new Set((window.__qa && window.__qa.violations) || [])];

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    url: location.pathname + location.search,
    title: document.title,
    pageScroll: findings.pageScroll,
    overflow: dedupe(findings.overflow, r => r.element + r.clippedBy),
    overlap: dedupe(findings.overlap, r => r.a + r.b).slice(0, 25),
    tapTargets: dedupe(findings.tapTargets, r => r.element),
    contrastGroups,
    consoleErrors: [...new Set(errors)],
    failedRequests: [...new Set(failedRequests)],
    rlsViolations: violations,
    // Two verdicts, deliberately. `clean` is the regression gate: layout that
    // breaks, requests that fail, permissions that are asked for and refused.
    // Contrast is a standing design question — the palette either meets AA or it
    // does not, and that answer does not change between one run and the next, so
    // holding the gate open on it would make every run fail forever.
    clean:
      !findings.pageScroll &&
      findings.overflow.length === 0 &&
      findings.overlap.length === 0 &&
      errors.length === 0 &&
      failedRequests.length === 0 &&
      violations.length === 0,
    // Standing questions rather than gates, for the same reason: a 36px pill and
    // a grey-400 caption are design decisions that will report identically on
    // every run until somebody changes them, and a gate that is always red is a
    // gate nobody looks at.
    contrastClean: contrastGroups.length === 0,
    tapClean: findings.tapTargets.length === 0,
  };
}

if (typeof window !== "undefined") window.__qaAudit = qaAudit;
