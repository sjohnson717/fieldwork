import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatReleaseDate } from "@/lib/release-notes";

// The announcement bar across the top of /admin. Shown while anything in
// public/release-notes.md is unread, and names the newest of it rather than listing it
// all: a bar is one line, and What's new is where the rest is read.
export function ReleaseNotesBar({ unread, onOpen, onDismiss }) {
  if (unread.length === 0) return null;
  const [newest] = unread;
  const more = unread.length - 1;
  return (
    <div className="sticky top-0 z-30 bg-blue-600 text-white print:hidden" role="region" aria-label="New in Quartz Assessment">
      {/* A fixed height, because AdminPage sizes the sticky sidebar below it
          by exactly this much. Change one, change RELEASE_BAR_OFFSET too. */}
      <div className="flex items-center gap-3 h-10 px-4 sm:px-6 text-sm">
        <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">New</span>
        {/* The count only where there is room for it: on a phone "and 15 more
            updates" is cut off anyway, and a title cut short to fit it reads
            worse than the title alone. */}
        <p className="min-w-0 flex-1 truncate font-semibold">
          {newest.title}
          {more > 0 && <span className="hidden sm:inline font-normal text-blue-100"> and {more} more {more === 1 ? "update" : "updates"}</span>}
        </p>
        <button
          onClick={onOpen}
          className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
        >
          What's new
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-blue-100 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Every release note, newest first. `newIds` is what was unread when the dialog
// opened, held by the caller: opening marks everything read, and badges that
// vanished the moment they rendered would tell nobody anything.
export function ReleaseNotesDialog({ notes, open, onOpenChange, newIds }) {
  const isNew = new Set(newIds);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What's new in Quartz Assessment</DialogTitle>
          <DialogDescription>The major capabilities we've added, newest first.</DialogDescription>
        </DialogHeader>
        <ol className="divide-y divide-gray-100">
          {notes.map(note => (
            <li key={note.id} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1.5">
                <h3 className="text-base font-bold text-gray-900">{note.title}</h3>
                {isNew.has(note.id) && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">New</span>
                )}
                <span className="ml-auto text-xs text-gray-400">{formatReleaseDate(note.date)}</span>
              </div>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                className="prose prose-sm max-w-none prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-2 prose-strong:text-gray-900 prose-li:text-gray-600"
              >
                {note.body}
              </ReactMarkdown>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

// Holds the dialog's open state and its snapshot of what was new, so AdminPage
// only has to own the read list itself.
export function useReleaseNotesDialog(unread, markRead) {
  const [open, setOpen] = useState(false);
  const [newIds, setNewIds] = useState([]);
  const openDialog = () => {
    setNewIds(unread.map(n => n.id));
    setOpen(true);
    if (unread.length > 0) markRead();
  };
  return { open, setOpen, newIds, openDialog };
}
