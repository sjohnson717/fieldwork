import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const QUARTZ_ICON = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png";

// Where a signed-in account with no role lands.
//
// This state has one cause almost every time: access is granted to one exact
// email address, and the person signed in with a different one. An invitation to
// barb@herfirm.com does nothing for an account created with a personal Google
// address — the role is never applied, and until this page existed nothing said
// so. Login sent them to /assess instead, so a facilitator who had just accepted
// an invitation was dropped into a survey about their own team, which reads as
// "the invitation worked and this is the product".
//
// The page therefore does three things the old screen did not: it names the
// address they are actually signed in as, it says access is per-address, and it
// gives them the one action that can fix it — sign out and come back as someone
// else.
//
// It deliberately does not look up whether an invitation exists for some other
// address. Invitation's read rule scopes a non-staff account to its own email,
// and a backend lookup that searched by name or domain would tell any stranger
// who signed up which addresses had been invited. "Access is per address, and
// this is the one you used" gets them there without disclosing anyone.
export default function NoAccess() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const signOutAndRetry = async () => {
    try {
      await base44.auth.logout();
    } catch {
      // Logging out is best-effort: if the platform call fails, sending them to
      // the login screen is still the right next step, and it will ask again.
    }
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 w-full max-w-md">
        <img src={QUARTZ_ICON} alt="" className="h-10 w-10 mb-5 object-contain" />

        <h1 className="text-2xl font-bold text-gray-900 mb-2">This account doesn't have access yet</h1>

        {/* The address is the whole point of the page, so it is the one thing
            set apart from the prose rather than mentioned inside it. */}
        <p className="text-gray-500 mb-4">You're signed in as</p>
        <p className="font-mono text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-5 break-all">
          {user?.email || "an account with no email address"}
        </p>

        <p className="text-gray-500 mb-6 leading-relaxed">
          Access is granted to one specific email address. If you were invited at
          a different one — a work address rather than a personal one, say — sign
          in with that address instead and you'll come straight in. Otherwise ask
          whoever invited you to grant access to this address.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={signOutAndRetry}
            className="w-full bg-[#3366FF] hover:bg-[#2952CC] text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            Sign in with a different account
          </button>
          {/* Respondents and team leaders never belong here — they arrive on a
              link and have no account at all. But someone who followed a stale
              bookmark might, so the way back out is on the page. */}
          <Link
            to="/"
            className="w-full text-center border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Back to the home page
          </Link>
        </div>

        <p className="text-xs text-gray-400 mt-6 leading-relaxed">
          Taking an assessment doesn't need an account. If you were sent a link
          to answer one, or to see a team's results, open that link — it works on
          its own.
        </p>
      </div>
    </div>
  );
}
