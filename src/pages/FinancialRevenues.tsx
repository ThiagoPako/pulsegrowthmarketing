import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useFinancialData, normalizeDate } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, RefreshCw, CheckCircle, MessageCircle, Loader2, TrendingUp, AlertTriangle, Undo2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { sendWhatsAppMessage } from '@/services/whatsappService';
import { generateDeliveryReport, resolvePaymentInfo } from '@/lib/billingReport';
import cobrarTodosImg from '@/assets/cobrar_todos.png';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import ClientLogo from '@/components/ClientLogo';

/* ── Rocket Animation Overlay ── */
function RocketOverlay({ onComplete }: { onComplete: () => void }) {
  const moneyEmojis = ['💵', '💰', '💸', '🤑', '💲'];
  const particles = useMemo(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      emoji: moneyEmojis[i % moneyEmojis.length],
      x: (Math.random() - 0.5) * 500,
      y: Math.random() * 300 + 100,
      rotate: Math.random() * 720 - 360,
      scale: Math.random() * 0.6 + 0.5,
      delay: Math.random() * 0.6,
    }))
  , []);

  useEffect(() => {
    const timer = setTimeout(onComplete, 3200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      />
      <motion.img
        src={cobrarTodosImg}
        alt="Cobrar Todos"
        className="absolute w-40 h-40 rounded-3xl object-cover shadow-2xl z-10"
        initial={{ scale: 0, rotate: -30 }}
        animate={{
          scale: [0, 1.8, 1.4, 0],
          rotate: [-30, 0, 0, 10],
          y: [0, 0, 0, -600],
        }}
        transition={{ duration: 2.5, times: [0, 0.3, 0.5, 1], ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute z-20 text-7xl"
        initial={{ y: 200, scale: 0 }}
        animate={{ y: [200, 0, -800], scale: [0, 1.3, 1], rotate: [0, 0, -5] }}
        transition={{ duration: 2.5, times: [0, 0.35, 1], ease: 'easeIn' }}
      >
        🚀
      </motion.div>
      <motion.div
        className="absolute z-10 text-5xl"
        initial={{ y: 280, opacity: 0 }}
        animate={{ y: [280, 80, -700], opacity: [0, 1, 0], scale: [0.5, 1.5, 0.3] }}
        transition={{ duration: 2.5, times: [0, 0.35, 1], ease: 'easeIn' }}
      >
        🔥
      </motion.div>
      {particles.map(p => (
        <motion.span
          key={p.id}
          className="absolute z-20"
          style={{ fontSize: `${p.scale * 2}rem` }}
          initial={{ y: 100, x: 0, opacity: 0, scale: 0, rotate: 0 }}
          animate={{
            y: [100, -p.y, -(p.y + 400)],
            x: [0, p.x * 0.5, p.x],
            opacity: [0, 1, 0],
            scale: [0, p.scale, 0],
            rotate: [0, p.rotate / 2, p.rotate],
          }}
          transition={{ duration: 2.2, delay: 0.4 + p.delay, ease: 'easeOut' }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </motion.div>,
    document.body
  );
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' }> = {
  prevista: { label: 'Prevista', variant: 'secondary' },
  recebida: { label: 'Recebida', variant: 'default' },
  em_atraso: { label: 'Em Atraso', variant: 'destructive' },
};

export default function FinancialRevenues() {
  const navigate = useNavigate();
  const { revenues, contracts, updateRevenue, addRevenue, generateMonthlyRevenues, paymentConfig, loading } = useFinancialData();
  const { clients } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [sendingBilling, setSendingBilling] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [showRocket, setShowRocket] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newRev, setNewRev] = useState({ client_id: '', amount: '', due_date: '', description: '' });

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -6; i <= 3; i++) {
      const m = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), -i) : addMonths(new Date(), i));
      options.push({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy', { locale: ptBR }) });
    }
    return options;
  }, []);

  const refMonth = `${selectedMonth}-01`;
  const filtered = revenues.filter(r => normalizeDate(r.reference_month) === refMonth);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Auto-generate revenues when month has none and data is loaded
  const autoGenRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || autoGenRef.current === selectedMonth) return;
    if (filtered.length === 0 && clients.length > 0 && contracts.length > 0) {
      autoGenRef.current = selectedMonth;
      generateMonthlyRevenues(selectedMonth).then(count => {
        if (count > 0) toast.success(`${count} receitas geradas automaticamente`);
      });
    }
  }, [selectedMonth, loading, filtered.length, clients.length, contracts.length]);

  const handleGenerate = async () => {
    autoGenRef.current = selectedMonth;
    const count = await generateMonthlyRevenues(selectedMonth);
    toast.success(`${count} receitas geradas`);
  };

  const handleCreateRevenue = async () => {
    if (!newRev.client_id || !newRev.amount || !newRev.due_date) {
      toast.error('Preencha cliente, valor e vencimento');
      return;
    }
    const refMonth = newRev.due_date.slice(0, 7) + '-01';
    const ok = await addRevenue({
      client_id: newRev.client_id,
      amount: Number(newRev.amount),
      due_date: newRev.due_date,
      reference_month: refMonth,
      status: 'prevista',
    } as any);
    if (ok) {
      toast.success('Receita cadastrada com sucesso!');
      setShowNewDialog(false);
      setNewRev({ client_id: '', amount: '', due_date: '', description: '' });
    } else {
      toast.error('Erro ao cadastrar receita (pode já existir)');
    }
  };

  const [animatingPaid, setAnimatingPaid] = useState<string | null>(null);

  const handleMarkPaid = async (id: string) => {
    setAnimatingPaid(id);
    const ok = await updateRevenue(id, { status: 'recebida', paid_at: new Date().toISOString().split('T')[0] });
    setTimeout(() => setAnimatingPaid(null), 1200);
    if (ok) toast.success('Marcada como recebida');
    else toast.error('Não foi possível marcar como recebida');
  };

  const handleMarkOverdue = async (id: string) => {
    const ok = await updateRevenue(id, { status: 'em_atraso' });
    if (ok) toast.success('Marcada como em atraso');
    else toast.error('Não foi possível marcar como em atraso');
  };

  const handleRevertToPending = async (id: string) => {
    const ok = await updateRevenue(id, { status: 'prevista', paid_at: null });
    if (ok) toast.success('Receita revertida para pendente');
    else toast.error('Não foi possível reverter');
  };

  const handleSendBilling = async (revenueId: string) => {
    const revenue = filtered.find(r => r.id === revenueId);
    if (!revenue) return;

    const client = clients.find(c => c.id === revenue.client_id);
    if (!client) { toast.error('Cliente não encontrado'); return; }
    if (!client.whatsapp) { toast.error('Cliente sem WhatsApp cadastrado'); return; }

    setSendingBilling(revenueId);

    try {
      const value = fmt(Number(revenue.amount));
      const dueDay = revenue.due_date?.split('-')[2] || '—';

      const paymentInfo = resolvePaymentInfo(paymentConfig);

      const isOverdue = revenue.status === 'em_atraso';
      const template = isOverdue
        ? (paymentConfig?.msg_billing_overdue || 'Olá, {nome_cliente}! Lembrete de pendência: {valor}. {dados_pagamento}')
        : (paymentConfig?.msg_billing_due || 'Olá, {nome_cliente}! Mensalidade {valor} vence dia {dia_vencimento}. {dados_pagamento}');

      // Get plan_id from contract
      const contract = contracts.find(c => c.client_id === revenue.client_id);
      const report = paymentConfig?.include_delivery_report !== false
        ? await generateDeliveryReport(revenue.client_id, contract?.plan_id, selectedMonth, paymentConfig?.msg_delivery_report || undefined)
        : { text: '' };

      let message = template
        .replace(/\{nome_cliente\}/g, client.companyName)
        .replace(/\{valor\}/g, value)
        .replace(/\{dia_vencimento\}/g, dueDay)
        .replace(/\{dados_pagamento\}/g, paymentInfo)
        .replace(/\{relatorio_entregas\}/g, report.text);

      // If template doesn't have the variable but report exists, append it
      if (report.text && !template.includes('{relatorio_entregas}')) {
        message += report.text;
      }

      const result = await sendWhatsAppMessage({
        number: client.whatsapp,
        message,
        clientId: client.id,
        triggerType: 'manual',
      });

      if (result.success) {
        toast.success(`Cobrança enviada para ${client.companyName}`);
      } else {
        toast.error(result.error || 'Erro ao enviar cobrança');
      }
    } catch {
      toast.error('Erro ao enviar cobrança');
    } finally {
      setSendingBilling(null);
    }
  };

  const pendingRevenues = filtered.filter(r => r.status !== 'recebida');

  const handleBigCobrarClick = useCallback(() => {
    if (pendingRevenues.length === 0) { toast.info('Nenhuma receita pendente'); return; }
    setShowRocket(true);
    handleSendAllBilling();
  }, [pendingRevenues.length]);

  const handleSendAllBilling = async () => {
    if (pendingRevenues.length === 0) { toast.info('Nenhuma receita pendente'); return; }
    setSendingAll(true);
    let sent = 0;
    let errors = 0;
    for (const r of pendingRevenues) {
      const client = clients.find(c => c.id === r.client_id);
      if (!client?.whatsapp) { errors++; continue; }
      setSendingBilling(r.id);
      try {
        const value = fmt(Number(r.amount));
        const dueDay = r.due_date?.split('-')[2] || '—';
        const paymentInfo = resolvePaymentInfo(paymentConfig);
        const isOverdue = r.status === 'em_atraso';
        const template = isOverdue
          ? (paymentConfig?.msg_billing_overdue || 'Olá, {nome_cliente}! Lembrete: {valor}. {dados_pagamento}')
          : (paymentConfig?.msg_billing_due || 'Olá, {nome_cliente}! Mensalidade {valor} vence dia {dia_vencimento}. {dados_pagamento}');

        const contract = contracts.find(c => c.client_id === r.client_id);
        const report = paymentConfig?.include_delivery_report !== false
          ? await generateDeliveryReport(r.client_id, contract?.plan_id, selectedMonth, paymentConfig?.msg_delivery_report || undefined)
          : { text: '' };

        let message = template
          .replace(/\{nome_cliente\}/g, client.companyName)
          .replace(/\{valor\}/g, value)
          .replace(/\{dia_vencimento\}/g, dueDay)
          .replace(/\{dados_pagamento\}/g, paymentInfo)
          .replace(/\{relatorio_entregas\}/g, report.text);
        if (report.text && !template.includes('{relatorio_entregas}')) {
          message += report.text;
        }
        const result = await sendWhatsAppMessage({ number: client.whatsapp, message, clientId: client.id, triggerType: 'manual' });
        if (result.success) sent++; else errors++;
      } catch { errors++; }
    }
    setSendingBilling(null);
    setSendingAll(false);
    toast.success(`${sent} cobrança(s) enviada(s)${errors > 0 ? `, ${errors} com erro` : ''}`);
  };

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);
  const recebida = filtered.filter(r => r.status === 'recebida').reduce((s, r) => s + Number(r.amount), 0);
  const atraso = filtered.filter(r => r.status === 'em_atraso').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')} className="hover:bg-primary/10"><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">📊 Receitas</h1>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button size="sm" variant="outline" onClick={handleGenerate} className="shadow-sm"><RefreshCw size={14} className="mr-1" /> Gerar Receitas</Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button size="sm" onClick={() => setShowNewDialog(true)} className="shadow-sm bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white"><Plus size={14} className="mr-1" /> Nova Receita</Button>
        </motion.div>
      </motion.div>

      {/* Dialog Nova Receita */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">💰 Nova Receita Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Select value={newRev.client_id} onValueChange={v => setNewRev(p => ({ ...p, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.sort((a, b) => a.companyName.localeCompare(b.companyName)).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={newRev.amount}
                  onChange={e => setNewRev(p => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Vencimento *</Label>
                <Input
                  type="date"
                  value={newRev.due_date}
                  onChange={e => setNewRev(p => ({ ...p, due_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Ex: Serviço extra, bônus..."
                value={newRev.description}
                onChange={e => setNewRev(p => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
              <Button onClick={handleCreateRevenue} className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white">
                <Plus size={14} className="mr-1" /> Cadastrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── BIG Cobrar Todos Button ── */}
      <AnimatePresence>
        {pendingRevenues.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="flex justify-center"
          >
            <motion.button
              onClick={handleBigCobrarClick}
              disabled={sendingAll}
              className="relative group flex items-center gap-4 px-8 py-4 rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/70 text-primary-foreground font-bold text-lg shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-shadow disabled:opacity-60 overflow-hidden"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Shimmer effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                animate={{ x: ['-200%', '200%'] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
              />
              {/* Pulse ring */}
              <motion.div
                className="absolute inset-0 rounded-2xl border-2 border-primary-foreground/30"
                animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              {sendingAll ? (
                <Loader2 size={28} className="animate-spin relative z-10" />
              ) : (
                <motion.img
                  src={cobrarTodosImg}
                  alt="Cobrar Todos"
                  className="w-12 h-12 rounded-xl object-cover shadow-md relative z-10"
                  animate={{ rotate: [0, -5, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                />
              )}
              <div className="relative z-10 text-left">
                <span className="block text-lg leading-tight">🚀 Cobrar Todos</span>
                <span className="block text-xs font-normal opacity-80">
                  {pendingRevenues.length} cliente{pendingRevenues.length > 1 ? 's' : ''} pendente{pendingRevenues.length > 1 ? 's' : ''} • {fmt(pendingRevenues.reduce((s, r) => s + Number(r.amount), 0))}
                </span>
              </div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rocket Overlay */}
      <AnimatePresence>
        {showRocket && <RocketOverlay onComplete={() => setShowRocket(false)} />}
      </AnimatePresence>

      {/* KPI Summary Cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }} className="grid grid-cols-3 gap-3">
        <Card className="border-emerald-200/50 overflow-hidden">
          <CardContent className="pt-3 pb-3 bg-gradient-to-br from-emerald-500/10 to-green-500/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center"><TrendingUp size={16} className="text-emerald-600" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Total</p>
                <p className="text-sm font-bold text-foreground">{fmt(total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200/50 overflow-hidden">
          <CardContent className="pt-3 pb-3 bg-gradient-to-br from-green-500/10 to-teal-500/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center"><CheckCircle size={16} className="text-green-600" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Recebida</p>
                <p className="text-sm font-bold text-foreground">{fmt(recebida)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200/50 overflow-hidden">
          <CardContent className="pt-3 pb-3 bg-gradient-to-br from-orange-500/10 to-red-500/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center"><AlertTriangle size={16} className="text-orange-600" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Atraso</p>
                <p className="text-sm font-bold text-foreground">{fmt(atraso)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
             <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12"></TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pago em</TableHead>
                <TableHead className="w-56 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => {
                const client = clients.find(c => c.id === r.client_id);
                const st = STATUS_MAP[r.status] || { label: r.status, variant: 'secondary' as const };
                const isPaid = r.status === 'recebida';
                const isAnimating = animatingPaid === r.id;
                return (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.04, duration: 0.3 }}
                    className={`border-b transition-all duration-500 hover:bg-muted/50 ${isPaid ? 'bg-emerald-500/5' : ''}`}
                  >
                    {/* Logo */}
                    <TableCell className="pr-0">
                      {client ? (
                        <ClientLogo
                          client={{ companyName: client.companyName, color: client.color, logoUrl: client.logoUrl || undefined }}
                          size="sm"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-md bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{client?.companyName || '—'}</TableCell>
                    <TableCell className="font-semibold">{fmt(Number(r.amount))}</TableCell>
                    <TableCell className="text-muted-foreground">{r.due_date ? format(new Date(normalizeDate(r.due_date) + 'T12:00:00'), 'dd/MM/yyyy') : '—'}</TableCell>
                    <TableCell>
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={r.status}
                          initial={{ scale: 0.7, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.7, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        >
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </motion.div>
                      </AnimatePresence>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.paid_at ? format(new Date(normalizeDate(r.paid_at) + 'T12:00:00'), 'dd/MM/yyyy') : '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5 justify-end">
                        <AnimatePresence mode="wait">
                          {!isPaid && !isAnimating && (
                            <motion.div
                              key="actions"
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10, scale: 0.8 }}
                              className="flex gap-1.5"
                            >
                              {/* Recebida button with glow */}
                              <motion.button
                                onClick={() => handleMarkPaid(r.id)}
                                className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-md overflow-hidden"
                                whileHover={{ scale: 1.08, boxShadow: '0 0 20px rgba(16,185,129,0.5)' }}
                                whileTap={{ scale: 0.92 }}
                              >
                                {/* Glow border animation */}
                                <motion.div
                                  className="absolute inset-0 rounded-lg"
                                  style={{ border: '2px solid rgba(52,211,153,0.6)' }}
                                  animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.03, 1] }}
                                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                                />
                                <motion.div
                                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12"
                                  animate={{ x: ['-150%', '150%'] }}
                                  transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                                />
                                <CheckCircle size={13} className="relative z-10" />
                                <span className="relative z-10">Recebida</span>
                              </motion.button>

                              {/* Cobrar button */}
                              <motion.button
                                onClick={() => handleSendBilling(r.id)}
                                disabled={sendingBilling === r.id}
                                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-primary/30 text-primary hover:bg-primary/10 shadow-sm overflow-hidden disabled:opacity-50"
                                whileHover={{ scale: 1.08, boxShadow: '0 0 15px hsl(var(--primary) / 0.3)' }}
                                whileTap={{ scale: 0.92 }}
                              >
                                <motion.div
                                  className="absolute inset-0 rounded-lg"
                                  style={{ border: '1px solid hsl(var(--primary) / 0.4)' }}
                                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                                  transition={{ repeat: Infinity, duration: 2.5 }}
                                />
                                {sendingBilling === r.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <MessageCircle size={13} />
                                )}
                                <span>Cobrar</span>
                              </motion.button>

                              {/* Em Atraso button (only for prevista) */}
                              {r.status === 'prevista' && (
                                <motion.button
                                  onClick={() => handleMarkOverdue(r.id)}
                                  className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 overflow-hidden"
                                  whileHover={{ scale: 1.08 }}
                                  whileTap={{ scale: 0.92 }}
                                >
                                  <AlertTriangle size={13} />
                                  <span>Atraso</span>
                                </motion.button>
                              )}
                            </motion.div>
                          )}

                          {/* Paid state with rocket celebration + revert */}
                          {(isPaid || isAnimating) && (
                            <motion.div
                              key="paid"
                              initial={{ opacity: 0, scale: 0.3 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-2"
                            >
                              <motion.div
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 font-semibold text-xs"
                                initial={{ scale: 0 }}
                                animate={{ scale: [0, 1.2, 1] }}
                                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                              >
                                <motion.span
                                  animate={{ rotate: [0, -10, 10, 0], y: [0, -4, 0] }}
                                  transition={{ duration: 0.6, delay: 0.2 }}
                                >
                                  🚀
                                </motion.span>
                                <span>Pago!</span>
                              </motion.div>
                              {/* Revert button */}
                              <motion.button
                                onClick={() => handleRevertToPending(r.id)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                title="Reverter para pendente"
                              >
                                <Undo2 size={12} />
                                <span>Reverter</span>
                              </motion.button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                      <motion.span className="text-4xl block" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }}>🚀</motion.span>
                      <p className="text-muted-foreground text-sm">Nenhuma receita neste mês. Clique em "Gerar Receitas".</p>
                    </motion.div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  );
}
