import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { loadResultsData, deleteRespondentCascade } from "@/lib/respondents";
import { loadInstrument, orderQuestions } from "@/lib/instruments";
import RespondentRoster from "@/components/RespondentRoster";
import RespondentPreview from "@/components/RespondentPreview";
import InstrumentReport from "@/components/InstrumentReport";
import ConfirmDialog from "@/components/ConfirmDialog";

// The facilitator's results tab for an instrument that asks its own questions.
//
// Deliberately thin. It is the roster — who has answered, and the standing note
// that individual answers stay in the room — followed by the same report the
// buyer's link renders, drawn the same way. There is no third view of the same
// numbers written for this screen, and no second drawing of them either: a
// report the facilitator reads and a report the client reads that disagree in
// any detail — the numbers, or the picture of them — is worse than one report
// seen twice.
//
// The gap tab next door offers importance/execution/gap views because those are
// genuinely different cuts of a two-axis instrument. One axis has one cut.
export default function InstrumentResults({ assessment }) {
  const [instrument, setInstrument] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [respondents, setRespondents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [removingRespondent, setRemovingRespondent] = useState(null);
  const [previewRespondent, setPreviewRespondent] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setIsSuperAdmin(u?.role === "admin")).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ activities, respondents: resps, responses: ress }, inst] = await Promise.all([
        loadResultsData(assessment),
        loadInstrument(assessment),
      ]);
      setInstrument(inst);
      setQuestions(inst ? orderQuestions(inst, activities) : activities);
      setRespondents(resps);
      setResponses(ress);
    } catch (e) {
      console.error("Failed to load results", e);
    }
    setLoading(false);
  };

  const handleDeleteRespondent = async (id) => {
    setRemovingRespondent(null);
    try {
      await deleteRespondentCascade(id);
      setRespondents(prev => prev.filter(r => r.id !== id));
      setResponses(prev => prev.filter(r => r.respondent_id !== id));
    } catch (e) {
      console.error("Failed to delete respondent", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
      </div>
    );
  }

  if (!instrument) {
    return <div className="p-8 text-center text-sm text-gray-400">This assessment has no instrument.</div>;
  }

  const answeredCount = {};
  for (const r of responses) {
    if (r.answer || r.answer_text) answeredCount[r.respondent_id] = (answeredCount[r.respondent_id] || 0) + 1;
  }

  // Only finished submissions are reported, matching the buyer report exactly.
  // A half-finished set would otherwise move every distribution it touches
  // while being counted as a whole participant.
  const completed = respondents.filter(r => r.status === "completed");
  const completedIds = new Set(completed.map(r => r.id));
  const scored = responses.filter(r => completedIds.has(r.respondent_id));

  const rowsByActivity = {};
  for (const row of scored) (rowsByActivity[row.activity_id] ||= []).push(row);

  return (
    <div className="p-8 space-y-8">
      <RespondentRoster
        respondents={respondents}
        isEmptyFor={r => !answeredCount[r.id]}
        onRefresh={loadData}
        onRemove={setRemovingRespondent}
        canPreview={isSuperAdmin}
        onPreview={setPreviewRespondent}
        columns={[
          {
            key: "answered",
            label: "Answered",
            render: r => (
              <span className="tabular-nums">
                {answeredCount[r.id] || 0} of {questions.length}
              </span>
            ),
          },
        ]}
      />

      {completed.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">
            The report appears once somebody has finished. Answers from people still part-way
            through are held back rather than moving the numbers as they go.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <InstrumentReport
            instrument={instrument}
            assessment={assessment}
            questions={questions}
            responsesByActivity={rowsByActivity}
            respondentCount={respondents.length}
            completedCount={completed.length}
          />
        </div>
      )}

      {previewRespondent && (
        // The respondent's own page, as they saw it, through the same overlay
        // the other two results tabs use. This tab had its own copy of it,
        // which was white and read correctly but was not portalled and never
        // set the class the print rules key on — so saving a PDF from here
        // would have printed the admin page underneath and repeated the fixed
        // overlay on every sheet, the exact failure RespondentPreview exists to
        // stop.
        //
        // No resume token is fetched or shown: it is the credential that
        // rewrites their answers, not a viewing key, which is why
        // listRespondents withholds it and why nothing here passes one.
        <RespondentPreview
          assessment={assessment}
          respondent={previewRespondent}
          activities={questions}
          responses={responses}
          instrument={instrument}
          onClose={() => setPreviewRespondent(null)}
        />
      )}

      <ConfirmDialog
        open={!!removingRespondent}
        destructive
        title="Remove this respondent?"
        message={`${removingRespondent?.name} and all their answers will be deleted. This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={() => handleDeleteRespondent(removingRespondent.id)}
        onCancel={() => setRemovingRespondent(null)}
      />
    </div>
  );
}
