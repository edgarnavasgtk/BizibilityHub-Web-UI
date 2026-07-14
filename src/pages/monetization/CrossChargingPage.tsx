import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Chart, Series, ValueAxis, Label, Legend, Tooltip, CommonSeriesSettings,
} from 'devextreme-react/chart'
import { PieChart, Series as PieSeries, Legend as PieLegend, Tooltip as PieTooltip } from 'devextreme-react/pie-chart'
import DataGrid, {
  Column, Paging, Pager, FilterRow, HeaderFilter, SearchPanel, Summary, TotalItem, MasterDetail,
} from 'devextreme-react/data-grid'
import type { DataGridRef } from 'devextreme-react/data-grid'
import notify from 'devextreme/ui/notify'
import { exportDataGrid } from 'devextreme/excel_exporter'
import { Workbook } from 'exceljs'
import apiClient from '../../services/apiClient'

// ── Types ────────────────────────────────────────────────────────────────────
interface PeriodOption {
  id: string
  name: string
  year: number
  month: number
}

interface CrossChargingRow {
  costCenterName: string
  transactionCount: number
  successCount: number
  failedCount: number
  successRate: number
  usagePercentage: number
  allocatedCost: number
  valueDelivered: number
  roi: number
  costPerTransaction: number
  costBreakdown: { category: string; method: string; amount: number }[]
}

interface CrossChargingSummary {
  monthlyPlatformCost: number
  totalTransactions: number
  monthName: string
  year: number
}

interface CrossChargingResponse {
  summary: CrossChargingSummary
  data: CrossChargingRow[]
  error?: string
}

const COST_CENTER_TYPES = [
  { id: 'segment',     name: 'Business Segment' },
  { id: 'brand',       name: 'Brand' },
  { id: 'process',     name: 'Business Process' },
  { id: 'subprocess',  name: 'Business Subprocess' },
  { id: 'country',     name: 'Country' },
  { id: 'integration', name: 'Integration Flow' },
]

const GTEK_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4','#84CC16']

// ── File-save helper (no external dep) ───────────────────────────────────────
function saveAs(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(v: number) {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December']

// ── Sub-components ────────────────────────────────────────────────────────────
function PainCard({ value, label, sublabel, color, borderColor }: {
  value: string; label: string; sublabel?: string; color: string; borderColor: string
}) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(30,41,59,.95) 0%, rgba(15,23,42,.95) 100%)',
      border: `1px solid rgba(46,134,193,.2)`, borderLeft: `4px solid ${borderColor}`,
      borderRadius: 12, padding: 20, textAlign: 'center', transition: 'all .3s ease',
    }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 4, color }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,.9)', fontSize: '.9rem', fontWeight: 500 }}>{label}</div>
      {sublabel && <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.75rem', marginTop: 4 }}>{sublabel}</div>}
    </div>
  )
}

function ChartCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(30,41,59,.95) 0%, rgba(15,23,42,.95) 100%)',
      border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, overflow: 'hidden', marginBottom: 20,
    }}>
      <div style={{
        background: 'linear-gradient(90deg, rgba(46,134,193,.2) 0%, transparent 100%)',
        padding: '12px 16px', borderBottom: '1px solid rgba(46,134,193,.2)',
        fontWeight: 600, fontSize: 14, color: 'white', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <i className={icon} style={{ color: 'var(--gtek-primary-blue)' }} />{title}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function BreakdownDetail({ data }: { data: CrossChargingRow }) {
  const breakdown = data.costBreakdown ?? []
  if (!breakdown.length) return <div style={{ padding: 12, color: '#9CA3AF' }}>No cost breakdown available</div>
  return (
    <div style={{ padding: 12, background: 'rgba(255,255,255,.05)' }}>
      <DataGrid dataSource={breakdown} showBorders columnAutoWidth>
        <Column dataField="category" caption="Cost Category" />
        <Column dataField="method" caption="Allocation Method" width={130} />
        <Column dataField="amount" caption="Amount" width={130} format={{ type: 'currency', precision: 2 }} />
      </DataGrid>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CrossChargingPage() {
  const [costCenterType, setCostCenterType] = useState('segment')
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [result, setResult] = useState<CrossChargingResponse | null>(null)
  const [calculating, setCalculating] = useState(false)
  const gridRef = useRef<DataGridRef>(null)

  // Load available periods
  const { data: periods } = useQuery<PeriodOption[]>({
    queryKey: ['crossCharging', 'periods'],
    queryFn: () => apiClient.get('/FinanceHub/GetAvailablePeriods').then(r =>
      (r.data ?? []).map((p: { year: number; month: number; transactionCount: number }) => ({
        id: `${p.year}-${p.month}`,
        name: `${MONTHS[p.month]} ${p.year} (${p.transactionCount.toLocaleString()} txns)`,
        year: p.year,
        month: p.month,
      }))
    ),
  })

  // Set default period once data loads
  useEffect(() => {
    if (periods && periods.length > 0 && !selectedPeriod) {
      setSelectedPeriod(periods[0].id)
    }
  }, [periods, selectedPeriod])

  const calculate = useCallback(async () => {
    if (!costCenterType || !selectedPeriod) {
      notify('Please select both cost center type and period', 'warning', 3000)
      return
    }
    const [year, month] = selectedPeriod.split('-').map(Number)
    setCalculating(true)
    try {
      const r = await apiClient.get('/FinanceHub/GetCrossCharging', { params: { year, month, costCenterType } })
      if (r.data?.error && !r.data?.data) {
        notify(r.data.error, 'error', 3000)
        setResult(null)
      } else {
        setResult(r.data)
        const typeName = COST_CENTER_TYPES.find(t => t.id === costCenterType)?.name ?? costCenterType
        notify(`Cross-charging calculated for ${r.data.data?.length ?? 0} ${typeName} rows`, 'success', 3000)
      }
    } catch {
      notify('Failed to calculate cross-charging', 'error', 3000)
    } finally {
      setCalculating(false)
    }
  }, [costCenterType, selectedPeriod])

  // ── Export handlers ────────────────────────────────────────────────────────
  const exportExcel = useCallback(async () => {
    const instance = gridRef.current?.instance()
    if (!instance) return
    const workbook = new Workbook()
    const worksheet = workbook.addWorksheet('CrossCharging')
    await exportDataGrid({
      component: instance,
      worksheet: worksheet as unknown as object,
      autoFilterEnabled: true,
      customizeCell: ({ gridCell, excelCell }) => {
        if (!gridCell) return
        if (gridCell.rowType === 'data') {
          const field = (gridCell.column as { dataField?: string } | undefined)?.dataField ?? ''
          const val = gridCell.value as number
          if (['allocatedCost', 'valueDelivered', 'costPerTransaction'].includes(field)) {
            excelCell.value = val
            ;(excelCell as { numFmt: string }).numFmt = field === 'costPerTransaction' ? '$#,##0.0000' : '$#,##0.00'
          } else if (['usagePercentage', 'successRate', 'roi'].includes(field)) {
            excelCell.value = val / 100
            ;(excelCell as { numFmt: string }).numFmt = '0.00%'
          } else if (['transactionCount', 'successCount', 'failedCount'].includes(field)) {
            excelCell.value = val
            ;(excelCell as { numFmt: string }).numFmt = '#,##0'
          }
        }
        if (gridCell.rowType === 'header') {
          ;(excelCell as { font: object; fill: object }).font = { bold: true, color: { argb: 'FFFFFFFF' } }
          ;(excelCell as { font: object; fill: object }).fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' },
          }
        }
      },
    })
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(
      new Blob([buffer], { type: 'application/octet-stream' }),
      `CrossCharging_${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
    notify('Export complete', 'success', 2000)
  }, [])

  const exportCsv = useCallback(() => {
    if (!result?.data?.length) return
    const COLS: (keyof CrossChargingRow)[] = [
      'costCenterName', 'transactionCount', 'successCount', 'failedCount',
      'successRate', 'usagePercentage', 'allocatedCost', 'valueDelivered',
      'roi', 'costPerTransaction',
    ]
    const HEADERS = [
      'Cost Center', 'Transactions', 'Successes', 'Failures',
      'Success %', 'Usage %', 'Allocated Cost', 'Value Delivered',
      'ROI %', 'Cost / Transaction',
    ]
    const escape = (v: unknown): string => {
      if (v == null) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines = [HEADERS.join(',')]
    for (const r of result.data) {
      lines.push(COLS.map(c => escape(r[c])).join(','))
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    saveAs(blob, `CrossCharging_${new Date().toISOString().slice(0, 10)}.csv`)
    notify('CSV export complete', 'success', 2000)
  }, [result])

  const exportJson = useCallback(() => {
    if (!result?.data?.length) return
    const envelope = {
      report: 'CrossCharging',
      costCenterType,
      generatedAt: new Date().toISOString(),
      summary: result.summary ?? null,
      data: result.data,
    }
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json;charset=utf-8' })
    saveAs(blob, `CrossCharging_${new Date().toISOString().slice(0, 10)}.json`)
    notify('JSON export complete', 'success', 2000)
  }, [result, costCenterType])

  const summary = result?.summary
  const data = result?.data ?? []
  const avgCost = data.length > 0 ? data.reduce((s, d) => s + d.allocatedCost, 0) / data.length : 0
  const top10 = data.slice(0, 10)

  const selectStyle: React.CSSProperties = {
    background: 'rgba(15,23,42,.8)', border: '1px solid rgba(46,134,193,.3)',
    color: '#fff', borderRadius: 6, padding: '8px 12px', width: '100%', fontSize: 14,
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      minHeight: '100vh',
    }}>
      <div className="container-fluid px-4 py-4">

        {/* ── Page Header ─────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,.15) 0%, rgba(139,92,246,.15) 100%)',
          border: '1px solid rgba(59,130,246,.3)', borderRadius: 12, padding: '24px 32px', marginBottom: 24,
        }}>
          <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fas fa-file-invoice-dollar me-2" />Cross-Charging
          </h1>
          <p style={{ color: 'rgba(255,255,255,.7)', margin: '4px 0 0', fontSize: '.95rem' }}>
            Allocate platform costs to business units for internal billing
          </p>
        </div>

        {/* ── Parameters Panel ─────────────────────────────── */}
        <div className="row mb-4">
          <div className="col-12">
            <ChartCard title="Cross-Charging Parameters" icon="fas fa-filter">
              <div className="row align-items-end">
                <div className="col-md-3 mb-3">
                  <label style={{ color: 'rgba(255,255,255,.7)', fontSize: '.85rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>Cost Center Type</label>
                  <select value={costCenterType} onChange={e => setCostCenterType(e.target.value)} style={selectStyle}>
                    {COST_CENTER_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label style={{ color: 'rgba(255,255,255,.7)', fontSize: '.85rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>Period</label>
                  <select value={selectedPeriod ?? ''} onChange={e => setSelectedPeriod(e.target.value)} style={selectStyle}>
                    <option value="">Select period...</option>
                    {(periods ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <button onClick={calculate} disabled={calculating} style={{
                    background: 'linear-gradient(135deg,#3B82F6,#2563EB)', border: 'none', color: 'white',
                    padding: '10px 20px', fontWeight: 600, width: '100%', borderRadius: 6, cursor: calculating ? 'not-allowed' : 'pointer',
                    opacity: calculating ? .7 : 1,
                  }}>
                    <i className={`fas ${calculating ? 'fa-spinner fa-spin' : 'fa-calculator'} me-2`} />
                    {calculating ? 'Calculating...' : 'Calculate'}
                  </button>
                </div>
                <div className="col-md-3 mb-3">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {/* Export buttons — disabled when no data */}
                    {[
                      { icon: 'fa-file-excel', title: 'Export to Excel', onClick: exportExcel },
                      { icon: 'fa-file-csv',   title: 'Export to CSV',   onClick: exportCsv },
                      { icon: 'fa-file-code',  title: 'Export to JSON',  onClick: exportJson },
                    ].map(btn => (
                      <button key={btn.icon} disabled={!data.length} title={btn.title} onClick={btn.onClick} style={{
                        background: 'linear-gradient(135deg,#475569,#334155)', border: 'none', color: 'white',
                        padding: '10px 20px', fontWeight: 600, flex: 1, borderRadius: 6,
                        cursor: data.length ? 'pointer' : 'not-allowed', opacity: data.length ? 1 : .5,
                      }}>
                        <i className={`fas ${btn.icon}`} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </ChartCard>
          </div>
        </div>

        {/* ── Summary Cards ────────────────────────────────── */}
        {result && (
          <div className="row mb-4">
            <div className="col-lg-3 col-md-6 mb-3">
              <PainCard value={fmt$(summary?.monthlyPlatformCost ?? 0)} label="Monthly Platform Cost" sublabel={summary ? `${summary.monthName} ${summary.year}` : ''} color="#3B82F6" borderColor="#3B82F6" />
            </div>
            <div className="col-lg-3 col-md-6 mb-3">
              <PainCard value={(summary?.totalTransactions ?? 0).toLocaleString()} label="Total Transactions" sublabel="In selected period" color="#3B82F6" borderColor="#3B82F6" />
            </div>
            <div className="col-lg-3 col-md-6 mb-3">
              <PainCard value={data.length.toLocaleString()} label="Cost Centers" sublabel={COST_CENTER_TYPES.find(t => t.id === costCenterType)?.name} color="#3B82F6" borderColor="#3B82F6" />
            </div>
            <div className="col-lg-3 col-md-6 mb-3">
              <PainCard value={fmt$(avgCost)} label="Avg Cost / Center" sublabel="Average allocation" color="#8B5CF6" borderColor="#8B5CF6" />
            </div>
          </div>
        )}

        {/* ── Cross-Charging Grid ──────────────────────────── */}
        <div className="row">
          <div className="col-12">
            <ChartCard title="Cross-Charging Allocation Results" icon="fas fa-file-invoice-dollar">
              <DataGrid ref={gridRef} dataSource={data} showBorders showRowLines rowAlternationEnabled wordWrapEnabled height={500}>
                <FilterRow visible />
                <HeaderFilter visible />
                <SearchPanel visible width={240} />
                <Paging pageSize={20} />
                <Pager showPageSizeSelector allowedPageSizes={[10, 20, 50, 100]} showInfo showNavigationButtons />
                <Column dataField="costCenterName" caption="Cost Center" width="18%" fixed />
                <Column dataField="transactionCount" caption="Transactions" dataType="number" format={{ type: 'fixedPoint', precision: 0 }} width="10%" alignment="right" />
                <Column dataField="usagePercentage" caption="Usage %" width="10%" alignment="right"
                  cellRender={({ data: d }) => (
                    <div style={{
                      background: `linear-gradient(90deg, rgba(59,130,246,.3) ${d.usagePercentage}%, transparent ${d.usagePercentage}%)`,
                      padding: '4px 8px', borderRadius: 4,
                    }}>
                      {d.usagePercentage.toFixed(2)}%
                    </div>
                  )} />
                <Column dataField="allocatedCost" caption="Allocated Cost" dataType="number" format={{ type: 'currency', precision: 2 }} width="12%" alignment="right" sortOrder="desc" />
                <Column dataField="valueDelivered" caption="Value Delivered" dataType="number" format={{ type: 'currency', precision: 2 }} width="12%" alignment="right" />
                <Column dataField="roi" caption="ROI" width="8%" alignment="right"
                  cellRender={({ data: d }) => {
                    const color = d.roi >= 0 ? '#10B981' : '#EF4444'
                    return <span style={{ color, fontWeight: 'bold' }}>{(d.roi >= 0 ? '+' : '') + d.roi.toFixed(1)}%</span>
                  }} />
                <Column dataField="costPerTransaction" caption="Cost/Txn" dataType="number" format={{ type: 'currency', precision: 4 }} width="10%" alignment="right" />
                <Column dataField="successRate" caption="Success Rate" width="10%" alignment="right"
                  cellRender={({ data: d }) => {
                    const color = d.successRate >= 95 ? '#10B981' : d.successRate >= 90 ? '#F59E0B' : '#EF4444'
                    return <span style={{ color }}>{d.successRate.toFixed(1)}%</span>
                  }} />
                <Column dataField="successCount" caption="Success" dataType="number" format={{ type: 'fixedPoint', precision: 0 }} width="5%" alignment="right" />
                <Column dataField="failedCount" caption="Failed" width="5%" alignment="right"
                  cellRender={({ data: d }) => (
                    d.failedCount > 0
                      ? <span style={{ color: '#EF4444' }}>{d.failedCount.toLocaleString()}</span>
                      : <span>0</span>
                  )} />
                <MasterDetail enabled render={({ data: d }) => <BreakdownDetail data={d} />} />
                <Summary>
                  <TotalItem column="transactionCount" summaryType="sum" displayFormat="Total: {0}" valueFormat={{ type: 'fixedPoint', precision: 0 }} />
                  <TotalItem column="allocatedCost" summaryType="sum" displayFormat="Total: {0}" valueFormat={{ type: 'currency', precision: 2 }} />
                  <TotalItem column="valueDelivered" summaryType="sum" displayFormat="Total: {0}" valueFormat={{ type: 'currency', precision: 2 }} />
                </Summary>
              </DataGrid>
            </ChartCard>
          </div>
        </div>

        {/* ── Charts ──────────────────────────────────────── */}
        <div className="row mt-4">
          <div className="col-lg-6 mb-4">
            <ChartCard title="Cost Distribution by Cost Center" icon="fas fa-chart-pie">
              <PieChart dataSource={top10} palette={GTEK_COLORS} height={350}>
                <PieSeries
                  argumentField="costCenterName"
                  valueField="allocatedCost"
                  label={{
                    visible: true,
                    connector: { visible: true },
                    customizeText: (pt: { argumentText: string; value: string | number | Date }) =>
                      `${pt.argumentText}: ${fmt$(Number(pt.value))}`,
                  }}
                />
                <PieLegend visible horizontalAlignment="right" verticalAlignment="top" />
                <PieTooltip enabled customizeTooltip={(arg) => ({
                  text: `${arg.argumentText}\n${fmt$(Number(arg.value))} (${arg.percentText})`,
                })} />
              </PieChart>
            </ChartCard>
          </div>
          <div className="col-lg-6 mb-4">
            <ChartCard title="ROI by Cost Center" icon="fas fa-balance-scale">
              <Chart
                dataSource={top10}
                palette={GTEK_COLORS}
                rotated
                height={350}
                customizePoint={(pt: { value: number }) => {
                  if (pt.value < 0) return { color: '#EF4444' }
                  if (pt.value > 100) return { color: '#10B981' }
                  return {}
                }}
              >
                <CommonSeriesSettings argumentField="costCenterName" type="bar" />
                <Series valueField="roi" color="#3B82F6" />
                <ValueAxis>
                  <Label customizeText={(arg: { value: string | number | Date; valueText: string }) => `${arg.value}%`} />
                </ValueAxis>
                <Legend visible={false} />
                <Tooltip enabled customizeTooltip={(arg) => ({ text: `${arg.argumentText}: ${Number(arg.value).toFixed(1)}% ROI` })} />
              </Chart>
            </ChartCard>
          </div>
        </div>

      </div>
    </div>
  )
}
