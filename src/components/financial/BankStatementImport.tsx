import { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Loader2, Trash2, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { normalizeDate } from '@/hooks/useFinancialData';
import * as pdfjsLib from 'pdfjs-dist';

// ── Types ────────────────────────────────────────────────────────────
interface ParsedLine {
  id: string;
  date: string;
  description: string;
  amount: number;
  selected: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (items: { date: string; description: string; amount: number }[], type: 'entrada' | 'saida') => Promise<boolean>;
}

// ── PDF parsing (reuse logic) ────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

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

const MONTH_MAP: Record<string, string> = {
  'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
  'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
  'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
};

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

function normalizeCSVDate(d: string): string {
  const brMatch = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split('T')[0];
  const altMatch = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (altMatch) return `${altMatch[3]}-${altMatch[2]}-${altMatch[1]}`;
  return d;
}

function parsePdfText(lines: string[]): { date: string; description: string; amount: number }[] {
  const results: { date: string; description: string; amount: number }[] = [];
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

    const rawVal = amountMatch[2];
    const amount = parseAmount(rawVal);
    if (amount === 0) continue;

    let description = 'Sem descrição';
    const pixMatch = line.match(/Pix\s+(.+?)(?:\s+(?:Recebido|Enviado|Devolvido))/i);
    if (pixMatch) {
      description = pixMatch[1].trim();
    } else {
      const descMatch = line.match(/\d{2}:\d{2}\s+\w+\s+(.+?)(?:\s+(?:Recebido|Enviado|Devolvido))/i);
      if (descMatch) description = descMatch[1].trim();
    }

    results.push({ date: currentDate, description, amount });
  }
  return results;
}

function parseCSV(text: string): { date: string; description: string; amount: number }[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const separator = header.includes(';') ? ';' : ',';
  const cols = header.split(separator).map(c => c.trim().replace(/"/g, ''));
  const dateIdx = cols.findIndex(c => c.includes('data') || c.includes('date'));
  const descIdx = cols.findIndex(c => c.includes('desc') || c.includes('historico') || c.includes('histórico') || c.includes('memo'));
  const amountIdx = cols.findIndex(c => c.includes('valor') || c.includes('amount') || c.includes('quantia') || c.includes('value'));

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
    if (dateIdx >= 0 && amountIdx >= 0) {
      return {
        date: normalizeCSVDate(parts[dateIdx] || ''),
        description: descIdx >= 0 ? (parts[descIdx] || 'Sem descrição') : 'Sem descrição',
        amount: parseAmount(parts[amountIdx] || '0'),
      };
    }
    return {
      date: normalizeCSVDate(parts[0] || ''),
      description: parts.length >= 3 ? parts[1] : 'Sem descrição',
      amount: parseAmount(parts[2] || parts[1] || '0'),
    };
  }).filter(l => l.amount !== 0 && l.date);
}

// ── Component ────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let idCounter = 0;

export default function BankStatementImport({ open, onOpenChange, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [statementType, setStatementType] = useState<'entrada' | 'saida' | null>(null);
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedLines = useMemo(() => parsedLines.filter(l => l.selected), [parsedLines]);
  const selectedTotal = useMemo(() => selectedLines.reduce((s, l) => s + l.amount, 0), [selectedLines]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'txt', 'pdf'].includes(ext || '')) {
      toast.error('Formato não suportado. Use .csv, .txt ou .pdf');
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      let raw: { date: string; description: string; amount: number }[] = [];
      if (ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        const textLines = await extractTextFromPdf(buffer);
        raw = parsePdfText(textLines);
      } else {
        const text = await file.text();
        raw = parseCSV(text);
      }
      if (raw.length === 0) {
        toast.error('Nenhum lançamento encontrado no arquivo.');
        setLoading(false);
        return;
      }
      setParsedLines(raw.map(l => ({ ...l, id: `line_${++idCounter}`, selected: true })));
      setStep('preview');
      toast.success(`${raw.length} lançamentos encontrados`);
    } catch (err) {
      console.error('[BankStatementImport] Parse error:', err);
      toast.error('Erro ao processar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const toggleLine = (id: string) => {
    setParsedLines(prev => prev.map(l => l.id === id ? { ...l, selected: !l.selected } : l));
  };

  const toggleAll = (checked: boolean) => {
    setParsedLines(prev => prev.map(l => ({ ...l, selected: checked })));
  };

  const removeLine = (id: string) => {
    setParsedLines(prev => prev.filter(l => l.id !== id));
  };

  const handleImport = async () => {
    if (!statementType) {
      toast.error('Selecione o tipo: Entradas ou Saídas');
      return;
    }
    if (selectedLines.length === 0) {
      toast.error('Selecione ao menos um lançamento');
      return;
    }
    setStep('importing');
    const items = selectedLines.map(l => ({ date: l.date, description: l.description, amount: l.amount }));
    const ok = await onImport(items, statementType);
    if (ok) {
      toast.success(`${items.length} lançamento(s) importado(s) com sucesso!`);
      reset();
      onOpenChange(false);
    } else {
      toast.error('Erro ao importar lançamentos');
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('upload');
    setStatementType(null);
    setParsedLines([]);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const formatDate = (d: string) => {
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const allSelected = parsedLines.length > 0 && parsedLines.every(l => l.selected);
  const someSelected = parsedLines.some(l => l.selected) && !allSelected;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Extrato Bancário
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <Alert className="border-blue-500/30 bg-blue-50 dark:bg-blue-950/20">
                <AlertTriangle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                  Envie seu extrato bancário em PDF, CSV ou TXT. Você poderá revisar, selecionar e excluir lançamentos antes de importar.
                </AlertDescription>
              </Alert>

              {/* Statement Type */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Tipo de Lançamento</Label>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStatementType('entrada')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      statementType === 'entrada'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-lg shadow-emerald-500/20'
                        : 'border-border hover:border-emerald-400/50 hover:bg-emerald-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle className="h-5 w-5" />
                      Entradas (Receitas)
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Recebimentos, depósitos, Pix recebidos</p>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStatementType('saida')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      statementType === 'saida'
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 shadow-lg shadow-rose-500/20'
                        : 'border-border hover:border-rose-400/50 hover:bg-rose-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-400">
                      <XCircle className="h-5 w-5" />
                      Saídas (Despesas)
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Pagamentos, transferências enviadas, débitos</p>
                  </motion.button>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Arquivo do Extrato</Label>
                <input ref={fileRef} type="file" accept=".csv,.txt,.pdf" onChange={handleFileUpload} className="hidden" />
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    if (!statementType) { toast.error('Selecione o tipo primeiro'); return; }
                    fileRef.current?.click();
                  }}
                  disabled={loading}
                  className="w-full p-10 border-2 border-dashed rounded-2xl flex flex-col items-center gap-3 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-12 w-12 text-primary/60 animate-spin" />
                  ) : (
                    <Upload className="h-12 w-12 text-primary/60" />
                  )}
                  <div className="text-center">
                    <p className="font-medium text-foreground">{loading ? 'Processando arquivo...' : 'Clique para enviar o extrato'}</p>
                    <p className="text-xs mt-1">Formatos aceitos: .pdf, .csv, .txt</p>
                  </div>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Preview & Select */}
          {step === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col min-h-0 flex-1"
            >
              {/* Summary bar */}
              <div className="flex items-center justify-between py-3 px-1 border-b mb-3 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs gap-1">
                    <FileSpreadsheet className="h-3 w-3" />
                    {fileName}
                  </Badge>
                  <Badge className={statementType === 'entrada' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300' : 'bg-rose-500/10 text-rose-700 border-rose-300'}>
                    {statementType === 'entrada' ? '↑ Entradas' : '↓ Saídas'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">{selectedLines.length}</strong> de {parsedLines.length} selecionados
                  </span>
                  <span className="font-bold text-foreground">{fmt(selectedTotal)}</span>
                </div>
              </div>

              {/* Table with scroll */}
              <div className="overflow-auto flex-1 rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          ref={(el: any) => { if (el) el.indeterminate = someSelected; }}
                          onCheckedChange={(v) => toggleAll(!!v)}
                        />
                      </TableHead>
                      <TableHead className="text-xs font-semibold">Data</TableHead>
                      <TableHead className="text-xs font-semibold">Descrição</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Valor</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedLines.map((line, i) => (
                      <TableRow
                        key={line.id}
                        className={`transition-colors ${
                          line.selected
                            ? 'bg-primary/5 hover:bg-primary/10'
                            : 'opacity-50 hover:opacity-70'
                        }`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={line.selected}
                            onCheckedChange={() => toggleLine(line.id)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono whitespace-nowrap">{formatDate(line.date)}</TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate" title={line.description}>
                          {line.description}
                        </TableCell>
                        <TableCell className={`text-xs font-bold text-right whitespace-nowrap ${
                          statementType === 'entrada' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {fmt(line.amount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLine(line.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 flex-shrink-0">
                <Button variant="outline" onClick={() => { reset(); }} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedLines.length === 0}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
                >
                  <Check className="h-4 w-4" />
                  Importar {selectedLines.length} lançamento{selectedLines.length !== 1 ? 's' : ''} ({fmt(selectedTotal)})
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <motion.div
              key="importing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-4"
            >
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">Importando lançamentos...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
