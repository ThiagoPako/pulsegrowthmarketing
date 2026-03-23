import { useState, useMemo } from 'react';
import { useFinancialData, type Expense, normalizeDate } from '@/hooks/useFinancialData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, ArrowLeft, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import ExpenseFormDialog from '@/components/financial/ExpenseFormDialog';

export default function FinancialExpenses() {
  const navigate = useNavigate();
  const { expenses, categories, addExpense, updateExpense, deleteExpense, addCategory } = useFinancialData();
  const [open, setOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [newCat, setNewCat] = useState('');
  const [catOpen, setCatOpen] = useState(false);

  const filtered = useMemo(() => {
    const ym = selectedMonth; // "2026-03"
    return expenses.filter(e => {
      const dateStr = normalizeDate(e.date); // "2026-03-23"
      return dateStr.startsWith(ym);
    });
  }, [expenses, selectedMonth]);

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

  const handleSave = async (form: any, editingId: string | null) => {
    try {
      let success: boolean;
      if (editingId) {
        success = await updateExpense(editingId, form);
      } else {
        success = await addExpense(form);
      }
      if (success) {
        toast.success('Despesa salva!');
      } else {
        toast.error('Erro ao salvar despesa. Verifique os dados e tente novamente.');
      }
    } catch (err: any) {
      console.error('[FinancialExpenses] handleSave error:', err);
      toast.error('Erro inesperado ao salvar despesa.');
    }
  };

  const handleEdit = (e: Expense) => {
    setEditingExpense(e);
    setOpen(true);
  };

  const handleDeleteExpense = async (id: string) => {
    if (confirm('Excluir despesa?')) { await deleteExpense(id); toast.success('Excluída'); }
  };

  const handleAddCategory = async () => {
    if (newCat.trim()) {
      await addCategory(newCat.trim());
      setNewCat('');
      setCatOpen(false);
      toast.success('Categoria criada');
    }
  };

  const fixas = filtered.filter(e => e.expense_type === 'fixa').reduce((s, e) => s + Number(e.amount), 0);
  const variaveis = filtered.filter(e => e.expense_type === 'variavel').reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-5">
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

      {/* Expense Form Dialog */}
      <ExpenseFormDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditingExpense(null); }}
        categories={categories}
        editingExpense={editingExpense}
        onSave={handleSave}
      />

      {/* KPI Summary */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }} className="grid grid-cols-3 gap-3">
        <Card className="border-rose-200/50 overflow-hidden">
          <CardContent className="pt-3 pb-3 bg-gradient-to-br from-rose-500/10 to-red-500/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center"><TrendingDown size={16} className="text-rose-600" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Total do Mês</p>
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
                    <TableCell>{format(new Date(e.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                    <TableCell><Badge variant="outline" className="font-normal">{cat?.name || '—'}</Badge></TableCell>
                    <TableCell>{e.description || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{e.expense_type}</Badge>
                    </TableCell>
                    <TableCell>{e.responsible || '—'}</TableCell>
                    <TableCell className="font-semibold text-rose-600">{fmt(Number(e.amount))}</TableCell>
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
    </div>
  );
}
