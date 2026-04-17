import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Gift, Ticket, Copy, ExternalLink, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const VPS_API = 'https://agenciapulse.tech/api';

interface Client {
  id: string;
  company_name: string;
  color: string;
}

interface Campaign {
  id: string;
  client_id: string;
  title: string;
  description: string;
  discount_type: string;
  discount_value: number;
  min_purchase_value: number;
  total_coupons: number;
  coupons_claimed: number;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

function formatCountdown(expiresAt: string | null): { label: string; expired: boolean } {
  if (!expiresAt) return { label: 'Sem prazo', expired: false };
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { label: 'Expirado', expired: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return { label: `${days}d ${hours}h restantes`, expired: false };
  if (hours > 0) return { label: `${hours}h ${mins}m restantes`, expired: false };
  return { label: `${mins}m restantes`, expired: false };
}

export default function DiscountAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [selectedClient, setSelectedClient] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minPurchase, setMinPurchase] = useState('');
  const [totalCoupons, setTotalCoupons] = useState('10');
  const [durationDays, setDurationDays] = useState('7');
  const [, setTick] = useState(0);

  // Re-render every 60s to update countdowns
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      loadData();
      return;
    }
    setLoading(false);
  }, [user, authLoading]);

  const loadData = async () => {
    setLoading(true);

    try {
      const { data: clientsData, error } = await supabase
        .from('clients')
        .select('id, company_name, color')
        .order('company_name');

      if (error) {
        throw new Error(error.message || 'Erro ao carregar clientes');
      }

      const safeClients = clientsData || [];
      setClients(safeClients);

      const campaignResults = await Promise.all(
        safeClients.map(async (client) => {
          try {
            const res = await fetch(`${VPS_API}/discount-stats/${client.id}`);
            const data = await res.json();
            return data.campaigns || [];
          } catch {
            return [];
          }
        })
      );

      setCampaigns(campaignResults.flat());
    } catch (e: any) {
      setClients([]);
      setCampaigns([]);
      toast.error(e.message || 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedClient || !title || !discountValue || !totalCoupons) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${VPS_API}/discount-campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient,
          title,
          description,
          discount_type: discountType,
          discount_value: parseFloat(discountValue),
          min_purchase_value: minPurchase ? parseFloat(minPurchase) : 0,
          total_coupons: parseInt(totalCoupons),
          created_by: user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Campanha criada com ${data.coupons_generated} cupons!`);
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar campanha');
    } finally {
      setCreating(false);
    }
  };

  const toggleCampaign = async (campaignId: string, currentActive: boolean) => {
    try {
      await fetch(`${VPS_API}/discount-campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      toast.success(currentActive ? 'Campanha desativada' : 'Campanha ativada');
      loadData();
    } catch (e) {
      toast.error('Erro ao atualizar campanha');
    }
  };

  const resetForm = () => {
    setSelectedClient('');
    setTitle('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue('');
    setMinPurchase('');
    setTotalCoupons('10');
  };

  const copyLink = (clientId: string) => {
    const url = `${window.location.origin}/clube/${clientId}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift size={24} className="text-primary" />
            Clube de Descontos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie campanhas de cupons para clientes parceiros</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={16} />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Campanha de Cupons</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Cliente</label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Título da campanha</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Desconto de Inauguração" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Descrição (opcional)</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalhes da promoção" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Tipo</label>
                  <Select value={discountType} onValueChange={setDiscountType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                      <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Valor</label>
                  <Input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder={discountType === 'percentage' ? '10' : '20.00'} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Compra mínima</label>
                  <Input type="number" value={minPurchase} onChange={e => setMinPurchase(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Qtd cupons</label>
                  <Input type="number" value={totalCoupons} onChange={e => setTotalCoupons(e.target.value)} placeholder="10" />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full gap-2">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                Criar Campanha
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaigns list */}
      <div className="grid gap-4">
        {campaigns.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Ticket size={48} className="mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Nenhuma campanha criada ainda</p>
            </CardContent>
          </Card>
        )}

        {campaigns.map(camp => {
          const client = clients.find(c => c.id === camp.client_id);
          const discountLabel = camp.discount_type === 'percentage'
            ? `${camp.discount_value}%`
            : `R$ ${Number(camp.discount_value).toFixed(2)}`;

          return (
            <Card key={camp.id} className={!camp.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: `hsl(${client?.color || '217 91% 60%'})` }}
                    >
                      {client?.company_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <h3 className="font-semibold">{camp.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {client?.company_name} • {discountLabel} • {camp.coupons_claimed}/{camp.total_coupons} resgatados
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyLink(camp.client_id)}
                      title="Copiar link público"
                    >
                      <Copy size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`/clube/${camp.client_id}`, '_blank')}
                      title="Abrir página pública"
                    >
                      <ExternalLink size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleCampaign(camp.id, camp.is_active)}
                      title={camp.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {camp.is_active ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
