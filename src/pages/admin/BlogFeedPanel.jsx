import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { functionErrorMessage } from "@/lib/utils";

// "New from the blog": posts in the Wix RSS feed that are not yet a resource.
//
// Nothing is imported automatically. A resource attached to no activity never
// reaches a report, and choosing the activities is the part that needs a
// person — so Add only fills in the form, and the post leaves this list once
// that form is saved. A post that does not belong in Quartz is skipped, and
// the skip is stored (SkippedPost) so it is not offered again on the next
// visit or to the next person. Skipping is undone from the same panel.

// Addresses are compared loosely: the feed and a hand-typed resource can differ
// by scheme, "www.", a trailing slash, or a tracking query.
export const sameAddress = (url) =>
  String(url || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

export default function BlogFeedPanel({ resources, onAdd, onClose }) {
  const [posts, setPosts] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyUrl, setBusyUrl] = useState(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [res, skips] = await Promise.all([
        base44.functions.invoke("fetchBlogFeed", {}),
        base44.entities.SkippedPost.list("-created_date"),
      ]);
      setPosts(res?.data?.posts || []);
      setSkipped(skips);
    } catch (e) {
      console.error("Failed to read the blog feed", e);
      setError(functionErrorMessage(e, "The blog feed could not be read."));
    }
    setLoading(false);
  };

  // Loaded when the panel opens rather than with the tab: the feed is a round
  // trip to Wix, and most visits to Resources are not looking for new posts.
  useEffect(() => { load(); }, []);

  const known = new Set(resources.map(r => sameAddress(r.url)).filter(Boolean));
  const skippedAddresses = new Set(skipped.map(s => sameAddress(s.url)));
  const fresh = (posts || []).filter(p => !known.has(sameAddress(p.url)) && !skippedAddresses.has(sameAddress(p.url)));

  const skip = async (post) => {
    setBusyUrl(post.url);
    setError("");
    try {
      const created = await base44.entities.SkippedPost.create({ url: post.url, title: post.title });
      setSkipped(prev => [created, ...prev]);
    } catch (e) {
      console.error("Failed to skip post", e);
      setError(functionErrorMessage(e, "The post could not be skipped."));
    }
    setBusyUrl(null);
  };

  const unskip = async (skip) => {
    setBusyUrl(skip.url);
    setError("");
    try {
      await base44.entities.SkippedPost.delete(skip.id);
      setSkipped(prev => prev.filter(s => s.id !== skip.id));
    } catch (e) {
      console.error("Failed to restore post", e);
      setError(functionErrorMessage(e, "The post could not be restored."));
    }
    setBusyUrl(null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-800">New from the blog</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto -mr-2 w-11 h-11 md:w-8 md:h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500">
          {error}{" "}
          <button onClick={load} className="underline hover:text-red-700">Try again</button>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : posts && (
        fresh.length === 0 ? (
          <p className="text-xs text-gray-400">
            Every post in the feed is already a resource or has been skipped. The feed holds the newest {posts.length} posts;
            a post published recently can take a while to appear.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {fresh.map(p => (
              <li key={p.url} className="py-2.5 flex flex-col md:flex-row md:items-start gap-2 md:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">{p.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {[formatDate(p.published), p.categories.join(", ")].filter(Boolean).join(" · ")}
                  </p>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onAdd(p)}
                    disabled={busyUrl === p.url}
                    className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 h-11 md:h-8 rounded-lg transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => skip(p)}
                    disabled={busyUrl === p.url}
                    className="text-sm text-gray-400 hover:text-gray-700 disabled:opacity-50 px-3 h-11 md:h-8 rounded-lg transition-colors"
                  >
                    {busyUrl === p.url ? "Skipping…" : "Skip"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {skipped.length > 0 && (
        <div className="border-t border-gray-100 pt-2">
          <button
            onClick={() => setShowSkipped(s => !s)}
            className="text-xs text-gray-400 hover:text-gray-700 min-h-[44px] md:min-h-0"
          >
            {showSkipped ? "Hide" : "Show"} {skipped.length} skipped {skipped.length === 1 ? "post" : "posts"}
          </button>
          {showSkipped && (
            <ul className="mt-1 space-y-1">
              {skipped.map(s => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">{s.title || s.url}</span>
                  <button
                    onClick={() => unskip(s)}
                    disabled={busyUrl === s.url}
                    className="text-xs text-gray-400 hover:text-[#3366FF] disabled:opacity-50 px-2 h-11 md:h-7 shrink-0"
                  >
                    {busyUrl === s.url ? "Restoring…" : "Offer again"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
