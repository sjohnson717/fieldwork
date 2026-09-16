import { Pin, PinOff } from "lucide-react";

// The labels an assessment carries wherever it is listed — the Assessments
// page, the sidebar's recent list and the ⌘K switcher. One copy, so the three
// cannot drift into calling the same assessment different things.

export const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-500",
  active: "bg-green-100 text-green-700",
  closed: "bg-red-100 text-red-600",
};

// Every assessment says which kind it is. Only "Personal" used to be labelled,
// on the reasoning that team gap is the default and the default needs no badge
// — but a missing badge is not a statement, it's an absence, and the reader has
// to know the rule to decode it. A list where one row is tagged and the next is
// bare reads as "this one is special", not "these are two kinds".
//
// The type also decides which questions get asked and which results view opens,
// so it is worth reading at a glance from the list rather than after a click.
//
// Rounded-md, against the status pill's rounded-full: shape carries the
// distinction, so the two never read as the same kind of label even when teal
// sits near the green of "active".
const TYPE_BADGE = {
  team_gap: { label: "Team",     tone: "text-teal-700 bg-teal-50" },
  personal: { label: "Personal", tone: "text-indigo-600 bg-indigo-50" },
};

// Absent means team_gap — the field was added after the first assessments
// existed, and the Assessment schema documents the same default.
export const assessmentType = (a) => (a.assessment_type === "personal" ? "personal" : "team_gap");

// An instrument names itself, and the four imported ones are neither Team nor
// Personal — labelling a Chaos Assessment "Team" because assessment_type is
// absent would be worse than the unlabelled rows this badge was added to fix.
//
// Short: the first word of the instrument's name is enough to tell six apart,
// and the row already carries the full title beside it.
export const badgeFor = (assessment, instrument) => {
  if (!instrument) return TYPE_BADGE[assessmentType(assessment)];
  if (instrument.question_source === "library") {
    return TYPE_BADGE[instrument.report_style === "profile" ? "personal" : "team_gap"];
  }
  return { label: instrument.name.split(" ")[0], tone: "text-amber-700 bg-amber-50" };
};

// The red count, as a messaging app shows unread. Nothing at zero: a "0" on
// every quiet row is noise that trains people to stop looking at the column.
export function UnreadBadge({ count, className = "" }) {
  if (!count) return null;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold tabular-nums leading-none ${className}`}
      aria-label={`${count} new ${count === 1 ? "response" : "responses"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Pin and unpin, wherever an assessment is shown with room for a control: its
// own header, and its row on the Assessments page. Not in the sidebar rows
// themselves — a control on a one-line link is a mis-click waiting to happen,
// and the header of the assessment you just opened is one click away.
//
// Says what it will do, in words beside the icon in the header, and in its
// accessible name everywhere, because a pin icon alone reads as a location
// marker to anyone who has not met the convention.
export function PinButton({ pinned, onToggle, compact = false, className = "" }) {
  const Icon = pinned ? PinOff : Pin;
  const label = pinned ? "Unpin from sidebar" : "Pin to sidebar";
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        compact ? "p-1" : "px-2 py-1 text-xs font-medium border"
      } ${
        pinned
          ? `text-blue-700 ${compact ? "" : "border-blue-200 bg-blue-50 hover:bg-blue-100"}`
          : `text-gray-400 hover:text-gray-700 ${compact ? "" : "border-gray-200 bg-white hover:border-gray-300"}`
      } ${className}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {!compact && (pinned ? "Pinned" : "Pin")}
    </button>
  );
}
