import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DataGrid, { Column, SearchPanel, FilterRow, Paging, Pager } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface IntegrationFlow {
  integrationFlowId: number
  integrationName: string
  sourcePlatform: string
  hasMappingConfigured: boolean
}

interface LookupItem {
  id: number
  name: string
  parentId?: number
}

interface MappingLookups {
  businessSegments: LookupItem[]
  brands: LookupItem[]
  businessProcesses: LookupItem[]
  subprocesses: LookupItem[]
  countries: LookupItem[]
  documentTypes: LookupItem[]
}

interface FieldConnection {
  sourceField: string
  targetField: string
}

interface IntegrationFieldMappingData {
  businessSegmentId: number | null
  brandId: number | null
  processId: number | null
  subprocessId: number | null
  countryId: number | null
  documentTypeId: number | null
  direction: string
  sourceSystem: string
  targetSystem: string
  stage: string
  sourceFields: string[]
  targetFields: string[]
  connections: FieldConnection[]
}

interface PlatformFieldMappingData {
  sourceFields: string[]
  targetFields: string[]
  connections: FieldConnection[]
}

interface SaveIntegrationMappingPayload {
  integrationFlowId: number
  businessSegmentId: number | null
  brandId: number | null
  processId: number | null
  subprocessId: number | null
  countryId: number | null
  documentTypeId: number | null
  direction: string
  sourceSystem: string
  targetSystem: string
  stage: string
  connections: FieldConnection[]
}

interface SidebarForm {
  businessSegmentId: string
  brandId: string
  processId: string
  subprocessId: string
  countryId: string
  documentTypeId: string
  direction: string
  sourceSystem: string
  targetSystem: string
  stage: string
}

const DEFAULT_SIDEBAR: SidebarForm = {
  businessSegmentId: '', brandId: '', processId: '', subprocessId: '',
  countryId: '', documentTypeId: '', direction: '', sourceSystem: '',
  targetSystem: '', stage: '',
}

const CARD = {
  background: 'rgba(15,23,42,.85)',
  border: '1px solid rgba(46,134,193,.2)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
}

// ─────────────────────────────────────────────────────────────────────────────
// VisualFieldMapper
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_H = 36
const HEADER_H = 44
const LIST_H = 380
const PANEL_H = HEADER_H + LIST_H
const PANEL_W = 290
const SVG_W = 100

interface VisualFieldMapperProps {
  sourceFields: string[]
  targetFields: string[]
  connections: FieldConnection[]
  onConnectionsChange?: (c: FieldConnection[]) => void
  readOnly?: boolean
}

function VisualFieldMapper({
  sourceFields, targetFields, connections, onConnectionsChange, readOnly = false,
}: VisualFieldMapperProps) {
  const [pendingSrc, setPendingSrc] = useState<string | null>(null)
  const [srcScroll, setSrcScroll] = useState(0)
  const [tgtScroll, setTgtScroll] = useState(0)

  const srcY = (f: string) => HEADER_H + sourceFields.indexOf(f) * ITEM_H + ITEM_H / 2 - srcScroll
  const tgtY = (f: string) => HEADER_H + targetFields.indexOf(f) * ITEM_H + ITEM_H / 2 - tgtScroll

  const srcHasConn = (s: string) => connections.some(c => c.sourceField === s)
  const tgtHasConn = (t: string) => connections.some(c => c.targetField === t)
  const isConnected = (s: string, t: string) => connections.some(c => c.sourceField === s && c.targetField === t)

  const handleSrcClick = (f: string) => {
    if (readOnly) return
    setPendingSrc(p => (p === f ? null : f))
  }

  const handleTgtClick = (f: string) => {
    if (readOnly) return
    if (!pendingSrc) {
      if (tgtHasConn(f)) onConnectionsChange?.(connections.filter(c => c.targetField !== f))
      return
    }
    if (isConnected(pendingSrc, f)) {
      onConnectionsChange?.(connections.filter(c => !(c.sourceField === pendingSrc && c.targetField === f)))
    } else {
      onConnectionsChange?.([...connections, { sourceField: pendingSrc, targetField: f }])
    }
    setPendingSrc(null)
  }

  const itemStyle = (connected: boolean, isPending: boolean) => ({
    height: ITEM_H,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: 12,
    fontFamily: 'monospace',
    cursor: readOnly ? 'default' : 'pointer',
    background: isPending ? 'rgba(99,102,241,.35)' : connected ? 'rgba(46,134,193,.2)' : 'transparent',
    color: isPending ? '#A5B4FC' : connected ? '#93C5FD' : '#CBD5E1',
    borderBottom: '1px solid rgba(255,255,255,.04)',
    overflow: 'hidden' as const,
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    transition: 'background .12s',
  })

  const CLIP_ID = 'vmClip'

  return (
    <div style={{ display: 'flex', background: 'rgba(15,23,42,.9)', borderRadius: 8, border: '1px solid rgba(46,134,193,.2)', overflow: 'hidden' }}>
      {/* Source panel */}
      <div style={{ width: PANEL_W, flexShrink: 0, borderRight: '1px solid rgba(46,134,193,.12)' }}>
        <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'rgba(6,182,212,.08)', borderBottom: '1px solid rgba(46,134,193,.15)' }}>
          <i className="fas fa-database me-2" style={{ color: '#06B6D4', fontSize: 10 }} />
          <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Source Fields</span>
          <span style={{ marginLeft: 'auto', background: 'rgba(6,182,212,.2)', color: '#67E8F9', fontSize: 10, padding: '1px 7px', borderRadius: 8 }}>{sourceFields.length}</span>
        </div>
        <div style={{ height: LIST_H, overflowY: 'auto' }} onScroll={e => setSrcScroll(e.currentTarget.scrollTop)}>
          {sourceFields.length === 0
            ? <p style={{ padding: 20, color: '#475569', fontSize: 12, textAlign: 'center', margin: 0 }}>No source fields loaded</p>
            : sourceFields.map(f => (
                <div key={f} style={itemStyle(srcHasConn(f), pendingSrc === f)} onClick={() => handleSrcClick(f)} title={f}>{f}</div>
              ))}
        </div>
      </div>

      {/* SVG connections */}
      <svg width={SVG_W} height={PANEL_H} style={{ flexShrink: 0, background: 'rgba(8,15,30,.9)' }}>
        <defs>
          <clipPath id={CLIP_ID}>
            <rect x={0} y={HEADER_H} width={SVG_W} height={LIST_H} />
          </clipPath>
        </defs>
        <line x1={0} y1={HEADER_H} x2={SVG_W} y2={HEADER_H} stroke="rgba(46,134,193,.15)" strokeWidth={1} />
        <g clipPath={`url(#${CLIP_ID})`}>
          {connections.map(c => {
            const y1 = srcY(c.sourceField)
            const y2 = tgtY(c.targetField)
            const cp = SVG_W / 2
            return (
              <path
                key={`${c.sourceField}→${c.targetField}`}
                d={`M 0 ${y1} C ${cp} ${y1}, ${cp} ${y2}, ${SVG_W} ${y2}`}
                stroke="#3B82F6"
                strokeWidth={1.5}
                fill="none"
                style={{ cursor: readOnly ? 'default' : 'pointer' }}
                onClick={() => !readOnly && onConnectionsChange?.(
                  connections.filter(x => !(x.sourceField === c.sourceField && x.targetField === c.targetField))
                )}
              />
            )
          })}
          {pendingSrc && (
            <line
              x1={0} y1={srcY(pendingSrc)}
              x2={SVG_W / 2} y2={srcY(pendingSrc)}
              stroke="#A5B4FC" strokeWidth={1} strokeDasharray="4,3"
            />
          )}
        </g>
        {connections.length === 0 && !pendingSrc && (
          <text x={SVG_W / 2} y={PANEL_H / 2 + 6} textAnchor="middle" fill="rgba(100,116,139,.45)" fontSize={9} fontFamily="sans-serif">
            connect
          </text>
        )}
      </svg>

      {/* Target panel */}
      <div style={{ width: PANEL_W, flexShrink: 0, borderLeft: '1px solid rgba(46,134,193,.12)' }}>
        <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'rgba(16,185,129,.08)', borderBottom: '1px solid rgba(46,134,193,.15)' }}>
          <i className="fas fa-map-marker-alt me-2" style={{ color: '#10B981', fontSize: 10 }} />
          <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Target Fields</span>
          <span style={{ marginLeft: 'auto', background: 'rgba(16,185,129,.2)', color: '#6EE7B7', fontSize: 10, padding: '1px 7px', borderRadius: 8 }}>{targetFields.length}</span>
        </div>
        <div style={{ height: LIST_H, overflowY: 'auto' }} onScroll={e => setTgtScroll(e.currentTarget.scrollTop)}>
          {targetFields.length === 0
            ? <p style={{ padding: '20px 12px', color: '#475569', fontSize: 12, margin: 0 }}>
                {pendingSrc ? '← Click a target field to create a connection' : 'No target fields loaded'}
              </p>
            : targetFields.map(f => (
                <div key={f} style={itemStyle(tgtHasConn(f), false)} onClick={() => handleTgtClick(f)} title={f}>
                  {pendingSrc && !tgtHasConn(f) && <span style={{ color: '#A5B4FC', marginRight: 6, fontSize: 10 }}>→</span>}
                  {f}
                </div>
              ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PlatformBadge
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  Boomi: '#06B6D4',
  MuleSoft: '#F59E0B',
  SAP_IS: '#3B82F6',
  Solace: '#8B5CF6',
  Custom: '#94A3B8',
}

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] ?? '#94A3B8'
  return (
    <span style={{
      background: `${color}22`,
      color,
      border: `1px solid ${color}55`,
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
    }}>{platform}</span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function BoomiIntegrationMappingsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  // ── Create modal ───────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ integrationName: '', platform: 'Boomi', status: 'Pending' })
  const [saving, setSaving] = useState(false)

  // ── Global field mapper modal ──────────────────────────────────────────────
  const [showGlobalMapper, setShowGlobalMapper] = useState(false)
  const [globalConnections, setGlobalConnections] = useState<FieldConnection[]>([])

  // ── Per-integration mapper modal ───────────────────────────────────────────
  const [mapperFlowId, setMapperFlowId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarForm, setSidebarForm] = useState<SidebarForm>(DEFAULT_SIDEBAR)
  const [mapperConnections, setMapperConnections] = useState<FieldConnection[]>([])

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: flows, isFetching } = useQuery<IntegrationFlow[]>({
    queryKey: ['boomi', 'integrationFlows'],
    queryFn: () => apiClient.get('/Admin/GetIntegrationFlowMappings?platform=Boomi').then(r => r.data ?? []),
  })

  const { data: lookups } = useQuery<MappingLookups>({
    queryKey: ['boomi', 'mappingLookups'],
    queryFn: () => apiClient.get('/Admin/GetMappingLookups').then(r => r.data),
  })

  const { data: integrationFieldMappingData, isLoading: integrationMappingLoading } = useQuery<IntegrationFieldMappingData>({
    queryKey: ['boomi', 'integrationFieldMapping', mapperFlowId],
    queryFn: () => apiClient.get(`/Admin/GetIntegrationFieldMapping?id=${mapperFlowId}`).then(r => r.data),
    enabled: mapperFlowId !== null,
  })

  const { data: platformMappingData, isLoading: platformMappingLoading, refetch: reloadPlatformMapping } = useQuery<PlatformFieldMappingData>({
    queryKey: ['boomi', 'platformFieldMapping'],
    queryFn: () => apiClient.get('/Admin/GetPlatformFieldMapping?platform=Boomi').then(r => r.data),
    enabled: showGlobalMapper,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveIntegrationMappingMut = useMutation({
    mutationFn: (payload: SaveIntegrationMappingPayload) =>
      apiClient.post('/Admin/SaveIntegrationFieldMapping', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boomi', 'integrationFlows'] })
      setMapperFlowId(null)
    },
  })

  const savePlatformMappingMut = useMutation({
    mutationFn: (conns: FieldConnection[]) =>
      apiClient.post('/Admin/SavePlatformFieldMapping', { platform: 'Boomi', connections: conns }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boomi', 'platformFieldMapping'] })
      setShowGlobalMapper(false)
    },
  })

  const clearMappingMut = useMutation({
    mutationFn: (id: number) =>
      apiClient.delete(`/Admin/ClearIntegrationFlowMapping?id=${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boomi', 'integrationFlows'] }),
  })

  // ── Effects ────────────────────────────────────────────────────────────────

  // Open mapper from ?editId= on mount
  useEffect(() => {
    const id = searchParams.get('editId')
    if (id && !isNaN(Number(id))) {
      setMapperFlowId(Number(id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Populate mapper when per-integration field data loads
  useEffect(() => {
    if (!integrationFieldMappingData) return
    setMapperConnections(integrationFieldMappingData.connections ?? [])
    setSidebarForm({
      businessSegmentId: integrationFieldMappingData.businessSegmentId != null ? String(integrationFieldMappingData.businessSegmentId) : '',
      brandId: integrationFieldMappingData.brandId != null ? String(integrationFieldMappingData.brandId) : '',
      processId: integrationFieldMappingData.processId != null ? String(integrationFieldMappingData.processId) : '',
      subprocessId: integrationFieldMappingData.subprocessId != null ? String(integrationFieldMappingData.subprocessId) : '',
      countryId: integrationFieldMappingData.countryId != null ? String(integrationFieldMappingData.countryId) : '',
      documentTypeId: integrationFieldMappingData.documentTypeId != null ? String(integrationFieldMappingData.documentTypeId) : '',
      direction: integrationFieldMappingData.direction ?? '',
      sourceSystem: integrationFieldMappingData.sourceSystem ?? '',
      targetSystem: integrationFieldMappingData.targetSystem ?? '',
      stage: integrationFieldMappingData.stage ?? '',
    })
  }, [integrationFieldMappingData])

  // Populate global mapper connections when platform mapping loads
  useEffect(() => {
    if (platformMappingData?.connections) {
      setGlobalConnections(platformMappingData.connections)
    }
  }, [platformMappingData])

  // ── Derived state ──────────────────────────────────────────────────────────
  const total = flows?.length ?? 0
  const configured = flows?.filter(f => f.hasMappingConfigured).length ?? 0
  const pending = total - configured
  const currentFlow = flows?.find(f => f.integrationFlowId === mapperFlowId)

  const filteredBrands = useMemo(() => {
    const all = lookups?.brands ?? []
    if (!sidebarForm.businessSegmentId) return all
    return all.filter(b => !b.parentId || b.parentId === Number(sidebarForm.businessSegmentId))
  }, [lookups, sidebarForm.businessSegmentId])

  const filteredSubprocesses = useMemo(() => {
    const all = lookups?.subprocesses ?? []
    if (!sidebarForm.processId) return all
    return all.filter(s => !s.parentId || s.parentId === Number(sidebarForm.processId))
  }, [lookups, sidebarForm.processId])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const createFlow = async () => {
    setSaving(true)
    try {
      await apiClient.post('/Admin/CreateIntegrationFlow', {
        integrationName: form.integrationName,
        platform: form.platform,
        status: form.status,
      })
      qc.invalidateQueries({ queryKey: ['boomi', 'integrationFlows'] })
      setShowModal(false)
      setForm({ integrationName: '', platform: 'Boomi', status: 'Pending' })
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  const openMapper = (flowId: number) => {
    setSidebarForm(DEFAULT_SIDEBAR)
    setMapperConnections([])
    setMapperFlowId(flowId)
  }

  const handleSaveIntegrationMapping = () => {
    if (!mapperFlowId) return
    saveIntegrationMappingMut.mutate({
      integrationFlowId: mapperFlowId,
      businessSegmentId: sidebarForm.businessSegmentId ? Number(sidebarForm.businessSegmentId) : null,
      brandId: sidebarForm.brandId ? Number(sidebarForm.brandId) : null,
      processId: sidebarForm.processId ? Number(sidebarForm.processId) : null,
      subprocessId: sidebarForm.subprocessId ? Number(sidebarForm.subprocessId) : null,
      countryId: sidebarForm.countryId ? Number(sidebarForm.countryId) : null,
      documentTypeId: sidebarForm.documentTypeId ? Number(sidebarForm.documentTypeId) : null,
      direction: sidebarForm.direction,
      sourceSystem: sidebarForm.sourceSystem,
      targetSystem: sidebarForm.targetSystem,
      stage: sidebarForm.stage,
      connections: mapperConnections,
    })
  }

  const handleClearMapping = (id: number) => {
    if (window.confirm('Clear the field mapping for this integration?')) {
      clearMappingMut.mutate(id)
    }
  }

  const setSidebarField = (key: keyof SidebarForm, value: string) => {
    setSidebarForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'businessSegmentId') next.brandId = ''
      if (key === 'processId') next.subprocessId = ''
      return next
    })
  }

  // ── Shared styles (inline, no CSSProperties import needed) ─────────────────
  const selectSty = {
    background: 'rgba(15,23,42,.8)',
    border: '1px solid rgba(46,134,193,.3)',
    color: '#CBD5E1',
    fontSize: 12,
    borderRadius: 6,
  }

  const inputSty = {
    background: 'rgba(255,255,255,.07)',
    border: '1px solid rgba(46,134,193,.3)',
    color: '#fff' as const,
    borderRadius: 6,
    fontSize: 12,
  }

  const labelSty = {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 600,
    display: 'block',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '.03em',
  }

  const fullscreenOverlay = {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,.88)',
    zIndex: 1100,
    display: 'flex',
    flexDirection: 'column' as const,
  }

  const modalHeader = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 24px',
    background: 'rgba(15,23,42,.98)',
    borderBottom: '1px solid rgba(46,134,193,.25)',
    flexShrink: 0,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      {/* Back */}
      <div className="mb-3">
        <button className="btn btn-link p-0" style={{ color: '#94A3B8', fontSize: 14 }}
          onClick={() => navigate('/orchestration/boomi')}>
          <i className="fas fa-arrow-left me-1" />Back to Boomi Onboarding
        </button>
      </div>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1"><i className="fas fa-sitemap me-2 text-primary" />Boomi Integration Mappings</h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>Configure business context mappings for Boomi process integrations.</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-info btn-sm" onClick={() => setShowGlobalMapper(true)}>
            <i className="fas fa-project-diagram me-2" />Configure Field Mapping
          </button>
          <button className="btn btn-success btn-sm" onClick={() => setShowModal(true)}>
            <i className="fas fa-plus me-2" />New Integration
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Integrations', value: total, color: '#fff' },
          { label: 'Configured', value: configured, color: '#2ECC71' },
          { label: 'Pending', value: pending, color: '#F39C12' },
        ].map(s => (
          <div key={s.label} className="col-md-4">
            <div style={{ background: 'linear-gradient(135deg,#1E293B 0%,#334155 100%)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, padding: '20px 25px' }}>
              <div style={{ color: s.color, fontSize: 32, fontWeight: 700 }}>{s.value}</div>
              <div style={{ color: '#94A3B8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={CARD}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="text-white mb-0"><i className="fas fa-list me-2" style={{ color: '#3B82F6' }} />Integration Flows</h6>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['boomi', 'integrationFlows'] })}
          >
            <i className="fas fa-sync-alt me-1" />Refresh
          </button>
        </div>
        <DataGrid
          dataSource={flows ?? []}
          keyExpr="integrationFlowId"
          showBorders={false}
          showRowLines={true}
          rowAlternationEnabled={true}
          columnAutoWidth={true}
          allowColumnResizing={true}
          height={560}
          noDataText={isFetching ? 'Loading…' : 'No integration flows found — discover Boomi processes to get started'}
        >
          <SearchPanel visible={true} placeholder="Search flows..." width={240} />
          <FilterRow visible={true} />
          <Paging pageSize={25} />
          <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50, 100]} showInfo={true} />

          <Column dataField="integrationName" caption="Integration Name" minWidth={200} />
          <Column
            dataField="sourcePlatform"
            caption="Platform"
            width={130}
            cellRender={({ value }: { value: string }) => <PlatformBadge platform={value} />}
          />
          <Column
            dataField="hasMappingConfigured"
            caption="Status"
            width={110}
            cellRender={({ value }: { value: boolean }) => (
              <span className={`badge ${value ? 'bg-success' : 'bg-warning text-dark'}`} style={{ fontSize: 11 }}>
                {value ? 'Configured' : 'Pending'}
              </span>
            )}
          />
          <Column
            caption="Actions"
            width={210}
            allowSorting={false}
            allowFiltering={false}
            cellRender={({ data }: { data: IntegrationFlow }) => (
              <div className="d-flex gap-1">
                <button
                  className="btn btn-sm"
                  style={{ background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.4)', color: '#818CF8', fontSize: 11, padding: '2px 8px', fontWeight: 600 }}
                  onClick={() => openMapper(data.integrationFlowId)}
                >
                  <i className="fas fa-code-branch me-1" />Configure
                </button>
                {data.hasMappingConfigured && (
                  <button
                    className="btn btn-sm"
                    style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', color: '#F87171', fontSize: 11, padding: '2px 8px', fontWeight: 600 }}
                    onClick={() => handleClearMapping(data.integrationFlowId)}
                  >
                    <i className="fas fa-trash me-1" />Clear
                  </button>
                )}
              </div>
            )}
          />
        </DataGrid>
      </div>

      {/* ── New Integration Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.6)' }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 540 }}>
            <div className="modal-content" style={{ background: 'linear-gradient(135deg,#0F172A 0%,#1E293B 100%)', border: '1px solid rgba(46,134,193,.35)', borderRadius: 16 }}>
              <div className="modal-header" style={{ borderBottom: '1px solid rgba(46,134,193,.2)' }}>
                <h5 className="modal-title text-white"><i className="fas fa-plus me-2" />New Integration Flow</h5>
                <button className="btn-close btn-close-white" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label style={labelSty}>Integration Name</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.integrationName}
                    onChange={e => setForm(p => ({ ...p, integrationName: e.target.value }))}
                    style={inputSty}
                    placeholder="e.g. Order to Cash - SAP"
                  />
                </div>
                <div className="mb-3">
                  <label style={labelSty}>Platform</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.platform}
                    onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
                    style={selectSty}
                  >
                    {['Boomi', 'MuleSoft', 'SAP_IS', 'Solace', 'Custom'].map(pl => (
                      <option key={pl} value={pl}>{pl}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label style={labelSty}>Status</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    style={selectSty}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Configured">Configured</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid rgba(46,134,193,.2)' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-success btn-sm" onClick={createFlow} disabled={saving || !form.integrationName}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : 'Create Integration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Field Mapper Modal ──────────────────────────────────────────── */}
      {showGlobalMapper && (
        <div style={fullscreenOverlay}>
          <div style={modalHeader}>
            <i className="fas fa-project-diagram" style={{ color: '#06B6D4', fontSize: 18 }} />
            <h5 className="text-white mb-0" style={{ flex: 1 }}>Configure Field Mapping — Boomi Platform</h5>
            <div className="d-flex gap-2 flex-wrap">
              <button
                className="btn btn-sm btn-outline-info"
                onClick={() => reloadPlatformMapping()}
                disabled={platformMappingLoading}
              >
                {platformMappingLoading
                  ? <><span className="spinner-border spinner-border-sm me-1" />Loading…</>
                  : <><i className="fas fa-download me-1" />Load Payload</>}
              </button>
              <button className="btn btn-sm btn-outline-warning" onClick={() => setGlobalConnections([])}>
                <i className="fas fa-eraser me-1" />Clear All
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => savePlatformMappingMut.mutate(globalConnections)}
                disabled={savePlatformMappingMut.isPending}
              >
                {savePlatformMappingMut.isPending
                  ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</>
                  : <><i className="fas fa-save me-1" />Save Mapping</>}
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowGlobalMapper(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {platformMappingLoading ? (
              <div style={{ textAlign: 'center', paddingTop: 80 }}>
                <span className="spinner-border text-info" />
                <p className="text-muted mt-3" style={{ fontSize: 13 }}>Loading platform payload…</p>
              </div>
            ) : (
              <VisualFieldMapper
                sourceFields={platformMappingData?.sourceFields ?? []}
                targetFields={platformMappingData?.targetFields ?? []}
                connections={globalConnections}
                onConnectionsChange={setGlobalConnections}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Per-Integration Mapper Modal ──────────────────────────────────────── */}
      {mapperFlowId !== null && (
        <div style={fullscreenOverlay}>
          {/* Header */}
          <div style={modalHeader}>
            <i className="fas fa-code-branch" style={{ color: '#8B5CF6', fontSize: 16 }} />
            <h5 className="text-white mb-0" style={{ flex: 1 }}>
              Integration Mapping
              {currentFlow && (
                <span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 14, marginLeft: 8 }}>
                  — {currentFlow.integrationName}
                </span>
              )}
            </h5>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={handleSaveIntegrationMapping}
                disabled={saveIntegrationMappingMut.isPending}
              >
                {saveIntegrationMappingMut.isPending
                  ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</>
                  : <><i className="fas fa-save me-1" />Save Mapping</>}
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setMapperFlowId(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Sidebar */}
            <div style={{
              width: sidebarOpen ? 270 : 0,
              flexShrink: 0,
              background: 'rgba(15,23,42,.97)',
              borderRight: '1px solid rgba(46,134,193,.2)',
              overflow: 'hidden',
              transition: 'width .22s ease',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(46,134,193,.15)', flexShrink: 0 }}>
                <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Business Context</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                {integrationMappingLoading ? (
                  <div style={{ textAlign: 'center', paddingTop: 40 }}><span className="spinner-border spinner-border-sm text-primary" /></div>
                ) : (
                  <>
                    <div className="mb-2">
                      <label style={labelSty}>Business Segment</label>
                      <select className="form-select form-select-sm" style={selectSty}
                        value={sidebarForm.businessSegmentId}
                        onChange={e => setSidebarField('businessSegmentId', e.target.value)}>
                        <option value="">— Select —</option>
                        {(lookups?.businessSegments ?? []).map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Brand</label>
                      <select className="form-select form-select-sm" style={selectSty}
                        value={sidebarForm.brandId}
                        onChange={e => setSidebarField('brandId', e.target.value)}>
                        <option value="">— Select —</option>
                        {filteredBrands.map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Business Process</label>
                      <select className="form-select form-select-sm" style={selectSty}
                        value={sidebarForm.processId}
                        onChange={e => setSidebarField('processId', e.target.value)}>
                        <option value="">— Select —</option>
                        {(lookups?.businessProcesses ?? []).map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Subprocess</label>
                      <select className="form-select form-select-sm" style={selectSty}
                        value={sidebarForm.subprocessId}
                        onChange={e => setSidebarField('subprocessId', e.target.value)}>
                        <option value="">— Select —</option>
                        {filteredSubprocesses.map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Country</label>
                      <select className="form-select form-select-sm" style={selectSty}
                        value={sidebarForm.countryId}
                        onChange={e => setSidebarField('countryId', e.target.value)}>
                        <option value="">— Select —</option>
                        {(lookups?.countries ?? []).map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Document Type</label>
                      <select className="form-select form-select-sm" style={selectSty}
                        value={sidebarForm.documentTypeId}
                        onChange={e => setSidebarField('documentTypeId', e.target.value)}>
                        <option value="">— Select —</option>
                        {(lookups?.documentTypes ?? []).map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Direction</label>
                      <select className="form-select form-select-sm" style={selectSty}
                        value={sidebarForm.direction}
                        onChange={e => setSidebarField('direction', e.target.value)}>
                        <option value="">— Select —</option>
                        <option value="Inbound">Inbound</option>
                        <option value="Outbound">Outbound</option>
                        <option value="Bidirectional">Bidirectional</option>
                      </select>
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Source System</label>
                      <input className="form-control form-control-sm" style={inputSty}
                        value={sidebarForm.sourceSystem}
                        onChange={e => setSidebarField('sourceSystem', e.target.value)}
                        placeholder="e.g. SAP ECC" />
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Target System</label>
                      <input className="form-control form-control-sm" style={inputSty}
                        value={sidebarForm.targetSystem}
                        onChange={e => setSidebarField('targetSystem', e.target.value)}
                        placeholder="e.g. Salesforce" />
                    </div>
                    <div className="mb-2">
                      <label style={labelSty}>Stage</label>
                      <input className="form-control form-control-sm" style={inputSty}
                        value={sidebarForm.stage}
                        onChange={e => setSidebarField('stage', e.target.value)}
                        placeholder="e.g. Production" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Sidebar toggle strip */}
            <div
              style={{ width: 18, flexShrink: 0, background: 'rgba(15,23,42,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRight: '1px solid rgba(46,134,193,.12)' }}
              onClick={() => setSidebarOpen(p => !p)}
            >
              <i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`} style={{ color: '#475569', fontSize: 9 }} />
            </div>

            {/* Visual mapper area */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
              {integrationMappingLoading ? (
                <div style={{ textAlign: 'center', paddingTop: 80 }}>
                  <span className="spinner-border text-primary" />
                  <p className="text-muted mt-3" style={{ fontSize: 13 }}>Loading field mapping…</p>
                </div>
              ) : (
                <VisualFieldMapper
                  sourceFields={integrationFieldMappingData?.sourceFields ?? []}
                  targetFields={integrationFieldMappingData?.targetFields ?? []}
                  connections={mapperConnections}
                  onConnectionsChange={setMapperConnections}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
