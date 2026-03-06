import { useState, useMemo } from 'react';
import { useFinancialData, type Revenue, type Expense, type CashMovement } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowUpCircle, ArrowDownCircle, Pencil, Trash2, Search, Filter, DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type MovementType = 'all' | 'receita' | 'despesa' | 'caixa';

interface UnifiedMovement {
  id: string;
  date: string;
  type: 'receita' | 'despesa' | 'caixa_entrada' | 'caixa_saida';
  description: string;
  amount: number;
  status?: string;
  clientName?: string;
  category?: string;
  sourceType: 'receita' | 'despesa' | 'caixa';
  original: Revenue | Expense | CashMovement;
}

export default function FinancialMovements() {
  const navigate = useNavigate();
  const {
    revenues, expenses, cashMovements, categories, contracts,
    updateRevenue, updateExpense, deleteExpense,
    updateCashMovement, deleteCashMovement,
    loading,
  } = useFinancialData();
  const { clients } = useApp();

  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [filterType, setFilterType] = useState<MovementType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UnifiedMovement | null>(null);
  const [editTarget, setEditTarget] = useState<UnifiedMovement | null>(null);

  // Edit form states
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editCashType, setEditCashType] = useState<'entrada' | 'saida'>('entrada');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editExpenseType, setEditExpenseType] = useState('');
  const [editResponsible, setEditResponsible] = useState('');

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const monthStart = startOfMonth(new Date(selectedMonth + '-01T12:00:00'));
  const monthEnd = endOfMonth(monthStart);

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -12; i <= 3; i++) {
      const m = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), -i) : addMonths(new Date(), i));
      options.push({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy', { locale: ptBR }) });
    }
    return options;
  }, []);

  const unified = useMemo(() => {
    const movements: UnifiedMovement[] = [];

    // Revenues
    revenues.forEach(r => {
      const d = new Date(r.due_date + 'T12:00:00');
      if (d >= monthStart && d <= monthEnd) {
        const client = clients.find(c => c.id === r.client_id);
        movements.push({
          id: r.id,
          date: r.due_date,
          type: 'receita',
          description: `Mensalidade - ${client?.companyName || 'Cliente'}`,
          amount: Number(r.amount),
          status: r.status,
          clientName: client?.companyName,
          sourceType: 'receita',
          original: r,
        });
      }
    });

    // Expenses
    expenses.forEach(e => {
      const d = new Date(e.date + 'T12:00:00');
      if (d >= monthStart && d <= monthEnd) {
        const cat = categories.find(c => c.id === e.category_id);
        movements.push({
          id: e.id,
          date: e.date,
          type: 'despesa',
          description: e.description || 'Despesa',
          amount: Number(e.amount),
          category: cat?.name,
          sourceType: 'despesa',
          original: e,
        });
      }
    });

    // Cash movements
    cashMovements.forEach(m => {
      const d = new Date(m.date + 'T12:00:00');
      if (d >= monthStart && d <= monthEnd) {
        movements.push({
          id: m.id,
          date: m.date,
          type: m.type === 'entrada' ? 'caixa_entrada' : 'caixa_saida',
          description: m.description,
          amount: Number(m.amount),
          sourceType: 'caixa',
          original: m,
        });
      }
    });

    // Sort by date descending
    movements.sort((a, b) => b.date.localeCompare(a.date));
    return movements;
  }, [revenues, expenses, cashMovements, clients, categories, monthStart, monthEnd]);

  const filtered = useMemo(() => {
    let result = unified;
    if (filterType !== 'all') {
      result = result.filter(m => m.sourceType === filterType);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(m =>
        m.description.toLowerCase().includes(term) ||
        (m.clientName && m.clientName.toLowerCase().includes(term)) ||
        (m.category && m.category.toLowerCase().includes(term))
      );
    }
    return result;
  }, [unified, filterType, searchTerm]);

  // Totals
  const totals = useMemo(() => {
    const r = unified.filter(m => m.type === 'receita').reduce((s, m) => s + m.amount, 0);
    const e = unified.filter(m => m.type === 'despesa').reduce((s, m) => s + m.amount, 0);
    const ci = unified.filter(m => m.type === 'caixa_entrada').reduce((s, m) => s + m.amount, 0);
    const co = unified.filter(m => m.type === 'caixa_saida').reduce((s, m) => s + m.amount, 0);
    return { receitas: r, despesas: e, caixaIn: ci, caixaOut: co };
  }, [unified]);

  const getTypeInfo = (type: UnifiedMovement['type']) => {
    switch (type) {
      case 'receita': return { label: 'Receita', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/20', icon: <TrendingUp className="w-3.5 h-3.5" /> };
      case 'despesa': return { label: 'Despesa', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/20', icon: <TrendingDown className="w-3.5 h-3.5" /> };
      case 'caixa_entrada': return { label: 'Caixa ↑', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/20', icon: <ArrowUpCircle className="w-3.5 h-3.5" /> };
      case 'caixa_saida': return { label: 'Caixa ↓', color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/20', icon: <ArrowDownCircle className="w-3.5 h-3.5" /> };
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'recebida': return <Badge variant="default" className="text-xs">Recebida</Badge>;
      case 'em_atraso': return <Badge variant="destructive" className="text-xs">Em Atraso</Badge>;
      case 'prevista': return <Badge variant="secondary" className="text-xs">Prevista</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const openEdit = (m: UnifiedMovement) => {
    setEditTarget(m);
    setEditAmount(String(m.amount));
    setEditDate(m.date);

    if (m.sourceType === 'receita') {
      const r = m.original as Revenue;
      setEditStatus(r.status);
      setEditDescription('');
    } else if (m.sourceType === 'despesa') {
      const e = m.original as Expense;
      setEditDescription(e.description);
      setEditCategoryId(e.category_id);
      setEditExpenseType(e.expense_type);
      setEditResponsible(e.responsible);
    } else {
      const c = m.original as CashMovement;
      setEditDescription(c.description);
      setEditCashType(c.type as 'entrada' | 'saida');
    }
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    const val = parseFloat(editAmount);
    if (!val || val <= 0) { toast.error('Informe um valor válido'); return; }

    let ok = false;
    if (editTarget.sourceType === 'receita') {
      ok = await updateRevenue(editTarget.id, {
        amount: val,
        due_date: editDate,
        status: editStatus,
        paid_at: editStatus === 'recebida' ? new Date().toISOString().split('T')[0] : null,
      });
    } else if (editTarget.sourceType === 'despesa') {
      if (!editDescription.trim()) { toast.error('Informe uma descrição'); return; }
      ok = await updateExpense(editTarget.id, {
        amount: val,
        date: editDate,
        description: editDescription.trim(),
        category_id: editCategoryId,
        expense_type: editExpenseType,
        responsible: editResponsible,
      });
    } else {
      if (!editDescription.trim()) { toast.error('Informe uma descrição'); return; }
      ok = await updateCashMovement(editTarget.id, {
        amount: val,
        date: editDate,
        description: editDescription.trim(),
        type: editCashType,
      });
    }

    if (ok) {
      toast.success('Movimentação atualizada');
      setEditTarget(null);
    } else {
      toast.error('Erro ao atualizar');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    let ok = false;
    if (deleteTarget.sourceType === 'despesa') {
      await deleteExpense(deleteTarget.id);
      ok = true;
    } else if (deleteTarget.sourceType === 'caixa') {
      ok = await deleteCashMovement(deleteTarget.id);
    } else {
      toast.error('Receitas não podem ser excluídas diretamente. Use a página de Receitas.');
      setDeleteTarget(null);
      return;
    }
    if (ok) toast.success('Movimentação excluída');
    else toast.error('Erro ao excluir');
    setDeleteTarget(null);
  };

  if (loading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft /></Button>
          <div>
            <h1 className="text-2xl font-bold">Movimentações Financeiras</h1>
            <p className="text-sm text-muted-foreground">Visualize, edite e exclua todas as movimentações</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp size={14} /> Receitas</div>
            <p className="text-xl font-bold text-green-600 mt-1">{fmt(totals.receitas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown size={14} /> Despesas</div>
            <p className="text-xl font-bold text-red-600 mt-1">{fmt(totals.despesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowUpCircle size={14} /> Caixa Entrada</div>
            <p className="text-xl font-bold text-blue-600 mt-1">{fmt(totals.caixaIn)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowDownCircle size={14} /> Caixa Saída</div>
            <p className="text-xl font-bold text-orange-600 mt-1">{fmt(totals.caixaOut)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-muted-foreground" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as MovementType)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
                <SelectItem value="caixa">Caixa</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, cliente ou categoria..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="text-xs">{filtered.length} movimentações</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhuma movimentação encontrada para o período selecionado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(m => {
                  const info = getTypeInfo(m.type);
                  const isIncome = m.type === 'receita' || m.type === 'caixa_entrada';
                  return (
                    <TableRow key={`${m.sourceType}-${m.id}`}>
                      <TableCell className="whitespace-nowrap">{format(new Date(m.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${info.color}`}>
                          {info.icon} {info.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{m.description}</p>
                          {m.category && <span className="text-xs text-muted-foreground">{m.category}</span>}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(m.status)}</TableCell>
                      <TableCell className={`text-right font-medium ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                        {isIncome ? '+' : '-'}{fmt(m.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {m.sourceType !== 'receita' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Movimentação</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4">
              {editTarget.sourceType === 'receita' && (
                <div>
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prevista">Prevista</SelectItem>
                      <SelectItem value="recebida">Recebida</SelectItem>
                      <SelectItem value="em_atraso">Em Atraso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editTarget.sourceType === 'caixa' && (
                <div>
                  <Label>Tipo</Label>
                  <Select value={editCashType} onValueChange={v => setEditCashType(v as 'entrada' | 'saida')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editTarget.sourceType === 'despesa' && (
                <>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo de Despesa</Label>
                    <Select value={editExpenseType} onValueChange={setEditExpenseType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixa">Fixa</SelectItem>
                        <SelectItem value="variavel">Variável</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Responsável</Label>
                    <Input value={editResponsible} onChange={e => setEditResponsible(e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" min="0" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
              </div>
              {(editTarget.sourceType === 'despesa' || editTarget.sourceType === 'caixa') && (
                <div>
                  <Label>Descrição</Label>
                  <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} />
                </div>
              )}
              <div>
                <Label>Data</Label>
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleEditSave}>Salvar Alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Tem certeza que deseja excluir "{deleteTarget.description}" no valor de {fmt(deleteTarget.amount)}? Esta ação não pode ser desfeita.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
