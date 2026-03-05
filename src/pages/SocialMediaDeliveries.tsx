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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Film, Palette, Image, Megaphone, Trash2, Edit, CheckCircle2, Clock, TrendingUp, CalendarClock, CalendarCheck, Send, Zap } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isToday, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SocialDelivery {
  id: string;
  client_id: string;
  content_type: string;
  title: string;
  description: string | null;
  delivered_at: string;
  posted_at: string | null;
  scheduled_time: string | null;
  platform: string | null;
  status: string;
  script_id: string | null;
  recording_id: string | null;
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
  { value: 'agendado', label: 'Agendado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
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
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<SocialDelivery | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [activeTab, setActiveTab] = useState('pendentes');

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formType, setFormType] = useState('reels');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDeliveredAt, setFormDeliveredAt] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formPostedAt, setFormPostedAt] = useState('');
  const [formScheduledTime, setFormScheduledTime] = useState('');
  const [formPlatform, setFormPlatform] = useState('');
  const [formStatus, setFormStatus] = useState('entregue');

  // Schedule form
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedPlatform, setSchedPlatform] = useState('');

  // Stories batch
  const [storiesDialogOpen, setStoriesDialogOpen] = useState(false);
  const [storiesClientId, setStoriesClientId] = useState('');
  const [storiesCount, setStoriesCount] = useState(5);
  const [storiesDate, setStoriesDate] = useState(format(new Date(), 'yyyy-MM-dd'));

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

  // Auto-mark scheduled items as "postado" when date/time has passed
  useEffect(() => {
    const checkScheduled = async () => {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const nowTime = format(now, 'HH:mm');

      const toPost = deliveries.filter(d => {
        if (d.status !== 'agendado' || !d.posted_at) return false;
        if (d.posted_at < todayStr) return true;
        if (d.posted_at === todayStr && d.scheduled_time && d.scheduled_time <= nowTime) return true;
        return false;
      });

      if (toPost.length > 0) {
        const ids = toPost.map(d => d.id);
        await supabase.from('social_media_deliveries').update({ status: 'postado' } as any).in('id', ids);
        setDeliveries(prev => prev.map(d => ids.includes(d.id) ? { ...d, status: 'postado' } : d));
        toast.success(`${toPost.length} conteúdo(s) marcado(s) como postado automaticamente`);
      }
    };

    checkScheduled();
    const interval = setInterval(checkScheduled, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [deliveries]);

  // Categorize deliveries
  const pendingItems = useMemo(() => deliveries.filter(d => d.status === 'entregue' || d.status === 'revisao'), [deliveries]);
  const scheduledItems = useMemo(() => deliveries.filter(d => d.status === 'agendado'), [deliveries]);
  const postedItems = useMemo(() => deliveries.filter(d => d.status === 'postado'), [deliveries]);

  const filtered = useMemo(() => {
    let items: SocialDelivery[] = [];
    if (activeTab === 'pendentes') items = pendingItems;
    else if (activeTab === 'agendados') items = scheduledItems;
    else items = postedItems;

    return items.filter(d => {
      if (filterClient !== 'all' && d.client_id !== filterClient) return false;
      if (filterType !== 'all' && d.content_type !== filterType) return false;
      return true;
    });
  }, [activeTab, pendingItems, scheduledItems, postedItems, filterClient, filterType]);

  // Monthly stats
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
    setFormClientId(''); setFormType('reels'); setFormTitle(''); setFormDescription('');
    setFormDeliveredAt(format(new Date(), 'yyyy-MM-dd')); setFormPostedAt('');
    setFormScheduledTime(''); setFormPlatform(''); setFormStatus('entregue'); setEditingId(null);
  };

  const openNew = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (d: SocialDelivery) => {
    setEditingId(d.id); setFormClientId(d.client_id); setFormType(d.content_type);
    setFormTitle(d.title); setFormDescription(d.description || '');
    setFormDeliveredAt(d.delivered_at); setFormPostedAt(d.posted_at || '');
    setFormScheduledTime(d.scheduled_time || ''); setFormPlatform(d.platform || '');
    setFormStatus(d.status); setDialogOpen(true);
  };

  const openSchedule = (d: SocialDelivery) => {
    setSchedulingItem(d);
    setSchedDate(d.posted_at || '');
    setSchedTime(d.scheduled_time || '');
    setSchedPlatform(d.platform || '');
    setScheduleDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!schedulingItem || !schedDate) { toast.error('Selecione a data de postagem'); return; }
    const { error } = await supabase.from('social_media_deliveries').update({
      posted_at: schedDate,
      scheduled_time: schedTime || null,
      platform: schedPlatform || null,
      status: 'agendado',
    } as any).eq('id', schedulingItem.id);
    if (error) { toast.error('Erro ao agendar'); return; }
    toast.success('Conteúdo agendado para postagem');
    setScheduleDialogOpen(false);
    setSchedulingItem(null);
    fetchData();
  };

  const handleMarkPosted = async (id: string) => {
    const { error } = await supabase.from('social_media_deliveries').update({
      status: 'postado',
      posted_at: format(new Date(), 'yyyy-MM-dd'),
    } as any).eq('id', id);
    if (error) { toast.error('Erro'); return; }
    toast.success('Marcado como postado');
    fetchData();
  };

  const handleSave = async () => {
    if (!formClientId || !formTitle) { toast.error('Preencha cliente e título'); return; }
    const payload = {
      client_id: formClientId, content_type: formType, title: formTitle,
      description: formDescription || null, delivered_at: formDeliveredAt,
      posted_at: formPostedAt || null, scheduled_time: formScheduledTime || null,
      platform: formPlatform || null, status: formStatus, created_by: user?.id || null,
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
    setDialogOpen(false); resetForm(); fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('social_media_deliveries').delete().eq('id', id);
    toast.success('Entrega removida'); fetchData();
  };

  // Stories batch handlers
  const handleStoriesBatch = async () => {
    if (!storiesClientId) { toast.error('Selecione o cliente'); return; }
    const rows = Array.from({ length: storiesCount }, (_, i) => ({
      client_id: storiesClientId,
      content_type: 'story',
      title: `Story ${i + 1} - ${format(new Date(storiesDate + 'T12:00:00'), 'dd/MM', { locale: ptBR })}`,
      status: 'postado',
      delivered_at: storiesDate,
      posted_at: storiesDate,
      platform: 'Instagram',
      created_by: user?.id || null,
    }));
    const { error } = await supabase.from('social_media_deliveries').insert(rows as any);
    if (error) { toast.error('Erro ao registrar stories'); return; }
    toast.success(`${storiesCount} stories registrados para ${getClientName(storiesClientId)}`);
    setStoriesDialogOpen(false);
    fetchData();
  };

  const handleSingleStory = async (clientId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { error } = await supabase.from('social_media_deliveries').insert({
      client_id: clientId,
      content_type: 'story',
      title: `Story - ${format(new Date(), 'dd/MM', { locale: ptBR })}`,
      status: 'postado',
      delivered_at: today,
      posted_at: today,
      platform: 'Instagram',
      created_by: user?.id || null,
    } as any);
    if (error) { toast.error('Erro'); return; }
    toast.success('Story registrado');
    fetchData();
  };

  // Weekly stories tracking per client
  const weeklyStoriesData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(weekEnd, 'yyyy-MM-dd');

    return clients
      .filter(c => c.weeklyStories > 0)
      .map(c => {
        const thisWeekStories = deliveries.filter(d =>
          d.client_id === c.id && d.content_type === 'story' &&
          d.delivered_at >= startStr && d.delivered_at <= endStr
        );
        return { client: c, delivered: thisWeekStories.length, goal: c.weeklyStories };
      });
  }, [clients, deliveries]);

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClientObj = (id: string) => clients.find(c => c.id === id);
  const getTypeConfig = (type: string) => CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
  const getStatusConfig = (status: string) => STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  const getClientPlanGoals = (clientId: string) => {
    const planId = clientPlans[clientId];
    if (!planId) return null;
    return plans.find(p => p.id === planId) || null;
  };

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
      agendados: thisMonth.filter(d => d.status === 'agendado').length,
    };
  }, [deliveries]);

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
          <p className="text-sm text-muted-foreground">Gerencie conteúdos gravados, agende postagens e acompanhe entregas</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus size={16} /> Nova Entrega
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total Mês', value: totalThisMonth.total, icon: TrendingUp, color: 'text-foreground' },
          { label: 'Reels', value: totalThisMonth.reels, icon: Film, color: 'text-blue-600' },
          { label: 'Criativos', value: totalThisMonth.criativos, icon: Megaphone, color: 'text-purple-600' },
          { label: 'Stories', value: totalThisMonth.stories, icon: Image, color: 'text-pink-600' },
          { label: 'Artes', value: totalThisMonth.artes, icon: Palette, color: 'text-amber-600' },
          { label: 'Agendados', value: totalThisMonth.agendados, icon: CalendarClock, color: 'text-blue-600' },
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

      {/* Stories Semanal */}
      {weeklyStoriesData.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Image size={16} className="text-pink-600" /> Stories Semanal
              </CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => { setStoriesClientId(weeklyStoriesData[0]?.client.id || ''); setStoriesCount(5); setStoriesDate(format(new Date(), 'yyyy-MM-dd')); setStoriesDialogOpen(true); }}>
                <Zap size={14} /> Registrar Stories em Lote
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {weeklyStoriesData.map(({ client, delivered, goal }) => {
              const pct = Math.min(Math.round((delivered / goal) * 100), 100);
              const isComplete = delivered >= goal;
              return (
                <div key={client.id} className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/20">
                  <ClientLogo client={client} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-foreground">{client.companyName}</span>
                      <span className={`text-xs font-semibold ${isComplete ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {delivered}/{goal} stories
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                  <Button size="sm" variant={isComplete ? 'outline' : 'default'} className="gap-1 h-8 shrink-0" onClick={() => handleSingleStory(client.id)}>
                    <Plus size={14} /> +1 Story
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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

      {/* Tabs: Pendentes | Agendados | Postados */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <TabsList>
            <TabsTrigger value="pendentes" className="gap-1.5">
              <Clock size={14} /> Pendentes ({pendingItems.length})
            </TabsTrigger>
            <TabsTrigger value="agendados" className="gap-1.5">
              <CalendarClock size={14} /> Agendados ({scheduledItems.length})
            </TabsTrigger>
            <TabsTrigger value="postados" className="gap-1.5">
              <CheckCircle2 size={14} /> Postados ({postedItems.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-44 h-9 text-xs">
                <SelectValue placeholder="Todos os clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {CONTENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pendentes Tab */}
        <TabsContent value="pendentes" className="mt-4">
          {filtered.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum conteúdo pendente. Os vídeos gravados pelo videomaker aparecerão aqui automaticamente.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map(d => {
                const typeConf = getTypeConfig(d.content_type);
                const clientObj = getClientObj(d.client_id);
                return (
                  <Card key={d.id} className="border-border hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {clientObj && <ClientLogo client={clientObj} size="sm" />}
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{d.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{getClientName(d.client_id)}</span>
                              <Badge className={`${typeConf.color} border-0 gap-1 text-[10px] px-1.5 py-0`}>
                                <typeConf.icon size={10} /> {typeConf.label}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                Gravado em {new Date(d.delivered_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="default" className="gap-1.5 h-8" onClick={() => openSchedule(d)}>
                            <CalendarClock size={14} /> Agendar Postagem
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => handleMarkPosted(d.id)}>
                            <CheckCircle2 size={14} /> Postar Agora
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                            <Edit size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Agendados Tab */}
        <TabsContent value="agendados" className="mt-4">
          {filtered.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum conteúdo agendado. Agende postagens na aba "Pendentes".
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map(d => {
                const typeConf = getTypeConfig(d.content_type);
                const clientObj = getClientObj(d.client_id);
                const isOverdue = d.posted_at && isPast(parseISO(d.posted_at)) && !isToday(parseISO(d.posted_at));
                return (
                  <Card key={d.id} className={`border-border ${isOverdue ? 'border-destructive/50 bg-destructive/5' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {clientObj && <ClientLogo client={clientObj} size="sm" />}
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{d.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{getClientName(d.client_id)}</span>
                              <Badge className={`${typeConf.color} border-0 gap-1 text-[10px] px-1.5 py-0`}>
                                <typeConf.icon size={10} /> {typeConf.label}
                              </Badge>
                              {d.platform && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{d.platform}</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${isOverdue ? 'text-destructive' : 'text-foreground'}`}>
                              {d.posted_at ? new Date(d.posted_at + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                            </p>
                            {d.scheduled_time && <p className="text-xs text-muted-foreground">{d.scheduled_time}</p>}
                            {isOverdue && <p className="text-[10px] text-destructive font-medium">Atrasado</p>}
                          </div>
                          <Button size="sm" variant="default" className="gap-1 h-8" onClick={() => handleMarkPosted(d.id)}>
                            <Send size={14} /> Marcar Postado
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSchedule(d)}>
                            <Edit size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Postados Tab */}
        <TabsContent value="postados" className="mt-4">
          <Card className="border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Gravado</TableHead>
                    <TableHead>Postado</TableHead>
                    <TableHead>Plataforma</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        Nenhum conteúdo postado ainda.
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(d => {
                    const typeConf = getTypeConfig(d.content_type);
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
                            <typeConf.icon size={12} /> {typeConf.label}
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
        </TabsContent>
      </Tabs>

      {/* Schedule Dialog - Quick & Easy */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock size={18} className="text-primary" />
              Agendar Postagem
            </DialogTitle>
          </DialogHeader>
          {schedulingItem && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="font-medium text-sm">{schedulingItem.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{getClientName(schedulingItem.client_id)}</p>
              </div>
              <div>
                <Label>Data da postagem *</Label>
                <Input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} />
              </div>
              <div>
                <Label>Horário (opcional)</Label>
                <Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} />
              </div>
              <div>
                <Label>Plataforma</Label>
                <Select value={schedPlatform} onValueChange={setSchedPlatform}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSchedule} className="gap-1.5">
              <CalendarCheck size={14} /> Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Edit Dialog */}
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
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de conteúdo *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data de entrega</Label>
                <Input type="date" value={formDeliveredAt} onChange={e => setFormDeliveredAt(e.target.value)} />
              </div>
              <div>
                <Label>Data de postagem</Label>
                <Input type="date" value={formPostedAt} onChange={e => setFormPostedAt(e.target.value)} />
              </div>
              <div>
                <Label>Horário</Label>
                <Input type="time" value={formScheduledTime} onChange={e => setFormScheduledTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Plataforma</Label>
              <Select value={formPlatform} onValueChange={setFormPlatform}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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

      {/* Stories Batch Dialog */}
      <Dialog open={storiesDialogOpen} onOpenChange={setStoriesDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap size={18} className="text-pink-600" />
              Registrar Stories em Lote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={storiesClientId} onValueChange={setStoriesClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade</Label>
                <Input type="number" min={1} max={20} value={storiesCount} onChange={e => setStoriesCount(Number(e.target.value))} />
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={storiesDate} onChange={e => setStoriesDate(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Serão criados {storiesCount} registros de story como "Postado" na data selecionada.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoriesDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleStoriesBatch} className="gap-1.5">
              <Zap size={14} /> Registrar {storiesCount} Stories
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
