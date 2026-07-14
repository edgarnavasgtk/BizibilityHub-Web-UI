// ── Filter options ─────────────────────────────────────────────────────────
export interface SelectOption { value: number; text: string }
export interface BrandOption    extends SelectOption { businessSegmentId: number }
export interface SubprocessOption extends SelectOption { businessProcessId: number }

export interface FilterOptions {
  businessSegments:    SelectOption[]
  brands:              BrandOption[]
  countries:           SelectOption[]
  environments:        SelectOption[]
  businessProcesses:   SelectOption[]
  businessSubprocesses: SubprocessOption[]
  documentTypes:       string[]
  directions:          string[]
}

// ── Dashboard metrics ───────────────────────────────────────────────────────
export interface DashboardMetrics {
  total:      number
  successful: number
  failed:     number
}

export interface TopProcess {
  processName: string
  count:       number
  percentage:  number
}

export interface TrendPoint {
  date:       string
  total:      number
  successful: number
  failed:     number
}

export interface CountryCount {
  countryName: string
  count:       number
}

export interface SubprocessCount {
  subprocessName: string
  count:          number
}

export interface OriginStatusEntry {
  sourceSystem: string
  status:       string
  count:        number
}

// ── DashboardFilterModel (matches .NET DashboardFilterModel) ────────────────
export interface DashboardFilters {
  TimePeriod?:          string   // 'Today' | 'Last7Days' | 'Last30Days' | 'LastHour' | 'Last24Hours'
  EnvironmentIds?:      number[]
  BusinessProcessIds?:  number[]
  BusinessSubprocessIds?: number[]
  CountryIds?:          number[]
  BrandIds?:            number[]
  BusinessSegmentIds?:  number[]
  Direction?:           string
  DocumentType?:        string
  TrendInterval?:       string   // 'hour' | 'day'
}

// ── Transactions ────────────────────────────────────────────────────────────
// Field names match what TransactionsDevExtremeController.GetTransactions returns
export interface Transaction {
  messageId:              string
  transactionId:          string
  correlationId:          string
  documentNumber:         string
  documentType:           string
  referenceDocumentNumber?: string
  referenceDocumentType?:   string
  status:                 string
  direction:              string
  startTimestamp:         string
  endTimestamp?:          string
  executionTimeMs:        number
  integrationName:        string
  sourceSystem:           string
  targetSystem:           string
  environmentName:        string
  businessSegmentName:    string
  businessProcessName:    string
  businessSubprocessName: string
  countryName:            string
  brandName:              string
  isStart?:               boolean
  isEnd?:                 boolean
  businessProcessStage?:  string
}

export interface TransactionsResponse {
  transactions: Transaction[]
  totalCount:   number
  totalPages:   number
}

// Matches TransactionsDevExtremeController.GetTransactions parameter names
export interface TransactionFilters {
  timeMinutes?:          number
  environmentId?:        string   // singular — backend takes single int
  businessSegmentIds?:   string   // comma-separated
  businessProcessIds?:   string
  businessSubprocessIds?: string
  brandIds?:             string
  statuses?:             string
  searchDocument?:       string
  page?:                 number
  pageSize?:             number
  sortField?:            string
  sortDirection?:        string
}
