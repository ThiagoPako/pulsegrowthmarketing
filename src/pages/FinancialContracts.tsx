import { useState, useMemo } from 'react';
import { useFinancialData, type FinancialContract } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  ativo: { label: 'Ativo', variant: 'default' },
  em_atraso: { label: 'Em Atraso', variant: 'destructive' },
  cancelado: { label: 'Cancelado', variant: 'secondary' },
  suspenso: { label: 'Suspenso', variant: 'outline' },
};

const PAYMENT_METHODS: Record<string, string> = {
  pix: 'PIX', boleto: 'Boleto', cartao: 'Cartão', transferencia: 'Transferência',
};

const emptyForm = {
  client_id: '', plan_id: '', contract_value: 0, contract_start_date: new Date().toISOString().split('T')[0],
  due_day: 10, payment_method: 'pix', status: 'ativo',
};

export default function FinancialContracts() {
  const navigate = useNavigate();
  const { contracts, upsertContract, deleteContract, loading } = useFinancialData();
  const { clients } = useApp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('todos');

  const clientsWithoutContract = useMemo(() => {
    const ids = new Set(contracts.map(c => c.client_id));
    return clients.filter(c => !ids.has(c.id));
  }, [clients, contracts]);

  const filtered = filter === 'todos' ? contracts : contracts.filter(c => c.status === filter);

  const handleSave = async () => {
    if (!form.client_id) { toast.error('Selecione um cliente'); return; }
    const ok = await upsertContract(editingId ? { id: editingId, ...form } : form);
    if (ok) { toast.success('Contrato salvo!'); setOpen(false); setForm(emptyForm); setEditingId(null); }
  };

  const handleEdit = (c: FinancialContract) => {
    setForm({
      client_id: c.client_id, plan_id: c.plan_id || '', contract_value: c.contract_value,
      contract_start_date: c.contract_start_date, due_day: c.due_day, payment_method: c.payment_method, status: c.status,
    });
    setEditingId(c.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Excluir contrato?')) { await deleteContract(id); toast.success('Contrato excluído'); }
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Contratos de Clientes</h1>
          <p className="text-sm text-muted-foreground">{contracts.length} contratos</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="em_atraso">Em Atraso</SelectItem>
            <SelectItem value="cancelado">Cancelados</SelectItem>
            <SelectItem value="suspenso">Suspensos</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyForm); setEditingId(null); } }}>
          <DialogTrigger asChild><Button size="sm"><Plus size={16} className="mr-1" /> Novo Contrato</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })} disabled={!!editingId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(editingId ? clients : clientsWithoutContract).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor do Contrato (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={form.contract_value} onChange={e => setForm({ ...form, contract_value: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Dia de Vencimento</Label>
                  <Input type="number" min={1} max={28} value={form.due_day} onChange={e => setForm({ ...form, due_day: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início do Contrato</Label>
                  <Input type="date" value={form.contract_start_date} onChange={e => setForm({ ...form, contract_start_date: e.target.value })} />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => {
                const client = clients.find(cl => cl.id === c.client_id);
                const st = STATUS_MAP[c.status] || { label: c.status, variant: 'secondary' as const };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{client?.companyName || '—'}</TableCell>
                    <TableCell>{fmt(Number(c.contract_value))}</TableCell>
                    <TableCell>Dia {c.due_day}</TableCell>
                    <TableCell>{PAYMENT_METHODS[c.payment_method] || c.payment_method}</TableCell>
                    <TableCell>{c.contract_start_date}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum contrato encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
