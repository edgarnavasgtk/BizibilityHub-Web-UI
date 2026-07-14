import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import DataGrid, {
  Column,
  Editing,
  Export,
  FilterRow,
  HeaderFilter,
  SearchPanel,
  MasterDetail,
  Paging,
  Pager,
} from 'devextreme-react/data-grid'
import { exportDataGrid } from 'devextreme/excel_exporter'
import { Workbook } from 'exceljs'
import type { ExportingEvent } from 'devextreme/ui/data_grid'
import Switch from 'devextreme-react/switch'
import apiClient from '../../services/apiClient'

// ── types ─────────────────────────────────────────────────────────────────────

interface RuleRow {
  id: number
  ruleName: string
  description: string | null
  isActive: boolean
  businessSegment: string | null
  businessProcess: string | null
  businessSubprocess: string | null
  businessProcessStage: string | null
  originalLoggerSystem: string | null
  originalSourceSystem: string | null
  originalTargetSystem: string | null
  priority: number
  createdAt: string
  triggerConditions: string | null
  fieldSubstitutions: string | null
}

interface RuleDetail {
  ruleName: string
  description: string | null
  isActive: boolean
  priority: number
  createdAt: string | null
  createdBy: string | null
  updatedAt: string | null
  updatedBy: string | null
  triggerConditions: string | null
  fieldSubstitutions: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

interface Condition {
  label: string; value: string; icon: string; faIcon: string
}
interface Substitution {
  label: string; newValue: string; icon: string; faIcon: string
}

function parseConditions(json: string | null): Condition[] {
  try {
    const raw = JSON.parse(json ?? '{}')
    const mapping: Record<string, { label: string; icon: string; faIcon: string }> = {
      'BusinessSegment.SegmentName': { label: 'Business Segment', icon: 'segment', faIcon: 'fa-layer-group' },
      BusinessSegment:              { label: 'Business Segment', icon: 'segment', faIcon: 'fa-layer-group' },
      'BusinessProcess.ProcessName': { label: 'Business Process', icon: 'process', faIcon: 'fa-cogs' },
      BusinessProcess:              { label: 'Business Process', icon: 'process', faIcon: 'fa-cogs' },
      'BusinessSubprocess.SubprocessName': { label: 'Subprocess', icon: 'subprocess', faIcon: 'fa-sitemap' },
      BusinessSubprocess:           { label: 'Subprocess', icon: 'subprocess', faIcon: 'fa-sitemap' },
      BusinessProcessStage:         { label: 'Process Stage', icon: 'stage', faIcon: 'fa-tasks' },
    }
    return Object.entries(raw).map(([k, v]) => {
      const m = mapping[k] ?? { label: k, icon: 'stage', faIcon: 'fa-tag' }
      return { ...m, value: String(v) }
    })
  } catch {
    return []
  }
}

function parseSubstitutions(json: string | null): Substitution[] {
  try {
    const raw = JSON.parse(json ?? '{}')
    const mapping: Record<string, { label: string; icon: string; faIcon: string }> = {
      LoggerSystem: { label: 'Logger System', icon: 'logger', faIcon: 'fa-server' },
      SourceSystem: { label: 'Source System', icon: 'source', faIcon: 'fa-sign-out-alt' },
      TargetSystem: { label: 'Target System', icon: 'target', faIcon: 'fa-sign-in-alt' },
    }
    return Object.entries(raw)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        const norm = Object.keys(mapping).find(mk => mk.toLowerCase() === k.toLowerCase()) ?? k
        const m = mapping[norm] ?? { label: k, icon: 'logger', faIcon: 'fa-exchange-alt' }
        return { ...m, newValue: String(v) }
      })
  } catch {
    return []
  }
}

// ── sub-components ────────────────────────────────────────────────────────────

const COND_COLORS: Record<string, { bg: string; color: string }> = {
  segment:    { bg: '#e3f2fd', color: '#1976d2' },
  process:    { bg: '#e8f5e9', color: '#388e3c' },
  subprocess: { bg: '#fff3e0', color: '#f57c00' },
  stage:      { bg: '#fce4ec', color: '#c2185b' },
}
const SUB_COLORS: Record<string, { bg: string; color: string }> = {
  logger: { bg: '#e0f7fa', color: '#00838f' },
  source: { bg: '#e8f5e9', color: '#2e7d32' },
  target: { bg: '#fff8e1', color: '#ff8f00' },
}

function SubstitutionsBadges({ data }: { data: { data: RuleRow } }) {
  const row = data.data
  const subs: string[] = []
  if (row.originalLoggerSystem) subs.push('Logger')
  if (row.originalSourceSystem) subs.push('Source')
  if (row.originalTargetSystem) subs.push('Target')

  const badgeColor: Record<string, string> = {
    Logger: '#0dcaf0',
    Source: '#198754',
    Target: '#ffc107',
  }

  const items = parseConditions(row.triggerConditions)
  const subst = parseSubstitutions(row.fieldSubstitutions)

  return (
    <div style={{ padding: '12px 24px', background: '#f8f9fa', borderLeft: '4px solid #2E86C1' }}>
      <strong style={{ color: '#333', fontSize: 13 }}>
        <i className="fas fa-exchange-alt me-2" />Field Substitutions
      </strong>

      {subst.length === 0 ? (
        <p style={{ color: '#6c757d', fontSize: 13, marginTop: 8 }}>No field substitutions defined.</p>
      ) : (
        <table style={{ marginTop: 10, maxWidth: 500, fontSize: 12, borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ background: '#e9ecef' }}>
              <th style={{ padding: '6px 10px', width: 150, textAlign: 'left', color: '#333' }}>Field</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', color: '#333' }}>Translates To</th>
            </tr>
          </thead>
          <tbody>
            {subst.map(s => (
              <tr key={s.label}>
                <td style={{ padding: '5px 10px', color: '#333', borderBottom: '1px solid #eee' }}>{s.label}</td>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid #eee' }}>
                  <span style={{
                    background: SUB_COLORS[s.icon]?.bg ?? '#eee',
                    color: SUB_COLORS[s.icon]?.color ?? '#333',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    {s.newValue}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <strong style={{ color: '#333', fontSize: 12 }}>Conditions</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {items.map(c => (
              <div key={c.label} style={{
                display: 'flex', alignItems: 'center',
                background: '#fff', border: '1px solid #dee2e6',
                borderRadius: 8, padding: '8px 12px', boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 8, fontSize: 13,
                  background: COND_COLORS[c.icon]?.bg ?? '#eee',
                  color: COND_COLORS[c.icon]?.color ?? '#333',
                }}>
                  <i className={`fas ${c.faIcon}`} />
                </span>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#6c757d', fontWeight: 600, letterSpacing: .5 }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 500 }}>{c.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subs.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {subs.map(s => (
            <span key={s} style={{
              background: badgeColor[s] ?? '#6c757d',
              color: s === 'Target' ? '#000' : '#fff',
              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── RuleDetailsModal ──────────────────────────────────────────────────────────

function RuleDetailsModal({
  ruleId,
  onClose,
}: {
  ruleId: number | null
  onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery<RuleDetail | null>({
    queryKey: ['rule-detail', ruleId],
    queryFn: async () => {
      if (!ruleId) return null
      const res = await apiClient.get<{ success: boolean; rule: RuleDetail }>(
        `/TranslationRules/GetRuleDetails?id=${ruleId}`,
      )
      return res.data.success ? res.data.rule : null
    },
    enabled: ruleId != null,
  })

  if (!ruleId) return null

  const conditions = parseConditions(data?.triggerConditions ?? null)
  const substitutions = parseSubstitutions(data?.fieldSubstitutions ?? null)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1E293B', borderRadius: 12,
          border: '1px solid rgba(46,134,193,.3)',
          width: '100%', maxWidth: 760,
          maxHeight: '90vh', overflowY: 'auto',
          padding: 0, boxShadow: '0 20px 60px rgba(0,0,0,.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(46,134,193,.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ color: '#FFF', margin: 0 }}>
            <i className="fas fa-exchange-alt me-2" />Translation Rule Details
          </h5>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: 24 }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div className="spinner-border text-primary" />
              <div style={{ marginTop: 8, color: '#BDC3C7' }}>Loading rule details…</div>
            </div>
          )}

          {(isError || (!isLoading && !data)) && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <i className="fas fa-exclamation-triangle text-warning" style={{ fontSize: 48 }} />
              <h5 style={{ color: '#94A3B8', marginTop: 12 }}>Rule Not Found</h5>
              <p style={{ color: '#94A3B8' }}>No translation rule found for this ID.</p>
            </div>
          )}

          {data && (
            <>
              {/* Rule header */}
              <div style={{ background: 'linear-gradient(135deg,#f8f9fa,#e9ecef)', borderRadius: 8, padding: 20, borderLeft: '4px solid #2E86C1', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ color: '#1a1a2e', fontWeight: 600, marginBottom: 4 }}>{data.ruleName || 'Unnamed Rule'}</h4>
                    <p style={{ color: '#6c757d', marginBottom: 0, fontSize: 14 }}>{data.description || 'No description provided'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-block', marginBottom: 8,
                      background: data.isActive ? '#198754' : '#6c757d',
                      color: '#fff', padding: '3px 10px', borderRadius: 4, fontSize: 12,
                    }}>
                      {data.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <div>
                      <span style={{ background: '#6c757d', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                        Priority: {data.priority ?? 100}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conditions */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '2px solid rgba(255,255,255,.15)' }}>
                  <i className="fas fa-filter me-2" style={{ color: '#5DADE2' }} />
                  <span style={{ color: '#FFF', fontWeight: 600 }}>When to Apply This Rule</span>
                  <small style={{ color: 'rgba(255,255,255,.6)', marginLeft: 8 }}>(All conditions must match)</small>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {conditions.length === 0
                    ? <p style={{ color: '#6c757d', fontStyle: 'italic' }}>No matching conditions defined</p>
                    : conditions.map(c => (
                      <div key={c.label} style={{
                        display: 'flex', alignItems: 'center',
                        background: '#fff', border: '1px solid #dee2e6',
                        borderRadius: 8, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                      }}>
                        <span style={{
                          width: 32, height: 32, borderRadius: 6, marginRight: 10, fontSize: 14,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: COND_COLORS[c.icon]?.bg, color: COND_COLORS[c.icon]?.color,
                        }}>
                          <i className={`fas ${c.faIcon}`} />
                        </span>
                        <div>
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#6c757d', fontWeight: 600, letterSpacing: .5 }}>{c.label}</div>
                          <div style={{ fontSize: '0.9rem', color: '#1a1a2e', fontWeight: 500 }}>{c.value}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>

              {/* Transformations */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '2px solid rgba(40,167,69,.3)' }}>
                  <i className="fas fa-magic me-2" style={{ color: '#5cb85c' }} />
                  <span style={{ color: '#FFF', fontWeight: 600 }}>What Gets Changed</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {substitutions.length === 0
                    ? <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
                        <i className="fas fa-info-circle me-2" />No field transformations defined
                      </p>
                    : substitutions.map(s => (
                      <div key={s.label} style={{
                        display: 'flex', alignItems: 'center',
                        background: 'linear-gradient(90deg,#fff,#f0fff4)',
                        border: '1px solid #c3e6cb', borderRadius: 8, padding: '14px 18px',
                      }}>
                        <span style={{
                          width: 36, height: 36, borderRadius: 8, marginRight: 14, fontSize: 16,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: SUB_COLORS[s.icon]?.bg, color: SUB_COLORS[s.icon]?.color,
                        }}>
                          <i className={`fas ${s.faIcon}`} />
                        </span>
                        <div>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#6c757d', fontWeight: 600, letterSpacing: .5, marginBottom: 4 }}>
                            {s.label}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <i className="fas fa-long-arrow-alt-right" style={{ color: '#28a745', fontSize: '1.25rem', marginRight: 12 }} />
                            <span style={{ background: '#28a745', color: '#fff', padding: '6px 14px', borderRadius: 20, fontWeight: 600, fontSize: '0.85rem' }}>
                              {s.newValue}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>

              {/* Audit */}
              <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '12px 16px', borderTop: '1px solid #e9ecef' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <small style={{ color: '#6c757d' }}>
                    <i className="fas fa-plus-circle me-1" />Created:{' '}
                    {data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '—'}
                    {data.createdBy ? ` by ${data.createdBy}` : ''}
                  </small>
                  <small style={{ color: '#6c757d' }}>
                    <i className="fas fa-edit me-1" />Updated:{' '}
                    {data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : 'Never'}
                    {data.updatedBy ? ` by ${data.updatedBy}` : ''}
                  </small>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(46,134,193,.3)', textAlign: 'right' }}>
          <button onClick={onClose} style={{ background: '#6c757d', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
            <i className="fas fa-times me-1" />Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function TranslationRulesPage() {
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null)
  const qc = useQueryClient()

  const { data: rules = [], refetch } = useQuery<RuleRow[]>({
    queryKey: ['translation-rules'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: RuleRow[] }>(
        '/TranslationRules/GetRulesAsGridData',
      )
      return res.data.success ? res.data.data : []
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const form = new FormData()
      form.append('RuleId', String(id))
      form.append('IsActive', String(isActive))
      const res = await apiClient.put<{ success: boolean; error?: string }>(
        '/TranslationRules/ToggleRuleStatus', form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['translation-rules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete<{ success: boolean; error?: string }>(
        `/TranslationRules/DeleteTranslationRule?id=${id}`,
      )
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['translation-rules'] }),
  })

  function handleDelete(id: number, name: string) {
    if (!confirm(`Are you sure you want to delete the rule "${name}"?`)) return
    deleteMutation.mutate(id)
  }

  function handleExporting(e: ExportingEvent<RuleRow, number>) {
    const workbook = new Workbook()
    const worksheet = workbook.addWorksheet('Translation Rules')

    exportDataGrid({
      component: e.component,
      worksheet,
      autoFilterEnabled: true,
      customizeCell: ({ gridCell, excelCell }) => {
        if (gridCell?.rowType === 'header') {
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2E86C1' },
          }
          excelCell.font = { color: { argb: 'FFFFFFFF' }, bold: true }
        }
      },
    }).then(() =>
      workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'TranslationRules.xlsx'
        anchor.click()
        URL.revokeObjectURL(url)
      }),
    )

    e.cancel = true
  }

  return (
    <div style={{ padding: 20, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: '#FFF', fontWeight: 600, marginBottom: 4 }}>
            <i className="fas fa-exchange-alt me-2" />Translation Rules
          </h2>
          <p style={{ color: '#BDC3C7', margin: 0 }}>Manage field translation rules for data ingestion</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to="/settings/translation-rules/create"
            className="btn btn-sm"
            style={{ background: '#198754', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            <i className="fas fa-plus me-1" />Create New Rule
          </Link>
          <button
            className="btn btn-sm"
            style={{ background: '#2E86C1', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 6, fontWeight: 600, fontSize: 13 }}
            onClick={() => refetch()}
          >
            <i className="fas fa-sync me-1" />Refresh
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ background: '#1E293B', borderRadius: 12, border: '1px solid rgba(46,134,193,.3)', overflow: 'hidden' }}>
        <DataGrid
          dataSource={rules}
          keyExpr="id"
          showBorders
          showRowLines
          rowAlternationEnabled
          columnAutoWidth={false}
          wordWrapEnabled
          height="calc(100vh - 200px)"
          onExporting={handleExporting}
        >
          <Export enabled />
          <FilterRow visible />
          <HeaderFilter visible />
          <SearchPanel visible width={300} placeholder="Search rules…" />
          <Editing allowUpdating={false} allowDeleting={false} allowAdding={false} />
          <Paging pageSize={10} />
          <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50, 100]} showInfo showNavigationButtons />
          <MasterDetail enabled component={SubstitutionsBadges} />

          <Column
            dataField="isActive"
            caption="Status"
            width={90}
            alignment="center"
            cellRender={({ data }: { data: RuleRow }) => (
              <Switch
                value={data.isActive}
                width={55}
                switchedOnText="ON"
                switchedOffText="OFF"
                onValueChanged={e => toggleMutation.mutate({ id: data.id, isActive: e.value })}
              />
            )}
          />
          <Column dataField="businessSegment" caption="Segment" width={120} />
          <Column dataField="businessProcess" caption="Process" width={130} />
          <Column dataField="businessSubprocess" caption="Subprocess" width={200} />
          <Column dataField="businessProcessStage" caption="Stage" width={350} />
          <Column
            caption="Substitutions"
            width={170}
            allowFiltering={false}
            allowSorting={false}
            cellRender={({ data }: { data: RuleRow }) => {
              const badges: Array<{ label: string; bg: string; color?: string }> = []
              if (data.originalLoggerSystem) badges.push({ label: 'Logger', bg: '#0dcaf0' })
              if (data.originalSourceSystem) badges.push({ label: 'Source', bg: '#198754' })
              if (data.originalTargetSystem) badges.push({ label: 'Target', bg: '#ffc107', color: '#000' })
              if (!badges.length)
                return <span style={{ color: '#6c757d' }}>—</span>
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {badges.map(b => (
                    <span key={b.label} style={{ background: b.bg, color: b.color ?? '#fff', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {b.label}
                    </span>
                  ))}
                </div>
              )
            }}
          />
          <Column dataField="priority" caption="Priority" width={75} alignment="center" dataType="number" />
          <Column dataField="createdAt" caption="Created" width={110} dataType="date" format="MMM dd, yyyy" />
          <Column
            caption="Actions"
            width={90}
            alignment="center"
            allowFiltering={false}
            allowSorting={false}
            cellRender={({ data }: { data: RuleRow }) => (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                <button
                  title="View Details"
                  onClick={e => { e.stopPropagation(); setSelectedRuleId(data.id) }}
                  style={{ background: 'none', border: '1px solid #0dcaf0', color: '#0dcaf0', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 12 }}
                >
                  <i className="fas fa-eye" />
                </button>
                <button
                  title="Delete Rule"
                  onClick={e => { e.stopPropagation(); handleDelete(data.id, data.ruleName) }}
                  style={{ background: 'none', border: '1px solid #dc3545', color: '#dc3545', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 12 }}
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            )}
          />
        </DataGrid>
      </div>

      {/* Details modal */}
      {selectedRuleId != null && (
        <RuleDetailsModal ruleId={selectedRuleId} onClose={() => setSelectedRuleId(null)} />
      )}
    </div>
  )
}
