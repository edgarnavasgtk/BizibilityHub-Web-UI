import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import apiClient from '../../services/apiClient'

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date }
interface QueryResult {
  success: boolean; data?: Record<string, unknown>[]; columns?: string[]
  sql?: string; explanation?: string; error?: string; isInteractive?: boolean
  rowCount?: number; queryHistoryId?: number
}
interface SmartSuggestion { icon: string; text: string }
interface SavedQuery {
  id: number; name: string; category?: string; description?: string
  naturalLanguageQuery: string; sqlQuery?: string; isFavorite: boolean
}
interface FeedbackStats { helpful: number; needsImprovement: number; incorrect: number }
interface VizConfig {
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'map'
  xAxis: string; yAxis: string; title: string; colorScheme: string
}
interface QueryHistoryEntry {
  id: string; query: string; timestamp: Date; rowCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const QUERY_CATEGORIES = ['Performance', 'Errors', 'Volume', 'Geography', 'Trends', 'Business']
const COLOR_SCHEMES: Record<string, string[]> = {
  default: ['#2e86c1', '#e67e22', '#27ae60', '#8e44ad', '#c0392b', '#16a085', '#f39c12', '#2c3e50'],
  ocean:   ['#0077b6', '#00b4d8', '#90e0ef', '#48cae4', '#023e8a', '#0096c7', '#0083b0', '#ade8f4'],
  forest:  ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7', '#d8f3dc', '#1b4332'],
  sunset:  ['#e63946', '#f4a261', '#e76f51', '#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#a8dadc'],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isNumericCol(col: string, data: Record<string, unknown>[]): boolean {
  const l = col.toLowerCase()
  if (l.includes('id') || l.includes('name') || l.includes('code')) return false
  return data.some(r => { const v = r[col]; return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(parseFloat(v))) })
}

function isCountryCol(col: string): boolean {
  const l = col.toLowerCase()
  return l === 'country' || l === 'country_name' || l === 'country_code' || l === 'cc' ||
    l.includes('country') || l.includes('nation') || l.includes('geography') || l.includes('region') || l === 'geo'
}

function convertToCSV(columns: string[], data: Record<string, unknown>[]): string {
  const escape = (val: unknown): string => {
    const s = val === null || val === undefined ? '' : String(val)
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map(escape).join(',')
  const rows = data.map(row => columns.map(col => escape(row[col])).join(','))
  return [header, ...rows].join('\r\n')
}

function fmtCell(value: unknown, col: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    const l = col.toLowerCase()
    if ((l.includes('rate') || l.includes('percent')) && value <= 1) return `${(value * 100).toFixed(2)}%`
    if (l.includes('rate') || l.includes('percent') || (l.includes('success') && value <= 100)) return `${value.toFixed(2)}%`
    return value.toLocaleString()
  }
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    try { const d = new Date(value); if (!isNaN(d.getTime())) return d.toLocaleString() } catch { /* keep */ }
  }
  return String(value)
}
function fmtAxisNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────
function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n')
  const result: ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  const inlineMarkdown = (s: string): ReactNode =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
      if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ background: '#f0f0f0', borderRadius: 3, padding: '1px 4px', fontFamily: 'Consolas,monospace', fontSize: '0.9em', color: '#c7254e' }}>{p.slice(1, -1)}</code>
      return p
    })

  const flushList = () => {
    if (!listItems.length) return
    result.push(<ul key={key++} style={{ paddingLeft: 20, marginBottom: 12 }}>{listItems.map((li, i) => <li key={i} style={{ marginBottom: 4, color: '#212529' }}>{inlineMarkdown(li)}</li>)}</ul>)
    listItems = []
  }

  for (const line of lines) {
    if (line.startsWith('### ')) { flushList(); result.push(<h6 key={key++} style={{ fontWeight: 700, color: '#0f172a', marginTop: 16, marginBottom: 6 }}>{line.slice(4)}</h6>); continue }
    if (line.startsWith('## '))  { flushList(); result.push(<h5 key={key++} style={{ fontWeight: 700, color: '#0f172a', marginTop: 18, marginBottom: 8 }}>{line.slice(3)}</h5>); continue }
    if (line.startsWith('# '))   { flushList(); result.push(<h4 key={key++} style={{ fontWeight: 700, color: '#0f172a', marginTop: 20, marginBottom: 10 }}>{line.slice(2)}</h4>); continue }
    if (line.startsWith('- ') || line.startsWith('* ')) { listItems.push(line.slice(2)); continue }
    if (line.trim() === '') { flushList(); continue }
    flushList()
    result.push(<p key={key++} style={{ color: '#212529', marginBottom: 8, lineHeight: 1.6 }}>{inlineMarkdown(line)}</p>)
  }
  flushList()
  return result
}

// ─── SVG Chart Component ──────────────────────────────────────────────────────
function SvgChart({ config, data }: { config: VizConfig; data: Record<string, unknown>[] }) {
  const colors = COLOR_SCHEMES[config.colorScheme] ?? COLOR_SCHEMES.default
  if (!config.xAxis || !config.yAxis || data.length === 0)
    return <div className="text-center text-muted py-5">Select X and Y axes above to preview the chart.</div>

  const limited = data.slice(0, 50)
  const xVals = limited.map(r => String(r[config.xAxis] ?? ''))
  const yVals = limited.map(r => { const v = r[config.yAxis]; return typeof v === 'number' ? v : parseFloat(String(v)) || 0 })
  const W = 640, H = 340
  const PAD = { t: config.title ? 44 : 24, r: 24, b: 72, l: 72 }
  const cW = W - PAD.l - PAD.r
  const cH = H - PAD.t - PAD.b

  // ── Map: horizontal bar chart for geographic data ──
  if (config.chartType === 'map') {
    const paired = limited.map((_r, i) => ({ label: xVals[i], value: yVals[i] }))
      .sort((a, b) => b.value - a.value)
    const maxV = Math.max(...paired.map(p => p.value), 1)
    const rowH = 28, leftPad = 140, rightPad = 70
    const mH = (config.title ? 44 : 20) + paired.length * rowH + 24
    const mW = 640
    return (
      <svg viewBox={`0 0 ${mW} ${mH}`} style={{ width: '100%', maxHeight: 520, overflow: 'visible' }}>
        {config.title && <text x={mW / 2} y={18} textAnchor="middle" fontWeight="bold" fontSize={14} fill="#212529">{config.title}</text>}
        <text x={mW / 2} y={(config.title ? 44 : 20) - 6} textAnchor="middle" fontSize={11} fill="#888">Geographic Distribution</text>
        {paired.map((p, i) => {
          const bw = Math.max(2, (p.value / maxV) * (mW - leftPad - rightPad))
          const y = (config.title ? 44 : 20) + i * rowH
          return (
            <g key={i}>
              <text x={leftPad - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize={11} fill="#333">
                {p.label.length > 18 ? p.label.slice(0, 18) + '…' : p.label}
              </text>
              <rect x={leftPad} y={y + 4} width={bw} height={rowH - 8} fill={colors[i % colors.length]} rx={3} opacity={0.85}>
                <title>{p.label}: {fmtAxisNum(p.value)}</title>
              </rect>
              <text x={leftPad + bw + 5} y={y + rowH / 2 + 4} fontSize={10} fill="#555">{fmtAxisNum(p.value)}</text>
            </g>
          )
        })}
      </svg>
    )
  }

  if (config.chartType === 'pie') {
    const total = yVals.reduce((a, b) => a + b, 0) || 1
    const cx = 170, cy = H / 2, r = 130
    let angle = -Math.PI / 2
    const slices = yVals.map((v, i) => {
      const sweep = (v / total) * 2 * Math.PI
      const x1 = cx + r * Math.cos(angle); const y1 = cy + r * Math.sin(angle)
      angle += sweep
      const x2 = cx + r * Math.cos(angle); const y2 = cy + r * Math.sin(angle)
      return { d: `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`, pct: ((v / total) * 100).toFixed(1), label: xVals[i], color: colors[i % colors.length] }
    })
    const lgTop = (H - Math.min(12, slices.length) * 22) / 2
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 340 }}>
        {config.title && <text x={W / 2} y={18} textAnchor="middle" fontWeight="bold" fontSize={14} fill="#212529">{config.title}</text>}
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth={2}><title>{s.label}: {s.pct}%</title></path>)}
        {slices.slice(0, 12).map((s, i) => (
          <g key={i} transform={`translate(330,${lgTop + i * 22})`}>
            <rect width={14} height={14} rx={3} fill={s.color} />
            <text x={20} y={12} fontSize={11} fill="#333">{s.label.length > 18 ? s.label.slice(0, 18) + '…' : s.label} ({s.pct}%)</text>
          </g>
        ))}
      </svg>
    )
  }

  const minY = Math.min(...yVals, 0) > 0 ? 0 : Math.min(...yVals, 0)
  const maxY = Math.max(...yVals, 1)
  const range = maxY - minY || 1
  const toY = (v: number) => PAD.t + cH - ((v - minY) / range) * cH
  const slotW = cW / xVals.length
  const barW = Math.max(4, slotW * 0.65)
  const pX = (i: number) => PAD.l + i * slotW + slotW / 2
  const pts = yVals.map((v, i) => ({ x: pX(i), y: toY(v) }))
  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `M${(pts[0]?.x ?? 0).toFixed(1)},${PAD.t + cH} ${pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L${(pts[pts.length - 1]?.x ?? 0).toFixed(1)},${PAD.t + cH} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 340 }}>
      {config.title && <text x={W / 2} y={18} textAnchor="middle" fontWeight="bold" fontSize={14} fill="#212529">{config.title}</text>}
      {Array.from({ length: 6 }, (_, i) => { const v = minY + (range / 5) * i; const y = toY(v); return <g key={i}><line x1={PAD.l} y1={y} x2={PAD.l + cW} y2={y} stroke="#e9ecef" strokeDasharray="4,3" /><text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#666">{fmtAxisNum(v)}</text></g> })}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + cH} stroke="#bbb" />
      <line x1={PAD.l} y1={PAD.t + cH} x2={PAD.l + cW} y2={PAD.t + cH} stroke="#bbb" />
      {config.chartType === 'bar' && yVals.map((v, i) => {
        const bh = Math.max(2, ((v - minY) / range) * cH); const bx = pX(i) - barW / 2
        return <rect key={i} x={bx.toFixed(1)} y={(PAD.t + cH - bh).toFixed(1)} width={barW.toFixed(1)} height={bh.toFixed(1)} fill={colors[i % colors.length]} rx={2} opacity={0.85}><title>{xVals[i]}: {fmtAxisNum(v)}</title></rect>
      })}
      {config.chartType === 'area' && pts.length > 1 && <><path d={areaPath} fill={colors[0]} opacity={0.2} /><polyline points={polyline} fill="none" stroke={colors[0]} strokeWidth={2.5} />{pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={colors[0]}><title>{xVals[i]}: {fmtAxisNum(yVals[i])}</title></circle>)}</>}
      {config.chartType === 'line' && pts.length > 1 && <><polyline points={polyline} fill="none" stroke={colors[0]} strokeWidth={2.5} />{pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={colors[0]} stroke="#fff" strokeWidth={1.5}><title>{xVals[i]}: {fmtAxisNum(yVals[i])}</title></circle>)}</>}
      {xVals.map((lbl, i) => { const x = pX(i); return <text key={i} x={x} y={PAD.t + cH + 14} textAnchor="end" fontSize={10} fill="#666" transform={`rotate(-35,${x},${PAD.t + cH + 14})`}>{lbl.length > 11 ? lbl.slice(0, 11) + '…' : lbl}</text> })}
      <text x={16} y={PAD.t + cH / 2} textAnchor="middle" fontSize={11} fill="#888" transform={`rotate(-90,16,${PAD.t + cH / 2})`}>{config.yAxis}</text>
      <text x={PAD.l + cW / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#888">{config.xAxis}</text>
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AIAnalyticsProPage() {
  // existing state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [isEditingSql, setIsEditingSql] = useState(false)
  const [sqlEditorValue, setSqlEditorValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveForm, setSaveForm] = useState({ name: '', category: '', description: '', saveSQL: true })
  const [isSaving, setIsSaving] = useState(false)
  const [showSavedModal, setShowSavedModal] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [savedQueriesLoading, setSavedQueriesLoading] = useState(false)
  const [savedFilter, setSavedFilter] = useState<'all' | 'favorites'>('all')
  // new state
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeResultTab, setActiveResultTab] = useState<'data' | 'sql' | 'insights'>('data')
  const [insights, setInsights] = useState<string | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null)
  const [copySqlLabel, setCopySqlLabel] = useState('Copy SQL')
  const [queryHistoryId, setQueryHistoryId] = useState<number | null>(null)
  const [showVizModal, setShowVizModal] = useState(false)
  const [vizConfig, setVizConfig] = useState<VizConfig>({ chartType: 'bar', xAxis: '', yAxis: '', title: '', colorScheme: 'default' })
  const [vizAccordion, setVizAccordion] = useState('axes')
  // query history state
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const chatRef = useRef<HTMLDivElement>(null)
  const lastQueryRef = useRef('')
  const chartPreviewRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages, isChatLoading])
  useEffect(() => {
    setMessages([{ id: 'welcome', role: 'assistant', content: "Hello! I'm GTek AI Insights Pro. Ask me anything about your business data in plain English — I'll convert it to database queries and provide insights instantly.", timestamp: new Date() }])
    void loadSuggestions()
    void loadFeedbackStats()
  }, [])

  // derived data
  const data = queryResult?.data ?? []
  const columns = queryResult?.columns ?? []
  const numericCols = useMemo(() => columns.filter(c => isNumericCol(c, data)), [columns, data])
  const hasGeoData = useMemo(() => columns.some(c => isCountryCol(c)), [columns])

  const sortedData = useMemo(() => {
    if (!sortCol) return data
    return [...data].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      const an = typeof av === 'number' ? av : parseFloat(String(av))
      const bn = typeof bv === 'number' ? bv : parseFloat(String(bv))
      if (!isNaN(an) && !isNaN(bn)) return sortDir === 'asc' ? an - bn : bn - an
      return sortDir === 'asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''))
    })
  }, [data, sortCol, sortDir])

  const effectiveRpp = rowsPerPage === -1 ? (sortedData.length || 1) : rowsPerPage
  const totalPages = Math.ceil(sortedData.length / effectiveRpp)
  const pageData = rowsPerPage === -1 ? sortedData : sortedData.slice((currentPage - 1) * effectiveRpp, currentPage * effectiveRpp)

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setCurrentPage(1)
  }

  // API helpers
  const loadSuggestions = async () => {
    setSuggestionsLoading(true)
    try { const res = await apiClient.get<SmartSuggestion[]>('/AIAnalyticsPro/GetSmartSuggestions'); setSuggestions(res.data ?? []) }
    catch { /* optional */ } finally { setSuggestionsLoading(false) }
  }

  const loadFeedbackStats = async () => {
    try { const res = await apiClient.get<FeedbackStats>('/AIAnalyticsPro/GetFeedbackStats'); setFeedbackStats(res.data) }
    catch { /* optional */ }
  }

  const loadInsights = useCallback(async (result: QueryResult) => {
    setInsightsLoading(true)
    try {
      const res = await apiClient.post<{ insights?: string } | string>('/AIAnalyticsPro/GenerateInsights', { query: lastQueryRef.current, data: result.data, sql: result.sql })
      const raw = typeof res.data === 'string' ? res.data : ((res.data as { insights?: string }).insights ?? '')
      setInsights(raw)
    } catch { setInsights('Could not load insights at this time.') } finally { setInsightsLoading(false) }
  }, [])

  // ── Capture chart SVG as base64 data URI ──
  const captureChartAsBase64 = useCallback((): string | null => {
    if (!chartPreviewRef.current) return null
    const svgEl = chartPreviewRef.current.querySelector('svg')
    if (!svgEl) return null
    try {
      const serializer = new XMLSerializer()
      const svgStr = serializer.serializeToString(svgEl)
      const encoded = btoa(unescape(encodeURIComponent(svgStr)))
      return `data:image/svg+xml;base64,${encoded}`
    } catch { return null }
  }, [])

  // ── Export CSV (matching Razor convertToCSV logic) ──
  const exportToCsv = useCallback(() => {
    if (!queryResult?.columns || !queryResult?.data) return
    const csv = convertToCSV(queryResult.columns, queryResult.data)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'query-results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [queryResult])

  const exportToPdf = useCallback(async () => {
    if (!queryResult) return
    setIsExportingPdf(true)
    try {
      const chartImageBase64 = captureChartAsBase64()
      const res = await apiClient.post<Blob>('/AIAnalyticsPro/ExportToPDF', {
        query: lastQueryRef.current,
        sql: queryResult.sql,
        data: queryResult.data,
        columns: queryResult.columns,
        insights: insights ?? '',
        chartImageBase64,
      }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = `analytics-${Date.now()}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ } finally { setIsExportingPdf(false) }
  }, [queryResult, insights, captureChartAsBase64])

  const submitFeedback = useCallback(async (feedbackType: string) => {
    if (feedbackSubmitted) return
    try {
      await apiClient.post('/AIAnalyticsPro/ProvideFeedback', { queryHistoryId, feedbackType })
      setFeedbackSubmitted(true); void loadFeedbackStats()
    } catch { /* ignore */ }
  }, [queryHistoryId, feedbackSubmitted])

  const copySql = useCallback(() => {
    if (!queryResult?.sql) return
    navigator.clipboard.writeText(queryResult.sql).then(() => { setCopySqlLabel('Copied!'); setTimeout(() => setCopySqlLabel('Copy SQL'), 2000) }).catch(() => { /* ignore */ })
  }, [queryResult])

  const initVizDefaults = (result: QueryResult) => {
    const cols = result.columns ?? []
    const numCols = cols.filter(c => isNumericCol(c, result.data ?? []))
    const geoCols = cols.filter(c => isCountryCol(c))
    const strCols = cols.filter(c => !isNumericCol(c, result.data ?? []))
    setVizConfig(v => ({ ...v, xAxis: (geoCols[0] ?? strCols[0] ?? cols[0]) ?? '', yAxis: numCols[0] ?? cols[1] ?? '' }))
  }

  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? inputValue).trim()
    if (!query || isChatLoading) return
    setInputValue(''); lastQueryRef.current = query
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', content: query, timestamp: new Date() }])
    setIsChatLoading(true); setQueryResult(null); setInsights(null); setFeedbackSubmitted(false); setCurrentPage(1); setSortCol(null)
    try {
      const res = await apiClient.post<QueryResult>('/AIAnalyticsPro/ProcessQuery', { query })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', content: result.explanation ?? 'Here are the results:', timestamp: new Date() }])
        if (!result.isInteractive) {
          setQueryResult(result); setQueryHistoryId(result.queryHistoryId ?? null); setActiveResultTab('data')
          void loadInsights(result); initVizDefaults(result)
          // push to local query history
          setQueryHistory(prev => [
            { id: `h${Date.now()}`, query, timestamp: new Date(), rowCount: result.rowCount ?? result.data?.length ?? 0 },
            ...prev.slice(0, 49),
          ])
        }
      } else {
        const errMsg = result.error ?? 'An error occurred.'
        setMessages(prev => [...prev, { id: `ae${Date.now()}`, role: 'assistant', timestamp: new Date(), content: errMsg.includes('overloaded') ? 'The AI service is experiencing high demand. Please try again in a moment.' : `Error: ${errMsg}` }])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setMessages(prev => [...prev, { id: `an${Date.now()}`, role: 'assistant', content: `Network error: ${msg}`, timestamp: new Date() }])
    } finally { setIsChatLoading(false) }
  }, [inputValue, isChatLoading, loadInsights])

  const executeCustomSql = useCallback(async () => {
    if (!sqlEditorValue.trim()) return
    setIsChatLoading(true)
    try {
      const res = await apiClient.post<QueryResult>('/AIAnalyticsPro/ExecuteCustomQuery', { sql: sqlEditorValue })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, { id: `sq${Date.now()}`, role: 'assistant', content: `Custom query executed. Found ${result.rowCount ?? result.data?.length ?? 0} results.`, timestamp: new Date() }])
        setQueryResult(result); setIsEditingSql(false); setCurrentPage(1); setSortCol(null)
        setQueryHistoryId(result.queryHistoryId ?? null); setInsights(null); setFeedbackSubmitted(false)
        void loadInsights(result)
      } else {
        setMessages(prev => [...prev, { id: `sqe${Date.now()}`, role: 'assistant', content: `SQL Error: ${result.error}`, timestamp: new Date() }])
      }
    } catch { /* handled */ } finally { setIsChatLoading(false) }
  }, [sqlEditorValue, loadInsights])

  const runSavedQuery = useCallback(async (q: SavedQuery) => {
    setShowSavedModal(false); lastQueryRef.current = q.naturalLanguageQuery
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', content: q.naturalLanguageQuery, timestamp: new Date() }])
    setIsChatLoading(true); setQueryResult(null); setInsights(null); setFeedbackSubmitted(false); setCurrentPage(1); setSortCol(null)
    try {
      const res = await apiClient.post<QueryResult>('/AIAnalyticsPro/ExecuteSavedQuery', { queryHistoryId: q.id })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', content: result.explanation ?? 'Saved query executed successfully.', timestamp: new Date() }])
        setQueryResult(result); setQueryHistoryId(result.queryHistoryId ?? null); setActiveResultTab('data')
        void loadInsights(result); initVizDefaults(result); setShowVizModal(true)
      } else {
        setMessages(prev => [...prev, { id: `ae${Date.now()}`, role: 'assistant', content: `Error: ${result.error}`, timestamp: new Date() }])
      }
    } catch { /* ignore */ } finally { setIsChatLoading(false) }
  }, [loadInsights])

  const saveCurrentQuery = useCallback(async () => {
    if (!saveForm.name.trim()) return
    setIsSaving(true)
    try {
      await apiClient.post('/AIAnalyticsPro/SaveQuery', { name: saveForm.name, category: saveForm.category, description: saveForm.description, naturalLanguageQuery: lastQueryRef.current, sqlQuery: saveForm.saveSQL ? queryResult?.sql : undefined })
      setShowSaveModal(false); setSaveForm({ name: '', category: '', description: '', saveSQL: true })
    } catch { /* ignore */ } finally { setIsSaving(false) }
  }, [saveForm, queryResult])

  const loadSavedQueries = useCallback(async (filter: 'all' | 'favorites') => {
    setSavedFilter(filter); setSavedQueriesLoading(true)
    try { const res = await apiClient.get<SavedQuery[]>(`/AIAnalyticsPro/GetSavedQueries?filter=${filter}`); setSavedQueries(res.data ?? []) }
    catch { setSavedQueries([]) } finally { setSavedQueriesLoading(false) }
  }, [])

  const toggleFavorite = useCallback(async (id: number) => {
    try { await apiClient.post('/AIAnalyticsPro/ToggleFavorite', { queryHistoryId: id }); void loadSavedQueries(savedFilter) }
    catch { /* ignore */ }
  }, [savedFilter, loadSavedQueries])

  const deleteQuery = useCallback(async (id: number) => {
    if (!window.confirm('Delete this saved query?')) return
    try { await apiClient.get(`/AIAnalyticsPro/DeleteQuery?queryHistoryId=${id}`); void loadSavedQueries(savedFilter) }
    catch { /* ignore */ }
  }, [savedFilter, loadSavedQueries])

  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }, [sendMessage])

  const darkCard: CSSProperties = { background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 16, padding: 28, marginBottom: 24 }
  const lightCard: CSSProperties = { background: 'rgba(255,255,255,.97)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 16, padding: 28, marginBottom: 24 }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 2rem 2rem' }}>

      {/* Header */}
      <div style={darkCard}>
        <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
          <div>
            <h1 className="h3 text-white mb-1"><i className="fas fa-sparkles me-2 text-warning" />GTek AI Insights Pro</h1>
            <p className="text-muted mb-0" style={{ fontSize: 14 }}>Ask questions in natural language and get instant insights with AI</p>
          </div>
        </div>
        <div>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <p className="text-muted mb-0" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Smart Suggestions</p>
            <button className="btn btn-outline-primary btn-sm" onClick={() => void loadSuggestions()} disabled={suggestionsLoading}>
              {suggestionsLoading ? <><i className="fas fa-spinner fa-spin me-1" />Loading…</> : <><i className="fas fa-sync me-1" />Refresh</>}
            </button>
          </div>
          {suggestions.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => void sendMessage(s.text)} className="text-start"
                  style={{ background: 'rgba(46,134,193,.1)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 8, padding: '14px 16px', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 12 }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(46,134,193,.2)'; el.style.borderColor = '#2e86c1' }}
                  onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'rgba(46,134,193,.1)'; el.style.borderColor = 'rgba(46,134,193,.2)' }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{s.icon}</span>
                  <span style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.4 }}>{s.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, margin: 0 }}>
              {suggestionsLoading ? 'Loading suggestions…' : 'No suggestions available — start typing your question below.'}
            </p>
          )}
        </div>
      </div>

      {/* Chat */}
      <div style={lightCard}>
        <div className="d-flex justify-content-between align-items-center pb-3 mb-3" style={{ borderBottom: '1px solid #e9ecef' }}>
          <h4 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}><i className="fas fa-robot text-primary me-2" />GTek AI Insights Assistant</h4>
          <div className="d-flex gap-2">
            {/* History button with badge */}
            <button className="btn btn-outline-secondary btn-sm position-relative" onClick={() => setShowHistoryModal(true)}>
              <i className="fas fa-history me-1" />History
              {queryHistory.length > 0 && (
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-primary"
                  style={{ fontSize: 10 }}>
                  {queryHistory.length > 99 ? '99+' : queryHistory.length}
                </span>
              )}
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowSavedModal(true); void loadSavedQueries('all') }}>
              <i className="fas fa-bookmark me-1" />Saved Queries
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setMessages(msgs => [msgs[0]]); setQueryResult(null) }}>
              <i className="fas fa-broom me-1" />Clear
            </button>
          </div>
        </div>
        <div ref={chatRef} style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
          {messages.map(msg => (
            <div key={msg.id} className={`d-flex align-items-start gap-2 mb-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'user' ? '#2e86c1' : '#e67e22', color: '#fff', fontSize: 14 }}>
                <i className={`fas fa-${msg.role === 'user' ? 'user' : 'robot'}`} />
              </div>
              <div style={{ background: msg.role === 'user' ? '#2e86c1' : '#f8f9fa', color: msg.role === 'user' ? '#fff' : '#212529', borderRadius: 12, padding: '10px 14px', maxWidth: '85%', border: `1px solid ${msg.role === 'user' ? '#2e86c1' : '#e9ecef'}`, fontSize: 14, lineHeight: 1.5 }}>
                {msg.content}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="d-flex align-items-center gap-2 p-3" style={{ background: '#f8f9fa', borderRadius: 12 }}>
              <div className="spinner-border spinner-border-sm text-primary" />
              <span style={{ color: '#212529', fontSize: 14 }}>GTek AI Insights is analyzing…</span>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e9ecef', paddingTop: 14 }}>
          <div className="input-group">
            <textarea className="form-control" rows={2} value={inputValue}
              onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Ask about your transaction data… e.g. 'Show me the top 10 failing integrations this week'"
              disabled={isChatLoading}
              style={{ borderRadius: '12px 0 0 12px', border: '2px solid #e9ecef', borderRight: 'none', resize: 'none', color: '#212529', fontSize: 15, minHeight: 50 }}
            />
            <button className="btn btn-primary" onClick={() => void sendMessage()} disabled={isChatLoading || !inputValue.trim()}
              style={{ borderRadius: '0 12px 12px 0', minWidth: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: 'none' }}>
              <i className="fas fa-sparkles" />
            </button>
          </div>
          <small className="text-muted mt-1 d-block"><i className="fas fa-info-circle me-1" />Ask in plain English — Press Enter to send, Shift+Enter for new line.</small>
        </div>
      </div>

      {/* Results */}
      {queryResult?.success && (
        <div style={lightCard}>
          {/* Toolbar */}
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h5 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}>
              <i className="fas fa-chart-line text-primary me-2" />Analysis Results
              {data.length > 0 && <span className="badge bg-primary ms-2" style={{ fontSize: 12 }}>{data.length} rows</span>}
            </h5>
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-outline-primary btn-sm" onClick={() => setShowVizModal(true)} disabled={!data.length}>
                <i className="fas fa-chart-bar me-1" />Visualize Data
              </button>
              <button className="btn btn-outline-success btn-sm" onClick={exportToCsv} disabled={!data.length}>
                <i className="fas fa-file-csv me-1" />Export CSV
              </button>
              <button className="btn btn-outline-danger btn-sm" onClick={() => void exportToPdf()} disabled={isExportingPdf}>
                {isExportingPdf ? <><i className="fas fa-spinner fa-spin me-1" />Exporting…</> : <><i className="fas fa-file-pdf me-1" />Export PDF</>}
              </button>
              <button className="btn btn-success btn-sm" onClick={() => setShowSaveModal(true)}>
                <i className="fas fa-save me-1" />Save Query
              </button>
            </div>
          </div>

          {/* Tabs */}
          <ul className="nav mb-3" style={{ borderBottom: '2px solid #e9ecef', listStyle: 'none', padding: 0, display: 'flex', gap: 0 }}>
            {(['data', 'sql', 'insights'] as const).map(tab => (
              <li key={tab}>
                <button onClick={() => setActiveResultTab(tab)}
                  style={{ color: activeResultTab === tab ? '#2e86c1' : '#6c757d', fontWeight: activeResultTab === tab ? 600 : 400, background: 'none', border: 'none', borderBottom: activeResultTab === tab ? '2px solid #2e86c1' : '2px solid transparent', marginBottom: -2, padding: '8px 18px', cursor: 'pointer', fontSize: 14 }}>
                  {tab === 'data' && <><i className="fas fa-table me-1" />Data</>}
                  {tab === 'sql' && <><i className="fas fa-code me-1" />SQL</>}
                  {tab === 'insights' && <><i className="fas fa-lightbulb me-1" />Insights{insightsLoading && <i className="fas fa-spinner fa-spin ms-1" style={{ fontSize: 10 }} />}</>}
                </button>
              </li>
            ))}
          </ul>

          {/* Tab: Data */}
          {activeResultTab === 'data' && (
            data.length > 0 && columns.length > 0 ? (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                  <small className="text-muted">
                    {rowsPerPage === -1
                      ? `Showing all ${data.length} entries`
                      : `Showing ${Math.min((currentPage - 1) * rowsPerPage + 1, data.length)}–${Math.min(currentPage * rowsPerPage, data.length)} of ${data.length} entries`}
                  </small>
                  <div className="d-flex align-items-center gap-2">
                    <label className="text-muted mb-0" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Rows per page:</label>
                    <select className="form-select form-select-sm" style={{ width: 'auto', color: '#212529' }}
                      value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1) }}>
                      {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                      <option value={-1}>All</option>
                    </select>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-striped table-hover mb-0" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        {columns.map(col => (
                          <th key={col} onClick={() => handleSort(col)}
                            style={{ background: '#2e86c1', color: '#fff', fontWeight: 600, border: 'none', textAlign: isNumericCol(col, data) ? 'right' : 'left', padding: '8px 12px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            {col}{' '}
                            <i className={`fas fa-sort${sortCol === col ? (sortDir === 'asc' ? '-up' : '-down') : ''}`} style={{ opacity: sortCol === col ? 1 : 0.4, fontSize: 10 }} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageData.map((row, ri) => (
                        <tr key={ri}>{columns.map(col => <td key={col} style={{ color: '#212529', textAlign: isNumericCol(col, data) ? 'right' : 'left', verticalAlign: 'middle', padding: '8px 12px' }}>{fmtCell(row[col], col)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && rowsPerPage !== -1 && (
                  <nav className="mt-3">
                    <ul className="pagination pagination-sm justify-content-center mb-0">
                      <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => setCurrentPage(1)}><i className="fas fa-angle-double-left" /></button></li>
                      <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => setCurrentPage(p => Math.max(1, p - 1))}><i className="fas fa-angle-left" /></button></li>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => { const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4)); return start + i }).filter(pg => pg >= 1 && pg <= totalPages).map(pg => (
                        <li key={pg} className={`page-item ${pg === currentPage ? 'active' : ''}`}><button className="page-link" onClick={() => setCurrentPage(pg)}>{pg}</button></li>
                      ))}
                      <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}><button className="page-link" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}><i className="fas fa-angle-right" /></button></li>
                      <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}><button className="page-link" onClick={() => setCurrentPage(totalPages)}><i className="fas fa-angle-double-right" /></button></li>
                    </ul>
                  </nav>
                )}
              </>
            ) : <div className="alert alert-info" style={{ color: '#212529' }}>No data found for your query.</div>
          )}

          {/* Tab: SQL */}
          {activeResultTab === 'sql' && (
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center" style={{ background: '#f8f9fa' }}>
                <h6 className="mb-0" style={{ color: '#212529', fontWeight: 600 }}><i className="fas fa-database me-2" />Generated SQL Query</h6>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={copySql}>
                    <i className="fas fa-copy me-1" />{copySqlLabel}
                  </button>
                  {!isEditingSql
                    ? <button className="btn btn-sm btn-outline-primary" onClick={() => { setIsEditingSql(true); setSqlEditorValue(queryResult?.sql ?? '') }}><i className="fas fa-edit me-1" />Edit SQL</button>
                    : <>
                        <button className="btn btn-sm btn-success" onClick={() => void executeCustomSql()}><i className="fas fa-play me-1" />Execute</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsEditingSql(false)}><i className="fas fa-times me-1" />Cancel</button>
                      </>}
                </div>
              </div>
              <div className="card-body p-0">
                {isEditingSql
                  ? <textarea value={sqlEditorValue} onChange={e => setSqlEditorValue(e.target.value)} rows={6} className="form-control rounded-0 border-0" style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, color: '#212529', background: '#f8f9fa', resize: 'vertical' }} />
                  : <pre style={{ background: '#f8f9fa', margin: 0, padding: '14px 16px', fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, color: '#212529', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{queryResult?.sql}</pre>}
              </div>
            </div>
          )}

          {/* Tab: Insights */}
          {activeResultTab === 'insights' && (
            <div style={{ minHeight: 120 }}>
              {insightsLoading
                ? <div className="text-center py-5"><div className="spinner-border text-primary" /><span className="text-muted ms-3">Generating insights…</span></div>
                : insights
                  ? <div style={{ lineHeight: 1.7 }}>{renderMarkdown(insights)}</div>
                  : <div className="alert alert-info">No insights available for this query.</div>}
            </div>
          )}

          {/* Feedback */}
          <div className="border-top mt-4 pt-3">
            <div className="d-flex align-items-center flex-wrap gap-3">
              <span className="text-muted" style={{ fontSize: 13, fontWeight: 500 }}><i className="fas fa-comment-alt me-1" />Was this analysis helpful?</span>
              {feedbackSubmitted
                ? <span className="text-success" style={{ fontSize: 13 }}><i className="fas fa-check-circle me-1" />Thank you for your feedback!</span>
                : <div className="d-flex gap-2">
                    <button className="btn btn-outline-success btn-sm" onClick={() => void submitFeedback('Helpful')}><i className="fas fa-thumbs-up me-1" />Helpful</button>
                    <button className="btn btn-outline-warning btn-sm" onClick={() => void submitFeedback('NeedsImprovement')}><i className="fas fa-minus-circle me-1" />Needs Improvement</button>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => void submitFeedback('Incorrect')}><i className="fas fa-times-circle me-1" />Incorrect</button>
                  </div>}
              {feedbackStats && (
                <div className="ms-auto d-flex gap-3" style={{ fontSize: 12, color: '#6c757d' }}>
                  <span title="Helpful"><i className="fas fa-thumbs-up text-success me-1" />{feedbackStats.helpful}</span>
                  <span title="Needs Improvement"><i className="fas fa-minus-circle text-warning me-1" />{feedbackStats.needsImprovement}</span>
                  <span title="Incorrect"><i className="fas fa-times-circle text-danger me-1" />{feedbackStats.incorrect}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visualize Modal */}
      {showVizModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)', zIndex: 1055 }} onClick={e => { if (e.target === e.currentTarget) setShowVizModal(false) }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}><i className="fas fa-chart-bar me-2" />Visualize Data</h5>
                <button type="button" className="btn-close" onClick={() => setShowVizModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-4">
                  {/* Config panel */}
                  <div className="col-md-4">
                    <div className="mb-3">
                      <label className="form-label fw-bold" style={{ color: '#212529' }}>Chart Type</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {(['bar', 'line', 'area', 'pie'] as const).map(ct => (
                          <button key={ct} onClick={() => setVizConfig(v => ({ ...v, chartType: ct }))}
                            className={`btn btn-sm ${vizConfig.chartType === ct ? 'btn-primary' : 'btn-outline-secondary'}`}>
                            <i className={`fas fa-chart-${ct === 'pie' ? 'pie' : ct} me-1`} />
                            {ct.charAt(0).toUpperCase() + ct.slice(1)}
                          </button>
                        ))}
                        {/* Map chart type — only shown when geo columns are present */}
                        {hasGeoData && (
                          <button onClick={() => setVizConfig(v => ({ ...v, chartType: 'map' }))}
                            className={`btn btn-sm ${vizConfig.chartType === 'map' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            style={{ gridColumn: '1 / -1' }}>
                            <i className="fas fa-globe-americas me-1" />Map (Geographic)
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Accordion panels */}
                    {([
                      { key: 'axes', label: 'Axes', icon: 'fa-sliders-h', content: (
                        <>
                          <div className="mb-2">
                            <label className="form-label" style={{ fontSize: 13, color: '#212529', fontWeight: 500, marginBottom: 4 }}>
                              {vizConfig.chartType === 'map' ? 'Country / Region Column' : 'X Axis (Category)'}
                            </label>
                            <select className="form-select form-select-sm" value={vizConfig.xAxis} style={{ color: '#212529' }} onChange={e => setVizConfig(v => ({ ...v, xAxis: e.target.value }))}>
                              <option value="">-- Select column --</option>
                              {columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: 13, color: '#212529', fontWeight: 500, marginBottom: 4 }}>
                              {vizConfig.chartType === 'map' ? 'Value Column' : 'Y Axis (Value)'}
                            </label>
                            <select className="form-select form-select-sm" value={vizConfig.yAxis} style={{ color: '#212529' }} onChange={e => setVizConfig(v => ({ ...v, yAxis: e.target.value }))}>
                              <option value="">-- Select column --</option>
                              {(numericCols.length > 0 ? numericCols : columns).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </>
                      )},
                      { key: 'title', label: 'Chart Title', icon: 'fa-heading', content: (
                        <input type="text" className="form-control form-control-sm" placeholder="Enter chart title…" value={vizConfig.title} style={{ color: '#212529' }} onChange={e => setVizConfig(v => ({ ...v, title: e.target.value }))} />
                      )},
                      { key: 'colors', label: 'Color Scheme', icon: 'fa-palette', content: (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {Object.entries(COLOR_SCHEMES).map(([key, palette]) => (
                            <button key={key} onClick={() => setVizConfig(v => ({ ...v, colorScheme: key }))}
                              className={`btn btn-sm ${vizConfig.colorScheme === key ? 'btn-primary' : 'btn-outline-secondary'}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}>
                              {palette.slice(0, 4).map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />)}
                              <span style={{ marginLeft: 2 }}>{key}</span>
                            </button>
                          ))}
                        </div>
                      )},
                    ] as { key: string; label: string; icon: string; content: React.JSX.Element }[]).map(({ key, label, icon, content }) => (
                      <div key={key} style={{ border: '1px solid #dee2e6', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
                        <button onClick={() => setVizAccordion(v => v === key ? '' : key)}
                          className="w-100 text-start d-flex align-items-center gap-2"
                          style={{ padding: '8px 12px', background: vizAccordion === key ? '#f0f7ff' : '#f8f9fa', border: 'none', fontSize: 13, fontWeight: 600, color: '#212529', cursor: 'pointer' }}>
                          <i className={`fas ${icon}`} />{label}
                          <i className={`fas fa-chevron-${vizAccordion === key ? 'up' : 'down'} ms-auto`} style={{ fontSize: 11, opacity: 0.6 }} />
                        </button>
                        {vizAccordion === key && <div style={{ padding: '10px 12px', background: '#fff' }}>{content}</div>}
                      </div>
                    ))}
                  </div>
                  {/* Chart preview */}
                  <div className="col-md-8">
                    <div ref={chartPreviewRef} style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <SvgChart config={vizConfig} data={data} />
                    </div>
                    {vizConfig.chartType === 'map' && (
                      <small className="text-muted d-block mt-1">
                        <i className="fas fa-info-circle me-1" />Geographic distribution sorted by value. Showing top {Math.min(data.length, 50)} entries.
                      </small>
                    )}
                    {vizConfig.chartType !== 'map' && data.length > 50 && (
                      <small className="text-muted d-block mt-1"><i className="fas fa-info-circle me-1" />Showing first 50 rows in chart preview.</small>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Query History Modal */}
      {showHistoryModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)', zIndex: 1055 }} onClick={e => { if (e.target === e.currentTarget) setShowHistoryModal(false) }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}>
                  <i className="fas fa-history me-2" />Query History
                  {queryHistory.length > 0 && <span className="badge bg-primary ms-2" style={{ fontSize: 12 }}>{queryHistory.length}</span>}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowHistoryModal(false)} />
              </div>
              <div className="modal-body">
                {queryHistory.length === 0 ? (
                  <p className="text-muted text-center py-4">
                    <i className="fas fa-clock fa-2x d-block mb-2 opacity-50" />
                    No queries in this session yet. Ask a question to get started.
                  </p>
                ) : (
                  <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {queryHistory.map((entry, idx) => (
                      <div key={entry.id} className="card mb-2">
                        <div className="card-body py-2 px-3">
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="d-flex align-items-center gap-2 mb-1">
                                <span className="badge bg-secondary" style={{ fontSize: 10, flexShrink: 0 }}>#{queryHistory.length - idx}</span>
                                <span className="badge bg-light text-dark border" style={{ fontSize: 10, flexShrink: 0 }}>
                                  {entry.rowCount} rows
                                </span>
                                <small className="text-muted" style={{ fontSize: 11, flexShrink: 0 }}>
                                  {entry.timestamp.toLocaleTimeString()}
                                </small>
                              </div>
                              <p className="mb-0" style={{ color: '#212529', fontSize: 14, wordBreak: 'break-word' }}>{entry.query}</p>
                            </div>
                            <div className="d-flex gap-1 flex-shrink-0">
                              <button
                                className="btn btn-sm btn-outline-primary"
                                title="Re-run this query"
                                onClick={() => { setShowHistoryModal(false); void sendMessage(entry.query) }}>
                                <i className="fas fa-play me-1" />Run
                              </button>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                title="Copy query text"
                                onClick={() => void navigator.clipboard.writeText(entry.query)}>
                                <i className="fas fa-copy" />
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                title="Remove from history"
                                onClick={() => setQueryHistory(prev => prev.filter(h => h.id !== entry.id))}>
                                <i className="fas fa-trash" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {queryHistory.length > 0 && (
                  <button type="button" className="btn btn-outline-danger btn-sm me-auto"
                    onClick={() => { if (window.confirm('Clear all query history?')) { setQueryHistory([]); setShowHistoryModal(false) } }}>
                    <i className="fas fa-trash me-1" />Clear All
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowSaveModal(false) }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}><i className="fas fa-save me-2" />Save Query</h5>
                <button type="button" className="btn-close" onClick={() => setShowSaveModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Query Name *</label>
                  <input type="text" className="form-control" value={saveForm.name} onChange={e => setSaveForm(f => ({ ...f, name: e.target.value }))} maxLength={200} style={{ color: '#212529' }} />
                </div>
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Category</label>
                  <select className="form-select" value={saveForm.category} onChange={e => setSaveForm(f => ({ ...f, category: e.target.value }))} style={{ color: '#212529' }}>
                    <option value="">Select category</option>
                    {QUERY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Description</label>
                  <textarea className="form-control" rows={3} value={saveForm.description} onChange={e => setSaveForm(f => ({ ...f, description: e.target.value }))} maxLength={500} style={{ color: '#212529' }} placeholder="Optional description" />
                </div>
                <div className="form-check">
                  <input type="checkbox" className="form-check-input" id="saveSqlCheckPro" checked={saveForm.saveSQL} onChange={e => setSaveForm(f => ({ ...f, saveSQL: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="saveSqlCheckPro" style={{ color: '#212529', fontWeight: 500 }}>Save exact SQL (recommended)</label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSaveModal(false)}>Cancel</button>
                <button type="button" className="btn btn-success" onClick={() => void saveCurrentQuery()} disabled={isSaving || !saveForm.name.trim()}>
                  {isSaving ? <><i className="fas fa-spinner fa-spin me-1" />Saving…</> : <><i className="fas fa-save me-1" />Save Query</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved Queries Modal */}
      {showSavedModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowSavedModal(false) }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}><i className="fas fa-bookmark me-2" />Saved Queries</h5>
                <button type="button" className="btn-close" onClick={() => setShowSavedModal(false)} />
              </div>
              <div className="modal-body">
                <div className="btn-group mb-3">
                  <button type="button" className={`btn btn-outline-primary ${savedFilter === 'all' ? 'active' : ''}`} onClick={() => void loadSavedQueries('all')}>All Queries</button>
                  <button type="button" className={`btn btn-outline-primary ${savedFilter === 'favorites' ? 'active' : ''}`} onClick={() => void loadSavedQueries('favorites')}>Favorites</button>
                </div>
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {savedQueriesLoading
                    ? <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
                    : savedQueries.length === 0
                      ? <p className="text-muted text-center py-4">No saved queries found.</p>
                      : savedQueries.map(q => (
                          <div key={q.id} className="card mb-2">
                            <div className="card-body py-2 px-3">
                              <div className="d-flex justify-content-between align-items-start gap-2">
                                <div style={{ flex: 1 }}>
                                  <h6 className="mb-1" style={{ color: '#212529', fontWeight: 600 }}>
                                    {q.isFavorite && <i className="fas fa-star text-warning me-1" style={{ fontSize: 12 }} />}{q.name}
                                  </h6>
                                  {q.category && <span className="badge bg-primary me-2" style={{ fontSize: 11 }}>{q.category}</span>}
                                  {q.description && <p className="text-muted mb-1" style={{ fontSize: 13 }}>{q.description}</p>}
                                  <p className="text-muted mb-0" style={{ fontSize: 12 }}>{q.naturalLanguageQuery}</p>
                                </div>
                                <div className="d-flex gap-1 flex-shrink-0">
                                  <button className="btn btn-sm btn-outline-primary" onClick={() => void runSavedQuery(q)}>
                                    <i className="fas fa-play me-1" />Run
                                  </button>
                                  <button className="btn btn-sm btn-outline-warning" title={q.isFavorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => void toggleFavorite(q.id)}>
                                    <i className={q.isFavorite ? 'fas fa-star' : 'far fa-star'} />
                                  </button>
                                  <button className="btn btn-sm btn-outline-danger" title="Delete query" onClick={() => void deleteQuery(q.id)}>
                                    <i className="fas fa-trash" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
