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
export interface Transaction {
  correlationId:      string
  transactionId:      string
  messageId:          string
  documentNumber:     string
  documentType:       string
  status:             string
  businessProcess:    string
  businessSubprocess: string
  brand:              string
  environment:        string
  country:            string
  sourceSystem:       string
  targetSystem:       string
  direction:          string
  startTimestamp:     string
  endTimestamp:       string
  executionTimeMs:    number
  integrationName:    string
  errorMessage:       string
  errorCode:          string
  childCount:         number
}

export interface TransactionsResponse {
  data:       Transaction[]
  totalCount: number
  page:       number
  pageSize:   number
  totalPages: number
}

export interface TransactionFilters {
  timeMinutes?:          number
  environmentIds?:       string
  businessSegmentIds?:   string
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
