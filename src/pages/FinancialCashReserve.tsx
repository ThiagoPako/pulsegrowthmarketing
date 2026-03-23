import { useState, useMemo } from 'react';
import { useFinancialData, normalizeDate } from '@/hooks/useFinancialData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Wallet, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function FinancialCashReserve() {
  const { cashMovements, addCashMovement, updateCashMovement, deleteCashMovement, loading } = useFinancialData();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'entrada' | 'saida'>('entrada');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const balance = useMemo(() =>
    cashMovements.reduce((acc, m) => acc + (m.type === 'entrada' ? Number(m.amount) : -Number(m.amount)), 0),
    [cashMovements]
  );

  const totalIn = useMemo(() =>
    cashMovements.filter(m => m.type === 'entrada').reduce((acc, m) => acc + Number(m.amount), 0),
    [cashMovements]
  );

  const totalOut = useMemo(() =>
    cashMovements.filter(m => m.type === 'saida').reduce((acc, m) => acc + Number(m.amount), 0),
    [cashMovements]
  );

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setType('entrada');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (m: typeof cashMovements[0]) => {
    setEditingId(m.id);
    setAmount(String(m.amount));
    setType(m.type as 'entrada' | 'saida');
    setDescription(m.description);
    setDate(m.date);
    setOpen(true);
  };

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error('Informe um valor válido'); return; }
    if (!description.trim()) { toast.error('Informe uma descrição'); return; }

    if (editingId) {
      const ok = await updateCashMovement(editingId, { amount: val, type, description: description.trim(), date });
      if (ok) {
        toast.success('Movimentação atualizada');
        setOpen(false);
        resetForm();
      } else {
        toast.error('Erro ao atualizar movimentação');
      }
    } else {
      const ok = await addCashMovement({ amount: val, type, description: description.trim(), date });
      if (ok) {
        toast.success(`Movimentação de ${type === 'entrada' ? 'entrada' : 'saída'} registrada`);
        setOpen(false);
        resetForm();
      } else {
        toast.error('Erro ao registrar movimentação');
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const ok = await deleteCashMovement(deleteId);
    if (ok) {
      toast.success('Movimentação excluída');
    } else {
      toast.error('Erro ao excluir movimentação');
    }
    setDeleteId(null);
  };

  if (loading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caixa (Reserva)</h1>
          <p className="text-sm text-muted-foreground">Controle da reserva financeira da empresa</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nova Movimentação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Movimentação' : 'Registrar Movimentação'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as 'entrada' | 'saida')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada (depósito no caixa)</SelectItem>
                    <SelectItem value="saida">Saída (retirada do caixa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Reserva do lucro de março" />
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleSubmit}>
                {editingId ? 'Salvar Alterações' : 'Registrar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo do Caixa</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(balance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Entradas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(totalIn)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Saídas</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fmt(totalOut)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          {cashMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação registrada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashMovements.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{format(new Date(m.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === 'entrada' ? 'default' : 'destructive'} className="gap-1">
                        {m.type === 'entrada' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                        {m.type === 'entrada' ? 'Entrada' : 'Saída'}
                      </Badge>
                    </TableCell>
                    <TableCell>{m.description}</TableCell>
                    <TableCell className={`text-right font-medium ${m.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.type === 'entrada' ? '+' : '-'}{fmt(m.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(m.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O saldo do caixa será recalculado.</AlertDialogDescription>
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
