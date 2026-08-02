import React, { useState } from 'react';

/**
 * EnterpriseDataGrid
 * A production-grade, high-performance table view for laboratory specimen logs.
 */
export default function EnterpriseDataGrid({
  columns,
  rows,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onFilterChange,
  selectedRows = [],
  onSelectionChange,
  loading = false,
  sortBy = '',
  sortOrder = 'asc'
}) {
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(
    columns.reduce((acc, col) => ({ ...acc, [col.key]: true }), {})
  );

  const toggleColumn = (colKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [colKey]: !prev[colKey]
    }));
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      onSelectionChange(rows.map(r => r.sampleId || r.id || r.releaseId || r.disposalId || r.shipmentId || r.freezer || r.user || r.recordedTime));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (rowKey, checked) => {
    if (checked) {
      onSelectionChange([...selectedRows, rowKey]);
    } else {
      onSelectionChange(selectedRows.filter(k => k !== rowKey));
    }
  };

  const activeColumns = columns.filter(c => visibleColumns[c.key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Grid Controls Bar */}
      <div className="grid-controls-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Rows per page:
          </span>
          <select
            className="form-control"
            value={pagination.pageSize || 10}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            style={{ width: '80px', padding: '6px 10px', fontSize: '12px' }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px', position: 'relative' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowColMenu(!showColMenu)}
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            ⚙️ Show/Hide Columns
          </button>
          
          {showColMenu && (
            <div className="column-visibility-menu">
              <div style={{ fontWeight: '700', fontSize: '11px', color: 'var(--text-primary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Toggle Columns
              </div>
              {columns.map(col => (
                <label key={col.key} className="column-visibility-item">
                  <input
                    type="checkbox"
                    checked={!!visibleColumns[col.key]}
                    onChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Enterprise Data Grid Container */}
      <div className="enterprise-grid-container">
        {loading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(8, 12, 24, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}>
            <div className="loading-spinner" style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--border-color)',
              borderTopColor: 'var(--accent-cyan)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        )}

        <table className="enterprise-grid">
          <thead>
            {/* Headers Row */}
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedRows.length === rows.length}
                  onChange={handleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {activeColumns.map((col, idx) => {
                const isSortActive = sortBy === col.key;
                const isFirstCol = idx === 0;
                return (
                  <th
                    key={col.key}
                    className={isFirstCol ? 'frozen-col' : ''}
                    onClick={() => col.sortable && onSortChange(col.key, sortOrder === 'asc' ? 'desc' : 'asc')}
                    style={{
                      cursor: col.sortable ? 'pointer' : 'default',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{col.label}</span>
                      {col.sortable && (
                        <span style={{ fontSize: '10px', color: isSortActive ? 'var(--accent-cyan)' : 'var(--text-tertiary)' }}>
                          {isSortActive ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>

            {/* Column-level search/filters row */}
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th style={{ borderBottom: '1px solid var(--border-color)' }}></th>
              {activeColumns.map((col, idx) => {
                const isFirstCol = idx === 0;
                return (
                  <th key={col.key} className={isFirstCol ? 'frozen-col' : ''} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)' }}>
                    {col.filterType === 'text' && (
                      <input
                        type="text"
                        placeholder={`Filter ${col.label}...`}
                        onChange={(e) => onFilterChange(col.key, e.target.value)}
                        className="form-control"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          background: 'var(--bg-primary)',
                          borderRadius: '4px'
                        }}
                      />
                    )}
                    {col.filterType === 'select' && (
                      <select
                        onChange={(e) => onFilterChange(col.key, e.target.value)}
                        className="form-control"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          background: 'var(--bg-primary)',
                          borderRadius: '4px'
                        }}
                      >
                        <option value="">All</option>
                        {col.filterOptions?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length + 1} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '36px 0', fontStyle: 'italic' }}>
                  No matching LIMS records found in registry.
                </td>
              </tr>
            ) : (
              rows.map((row, rIdx) => {
                const rowKey = row.sampleId || row.id || row.releaseId || row.disposalId || row.shipmentId || row.freezer || row.user || row.recordedTime;
                const isSelected = selectedRows.includes(rowKey);
                return (
                  <tr key={rowKey || rIdx} style={{ background: isSelected ? 'rgba(0, 242, 254, 0.04)' : 'transparent' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleSelectRow(rowKey, e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    {activeColumns.map((col, cIdx) => {
                      const isFirstCol = cIdx === 0;
                      let cellVal = row[col.key];

                      // Style badges for status results
                      if (col.key === 'status' || col.key === 'consentStatus' || col.key === 'approvalStatus' || col.key === 'qcResult' || col.key === 'qcStatus' || col.key === 'alarmStatus' || col.key === 'shipmentStatus') {
                        let badgeClass = 'badge-info';
                        if (cellVal === 'Verified' || cellVal === 'Passed' || cellVal === 'Normal' || cellVal === 'Received' || cellVal === 'Approved' || cellVal === 'Valid' || cellVal === 'Completed') {
                          badgeClass = 'badge-verified';
                        } else if (cellVal === 'Failed' || cellVal === 'Rejected' || cellVal === 'Withdrawn' || cellVal === 'Disposed' || cellVal === 'Expired' || cellVal?.includes('Warning') || cellVal?.includes('Alarm')) {
                          badgeClass = 'badge-rejected';
                        } else if (cellVal === 'Pending' || cellVal === 'In Transit' || cellVal === 'Near Expiry') {
                          badgeClass = 'badge-pending';
                        }
                        cellVal = <span className={`badge ${badgeClass}`}>{cellVal}</span>;
                      }

                      return (
                        <td
                          key={col.key}
                          className={isFirstCol ? 'frozen-col' : ''}
                          style={{
                            fontFamily: col.monospace ? 'monospace' : 'inherit',
                            fontWeight: isFirstCol ? '700' : 'normal'
                          }}
                        >
                          {cellVal}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Grid Pagination Footer */}
      <div className="pagination-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 var(--border-radius-lg) var(--border-radius-lg)', flexWrap: 'wrap', gap: '10px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Showing {Math.min(pagination.totalRecords, (pagination.page - 1) * pagination.pageSize + 1)} to {Math.min(pagination.totalRecords, pagination.page * pagination.pageSize)} of {pagination.totalRecords} entries
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
            style={{ padding: '6px 12px', fontSize: '11px' }}
          >
            Previous
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '600' }}>
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => onPageChange(pagination.page + 1)}
            style={{ padding: '6px 12px', fontSize: '11px' }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
