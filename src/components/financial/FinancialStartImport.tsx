import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Rocket, Loader2, ArrowUpCircle, ArrowDownCircle, Trash2, AlertTriangle, CheckCircle, FileSpreadsheet, DollarSign, TrendingUp, TrendingDown, Wallet, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

interface ParsedMovement {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'entrada' | 'saida';
  selected: boolean;
}

interface StatementSummary {
  initialBalance: number | null;
  totalIn: number | null;
  totalOut: number | null;
  finalBalance: number | null;
  period: string | null;
  holder: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (items: { date: string; description: string; amount: number; type: 'entrada' | 'saida' }[], currentBalance: number) => Promise<boolean>;
  currentBalance?: number;
}

const MONTH_MAP: Record<string, string> = {
  'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
  'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
  'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
};

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as any[];
    if (items.length === 0) continue;
    let lines: string[] = [];
    let currentLine = items[0].str;
    let lastY = items[0].transform[5];
    for (let j = 1; j < items.length; j++) {
      const y = items[j].transform[5];
      if (Math.abs(y - lastY) > 3) {
        lines.push(currentLine);
        currentLine = items[j].str;
        lastY = y;
      } else {
        currentLine += ' ' + items[j].str;
      }
    }
    lines.push(currentLine);
    pageTexts.push(...lines);
  }
  return pageTexts;
}

function parseBrazilianTextDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[,.]?\s*(\d{4})/i);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = MONTH_MAP[m[2].toLowerCase().substring(0, 3)];
    return month ? `${m[3]}-${month}-${day}` : null;
  }
  return null;
}

function parseAmount(s: string): number {
  let clean = s.replace(/\s/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.abs(val);
}

function parseSignedAmount(s: string): number {
  let clean = s.replace(/\s/g, '').replace('R$', '').trim();
  const negative = clean.startsWith('-');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/[+-]/g, '').replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(/[+-]/g, '').replace(',', '.');
  } else {
    clean = clean.replace(/[+-]/g, '');
  }
  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  return negative ? -val : val;
}

function normalizeCSVDate(d: string): string {
  const brMatch = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split('T')[0];
  return d;
}

/** Extract summary info from the PDF header (saldo inicial, final, totals, period, holder) */
function extractSummary(lines: string[]): StatementSummary {
  const summary: StatementSummary = {
    initialBalance: null,
    totalIn: null,
    totalOut: null,
    finalBalance: null,
    period: null,
    holder: null,
  };

  const amountPattern = /[+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2}/;

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];

    // Period: "01 Jan, 2026 - 01 Abr, 2026"
    const periodMatch = line.match(/(\d{1,2}\s+\w+[,.]?\s*\d{4})\s*[-–]\s*(\d{1,2}\s+\w+[,.]?\s*\d{4})/i);
    if (periodMatch && !summary.period) {
      summary.period = periodMatch[0];
    }

    // Holder name (CNPJ line)
    if (/cnpj/i.test(line) && !summary.holder) {
      const nameMatch = line.match(/\d{2}\.\d{3}\.\d{3}\s+(.+?)(?:\s*-\s*CNPJ|$)/i);
      if (nameMatch) summary.holder = nameMatch[1].trim();
      else summary.holder = line.replace(/CNPJ.*$/i, '').trim();
    }

    // Saldo inicial
    if (/saldo\s+inicial/i.test(line)) {
      const m = line.match(amountPattern);
      if (m) summary.initialBalance = parseSignedAmount(m[0]);
    }

    // Total de entradas
    if (/total\s+de\s+entradas/i.test(line)) {
      const m = line.match(amountPattern);
      if (m) summary.totalIn = parseSignedAmount(m[0]);
    }

    // Total de saídas
    if (/total\s+de\s+(saídas|saidas)/i.test(line)) {
      const m = line.match(amountPattern);
      if (m) summary.totalOut = Math.abs(parseSignedAmount(m[0]));
    }

    // Saldo final
    if (/saldo\s+final/i.test(line)) {
      const m = line.match(amountPattern);
      if (m) summary.finalBalance = parseSignedAmount(m[0]);
    }

    // Also try R$ pattern on the same area
    if (/R\$\s*\d/i.test(line) && !summary.finalBalance) {
      const rMatch = line.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
      if (rMatch && /saldo\s*final/i.test(lines.slice(Math.max(0, i - 2), i + 1).join(' '))) {
        summary.finalBalance = parseSignedAmount(rMatch[1]);
      }
    }
  }

  return summary;
}

function parsePdfTextMixed(lines: string[]): { date: string; description: string; amount: number; type: 'entrada' | 'saida' }[] {
  const results: { date: string; description: string; amount: number; type: 'entrada' | 'saida' }[] = [];
  const amountRe = /([+-])\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
  let currentDate = '';

  for (const line of lines) {
    if (/saldo\s+(do\s+dia|inicial|final)/i.test(line)) continue;
    if (/total\s+de\s+(entradas|saídas|saidas)/i.test(line)) continue;
    if (/página|central\s+de\s+ajuda|relatório\s+de\s+movimentações|cloudwalk|cnpj/i.test(line)) continue;

    const brDate = parseBrazilianTextDate(line);
    const stdDate = line.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
    if (brDate) currentDate = brDate;
    else if (stdDate) currentDate = normalizeCSVDate(stdDate[1]);

    if (!currentDate) continue;

    const amountMatch = line.match(amountRe);
    if (!amountMatch) continue;

    const sign = amountMatch[1];
    const rawVal = amountMatch[2];
    const amount = parseAmount(rawVal);
    if (amount === 0) continue;

    const type: 'entrada' | 'saida' = sign === '+' ? 'entrada' : 'saida';

    let description = 'Sem descrição';
    const pixMatch = line.match(/Pix\s+(.+?)(?:\s+(?:Recebido|Enviado|Devolvido))/i);
    if (pixMatch) {
      description = pixMatch[1].trim();
    } else {
      const descMatch = line.match(/\d{2}:\d{2}\s+\w+\s+(.+?)(?:\s+(?:Recebido|Enviado|Devolvido))/i);
      if (descMatch) description = descMatch[1].trim();
    }

    results.push({ date: currentDate, description, amount, type });
  }
  return results;
}

function parseCSVMixed(text: string): { date: string; description: string; amount: number; type: 'entrada' | 'saida' }[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const separator = header.includes(';') ? ';' : ',';
  const cols = header.split(separator).map(c => c.trim().replace(/"/g, ''));
  const dateIdx = cols.findIndex(c => c.includes('data') || c.includes('date'));
  const descIdx = cols.findIndex(c => c.includes('desc') || c.includes('historico') || c.includes('histórico'));
  const amountIdx = cols.findIndex(c => c.includes('valor') || c.includes('amount') || c.includes('quantia'));

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
    const rawAmount = parts[amountIdx >= 0 ? amountIdx : 2] || '0';
    const numericVal = parseFloat(rawAmount.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    const amount = Math.abs(numericVal) || 0;
    const type: 'entrada' | 'saida' = numericVal >= 0 ? 'entrada' : 'saida';

    return {
      date: normalizeCSVDate(parts[dateIdx >= 0 ? dateIdx : 0] || ''),
      description: descIdx >= 0 ? (parts[descIdx] || 'Sem descrição') : 'Sem descrição',
      amount,
      type,
    };
  }).filter(l => l.amount !== 0 && l.date);
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let idCounter = 0;

export default function FinancialStartImport({ open, onOpenChange, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [movements, setMovements] = useState<ParsedMovement[]>([]);
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMvts = useMemo(() => movements.filter(m => m.selected), [movements]);
  const totalIn = useMemo(() => selectedMvts.filter(m => m.type === 'entrada').reduce((s, m) => s + m.amount, 0), [selectedMvts]);
  const totalOut = useMemo(() => selectedMvts.filter(m => m.type === 'saida').reduce((s, m) => s + m.amount, 0), [selectedMvts]);
  const netResult = useMemo(() => totalIn - totalOut, [totalIn, totalOut]);

  const finalBalance = summary?.finalBalance ?? 0;

  const reset = () => {
    setStep('upload');
    setMovements([]);
    setSummary(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'txt', 'pdf'].includes(ext || '')) {
      toast.error('Use .csv, .txt ou .pdf');
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      let raw: { date: string; description: string; amount: number; type: 'entrada' | 'saida' }[] = [];
      if (ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        const textLines = await extractTextFromPdf(buffer);
        const extractedSummary = extractSummary(textLines);
        setSummary(extractedSummary);
        raw = parsePdfTextMixed(textLines);
      } else {
        const text = await file.text();
        raw = parseCSVMixed(text);
      }
      if (raw.length === 0) {
        toast.error('Nenhuma movimentação encontrada no arquivo.');
        setLoading(false);
        return;
      }
      setMovements(raw.map(l => ({ ...l, id: `fs_${++idCounter}`, selected: true })));
      setStep('preview');
      toast.success(`${raw.length} movimentações encontradas`);
    } catch (err) {
      console.error('[FinancialStart] Parse error:', err);
      toast.error('Erro ao processar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const toggleLine = (id: string) => {
    setMovements(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  const changeType = (id: string, type: 'entrada' | 'saida') => {
    setMovements(prev => prev.map(m => m.id === id ? { ...m, type } : m));
  };

  const removeLine = (id: string) => {
    setMovements(prev => prev.filter(m => m.id !== id));
  };

  const toggleAll = (checked: boolean) => {
    setMovements(prev => prev.map(m => ({ ...m, selected: checked })));
  };

  const handleImport = async () => {
    if (selectedMvts.length === 0) {
      toast.error('Selecione ao menos uma movimentação');
      return;
    }
    setStep('importing');
    const items = selectedMvts.map(m => ({ date: m.date, description: m.description, amount: m.amount, type: m.type }));
    const ok = await onImport(items, finalBalance);
    if (ok) {
      toast.success(`${items.length} movimentação(ões) importadas! Saldo sincronizado: ${fmt(finalBalance)}`);
      reset();
      onOpenChange(false);
    } else {
      toast.error('Erro ao importar');
      setStep('preview');
    }
  };

  const formatDate = (d: string) => {
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
  };

  const allSelected = movements.length > 0 && movements.every(m => m.selected);

  const sortedMovements = useMemo(() => [...movements].sort((a, b) => a.date.localeCompare(b.date)), [movements]);

  const dateRange = useMemo(() => {
    if (sortedMovements.length === 0) return null;
    return { from: sortedMovements[0].date, to: sortedMovements[sortedMovements.length - 1].date };
  }, [sortedMovements]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Start Financeiro
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              <Alert className="border-primary/30 bg-primary/5">
                <Rocket className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <strong>Start Financeiro</strong> — Envie o extrato bancário (PDF). O sistema vai extrair automaticamente o <strong>saldo atual</strong>, todas as movimentações e sincronizar o financeiro com o valor real da sua conta.
                </AlertDescription>
              </Alert>

              <input ref={fileRef} type="file" accept=".csv,.txt,.pdf" onChange={handleFile} className="hidden" />
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="w-full p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-14 w-14 text-primary/60 animate-spin" />
                ) : (
                  <Upload className="h-14 w-14 text-primary/60" />
                )}
                <div className="text-center">
                  <p className="font-semibold text-foreground text-lg">{loading ? 'Lendo extrato...' : 'Envie o extrato bancário'}</p>
                  <p className="text-sm mt-1">PDF, CSV ou TXT — o saldo e movimentações serão extraídos automaticamente</p>
                </div>
              </motion.button>
            </motion.div>
          )}

          {/* Step 2: Preview with extracted data */}
          {step === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col min-h-0 flex-1">
              
              {/* Account header from PDF */}
              {summary && (
                <div className="p-4 rounded-xl border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 mb-3 flex-shrink-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      {summary.holder && <p className="text-sm font-semibold text-foreground">{summary.holder}</p>}
                      {summary.period && <p className="text-xs text-muted-foreground">Período: {summary.period}</p>}
                    </div>
                    <Badge variant="outline" className="text-xs gap-1">
                      <FileSpreadsheet className="h-3 w-3" />
                      {fileName}
                    </Badge>
                  </div>

                  {/* Balance cards extracted from PDF */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {summary.initialBalance !== null && (
                      <div className="p-2 rounded-lg bg-background/60 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saldo Inicial</p>
                        <p className="text-sm font-bold text-foreground">{fmt(summary.initialBalance)}</p>
                      </div>
                    )}
                    {summary.totalIn !== null && (
                      <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Entradas</p>
                        <p className="text-sm font-bold text-emerald-600">+{fmt(summary.totalIn)}</p>
                      </div>
                    )}
                    {summary.totalOut !== null && (
                      <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Saídas</p>
                        <p className="text-sm font-bold text-rose-600">-{fmt(summary.totalOut)}</p>
                      </div>
                    )}
                    <div className="p-2 rounded-lg bg-primary/10 border-2 border-primary/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Saldo Atual</p>
                      <p className="text-lg font-bold text-primary">{fmt(finalBalance)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Parsed movements summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 flex-shrink-0">
                <div className="p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                    <p className="text-xs text-muted-foreground">Entradas Selecionadas</p>
                  </div>
                  <p className="text-lg font-bold text-emerald-600">{fmt(totalIn)}</p>
                  <p className="text-xs text-muted-foreground">{selectedMvts.filter(m => m.type === 'entrada').length} itens</p>
                </div>
                <div className="p-3 rounded-lg border bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown className="h-3 w-3 text-rose-600" />
                    <p className="text-xs text-muted-foreground">Saídas Selecionadas</p>
                  </div>
                  <p className="text-lg font-bold text-rose-600">{fmt(totalOut)}</p>
                  <p className="text-xs text-muted-foreground">{selectedMvts.filter(m => m.type === 'saida').length} itens</p>
                </div>
                <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-1 mb-1">
                    <DollarSign className="h-3 w-3 text-blue-600" />
                    <p className="text-xs text-muted-foreground">Resultado Líquido</p>
                  </div>
                  <p className={`text-lg font-bold ${netResult >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(netResult)}</p>
                </div>
                <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-1 mb-1">
                    <Wallet className="h-3 w-3 text-primary" />
                    <p className="text-xs text-muted-foreground">Sincronizar Saldo</p>
                  </div>
                  <p className="text-lg font-bold text-primary">{fmt(finalBalance)}</p>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-auto flex-1 rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(!!v)} />
                      </TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Descrição</TableHead>
                      <TableHead className="text-xs text-right">Valor</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedMovements.map(m => (
                      <TableRow key={m.id} className={`transition-colors ${!m.selected ? 'opacity-40' : ''}`}>
                        <TableCell>
                          <Checkbox checked={m.selected} onCheckedChange={() => toggleLine(m.id)} />
                        </TableCell>
                        <TableCell className="text-xs font-mono">{formatDate(m.date)}</TableCell>
                        <TableCell>
                          <Select value={m.type} onValueChange={(v) => changeType(m.id, v as 'entrada' | 'saida')}>
                            <SelectTrigger className="h-7 text-xs w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="entrada">
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <ArrowUpCircle className="h-3 w-3" /> Entrada
                                </span>
                              </SelectItem>
                              <SelectItem value="saida">
                                <span className="flex items-center gap-1 text-rose-600">
                                  <ArrowDownCircle className="h-3 w-3" /> Saída
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{m.description}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.type === 'entrada' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {m.type === 'entrada' ? '+' : '-'}{fmt(m.amount)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(m.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t mt-3 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => { reset(); }}>← Voltar</Button>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Saldo que será sincronizado</p>
                    <p className="text-sm font-bold text-primary">{fmt(finalBalance)}</p>
                  </div>
                  <Button onClick={handleImport} className="gap-2" disabled={selectedMvts.length === 0}>
                    <CheckCircle className="h-4 w-4" />
                    Importar e Sincronizar ({selectedMvts.length})
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <motion.div key="importing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-muted-foreground font-medium">Importando movimentações...</p>
              <p className="text-xs text-muted-foreground">Sincronizando saldo: {fmt(finalBalance)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
