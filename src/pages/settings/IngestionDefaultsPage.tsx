import DataGrid, {
  Column, Editing, Paging, Pager, FilterRow, SearchPanel,
} from 'devextreme-react/data-grid'
import CustomStore from 'devextreme/data/custom_store'
import { useCallback, useMemo, useState } from 'react'
import notify from 'devextreme/ui/notify'
import apiClient from '../../services/apiClient'

const TABLE_ICONS: Record<string, string> = {
  Environments:         'fa-server',
  Brands:               'fa-tag',
  BusinessSegments:     'fa-sitemap',
  BusinessProcesses:    'fa-cog',
  BusinessSubprocesses: 'fa-cogs',
  DocumentTypes:        'fa-file-alt',
  Countries:            'fa-globe',
}

const TABLES_WITH_CODE = new Set(['Brands', 'Countries'])

function StatusBadge({ value }: { value: boolean }) {
  return (
    <span style={{ background: value ? 'linear-gradient(135deg,#2ECC71,#27AE60)' : 'linear-gradient(135deg,#E74C3C,#C0392B)', color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
      {value ? 'Active' : 'Inactive'}
    </span>
  )
}

export default function IngestionDefaultsPage() {
  // Tracks which table is currently in edit mode so the contextual info box can be shown
  const [editingTableName, setEditingTableName] = useState<string | null>(null)

  const store = useMemo(() => new CustomStore({
    key: 'id',
    load: () => apiClient.get('/Admin/GetIngestionDefaultsOData').then(r => r.data),
  }), [])

  const handleRowUpdating = useCallback((e: any) => {
    e.cancel = true
    // Explicitly preserve createdAt from oldData, matching the Razor hidden-field behaviour
    // where CreatedAt is always posted back unchanged via <input type="hidden" asp-for="CreatedAt" />.
    const merged = { ...e.oldData, ...e.newData, createdAt: e.oldData.createdAt }
    apiClient.post('/Admin/UpdateIngestionDefault', merged)
      .then((r: any) => {
        if (r.data && r.data.success === false) throw new Error(r.data.message || 'Update failed')
      })
      .then(() => {
        notify('Default value updated successfully', 'success', 3000)
        ;(e.component as any).refresh()
      })
      .catch((err: any) => {
        notify(err?.message ?? 'Failed to update default value', 'error', 3000)
      })
  }, [])

  // FIX: match Razor onEditorPreparing — show the editor but disabled with placeholder
  // "N/A for this table" for tables that have no code field, instead of cancelling the
  // editor entirely (e.cancel=true) which hides the cell.
  const handleEditorPreparing = useCallback((e: any) => {
    if (e.dataField === 'defaultCode' && !TABLES_WITH_CODE.has(e.row?.data?.tableName)) {
      e.editorOptions = { ...e.editorOptions, disabled: true, placeholder: 'N/A for this table' }
    }
  }, [])

  // Show the contextual 'How This Works' info box (present on Razor EditIngestionDefault.cshtml)
  // when a row enters edit mode, and clear it when editing ends.
  const handleEditingStart = useCallback((e: any) => {
    setEditingTableName(e.data?.tableName ?? null)
  }, [])

  const handleEditCanceled = useCallback(() => {
    setEditingTableName(null)
  }, [])

  const handleRowUpdated = useCallback(() => {
    setEditingTableName(null)
  }, [])

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="mb-3">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-cogs me-2" />Ingestion Default Values
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>
          Configure how null or unknown values should be displayed for each master data table during data ingestion
        </p>
      </div>

      {/* Info box */}
      <div
        className="rounded p-3 mb-4"
        style={{ background: 'linear-gradient(135deg,rgba(30,41,59,.9),rgba(46,134,193,.1))', border: '1px solid rgba(46,134,193,.3)' }}
      >
        <h5 className="text-white mb-2"><i className="fas fa-info-circle me-2" />About Default Values</h5>
        <p className="text-muted mb-0" style={{ fontSize: 14, lineHeight: 1.6 }}>
          When the ingestion service encounters null or unknown values for foreign key relationships,
          it creates placeholder records using these configurable defaults. Click the edit icon on any row to modify values.
          <strong style={{ color: '#5DADE2' }}> Note:</strong> The "Default Code" column only applies to{' '}
          <strong style={{ color: '#5DADE2' }}>Brands</strong> and <strong style={{ color: '#5DADE2' }}>Countries</strong> tables.
        </p>
      </div>

      {/* Contextual 'How This Works' info box — equivalent to the info box on Razor EditIngestionDefault.cshtml.
          Appears when a row is in edit mode and shows the table-specific context. */}
      {editingTableName && (
        <div
          className="rounded p-3 mb-3"
          style={{ background: 'rgba(52,152,219,.1)', border: '1px solid rgba(52,152,219,.3)' }}
        >
          <h6 style={{ color: '#3498DB', marginBottom: 10 }}>
            <i className="fas fa-info-circle me-2" />How This Works
          </h6>
          <p className="mb-0" style={{ color: '#95A5A6', fontSize: 13 }}>
            When the ingestion service processes data and encounters a missing or null value for{' '}
            <strong style={{ color: '#5DADE2' }}>{editingTableName}</strong>, it will create a placeholder record
            using the default name and code configured above. This ensures foreign key relationships are maintained
            while clearly identifying missing data in your reports.
          </p>
        </div>
      )}

      {/* Grid */}
      <div
        className="rounded p-3"
        style={{ background: '#1E293B', border: '1px solid rgba(46,134,193,.2)', boxShadow: '0 4px 16px rgba(0,0,0,.5)' }}
      >
        <DataGrid
          dataSource={store}
          showBorders
          showRowLines
          showColumnLines
          rowAlternationEnabled
          hoverStateEnabled
          columnAutoWidth
          wordWrapEnabled
          onRowUpdating={handleRowUpdating}
          onEditorPreparing={handleEditorPreparing}
          onEditingStart={handleEditingStart}
          onEditCanceled={handleEditCanceled}
          onRowUpdated={handleRowUpdated}
        >
          <Editing mode="row" allowUpdating useIcons />
          <FilterRow visible />
          <SearchPanel visible width={240} placeholder="Search..." />
          <Paging defaultPageSize={25} />
          <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />

          <Column
            dataField="tableName"
            caption="Table"
            width={200}
            allowEditing={false}
            cellRender={({ value }) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#3498DB,#2E86C1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, flexShrink: 0 }}>
                  <i className={`fas ${TABLE_ICONS[value] || 'fa-table'}`} />
                </div>
                <span>{value}</span>
              </div>
            )}
          />

          <Column
            dataField="defaultName"
            caption="Default Name"
            validationRules={[{ type: 'required', message: 'Default Name is required' }]}
          />

          <Column
            dataField="defaultCode"
            caption="Default Code"
            width={150}
            cellRender={({ value, data }) =>
              TABLES_WITH_CODE.has(data.tableName)
                ? value
                  ? <span style={{ fontFamily: 'Consolas,monospace', background: 'rgba(52,152,219,.2)', padding: '2px 8px', borderRadius: 4, color: '#3498DB' }}>{value}</span>
                  : <span style={{ color: '#95A5A6', fontStyle: 'italic' }}>Not set</span>
                : <span style={{ color: '#95A5A6', fontStyle: 'italic' }}>N/A</span>
            }
          />

          <Column dataField="defaultDescription" caption="Description" />

          <Column
            dataField="isActive"
            caption="Active"
            width={100}
            dataType="boolean"
            cellRender={({ value }) => <StatusBadge value={value} />}
          />

          <Column
            dataField="updatedAt"
            caption="Last Updated"
            width={180}
            allowEditing={false}
            dataType="datetime"
            format="yyyy-MM-dd HH:mm"
          />
        </DataGrid>
      </div>
    </div>
  )
}
