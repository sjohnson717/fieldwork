import { useEffect } from "react";

/**
 * Keeps the address out of the browser's printed header.
 *
 * `@page { margin: 0 }` suppresses that header in Chrome, which is why it is
 * there — the pages that print are the three token-authenticated ones, and on
 * all of them the URL *is* the credential. Safari does not honour it. It prints
 * its own header and footer on every sheet, and a respondent's saved PDF came
 * back carrying
 *
 *   https://quartzassessments.com/assess?t=<their resume token>
 *
 * on all six pages — a link that reopens and edits their answers, stamped onto
 * the document they are invited to send to a manager or a coach.
 *
 * The header shows whatever the address bar holds when printing starts, so the
 * address is reduced to the bare origin for the duration and put back after.
 * `replaceState` fires no popstate, so the router never sees it and no page
 * re-reads its token; the restore returns the exact href either way.
 *
 * Restoring also happens on focus, because a print dialog dismissed in ways
 * that skip `afterprint` would otherwise leave someone's resume link out of
 * their address bar — which is the one place they are told to bookmark it from.
 */
export function usePrintSafeUrl() {
  useEffect(() => {
    let stripped = null;

    const strip = () => {
      if (stripped) return;
      stripped = window.location.href;
      window.history.replaceState({}, "", window.location.origin + "/");
    };

    const restore = () => {
      if (!stripped) return;
      window.history.replaceState({}, "", stripped);
      stripped = null;
    };

    window.addEventListener("beforeprint", strip);
    window.addEventListener("afterprint", restore);
    window.addEventListener("focus", restore);
    return () => {
      restore();
      window.removeEventListener("beforeprint", strip);
      window.removeEventListener("afterprint", restore);
      window.removeEventListener("focus", restore);
    };
  }, []);
}
