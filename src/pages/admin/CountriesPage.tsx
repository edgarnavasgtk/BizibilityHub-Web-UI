import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DataGrid, { Column, FilterRow, SearchPanel, Paging, Pager, Summary, TotalItem } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

interface Country {
  id: number
  countryCode: string
  countryName: string
  region: string
  isActive: boolean
  createdAt: string
}

const REGION_COLORS: Record<string, string> = {
  Africa:    'danger',
  Americas:  'primary',
  Asia:      'warning',
  Europe:    'info',
  Oceania:   'success',
}

function RegionBadge({ value }: { value: string }) {
  const c = REGION_COLORS[value] ?? 'secondary'
  return <span className={`badge bg-${c}`} style={{ fontSize: 11 }}>{value}</span>
}

function CodeBadge({ value }: { value: string }) {
  return (
    <code style={{ background: 'rgba(46,134,193,.15)', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
      {value}
    </code>
  )
}

export default function CountriesPage() {
  const qc = useQueryClient()
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data: countries, isFetching } = useQuery<Country[]>({
    queryKey: ['admin', 'countries'],
    queryFn: () => apiClient.get<Country[]>('/Admin/GetCountriesOData').then(r => r.data),
  })

  const handleSeed = async () => {
    setSeeding(true)
    setSeedMsg(null)
    try {
      const res = await apiClient.post<{ message?: string; count?: number }>('/Admin/SeedCountries')
      qc.invalidateQueries({ queryKey: ['admin', 'countries'] })
      const text =
        res.data?.message ??
        (res.data?.count != null
          ? `Countries seeded successfully — ${res.data.count} countries imported.`
          : 'Countries seeded successfully.')
      setSeedMsg({ type: 'success', text })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string }
      const text =
        axiosErr?.response?.data?.message ??
        axiosErr?.message ??
        'Seeding failed. Please try again.'
      setSeedMsg({ type: 'error', text })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-globe me-2 text-primary" />Country Management
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            Manage the list of countries used for transaction data. Seed from REST Countries API or manage individually.
          </p>
        </div>
        <button className="btn btn-success btn-sm" onClick={handleSeed} disabled={seeding}>
          {seeding
            ? <><span className="spinner-border spinner-border-sm me-2" />Seeding…</>
            : <><i className="fas fa-download me-2" />Seed Countries from API</>}
        </button>
      </div>

      {seedMsg && (
        <div
          className={`alert alert-${seedMsg.type === 'success' ? 'success' : 'danger'} alert-dismissible d-flex align-items-center mb-4`}
          role="alert"
          style={{ fontSize: 14 }}
        >
          <i className={`fas fa-${seedMsg.type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2`} />
          <span>{seedMsg.text}</span>
          <button
            type="button"
            className="btn-close ms-auto"
            onClick={() => setSeedMsg(null)}
            aria-label="Close"
          />
        </div>
      )}

      <div className="rounded overflow-hidden" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}>
        <DataGrid
          dataSource={countries ?? []}
          keyExpr="id"
          showBorders={false}
          showRowLines={true}
          rowAlternationEnabled={true}
          columnAutoWidth={true}
          allowColumnResizing={true}
          height={620}
          noDataText={isFetching ? 'Loading…' : 'No countries found — try seeding from the API'}
        >
          <FilterRow visible={true} />
          <SearchPanel visible={true} placeholder="Search countries..." width={240} />
          <Paging pageSize={25} />
          <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50, 100]} showInfo={true} />
          <Summary><TotalItem column="countryName" summaryType="count" displayFormat="{0} countries" /></Summary>

          <Column dataField="countryCode" caption="Code"         width={80}  cellRender={({ value }) => <CodeBadge value={value} />} />
          <Column dataField="countryName" caption="Country Name" minWidth={160} defaultSortOrder="asc" />
          <Column dataField="region"      caption="Region"       width={150} cellRender={({ value }) => <RegionBadge value={value} />} />
          <Column
            dataField="isActive"
            caption="Status"
            width={100}
            cellRender={({ value }) => (
              <span className={`badge ${value ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 11 }}>
                {value ? 'Active' : 'Inactive'}
              </span>
            )}
          />
          <Column dataField="createdAt" caption="Created" dataType="datetime" format="yyyy-MM-dd HH:mm" width={150} />
        </DataGrid>
      </div>
    </div>
  )
}
