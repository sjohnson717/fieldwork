// Executive Summary section for ReportPage

export default function ExecSummary({ assessment, activities, activityStats, respondentCount, decisions }) {
  const totalActivities = activities.length;
  const teamRef = assessment.company_name || "The team";

  // Classify activities
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

  // Top two priorities by gap score
  const topPriorities = [...activities]
    .map(a => ({ ...a, gap: activityStats[a.id]?.avgGap ?? null }))
    .filter(a => a.gap !== null && a.gap >= 1)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);

  // Top two strengths by importance
  const topStrengths = [...strengthsActs]
    .map(a => ({ ...a, imp: activityStats[a.id]?.avgImp ?? 0 }))
    .sort((a, b) => b.imp - a.imp)
    .slice(0, 2);

  const isClosed = assessment.status === "closed";
  const decisionCount = decisions.length;

  // ── Para 1: Overall assessment ───────────────────────────────────────────
  let overallPara = "";
  if (criticalCount === 0 && discussCount === 0) {
    overallPara = `${teamRef} assessed ${totalActivities} product management ${totalActivities === 1 ? "activity" : "activities"} across ${respondentCount} ${respondentCount === 1 ? "participant" : "participants"}. Execution is keeping pace with importance across all areas — a strong result.`;
  } else if (criticalCount > 0) {
    overallPara = `${teamRef} assessed ${totalActivities} product management ${totalActivities === 1 ? "activity" : "activities"} across ${respondentCount} ${respondentCount === 1 ? "participant" : "participants"}. The assessment identified ${criticalCount} critical ${criticalCount === 1 ? "gap" : "gaps"} where execution falls significantly short of what the team considers important${strengthCount > 0 ? `, alongside ${strengthCount} ${strengthCount === 1 ? "area" : "areas"} of consistent strength` : ""}.`;
  } else {
    overallPara = `${teamRef} assessed ${totalActivities} product management ${totalActivities === 1 ? "activity" : "activities"} across ${respondentCount} ${respondentCount === 1 ? "participant" : "participants"}. ${discussCount} ${discussCount === 1 ? "activity needs" : "activities need"} leadership attention${strengthCount > 0 ? `, while ${strengthCount} ${strengthCount === 1 ? "area is" : "areas are"} performing well` : ""}.`;
  }

  // ── Para 2: Highest-priority improvement opportunities (bolded) ──────────
  let priorityNode = null;
  if (topPriorities.length > 0) {
    const priorityNames = topPriorities.map(a => a.name).join(" and ");
    priorityNode = (
      <p>
        <strong className="font-semibold text-gray-900">
          The highest-priority improvement {topPriorities.length === 1 ? "opportunity is" : "opportunities are"} {priorityNames}.
        </strong>
        {" "}These are the activities where importance is high and execution is not keeping pace — the highest-leverage areas for leadership attention.
      </p>
    );
  }

  // ── Para 3: Organizational strengths ────────────────────────────────────
  let strengthsPara = "";
  if (topStrengths.length > 0) {
    const strengthNames = topStrengths.map(a => a.name).join(" and ");
    strengthsPara = `The team is executing consistently in ${strengthNames}. ${topStrengths.length === 1 ? "This is a" : "These are"} foundation${topStrengths.length === 1 ? "" : "al capabilities"} to protect as the organization scales.`;
  } else if (strengthCount === 0 && discussCount > 0) {
    strengthsPara = `No activities currently meet the threshold for consistent strength. Closing the execution gaps identified above will be essential before the team can build durable product management foundations.`;
  }

  // ── Para 4: Workshop outcomes ────────────────────────────────────────────
  let workshopPara = "";
  if (isClosed && decisionCount > 0) {
    workshopPara = `The workshop resulted in ${decisionCount} ${decisionCount === 1 ? "decision" : "decisions"} to clarify ownership and improve execution. The assessment identified where to focus; the workshop determined what to do next.`;
  } else if (isClosed && decisionCount === 0) {
    workshopPara = `The assessment is closed. No workshop decisions have been recorded. A facilitated debrief is recommended to convert these findings into accountable action.`;
  }

  // ── Para 5: Leadership recommendation ───────────────────────────────────
  let recommendationPara = "";
  const topPriorityNames = topPriorities.map(a => a.name).join(" and ");

  if (criticalCount > 0 && isClosed && decisionCount > 0) {
    recommendationPara = topPriorityNames
      ? `Leadership's immediate priority is confirming ownership for ${topPriorityNames} and executing on the workshop decisions before the next planning cycle.`
      : `Leadership's immediate priority is executing on the workshop decisions and tracking progress against the critical gaps before the next planning cycle.`;
  } else if (criticalCount > 0 && !isClosed) {
    recommendationPara = topPriorityNames
      ? `Leadership should schedule a facilitated workshop to confirm ownership for ${topPriorityNames} and agree on concrete next steps before the next planning cycle.`
      : `Leadership should schedule a facilitated workshop to review these findings, confirm ownership of the highest-priority activities, and agree on next steps before the next planning cycle.`;
  } else if (discussCount > 0) {
    recommendationPara = topPriorityNames
      ? `Leadership should confirm clear ownership for ${topPriorityNames}. Resolving accountability now will prevent execution drift in the quarters ahead.`
      : `Leadership should review the activities flagged for discussion and confirm clear ownership. Resolving accountability now will prevent execution drift in the quarters ahead.`;
  } else {
    recommendationPara = `The team is well-positioned. Leadership should reinforce the practices driving strong execution and reassess progress in the next planning cycle.`;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-8 mb-10">
      {/* Label */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Executive Summary</p>

      {/* Metrics row */}
      <div className="flex flex-wrap gap-6 mb-3">
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

      {/* Purpose statement */}
      <p className="text-xs text-gray-400 italic mb-6 border-b border-gray-100 pb-5">
        This assessment identifies where leadership attention will have the greatest impact.
      </p>

      {/* Narrative */}
      <div className="space-y-3 text-sm text-gray-700 leading-relaxed max-w-2xl">
        {overallPara && <p>{overallPara}</p>}
        {priorityNode}
        {strengthsPara && <p>{strengthsPara}</p>}
        {workshopPara && <p>{workshopPara}</p>}
        {recommendationPara && (
          <p className="font-medium text-gray-900 border-t border-gray-100 pt-4 mt-2">
            {recommendationPara}
          </p>
        )}
      </div>
    </div>
  );
}