import AssessmentActivities from "./AssessmentActivities";

export default function AssessmentActivitiesTab({ assessment, onUpdate }) {
  return (
    <div className="p-8 max-w-3xl space-y-8">

      {/* Activities */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Activities</h3>
          <p className="text-xs text-gray-400 mt-0.5">Choose which activities respondents will rate, or add custom ones for this assessment.</p>
        </div>
        <AssessmentActivities assessment={assessment} onUpdate={onUpdate} />
      </section>

    </div>
  );
}
