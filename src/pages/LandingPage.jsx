import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";

export default function LandingPage() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  // Auto-redirect admins to /admin
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user?.role === "admin") {
      window.location.href = "/admin";
    }
  }, [isLoadingAuth, isAuthenticated, user]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-md text-center">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-2">Product Growth Leaders</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Fieldwork Assessment</h1>
          <p className="text-gray-500 text-sm mb-8">
            Have an assessment code? Jump straight in. Team members can log in below.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to="/assess"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors text-sm"
            >
              Start an assessment
            </Link>
            <Link
              to="/login"
              className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-lg transition-colors text-sm"
            >
              Team login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated non-admin (regular user)
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-md text-center">
        <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-2">Product Growth Leaders</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}!
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          You're logged in. Use your assessment code to participate in a Fieldwork assessment.
        </p>
        <Link
          to="/assess"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors text-sm"
        >
          Start an assessment
        </Link>
      </div>
    </div>
  );
}