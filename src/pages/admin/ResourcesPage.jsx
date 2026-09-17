import ResourcesTab from "./ResourcesTab";

// Settings → Resources. Its own page rather than a Library tab: a resource can
// serve library activities and instrument questions alike, and adding blog
// posts or retiring old reading is work of its own, done more often than
// editing the library.
export default function ResourcesPage({ focus = null }) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <h2 className="text-lg font-bold text-gray-900">Resources</h2>
        <p className="text-sm text-gray-400">Reading offered on reports, for library activities and instrument questions.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        <ResourcesTab focus={focus} />
      </div>
    </div>
  );
}
