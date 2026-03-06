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
import { Plus, Film, Palette, Image, Megaphone, Trash2, Edit, CheckCircle2, Clock, TrendingUp, CalendarClock, CalendarCheck, Send, Zap, ArrowLeft, Eye, MessageSquare, AlertTriangle, ExternalLink } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { sendWhatsAppMessage, getWhatsAppConfig } from '@/services/whatsappService';
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
  content_task_id: string | null;
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
  { value: 'revisao', label: 'Em revisão', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'aprovacao_cliente', label: 'Aprovação Cliente', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { value: 'entregue', label: 'Entregue', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'agendado', label: 'Agendado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'postado', label: 'Postado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
];

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'LinkedIn'];

export default function SocialMediaDeliveries() {
  const { clients } = useApp();
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<SocialDelivery[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clientPlans, setClientPlans] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<SocialDelivery | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('revisao');

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
  const [storiesCount, setStoriesCount] = useState(5);
  const [storiesDate, setStoriesDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Alteration dialog
  const [alterationDialogOpen, setAlterationDialogOpen] = useState(false);
  const [alterationNotes, setAlterationNotes] = useState('');
  const [alterationDelivery, setAlterationDelivery] = useState<SocialDelivery | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

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
    const interval = setInterval(checkScheduled, 60000);
    return () => clearInterval(interval);
  }, [deliveries]);

  // Monthly stats per client
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const start = format(startOfMonth(now), 'yyyy-MM-dd');
    const end = format(endOfMonth(now), 'yyyy-MM-dd');
    const thisMonth = deliveries.filter(d => d.delivered_at >= start && d.delivered_at <= end);
    const byClient: Record<string, { reels: number; criativo: number; story: number; arte: number; total: number; pendentes: number; agendados: number; postados: number; revisao: number }> = {};
    thisMonth.forEach(d => {
      if (!byClient[d.client_id]) byClient[d.client_id] = { reels: 0, criativo: 0, story: 0, arte: 0, total: 0, pendentes: 0, agendados: 0, postados: 0, revisao: 0 };
      byClient[d.client_id].total++;
      if (d.content_type === 'reels') byClient[d.client_id].reels++;
      if (d.content_type === 'criativo') byClient[d.client_id].criativo++;
      if (d.content_type === 'story') byClient[d.client_id].story++;
      if (d.content_type === 'arte') byClient[d.client_id].arte++;
      if (d.status === 'revisao') byClient[d.client_id].revisao++;
      if (d.status === 'entregue') byClient[d.client_id].pendentes++;
      if (d.status === 'agendado') byClient[d.client_id].agendados++;
      if (d.status === 'postado') byClient[d.client_id].postados++;
    });
    return byClient;
  }, [deliveries]);

  // Weekly stories per client
  const weeklyStoriesMap = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(weekEnd, 'yyyy-MM-dd');
    const map: Record<string, number> = {};
    deliveries.filter(d => d.content_type === 'story' && d.delivered_at >= startStr && d.delivered_at <= endStr)
      .forEach(d => { map[d.client_id] = (map[d.client_id] || 0) + 1; });
    return map;
  }, [deliveries]);

  const resetForm = () => {
    setFormClientId(''); setFormType('reels'); setFormTitle(''); setFormDescription('');
    setFormDeliveredAt(format(new Date(), 'yyyy-MM-dd')); setFormPostedAt('');
    setFormScheduledTime(''); setFormPlatform(''); setFormStatus('entregue'); setEditingId(null);
  };

  const openNew = (clientId?: string) => {
    resetForm();
    if (clientId) setFormClientId(clientId);
    setDialogOpen(true);
  };

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
      posted_at: schedDate, scheduled_time: schedTime || null,
      platform: schedPlatform || null, status: 'agendado',
    } as any).eq('id', schedulingItem.id);
    if (error) { toast.error('Erro ao agendar'); return; }
    toast.success('Conteúdo agendado para postagem');
    setScheduleDialogOpen(false); setSchedulingItem(null); fetchData();
  };

  const handleMarkPosted = async (id: string) => {
    const { error } = await supabase.from('social_media_deliveries').update({
      status: 'postado', posted_at: format(new Date(), 'yyyy-MM-dd'),
    } as any).eq('id', id);
    if (error) { toast.error('Erro'); return; }
    toast.success('Marcado como postado'); fetchData();
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

  const handleStoriesBatch = async (clientId: string) => {
    const rows = Array.from({ length: storiesCount }, (_, i) => ({
      client_id: clientId,
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
    const clientName = clients.find(c => c.id === clientId)?.companyName || '';
    toast.success(`${storiesCount} stories registrados para ${clientName}`);
    setStoriesDialogOpen(false); fetchData();
  };

  const handleSingleStory = async (clientId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { error } = await supabase.from('social_media_deliveries').insert({
      client_id: clientId, content_type: 'story',
      title: `Story - ${format(new Date(), 'dd/MM', { locale: ptBR })}`,
      status: 'postado', delivered_at: today, posted_at: today,
      platform: 'Instagram', created_by: user?.id || null,
    } as any);
    if (error) { toast.error('Erro'); return; }
    toast.success('Story registrado'); fetchData();
  };

  const getTypeConfig = (type: string) => CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];

  const getClientPlanGoals = (clientId: string) => {
    const planId = clientPlans[clientId];
    if (!planId) return null;
    return plans.find(p => p.id === planId) || null;
  };

  // ─── REVIEW/APPROVAL HANDLERS ─────────────────────────────
  const handleApproveReview = async (d: SocialDelivery) => {
    await supabase.from('social_media_deliveries').update({ status: 'aprovacao_cliente' } as any).eq('id', d.id);
    if (d.content_task_id) {
      await supabase.from('content_tasks').update({ kanban_column: 'envio', updated_at: new Date().toISOString() } as any).eq('id', d.content_task_id);
    }
    toast.success('Revisão aprovada! Pronto para enviar ao cliente.');
    fetchData();
  };

  const openAlterationDialog = (d: SocialDelivery) => {
    setAlterationDelivery(d);
    setAlterationNotes('');
    setAlterationDialogOpen(true);
  };

  const handleSendToAlteration = async () => {
    if (!alterationDelivery || !alterationNotes.trim()) {
      toast.error('Descreva o que precisa ser alterado');
      return;
    }
    const taskId = alterationDelivery.content_task_id;
    if (taskId) {
      const { data: taskData } = await supabase.from('content_tasks').select('assigned_to').eq('id', taskId).single();
      const editorId = taskData?.assigned_to;

      await supabase.from('content_tasks').update({
        kanban_column: 'alteracao',
        adjustment_notes: alterationNotes.trim(),
        description: alterationNotes.trim(),
        updated_at: new Date().toISOString(),
      } as any).eq('id', taskId);

      await supabase.from('social_media_deliveries').update({ status: 'revisao' } as any).eq('id', alterationDelivery.id);

      if (editorId) {
        const clientName = clients.find(c => c.id === alterationDelivery.client_id)?.companyName || '';
        await supabase.rpc('notify_user', {
          _user_id: editorId,
          _title: 'Alteração de Vídeo',
          _message: `${alterationDelivery.title} (${clientName}) precisa de alteração: ${alterationNotes.trim().substring(0, 100)}`,
          _type: 'alteration',
          _link: '/edicao/kanban',
        });
      }
    }
    toast.success('Enviado para alteração');
    setAlterationDialogOpen(false);
    setAlterationDelivery(null);
    fetchData();
  };

  const handleSendWhatsAppApproval = async (d: SocialDelivery) => {
    setSendingWhatsApp(true);
    try {
      const client = clients.find(c => c.id === d.client_id);
      if (!client?.whatsapp) { toast.error('Cliente sem WhatsApp cadastrado'); return; }

      let videoLink = '';
      if (d.content_task_id) {
        const { data: taskData } = await supabase.from('content_tasks').select('edited_video_link, drive_link').eq('id', d.content_task_id).single();
        videoLink = taskData?.edited_video_link || taskData?.drive_link || '';
      }

      const message = `Olá, ${client.responsiblePerson || client.companyName}! 😊\n\nSeu conteúdo "${d.title}" ficou pronto! 🎬\n\n${videoLink ? `📎 Acesse aqui: ${videoLink}\n\n` : ''}Por favor, avalie e nos diga se está aprovado ou se precisa de algum ajuste.\n\nEquipe Pulse Growth Marketing 🚀`;

      const result = await sendWhatsAppMessage({
        number: client.whatsapp,
        message,
        clientId: d.client_id,
        triggerType: 'manual',
      });

      if (result.success) {
        await supabase.from('social_media_deliveries').update({ status: 'aprovacao_cliente' } as any).eq('id', d.id);
        toast.success('Mensagem enviada ao cliente!');
        fetchData();
      } else {
        toast.error(result.error || 'Erro ao enviar mensagem');
      }
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleClientApproved = async (d: SocialDelivery) => {
    await supabase.from('social_media_deliveries').update({ status: 'entregue' } as any).eq('id', d.id);
    if (d.content_task_id) {
      await supabase.from('content_tasks').update({
        kanban_column: 'agendamentos',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq('id', d.content_task_id);
    }
    toast.success('Aprovado pelo cliente! Pronto para agendamento.');
    fetchData();
  };

  // Global summary
  const totalThisMonth = useMemo(() => {
    const now = new Date();
    const start = format(startOfMonth(now), 'yyyy-MM-dd');
    const end = format(endOfMonth(now), 'yyyy-MM-dd');
    const thisMonth = deliveries.filter(d => d.delivered_at >= start && d.delivered_at <= end);
    return {
      total: thisMonth.length,
      revisao: thisMonth.filter(d => d.status === 'revisao' || d.status === 'aprovacao_cliente').length,
      pendentes: thisMonth.filter(d => d.status === 'entregue').length,
      agendados: thisMonth.filter(d => d.status === 'agendado').length,
      postados: thisMonth.filter(d => d.status === 'postado').length,
    };
  }, [deliveries]);

  // All clients
  const clientsWithData = useMemo(() => {
    return clients
      .map(c => {
        const stats = monthlyStats[c.id] || { reels: 0, criativo: 0, story: 0, arte: 0, total: 0, pendentes: 0, agendados: 0, postados: 0, revisao: 0 };
        const plan = getClientPlanGoals(c.id);
        const weeklyStories = weeklyStoriesMap[c.id] || 0;
        return { client: c, stats, plan, weeklyStories };
      })
      .sort((a, b) => b.stats.pendentes - a.stats.pendentes || b.stats.total - a.stats.total);
  }, [clients, deliveries, monthlyStats, clientPlans, plans, weeklyStoriesMap]);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  // Deliveries for the selected client
  const clientDeliveries = useMemo(() => {
    if (!selectedClientId) return { review: [], approval: [], pending: [], scheduled: [], posted: [] };
    const cd = deliveries.filter(d => d.client_id === selectedClientId);
    return {
      review: cd.filter(d => d.status === 'revisao'),
      approval: cd.filter(d => d.status === 'aprovacao_cliente'),
      pending: cd.filter(d => d.status === 'entregue'),
      scheduled: cd.filter(d => d.status === 'agendado'),
      posted: cd.filter(d => d.status === 'postado'),
    };
  }, [selectedClientId, deliveries]);

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;

  // ─── CLIENT DETAIL VIEW ────────────────────────────────────
  if (selectedClientId && selectedClient) {
    const plan = getClientPlanGoals(selectedClientId);
    const stats = monthlyStats[selectedClientId] || { reels: 0, criativo: 0, story: 0, arte: 0, total: 0, pendentes: 0, agendados: 0, postados: 0, revisao: 0 };
    const weekStories = weeklyStoriesMap[selectedClientId] || 0;
    const storyGoal = selectedClient.weeklyStories || 0;

    const currentFiltered = activeTab === 'revisao' ? clientDeliveries.review
      : activeTab === 'aprovacao' ? clientDeliveries.approval
      : activeTab === 'pendentes' ? clientDeliveries.pending
      : activeTab === 'agendados' ? clientDeliveries.scheduled
      : clientDeliveries.posted;

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setSelectedClientId(null); setActiveTab('revisao'); }}>
            <ArrowLeft size={18} />
          </Button>
          <ClientLogo client={selectedClient} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{selectedClient.companyName}</h1>
            <p className="text-sm text-muted-foreground">Gestão de entregas social media</p>
          </div>
          <Button onClick={() => openNew(selectedClientId)} className="gap-2">
            <Plus size={16} /> Nova Entrega
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendentes', value: stats.pendentes, icon: Clock, color: 'text-yellow-600' },
            { label: 'Agendados', value: stats.agendados, icon: CalendarClock, color: 'text-blue-600' },
            { label: 'Postados', value: stats.postados, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Total Mês', value: stats.total, icon: TrendingUp, color: 'text-foreground' },
          ].map(card => (
            <Card key={card.label} className="border-border">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <card.icon size={14} className={card.color} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Plan progress */}
        {plan && (
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">Progresso Mensal</span>
                <Badge variant="outline" className="text-xs">{plan.name}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Reels', delivered: stats.reels, goal: plan.reels_qty },
                  { label: 'Criativos', delivered: stats.criativo, goal: plan.creatives_qty },
                  { label: 'Stories', delivered: stats.story, goal: plan.stories_qty },
                  { label: 'Artes', delivered: stats.arte, goal: plan.arts_qty },
                ].filter(i => i.goal > 0).map(item => {
                  const pct = Math.min(Math.round((item.delivered / item.goal) * 100), 100);
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-foreground">{item.delivered}/{item.goal}</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly Stories */}
        {storyGoal > 0 && (
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Image size={16} className="text-pink-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-foreground">Stories Semanal</span>
                      <span className={`text-xs font-semibold ${weekStories >= storyGoal ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {weekStories}/{storyGoal}
                      </span>
                    </div>
                    <Progress value={Math.min(Math.round((weekStories / storyGoal) * 100), 100)} className="h-2" />
                  </div>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => handleSingleStory(selectedClientId)}>
                    <Plus size={14} /> +1
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => {
                    setStoriesCount(storyGoal - weekStories > 0 ? storyGoal - weekStories : 5);
                    setStoriesDate(format(new Date(), 'yyyy-MM-dd'));
                    setStoriesDialogOpen(true);
                  }}>
                    <Zap size={14} /> Lote
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="revisao" className="gap-1.5">
              <Eye size={14} /> Revisão ({clientDeliveries.review.length})
            </TabsTrigger>
            <TabsTrigger value="aprovacao" className="gap-1.5">
              <MessageSquare size={14} /> Aprovação ({clientDeliveries.approval.length})
            </TabsTrigger>
            <TabsTrigger value="pendentes" className="gap-1.5">
              <Clock size={14} /> Prontos ({clientDeliveries.pending.length})
            </TabsTrigger>
            <TabsTrigger value="agendados" className="gap-1.5">
              <CalendarClock size={14} /> Agendados ({clientDeliveries.scheduled.length})
            </TabsTrigger>
            <TabsTrigger value="postados" className="gap-1.5">
              <CheckCircle2 size={14} /> Postados ({clientDeliveries.posted.length})
            </TabsTrigger>
          </TabsList>

          {/* Revisão */}
          <TabsContent value="revisao" className="mt-4">
            {clientDeliveries.review.length === 0 ? (
              <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground">
                Nenhum vídeo para revisão.
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">
                {clientDeliveries.review.map(d => {
                  const typeConf = getTypeConfig(d.content_type);
                  return (
                    <Card key={d.id} className="border-border border-l-4 border-l-orange-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-foreground truncate">{d.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`${typeConf.color} border-0 gap-1 text-[10px] px-1.5 py-0`}>
                                <typeConf.icon size={10} /> {typeConf.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                                👁 Em Revisão
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="default" className="gap-1.5 h-8" onClick={() => handleApproveReview(d)}>
                              <CheckCircle2 size={14} /> Aprovar
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/20" onClick={() => openAlterationDialog(d)}>
                              <AlertTriangle size={14} /> Alteração
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

          {/* Aprovação Cliente */}
          <TabsContent value="aprovacao" className="mt-4">
            {clientDeliveries.approval.length === 0 ? (
              <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground">
                Nenhum conteúdo aguardando aprovação do cliente.
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">
                {clientDeliveries.approval.map(d => {
                  const typeConf = getTypeConfig(d.content_type);
                  return (
                    <Card key={d.id} className="border-border border-l-4 border-l-cyan-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-foreground truncate">{d.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`${typeConf.color} border-0 gap-1 text-[10px] px-1.5 py-0`}>
                                <typeConf.icon size={10} /> {typeConf.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800">
                                ⏳ Aguardando Cliente
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="default" className="gap-1.5 h-8 bg-green-600 hover:bg-green-700" onClick={() => handleClientApproved(d)}>
                              <CheckCircle2 size={14} /> Aprovado pelo Cliente
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => handleSendWhatsAppApproval(d)} disabled={sendingWhatsApp}>
                              <MessageSquare size={14} /> {sendingWhatsApp ? 'Enviando...' : 'Enviar WhatsApp'}
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/20" onClick={() => openAlterationDialog(d)}>
                              <AlertTriangle size={14} /> Alteração
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

          {/* Pendentes */}
          <TabsContent value="pendentes" className="mt-4">
            {currentFiltered.length === 0 ? (
              <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground">
                Nenhum conteúdo pendente para este cliente.
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">
                {currentFiltered.map(d => {
                  const typeConf = getTypeConfig(d.content_type);
                  return (
                    <Card key={d.id} className="border-border hover:border-primary/30 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-foreground truncate">{d.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`${typeConf.color} border-0 gap-1 text-[10px] px-1.5 py-0`}>
                                <typeConf.icon size={10} /> {typeConf.label}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                Gravado em {new Date(d.delivered_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="default" className="gap-1.5 h-8" onClick={() => openSchedule(d)}>
                              <CalendarClock size={14} /> Agendar
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => handleMarkPosted(d.id)}>
                              <CheckCircle2 size={14} /> Postar
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Edit size={14} /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}><Trash2 size={14} /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Agendados */}
          <TabsContent value="agendados" className="mt-4">
            {currentFiltered.length === 0 ? (
              <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground">
                Nenhum conteúdo agendado.
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">
                {currentFiltered.map(d => {
                  const typeConf = getTypeConfig(d.content_type);
                  const isOverdue = d.posted_at && isPast(parseISO(d.posted_at)) && !isToday(parseISO(d.posted_at));
                  return (
                    <Card key={d.id} className={`border-border ${isOverdue ? 'border-destructive/50 bg-destructive/5' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-foreground truncate">{d.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`${typeConf.color} border-0 gap-1 text-[10px] px-1.5 py-0`}>
                                <typeConf.icon size={10} /> {typeConf.label}
                              </Badge>
                              {d.platform && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{d.platform}</Badge>}
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
                              <Send size={14} /> Postado
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSchedule(d)}><Edit size={14} /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}><Trash2 size={14} /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Postados */}
          <TabsContent value="postados" className="mt-4">
            <Card className="border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Gravado</TableHead>
                      <TableHead>Postado</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentFiltered.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhum conteúdo postado ainda.</TableCell></TableRow>
                    ) : currentFiltered.map(d => {
                      const typeConf = getTypeConfig(d.content_type);
                      return (
                        <TableRow key={d.id}>
                          <TableCell><Badge className={`${typeConf.color} border-0 gap-1`}><typeConf.icon size={12} /> {typeConf.label}</Badge></TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{d.title}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(d.delivered_at + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.posted_at ? new Date(d.posted_at + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</TableCell>
                          <TableCell className="text-sm">{d.platform || '—'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Edit size={14} /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}><Trash2 size={14} /></Button>
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

        {/* Dialogs */}
        {renderScheduleDialog()}
        {renderEditDialog()}
        {renderStoriesDialog(selectedClientId)}
        {renderAlterationDialog()}
      </div>
    );
  }

  // ─── CLIENT CARDS VIEW (MAIN) ──────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entregas Social Media</h1>
          <p className="text-sm text-muted-foreground">Selecione um cliente para gerenciar suas entregas</p>
        </div>
        <Button onClick={() => openNew()} className="gap-2">
          <Plus size={16} /> Nova Entrega
        </Button>
      </div>

      {/* Global summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Mês', value: totalThisMonth.total, icon: TrendingUp, color: 'text-foreground' },
          { label: 'Em Revisão', value: totalThisMonth.revisao, icon: Eye, color: 'text-orange-600' },
          { label: 'Pendentes', value: totalThisMonth.pendentes, icon: Clock, color: 'text-yellow-600' },
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

      {/* Client Cards Grid */}
      {clientsWithData.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum cliente com entregas ou plano cadastrado. Finalize gravações na agenda para que apareçam aqui.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientsWithData.map(({ client, stats, plan, weeklyStories: ws }) => {
            const storyGoal = client.weeklyStories || 0;
            const storyPct = storyGoal > 0 ? Math.min(Math.round((ws / storyGoal) * 100), 100) : 0;

            return (
              <Card
                key={client.id}
                className="border-border hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => { setSelectedClientId(client.id); setActiveTab('revisao'); }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <ClientLogo client={client} size="md" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {client.companyName}
                      </h3>
                      {plan && <Badge variant="outline" className="text-[10px] mt-0.5">{plan.name}</Badge>}
                    </div>
                    <Eye size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  </div>

                  {/* Content counters */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {stats.revisao > 0 && (
                      <div className="text-center p-2 rounded-md bg-orange-50 dark:bg-orange-900/10">
                        <p className="text-lg font-bold text-orange-600">{stats.revisao}</p>
                        <p className="text-[10px] text-muted-foreground">Revisão</p>
                      </div>
                    )}
                    <div className="text-center p-2 rounded-md bg-yellow-50 dark:bg-yellow-900/10">
                      <p className="text-lg font-bold text-yellow-600">{stats.pendentes}</p>
                      <p className="text-[10px] text-muted-foreground">Pendentes</p>
                    </div>
                    <div className="text-center p-2 rounded-md bg-blue-50 dark:bg-blue-900/10">
                      <p className="text-lg font-bold text-blue-600">{stats.agendados}</p>
                      <p className="text-[10px] text-muted-foreground">Agendados</p>
                    </div>
                    <div className="text-center p-2 rounded-md bg-green-50 dark:bg-green-900/10">
                      <p className="text-lg font-bold text-green-600">{stats.postados}</p>
                      <p className="text-[10px] text-muted-foreground">Postados</p>
                    </div>
                  </div>

                  {/* Content type breakdown */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {stats.reels > 0 && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px] gap-1"><Film size={10} />{stats.reels}</Badge>}
                    {stats.criativo > 0 && <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0 text-[10px] gap-1"><Megaphone size={10} />{stats.criativo}</Badge>}
                    {stats.story > 0 && <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 border-0 text-[10px] gap-1"><Image size={10} />{stats.story}</Badge>}
                    {stats.arte > 0 && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-[10px] gap-1"><Palette size={10} />{stats.arte}</Badge>}
                    {stats.total === 0 && <span className="text-xs text-muted-foreground">Sem entregas este mês</span>}
                  </div>

                  {/* Weekly stories progress */}
                  {storyGoal > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Image size={10} className="text-pink-600" /> Stories/semana</span>
                        <span className={`text-[10px] font-semibold ${ws >= storyGoal ? 'text-green-600' : 'text-muted-foreground'}`}>{ws}/{storyGoal}</span>
                      </div>
                      <Progress value={storyPct} className="h-1.5" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs also available from main view */}
      {renderScheduleDialog()}
      {renderEditDialog()}
      {renderStoriesDialog('')}
      {renderAlterationDialog()}
    </div>
  );

  // ─── SHARED DIALOG RENDERERS ───────────────────────────────
  function renderScheduleDialog() {
    return (
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock size={18} className="text-primary" /> Agendar Postagem
            </DialogTitle>
          </DialogHeader>
          {schedulingItem && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="font-medium text-sm">{schedulingItem.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{clients.find(c => c.id === schedulingItem.client_id)?.companyName}</p>
              </div>
              <div><Label>Data da postagem *</Label><Input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} /></div>
              <div><Label>Horário (opcional)</Label><Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} /></div>
              <div>
                <Label>Plataforma</Label>
                <Select value={schedPlatform} onValueChange={setSchedPlatform}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSchedule} className="gap-1.5"><CalendarCheck size={14} /> Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderEditDialog() {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Entrega' : 'Nova Entrega'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={formClientId} onValueChange={setFormClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de conteúdo *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Título *</Label><Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Reels lançamento produto X" /></div>
            <div><Label>Descrição</Label><Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Detalhes da entrega..." rows={2} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Data de entrega</Label><Input type="date" value={formDeliveredAt} onChange={e => setFormDeliveredAt(e.target.value)} /></div>
              <div><Label>Data de postagem</Label><Input type="date" value={formPostedAt} onChange={e => setFormPostedAt(e.target.value)} /></div>
              <div><Label>Horário</Label><Input type="time" value={formScheduledTime} onChange={e => setFormScheduledTime(e.target.value)} /></div>
            </div>
            <div>
              <Label>Plataforma</Label>
              <Select value={formPlatform} onValueChange={setFormPlatform}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? 'Salvar' : 'Registrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderStoriesDialog(fallbackClientId: string) {
    return (
      <Dialog open={storiesDialogOpen} onOpenChange={setStoriesDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap size={18} className="text-pink-600" /> Registrar Stories em Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantidade</Label><Input type="number" min={1} max={20} value={storiesCount} onChange={e => setStoriesCount(Number(e.target.value))} /></div>
              <div><Label>Data</Label><Input type="date" value={storiesDate} onChange={e => setStoriesDate(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Serão criados {storiesCount} registros de story como "Postado".</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoriesDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => handleStoriesBatch(selectedClientId || fallbackClientId)} className="gap-1.5"><Zap size={14} /> Registrar {storiesCount} Stories</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderAlterationDialog() {
    return (
      <Dialog open={alterationDialogOpen} onOpenChange={setAlterationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-600" /> Enviar para Alteração
            </DialogTitle>
          </DialogHeader>
          {alterationDelivery && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="font-medium text-sm">{alterationDelivery.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {clients.find(c => c.id === alterationDelivery.client_id)?.companyName}
                </p>
              </div>
              <div>
                <Label>O que precisa ser alterado? *</Label>
                <Textarea
                  value={alterationNotes}
                  onChange={e => setAlterationNotes(e.target.value)}
                  placeholder="Descreva detalhadamente o que precisa ser corrigido ou ajustado no vídeo..."
                  rows={4}
                  className="mt-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                O editor responsável receberá uma notificação com essas instruções.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlterationDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSendToAlteration}
              disabled={!alterationNotes.trim()}
              className="gap-1.5 bg-orange-600 hover:bg-orange-700"
            >
              <Send size={14} /> Enviar para Alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
