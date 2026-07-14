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
        <Route path="/"                              element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"                     element={<MainDashboardPage />} />
        <Route path="/visibility/transactions"       element={<TransactionsPage />} />
        <Route path="/visibility/sla"                element={<ComingSoon title="SLA Dashboard" />} />
        <Route path="/visibility/executive"          element={<ComingSoon title="Executive Dashboard" />} />
        <Route path="/visibility/history"            element={<ComingSoon title="Historical Analysis" />} />
        <Route path="/architecture/map"              element={<ComingSoon title="Architecture Map" />} />
        <Route path="/architecture/catalogue"        element={<ComingSoon title="API Catalogue" />} />
        <Route path="/agentic/ai"                    element={<ComingSoon title="Agentic AI Hub" />} />
        <Route path="/datagovernance/datamanagement" element={<ComingSoon title="Data Management" />} />
        <Route path="/datagovernance/countries"      element={<ComingSoon title="Countries" />} />
        <Route path="/monetization/platformcosts"    element={<ComingSoon title="Platform Costs" />} />
        <Route path="/monetization/crosscharging"    element={<ComingSoon title="Cross-Charging" />} />
        <Route path="/monetization/processvaluation" element={<ComingSoon title="Process Valuation" />} />
        <Route path="/reports/hub"                   element={<ComingSoon title="Reports Hub" />} />
        <Route path="/reports/volume"                element={<ComingSoon title="Volume Reports" />} />
        <Route path="/reports/usagetrend"            element={<ComingSoon title="Usage Trend" />} />
        <Route path="/admin"                         element={<ComingSoon title="Admin Hub" />} />
        <Route path="*"                              element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
