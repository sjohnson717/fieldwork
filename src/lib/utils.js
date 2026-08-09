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
