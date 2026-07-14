import DataGrid, {
  Column, Paging, Pager, FilterRow, ColumnChooser,
  HeaderFilter,
} from 'devextreme-react/data-grid'
import FiltersSidebar from '../../components/common/FiltersSidebar'
import { useTransactions, useTransactionFilters } from '../../hooks/useTransactions'
import { useDashboardFilterOptions } from '../../hooks/useDashboard'

const TIME_MINUTES = [
  { value: 60,   label: 'Last 60 min' },
  { value: 180,  label: 'Last 3 hrs' },
  { value: 360,  label: 'Last 6 hrs' },
  { value: 720,  label: 'Last 12 hrs' },
  { value: 1440, label: 'Last 24 hrs' },
  { value: 2880, label: 'Last 48 hrs' },
  { value: 10080,label: 'Last 7 days' },
]

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:    'success',
  FAILED:     'danger',
  ERROR:      'danger',
  TIMEOUT:    'danger',
  PROCESSING: 'warning',
  PENDING:    'secondary',
  CANCELLED:  'secondary',
}

function StatusBadge({ value }: { value: string }) {
  const variant = STATUS_COLORS[value] ?? 'info'
  return <span className={`badge bg-${variant}`} style={{ fontSize: 12 }}>{value}</span>
}

export default function TransactionsPage() {
  const { filters, update } = useTransactionFilters()
  const { data, isFetching } = useTransactions(filters)
  const { data: opts }       = useDashboardFilterOptions()

  const selectStyle = {
    background: 'rgba(30,41,59,.8)',
    color: '#fff',
    border: '1px solid rgba(46,134,193,.3)',
  }

  return (
    <div className="dashboard-layout" style={{ background: 'var(--gtek-dark-blue)' }}>

      {/* ── Filter sidebar ─────────────────────────────── */}
      <FiltersSidebar loading={isFetching}>

        <div className="filter-group">
          <label className="filter-label">Time Window</label>
          <select
            className="form-select form-select-sm"
            value={filters.timeMinutes ?? 60}
            onChange={(e) => update({ timeMinutes: Number(e.target.value) })}
            style={selectStyle}
          >
            {TIME_MINUTES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Environment</label>
          <select
            className="form-select form-select-sm"
            value={filters.environmentId ?? ''}
            onChange={(e) => update({ environmentId: e.target.value })}
            style={selectStyle}
          >
            <option value="">All</option>
            {opts?.environments.map((o) => <option key={o.value} value={String(o.value)}>{o.text}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Business Segment</label>
          <select
            className="form-select form-select-sm"
            value={filters.businessSegmentIds ?? ''}
            onChange={(e) => update({ businessSegmentIds: e.target.value })}
            style={selectStyle}
          >
            <option value="">All</option>
            {opts?.businessSegments.map((o) => <option key={o.value} value={String(o.value)}>{o.text}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Business Process</label>
          <select
            className="form-select form-select-sm"
            value={filters.businessProcessIds ?? ''}
            onChange={(e) => update({ businessProcessIds: e.target.value })}
            style={selectStyle}
          >
            <option value="">All</option>
            {opts?.businessProcesses.map((o) => <option key={o.value} value={String(o.value)}>{o.text}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select
            className="form-select form-select-sm"
            value={filters.statuses ?? ''}
            onChange={(e) => update({ statuses: e.target.value })}
            style={selectStyle}
          >
            <option value="">All</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="ERROR">ERROR</option>
            <option value="TIMEOUT">TIMEOUT</option>
            <option value="PROCESSING">PROCESSING</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Document Number</label>
          <input
            className="form-control form-control-sm"
            placeholder="Search…"
            value={filters.searchDocument ?? ''}
            onChange={(e) => update({ searchDocument: e.target.value })}
            style={selectStyle}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Brand</label>
          <select
            className="form-select form-select-sm"
            value={filters.brandIds ?? ''}
            onChange={(e) => update({ brandIds: e.target.value })}
            style={selectStyle}
          >
            <option value="">All</option>
            {opts?.brands.map((o) => <option key={o.value} value={String(o.value)}>{o.text}</option>)}
          </select>
        </div>

      </FiltersSidebar>

      {/* ── Main content ─────────────────────────────── */}
      <div className="dashboard-content">

        <div className="mb-3 d-flex align-items-center justify-content-between">
          <div>
            <h1 className="h3 text-white mb-1">Transaction Explorer</h1>
            <p className="text-muted mb-0">
              {data?.totalCount ?? 0} transactions
              {isFetching && <span className="ms-2 spinner-border spinner-border-sm text-primary" />}
            </p>
          </div>
        </div>

        <div
          className="card"
          style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}
        >
          <div className="card-body p-0">
            <DataGrid
              dataSource={data?.transactions ?? []}
              keyExpr="messageId"
              showBorders={false}
              showColumnLines={true}
              showRowLines={true}
              rowAlternationEnabled={true}
              columnAutoWidth={true}
              allowColumnResizing={true}
              allowColumnReordering={true}
              wordWrapEnabled={false}
              height={650}
            >
              <FilterRow visible={true} />
              <HeaderFilter visible={true} />
              <ColumnChooser enabled={true} />

              <Paging
                pageSize={filters.pageSize ?? 25}
                pageIndex={(filters.page ?? 1) - 1}
                onPageSizeChange={(size) => update({ pageSize: size })}
              />
              <Pager
                showPageSizeSelector={true}
                allowedPageSizes={[25, 50, 100]}
                showInfo={true}
                infoText="Page {0} of {1} ({2} items)"
                visible={true}
              />

              <Column
                dataField="documentNumber"
                caption="Document #"
                width={160}
                fixed={true}
              />
              <Column dataField="correlationId"          caption="Correlation ID"    width={240} />
              <Column
                dataField="status"
                caption="Status"
                width={120}
                alignment="center"
                cellRender={({ value }) => <StatusBadge value={value} />}
              />
              <Column dataField="businessProcessName"    caption="Business Process"  width={180} />
              <Column dataField="businessSubprocessName" caption="Sub-Process"       width={180} />
              <Column dataField="brandName"              caption="Brand"             width={130} />
              <Column dataField="businessSegmentName"    caption="Segment"           width={150} visible={false} />
              <Column dataField="environmentName"        caption="Environment"       width={120} />
              <Column dataField="countryName"            caption="Country"           width={110} />
              <Column
                dataField="startTimestamp"
                caption="Start"
                dataType="datetime"
                format="dd/MM/yyyy HH:mm:ss"
                width={170}
              />
              <Column dataField="direction"       caption="Direction"    width={100} />
              <Column
                dataField="executionTimeMs"
                caption="Exec (ms)"
                dataType="number"
                format={{ type: 'fixedPoint', precision: 0 }}
                width={100}
                alignment="right"
              />
              <Column dataField="integrationName"  caption="Integration"  width={200} />
              <Column dataField="sourceSystem"     caption="Source"       width={150} visible={false} />
              <Column dataField="targetSystem"     caption="Target"       width={150} visible={false} />
              <Column dataField="messageId"        caption="Message ID"   width={240} visible={false} />
            </DataGrid>
          </div>
        </div>

      </div>
    </div>
  )
}
