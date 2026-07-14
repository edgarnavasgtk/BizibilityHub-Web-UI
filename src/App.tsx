import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import AccessDeniedPage from './pages/auth/AccessDeniedPage'
import HomePage from './pages/home/HomePage'

// Visibility
import MainDashboardPage from './pages/visibility/MainDashboardPage'
import DashboardPage from './pages/visibility/DashboardPage'
import MyDashboardPage from './pages/visibility/MyDashboardPage'
import SlaDashboardPage from './pages/visibility/SlaDashboardPage'
import HistoryDashboardPage from './pages/visibility/HistoryDashboardPage'

// Transactions
import TransactionsPage from './pages/transactions/TransactionsPage'

// Architecture
import IntegrationCataloguePage from './pages/architecture/IntegrationCataloguePage'
import IntegrationMapPage from './pages/architecture/IntegrationMapPage'

// Agentic
import AIAnalyticsPage from './pages/agentic/AIAnalyticsPage'
import AIAnalyticsProPage from './pages/agentic/AIAnalyticsProPage'
import AIBuilderPage from './pages/agentic/AIBuilderPage'
import AIAdminPage from './pages/agentic/AIAdminPage'
import NahualAgentPage from './pages/agentic/NahualAgentPage'
import AgentHubPage from './pages/agentic/AgentHubPage'
import AgenticSharePage from './pages/agentic/AgenticSharePage'

// Orchestration
import ConnectorsPage from './pages/orchestration/ConnectorsPage'
import ActionTemplatesPage from './pages/orchestration/ActionTemplatesPage'
import MappingsPage from './pages/orchestration/MappingsPage'
import RulesPage from './pages/orchestration/RulesPage'
import BoomiOnboardingPage from './pages/orchestration/BoomiOnboardingPage'
import BoomiCollectorPage from './pages/orchestration/BoomiCollectorPage'
import BoomiDiscoveryPage from './pages/orchestration/BoomiDiscoveryPage'
import BoomiEnvironmentsPage from './pages/orchestration/BoomiEnvironmentsPage'
import BoomiIntegrationMappingsPage from './pages/orchestration/BoomiIntegrationMappingsPage'
import BoomiMonitorPage from './pages/orchestration/BoomiMonitorPage'
import MuleSoftOnboardingPage from './pages/orchestration/MuleSoftOnboardingPage'
import MuleSoftConfigurationPage from './pages/orchestration/MuleSoftConfigurationPage'
import MuleSoftIntegrationMappingsPage from './pages/orchestration/MuleSoftIntegrationMappingsPage'

// Reports
import ReportsHubPage from './pages/reports/ReportsHubPage'
import VolumeReportPage from './pages/reports/VolumeReportPage'
import UsageTrendPage from './pages/reports/UsageTrendPage'

// Monetization
import FinanceDashboardPage from './pages/monetization/FinanceDashboardPage'
import PlatformCostsPage from './pages/monetization/PlatformCostsPage'
import CrossChargingPage from './pages/monetization/CrossChargingPage'

// Settings
import YamlEditorPage from './pages/settings/YamlEditorPage'
import SlaConfigPage from './pages/settings/SlaConfigPage'
import IngestionDefaultsPage from './pages/settings/IngestionDefaultsPage'
import TranslationRulesPage from './pages/settings/TranslationRulesPage'
import TranslationRuleBuilderPage from './pages/settings/TranslationRuleBuilderPage'
import ApplicationSettingsPage from './pages/settings/ApplicationSettingsPage'
import DataRetentionPage from './pages/settings/DataRetentionPage'
import TransformServicePage from './pages/settings/TransformServicePage'
import ProcessValuesPage from './pages/settings/ProcessValuesPage'

// Admin
import UserManagementPage from './pages/admin/UserManagementPage'
import EditUserPage from './pages/admin/EditUserPage'
import AuditLogsPage from './pages/admin/AuditLogsPage'
import AgentsAdminPage from './pages/admin/AgentsAdminPage'
import AgentSkillsAdminPage from './pages/admin/AgentSkillsAdminPage'
import SeedDataPage from './pages/admin/SeedDataPage'
import AccessScopePage from './pages/admin/AccessScopePage'
import CountriesPage from './pages/admin/CountriesPage'
import DataManagementPage from './pages/admin/DataManagementPage'
import ErrorMonitoringPage from './pages/admin/ErrorMonitoringPage'

// Account
import ProfilePage from './pages/account/ProfilePage'
import ChangePasswordPage from './pages/account/ChangePasswordPage'

// Contact
import ContactPage from './pages/contact/ContactPage'

export default function App() {
  return (
    <Routes>
      {/* ── Public routes (no auth required) ───────────────── */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/account/register" element={<RegisterPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route path="/share/:token" element={<AgenticSharePage />} />

      <Route element={<AppLayout />}>
        {/* Root redirect handled by HomePage; keep /dashboard shortcut */}
        <Route path="/dashboard" element={<Navigate to="/visibility/dashboard" replace />} />

        {/* ── Visibility ─────────────────────────────────────── */}
        <Route path="/visibility/dashboard"  element={<MainDashboardPage />} />
        <Route path="/visibility/realtime"   element={<DashboardPage />} />
        <Route path="/visibility/my-dashboard" element={<MyDashboardPage />} />
        <Route path="/visibility/sla"        element={<SlaDashboardPage />} />
        <Route path="/visibility/history"    element={<HistoryDashboardPage />} />

        {/* ── Transactions ───────────────────────────────────── */}
        <Route path="/transactions" element={<TransactionsPage />} />

        {/* ── Architecture ───────────────────────────────────── */}
        <Route path="/architecture/map"       element={<IntegrationMapPage />} />
        <Route path="/architecture/catalogue" element={<IntegrationCataloguePage />} />

        {/* ── Agentic AI ─────────────────────────────────────── */}
        <Route path="/agentic/analytics"     element={<AIAnalyticsPage />} />
        <Route path="/agentic/analytics-pro" element={<AIAnalyticsProPage />} />
        <Route path="/agentic/builder"       element={<AIBuilderPage />} />
        <Route path="/agentic/admin"         element={<AIAdminPage />} />
        <Route path="/agentic/nahual"        element={<NahualAgentPage />} />
        <Route path="/agentic/hub"           element={<AgentHubPage />} />

        {/* ── Orchestration ──────────────────────────────────── */}
        <Route path="/orchestration/connectors"     element={<ConnectorsPage />} />
        <Route path="/orchestration/mappings"       element={<ActionTemplatesPage />} />
        <Route path="/orchestration/field-mappings" element={<MappingsPage />} />
        <Route path="/orchestration/rules"          element={<RulesPage />} />
        <Route path="/orchestration/boomi"                  element={<BoomiOnboardingPage />} />
        <Route path="/orchestration/boomi/collector"      element={<BoomiCollectorPage />} />
        <Route path="/orchestration/boomi/discovery"      element={<BoomiDiscoveryPage />} />
        <Route path="/orchestration/boomi/environments"   element={<BoomiEnvironmentsPage />} />
        <Route path="/orchestration/boomi/mappings"       element={<BoomiIntegrationMappingsPage />} />
        <Route path="/orchestration/boomi/monitor"        element={<BoomiMonitorPage />} />
        <Route path="/orchestration/mulesoft"             element={<MuleSoftOnboardingPage />} />
        <Route path="/orchestration/mulesoft/config"      element={<MuleSoftConfigurationPage />} />
        <Route path="/orchestration/mulesoft/mappings"    element={<MuleSoftIntegrationMappingsPage />} />

        {/* ── Data Governance ────────────────────────────────── */}
        <Route path="/admin/data-management" element={<DataManagementPage />} />
        <Route path="/admin/countries"       element={<CountriesPage />} />

        {/* ── Monetization ───────────────────────────────────── */}
        <Route path="/monetization"                element={<FinanceDashboardPage />} />
        <Route path="/monetization/platform-costs" element={<PlatformCostsPage />} />
        <Route path="/monetization/cross-charging" element={<CrossChargingPage />} />
        <Route path="/settings/process-values"     element={<ProcessValuesPage />} />

        {/* ── Reports ────────────────────────────────────────── */}
        <Route path="/reports"             element={<ReportsHubPage />} />
        <Route path="/reports/volume"      element={<VolumeReportPage />} />
        <Route path="/reports/usage-trend" element={<UsageTrendPage />} />

        {/* ── Settings ───────────────────────────────────────── */}
        <Route path="/settings/yaml-editor"       element={<YamlEditorPage />} />
        <Route path="/settings/sla"               element={<SlaConfigPage />} />
        <Route path="/settings/ingestion"         element={<IngestionDefaultsPage />} />
        <Route path="/settings/translation-rules" element={<TranslationRulesPage />} />
        <Route path="/settings/translation-rules/create" element={<TranslationRuleBuilderPage />} />
        <Route path="/settings/application"       element={<ApplicationSettingsPage />} />
        <Route path="/settings/data-retention"    element={<DataRetentionPage />} />
        <Route path="/settings/transform-service" element={<TransformServicePage />} />

        {/* ── Support ────────────────────────────────────────── */}
        <Route path="/admin/error-monitoring" element={<ErrorMonitoringPage />} />

        {/* ── Admin Hub ──────────────────────────────────────── */}
        <Route path="/admin/users"          element={<UserManagementPage />} />
        <Route path="/admin/users/new"    element={<EditUserPage />} />
        <Route path="/admin/users/:id/edit" element={<EditUserPage />} />
        <Route path="/admin/audit-logs"   element={<AuditLogsPage />} />
        <Route path="/admin/agents"       element={<AgentsAdminPage />} />
        <Route path="/admin/agent-skills" element={<AgentSkillsAdminPage />} />
        <Route path="/admin/seed-data"    element={<SeedDataPage />} />
        <Route path="/admin/access-scope" element={<AccessScopePage />} />

        {/* ── Account ────────────────────────────────────────── */}
        <Route path="/account/profile"         element={<ProfilePage />} />
        <Route path="/account/change-password" element={<ChangePasswordPage />} />

        {/* ── Contact ────────────────────────────────────────── */}
        <Route path="/contact" element={<ContactPage />} />

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/visibility/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
