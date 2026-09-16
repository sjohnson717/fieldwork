import { useCommandState } from "cmdk";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { STATUS_COLORS, badgeFor, UnreadBadge } from "@/pages/admin/assessment-labels";

// ⌘K from anywhere in /admin: jump straight to an assessment without going
// back through the Assessments page. That page is where you look around; this
// is for when you already know which one you want and are halfway through
// something else — reading one client's Results and needing another's.
//
// Opens on Recent with nothing typed, because "the one I was just in" is the
// commonest answer. Typing searches every assessment the user can see on the
// same fields as the Assessments page.

export default function AssessmentSwitcher({
  open, onOpenChange, assessments, recent, tags, instrumentOf, unreadFor,
  onOpenAssessment, onGoHome, onNew,
}) {
  const choose = (fn) => { onOpenChange(false); fn(); };

  const keywordsFor = (a) => [
    a.title || "",
    a.company_name || "",
    a.access_code || "",
    ...(a.tag_ids || []).map(id => tags.find(t => t.id === id)?.name || ""),
  ].filter(Boolean);

  const renderRow = (a, prefix) => {
    const badge = badgeFor(a, instrumentOf(a));
    const unread = unreadFor(a);
    return (
      <CommandItem
        key={`${prefix}-${a.id}`}
        // The value only has to be unique — titles are not — and matching
        // ignores it; see matchKeywords.
        value={`${prefix}:${a.id}`}
        keywords={keywordsFor(a)}
        onSelect={() => choose(() => onOpenAssessment(a.id, unread ? "Results" : "Overview"))}
        className="gap-2 py-2"
      >
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.tone}`}>{badge.label}</span>
        <span className="truncate text-gray-900">{a.title}</span>
        {a.company_name && <span className="truncate text-xs text-gray-400">{a.company_name}</span>}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <UnreadBadge count={unread} />
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[a.status] || STATUS_COLORS.draft}`}>{a.status}</span>
        </span>
      </CommandItem>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-xl top-[15%] translate-y-0 data-[state=open]:slide-in-from-top-[10%]">
        <DialogTitle className="sr-only">Find an assessment</DialogTitle>
        <Command
          filter={matchKeywords}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-gray-400"
        >
          <CommandInput placeholder="Find an assessment by name, client, tag or code" />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No assessments match.</CommandEmpty>
            <SearchAware>
              {(query) => (
                <>
                  {!query && recent.length > 0 && (
                    <CommandGroup heading="Recent">
                      {recent.map(a => renderRow(a, "recent"))}
                    </CommandGroup>
                  )}
                  {query && (
                    <CommandGroup heading="Assessments">
                      {assessments.map(a => renderRow(a, "all"))}
                    </CommandGroup>
                  )}
                </>
              )}
            </SearchAware>
            <CommandGroup heading="Go to">
              <CommandItem value="action:home" keywords={["all assessments", "home"]} onSelect={() => choose(onGoHome)}>
                All assessments
              </CommandItem>
              <CommandItem value="action:new" keywords={["new assessment", "create"]} onSelect={() => choose(onNew)}>
                New assessment
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// The same rule as the Assessments page's search box: every typed word must
// appear somewhere in the title, client, access code or tag names, in any
// order. cmdk's default fuzzy scoring would also match scattered letters, so
// "sas" would find anything with an s, an a and an s in it — and the two
// search boxes in one app would disagree about what matches.
function matchKeywords(_value, search, keywords = []) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  const haystack = keywords.join(" ").toLowerCase();
  return terms.every(t => haystack.includes(t)) ? 1 : 0;
}

// Reads the typed query out of cmdk's store, so the list can show Recent when
// the box is empty and every assessment once something is typed. Listing all
// of them under an empty box would put a super-admin's hundred rows between
// the cursor and the actions.
function SearchAware({ children }) {
  const query = useCommandState(state => state.search);
  return children(query.trim());
}
