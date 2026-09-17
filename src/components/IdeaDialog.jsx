import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// The suggestion box.
//
// Anyone with a login can file one; nobody is promised anything by filing.
// That is the whole point of it being a box rather than a backlog: the people
// running sessions see what the app is missing long before we do, and the cost
// of writing an idea down should be a minute, not a conversation.
//
// Two questions, and the second is the one that earns its place. An idea
// arrives as a solution — "put the name on the report" — and a solution can
// only be judged against the problem underneath it, which is usually the more
// interesting half and is often solvable another way. Asking for it at the
// point of writing gets an answer; asking a week later gets a shrug.
//
// Where they were is captured rather than asked. It is one more field nobody
// should have to fill in, and the page someone was looking at when they had
// the thought is most of the context anyway.
export default function IdeaDialog({ open, onClose, context }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const titleRef = useRef(null);

  // Two effects, not one. Opening clears the form; Escape has to know whether
  // a save is in flight. Folding them together meant the clear re-ran when
  // `saving` went back to false — which is the moment the save succeeded, so
  // the thank-you was wiped and the form came back empty as though nothing had
  // been sent.
  useEffect(() => {
    if (!open) return;
    setTitle(""); setIdea(""); setProblem(""); setError(""); setSent(false);
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  if (!open) return null;

  const ready = title.trim() && problem.trim();

  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError("");
    try {
      await base44.entities.Idea.create({
        title: title.trim(),
        idea: idea.trim() || undefined,
        problem: problem.trim(),
        context: context || undefined,
        status: "new",
        org_id: user?.org_id || undefined,
      });
      setSent(true);
    } catch (e) {
      console.error("Failed to file the idea", e);
      setError(e?.message || "Could not send it. Try again.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="idea-title">
      <div className="absolute inset-0 bg-gray-900/40" onClick={() => { if (!saving) onClose(); }} />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 id="idea-title" className="text-base font-semibold text-gray-900">
            {sent ? "Thank you" : "Share an idea"}
          </h2>
          {!sent && (
            <p className="text-xs text-gray-500 mt-0.5">
              Anything the app should do and doesn&rsquo;t. We read every one, and we build the ones we can.
            </p>
          )}
        </div>

        {sent ? (
          // Said plainly, because the honest answer is the useful one: it has
          // been written down and read, and that is all that has happened.
          <div className="px-6 py-6 space-y-3">
            <p className="text-sm text-gray-700">It&rsquo;s written down and we&rsquo;ll read it.</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Not every idea gets built, and the ones that do are usually the ones where the
              problem underneath turned out to be shared. Anything we do build shows up in
              What&rsquo;s new.
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto px-6 py-5 space-y-4">
            <div>
              <label htmlFor="idea-name" className="block text-xs font-medium text-gray-500 mb-1.5">
                In a few words
              </label>
              <input
                id="idea-name"
                ref={titleRef}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Put the report's name on the report"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
            </div>

            <div>
              <label htmlFor="idea-problem" className="block text-xs font-medium text-gray-500 mb-1.5">
                What problem does it solve?
              </label>
              <textarea
                id="idea-problem"
                rows={3}
                value={problem}
                onChange={e => setProblem(e.target.value)}
                placeholder="What goes wrong today, and for whom."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
              <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                The most useful thing you can tell us. An idea can be built several ways, and
                the problem is what decides which.
              </p>
            </div>

            <div>
              <label htmlFor="idea-what" className="block text-xs font-medium text-gray-500 mb-1.5">
                What would you like to see? <span className="text-gray-400 font-normal">&mdash; optional</span>
              </label>
              <textarea
                id="idea-what"
                rows={3}
                value={idea}
                onChange={e => setIdea(e.target.value)}
                placeholder="How you picture it working, if you have a picture."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {sent ? "Close" : "Cancel"}
          </button>
          {!sent && (
            <button
              onClick={submit}
              disabled={!ready || saving}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-[#3366FF] hover:bg-[#2952CC] text-white disabled:opacity-50 transition-colors"
            >
              {saving ? "Sending…" : "Send it"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
