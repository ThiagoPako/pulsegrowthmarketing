import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
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
import { Plus, Film, Palette, Image, Megaphone, Trash2, Edit, CheckCircle2, Clock, TrendingUp, CalendarClock, CalendarCheck, Send, Zap, ArrowLeft, Eye, MessageSquare, AlertTriangle, ExternalLink, Link2, Scissors, Flame, Calendar as CalendarIcon } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DeadlineBadge from '@/components/DeadlineBadge';
import { sendWhatsAppMessage, getWhatsAppConfig } from '@/services/whatsappService';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isToday, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PostingCalendar from '@/components/social/PostingCalendar';
import OnboardingTracker from '@/components/social/OnboardingTracker';
import SocialMediaKanban from '@/components/social/SocialMediaKanban';
import CatStatusIndicator, { getCatStatus } from '@/components/social/CatStatusIndicator';
import CatClickWrapper from '@/components/social/CatClickEffect';

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
  { value: 'revisao', label: 'Revisão', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'ajuste', label: 'Alteração', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'aprovacao_cliente', label: 'Enviado p/ Cliente', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { value: 'entregue', label: 'Pronto p/ Agendar', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'agendado', label: 'Agendado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'postado', label: 'Acompanhamento', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
];

const PLATFORMS = ['Instagram', 'Facebook'];

function ReviewVideoLink({ contentTaskId, clientId }: { contentTaskId: string | null; clientId: string }) {
  const [isAltered, setIsAltered] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contentTaskId) { setLoading(false); return; }
    supabase.from('content_tasks').select('edited_video_link, drive_link, adjustment_notes').eq('id', contentTaskId).single()
      .then(({ data }) => {
        setHasVideo(!!(data?.edited_video_link || data?.drive_link));
        setIsAltered(!!data?.adjustment_notes);
        setLoading(false);
      });
  }, [contentTaskId]);

  if (loading) return null;

  return (
    <div className="space-y-1.5">
      {isAltered && (
        <div className="flex items-center gap-1.5">
          <Badge className="text-[10px] font-semibold px-2 py-0.5 border-0 bg-amber-500 text-white gap-1">
            🔄 Alterado
          </Badge>
        </div>
      )}
      {hasVideo && (
        <a href={`/portal/${clientId}`}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5 transition-colors hover:bg-primary/10">
          <Eye size={16} className="shrink-0" />
          <span className="truncate">🎬 Assistir no Portal do Cliente</span>
          <ExternalLink size={14} className="shrink-0 ml-auto" />
        </a>
      )}
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState('kanban');

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

  // Generic content batch (reels, criativo, arte)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchType, setBatchType] = useState<'reels' | 'criativo' | 'arte'>('reels');
  const [batchCount, setBatchCount] = useState(1);
  const [batchDate, setBatchDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Alteration dialog
  const [alterationDialogOpen, setAlterationDialogOpen] = useState(false);
  const [alterationNotes, setAlterationNotes] = useState('');
  const [alterationDelivery, setAlterationDelivery] = useState<SocialDelivery | null>(null);
  const [alterationImmediate, setAlterationImmediate] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [taskDeadlines, setTaskDeadlines] = useState<Record<string, { review_deadline: string | null; alteration_deadline: string | null; approval_deadline: string | null; immediate_alteration: boolean }>>({});
  const [onboardingStatus, setOnboardingStatus] = useState<Record<string, { total: number; completed: number }>>({});
  const [overdueByClient, setOverdueByClient] = useState<Record<string, { overdue: number; almostOverdue: number }>>({});
  const [mainTab, setMainTab] = useState<'clientes' | 'calendario'>('clientes');

  const fetchData = useCallback(async () => {
    const [dRes, pRes, cRes, tRes, oRes, ctRes] = await Promise.all([
      supabase.from('social_media_deliveries').select('*').order('delivered_at', { ascending: false }),
      supabase.from('plans').select('id, name, reels_qty, creatives_qty, stories_qty, arts_qty'),
      supabase.from('clients').select('id, plan_id'),
      supabase.from('content_tasks').select('id, review_deadline, alteration_deadline, approval_deadline, immediate_alteration'),
      supabase.from('onboarding_tasks').select('client_id, status'),
      supabase.from('content_tasks').select('id, client_id, review_deadline, alteration_deadline, approval_deadline, kanban_column').not('kanban_column', 'in', '(concluido,acompanhamento)'),
    ]);
    if (dRes.data) setDeliveries(dRes.data as SocialDelivery[]);
    if (pRes.data) setPlans(pRes.data as Plan[]);
    if (cRes.data) {
      const map: Record<string, string | null> = {};
      (cRes.data as any[]).forEach(c => { map[c.id] = c.plan_id; });
      setClientPlans(map);
    }
    if (tRes.data) {
      const dlMap: Record<string, any> = {};
      (tRes.data as any[]).forEach(t => { dlMap[t.id] = t; });
      setTaskDeadlines(dlMap);
    }
    if (oRes.data) {
      const oMap: Record<string, { total: number; completed: number }> = {};
      (oRes.data as any[]).forEach(o => {
        if (!oMap[o.client_id]) oMap[o.client_id] = { total: 0, completed: 0 };
        oMap[o.client_id].total++;
        if (o.status === 'concluido') oMap[o.client_id].completed++;
      });
      setOnboardingStatus(oMap);
    }
    // Calculate overdue/almost overdue per client
    if (ctRes.data) {
      const now = new Date();
      const almostThreshold = 4 * 60 * 60 * 1000; // 4 hours
      const odMap: Record<string, { overdue: number; almostOverdue: number }> = {};
      (ctRes.data as any[]).forEach(t => {
        if (!odMap[t.client_id]) odMap[t.client_id] = { overdue: 0, almostOverdue: 0 };
        const deadlines = [t.review_deadline, t.alteration_deadline, t.approval_deadline].filter(Boolean);
        for (const dl of deadlines) {
          const dlDate = new Date(dl);
          if (dlDate < now) {
            odMap[t.client_id].overdue++;
            break;
          } else if (dlDate.getTime() - now.getTime() < almostThreshold) {
            odMap[t.client_id].almostOverdue++;
            break;
          }
        }
      });
      setOverdueByClient(odMap);
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

  // Previous month deficit per client (how much is still owed from last month)
  const prevMonthDeficit = useMemo(() => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
    const prevEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
    const prevDeliveries = deliveries.filter(d => d.delivered_at >= prevStart && d.delivered_at <= prevEnd);
    const byClient: Record<string, { reels: number; criativo: number; story: number; arte: number }> = {};

    // Count what was delivered last month
    const delivered: Record<string, { reels: number; criativo: number; story: number; arte: number }> = {};
    prevDeliveries.forEach(d => {
      if (!delivered[d.client_id]) delivered[d.client_id] = { reels: 0, criativo: 0, story: 0, arte: 0 };
      if (d.content_type === 'reels') delivered[d.client_id].reels++;
      if (d.content_type === 'criativo') delivered[d.client_id].criativo++;
      if (d.content_type === 'story') delivered[d.client_id].story++;
      if (d.content_type === 'arte') delivered[d.client_id].arte++;
    });

    // Calculate deficit for each client (plan or weekly goals)
    clients.forEach(c => {
      const planId = clientPlans[c.id];
      const plan = planId ? plans.find(p => p.id === planId) : null;
      const del = delivered[c.id] || { reels: 0, criativo: 0, story: 0, arte: 0 };

      const reelsGoal = plan ? plan.reels_qty : (c.weeklyReels ? c.weeklyReels * 4 : 0);
      const creativosGoal = plan ? plan.creatives_qty : (c.weeklyCreatives ? c.weeklyCreatives * 4 : 0);
      const storyGoalMonthly = plan ? plan.stories_qty : (c.weeklyStories ? c.weeklyStories * 4 : 0);
      const artesGoal = plan ? plan.arts_qty : 0;

      if (!reelsGoal && !creativosGoal && !storyGoalMonthly && !artesGoal) return;

      const deficit = {
        reels: Math.max(0, reelsGoal - del.reels),
        criativo: Math.max(0, creativosGoal - del.criativo),
        story: Math.max(0, storyGoalMonthly - del.story),
        arte: Math.max(0, artesGoal - del.arte),
      };
      if (deficit.reels > 0 || deficit.criativo > 0 || deficit.story > 0 || deficit.arte > 0) {
        byClient[c.id] = deficit;
      }
    });
    return byClient;
  }, [deliveries, clients, clientPlans, plans]);

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
      platform: 'Instagram, Facebook', status: 'agendado',
    } as any).eq('id', schedulingItem.id);
    if (error) { toast.error('Erro ao agendar'); return; }
    // Move content_task to acompanhamento with full sync
    if (schedulingItem.content_task_id) {
      await supabase.from('content_tasks').update({
        kanban_column: 'acompanhamento',
        updated_at: new Date().toISOString(),
      } as any).eq('id', schedulingItem.content_task_id);
      const { data: taskData } = await supabase.from('content_tasks').select('*').eq('id', schedulingItem.content_task_id).single();
      if (taskData) {
        const client = clients.find(c => c.id === schedulingItem.client_id);
        const ctx = buildSyncContext(taskData as any, {
          userId: user?.id,
          clientName: client?.companyName,
          clientWhatsapp: client?.whatsapp,
        });
        await syncContentTaskColumnChange('acompanhamento', ctx);
      }
    }
    // Sync scheduled date with client portal contents
    if (schedulingItem.content_task_id) {
      const { data: portalContent } = await supabase.from('client_portal_contents')
        .select('id').eq('client_id', schedulingItem.client_id)
        .eq('title', schedulingItem.title).limit(1);
      if (portalContent && portalContent.length > 0) {
        await supabase.from('client_portal_contents').update({
          status: 'agendado',
          updated_at: new Date().toISOString(),
        } as any).eq('id', portalContent[0].id);
      }
    }
    // Notify client about scheduled posting via portal notification
    await supabase.from('client_portal_notifications').insert({
      client_id: schedulingItem.client_id,
      title: '📅 Conteúdo agendado para postagem',
      message: `Seu conteúdo "${schedulingItem.title}" foi agendado para ${schedDate.split('-').reverse().join('/')}${schedTime ? ` às ${schedTime}` : ''}.`,
      type: 'info',
    } as any);
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
      platform: 'Instagram, Facebook', status: formStatus, created_by: user?.id || null,
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
    const { deleteSocialDelivery } = await import('@/lib/contentDeleteSync');
    await deleteSocialDelivery(id);
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

  const handleRemoveLastStory = async (clientId: string) => {
    const { data } = await supabase.from('social_media_deliveries')
      .select('id')
      .eq('client_id', clientId)
      .eq('content_type', 'story')
      .order('created_at', { ascending: false })
      .limit(1);
    if (!data?.length) { toast.error('Nenhum story para remover'); return; }
    await supabase.from('social_media_deliveries').delete().eq('id', data[0].id);
    toast.success('Story removido'); fetchData();
  };

  const CONTENT_TYPE_LABELS: Record<string, string> = { reels: 'Reel', criativo: 'Criativo', arte: 'Arte', story: 'Story' };

  const handleSingleContent = async (clientId: string, contentType: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const label = CONTENT_TYPE_LABELS[contentType] || contentType;
    const { error } = await supabase.from('social_media_deliveries').insert({
      client_id: clientId, content_type: contentType,
      title: `${label} - ${format(new Date(), 'dd/MM', { locale: ptBR })}`,
      status: 'postado', delivered_at: today, posted_at: today,
      platform: 'Instagram', created_by: user?.id || null,
    } as any);
    if (error) { toast.error('Erro'); return; }
    toast.success(`${label} registrado`); fetchData();
  };

  const handleRemoveLastContent = async (clientId: string, contentType: string) => {
    const label = CONTENT_TYPE_LABELS[contentType] || contentType;
    const { data } = await supabase.from('social_media_deliveries')
      .select('id')
      .eq('client_id', clientId)
      .eq('content_type', contentType)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!data?.length) { toast.error(`Nenhum ${label} para remover`); return; }
    await supabase.from('social_media_deliveries').delete().eq('id', data[0].id);
    toast.success(`${label} removido`); fetchData();
  };

  const handleContentBatch = async (clientId: string) => {
    const label = CONTENT_TYPE_LABELS[batchType] || batchType;
    const rows = Array.from({ length: batchCount }, (_, i) => ({
      client_id: clientId,
      content_type: batchType,
      title: `${label} ${i + 1} - ${format(new Date(batchDate + 'T12:00:00'), 'dd/MM', { locale: ptBR })}`,
      status: 'postado',
      delivered_at: batchDate,
      posted_at: batchDate,
      platform: 'Instagram',
      created_by: user?.id || null,
    }));
    const { error } = await supabase.from('social_media_deliveries').insert(rows as any);
    if (error) { toast.error(`Erro ao registrar ${label}`); return; }
    const clientName = clients.find(c => c.id === clientId)?.companyName || '';
    toast.success(`${batchCount} ${label}(s) registrados para ${clientName}`);
    setBatchDialogOpen(false); fetchData();
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
      // Use shared sync for full cross-module synchronization
      const { data: taskData } = await supabase.from('content_tasks').select('*').eq('id', d.content_task_id).single();
      if (taskData) {
        const client = clients.find(c => c.id === d.client_id);
        const ctx = buildSyncContext(taskData as any, {
          userId: user?.id,
          clientName: client?.companyName,
          clientWhatsapp: client?.whatsapp,
        });
        await syncContentTaskColumnChange('envio', ctx);
      }
    }
    toast.success('Revisão aprovada! Pronto para enviar ao cliente.');
    fetchData();
  };

  const openAlterationDialog = (d: SocialDelivery) => {
    setAlterationDelivery(d);
    setAlterationNotes('');
    setAlterationImmediate(false);
    setAlterationDialogOpen(true);
  };

  const handleSendToAlteration = async () => {
    if (!alterationDelivery || !alterationNotes.trim()) {
      toast.error('Descreva o que precisa ser alterado');
      return;
    }
    const taskId = alterationDelivery.content_task_id;
    if (taskId) {
      await supabase.from('content_tasks').update({
        kanban_column: 'alteracao',
        adjustment_notes: alterationNotes.trim(),
        description: alterationNotes.trim(),
        immediate_alteration: alterationImmediate,
        updated_at: new Date().toISOString(),
      } as any).eq('id', taskId);

      await supabase.from('social_media_deliveries').update({ status: 'ajuste' } as any).eq('id', alterationDelivery.id);

      // Use shared sync for full cross-module synchronization
      const { data: taskData } = await supabase.from('content_tasks').select('*').eq('id', taskId).single();
      if (taskData) {
        const client = clients.find(c => c.id === alterationDelivery.client_id);
        const ctx = buildSyncContext({ ...taskData, immediate_alteration: alterationImmediate } as any, {
          userId: user?.id,
          clientName: client?.companyName,
          clientWhatsapp: client?.whatsapp,
        });
        await syncContentTaskColumnChange('alteracao', ctx);
      }
    }
    toast.success(alterationImmediate ? '🚨 Enviado para alteração IMEDIATA!' : 'Enviado para alteração');
    setAlterationDialogOpen(false);
    setAlterationDelivery(null);
    fetchData();
  };

  // ─── MARK AS PRIORITY EDITING ──────────────────────────────
  const handleMarkPriorityEditing = async (d: SocialDelivery) => {
    if (!d.content_task_id) {
      toast.error('Conteúdo sem tarefa vinculada');
      return;
    }
    await supabase.from('content_tasks').update({
      editing_priority: true,
      updated_at: new Date().toISOString(),
    } as any).eq('id', d.content_task_id);

    // Notify editors
    const clientName = clients.find(c => c.id === d.client_id)?.companyName || '';
    await supabase.rpc('notify_role', {
      _role: 'editor',
      _title: '⚡ Vídeo Prioritário',
      _message: `"${d.title}" (${clientName}) foi marcado como prioridade na fila de edição`,
      _type: 'priority',
      _link: '/edicao/kanban',
    });

    toast.success('⚡ Marcado como prioridade na fila de edição!');
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
      // Use shared sync
      const { data: taskData } = await supabase.from('content_tasks').select('*').eq('id', d.content_task_id).single();
      if (taskData) {
        const client = clients.find(c => c.id === d.client_id);
        const ctx = buildSyncContext(taskData as any, {
          userId: user?.id,
          clientName: client?.companyName,
          clientWhatsapp: client?.whatsapp,
        });
        await syncContentTaskColumnChange('agendamentos', ctx);
      }
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
        const od = overdueByClient[c.id] || { overdue: 0, almostOverdue: 0 };
        const onboarding = onboardingStatus[c.id];
        const isOnboarding = onboarding && onboarding.completed < onboarding.total;
        return { client: c, stats, plan, weeklyStories, overdue: od, isOnboarding: !!isOnboarding };
      })
      .sort((a, b) => {
        // 1st: overdue clients first
        if (a.overdue.overdue !== b.overdue.overdue) return b.overdue.overdue - a.overdue.overdue;
        // 2nd: almost overdue
        if (a.overdue.almostOverdue !== b.overdue.almostOverdue) return b.overdue.almostOverdue - a.overdue.almostOverdue;
        // 3rd: onboarding clients
        if (a.isOnboarding !== b.isOnboarding) return a.isOnboarding ? -1 : 1;
        // 4th: most pending
        return b.stats.pendentes - a.stats.pendentes || b.stats.total - a.stats.total;
      });
  }, [clients, deliveries, monthlyStats, clientPlans, plans, weeklyStoriesMap, overdueByClient, onboardingStatus]);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  // Deliveries for the selected client
  const clientDeliveries = useMemo(() => {
    if (!selectedClientId) return { review: [], alteration: [], approval: [], pending: [], scheduled: [], posted: [] };
    const cd = deliveries.filter(d => d.client_id === selectedClientId);
    return {
      review: cd.filter(d => d.status === 'revisao'),
      alteration: cd.filter(d => d.status === 'ajuste'),
      approval: cd.filter(d => d.status === 'aprovacao_cliente'),
      pending: cd.filter(d => d.status === 'entregue'),
      scheduled: cd.filter(d => d.status === 'agendado'),
      posted: cd.filter(d => d.status === 'postado'),
    };
  }, [selectedClientId, deliveries]);

  // Editing queue tasks for the selected client
  const [editingQueueTasks, setEditingQueueTasks] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedClientId) { setEditingQueueTasks([]); return; }
    supabase.from('content_tasks').select('*')
      .eq('client_id', selectedClientId)
      .eq('kanban_column', 'edicao')
      .order('editing_priority', { ascending: false })
      .order('position', { ascending: true })
      .then(({ data }) => { if (data) setEditingQueueTasks(data); });
  }, [selectedClientId, deliveries]);

  const handleTogglePriorityFromQueue = async (taskId: string, currentPriority: boolean) => {
    const newPriority = !currentPriority;
    await supabase.from('content_tasks').update({
      editing_priority: newPriority,
      updated_at: new Date().toISOString(),
    } as any).eq('id', taskId);
    if (newPriority) {
      const task = editingQueueTasks.find(t => t.id === taskId);
      const clientName = clients.find(c => c.id === task?.client_id)?.companyName || '';
      await supabase.rpc('notify_role', {
        _role: 'editor',
        _title: '⚡ Vídeo Prioritário',
        _message: `"${task?.title}" (${clientName}) foi marcado como prioridade na fila de edição`,
        _type: 'priority',
        _link: '/edicao/kanban',
      });
      toast.success('⚡ Marcado como prioridade!');
    } else {
      toast.success('Prioridade removida');
    }
    setEditingQueueTasks(prev => prev.map(t => t.id === taskId ? { ...t, editing_priority: newPriority } : t));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;

  // ─── CLIENT DETAIL VIEW ────────────────────────────────────
  if (selectedClientId && selectedClient) {
    const plan = getClientPlanGoals(selectedClientId);
    const stats = monthlyStats[selectedClientId] || { reels: 0, criativo: 0, story: 0, arte: 0, total: 0, pendentes: 0, agendados: 0, postados: 0, revisao: 0 };
    const weekStories = weeklyStoriesMap[selectedClientId] || 0;
    const storyGoal = selectedClient.weeklyStories || 0;

    // All data now rendered via Kanban component

    return (
      <CatClickWrapper>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setSelectedClientId(null); setActiveTab('kanban'); }}>
            <ArrowLeft size={18} />
          </Button>
          <ClientLogo client={selectedClient} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{selectedClient.companyName}</h1>
            <p className="text-sm text-muted-foreground">Gestão de entregas social media</p>
          </div>
          <motion.div
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.93 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Button
              className="gap-2.5 rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/70 hover:from-primary/90 hover:via-primary/80 hover:to-primary/60 shadow-lg hover:shadow-xl text-primary-foreground px-5 py-2.5 text-sm font-semibold transition-all duration-300"
              onClick={() => { setSelectedClientId(null); setMainTab('calendario'); }}
            >
              <motion.div
                animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
              >
                <CalendarIcon size={18} />
              </motion.div>
              <span>Calendário</span>
              <motion.div
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent"
                animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </Button>
          </motion.div>
        </div>

        {/* Onboarding Tracker */}
        {onboardingStatus[selectedClientId] && onboardingStatus[selectedClientId].completed < onboardingStatus[selectedClientId].total && (
          <OnboardingTracker client={selectedClient} />
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendentes', value: stats.pendentes + stats.revisao, icon: Clock, color: 'text-yellow-600' },
            { label: 'Agendados', value: stats.agendados, icon: CalendarClock, color: 'text-blue-600' },
            { label: 'Postados', value: stats.postados, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Total Mês', value: stats.total, icon: TrendingUp, color: 'text-foreground' },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.3, ease: 'easeOut' }}
              whileHover={{ scale: 1.03, y: -2 }}
            >
              <Card className="border-border hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <card.icon size={14} className={card.color} />
                    <span className="text-xs text-muted-foreground">{card.label}</span>
                  </div>
                  <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Plan progress */}
        {(() => {
          const reelsGoal = (plan ? plan.reels_qty : (selectedClient.weeklyReels ? selectedClient.weeklyReels * 4 : 0)) + (prevMonthDeficit[selectedClientId]?.reels || 0);
          const creativosGoal = (plan ? plan.creatives_qty : (selectedClient.weeklyCreatives ? selectedClient.weeklyCreatives * 4 : 0)) + (prevMonthDeficit[selectedClientId]?.criativo || 0);
          const storiesGoal = (plan ? plan.stories_qty : (storyGoal > 0 ? storyGoal * 4 : 0)) + (prevMonthDeficit[selectedClientId]?.story || 0);
          const artesGoal = (plan ? plan.arts_qty : 0) + (prevMonthDeficit[selectedClientId]?.arte || 0);
          const hasAnyGoal = reelsGoal > 0 || creativosGoal > 0 || storiesGoal > 0 || artesGoal > 0;
          if (!hasAnyGoal) return null;
          return (
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-foreground">Progresso Mensal</span>
                  <Badge variant="outline" className="text-xs">{plan?.name || 'Meta semanal'}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Reels', delivered: stats.reels, goal: reelsGoal },
                    { label: 'Criativos', delivered: stats.criativo, goal: creativosGoal },
                    { label: 'Stories', delivered: stats.story, goal: storiesGoal },
                    { label: 'Artes', delivered: stats.arte, goal: artesGoal },
                  ].filter(i => i.goal > 0 || i.delivered > 0).map(item => {
                    const isInfinite = item.goal === 0;
                    const pct = isInfinite ? 100 : Math.min(Math.round((item.delivered / item.goal) * 100), 100);
                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium text-foreground">{item.delivered}/{isInfinite ? '∞' : item.goal}</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                        {isInfinite && item.delivered > 0 && <span className="text-[9px] text-primary font-medium">Extra</span>}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Previous month deficit alert */}
        {prevMonthDeficit[selectedClientId] && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200/60 dark:border-orange-800/30 flex items-start gap-2"
          >
            <AlertTriangle size={16} className="text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Conteúdo pendente do mês anterior</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {prevMonthDeficit[selectedClientId].story > 0 && (
                  <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 border-0 text-[10px] gap-1">
                    <Image size={10} /> {prevMonthDeficit[selectedClientId].story} stories
                  </Badge>
                )}
                {prevMonthDeficit[selectedClientId].reels > 0 && (
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px] gap-1">
                    <Film size={10} /> {prevMonthDeficit[selectedClientId].reels} reels
                  </Badge>
                )}
                {prevMonthDeficit[selectedClientId].criativo > 0 && (
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0 text-[10px] gap-1">
                    <Megaphone size={10} /> {prevMonthDeficit[selectedClientId].criativo} criativos
                  </Badge>
                )}
                {prevMonthDeficit[selectedClientId].arte > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-[10px] gap-1">
                    <Palette size={10} /> {prevMonthDeficit[selectedClientId].arte} artes
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-orange-600 dark:text-orange-500 mt-1">A meta deste mês foi ajustada para compensar o déficit.</p>
            </div>
          </motion.div>
        )}

        {/* Manual Content Controls — always visible for all clients */}
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus size={14} className="text-primary" /> Registro Manual de Conteúdo
            </h3>
            <p className="text-[10px] text-muted-foreground -mt-1">
              Registre entregas e acompanhe a meta do contrato (inclui compensação de meses anteriores)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Stories Mensal */}
              {(() => {
                const baseGoal = plan ? plan.stories_qty : (storyGoal > 0 ? storyGoal * 4 : 0);
                const deficit = prevMonthDeficit[selectedClientId]?.story || 0;
                const goal = baseGoal + deficit;
                const delivered = stats.story;
                const pct = goal > 0 ? Math.min(Math.round((delivered / goal) * 100), 100) : 0;
                return (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Image size={14} className="text-pink-600 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">Stories Mensal</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold ${goal > 0 && delivered >= goal ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {delivered}/{goal > 0 ? goal : '∞'}
                        </span>
                        {deficit > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 text-orange-600 border-orange-300">+{deficit} anterior</Badge>}
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleRemoveLastStory(selectedClientId)}>
                        <Trash2 size={12} /> -1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => handleSingleStory(selectedClientId)}>
                        <Plus size={12} /> +1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => {
                        setStoriesCount(goal > 0 && goal - delivered > 0 ? goal - delivered : 5);
                        setStoriesDate(format(new Date(), 'yyyy-MM-dd'));
                        setStoriesDialogOpen(true);
                      }}>
                        <Zap size={12} /> Lote
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Reels Mensal */}
              {(() => {
                const baseGoal = plan ? plan.reels_qty : (selectedClient.weeklyReels ? selectedClient.weeklyReels * 4 : 0);
                const deficit = prevMonthDeficit[selectedClientId]?.reels || 0;
                const goal = baseGoal + deficit;
                const delivered = stats.reels;
                const pct = goal > 0 ? Math.min(Math.round((delivered / goal) * 100), 100) : 0;
                return (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Film size={14} className="text-blue-600 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">Reels Mensal</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold ${goal > 0 && delivered >= goal ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {delivered}/{goal > 0 ? goal : '∞'}
                        </span>
                        {deficit > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 text-orange-600 border-orange-300">+{deficit} anterior</Badge>}
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleRemoveLastContent(selectedClientId, 'reels')}>
                        <Trash2 size={12} /> -1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => handleSingleContent(selectedClientId, 'reels')}>
                        <Plus size={12} /> +1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => {
                        setBatchType('reels'); setBatchCount(goal > 0 && goal - delivered > 0 ? goal - delivered : 1);
                        setBatchDate(format(new Date(), 'yyyy-MM-dd')); setBatchDialogOpen(true);
                      }}>
                        <Zap size={12} /> Lote
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Criativos Mensal */}
              {(() => {
                const baseGoal = plan ? plan.creatives_qty : (selectedClient.weeklyCreatives ? selectedClient.weeklyCreatives * 4 : 0);
                const deficit = prevMonthDeficit[selectedClientId]?.criativo || 0;
                const goal = baseGoal + deficit;
                const delivered = stats.criativo;
                const pct = goal > 0 ? Math.min(Math.round((delivered / goal) * 100), 100) : 0;
                return (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Megaphone size={14} className="text-purple-600 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">Criativos Mensal</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold ${goal > 0 && delivered >= goal ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {delivered}/{goal > 0 ? goal : '∞'}
                        </span>
                        {deficit > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 text-orange-600 border-orange-300">+{deficit} anterior</Badge>}
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleRemoveLastContent(selectedClientId, 'criativo')}>
                        <Trash2 size={12} /> -1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => handleSingleContent(selectedClientId, 'criativo')}>
                        <Plus size={12} /> +1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => {
                        setBatchType('criativo'); setBatchCount(goal > 0 && goal - delivered > 0 ? goal - delivered : 1);
                        setBatchDate(format(new Date(), 'yyyy-MM-dd')); setBatchDialogOpen(true);
                      }}>
                        <Zap size={12} /> Lote
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Artes Mensal */}
              {(() => {
                const baseGoal = plan ? plan.arts_qty : 0;
                const deficit = prevMonthDeficit[selectedClientId]?.arte || 0;
                const goal = baseGoal + deficit;
                const delivered = stats.arte;
                const pct = goal > 0 ? Math.min(Math.round((delivered / goal) * 100), 100) : 0;
                return (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Palette size={14} className="text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">Artes Mensal</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold ${goal > 0 && delivered >= goal ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {delivered}/{goal > 0 ? goal : '∞'}
                        </span>
                        {deficit > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 text-orange-600 border-orange-300">+{deficit} anterior</Badge>}
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleRemoveLastContent(selectedClientId, 'arte')}>
                        <Trash2 size={12} /> -1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => handleSingleContent(selectedClientId, 'arte')}>
                        <Plus size={12} /> +1
                      </Button>
                      <Button size="sm" variant="outline" className="gap-0.5 h-7 px-2 text-[10px]" onClick={() => {
                        setBatchType('arte'); setBatchCount(goal > 0 && goal - delivered > 0 ? goal - delivered : 1);
                        setBatchDate(format(new Date(), 'yyyy-MM-dd')); setBatchDialogOpen(true);
                      }}>
                        <Zap size={12} /> Lote
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Kanban Board */}
        <SocialMediaKanban
          editingQueueTasks={editingQueueTasks}
          deliveries={clientDeliveries}
          taskDeadlines={taskDeadlines}
          onApproveReview={handleApproveReview}
          onOpenAlteration={openAlterationDialog}
          onMarkPriority={handleMarkPriorityEditing}
          onClientApproved={handleClientApproved}
          onSendWhatsApp={handleSendWhatsAppApproval}
          onOpenSchedule={openSchedule}
          onMarkPosted={handleMarkPosted}
          onTogglePriority={handleTogglePriorityFromQueue}
          sendingWhatsApp={sendingWhatsApp}
        />

        {/* Dialogs */}
        {renderScheduleDialog()}
        {renderEditDialog()}
        {renderStoriesDialog(selectedClientId)}
        {renderBatchContentDialog(selectedClientId)}
        {renderAlterationDialog()}
      </div>
      </CatClickWrapper>
    );
  }

  // ─── CLIENT CARDS VIEW (MAIN) ──────────────────────────────
  return (
    <CatClickWrapper>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entregas Social Media</h1>
          <p className="text-sm text-muted-foreground">Selecione um cliente para gerenciar suas entregas</p>
        </div>
        <motion.div
          whileHover={{ scale: 1.08, y: -2 }}
          whileTap={{ scale: 0.93 }}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
          className="relative"
        >
          <Button
            className="gap-2.5 rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/70 hover:from-primary/90 hover:via-primary/80 hover:to-primary/60 shadow-lg hover:shadow-xl text-primary-foreground px-6 py-2.5 text-sm font-semibold transition-all duration-300"
            onClick={() => setMainTab('calendario')}
          >
            <motion.div
              animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
            >
              <CalendarIcon size={18} />
            </motion.div>
            <span>Calendário</span>
            <motion.div
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent"
              animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </Button>
        </motion.div>
      </div>

      {/* Global summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Mês', value: totalThisMonth.total, icon: TrendingUp, color: 'text-foreground' },
          { label: 'Em Revisão', value: totalThisMonth.revisao, icon: Eye, color: 'text-orange-600' },
          { label: 'Pendentes', value: totalThisMonth.pendentes, icon: Clock, color: 'text-yellow-600' },
          { label: 'Agendados', value: totalThisMonth.agendados, icon: CalendarClock, color: 'text-blue-600' },
          { label: 'Postados', value: totalThisMonth.postados, icon: CheckCircle2, color: 'text-green-600' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35, ease: 'easeOut' }}
            whileHover={{ scale: 1.04, y: -3 }}
          >
            <Card className="border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <card.icon size={14} className={card.color} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main tabs: Clientes / Calendário */}
      <Tabs value={mainTab} onValueChange={v => setMainTab(v as any)}>
        <TabsList>
          <TabsTrigger value="clientes" className="gap-1.5">
            <Eye size={14} /> Clientes
          </TabsTrigger>
          <TabsTrigger value="calendario" className="gap-1.5">
            <CalendarIcon size={14} /> Calendário de Postagens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-4">
          {/* Client Cards Grid */}
          {clientsWithData.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum cliente com entregas ou plano cadastrado. Finalize gravações na agenda para que apareçam aqui.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clientsWithData.map(({ client, stats, plan, weeklyStories: ws, overdue, isOnboarding }) => {
                // Monthly plan goals
                const reelsGoal = plan ? plan.reels_qty : (client.weeklyReels ? client.weeklyReels * 4 : 0);
                const creativosGoal = plan ? plan.creatives_qty : (client.weeklyCreatives ? client.weeklyCreatives * 4 : 0);
                const storiesGoalMonthly = plan ? plan.stories_qty : (client.weeklyStories ? client.weeklyStories * 4 : 0);
                const artesGoal = plan ? plan.arts_qty : 0;
                const deficit = prevMonthDeficit[client.id] || { reels: 0, criativo: 0, story: 0, arte: 0 };
                const goalItems = [
                  { label: 'Reels', delivered: stats.reels, goal: reelsGoal + deficit.reels, icon: Film, color: 'text-blue-600' },
                  { label: 'Criativos', delivered: stats.criativo, goal: creativosGoal + deficit.criativo, icon: Megaphone, color: 'text-purple-600' },
                  { label: 'Stories', delivered: stats.story, goal: storiesGoalMonthly + deficit.story, icon: Image, color: 'text-pink-600' },
                  { label: 'Artes', delivered: stats.arte, goal: artesGoal + deficit.arte, icon: Palette, color: 'text-amber-600' },
                ].filter(i => i.goal > 0 || i.delivered > 0);
                const onboarding = onboardingStatus[client.id];
                const hasOverdue = overdue.overdue > 0;
                const hasAlmostOverdue = overdue.almostOverdue > 0;

                return (
                  <motion.div
                    key={client.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * clientsWithData.indexOf(clientsWithData.find(c => c.client.id === client.id)!), duration: 0.3 }}
                    whileHover={{ y: -4 }}
                  >
                  <Card
                    className={`border-border hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer group 
                      ${isOnboarding ? 'animate-[pulse_3s_ease-in-out_infinite] ring-2 ring-amber-400/50 shadow-amber-200/30 shadow-lg' : ''} 
                      ${hasOverdue ? 'ring-2 ring-red-500/60 border-red-400/50 shadow-red-200/30 shadow-lg animate-[pulse_2s_ease-in-out_infinite]' : ''} 
                      ${!hasOverdue && hasAlmostOverdue ? 'ring-1 ring-orange-400/50 border-orange-300/50' : ''}`}
                    onClick={() => { setSelectedClientId(client.id); setActiveTab('kanban'); }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <ClientLogo client={client} size="md" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {client.companyName}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {plan && <Badge variant="outline" className="text-[10px]">{plan.name}</Badge>}
                            {isOnboarding && (
                              <Badge className="bg-amber-500 text-white border-0 text-[9px] font-bold px-1.5 py-0 gap-0.5">
                                🚀 Onboarding {Math.round((onboarding!.completed / onboarding!.total) * 100)}%
                              </Badge>
                            )}
                            {hasOverdue && (
                              <Badge className="bg-red-500 text-white border-0 text-[9px] font-bold px-1.5 py-0 gap-0.5 animate-[pulse_1.5s_ease-in-out_infinite]">
                                🚨 {overdue.overdue} atrasada{overdue.overdue > 1 ? 's' : ''}
                              </Badge>
                            )}
                            {!hasOverdue && hasAlmostOverdue && (
                              <Badge className="bg-orange-500 text-white border-0 text-[9px] font-bold px-1.5 py-0 gap-0.5">
                                ⚠️ {overdue.almostOverdue} quase vencendo
                              </Badge>
                            )}
                          </div>
                        </div>
                        <CatStatusIndicator
                          status={getCatStatus({ hasOverdue, isOnboarding })}
                          size="sm"
                          showMessage={true}
                        />
                      </div>

                      {/* Overdue alert banner */}
                      {hasOverdue && (
                        <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30 flex items-center gap-2">
                          <AlertTriangle size={14} className="text-red-600 shrink-0" />
                          <span className="text-[10px] font-semibold text-red-700 dark:text-red-400">
                            {overdue.overdue} demanda{overdue.overdue > 1 ? 's' : ''} com prazo vencido!
                          </span>
                        </div>
                      )}

                      {/* Previous month deficit alert */}
                      {prevMonthDeficit[client.id] && (
                        <div className="mb-3 p-2 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-800/30 flex items-center gap-2">
                          <AlertTriangle size={14} className="text-orange-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-400">
                              Pendente do mês anterior:
                            </span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                              {prevMonthDeficit[client.id].story > 0 && <span className="text-[9px] text-orange-600">{prevMonthDeficit[client.id].story} stories</span>}
                              {prevMonthDeficit[client.id].reels > 0 && <span className="text-[9px] text-orange-600">{prevMonthDeficit[client.id].reels} reels</span>}
                              {prevMonthDeficit[client.id].criativo > 0 && <span className="text-[9px] text-orange-600">{prevMonthDeficit[client.id].criativo} criativos</span>}
                              {prevMonthDeficit[client.id].arte > 0 && <span className="text-[9px] text-orange-600">{prevMonthDeficit[client.id].arte} artes</span>}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Onboarding mini-progress */}
                      {isOnboarding && onboarding && (
                        <div className="mb-3 p-2 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">Onboarding</span>
                            <span className="text-[10px] font-semibold text-amber-600">{onboarding.completed}/{onboarding.total}</span>
                          </div>
                          <Progress value={Math.round((onboarding.completed / onboarding.total) * 100)} className="h-1.5" />
                        </div>
                      )}

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
                        {stats.total === 0 && !isOnboarding && <span className="text-xs text-muted-foreground">Sem entregas este mês</span>}
                      </div>

                      {/* Monthly plan progress */}
                      {goalItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border space-y-2">
                          <span className="text-[10px] font-semibold text-muted-foreground">Progresso do Pacote</span>
                          {goalItems.map(item => {
                            const isInfinite = item.goal === 0;
                            const pct = isInfinite ? 100 : Math.min(Math.round((item.delivered / item.goal) * 100), 100);
                            return (
                              <div key={item.label}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className={`text-[10px] flex items-center gap-1 ${item.color}`}><item.icon size={10} /> {item.label}</span>
                                  <span className={`text-[10px] font-semibold ${!isInfinite && item.delivered >= item.goal ? 'text-green-600' : 'text-muted-foreground'}`}>{item.delivered}/{isInfinite ? '∞' : item.goal}{isInfinite && item.delivered > 0 ? ' extra' : ''}</span>
                                </div>
                                <Progress value={pct} className="h-1.5" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendario" className="mt-4">
          <PostingCalendar deliveries={deliveries} clients={clients} />
        </TabsContent>
      </Tabs>
      {/* Dialogs also available from main view */}
      {renderScheduleDialog()}
      {renderEditDialog()}
      {renderStoriesDialog('')}
      {renderBatchContentDialog('')}
      {renderAlterationDialog()}
    </div>
    </CatClickWrapper>
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
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <Label className="text-xs text-muted-foreground">Plataformas</Label>
                <p className="text-sm font-medium mt-1">📸 Instagram + Facebook</p>
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
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <Label className="text-xs text-muted-foreground">Plataformas</Label>
              <p className="text-sm font-medium mt-1">📸 Instagram + Facebook</p>
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

  function renderBatchContentDialog(fallbackClientId: string) {
    const label = CONTENT_TYPE_LABELS[batchType] || batchType;
    const iconColors: Record<string, string> = { reels: 'text-blue-600', criativo: 'text-purple-600', arte: 'text-amber-600' };
    return (
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap size={18} className={iconColors[batchType] || 'text-primary'} /> Registrar {label} em Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantidade</Label><Input type="number" min={1} max={50} value={batchCount} onChange={e => setBatchCount(Number(e.target.value))} /></div>
              <div><Label>Data</Label><Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Serão criados {batchCount} registros de {label} como "Postado".</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => handleContentBatch(selectedClientId || fallbackClientId)} className="gap-1.5"><Zap size={14} /> Registrar {batchCount} {label}(s)</Button>
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
              <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <input
                  type="checkbox"
                  checked={alterationImmediate}
                  onChange={e => setAlterationImmediate(e.target.checked)}
                  className="h-4 w-4 rounded border-destructive/40 text-destructive focus:ring-destructive"
                  id="sm-immediate-check"
                />
                <label htmlFor="sm-immediate-check" className="text-sm cursor-pointer">
                  <span className="font-semibold text-destructive">🚨 Alteração Imediata</span>
                  <span className="text-xs text-muted-foreground block">O editor será notificado para corrigir com prioridade máxima</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {alterationImmediate 
                  ? 'O editor receberá um alerta urgente para fazer a correção imediatamente.'
                  : 'O editor terá 1 dia útil para realizar a alteração.'}
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
