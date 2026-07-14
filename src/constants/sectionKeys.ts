export const SectionKeys = {
  VisibilityRealtime:              'visibility.realtime',
  VisibilitySla:                   'visibility.sla',
  VisibilityTransactions:          'visibility.transactions',
  VisibilityExecutive:             'visibility.executive',
  VisibilityHistory:               'visibility.history',
  ArchitectureMap:                 'architecture.map',
  ArchitectureCatalogue:           'architecture.catalogue',
  AgenticAi:                       'agentic.ai',
  DataGovernanceDataManagement:    'datagovernance.datamanagement',
  DataGovernanceCountries:         'datagovernance.countries',
  MonetizationPlatformCosts:       'monetization.platformcosts',
  MonetizationCrossCharging:       'monetization.crosscharging',
  MonetizationProcessValuation:    'monetization.processvaluation',
  ReportsHub:                      'reports.hub',
  ReportsVolume:                   'reports.volume',
  ReportsUsageTrend:               'reports.usagetrend',
} as const

export type SectionKey = typeof SectionKeys[keyof typeof SectionKeys]

export const AllSections = Object.values(SectionKeys) as SectionKey[]
