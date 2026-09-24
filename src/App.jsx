import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';

// Every page is its own chunk. Before this the whole app was one 1.4 MB file,
// so a respondent opening /assess on a phone downloaded the admin, the content
// sync, the library editor, and the docs before seeing their first question.
// Now they download the survey. A page that has not arrived yet shows the same
// spinner the survey and the reports show while they load their data, so the
// wait reads as one wait rather than two.
const Assessment = lazy(() => import('./pages/Assessment'));
const ReadMe = lazy(() => import('./pages/ReadMe'));
const FacilitatorGuide = lazy(() => import('./pages/FacilitatorGuide'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const TeamLeaderPage = lazy(() => import('./pages/TeamLeaderPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const NoAccess = lazy(() => import('./pages/NoAccess'));

const PageLoading = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-[#3366FF]/20 border-t-[#3366FF] rounded-full animate-spin" />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/assess" element={<Assessment />} />
              {/* Where a signed-in account with no role lands. Anything that used
                  to send such an account to /assess sends it here instead: the
                  respondent survey is not a permissions message. */}
              <Route path="/no-access" element={<NoAccess />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
              {/* Both of these are reached with a token in the path, which is
                  then cleared from the address — so the token-free forms have to
                  render too, for a reload of the cleaned address. They recover the
                  token from this tab's storage, and show their own "link not
                  valid" state when there is none. */}
              <Route path="/report/:token" element={<ReportPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="/team/:token" element={<TeamLeaderPage />} />
              <Route path="/team" element={<TeamLeaderPage />} />
              <Route path="/" element={<LandingPage />} />
              <Route path="/readme" element={<ReadMe />} />
              <Route path="/facilitator-guide" element={<FacilitatorGuide />} />
              <Route path="*" element={<PageNotFound />} />
            </Routes>
          </Suspense>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;