import { useState, useEffect } from 'react';
import { useEndoContracts, useEndoPackages, getCategoryLabel, EndoContract } from '@/hooks/useEndomarketing';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Ban, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react';

interface SimpleClient { id: string; company_name: string; color: string; }
interface SimpleProfile { id: string; name: string; display_name: string | null; role: string; }

export default function EndomarketingContracts() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isEndo = profile?.role === 'endomarketing';
  const canSeeFinancials = isAdmin || isEndo;
  const { contracts, loading, addContract, updateContract, deactivateContract } = useEndoContracts();
  const { packages } = useEndoPackages();
  const [clients, setClients] = useState<SimpleClient[]>([]);
  const [partners, setPartners] = useState<SimpleProfile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EndoContract | null>(null);

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formPackageId, setFormPackageId] = useState('');
  const [formPartnerId, setFormPartnerId] = useState('');
  const [formPartnerCost, setFormPartnerCost] = useState(0);
  const [formSalePrice, setFormSalePrice] = useState(0);
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    supabase.from('clients').select('id, company_name, color').order('company_name').then(({ data }) => {
      if (data) setClients(data);
    });
    supabase.from('profiles').select('id, name, display_name, role').then(({ data }) => {
      if (data) setPartners(data.filter(p => p.role === 'parceiro' || p.role === 'endomarketing'));
    });
  }, []);

  const filteredPackages = packages.filter(p => !formCategory || p.category === formCategory);

  const openAdd = () => {
    setEditing(null);
    setFormClientId(''); setFormCategory(''); setFormPackageId('');
    setFormPartnerId(''); setFormPartnerCost(0); setFormSalePrice(0);
    setFormStartDate(new Date().toISOString().slice(0, 10));
    setDialogOpen(true);
  };

  const openEdit = (c: EndoContract) => {
    setEditing(c);
    setFormClientId(c.client_id);
    setFormCategory(c.endomarketing_packages?.category || '');
    setFormPackageId(c.package_id);
    setFormPartnerId(c.partner_id || '');
    setFormPartnerCost(c.partner_cost);
    setFormSalePrice(c.sale_price);
    setFormStartDate(c.start_date);
    setDialogOpen(true);
  };

  // Auto-fill partner cost when package changes
  useEffect(() => {
    if (formPackageId && !editing) {
      const pkg = packages.find(p => p.id === formPackageId);
      if (pkg) setFormPartnerCost(pkg.partner_cost);
    }
  }, [formPackageId, packages, editing]);

  const handleSave = async () => {
    if (!formClientId || !formPackageId) {
      toast.error('Selecione cliente e pacote');
      return;
    }
    if (formPartnerCost <= 0) {
      toast.error('Defina o valor do parceiro');
      return;
    }
    if (formSalePrice < formPartnerCost) {
      toast.warning('⚠️ O valor de venda é menor que o custo do parceiro!');
    }

    if (editing) {
      await updateContract(editing.id, {
        package_id: formPackageId,
        partner_id: formPartnerId || null,
        partner_cost: formPartnerCost,
        sale_price: formSalePrice,
        start_date: formStartDate,
      } as any);
      toast.success('Contrato atualizado');
    } else {
      const ok = await addContract({
        client_id: formClientId,
        package_id: formPackageId,
        partner_id: formPartnerId || null,
        partner_cost: formPartnerCost,
        sale_price: formSalePrice,
        start_date: formStartDate,
      });
      if (ok) toast.success('Contrato criado! Despesa gerada automaticamente.');
      else toast.error('Erro ao criar contrato');
    }
    setDialogOpen(false);
  };

  const handleDeactivate = async (id: string) => {
    await deactivateContract(id);
    toast.success('Contrato desativado');
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (loading) return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Contratos Endomarketing</h1>
          <p className="text-sm text-muted-foreground">{contracts.length} contratos</p>
        </div>
        {isAdmin && <Button onClick={openAdd}><Plus size={16} className="mr-1" /> Novo Contrato</Button>}
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Pacote</TableHead>
                <TableHead>Parceiro</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                {canSeeFinancials && <TableHead className="text-right">Venda</TableHead>}
                {canSeeFinancials && <TableHead className="text-right">Lucro</TableHead>}
                {canSeeFinancials && <TableHead className="text-right">Margem</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map(c => {
                const profit = c.sale_price - c.partner_cost;
                const margin = c.sale_price > 0 ? (profit / c.sale_price * 100) : 0;
                const isNegative = profit < 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-6 rounded-full" style={{ backgroundColor: `hsl(${c.clients?.color || '217 91% 60%'})` }} />
                        <span className="font-medium text-sm">{c.clients?.company_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{c.endomarketing_packages?.package_name}</p>
                        <p className="text-xs text-muted-foreground">{getCategoryLabel(c.endomarketing_packages?.category || '')}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.partner_profile?.display_name || c.partner_profile?.name || '—'}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(c.partner_cost)}</TableCell>
                    {canSeeFinancials && <TableCell className="text-right text-sm font-medium">{fmt(c.sale_price)}</TableCell>}
                    {canSeeFinancials && (
                      <TableCell className={`text-right text-sm font-bold ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isNegative && <AlertTriangle size={12} className="inline mr-1" />}
                        {fmt(profit)}
                      </TableCell>
                    )}
                    {canSeeFinancials && <TableCell className="text-right text-sm">{margin.toFixed(0)}%</TableCell>}
                    <TableCell>
                      <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'}>
                        {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                        {c.status === 'ativo' && (
                          <Button variant="ghost" size="icon" onClick={() => handleDeactivate(c.id)}><Ban size={14} /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {contracts.length === 0 && (
                <TableRow><TableCell colSpan={canSeeFinancials ? 9 : 6} className="text-center py-8 text-muted-foreground">Nenhum contrato cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Contrato' : 'Novo Contrato Endomarketing'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Select value={formClientId} onValueChange={setFormClientId} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={formCategory} onValueChange={v => { setFormCategory(v); setFormPackageId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presenca_completa">Presença Completa</SelectItem>
                    <SelectItem value="gravacao_concentrada">Gravação Concentrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Pacote *</Label>
                <Select value={formPackageId} onValueChange={setFormPackageId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {filteredPackages.map(p => <SelectItem key={p.id} value={p.id}>{p.package_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Parceiro Responsável</Label>
              <Select value={formPartnerId} onValueChange={setFormPartnerId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name || p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className={`grid ${canSeeFinancials ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              <div className="space-y-1">
                <Label>💰 Custo Parceiro (R$) *</Label>
                <Input type="number" min={0} step={0.01} value={formPartnerCost} onChange={e => setFormPartnerCost(Number(e.target.value))} />
              </div>
              {canSeeFinancials && (
                <div className="space-y-1">
                  <Label>💵 Valor de Venda (R$) *</Label>
                  <Input type="number" min={0} step={0.01} value={formSalePrice} onChange={e => setFormSalePrice(Number(e.target.value))} />
                </div>
              )}
            </div>

            {canSeeFinancials && formSalePrice > 0 && formPartnerCost > 0 && (
              <div className={`p-3 rounded-lg border ${formSalePrice < formPartnerCost ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20'}`}>
                <div className="flex items-center gap-2">
                  {formSalePrice < formPartnerCost ? <AlertTriangle size={16} className="text-red-500" /> : <TrendingUp size={16} className="text-emerald-500" />}
                  <div>
                    <p className="text-sm font-medium">
                      Lucro: {fmt(formSalePrice - formPartnerCost)} | Margem: {((formSalePrice - formPartnerCost) / formSalePrice * 100).toFixed(1)}%
                    </p>
                    {formSalePrice < formPartnerCost && <p className="text-xs text-red-500">⚠️ Valor de venda inferior ao custo!</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Data de Início</Label>
              <Input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar Contrato'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
