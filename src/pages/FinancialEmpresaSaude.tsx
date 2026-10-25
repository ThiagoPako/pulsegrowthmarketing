import { useMemo, useState } from 'react';
import { useFinancialData, normalizeDate, isExpensePaid } from '@/hooks/useFinancialData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { HeartPulse, TrendingUp, TrendingDown, DollarSign, Percent, Wallet, FileText } from 'lucide-react';
import FinancialQuickNav from '@/components/financial/FinancialQuickNav';
import { motion } from 'framer-motion';
import { exportReportPDF } from '@/lib/pdfExport';
import { useApp } from '@/contexts/AppContext';

type PeriodPreset = 'current' | 'previous' | 'quarter' | 'year' | 'custom';

// Chave de comparação de nomes: minúsculas, sem acento e só letras/números
const personKey = (value?: string | null) => (value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

// "Salário - Victor Oliveira (Editor) - PAGO" → "Victor Oliveira"
const salaryPersonName = (e: { description?: string; responsible?: string }) => {
  const cleaned = (e.description || '').replace(/\s+-\s+pago\s*$/i, '').trim();
  const match = cleaned.match(/^sal[aá]rio\s*-\s*(.+?)(?:\s*\([^)]+\))?$/i);
  return (match?.[1] || e.responsible || '').trim();
};

const WITHDRAWAL_TEXT = /retirada|pr[oó][- ]?labore|s[oó]cio/i;

const fmt = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinancialEmpresaSaude() {
  const { revenues, expenses, categories, loading } = useFinancialData();
  const { users } = useApp();
  const [periodType, setPeriodType] = useState<PeriodPreset>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodType === 'current') return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
    if (periodType === 'previous') {
      const p = subMonths(now, 1);
      return { start: format(startOfMonth(p), 'yyyy-MM-dd'), end: format(endOfMonth(p), 'yyyy-MM-dd') };
    }
    if (periodType === 'quarter') {
      const start = subMonths(startOfMonth(now), 2);
      return { start: format(start, 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
    if (periodType === 'year') return { start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(endOfYear(now), 'yyyy-MM-dd') };
    return {
      start: customStart || format(startOfMonth(now), 'yyyy-MM-dd'),
      end: customEnd || format(endOfMonth(now), 'yyyy-MM-dd'),
    };
  }, [periodType, customStart, customEnd]);

  // Retirada de sócio: categoria Pró-labore, ou lançamento no nome de um sócio
  // (papel admin ou sócio gestor, principal ou adicional). Antes era qualquer texto
  // com "thiago" ou "victor", o que tirava dos custos o salário de funcionários com
  // o mesmo nome.
  const prolaboreCategoryId = useMemo(
    () => categories.find(c => /pr[oó][- ]?labore/i.test(c.name || ''))?.id || null,
    [categories]
  );
  const salaryCategoryId = useMemo(
    () => categories.find(c => (c.name || '').toLowerCase() === 'salários')?.id || null,
    [categories]
  );
  const socioKeys = useMemo(() => {
    const isSocio = (u: (typeof users)[number]) =>
      (u.roles?.length ? u.roles : [u.role]).some(r => r === 'admin' || r === 'socio_gestor');
    const firstName = (v?: string) => personKey((v || '').trim().split(/\s+/)[0]);
    // Nomes e primeiros nomes de quem não é sócio: nome de sócio igual a um deles é
    // ambíguo (ex.: sócio cadastrado só como "Victor" e o editor Victor Oliveira)
    const others = new Set<string>();
    users.filter(u => !isSocio(u)).forEach(u => {
      [u.displayName, u.name].forEach(v => {
        others.add(personKey(v));
        others.add(firstName(v));
      });
    });
    const full = new Set<string>();
    const first = new Set<string>();
    users.filter(isSocio).forEach(u => {
      [u.displayName, u.name].forEach(v => {
        const k = personKey(v);
        if (k.length >= 4 && !others.has(k)) full.add(k);
        const f = firstName(v);
        if (f.length >= 4) first.add(f);
      });
    });
    return { full, first };
  }, [users]);

  const isOwnerExpense = (e: { description?: string; responsible?: string; category_id?: string }) => {
    if (prolaboreCategoryId && e.category_id === prolaboreCategoryId) return true;
    // Salário só conta como retirada quando é de um sócio (nome completo, nunca só o primeiro nome)
    if (salaryCategoryId && e.category_id === salaryCategoryId) {
      return socioKeys.full.has(personKey(salaryPersonName(e))) || socioKeys.full.has(personKey(e.responsible));
    }
    // Demais categorias: o nome completo do sócio basta (ex.: "Plano de saúde Thiago
    // Pereira Silva"); o primeiro nome só conta junto com texto de retirada
    const hay = personKey(`${e.description || ''} ${e.responsible || ''}`);
    if ([...socioKeys.full].some(k => hay.includes(k))) return true;
    if (!WITHDRAWAL_TEXT.test(e.description || '')) return false;
    return [...socioKeys.first].some(k => hay.includes(k));
  };

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories]);

  const data = useMemo(() => {
    const inRange = (d?: string | null) => {
      const s = normalizeDate(d || '');
      return s >= dateRange.start && s <= dateRange.end;
    };

    const receivedRevenues = revenues.filter(r => (r.status === 'recebida' || r.status === 'pago') && inRange(r.paid_at || r.due_date));
    const totalRevenue = receivedRevenues.reduce((a, r) => a + Number(r.amount || 0), 0);

    const periodExpenses = expenses.filter(e => isExpensePaid(e) && inRange(e.date));
    const ownerExpenses = periodExpenses.filter(isOwnerExpense);
    const companyExpenses = periodExpenses.filter(e => !isOwnerExpense(e));

    const totalOwnerExpense = ownerExpenses.reduce((a, e) => a + Number(e.amount || 0), 0);
    const totalCompanyExpense = companyExpenses.reduce((a, e) => a + Number(e.amount || 0), 0);

    const profit = totalRevenue - totalCompanyExpense;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    // By category (company only)
    const byCategoryMap = new Map<string, number>();
    companyExpenses.forEach(e => {
      const name = catById[e.category_id] || 'Sem categoria';
      byCategoryMap.set(name, (byCategoryMap.get(name) || 0) + Number(e.amount || 0));
    });
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return { totalRevenue, totalCompanyExpense, totalOwnerExpense, profit, margin, byCategory, companyExpenses, ownerExpenses };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenues, expenses, dateRange, catById, prolaboreCategoryId, salaryCategoryId, socioKeys]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <FinancialQuickNav />

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-primary/20">
              <HeartPulse className="text-emerald-600" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Empresa Saúde</h1>
              <p className="text-sm text-muted-foreground">Faturamento, custos operacionais e margem de lucro (excluindo pró-labore e retiradas dos sócios).</p>
            </div>
          </div>
        </motion.div>

        {/* Period Filter */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              {([
                ['current', 'Mês atual'],
                ['previous', 'Mês anterior'],
                ['quarter', 'Últimos 3 meses'],
                ['year', 'Ano'],
                ['custom', 'Período'],
              ] as [PeriodPreset, string][]).map(([k, label]) => (
                <Button key={k} size="sm" variant={periodType === k ? 'default' : 'outline'} onClick={() => setPeriodType(k)}>
                  {label}
                </Button>
              ))}
              {periodType === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-40" />
                  <span className="text-muted-foreground text-sm">até</span>
                  <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-40" />
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{dateRange.start} → {dateRange.end}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => exportReportPDF({
                    title: 'Empresa Saúde',
                    subtitle: 'Faturamento, custos operacionais e margem de lucro (excluídas retiradas dos sócios).',
                    period: dateRange,
                    filename: `empresa-saude-${dateRange.start}_${dateRange.end}.pdf`,
                    kpis: [
                      { label: 'Total Faturado', value: fmt(data.totalRevenue) },
                      { label: 'Gastos da Empresa', value: fmt(data.totalCompanyExpense), sub: `+ ${fmt(data.totalOwnerExpense)} sócios (excluído)` },
                      { label: 'Lucro Líquido', value: fmt(data.profit) },
                      { label: 'Margem de Lucro', value: `${data.margin.toFixed(1)}%` },
                    ],
                    tables: [
                      {
                        title: 'Gastos por Categoria',
                        headers: ['Categoria', 'Total', '% do total'],
                        rows: data.byCategory.map(c => [
                          c.name,
                          fmt(c.total),
                          `${data.totalCompanyExpense > 0 ? ((c.total / data.totalCompanyExpense) * 100).toFixed(1) : '0'}%`,
                        ]),
                      },
                      {
                        title: 'Detalhamento dos Gastos',
                        headers: ['Data', 'Descrição', 'Categoria', 'Valor'],
                        rows: [...data.companyExpenses]
                          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                          .map(e => [
                            normalizeDate(e.date),
                            e.description || '—',
                            catById[e.category_id] || 'Sem categoria',
                            fmt(Number(e.amount || 0)),
                          ]),
                      },
                      ...(data.ownerExpenses.length ? [{
                        title: 'Retiradas dos Sócios (excluídas)',
                        headers: ['Data', 'Descrição', 'Valor'],
                        rows: data.ownerExpenses.map(e => [
                          normalizeDate(e.date),
                          e.description || '—',
                          fmt(Number(e.amount || 0)),
                        ]),
                      }] : []),
                    ],
                  })}
                >
                  <FileText size={14} /> Exportar PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {[
                { icon: DollarSign, label: 'Total Faturado', value: fmt(data.totalRevenue), color: 'text-emerald-600', border: 'hsl(142,71%,45%)' },
                { icon: TrendingDown, label: 'Gastos da Empresa', value: fmt(data.totalCompanyExpense), color: 'text-destructive', border: 'hsl(0,72%,51%)', sub: `+ ${fmt(data.totalOwnerExpense)} sócios (excluído)` },
                { icon: Wallet, label: 'Lucro Líquido', value: fmt(data.profit), color: data.profit >= 0 ? 'text-emerald-600' : 'text-destructive', border: data.profit >= 0 ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)' },
                { icon: Percent, label: 'Margem de Lucro', value: `${data.margin.toFixed(1)}%`, color: data.margin >= 20 ? 'text-emerald-600' : data.margin >= 0 ? 'text-amber-600' : 'text-destructive', border: 'hsl(45,93%,47%)' },
              ].map((k, i) => (
                <Card key={i} className="border-l-4 overflow-hidden" style={{ borderLeftColor: k.border }}>
                  <CardContent className="p-4">
                    <k.icon size={20} className={`${k.color} mb-2`} />
                    <p className="text-2xl font-bold">{k.value}</p>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
                    {k.sub && <p className="text-[10px] text-muted-foreground mt-1">{k.sub}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By Category */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown size={16} className="text-primary" /> Gastos por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byCategory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum gasto no período.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Categoria</TableHead>
                          <TableHead className="text-right text-xs">Total</TableHead>
                          <TableHead className="text-right text-xs">% do total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byCategory.map(c => (
                          <TableRow key={c.name}>
                            <TableCell className="text-xs">{c.name}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmt(c.total)}</TableCell>
                            <TableCell className="text-right text-xs">{data.totalCompanyExpense > 0 ? ((c.total / data.totalCompanyExpense) * 100).toFixed(1) : '0'}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Expenses */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign size={16} className="text-primary" /> Detalhamento dos Gastos
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[500px] overflow-y-auto">
                  {data.companyExpenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum gasto.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs">Categoria</TableHead>
                          <TableHead className="text-right text-xs">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...data.companyExpenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(e => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs">{normalizeDate(e.date)}</TableCell>
                            <TableCell className="text-xs">{e.description || '—'}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px]">{catById[e.category_id] || 'Sem categoria'}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmt(Number(e.amount || 0))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {data.ownerExpenses.length > 0 && (
              <Card className="mt-4 border-dashed">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">Retiradas dos Sócios (excluídas do cálculo)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">Pró-labore, lançamentos no nome completo de um sócio (papel admin ou sócio gestor) e retiradas que citam o primeiro nome do sócio não entram como custos operacionais.</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Descrição</TableHead>
                        <TableHead className="text-right text-xs">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.ownerExpenses.map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">{normalizeDate(e.date)}</TableCell>
                          <TableCell className="text-xs">{e.description || '—'}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{fmt(Number(e.amount || 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
