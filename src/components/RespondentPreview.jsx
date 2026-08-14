import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { computePersonProfile } from "@/lib/personal-scoring";
import { rebuildResponses } from "@/lib/responses";
import PersonalProfileReport from "@/components/PersonalProfileReport";
import TeamGapSelfReport from "@/components/TeamGapSelfReport";

// The respondent's own end-of-assessment page, as the facilitator sees it.
//
// It renders the same two components the respondent's page renders, from the
// admin's already-loaded activities and responses — no respondent token is
// fetched, sent, or shown. That is the whole design: the token is not a viewing
// key but the resume credential, and anyone holding it can rewrite the answers
// it opens. listRespondents deliberately withholds it, and this preview is the
// answer to "can I see what they saw" that doesn't ask for it back.
//
// Consequently nothing here can write. The children are passed readOnly, which
// drops Revise, Done, and the resume link; what remains is the summary, the
// answers, and Save as PDF.
export default function RespondentPreview({ assessment, respondent, activities, responses, onClose }) {
  const isPersonal = assessment?.assessment_type === "personal";
  const [resources, setResources] = useState([]);

  // Same lazy fetch, and same silent failure, as the respondent's page: an
  // empty list drops the Suggested Resources section rather than breaking the
  // report around it.
  useEffect(() => {
    if (!isPersonal) return;
    base44.entities.Resource
      .filter({ active: true }, "sort_order")
      .then(setResources)
      .catch(() => setResources([]));
  }, [isPersonal]);

  // Escape closes it. This covers the whole screen, so the usual way out of a
  // full-page overlay should work without hunting for the button.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mine = responses.filter(r => r.respondent_id === respondent.id);
  const keyed = rebuildResponses(mine);

  const profile = isPersonal
    ? computePersonProfile(
        activities,
        activities.map(act => ({
          ...(keyed[act.id] || {}),
          activity_id: act.id,
          respondent_id: respondent.id,
        })),
        respondent.id,
      )
    : null;
  const hasProfile = (profile?.answeredCount ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
      {/* The banner is the facilitator's, not the respondent's, so it is
          no-print: a saved PDF should be the page the respondent could have
          saved, not a screenshot of an admin tool looking at it. */}
      <div className="no-print sticky top-0 z-10 bg-gray-900 text-white px-5 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            Preview — what {respondent.name} sees
          </p>
          <p className="text-xs text-gray-400">
            Read only. Nothing here changes their answers, and their personal link isn't shown.
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-sm font-medium border border-gray-600 hover:border-gray-400 px-4 py-1.5 rounded-lg transition-colors"
        >
          Close
        </button>
      </div>

      {/* A personal assessment with nothing classifiable falls through to the
          answer tables, exactly as the respondent's own page does. */}
      {isPersonal && hasProfile ? (
        <div className="print-plain">
          <div className="max-w-3xl mx-auto px-4 py-10">
            <PersonalProfileReport
              profile={profile}
              activities={activities}
              assessment={assessment}
              respondent={respondent}
              name={respondent.name}
              title={respondent.title}
              returningCompleted
              resources={resources}
              readOnly
            />
          </div>
        </div>
      ) : (
        <TeamGapSelfReport
          assessment={assessment}
          respondent={respondent}
          name={respondent.name}
          title={respondent.title}
          activities={activities}
          responses={keyed}
          isPersonal={isPersonal}
          returningCompleted
          readOnly
        />
      )}
    </div>
  );
}
