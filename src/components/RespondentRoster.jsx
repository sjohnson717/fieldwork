// Who has answered, at the top of both results tabs.
//
// The shell is shared and the middle columns are not: the team gap tab shows a
// response count and a date, the personal tab shows capability and interest.
// Everything around them was duplicated — the heading, the "N total · N
// completed · N empty" line, Refresh, the status pill, the red tint and
// harder-to-miss Remove on an empty row, and the super-admin gate on Preview.
//
// That gate is the reason this is one component rather than two similar ones.
// It is a permission check, it was written twice, and a fix applied to one copy
// would have left the other open — the same shape as the print-safety rule that
// existed in two places and was forgotten in one.
export default function RespondentRoster({
  respondents,
  // [{ key, label, render(respondent) }] — the type-specific middle columns.
  columns = [],
  // A respondent who registered and answered nothing. Derived differently by
  // each tab, so it comes in as a predicate.
  isEmptyFor,
  onRefresh,
  onRemove,
  canPreview = false,
  onPreview,
  // Extra per-row controls, super-admin gated alongside Preview.
  rowActions,
  // Optional banner between the heading and the table.
  notice,
  emptyMessage = "No responses yet.",
}) {
  const completedCount = respondents.filter(r => r.status === "completed").length;
  const emptyCount = respondents.filter(r => isEmptyFor(r)).length;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Respondents</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {respondents.length} total · {completedCount} completed · {emptyCount} empty
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
        >
          Refresh
        </button>
      </div>

      {notice}

      {respondents.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">{emptyMessage}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 font-medium w-36">Name</th>
              <th className="text-left pb-2 font-medium w-28">Title</th>
              <th className="text-left pb-2 font-medium">Status</th>
              {columns.map(c => (
                <th key={c.key} className="text-left pb-2 font-medium">{c.label}</th>
              ))}
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {respondents.map(r => {
              const isEmpty = isEmptyFor(r);
              return (
                <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${isEmpty ? "bg-red-50/40" : ""}`}>
                  <td className="py-2.5 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2.5 text-gray-500">{r.title}</td>
                  <td className="py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  {columns.map(c => (
                    <td key={c.key} className="py-2.5">{c.render(r, isEmpty)}</td>
                  ))}
                  <td className="py-2.5 pl-2 text-right flex items-center justify-end gap-3">
                    {/* One person's own answers, not an aggregate — the same
                        gate the individual-answers view and the team page's
                        preview use. */}
                    {canPreview && !isEmpty && (
                      <>
                        {rowActions?.(r)}
                        <button
                          onClick={() => onPreview(r)}
                          title="See this person's own report, read-only"
                          className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          Preview
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => onRemove(r)}
                      className={`text-xs transition-colors ${isEmpty ? "text-red-300 hover:text-red-500 font-medium" : "text-gray-300 hover:text-red-400"}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
