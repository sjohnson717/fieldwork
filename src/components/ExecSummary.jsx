// Executive Summary section for ReportPage
// Placed immediately after the title block, before detailed findings.

export default function ExecSummary({ assessment, activities, activityStats, respondentCount, decisions }) {
  const totalActivities = activities.length;

  // Classify each activity
  const strengthsActs = activities.filter(a => {
    const s = activityStats[a.id];
    return s && s.avgGap !== null && s.avgGap < 1 && s.avgImp !== null && s.avgImp >= 1.5;
  });
  const criticalActs = activities.filter(a => {
    const s = activityStats[a.id];
    return s && s.avgGap !== null && s.avgGap >= 2;
  });
  const discussActs = activities.filter(a => {
    const s = activityStats[a.id];
    return s && s.avgGap !== null && s.avgGap >= 1;
  });

  const strengthCount = strengthsActs.length;
  const criticalCount = criticalActs.length;
  const discussCount = discussActs.length;

  // Top two priorities by gap
  const topPriorities = [...activities]
    .map(a => ({ ...a, gap: activityStats[a.id]?.avgGap ?? null }))
    .filter(a => a.gap !== null && a.gap >= 1)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);

  // Primary strengths — high importance, low gap
  const topStrengths = [...strengthsActs]
    .map(a => ({ ...a, imp: activityStats[a.id]?.avgImp ?? 0 }))
    .sort((a, b) => b.imp - a.imp)
    .slice(0, 2);

  // Workshop outcomes
  const isClosed = assessment.status === "closed";
  const decisionCount = decisions.length;
  // Flagged notes = open issues
  // (decisions prop is already filtered to notes with decisions; we count all as recorded decisions)

  // ── Narrative paragraphs ────────────────────────────────────────────────

  // Para 1: overall assessment
  let overallPara = "";
  const teamRef = assessment.company_name ? `${assessment.company_name}` : "Your team";
  if (criticalCount === 0 && discussCount === 0) {
    overallPara = `${teamRef} assessed ${totalActivities} product management ${totalActivities === 1 ? "activity" : "activities"} across ${respondentCount} ${respondentCount === 1 ? "participant" : "participants"}. Execution is keeping pace with importance across all areas — a strong result.`;
  } else if (criticalCount > 0) {
    overallPara = `${teamRef} assessed ${totalActivities} product management ${totalActivities === 1 ? "activity" : "activities"} across ${respondentCount} ${respondentCount === 1 ? "participant" : "participants"}. The team identified ${criticalCount} critical ${criticalCount === 1 ? "gap" : "gaps"} where execution falls significantly short of what the team considers important${strengthCount > 0 ? `, alongside ${strengthCount} ${strengthCount === 1 ? "area" : "areas"} of consistent strength` : ""}.`;
  } else {
    overallPara = `${teamRef} assessed ${totalActivities} product management ${totalActivities === 1 ? "activity" : "activities"} across ${respondentCount} ${respondentCount === 1 ? "participant" : "participants"}. ${discussCount} ${discussCount === 1 ? "activity needs" : "activities need"} attention${strengthCount > 0 ? `, while ${strengthCount} ${strengthCount === 1 ? "area is" : "areas are"} performing well` : ""}.`;
  }

  // Para 2: key observations
  let observationsPara = "";
  if (topPriorities.length > 0 && topStrengths.length > 0) {
    const priorityNames = topPriorities.map(a => a.name).join(" and ");
    const strengthNames = topStrengths.map(a => a.name).join(" and ");
    observationsPara = `The highest-priority improvement opportunities are ${priorityNames}. At the same time, the team is demonstrating consistent execution in ${strengthNames} — capabilities to protect and build on.`;
  } else if (topPriorities.length > 0) {
    const priorityNames = topPriorities.map(a => a.name).join(" and ");
    observationsPara = `The highest-priority improvement opportunities are ${priorityNames}. Addressing these should be the immediate focus for leadership.`;
  } else if (topStrengths.length > 0) {
    const strengthNames = topStrengths.map(a => a.name).join(" and ");
    observationsPara = `The team is demonstrating strong execution across assessed activities. ${strengthNames} stand out as particular strengths worth protecting as the team scales.`;
  }

  // Para 3: workshop outcomes (closed only)
  let workshopPara = "";
  if (isClosed && decisionCount > 0) {
    workshopPara = `During the facilitated workshop, ${decisionCount} ${decisionCount === 1 ? "decision was" : "decisions were"} recorded to address the gaps identified. These ${decisionCount === 1 ? "decision reflects" : "decisions reflect"} the team's commitment to translating assessment findings into concrete action.`;
  } else if (isClosed && decisionCount === 0) {
    workshopPara = `The assessment has been closed. No workshop decisions have been recorded yet — consider scheduling a facilitated debrief to turn these findings into action.`;
  }

  // Para 4: recommended next step
  let nextStepPara = "";
  if (criticalCount > 0 && isClosed && decisionCount > 0) {
    nextStepPara = `The immediate priority is executing on the workshop decisions and tracking progress against the critical gaps. A follow-up assessment in the next planning cycle will confirm whether execution has improved.`;
  } else if (criticalCount > 0 && !isClosed) {
    nextStepPara = `Leadership should schedule a facilitated workshop to review these findings with the team, confirm ownership of the highest-priority activities, and agree on concrete next steps before the next planning cycle.`;
  } else if (discussCount > 0) {
    nextStepPara = `Leadership should review the activities flagged for discussion and confirm clear ownership. Addressing accountability gaps now will reduce the risk of execution drift in the quarters ahead.`;
  } else {
    nextStepPara = `The team is well-positioned. Leadership should continue reinforcing the practices driving strong execution and reassess at the next planning cycle to confirm momentum is sustained.`;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-8 mb-10">
      {/* Header */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Executive Summary</p>
      <div className="border-b border-gray-100 mb-6 pb-4">
        <div className="flex flex-wrap gap-6 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{totalActivities}</div>
            <div className="text-xs text-gray-400 mt-0.5">activities assessed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[#11CC77]">{strengthCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">strengths</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[#D69E2E]">{discussCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">need discussion</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[#E53E3E]">{criticalCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">critical gaps</div>
          </div>
          {isClosed && (
            <div className="text-center">
              <div className="text-2xl font-bold text-[#3366FF]">{decisionCount}</div>
              <div className="text-xs text-gray-400 mt-0.5">{decisionCount === 1 ? "decision" : "decisions"} recorded</div>
            </div>
          )}
        </div>
      </div>

      {/* Narrative */}
      <div className="space-y-4 text-sm text-gray-700 leading-relaxed max-w-2xl">
        {overallPara && <p>{overallPara}</p>}
        {observationsPara && <p>{observationsPara}</p>}
        {workshopPara && <p>{workshopPara}</p>}
        {nextStepPara && (
          <p className="text-gray-900 font-medium border-t border-gray-100 pt-4 mt-4">
            {nextStepPara}
          </p>
        )}
      </div>
    </div>
  );
}