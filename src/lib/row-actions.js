// Edit / Disable / Delete on a list row, revealed on hover.
//
// A touchscreen never hovers, so on an iPhone or iPad those buttons stayed
// invisible and the row could not be changed at all. The media query asks the
// device, not the screen width: where hover exists the actions keep their old
// place at the end of the row, hidden until the pointer arrives; where it does
// not, they are always shown on a line of their own under the row, at the 44px
// a thumb needs. The row itself takes ROW so that line can wrap.

export const ROW = "flex-wrap [@media(hover:hover)]:flex-nowrap";

export const ROW_ACTIONS =
  "flex items-center gap-2 shrink-0 w-full -my-1.5 [@media(hover:hover)]:my-0 " +
  "[@media(hover:hover)]:w-auto [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity";

// Where the row starts with a drag handle, line the actions up under the text.
export const PAST_HANDLE = "pl-7 [@media(hover:hover)]:pl-0";

export const ACTION =
  "flex items-center text-sm h-11 px-3 first:-ml-3 " +
  "[@media(hover:hover)]:text-xs [@media(hover:hover)]:h-auto [@media(hover:hover)]:px-0 [@media(hover:hover)]:first:ml-0";

// The faint Delete is fine beside a hover; shown all the time on a phone it
// read as disabled.
export const DELETE_TONE = "text-gray-400 [@media(hover:hover)]:text-gray-300";
