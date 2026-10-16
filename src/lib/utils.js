import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// A backend function that fails puts its reason in the response body, but the
// SDK rejects with an axios error whose `message` is only ever the generic
// "Request failed with status code 500". Reading `e.message` therefore discards
// the one useful sentence and shows the user a status code instead.
export function functionErrorMessage(e, fallback = "Something went wrong. Please try again.") {
  const data = e?.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  return data?.error || data?.message || e?.message || fallback;
}

// A Resource's address is free text typed by staff, and it is rendered as a
// link on the respondent-facing report pages, where a `javascript:` address
// would run in the app's own origin and could read the respondent's resume
// token. Only web addresses and site-relative paths are links; anything else
// comes back empty so the caller shows no link at all.
export function safeUrl(value) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  if (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : "";
  } catch {
    return "";
  }
}
