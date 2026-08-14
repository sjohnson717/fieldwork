import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { canAccessAdmin } from "@/lib/roles";

const HERO_IMAGE = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/2ffc15b8c_curated-lifestyle-H3ZVdxBRIW0-unsplash.jpg";
const QUARTZ_ICON = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png";

export default function LandingPage() {
  const { user, isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect anyone with admin-side access to /admin (org admins were
  // previously left on the landing page).
  //
  // A signed-in account *without* access goes to /no-access rather than being
  // left here. This is where Google sign-in returns to, so it is where an
  // invited facilitator whose address did not match would otherwise land — on
  // marketing copy, next to a "Facilitator sign-in" button that loops them
  // straight back to the same place.
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    navigate(canAccessAdmin(user) ? "/admin" : "/no-access", { replace: true });
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
      {/* Dark overlay — heavier than the card-only pages, since body copy sits on it */}
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.72)" }} />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
          {/* Marketing copy — second on mobile, so a respondent with a code
              reaches the buttons without scrolling past the pitch */}
          <div className="text-white order-2 lg:order-1">
            <img src={QUARTZ_ICON} alt="Quartz Assessment" className="h-12 w-12 mb-6 object-contain" />
            <p className="text-xs font-semibold tracking-widest uppercase text-white/60 mb-3">
              Product team capability assessment
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-6">
              The Roles &amp; Responsibilities Assessment
            </h1>
            <div className="text-white/80 leading-relaxed">
              <p>
                The Roles &amp; Responsibilities Assessment gives your team a practical way to clarify
                the work that needs to be done and who should own it. Team members evaluate their
                experience, skills, and interest across the activities required to manage and grow a
                product. The result reveals strengths, development opportunities, ownership gaps, and
                mismatches between the work people are doing and the work they're best suited to
                do—giving leaders a fact-based starting point for clearer roles, better development
                plans, and a stronger product team.
              </p>
              <p className="mt-4">
                Don't have a code? Email{" "}
                <a
                  href="mailto:growth@productgrowthleaders.com"
                  className="font-medium text-white underline underline-offset-2 hover:text-white/80"
                >
                  growth@productgrowthleaders.com
                </a>{" "}
                to get started.
              </p>
            </div>
          </div>

          {/* Action card */}
          <div className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end order-1 lg:order-2">
            <div className="bg-white/90 backdrop-blur-md border border-gray-200/60 rounded-2xl p-10 shadow-2xl text-center">
              {!isAuthenticated ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">Get started</h2>
                  <p className="text-gray-500 text-sm mb-8">
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
                      className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-lg transition-colors text-sm"
                    >
                      Team login
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}!
                  </h2>
                  <p className="text-gray-500 text-sm mb-8">
                    You're logged in. Use your assessment code to participate in a Roles &amp;
                    Responsibilities Assessment.
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
      </div>
    </div>
  );
}
