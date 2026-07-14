import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import SelectBox from 'devextreme-react/select-box'
import TagBox from 'devextreme-react/tag-box'
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
} from 'd3-force'
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'
import apiClient from '../../services/apiClient'

/* ── Types ──────────────────────────────────────────────── */
interface FilterOption { value: string | number; text: string }

interface MapNode {
  id: string
  title: string
  status: string
  statusClass: 'success' | 'warning' | 'error' | ''
  icon: string
  transactionCount: number
  errorCount: number
  errorRate: number
}

interface MapConnection {
  from: string
  to: string
  transactionCount: number
  successRate: number
  errorCount: number
  avgExecutionTimeMs: number
  documentTypes?: string[]
}

interface FlowData {
  nodes: MapNode[]
  connections: MapConnection[]
  warningPct?: number
  criticalPct?: number
}

interface NodePos { x: number; y: number }
interface PosMap  { [id: string]: NodePos }

interface BusinessSegment    { businessSegmentId: number;    segmentName: string }
interface BusinessProcess    { businessProcessId: number;    processName: string }
interface BusinessSubprocess { businessSubprocessId: number; subprocessName: string }
interface SystemOption       { systemName: string }

interface FilterState {
  vizMode: string
  timeWindow: number
  segmentIds: number[]
  processIds: number[]
  subprocessIds: number[]
  sourceSystems: string[]
  targetSystems: string[]
}

interface CanvasState {
  zoom: number
  pan: { x: number; y: number }
  positions: PosMap
}

interface SavedLayout {
  layoutId: number
  layoutName: string
  isDefault: boolean
  filterState: FilterState
  canvasState: CanvasState
}

interface ConnTransaction {
  transactionId: string
  executedAt: string
  status: string
  executionTimeMs: number
  documentType?: string
  errorMessage?: string
}

interface ConnPerfPoint {
  date: string
  successRate: number
  avgExecutionTimeMs: number
  transactionCount: number
}

interface IntegrationBreakdownRow {
  integrationName: string
  transactionCount: number
  successRate: number
  errorCount: number
  avgExecutionTimeMs: number
  documentType?: string
}

interface HourlyPatternPoint {
  hour: string
  transactionCount: number
  errorCount: number
}

interface ErrorAnalysisRow {
  errorMessage: string
  count: number
  lastOccurred: string
  percentage: number
}

interface ConnectionDetailFull {
  transactions: ConnTransaction[]
  performance: ConnPerfPoint[]
  integrationBreakdown?: IntegrationBreakdownRow[]
  hourlyPattern?: HourlyPatternPoint[]
  errorAnalysis?: ErrorAnalysisRow[]
}

interface PersistedFilters {
  vizMode?: string
  timeWindow?: number
  segmentIds?: number[]
  processIds?: number[]
  subprocessIds?: number[]
  sourceSystems?: string[]
  targetSystems?: string[]
  refreshInterval?: number
}

interface LoadMapOpts {
  preservePositions?: boolean
  filterOverride?: FilterState
  savedCanvasState?: CanvasState
}

/* ── Constants ──────────────────────────────────────────── */
const TIME_OPTS: FilterOption[] = [
  { value: 1440,   text: 'Last 24 Hours' },
  { value: 10080,  text: 'Last 7 Days'   },
  { value: 43200,  text: 'Last 30 Days'  },
  { value: 131400, text: 'Last 3 Months' },
]
const VIZ_OPTS: FilterOption[] = [
  { value: 'System',  text: 'System to System'   },
  { value: 'Process', text: 'Process to Process' },
]
const REFRESH_OPTS: FilterOption[] = [
  { value: 0,    text: 'Off'    },
  { value: 60,   text: '1 min'  },
  { value: 300,  text: '5 min'  },
  { value: 600,  text: '10 min' },
  { value: 1800, text: '30 min' },
]
const NODE_R     = 30
const SVG_W      = 1200
const SVG_H      = 680
const SESSION_KEY = 'integrationMapFilters'

/* ── Helpers ─────────────────────────────────────────────── */
function nodeColor(sc: string): string {
  if (sc === 'success') return '#2ECC71'
  if (sc === 'warning') return '#F39C12'
  if (sc === 'error')   return '#E74C3C'
  return '#3498DB'
}

function connColor(sr: number, warnPct = 5, critPct = 10): string {
  const er = 100 - sr
  if (er >= critPct) return '#E74C3C'
  if (er >= warnPct) return '#F39C12'
  return '#2ECC71'
}

function arrowType(color: string): string {
  if (color === '#2ECC71') return 'success'
  if (color === '#F39C12') return 'warning'
  if (color === '#E74C3C') return 'error'
  return 'default'
}

function strokeW(count: number, all: number[]): number {
  const min = 1.5, max = 10
  if (!count || count <= 0) return min
  const pos = all.filter(c => c > 0)
  if (!pos.length) return min
  const lo = Math.min(...pos), hi = Math.max(...pos)
  if (lo === hi) return (min + max) / 2
  const norm = (Math.log10(count + 1) - Math.log10(lo + 1)) / (Math.log10(hi + 1) - Math.log10(lo + 1))
  return min + norm * (max - min)
}

function readSession(): PersistedFilters {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as PersistedFilters) : {}
  } catch { return {} }
}

/** Force-directed layout using D3 (run synchronously off-screen) */
type FNode = SimulationNodeDatum & { id: string }

function forceLayout(nodes: MapNode[], connections: MapConnection[], w: number, h: number): PosMap {
  const m: PosMap = {}
  if (!nodes.length) return m
  if (nodes.length === 1) { m[nodes[0].id] = { x: w / 2, y: h / 2 }; return m }

  const fnodes: FNode[] = nodes.map(n => ({
    id: n.id,
    x: w / 2 + (Math.random() - 0.5) * 120,
    y: h / 2 + (Math.random() - 0.5) * 120,
  }))
  const flinks = connections
    .filter(c => nodes.some(n => n.id === c.from) && nodes.some(n => n.id === c.to))
    .map(c => ({ source: c.from, target: c.to })) as Array<SimulationLinkDatum<FNode>>

  const sim = forceSimulation<FNode>(fnodes)
    .force('link',    forceLink<FNode, SimulationLinkDatum<FNode>>(flinks).id(d => d.id).distance(160).strength(0.5))
    .force('charge',  forceManyBody<FNode>().strength(-450))
    .force('center',  forceCenter<FNode>(w / 2, h / 2))
    .force('collide', forceCollide<FNode>(NODE_R + 20))
    .stop()

  const ticks = Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()))
  for (let i = 0; i < ticks; i++) sim.tick()

  fnodes.forEach(n => { m[n.id] = { x: n.x ?? w / 2, y: n.y ?? h / 2 } })
  return m
}

/* ══════════════════════════════════════════════════════════ */
export default function IntegrationMapPage() {
  /* ── Session restore (lazy, single read) ─────────────────── */
  const _sRef = useRef<PersistedFilters | null>(null)
  if (!_sRef.current) _sRef.current = readSession()
  const _s = _sRef.current

  /* ── Filter state (initialised from session) ─────────────── */
  const [vizMode,        setVizMode]        = useState<string>(_s.vizMode ?? 'System')
  const [timeWindow,     setTimeWindow]     = useState<number>(_s.timeWindow ?? 1440)
  const [segmentIds,     setSegmentIds]     = useState<number[]>(_s.segmentIds ?? [])
  const [processIds,     setProcessIds]     = useState<number[]>(_s.processIds ?? [])
  const [subprocessIds,  setSubprocessIds]  = useState<number[]>(_s.subprocessIds ?? [])
  const [sourceSystems,  setSourceSystems]  = useState<string[]>(_s.sourceSystems ?? [])
  const [targetSystems,  setTargetSystems]  = useState<string[]>(_s.targetSystems ?? [])
  const [refreshInterval,setRefreshInterval]= useState<number>(_s.refreshInterval ?? 0)

  /* ── UI state ─────────────────────────────────────────────── */
  const [sidebarOpen,  setSidebarOpen]  = useState(true)
  const [flowData,     setFlowData]     = useState<FlowData | null>(null)
  const [isLoading,    setIsLoading]    = useState(false)
  const [positions,    setPositions]    = useState<PosMap>({})
  const [zoom,         setZoom]         = useState(1)
  const [pan,          setPan]          = useState({ x: 0, y: 0 })
  const [isPanning,    setIsPanning]    = useState(false)
  const [tooltip,      setTooltip]      = useState<{ x: number; y: number; node?: ReactNode } | null>(null)
  const [selNode,      setSelNode]      = useState<MapNode | null>(null)
  const [selConn,      setSelConn]      = useState<MapConnection | null>(null)
  const [connTab,      setConnTab]      = useState<'overview' | 'breakdown' | 'hourly' | 'errors' | 'transactions' | 'performance'>('overview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [lastUpdatedAt,setLastUpdatedAt]= useState<number | null>(null)
  const [secondsAgo,   setSecondsAgo]   = useState(0)

  /* ── Layout state ─────────────────────────────────────────── */
  const [appliedLayoutId,   setAppliedLayoutId]   = useState<number | null>(null)
  const [showLayoutDropdown,setShowLayoutDropdown] = useState(false)
  const [showSaveAsModal,   setShowSaveAsModal]   = useState(false)
  const [newLayoutName,       setNewLayoutName]       = useState('')
  const [newLayoutIsDefault,  setNewLayoutIsDefault]  = useState(false)
  const [renameLayoutId,    setRenameLayoutId]    = useState<number | null>(null)
  const [renameValue,       setRenameValue]       = useState('')

  /* ── Refs ─────────────────────────────────────────────────── */
  const panDragRef      = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const dragNodeRef     = useRef<{ id: string; startMx: number; startMy: number; origX: number; origY: number } | null>(null)
  const svgRef          = useRef<SVGSVGElement>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const loadMapRef      = useRef<((opts?: LoadMapOpts) => Promise<void>) | null>(null)
  const layoutDropRef   = useRef<HTMLDivElement>(null)

  /* ── Query client ─────────────────────────────────────────── */
  const qc = useQueryClient()

  /* ── Filter data ─────────────────────────────────────────── */
  const { data: segments = [] } = useQuery({
    queryKey: ['imap-seg'],
    queryFn:  () => apiClient.get<BusinessSegment[]>('/IntegrationMap/GetBusinessSegments').then(r => r.data),
    staleTime: 300_000,
  })
  const { data: processes = [] } = useQuery({
    queryKey: ['imap-proc'],
    queryFn:  () => apiClient.get<BusinessProcess[]>('/IntegrationMap/GetBusinessProcesses').then(r => r.data),
    staleTime: 300_000,
  })
  const { data: subprocs = [] } = useQuery({
    queryKey: ['imap-sub', processIds],
    queryFn:  () => {
      const p = new URLSearchParams()
      processIds.forEach(id => p.append('businessProcessId', String(id)))
      return apiClient.get<BusinessSubprocess[]>(`/IntegrationMap/GetBusinessSubprocesses?${p}`).then(r => r.data)
    },
    staleTime: 60_000,
  })
  const { data: srcSys = [] } = useQuery({
    queryKey: ['imap-src'],
    queryFn:  () => apiClient.get<SystemOption[]>('/IntegrationMap/GetSourceSystems').then(r => r.data),
    staleTime: 300_000,
  })
  const { data: tgtSys = [] } = useQuery({
    queryKey: ['imap-tgt'],
    queryFn:  () => apiClient.get<SystemOption[]>('/IntegrationMap/GetTargetSystems').then(r => r.data),
    staleTime: 300_000,
  })

  /* ── Layouts query ────────────────────────────────────────── */
  const { data: layouts = [] } = useQuery({
    queryKey: ['imap-layouts'],
    queryFn:  () => apiClient.get<SavedLayout[]>('/IntegrationMap/GetTemplates').then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 60_000,
  })

  /* ── Connection detail query ──────────────────────────────── */
  const { data: connDetail, isLoading: connDetailLoading } = useQuery({
    queryKey: ['imap-conn', selConn?.from, selConn?.to, timeWindow, vizMode, segmentIds, processIds, subprocessIds],
    queryFn:  () => {
      const p = new URLSearchParams({
        source: selConn!.from,
        target: selConn!.to,
        timeWindowMinutes: String(timeWindow),
        visualizationMode: vizMode,
      })
      segmentIds.forEach(id => p.append('businessSegmentId[]', String(id)))
      processIds.forEach(id => p.append('businessProcessId[]', String(id)))
      subprocessIds.forEach(id => p.append('businessSubprocessId[]', String(id)))
      return apiClient.get<ConnectionDetailFull>(`/IntegrationMap/GetConnectionDetails?${p}`).then(r => r.data)
    },
    enabled:   !!selConn,
    staleTime: 60_000,
  })

  /* ── Layout mutations ─────────────────────────────────────── */
  const saveLayoutMut = useMutation({
    mutationFn: (data: { layoutName: string; isDefault: boolean; filterState: FilterState; canvasState: CanvasState }) =>
      apiClient.post<SavedLayout>('/IntegrationMap/SaveTemplate', data).then(r => r.data),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['imap-layouts'] }) },
  })
  const updateLayoutMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number; filterState: FilterState; canvasState: CanvasState }) =>
      apiClient.post('/IntegrationMap/UpdateTemplate', { id, ...data }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['imap-layouts'] }) },
  })
  const renameLayoutMut = useMutation({
    mutationFn: ({ id, layoutName }: { id: number; layoutName: string }) =>
      apiClient.post('/IntegrationMap/UpdateTemplate', { id, layoutName }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['imap-layouts'] }) },
  })
  const deleteLayoutMut = useMutation({
    mutationFn: (id: number) => apiClient.post('/IntegrationMap/DeleteTemplate', { id }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['imap-layouts'] }) },
  })
  const setDefaultMut = useMutation({
    mutationFn: (id: number) => apiClient.post('/IntegrationMap/SetDefaultTemplate', { id }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['imap-layouts'] }) },
  })

  /* ── fitCanvas ────────────────────────────────────────────── */
  const fitCanvas = useCallback(() => {
    const nodes = flowData?.nodes ?? []
    if (!nodes.length) return
    const xs = nodes.map(n => positions[n.id]?.x ?? SVG_W / 2)
    const ys = nodes.map(n => positions[n.id]?.y ?? SVG_H / 2)
    const x0 = Math.min(...xs) - NODE_R - 40, x1 = Math.max(...xs) + NODE_R + 40
    const y0 = Math.min(...ys) - NODE_R - 40, y1 = Math.max(...ys) + NODE_R + 40
    const bw = x1 - x0, bh = y1 - y0
    const el = svgRef.current
    const vw = el?.clientWidth ?? SVG_W, vh = el?.clientHeight ?? SVG_H
    const s  = Math.min(vw / bw, vh / bh, 1.5)
    setZoom(s); setPan({ x: (vw - bw * s) / 2 - x0 * s, y: (vh - bh * s) / 2 - y0 * s })
  }, [flowData, positions])

  /* ── clearFilters ─────────────────────────────────────────── */
  const clearFilters = useCallback(() => {
    setVizMode('System'); setTimeWindow(1440)
    setSegmentIds([]); setProcessIds([]); setSubprocessIds([])
    setSourceSystems([]); setTargetSystems([])
  }, [])

  /* ── loadMap ──────────────────────────────────────────────── */
  const loadMap = useCallback(async (opts?: LoadMapOpts) => {
    setIsLoading(true)
    setTooltip(null)
    try {
      const fo  = opts?.filterOverride
      const fVm = fo?.vizMode       ?? vizMode
      const fTw = fo?.timeWindow    ?? timeWindow
      const fSg = fo?.segmentIds    ?? segmentIds
      const fPr = fo?.processIds    ?? processIds
      const fSp = fo?.subprocessIds ?? subprocessIds
      const fSs = fo?.sourceSystems ?? sourceSystems
      const fTs = fo?.targetSystems ?? targetSystems

      const p = new URLSearchParams({ timeWindowMinutes: String(fTw), visualizationMode: fVm })
      fSg.forEach(id => p.append('businessSegmentId',    String(id)))
      fPr.forEach(id => p.append('businessProcessId',    String(id)))
      fSp.forEach(id => p.append('businessSubprocessId', String(id)))
      fSs.forEach(s  => p.append('sourceSystem', s))
      fTs.forEach(s  => p.append('targetSystem', s))

      const res = await apiClient.get<FlowData>(`/IntegrationMap/GetSystemFlows?${p}`)
      const d   = res.data

      setFlowData(d)

      if (opts?.savedCanvasState) {
        const { zoom: sz, pan: sp, positions: spos } = opts.savedCanvasState
        const fresh = forceLayout(d.nodes ?? [], d.connections ?? [], SVG_W, SVG_H)
        setPositions({ ...fresh, ...spos })
        setZoom(sz)
        setPan(sp)
      } else if (opts?.preservePositions) {
        setPositions(prev => {
          const fresh = forceLayout(d.nodes ?? [], d.connections ?? [], SVG_W, SVG_H)
          // Overlay existing pinned positions on top of fresh layout
          return { ...fresh, ...prev }
        })
        // Keep current zoom/pan
      } else {
        setPositions(forceLayout(d.nodes ?? [], d.connections ?? [], SVG_W, SVG_H))
        setZoom(1); setPan({ x: 0, y: 0 })
      }

      setLastUpdatedAt(Date.now())
    } catch { /* keep existing data */ }
    finally { setIsLoading(false) }
  }, [timeWindow, vizMode, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems])

  /* ── applyLayout ─────────────────────────────────────────── */
  const applyLayout = useCallback(async (layout: SavedLayout) => {
    const { filterState: fs, canvasState: cs } = layout
    setVizMode(fs.vizMode)
    setTimeWindow(fs.timeWindow)
    setSegmentIds(fs.segmentIds)
    setProcessIds(fs.processIds)
    setSubprocessIds(fs.subprocessIds)
    setSourceSystems(fs.sourceSystems)
    setTargetSystems(fs.targetSystems)
    setAppliedLayoutId(layout.layoutId)
    setShowLayoutDropdown(false)
    await loadMap({ filterOverride: fs, savedCanvasState: cs })
  }, [loadMap])

  /* ── exportToPdf (server-side) ───────────────────────────── */
  const exportToPdf = useCallback(async () => {
    const el = svgRef.current
    if (!el) return
    try {
      const svgStr    = new XMLSerializer().serializeToString(el)
      const svgBase64 = btoa(unescape(encodeURIComponent(svgStr)))
      const res = await apiClient.post(
        '/IntegrationMap/ExportToPdf',
        { svgContent: svgBase64, fileName: 'integration-map.pdf', filters: { vizMode, timeWindow, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems } },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href = url; a.download = 'integration-map.pdf'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error('PDF export failed', err) }
  }, [vizMode, timeWindow, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems])

  /* ── exportConnDetailsToPdf ──────────────────────────────── */
  const exportConnDetailsToPdf = useCallback(async () => {
    if (!selConn) return
    try {
      const payload = {
        source: selConn.from, target: selConn.to,
        transactionCount: selConn.transactionCount, successRate: selConn.successRate,
        errorCount: selConn.errorCount, avgExecutionTimeMs: selConn.avgExecutionTimeMs,
        integrationBreakdown: connDetail?.integrationBreakdown ?? [],
        hourlyPattern:        connDetail?.hourlyPattern ?? [],
        errorAnalysis:        connDetail?.errorAnalysis ?? [],
      }
      const res = await apiClient.post('/IntegrationMap/ExportConnectionDetailsToPdf', payload, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href = url; a.download = `connection-${selConn.from}-${selConn.to}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error('Connection PDF export failed', err) }
  }, [selConn, connDetail])

  /* ── toggleFullscreen ────────────────────────────────────── */
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }, [])

  /* ── Pan / zoom / drag handlers ──────────────────────────── */
  const onMD = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('.fn')) return
    setIsPanning(true)
    panDragRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMM = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragNodeRef.current) {
      const dr = dragNodeRef.current
      const dx = e.clientX - dr.startMx
      const dy = e.clientY - dr.startMy
      setPositions(prev => ({
        ...prev,
        [dr.id]: { x: dr.origX + dx / zoom, y: dr.origY + dy / zoom },
      }))
      return
    }
    if (!isPanning) return
    setPan({ x: panDragRef.current.px + e.clientX - panDragRef.current.mx, y: panDragRef.current.py + e.clientY - panDragRef.current.my })
  }, [isPanning, zoom])

  const onMU = useCallback(() => {
    dragNodeRef.current = null
    setIsPanning(false)
  }, [])

  const onWh = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    setZoom(z => Math.max(.3, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 0.9))))
  }, [])

  /* ── Effects ─────────────────────────────────────────────── */

  // Keep loadMapRef in sync with latest closure
  useEffect(() => { loadMapRef.current = loadMap }, [loadMap])

  // Persist filter state to sessionStorage on any filter change
  useEffect(() => {
    const state: PersistedFilters = {
      vizMode, timeWindow, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems, refreshInterval,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  }, [vizMode, timeWindow, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems, refreshInterval])

  // Initial load on mount
  useEffect(() => { void loadMap() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh loop (chained setTimeout, pauses on tab hidden)
  useEffect(() => {
    if (!refreshInterval) return
    let active = true
    let timerId: ReturnType<typeof setTimeout>

    const schedule = () => {
      timerId = setTimeout(async () => {
        if (!document.hidden && active) {
          await loadMapRef.current?.({ preservePositions: true })
        }
        if (active) schedule()
      }, refreshInterval * 1000)
    }
    schedule()

    const onVis = () => {
      if (!document.hidden && active) { clearTimeout(timerId); schedule() }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      clearTimeout(timerId)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refreshInterval])

  // 'Last updated X ago' ticker
  useEffect(() => {
    if (!lastUpdatedAt) return
    setSecondsAgo(0)
    const id = setInterval(() => setSecondsAgo(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [lastUpdatedAt])

  // Fullscreen change
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement
      setIsFullscreen(fs)
      if (fs) setTimeout(() => fitCanvas(), 150)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [fitCanvas])

  // Close layout dropdown on outside click
  useEffect(() => {
    if (!showLayoutDropdown) return
    const handler = (e: MouseEvent) => {
      if (!layoutDropRef.current?.contains(e.target as Node)) setShowLayoutDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLayoutDropdown])

  // Reset connection tab when selection changes
  useEffect(() => { setConnTab('overview') }, [selConn])

  /* ── Derived ──────────────────────────────────────────────── */
  const allCounts = (flowData?.connections ?? []).map(c => c.transactionCount ?? 0)
  const warnPct   = flowData?.warningPct  ?? 5
  const critPct   = flowData?.criticalPct ?? 10

  const appliedLayout = Array.isArray(layouts) ? layouts.find(l => l.layoutId === appliedLayoutId) : undefined

  const fmtAgo = (s: number) => {
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    return `${Math.floor(s / 3600)}h ago`
  }

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <>
      {/* Fullscreen :fullscreen CSS rules */}
      <style>{`
        .imap-canvas:fullscreen { background: #0F172A !important; }
        .imap-canvas:-webkit-full-screen { background: #0F172A !important; }
      `}</style>

      <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div style={{
          width: 300, minWidth: 300,
          background: 'linear-gradient(180deg,#0F172A,#1E293B,#0F172A)',
          padding: 20, overflowY: 'auto', borderRight: '2px solid rgba(46,134,193,.25)',
          transition: 'all .4s ease', flexShrink: 0, boxShadow: '4px 0 30px rgba(0,0,0,.5)',
          ...(sidebarOpen ? {} : { marginLeft: -300 }),
        }}>
          <div className="d-flex justify-content-between align-items-center mb-3 pb-3" style={{ borderBottom: '2px solid rgba(46,134,193,.4)' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: .5 }}>
              <i className="fas fa-filter me-2" />Filters
            </span>
            <button onClick={() => setSidebarOpen(false)}
              style={{ background: '#2e86c1', border: '1px solid #2e86c1', color: '#fff', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fas fa-chevron-left" style={{ fontSize: 11 }} />
            </button>
          </div>

          <FG label="Visualization Mode">
            <SelectBox dataSource={VIZ_OPTS} displayExpr="text" valueExpr="value" value={vizMode}
              onValueChanged={e => setVizMode(String(e.value ?? 'System'))} />
          </FG>
          <FG label={<><i className="fas fa-clock me-1" />Time Range</>}>
            <SelectBox dataSource={TIME_OPTS} displayExpr="text" valueExpr="value" value={timeWindow}
              onValueChanged={e => setTimeWindow(Number(e.value ?? 1440))} />
          </FG>
          <FG label="Business Segment">
            <TagBox dataSource={segments} displayExpr="segmentName" valueExpr="businessSegmentId"
              value={segmentIds} onValueChanged={e => setSegmentIds(e.value ?? [])}
              placeholder="All Segments" showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled />
          </FG>
          <FG label="Business Process">
            <TagBox dataSource={processes} displayExpr="processName" valueExpr="businessProcessId"
              value={processIds} onValueChanged={e => setProcessIds(e.value ?? [])}
              placeholder="All Processes" showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled />
          </FG>
          <FG label="Business Subprocess">
            <TagBox dataSource={subprocs} displayExpr="subprocessName" valueExpr="businessSubprocessId"
              value={subprocessIds} onValueChanged={e => setSubprocessIds(e.value ?? [])}
              placeholder="All Subprocesses" showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled />
          </FG>
          <FG label="Source System">
            <TagBox dataSource={srcSys} displayExpr="systemName" valueExpr="systemName"
              value={sourceSystems} onValueChanged={e => setSourceSystems(e.value ?? [])}
              placeholder="All Source Systems" showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled />
          </FG>
          <FG label="Target System">
            <TagBox dataSource={tgtSys} displayExpr="systemName" valueExpr="systemName"
              value={targetSystems} onValueChanged={e => setTargetSystems(e.value ?? [])}
              placeholder="All Target Systems" showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled />
          </FG>

          <div className="d-flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <button className="btn btn-primary btn-sm flex-fill" onClick={() => void loadMap()}>
              <i className="bi bi-funnel-fill me-1" />Apply
            </button>
            <button className="btn btn-secondary btn-sm flex-fill" onClick={clearFilters}>
              <i className="bi bi-x-circle me-1" />Clear
            </button>
          </div>
        </div>

        {/* ── Main content ────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16 }}>

          {/* Header */}
          <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)}
                  style={{ background: '#2e86c1', border: '1px solid #2e86c1', color: '#fff', width: 38, height: 38, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-filter" />
                </button>
              )}
              <div>
                <h2 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
                  <i className="bi bi-diagram-3-fill me-2" />Integration Map
                </h2>
                <p style={{ color: '#BDC3C7', fontSize: 13, margin: 0 }}>
                  {VIZ_OPTS.find(o => o.value === vizMode)?.text} · {TIME_OPTS.find(o => o.value === timeWindow)?.text}
                  {flowData && ` · ${flowData.nodes?.length ?? 0} nodes, ${flowData.connections?.length ?? 0} connections`}
                  {appliedLayout && <span style={{ color: '#5DADE2' }}> · {appliedLayout.layoutName}</span>}
                </p>
              </div>
            </div>

            {/* Toolbar right */}
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Last updated ticker */}
              {lastUpdatedAt !== null && refreshInterval > 0 && (
                <span style={{ color: '#94A3B8', fontSize: 12, whiteSpace: 'nowrap' }}>
                  <i className="fas fa-clock me-1" style={{ opacity: .6 }} />
                  Updated {fmtAgo(secondsAgo)}
                </span>
              )}

              {/* Auto-refresh interval */}
              <div style={{ width: 110 }}>
                <SelectBox
                  dataSource={REFRESH_OPTS}
                  displayExpr="text"
                  valueExpr="value"
                  value={refreshInterval}
                  placeholder="Refresh"
                  onValueChanged={e => setRefreshInterval(Number(e.value ?? 0))}
                />
              </div>

              {/* Layouts dropdown */}
              <div style={{ position: 'relative' }} ref={layoutDropRef}>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowLayoutDropdown(v => !v)}
                  style={{ borderColor: 'rgba(46,134,193,.4)', color: '#BDC3C7' }}>
                  <i className="fas fa-layer-group me-1" />Layouts
                  <i className="fas fa-chevron-down ms-1" style={{ fontSize: 10 }} />
                </button>
                {showLayoutDropdown && (
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 1000, minWidth: 280,
                    background: 'rgba(15,23,42,.97)', border: '1px solid rgba(46,134,193,.3)',
                    borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,.5)', padding: 8,
                  }}>
                    {layouts.length === 0 ? (
                      <div style={{ color: '#94A3B8', fontSize: 12, padding: '8px 10px' }}>No saved layouts</div>
                    ) : layouts.map(lyt => (
                      <div key={lyt.layoutId} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 5, background: lyt.layoutId === appliedLayoutId ? 'rgba(46,134,193,.15)' : 'transparent' }}>
                        {renameLayoutId === lyt.layoutId ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && renameValue.trim()) {
                                void renameLayoutMut.mutateAsync({ id: lyt.layoutId, layoutName: renameValue.trim() })
                                setRenameLayoutId(null)
                              }
                              if (e.key === 'Escape') setRenameLayoutId(null)
                            }}
                            onBlur={() => setRenameLayoutId(null)}
                            style={{ flex: 1, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(46,134,193,.4)', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}
                          />
                        ) : (
                          <span style={{ flex: 1, color: '#fff', fontSize: 12, cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lyt.isDefault && <i className="fas fa-star me-1" style={{ color: '#F39C12', fontSize: 9 }} />}
                            {lyt.layoutName}
                          </span>
                        )}
                        <button title="Apply" onClick={() => void applyLayout(lyt)}
                          style={ddBtnStyle('#2e86c1')}><i className="fas fa-check" /></button>
                        <button title="Rename" onClick={() => { setRenameLayoutId(lyt.layoutId); setRenameValue(lyt.layoutName) }}
                          style={ddBtnStyle('#64748B')}><i className="fas fa-pencil-alt" /></button>
                        <button title="Set Default" onClick={() => void setDefaultMut.mutateAsync(lyt.layoutId)}
                          style={ddBtnStyle('#F39C12')}><i className="fas fa-star" /></button>
                        <button title="Delete" onClick={() => {
                          void deleteLayoutMut.mutateAsync(lyt.layoutId)
                          if (appliedLayoutId === lyt.layoutId) setAppliedLayoutId(null)
                        }} style={ddBtnStyle('#E74C3C')}><i className="fas fa-trash" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save current layout */}
              {appliedLayoutId !== null && (
                <button className="btn btn-outline-primary btn-sm" title="Save current state to active layout"
                  style={{ borderColor: 'rgba(46,134,193,.4)', color: '#5DADE2' }}
                  disabled={updateLayoutMut.isPending}
                  onClick={() => {
                    void updateLayoutMut.mutateAsync({
                      id: appliedLayoutId,
                      filterState: { vizMode, timeWindow, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems },
                      canvasState:  { zoom, pan, positions },
                    })
                  }}>
                  <i className="fas fa-save me-1" />{updateLayoutMut.isPending ? 'Saving…' : 'Save'}
                </button>
              )}

              {/* Save As */}
              <button className="btn btn-outline-secondary btn-sm"
                style={{ borderColor: 'rgba(46,134,193,.4)', color: '#BDC3C7' }}
                onClick={() => { setNewLayoutName(''); setShowSaveAsModal(true) }}>
                <i className="fas fa-save me-1" />Save as…
              </button>

              {/* Export PDF */}
              <button className="btn btn-outline-secondary btn-sm"
                style={{ borderColor: 'rgba(46,134,193,.4)', color: '#BDC3C7' }}
                onClick={() => void exportToPdf()}>
                <i className="fas fa-file-pdf me-1" />Export PDF
              </button>

              {/* Refresh */}
              <button className="btn btn-primary btn-sm" onClick={() => void loadMap()}>
                <i className="fas fa-sync-alt me-1" />Refresh
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div ref={containerRef} className="imap-canvas"
            style={{ flex: 1, position: 'relative', background: 'rgba(15,23,42,.5)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, overflow: 'hidden' }}>

            {/* Fullscreen brand overlay */}
            {isFullscreen && (
              <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(15,23,42,.75)', padding: '8px 16px', borderRadius: 8, pointerEvents: 'none' }}>
                <i className="bi bi-diagram-3-fill" style={{ fontSize: 24, color: '#2e86c1' }} />
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Integration Map</span>
              </div>
            )}

            {/* Loading overlay */}
            {isLoading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, flexDirection: 'column', gap: 12 }}>
                <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem', borderWidth: '.3em' }} />
                <span style={{ color: '#fff' }}>Loading integration map…</span>
              </div>
            )}

            {/* Zoom + fullscreen toolbar */}
            <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
              {[
                { icon: '+',  title: 'Zoom in',        fn: () => setZoom(z => Math.min(3, z * 1.25)) },
                { icon: '−',  title: 'Zoom out',       fn: () => setZoom(z => Math.max(.3, z / 1.25)) },
                { icon: '⤢',  title: 'Fit to canvas',  fn: fitCanvas },
                { icon: isFullscreen ? '✕' : '⛶', title: isFullscreen ? 'Exit fullscreen' : 'Fullscreen', fn: toggleFullscreen },
              ].map(b => (
                <button key={b.title} title={b.title} onClick={b.fn}
                  style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(46,134,193,.4)', background: 'rgba(15,23,42,.85)', color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {b.icon}
                </button>
              ))}
            </div>

            {/* Stats overlay */}
            {flowData && !isLoading && (
              <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 5, background: 'rgba(15,23,42,.72)', border: '1px solid rgba(46,134,193,.25)', borderRadius: 8, padding: '8px 12px', pointerEvents: 'none' }}>
                <div style={{ fontSize: 13, color: '#BDC3C7', lineHeight: 1.5 }}>
                  <strong style={{ color: '#fff' }}>{flowData.nodes?.length ?? 0}</strong> nodes &nbsp;·&nbsp;
                  <strong style={{ color: '#fff' }}>{flowData.connections?.length ?? 0}</strong> connections
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, paddingTop: 4, borderTop: '1px dashed rgba(46,134,193,.2)' }}>
                  {[['#2ECC71', 'Healthy'], ['#F39C12', 'Warning'], ['#E74C3C', 'Error']].map(([c, l]) => (
                    <span key={l} style={{ marginRight: 10 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, marginRight: 4, verticalAlign: 'middle' }} />{l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* SVG */}
            <svg ref={svgRef} width="100%" height="100%"
              style={{ display: 'block', cursor: isPanning ? 'grabbing' : 'grab' }}
              onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onWheel={onWh}>
              <defs>
                {['success', 'warning', 'error', 'default'].map(t => (
                  <marker key={t} id={`arr-${t}`} viewBox="0 -5 10 10" refX={NODE_R + 12} refY={0} markerWidth={5} markerHeight={5} markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M0,-5L10,0L0,5" fill={t === 'success' ? '#2ECC71' : t === 'warning' ? '#F39C12' : t === 'error' ? '#E74C3C' : '#3498DB'} />
                  </marker>
                ))}
              </defs>
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Connections */}
                {(flowData?.connections ?? []).map((c, i) => {
                  const s = positions[c.from], t = positions[c.to]
                  if (!s || !t) return null
                  const col = connColor(c.successRate, warnPct, critPct)
                  const w   = strokeW(c.transactionCount, allCounts)
                  return (
                    <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      stroke={col} strokeWidth={w} opacity={0.42}
                      markerEnd={`url(#arr-${arrowType(col)})`}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => { if (!dragNodeRef.current) setTooltip({ x: e.clientX, y: e.clientY, node: <ConnTip c={c} /> }) }}
                      onMouseMove={e  => { if (!dragNodeRef.current) setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null) }}
                      onMouseLeave={  () => setTooltip(null)}
                      onClick={        () => { setTooltip(null); setSelConn(c) }}
                    />
                  )
                })}
                {/* Nodes */}
                {(flowData?.nodes ?? []).map(nd => {
                  const p = positions[nd.id]
                  if (!p) return null
                  const col = nodeColor(nd.statusClass)
                  return (
                    <g key={nd.id} className="fn" transform={`translate(${p.x},${p.y})`}
                      style={{ cursor: dragNodeRef.current?.id === nd.id ? 'grabbing' : 'grab' }}
                      onMouseDown={e => {
                        e.stopPropagation()
                        dragNodeRef.current = { id: nd.id, startMx: e.clientX, startMy: e.clientY, origX: p.x, origY: p.y }
                      }}
                      onMouseEnter={e => { if (!dragNodeRef.current) setTooltip({ x: e.clientX, y: e.clientY, node: <NodeTip nd={nd} /> }) }}
                      onMouseMove={e  => { if (!dragNodeRef.current) setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null) }}
                      onMouseLeave={  () => setTooltip(null)}
                      onClick={e      => { if (e.detail > 0 && !dragNodeRef.current) { setTooltip(null); setSelNode(nd) } }}
                    >
                      <circle r={NODE_R} fill="rgba(15,23,42,.9)" stroke={col} strokeWidth={3}
                        style={{ filter: `drop-shadow(0 2px 12px ${col}66)` }} />
                      <text textAnchor="middle" dy={-6} fontSize={16} fill={col} fontWeight={600}>⬡</text>
                      <text textAnchor="middle" dy={12} fontSize={9} fontWeight={600} fill="#FFFFFF">
                        {nd.title.length > 13 ? `${nd.title.slice(0, 13)}…` : nd.title}
                      </text>
                      <text textAnchor="middle" dy={40} fontSize={8} fill="#BDC3C7">
                        {nd.transactionCount.toLocaleString()} txns
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, background: 'rgba(0,0,0,.88)', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 12, pointerEvents: 'none', zIndex: 9999, maxWidth: 280, boxShadow: '0 4px 16px rgba(0,0,0,.4)' }}>
                {tooltip.node}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !(flowData?.nodes?.length) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                <i className="bi bi-diagram-3" style={{ fontSize: 60, color: '#3498DB', opacity: .35 }} />
                <p style={{ color: '#BDC3C7', margin: 0 }}>No integration data for selected filters.</p>
                <button className="btn btn-outline-primary btn-sm" onClick={() => { clearFilters(); void loadMap() }}>Clear filters &amp; reload</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Node modal ───────────────────────────────────────── */}
        {selNode && (
          <ModalWrap onClose={() => setSelNode(null)}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(46,134,193,.3)' }}>
              <h5 className="modal-title text-white">{selNode.title}</h5>
              <button type="button" className="btn-close btn-close-white" onClick={() => setSelNode(null)} />
            </div>
            <div className="modal-body">
              <div className="row g-3 mb-3">
                <div className="col-6"><StatBox label="Transactions" value={selNode.transactionCount.toLocaleString()} color="#3498DB" /></div>
                <div className="col-6"><StatBox label="Errors" value={selNode.errorCount.toLocaleString()} color={nodeColor(selNode.statusClass)} /></div>
              </div>
              <InfoRow label="Status" value={<span style={{ color: nodeColor(selNode.statusClass), fontWeight: 600, textTransform: 'capitalize' }}>{selNode.statusClass || 'Unknown'}</span>} />
              <InfoRow label="Error Rate" value={`${selNode.errorRate?.toFixed(2) ?? '—'}%`} />
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid rgba(46,134,193,.3)' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelNode(null)}>Close</button>
            </div>
          </ModalWrap>
        )}

        {/* ── Connection modal (tabbed) ─────────────────────────── */}
        {selConn && (
          <ModalWrap onClose={() => setSelConn(null)} wide>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(46,134,193,.3)' }}>
              <h5 className="modal-title text-white">
                <i className="fas fa-arrow-right me-2" style={{ color: connColor(selConn.successRate, warnPct, critPct) }} />
                {selConn.from} → {selConn.to}
              </h5>
              <button type="button" className="btn-close btn-close-white" onClick={() => setSelConn(null)} />
            </div>

            {/* Nav tabs */}
            <div style={{ padding: '0 16px', borderBottom: '1px solid rgba(46,134,193,.2)' }}>
              <ul className="nav nav-tabs" style={{ borderBottom: 'none' }}>
                {([
                  { key: 'overview',     label: 'Overview'       },
                  { key: 'breakdown',    label: 'Integrations'   },
                  { key: 'hourly',       label: 'Hourly Pattern' },
                  { key: 'errors',       label: 'Error Analysis' },
                  { key: 'transactions', label: 'Transactions'   },
                  { key: 'performance',  label: 'Performance'    },
                ] as { key: typeof connTab; label: string }[]).map(({ key, label }) => (
                  <li key={key} className="nav-item">
                    <button className={`nav-link ${connTab === key ? 'active' : ''}`}
                      style={{ color: connTab === key ? '#5DADE2' : '#94A3B8', background: 'transparent', border: 'none', borderBottom: connTab === key ? '2px solid #5DADE2' : '2px solid transparent', fontSize: 13 }}
                      onClick={() => setConnTab(key)}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="modal-body" style={{ maxHeight: 380, overflowY: 'auto' }}>
              {connTab === 'overview' && (
                <>
                  {[
                    { label: 'Transactions',  value: selConn.transactionCount?.toLocaleString() ?? '—' },
                    { label: 'Success Rate',  value: `${selConn.successRate?.toFixed(2) ?? '—'}%` },
                    { label: 'Errors',        value: selConn.errorCount?.toLocaleString() ?? '—' },
                    { label: 'Avg Exec Time', value: selConn.avgExecutionTimeMs != null ? `${selConn.avgExecutionTimeMs.toFixed(0)} ms` : '—' },
                  ].map(r => <InfoRow key={r.label} label={r.label} value={r.value} />)}
                  {(selConn.documentTypes?.length ?? 0) > 0 && (
                    <div className="mt-3">
                      <div style={{ fontSize: 11, color: '#BDC3C7', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Document Types</div>
                      <div className="d-flex flex-wrap gap-1">
                        {selConn.documentTypes?.map(dt => (
                          <span key={dt} className="badge" style={{ background: 'rgba(52,152,219,.25)', color: '#5DADE2', fontSize: 11 }}>{dt}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {connTab === 'transactions' && (
                <>
                  {connDetailLoading
                    ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
                    : !connDetail?.transactions?.length
                      ? <p style={{ color: '#94A3B8', fontSize: 13 }}>No transactions found.</p>
                      : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(46,134,193,.2)', color: '#BDC3C7', textAlign: 'left' }}>
                                {['ID', 'Date', 'Status', 'Time (ms)', 'Type'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {connDetail.transactions.map(tx => (
                                <tr key={tx.transactionId} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', color: '#fff' }}>
                                  <td style={{ padding: '5px 8px', color: '#94A3B8', fontFamily: 'monospace' }}>{tx.transactionId.slice(0, 12)}…</td>
                                  <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{new Date(tx.executedAt).toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px' }}>
                                    <span style={{ color: tx.status === 'error' ? '#E74C3C' : tx.status === 'warning' ? '#F39C12' : '#2ECC71', textTransform: 'capitalize' }}>{tx.status}</span>
                                  </td>
                                  <td style={{ padding: '5px 8px' }}>{tx.executionTimeMs}</td>
                                  <td style={{ padding: '5px 8px', color: '#94A3B8' }}>{tx.documentType ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                  }
                </>
              )}

              {connTab === 'performance' && (
                <>
                  {connDetailLoading
                    ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
                    : !connDetail?.performance?.length
                      ? <p style={{ color: '#94A3B8', fontSize: 13 }}>No performance data found.</p>
                      : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(46,134,193,.2)', color: '#BDC3C7', textAlign: 'left' }}>
                                {['Date', 'Success Rate', 'Avg Time (ms)', 'Transactions'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {connDetail.performance.map((pt, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', color: '#fff' }}>
                                  <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{new Date(pt.date).toLocaleDateString()}</td>
                                  <td style={{ padding: '5px 8px', color: pt.successRate >= 95 ? '#2ECC71' : pt.successRate >= 90 ? '#F39C12' : '#E74C3C' }}>{pt.successRate.toFixed(1)}%</td>
                                  <td style={{ padding: '5px 8px' }}>{pt.avgExecutionTimeMs.toFixed(0)}</td>
                                  <td style={{ padding: '5px 8px' }}>{pt.transactionCount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                  }
                </>
              )}

              {connTab === 'breakdown' && (
                <>
                  {connDetailLoading
                    ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
                    : !connDetail?.integrationBreakdown?.length
                      ? <p style={{ color: '#94A3B8', fontSize: 13 }}>No integration breakdown data.</p>
                      : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(46,134,193,.2)', color: '#BDC3C7', textAlign: 'left' }}>
                                {['Integration', 'Transactions', 'Success Rate', 'Errors', 'Avg Time (ms)', 'Doc Type'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {connDetail.integrationBreakdown.map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', color: '#fff' }}>
                                  <td style={{ padding: '5px 8px', fontWeight: 600 }}>{row.integrationName}</td>
                                  <td style={{ padding: '5px 8px' }}>{row.transactionCount.toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px', color: row.successRate >= 95 ? '#2ECC71' : row.successRate >= 90 ? '#F39C12' : '#E74C3C' }}>{row.successRate.toFixed(1)}%</td>
                                  <td style={{ padding: '5px 8px', color: '#E74C3C' }}>{row.errorCount.toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px' }}>{row.avgExecutionTimeMs.toFixed(0)}</td>
                                  <td style={{ padding: '5px 8px', color: '#94A3B8' }}>{row.documentType ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                  }
                </>
              )}

              {connTab === 'hourly' && (
                <>
                  {connDetailLoading
                    ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
                    : !connDetail?.hourlyPattern?.length
                      ? <p style={{ color: '#94A3B8', fontSize: 13 }}>No hourly pattern data.</p>
                      : <HourlyPatternChart data={connDetail.hourlyPattern} />
                  }
                </>
              )}

              {connTab === 'errors' && (
                <>
                  {connDetailLoading
                    ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
                    : !connDetail?.errorAnalysis?.length
                      ? <p style={{ color: '#94A3B8', fontSize: 13 }}>No error analysis data.</p>
                      : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(46,134,193,.2)', color: '#BDC3C7', textAlign: 'left' }}>
                                {['Error Message', 'Count', 'Last Occurred', '%'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {connDetail.errorAnalysis.map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', color: '#fff' }}>
                                  <td style={{ padding: '5px 8px', color: '#E74C3C', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.errorMessage}</td>
                                  <td style={{ padding: '5px 8px', fontWeight: 700 }}>{row.count.toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{new Date(row.lastOccurred).toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px', color: '#F39C12' }}>{row.percentage.toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                  }
                </>
              )}
            </div>

            <div className="modal-footer d-flex justify-content-between align-items-center" style={{ borderTop: '1px solid rgba(46,134,193,.3)' }}>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => void exportConnDetailsToPdf()}>
                <i className="fas fa-file-pdf me-1" />Export PDF
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelConn(null)}>Close</button>
            </div>
          </ModalWrap>
        )}

        {/* ── Save As modal ────────────────────────────────────── */}
        {showSaveAsModal && (
          <ModalWrap onClose={() => setShowSaveAsModal(false)}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(46,134,193,.3)' }}>
              <h5 className="modal-title text-white"><i className="fas fa-save me-2" />Save Layout</h5>
              <button type="button" className="btn-close btn-close-white" onClick={() => setShowSaveAsModal(false)} />
            </div>
            <div className="modal-body">
              <label style={{ color: '#BDC3C7', fontSize: 13, display: 'block', marginBottom: 6 }}>Layout Name</label>
              <input
                autoFocus
                type="text"
                value={newLayoutName}
                onChange={e => setNewLayoutName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newLayoutName.trim()) {
                    void saveLayoutMut.mutateAsync({
                      layoutName: newLayoutName.trim(),
                      isDefault: newLayoutIsDefault,
                      filterState: { vizMode, timeWindow, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems },
                      canvasState:  { zoom, pan, positions },
                    }).then(layout => {
                      setAppliedLayoutId(layout.layoutId)
                      setShowSaveAsModal(false)
                    })
                  }
                }}
                placeholder="e.g. My ERP View"
                style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(46,134,193,.4)', color: '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: '#BDC3C7', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={newLayoutIsDefault} onChange={e => setNewLayoutIsDefault(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#2e86c1', cursor: 'pointer' }} />
                Set as default layout
              </label>
            </div>
            <div className="modal-footer d-flex gap-2" style={{ borderTop: '1px solid rgba(46,134,193,.3)' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSaveAsModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={!newLayoutName.trim() || saveLayoutMut.isPending}
                onClick={() => {
                  void saveLayoutMut.mutateAsync({
                    layoutName: newLayoutName.trim(),
                    isDefault: newLayoutIsDefault,
                    filterState: { vizMode, timeWindow, segmentIds, processIds, subprocessIds, sourceSystems, targetSystems },
                    canvasState:  { zoom, pan, positions },
                  }).then(layout => {
                    setAppliedLayoutId(layout.layoutId)
                    setShowSaveAsModal(false)
                  })
                }}>
                {saveLayoutMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </ModalWrap>
        )}
      </div>
    </>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */
function ddBtnStyle(color: string): React.CSSProperties {
  return {
    width: 24, height: 24, borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}22`, color, fontSize: 10, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }
}

/* ── Sub-components ──────────────────────────────────────── */
function FG({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function NodeTip({ nd }: { nd: MapNode }) {
  return <>
    <div style={{ fontWeight: 600, marginBottom: 5 }}>{nd.title}</div>
    <div>Transactions: {nd.transactionCount.toLocaleString()}</div>
    <div>Errors: {nd.errorCount.toLocaleString()}</div>
    {nd.errorRate != null && <div>Error Rate: {nd.errorRate.toFixed(2)}%</div>}
  </>
}

function ConnTip({ c }: { c: MapConnection }) {
  return <>
    <div style={{ fontWeight: 600, marginBottom: 5 }}>{c.from} → {c.to}</div>
    <div>Transactions: {c.transactionCount?.toLocaleString()}</div>
    <div>Success Rate: {c.successRate?.toFixed(2)}%</div>
    {c.avgExecutionTimeMs != null && <div>Avg Time: {c.avgExecutionTimeMs.toFixed(0)} ms</div>}
  </>
}

function ModalWrap({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal-dialog ${wide ? 'modal-lg' : ''}`}>
        <div className="modal-content" style={{ background: 'rgba(15,23,42,.97)', border: '1px solid rgba(46,134,193,.3)', color: '#fff' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'rgba(46,134,193,.1)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#BDC3C7', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="d-flex justify-content-between py-2" style={{ borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: 13, color: '#BDC3C7' }}>
      <span>{label}</span>
      <span style={{ color: '#fff', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function HourlyPatternChart({ data }: { data: HourlyPatternPoint[] }) {
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const W = 520, H = 190
  const PAD = { top: 12, right: 12, bottom: 44, left: 50 }
  const cw = W - PAD.left - PAD.right
  const ch = H - PAD.top - PAD.bottom

  const maxTx  = Math.max(...data.map(d => d.transactionCount), 1)
  const xStep  = cw / Math.max(data.length, 1)
  const barW   = Math.max(3, xStep - 4)

  const txPts  = data.map((d, i) => ({ x: PAD.left + i * xStep + xStep / 2, y: PAD.top + ch - (d.transactionCount / maxTx) * ch }))
  const errPts = data.map((d, i) => ({ x: PAD.left + i * xStep + xStep / 2, y: PAD.top + ch - (d.errorCount / maxTx) * ch }))

  const polyTx  = txPts.map(p => `${p.x},${p.y}`).join(' ')
  const polyErr = errPts.map(p => `${p.x},${p.y}`).join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = data.length > 12 ? Math.ceil(data.length / 12) : 1

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {(['bar', 'line'] as const).map(t => (
          <button key={t} onClick={() => setChartType(t)}
            style={{
              padding: '3px 12px', fontSize: 11, borderRadius: 4, cursor: 'pointer', textTransform: 'capitalize',
              background: chartType === t ? '#2e86c1' : 'rgba(46,134,193,.15)',
              border: `1px solid ${chartType === t ? '#2e86c1' : 'rgba(46,134,193,.3)'}`,
              color: chartType === t ? '#fff' : '#94A3B8',
            }}>
            {t}
          </button>
        ))}
        <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 8 }}>
          <span style={{ color: '#3498DB', marginRight: 3 }}>■</span>Transactions
          <span style={{ color: '#E74C3C', margin: '0 3px 0 10px' }}>■</span>Errors
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 300, height: H, display: 'block' }}>
          {/* Y grid + labels */}
          {yTicks.map(frac => {
            const y = PAD.top + ch - frac * ch
            return (
              <g key={frac}>
                <line x1={PAD.left} x2={PAD.left + cw} y1={y} y2={y} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
                <text x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9} fill="#64748B">
                  {Math.round(maxTx * frac).toLocaleString()}
                </text>
              </g>
            )
          })}
          {/* X labels */}
          {data.map((d, i) => {
            if (i % labelEvery !== 0) return null
            return (
              <text key={i} x={PAD.left + i * xStep + xStep / 2} y={H - PAD.bottom + 14}
                textAnchor="middle" fontSize={9} fill="#64748B">{d.hour}</text>
            )
          })}
          {/* Bar chart */}
          {chartType === 'bar' && data.map((d, i) => (
            <g key={i}>
              <rect x={PAD.left + i * xStep + 1} y={PAD.top + ch - (d.transactionCount / maxTx) * ch}
                width={barW * 0.55} height={(d.transactionCount / maxTx) * ch}
                fill="rgba(52,152,219,.65)" rx={1} />
              {d.errorCount > 0 && (
                <rect x={PAD.left + i * xStep + 1 + barW * 0.55} y={PAD.top + ch - (d.errorCount / maxTx) * ch}
                  width={barW * 0.4} height={(d.errorCount / maxTx) * ch}
                  fill="rgba(231,76,60,.75)" rx={1} />
              )}
            </g>
          ))}
          {/* Line chart */}
          {chartType === 'line' && data.length > 1 && (
            <>
              <polyline points={polyTx}  fill="none" stroke="#3498DB" strokeWidth={2} strokeLinejoin="round" />
              <polyline points={polyErr} fill="none" stroke="#E74C3C" strokeWidth={1.5} strokeLinejoin="round" />
              {txPts.map((p, i)  => <circle key={`t${i}`} cx={p.x} cy={p.y} r={2.5} fill="#3498DB" />)}
              {errPts.map((p, i) => <circle key={`e${i}`} cx={p.x} cy={p.y} r={2}   fill="#E74C3C" />)}
            </>
          )}
          {/* Axes */}
          <line x1={PAD.left} x2={PAD.left}        y1={PAD.top} y2={PAD.top + ch} stroke="rgba(255,255,255,.2)" strokeWidth={1} />
          <line x1={PAD.left} x2={PAD.left + cw} y1={PAD.top + ch} y2={PAD.top + ch} stroke="rgba(255,255,255,.2)" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}
