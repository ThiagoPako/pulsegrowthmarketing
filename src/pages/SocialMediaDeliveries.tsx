import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Plus, Film, Palette, Image, Megaphone, Trash2, Edit, CheckCircle2, Clock, Filter, TrendingUp } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SocialDelivery {
  id: string;
  client_id: string;
  content_type: string;
  title: string;
  description: string | null;
  delivered_at: string;
  posted_at: string | null;
  platform: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  reels_qty: number;
  creatives_qty: number;
  stories_qty: number;
  arts_qty: number;
}

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'criativo', label: 'Criativo', icon: Megaphone, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'story', label: 'Story', icon: Image, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
];

const STATUS_OPTIONS = [
  { value: 'entregue', label: 'Entregue', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'postado', label: 'Postado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'revisao', label: 'Em revisão', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
];

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'LinkedIn'];

export default function SocialMediaDeliveries() {
  const { clients } = useApp();
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<SocialDelivery[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clientPlans, setClientPlans] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formType, setFormType] = useState('reels');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDeliveredAt, setFormDeliveredAt] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formPostedAt, setFormPostedAt] = useState('');
  const [formPlatform, setFormPlatform] = useState('');
  const [formStatus, setFormStatus] = useState('entregue');

  const fetchData = useCallback(async () => {
    const [dRes, pRes, cRes] = await Promise.all([
      supabase.from('social_media_deliveries').select('*').order('delivered_at', { ascending: false }),
      supabase.from('plans').select('id, name, reels_qty, creatives_qty, stories_qty, arts_qty'),
      supabase.from('clients').select('id, plan_id'),
    ]);
    if (dRes.data) setDeliveries(dRes.data as SocialDelivery[]);
    if (pRes.data) setPlans(pRes.data as Plan[]);
    if (cRes.data) {
      const map: Record<string, string | null> = {};
      (cRes.data as any[]).forEach(c => { map[c.id] = c.plan_id; });
      setClientPlans(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return deliveries.filter(d => {
      if (filterClient !== 'all' && d.client_id !== filterClient) return false;
      if (filterType !== 'all' && d.content_type !== filterType) return false;
      return true;
    });
  }, [deliveries, filterClient, filterType]);

  // Monthly stats per client
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const start = format(startOfMonth(now), 'yyyy-MM-dd');
    const end = format(endOfMonth(now), 'yyyy-MM-dd');
    const thisMonth = deliveries.filter(d => d.delivered_at >= start && d.delivered_at <= end);

    const byClient: Record<string, { reels: number; criativo: number; story: number; arte: number }> = {};
    thisMonth.forEach(d => {
      if (!byClient[d.client_id]) byClient[d.client_id] = { reels: 0, criativo: 0, story: 0, arte: 0 };
      if (d.content_type in byClient[d.client_id]) {
        (byClient[d.client_id] as any)[d.content_type]++;
      }
    });
    return byClient;
  }, [deliveries]);

  const resetForm = () => {
    setFormClientId('');
    setFormType('reels');
    setFormTitle('');
    setFormDescription('');
    setFormDeliveredAt(format(new Date(), 'yyyy-MM-dd'));
    setFormPostedAt('');
    setFormPlatform('');
    setFormStatus('entregue');
    setEditingId(null);
  };

  const openNew = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (d: SocialDelivery) => {
    setEditingId(d.id);
    setFormClientId(d.client_id);
    setFormType(d.content_type);
    setFormTitle(d.title);
    setFormDescription(d.description || '');
    setFormDeliveredAt(d.delivered_at);
    setFormPostedAt(d.posted_at || '');
    setFormPlatform(d.platform || '');
    setFormStatus(d.status);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formClientId || !formTitle) {
      toast.error('Preencha cliente e título');
      return;
    }
    const payload = {
      client_id: formClientId,
      content_type: formType,
      title: formTitle,
      description: formDescription || null,
      delivered_at: formDeliveredAt,
      posted_at: formPostedAt || null,
      platform: formPlatform || null,
      status: formStatus,
      created_by: user?.id || null,
    };

    if (editingId) {
      const { error } = await supabase.from('social_media_deliveries').update(payload as any).eq('id', editingId);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Entrega atualizada');
    } else {
      const { error } = await supabase.from('social_media_deliveries').insert(payload as any);
      if (error) { toast.error('Erro ao registrar'); return; }
      toast.success('Entrega registrada');
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('social_media_deliveries').delete().eq('id', id);
    toast.success('Entrega removida');
    fetchData();
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClientObj = (id: string) => clients.find(c => c.id === id);
  const getTypeConfig = (type: string) => CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
  const getStatusConfig = (status: string) => STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  const getClientPlanGoals = (clientId: string) => {
    const planId = clientPlans[clientId];
    if (!planId) return null;
    return plans.find(p => p.id === planId) || null;
  };

  // Summary cards
  const totalThisMonth = useMemo(() => {
    const now = new Date();
    const start = format(startOfMonth(now), 'yyyy-MM-dd');
    const end = format(endOfMonth(now), 'yyyy-MM-dd');
    const thisMonth = deliveries.filter(d => d.delivered_at >= start && d.delivered_at <= end);
    return {
      total: thisMonth.length,
      reels: thisMonth.filter(d => d.content_type === 'reels').length,
      criativos: thisMonth.filter(d => d.content_type === 'criativo').length,
      stories: thisMonth.filter(d => d.content_type === 'story').length,
      artes: thisMonth.filter(d => d.content_type === 'arte').length,
      postados: thisMonth.filter(d => d.status === 'postado').length,
    };
  }, [deliveries]);

  // Clients with plans for progress tracking
  const clientsWithProgress = useMemo(() => {
    return clients
      .filter(c => clientPlans[c.id])
      .map(c => {
        const plan = getClientPlanGoals(c.id);
        const stats = monthlyStats[c.id] || { reels: 0, criativo: 0, story: 0, arte: 0 };
        return { client: c, plan, stats };
      })
      .filter(cp => cp.plan);
  }, [clients, clientPlans, monthlyStats, plans]);

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entregas Social Media</h1>
          <p className="text-sm text-muted-foreground">Gerencie conteúdos entregues e postados por cliente</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus size={16} /> Nova Entrega
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Mês', value: totalThisMonth.total, icon: TrendingUp, color: 'text-foreground' },
          { label: 'Reels', value: totalThisMonth.reels, icon: Film, color: 'text-blue-600' },
          { label: 'Criativos', value: totalThisMonth.criativos, icon: Megaphone, color: 'text-purple-600' },
          { label: 'Stories', value: totalThisMonth.stories, icon: Image, color: 'text-pink-600' },
          { label: 'Artes', value: totalThisMonth.artes, icon: Palette, color: 'text-amber-600' },
          { label: 'Postados', value: totalThisMonth.postados, icon: CheckCircle2, color: 'text-green-600' },
        ].map(card => (
          <Card key={card.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <card.icon size={14} className={card.color} />
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Client Progress vs Plan */}
      {clientsWithProgress.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Progresso Mensal por Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {clientsWithProgress.map(({ client, plan, stats }) => {
              if (!plan) return null;
              const items = [
                { label: 'Reels', delivered: stats.reels, goal: plan.reels_qty },
                { label: 'Criativos', delivered: stats.criativo, goal: plan.creatives_qty },
                { label: 'Stories', delivered: stats.story, goal: plan.stories_qty },
                { label: 'Artes', delivered: stats.arte, goal: plan.arts_qty },
              ].filter(i => i.goal > 0);

              if (items.length === 0) return null;

              return (
                <div key={client.id} className="space-y-2 border-b border-border pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <ClientLogo client={client} size="sm" />
                    <span className="font-medium text-sm text-foreground">{client.companyName}</span>
                    <Badge variant="outline" className="text-xs ml-auto">{plan.name}</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {items.map(item => {
                      const pct = Math.min(Math.round((item.delivered / item.goal) * 100), 100);
                      return (
                        <div key={item.label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-medium text-foreground">{item.delivered}/{item.goal}</span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {CONTENT_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Postagem</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Nenhuma entrega registrada ainda. Clique em "Nova Entrega" para começar.
                  </TableCell>
                </TableRow>
              ) : filtered.map(d => {
                const typeConf = getTypeConfig(d.content_type);
                const statusConf = getStatusConfig(d.status);
                const clientObj = getClientObj(d.client_id);
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {clientObj && <ClientLogo client={clientObj} size="sm" />}
                        <span className="text-sm font-medium">{getClientName(d.client_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${typeConf.color} border-0 gap-1`}>
                        <typeConf.icon size={12} />
                        {typeConf.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{d.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(d.delivered_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.posted_at ? new Date(d.posted_at + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{d.platform || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`${statusConf.color} border-0`}>{statusConf.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                          <Edit size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Entrega' : 'Nova Entrega'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={formClientId} onValueChange={setFormClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de conteúdo *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Título *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Reels lançamento produto X" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Detalhes da entrega..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de entrega</Label>
                <Input type="date" value={formDeliveredAt} onChange={e => setFormDeliveredAt(e.target.value)} />
              </div>
              <div>
                <Label>Data de postagem</Label>
                <Input type="date" value={formPostedAt} onChange={e => setFormPostedAt(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Plataforma</Label>
              <Select value={formPlatform} onValueChange={setFormPlatform}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? 'Salvar' : 'Registrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
