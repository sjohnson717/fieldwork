import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import Assessment from './pages/Assessment';
import ReadMe from './pages/ReadMe';
import FacilitatorGuide from './pages/FacilitatorGuide';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/ProtectedRoute';
import ReportPage from './pages/ReportPage';
import TeamLeaderPage from './pages/TeamLeaderPage';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import NoAccess from './pages/NoAccess';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
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
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;