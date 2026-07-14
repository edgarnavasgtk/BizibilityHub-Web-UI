import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import MainDashboardPage from './pages/visibility/MainDashboardPage'
import TransactionsPage from './pages/transactions/TransactionsPage'

function ComingSoon({ title }: { title: string }) {
  return (
    <div style={{ padding: '2rem 2rem 2rem 340px', minHeight: 'calc(100vh - 160px)' }}>
      <h4 style={{ color: 'var(--gtek-text-white)', marginBottom: '0.5rem' }}>{title}</h4>
      <p style={{ color: 'var(--gtek-text-gray)', margin: 0 }}>— Migración en progreso —</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        {/* Root → main dashboard */}
        <Route path="/"          element={<Navigate to="/visibility/dashboard" replace />} />
        <Route path="/dashboard" element={<Navigate to="/visibility/dashboard" replace />} />

        {/* ── Visibility ─────────────────────────────────────── */}
        <Route path="/visibility/dashboard" element={<MainDashboardPage />} />
        <Route path="/visibility/sla"       element={<ComingSoon title="SLA Dashboard" />} />
        <Route path="/visibility/history"   element={<ComingSoon title="Historical Analysis" />} />

        {/* ── Transactions (direct, not nested under /visibility) */}
        <Route path="/transactions" element={<TransactionsPage />} />

        {/* ── Architecture ───────────────────────────────────── */}
        <Route path="/architecture/map"       element={<ComingSoon title="Architecture Map" />} />
        <Route path="/architecture/catalogue" element={<ComingSoon title="API Catalogue" />} />

        {/* ── Agentic AI ─────────────────────────────────────── */}
        <Route path="/agentic/analytics" element={<ComingSoon title="AI Analytics" />} />
        <Route path="/agentic/nahual"    element={<ComingSoon title="Nahual Agent" />} />
        <Route path="/agentic/hub"       element={<ComingSoon title="Agent Hub" />} />

        {/* ── Orchestration (Admin only) ─────────────────────── */}
        <Route path="/orchestration/connectors" element={<ComingSoon title="Connectors" />} />
        <Route path="/orchestration/mappings"   element={<ComingSoon title="Action Templates" />} />
        <Route path="/orchestration/rules"      element={<ComingSoon title="Decision Rules" />} />
        <Route path="/orchestration/boomi"      element={<ComingSoon title="Boomi Onboarding" />} />
        <Route path="/orchestration/mulesoft"   element={<ComingSoon title="MuleSoft Onboarding" />} />

        {/* ── Data Governance ────────────────────────────────── */}
        <Route path="/admin/data-management" element={<ComingSoon title="Data Management" />} />
        <Route path="/admin/countries"       element={<ComingSoon title="Countries" />} />

        {/* ── Monetization ───────────────────────────────────── */}
        <Route path="/monetization"                element={<ComingSoon title="Executive Dashboard" />} />
        <Route path="/monetization/platform-costs" element={<ComingSoon title="Platform Costs" />} />
        <Route path="/monetization/cross-charging" element={<ComingSoon title="Cross-Charging" />} />
        <Route path="/settings/process-values"     element={<ComingSoon title="Process Valuation" />} />

        {/* ── Reports ────────────────────────────────────────── */}
        <Route path="/reports"            element={<ComingSoon title="Reports Hub" />} />
        <Route path="/reports/volume"     element={<ComingSoon title="Volume Reports" />} />
        <Route path="/reports/usage-trend" element={<ComingSoon title="Usage Trend" />} />

        {/* ── Settings (Admin only) ──────────────────────────── */}
        <Route path="/settings/sla"               element={<ComingSoon title="SLA Settings" />} />
        <Route path="/settings/ingestion"         element={<ComingSoon title="Ingestion Settings" />} />
        <Route path="/settings/translation-rules" element={<ComingSoon title="Translation Rules" />} />
        <Route path="/settings/application"       element={<ComingSoon title="Application Settings" />} />
        <Route path="/settings/data-retention"    element={<ComingSoon title="Data Retention" />} />
        <Route path="/settings/transform-service" element={<ComingSoon title="Transform Service" />} />

        {/* ── Support (Admin only) ───────────────────────────── */}
        <Route path="/admin/error-monitoring" element={<ComingSoon title="Error Monitoring" />} />

        {/* ── Admin Hub (Admin only) ─────────────────────────── */}
        <Route path="/admin/users"        element={<ComingSoon title="User Management" />} />
        <Route path="/admin/users/new"    element={<ComingSoon title="Add User" />} />
        <Route path="/admin/audit-logs"   element={<ComingSoon title="Audit Logs" />} />
        <Route path="/admin/agents"       element={<ComingSoon title="AI Agents" />} />
        <Route path="/admin/agent-skills" element={<ComingSoon title="Agent Skills" />} />
        <Route path="/admin/seed-data"    element={<ComingSoon title="Seed Test Data" />} />
        <Route path="/admin/access-scope" element={<ComingSoon title="Access Scope" />} />

        {/* ── Account ────────────────────────────────────────── */}
        <Route path="/account/profile"          element={<ComingSoon title="My Profile" />} />
        <Route path="/account/change-password"  element={<ComingSoon title="Change Password" />} />

        {/* ── Contact ────────────────────────────────────────── */}
        <Route path="/contact" element={<ComingSoon title="Contact" />} />

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/visibility/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
