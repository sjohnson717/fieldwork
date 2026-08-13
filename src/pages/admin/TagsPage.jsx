import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { functionErrorMessage } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

// Managing the tag list itself, as opposed to which tags an assessment carries.
//
// Removing a tag from an assessment — the × on a chip in TagPicker — edits the
// assessment and leaves the tag alone, which is right: a grouping outlives any
// one engagement in it. The consequence is that the picker's list only ever
// grows, and a typo or a client that never happened stays in front of everyone
// choosing tags forever. This is where those come off the list for good.
//
// Deliberately not in the picker. Deleting a shared grouping and un-tagging one
// assessment are different sizes of action, and putting them a few pixels apart
// invites the second click to do the first thing.
export default function TagsPage() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deletingTag, setDeletingTag] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => { loadTags(); }, []);

  // Via listTags, not Tag.list: the usage count has to be taken across every
  // assessment, including ones this account cannot read. Counted from here, a
  // tag used only by another consultant's engagement would show as unused.
  const loadTags = async () => {
    setLoading(true);
    setLoadError("");
    setDeleteError("");
    try {
      const res = await base44.functions.invoke("listTags", {});
      const error = res?.data?.error;
      if (error) throw new Error(error);
      setTags(res.data.tags || []);
    } catch (e) {
      console.error("Failed to load tags", e);
      setLoadError(functionErrorMessage(e, "Failed to load tags."));
    }
    setLoading(false);
  };

  const handleDelete = async (tag) => {
    setDeletingTag(null);
    setDeletingId(tag.id);
    setDeleteError("");
    try {
      const res = await base44.functions.invoke("deleteTag", { tagId: tag.id });
      const error = res?.data?.error;
      if (error) throw new Error(error);
      setTags(prev => prev.filter(t => t.id !== tag.id));
    } catch (e) {
      console.error("Failed to delete tag", e);
      // The refusal names how many assessments still carry the tag, and it
      // arrives in the response body — the axios error's own message is only
      // the status code.
      setDeleteError(functionErrorMessage(e, "Failed to delete the tag."));
    }
    setDeletingId(null);
  };

  const unusedCount = tags.filter(t => t.assessment_count === 0).length;

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Tags</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {tags.length} tag{tags.length !== 1 ? "s" : ""}
              {unusedCount > 0 && <span className="ml-2">· {unusedCount} unused</span>}
            </p>
          </div>
          <button onClick={loadTags} className="text-xs text-gray-400 hover:text-[#3366FF] transition-colors">Refresh</button>
        </div>

        <p className="text-xs text-gray-400 px-6 py-3 border-b border-gray-100">
          Tags are created from an assessment's Overview tab. Removing one there
          takes it off that assessment; deleting it here takes it off the list
          everyone picks from, which is only possible once nothing uses it.
        </p>

        {loadError && <p className="text-xs text-red-500 px-6 py-3">{loadError}</p>}
        {deleteError && <p className="text-xs text-red-500 px-6 py-3">{deleteError}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No tags yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Tag</th>
                <th className="text-left px-4 py-3 font-medium">Used on</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {tags.map(tag => (
                <tr key={tag.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">{tag.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {tag.assessment_count === 0 ? (
                      <span className="text-gray-400 italic">Not used</span>
                    ) : (
                      // A count, not a list of titles: which engagements those
                      // are is another organization's business.
                      <span>{tag.assessment_count} assessment{tag.assessment_count !== 1 ? "s" : ""}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Offered only on a tag nothing uses. The function refuses
                        a used one regardless — it counts assessments this page
                        never sees — but a control whose only outcome is an
                        explanation is worse than no control on that row. */}
                    {tag.assessment_count === 0 && (
                      <button
                        onClick={() => setDeletingTag(tag)}
                        disabled={deletingId === tag.id}
                        className="text-xs font-medium text-gray-300 hover:text-red-400 disabled:opacity-40 transition-colors"
                      >
                        {deletingId === tag.id ? "…" : "Delete"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ConfirmDialog
        open={!!deletingTag}
        destructive
        title="Delete this tag?"
        message={`${deletingTag?.name} is not on any assessment, and deleting it can't be undone. If an assessment picked it up since this list loaded, the delete is refused rather than stripping the tag off it.`}
        confirmLabel="Delete tag"
        onConfirm={() => handleDelete(deletingTag)}
        onCancel={() => setDeletingTag(null)}
      />
    </div>
  );
}
