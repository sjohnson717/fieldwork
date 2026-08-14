// Keeping the token out of the address bar.
//
// Every page here is authenticated by its URL, and that URL is printed. iOS
// Safari saves a PDF with the full address in the footer of every sheet — a
// respondent's copy came back stamped
//
//   https://quartzassessments.com/assess?t=<their resume token>
//
// on all six pages, which is a working edit link to their answers riding on the
// document they are invited to send to a manager.
//
// usePrintSafeUrl was the first attempt: strip the address on `beforeprint`, put
// it back on `afterprint`. That protects Chrome and desktop Safari and does
// nothing at all on iOS, because the share-sheet route to a PDF never fires
// those events. The protection existed only where it had been tested — the same
// mistake as the `@page { margin: 0 }` rule it was written to replace.
//
// There is no event to hook, so the address simply stops carrying the
// credential. The token is read once on arrival, moved into sessionStorage, and
// the address is rewritten without it. Nothing can print, screenshot, mirror to
// a projector, or read over a shoulder what is not there.
//
// What this costs: the address bar is no longer the thing to bookmark. The
// report screens carry the resume link as copyable text instead, marked
// no-print, which is a better place for it anyway — it can say what the link
// does, and a print cannot take it.
//
// sessionStorage, not localStorage: the credential should not outlive the tab.
// A refresh keeps working, a new tab needs the emailed link, and a shared
// machine keeps nothing after the tab closes.

const keyFor = (kind) => `quartz.token.${kind}`;

// sessionStorage throws in Safari's private mode and when storage is
// disabled. A page that cannot remember the token is still a page that must
// render, so every access degrades to "no token remembered".
const remember = (kind, token) => {
  try {
    sessionStorage.setItem(keyFor(kind), token);
  } catch {
    // Nothing to do: the token stays in memory for this render, and a reload
    // will ask for the original link.
  }
};

const recall = (kind) => {
  try {
    return sessionStorage.getItem(keyFor(kind)) || null;
  } catch {
    return null;
  }
};

/**
 * Takes the token for one surface and clears it from the address.
 *
 * `kind` scopes the storage so a respondent's token can never be recalled by
 * the buyer report or the team dashboard: three different credentials with three
 * different grants, and a page should only be able to recover its own.
 *
 * Returns the token to use — from the URL on arrival, or from this tab's
 * storage on a refresh of an already-cleaned address. Null when neither has one,
 * which is the caller's cue to show its "link not valid" state.
 *
 * `replaceState` fires no popstate, so the router does not re-run and no page
 * re-reads its params. The route stays matched by the address it arrived on.
 */
export function claimToken(kind, tokenFromUrl, cleanPath) {
  if (tokenFromUrl) {
    remember(kind, tokenFromUrl);
    // Only rewrite when there is something to hide. Rewriting unconditionally
    // would clear a path the caller may still need on a reload.
    if (cleanPath && window.location.pathname + window.location.search !== cleanPath) {
      window.history.replaceState({}, "", cleanPath);
    }
    return tokenFromUrl;
  }
  return recall(kind);
}

/** The respondent's own resume link, built for display rather than navigation. */
export const resumeLinkFor = (token) => `${window.location.origin}/assess?t=${token}`;

export const forgetToken = (kind) => {
  try {
    sessionStorage.removeItem(keyFor(kind));
  } catch {
    // Same as above: nothing recoverable, and nothing that should stop a render.
  }
};
