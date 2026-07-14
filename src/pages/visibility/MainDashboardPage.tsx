import { useQueryClient } from '@tanstack/react-query'
import {
  PieChart, Series as PieSeries, Legend as PieLegend, Tooltip as PieTooltip,
} from 'devextreme-react/pie-chart'
import {
  Chart, Series, ArgumentAxis, ValueAxis, Legend, Tooltip, CommonSeriesSettings, Label,
} from 'devextreme-react/chart'
import FiltersSidebar from '../../components/common/FiltersSidebar'
import {
  useDashboardFilterOptions, useDashboardMetrics,
  useTopProcesses, useTransactionTrend,
  useTransactionsByCountry, useSubprocessCounts,
  useDashboardFilters,
} from '../../hooks/useDashboard'

const TIME_PERIODS = [
  { value: 'LastHour',    label: 'Last Hour' },
  { value: 'Last24Hours', label: 'Last 24 Hours' },
  { value: 'Today',       label: 'Today' },
  { value: 'Last7Days',   label: 'Last 7 Days' },
  { value: 'Last30Days',  label: 'Last 30 Days' },
]

export default function MainDashboardPage() {
  const qc                     = useQueryClient()
  const { filters, update }    = useDashboardFilters()
  const { data: opts }         = useDashboardFilterOptions()
  const { data: metrics, isFetching: mFetch } = useDashboardMetrics(filters)
  const { data: topProcesses } = useTopProcesses(filters)
  const { data: trend }        = useTransactionTrend(filters)
  const { data: countries }    = useTransactionsByCountry(filters)
  const { data: subprocesses } = useSubprocessCounts(filters)

  const refresh = () => qc.invalidateQueries({ queryKey: ['dashboard'] })

  return (
    <div className="dashboard-layout" style={{ background: 'var(--gtek-dark-blue)' }}>

      {/* ── Filter sidebar ─────────────────────────────── */}
      <FiltersSidebar onRefresh={refresh} loading={mFetch}>

        {/* Time Period */}
        <div className="filter-group">
          <label className="filter-label">Time Period</label>
          <select
            className="form-select form-select-sm"
            value={filters.TimePeriod ?? 'Last24Hours'}
            onChange={(e) => update({ TimePeriod: e.target.value })}
            style={{ background: 'rgba(30,41,59,.8)', color: '#fff', border: '1px solid rgba(46,134,193,.3)' }}
          >
            {TIME_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Environment */}
        <div className="filter-group">
          <label className="filter-label">Environment</label>
          <select
            className="form-select form-select-sm"
            value={filters.EnvironmentIds?.[0] ?? ''}
            onChange={(e) => update({ EnvironmentIds: e.target.value ? [Number(e.target.value)] : [] })}
            style={{ background: 'rgba(30,41,59,.8)', color: '#fff', border: '1px solid rgba(46,134,193,.3)' }}
          >
            <option value="">All</option>
            {opts?.environments.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
          </select>
        </div>

        {/* Business Process */}
        <div className="filter-group">
          <label className="filter-label">Business Process</label>
          <select
            className="form-select form-select-sm"
            value={filters.BusinessProcessIds?.[0] ?? ''}
            onChange={(e) => update({ BusinessProcessIds: e.target.value ? [Number(e.target.value)] : [] })}
            style={{ background: 'rgba(30,41,59,.8)', color: '#fff', border: '1px solid rgba(46,134,193,.3)' }}
          >
            <option value="">All</option>
            {opts?.businessProcesses.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
          </select>
        </div>

        {/* Country */}
        <div className="filter-group">
          <label className="filter-label">Country</label>
          <select
            className="form-select form-select-sm"
            value={filters.CountryIds?.[0] ?? ''}
            onChange={(e) => update({ CountryIds: e.target.value ? [Number(e.target.value)] : [] })}
            style={{ background: 'rgba(30,41,59,.8)', color: '#fff', border: '1px solid rgba(46,134,193,.3)' }}
          >
            <option value="">All</option>
            {opts?.countries.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
          </select>
        </div>

        {/* Brand */}
        <div className="filter-group">
          <label className="filter-label">Brand</label>
          <select
            className="form-select form-select-sm"
            value={filters.BrandIds?.[0] ?? ''}
            onChange={(e) => update({ BrandIds: e.target.value ? [Number(e.target.value)] : [] })}
            style={{ background: 'rgba(30,41,59,.8)', color: '#fff', border: '1px solid rgba(46,134,193,.3)' }}
          >
            <option value="">All</option>
            {opts?.brands.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
          </select>
        </div>

        {/* Direction */}
        <div className="filter-group">
          <label className="filter-label">Direction</label>
          <select
            className="form-select form-select-sm"
            value={filters.Direction ?? ''}
            onChange={(e) => update({ Direction: e.target.value || undefined })}
            style={{ background: 'rgba(30,41,59,.8)', color: '#fff', border: '1px solid rgba(46,134,193,.3)' }}
          >
            <option value="">All</option>
            <option value="Inbound">Inbound</option>
            <option value="Outbound">Outbound</option>
          </select>
        </div>

        {/* Trend Interval */}
        <div className="filter-group">
          <label className="filter-label">Trend Interval</label>
          <select
            className="form-select form-select-sm"
            value={filters.TrendInterval ?? 'hour'}
            onChange={(e) => update({ TrendInterval: e.target.value })}
            style={{ background: 'rgba(30,41,59,.8)', color: '#fff', border: '1px solid rgba(46,134,193,.3)' }}
          >
            <option value="hour">Hourly</option>
            <option value="day">Daily</option>
          </select>
        </div>

      </FiltersSidebar>

      {/* ── Main content ───────────────────────────────── */}
      <div className="dashboard-content" id="dashboardContent">

        <div className="mb-3">
          <h1 className="h3 text-white mb-1">Business Process Monitoring Dashboard</h1>
          <p className="text-muted mb-0">Real-time transaction monitoring and analytics</p>
        </div>

        {/* Metric cards */}
        <div className="row mb-4">
          <div className="col-md-4 mb-3">
            <div className="metric-card total">
              <div className="metric-value total">{metrics?.total ?? 0}</div>
              <div className="metric-label">Total</div>
            </div>
          </div>
          <div className="col-md-4 mb-3">
            <div className="metric-card success">
              <div className="metric-value success">{metrics?.successful ?? 0}</div>
              <div className="metric-label">Successful</div>
            </div>
          </div>
          <div className="col-md-4 mb-3">
            <div className="metric-card error">
              <div className="metric-value error">{metrics?.failed ?? 0}</div>
              <div className="metric-label">Failure</div>
            </div>
          </div>
        </div>

        {/* Charts row 1 */}
        <div className="row">
          {/* Top Processes — Pie */}
          <div className="col-lg-4 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-chart-pie me-2" />Top Used Processes
              </div>
              <div className="card-body p-3">
                <PieChart
                  dataSource={topProcesses ?? []}
                  palette="Soft Blue"
                  height={300}
                >
                  <PieSeries argumentField="processName" valueField="count">
                  </PieSeries>
                  <PieLegend visible={true} horizontalAlignment="right" verticalAlignment="top" />
                  <PieTooltip enabled={true} customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${arg.valueText} (${(topProcesses?.find(p => p.processName === arg.argumentText)?.percentage ?? 0)}%)` })} />
                </PieChart>
              </div>
            </div>
          </div>

          {/* Subprocess counts — Bar */}
          <div className="col-lg-4 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-chart-bar me-2" />Transaction Count by SubProcesses
              </div>
              <div className="card-body p-3">
                <Chart dataSource={subprocesses ?? []} height={300} palette="Ocean">
                  <CommonSeriesSettings argumentField="subprocessName" type="bar" />
                  <Series valueField="count" name="Count" color="#3498DB" />
                  <ArgumentAxis>
                    <Label overlappingBehavior="rotate" rotationAngle={-30} />
                  </ArgumentAxis>
                  <Legend visible={false} />
                  <Tooltip enabled={true} />
                </Chart>
              </div>
            </div>
          </div>

          {/* Countries — Bar horizontal */}
          <div className="col-lg-4 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-globe me-2" />Transaction Count by Country
              </div>
              <div className="card-body p-3">
                <Chart dataSource={countries ?? []} height={300} rotated={true} palette="Ocean">
                  <CommonSeriesSettings argumentField="countryName" type="bar" />
                  <Series valueField="count" name="Count" color="#2ECC71" />
                  <Legend visible={false} />
                  <Tooltip enabled={true} />
                </Chart>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Trend — full width */}
        <div className="row">
          <div className="col-12 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-chart-line me-2" />Trend of Transactions by Status
              </div>
              <div className="card-body p-3">
                <Chart dataSource={trend ?? []} height={320}>
                  <CommonSeriesSettings argumentField="date" type="spline" />
                  <Series valueField="total"      name="Total"      color="#3498DB" />
                  <Series valueField="successful" name="Successful" color="#2ECC71" />
                  <Series valueField="failed"     name="Failed"     color="#E74C3C" />
                  <ArgumentAxis />
                  <ValueAxis />
                  <Legend visible={true} horizontalAlignment="right" verticalAlignment="top" />
                  <Tooltip enabled={true} shared={true} />
                </Chart>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
