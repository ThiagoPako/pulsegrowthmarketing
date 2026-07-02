import { useMemo, useState } from 'react';
import { useFinancialData, normalizeDate } from '@/hooks/useFinancialData';
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

type PeriodPreset = 'current' | 'previous' | 'quarter' | 'year' | 'custom';

const OWNER_KEYWORDS = ['thiago', 'victor'];

const fmt = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinancialEmpresaSaude() {
  const { revenues, expenses, categories, loading } = useFinancialData();
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

  const isOwnerExpense = (e: { description?: string; responsible?: string }) => {
    const hay = `${e.description || ''} ${e.responsible || ''}`.toLowerCase();
    return OWNER_KEYWORDS.some(k => hay.includes(k));
  };

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories]);

  const data = useMemo(() => {
    const inRange = (d?: string | null) => {
      const s = normalizeDate(d || '');
      return s >= dateRange.start && s <= dateRange.end;
    };

    const receivedRevenues = revenues.filter(r => (r.status === 'recebida' || r.status === 'pago') && inRange(r.paid_at || r.due_date));
    const totalRevenue = receivedRevenues.reduce((a, r) => a + Number(r.amount || 0), 0);

    const periodExpenses = expenses.filter(e => inRange(e.date));
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
  }, [revenues, expenses, dateRange, catById]);

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
              <p className="text-sm text-muted-foreground">Faturamento, custos operacionais e margem de lucro (excluindo retiradas dos sócios Thiago e Victor).</p>
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
              <div className="ml-auto text-xs text-muted-foreground">
                {dateRange.start} → {dateRange.end}
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
                  <p className="text-xs text-muted-foreground mb-2">Estas despesas contêm "Thiago" ou "Victor" e são consideradas retiradas dos sócios, não custos operacionais.</p>
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
