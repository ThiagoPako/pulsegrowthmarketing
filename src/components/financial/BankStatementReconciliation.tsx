import { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, FileText, AlertTriangle, CheckCircle, XCircle, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { normalizeDate } from '@/hooks/useFinancialData';
import * as pdfjsLib from 'pdfjs-dist';

interface StatementLine {
  date: string;
  description: string;
  amount: number;
}

interface ReconciliationResult {
  matched: { statement: StatementLine; systemId: string; systemDesc: string }[];
  missingInSystem: StatementLine[];
  missingInStatement: { id: string; date: string; description: string; amount: number }[];
}

interface SystemMovement {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'entrada' | 'saida';
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  systemMovements: SystemMovement[];
}

const TOLERANCE = 0.02; // R$ 0.02 tolerance for matching

function parseCSV(text: string): StatementLine[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const separator = header.includes(';') ? ';' : ',';
  const cols = header.split(separator).map(c => c.trim().replace(/"/g, ''));

  // Try to detect column indices
  const dateIdx = cols.findIndex(c => c.includes('data') || c.includes('date'));
  const descIdx = cols.findIndex(c => c.includes('desc') || c.includes('historico') || c.includes('histórico') || c.includes('memo'));
  const amountIdx = cols.findIndex(c => c.includes('valor') || c.includes('amount') || c.includes('quantia') || c.includes('value'));

  if (dateIdx === -1 || amountIdx === -1) {
    // Fallback: assume date, description, amount
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
      const rawAmount = parts[2] || parts[1] || '0';
      return {
        date: normalizeCSVDate(parts[0] || ''),
        description: parts.length >= 3 ? parts[1] : 'Sem descrição',
        amount: parseAmount(rawAmount),
      };
    }).filter(l => l.amount !== 0 && l.date);
  }

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
    return {
      date: normalizeCSVDate(parts[dateIdx] || ''),
      description: descIdx >= 0 ? (parts[descIdx] || 'Sem descrição') : 'Sem descrição',
      amount: parseAmount(parts[amountIdx] || '0'),
    };
  }).filter(l => l.amount !== 0 && l.date);
}

function normalizeCSVDate(d: string): string {
  // Handle dd/mm/yyyy
  const brMatch = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  // Handle yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split('T')[0];
  // Handle dd-mm-yyyy
  const altMatch = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (altMatch) return `${altMatch[3]}-${altMatch[2]}-${altMatch[1]}`;
  return d;
}

function parseAmount(s: string): number {
  // Handle Brazilian format: 1.234,56 → 1234.56
  let clean = s.replace(/\s/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    // 1.234,56 format
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.abs(val);
}

// ── PDF text extraction ──────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(' '));
  }
  return pages.join('\n');
}

function parsePdfText(raw: string): StatementLine[] {
  const lines = raw.split('\n').flatMap(l => l.split(/\s{2,}/));
  const results: StatementLine[] = [];

  // Regex for date patterns
  const dateRe = /(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/;
  // Regex for Brazilian currency amounts: 1.234,56 or -1.234,56 or 1234,56
  const amountRe = /(-?\d{1,3}(?:\.\d{3})*,\d{2})/;

  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    const amountMatch = line.match(amountRe);
    if (dateMatch && amountMatch) {
      const date = normalizeCSVDate(dateMatch[1]);
      const amount = parseAmount(amountMatch[1]);
      if (amount === 0) continue;
      // Extract description: text between date and amount
      const afterDate = line.substring((dateMatch.index || 0) + dateMatch[0].length);
      const beforeAmount = afterDate.substring(0, afterDate.indexOf(amountMatch[1]));
      const desc = beforeAmount.replace(/[|;,]+/g, ' ').trim() || 'Sem descrição';
      results.push({ date, description: desc, amount });
    }
  }
  return results;
}

function reconcile(
  statementLines: StatementLine[],
  systemMovs: SystemMovement[],
  periodStart: string,
  periodEnd: string
): ReconciliationResult {
  const filteredSystem = systemMovs.filter(m => {
    const d = normalizeDate(m.date);
    return d >= periodStart && d <= periodEnd;
  });

  const matched: ReconciliationResult['matched'] = [];
  const usedSystemIds = new Set<string>();
  const usedStatementIdx = new Set<number>();

  // Match by amount + date
  statementLines.forEach((sl, idx) => {
    for (const sm of filteredSystem) {
      if (usedSystemIds.has(sm.id)) continue;
      const dateMatch = normalizeDate(sm.date) === sl.date;
      const amountMatch = Math.abs(sm.amount - sl.amount) <= TOLERANCE;
      if (dateMatch && amountMatch) {
        matched.push({ statement: sl, systemId: sm.id, systemDesc: sm.description });
        usedSystemIds.add(sm.id);
        usedStatementIdx.add(idx);
        break;
      }
    }
  });

  // Fuzzy match remaining by amount only (within 1 day range)
  statementLines.forEach((sl, idx) => {
    if (usedStatementIdx.has(idx)) return;
    for (const sm of filteredSystem) {
      if (usedSystemIds.has(sm.id)) continue;
      const amountMatch = Math.abs(sm.amount - sl.amount) <= TOLERANCE;
      const dateDiff = Math.abs(new Date(sl.date).getTime() - new Date(normalizeDate(sm.date)).getTime());
      if (amountMatch && dateDiff <= 86400000) { // 1 day
        matched.push({ statement: sl, systemId: sm.id, systemDesc: sm.description });
        usedSystemIds.add(sm.id);
        usedStatementIdx.add(idx);
        break;
      }
    }
  });

  const missingInSystem = statementLines.filter((_, i) => !usedStatementIdx.has(i));
  const missingInStatement = filteredSystem
    .filter(m => !usedSystemIds.has(m.id))
    .map(m => ({ id: m.id, date: normalizeDate(m.date), description: m.description, amount: m.amount }));

  return { matched, missingInSystem, missingInStatement };
}

export default function BankStatementReconciliation({ open, onOpenChange, systemMovements }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [statementType, setStatementType] = useState<'entrada' | 'saida' | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [parsedLines, setParsedLines] = useState<StatementLine[]>([]);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<'config' | 'review' | 'result'>('config');
  const [loading, setLoading] = useState(false);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      toast.error('Formato não suportado. Use arquivos .csv ou .txt');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = parseCSV(text);
      if (lines.length === 0) {
        toast.error('Não foi possível ler o extrato. Verifique o formato do arquivo.');
        return;
      }
      setParsedLines(lines);
      setStep('review');
      toast.success(`${lines.length} lançamentos encontrados no extrato`);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleReconcile = () => {
    if (!periodStart || !periodEnd) {
      toast.error('Selecione o período');
      return;
    }
    if (!statementType) {
      toast.error('Selecione o tipo de extrato');
      return;
    }

    const filteredSystem = systemMovements.filter(m => m.type === statementType);
    const res = reconcile(parsedLines, filteredSystem, periodStart, periodEnd);
    setResult(res);
    setStep('result');
  };

  const reset = () => {
    setStep('config');
    setStatementType(null);
    setPeriodStart('');
    setPeriodEnd('');
    setParsedLines([]);
    setResult(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); } onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Conciliação Bancária
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* Warning */}
              <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>Importante:</strong> O extrato deve conter <strong>apenas entradas</strong> ou <strong>apenas saídas</strong>. 
                  Não envie extratos mistos. Selecione o tipo correspondente abaixo.
                </AlertDescription>
              </Alert>

              {/* Statement Type */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Tipo do Extrato</Label>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStatementType('entrada')}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      statementType === 'entrada'
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md shadow-green-500/20'
                        : 'border-border hover:border-green-500/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                      <CheckCircle className="h-5 w-5" />
                      Entradas (Receitas)
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Recebimentos, depósitos, transferências recebidas</p>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStatementType('saida')}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      statementType === 'saida'
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/30 shadow-md shadow-red-500/20'
                        : 'border-border hover:border-red-500/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
                      <XCircle className="h-5 w-5" />
                      Saídas (Despesas)
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Pagamentos, transferências enviadas, débitos</p>
                  </motion.button>
                </div>
              </div>

              {/* Period */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data Início</Label>
                  <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
                </div>
                <div>
                  <Label>Data Fim</Label>
                  <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
                </div>
              </div>

              {/* File Upload */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Arquivo do Extrato (.csv)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => fileRef.current?.click()}
                  className="w-full p-8 border-2 border-dashed rounded-xl flex flex-col items-center gap-3 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <Upload className="h-10 w-10 text-primary/60" />
                  <div className="text-center">
                    <p className="font-medium">Clique para enviar o extrato</p>
                    <p className="text-xs">Formatos aceitos: .csv, .txt</p>
                  </div>
                </motion.button>
                {fileName && (
                  <p className="text-sm text-primary mt-2 flex items-center gap-1">
                    <FileSpreadsheet className="h-4 w-4" /> {fileName}
                  </p>
                )}
              </div>

              <Alert className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/10">
                <Info className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-xs text-muted-foreground">
                  O CSV deve ter colunas de <strong>Data</strong>, <strong>Descrição</strong> e <strong>Valor</strong>. 
                  Formatos de data aceitos: dd/mm/aaaa ou aaaa-mm-dd. Valores podem usar vírgula (1.234,56) ou ponto (1234.56).
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {step === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{parsedLines.length} lançamentos encontrados</p>
                  <p className="text-xs text-muted-foreground">{fileName}</p>
                </div>
                <Badge variant={statementType === 'entrada' ? 'default' : 'destructive'}>
                  {statementType === 'entrada' ? 'Entradas' : 'Saídas'}
                </Badge>
              </div>

              <div className="max-h-[300px] overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedLines.slice(0, 50).map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs whitespace-nowrap">{l.date}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{l.description}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{fmt(l.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedLines.length > 50 && (
                <p className="text-xs text-muted-foreground text-center">Mostrando 50 de {parsedLines.length} lançamentos</p>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={reset} className="flex-1">Voltar</Button>
                <Button onClick={handleReconcile} className="flex-1" disabled={!periodStart || !periodEnd || !statementType}>
                  Conciliar Extrato
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/10">
                  <CardContent className="pt-3 pb-3 text-center">
                    <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-green-600">{result.matched.length}</p>
                    <p className="text-xs text-muted-foreground">Conciliados</p>
                  </CardContent>
                </Card>
                <Card className={`border-amber-500/30 ${result.missingInSystem.length > 0 ? 'bg-amber-50/50 dark:bg-amber-950/10' : 'bg-muted/30'}`}>
                  <CardContent className="pt-3 pb-3 text-center">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-amber-600">{result.missingInSystem.length}</p>
                    <p className="text-xs text-muted-foreground">Não lançados</p>
                  </CardContent>
                </Card>
                <Card className={`border-blue-500/30 ${result.missingInStatement.length > 0 ? 'bg-blue-50/50 dark:bg-blue-950/10' : 'bg-muted/30'}`}>
                  <CardContent className="pt-3 pb-3 text-center">
                    <Info className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-600">{result.missingInStatement.length}</p>
                    <p className="text-xs text-muted-foreground">Sem extrato</p>
                  </CardContent>
                </Card>
              </div>

              {/* Missing in system - most important */}
              {result.missingInSystem.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Lançamentos do extrato NÃO encontrados no sistema ({result.missingInSystem.length})
                  </h3>
                  <div className="max-h-[200px] overflow-y-auto rounded-lg border border-amber-500/30">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.missingInSystem.map((l, i) => (
                          <TableRow key={i} className="bg-amber-50/30 dark:bg-amber-950/10">
                            <TableCell className="text-xs">{l.date}</TableCell>
                            <TableCell className="text-xs">{l.description}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-amber-700">{fmt(l.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Esses valores estão no extrato bancário mas não foram registrados no sistema. Verifique e lance manualmente.
                  </p>
                </div>
              )}

              {/* Missing in statement */}
              {result.missingInStatement.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1">
                    <Info className="h-4 w-4" />
                    Lançamentos do sistema NÃO encontrados no extrato ({result.missingInStatement.length})
                  </h3>
                  <div className="max-h-[200px] overflow-y-auto rounded-lg border border-blue-500/30">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.missingInStatement.map(l => (
                          <TableRow key={l.id} className="bg-blue-50/30 dark:bg-blue-950/10">
                            <TableCell className="text-xs">{l.date}</TableCell>
                            <TableCell className="text-xs">{l.description}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-blue-700">{fmt(l.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    ℹ Esses valores estão no sistema mas não apareceram no extrato. Podem ser lançamentos futuros ou erros.
                  </p>
                </div>
              )}

              {result.missingInSystem.length === 0 && result.missingInStatement.length === 0 && (
                <Alert className="border-green-500/30 bg-green-50 dark:bg-green-950/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    <strong>Tudo certo!</strong> Todos os lançamentos do extrato conferem com o sistema. Nenhuma divergência encontrada.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={reset} className="flex-1">Nova Conciliação</Button>
                <Button onClick={() => onOpenChange(false)} className="flex-1">Fechar</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
