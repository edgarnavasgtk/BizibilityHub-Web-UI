import { useState, useRef, useCallback, useEffect } from 'react'
import { Chart } from 'chart.js/auto'
import * as XLSX from 'xlsx'
import apiClient from '../../services/apiClient'

/* ── Types ──────────────────────────────────────────────── */
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  chips?: { label: string; query: string }[]
}

interface QueryResult {
  success: boolean
  data?: Record<string, unknown>[]
  columns?: string[]
  sql?: string
  explanation?: string
  error?: string
  isInteractive?: boolean
  rowCount?: number
  suggestedActions?: string[]
  followUpQuestions?: string[]
}

interface SmartQuestion {
  category: string
  text: string
}

interface SavedQuery {
  id: number
  name: string
  category?: string
  description?: string
  naturalLanguageQuery: string
  sqlQuery?: string
  isFavorite: boolean
}

interface ChartRecommendation {
  chartType?: string
  xAxis?: string
  yAxis?: string
}

/* ── Constants ──────────────────────────────────────────── */
const COMPLEXITY_LABELS = ['Basic', 'Intermediate', 'Advanced', 'Expert']
const COMPLEXITY_DESCRIPTIONS = [
  'Simple lookups and counts',
  'Moderate analysis with trends and patterns',
  'Complex multi-dimensional analysis',
  'Expert-level statistical and predictive analysis',
]
const QUERY_CATEGORIES = ['Performance', 'Errors', 'Volume', 'Geography', 'Trends', 'Business']
const CHART_TYPES = ['bar', 'line', 'pie'] as const
type ChartTypeOption = typeof CHART_TYPES[number]
const ROWS_OPTIONS = [10, 25, 50, 100, 'All'] as const
type RowsOption = typeof ROWS_OPTIONS[number]

const CHART_PALETTE = [
  '#2e86c1', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#d35400', '#27ae60',
]

/* ── Helpers ────────────────────────────────────────────── */
function isNumericCol(col: string, data: Record<string, unknown>[]): boolean {
  const colLower = col.toLowerCase()
  if (colLower.includes('id') || colLower.includes('name') || colLower.includes('code')) return false
  return data.some(row => {
    const v = row[col]
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(parseFloat(v)))
  })
}

function formatCellValue(value: unknown, col: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    const colLower = col.toLowerCase()
    if ((colLower.includes('rate') || colLower.includes('percent')) && value <= 1) {
      return `${(value * 100).toFixed(2)}%`
    }
    if (colLower.includes('rate') || colLower.includes('percent') || (colLower.includes('success') && value <= 100)) {
      return `${value.toFixed(2)}%`
    }
    return value.toLocaleString()
  }
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toLocaleString()
    } catch { /* keep original */ }
  }
  return String(value)
}

function toNumeric(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v); if (!isNaN(n)) return n }
  return 0
}

function buildActionChips(
  actions?: string[],
  questions?: string[],
): { label: string; query: string }[] {
  const chips: { label: string; query: string }[] = []
  if (actions?.length) actions.forEach(a => chips.push({ label: a, query: a }))
  if (questions?.length) questions.forEach(q => chips.push({ label: q, query: q }))
  return chips
}

/* ══════════════════════════════════════════════════════════ */
export default function AIAnalyticsPage() {
  /* Chat state */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)

  /* Results state */
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [showSql, setShowSql] = useState(false)
  const [isEditingSql, setIsEditingSql] = useState(false)
  const [sqlEditorValue, setSqlEditorValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState<RowsOption>(10)

  /* Sort state */
  const [sortCriteria, setSortCriteria] = useState<Array<{ column: string; direction: 'asc' | 'desc' }>>([])

  /* Export */
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  /* Insights */
  const [insightsText, setInsightsText] = useState('')
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [showInsights, setShowInsights] = useState(true)

  /* Chart */
  const [showChart, setShowChart] = useState(false)
  const [chartType, setChartType] = useState<ChartTypeOption>('bar')
  const [xAxis, setXAxis] = useState('')
  const [yAxis, setYAxis] = useState('')
  const chartCanvasRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<Chart | null>(null)

  /* Smart questions */
  const [smartQuestions, setSmartQuestions] = useState<SmartQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionsVisible, setQuestionsVisible] = useState(true)
  const [complexity, setComplexity] = useState(2)

  /* Save query modal */
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveForm, setSaveForm] = useState({ name: '', category: '', description: '', saveSQL: true })
  const [isSaving, setIsSaving] = useState(false)

  /* Saved queries modal */
  const [showSavedModal, setShowSavedModal] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [savedQueriesLoading, setSavedQueriesLoading] = useState(false)
  const [savedFilter, setSavedFilter] = useState<'all' | 'favorites'>('all')
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const lastQueryRef = useRef('')

  /* ── Scroll to bottom on new messages ─────────────────── */
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, isChatLoading])

  /* ── Welcome message ──────────────────────────────────── */
  useEffect(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm your AI Analytics Assistant. Ask me anything about your business data in plain English — I'll convert it to database queries and provide insights instantly.",
      timestamp: new Date(),
    }])
  }, [])

  /* ── Close export dropdown on outside click ───────────── */
  useEffect(() => {
    if (!showExportMenu) return
    const handler = () => setShowExportMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showExportMenu])

  /* ── Close saved-query row dropdown on outside click ──── */
  useEffect(() => {
    if (openDropdownId === null) return
    const handler = () => setOpenDropdownId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openDropdownId])

  /* ── Chart: rebuild when relevant state changes ───────── */
  useEffect(() => {
    if (!showChart || !chartCanvasRef.current || !queryResult?.data?.length || !xAxis || !yAxis) {
      return
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
      chartInstanceRef.current = null
    }

    const rows = queryResult.data
    const labels = rows.map(row => String(row[xAxis] ?? ''))
    const values = rows.map(row => toNumeric(row[yAxis]))

    const chartData: Chart['data'] = chartType === 'pie'
      ? {
          labels,
          datasets: [{
            data: values,
            backgroundColor: CHART_PALETTE.slice(0, Math.min(labels.length, CHART_PALETTE.length)),
            borderWidth: 1,
          }],
        }
      : {
          labels,
          datasets: [{
            label: yAxis,
            data: values,
            backgroundColor: chartType === 'bar' ? CHART_PALETTE[0] + 'cc' : CHART_PALETTE[0] + '33',
            borderColor: CHART_PALETTE[0],
            borderWidth: 2,
            fill: chartType === 'line',
            tension: 0.35,
            pointRadius: chartType === 'line' ? 4 : undefined,
            pointHoverRadius: chartType === 'line' ? 6 : undefined,
          }],
        }

    chartInstanceRef.current = new Chart(chartCanvasRef.current, {
      type: chartType,
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: chartType === 'pie' ? {} : {
          x: { title: { display: true, text: xAxis }, grid: { color: 'rgba(0,0,0,.06)' } },
          y: { title: { display: true, text: yAxis }, grid: { color: 'rgba(0,0,0,.06)' }, beginAtZero: true },
        },
      },
    })

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [showChart, chartType, xAxis, yAxis, queryResult])

  /* ── Generate smart questions ─────────────────────────── */
  const generateSmartQuestions = useCallback(async () => {
    setQuestionsLoading(true)
    try {
      const res = await apiClient.post<SmartQuestion[]>('/AIAnalytics/GenerateSmartQuestions', { complexity })
      setSmartQuestions(res.data ?? [])
    } catch {
      /* questions are optional */
    } finally {
      setQuestionsLoading(false)
    }
  }, [complexity])

  /* ── Fetch AI insights ────────────────────────────────── */
  const fetchInsights = useCallback(async (
    query: string,
    sql: string,
    data: Record<string, unknown>[],
    columns: string[],
  ) => {
    setInsightsLoading(true)
    setInsightsText('')
    setShowInsights(true)
    try {
      const res = await apiClient.post<{ insight?: string; text?: string; insights?: string }>(
        '/AIAnalytics/GenerateInsights',
        { query, sql, data, columns },
      )
      const text = res.data?.insight ?? res.data?.text ?? res.data?.insights ?? ''
      setInsightsText(text)
    } catch { /* optional */ }
    finally { setInsightsLoading(false) }
  }, [])

  /* ── Fetch chart recommendation ───────────────────────── */
  const fetchChartRecommendation = useCallback(async (
    userQuery: string,
    sql: string,
    data: Record<string, unknown>[],
    columnNames: string[],
  ) => {
    try {
      const res = await apiClient.post<ChartRecommendation>(
        '/AIAnalytics/GetChartRecommendation',
        { userQuery, sql, data, columnNames },
      )
      const rec = res.data
      if (rec?.chartType && (CHART_TYPES as readonly string[]).includes(rec.chartType)) {
        setChartType(rec.chartType as ChartTypeOption)
      }
      if (rec?.xAxis && columnNames.includes(rec.xAxis)) setXAxis(rec.xAxis)
      if (rec?.yAxis && columnNames.includes(rec.yAxis)) setYAxis(rec.yAxis)
    } catch { /* optional */ }
  }, [])

  /* ── Shared post-query setup ──────────────────────────── */
  const applyQueryResult = useCallback((
    result: QueryResult,
    query: string,
  ) => {
    setQueryResult(result)
    setCurrentPage(1)
    setSortCriteria([])

    const cols = result.columns ?? []
    const rows = result.data ?? []
    if (cols.length > 0) {
      const strCols = cols.filter(c => !isNumericCol(c, rows))
      const numCols = cols.filter(c => isNumericCol(c, rows))
      setXAxis(strCols[0] ?? cols[0] ?? '')
      setYAxis(numCols[0] ?? cols[1] ?? '')
    }

    if (rows.length > 0 && cols.length > 0) {
      void fetchInsights(query, result.sql ?? '', rows, cols)
      void fetchChartRecommendation(query, result.sql ?? '', rows, cols)
    }
  }, [fetchInsights, fetchChartRecommendation])

  /* ── Send chat message ────────────────────────────────── */
  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? inputValue).trim()
    if (!query || isChatLoading) return

    setInputValue('')
    lastQueryRef.current = query
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', content: query, timestamp: new Date() }])
    setIsChatLoading(true)
    setQueryResult(null)
    setInsightsText('')

    try {
      const res = await apiClient.post<QueryResult>('/AIAnalytics/ProcessQuery', { query })
      const result = res.data

      if (result.success) {
        const chips = buildActionChips(result.suggestedActions, result.followUpQuestions)
        setMessages(prev => [...prev, {
          id: `a${Date.now()}`, role: 'assistant',
          content: result.explanation ?? 'Here are the results:',
          timestamp: new Date(),
          chips: chips.length > 0 ? chips : undefined,
        }])
        if (!result.isInteractive) {
          applyQueryResult(result, query)
        }
      } else {
        const errMsg = result.error ?? 'An error occurred.'
        const isOverloaded = errMsg.includes('overloaded') || errMsg.includes('high demand')
        const errorMsgId = `ae${Date.now()}`
        setMessages(prev => [...prev, {
          id: errorMsgId, role: 'assistant',
          content: isOverloaded
            ? 'The AI service is experiencing high demand. Please try again in a moment.'
            : `Error: ${errMsg}`,
          timestamp: new Date(),
        }])
        if (isOverloaded) {
          const retryQuery = query
          setTimeout(() => {
            setMessages(prev => prev.map(m =>
              m.id === errorMsgId
                ? { ...m, chips: [{ label: '↺ Retry', query: retryQuery }] }
                : m
            ))
          }, 1500)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setMessages(prev => [...prev, { id: `an${Date.now()}`, role: 'assistant', content: `Network error: ${msg}`, timestamp: new Date() }])
    } finally {
      setIsChatLoading(false)
    }
  }, [inputValue, isChatLoading, applyQueryResult])

  /* ── Execute custom SQL ───────────────────────────────── */
  const executeCustomSql = useCallback(async () => {
    if (!sqlEditorValue.trim()) return
    setIsChatLoading(true)
    try {
      const res = await apiClient.post<QueryResult>('/AIAnalytics/ExecuteCustomQuery', { sql: sqlEditorValue })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, {
          id: `sq${Date.now()}`, role: 'assistant',
          content: `Custom query executed. Found ${result.rowCount ?? result.data?.length ?? 0} results.`,
          timestamp: new Date(),
        }])
        setIsEditingSql(false)
        setInsightsText('')
        applyQueryResult(result, 'Custom SQL')
      } else {
        setMessages(prev => [...prev, { id: `sqe${Date.now()}`, role: 'assistant', content: `SQL Error: ${result.error}`, timestamp: new Date() }])
      }
    } catch { /* handled by interceptor */ }
    finally { setIsChatLoading(false) }
  }, [sqlEditorValue, applyQueryResult])

  /* ── Save query ───────────────────────────────────────── */
  const saveCurrentQuery = useCallback(async () => {
    if (!saveForm.name.trim()) return
    setIsSaving(true)
    try {
      await apiClient.post('/AIAnalytics/SaveQuery', {
        name: saveForm.name, category: saveForm.category, description: saveForm.description,
        naturalLanguageQuery: lastQueryRef.current,
        sqlQuery: saveForm.saveSQL ? queryResult?.sql : undefined,
      })
      setShowSaveModal(false)
      setSaveForm({ name: '', category: '', description: '', saveSQL: true })
    } catch { /* ignore */ }
    finally { setIsSaving(false) }
  }, [saveForm, queryResult])

  /* ── Load saved queries ───────────────────────────────── */
  const loadSavedQueries = useCallback(async (filter: 'all' | 'favorites') => {
    setSavedFilter(filter)
    setSavedQueriesLoading(true)
    try {
      const res = await apiClient.get<SavedQuery[]>(`/AIAnalytics/GetSavedQueries?filter=${filter}`)
      setSavedQueries(res.data ?? [])
    } catch { setSavedQueries([]) }
    finally { setSavedQueriesLoading(false) }
  }, [])

  /* ── Run saved query (LoadQuery path when SQL exists) ─── */
  const runSavedQuery = useCallback(async (q: SavedQuery) => {
    setShowSavedModal(false)
    if (q.sqlQuery) {
      setIsChatLoading(true)
      setQueryResult(null)
      setInsightsText('')
      lastQueryRef.current = q.naturalLanguageQuery
      setMessages(prev => [...prev, {
        id: `u${Date.now()}`, role: 'user',
        content: q.naturalLanguageQuery, timestamp: new Date(),
      }])
      try {
        const res = await apiClient.post<QueryResult>('/AIAnalytics/LoadQuery', { queryHistoryId: q.id })
        const result = res.data
        if (result.success) {
          setMessages(prev => [...prev, {
            id: `a${Date.now()}`, role: 'assistant',
            content: result.explanation ?? 'Here are the results:',
            timestamp: new Date(),
          }])
          applyQueryResult(result, q.naturalLanguageQuery)
        } else {
          setMessages(prev => [...prev, {
            id: `ae${Date.now()}`, role: 'assistant',
            content: `Error: ${result.error ?? 'Failed to load query'}`,
            timestamp: new Date(),
          }])
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error'
        setMessages(prev => [...prev, { id: `an${Date.now()}`, role: 'assistant', content: `Network error: ${msg}`, timestamp: new Date() }])
      } finally {
        setIsChatLoading(false)
      }
    } else {
      void sendMessage(q.naturalLanguageQuery)
    }
  }, [sendMessage, applyQueryResult])

  /* ── Toggle favorite ─────────────────────────────────── */
  const toggleFavorite = useCallback(async (queryHistoryId: number) => {
    setOpenDropdownId(null)
    try {
      await apiClient.post('/AIAnalytics/ToggleFavorite', { queryHistoryId })
      await loadSavedQueries(savedFilter)
    } catch { /* ignore */ }
  }, [loadSavedQueries, savedFilter])

  /* ── Delete query ─────────────────────────────────────── */
  const deleteQuery = useCallback(async (queryHistoryId: number) => {
    setOpenDropdownId(null)
    if (!confirm('Delete this saved query? This action cannot be undone.')) return
    try {
      await apiClient.delete(`/AIAnalytics/DeleteQuery?queryHistoryId=${queryHistoryId}`)
      await loadSavedQueries(savedFilter)
    } catch { /* ignore */ }
  }, [loadSavedQueries, savedFilter])

  /* ── Export to PDF ────────────────────────────────────── */
  const exportToPdf = useCallback(async () => {
    setShowExportMenu(false)
    if (!queryResult?.data) return
    setIsExportingPdf(true)
    try {
      const res = await apiClient.post(
        '/AIAnalytics/ExportToPDF',
        { query: lastQueryRef.current, sql: queryResult.sql, data: queryResult.data, columns: queryResult.columns },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'analytics-export.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    finally { setIsExportingPdf(false) }
  }, [queryResult])

  /* ── Export to Excel ──────────────────────────────────── */
  const exportToExcel = useCallback(() => {
    setShowExportMenu(false)
    if (!queryResult?.data || !queryResult.columns) return
    const ws = XLSX.utils.json_to_sheet(
      queryResult.data.map(row =>
        Object.fromEntries((queryResult.columns ?? []).map(col => [col, row[col] ?? '']))
      ),
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, 'analytics-export.xlsx')
  }, [queryResult])

  /* ── Column sort handler ─────────────────────────────── */
  const handleColumnSort = useCallback((col: string, ctrlKey: boolean) => {
    setSortCriteria(prev => {
      const existing = prev.find(s => s.column === col)
      if (ctrlKey) {
        if (existing) {
          if (existing.direction === 'asc') {
            return prev.map(s => s.column === col ? { ...s, direction: 'desc' as const } : s)
          }
          return prev.filter(s => s.column !== col)
        }
        return [...prev, { column: col, direction: 'asc' as const }]
      }
      if (existing) {
        return [{ column: col, direction: (existing.direction === 'asc' ? 'desc' : 'asc') as 'asc' | 'desc' }]
      }
      return [{ column: col, direction: 'asc' as const }]
    })
    setCurrentPage(1)
  }, [])

  /* ── Keyboard: Enter sends, Shift+Enter newline ───────── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }, [sendMessage])

  /* ── Derived pagination & sorting ────────────────────── */
  const data = queryResult?.data ?? []
  const columns = queryResult?.columns ?? []

  const sortedData = sortCriteria.length === 0 ? data : [...data].sort((a, b) => {
    for (const { column, direction } of sortCriteria) {
      const av = a[column]; const bv = b[column]
      let cmp = 0
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''))
      if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
    }
    return 0
  })

  const effectiveRows = rowsPerPage === 'All' ? sortedData.length || 1 : (rowsPerPage as number)
  const totalPages = Math.ceil(sortedData.length / effectiveRows) || 1
  const pageData = rowsPerPage === 'All'
    ? sortedData
    : sortedData.slice((currentPage - 1) * effectiveRows, currentPage * effectiveRows)

  /* ── Base styles ──────────────────────────────────────── */
  const darkCard: React.CSSProperties = {
    background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)',
    borderRadius: 16, padding: 28, marginBottom: 24,
  }
  const lightCard: React.CSSProperties = {
    background: 'rgba(255,255,255,.97)', border: '1px solid rgba(46,134,193,.2)',
    borderRadius: 16, padding: 28, marginBottom: 24,
  }

  /* ══════════════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 2rem 2rem' }}>

      {/* ── Smart Questions Panel ─────────────────────────── */}
      <div style={darkCard}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 style={{ color: '#fff', margin: 0, fontWeight: 600 }}>
            <i className="fas fa-lightbulb me-2" style={{ color: '#f39c12' }} />
            AI Analytics — Smart Questions
          </h4>
          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => void generateSmartQuestions()}
              disabled={questionsLoading}
            >
              {questionsLoading
                ? <><i className="fas fa-spinner fa-spin me-1" />Generating…</>
                : <><i className="fas fa-magic me-1" />Generate Questions</>}
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setQuestionsVisible(v => !v)}>
              <i className={`fas fa-eye${questionsVisible ? '-slash' : ''} me-1`} />
              {questionsVisible ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {questionsVisible && (
          <>
            {/* Complexity slider */}
            <div style={{ background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
              <div className="d-flex align-items-center gap-4 flex-wrap">
                <div style={{ color: 'rgba(255,255,255,.9)', fontWeight: 500, minWidth: 120 }}>
                  <i className="fas fa-graduation-cap me-2" />
                  {COMPLEXITY_LABELS[complexity - 1]}
                </div>
                <div style={{ flexGrow: 1, maxWidth: 300 }}>
                  <input type="range" className="form-range" min={1} max={4} value={complexity}
                    onChange={e => setComplexity(Number(e.target.value))} />
                  <div className="d-flex justify-content-between" style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
                    {COMPLEXITY_LABELS.map(l => <span key={l}>{l}</span>)}
                  </div>
                </div>
                <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 13, textAlign: 'right', flex: 1 }}>
                  {COMPLEXITY_DESCRIPTIONS[complexity - 1]}
                </div>
              </div>
            </div>

            {/* Questions grid */}
            {smartQuestions.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                {smartQuestions.map((q, i) => (
                  <button key={i} onClick={() => void sendMessage(q.text)}
                    className="text-start"
                    style={{
                      background: '#fff', border: '1px solid rgba(46,134,193,.25)', borderRadius: 10,
                      padding: '14px 16px', cursor: 'pointer', transition: 'all .2s',
                    }}
                    onMouseEnter={e => { const el = e.currentTarget; el.style.boxShadow = '0 4px 16px rgba(46,134,193,.2)'; el.style.borderColor = '#2e86c1'; el.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { const el = e.currentTarget; el.style.boxShadow = ''; el.style.borderColor = 'rgba(46,134,193,.25)'; el.style.transform = '' }}
                  >
                    <div style={{ color: '#e67e22', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{q.category}</div>
                    <div style={{ color: '#212529', fontSize: 14, lineHeight: 1.5, fontWeight: 500 }}>{q.text}</div>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 14, margin: 0 }}>
                Click "Generate Questions" to get AI-suggested questions based on your data.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Chat Interface ─────────────────────────────────── */}
      <div style={lightCard}>
        <div className="d-flex justify-content-between align-items-center pb-3 mb-3" style={{ borderBottom: '1px solid #e9ecef' }}>
          <h4 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}>
            <i className="fas fa-robot text-primary me-2" />
            AI Analytics Assistant
          </h4>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowSavedModal(true); void loadSavedQueries('all') }}>
              <i className="fas fa-bookmark me-1" />Saved Queries
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setMessages(msgs => [msgs[0]]); setQueryResult(null) }}>
              <i className="fas fa-broom me-1" />Clear
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatContainerRef} style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 14, padding: '4px 0' }}>
          {messages.map(msg => (
            <div key={msg.id} className={`d-flex align-items-start gap-2 mb-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: msg.role === 'user' ? '#2e86c1' : '#e67e22', color: '#fff', fontSize: 14,
              }}>
                <i className={`fas fa-${msg.role === 'user' ? 'user' : 'robot'}`} />
              </div>
              <div style={{
                background: msg.role === 'user' ? '#2e86c1' : '#f8f9fa',
                color: msg.role === 'user' ? '#fff' : '#212529',
                borderRadius: 12, padding: '10px 14px', maxWidth: '85%',
                border: `1px solid ${msg.role === 'user' ? '#2e86c1' : '#e9ecef'}`,
                fontSize: 14, lineHeight: 1.5,
              }}>
                {msg.content}
                {msg.chips && msg.chips.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {msg.chips.map((chip, ci) => (
                      <button
                        key={ci}
                        onClick={() => void sendMessage(chip.query)}
                        disabled={isChatLoading}
                        style={{
                          background: msg.role === 'user' ? 'rgba(255,255,255,.15)' : 'rgba(46,134,193,.1)',
                          border: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,.4)' : 'rgba(46,134,193,.35)'}`,
                          borderRadius: 20, padding: '4px 12px', fontSize: 12,
                          color: msg.role === 'user' ? '#e0f0ff' : '#2e86c1',
                          cursor: isChatLoading ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap', opacity: isChatLoading ? 0.6 : 1,
                          transition: 'all .15s',
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="d-flex align-items-center gap-2 p-3" style={{ background: '#f8f9fa', borderRadius: 12 }}>
              <div className="spinner-border spinner-border-sm text-primary" />
              <span style={{ color: '#212529', fontSize: 14 }}>Analyzing your question…</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid #e9ecef', paddingTop: 14 }}>
          <div className="input-group">
            <textarea className="form-control" rows={2} value={inputValue}
              onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your business data…"
              disabled={isChatLoading}
              style={{ borderRadius: '12px 0 0 12px', border: '2px solid #e9ecef', borderRight: 'none', resize: 'none', color: '#212529', fontSize: 15, minHeight: 50 }}
            />
            <button className="btn btn-primary" onClick={() => void sendMessage()}
              disabled={isChatLoading || !inputValue.trim()}
              style={{ borderRadius: '0 12px 12px 0', minWidth: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: 'none' }}>
              <i className="fas fa-paper-plane" />
            </button>
          </div>
          <small className="text-muted mt-1 d-block">
            <i className="fas fa-info-circle me-1" />
            Ask in plain English — I'll convert it to database queries and provide insights. Press Enter to send.
          </small>
        </div>
      </div>

      {/* ── Results Section ─────────────────────────────────── */}
      {queryResult?.success && (
        <div style={lightCard}>
          {/* Toolbar */}
          <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <h5 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}>
              <i className="fas fa-chart-line text-primary me-2" />
              Analysis Results
              {data.length > 0 && (
                <span className="badge bg-primary ms-2" style={{ fontSize: 12 }}>{data.length} rows</span>
              )}
            </h5>
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <button className="btn btn-outline-primary btn-sm" onClick={() => { setShowSql(v => !v); if (showSql) setIsEditingSql(false) }}>
                <i className="fas fa-code me-1" />{showSql ? 'Hide SQL' : 'View SQL'}
              </button>
              <button className="btn btn-success btn-sm" onClick={() => setShowSaveModal(true)}>
                <i className="fas fa-save me-1" />Save Query
              </button>

              {/* Export dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={e => { e.stopPropagation(); setShowExportMenu(v => !v) }}
                  disabled={isExportingPdf}
                >
                  {isExportingPdf
                    ? <><i className="fas fa-spinner fa-spin me-1" />Exporting…</>
                    : <><i className="fas fa-download me-1" />Export <i className="fas fa-caret-down ms-1" /></>}
                </button>
                {showExportMenu && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                      background: '#fff', border: '1px solid #dee2e6', borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 200, minWidth: 180, overflow: 'hidden',
                    }}
                  >
                    <button
                      className="btn btn-light w-100 text-start"
                      style={{ borderRadius: 0, padding: '10px 14px', color: '#212529', borderBottom: '1px solid #f0f0f0' }}
                      onClick={() => void exportToPdf()}
                    >
                      <i className="fas fa-file-pdf me-2" style={{ color: '#dc3545' }} />Export to PDF
                    </button>
                    <button
                      className="btn btn-light w-100 text-start"
                      style={{ borderRadius: 0, padding: '10px 14px', color: '#212529' }}
                      onClick={exportToExcel}
                    >
                      <i className="fas fa-file-excel me-2" style={{ color: '#198754' }} />Export to Excel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SQL section */}
          {showSql && (
            <div className="mb-4">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center" style={{ background: '#f8f9fa' }}>
                  <h6 className="mb-0" style={{ color: '#212529', fontWeight: 600 }}>
                    <i className="fas fa-database me-2" />Generated SQL Query
                  </h6>
                  <div className="d-flex gap-2">
                    {!isEditingSql ? (
                      <button className="btn btn-sm btn-outline-primary" onClick={() => { setIsEditingSql(true); setSqlEditorValue(queryResult.sql ?? '') }}>
                        <i className="fas fa-edit me-1" />Edit SQL
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-success" onClick={() => void executeCustomSql()}>
                          <i className="fas fa-play me-1" />Execute
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsEditingSql(false)}>
                          <i className="fas fa-times me-1" />Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="card-body p-0">
                  {isEditingSql ? (
                    <textarea value={sqlEditorValue} onChange={e => setSqlEditorValue(e.target.value)} rows={6}
                      className="form-control rounded-0 border-0"
                      style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, color: '#212529', background: '#f8f9fa', resize: 'vertical' }} />
                  ) : (
                    <pre style={{ background: '#f8f9fa', margin: 0, padding: '14px 16px', fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, color: '#212529', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {queryResult.sql}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI Insights panel */}
          {(insightsLoading || insightsText) && (
            <div style={{
              background: 'rgba(46,134,193,.06)', border: '1px solid rgba(46,134,193,.22)',
              borderRadius: 12, padding: '14px 18px', marginBottom: 20,
            }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}>
                  <i className="fas fa-brain me-2" style={{ color: '#2e86c1' }} />AI Insights
                </h6>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowInsights(v => !v)}>
                  <i className={`fas fa-chevron-${showInsights ? 'up' : 'down'} me-1`} />
                  {showInsights ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {showInsights && (
                insightsLoading
                  ? (
                    <div className="d-flex align-items-center gap-2">
                      <div className="spinner-border spinner-border-sm text-primary" />
                      <span style={{ fontSize: 14, color: '#495057' }}>Generating insights…</span>
                    </div>
                  )
                  : <p style={{ color: '#212529', fontSize: 14, margin: 0, lineHeight: 1.65 }}>{insightsText}</p>
              )}
            </div>
          )}

          {/* Data table */}
          {data.length > 0 && columns.length > 0 ? (
            <>
              {/* Table controls row */}
              <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <small className="text-muted">
                  {rowsPerPage === 'All'
                    ? `Showing all ${data.length} entries`
                    : `Showing ${(currentPage - 1) * effectiveRows + 1}–${Math.min(currentPage * effectiveRows, data.length)} of ${data.length} entries`}
                  {sortCriteria.length > 0 && (
                    <span className="ms-2" style={{ color: '#2e86c1' }}>
                      <i className="fas fa-sort me-1" />
                      Sorted by {sortCriteria.map(s => `${s.column} ${s.direction}`).join(', ')}
                      <button className="btn btn-link btn-sm p-0 ms-1" style={{ fontSize: 12, verticalAlign: 'baseline' }} onClick={() => setSortCriteria([])}>
                        Clear
                      </button>
                    </span>
                  )}
                </small>
                <div className="d-flex align-items-center gap-2">
                  <label style={{ fontSize: 13, color: '#495057', whiteSpace: 'nowrap' }}>Rows per page:</label>
                  <select
                    className="form-select form-select-sm"
                    style={{ width: 'auto', color: '#212529' }}
                    value={rowsPerPage}
                    onChange={e => {
                      const v = e.target.value
                      setRowsPerPage(v === 'All' ? 'All' : Number(v) as RowsOption)
                      setCurrentPage(1)
                    }}
                  >
                    {ROWS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-striped table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      {columns.map(col => {
                        const sortEntry = sortCriteria.find(s => s.column === col)
                        const sortIndex = sortCriteria.findIndex(s => s.column === col)
                        return (
                          <th
                            key={col}
                            onClick={e => handleColumnSort(col, e.ctrlKey)}
                            style={{
                              background: '#2e86c1', color: '#fff', fontWeight: 600, border: 'none',
                              textAlign: isNumericCol(col, data) ? 'right' : 'left',
                              padding: '8px 12px', cursor: 'pointer', userSelect: 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col}
                            {sortEntry && (
                              <span className="ms-1" style={{ fontSize: 11 }}>
                                <i className={`fas fa-sort-${sortEntry.direction === 'asc' ? 'up' : 'down'}`} />
                                {sortCriteria.length > 1 && (
                                  <sup style={{ fontSize: 9, marginLeft: 2 }}>{sortIndex + 1}</sup>
                                )}
                              </span>
                            )}
                            {!sortEntry && <i className="fas fa-sort ms-1" style={{ opacity: 0.35, fontSize: 11 }} />}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((row, ri) => (
                      <tr key={ri}>
                        {columns.map(col => (
                          <td key={col} style={{ color: '#212529', fontWeight: 500, textAlign: isNumericCol(col, data) ? 'right' : 'left', verticalAlign: 'middle', padding: '8px 12px' }}>
                            {formatCellValue(row[col], col)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && rowsPerPage !== 'All' && (
                <nav className="mt-3">
                  <ul className="pagination pagination-sm justify-content-center mb-0">
                    <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setCurrentPage(1)}><i className="fas fa-angle-double-left" /></button>
                    </li>
                    <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setCurrentPage(p => Math.max(1, p - 1))}><i className="fas fa-angle-left" /></button>
                    </li>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
                      return start + i
                    }).filter(pg => pg >= 1 && pg <= totalPages).map(pg => (
                      <li key={pg} className={`page-item ${pg === currentPage ? 'active' : ''}`}>
                        <button className="page-link" onClick={() => setCurrentPage(pg)}>{pg}</button>
                      </li>
                    ))}
                    <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}><i className="fas fa-angle-right" /></button>
                    </li>
                    <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setCurrentPage(totalPages)}><i className="fas fa-angle-double-right" /></button>
                    </li>
                  </ul>
                </nav>
              )}
            </>
          ) : (
            <div className="alert alert-info" style={{ color: '#212529' }}>No data found for your query.</div>
          )}

          {/* Chart panel */}
          {data.length > 0 && (
            <div style={{
              border: '1px solid rgba(46,134,193,.2)', borderRadius: 12,
              overflow: 'hidden', marginTop: 24,
            }}>
              <div
                className="d-flex justify-content-between align-items-center px-3 py-2"
                style={{ background: 'rgba(46,134,193,.06)', borderBottom: showChart ? '1px solid rgba(46,134,193,.15)' : 'none' }}
              >
                <h6 style={{ margin: 0, color: '#0f172a', fontWeight: 600 }}>
                  <i className="fas fa-chart-bar me-2" style={{ color: '#2e86c1' }} />Chart Visualization
                </h6>
                <button className="btn btn-sm btn-outline-primary" onClick={() => setShowChart(v => !v)}>
                  <i className={`fas fa-chevron-${showChart ? 'up' : 'down'} me-1`} />
                  {showChart ? 'Collapse' : 'Expand'}
                </button>
              </div>

              {showChart && (
                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Controls */}
                  <div className="d-flex flex-wrap gap-3 align-items-center mb-4">
                    <div className="btn-group btn-group-sm">
                      {CHART_TYPES.map(ct => (
                        <button
                          key={ct}
                          className={`btn btn-outline-primary${chartType === ct ? ' active' : ''}`}
                          onClick={() => setChartType(ct)}
                        >
                          <i className={`fas fa-chart-${ct === 'bar' ? 'bar' : ct === 'line' ? 'line' : 'pie-chart'} me-1`} />
                          {ct.charAt(0).toUpperCase() + ct.slice(1)}
                        </button>
                      ))}
                    </div>

                    <div className="d-flex align-items-center gap-2">
                      <label style={{ fontSize: 13, color: '#212529', fontWeight: 500, whiteSpace: 'nowrap' }}>X Axis:</label>
                      <select className="form-select form-select-sm" style={{ minWidth: 140, color: '#212529' }}
                        value={xAxis} onChange={e => setXAxis(e.target.value)}>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="d-flex align-items-center gap-2">
                      <label style={{ fontSize: 13, color: '#212529', fontWeight: 500, whiteSpace: 'nowrap' }}>Y Axis:</label>
                      <select className="form-select form-select-sm" style={{ minWidth: 140, color: '#212529' }}
                        value={yAxis} onChange={e => setYAxis(e.target.value)}>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Canvas */}
                  <div style={{ position: 'relative', height: 350 }}>
                    {xAxis && yAxis
                      ? <canvas ref={chartCanvasRef} />
                      : (
                        <div className="d-flex align-items-center justify-content-center h-100" style={{ color: '#6c757d', fontSize: 14 }}>
                          <i className="fas fa-info-circle me-2" />Select X and Y axis columns to render the chart.
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Save Query Modal ──────────────────────────────────── */}
      {showSaveModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowSaveModal(false) }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}>
                  <i className="fas fa-save me-2" />Save Query
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowSaveModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Query Name *</label>
                  <input type="text" className="form-control" value={saveForm.name}
                    onChange={e => setSaveForm(f => ({ ...f, name: e.target.value }))} maxLength={200} style={{ color: '#212529' }} />
                </div>
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Category</label>
                  <select className="form-select" value={saveForm.category}
                    onChange={e => setSaveForm(f => ({ ...f, category: e.target.value }))} style={{ color: '#212529' }}>
                    <option value="">Select category</option>
                    {QUERY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Description</label>
                  <textarea className="form-control" rows={3} value={saveForm.description}
                    onChange={e => setSaveForm(f => ({ ...f, description: e.target.value }))} maxLength={500}
                    style={{ color: '#212529' }} placeholder="Optional description for this query" />
                </div>
                <div className="form-check mb-3">
                  <input type="checkbox" className="form-check-input" id="saveSqlCheck"
                    checked={saveForm.saveSQL} onChange={e => setSaveForm(f => ({ ...f, saveSQL: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="saveSqlCheck" style={{ color: '#212529', fontWeight: 500 }}>
                    Save exact SQL query (recommended for consistent results)
                  </label>
                </div>
                <div className="alert alert-info mb-0" style={{ fontSize: 13 }}>
                  <strong style={{ color: '#212529' }}><i className="fas fa-chart-bar me-1" />Visualization settings included.</strong>
                  <span style={{ color: '#212529' }}> This save will include current chart type and field selections.</span>
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

      {/* ── Saved Queries Modal ───────────────────────────────── */}
      {showSavedModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowSavedModal(false) }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}>
                  <i className="fas fa-bookmark me-2" />Saved Queries
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowSavedModal(false)} />
              </div>
              <div className="modal-body">
                <div className="btn-group mb-3">
                  <button type="button" className={`btn btn-outline-primary ${savedFilter === 'all' ? 'active' : ''}`} onClick={() => void loadSavedQueries('all')}>All Queries</button>
                  <button type="button" className={`btn btn-outline-primary ${savedFilter === 'favorites' ? 'active' : ''}`} onClick={() => void loadSavedQueries('favorites')}>
                    <i className="fas fa-star me-1 text-warning" />Favorites
                  </button>
                </div>
                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
                  {savedQueriesLoading ? (
                    <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
                  ) : savedQueries.length === 0 ? (
                    <p className="text-muted text-center py-4">No saved queries found.</p>
                  ) : (
                    savedQueries.map(q => (
                      <div key={q.id} className="card mb-2" style={{ border: '1px solid #dee2e6' }}>
                        <div className="card-body py-2 px-3">
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <div style={{ flex: 1 }}>
                              <h6 className="mb-1" style={{ color: '#212529', fontWeight: 600 }}>
                                {q.isFavorite && <i className="fas fa-star text-warning me-1" style={{ fontSize: 12 }} />}
                                {q.name}
                              </h6>
                              {q.category && <span className="badge bg-primary me-2" style={{ fontSize: 11 }}>{q.category}</span>}
                              {q.description && <p className="text-muted mb-1" style={{ fontSize: 13 }}>{q.description}</p>}
                              <p className="text-muted mb-0" style={{ fontSize: 12 }}>{q.naturalLanguageQuery}</p>
                            </div>

                            {/* Action buttons */}
                            <div className="d-flex gap-1 align-items-start flex-shrink-0">
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => void runSavedQuery(q)}
                              >
                                <i className="fas fa-play me-1" />Run
                              </button>

                              {/* Dropdown for favorite/delete */}
                              <div style={{ position: 'relative' }}>
                                <button
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={e => { e.stopPropagation(); setOpenDropdownId(openDropdownId === q.id ? null : q.id) }}
                                  title="More actions"
                                >
                                  <i className="fas fa-ellipsis-v" />
                                </button>
                                {openDropdownId === q.id && (
                                  <div
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                      position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                                      background: '#fff', border: '1px solid #dee2e6', borderRadius: 8,
                                      boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 300, minWidth: 170, overflow: 'hidden',
                                    }}
                                  >
                                    <button
                                      className="btn btn-light w-100 text-start"
                                      style={{ borderRadius: 0, padding: '9px 14px', color: '#212529', borderBottom: '1px solid #f0f0f0' }}
                                      onClick={() => void toggleFavorite(q.id)}
                                    >
                                      <i className={`fas fa-star me-2 ${q.isFavorite ? 'text-warning' : 'text-muted'}`} />
                                      {q.isFavorite ? 'Remove Favorite' : 'Add Favorite'}
                                    </button>
                                    <button
                                      className="btn btn-light w-100 text-start"
                                      style={{ borderRadius: 0, padding: '9px 14px', color: '#dc3545' }}
                                      onClick={() => void deleteQuery(q.id)}
                                    >
                                      <i className="fas fa-trash me-2" />Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
