import { useState, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import DataGrid, {
  Column,
  Editing,
  FilterRow,
  GroupPanel,
  Grouping,
  Paging,
  Pager,
} from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

// ── types ────────────────────────────────────────────────────────────────────

interface ProcessSla {
  businessProcessId: number
  processName: string
  expectedDuration: number | null
  warningThreshold: number | null
  criticalThreshold: number | null
  subprocessCount: number
}

interface SubprocessSla {
  businessSubprocessId: number
  businessProcessId: number
  processName: string
  subprocessName: string
  expectedDuration: number | null
  warningThreshold: number | null
  criticalThreshold: number | null
}

// ── helper ───────────────────────────────────────────────────────────────────

function fmtSec(sec: number | null | undefined): string {
  if (sec == null) return '—'
  if (sec >= 60) return (sec / 60).toFixed(1) + 'm'
  return sec + 's'
}

function DurCell({ value, color }: { value: number | null | undefined; color: string }) {
  if (value == null)
    return <span style={{ color: '#95A5A6', fontStyle: 'italic' }}>—</span>
  return <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 600, color }}>{fmtSec(value)}</span>
}

// ── card wrapper ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#1E293B',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 4px 16px rgba(0,0,0,.5)',
  border: '1px solid rgba(46,134,193,.2)',
  marginBottom: 20,
  maxWidth: 900,
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SlaConfigPage() {
  const [tab, setTab] = useState<'process' | 'subprocess'>('process')
  const [procEditing, setProcEditing] = useState(false)
  const [subEditing, setSubEditing] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procGridRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subGridRef = useRef<any>(null)

  // ── queries ──────────────────────────────────────────────────────────────

  const { data: processes = [], refetch: refetchProc } = useQuery<ProcessSla[]>({
    queryKey: ['sla-processes'],
    queryFn: async () => {
      const res = await apiClient.get<Array<{
        businessProcessId: number; processName: string
        defaultExpectedDurationMs: number | null
        defaultWarningThresholdMs: number | null
        defaultCriticalThresholdMs: number | null
        subprocessCount: number
      }>>('/Admin/GetProcessSlaData')
      return res.data.map(d => ({
        businessProcessId: d.businessProcessId,
        processName: d.processName,
        expectedDuration: d.defaultExpectedDurationMs != null ? d.defaultExpectedDurationMs / 1000 : null,
        warningThreshold: d.defaultWarningThresholdMs != null ? d.defaultWarningThresholdMs / 1000 : null,
        criticalThreshold: d.defaultCriticalThresholdMs != null ? d.defaultCriticalThresholdMs / 1000 : null,
        subprocessCount: d.subprocessCount,
      }))
    },
  })

  const { data: subprocesses = [], refetch: refetchSub } = useQuery<SubprocessSla[]>({
    queryKey: ['sla-subprocesses'],
    queryFn: async () => {
      const res = await apiClient.get<Array<{
        businessSubprocessId: number; businessProcessId: number
        processName: string; subprocessName: string
        expectedDurationMs: number | null
        warningThresholdMs: number | null
        criticalThresholdMs: number | null
      }>>('/Admin/GetSubprocessSlaData')
      return res.data.map(d => ({
        businessSubprocessId: d.businessSubprocessId,
        businessProcessId: d.businessProcessId,
        processName: d.processName,
        subprocessName: d.subprocessName,
        expectedDuration: d.expectedDurationMs != null ? d.expectedDurationMs / 1000 : null,
        warningThreshold: d.warningThresholdMs != null ? d.warningThresholdMs / 1000 : null,
        criticalThreshold: d.criticalThresholdMs != null ? d.criticalThresholdMs / 1000 : null,
      }))
    },
  })

  // ── mutations ─────────────────────────────────────────────────────────────

  const procMutation = useMutation({
    mutationFn: async (updates: object[]) => {
      const res = await apiClient.post<{ success: boolean; message?: string }>(
        '/Admin/UpdateProcessSlaBatch', updates,
      )
      return res.data
    },
  })

  const subMutation = useMutation({
    mutationFn: async (updates: object[]) => {
      const res = await apiClient.post<{ success: boolean; message?: string }>(
        '/Admin/UpdateSubprocessSlaBatch', updates,
      )
      return res.data
    },
  })

  // ── save handlers ─────────────────────────────────────────────────────────

  function saveProcessChanges() {
    const inst = procGridRef.current?.instance()
    if (!inst) return
    const changes = inst.option('editing.changes') as Array<{ type: string; key: number; data: Partial<ProcessSla> }>
    if (!changes?.length) { setProcEditing(false); return }

    const updates = changes
      .filter(c => c.type === 'update')
      .map(c => {
        const rowIdx = inst.getRowIndexByKey(c.key)
        const row = inst.getVisibleRows()[rowIdx]
        const full = { ...row?.data, ...c.data } as ProcessSla
        return {
          businessProcessId: c.key,
          defaultExpectedDurationMs: full.expectedDuration != null ? Math.round(full.expectedDuration * 1000) : null,
          defaultWarningThresholdMs: full.warningThreshold != null ? Math.round(full.warningThreshold * 1000) : null,
          defaultCriticalThresholdMs: full.criticalThreshold != null ? Math.round(full.criticalThreshold * 1000) : null,
        }
      })

    if (!updates.length) { setProcEditing(false); return }

    procMutation.mutate(updates, {
      onSuccess: r => {
        if (r.success) {
          setStatusMsg('Process SLA thresholds saved.')
          inst.cancelEditData()
          setProcEditing(false)
          refetchProc()
        } else {
          setStatusMsg('Error: ' + (r.message ?? 'Unknown'))
        }
      },
      onError: () => setStatusMsg('Failed to save changes.'),
    })
  }

  function saveSubprocessChanges() {
    const inst = subGridRef.current?.instance()
    if (!inst) return
    const changes = inst.option('editing.changes') as Array<{ type: string; key: number; data: Partial<SubprocessSla> }>
    if (!changes?.length) { setSubEditing(false); return }

    const updates = changes
      .filter(c => c.type === 'update')
      .map(c => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = inst.getVisibleRows().find((r: any) => r.rowType === 'data' && r.key === c.key)
        const full = { ...row?.data, ...c.data } as SubprocessSla
        return {
          businessSubprocessId: c.key,
          expectedDurationMs: full.expectedDuration != null ? Math.round(full.expectedDuration * 1000) : null,
          warningThresholdMs: full.warningThreshold != null ? Math.round(full.warningThreshold * 1000) : null,
          criticalThresholdMs: full.criticalThreshold != null ? Math.round(full.criticalThreshold * 1000) : null,
        }
      })

    if (!updates.length) { setSubEditing(false); return }

    subMutation.mutate(updates, {
      onSuccess: r => {
        if (r.success) {
          setStatusMsg('Subprocess SLA thresholds saved.')
          inst.cancelEditData()
          setSubEditing(false)
          refetchSub()
        } else {
          setStatusMsg('Error: ' + (r.message ?? 'Unknown'))
        }
      },
      onError: () => setStatusMsg('Failed to save changes.'),
    })
  }

  // ── render ────────────────────────────────────────────────────────────────

  const navLinkStyle = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer',
    padding: '10px 20px',
    color: active ? '#FFFFFF' : '#BDC3C7',
    background: active ? 'rgba(46,134,193,.2)' : 'transparent',
    borderBottom: active ? '2px solid #2E86C1' : '2px solid transparent',
    border: 'none',
    borderRadius: 0,
    fontWeight: active ? 600 : 400,
    transition: 'all .15s',
  })

  return (
    <div style={{ padding: '20px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#FFF', fontWeight: 700, margin: 0 }}>
            <i className="fas fa-tachometer-alt me-2" />SLA Configuration
          </h2>
          <p style={{ color: '#BDC3C7', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            Set thresholds in seconds:&nbsp;
            <span className="text-success">Expected</span> (green)&nbsp;|&nbsp;
            <span className="text-warning">Warning</span> (yellow)&nbsp;|&nbsp;
            <span className="text-danger">Critical</span> (red)
          </p>
        </div>
        {statusMsg && (
          <span style={{ color: statusMsg.startsWith('Error') ? '#E74C3C' : '#2ECC71', fontSize: 13 }}>
            {statusMsg}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid rgba(46,134,193,.3)', marginBottom: 20, display: 'flex' }}>
        <button style={navLinkStyle(tab === 'process')} onClick={() => setTab('process')}>
          <i className="fas fa-sitemap me-2" />Business Processes
        </button>
        <button style={navLinkStyle(tab === 'subprocess')} onClick={() => setTab('subprocess')}>
          <i className="fas fa-cogs me-2" />Business Subprocesses
        </button>
      </div>

      {/* ── Process tab ─────────────────────────────────────────────────── */}
      {tab === 'process' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <div>
              <h5 style={{ color: '#FFF', fontWeight: 600, margin: 0 }}>
                <i className="fas fa-sitemap me-2" />Business Process Defaults
              </h5>
              <span style={{ color: '#7f8c8d', fontSize: 12, fontStyle: 'italic' }}>
                These values apply to all subprocesses unless overridden
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!procEditing ? (
                <button
                  className="btn btn-sm"
                  style={{ background: 'linear-gradient(135deg,#3498DB,#2E86C1)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 13 }}
                  onClick={() => setProcEditing(true)}
                >
                  <i className="fas fa-edit me-1" />Edit All
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'linear-gradient(135deg,#27AE60,#1E8449)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 13 }}
                    onClick={saveProcessChanges}
                  >
                    <i className="fas fa-save me-1" />Save
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'linear-gradient(135deg,#7f8c8d,#6c7a7d)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 13 }}
                    onClick={() => {
                      procGridRef.current?.instance()?.cancelEditData()
                      setProcEditing(false)
                    }}
                  >
                    <i className="fas fa-times me-1" />Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          <DataGrid
            ref={procGridRef}
            dataSource={processes}
            keyExpr="businessProcessId"
            showBorders
            showRowLines
            showColumnLines
            rowAlternationEnabled
            hoverStateEnabled
            columnAutoWidth
          >
            <FilterRow visible />
            <Editing mode="batch" allowUpdating={procEditing} allowDeleting={false} allowAdding={false} />
            <Paging pageSize={20} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 20, 50]} showInfo />

            <Column
              dataField="processName"
              caption="Process Name"
              width={280}
              allowEditing={false}
              cellRender={({ value }) => (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 5,
                    background: 'linear-gradient(135deg,#8E44AD,#9B59B6)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11,
                  }}>
                    <i className="fas fa-sitemap" />
                  </span>
                  <span>{value}</span>
                </div>
              )}
            />
            <Column
              dataField="expectedDuration"
              caption="Expected (sec)"
              dataType="number"
              width={140}
              alignment="center"
              cellRender={({ value }) => <DurCell value={value} color="#2ECC71" />}
              editorOptions={{ placeholder: 'e.g., 30' }}
            />
            <Column
              dataField="warningThreshold"
              caption="Warning (sec)"
              dataType="number"
              width={140}
              alignment="center"
              cellRender={({ value }) => <DurCell value={value} color="#F1C40F" />}
              editorOptions={{ placeholder: 'e.g., 60' }}
            />
            <Column
              dataField="criticalThreshold"
              caption="Critical (sec)"
              dataType="number"
              width={140}
              alignment="center"
              cellRender={({ value }) => <DurCell value={value} color="#E74C3C" />}
              editorOptions={{ placeholder: 'e.g., 120' }}
            />
            <Column
              dataField="subprocessCount"
              caption="Subprocesses"
              width={110}
              allowEditing={false}
              alignment="center"
            />
          </DataGrid>
        </div>
      )}

      {/* ── Subprocess tab ──────────────────────────────────────────────── */}
      {tab === 'subprocess' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <div>
              <h5 style={{ color: '#FFF', fontWeight: 600, margin: 0 }}>
                <i className="fas fa-cogs me-2" />Business Subprocess Overrides
              </h5>
              <span style={{ color: '#7f8c8d', fontSize: 12, fontStyle: 'italic' }}>
                Leave empty to inherit from parent process
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!subEditing ? (
                <button
                  className="btn btn-sm"
                  style={{ background: 'linear-gradient(135deg,#3498DB,#2E86C1)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 13 }}
                  onClick={() => setSubEditing(true)}
                >
                  <i className="fas fa-edit me-1" />Edit All
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'linear-gradient(135deg,#27AE60,#1E8449)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 13 }}
                    onClick={saveSubprocessChanges}
                  >
                    <i className="fas fa-save me-1" />Save
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'linear-gradient(135deg,#7f8c8d,#6c7a7d)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 13 }}
                    onClick={() => {
                      subGridRef.current?.instance()?.cancelEditData()
                      setSubEditing(false)
                    }}
                  >
                    <i className="fas fa-times me-1" />Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          <DataGrid
            ref={subGridRef}
            dataSource={subprocesses}
            keyExpr="businessSubprocessId"
            showBorders
            showRowLines
            showColumnLines
            rowAlternationEnabled
            hoverStateEnabled
            columnAutoWidth
          >
            <FilterRow visible />
            <GroupPanel visible={false} />
            <Grouping autoExpandAll />
            <Editing mode="batch" allowUpdating={subEditing} allowDeleting={false} allowAdding={false} />
            <Paging pageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />

            <Column
              dataField="processName"
              caption="Parent Process"
              width={200}
              allowEditing={false}
              groupIndex={0}
            />
            <Column
              dataField="subprocessName"
              caption="Subprocess Name"
              width={280}
              allowEditing={false}
              cellRender={({ value }) => (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 5,
                    background: 'linear-gradient(135deg,#3498DB,#2E86C1)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11,
                  }}>
                    <i className="fas fa-cog" />
                  </span>
                  <span>{value}</span>
                </div>
              )}
            />
            <Column
              dataField="expectedDuration"
              caption="Expected (sec)"
              dataType="number"
              width={140}
              alignment="center"
              cellRender={({ value }) => <DurCell value={value} color="#2ECC71" />}
              editorOptions={{ placeholder: 'Inherit' }}
            />
            <Column
              dataField="warningThreshold"
              caption="Warning (sec)"
              dataType="number"
              width={140}
              alignment="center"
              cellRender={({ value }) => <DurCell value={value} color="#F1C40F" />}
              editorOptions={{ placeholder: 'Inherit' }}
            />
            <Column
              dataField="criticalThreshold"
              caption="Critical (sec)"
              dataType="number"
              width={140}
              alignment="center"
              cellRender={({ value }) => <DurCell value={value} color="#E74C3C" />}
              editorOptions={{ placeholder: 'Inherit' }}
            />
          </DataGrid>
        </div>
      )}
    </div>
  )
}
