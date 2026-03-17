import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Users, FileText, CreditCard, ArrowRight, BarChart3, CalendarClock, CheckCircle, Wallet, ArrowUpCircle, ArrowDownCircle, History, ClipboardList, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { sendWhatsAppMessage } from '@/services/whatsappService';
import { generateDeliveryReport, resolvePaymentInfo } from '@/lib/billingReport';
import cobrarTodosImg from '@/assets/cobrar_todos.png';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

const COLORS = ['hsl(0,72%,51%)', 'hsl(25,95%,53%)', 'hsl(45,93%,47%)', 'hsl(142,71%,45%)', 'hsl(187,85%,43%)', 'hsl(217,91%,60%)', 'hsl(262,83%,58%)', 'hsl(330,81%,60%)', 'hsl(25,50%,38%)'];

export default function FinancialDashboard() {
  const navigate = useNavigate();
  const { contracts, revenues, expenses, categories, cashMovements, activityLog, paymentConfig, loading, updateRevenue } = useFinancialData();
  const { clients, recordings, users } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [sendingAllOverdue, setSendingAllOverdue] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMsg, setCelebrationMsg] = useState('');

  const monthStart = useMemo(() => startOfMonth(new Date(selectedMonth + '-01T12:00:00')), [selectedMonth]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);

  // Filter data for selected month
  const monthRevenues = useMemo(() =>
    revenues.filter(r => r.reference_month === format(monthStart, 'yyyy-MM-dd')),
    [revenues, monthStart]
  );

  const monthExpenses = useMemo(() =>
    expenses.filter(e => {
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    }),
    [expenses, monthStart, monthEnd]
  );

  // KPIs
  const mrr = useMemo(() =>
    contracts.filter(c => c.status === 'ativo').reduce((sum, c) => sum + Number(c.contract_value), 0),
    [contracts]
  );

  const revenuePrevista = useMemo(() => monthRevenues.reduce((s, r) => s + Number(r.amount), 0), [monthRevenues]);
  const revenueRecebida = useMemo(() => monthRevenues.filter(r => r.status === 'recebida').reduce((s, r) => s + Number(r.amount), 0), [monthRevenues]);
  const revenueAtraso = useMemo(() => monthRevenues.filter(r => r.status === 'em_atraso').reduce((s, r) => s + Number(r.amount), 0), [monthRevenues]);
  const totalExpenses = useMemo(() => monthExpenses.reduce((s, e) => s + Number(e.amount), 0), [monthExpenses]);
  const lucro = revenueRecebida - totalExpenses;
  const activeClients = contracts.filter(c => c.status === 'ativo').length;
  const ticketMedio = activeClients > 0 ? mrr / activeClients : 0;
  const cancelados = contracts.filter(c => c.status === 'cancelado').length;
  const taxaCancelamento = contracts.length > 0 ? (cancelados / contracts.length * 100) : 0;

  // Expense by category chart
  const expenseByCat = useMemo(() => {
    const map: Record<string, number> = {};
    monthExpenses.forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || 'Outros';
      map[name] = (map[name] || 0) + Number(e.amount);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [monthExpenses, categories]);

  // Revenue vs Expenses (last 6 months)
  const evolutionData = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      const ref = format(mStart, 'yyyy-MM-dd');
      const label = format(m, 'MMM', { locale: ptBR });
      const rec = revenues.filter(r => r.reference_month === ref && r.status === 'recebida').reduce((s, r) => s + Number(r.amount), 0);
      const desp = expenses.filter(e => { const d = new Date(e.date); return d >= mStart && d <= mEnd; }).reduce((s, e) => s + Number(e.amount), 0);
      data.push({ name: label, receita: rec, despesa: desp, lucro: rec - desp });
    }
    return data;
  }, [revenues, expenses]);

  // Profitability per client
  const clientProfitability = useMemo(() => {
    const totalMonthExpenses = totalExpenses;
    const totalDeliveries = monthRevenues.length || 1;

    return contracts.filter(c => c.status === 'ativo').map(contract => {
      const client = clients.find(cl => cl.id === contract.client_id);
      const clientRevenues = monthRevenues.filter(r => r.client_id === contract.client_id);
      const faturamento = clientRevenues.reduce((s, r) => s + Number(r.amount), 0) || Number(contract.contract_value);

      // Proportional cost based on content volume
      const clientRecordings = recordings.filter(r => r.clientId === contract.client_id);
      const totalRecs = recordings.length || 1;
      const proportion = clientRecordings.length / totalRecs;
      const custo = totalMonthExpenses * proportion;
      const lucroCliente = faturamento - custo;
      const margem = faturamento > 0 ? (lucroCliente / faturamento * 100) : 0;

      return {
        clientId: contract.client_id,
        clientName: client?.companyName || 'Cliente',
        faturamento,
        custo: Math.round(custo * 100) / 100,
        lucro: Math.round(lucroCliente * 100) / 100,
        margem: Math.round(margem * 10) / 10,
      };
    }).sort((a, b) => b.lucro - a.lucro);
  }, [contracts, monthRevenues, clients, recordings, totalExpenses]);

  const clientsComPrejuizo = clientProfitability.filter(c => c.lucro < 0);

  // Clients due this week
  const dueThisWeek = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const refMonth = format(today, 'yyyy-MM-dd').slice(0, 8) + '01';

    return contracts
      .filter(c => c.status === 'ativo')
      .map(contract => {
        const client = clients.find(cl => cl.id === contract.client_id);
        const dueDate = new Date(today.getFullYear(), today.getMonth(), contract.due_day);
        const isDueThisWeek = isWithinInterval(dueDate, { start: weekStart, end: weekEnd });

        // Check if already paid this month
        const monthRevenue = revenues.find(
          r => r.client_id === contract.client_id && r.reference_month === refMonth
        );
        const isPaid = monthRevenue?.status === 'recebida';

        return {
          contractId: contract.id,
          clientId: contract.client_id,
          clientName: client?.companyName || 'Cliente',
          dueDay: contract.due_day,
          dueDate: format(dueDate, 'dd/MM'),
          value: contract.contract_value,
          isDueThisWeek,
          isPaid,
          revenueId: monthRevenue?.id,
        };
      })
      .filter(c => c.isDueThisWeek);
  }, [contracts, clients, revenues]);

  const handleMarkPaid = async (item: typeof dueThisWeek[0]) => {
    if (item.revenueId) {
      const ok = await updateRevenue(item.revenueId, { status: 'recebida', paid_at: new Date().toISOString().split('T')[0] });
      if (ok) toast.success(`${item.clientName} marcado como pago`);
    } else {
      toast.error('Gere as receitas do mês primeiro em Receitas');
    }
  };

  const handleRevertPaid = async (item: typeof dueThisWeek[0]) => {
    if (item.revenueId) {
      const ok = await updateRevenue(item.revenueId, { status: 'prevista', paid_at: null });
      if (ok) toast.success(`${item.clientName} revertido para pendente`);
    }
  };

  // Cash forecast
  const previsaoCaixa = useMemo(() => {
    const nextMonth = addMonths(monthStart, 1);
    const nextRef = format(nextMonth, 'yyyy-MM-dd');
    const entradasPrevistas = contracts.filter(c => c.status === 'ativo').reduce((s, c) => s + Number(c.contract_value), 0);
    const saidasPrevistas = totalExpenses; // estimate same as current
    return { entradasPrevistas, saidasPrevistas, saldoProjetado: entradasPrevistas - saidasPrevistas };
  }, [contracts, totalExpenses, monthStart]);

  // Month options
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -3; i <= 3; i++) {
      const m = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), -i) : addMonths(new Date(), i));
      options.push({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy', { locale: ptBR }) });
    }
    return options;
  }, []);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Inadimplentes (em_atraso only)
  const inadimplentes = useMemo(() =>
    monthRevenues.filter(r => r.status === 'em_atraso'),
    [monthRevenues]
  );

  const totalInadimplente = inadimplentes.reduce((s, r) => s + Number(r.amount), 0);

  const handleCobrarInadimplentes = async () => {
    if (inadimplentes.length === 0) { toast.info('Nenhum inadimplente no mês'); return; }
    setSendingAllOverdue(true);
    let sent = 0, errors = 0;
    for (const r of inadimplentes) {
      const client = clients.find(c => c.id === r.client_id);
      if (!client?.whatsapp) { errors++; continue; }
      try {
        const value = fmt(Number(r.amount));
        const paymentInfo = resolvePaymentInfo(paymentConfig);

        // Get plan_id from contract
        const contract = contracts.find(c => c.client_id === r.client_id);
        const refMonth = selectedMonth;
        const report = paymentConfig?.include_delivery_report !== false
          ? await generateDeliveryReport(r.client_id, contract?.plan_id, refMonth, paymentConfig?.msg_delivery_report || undefined)
          : { text: '' };

        const template = paymentConfig?.msg_billing_overdue ||
          'Olá, {nome_cliente}! 😊\n\nIdentificamos uma pendência referente à mensalidade no valor de {valor}.\n\nSe já realizou o pagamento, por favor desconsidere esta mensagem.\n\n{dados_pagamento}';
        let message = template
          .replace(/\{nome_cliente\}/g, client.companyName)
          .replace(/\{valor\}/g, value)
          .replace(/\{dia_vencimento\}/g, r.due_date?.split('-')[2] || '')
          .replace(/\{dados_pagamento\}/g, paymentInfo)
          .replace(/\{relatorio_entregas\}/g, report.text);
        if (report.text && !template.includes('{relatorio_entregas}')) {
          message += report.text;
        }
        const result = await sendWhatsAppMessage({ number: client.whatsapp, message, clientId: client.id, triggerType: 'manual' });
        if (result.success) sent++; else errors++;
      } catch { errors++; }
    }
    setSendingAllOverdue(false);
    if (sent > 0) {
      setCelebrationMsg(`${sent} cobrança${sent > 1 ? 's' : ''} enviada${sent > 1 ? 's' : ''}!`);
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 4500);
    } else {
      toast.error(`Nenhuma cobrança enviada. ${errors} erro(s).`);
    }
  };

  // Confetti particles
  const confettiColors = ['hsl(var(--primary))', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
  const confettiParticles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.5 + Math.random() * 2,
      color: confettiColors[i % confettiColors.length],
      size: 6 + Math.random() * 8,
      rotation: Math.random() * 360,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showCelebration]
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <Loader2 size={32} className="animate-spin text-primary" />
      </motion.div>
    </div>
  );

  const chartConfig = {
    receita: { label: 'Receita', color: 'hsl(142, 71%, 45%)' },
    despesa: { label: 'Despesa', color: 'hsl(0, 72%, 51%)' },
    lucro: { label: 'Lucro', color: 'hsl(217, 91%, 60%)' },
  };

  const kpiRow1 = [
    { icon: <DollarSign size={18} />, label: 'MRR', value: fmt(mrr), gradient: 'from-blue-500/10 to-indigo-500/10', iconBg: 'bg-blue-500/20 text-blue-600', border: 'border-blue-200/50' },
    { icon: <TrendingUp size={18} />, label: 'Recebida', value: fmt(revenueRecebida), gradient: 'from-emerald-500/10 to-green-500/10', iconBg: 'bg-emerald-500/20 text-emerald-600', border: 'border-emerald-200/50', sub: `Prevista: ${fmt(revenuePrevista)}` },
    { icon: <TrendingDown size={18} />, label: 'Despesas', value: fmt(totalExpenses), gradient: 'from-rose-500/10 to-red-500/10', iconBg: 'bg-rose-500/20 text-rose-600', border: 'border-rose-200/50' },
    { icon: <BarChart3 size={18} />, label: 'Lucro Líquido', value: fmt(lucro), gradient: lucro >= 0 ? 'from-emerald-500/10 to-teal-500/10' : 'from-rose-500/10 to-red-500/10', iconBg: lucro >= 0 ? 'bg-emerald-500/20 text-emerald-600' : 'bg-rose-500/20 text-rose-600', border: lucro >= 0 ? 'border-emerald-200/50' : 'border-rose-200/50' },
  ];

  const kpiRow2 = [
    { icon: <AlertTriangle size={18} />, label: 'Em Atraso', value: fmt(revenueAtraso), gradient: 'from-orange-500/10 to-amber-500/10', iconBg: 'bg-orange-500/20 text-orange-600', border: 'border-orange-200/50' },
    { icon: <CreditCard size={18} />, label: 'Ticket Médio', value: fmt(ticketMedio), gradient: 'from-violet-500/10 to-purple-500/10', iconBg: 'bg-violet-500/20 text-violet-600', border: 'border-violet-200/50' },
    { icon: <Users size={18} />, label: 'Clientes Ativos', value: String(activeClients), gradient: 'from-sky-500/10 to-cyan-500/10', iconBg: 'bg-sky-500/20 text-sky-600', border: 'border-sky-200/50' },
    { icon: <TrendingDown size={18} />, label: 'Cancelamento', value: `${taxaCancelamento.toFixed(1)}%`, gradient: 'from-slate-500/10 to-gray-500/10', iconBg: 'bg-slate-500/20 text-slate-600', border: 'border-slate-200/50' },
  ];


  return (
    <div className="space-y-6">
      {/* Celebration Overlay */}
      {showCelebration && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowCelebration(false)}
        >
          {confettiParticles.map(p => (
            <motion.div
              key={p.id}
              initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0, scale: 0 }}
              animate={{ y: '110vh', rotate: p.rotation + 720, opacity: [1, 1, 0], scale: [0, 1.2, 0.8] }}
              transition={{ delay: p.delay, duration: p.duration, ease: 'easeOut' }}
              className="fixed top-0 pointer-events-none"
              style={{ width: p.size, height: p.size * 1.4, backgroundColor: p.color, borderRadius: '2px', left: `${p.x}%` }}
            />
          ))}
          <motion.div
            initial={{ scale: 0.3, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 12, stiffness: 150, delay: 0.1 }}
            className="flex flex-col items-center gap-6 p-8"
            onClick={e => e.stopPropagation()}
          >
            <motion.div animate={{ scale: [1, 1.05, 1], rotate: [0, -2, 2, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }} className="relative">
              <motion.div className="absolute inset-0 rounded-3xl bg-primary/30 blur-2xl" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }} />
              <img src={cobrarTodosImg} alt="Cobranças enviadas" className="w-64 h-64 rounded-3xl object-cover shadow-2xl relative z-10 border-4 border-primary/50" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-center space-y-2">
              <h2 className="text-3xl font-black text-white drop-shadow-lg">💰 {celebrationMsg}</h2>
              <p className="text-lg text-white/80 font-medium">Agora é só esperar! 🚀</p>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="text-sm text-white/50 mt-4">Toque para fechar</motion.p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>💰</motion.span>
            Financeiro
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral da saúde financeira</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </motion.div>

      {/* KPI Cards Row 1 */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" initial="hidden" animate="visible">
        {kpiRow1.map((kpi, i) => (
          <motion.div key={kpi.label} custom={i} variants={fadeUp}>
            <Card className={`overflow-hidden border ${kpi.border} group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5`}>
              <CardContent className={`pt-4 pb-4 bg-gradient-to-br ${kpi.gradient} relative`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl ${kpi.iconBg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    {kpi.icon}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                    <p className="text-lg font-bold text-foreground">{kpi.value}</p>
                    {kpi.sub && <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* KPI Cards Row 2 */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" initial="hidden" animate="visible">
        {kpiRow2.map((kpi, i) => (
          <motion.div key={kpi.label} custom={i + 4} variants={fadeUp}>
            <Card className={`overflow-hidden border ${kpi.border} group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5`}>
              <CardContent className={`pt-4 pb-4 bg-gradient-to-br ${kpi.gradient} relative`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl ${kpi.iconBg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    {kpi.icon}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                    <p className="text-lg font-bold text-foreground">{kpi.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Cobrar Inadimplentes Banner */}
      {inadimplentes.length > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, duration: 0.4 }}>
          <Card className="border-destructive/30 bg-destructive/5 overflow-hidden">
            <CardContent className="p-0">
              <button
                onClick={handleCobrarInadimplentes}
                disabled={sendingAllOverdue}
                className="w-full flex items-center gap-4 p-4 hover:bg-destructive/10 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <img src={cobrarTodosImg} alt="Cobrar Todos" className="w-16 h-16 rounded-full object-cover border-2 border-destructive/30 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    <AlertTriangle size={16} className="text-destructive" />
                    {inadimplentes.length} cliente{inadimplentes.length > 1 ? 's' : ''} inadimplente{inadimplentes.length > 1 ? 's' : ''}
                  </h3>
                  <p className="text-sm text-muted-foreground">Total em atraso: <span className="font-semibold text-destructive">{fmt(totalInadimplente)}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">Clique aqui para cobrar todos os inadimplentes via WhatsApp</p>
                </div>
                <div className="flex-shrink-0">
                  {sendingAllOverdue ? (
                    <Loader2 size={20} className="animate-spin text-destructive" />
                  ) : (
                    <ArrowRight size={20} className="text-destructive" />
                  )}
                </div>
              </button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick Navigation */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
        {[
          { label: 'Contratos', path: '/financeiro/contratos', icon: FileText, gradient: 'from-blue-500 to-indigo-600' },
          { label: 'Receitas', path: '/financeiro/receitas', icon: TrendingUp, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Despesas', path: '/financeiro/despesas', icon: TrendingDown, gradient: 'from-rose-500 to-red-600' },
          { label: 'Movimentações', path: '/financeiro/movimentacoes', icon: ClipboardList, gradient: 'from-violet-500 to-purple-600' },
          { label: 'Caixa', path: '/financeiro/caixa', icon: Wallet, gradient: 'from-amber-500 to-orange-600' },
          { label: 'Inadimplência', path: '/financeiro/inadimplencia', icon: AlertTriangle, gradient: 'from-orange-500 to-red-500' },
          { label: 'Parceiros', path: '/financeiro/parceiros', icon: Users, gradient: 'from-cyan-500 to-teal-600' },
          { label: 'Configurações', path: '/financeiro/configuracoes', icon: CreditCard, gradient: 'from-slate-500 to-gray-600' },
        ].map((item, i) => (
          <motion.div key={item.path} whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
            <button
              onClick={() => navigate(item.path)}
              className="w-full h-auto py-4 px-3 flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white shadow-sm`}>
                <item.icon size={18} />
              </div>
              <span className="text-xs font-medium text-foreground">{item.label}</span>
            </button>
          </motion.div>
        ))}
      </motion.div>

      {/* Due This Week */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarClock size={16} /> Vencimentos desta Semana
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dueThisWeek.length > 0 ? (
            <div className="space-y-2">
              {dueThisWeek.map(item => (
                <div key={item.clientId} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{item.clientName}</span>
                    <Badge variant="outline" className="text-xs">Dia {item.dueDay} ({item.dueDate})</Badge>
                    <span className="text-sm font-bold">{fmt(Number(item.value))}</span>
                  </div>
                  <div>
                    {item.isPaid ? (
                      <Button size="sm" variant="secondary" onClick={() => handleRevertPaid(item)} className="gap-1 text-green-600">
                        <CheckCircle size={12} /> Pago — desfazer
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleMarkPaid(item)} className="gap-1">
                        <CheckCircle size={14} /> Marcar como Pago
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhum vencimento esta semana</p>
          )}
        </CardContent>
      </Card>
      <motion.div className="grid md:grid-cols-2 gap-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5 }}>
        <Card>
          <CardHeader><CardTitle className="text-sm">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {expenseByCat.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseByCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} isAnimationActive animationDuration={800} animationEasing="ease-out">
                      {expenseByCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-muted-foreground text-sm text-center py-8">Nenhuma despesa registrada neste mês</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Evolução Financeira (6 meses)</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64">
              <BarChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="receita" fill="var(--color-receita)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                <Bar dataKey="despesa" fill="var(--color-despesa)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={1000} animationEasing="ease-out" animationBegin={200} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cash Forecast */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Previsão de Caixa (Próximo Mês)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Entradas Previstas</p>
              <p className="text-lg font-bold text-green-600">{fmt(previsaoCaixa.entradasPrevistas)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saídas Estimadas</p>
              <p className="text-lg font-bold text-red-600">{fmt(previsaoCaixa.saidasPrevistas)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo Projetado</p>
              <p className={`text-lg font-bold ${previsaoCaixa.saldoProjetado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(previsaoCaixa.saldoProjetado)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Profitability Ranking */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Ranking de Lucratividade por Cliente</CardTitle></CardHeader>
        <CardContent>
          {clientProfitability.length > 0 ? (
            <div className="space-y-2">
              {clientProfitability.slice(0, 10).map((cp, i) => (
                <div key={cp.clientId} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <span className="text-sm font-medium">{cp.clientName}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Fat: {fmt(cp.faturamento)}</span>
                    <span className="text-muted-foreground">Custo: {fmt(cp.custo)}</span>
                    <span className={cp.lucro >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {fmt(cp.lucro)}
                    </span>
                    <Badge variant={cp.margem >= 0 ? 'default' : 'destructive'} className="text-xs">
                      {cp.margem.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-muted-foreground text-sm text-center py-4">Nenhum contrato ativo</p>}
        </CardContent>
      </Card>

      {/* Recent Cash Movements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><Wallet size={16} /> Últimas Movimentações do Caixa</CardTitle>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/financeiro/caixa')}>
            Ver tudo <ArrowRight size={14} />
          </Button>
        </CardHeader>
        <CardContent>
          {cashMovements.length > 0 ? (
            <div className="space-y-2">
              {cashMovements.slice(0, 5).map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    {m.type === 'entrada' ? (
                      <ArrowUpCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowDownCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className="text-sm">{m.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(m.date + 'T12:00:00'), 'dd/MM/yyyy')}
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${m.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                    {m.type === 'entrada' ? '+' : '-'}{fmt(m.amount)}
                  </span>
                </div>
              ))}
              <div className="text-center pt-2">
                <p className="text-xs text-muted-foreground">
                  Saldo atual: <span className="font-bold">{fmt(cashMovements.reduce((acc, m) => acc + (m.type === 'entrada' ? m.amount : -m.amount), 0))}</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhuma movimentação registrada</p>
          )}
        </CardContent>
      </Card>

      {/* Financial Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><History size={16} /> Histórico de Ações Financeiras</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLog.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {activityLog.map(log => {
                const userName = users.find(u => u.id === log.user_id)?.name || 'Sistema';
                const actionIcon = log.action_type === 'criação' ? '➕' : log.action_type === 'edição' ? '✏️' : log.action_type === 'exclusão' ? '🗑️' : log.action_type === 'geração' ? '🔄' : '📋';
                const entityColor = log.entity_type === 'receita' ? 'text-green-600' : log.entity_type === 'despesa' ? 'text-red-600' : log.entity_type === 'caixa' ? 'text-blue-600' : 'text-foreground';
                return (
                  <div key={log.id} className="flex items-start justify-between p-2 rounded-lg bg-secondary/50 gap-4">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="text-sm mt-0.5">{actionIcon}</span>
                      <div className="min-w-0">
                        <p className="text-sm">{log.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className={`text-xs ${entityColor}`}>{log.entity_type}</Badge>
                          <span className="text-xs text-muted-foreground">por <strong>{userName}</strong></span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd/MM HH:mm')}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhuma ação registrada ainda</p>
          )}
        </CardContent>
      </Card>

      {/* Loss Alerts */}
      {clientsComPrejuizo.length > 0 && (
        <Card className="border-red-500/50">
          <CardHeader><CardTitle className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle size={16} /> Clientes com Prejuízo</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {clientsComPrejuizo.map(cp => (
                <div key={cp.clientId} className="flex items-center justify-between p-2 rounded-lg bg-red-500/10">
                  <span className="text-sm font-medium">{cp.clientName}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span>Contrato: {fmt(cp.faturamento)}</span>
                    <span>Custo: {fmt(cp.custo)}</span>
                    <span className="text-red-600 font-bold">Prejuízo: {fmt(Math.abs(cp.lucro))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
