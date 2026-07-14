import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DataGrid, {
  Column, ColumnChooser, Editing, Export, FilterRow, HeaderFilter,
  MasterDetail, Pager, Paging, SearchPanel, Sorting,
} from 'devextreme-react/data-grid'
import TagBox from 'devextreme-react/tag-box'
import apiClient from '../../services/apiClient'
import { useDashboardFilterOptions } from '../../hooks/useDashboard'
import FiltersSidebar from '../../components/common/FiltersSidebar'

/* ── Types ─────────────────────────────────────────────── */
interface SystemOption { id: number; name: string }
interface ChildFlow {
  sourceSystem: string
  targetSystem: string
  loggerSystem: string
  totalExecutions: number
  errorCount: number
  reliabilityPercentage: number
  flowType: string
  averageExecutionTimeMs: number
  minExecutionTimeMs: number
  maxExecutionTimeMs: number
  stddevExecutionTimeMs: number
  totalPayloadBytes: number
  lastExecutionTimestamp: string
}

interface CatalogueRow {
  integrationName: string
  totalExecutions: number
  errorCount: number
  reliabilityPercentage: number
  flowType: string
  executionsPerHour: number
  averageExecutionTimeMs: number
  minExecutionTimeMs: number
  maxExecutionTimeMs: number
  stddevExecutionTimeMs: number
  totalPayloadBytes: number
  hourlyPattern?: number[]
  dailyPattern?: number[]
  averageTransactionValue?: number
  isManualValue?: boolean
  estimatedFixCost?: number
  platformCostMonthly?: number
  allocatedAnnualCost?: number
  valueDelivered?: number
  allocatedROI?: number
  lastExecutionTimestamp: string
  childFlows?: ChildFlow[]
}

/* ── Helpers ────────────────────────────────────────────── */
function formatBytes(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0 B'
  if (n < 1024) return `${n.toFixed(0)} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

const FLOW_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  'Constant Flow': { bg: '#d4edda', color: '#155724' },
  'Variable Flow': { bg: '#fff3cd', color: '#856404' },
  'Peak Flow':     { bg: '#f8d7da', color: '#721c24' },
}

function reliabilityColor(v: number) {
  if (v >= 95) return '#28a745'
  if (v >= 90) return '#ffc107'
  return '#dc3545'
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(30,41,59,.8)',
  color: '#e2e8f0',
  border: '1px solid rgba(46,134,193,.3)',
  fontSize: 13,
}

/* ── Inline sparkline ────────────────────────────────────── */
function SparklineSVG({ values }: { values?: number[] }) {
  if (!values || values.length < 2) return null
  const W = 200
  const H = 36
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="#2196F3" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

/* ── Child-flow detail component ────────────────────────── */
function ChildFlowDetail({ data }: { data: CatalogueRow }) {
  const flows = data.childFlows ?? []
  if (!flows.length) return <p className="text-muted p-3 mb-0">No endpoint-level data available.</p>
  return (
    <DataGrid
      dataSource={flows}
      showBorders={true}
      showRowLines={true}
      columnAutoWidth={true}
      height="auto"
    >
      <Column dataField="sourceSystem"          caption="Source"       width={180} />
      <Column dataField="targetSystem"          caption="Target"       width={180} />
      <Column dataField="loggerSystem"          caption="Logger"       width={180} />
      <Column dataField="totalExecutions"       caption="Executions"   dataType="number" width={120} alignment="right" />
      <Column
        dataField="errorCount"
        caption="Errors"
        dataType="number"
        width={100}
        alignment="right"
        cellRender={({ value }) => (
          <span style={{ fontWeight: 700, color: value > 0 ? '#E74C3C' : '#27AE60' }}>
            {value?.toLocaleString()}
          </span>
        )}
      />
      <Column
        dataField="reliabilityPercentage"
        caption="Reliability"
        dataType="number"
        width={110}
        alignment="right"
        cellRender={({ value }) => (
          <span style={{ fontWeight: 700, color: reliabilityColor(value) }}>
            {value?.toFixed(2)}%
          </span>
        )}
      />
      <Column
        dataField="flowType"
        caption="Flow Type"
        width={140}
        alignment="center"
        cellRender={({ value }) => {
          const c = FLOW_TYPE_COLORS[value] ?? { bg: '#e2e8f0', color: '#333' }
          return (
            <span style={{ ...c, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
              {value}
            </span>
          )
        }}
      />
      <Column dataField="averageExecutionTimeMs" caption="Avg (ms)"   dataType="number" width={100} alignment="right" format={{ type: 'fixedPoint', precision: 2 }} />
      <Column dataField="minExecutionTimeMs"     caption="Min (ms)"   dataType="number" width={90}  alignment="right" format={{ type: 'fixedPoint', precision: 2 }} />
      <Column dataField="maxExecutionTimeMs"     caption="Max (ms)"   dataType="number" width={90}  alignment="right" format={{ type: 'fixedPoint', precision: 2 }} />
      <Column dataField="stddevExecutionTimeMs"  caption="Std (ms)"   dataType="number" width={90}  alignment="right" format={{ type: 'fixedPoint', precision: 2 }} />
      <Column
        dataField="totalPayloadBytes"
        caption="Volume"
        dataType="number"
        width={100}
        alignment="right"
        cellRender={({ value }) => formatBytes(value)}
      />
      <Column dataField="lastExecutionTimestamp" caption="Last Exec"  dataType="datetime" width={170} format="dd/MM/yyyy HH:mm" />
    </DataGrid>
  )
}

/* ── Main page ──────────────────────────────────────────── */
export default function IntegrationCataloguePage() {
  const { data: filterOpts } = useDashboardFilterOptions()
  const queryClient = useQueryClient()

  const [timeWindowHours, setTimeWindowHours] = useState(24)
  const [showAll, setShowAll]               = useState(false)
  const [segmentIds, setSegmentIds]         = useState<string[]>([])
  const [processIds, setProcessIds]         = useState<string[]>([])
  const [subprocessIds, setSubprocessIds]   = useState<string[]>([])
  const [sourceSystems, setSourceSystems]   = useState<number[]>([])
  const [targetSystems, setTargetSystems]   = useState<number[]>([])

  // Committed params (load on mount + on Refresh)
  const [params, setParams] = useState({
    timeWindowHours, showAll, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems,
  })

  /* ── Static option lists ── */
  const { data: sourceSystemOptions = [] } = useQuery<SystemOption[]>({
    queryKey: ['catalogueSourceSystems'],
    queryFn: () => apiClient.get<SystemOption[]>('/IntegrationCatalogue/GetSourceSystems').then(r => r.data),
    staleTime: Infinity,
  })

  const { data: targetSystemOptions = [] } = useQuery<SystemOption[]>({
    queryKey: ['catalogueTargetSystems'],
    queryFn: () => apiClient.get<SystemOption[]>('/IntegrationCatalogue/GetTargetSystems').then(r => r.data),
    staleTime: Infinity,
  })

  /* ── Cascaded subprocess options ── */
  const [subprocessOptions, setSubprocessOptions] = useState<{ value: string; text: string }[]>([])

  useEffect(() => {
    if (processIds.length === 0) {
      setSubprocessOptions(
        (filterOpts?.businessSubprocesses ?? []).map((o) => ({ value: String(o.value), text: o.text }))
      )
      return
    }
    Promise.all(
      processIds.map((pid) =>
        apiClient
          .get<{ value: number; text: string }[]>(
            `/IntegrationCatalogue/GetBusinessSubprocesses?businessProcessId=${pid}`
          )
          .then((r) => r.data)
          .catch(() => [] as { value: number; text: string }[])
      )
    ).then((results) => {
      const merged = results.flat()
      const seen = new Set<number>()
      const unique = merged.filter((o) => {
        if (seen.has(o.value)) return false
        seen.add(o.value)
        return true
      })
      setSubprocessOptions(unique.map((o) => ({ value: String(o.value), text: o.text })))
      setSubprocessIds((prev) => {
        const validValues = new Set(unique.map((o) => String(o.value)))
        return prev.filter((id) => validValues.has(id))
      })
    })
  }, [processIds, filterOpts])

  const { data: totalFlowCount } = useQuery<number>({
    queryKey: ['integrationFlowCount'],
    queryFn: () => apiClient.get<number>('/IntegrationCatalogue/GetIntegrationFlowCount').then(r => r.data),
    staleTime: 60_000,
  })

  const { data = [], isFetching } = useQuery<CatalogueRow[]>({
    queryKey: ['catalogue', params],
    queryFn: async () => {
      const qs = new URLSearchParams()
      qs.append('timeWindowHours', String(params.timeWindowHours))
      qs.append('showAllIntegrations', String(params.showAll))
      params.segmentIds.forEach((id) => qs.append('businessSegmentId', id))
      params.processIds.forEach((id) => qs.append('businessProcessId', id))
      params.subprocessIds.forEach((id) => qs.append('businessSubprocessId', id))
      params.sourceSystems.forEach((s) => qs.append('sourceSystem', String(s)))
      params.targetSystems.forEach((s) => qs.append('targetSystem', String(s)))

      const [catalogue, allocations] = await Promise.all([
        apiClient.get<CatalogueRow[]>(`/IntegrationCatalogue/GetIntegrationCatalogue?${qs}`).then((r) => r.data),
        apiClient.get<{ integrationName: string; allocatedCost: number; valueDelivered: number; roi: number }[]>(
          '/IntegrationCatalogue/GetCostAllocations',
        ).then((r) => r.data).catch(() => []),
      ])

      const allocationMap = new Map(allocations.map((a) => [a.integrationName, a]))
      return catalogue.map((row) => {
        const a = allocationMap.get(row.integrationName)
        if (a) {
          return { ...row, allocatedAnnualCost: a.allocatedCost, valueDelivered: a.valueDelivered, allocatedROI: a.roi }
        }
        return row
      })
    },
  })

  const handleRefresh = useCallback(() => {
    setParams({ timeWindowHours, showAll, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems })
  }, [timeWindowHours, showAll, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems])

  /* ── Cell-editing: POST to UpdateIntegrationFlow ── */
  const handleRowUpdating = useCallback((e: any) => {
    const merged: CatalogueRow = { ...e.oldData, ...e.newData }
    const isManualValue = 'averageTransactionValue' in e.newData
      ? true
      : (e.oldData.isManualValue ?? false)
    e.cancel = apiClient
      .post('/IntegrationCatalogue/UpdateIntegrationFlow', {
        integrationName: merged.integrationName,
        averageTransactionValue: merged.averageTransactionValue,
        estimatedFixCost: merged.estimatedFixCost,
        platformCostMonthly: merged.platformCostMonthly,
        isManualValue,
      })
      .then(() => {
        queryClient.setQueryData(['catalogue', params], (old: CatalogueRow[] | undefined) =>
          (old ?? []).map(r =>
            r.integrationName === merged.integrationName
              ? { ...r, ...e.newData, isManualValue }
              : r,
          ),
        )
        return false // let DevExtreme apply the local change
      })
      .catch(() => true) // cancel on API error
  }, [params, queryClient])

  /* ── Unlock manual-value override ── */
  const handleUnlockManualValue = useCallback((row: CatalogueRow) => {
    apiClient
      .post('/IntegrationCatalogue/UpdateIntegrationFlow', {
        integrationName: row.integrationName,
        averageTransactionValue: row.averageTransactionValue,
        isManualValue: false,
      })
      .then(() => {
        queryClient.setQueryData(['catalogue', params], (old: CatalogueRow[] | undefined) =>
          (old ?? []).map(r =>
            r.integrationName === row.integrationName ? { ...r, isManualValue: false } : r,
          ),
        )
      })
  }, [params, queryClient])

  /* Summary stats */
  const totalIntegrations = data.length
  const totalTransactions = data.reduce((s, r) => s + (r.totalExecutions ?? 0), 0)
  const avgReliability    = totalIntegrations
    ? data.reduce((s, r) => s + (r.reliabilityPercentage ?? 0), 0) / totalIntegrations
    : 0
  const avgExecTime = totalIntegrations
    ? data.reduce((s, r) => s + (r.averageExecutionTimeMs ?? 0), 0) / totalIntegrations
    : 0

  /* Segment/Process option lists mapped to string keys */
  const segmentItems  = (filterOpts?.businessSegments  ?? []).map((o) => ({ value: String(o.value), text: o.text }))
  const processItems  = (filterOpts?.businessProcesses ?? []).map((o) => ({ value: String(o.value), text: o.text }))
  // subprocessItems comes from the cascaded subprocessOptions state

  return (
    <div className="dashboard-layout" style={{ background: 'var(--gtek-dark-blue)' }}>

      {/* ── Sidebar ──────────────────────────────────────── */}
      <FiltersSidebar loading={isFetching}>

        <div className="filter-group">
          <label className="filter-label">Time Window</label>
          <select
            className="form-select form-select-sm"
            value={timeWindowHours}
            onChange={(e) => setTimeWindowHours(Number(e.target.value))}
            style={selectStyle}
          >
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
            <option value={48}>48 hours</option>
            <option value={168}>7 days</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Business Segment</label>
          <TagBox
            dataSource={segmentItems}
            displayExpr="text"
            valueExpr="value"
            value={segmentIds}
            onValueChanged={(e) => setSegmentIds(e.value ?? [])}
            applyValueMode="useButtons"
            showSelectionControls={true}
            showClearButton={true}
            searchEnabled={true}
            placeholder="All Segments"
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Business Process</label>
          <TagBox
            dataSource={processItems}
            displayExpr="text"
            valueExpr="value"
            value={processIds}
            onValueChanged={(e) => setProcessIds(e.value ?? [])}
            applyValueMode="useButtons"
            showSelectionControls={true}
            showClearButton={true}
            searchEnabled={true}
            placeholder="All Processes"
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Business Subprocess</label>
          <TagBox
            dataSource={subprocessOptions}
            displayExpr="text"
            valueExpr="value"
            value={subprocessIds}
            onValueChanged={(e) => setSubprocessIds(e.value ?? [])}
            applyValueMode="useButtons"
            showSelectionControls={true}
            showClearButton={true}
            searchEnabled={true}
            placeholder="All Subprocesses"
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Source System</label>
          <TagBox
            dataSource={sourceSystemOptions}
            displayExpr="name"
            valueExpr="id"
            value={sourceSystems}
            onValueChanged={(e) => setSourceSystems(e.value ?? [])}
            applyValueMode="useButtons"
            showSelectionControls={true}
            showClearButton={true}
            searchEnabled={true}
            placeholder="All Source Systems"
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Target System</label>
          <TagBox
            dataSource={targetSystemOptions}
            displayExpr="name"
            valueExpr="id"
            value={targetSystems}
            onValueChanged={(e) => setTargetSystems(e.value ?? [])}
            applyValueMode="useButtons"
            showSelectionControls={true}
            showClearButton={true}
            searchEnabled={true}
            placeholder="All Target Systems"
          />
        </div>

        {/* Show All toggle */}
        <div className="filter-group">
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="showAllToggle"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <label className="form-check-label text-white" htmlFor="showAllToggle" style={{ fontSize: 13 }}>
              Show All Integrations{totalFlowCount != null ? ` (${totalFlowCount})` : ''}
            </label>
          </div>
        </div>

        <div className="filter-group mt-2 d-grid gap-2">
          <button className="btn btn-primary btn-sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching
              ? <><span className="spinner-border spinner-border-sm me-2" />Loading…</>
              : <><i className="fas fa-sync-alt me-2" />Refresh</>
            }
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => {
              setTimeWindowHours(24); setShowAll(false)
              setSegmentIds([]); setProcessIds([]); setSubprocessIds([])
              setSourceSystems([]); setTargetSystems([])
            }}
          >
            <i className="fas fa-eraser me-2" />Clear
          </button>
        </div>
      </FiltersSidebar>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="dashboard-content">

        {/* Header */}
        <div className="mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <h1 className="h3 text-white mb-1">
              <i className="fas fa-list-check me-2 text-primary" />Integration Catalogue
            </h1>
            <p className="text-muted mb-0" style={{ fontSize: 14 }}>
              Last {timeWindowHours}h · {totalIntegrations} integrations
            </p>
          </div>
        </div>

        {/* Summary stats */}
        {totalIntegrations > 0 && (
          <div className="row g-3 mb-4">
            {[
              { label: 'Integrations',     value: totalIntegrations.toLocaleString(),      icon: 'fas fa-plug',          color: '#3b82f6' },
              { label: 'Total Executions', value: totalTransactions.toLocaleString(),       icon: 'fas fa-exchange-alt',  color: '#8b5cf6' },
              { label: 'Avg Reliability',  value: `${avgReliability.toFixed(1)}%`,          icon: 'fas fa-check-circle',  color: '#10b981' },
              { label: 'Avg Exec Time',    value: `${Math.round(avgExecTime).toLocaleString()}ms`, icon: 'fas fa-clock', color: '#f59e0b' },
            ].map((s) => (
              <div key={s.label} className="col-6 col-md-3">
                <div
                  className="text-center p-3 rounded"
                  style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}
                >
                  <i className={s.icon} style={{ fontSize: 24, color: s.color }} />
                  <div className="text-white fw-bold mt-2" style={{ fontSize: 22 }}>{s.value}</div>
                  <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        <div
          className="rounded overflow-hidden"
          style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}
        >
          {isFetching && data.length === 0 ? (
            <div className="text-center py-5">
              <span className="spinner-border text-primary" />
            </div>
          ) : (
            <DataGrid
              dataSource={data}
              showBorders={false}
              showColumnLines={true}
              showRowLines={true}
              rowAlternationEnabled={true}
              columnAutoWidth={true}
              allowColumnResizing={true}
              allowColumnReordering={true}
              wordWrapEnabled={false}
              height={620}
              onRowUpdating={handleRowUpdating}
            >
              <Editing
                mode="cell"
                allowUpdating={true}
                startEditAction="dblClick"
              />
              <FilterRow visible={true} />
              <HeaderFilter visible={true} />
              <SearchPanel visible={true} width={280} placeholder="Search integrations..." />
              <ColumnChooser enabled={true} />
              <Sorting mode="multiple" />
              <Export enabled={true} />
              <Paging pageSize={20} />
              <Pager showPageSizeSelector allowedPageSizes={[10, 20, 50, 100]} showInfo showNavigationButtons />

              <MasterDetail enabled={true} component={({ data: { data: row } }) => <ChildFlowDetail data={row} />} />

              <Column dataField="integrationName"        caption="Integration Name"  width={250} fixed allowEditing={false}
                cellRender={({ value }) => <strong style={{ color: '#e2e8f0' }}>{value}</strong>}
              />
              <Column dataField="totalExecutions"        caption="Executions"        dataType="number" width={120} alignment="right" allowEditing={false}
                cellRender={({ value }) => <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#3498DB' }}>{value?.toLocaleString()}</span>}
              />
              <Column dataField="errorCount"             caption="Errors"            dataType="number" width={90}  alignment="right" allowEditing={false}
                cellRender={({ value }) => <span style={{ fontWeight: 700, color: value > 0 ? '#E74C3C' : '#27AE60' }}>{value?.toLocaleString()}</span>}
              />
              <Column
                dataField="reliabilityPercentage"
                caption="Reliability"
                dataType="number"
                width={110}
                alignment="right"
                allowEditing={false}
                cellRender={({ value }) => (
                  <span style={{ fontWeight: 700, color: reliabilityColor(value) }}>{value?.toFixed(2)}%</span>
                )}
              />
              <Column
                dataField="flowType"
                caption="Flow Type"
                width={140}
                alignment="center"
                allowEditing={false}
                cellRender={({ value }) => {
                  const c = FLOW_TYPE_COLORS[value] ?? { bg: '#e2e8f0', color: '#333' }
                  return (
                    <span style={{ ...c, padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      {value}
                    </span>
                  )
                }}
              />
              <Column dataField="executionsPerHour"      caption="Execs / hr"        dataType="number" width={110} alignment="right" allowEditing={false}
                format={{ type: 'fixedPoint', precision: 1 }}
                cellRender={({ value }) => <span style={{ fontWeight: 600, color: '#16A085' }}>{(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>}
              />
              <Column caption="Processing Time (ms)" alignment="center">
                <Column dataField="averageExecutionTimeMs" caption="Avg"     dataType="number" width={85}  alignment="right" allowEditing={false} format={{ type: 'fixedPoint', precision: 2 }} />
                <Column dataField="minExecutionTimeMs"     caption="Min"     dataType="number" width={85}  alignment="right" allowEditing={false} format={{ type: 'fixedPoint', precision: 2 }} />
                <Column dataField="maxExecutionTimeMs"     caption="Max"     dataType="number" width={85}  alignment="right" allowEditing={false} format={{ type: 'fixedPoint', precision: 2 }} />
                <Column dataField="stddevExecutionTimeMs"  caption="Std Dev" dataType="number" width={90}  alignment="right" allowEditing={false} format={{ type: 'fixedPoint', precision: 2 }} />
              </Column>
              <Column
                dataField="totalPayloadBytes"
                caption="Volume"
                dataType="number"
                width={110}
                alignment="right"
                allowEditing={false}
                cellRender={({ value }) => <span style={{ fontWeight: 600, color: '#7F8C8D' }}>{formatBytes(value)}</span>}
              />
              <Column
                dataField="hourlyPattern"
                caption="Hourly Pattern"
                width={220}
                allowSorting={false}
                allowFiltering={false}
                allowEditing={false}
                cellRender={({ data: row }) => <SparklineSVG values={row.hourlyPattern} />}
              />
              <Column
                dataField="dailyPattern"
                caption="Daily Pattern"
                width={220}
                allowSorting={false}
                allowFiltering={false}
                allowEditing={false}
                cellRender={({ data: row }) => <SparklineSVG values={row.dailyPattern} />}
              />
              <Column
                dataField="averageTransactionValue"
                caption="Avg Txn Value"
                dataType="number"
                width={140}
                alignment="right"
                cellRender={({ value, data: row }) => (
                  <span>
                    {value != null ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                    {row.isManualValue && (
                      <i
                        className="fas fa-lock ms-1"
                        style={{ color: '#F59E0B', fontSize: 11, cursor: 'pointer' }}
                        title="Manual override – click to unlock"
                        onClick={(evt) => { evt.stopPropagation(); handleUnlockManualValue(row) }}
                      />
                    )}
                  </span>
                )}
              />
              <Column dataField="estimatedFixCost"   caption="Est. Fix Cost"   dataType="number" width={130} alignment="right"
                cellRender={({ value }) => value > 0 ? <span style={{ fontWeight: 600, color: '#F59E0B' }}>${value?.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> : <span style={{ color: '#9CA3AF', fontSize: '0.85em' }}>—</span>}
              />
              <Column dataField="allocatedAnnualCost" caption="Allocated Cost" dataType="number" width={130} alignment="right" allowEditing={false}
                cellRender={({ value }) => value > 0 ? <span style={{ fontWeight: 600, color: '#F59E0B' }}>${value?.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> : null}
              />
              <Column dataField="valueDelivered"     caption="Value Delivered" dataType="number" width={140} alignment="right" allowEditing={false}
                cellRender={({ value }) => value > 0 ? <span style={{ fontWeight: 600, color: '#10B981' }}>${value?.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> : null}
              />
              <Column
                dataField="allocatedROI"
                caption="Platform ROI"
                dataType="number"
                width={110}
                alignment="right"
                allowEditing={false}
                cellRender={({ value }) => {
                  if (value == null) return null
                  const color = value >= 100 ? '#10B981' : value >= 50 ? '#F59E0B' : '#EF4444'
                  return <span style={{ fontWeight: 700, color }}>{value.toFixed(0)}%</span>
                }}
              />
              <Column dataField="lastExecutionTimestamp" caption="Last Execution" dataType="datetime" width={170} allowEditing={false} format="dd/MM/yyyy HH:mm:ss" />
            </DataGrid>
          )}
        </div>

      </div>
    </div>
  )
}
