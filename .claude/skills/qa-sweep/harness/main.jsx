import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/index.css'
import './audit.js'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Assessment from '@/pages/Assessment'
import ReportPage from '@/pages/ReportPage'
import TeamLeaderPage from '@/pages/TeamLeaderPage'
import NoAccess from '@/pages/NoAccess'
import LandingPage from '@/pages/LandingPage'
import AdminPage from '@/pages/AdminPage'
// The stub, via the alias in vite.config.js. Staff pages read useAuth(), so the
// provider has to wrap the routes exactly as App.jsx wraps them.
import { AuthProvider } from '@/lib/AuthContext'

// Every route a respondent, team leader or buyer can reach, mounted against the
// stub. Deliberately the real page components — a harness that renders its own
// copy of a screen proves nothing about the screen that ships.
//
// Admin routes are not here: they need the AuthContext stub and a signed-in
// user, and they are reached by staff who can be told to reload. See SKILL.md,
// "Extending the sweep".

function Missing() {
  return <div style={{ padding: 24, fontFamily: 'system-ui' }}>
    <h1>QA harness</h1>
    <ul>
      <li><a href="/assess?code=QA111">/assess?code=QA111</a> — registration, team gap</li>
      <li><a href="/assess?t=TOKEN-RESP-1">/assess?t=TOKEN-RESP-1</a> — resume a completed team gap</li>
      <li><a href="/assess?t=TOKEN-RESP-4">/assess?t=TOKEN-RESP-4</a> — resume a part-finished survey</li>
      <li><a href="/assess?code=QA222">/assess?code=QA222</a> — registration, personal</li>
      <li><a href="/assess?t=TOKEN-PERSONAL">/assess?t=TOKEN-PERSONAL</a> — personal profile report</li>
      <li><a href="/report/TOKEN-BUYER">/report/TOKEN-BUYER</a> — buyer report</li>
      <li><a href="/team/TOKEN-TEAM">/team/TOKEN-TEAM</a> — team leader dashboard</li>
      <li><a href="/no-access">/no-access</a> — signed in, no role (set window.__qaUser first)</li>
    </ul>
  </div>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
  <BrowserRouter>
    <Routes>
      <Route path="/assess" element={<Assessment />} />
      <Route path="/report/:token" element={<ReportPage />} />
      {/* Mirrors App.jsx: the token is cleared from the address after arrival,
          so the token-free forms have to render too. */}
      <Route path="/report" element={<ReportPage />} />
      <Route path="/team/:token" element={<TeamLeaderPage />} />
      <Route path="/team" element={<TeamLeaderPage />} />
      {/* Staff screens. window.__qaUser decides who is signed in — see
          stub-auth.jsx. */}
      <Route path="/no-access" element={<NoAccess />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/" element={<Missing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
  </AuthProvider>
)
