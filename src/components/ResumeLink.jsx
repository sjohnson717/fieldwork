import { useState } from "react";
import { resumeLinkFor } from "@/lib/token-address";

// A respondent's own link, rendered as copyable text.
//
// This is the one control that hands over write access to someone's answers,
// and it exists in three places — mid-survey, on the team gap report, and on
// the personal profile. It lives in one component so those three cannot drift
// apart, and in particular so `no-print` cannot be forgotten on one of them.
//
// Why it is text on the page rather than the address bar: the address used to
// carry ?t=…, and iOS Safari printed it into the footer of every saved sheet —
// a working edit link on a document people forward to a manager. See
// src/lib/token-address.js. On the page it can be marked no-print, and it can
// say what it does, which an address bar cannot.
//
// Never render this where someone is looking at another person's submission
// (the facilitator's preview). Callers guard that; this component cannot know.
export default function ResumeLink({ token, description, className = "" }) {
  const [copied, setCopied] = useState(false);
  if (!token) return null;

  const link = resumeLinkFor(token);

  const copy = () => {
    // Clipboard access is refused in some embedded and non-secure contexts.
    // The link is selectable text either way, so a failure is survivable and
    // must not throw into the render.
    Promise.resolve(navigator.clipboard?.writeText(link))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className={`no-print ${className}`}>
      <p className="text-xs text-gray-500 mb-1.5">
        {description
          || "Bookmark your own link to come back to this and update it at any time. It's yours — anyone with it can change your answers."}
      </p>
      <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
        <p className="text-[11px] text-gray-500 font-mono flex-1 truncate">{link}</p>
        <button
          onClick={copy}
          className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
