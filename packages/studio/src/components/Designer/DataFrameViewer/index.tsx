import { useState, useMemo, useCallback } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { FiDownload, FiSearch, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

export interface DataFrameColumn {
  name: string;
  dtype: string;
}

export interface DataFrameData {
  name: string;
  columns: DataFrameColumn[];
  rows: unknown[][];
  totalRows: number;
}

interface DataFrameViewerProps {
  data: DataFrameData;
}

const DTYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Int8:    { bg: '#DBEAFE', text: '#1D4ED8' },
  Int16:   { bg: '#DBEAFE', text: '#1D4ED8' },
  Int32:   { bg: '#DBEAFE', text: '#1D4ED8' },
  Int64:   { bg: '#DBEAFE', text: '#1D4ED8' },
  UInt8:   { bg: '#E0E7FF', text: '#4338CA' },
  UInt16:  { bg: '#E0E7FF', text: '#4338CA' },
  UInt32:  { bg: '#E0E7FF', text: '#4338CA' },
  UInt64:  { bg: '#E0E7FF', text: '#4338CA' },
  Float32: { bg: '#FEF3C7', text: '#B45309' },
  Float64: { bg: '#FEF3C7', text: '#B45309' },
  Boolean: { bg: '#D1FAE5', text: '#065F46' },
  Utf8:    { bg: '#F3F4F6', text: '#374151' },
  String:  { bg: '#F3F4F6', text: '#374151' },
  Date:    { bg: '#FCE7F3', text: '#9D174D' },
  Datetime:{ bg: '#FCE7F3', text: '#9D174D' },
  List:    { bg: '#F5F3FF', text: '#5B21B6' },
};

function getDtypeColor(dtype: string) {
  const base = dtype.split('(')[0];
  return DTYPE_COLORS[base] ?? { bg: '#F3F4F6', text: '#6B7280' };
}

function abbreviateDtype(dtype: string): string {
  const map: Record<string, string> = {
    Int64: 'i64', Int32: 'i32', Int16: 'i16', Int8: 'i8',
    UInt64: 'u64', UInt32: 'u32', UInt16: 'u16', UInt8: 'u8',
    Float64: 'f64', Float32: 'f32',
    Boolean: 'bool',
    Utf8: 'str', String: 'str',
    Date: 'date', Datetime: 'datetime',
    List: 'list',
  };
  const base = dtype.split('(')[0];
  return map[base] ?? dtype.toLowerCase().slice(0, 6);
}

function exportToCSV(data: DataFrameData) {
  const header = data.columns.map(c => JSON.stringify(c.name)).join(',');
  const rows = data.rows.map(row =>
    row.map(cell => {
      if (cell === null || cell === undefined) return '';
      const str = String(cell);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? JSON.stringify(str)
        : str;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.name || 'dataframe'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataFrameViewer({ data }: DataFrameViewerProps) {
  const { t } = useTranslation('common');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredRows = useMemo(() => {
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(row =>
      row.some(cell => cell !== null && cell !== undefined && String(cell).toLowerCase().includes(q))
    );
  }, [data.rows, search]);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir]);

  const handleSort = useCallback((colIdx: number) => {
    setSortCol(prev => {
      if (prev === colIdx) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return colIdx;
      }
      setSortDir('asc');
      return colIdx;
    });
  }, []);

  const colCount = data.columns.length;
  const COL_WIDTH = Math.max(100, Math.floor(600 / Math.max(colCount, 1)));

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-white">{data.totalRows.toLocaleString()}</span>
            {' '}{t('dataframeViewer.rows', { defaultValue: 'rows' })}
            {' × '}
            <span className="font-semibold text-slate-800 dark:text-white">{colCount}</span>
            {' '}{t('dataframeViewer.cols', { defaultValue: 'cols' })}
          </span>
          {search && filteredRows.length !== data.rows.length && (
            <span className="text-[10px] text-slate-400">
              ({filteredRows.length.toLocaleString()} {t('dataframeViewer.filtered', { defaultValue: 'filtered' })})
            </span>
          )}
        </div>
        <button
          onClick={() => exportToCSV(data)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title={t('dataframeViewer.exportCSV', { defaultValue: 'Export as CSV' })}
        >
          <FiDownload size={12} />
          <span>CSV</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="relative">
          <FiSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('dataframeViewer.searchPlaceholder', { defaultValue: 'Filter rows...' })}
            className="w-full pl-6 pr-6 py-1 text-xs rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <FiX size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Column type badges */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 overflow-x-auto">
        {data.columns.map(col => {
          const color = getDtypeColor(col.dtype);
          return (
            <div key={col.name} className="flex items-center gap-0.5 flex-shrink-0">
              <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate max-w-[60px]" title={col.name}>
                {col.name}
              </span>
              <span
                className="text-[9px] font-mono px-1 rounded"
                style={{ backgroundColor: color.bg, color: color.text }}
                title={col.dtype}
              >
                {abbreviateDtype(col.dtype)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Virtualized table */}
      <div className="flex-1 overflow-hidden">
        {sortedRows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            {t('dataframeViewer.noData', { defaultValue: 'No data to display' })}
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '100%' }}
            data={sortedRows}
            fixedHeaderContent={() => (
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th
                  className="text-[10px] font-medium text-slate-400 dark:text-slate-500 text-right pr-2 pl-2 py-1.5 border-b border-r border-slate-200 dark:border-slate-700 select-none sticky left-0 bg-slate-50 dark:bg-slate-800"
                  style={{ width: 36, minWidth: 36 }}
                >
                  #
                </th>
                {data.columns.map((col, i) => {
                  const color = getDtypeColor(col.dtype);
                  const isActive = sortCol === i;
                  return (
                    <th
                      key={col.name}
                      onClick={() => handleSort(i)}
                      className="text-left text-[11px] font-semibold text-slate-600 dark:text-slate-300 py-1.5 px-2 border-b border-r border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 select-none whitespace-nowrap"
                      style={{ minWidth: COL_WIDTH, width: COL_WIDTH }}
                      title={`${col.name}: ${col.dtype}`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate">{col.name}</span>
                        <span
                          className="text-[9px] font-mono px-1 rounded flex-shrink-0"
                          style={{ backgroundColor: color.bg, color: color.text }}
                        >
                          {abbreviateDtype(col.dtype)}
                        </span>
                        {isActive && (
                          <span className="text-indigo-500 text-[10px] flex-shrink-0">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            )}
            itemContent={(index, row) => (
              <>
                <td
                  className="text-[10px] text-right pr-2 pl-2 py-1 text-slate-400 dark:text-slate-500 border-r border-b border-slate-100 dark:border-slate-700/50 sticky left-0 bg-white dark:bg-slate-900"
                  style={{ width: 36, minWidth: 36 }}
                >
                  {index + 1}
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="text-[11px] text-slate-700 dark:text-slate-300 py-1 px-2 border-r border-b border-slate-100 dark:border-slate-700/50 font-mono whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ maxWidth: COL_WIDTH, minWidth: COL_WIDTH }}
                    title={cell === null || cell === undefined ? 'null' : String(cell)}
                  >
                    {cell === null || cell === undefined
                      ? <span className="text-slate-300 dark:text-slate-600 italic">null</span>
                      : String(cell)
                    }
                  </td>
                ))}
              </>
            )}
          />
        )}
      </div>
    </div>
  );
}
