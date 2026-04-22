import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Search, Filter, X, Download, FileText, Calendar as CalendarIcon, ChevronDown, Columns3 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import jsPDF from 'jspdf';

export interface FilterOption {
  value: string;
  label: string;
}

export interface AdvancedFilterField {
  /** Identifier (used as key in `values`) */
  key: string;
  /** Visible label */
  label: string;
  /** Options */
  options: FilterOption[];
  /** Placeholder when nothing selected */
  placeholder?: string;
}

export interface FinancialFiltersValue {
  search: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
  advanced: Record<string, string>;
}

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
  /** Optional stable key. Defaults to header. Used to persist user column choices. */
  key?: string;
  /** If true, this column cannot be hidden by the user. */
  required?: boolean;
  /** If false, the column is hidden by default (user can still enable it). */
  defaultVisible?: boolean;
}

interface Props<T = any> {
  value: FinancialFiltersValue;
  onChange: (next: FinancialFiltersValue) => void;
  /** Total of items currently shown */
  resultCount?: number;
  /** Optional placeholder for the search field */
  searchPlaceholder?: string;
  /** Advanced filter selects shown inside the popover */
  advancedFields?: AdvancedFilterField[];
  /** Rows used for export. If omitted, the export buttons are hidden. */
  exportRows?: T[];
  exportColumns?: ExportColumn<T>[];
  /** File name (without extension) for exported files. */
  exportFileName?: string;
  /** Title shown on the PDF export */
  exportTitle?: string;
  /** Stable id used to persist column visibility per page in localStorage. */
  exportStorageKey?: string;
}

const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export function buildEmptyFilters(): FinancialFiltersValue {
  return { search: '', startDate: '', endDate: '', advanced: {} };
}

/**
 * Helper: filter a list using the standard FinancialFilters value.
 * - `getDate` returns a yyyy-MM-dd date string for the row.
 * - `getSearchableText` returns the haystack (joined string of values to search through).
 * - `matchAdvanced` is called per row to decide if the advanced filters match.
 */
export function applyFinancialFilters<T>(
  items: T[],
  filters: FinancialFiltersValue,
  opts: {
    getDate: (row: T) => string;
    getSearchableText: (row: T) => string;
    matchAdvanced?: (row: T, advanced: Record<string, string>) => boolean;
  }
): T[] {
  const term = filters.search.trim().toLowerCase();
  return items.filter(row => {
    const date = opts.getDate(row);
    if (filters.startDate && date < filters.startDate) return false;
    if (filters.endDate && date > filters.endDate) return false;
    if (term) {
      const text = opts.getSearchableText(row).toLowerCase();
      if (!text.includes(term)) return false;
    }
    if (opts.matchAdvanced && !opts.matchAdvanced(row, filters.advanced)) return false;
    return true;
  });
}

const FinancialFilters = <T,>({
  value,
  onChange,
  resultCount,
  searchPlaceholder = 'Buscar por descrição, cliente, categoria…',
  advancedFields = [],
  exportRows,
  exportColumns,
  exportFileName = 'financeiro',
  exportTitle = 'Relatório Financeiro',
  exportStorageKey,
}: Props<T>) => {
  const [open, setOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);

  const colKey = (c: ExportColumn<T>) => c.key || c.header;
  const storageKey = exportStorageKey ? `pulse:exportCols:${exportStorageKey}` : null;

  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (exportColumns) {
      exportColumns.forEach(c => { if (c.defaultVisible === false && !c.required) initial.add(colKey(c)); });
    }
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) return new Set<string>(JSON.parse(raw));
      } catch { /* noop */ }
    }
    return initial;
  });

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(Array.from(hiddenCols))); } catch { /* noop */ }
  }, [hiddenCols, storageKey]);

  const visibleColumns = useMemo(
    () => (exportColumns || []).filter(c => c.required || !hiddenCols.has(colKey(c))),
    [exportColumns, hiddenCols]
  );

  const toggleCol = (c: ExportColumn<T>) => {
    if (c.required) return;
    const k = colKey(c);
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const activeAdvancedCount = useMemo(
    () => Object.values(value.advanced).filter(v => v && v !== 'all').length,
    [value.advanced]
  );

  const hasAnyFilter =
    value.search ||
    value.startDate ||
    value.endDate ||
    activeAdvancedCount > 0;

  const setQuickRange = (range: 'today' | '7d' | '30d' | 'month' | 'year' | 'all') => {
    const today = new Date();
    let start = '';
    let end = '';
    if (range === 'today') {
      start = end = todayISO();
    } else if (range === '7d') {
      start = format(subDays(today, 6), 'yyyy-MM-dd');
      end = todayISO();
    } else if (range === '30d') {
      start = format(subDays(today, 29), 'yyyy-MM-dd');
      end = todayISO();
    } else if (range === 'month') {
      start = format(startOfMonth(today), 'yyyy-MM-dd');
      end = format(endOfMonth(today), 'yyyy-MM-dd');
    } else if (range === 'year') {
      start = format(startOfYear(today), 'yyyy-MM-dd');
      end = format(endOfYear(today), 'yyyy-MM-dd');
    }
    onChange({ ...value, startDate: start, endDate: end });
  };

  const clearAll = () => onChange(buildEmptyFilters());

  const setAdvanced = (key: string, v: string) =>
    onChange({ ...value, advanced: { ...value.advanced, [key]: v } });

  const csvEscape = (raw: string | number) => {
    const s = String(raw ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const handleExportCSV = () => {
    if (!exportRows || !exportColumns || exportRows.length === 0 || visibleColumns.length === 0) return;
    const header = visibleColumns.map(c => csvEscape(c.header)).join(',');
    const lines = exportRows.map(row =>
      visibleColumns.map(c => csvEscape(c.accessor(row))).join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!exportRows || !exportColumns || exportRows.length === 0 || visibleColumns.length === 0) return;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();

    // Header
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageW, 16, 'F');
    pdf.setFillColor(236, 72, 153);
    pdf.rect(0, 16, pageW, 0.7, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('PULSE — ' + exportTitle, 10, 10);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(format(new Date(), 'dd/MM/yyyy HH:mm'), pageW - 10, 10, { align: 'right' });

    // Filters summary
    pdf.setTextColor(50, 50, 50);
    pdf.setFontSize(9);
    let cursorY = 24;
    const summary: string[] = [];
    if (value.startDate || value.endDate) {
      summary.push(`Período: ${value.startDate || '—'} até ${value.endDate || '—'}`);
    }
    if (value.search) summary.push(`Busca: "${value.search}"`);
    Object.entries(value.advanced).forEach(([k, v]) => {
      if (v && v !== 'all') {
        const field = advancedFields.find(f => f.key === k);
        const opt = field?.options.find(o => o.value === v);
        summary.push(`${field?.label || k}: ${opt?.label || v}`);
      }
    });
    if (summary.length > 0) {
      pdf.text(summary.join('  •  '), 10, cursorY);
      cursorY += 6;
    }
    pdf.text(`Total de registros: ${exportRows.length}`, 10, cursorY);
    cursorY += 6;

    // Table
    const cols = visibleColumns;
    const usableW = pageW - 20;
    const colW = usableW / cols.length;

    // Header row
    pdf.setFillColor(241, 245, 249);
    pdf.rect(10, cursorY, usableW, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    cols.forEach((c, i) => {
      pdf.text(String(c.header), 12 + i * colW, cursorY + 5);
    });
    cursorY += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);
    exportRows.forEach((row, idx) => {
      if (cursorY > 195) {
        pdf.addPage();
        cursorY = 16;
      }
      if (idx % 2 === 0) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(10, cursorY, usableW, 6, 'F');
      }
      cols.forEach((c, i) => {
        const raw = String(c.accessor(row) ?? '');
        const truncated = raw.length > 38 ? raw.slice(0, 36) + '…' : raw;
        pdf.text(truncated, 12 + i * colW, cursorY + 4);
      });
      cursorY += 6;
    });

    pdf.save(`${exportFileName}-${todayISO()}.pdf`);
  };

  const canExport = !!(exportRows && exportColumns && exportRows.length > 0);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value.search}
              onChange={e => onChange({ ...value, search: e.target.value })}
              placeholder={searchPlaceholder}
              className="pl-9 h-9"
            />
            {value.search && (
              <button
                onClick={() => onChange({ ...value, search: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Period — visible */}
          <div className="flex items-center gap-1.5">
            <CalendarIcon size={14} className="text-muted-foreground" />
            <Input
              type="date"
              value={value.startDate}
              onChange={e => onChange({ ...value, startDate: e.target.value })}
              className="h-9 w-[150px]"
              aria-label="Data inicial"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={value.endDate}
              onChange={e => onChange({ ...value, endDate: e.target.value })}
              className="h-9 w-[150px]"
              aria-label="Data final"
            />
          </div>

          {/* Advanced popover */}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Filter size={14} />
                Filtros
                {activeAdvancedCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {activeAdvancedCount}
                  </Badge>
                )}
                <ChevronDown size={12} className="opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Atalhos de período</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setQuickRange('today')}>Hoje</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setQuickRange('7d')}>7 dias</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setQuickRange('30d')}>30 dias</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setQuickRange('month')}>Este mês</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setQuickRange('year')}>Este ano</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setQuickRange('all')}>Limpar</Button>
                </div>
              </div>

              {advancedFields.length > 0 && (
                <div className="space-y-2 pt-1">
                  {advancedFields.map(field => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs">{field.label}</Label>
                      <Select
                        value={value.advanced[field.key] || 'all'}
                        onValueChange={v => setAdvanced(field.key, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={field.placeholder || 'Todos'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {field.options.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-2 border-t">
                <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 text-xs">
                  Limpar tudo
                </Button>
                <Button size="sm" onClick={() => setOpen(false)} className="h-7 text-xs">Aplicar</Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Export */}
          {canExport && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportCSV} title="Exportar CSV">
                <Download size={14} /> CSV
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportPDF} title="Exportar PDF">
                <FileText size={14} /> PDF
              </Button>
            </div>
          )}

          {/* Result count */}
          {typeof resultCount === 'number' && (
            <Badge variant="outline" className="text-[11px] ml-auto">
              {resultCount} resultado{resultCount === 1 ? '' : 's'}
            </Badge>
          )}

          {hasAnyFilter && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearAll}>
              <X size={12} className="mr-1" /> Limpar
            </Button>
          )}
        </div>

        {/* Active chips */}
        {hasAnyFilter && (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
            {value.startDate && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                De {value.startDate}
                <button onClick={() => onChange({ ...value, startDate: '' })}><X size={10} /></button>
              </Badge>
            )}
            {value.endDate && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                Até {value.endDate}
                <button onClick={() => onChange({ ...value, endDate: '' })}><X size={10} /></button>
              </Badge>
            )}
            {Object.entries(value.advanced).map(([k, v]) => {
              if (!v || v === 'all') return null;
              const field = advancedFields.find(f => f.key === k);
              const opt = field?.options.find(o => o.value === v);
              return (
                <Badge key={k} variant="secondary" className="text-[10px] gap-1">
                  {field?.label}: {opt?.label || v}
                  <button onClick={() => setAdvanced(k, 'all')}><X size={10} /></button>
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FinancialFilters;
