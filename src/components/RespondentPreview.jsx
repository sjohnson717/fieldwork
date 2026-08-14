import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
//
// Rendered through a portal to <body>, which is about printing rather than
// layout. A fixed overlay inside the admin tree paints on every printed sheet
// while the page underneath goes on flowing into its own, so Save as PDF from
// here produced the cover repeated on each page with the admin sidebar bleeding
// across the top of it. As a sibling of #root it can be printed alone: the
// print rules hide #root and let this flow normally.
export default function RespondentPreview({ assessment, respondent, activities, responses, onClose }) {
  const isPersonal = assessment?.assessment_type === "personal";
  const [resources, setResources] = useState([]);
  // The respondent's own page gets org_name resolved server-side by
  // publicAssessment; the admin side loads the Assessment record itself, which
  // carries org_id and no name. Resolved here so the preview credits the same
  // firm the respondent's copy does rather than falling back to the app owner.
  const [orgName, setOrgName] = useState(null);

  useEffect(() => {
    if (!assessment?.org_id) return;
    base44.entities.Organization
      .filter({ id: assessment.org_id })
      .then(rows => setOrgName(rows?.[0]?.name || null))
      .catch(() => setOrgName(null));
  }, [assessment?.org_id]);

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

  // Marks the body while the overlay is up, which is what the print rules key
  // on, and names the tab after the assessment for the same reason the report
  // pages do: every browser offers the tab title as the filename when you Save
  // as PDF, and printing from admin was producing "Admin | Quartz Assessment"
  // — the app's name on a document about one person's answers. Both are undone
  // on close, so the admin page gets its own title back.
  useEffect(() => {
    const previousTitle = document.title;
    document.body.classList.add("preview-open");
    if (assessment?.title) document.title = `${assessment.title} | Quartz Assessments`;
    return () => {
      document.body.classList.remove("preview-open");
      document.title = previousTitle;
    };
  }, [assessment?.title]);

  // The children read org_name off the assessment, as the respondent's page
  // does, so the resolved name is merged in rather than threaded separately.
  const withOrg = orgName ? { ...assessment, org_name: orgName } : assessment;

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

  return createPortal(
    <div className="respondent-preview fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
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
              assessment={withOrg}
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
          assessment={withOrg}
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
    </div>,
    document.body,
  );
}
