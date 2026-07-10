import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Users, FileText, Upload, Trash2, Pencil, Download, Search, Paperclip } from 'lucide-react';
import { toast } from 'sonner';

type InternalContract = {
  id: string;
  member_name: string;
  role: string | null;
  document: string | null;
  monthly_value: number;
  payment_day: number;
  pix_key: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_at?: string;
};

type Invoice = {
  id: string;
  contract_id: string;
  reference_month: string; // YYYY-MM
  amount: number;
  invoice_number: string | null;
  file_url: string | null;
  file_name: string | null;
  status: string; // pendente | pago
  paid_at: string | null;
  notes: string | null;
  created_at?: string;
};

const emptyContract: Omit<InternalContract, 'id'> = {
  member_name: '', role: '', document: '', monthly_value: 0, payment_day: 5,
  pix_key: '', start_date: new Date().toISOString().slice(0, 10), end_date: null,
  status: 'ativo', notes: '',
};

const fmtMoney = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const monthLabel = (ym: string) => {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
};
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function InternalContractsTab() {
  const [contracts, setContracts] = useState<InternalContract[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyContract);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<InternalContract | null>(null);
  const [invForm, setInvForm] = useState({ reference_month: currentMonth(), amount: 0, invoice_number: '', notes: '' });
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [cRes, iRes] = await Promise.all([
      supabase.from('internal_contracts').select('*').order('member_name'),
      supabase.from('internal_contract_invoices').select('*').order('reference_month', { ascending: false }),
    ]);
    if (cRes.error) toast.error('Erro carregando contratos internos: ' + cRes.error.message);
    setContracts((cRes.data as any) || []);
    setInvoices((iRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => contracts.filter(c =>
    !search || c.member_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.role || '').toLowerCase().includes(search.toLowerCase())
  ), [contracts, search]);

  const invoicesByContract = useMemo(() => {
    const map: Record<string, Invoice[]> = {};
    invoices.forEach(i => { (map[i.contract_id] ||= []).push(i); });
    return map;
  }, [invoices]);

  const currentMonthPaid = (contractId: string) =>
    invoicesByContract[contractId]?.some(i => i.reference_month === currentMonth() && i.status === 'pago');

  const openNew = () => { setForm(emptyContract); setEditingId(null); setFormOpen(true); };
  const openEdit = (c: InternalContract) => {
    setForm({ ...c, end_date: c.end_date || '' });
    setEditingId(c.id);
    setFormOpen(true);
  };

  const saveContract = async () => {
    if (!form.member_name?.trim()) { toast.error('Informe o nome'); return; }
    const payload = {
      ...form,
      monthly_value: Number(form.monthly_value) || 0,
      payment_day: Number(form.payment_day) || 5,
      end_date: form.end_date || null,
    };
    const res = editingId
      ? await supabase.from('internal_contracts').update(payload as any).eq('id', editingId)
      : await supabase.from('internal_contracts').insert(payload as any);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success('Contrato salvo');
    setFormOpen(false);
    load();
  };

  const removeContract = async (id: string) => {
    if (!confirm('Excluir contrato e todas as notas anexadas?')) return;
    await supabase.from('internal_contract_invoices').delete().eq('contract_id', id);
    const { error } = await supabase.from('internal_contracts').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Excluído'); load(); }
  };

  const openInvoices = (c: InternalContract) => {
    setSelectedContract(c);
    setInvForm({ reference_month: currentMonth(), amount: c.monthly_value, invoice_number: '', notes: '' });
    setInvoicesOpen(true);
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedContract) return;
    setUploading(true);
    try {
      const url = await uploadFileToVps(file, 'internal-invoices');
      const payload = {
        contract_id: selectedContract.id,
        reference_month: invForm.reference_month,
        amount: Number(invForm.amount) || selectedContract.monthly_value,
        invoice_number: invForm.invoice_number || null,
        file_url: url,
        file_name: file.name,
        status: 'pendente',
        notes: invForm.notes || null,
      };
      const { error } = await supabase.from('internal_contract_invoices').insert(payload as any);
      if (error) throw error;
      toast.success('Nota fiscal anexada');
      setInvForm({ reference_month: currentMonth(), amount: selectedContract.monthly_value, invoice_number: '', notes: '' });
      load();
    } catch (err: any) {
      toast.error('Erro no upload: ' + (err?.message || err));
    } finally {
      setUploading(false);
    }
  };

  const togglePaid = async (inv: Invoice) => {
    const newStatus = inv.status === 'pago' ? 'pendente' : 'pago';
    const { error } = await supabase.from('internal_contract_invoices').update({
      status: newStatus,
      paid_at: newStatus === 'pago' ? new Date().toISOString() : null,
    } as any).eq('id', inv.id);
    if (error) toast.error(error.message); else { toast.success(newStatus === 'pago' ? 'Marcada como paga' : 'Reaberta'); load(); }
  };

  const removeInvoice = async (id: string) => {
    if (!confirm('Excluir esta nota?')) return;
    const { error } = await supabase.from('internal_contract_invoices').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Nota excluída'); load(); }
  };

  const totalMensal = contracts.filter(c => c.status === 'ativo').reduce((s, c) => s + Number(c.monthly_value || 0), 0);
  const pagoMes = invoices.filter(i => i.reference_month === currentMonth() && i.status === 'pago').reduce((s, i) => s + Number(i.amount || 0), 0);
  const pendenteMes = totalMensal - pagoMes;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Equipe ativa</p><p className="text-2xl font-bold">{contracts.filter(c => c.status === 'ativo').length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Folha mensal</p><p className="text-2xl font-bold">{fmtMoney(totalMensal)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pago em {monthLabel(currentMonth())}</p><p className="text-2xl font-bold text-primary">{fmtMoney(pagoMes)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pendente</p><p className="text-2xl font-bold text-amber-500">{fmtMoney(Math.max(0, pendenteMes))}</p></CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar membro..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew}><Plus size={16} className="mr-1" /> Novo contrato interno</Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Carregando...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          Nenhum contrato interno cadastrado.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const invs = invoicesByContract[c.id] || [];
            const paidThisMonth = currentMonthPaid(c.id);
            return (
              <Card key={c.id} className="hover:shadow-md transition-all">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.member_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.role || 'Sem cargo'}</p>
                    </div>
                    <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'}>{c.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{fmtMoney(c.monthly_value)}</span>
                    <span className="text-xs text-muted-foreground">Dia {c.payment_day}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Paperclip size={12} className="text-muted-foreground" />
                    <span className="text-muted-foreground">{invs.length} nota(s)</span>
                    {paidThisMonth
                      ? <Badge variant="default" className="ml-auto text-[10px]">Pago {monthLabel(currentMonth())}</Badge>
                      : <Badge variant="outline" className="ml-auto text-[10px]">Pendente {monthLabel(currentMonth())}</Badge>}
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-border/50">
                    <Button size="sm" variant="default" className="flex-1 h-8" onClick={() => openInvoices(c)}>
                      <FileText size={12} className="mr-1" /> Notas
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(c)}><Pencil size={12} /></Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => removeContract(c.id)}><Trash2 size={12} /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Contract form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? 'Editar' : 'Novo'} contrato interno</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome</Label><Input value={form.member_name} onChange={e => setForm({ ...form, member_name: e.target.value })} /></div>
              <div><Label>Cargo/Função</Label><Input value={form.role || ''} onChange={e => setForm({ ...form, role: e.target.value })} /></div>
              <div><Label>CPF/CNPJ</Label><Input value={form.document || ''} onChange={e => setForm({ ...form, document: e.target.value })} /></div>
              <div><Label>Valor mensal (R$)</Label><Input type="number" step="0.01" value={form.monthly_value} onChange={e => setForm({ ...form, monthly_value: e.target.value })} /></div>
              <div><Label>Dia de pagamento</Label><Input type="number" min={1} max={28} value={form.payment_day} onChange={e => setForm({ ...form, payment_day: e.target.value })} /></div>
              <div><Label>Início</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Fim (opcional)</Label><Input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              <div className="col-span-2"><Label>Chave PIX</Label><Input value={form.pix_key || ''} onChange={e => setForm({ ...form, pix_key: e.target.value })} /></div>
              <div className="col-span-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button onClick={saveContract}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoices dialog */}
      <Dialog open={invoicesOpen} onOpenChange={setInvoicesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText size={18} /> Notas fiscais — {selectedContract?.member_name}</DialogTitle>
          </DialogHeader>
          {selectedContract && (
            <div className="space-y-4">
              <Card className="bg-muted/40">
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-medium">Anexar nova nota</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Mês de referência</Label>
                      <Input type="month" value={invForm.reference_month} onChange={e => setInvForm({ ...invForm, reference_month: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input type="number" step="0.01" value={invForm.amount} onChange={e => setInvForm({ ...invForm, amount: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">Nº da nota</Label>
                      <Input value={invForm.invoice_number} onChange={e => setInvForm({ ...invForm, invoice_number: e.target.value })} />
                    </div>
                  </div>
                  <Textarea rows={2} placeholder="Observações (opcional)" value={invForm.notes} onChange={e => setInvForm({ ...invForm, notes: e.target.value })} />
                  <label className="block">
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xml"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.currentTarget.value = ''; }}
                      disabled={uploading} />
                    <div className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                      <Upload size={20} className="mx-auto mb-1 text-muted-foreground" />
                      <p className="text-sm">{uploading ? 'Enviando...' : 'Clique para anexar PDF, XML ou imagem'}</p>
                    </div>
                  </label>
                </CardContent>
              </Card>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                <p className="text-sm font-medium">Histórico ({invoicesByContract[selectedContract.id]?.length || 0})</p>
                {(invoicesByContract[selectedContract.id] || []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma nota anexada ainda.</p>
                )}
                {(invoicesByContract[selectedContract.id] || []).map(inv => (
                  <Card key={inv.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{monthLabel(inv.reference_month)}</span>
                          <Badge variant={inv.status === 'pago' ? 'default' : 'outline'} className="text-[10px]">{inv.status}</Badge>
                          {inv.invoice_number && <span className="text-xs text-muted-foreground">nº {inv.invoice_number}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{inv.file_name || 'Sem arquivo'} · {fmtMoney(inv.amount)}</p>
                      </div>
                      {inv.file_url && (
                        <a href={inv.file_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" className="h-8"><Download size={12} /></Button>
                        </a>
                      )}
                      <Button size="sm" variant={inv.status === 'pago' ? 'outline' : 'default'} className="h-8" onClick={() => togglePaid(inv)}>
                        {inv.status === 'pago' ? 'Reabrir' : 'Marcar pago'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => removeInvoice(inv.id)}><Trash2 size={12} /></Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
