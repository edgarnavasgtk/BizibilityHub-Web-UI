import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Chart from 'chart.js/auto'
import apiClient from '../../services/apiClient'

interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date }
interface ProcessLog { step: string; timestamp: string; details?: string }
interface QueryResult { success: boolean; data?: Record<string, unknown>[]; columns?: string[]; sql?: string; explanation?: string; error?: string; isInteractive?: boolean; rowCount?: number; queryHistoryId?: number; processLogs?: ProcessLog[] }
interface SavedQuery { id: number; name: string; category?: string; description?: string; naturalLanguageQuery: string; sqlQuery?: string; isFavorite: boolean }
interface QueryHistoryEntry { id: string; query: string; sql?: string; timestamp: Date; rowCount: number }

type SortDir = 'asc' | 'desc'
interface SortEntry { col: string; dir: SortDir }
type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'choropleth'

const QUERY_CATEGORIES = ['Performance', 'Errors', 'Volume', 'Geography', 'Trends', 'Business']
const EXAMPLE_PROMPTS = [
  { icon: '📊', text: 'Show me failed transactions in Brazil today' },
  { icon: '⚡', text: "What's the error rate for Salesforce integrations this week?" },
  { icon: '🌍', text: 'Top 10 countries by transaction volume last month' },
  { icon: '🔍', text: 'Show average processing time by business process' },
  { icon: '⚠️', text: 'List all transactions with status ERROR in the last 24 hours' },
  { icon: '📈', text: 'Transaction trend by day for the last 30 days' },
]
const CHART_COLORS = ['#2e86c1', '#28a745', '#e83e8c', '#ffc107', '#17a2b8', '#6f42c1', '#fd7e14', '#20c997']
const COUNTRY_COL_HINTS = ['country', 'nation', 'territory', 'region', 'geo', 'location', 'countryname', 'country_name', 'countrycode', 'country_code']

function isNumericCol(col: string, data: Record<string, unknown>[]): boolean {
  const l = col.toLowerCase()
  if (l.includes('id') || l.includes('name') || l.includes('code')) return false
  return data.some(r => { const v = r[col]; return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(parseFloat(v))) })
}

function isCountryCol(col: string): boolean {
  const l = col.toLowerCase().replace(/[^a-z]/g, '')
  return COUNTRY_COL_HINTS.some(h => l.includes(h.replace(/[^a-z]/g, '')))
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

function toCsvBlob(columns: string[], data: Record<string, unknown>[]): Blob {
  const escape = (v: unknown) => {
    const s = fmtCell(v, '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [columns.join(','), ...data.map(r => columns.map(c => escape(r[c])).join(','))]
  return new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
}

export default function AIBuilderPage() {
  // ── existing state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [showSql, setShowSql] = useState(false)
  const [isEditingSql, setIsEditingSql] = useState(false)
  const [sqlEditorValue, setSqlEditorValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [sortConfig, setSortConfig] = useState<SortEntry[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveForm, setSaveForm] = useState({ name: '', category: '', description: '', saveSQL: true })
  const [isSaving, setIsSaving] = useState(false)
  const [showSavedModal, setShowSavedModal] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [savedQueriesLoading, setSavedQueriesLoading] = useState(false)
  const [savedFilter, setSavedFilter] = useState<'all' | 'favorites'>('all')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [showChartModal, setShowChartModal] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [chartXAxis, setChartXAxis] = useState('')
  const [chartYAxis, setChartYAxis] = useState('')
  const [chartGroupBy, setChartGroupBy] = useState('')
  const [insightsText, setInsightsText] = useState<string | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null)

  // ── new state ───────────────────────────────────────────────────────────────
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showProcessPanel, setShowProcessPanel] = useState(false)
  const [processLogs, setProcessLogs] = useState<ProcessLog[]>([])
  const [draggedField, setDraggedField] = useState<string | null>(null)

  const chatRef = useRef<HTMLDivElement>(null)
  const lastQueryRef = useRef('')
  const chartCanvasRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<{ destroy: () => void } | null>(null)

  // ── effects ─────────────────────────────────────────────────────────────────
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages, isChatLoading])
  useEffect(() => {
    setMessages([{ id: 'welcome', role: 'assistant', content: "Hello! I'm the AI Query Builder. Ask me anything about your business data in plain English — I'll convert it to database queries and provide insights instantly.", timestamp: new Date() }])
  }, [])

  // reset per-result state whenever a new queryResult arrives
  useEffect(() => {
    setInsightsText(null)
    setFeedbackGiven(null)
    setSortConfig([])
    setCurrentPage(1)
    setChartXAxis('')
    setChartYAxis('')
    setChartGroupBy('')
  }, [queryResult])

  // set default chart axes when the chart modal first opens
  useEffect(() => {
    if (!showChartModal) return
    const cols = queryResult?.columns ?? []
    const d = queryResult?.data ?? []
    const numericCols = cols.filter(c => isNumericCol(c, d))
    const nonNumericCols = cols.filter(c => !isNumericCol(c, d))
    if (!chartXAxis) setChartXAxis(nonNumericCols[0] ?? cols[0] ?? '')
    if (!chartYAxis) setChartYAxis(numericCols[0] ?? cols[1] ?? '')
    // auto-select choropleth if country column detected
    const hasCountry = cols.some(isCountryCol)
    if (hasCountry && chartType === 'bar') setChartType('choropleth')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChartModal])

  // build / rebuild chart whenever settings change
  useEffect(() => {
    if (!showChartModal || !chartCanvasRef.current || !chartXAxis || !chartYAxis) return
    if (chartType === 'choropleth') return // handled separately
    const d = queryResult?.data ?? []

    chartInstanceRef.current?.destroy()
    chartInstanceRef.current = null

    const labels = d.map(r => fmtCell(r[chartXAxis], chartXAxis))
    const values = d.map(r => {
      const v = r[chartYAxis]
      return typeof v === 'number' ? v : parseFloat(String(v ?? '0')) || 0
    })
    const isCircular = chartType === 'pie' || chartType === 'doughnut'
    const bgColors = isCircular
      ? CHART_COLORS.slice(0, Math.min(d.length, CHART_COLORS.length))
      : `${CHART_COLORS[0]}cc`
    const borderColors = isCircular
      ? CHART_COLORS.slice(0, Math.min(d.length, CHART_COLORS.length))
      : CHART_COLORS[0]

    const instance = new Chart(chartCanvasRef.current, {
      type: chartType as 'bar' | 'line' | 'pie' | 'doughnut',
      data: {
        labels,
        datasets: [{ label: chartYAxis, data: values, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: isCircular },
          title: { display: true, text: `${chartYAxis} by ${chartXAxis}${chartGroupBy ? ` (grouped by ${chartGroupBy})` : ''}` },
        },
        ...(!isCircular && { scales: { x: { ticks: { maxRotation: 45 } }, y: { beginAtZero: true } } }),
      },
    })
    chartInstanceRef.current = instance as unknown as { destroy: () => void }

    return () => {
      instance.destroy()
      chartInstanceRef.current = null
    }
  }, [showChartModal, chartType, chartXAxis, chartYAxis, chartGroupBy, queryResult])

  // ── derived / sorted data ───────────────────────────────────────────────────
  const rawData = queryResult?.data ?? []
  const columns = queryResult?.columns ?? []

  const sortedData = useMemo(() => {
    if (sortConfig.length === 0) return rawData
    return [...rawData].sort((a, b) => {
      for (const { col, dir } of sortConfig) {
        const av = a[col]; const bv = b[col]
        let cmp = 0
        if (av == null && bv == null) cmp = 0
        else if (av == null) cmp = 1
        else if (bv == null) cmp = -1
        else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
        else cmp = String(av).localeCompare(String(bv))
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [rawData, sortConfig])

  const totalPages = rowsPerPage === 0 ? 1 : Math.ceil(sortedData.length / rowsPerPage)
  const pageData = rowsPerPage === 0 ? sortedData : sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
  const startRow = rowsPerPage === 0 ? 1 : (currentPage - 1) * rowsPerPage + 1
  const endRow = rowsPerPage === 0 ? sortedData.length : Math.min(currentPage * rowsPerPage, sortedData.length)

  // ── handlers ────────────────────────────────────────────────────────────────
  const handleHeaderClick = useCallback((col: string, ctrlKey: boolean) => {
    setSortConfig(prev => {
      if (ctrlKey) {
        const existing = prev.find(s => s.col === col)
        if (existing) return prev.map(s => s.col === col ? { ...s, dir: (s.dir === 'asc' ? 'desc' : 'asc') as SortDir } : s)
        return [...prev, { col, dir: 'asc' as SortDir }]
      }
      const existing = prev.find(s => s.col === col)
      if (existing && prev.length === 1) return [{ col, dir: (existing.dir === 'asc' ? 'desc' : 'asc') as SortDir }]
      return [{ col, dir: 'asc' as SortDir }]
    })
    setCurrentPage(1)
  }, [])

  // ── auto-insights helper (takes result directly to avoid stale state) ────────
  const generateInsightsForResult = useCallback(async (result: QueryResult, query: string) => {
    setInsightsLoading(true)
    setInsightsExpanded(true)
    try {
      const res = await apiClient.post<{ insights?: string; content?: string }>('/AIBuilder/GenerateInsights', {
        query,
        sql: result.sql,
        data: result.data,
        columns: result.columns,
      })
      setInsightsText(res.data?.insights ?? res.data?.content ?? 'No insights available.')
    } catch { setInsightsText('Failed to generate insights. Please try again.') }
    finally { setInsightsLoading(false) }
  }, [])

  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? inputValue).trim()
    if (!query || isChatLoading) return
    setInputValue('')
    lastQueryRef.current = query
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', content: query, timestamp: new Date() }])
    setIsChatLoading(true)
    setQueryResult(null)
    setCurrentPage(1)
    try {
      const res = await apiClient.post<QueryResult>('/AIBuilder/ProcessQuery', { query })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', content: result.explanation ?? 'Here are the results:', timestamp: new Date() }])
        if (!result.isInteractive) {
          setQueryResult(result)
          // push to local query history (capped at 20)
          const entry: QueryHistoryEntry = {
            id: `h${Date.now()}`,
            query,
            sql: result.sql,
            timestamp: new Date(),
            rowCount: result.rowCount ?? result.data?.length ?? 0,
          }
          setQueryHistory(prev => [entry, ...prev].slice(0, 20))
          // store process logs if returned
          if (result.processLogs && result.processLogs.length > 0) {
            setProcessLogs(result.processLogs)
          }
          // auto-generate insights
          void generateInsightsForResult(result, query)
        }
      } else {
        const errMsg = result.error ?? 'An error occurred.'
        setMessages(prev => [...prev, { id: `ae${Date.now()}`, role: 'assistant', content: errMsg.includes('overloaded') ? 'The AI service is experiencing high demand. Please try again in a moment.' : `Error: ${errMsg}`, timestamp: new Date() }])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setMessages(prev => [...prev, { id: `an${Date.now()}`, role: 'assistant', content: `Network error: ${msg}`, timestamp: new Date() }])
    } finally { setIsChatLoading(false) }
  }, [inputValue, isChatLoading, generateInsightsForResult])

  const executeCustomSql = useCallback(async () => {
    if (!sqlEditorValue.trim()) return
    setIsChatLoading(true)
    try {
      const res = await apiClient.post<QueryResult>('/AIBuilder/ExecuteCustomQuery', { sql: sqlEditorValue })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, { id: `sq${Date.now()}`, role: 'assistant', content: `Custom query executed. Found ${result.rowCount ?? result.data?.length ?? 0} results.`, timestamp: new Date() }])
        setQueryResult(result); setIsEditingSql(false); setCurrentPage(1)
      } else {
        setMessages(prev => [...prev, { id: `sqe${Date.now()}`, role: 'assistant', content: `SQL Error: ${result.error}`, timestamp: new Date() }])
      }
    } catch { /* handled */ } finally { setIsChatLoading(false) }
  }, [sqlEditorValue])

  const saveCurrentQuery = useCallback(async () => {
    if (!saveForm.name.trim()) return
    setIsSaving(true)
    try {
      await apiClient.post('/AIBuilder/SaveQuery', { name: saveForm.name, category: saveForm.category, description: saveForm.description, naturalLanguageQuery: lastQueryRef.current, sqlQuery: saveForm.saveSQL ? queryResult?.sql : undefined })
      setShowSaveModal(false)
      setSaveForm({ name: '', category: '', description: '', saveSQL: true })
    } catch { /* ignore */ } finally { setIsSaving(false) }
  }, [saveForm, queryResult])

  const loadSavedQueries = useCallback(async (filter: 'all' | 'favorites') => {
    setSavedFilter(filter); setSavedQueriesLoading(true)
    try {
      const res = await apiClient.get<SavedQuery[]>(`/AIBuilder/GetSavedQueries?filter=${filter}`)
      setSavedQueries(res.data ?? [])
    } catch { setSavedQueries([]) } finally { setSavedQueriesLoading(false) }
  }, [])

  const executeSavedQuery = useCallback(async (q: SavedQuery) => {
    setShowSavedModal(false)
    setShowHistoryModal(false)
    lastQueryRef.current = q.naturalLanguageQuery
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', content: q.naturalLanguageQuery, timestamp: new Date() }])
    setIsChatLoading(true)
    setQueryResult(null)
    setCurrentPage(1)
    try {
      const res = await apiClient.post<QueryResult>('/AIBuilder/ExecuteSavedQuery', { queryHistoryId: q.id })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', content: result.explanation ?? 'Here are the results:', timestamp: new Date() }])
        if (!result.isInteractive) {
          setQueryResult(result)
          if (result.processLogs && result.processLogs.length > 0) setProcessLogs(result.processLogs)
          void generateInsightsForResult(result, q.naturalLanguageQuery)
        }
      } else {
        setMessages(prev => [...prev, { id: `ae${Date.now()}`, role: 'assistant', content: `Error: ${result.error ?? 'Unknown error'}`, timestamp: new Date() }])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setMessages(prev => [...prev, { id: `an${Date.now()}`, role: 'assistant', content: `Network error: ${msg}`, timestamp: new Date() }])
    } finally { setIsChatLoading(false) }
  }, [generateInsightsForResult])

  const runHistoryEntry = useCallback(async (entry: QueryHistoryEntry) => {
    setShowHistoryModal(false)
    lastQueryRef.current = entry.query
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', content: entry.query, timestamp: new Date() }])
    setIsChatLoading(true)
    setQueryResult(null)
    setCurrentPage(1)
    try {
      const res = await apiClient.post<QueryResult>('/AIBuilder/ProcessQuery', { query: entry.query })
      const result = res.data
      if (result.success) {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', content: result.explanation ?? 'Here are the results:', timestamp: new Date() }])
        if (!result.isInteractive) {
          setQueryResult(result)
          if (result.processLogs && result.processLogs.length > 0) setProcessLogs(result.processLogs)
          void generateInsightsForResult(result, entry.query)
        }
      } else {
        setMessages(prev => [...prev, { id: `ae${Date.now()}`, role: 'assistant', content: `Error: ${result.error ?? 'Unknown error'}`, timestamp: new Date() }])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setMessages(prev => [...prev, { id: `an${Date.now()}`, role: 'assistant', content: `Network error: ${msg}`, timestamp: new Date() }])
    } finally { setIsChatLoading(false) }
  }, [generateInsightsForResult])

  const toggleFavorite = useCallback(async (q: SavedQuery) => {
    try {
      await apiClient.post('/AIBuilder/ToggleFavorite', { queryHistoryId: q.id })
      setSavedQueries(prev => prev.map(s => s.id === q.id ? { ...s, isFavorite: !s.isFavorite } : s))
    } catch { /* ignore */ }
  }, [])

  const deleteQuery = useCallback(async (q: SavedQuery) => {
    if (!window.confirm(`Delete "${q.name}"?`)) return
    try {
      await apiClient.get(`/AIBuilder/DeleteQuery?queryHistoryId=${q.id}`)
      setSavedQueries(prev => prev.filter(s => s.id !== q.id))
    } catch { /* ignore */ }
  }, [])

  const exportToCsv = useCallback(() => {
    if (!queryResult?.columns || !queryResult.data) return
    const blob = toCsvBlob(queryResult.columns, queryResult.data)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'query-results.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [queryResult])

  const exportToPdf = useCallback(async () => {
    if (!queryResult) return
    setExportingPdf(true)
    try {
      // capture chart image if canvas is visible
      let chartImageBase64 = ''
      if (chartCanvasRef.current) {
        try { chartImageBase64 = chartCanvasRef.current.toDataURL('image/png') } catch { /* ignore */ }
      }
      const res = await apiClient.post<Blob>(
        '/AIBuilder/ExportToPDF',
        {
          query: lastQueryRef.current,
          sql: queryResult.sql,
          data: queryResult.data,
          columns: queryResult.columns,
          insights: insightsText ?? '',
          chartImageBase64,
        },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'query-results.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { /* ignore */ } finally { setExportingPdf(false) }
  }, [queryResult, insightsText])

  const fetchInsights = useCallback(async () => {
    if (!queryResult) return
    setInsightsLoading(true)
    setInsightsExpanded(true)
    try {
      const res = await apiClient.post<{ insights?: string; content?: string }>('/AIBuilder/GenerateInsights', {
        query: lastQueryRef.current,
        sql: queryResult.sql,
        data: queryResult.data,
        columns: queryResult.columns,
      })
      setInsightsText(res.data?.insights ?? res.data?.content ?? 'No insights available.')
    } catch { setInsightsText('Failed to generate insights. Please try again.') }
    finally { setInsightsLoading(false) }
  }, [queryResult])

  const submitFeedback = useCallback(async (feedbackType: string) => {
    setFeedbackGiven(feedbackType)
    try {
      await apiClient.post('/AIBuilder/ProvideFeedback', { queryHistoryId: queryResult?.queryHistoryId, feedbackType })
    } catch { /* ignore */ }
  }, [queryResult])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }, [sendMessage])

  // drag-and-drop helpers for chart field builder
  const handleFieldDrop = useCallback((zone: 'x' | 'y' | 'group') => (e: React.DragEvent) => {
    e.preventDefault()
    const field = e.dataTransfer.getData('text/plain') || draggedField
    if (!field) return
    if (zone === 'x') setChartXAxis(field)
    else if (zone === 'y') setChartYAxis(field)
    else setChartGroupBy(field)
    setDraggedField(null)
  }, [draggedField])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }

  const darkCard: React.CSSProperties = { background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 16, padding: 28, marginBottom: 24 }
  const lightCard: React.CSSProperties = { background: 'rgba(255,255,255,.97)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 16, padding: 28, marginBottom: 24 }

  const dropZoneStyle = (active: boolean): React.CSSProperties => ({
    minHeight: 44,
    border: `2px dashed ${active ? '#2e86c1' : '#cbd5e1'}`,
    borderRadius: 8,
    padding: '6px 10px',
    background: active ? 'rgba(46,134,193,.08)' : '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    transition: 'all .15s',
    cursor: 'default',
  })

  // detect country columns for choropleth suggestion
  const countryColumns = columns.filter(isCountryCol)
  const hasCountryData = countryColumns.length > 0

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 2rem 2rem' }}>

      {/* Header + Example Prompts */}
      <div style={darkCard}>
        <div className="mb-4">
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-hammer me-2 text-primary" />AI Query Builder
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>Ask questions in natural language and get instant insights</p>
        </div>

        <p className="text-muted mb-2" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Example Queries</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {EXAMPLE_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => void sendMessage(p.text)} className="text-start"
              style={{ background: 'rgba(46,134,193,.08)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 10 }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(46,134,193,.18)'; el.style.borderColor = '#2e86c1' }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'rgba(46,134,193,.08)'; el.style.borderColor = 'rgba(46,134,193,.2)' }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>{p.icon}</span>
              <span style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.4 }}>{p.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div style={lightCard}>
        <div className="d-flex justify-content-between align-items-center pb-3 mb-3" style={{ borderBottom: '1px solid #e9ecef' }}>
          <h4 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}>
            <i className="fas fa-robot text-primary me-2" />AI Query Builder
          </h4>
          <div className="d-flex gap-2 flex-wrap">
            {/* Query History button with badge */}
            <button className="btn btn-outline-secondary btn-sm position-relative" onClick={() => setShowHistoryModal(true)}>
              <i className="fas fa-history me-1" />Query History
              {queryHistory.length > 0 && (
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: 10 }}>
                  {queryHistory.length > 99 ? '99+' : queryHistory.length}
                </span>
              )}
            </button>
            {/* Saved Queries button */}
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowSavedModal(true); void loadSavedQueries('all') }}>
              <i className="fas fa-bookmark me-1" />Saved Queries
            </button>
            {/* Favorites standalone button */}
            <button className="btn btn-outline-warning btn-sm" onClick={() => { setShowSavedModal(true); void loadSavedQueries('favorites') }}>
              <i className="fas fa-star me-1" />Favorites
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setMessages(msgs => [msgs[0]]); setQueryResult(null) }}>
              <i className="fas fa-broom me-1" />Clear
            </button>
          </div>
        </div>
        <div ref={chatRef} style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
          {messages.map(msg => (
            <div key={msg.id} className={`d-flex align-items-start gap-2 mb-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'user' ? '#2e86c1' : '#6d28d9', color: '#fff', fontSize: 14 }}>
                <i className={`fas fa-${msg.role === 'user' ? 'user' : 'hammer'}`} />
              </div>
              <div style={{ background: msg.role === 'user' ? '#2e86c1' : '#f8f9fa', color: msg.role === 'user' ? '#fff' : '#212529', borderRadius: 12, padding: '10px 14px', maxWidth: '85%', border: `1px solid ${msg.role === 'user' ? '#2e86c1' : '#e9ecef'}`, fontSize: 14, lineHeight: 1.5 }}>
                {msg.content}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="d-flex align-items-center gap-2 p-3" style={{ background: '#f8f9fa', borderRadius: 12 }}>
              <div className="spinner-border spinner-border-sm text-primary" />
              <span style={{ color: '#212529', fontSize: 14 }}>Building your query…</span>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e9ecef', paddingTop: 14 }}>
          <div className="input-group">
            <textarea className="form-control" rows={2} value={inputValue}
              onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your transaction data… e.g. 'Show me failed transactions in Brazil today'"
              disabled={isChatLoading}
              style={{ borderRadius: '12px 0 0 12px', border: '2px solid #e9ecef', borderRight: 'none', resize: 'none', color: '#212529', fontSize: 15, minHeight: 50 }}
            />
            <button className="btn btn-primary" onClick={() => void sendMessage()} disabled={isChatLoading || !inputValue.trim()}
              style={{ borderRadius: '0 12px 12px 0', minWidth: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: 'none' }}>
              <i className="fas fa-paper-plane" />
            </button>
          </div>
          <small className="text-muted mt-1 d-block"><i className="fas fa-info-circle me-1" />Press Enter to send, Shift+Enter for new line.</small>
        </div>
      </div>

      {/* Results */}
      {queryResult?.success && (
        <div style={lightCard}>
          {/* Toolbar */}
          <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <h5 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}>
              <i className="fas fa-chart-line text-primary me-2" />Query Results
              {rawData.length > 0 && <span className="badge bg-primary ms-2" style={{ fontSize: 12 }}>{rawData.length} rows</span>}
            </h5>
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-outline-primary btn-sm" onClick={() => { setShowSql(v => !v); if (showSql) setIsEditingSql(false) }}>
                <i className="fas fa-code me-1" />{showSql ? 'Hide SQL' : 'View SQL'}
              </button>
              {rawData.length > 0 && columns.length > 0 && (
                <button className="btn btn-outline-info btn-sm" onClick={() => setShowChartModal(true)}>
                  <i className="fas fa-chart-bar me-1" />Visualize Data
                </button>
              )}
              {/* Export CSV */}
              {rawData.length > 0 && columns.length > 0 && (
                <button className="btn btn-outline-success btn-sm" onClick={exportToCsv}>
                  <i className="fas fa-file-csv me-1" />Export CSV
                </button>
              )}
              <button className="btn btn-outline-danger btn-sm" onClick={() => void exportToPdf()} disabled={exportingPdf}>
                {exportingPdf
                  ? <><i className="fas fa-spinner fa-spin me-1" />Exporting…</>
                  : <><i className="fas fa-file-pdf me-1" />Export PDF</>}
              </button>
              <button className="btn btn-success btn-sm" onClick={() => setShowSaveModal(true)}>
                <i className="fas fa-save me-1" />Save Query
              </button>
            </div>
          </div>

          {/* SQL panel */}
          {showSql && (
            <div className="mb-4">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center" style={{ background: '#f8f9fa' }}>
                  <h6 className="mb-0" style={{ color: '#212529', fontWeight: 600 }}><i className="fas fa-database me-2" />Generated SQL</h6>
                  <div className="d-flex gap-2">
                    {!isEditingSql
                      ? <button className="btn btn-sm btn-outline-primary" onClick={() => { setIsEditingSql(true); setSqlEditorValue(queryResult.sql ?? '') }}><i className="fas fa-edit me-1" />Edit SQL</button>
                      : <>
                          <button className="btn btn-sm btn-success" onClick={() => void executeCustomSql()}><i className="fas fa-play me-1" />Execute</button>
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsEditingSql(false)}><i className="fas fa-times me-1" />Cancel</button>
                        </>}
                  </div>
                </div>
                <div className="card-body p-0">
                  {isEditingSql
                    ? <textarea value={sqlEditorValue} onChange={e => setSqlEditorValue(e.target.value)} rows={6} className="form-control rounded-0 border-0" style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, color: '#212529', background: '#f8f9fa', resize: 'vertical' }} />
                    : <pre style={{ background: '#f8f9fa', margin: 0, padding: '14px 16px', fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, color: '#212529', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{queryResult.sql}</pre>}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {sortedData.length > 0 && columns.length > 0 ? (
            <>
              {/* Rows-per-page + info row */}
              <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <small className="text-muted">
                  Showing {startRow}–{endRow} of {sortedData.length} entries
                  {sortConfig.length > 0 && <span className="ms-2 text-primary" style={{ fontSize: 11 }}><i className="fas fa-sort me-1" />sorted</span>}
                </small>
                <div className="d-flex align-items-center gap-2">
                  <label className="text-muted mb-0" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Rows per page:</label>
                  <select className="form-select form-select-sm" style={{ width: 'auto', color: '#212529' }} value={rowsPerPage}
                    onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1) }}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={0}>All</option>
                  </select>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-striped table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      {columns.map(col => {
                        const sortEntry = sortConfig.find(s => s.col === col)
                        const multiIdx = sortConfig.length > 1 ? sortConfig.findIndex(s => s.col === col) : -1
                        return (
                          <th key={col}
                            onClick={e => handleHeaderClick(col, e.ctrlKey)}
                            style={{ background: '#2e86c1', color: '#fff', fontWeight: 600, border: 'none', textAlign: isNumericCol(col, rawData) ? 'right' : 'left', padding: '8px 12px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            {col}
                            {sortEntry
                              ? <i className={`fas fa-sort-${sortEntry.dir === 'asc' ? 'up' : 'down'} ms-1`} />
                              : <i className="fas fa-sort ms-1" style={{ opacity: 0.35 }} />}
                            {multiIdx >= 0 && <sup style={{ fontSize: 9, marginLeft: 1 }}>{multiIdx + 1}</sup>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((row, ri) => (
                      <tr key={ri}>{columns.map(col => <td key={col} style={{ color: '#212529', textAlign: isNumericCol(col, rawData) ? 'right' : 'left', verticalAlign: 'middle', padding: '8px 12px' }}>{fmtCell(row[col], col)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && rowsPerPage !== 0 && (
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
          ) : <div className="alert alert-info" style={{ color: '#212529' }}>No data found for your query.</div>}

          {/* Insights section */}
          <div className="mt-4" style={{ borderTop: '1px solid #e9ecef', paddingTop: 16 }}>
            <div className="d-flex justify-content-between align-items-center">
              <h6 style={{ color: '#0f172a', margin: 0, fontWeight: 600 }}>
                <i className="fas fa-lightbulb text-warning me-2" />AI Insights
                {insightsLoading && <span className="spinner-border spinner-border-sm text-warning ms-2" style={{ width: 14, height: 14 }} />}
              </h6>
              {!insightsText && !insightsLoading
                ? (
                  <button className="btn btn-outline-warning btn-sm" onClick={() => void fetchInsights()}>
                    <i className="fas fa-magic me-1" />Generate Insights
                  </button>
                )
                : (
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setInsightsExpanded(v => !v)}>
                    <i className={`fas fa-chevron-${insightsExpanded ? 'up' : 'down'} me-1`} />
                    {insightsExpanded ? 'Collapse' : 'Expand'}
                  </button>
                )}
            </div>
            {(insightsExpanded || insightsLoading) && (
              <div className="mt-3">
                {insightsLoading
                  ? (
                    <div className="d-flex align-items-center gap-2">
                      <div className="spinner-border spinner-border-sm text-warning" />
                      <span className="text-muted" style={{ fontSize: 14 }}>Generating insights…</span>
                    </div>
                  )
                  : insightsText
                    ? (
                      <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: 16, fontSize: 14, color: '#212529', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {insightsText}
                      </div>
                    )
                    : null}
              </div>
            )}
          </div>

          {/* Feedback row */}
          <div className="d-flex align-items-center gap-2 mt-3 flex-wrap" style={{ borderTop: '1px solid #e9ecef', paddingTop: 12 }}>
            <span className="text-muted" style={{ fontSize: 13 }}>Was this helpful?</span>
            {([
              { type: 'Helpful', icon: 'thumbs-up', baseCls: 'btn-outline-success', activeCls: 'btn-success' },
              { type: 'NeedsImprovement', icon: 'exclamation-triangle', baseCls: 'btn-outline-warning', activeCls: 'btn-warning' },
              { type: 'Incorrect', icon: 'thumbs-down', baseCls: 'btn-outline-danger', activeCls: 'btn-danger' },
            ] as const).map(fb => (
              <button key={fb.type}
                className={`btn btn-sm ${feedbackGiven === fb.type ? fb.activeCls : feedbackGiven ? 'btn-outline-secondary' : fb.baseCls}`}
                onClick={() => void submitFeedback(fb.type)}
                disabled={!!feedbackGiven}>
                <i className={`fas fa-${fb.icon} me-1`} />
                {fb.type === 'NeedsImprovement' ? 'Needs Improvement' : fb.type}
              </button>
            ))}
            {feedbackGiven && (
              <small className="text-muted ms-1">
                <i className="fas fa-check-circle text-success me-1" />Thank you for your feedback!
              </small>
            )}
          </div>
        </div>
      )}

      {/* ── Floating Process Details toggle button ─────────────────────────────── */}
      {processLogs.length > 0 && (
        <button
          onClick={() => setShowProcessPanel(v => !v)}
          title="Process Details"
          style={{
            position: 'fixed', bottom: 24, right: showProcessPanel ? 364 : 24, zIndex: 1040,
            width: 48, height: 48, borderRadius: '50%',
            background: '#2e86c1', color: '#fff', border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'right .3s',
          }}
        >
          <i className={`fas fa-${showProcessPanel ? 'times' : 'terminal'}`} />
        </button>
      )}

      {/* ── Process Details sliding side panel ─────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 340,
        background: 'rgba(15,23,42,.97)', borderLeft: '1px solid rgba(46,134,193,.3)',
        zIndex: 1035, transform: showProcessPanel ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .3s ease', display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,.4)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h6 style={{ color: '#e2e8f0', margin: 0, fontWeight: 600 }}>
            <i className="fas fa-terminal me-2 text-primary" />Process Details
          </h6>
          <button onClick={() => setShowProcessPanel(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: 0 }}>
            <i className="fas fa-times" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {processLogs.length === 0
            ? <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>No process logs available.</p>
            : processLogs.map((log, i) => (
                <div key={i} style={{ marginBottom: 14, paddingLeft: 12, borderLeft: '2px solid rgba(46,134,193,.4)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -6, top: 4, width: 10, height: 10, borderRadius: '50%', background: '#2e86c1' }} />
                  <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{log.step}</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginBottom: log.details ? 4 : 0 }}>{log.timestamp}</div>
                  {log.details && <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{log.details}</div>}
                </div>
              ))
          }
        </div>
      </div>

      {/* ── Chart Visualisation Modal ─────────────────────────────────────────── */}
      {showChartModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowChartModal(false) }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}>
                  <i className="fas fa-chart-bar me-2 text-primary" />Visualize Data
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowChartModal(false)} />
              </div>
              <div className="modal-body">
                {/* Chart type row */}
                <div className="row mb-3 g-3 align-items-end">
                  <div className="col-sm-3">
                    <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Chart Type</label>
                    <select className="form-select" value={chartType}
                      onChange={e => setChartType(e.target.value as ChartType)}
                      style={{ color: '#212529' }}>
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                      <option value="pie">Pie</option>
                      <option value="doughnut">Doughnut</option>
                      {hasCountryData && <option value="choropleth">Choropleth Map</option>}
                    </select>
                  </div>
                  {hasCountryData && chartType !== 'choropleth' && (
                    <div className="col-sm-9">
                      <div className="alert alert-info mb-0 py-2" style={{ fontSize: 12, color: '#212529' }}>
                        <i className="fas fa-globe me-1" />Country column detected ({countryColumns.join(', ')}). Switch to <strong>Choropleth Map</strong> for geographic visualization.
                      </div>
                    </div>
                  )}
                </div>

                {chartType === 'choropleth' ? (
                  /* Choropleth view: geographic data table */
                  <div>
                    <div className="alert alert-info mb-3" style={{ color: '#212529', fontSize: 13 }}>
                      <i className="fas fa-map me-2" />
                      <strong>Choropleth Map</strong> — Geographic visualization based on country data.
                      Select the country column and value column below to configure the map.
                    </div>
                    <div className="row g-3 mb-3">
                      <div className="col-sm-4">
                        <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Country Column</label>
                        <select className="form-select" value={chartXAxis} onChange={e => setChartXAxis(e.target.value)} style={{ color: '#212529' }}>
                          <option value="">Select column…</option>
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="col-sm-4">
                        <label className="form-label" style={{ color: '#212529', fontWeight: 500 }}>Value Column</label>
                        <select className="form-select" value={chartYAxis} onChange={e => setChartYAxis(e.target.value)} style={{ color: '#212529' }}>
                          <option value="">Select column…</option>
                          {columns.filter(c => isNumericCol(c, rawData)).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    {chartXAxis && chartYAxis && (
                      <div className="table-responsive" style={{ maxHeight: 380 }}>
                        <table className="table table-sm table-striped mb-0" style={{ fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={{ background: '#2e86c1', color: '#fff' }}><i className="fas fa-globe me-1" />{chartXAxis}</th>
                              <th style={{ background: '#2e86c1', color: '#fff', textAlign: 'right' }}>{chartYAxis}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...rawData]
                              .sort((a, b) => {
                                const av = a[chartYAxis]; const bv = b[chartYAxis]
                                return (typeof bv === 'number' ? bv : parseFloat(String(bv ?? '0')) || 0) - (typeof av === 'number' ? av : parseFloat(String(av ?? '0')) || 0)
                              })
                              .map((row, i) => (
                                <tr key={i}>
                                  <td style={{ color: '#212529' }}>{fmtCell(row[chartXAxis], chartXAxis)}</td>
                                  <td style={{ color: '#212529', textAlign: 'right' }}>{fmtCell(row[chartYAxis], chartYAxis)}</td>
                                </tr>
                              ))
                            }
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Standard chart with drag-and-drop field builder */
                  <div className="row g-3">
                    {/* Available fields panel */}
                    <div className="col-sm-3">
                      <label className="form-label" style={{ color: '#212529', fontWeight: 600, fontSize: 13 }}>
                        <i className="fas fa-list me-1 text-primary" />Available Fields
                      </label>
                      <div style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 10, background: '#f8f9fa', minHeight: 120 }}>
                        {columns.map(col => (
                          <div key={col}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('text/plain', col); setDraggedField(col) }}
                            onDragEnd={() => setDraggedField(null)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: isNumericCol(col, rawData) ? 'rgba(40,167,69,.12)' : 'rgba(46,134,193,.12)',
                              border: `1px solid ${isNumericCol(col, rawData) ? 'rgba(40,167,69,.3)' : 'rgba(46,134,193,.3)'}`,
                              borderRadius: 6, padding: '3px 8px', margin: '3px 2px',
                              fontSize: 12, color: '#212529', cursor: 'grab',
                              opacity: draggedField === col ? 0.5 : 1,
                            }}>
                            <i className={`fas fa-${isNumericCol(col, rawData) ? 'hashtag' : 'font'}`} style={{ fontSize: 10, opacity: 0.6 }} />
                            {col}
                          </div>
                        ))}
                        <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 8, marginBottom: 0 }}>Drag fields to zones →</p>
                      </div>
                    </div>

                    {/* Drop zones + chart */}
                    <div className="col-sm-9">
                      <div className="row g-2 mb-3">
                        <div className="col-sm-4">
                          <label className="form-label" style={{ color: '#212529', fontWeight: 500, fontSize: 13 }}>X Axis / Labels</label>
                          <div style={dropZoneStyle(!!chartXAxis)}
                            onDragOver={handleDragOver}
                            onDrop={handleFieldDrop('x')}>
                            {chartXAxis
                              ? <><span style={{ fontSize: 12, color: '#2e86c1', fontWeight: 600 }}>{chartXAxis}</span>
                                  <button onClick={() => setChartXAxis('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, marginLeft: 'auto', fontSize: 12 }}><i className="fas fa-times" /></button></>
                              : <span style={{ color: '#94a3b8', fontSize: 12 }}>Drop field here</span>}
                          </div>
                        </div>
                        <div className="col-sm-4">
                          <label className="form-label" style={{ color: '#212529', fontWeight: 500, fontSize: 13 }}>Y Axis / Values</label>
                          <div style={dropZoneStyle(!!chartYAxis)}
                            onDragOver={handleDragOver}
                            onDrop={handleFieldDrop('y')}>
                            {chartYAxis
                              ? <><span style={{ fontSize: 12, color: '#28a745', fontWeight: 600 }}>{chartYAxis}</span>
                                  <button onClick={() => setChartYAxis('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, marginLeft: 'auto', fontSize: 12 }}><i className="fas fa-times" /></button></>
                              : <span style={{ color: '#94a3b8', fontSize: 12 }}>Drop field here</span>}
                          </div>
                        </div>
                        <div className="col-sm-4">
                          <label className="form-label" style={{ color: '#212529', fontWeight: 500, fontSize: 13 }}>Group By (optional)</label>
                          <div style={dropZoneStyle(!!chartGroupBy)}
                            onDragOver={handleDragOver}
                            onDrop={handleFieldDrop('group')}>
                            {chartGroupBy
                              ? <><span style={{ fontSize: 12, color: '#e83e8c', fontWeight: 600 }}>{chartGroupBy}</span>
                                  <button onClick={() => setChartGroupBy('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, marginLeft: 'auto', fontSize: 12 }}><i className="fas fa-times" /></button></>
                              : <span style={{ color: '#94a3b8', fontSize: 12 }}>Drop field here</span>}
                          </div>
                        </div>
                      </div>
                      {/* fallback selects for non-drag users */}
                      <div className="row g-2 mb-3">
                        <div className="col-sm-4">
                          <select className="form-select form-select-sm" value={chartXAxis} onChange={e => setChartXAxis(e.target.value)} style={{ color: '#212529' }}>
                            <option value="">X Axis…</option>
                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="col-sm-4">
                          <select className="form-select form-select-sm" value={chartYAxis} onChange={e => setChartYAxis(e.target.value)} style={{ color: '#212529' }}>
                            <option value="">Y Axis…</option>
                            {columns.filter(c => isNumericCol(c, rawData)).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="col-sm-4">
                          <select className="form-select form-select-sm" value={chartGroupBy} onChange={e => setChartGroupBy(e.target.value)} style={{ color: '#212529' }}>
                            <option value="">Group By…</option>
                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      {(!chartXAxis || !chartYAxis)
                        ? <div className="alert alert-info" style={{ color: '#212529' }}>Select or drag X and Y axis columns to render the chart.</div>
                        : (
                          <div style={{ position: 'relative', height: 380 }}>
                            <canvas ref={chartCanvasRef} />
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowChartModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Query Modal ──────────────────────────────────────────────────── */}
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
                  <input type="checkbox" className="form-check-input" id="saveSqlCheckBuilder" checked={saveForm.saveSQL} onChange={e => setSaveForm(f => ({ ...f, saveSQL: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="saveSqlCheckBuilder" style={{ color: '#212529', fontWeight: 500 }}>Save exact SQL (recommended)</label>
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

      {/* ── Saved Queries Modal ───────────────────────────────────────────────── */}
      {showSavedModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowSavedModal(false) }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}>
                  <i className="fas fa-bookmark me-2" />
                  {savedFilter === 'favorites' ? 'Favorite Queries' : 'Saved Queries'}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowSavedModal(false)} />
              </div>
              <div className="modal-body">
                <div className="btn-group mb-3">
                  <button type="button" className={`btn btn-outline-primary ${savedFilter === 'all' ? 'active' : ''}`} onClick={() => void loadSavedQueries('all')}>All Queries</button>
                  <button type="button" className={`btn btn-outline-primary ${savedFilter === 'favorites' ? 'active' : ''}`} onClick={() => void loadSavedQueries('favorites')}>
                    <i className="fas fa-star me-1" />Favorites
                  </button>
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
                                    {q.isFavorite && <i className="fas fa-star text-warning me-1" style={{ fontSize: 12 }} />}
                                    {q.name}
                                  </h6>
                                  {q.category && <span className="badge bg-primary me-2" style={{ fontSize: 11 }}>{q.category}</span>}
                                  {q.description && <p className="text-muted mb-1" style={{ fontSize: 13 }}>{q.description}</p>}
                                  <p className="text-muted mb-0" style={{ fontSize: 12 }}>{q.naturalLanguageQuery}</p>
                                </div>
                                <div className="d-flex gap-1 flex-shrink-0">
                                  <button className="btn btn-sm btn-outline-primary" title="Run" onClick={() => void executeSavedQuery(q)}>
                                    <i className="fas fa-play" />
                                  </button>
                                  <button className={`btn btn-sm ${q.isFavorite ? 'btn-warning' : 'btn-outline-warning'}`} title={q.isFavorite ? 'Unfavorite' : 'Favorite'} onClick={() => void toggleFavorite(q)}>
                                    <i className="fas fa-star" />
                                  </button>
                                  <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => void deleteQuery(q)}>
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

      {/* ── Query History Modal ───────────────────────────────────────────────── */}
      {showHistoryModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowHistoryModal(false) }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#212529', fontWeight: 600 }}>
                  <i className="fas fa-history me-2" />Query History
                  <span className="badge bg-secondary ms-2" style={{ fontSize: 11 }}>{queryHistory.length}</span>
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowHistoryModal(false)} />
              </div>
              <div className="modal-body">
                {queryHistory.length === 0
                  ? <p className="text-muted text-center py-4">No query history yet. Run a query to see it here.</p>
                  : (
                    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                      {queryHistory.map((entry, i) => (
                        <div key={entry.id} className="card mb-2">
                          <div className="card-body py-2 px-3">
                            <div className="d-flex justify-content-between align-items-start gap-2">
                              <div style={{ flex: 1 }}>
                                <div className="d-flex align-items-center gap-2 mb-1">
                                  <span style={{ background: '#e9ecef', color: '#6c757d', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>#{queryHistory.length - i}</span>
                                  <span style={{ color: '#6c757d', fontSize: 11 }}>{entry.timestamp.toLocaleString()}</span>
                                  {entry.rowCount > 0 && <span className="badge bg-primary" style={{ fontSize: 10 }}>{entry.rowCount} rows</span>}
                                </div>
                                <p className="mb-1" style={{ color: '#212529', fontSize: 14, fontWeight: 500 }}>{entry.query}</p>
                                {entry.sql && (
                                  <details>
                                    <summary style={{ color: '#6c757d', fontSize: 12, cursor: 'pointer' }}>View SQL</summary>
                                    <pre style={{ background: '#f8f9fa', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#212529', marginTop: 4, marginBottom: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{entry.sql}</pre>
                                  </details>
                                )}
                              </div>
                              <div className="d-flex gap-1 flex-shrink-0">
                                <button className="btn btn-sm btn-outline-primary" title="Re-run" onClick={() => void runHistoryEntry(entry)}>
                                  <i className="fas fa-play" />
                                </button>
                                <button className="btn btn-sm btn-outline-success" title="Save this query" onClick={() => { setShowHistoryModal(false); lastQueryRef.current = entry.query; setShowSaveModal(true) }}>
                                  <i className="fas fa-bookmark" />
                                </button>
                                <button className="btn btn-sm btn-outline-danger" title="Remove from history" onClick={() => setQueryHistory(prev => prev.filter(e => e.id !== entry.id))}>
                                  <i className="fas fa-trash" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
              <div className="modal-footer">
                {queryHistory.length > 0 && (
                  <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => { if (window.confirm('Clear all query history?')) setQueryHistory([]) }}>
                    <i className="fas fa-trash me-1" />Clear All History
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
