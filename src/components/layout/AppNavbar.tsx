import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { SectionKeys } from '../../constants/sectionKeys'
import i18n from '../../i18n'

export default function AppNavbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, user, canSee, logout } = useAuthStore()

  const handleLogout = async () => {
    logout()
    navigate('/login')
  }

  const setLang = (lang: string) => {
    i18n.changeLanguage(lang)
    localStorage.setItem('bizhub-lang', lang)
  }

  const currentLang = i18n.language?.slice(0, 2) ?? 'en'

  const showVisibility =
    canSee(SectionKeys.VisibilityRealtime) ||
    canSee(SectionKeys.VisibilitySla) ||
    canSee(SectionKeys.VisibilityTransactions) ||
    canSee(SectionKeys.VisibilityExecutive) ||
    canSee(SectionKeys.VisibilityHistory)

  const showArchitecture =
    canSee(SectionKeys.ArchitectureMap) || canSee(SectionKeys.ArchitectureCatalogue)

  const showDataGovernance =
    canSee(SectionKeys.DataGovernanceDataManagement) || canSee(SectionKeys.DataGovernanceCountries)

  const showMonetization =
    canSee(SectionKeys.MonetizationPlatformCosts) ||
    canSee(SectionKeys.MonetizationCrossCharging) ||
    canSee(SectionKeys.MonetizationProcessValuation)

  const showReports =
    canSee(SectionKeys.ReportsHub) ||
    canSee(SectionKeys.ReportsVolume) ||
    canSee(SectionKeys.ReportsUsageTrend)

  return (
    <header>
      <nav className="navbar navbar-expand-xl navbar-dark navbar-guatemaltek">
        <div className="container-fluid">
          <Link className="navbar-brand" to="/">
            <img src="/images/BizibilityHubLogoNoBG.png" alt="Bizibility Hub Logo" style={{ height: 40 }} />
          </Link>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarMain"
            aria-controls="navbarMain"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="navbar-collapse collapse d-xl-flex justify-content-between" id="navbarMain">
            {/* ── Left nav ── */}
            <ul className="navbar-nav flex-grow-1">
              <li className="nav-item">
                <Link className="nav-link d-flex align-items-center gap-1" to="/">
                  <i className="fas fa-home" /> {t('Nav_Home')}
                </Link>
              </li>

              {isAuthenticated && (
                <>
                  {/* Visibility */}
                  {showVisibility && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-eye me-1" />{t('Nav_Visibility')}
                      </a>
                      <ul className="dropdown-menu">
                        {(canSee(SectionKeys.VisibilityRealtime) || canSee(SectionKeys.VisibilitySla)) && (
                          <li><h6 className="dropdown-header">{t('Nav_Visibility_Dashboards')}</h6></li>
                        )}
                        {canSee(SectionKeys.VisibilityRealtime) && (
                          <li>
                            <Link className="dropdown-item" to="/visibility/dashboard">
                              <i className="fas fa-chart-bar me-1" />{t('Nav_Visibility_RealTime')}
                            </Link>
                          </li>
                        )}
                        {canSee(SectionKeys.VisibilitySla) && (
                          <li>
                            <Link className="dropdown-item" to="/visibility/sla">
                              <i className="fas fa-gauge-high me-1" />{t('Nav_Visibility_Sla')}
                            </Link>
                          </li>
                        )}
                        <li>
                          <Link className="dropdown-item" to="/visibility/realtime">
                            <i className="fas fa-tachometer-alt me-1" />Real Time Monitoring
                          </Link>
                        </li>
                        {canSee(SectionKeys.VisibilityTransactions) && (
                          <>
                            <li><hr className="dropdown-divider" /></li>
                            <li><h6 className="dropdown-header">{t('Nav_Visibility_Operations')}</h6></li>
                            <li>
                              <Link className="dropdown-item" to="/transactions">
                                <i className="fas fa-search me-1" />{t('Nav_Visibility_TransactionExplorer')}
                              </Link>
                            </li>
                          </>
                        )}
                        {canSee(SectionKeys.VisibilityExecutive) && (
                          <>
                            <li><hr className="dropdown-divider" /></li>
                            <li><h6 className="dropdown-header">{t('Nav_Visibility_BusinessMonetization')}</h6></li>
                            <li>
                              <Link className="dropdown-item" to="/monetization">
                                <i className="fas fa-tachometer-alt me-1" />{t('Nav_Visibility_ExecutiveDashboard')}
                              </Link>
                            </li>
                          </>
                        )}
                        {canSee(SectionKeys.VisibilityHistory) && (
                          <>
                            <li><hr className="dropdown-divider" /></li>
                            <li>
                              <Link className="dropdown-item" to="/visibility/history">
                                <i className="fas fa-clock-rotate-left me-1" />{t('Nav_Visibility_HistoryDashboard')}
                              </Link>
                            </li>
                          </>
                        )}
                      </ul>
                    </li>
                  )}

                  {/* Architecture */}
                  {showArchitecture && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-diagram-project me-1" />{t('Nav_Architecture')}
                      </a>
                      <ul className="dropdown-menu">
                        {canSee(SectionKeys.ArchitectureMap) && (
                          <li>
                            <Link className="dropdown-item" to="/architecture/map">
                              <i className="fas fa-project-diagram me-1" />{t('Nav_Architecture_IntegrationMap')}
                            </Link>
                          </li>
                        )}
                        {canSee(SectionKeys.ArchitectureCatalogue) && (
                          <li>
                            <Link className="dropdown-item" to="/architecture/catalogue">
                              <i className="fas fa-list-alt me-1" />{t('Nav_Architecture_IntegrationCatalogue')}
                            </Link>
                          </li>
                        )}
                      </ul>
                    </li>
                  )}

                  {/* Agentic AI */}
                  {canSee(SectionKeys.AgenticAi) && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-robot me-1" />{t('Nav_AgenticAI')}
                      </a>
                      <ul className="dropdown-menu">
                        <li>
                          <Link className="dropdown-item" to="/agentic/analytics">
                            <i className="fas fa-chart-line me-1" />AI Analytics
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/agentic/analytics-pro">
                            <i className="fas fa-sparkles me-1" />AI Insights Pro
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/agentic/builder">
                            <i className="fas fa-hammer me-1" />AI Query Builder
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/agentic/nahual">
                            <i className="fas fa-comment-dots me-1" />Nahual Agent
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/agentic/hub">
                            <i className="fas fa-network-wired me-1" />Agent Hub
                          </Link>
                        </li>
                        {isAdmin && (
                          <>
                            <li><hr className="dropdown-divider" /></li>
                            <li>
                              <Link className="dropdown-item" to="/agentic/admin">
                                <i className="fas fa-cog me-1" />AI Pattern Admin
                              </Link>
                            </li>
                          </>
                        )}
                      </ul>
                    </li>
                  )}

                  {/* Orchestration — Admin only */}
                  {isAdmin && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-cogs me-1" />{t('Nav_Orchestration')}
                      </a>
                      <ul className="dropdown-menu">
                        <li><h6 className="dropdown-header">{t('Nav_Orchestration_RulesEngine')}</h6></li>
                        <li>
                          <Link className="dropdown-item" to="/orchestration/connectors">
                            <i className="fas fa-plug me-1" />{t('Nav_Orchestration_EndPoints')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/orchestration/mappings">
                            <i className="fas fa-random me-1" />{t('Nav_Orchestration_ActionTemplates')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/orchestration/rules">
                            <i className="fas fa-gavel me-1" />{t('Nav_Orchestration_DecisionRules')}
                          </Link>
                        </li>
                        <li><hr className="dropdown-divider" /></li>
                        <li><h6 className="dropdown-header">{t('Nav_Orchestration_Connectors')}</h6></li>
                        <li>
                          <Link className="dropdown-item" to="/orchestration/boomi">
                            <i className="fas fa-rocket me-1" />{t('Nav_Orchestration_BoomiOnboarding')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/orchestration/mulesoft">
                            <i className="fas fa-rocket me-1" />{t('Nav_Orchestration_MuleSoftOnboarding')}
                          </Link>
                        </li>
                      </ul>
                    </li>
                  )}

                  {/* Data Governance */}
                  {showDataGovernance && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-shield-alt me-1" />{t('Nav_DataGovernance')}
                      </a>
                      <ul className="dropdown-menu">
                        {canSee(SectionKeys.DataGovernanceDataManagement) && (
                          <li>
                            <Link className="dropdown-item" to="/admin/data-management">
                              <i className="fas fa-table me-1" />{t('Nav_DataGovernance_DataManagement')}
                            </Link>
                          </li>
                        )}
                        {canSee(SectionKeys.DataGovernanceCountries) && (
                          <li>
                            <Link className="dropdown-item" to="/admin/countries">
                              <i className="fas fa-globe me-1" />{t('Nav_DataGovernance_Countries')}
                            </Link>
                          </li>
                        )}
                      </ul>
                    </li>
                  )}

                  {/* Monetization */}
                  {showMonetization && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-chart-line me-1" />{t('Nav_Monetization')}
                      </a>
                      <ul className="dropdown-menu">
                        {canSee(SectionKeys.MonetizationPlatformCosts) && (
                          <li>
                            <Link className="dropdown-item" to="/monetization/platform-costs">
                              <i className="fas fa-coins me-1" />{t('Nav_Monetization_PlatformCosts')}
                            </Link>
                          </li>
                        )}
                        {canSee(SectionKeys.MonetizationCrossCharging) && (
                          <li>
                            <Link className="dropdown-item" to="/monetization/cross-charging">
                              <i className="fas fa-file-invoice-dollar me-1" />{t('Nav_Monetization_CrossCharging')}
                            </Link>
                          </li>
                        )}
                        {canSee(SectionKeys.MonetizationProcessValuation) && (
                          <li>
                            <Link className="dropdown-item" to="/settings/process-values">
                              <i className="fas fa-coins me-1" />{t('Nav_Monetization_ProcessValuation')}
                            </Link>
                          </li>
                        )}
                      </ul>
                    </li>
                  )}

                  {/* Reports */}
                  {showReports && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-file-lines me-1" />{t('Nav_Reports')}
                      </a>
                      <ul className="dropdown-menu">
                        {canSee(SectionKeys.ReportsHub) && (
                          <li>
                            <Link className="dropdown-item" to="/reports">
                              <i className="fas fa-table-list me-1" />{t('Nav_Reports_Hub')}
                            </Link>
                          </li>
                        )}
                        {(canSee(SectionKeys.ReportsVolume) || canSee(SectionKeys.ReportsUsageTrend)) && (
                          <>
                            <li><hr className="dropdown-divider" /></li>
                            <li><h6 className="dropdown-header">{t('Nav_Reports_Integration')}</h6></li>
                          </>
                        )}
                        {canSee(SectionKeys.ReportsVolume) && (
                          <li>
                            <Link className="dropdown-item" to="/reports/volume">
                              <i className="fas fa-chart-column me-1" />{t('Nav_Reports_VolumeReport')}
                            </Link>
                          </li>
                        )}
                        {canSee(SectionKeys.ReportsUsageTrend) && (
                          <li>
                            <Link className="dropdown-item" to="/reports/usage-trend">
                              <i className="fas fa-chart-line me-1" />{t('Nav_Reports_UsageTrend')}
                            </Link>
                          </li>
                        )}
                      </ul>
                    </li>
                  )}
                </>
              )}

              <li className="nav-item">
                <Link className="nav-link d-flex align-items-center gap-1" to="/contact">
                  <i className="fas fa-envelope" /> {t('Nav_Contact')}
                </Link>
              </li>
            </ul>

            {/* ── Right nav ── */}
            <ul className="navbar-nav">
              {isAuthenticated ? (
                <>
                  {/* Settings — Admin only */}
                  {isAdmin && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-sliders-h me-1" />{t('Nav_Settings')}
                      </a>
                      <ul className="dropdown-menu dropdown-menu-end">
                        <li>
                          <Link className="dropdown-item" to="/settings/sla">
                            <i className="fas fa-tachometer-alt me-1" />{t('Nav_Settings_SLA')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/settings/ingestion">
                            <i className="fas fa-cog me-1" />{t('Nav_Settings_Ingestion')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/settings/translation-rules">
                            <i className="fas fa-language me-1" />{t('Nav_Settings_TranslationRules')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/settings/application">
                            <i className="fas fa-sliders-h me-1" />{t('Nav_Settings_Application')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/settings/data-retention">
                            <i className="fas fa-database me-1" />Data Retention
                          </Link>
                        </li>
                        <li><hr className="dropdown-divider" /></li>
                        <li>
                          <Link className="dropdown-item" to="/settings/transform-service">
                            <i className="fas fa-exchange-alt me-1" />{t('Nav_Settings_TransformService')}
                          </Link>
                        </li>
                      </ul>
                    </li>
                  )}

                  {/* Support — Admin only */}
                  {isAdmin && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-life-ring me-1" />{t('Nav_Support')}
                      </a>
                      <ul className="dropdown-menu dropdown-menu-end">
                        <li>
                          <Link className="dropdown-item" to="/admin/error-monitoring">
                            <i className="fas fa-exclamation-triangle me-1" />{t('Nav_Support_IngestionErrors')}
                          </Link>
                        </li>
                      </ul>
                    </li>
                  )}

                  {/* Admin Hub — Admin only */}
                  {isAdmin && (
                    <li className="nav-item dropdown">
                      <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                        <i className="fas fa-cog me-1" />{t('Nav_AdminHub')}
                      </a>
                      <ul className="dropdown-menu dropdown-menu-end">
                        <li><h6 className="dropdown-header">{t('Nav_Admin_UserManagement')}</h6></li>
                        <li>
                          <Link className="dropdown-item" to="/admin/users">
                            <i className="fas fa-users me-1" />{t('Nav_Admin_Users')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/admin/users/new">
                            <i className="fas fa-user-plus me-1" />{t('Nav_Admin_AddUser')}
                          </Link>
                        </li>
                        <li><hr className="dropdown-divider" /></li>
                        <li><h6 className="dropdown-header">{t('Nav_Admin_SecurityAudit')}</h6></li>
                        <li>
                          <Link className="dropdown-item" to="/admin/audit-logs">
                            <i className="fas fa-history me-1" />{t('Nav_Admin_AuditLogs')}
                          </Link>
                        </li>
                        <li><hr className="dropdown-divider" /></li>
                        <li><h6 className="dropdown-header">{t('Nav_Admin_AIAgents')}</h6></li>
                        <li>
                          <Link className="dropdown-item" to="/admin/agents">
                            <i className="fas fa-robot me-1" />{t('Nav_Admin_Agents')}
                          </Link>
                        </li>
                        <li>
                          <Link className="dropdown-item" to="/admin/agent-skills">
                            <i className="fas fa-brain me-1" />{t('Nav_Admin_AgentSkills')}
                          </Link>
                        </li>
                        <li><hr className="dropdown-divider" /></li>
                        <li><h6 className="dropdown-header">{t('Nav_Admin_Development')}</h6></li>
                        <li>
                          <Link className="dropdown-item" to="/admin/seed-data">
                            <i className="fas fa-database me-1" />{t('Nav_Admin_SeedTestData')}
                          </Link>
                        </li>
                        <li><hr className="dropdown-divider" /></li>
                        <li>
                          <Link className="dropdown-item" to="/admin/access-scope">
                            <i className="fas fa-lock me-1" />Access Scope
                          </Link>
                        </li>
                      </ul>
                    </li>
                  )}

                  {/* User menu */}
                  <li className="nav-item dropdown">
                    <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                      <i className="fas fa-user me-1" />{user?.displayName ?? user?.email}
                    </a>
                    <ul className="dropdown-menu dropdown-menu-end">
                      <li>
                        <Link className="dropdown-item" to="/account/profile">
                          <i className="fas fa-user-circle me-1" />{t('Nav_MyProfile')}
                        </Link>
                      </li>
                      <li>
                        <Link className="dropdown-item" to="/account/change-password">
                          <i className="fas fa-key me-1" />{t('Nav_ChangePassword')}
                        </Link>
                      </li>
                      <li><hr className="dropdown-divider" /></li>
                      <li>
                        <button className="dropdown-item" onClick={handleLogout}>
                          <i className="fas fa-sign-out-alt me-1" />{t('Nav_Logout')}
                        </button>
                      </li>
                    </ul>
                  </li>
                </>
              ) : (
                <li className="nav-item">
                  <Link className="nav-link" to="/login">
                    <i className="fas fa-sign-in-alt me-1" />{t('Nav_Login')}
                  </Link>
                </li>
              )}

              {/* Language switcher */}
              <li className="nav-item dropdown">
                <a
                  className="nav-link dropdown-toggle"
                  href="#"
                  role="button"
                  data-bs-toggle="dropdown"
                  title={t('Lang_Language')}
                >
                  <i className="fas fa-globe me-1" />{currentLang.toUpperCase()}
                </a>
                <ul className="dropdown-menu dropdown-menu-end">
                  <li>
                    <button
                      className={`dropdown-item ${currentLang === 'en' ? 'active' : ''}`}
                      onClick={() => setLang('en')}
                    >
                      🇺🇸 {t('Lang_English')}
                    </button>
                  </li>
                  <li>
                    <button
                      className={`dropdown-item ${currentLang === 'es' ? 'active' : ''}`}
                      onClick={() => setLang('es')}
                    >
                      🇪🇸 {t('Lang_Spanish')}
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </header>
  )
}
