import { useState, useMemo, useEffect, useCallback } from 'react';
import { useFinancialData, type Expense, normalizeDate } from '@/hooks/useFinancialData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, ArrowLeft, TrendingDown, Users, Wallet, CheckCircle, Undo2, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import ExpenseFormDialog from '@/components/financial/ExpenseFormDialog';
import { supabase } from '@/lib/vpsDb';

/* ── Rocket Pay Animation ── */
function SalaryRocketOverlay({ name, onComplete }: { name: string; onComplete: () => void }) {
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      emoji: ['💵', '💰', '🤑', '💲', '✅'][i % 5],
      x: (Math.random() - 0.5) * 400,
      y: Math.random() * 250 + 80,
      rotate: Math.random() * 720 - 360,
      scale: Math.random() * 0.5 + 0.4,
      delay: Math.random() * 0.5,
    }))
  , []);

  useEffect(() => {
    const timer = setTimeout(onComplete, 2800);
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
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      />
      {/* Name badge */}
      <motion.div
        className="absolute z-30 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-3 rounded-2xl text-lg font-bold shadow-2xl"
        initial={{ scale: 0, y: 50 }}
        animate={{ scale: [0, 1.2, 1], y: [50, -20, -20] }}
        exit={{ scale: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        ✅ {name} — PAGO!
      </motion.div>
      {/* Rocket */}
      <motion.div
        className="absolute z-20 text-6xl"
        initial={{ y: 250, scale: 0 }}
        animate={{ y: [250, 0, -700], scale: [0, 1.3, 0.8], rotate: [0, 0, -5] }}
        transition={{ duration: 2.2, times: [0, 0.3, 1], ease: 'easeIn' }}
      >
        🚀
      </motion.div>
      {/* Fire trail */}
      <motion.div
        className="absolute z-10 text-5xl"
        initial={{ y: 320, opacity: 0 }}
        animate={{ y: [320, 80, -600], opacity: [0, 1, 0], scale: [0.5, 1.5, 0.3] }}
        transition={{ duration: 2.2, times: [0, 0.3, 1], ease: 'easeIn' }}
      >
        🔥
      </motion.div>
      {particles.map(p => (
        <motion.span
          key={p.id}
          className="absolute z-20"
          style={{ fontSize: `${p.scale * 2}rem` }}
          initial={{ y: 100, x: 0, opacity: 0, scale: 0 }}
          animate={{
            y: [100, -p.y, -(p.y + 300)],
            x: [0, p.x * 0.5, p.x],
            opacity: [0, 1, 0],
            scale: [0, p.scale, 0],
            rotate: [0, p.rotate / 2, p.rotate],
          }}
          transition={{ duration: 1.8, delay: 0.3 + p.delay, ease: 'easeOut' }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </motion.div>,
    document.body
  );
}

/* ── Fire Glow Button — now with "Pagar" and "Pagar com Bônus" ── */
function SalaryPayButtons({ paid, onPay, onPayWithBonus, onRevert }: {
  paid: boolean;
  onPay: () => void;
  onPayWithBonus: () => void;
  onRevert: () => void;
}) {
  return (
    <AnimatePresence mode="wait">
      {paid ? (
        <motion.div
          key="paid"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex items-center gap-1.5"
        >
          <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-300 gap-1 px-2.5 py-1">
            <CheckCircle size={13} /> Pago
          </Badge>
          <motion.button
            onClick={onRevert}
            className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Undo2 size={11} /> Reverter
          </motion.button>
        </motion.div>
      ) : (
        <motion.div
          key="unpaid"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="flex items-center gap-1.5"
        >
          {/* Pagar button */}
          <motion.button
            onClick={onPay}
            className="relative px-3 py-1.5 rounded-lg font-semibold text-xs text-white overflow-hidden"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <motion.div
              className="absolute inset-0 rounded-lg"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444, #f59e0b, #ef4444)', backgroundSize: '300% 300%' }}
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute inset-0 rounded-lg"
              animate={{
                boxShadow: [
                  '0 0 8px rgba(245,158,11,0.4), 0 0 16px rgba(239,68,68,0.2)',
                  '0 0 16px rgba(245,158,11,0.6), 0 0 32px rgba(239,68,68,0.4)',
                  '0 0 8px rgba(245,158,11,0.4), 0 0 16px rgba(239,68,68,0.2)',
                ],
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.span
              className="absolute -top-1 -right-1 text-sm"
              animate={{ y: [-2, -6, -2], opacity: [0.7, 1, 0.7], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              🔥
            </motion.span>
            <span className="relative z-10 flex items-center gap-1">
              <Wallet size={13} /> Pagar
            </span>
          </motion.button>

          {/* Pagar com Bônus button */}
          <motion.button
            onClick={onPayWithBonus}
            className="relative px-3 py-1.5 rounded-lg font-semibold text-xs text-white overflow-hidden"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <motion.div
              className="absolute inset-0 rounded-lg"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #8b5cf6, #ec4899)', backgroundSize: '300% 300%' }}
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute inset-0 rounded-lg"
              animate={{
                boxShadow: [
                  '0 0 8px rgba(139,92,246,0.4), 0 0 16px rgba(236,72,153,0.2)',
                  '0 0 16px rgba(139,92,246,0.6), 0 0 32px rgba(236,72,153,0.4)',
                  '0 0 8px rgba(139,92,246,0.4), 0 0 16px rgba(236,72,153,0.2)',
                ],
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.span
              className="absolute -top-1 -right-1 text-sm"
              animate={{ y: [-2, -6, -2], rotate: [0, 15, -15, 0], scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              🎁
            </motion.span>
            <span className="relative z-10 flex items-center gap-1">
              <Gift size={13} /> + Bônus
            </span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', editor: 'Editor', videomaker: 'Videomaker',
  social_media: 'Social Media', designer: 'Designer',
  fotografo: 'Fotógrafo', endomarketing: 'Endomarketing', parceiro: 'Parceiro',
};

export default function FinancialExpenses() {
  const navigate = useNavigate();
  const { expenses, categories, addExpense, updateExpense, deleteExpense, addCategory } = useFinancialData();
  const [open, setOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [newCat, setNewCat] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('despesas');
  const [rocketName, setRocketName] = useState('');
  const [showRocket, setShowRocket] = useState(false);
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [bonusExpense, setBonusExpense] = useState<Expense | null>(null);
  const [bonusAmount, setBonusAmount] = useState('');

  // Find salary category
  const salaryCategory = useMemo(() => categories.find(c => c.name.toLowerCase() === 'salários'), [categories]);

  const filtered = useMemo(() => {
    const ym = selectedMonth;
    return expenses.filter(e => {
      const dateStr = normalizeDate(e.date);
      if (!dateStr.startsWith(ym)) return false;
      // Separate salary vs other expenses
      if (activeTab === 'salarios') return salaryCategory && e.category_id === salaryCategory.id;
      return !salaryCategory || e.category_id !== salaryCategory.id;
    });
  }, [expenses, selectedMonth, activeTab, salaryCategory]);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -6; i <= 1; i++) {
      const m = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), -i) : addMonths(new Date(), i));
      options.push({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy', { locale: ptBR }) });
    }
    return options;
  }, []);

  // Count totals for tabs
  const allExpenses = useMemo(() => {
    const ym = selectedMonth;
    return expenses.filter(e => normalizeDate(e.date).startsWith(ym));
  }, [expenses, selectedMonth]);

  const salaryTotal = useMemo(() =>
    allExpenses.filter(e => salaryCategory && e.category_id === salaryCategory.id).reduce((s, e) => s + Number(e.amount), 0)
  , [allExpenses, salaryCategory]);

  const otherTotal = useMemo(() =>
    allExpenses.filter(e => !salaryCategory || e.category_id !== salaryCategory.id).reduce((s, e) => s + Number(e.amount), 0)
  , [allExpenses, salaryCategory]);

  const handleSave = async (form: any, editingId: string | null) => {
    try {
      let success: boolean;
      if (editingId) {
        success = await updateExpense(editingId, form);
      } else {
        success = await addExpense(form);
      }
      if (success) toast.success('Despesa salva!');
      else toast.error('Erro ao salvar despesa.');
    } catch (err) {
      console.error('[FinancialExpenses] handleSave error:', err);
      toast.error('Erro inesperado ao salvar despesa.');
    }
  };

  const handleEdit = (e: Expense) => { setEditingExpense(e); setOpen(true); };

  const handleDeleteExpense = async (id: string) => {
    if (confirm('Excluir despesa?')) { await deleteExpense(id); toast.success('Excluída'); }
  };

  const handleAddCategory = async () => {
    if (newCat.trim()) {
      await addCategory(newCat.trim());
      setNewCat(''); setCatOpen(false);
      toast.success('Categoria criada');
    }
  };

  const handleMarkSalaryPaid = useCallback(async (expense: Expense) => {
    setRocketName(expense.responsible || expense.description);
    setShowRocket(true);
    const desc = `${expense.description} - PAGO`;
    const ok = await updateExpense(expense.id, { description: desc });
    if (!ok) toast.error('Erro ao marcar como pago');
  }, [updateExpense]);

  const handlePayWithBonus = useCallback((expense: Expense) => {
    setBonusExpense(expense);
    setBonusAmount('');
    setBonusDialogOpen(true);
  }, []);

  const handleConfirmBonus = useCallback(async () => {
    if (!bonusExpense || !bonusAmount) { toast.error('Informe o valor do bônus'); return; }
    const match = bonusExpense.description?.match(/^Salário - (.+?) \((.+?)\)/);
    const memberName = match ? match[1] : bonusExpense.responsible || bonusExpense.description;
    const memberRole = match ? match[2] : '';

    // Mark as paid
    setRocketName(memberName);
    setShowRocket(true);
    const desc = `${bonusExpense.description} - PAGO`;
    const ok = await updateExpense(bonusExpense.id, { description: desc });
    if (!ok) { toast.error('Erro ao marcar como pago'); return; }

    // Save bonus record
    const { error } = await supabase.from('salary_bonuses').insert({
      expense_id: bonusExpense.id,
      user_name: memberName,
      user_role: memberRole,
      bonus_amount: Number(bonusAmount),
      reference_month: selectedMonth,
    } as any);

    if (error) {
      console.error('[FinancialExpenses] bonus insert error:', error);
      toast.error('Pago, mas erro ao registrar bônus');
    } else {
      toast.success(`Pago com bônus de ${fmt(Number(bonusAmount))} para ${memberName}! 🎉`);
    }

    setBonusDialogOpen(false);
    setBonusExpense(null);
    setBonusAmount('');
  }, [bonusExpense, bonusAmount, updateExpense, selectedMonth]);

  const handleRevertSalary = useCallback(async (expense: Expense) => {
    const desc = expense.description.replace(/ - PAGO$/, '');
    const ok = await updateExpense(expense.id, { description: desc });
    if (ok) toast.success('Revertido para pendente');
    else toast.error('Erro ao reverter');
  }, [updateExpense]);

  const isSalaryPaid = (e: Expense) => e.description?.endsWith(' - PAGO');

  const salaryPaidCount = filtered.filter(e => isSalaryPaid(e)).length;
  const salaryTotalCount = filtered.length;

  const fixas = filtered.filter(e => e.expense_type === 'fixa').reduce((s, e) => s + Number(e.amount), 0);
  const variaveis = filtered.filter(e => e.expense_type === 'variavel').reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {showRocket && (
          <SalaryRocketOverlay
            name={rocketName}
            onComplete={() => setShowRocket(false)}
          />
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')} className="hover:bg-primary/10"><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">💸 Despesas</h1>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Dialog open={catOpen} onOpenChange={setCatOpen}>
          <DialogTrigger asChild>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button size="sm" variant="outline" className="shadow-sm">+ Categoria</Button>
            </motion.div>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader>
            <div className="flex gap-2">
              <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nome da categoria" />
              <Button onClick={handleAddCategory}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button size="sm" className="shadow-sm bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white" onClick={() => { setEditingExpense(null); setOpen(true); }}>
            <Plus size={16} className="mr-1" /> Nova Despesa
          </Button>
        </motion.div>
      </motion.div>

      <ExpenseFormDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditingExpense(null); }}
        categories={categories}
        editingExpense={editingExpense}
        onSave={handleSave}
      />

      {/* Tabs: Despesas / Salários */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="despesas" className="gap-1.5">
            <Wallet size={14} /> Despesas
            <Badge variant="secondary" className="ml-1 text-[10px]">{fmt(otherTotal)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="salarios" className="gap-1.5">
            <Users size={14} /> Salários
            <Badge variant="secondary" className="ml-1 text-[10px]">{fmt(salaryTotal)}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Despesas Tab ── */}
        <TabsContent value="despesas" className="space-y-4 mt-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }} className="grid grid-cols-3 gap-3">
            <Card className="border-rose-200/50 overflow-hidden">
              <CardContent className="pt-3 pb-3 bg-gradient-to-br from-rose-500/10 to-red-500/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center"><TrendingDown size={16} className="text-rose-600" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Total Despesas</p>
                    <p className="text-sm font-bold text-foreground">{fmt(total)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200/50 overflow-hidden">
              <CardContent className="pt-3 pb-3 bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center"><TrendingDown size={16} className="text-amber-600" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Fixas</p>
                    <p className="text-sm font-bold text-foreground">{fmt(fixas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-violet-200/50 overflow-hidden">
              <CardContent className="pt-3 pb-3 bg-gradient-to-br from-violet-500/10 to-purple-500/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center"><TrendingDown size={16} className="text-violet-600" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Variáveis</p>
                    <p className="text-sm font-bold text-foreground">{fmt(variaveis)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <ExpensesTable
            filtered={filtered}
            categories={categories}
            fmt={fmt}
            onEdit={handleEdit}
            onDelete={handleDeleteExpense}
          />
        </TabsContent>

        {/* ── Salários Tab ── */}
        <TabsContent value="salarios" className="space-y-4 mt-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }} className="grid grid-cols-3 gap-3">
            <Card className="border-emerald-200/50 overflow-hidden">
              <CardContent className="pt-3 pb-3 bg-gradient-to-br from-emerald-500/10 to-green-500/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center"><Users size={16} className="text-emerald-600" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Total Salários</p>
                    <p className="text-sm font-bold text-foreground">{fmt(total)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-200/50 overflow-hidden">
              <CardContent className="pt-3 pb-3 bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center"><CheckCircle size={16} className="text-blue-600" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Pagos</p>
                    <p className="text-sm font-bold text-foreground">{salaryPaidCount}/{salaryTotalCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200/50 overflow-hidden">
              <CardContent className="pt-3 pb-3 bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center"><Wallet size={16} className="text-amber-600" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Pendentes</p>
                    <p className="text-sm font-bold text-foreground">{fmt(filtered.filter(e => !isSalaryPaid(e)).reduce((s, e) => s + Number(e.amount), 0))}</p>
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
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Data Pgto</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e, i) => {
                      const paid = isSalaryPaid(e);
                      // Parse "Salário - Name (Role)" or just use description
                      const match = e.description?.match(/^Salário - (.+?) \((.+?)\)/);
                      const memberName = match ? match[1] : e.responsible || e.description;
                      const memberRole = match ? match[2] : '—';

                      return (
                        <motion.tr
                          key={e.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.2 }}
                          className={`border-b transition-colors hover:bg-muted/50 ${paid ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${paid ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'}`}>
                                {memberName.charAt(0).toUpperCase()}
                              </div>
                              <span className={`font-medium ${paid ? 'text-emerald-700' : ''}`}>{memberName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{memberRole}</Badge>
                          </TableCell>
                          <TableCell>{(() => { const d = normalizeDate(e.date); const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; })()}</TableCell>
                          <TableCell className={`font-semibold ${paid ? 'text-emerald-600' : 'text-foreground'}`}>{fmt(Number(e.amount))}</TableCell>
                          <TableCell>
                            <SalaryPayButtons
                              paid={paid}
                              onPay={() => handleMarkSalaryPaid(e)}
                              onPayWithBonus={() => handlePayWithBonus(e)}
                              onRevert={() => handleRevertSalary(e)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/10" onClick={() => handleEdit(e)}><Pencil size={13} /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 text-destructive" onClick={() => handleDeleteExpense(e.id)}><Trash2 size={13} /></Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                          👥 Nenhum salário registrado neste mês
                        </motion.div>
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Expenses Table (extracted) ── */
function ExpensesTable({
  filtered, categories, fmt, onEdit, onDelete,
}: {
  filtered: Expense[];
  categories: { id: string; name: string }[];
  fmt: (v: number) => string;
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e, i) => {
                const cat = categories.find(c => c.id === e.category_id);
                return (
                  <motion.tr
                    key={e.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell>{(() => { const d = normalizeDate(e.date); const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; })()}</TableCell>
                    <TableCell><Badge variant="outline" className="font-normal">{cat?.name || '—'}</Badge></TableCell>
                    <TableCell>{e.description || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{e.expense_type}</Badge>
                    </TableCell>
                    <TableCell>{e.responsible || '—'}</TableCell>
                    <TableCell className="font-semibold text-rose-600">{fmt(Number(e.amount))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/10" onClick={() => onEdit(e)}><Pencil size={13} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 text-destructive" onClick={() => onDelete(e.id)}><Trash2 size={13} /></Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    💸 Nenhuma despesa neste mês
                  </motion.div>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
