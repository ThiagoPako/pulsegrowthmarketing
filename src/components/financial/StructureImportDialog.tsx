import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/vpsDb';
import type { Expense, ExpenseCategory } from '@/hooks/useFinancialData';

export const STRUCTURE_TAG = '[ESTRUTURA]';

interface ParsedRow {
  key: string;
  rawDate: string;
  date: string | null;
  category: string;
  description: string;
  storedDescription: string;
  amount: number;
  duplicate: boolean;
}

interface StructureImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  expenses: Expense[];
  onImported: () => Promise<void> | void;
}

const IGNORE_PATTERNS = /^(total|observa|planilha|investimentos realizados)/i;

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Converte datas em texto (dd/mm/aaaa) ou serial do Excel para YYYY-MM-DD. */
function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const mm = String(parsed.m).padStart(2, '0');
    const dd = String(parsed.d).padStart(2, '0');
    return `${parsed.y}-${mm}-${dd}`;
  }
  const text = normalizeText(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // pega a última data completa do texto ("13/07 a 18/08/2026" → 18/08/2026)
  const matches = [...text.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g)];
  if (matches.length === 0) return null;
  const m = matches[matches.length - 1];
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function buildKey(date: string, description: string, amount: number) {
  return `${date}|${description.toLowerCase()}|${amount.toFixed(2)}`;
}

export default function StructureImportDialog({
  open,
  onOpenChange,
  categories,
  expenses,
  onImported,
}: StructureImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [fallbackDate, setFallbackDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [importing, setImporting] = useState(false);

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      const date = String(e.date || '').slice(0, 10);
      set.add(buildKey(date, normalizeText(e.description), Number(e.amount) || 0));
    });
    return set;
  }, [expenses]);

  const reset = () => {
    setFileName('');
    setRows([]);
    setSelected({});
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: 'array' });
      const sheet = book.Sheets[book.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, blankrows: false });

      // localiza a linha de cabeçalho (Data / Categoria / Descrição / Valor)
      let headerIndex = -1;
      for (let i = 0; i < Math.min(matrix.length, 30); i++) {
        const line = (matrix[i] || []).map(c => normalizeText(c).toLowerCase());
        if (line.some(c => c === 'data') && line.some(c => c.startsWith('valor'))) {
          headerIndex = i;
          break;
        }
      }
      if (headerIndex === -1) {
        toast.error('Não encontrei as colunas Data, Categoria, Descrição e Valor na planilha.');
        return;
      }

      const header = (matrix[headerIndex] || []).map(c => normalizeText(c).toLowerCase());
      const col = {
        date: header.findIndex(c => c === 'data'),
        category: header.findIndex(c => c.startsWith('categoria')),
        description: header.findIndex(c => c.startsWith('descri')),
        amount: header.findIndex(c => c.startsWith('valor')),
      };

      const parsed: ParsedRow[] = [];
      const seen = new Set<string>();

      for (let i = headerIndex + 1; i < matrix.length; i++) {
        const line = matrix[i] || [];
        const rawDate = normalizeText(line[col.date]);
        const category = normalizeText(line[col.category]) || 'Outros';
        const description = normalizeText(line[col.description]);
        const amount = parseAmount(line[col.amount]);

        if (!amount || amount <= 0) continue;
        if (IGNORE_PATTERNS.test(rawDate) || IGNORE_PATTERNS.test(description)) continue;
        if (!description && !category) continue;

        const date = parseDate(line[col.date]) ?? parseDate(rawDate);
        const effectiveDate = date ?? fallbackDate;
        const storedDescription = `${STRUCTURE_TAG} ${description || category}`.trim();
        const key = buildKey(effectiveDate, storedDescription, amount);
        // linhas idênticas repetidas dentro da própria planilha continuam válidas
        let uniqueKey = key;
        let suffix = 1;
        while (seen.has(uniqueKey)) {
          suffix += 1;
          uniqueKey = `${key}#${suffix}`;
        }
        seen.add(uniqueKey);

        parsed.push({
          key: uniqueKey,
          rawDate,
          date,
          category,
          description: description || category,
          storedDescription,
          amount,
          duplicate: existingKeys.has(key),
        });
      }

      if (parsed.length === 0) {
        toast.error('Nenhum lançamento válido encontrado na planilha.');
        return;
      }

      setFileName(file.name);
      setRows(parsed);
      setSelected(Object.fromEntries(parsed.filter(r => !r.duplicate).map(r => [r.key, true])));
      toast.success(`${parsed.length} linhas lidas. Confira antes de confirmar.`);
    } catch (err) {
      console.error('[StructureImportDialog] parse error:', err);
      toast.error('Não consegui ler o arquivo. Envie um .xlsx ou .csv.');
    }
  };

  const newRows = rows.filter(r => !r.duplicate);
  const duplicateRows = rows.filter(r => r.duplicate);
  const chosen = newRows.filter(r => selected[r.key]);
  const chosenTotal = chosen.reduce((s, r) => s + r.amount, 0);
  const missingDate = chosen.filter(r => !r.date).length;

  const toggleAll = (value: boolean) => {
    setSelected(Object.fromEntries(newRows.map(r => [r.key, value])));
  };

  const confirmImport = async () => {
    if (chosen.length === 0) {
      toast.error('Selecione ao menos um lançamento.');
      return;
    }
    setImporting(true);
    try {
      // garante as categorias vindas da planilha
      const existing = new Map(categories.map(c => [c.name.trim().toLowerCase(), c.id]));
      const missing = [...new Set(chosen.map(r => r.category).filter(c => !existing.has(c.toLowerCase())))];
      for (const name of missing) {
        const { data } = await supabase.from('expense_categories').insert({ name } as any).select('id').single();
        if ((data as any)?.id) existing.set(name.toLowerCase(), (data as any).id);
      }

      let ok = 0;
      for (const row of chosen) {
        const payload = {
          date: row.date ?? fallbackDate,
          amount: row.amount,
          category_id: existing.get(row.category.toLowerCase()) || null,
          expense_type: 'pontual',
          description: row.storedDescription,
          responsible: 'Estrutura',
        };
        const { data, error } = await supabase.from('expenses').insert(payload as any).select('id').single();
        if (error) {
          console.error('[StructureImportDialog] insert error:', error);
          continue;
        }
        ok += 1;
        const expenseId = (data as any)?.id;
        if (expenseId) {
          await supabase.from('cash_reserve_movements').insert({
            amount: row.amount,
            type: 'saida',
            description: `[Despesa] ${row.storedDescription} - ID: ${expenseId}`,
            date: payload.date,
            is_reserve: false,
          } as any);
        }
      }

      await onImported();
      toast.success(`${ok} despesa(s) de estrutura importada(s).`);
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error('[StructureImportDialog] import error:', err);
      toast.error('Falha ao importar a planilha.');
    } finally {
      setImporting(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-primary" />
            Importar planilha de gastos de estrutura
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="mb-1.5 block">Arquivo (.xlsx ou .csv)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
            <div className="sm:w-44">
              <Label className="mb-1.5 block">Data padrão</Label>
              <Input type="date" value={fallbackDate} onChange={e => setFallbackDate(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A data padrão é usada apenas nas linhas em que a planilha não informa uma data válida.
          </p>

          {rows.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-lg font-bold text-emerald-500">{newRows.length}</div>
                  <div className="text-[11px] text-muted-foreground">Novos</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-lg font-bold text-muted-foreground">{duplicateRows.length}</div>
                  <div className="text-[11px] text-muted-foreground">Já cadastrados</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-lg font-bold text-primary">{fmt(chosenTotal)}</div>
                  <div className="text-[11px] text-muted-foreground">Selecionado</div>
                </div>
              </div>

              {missingDate > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 text-amber-500" />
                  <span>{missingDate} lançamento(s) sem data na planilha serão registrados em {fallbackDate.split('-').reverse().join('/')}.</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">{fileName}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Selecionar todos</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>Limpar</Button>
                </div>
              </div>

              <ScrollArea className="h-72 rounded-lg border">
                <div className="divide-y">
                  {rows.map(row => (
                    <div key={row.key} className="flex items-start gap-3 p-2.5 text-xs">
                      <Checkbox
                        className="mt-0.5"
                        disabled={row.duplicate}
                        checked={row.duplicate ? false : !!selected[row.key]}
                        onCheckedChange={v => setSelected(s => ({ ...s, [row.key]: v === true }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium truncate">{row.description}</span>
                          <Badge variant="outline" className="text-[9px]">{row.category}</Badge>
                          {row.duplicate && <Badge variant="secondary" className="text-[9px]">Já cadastrado</Badge>}
                          {!row.date && <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600">Sem data</Badge>}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {row.date ? row.date.split('-').reverse().join('/') : row.rawDate || 'sem data'}
                        </div>
                      </div>
                      <div className="font-semibold whitespace-nowrap">{fmt(row.amount)}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Button onClick={confirmImport} disabled={importing || chosen.length === 0} className="w-full gap-2">
                {importing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                {importing ? 'Importando...' : `Confirmar e cadastrar ${chosen.length} lançamento(s)`}
              </Button>
            </>
          )}

          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
              <Upload size={22} />
              Envie a planilha para visualizar os lançamentos antes de cadastrar.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
