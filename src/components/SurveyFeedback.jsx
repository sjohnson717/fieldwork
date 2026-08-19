import { useState } from "react";
import { base44 } from "@/api/base44Client";
import ConfirmDialog from "@/components/ConfirmDialog";

// The two closing questions from the end of the survey, read on the admin side
// only.
//
// These are the only free text the survey collects, and they are collected to
// improve the instrument rather than to report on a team. They are deliberately
// absent from the buyer report, the team leader dashboard and the discussion —
// enforced in publicAssessment, which names the respondent fields each of those
// payloads returns and does not name these. This component is the one place
// they are read, and it is behind the admin area.
//
// The questions are asked of every respondent, so the answers arrive attached
// to a name. That is fine here and nowhere else.

const QUESTIONS = [
  {
    field: "closing_comments",
    label: "What else do you want to tell us?",
  },
  {
    field: "missing_coverage",
    label: "Anything you do that we didn't ask about?",
  },
];

export default function SurveyFeedback({ respondents, onChange }) {
  // { id, field, label, name } — the comment awaiting a confirmed clear.
  const [clearing, setClearing] = useState(null);
  const [busy, setBusy] = useState(false);

  const withFeedback = respondents.filter(
    r => QUESTIONS.some(q => (r[q.field] || "").trim()),
  );

  // Nothing written yet is the normal state for a fresh assessment, and an
  // empty panel headed "Survey feedback" reads as a broken one.
  if (withFeedback.length === 0) return null;

  // Clearing is a write a respondent could not make for themselves — they have
  // no account — so it happens here rather than being left to the Builder's
  // data view. It is the removal half of a feature that accumulates text: one
  // recognisable or ill-judged paragraph should be deletable in the app, by the
  // person who can see it.
  const handleClear = async () => {
    setBusy(true);
    try {
      await base44.entities.Respondent.update(clearing.id, { [clearing.field]: null });
      onChange?.(clearing.id, clearing.field);
    } catch (e) {
      console.error("Failed to clear feedback", e);
    }
    setBusy(false);
    setClearing(null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900">Survey feedback</h3>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        Written at the end of the survey, for improving the assessment. Not shown
        to the buyer, the team leader, or in the discussion.
      </p>

      <div className="space-y-5">
        {withFeedback.map(r => (
          <div key={r.id} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
            <p className="text-sm font-semibold text-gray-900">
              {r.name}
              {r.title && <span className="font-normal text-gray-400"> · {r.title}</span>}
            </p>
            {QUESTIONS.map(q => {
              const text = (r[q.field] || "").trim();
              if (!text) return null;
              return (
                <div key={q.field} className="mt-3">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {q.label}
                    </p>
                    <button
                      onClick={() => setClearing({ id: r.id, field: q.field, label: q.label, name: r.name })}
                      className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                  {/* Respondents write paragraphs and line breaks; rendering
                      them as one run-on block loses what they meant by them. */}
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{text}</p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!clearing}
        title="Clear this comment?"
        message={
          clearing
            ? `${clearing.name}'s answer to "${clearing.label}" will be deleted. This can't be undone.`
            : ""
        }
        confirmLabel="Clear"
        destructive
        busy={busy}
        onConfirm={handleClear}
        onCancel={() => { if (!busy) setClearing(null); }}
      />
    </div>
  );
}
