import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Chart, Series, ArgumentAxis, ValueAxis, Legend, Tooltip, CommonSeriesSettings, Label,
} from 'devextreme-react/chart'
import { PieChart, Series as PieSeries, Legend as PieLegend, Tooltip as PieTooltip } from 'devextreme-react/pie-chart'
import DataGrid, { Column, Paging, Pager, MasterDetail } from 'devextreme-react/data-grid'
import TagBox from 'devextreme-react/tag-box'
import FiltersSidebar from '../../components/common/FiltersSidebar'
import apiClient from '../../services/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────
interface FilterOptions {
  businessSegments: { value: number; text: string }[]
  brands:           { value: number; text: string }[]
  businessProcesses:{ value: number; text: string }[]
  businessSubprocesses: { value: number; text: string; processId: number }[]
  countries:        { value: number; text: string }[]
  environments:     { value: number; text: string }[]
}

interface FinanceFilters {
  TimePeriod: string
  Year: number
  BusinessSegmentIds: number[]
  BrandIds: number[]
  BusinessProcessIds: number[]
  BusinessSubprocessIds: number[]
  CountryIds: number[]
  EnvironmentIds: number[]
}

const TIME_PERIODS = [
  { value: 'Day',      label: 'Today' },
  { value: 'Week',     label: 'Week' },
  { value: 'Month',    label: 'Month' },
  { value: 'Quarter',  label: 'Quarter' },
  { value: '6Months',  label: '6 Months' },
  { value: 'Year',     label: 'Year' },
]

const GTEK_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#14B8A6','#F97316','#A855F7']

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(v: number) {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

function buildQS(f: FinanceFilters): Record<string, unknown> {
  return {
    TimePeriod: f.TimePeriod, Year: f.Year,
    BusinessSegmentIds:   f.BusinessSegmentIds,
    BrandIds:             f.BrandIds,
    BusinessProcessIds:   f.BusinessProcessIds,
    BusinessSubprocessIds:f.BusinessSubprocessIds,
    CountryIds:           f.CountryIds,
    EnvironmentIds:       f.EnvironmentIds,
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────
type PainVariant = 'red'|'orange'|'green'|'blue'|'purple'

function PainCard({ value, label, sublabel, variant }:
  { value: string; label: string; sublabel?: string; variant?: PainVariant }) {
  const colorMap: Record<PainVariant, string> = {
    red:    'rgba(239,68,68,.2)',
    orange: 'rgba(245,158,11,.2)',
    green:  'rgba(34,197,94,.2)',
    blue:   'rgba(59,130,246,.2)',
    purple: 'rgba(139,92,246,.2)',
  }
  const borderMap: Record<PainVariant, string> = {
    red:    'rgba(239,68,68,.4)',
    orange: 'rgba(245,158,11,.4)',
    green:  'rgba(34,197,94,.4)',
    blue:   'rgba(59,130,246,.4)',
    purple: 'rgba(139,92,246,.4)',
  }
  const textMap: Record<PainVariant, string> = {
    red: '#EF4444', orange: '#F59E0B', green: '#22C55E', blue: '#3B82F6', purple: '#8B5CF6',
  }
  const v = variant ?? 'red'
  return (
    <div style={{
      background: `linear-gradient(135deg, ${colorMap[v]} 0%, ${colorMap[v]} 100%)`,
      border: `1px solid ${borderMap[v]}`,
      borderRadius: 12, padding: 20, textAlign: 'center', position: 'relative',
      overflow: 'hidden', transition: 'all .3s ease',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: textMap[v] }} />
      <div style={{ fontSize: 36, fontWeight: 700, color: textMap[v], lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      {sublabel && <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>{sublabel}</div>}
    </div>
  )
}

function ChartCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(30,41,59,.8) 0%, rgba(15,23,42,.9) 100%)',
      border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, overflow: 'hidden', marginBottom: 20,
    }}>
      <div style={{
        background: 'linear-gradient(90deg, rgba(46,134,193,.2) 0%, transparent 100%)',
        padding: '12px 16px', borderBottom: '1px solid rgba(46,134,193,.2)',
        fontWeight: 600, fontSize: 14, color: '#fff', display: 'flex', alignItems: 'center',
      }}>
        <i className={`${icon} me-2`} style={{ color: 'var(--gtek-primary-blue)' }} />
        {title}
      </div>
      <div style={{ padding: 16, background: '#fff' }}>{children}</div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function FinanceDashboardPage() {
  const currentYear = new Date().getFullYear()
  const [activeTab, setActiveTab] = useState<'atRisk'|'whereToFocus'|'informational'>('atRisk')
  const [filters, setFilters] = useState<FinanceFilters>({
    TimePeriod: 'Month', Year: currentYear,
    BusinessSegmentIds: [], BrandIds: [], BusinessProcessIds: [],
    BusinessSubprocessIds: [], CountryIds: [], EnvironmentIds: [],
  })

  // Filter options
  const { data: opts } = useQuery<FilterOptions>({
    queryKey: ['financeFilterOptions'],
    queryFn: () => apiClient.get('/Dashboard/GetFilterOptions').then(r => r.data),
    staleTime: 300_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['finance', 'summary', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetExecutiveSummary', { params: buildQS(filters) }).then(r => r.data),
  })

  const { data: revenueAtRiskData } = useQuery({
    queryKey: ['finance', 'revenueAtRisk', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetRevenueAtRiskByIntegration', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: valueTrendData } = useQuery({
    queryKey: ['finance', 'valueTrend', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetValueTrend', { params: buildQS(filters) }).then(r => r.data ?? []),
  })

  const { data: riskByCountryData } = useQuery({
    queryKey: ['finance', 'riskByCountry', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetRiskByCountry', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: riskBySegmentData } = useQuery({
    queryKey: ['finance', 'riskBySegment', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetRiskBySegment', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: riskByProcessData } = useQuery({
    queryKey: ['finance', 'riskByProcess', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetRiskByProcess', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: riskByBrandData } = useQuery({
    queryKey: ['finance', 'riskByBrand', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetRiskByBrand', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsBySourceData } = useQuery({
    queryKey: ['finance', 'errsBySource', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsBySource', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsByDestData } = useQuery({
    queryKey: ['finance', 'errsByDest', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsByDestination', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsByLoggerData } = useQuery({
    queryKey: ['finance', 'errsByLogger', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsByLogger', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsByCountryData } = useQuery({
    queryKey: ['finance', 'errsByCountry', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsByCountry', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsBySegmentData } = useQuery({
    queryKey: ['finance', 'errsBySegment', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsBySegment', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsByBrandData } = useQuery({
    queryKey: ['finance', 'errsByBrand', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsByBrand', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsByProcessData } = useQuery({
    queryKey: ['finance', 'errsByProcess', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsByProcess', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsBySubprocessData } = useQuery({
    queryKey: ['finance', 'errsBySubprocess', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsBySubprocess', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsByStageData } = useQuery({
    queryKey: ['finance', 'errsByStage', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsByStage', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: errsByHourData } = useQuery({
    queryKey: ['finance', 'errsByHour', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetErrorsByHour', { params: buildQS(filters) }).then(r => r.data ?? []),
  })

  const { data: reliabilityData } = useQuery({
    queryKey: ['finance', 'reliability', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetReliabilityScorecard', { params: buildQS(filters) }).then(r =>
      (r.data ?? []).slice(0, 10).map((d: { segmentName: string; brandName: string; reliabilityScore: number }) => ({
        label: d.segmentName + ' - ' + d.brandName,
        reliabilityScore: d.reliabilityScore,
      }))
    ),
  })

  const { data: actionItemsData } = useQuery({
    queryKey: ['finance', 'actionItems', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetActionItems', { params: buildQS(filters) }).then(r => r.data ?? []),
  })

  const { data: valueBySegmentData } = useQuery({
    queryKey: ['finance', 'valueBySegment', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetValueBySegment', { params: buildQS(filters) }).then(r => r.data ?? []),
  })

  const { data: valueByBrandData } = useQuery({
    queryKey: ['finance', 'valueByBrand', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetValueByBrand', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: valueByProcessData } = useQuery({
    queryKey: ['finance', 'valueByProcess', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetValueByProcess', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: valueByCountryData } = useQuery({
    queryKey: ['finance', 'valueByCountry', filters],
    queryFn: () => apiClient.get('/FinanceHub/GetValueByCountry', { params: buildQS(filters) }).then(r => r.data?.slice(0, 10) ?? []),
  })

  const { data: costAllocationData } = useQuery({
    queryKey: ['finance', 'costAllocation', currentYear],
    queryFn: () => apiClient.get('/FinanceHub/GetCostAllocation', { params: { year: currentYear } }).then(r => r.data ?? []),
  })

  const refresh = useCallback(() => setFilters(f => ({ ...f })), [])

  const update = useCallback((patch: Partial<FinanceFilters>) => setFilters(f => ({ ...f, ...patch })), [])

  // Compute filtered subprocesses
  const filteredSubprocesses = filters.BusinessProcessIds.length === 0
    ? (opts?.businessSubprocesses ?? [])
    : (opts?.businessSubprocesses ?? []).filter(s => filters.BusinessProcessIds.includes(s.processId))

  const tabStyle = (active: boolean) => ({
    background: 'none', border: 'none', color: active ? '#fff' : 'rgba(255,255,255,.7)',
    padding: '12px 24px', fontWeight: 600, cursor: 'pointer', position: 'relative' as const,
    borderBottom: active ? '3px solid var(--gtek-primary-blue)' : '3px solid transparent',
    transition: 'all .3s ease',
  })

  return (
    <div className="dashboard-layout">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <FiltersSidebar onRefresh={refresh}>

        {/* Time Period */}
        <div className="filter-group">
          <label className="filter-label">Time Period</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIME_PERIODS.map(p => (
              <button key={p.value} onClick={() => update({ TimePeriod: p.value })} style={{
                background: filters.TimePeriod === p.value ? 'var(--gtek-primary-blue)' : 'rgba(46,134,193,.1)',
                border: `1px solid ${filters.TimePeriod === p.value ? 'var(--gtek-primary-blue)' : 'rgba(46,134,193,.3)'}`,
                color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Business Segment */}
        <div className="filter-group">
          <label className="filter-label">Business Segment</label>
          <TagBox
            dataSource={opts?.businessSegments ?? []}
            displayExpr="text"
            valueExpr="value"
            value={filters.BusinessSegmentIds}
            onValueChanged={e => update({ BusinessSegmentIds: e.value as number[] })}
            searchEnabled
            showSelectionControls
            applyValueMode="useButtons"
            placeholder="All Segments"
            stylingMode="outlined"
          />
        </div>

        {/* Brand */}
        <div className="filter-group">
          <label className="filter-label">Brand</label>
          <TagBox
            dataSource={opts?.brands ?? []}
            displayExpr="text"
            valueExpr="value"
            value={filters.BrandIds}
            onValueChanged={e => update({ BrandIds: e.value as number[] })}
            searchEnabled
            showSelectionControls
            applyValueMode="useButtons"
            placeholder="All Brands"
            stylingMode="outlined"
          />
        </div>

        {/* Business Process */}
        <div className="filter-group">
          <label className="filter-label">Business Process</label>
          <TagBox
            dataSource={opts?.businessProcesses ?? []}
            displayExpr="text"
            valueExpr="value"
            value={filters.BusinessProcessIds}
            onValueChanged={e => update({ BusinessProcessIds: e.value as number[], BusinessSubprocessIds: [] })}
            searchEnabled
            showSelectionControls
            applyValueMode="useButtons"
            placeholder="All Processes"
            stylingMode="outlined"
          />
        </div>

        {/* Business Subprocess — filtered by selected processes */}
        <div className="filter-group">
          <label className="filter-label">Business Subprocess</label>
          <TagBox
            dataSource={filteredSubprocesses}
            displayExpr="text"
            valueExpr="value"
            value={filters.BusinessSubprocessIds}
            onValueChanged={e => update({ BusinessSubprocessIds: e.value as number[] })}
            searchEnabled
            showSelectionControls
            applyValueMode="useButtons"
            placeholder="All Subprocesses"
            stylingMode="outlined"
          />
        </div>

        {/* Country */}
        <div className="filter-group">
          <label className="filter-label">Country</label>
          <TagBox
            dataSource={opts?.countries ?? []}
            displayExpr="text"
            valueExpr="value"
            value={filters.CountryIds}
            onValueChanged={e => update({ CountryIds: e.value as number[] })}
            searchEnabled
            showSelectionControls
            applyValueMode="useButtons"
            placeholder="All Countries"
            stylingMode="outlined"
          />
        </div>

        {/* Environment */}
        <div className="filter-group">
          <label className="filter-label">Environment</label>
          <TagBox
            dataSource={opts?.environments ?? []}
            displayExpr="text"
            valueExpr="value"
            value={filters.EnvironmentIds}
            onValueChanged={e => update({ EnvironmentIds: e.value as number[] })}
            searchEnabled
            showSelectionControls
            applyValueMode="useButtons"
            placeholder="All Environments"
            stylingMode="outlined"
          />
        </div>

      </FiltersSidebar>

      {/* ── Main content ───────────────────────────────── */}
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{
            fontSize: 24, fontWeight: 700, marginBottom: 4,
            background: 'linear-gradient(90deg, #fff 0%, #94A3B8 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            <i className="fas fa-chart-line me-2" />Financial Executive Dashboard
          </h1>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, margin: 0 }}>
            Business Impact &amp; Risk Analysis — Real-time financial monitoring
          </p>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '2px solid rgba(46,134,193,.3)', marginBottom: 20 }}>
          {(['atRisk','whereToFocus','informational'] as const).map(tab => {
            const labels = { atRisk: 'At Risk', whereToFocus: 'Where to Focus', informational: 'Informational' }
            const icons = { atRisk: 'fas fa-exclamation-triangle', whereToFocus: 'fas fa-crosshairs', informational: 'fas fa-chart-bar' }
            return (
              <button key={tab} style={tabStyle(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                <i className={`${icons[tab]} me-2`} />{labels[tab]}
              </button>
            )
          })}
        </div>

        {/* ── At Risk Tab ─────────────────────────────────── */}
        {activeTab === 'atRisk' && (
          <>
            <div className="row mb-4">
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={fmt$(summary?.revenueAtRisk ?? 0)} label="Revenue at Risk" sublabel="Failed transactions value" variant="red" />
              </div>
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={(summary?.failedTransactions ?? 0).toLocaleString()} label="Failed Transactions" sublabel="Errors & timeouts" variant="red" />
              </div>
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={fmt$(summary?.valueDelivered ?? 0)} label="Value Delivered" sublabel="Successful transactions" variant="green" />
              </div>
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={(summary?.roi ?? 0).toFixed(1) + '%'} label="Platform ROI" sublabel="Return on investment" variant="purple" />
              </div>
            </div>

            <h5 className="text-white mb-3"><i className="fas fa-chart-area me-2" />Risk Overview</h5>
            <div className="row">
              <div className="col-lg-6 mb-4">
                <ChartCard title="Revenue at Risk by Integration" icon="fas fa-money-bill-wave">
                  <Chart dataSource={revenueAtRiskData ?? []} rotated height={350}>
                    <CommonSeriesSettings argumentField="integrationName" type="bar" />
                    <Series valueField="revenueAtRisk" color="#EF4444" />
                    <Legend visible={false} />
                    <Tooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${fmt$(Number(arg.value))}` })} />
                  </Chart>
                </ChartCard>
              </div>
              <div className="col-lg-6 mb-4">
                <ChartCard title="Revenue Risk Over Time" icon="fas fa-chart-line">
                  <Chart dataSource={valueTrendData ?? []} height={350}>
                    <CommonSeriesSettings argumentField="date" type="area" />
                    <Series valueField="revenueAtRisk" name="Revenue at Risk" color="#EF4444" />
                    <Legend visible={false} />
                    <Tooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${fmt$(Number(arg.value))}` })} />
                  </Chart>
                </ChartCard>
              </div>
            </div>

            <h5 className="text-white mb-3 mt-2"><i className="fas fa-th-large me-2" />Revenue at Risk by Dimension</h5>
            <div className="row">
              <div className="col-lg-6 mb-4">
                <ChartCard title="Revenue at Risk by Country" icon="fas fa-globe">
                  <Chart dataSource={riskByCountryData ?? []} rotated height={300}>
                    <CommonSeriesSettings argumentField="countryName" type="bar" />
                    <Series valueField="revenueAtRisk" color="#EF4444" />
                    <Legend visible={false} />
                    <Tooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${fmt$(Number(arg.value))}` })} />
                  </Chart>
                </ChartCard>
              </div>
              <div className="col-lg-6 mb-4">
                <ChartCard title="Revenue at Risk by Business Segment" icon="fas fa-layer-group">
                  <Chart dataSource={riskBySegmentData ?? []} rotated height={300}>
                    <CommonSeriesSettings argumentField="segmentName" type="bar" />
                    <Series valueField="revenueAtRisk" color="#EF4444" />
                    <Legend visible={false} />
                    <Tooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${fmt$(Number(arg.value))}` })} />
                  </Chart>
                </ChartCard>
              </div>
            </div>
            <div className="row">
              <div className="col-lg-6 mb-4">
                <ChartCard title="Revenue at Risk by Business Process" icon="fas fa-sitemap">
                  <Chart dataSource={riskByProcessData ?? []} rotated height={300}>
                    <CommonSeriesSettings argumentField="processName" type="bar" />
                    <Series valueField="revenueAtRisk" color="#EF4444" />
                    <Legend visible={false} />
                    <Tooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${fmt$(Number(arg.value))}` })} />
                  </Chart>
                </ChartCard>
              </div>
              <div className="col-lg-6 mb-4">
                <ChartCard title="Revenue at Risk by Brand" icon="fas fa-tags">
                  <Chart dataSource={riskByBrandData ?? []} rotated height={300}>
                    <CommonSeriesSettings argumentField="brandName" type="bar" />
                    <Series valueField="revenueAtRisk" color="#EF4444" />
                    <Legend visible={false} />
                    <Tooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${fmt$(Number(arg.value))}` })} />
                  </Chart>
                </ChartCard>
              </div>
            </div>
          </>
        )}

        {/* ── Where to Focus Tab ──────────────────────────── */}
        {activeTab === 'whereToFocus' && (
          <>
            <h5 className="text-white mb-3"><i className="fas fa-server me-2" />Errors by System</h5>
            <div className="row">
              {[
                { title: 'Errors by Source System',      icon: 'fas fa-sign-out-alt', data: errsBySourceData,  argField: 'sourceSystem' },
                { title: 'Errors by Destination System', icon: 'fas fa-sign-in-alt',  data: errsByDestData,    argField: 'targetSystem' },
                { title: 'Errors by Logger System',      icon: 'fas fa-file-alt',     data: errsByLoggerData,  argField: 'loggerSystem' },
              ].map(c => (
                <div key={c.argField} className="col-lg-4 mb-4">
                  <ChartCard title={c.title} icon={c.icon}>
                    <Chart dataSource={c.data ?? []} rotated height={300}>
                      <CommonSeriesSettings argumentField={c.argField} type="bar" />
                      <Series valueField="errorCount" color="#F97316" />
                      <Legend visible={false} />
                      <Tooltip enabled />
                    </Chart>
                  </ChartCard>
                </div>
              ))}
            </div>

            <h5 className="text-white mb-3 mt-2"><i className="fas fa-th-large me-2" />Errors by Dimension</h5>
            <div className="row">
              {[
                { title: 'Errors by Country',           icon: 'fas fa-globe',           data: errsByCountryData,    argField: 'countryName' },
                { title: 'Errors by Business Segment',  icon: 'fas fa-layer-group',     data: errsBySegmentData,    argField: 'segmentName' },
                { title: 'Errors by Brand',             icon: 'fas fa-tags',            data: errsByBrandData,      argField: 'brandName' },
                { title: 'Errors by Business Process',  icon: 'fas fa-sitemap',         data: errsByProcessData,    argField: 'processName' },
                { title: 'Errors by Subprocess',        icon: 'fas fa-project-diagram', data: errsBySubprocessData, argField: 'subprocessName' },
                { title: 'Errors by Process Stage',     icon: 'fas fa-tasks',           data: errsByStageData,      argField: 'stage' },
              ].map(c => (
                <div key={c.argField} className="col-lg-4 mb-4">
                  <ChartCard title={c.title} icon={c.icon}>
                    <Chart dataSource={c.data ?? []} rotated height={280}>
                      <CommonSeriesSettings argumentField={c.argField} type="bar" />
                      <Series valueField="errorCount" color="#F97316" />
                      <Legend visible={false} />
                      <Tooltip enabled />
                    </Chart>
                  </ChartCard>
                </div>
              ))}
            </div>

            <h5 className="text-white mb-3 mt-2"><i className="fas fa-clock me-2" />Timing &amp; Reliability</h5>
            <div className="row">
              <div className="col-lg-6 mb-4">
                <ChartCard title="When Errors Happen" icon="fas fa-clock">
                  <Chart dataSource={errsByHourData ?? []} height={300}>
                    <CommonSeriesSettings argumentField="label" type="bar" />
                    <Series valueField="count" color="#F59E0B" />
                    <ArgumentAxis><Label overlappingBehavior="rotate" rotationAngle={-45} /></ArgumentAxis>
                    <Legend visible={false} />
                    <Tooltip enabled />
                  </Chart>
                </ChartCard>
              </div>
              <div className="col-lg-6 mb-4">
                <ChartCard title="Reliability Scorecard" icon="fas fa-clipboard-check">
                  <Chart dataSource={reliabilityData ?? []} rotated height={300}>
                    <CommonSeriesSettings argumentField="label" type="bar" />
                    <Series valueField="reliabilityScore" color="#3B82F6" />
                    <ValueAxis />
                    <Legend visible={false} />
                    <Tooltip enabled customizeTooltip={(arg) => {
                      const s = Number(arg.value)
                      const st = s >= 95 ? 'Excellent' : s >= 85 ? 'Good' : 'Needs Attention'
                      return { text: `${arg.argumentText}: ${s}% (${st})` }
                    }} />
                  </Chart>
                </ChartCard>
              </div>
            </div>

            <h5 className="text-white mb-3 mt-2"><i className="fas fa-tasks me-2" />Priority Actions</h5>
            <div className="row">
              <div className="col-12">
                <ChartCard title="Action Required — Fix Priority Matrix" icon="fas fa-tasks">
                  <DataGrid dataSource={actionItemsData ?? []} showBorders height={350}>
                    <Column dataField="integrationName" caption="Integration" width={200} />
                    <Column dataField="failures" caption="Failures" width={100} />
                    <Column dataField="revenueAtRisk" caption="Revenue at Risk" width={150} format={{ type: 'currency', precision: 0 }} />
                    <Column dataField="roiOfFixing" caption="Fix ROI" width={120}
                      cellRender={({ data }) => (
                        <span style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)', color: '#fff', padding: '4px 12px', borderRadius: 20, fontWeight: 600, fontSize: 12 }}>
                          {data.roiOfFixing != null ? data.roiOfFixing + 'x' : '—'}
                        </span>
                      )}
                    />
                    <Paging pageSize={10} />
                  </DataGrid>
                </ChartCard>
              </div>
            </div>
          </>
        )}

        {/* ── Informational Tab ───────────────────────────── */}
        {activeTab === 'informational' && (
          <>
            <div className="row mb-4">
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={(summary?.totalTransactions ?? 0).toLocaleString()} label="Total Transactions" sublabel="In selected period" variant="blue" />
              </div>
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={fmt$(summary?.totalValueProcessed ?? 0)} label="Total Value Processed" sublabel="All transactions" variant="blue" />
              </div>
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={(summary?.successRate ?? 0) + '%'} label="Success Rate" sublabel="Overall reliability" variant="green" />
              </div>
              <div className="col-lg-3 col-md-6 mb-3">
                <PainCard value={fmt$(summary?.platformCost ?? 0)} label="Platform Cost" sublabel="Annual allocation" variant="blue" />
              </div>
            </div>

            <div className="row">
              <div className="col-lg-6 mb-4">
                <ChartCard title="Value by Business Segment" icon="fas fa-layer-group">
                  <PieChart dataSource={valueBySegmentData ?? []} palette={GTEK_COLORS} height={350}>
                    <PieSeries argumentField="segmentName" valueField="valueDelivered" />
                    <PieLegend horizontalAlignment="center" verticalAlignment="bottom" />
                    <PieTooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${fmt$(Number(arg.value))}` })} />
                  </PieChart>
                </ChartCard>
              </div>
              <div className="col-lg-6 mb-4">
                <ChartCard title="Value by Brand" icon="fas fa-tags">
                  <Chart dataSource={valueByBrandData ?? []} rotated palette={GTEK_COLORS} height={350}>
                    <CommonSeriesSettings argumentField="brandName" type="bar" />
                    <Series valueField="valueDelivered" />
                    <Legend visible={false} />
                    <Tooltip enabled />
                  </Chart>
                </ChartCard>
              </div>
            </div>

            <div className="row">
              <div className="col-lg-6 mb-4">
                <ChartCard title="Value by Business Process" icon="fas fa-sitemap">
                  <Chart dataSource={valueByProcessData ?? []} rotated palette={GTEK_COLORS} height={350}>
                    <CommonSeriesSettings argumentField="processName" type="bar" />
                    <Series valueField="valueDelivered" />
                    <Legend visible={false} />
                    <Tooltip enabled />
                  </Chart>
                </ChartCard>
              </div>
              <div className="col-lg-6 mb-4">
                <ChartCard title="Value by Country" icon="fas fa-globe">
                  <Chart dataSource={valueByCountryData ?? []} rotated palette={GTEK_COLORS} height={350}>
                    <CommonSeriesSettings argumentField="countryName" type="bar" />
                    <Series valueField="valueDelivered" />
                    <Legend visible={false} />
                    <Tooltip enabled />
                  </Chart>
                </ChartCard>
              </div>
            </div>

            <div className="row">
              <div className="col-12">
                <ChartCard title="Cost Allocation by Integration" icon="fas fa-calculator">
                  <DataGrid dataSource={costAllocationData ?? []} showBorders height={400}>
                    <Column dataField="integrationName" caption="Integration" width="30%" />
                    <Column dataField="transactionCount" caption="Transactions" width="12%" alignment="right" format={{ type: 'fixedPoint', precision: 0 }} />
                    <Column dataField="avgTransactionValue" caption="Avg Value" width="12%" alignment="right" format={{ type: 'currency', precision: 2 }} />
                    <Column dataField="allocatedCost" caption="Allocated Cost" width="15%" alignment="right" format={{ type: 'currency', precision: 0 }} />
                    <Column dataField="valueDelivered" caption="Value Delivered" width="16%" alignment="right" format={{ type: 'currency', precision: 0 }} />
                    <Column dataField="roi" caption="ROI" width="10%" alignment="right"
                      cellRender={({ data }) => {
                        const roi = data.roi ?? 0
                        const color = roi >= 100 ? '#22C55E' : roi >= 0 ? '#F59E0B' : '#EF4444'
                        return <span style={{ color, fontWeight: 'bold' }}>{roi.toFixed(1)}%</span>
                      }}
                    />
                    <MasterDetail
                      enabled
                      render={({ data }: { data: { costBreakdown?: { categoryName: string; allocationMethod: string; allocatedAmount: number }[] } }) => (
                        <div style={{ padding: '8px 16px', background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6 }}>
                          <DataGrid
                            dataSource={data.costBreakdown ?? []}
                            showBorders
                            showColumnHeaders
                            rowAlternationEnabled
                          >
                            <Column dataField="categoryName" caption="Category" />
                            <Column dataField="allocationMethod" caption="Allocation Method" />
                            <Column dataField="allocatedAmount" caption="Allocated Amount" alignment="right" format={{ type: 'currency', precision: 2 }} />
                          </DataGrid>
                        </div>
                      )}
                    />
                    <Paging pageSize={10} />
                    <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />
                  </DataGrid>
                </ChartCard>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
