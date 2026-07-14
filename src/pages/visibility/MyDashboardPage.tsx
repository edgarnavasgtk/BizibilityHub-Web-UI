import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import GridLayout, { useContainerWidth } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import apiClient from '../../services/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────────
interface SavedQuery {
  queryHistoryId: number
  queryName: string
  description?: string
  naturalLanguageQuery?: string
  category?: string
  isFavorite: boolean
  executionCount: number
  lastExecutedAt: string
}

interface UserDashboard {
  userDashboardId: number
  dashboardName: string
  description?: string
  icon?: string
  color?: string
  isDefault: boolean
  widgetCount: number
}

interface DashboardWidget {
  dashboardWidgetId: number
  queryHistoryId: number
  widgetTitle: string
  widgetType: string
  positionX: number
  positionY: number
  width: number
  height: number
}

interface MyDashboardData {
  availableQueries: SavedQuery[]
  userDashboards: UserDashboard[]
  currentDashboard: UserDashboard | null
  widgets: DashboardWidget[]
}

interface WidgetData {
  columns?: string[]
  rows?: Record<string, unknown>[]
  totalCount?: number
  chartData?: { labels: string[]; values: number[] }
  metricValue?: number
  metricLabel?: string
}

interface DashboardFormData {
  dashboardName: string
  description: string
  icon: string
  color: string
  isDefault: boolean
}

interface WidgetSortState {
  field: string
  dir: 'asc' | 'desc'
}

// ── SVG Bar Chart ──────────────────────────────────────────────────────────────
function SVGBarChart({ labels, values }: { labels: string[]; values: number[] }) {
  if (!labels.length || !values.length) {
    return <div style={{ textAlign: 'center', color: '#808b96', padding: 16, fontSize: 12 }}>No chart data</div>
  }
  const max = Math.max(...values, 1)
  const svgW = 400
  const svgH = 160
  const padL = 36, padB = 28, padT = 8, padR = 8
  const chartW = svgW - padL - padR
  const chartH = svgH - padB - padT
  const slot = chartW / labels.length
  const barW = Math.max(4, slot - 4)

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 160 }}>
      <line x1={padL} y1={padT} x2={padL} y2={svgH - padB} stroke="rgba(46,134,193,.3)" strokeWidth={1} />
      <line x1={padL} y1={svgH - padB} x2={svgW - padR} y2={svgH - padB} stroke="rgba(46,134,193,.3)" strokeWidth={1} />
      {values.map((v, i) => {
        const barH = Math.max(1, (v / max) * chartH)
        const x = padL + i * slot + (slot - barW) / 2
        const y = svgH - padB - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill="#3b82f6" rx={2} opacity={0.85} />
            <text x={x + barW / 2} y={svgH - padB + 14} textAnchor="middle" fill="#aed6f1" fontSize={9}>
              {String(labels[i]).slice(0, 7)}
            </text>
          </g>
        )
      })}
      <text x={padL - 4} y={padT + 6} textAnchor="end" fill="#aed6f1" fontSize={8}>{max}</text>
    </svg>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function QueryItem({ query, onAdd }: { query: SavedQuery; onAdd: (q: SavedQuery) => void }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('queryHistoryId', String(query.queryHistoryId))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        background: 'rgba(255,255,255,.05)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6,
        padding: 12, marginBottom: 10, position: 'relative', cursor: 'grab',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h6 style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, margin: 0 }}>
          {query.isFavorite && <i className="fas fa-star text-warning me-1" style={{ fontSize: 11 }} />}
          {query.queryName}
        </h6>
        <button
          style={{ background: 'none', border: 'none', color: '#aed6f1', cursor: 'pointer', padding: '0 4px', fontSize: 13 }}
          onClick={() => onAdd(query)}
          title="Add to dashboard"
        >
          <i className="fas fa-plus" />
        </button>
      </div>
      <p style={{ color: '#aed6f1', fontSize: 11, margin: '0 0 6px' }}>
        {query.description ?? query.naturalLanguageQuery ?? ''}
      </p>
      <div style={{ fontSize: 10, color: '#808b96' }}>
        {query.category && (
          <span style={{ background: 'rgba(46,134,193,.3)', color: '#60a5fa', padding: '2px 6px', borderRadius: 3, marginRight: 6 }}>{query.category}</span>
        )}
        Executed {query.executionCount}x
        <i className="fas fa-grip-horizontal" style={{ marginLeft: 6, opacity: 0.5 }} />
      </div>
    </div>
  )
}

// ── Widget Card ────────────────────────────────────────────────────────────────
function WidgetCard({
  widget,
  data,
  page,
  pageSize,
  sortField,
  sortDir,
  onRemove,
  onRefresh,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}: {
  widget: DashboardWidget
  data?: WidgetData
  page: number
  pageSize: number
  sortField: string
  sortDir: 'asc' | 'desc'
  onRemove: (id: number) => void
  onRefresh: (id: number) => void
  onPageChange: (id: number, page: number) => void
  onPageSizeChange: (id: number, pageSize: number) => void
  onSortChange: (id: number, field: string) => void
}) {
  const [view, setView] = useState<'table' | 'metric' | 'chart'>('table')
  const wid = widget.dashboardWidgetId

  const hasNextPage = data?.totalCount !== undefined
    ? page * pageSize < data.totalCount
    : (data?.rows?.length ?? 0) >= pageSize

  const ctrlStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: '#aed6f1', cursor: 'pointer', fontSize: 12,
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg,#0f172a,#1e293b)', border: '1px solid rgba(46,134,193,.3)',
      borderRadius: 8, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(46,134,193,.15)', borderBottom: '1px solid rgba(46,134,193,.3)',
        padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Drag handle — only this element initiates a grid drag */}
          <span
            className="widget-drag-handle"
            style={{ color: 'rgba(174,214,241,.5)', cursor: 'grab', fontSize: 11, lineHeight: 1, padding: '2px 4px' }}
            title="Drag to reposition"
          >
            <i className="fas fa-grip-vertical" />
          </span>
          {widget.widgetTitle}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={{ ...ctrlStyle, color: view === 'chart' ? '#3b82f6' : '#aed6f1' }} onClick={() => setView('chart')} title="Chart view"><i className="fas fa-chart-bar" /></button>
          <button style={{ ...ctrlStyle, color: view === 'table' ? '#3b82f6' : '#aed6f1' }} onClick={() => setView('table')} title="Table view"><i className="fas fa-table" /></button>
          <button style={{ ...ctrlStyle, color: view === 'metric' ? '#3b82f6' : '#aed6f1' }} onClick={() => setView('metric')} title="Metric view"><i className="fas fa-tachometer-alt" /></button>
          <button style={ctrlStyle} onClick={() => onRefresh(wid)} title="Refresh"><i className="fas fa-sync-alt" /></button>
          <button style={{ ...ctrlStyle, color: '#e74c3c' }} onClick={() => onRemove(wid)} title="Remove"><i className="fas fa-times" /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 14, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {!data ? (
          <div style={{ textAlign: 'center', color: '#808b96', padding: 16, fontSize: 12 }}>
            <i className="fas fa-spinner fa-spin me-2" />Loading...
          </div>
        ) : view === 'chart' ? (
          data.chartData ? (
            <SVGBarChart labels={data.chartData.labels} values={data.chartData.values} />
          ) : (
            <div style={{ textAlign: 'center', color: '#808b96', padding: 16, fontSize: 12 }}>No chart data available</div>
          )
        ) : view === 'metric' && data.metricValue !== undefined ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#3b82f6' }}>{data.metricValue.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: '#aed6f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 6 }}>{data.metricLabel ?? widget.widgetTitle}</div>
          </div>
        ) : data.rows && data.rows.length > 0 ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {(data.columns ?? Object.keys(data.rows[0])).map(c => (
                      <th
                        key={c}
                        onClick={() => onSortChange(wid, c)}
                        style={{
                          background: 'rgba(46,134,193,.2)', color: '#aed6f1', padding: '6px 10px',
                          textAlign: 'left', fontWeight: 600, fontSize: 10, textTransform: 'uppercase',
                          borderBottom: '1px solid rgba(46,134,193,.3)', cursor: 'pointer',
                          userSelect: 'none', whiteSpace: 'nowrap',
                        }}
                      >
                        {c}
                        {sortField === c
                          ? <i className={`fas fa-sort-${sortDir === 'asc' ? 'up' : 'down'} ms-1`} style={{ color: '#60a5fa' }} />
                          : <i className="fas fa-sort ms-1" style={{ opacity: 0.25 }} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(46,134,193,.1)' }}>
                      {(data.columns ?? Object.keys(data.rows![0])).map(c => (
                        <td key={c} style={{ padding: '5px 10px', color: '#e2e8f0' }}>{String(row[c] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Per-widget pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#808b96' }}>
                {data.totalCount !== undefined ? `${data.totalCount.toLocaleString()} total rows` : `${data.rows.length} rows`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select
                  value={pageSize}
                  onChange={e => onPageSizeChange(wid, Number(e.target.value))}
                  style={{
                    background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.3)',
                    borderRadius: 4, color: '#aed6f1', padding: '2px 6px', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/page</option>)}
                </select>
                <button
                  disabled={page <= 1}
                  onClick={() => onPageChange(wid, page - 1)}
                  style={{ ...ctrlStyle, opacity: page <= 1 ? 0.3 : 1, padding: '2px 6px', border: '1px solid rgba(46,134,193,.2)', borderRadius: 4 }}
                >
                  <i className="fas fa-chevron-left" />
                </button>
                <span style={{ fontSize: 11, color: '#aed6f1', minWidth: 52, textAlign: 'center' }}>Page {page}</span>
                <button
                  disabled={!hasNextPage}
                  onClick={() => onPageChange(wid, page + 1)}
                  style={{ ...ctrlStyle, opacity: !hasNextPage ? 0.3 : 1, padding: '2px 6px', border: '1px solid rgba(46,134,193,.2)', borderRadius: 4 }}
                >
                  <i className="fas fa-chevron-right" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#808b96', padding: 16, fontSize: 12 }}>No data available</div>
        )}
      </div>
    </div>
  )
}

// ── Add Widget Modal ───────────────────────────────────────────────────────────
function AddWidgetModal({ query, onConfirm, onCancel }: {
  query: SavedQuery
  onConfirm: (title: string, widgetType: string, width: number, height: number, posX: number, posY: number) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(query.queryName)
  const [widgetType, setWidgetType] = useState('table')
  const [width, setWidth] = useState(6)
  const [height, setHeight] = useState(2)
  const [posX, setPosX] = useState(0)
  const [posY, setPosY] = useState(0)

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(46,134,193,.3)',
    borderRadius: 6, color: '#fff', padding: '8px 10px', fontSize: 13,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', border: '1px solid rgba(46,134,193,.4)', borderRadius: 10, width: 480, padding: 24 }}>
        <h5 style={{ color: '#e2e8f0', marginBottom: 16 }}>Add Widget</h5>
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Widget Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Default View</label>
          <select
            value={widgetType}
            onChange={e => setWidgetType(e.target.value)}
            style={{ ...inputStyle, background: 'rgba(15,23,42,.85)' }}
          >
            <option value="table">Table</option>
            <option value="metric">Metric</option>
            <option value="chart">Chart</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Width (1-12)</label>
            <input type="number" min={1} max={12} value={width} onChange={e => setWidth(Number(e.target.value))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Height (rows)</label>
            <input type="number" min={1} value={height} onChange={e => setHeight(Number(e.target.value))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Position X (0-11)</label>
            <input type="number" min={0} max={11} value={posX} onChange={e => setPosX(Number(e.target.value))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Position Y (0+)</label>
            <input type="number" min={0} value={posY} onChange={e => setPosY(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => onConfirm(title, widgetType, width, height, posX, posY)}>
            Add Widget
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard Modal (create / edit) ────────────────────────────────────────────
const ICON_OPTIONS = [
  'fa-th-large', 'fa-chart-bar', 'fa-tachometer-alt', 'fa-columns',
  'fa-layer-group', 'fa-project-diagram', 'fa-chart-line', 'fa-table',
]

const COLOR_OPTIONS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function DashboardModal({
  mode,
  initial,
  onConfirm,
  onCancel,
}: {
  mode: 'create' | 'edit'
  initial?: Partial<DashboardFormData>
  onConfirm: (data: DashboardFormData) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<DashboardFormData>({
    dashboardName: initial?.dashboardName ?? '',
    description: initial?.description ?? '',
    icon: initial?.icon ?? 'fa-th-large',
    color: initial?.color ?? '#3b82f6',
    isDefault: initial?.isDefault ?? false,
  })

  const patch = <K extends keyof DashboardFormData>(k: K, v: DashboardFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(46,134,193,.3)',
    borderRadius: 6, color: '#fff', padding: '8px 10px', fontSize: 13,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', border: '1px solid rgba(46,134,193,.4)', borderRadius: 10, width: 480, padding: 24 }}>
        <h5 style={{ color: '#e2e8f0', marginBottom: 16 }}>
          {mode === 'create' ? 'New Dashboard' : 'Edit Dashboard'}
        </h5>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Dashboard Name *</label>
          <input
            value={form.dashboardName}
            onChange={e => patch('dashboardName', e.target.value)}
            placeholder="My Dashboard"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 4 }}>Description</label>
          <textarea
            value={form.description}
            onChange={e => patch('description', e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 6 }}>Icon</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ICON_OPTIONS.map(ic => (
              <button
                key={ic}
                title={ic}
                style={{
                  background: form.icon === ic ? 'rgba(59,130,246,.3)' : 'rgba(255,255,255,.06)',
                  border: `1px solid ${form.icon === ic ? '#3b82f6' : 'rgba(46,134,193,.2)'}`,
                  borderRadius: 6, color: '#aed6f1', cursor: 'pointer', padding: '6px 10px', fontSize: 13,
                }}
                onClick={() => patch('icon', ic)}
              >
                <i className={`fas ${ic}`} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#aed6f1', fontSize: 12, display: 'block', marginBottom: 6 }}>Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: c,
                  border: form.color === c ? '3px solid #fff' : '2px solid transparent',
                  cursor: 'pointer', flexShrink: 0,
                }}
                onClick={() => patch('color', c)}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#aed6f1', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isDefault} onChange={e => patch('isDefault', e.target.checked)} />
            Set as default dashboard
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            disabled={!form.dashboardName.trim()}
            onClick={() => onConfirm(form)}
          >
            {mode === 'create' ? 'Create Dashboard' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Grid Canvas wrapper using useContainerWidth ───────────────────────────────
function WidgetCanvas({
  widgets,
  widgetData,
  widgetPage,
  widgetPageSize,
  widgetSort,
  isDragOver,
  onLayoutChange,
  onRemove,
  onRefresh,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}: {
  widgets: DashboardWidget[]
  widgetData: Record<number, WidgetData>
  widgetPage: Record<number, number>
  widgetPageSize: Record<number, number>
  widgetSort: Record<number, WidgetSortState>
  isDragOver: boolean
  onLayoutChange: (layout: Layout) => void
  onRemove: (id: number) => void
  onRefresh: (id: number) => void
  onPageChange: (id: number, page: number) => void
  onPageSizeChange: (id: number, pageSize: number) => void
  onSortChange: (id: number, field: string) => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()

  // Build layout from widget positions, sorted by row/col for render order
  const sortedWidgets = [...widgets].sort((a, b) => a.positionY - b.positionY || a.positionX - b.positionX)

  const gridLayout: Layout = sortedWidgets.map((w): LayoutItem => ({
    i: String(w.dashboardWidgetId),
    x: Math.max(0, Math.min(w.positionX, 11)),
    y: Math.max(0, w.positionY),
    w: Math.max(1, Math.min(w.width, 12)),
    h: Math.max(1, w.height),
    minW: 2,
    minH: 1,
  }))

  return (
    <div ref={containerRef} style={{ position: 'relative', minHeight: 200 }}>
      {/* Drop overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0, border: '2px dashed #3b82f6', borderRadius: 8,
          background: 'rgba(59,130,246,.08)', zIndex: 10, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: '#3b82f6', fontSize: 16, fontWeight: 600 }}>
            <i className="fas fa-plus-circle me-2" />Drop to add widget
          </span>
        </div>
      )}

      {mounted && (
        <GridLayout
          width={width}
          layout={gridLayout}
          gridConfig={{ cols: 12, rowHeight: 120, margin: [12, 12] }}
          dragConfig={{ enabled: true, handle: '.widget-drag-handle' }}
          onLayoutChange={onLayoutChange}
          autoSize
        >
          {sortedWidgets.map(w => (
            <div key={String(w.dashboardWidgetId)} style={{ overflow: 'hidden' }}>
              <WidgetCard
                widget={w}
                data={widgetData[w.dashboardWidgetId]}
                page={widgetPage[w.dashboardWidgetId] ?? 1}
                pageSize={widgetPageSize[w.dashboardWidgetId] ?? 20}
                sortField={widgetSort[w.dashboardWidgetId]?.field ?? ''}
                sortDir={widgetSort[w.dashboardWidgetId]?.dir ?? 'asc'}
                onRemove={onRemove}
                onRefresh={onRefresh}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
                onSortChange={onSortChange}
              />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MyDashboardPage() {
  const qc = useQueryClient()
  const [queryFilter, setQueryFilter] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<SavedQuery | null>(null)
  const [widgetData, setWidgetData] = useState<Record<number, WidgetData>>({})
  const [localWidgets, setLocalWidgets] = useState<DashboardWidget[]>([])
  const [showCreateDash, setShowCreateDash] = useState(false)
  const [editDash, setEditDash] = useState<UserDashboard | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const saveLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-widget pagination and sort state
  const [widgetPage, setWidgetPage] = useState<Record<number, number>>({})
  const [widgetPageSize, setWidgetPageSize] = useState<Record<number, number>>({})
  const [widgetSort, setWidgetSort] = useState<Record<number, WidgetSortState>>({})

  // CRITICAL FIX: use /MyDashboard/GetDashboards instead of /MyDashboard/Index
  // which returned an HTML Razor page instead of JSON
  const { data, isLoading, isError } = useQuery<MyDashboardData>({
    queryKey: ['my-dashboard'],
    queryFn: () => apiClient.get<MyDashboardData>('/MyDashboard/GetDashboards').then(r => r.data),
  })

  const currentDashId = data?.currentDashboard?.userDashboardId ?? 0
  const currentDash = data?.currentDashboard ?? null

  // Sync local widget state with API response
  useEffect(() => {
    if (data?.widgets) setLocalWidgets(data.widgets)
  }, [data])

  // Cleanup save layout debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current)
    }
  }, [])

  // Load widget data with pagination and sort support
  const loadWidgetData = useCallback(async (
    widgetId: number,
    page = 1,
    pageSize = 20,
    sortField = '',
    sortDirection = 'asc',
  ) => {
    try {
      const params: Record<string, string | number> = { page, pageSize }
      if (sortField) {
        params.sortField = sortField
        params.sortDirection = sortDirection
      }
      const res = await apiClient.get<WidgetData>(`/MyDashboard/GetWidgetData/${widgetId}`, { params })
      setWidgetData(prev => ({ ...prev, [widgetId]: res.data }))
    } catch {
      // ignore per-widget load errors silently
    }
  }, [])

  // Load all widget data when dashboard data arrives
  useEffect(() => {
    data?.widgets.forEach(w => loadWidgetData(w.dashboardWidgetId))
  }, [data, loadWidgetData])

  // ── Per-widget pagination handlers ────────────────────────────────────────────
  const handlePageChange = useCallback((widgetId: number, newPage: number) => {
    setWidgetPage(prev => ({ ...prev, [widgetId]: newPage }))
    const ps = widgetPageSize[widgetId] ?? 20
    const s = widgetSort[widgetId] ?? { field: '', dir: 'asc' }
    loadWidgetData(widgetId, newPage, ps, s.field, s.dir)
  }, [widgetPageSize, widgetSort, loadWidgetData])

  const handlePageSizeChange = useCallback((widgetId: number, newPageSize: number) => {
    setWidgetPageSize(prev => ({ ...prev, [widgetId]: newPageSize }))
    setWidgetPage(prev => ({ ...prev, [widgetId]: 1 }))
    const s = widgetSort[widgetId] ?? { field: '', dir: 'asc' }
    loadWidgetData(widgetId, 1, newPageSize, s.field, s.dir)
  }, [widgetSort, loadWidgetData])

  // ── Per-widget sort handler ───────────────────────────────────────────────────
  const handleSortChange = useCallback((widgetId: number, field: string) => {
    const current = widgetSort[widgetId] ?? { field: '', dir: 'asc' as const }
    const newDir: 'asc' | 'desc' = current.field === field && current.dir === 'asc' ? 'desc' : 'asc'
    setWidgetSort(prev => ({ ...prev, [widgetId]: { field, dir: newDir } }))
    const p = widgetPage[widgetId] ?? 1
    const ps = widgetPageSize[widgetId] ?? 20
    loadWidgetData(widgetId, p, ps, field, newDir)
  }, [widgetSort, widgetPage, widgetPageSize, loadWidgetData])

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: (widgetId: number) => apiClient.post('/MyDashboard/RemoveWidget', { widgetId }).then(() => {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-dashboard'] }),
  })

  const addMutation = useMutation({
    mutationFn: (body: {
      queryHistoryId: number; widgetTitle: string; widgetType: string; dashboardId: number;
      width: number; height: number; positionX: number; positionY: number;
    }) => apiClient.post('/MyDashboard/AddWidget', body).then(() => {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-dashboard'] }); setPendingAdd(null) },
  })

  const saveLayoutMutation = useMutation({
    mutationFn: (widgets: DashboardWidget[]) =>
      apiClient.post('/MyDashboard/SaveLayout', {
        dashboardId: currentDashId,
        widgets: widgets.map(w => ({ widgetId: w.dashboardWidgetId, x: w.positionX, y: w.positionY, w: w.width, h: w.height })),
      }).then(() => {}),
  })

  const createDashMutation = useMutation({
    mutationFn: (body: DashboardFormData) => apiClient.post('/MyDashboard/CreateDashboard', body).then(() => {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-dashboard'] }); setShowCreateDash(false) },
  })

  const updateDashMutation = useMutation({
    mutationFn: ({ id, ...body }: DashboardFormData & { id: number }) =>
      apiClient.post('/MyDashboard/UpdateDashboard', { userDashboardId: id, ...body }).then(() => {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-dashboard'] }); setEditDash(null) },
  })

  const deleteDashMutation = useMutation({
    mutationFn: (id: number) => apiClient.post('/MyDashboard/DeleteDashboard', { userDashboardId: id }).then(() => {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-dashboard'] }),
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => apiClient.post('/MyDashboard/SetDefaultDashboard', { userDashboardId: id }).then(() => {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-dashboard'] }),
  })

  // ── Switch dashboard ──────────────────────────────────────────────────────────
  const handleSwitchDashboard = async (id: number) => {
    try {
      await apiClient.get('/MyDashboard/SwitchDashboard', { params: { id } })
      qc.invalidateQueries({ queryKey: ['my-dashboard'] })
    } catch {
      // ignore
    }
  }

  // ── Grid layout change (react-grid-layout drag/resize) ────────────────────────
  const handleLayoutChange = useCallback((layout: Layout) => {
    setLocalWidgets(prev => {
      const updated = prev.map(w => {
        const item = layout.find((l: LayoutItem) => l.i === String(w.dashboardWidgetId))
        return item ? { ...w, positionX: item.x, positionY: item.y, width: item.w, height: item.h } : w
      })
      // Debounce the save to avoid hammering the API during drag
      if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current)
      saveLayoutTimerRef.current = setTimeout(() => {
        saveLayoutMutation.mutate(updated)
      }, 800)
      return updated
    })
  }, [saveLayoutMutation])

  // ── Alignment tools ───────────────────────────────────────────────────────────
  const alignToGrid = () => {
    const aligned = localWidgets.map(w => ({
      ...w,
      positionX: Math.round(w.positionX),
      positionY: Math.round(w.positionY),
    }))
    setLocalWidgets(aligned)
    saveLayoutMutation.mutate(aligned)
  }

  const distributeEvenly = () => {
    const n = localWidgets.length
    if (!n) return
    const colsEach = Math.max(1, Math.floor(12 / n))
    const distributed = localWidgets.map((w, i) => ({
      ...w,
      width: colsEach,
      positionX: i * colsEach,
      positionY: 0,
    }))
    setLocalWidgets(distributed)
    saveLayoutMutation.mutate(distributed)
  }

  const compactLayout = () => {
    const sorted = [...localWidgets].sort((a, b) => a.positionY - b.positionY || a.positionX - b.positionX)
    let nextY = 0
    const compacted = sorted.map(w => {
      const updated = { ...w, positionY: nextY }
      nextY += w.height || 2
      return updated
    })
    setLocalWidgets(compacted)
    saveLayoutMutation.mutate(compacted)
  }

  // ── Drag-and-drop: sidebar query → grid ───────────────────────────────────────
  const handleGridDragEnter = () => {
    dragCounterRef.current += 1
    setIsDragOver(true)
  }

  const handleGridDragLeave = () => {
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }

  const handleGridDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleGridDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const rawId = e.dataTransfer.getData('queryHistoryId')
    if (rawId) {
      const found = data?.availableQueries.find(q => q.queryHistoryId === Number(rawId))
      if (found) setPendingAdd(found)
    }
  }

  // ── Filtered sidebar list ─────────────────────────────────────────────────────
  const filteredQueries = (data?.availableQueries ?? []).filter(q => {
    const matchSearch = !queryFilter || q.queryName.toLowerCase().includes(queryFilter.toLowerCase())
    const matchFav = !favoritesOnly || q.isFavorite
    return matchSearch && matchFav
  })

  // ── Refresh a single widget using current page/sort state ─────────────────────
  const handleRefreshWidget = useCallback((id: number) => {
    const p = widgetPage[id] ?? 1
    const ps = widgetPageSize[id] ?? 20
    const s = widgetSort[id] ?? { field: '', dir: 'asc' }
    loadWidgetData(id, p, ps, s.field, s.dir)
  }, [widgetPage, widgetPageSize, widgetSort, loadWidgetData])

  return (
    <div style={{ padding: 0, minHeight: 'calc(100vh - 160px)' }}>
      {/* ── Page header ── */}
      <div style={{
        padding: '1.5rem 2rem 1rem', display: 'flex',
        justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 className="h3 text-white mb-1"><i className="fas fa-th-large me-2 text-primary" />My Dashboard</h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>Create and manage custom analytics dashboards from saved queries</p>
        </div>

        {/* Dashboard management buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateDash(true)}>
            <i className="fas fa-plus me-1" />New Dashboard
          </button>
          {currentDash && (
            <>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditDash(currentDash)}>
                <i className="fas fa-edit me-1" />Edit
              </button>
              {!currentDash.isDefault && (
                <button
                  className="btn btn-outline-warning btn-sm"
                  onClick={() => setDefaultMutation.mutate(currentDash.userDashboardId)}
                  disabled={setDefaultMutation.isPending}
                >
                  <i className="fas fa-star me-1" />Set as Default
                </button>
              )}
              {(data?.userDashboards?.length ?? 0) > 1 && (
                <button
                  className="btn btn-outline-danger btn-sm"
                  disabled={deleteDashMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${currentDash.dashboardName}"? This cannot be undone.`)) {
                      deleteDashMutation.mutate(currentDash.userDashboardId)
                    }
                  }}
                >
                  <i className="fas fa-trash-alt me-1" />Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 220px)' }}>
        {/* ── Sidebar ── */}
        <div style={{
          width: 300, flexShrink: 0,
          background: 'linear-gradient(135deg,#0f172a,#1e293b)',
          borderRight: '1px solid rgba(46,134,193,.3)', padding: 20, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h6 style={{ color: '#e2e8f0', fontWeight: 600, margin: 0 }}><i className="fas fa-chart-bar me-2" />Saved Queries</h6>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => qc.invalidateQueries({ queryKey: ['my-dashboard'] })}>
              <i className="fas fa-sync-alt me-1" />Refresh All
            </button>
          </div>

          <input
            type="text" value={queryFilter} onChange={e => setQueryFilter(e.target.value)}
            placeholder="Search queries..."
            style={{
              width: '100%', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(46,134,193,.3)',
              borderRadius: 6, color: '#fff', padding: '7px 10px', fontSize: 12, marginBottom: 10,
            }}
          />

          <div className="btn-group w-100 mb-2">
            <button className={`btn btn-sm ${!favoritesOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFavoritesOnly(false)}>All</button>
            <button className={`btn btn-sm ${favoritesOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFavoritesOnly(true)}>Favorites</button>
          </div>

          <p style={{ color: '#808b96', fontSize: 11, marginBottom: 10 }}>
            <i className="fas fa-info-circle me-1" />Drag a query onto the canvas or click +
          </p>

          {isLoading && (
            <div style={{ color: '#808b96', fontSize: 12, textAlign: 'center', padding: 12 }}>
              <i className="fas fa-spinner fa-spin me-2" />Loading queries...
            </div>
          )}
          {isError && (
            <div style={{ color: '#e74c3c', fontSize: 12, padding: '8px 10px', background: 'rgba(231,76,60,.1)', borderRadius: 6, marginBottom: 10 }}>
              <i className="fas fa-exclamation-triangle me-2" />Failed to load dashboard data.
            </div>
          )}

          {filteredQueries.map(q => (
            <QueryItem key={q.queryHistoryId} query={q} onAdd={sq => setPendingAdd(sq)} />
          ))}
        </div>

        {/* ── Main canvas ── */}
        <div
          style={{ flex: 1, padding: 20, overflowY: 'auto', position: 'relative' }}
          onDragEnter={handleGridDragEnter}
          onDragLeave={handleGridDragLeave}
          onDragOver={handleGridDragOver}
          onDrop={handleGridDrop}
        >
          {/* Dashboard selector + alignment toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              style={{
                background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)',
                borderRadius: 6, color: '#fff', padding: '7px 12px', fontSize: 13, minWidth: 260,
              }}
              value={currentDashId}
              onChange={e => handleSwitchDashboard(Number(e.target.value))}
            >
              {(data?.userDashboards ?? []).map(d => (
                <option key={d.userDashboardId} value={d.userDashboardId}>
                  {d.dashboardName}{d.isDefault ? ' (Default)' : ''} - {d.widgetCount} widgets
                </option>
              ))}
            </select>

            {/* Alignment tools - shown when there are widgets to arrange */}
            {localWidgets.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  title="Snap all widget positions to nearest grid column"
                  onClick={alignToGrid}
                >
                  <i className="fas fa-border-all me-1" />Align to Grid
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  title="Space widgets at equal column offsets"
                  onClick={distributeEvenly}
                >
                  <i className="fas fa-columns me-1" />Distribute Evenly
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  title="Pack widgets upward, eliminating vertical gaps"
                  onClick={compactLayout}
                >
                  <i className="fas fa-compress-arrows-alt me-1" />Compact Layout
                </button>
              </div>
            )}
          </div>

          {/* Widgets grid */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aed6f1' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, color: 'rgba(46,134,193,.5)', marginBottom: 16, display: 'block' }} />
              <p style={{ fontSize: 13 }}>Loading dashboard...</p>
            </div>
          ) : localWidgets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aed6f1' }}>
              <i className="fas fa-chart-line" style={{ fontSize: 64, color: 'rgba(46,134,193,.3)', marginBottom: 20, display: 'block' }} />
              <h4 style={{ color: '#fff', marginBottom: 10 }}>Your dashboard is empty</h4>
              <p style={{ color: '#aed6f1', fontSize: 13 }}>Drag a query from the sidebar onto the canvas, or click + on any query</p>
            </div>
          ) : (
            <WidgetCanvas
              widgets={localWidgets}
              widgetData={widgetData}
              widgetPage={widgetPage}
              widgetPageSize={widgetPageSize}
              widgetSort={widgetSort}
              isDragOver={isDragOver}
              onLayoutChange={handleLayoutChange}
              onRemove={id => removeMutation.mutate(id)}
              onRefresh={handleRefreshWidget}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onSortChange={handleSortChange}
            />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {pendingAdd && (
        <AddWidgetModal
          query={pendingAdd}
          onConfirm={(title, widgetType, width, height, posX, posY) =>
            addMutation.mutate({
              queryHistoryId: pendingAdd.queryHistoryId,
              widgetTitle: title,
              widgetType,
              dashboardId: currentDashId,
              width,
              height,
              positionX: posX,
              positionY: posY,
            })
          }
          onCancel={() => setPendingAdd(null)}
        />
      )}

      {showCreateDash && (
        <DashboardModal
          mode="create"
          onConfirm={form => createDashMutation.mutate(form)}
          onCancel={() => setShowCreateDash(false)}
        />
      )}

      {editDash && (
        <DashboardModal
          mode="edit"
          initial={editDash}
          onConfirm={form => updateDashMutation.mutate({ id: editDash.userDashboardId, ...form })}
          onCancel={() => setEditDash(null)}
        />
      )}
    </div>
  )
}
