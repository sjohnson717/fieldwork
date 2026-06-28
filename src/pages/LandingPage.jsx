import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Link, useNavigate } from "react-router-dom";

const HERO_IMAGE = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/2ffc15b8c_curated-lifestyle-H3ZVdxBRIW0-unsplash.jpg";

export default function LandingPage() {
  const { user, isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect admins to /admin
  useEffect(() => {
    if (authChecked && isAuthenticated && user?.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [authChecked, isAuthenticated, user, navigate]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#a3b8ff] border-t-[#3366FF] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: `url(${HERO_IMAGE})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.55)" }} />

      {/* Content card */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-10 text-center">
        <div className="bg-[#1a1f2e]/90 backdrop-blur-md border border-white/40 rounded-2xl p-10 shadow-2xl">
          <img
            src="https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png"
            alt="Quartz Assessments"
            className="h-14 w-14 mx-auto mb-4 object-contain"
          />

          {!isAuthenticated ? (
            <>
              <p className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-2">
                Product team capability assessment
              </p>
              <h1 className="text-2xl font-bold text-white mb-3">Quartz Product Assessment</h1>
              <p className="text-white/80 text-sm mb-8">
                Have an assessment code? Jump straight in. Team members can log in below.
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  to="/assess"
                  className="w-full bg-[#3366FF] hover:bg-[#2952CC] text-white font-semibold py-3 rounded-lg transition-colors text-sm"
                >
                  Start an assessment
                </Link>
                <Link
                  to="/login"
                  className="w-full border border-white/60 hover:bg-white/10 text-white font-medium py-3 rounded-lg transition-colors text-sm"
                >
                  Team login
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">
                Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}!
              </h1>
              <p className="text-white/80 text-sm mb-8">
                You're logged in. Use your assessment code to participate in a Quartz Product Assessment.
              </p>
              <Link
                to="/assess"
                className="inline-block bg-[#3366FF] hover:bg-[#2952CC] text-white font-semibold px-8 py-3 rounded-lg transition-colors text-sm"
              >
                Start an assessment
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}