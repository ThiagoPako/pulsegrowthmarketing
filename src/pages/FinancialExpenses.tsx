import { useState, useMemo } from 'react';
import { useFinancialData, type Expense } from '@/hooks/useFinancialData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const emptyForm = { date: new Date().toISOString().split('T')[0], amount: 0, category_id: '', expense_type: 'fixa', description: '', responsible: '' };

export default function FinancialExpenses() {
  const navigate = useNavigate();
  const { expenses, categories, addExpense, updateExpense, deleteExpense, addCategory } = useFinancialData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [newCat, setNewCat] = useState('');
  const [catOpen, setCatOpen] = useState(false);

  const monthStart = startOfMonth(new Date(selectedMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);

  const filtered = useMemo(() =>
    expenses.filter(e => { const d = new Date(e.date); return d >= monthStart && d <= monthEnd; }),
    [expenses, monthStart, monthEnd]
  );

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

  const handleSave = async () => {
    if (!form.category_id || !form.amount) { toast.error('Preencha os campos obrigatórios'); return; }
    if (editingId) {
      await updateExpense(editingId, form);
    } else {
      await addExpense(form);
    }
    toast.success('Despesa salva!');
    setOpen(false); setForm(emptyForm); setEditingId(null);
  };

  const handleEdit = (e: Expense) => {
    setForm({ date: e.date, amount: e.amount, category_id: e.category_id, expense_type: e.expense_type, description: e.description, responsible: e.responsible });
    setEditingId(e.id);
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Despesas</h1>
          <p className="text-sm text-muted-foreground">Total do mês: {fmt(total)}</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Dialog open={catOpen} onOpenChange={setCatOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline">+ Categoria</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader>
            <div className="flex gap-2">
              <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nome da categoria" />
              <Button onClick={handleAddCategory}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyForm); setEditingId(null); } }}>
          <DialogTrigger asChild><Button size="sm"><Plus size={16} className="mr-1" /> Nova Despesa</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div><Label>Valor (R$)</Label><Input type="number" min={0} step={0.01} value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.expense_type} onValueChange={v => setForm({ ...form, expense_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixa">Fixa</SelectItem>
                      <SelectItem value="variavel">Variável</SelectItem>
                      <SelectItem value="pontual">Pontual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Responsável</Label><Input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} /></div>
              <Button className="w-full" onClick={handleSave}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
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
              {filtered.map(e => {
                const cat = categories.find(c => c.id === e.category_id);
                return (
                  <TableRow key={e.id}>
                    <TableCell>{e.date}</TableCell>
                    <TableCell><Badge variant="outline">{cat?.name || '—'}</Badge></TableCell>
                    <TableCell>{e.description || '—'}</TableCell>
                    <TableCell className="capitalize">{e.expense_type}</TableCell>
                    <TableCell>{e.responsible || '—'}</TableCell>
                    <TableCell className="font-medium text-red-600">{fmt(Number(e.amount))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(e)}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteExpense(e.id)}><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma despesa neste mês</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
