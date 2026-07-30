import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// THROWAWAY DIAGNOSTIC PAGE — DELETE AFTER THE SPIKE, along with its route in
// App.jsx, base44/functions/zzRlsProbe, and the ZZ_RlsSpike entity.
//
// Exists only so the probe runs with the app's own auth token. Log in as the
// account you want to test (e.g. a facilitator), then visit /zz-rls-probe.
export default function ZzRlsProbe() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("zzRlsProbe", {});
      setResult(res?.data ?? res);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Probe failed.");
    }
    setLoading(false);
  };

  useEffect(() => { run(); }, []);

  const verdict = result?.verdict || "";
  const tone = verdict.startsWith("PASS")
    ? "text-green-600"
    : verdict.startsWith("FAIL") || verdict.startsWith("VULNERABLE")
      ? "text-red-600"
      : "text-amber-600";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-lg font-bold text-gray-900 mb-1">RLS enforcement probe</h1>
        <p className="text-xs text-gray-400 mb-4">
          Temporary diagnostic. Delete this page, its route, the zzRlsProbe
          function, and the ZZ_RlsSpike entity once the spike is settled.
        </p>

        {loading && <p className="text-sm text-gray-400">Running…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {result && (
          <>
            <p className={`text-sm font-semibold mb-4 ${tone}`}>{verdict}</p>
            <pre className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-4 overflow-x-auto text-gray-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </>
        )}

        <button
          onClick={run}
          disabled={loading}
          className="mt-4 bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Re-run
        </button>
      </div>
    </div>
  );
}
