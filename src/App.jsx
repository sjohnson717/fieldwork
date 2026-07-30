import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import AssessPage from './pages/AssessPage';
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
import ZzRlsProbe from './pages/ZzRlsProbe'; // TEMPORARY — remove after RLS spike

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
            <Route path="/assess" element={<AssessPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/admin" element={<AdminPage />} />
              {/* TEMPORARY — remove after RLS spike. Protected so visiting it
                  forces the login redirect and the probe runs with a real
                  token; unprotected, it always reports "unauthenticated". */}
              <Route path="/zz-rls-probe" element={<ZzRlsProbe />} />
            </Route>
            <Route path="/report/:token" element={<ReportPage />} />
            <Route path="/team/:token" element={<TeamLeaderPage />} />
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