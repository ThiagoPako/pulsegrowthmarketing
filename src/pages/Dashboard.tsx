import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { DAY_LABELS } from '@/types';
import { getSeasonalAlerts, NICHE_OPTIONS } from '@/lib/seasonalDates';
import { motion } from 'framer-motion';
import {
  Video, Plus, XCircle, RefreshCw, TrendingUp, Calendar, Check,
  ChevronLeft, ChevronRight, Clock, Users as UsersIcon, MessageSquare, Trophy, BarChart3,
  Clapperboard, Film, Megaphone, AlertTriangle
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, addDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import UserAvatar from '@/components/UserAvatar';
import AgencyCapacityWidget from '@/components/AgencyCapacityWidget';
import BirthdayCountdown from '@/components/BirthdayCountdown';
import ClientLogo from '@/components/ClientLogo';
import { getMessageStats } from '@/services/whatsappService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';

interface LiveEditorTask {
  id: string;
  title: string;
  client_id: string;
  assigned_to: string | null;
  kanban_column: string;
  editing_started_at: string | null;
  content_type: string;
}

const SCORE_WEIGHTS = { reel: 10, criativo: 5, story: 3, arte: 2, extra: 8 };
const BAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function Dashboard() {
  const { currentUser, recordings, clients, users, tasks, cancelRecording, updateRecording, getSuggestionsForCancellation, activeRecordings, settings } = useApp();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [weekOffset, setWeekOffset] = useState(0);
  const [waStats, setWaStats] = useState({ total: 0, sent: 0, failed: 0 });
  const [deliveryRecords, setDeliveryRecords] = useState<any[]>([]);
  const [liveEditorTasks, setLiveEditorTasks] = useState<LiveEditorTask[]>([]);
  const [endoMetrics, setEndoMetrics] = useState({ totalClients: 0, revenue: 0, costs: 0, profit: 0, margin: 0, topClients: [] as { name: string; profit: number }[] });
  const [contractAlerts, setContractAlerts] = useState<{ clientName: string; daysLeft: number; endDate: string }[]>([]);

  useEffect(() => { getMessageStats().then(setWaStats); }, []);
  useEffect(() => {
    supabase.from('delivery_records').select('*').then(({ data }) => { if (data) setDeliveryRecords(data); });
  }, []);

  // Fetch contract expiration alerts (60 and 30 days)
  useEffect(() => {
    const fetchContractAlerts = async () => {
      const { data } = await supabase.from('clients').select('company_name, contract_start_date, contract_duration_months').not('contract_start_date', 'is', null);
      if (!data) return;
      const now = new Date();
      const alerts: { clientName: string; daysLeft: number; endDate: string }[] = [];
      for (const c of data) {
        if (!c.contract_start_date || !(c as any).contract_duration_months) continue;
        const start = new Date(c.contract_start_date);
        const endDate = new Date(start);
        endDate.setMonth(endDate.getMonth() + (c as any).contract_duration_months);
        const diffMs = endDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (daysLeft <= 60 && daysLeft > 0) {
          alerts.push({ clientName: c.company_name, daysLeft, endDate: format(endDate, 'dd/MM/yyyy') });
        }
      }
      setContractAlerts(alerts.sort((a, b) => a.daysLeft - b.daysLeft));
    };
    fetchContractAlerts();
  }, []);

  // Fetch editor tasks in active editing
  useEffect(() => {
    const fetchLiveTasks = async () => {
      const { data } = await supabase
        .from('content_tasks')
        .select('id, title, client_id, assigned_to, kanban_column, editing_started_at, content_type')
        .not('editing_started_at', 'is', null)
        .in('kanban_column', ['em_edicao', 'revisao', 'alteracao']);
      if (data) setLiveEditorTasks(data);
    };
    fetchLiveTasks();

    const channel = supabase
      .channel('live-editor-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => fetchLiveTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch endomarketing metrics
  useEffect(() => {
    const fetchEndo = async () => {
      const { data: contracts } = await (supabase as any)
        .from('client_endomarketing_contracts')
        .select('*, clients(company_name)')
        .eq('status', 'ativo');
      if (contracts && contracts.length > 0) {
        const revenue = contracts.reduce((s: number, c: any) => s + Number(c.sale_price), 0);
        const costs = contracts.reduce((s: number, c: any) => s + Number(c.partner_cost), 0);
        const profit = revenue - costs;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        const topClients = contracts
          .map((c: any) => ({ name: c.clients?.company_name || 'Cliente', profit: Number(c.sale_price) - Number(c.partner_cost) }))
          .sort((a: any, b: any) => b.profit - a.profit)
          .slice(0, 5);
        setEndoMetrics({ totalClients: contracts.length, revenue, costs, profit, margin, topClients });
      }
    };
    fetchEndo();
  }, []);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const currentWeekStr = format(weekStart, 'yyyy-MM-dd');

  // ── Stats ──
  const stats = useMemo(() => {
    const todayRecs = recordings.filter(r => r.date === today);
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const weekRecs = recordings.filter(r => { const d = parseISO(r.date); return isWithinInterval(d, { start: weekStart, end: weekEnd }); });
    const monthRecs = recordings.filter(r => { const d = parseISO(r.date); return isWithinInterval(d, { start: monthStart, end: monthEnd }); });

    return {
      todayDone: todayRecs.filter(r => r.status === 'concluida').length,
      todayExtras: todayRecs.filter(r => r.type === 'extra' && r.status !== 'cancelada').length,
      todayCancelled: todayRecs.filter(r => r.status === 'cancelada').length,
      todaySecondary: todayRecs.filter(r => r.type === 'secundaria' && r.status !== 'cancelada').length,
      todayScheduled: todayRecs.filter(r => r.status === 'agendada').length,
      weekDone: weekRecs.filter(r => r.status === 'concluida').length,
      weekScheduled: weekRecs.filter(r => r.status === 'agendada').length,
      monthDone: monthRecs.filter(r => r.status === 'concluida').length,
      totalClients: clients.length,
    };
  }, [recordings, today, weekStart, weekEnd, clients]);

  // ── Today recordings ──
  const todayRecordings = useMemo(() => {
    let recs = recordings.filter(r => r.date === today && r.status !== 'cancelada');
    if (currentUser?.role === 'videomaker') recs = recs.filter(r => r.videomakerId === currentUser.id);
    return recs.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [recordings, today, currentUser]);

  // ── Videomaker progress ──
  const videomakers = users.filter(u => u.role === 'videomaker');
  const videomakerStats = useMemo(() => {
    return videomakers.map(vm => {
      const weekRecs = recordings.filter(r => r.videomakerId === vm.id && isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd }));
      const done = weekRecs.filter(r => r.status === 'concluida').length;
      const total = weekRecs.length;
      const todayRecs = weekRecs.filter(r => r.date === today);
      const todayDone = todayRecs.filter(r => r.status === 'concluida').length;
      const todayTotal = todayRecs.filter(r => r.status !== 'cancelada').length;
      return { vm, weekDone: done, weekTotal: total, todayDone, todayTotal };
    });
  }, [videomakers, recordings, weekStart, weekEnd, today]);

  // ── Videomaker scoring ──
  const vmScoring = useMemo(() => {
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    return videomakers.map(vm => {
      const vmRecs = deliveryRecords.filter((r: any) =>
        r.videomaker_id === vm.id && r.date >= monthStart && r.date <= monthEnd &&
        (r.delivery_status === 'realizada' || r.delivery_status === 'encaixe' || r.delivery_status === 'extra')
      );
      const score = vmRecs.reduce((a: number, r: any) =>
        a + r.reels_produced * SCORE_WEIGHTS.reel + r.creatives_produced * SCORE_WEIGHTS.criativo +
        r.stories_produced * SCORE_WEIGHTS.story + r.arts_produced * SCORE_WEIGHTS.arte +
        r.extras_produced * SCORE_WEIGHTS.extra, 0);
      const reels = vmRecs.reduce((a: number, r: any) => a + r.reels_produced, 0);
      return { name: vm.name.split(' ')[0], score, reels, vm };
    }).sort((a, b) => b.score - a.score);
  }, [videomakers, deliveryRecords]);

  // ── Client progress ──
  const clientProgress = useMemo(() => {
    return clients.map(client => {
      const weekTasks = tasks.filter(t => t.clientId === client.id && t.weekStart === currentWeekStr);
      const done = weekTasks.filter(t => t.column === 'finalizado').length;
      const goal = client.weeklyGoal || 10;
      const weekRecs = recordings.filter(r => r.clientId === client.id && isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd }));
      const recsDone = weekRecs.filter(r => r.status === 'concluida').length;
      const recsTotal = weekRecs.filter(r => r.status !== 'cancelada').length;
      return { client, tasksDone: done, tasksTotal: weekTasks.length, goal, recsDone, recsTotal, progress: Math.min(100, Math.round((done / goal) * 100)) };
    });
  }, [clients, tasks, recordings, currentWeekStr, weekStart, weekEnd]);

  // ── Week agenda ──
  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return recordings.filter(r => r.date === dateStr && r.status !== 'cancelada').sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || '—';
  const getClientColor = (id: string) => getClient(id)?.color || '220 10% 50%';
  const getVideomakerName = (id: string) => users.find(u => u.id === id)?.name || '—';

  const typeLabels: Record<string, string> = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.' };
  const statusIcons: Record<string, React.ReactNode> = {
    agendada: <Clock size={12} className="text-info" />,
    concluida: <Check size={12} className="text-success" />,
  };

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">
            {currentUser?.role === 'videomaker' ? `Olá, ${currentUser.name} 👋` : 'Painel de Controle'}
          </h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
      </div>

      {/* ── ROW 1: Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Gravados Hoje', value: stats.todayDone, icon: Video, color: 'bg-success/15 text-success' },
          { label: 'Agendados Hoje', value: stats.todayScheduled, icon: Clock, color: 'bg-info/15 text-info' },
          { label: 'Extras', value: stats.todayExtras, icon: Plus, color: 'bg-warning/15 text-warning' },
          { label: 'Cancelados', value: stats.todayCancelled, icon: XCircle, color: 'bg-destructive/15 text-destructive' },
          { label: 'Semana', value: stats.weekDone, icon: TrendingUp, color: 'bg-primary/15 text-primary' },
          { label: 'Clientes', value: stats.totalClients, icon: UsersIcon, color: 'bg-info/15 text-info' },
          { label: 'WhatsApp', value: waStats.sent, icon: MessageSquare, color: 'bg-success/15 text-success' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="stat-card">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <p className="text-xl font-display font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── CONTRACT EXPIRATION ALERTS ── */}
      {contractAlerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 border-warning/30 bg-warning/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-warning" />
            <h3 className="font-display font-semibold text-sm">Contratos Próximos do Vencimento</h3>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-warning/50 text-warning">{contractAlerts.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {contractAlerts.map((alert, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${alert.daysLeft <= 30 ? 'bg-destructive/10 border-destructive/30' : 'bg-warning/10 border-warning/30'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{alert.clientName}</p>
                  <p className="text-xs text-muted-foreground">Vence em {alert.endDate}</p>
                </div>
                <Badge variant={alert.daysLeft <= 30 ? 'destructive' : 'outline'} className="text-xs shrink-0 ml-2">
                  {alert.daysLeft}d
                </Badge>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── LIVE ACTIVITY: Videomakers Gravando + Editores Editando ── */}
      {(activeRecordings.length > 0 || liveEditorTasks.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <h3 className="font-display font-semibold text-sm">Atividade em Tempo Real</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Videomakers Recording */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Clapperboard size={14} className="text-red-500" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gravando Agora</p>
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5 ml-1">{activeRecordings.length}</Badge>
              </div>
              {activeRecordings.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">Nenhum videomaker gravando</p>
              ) : (
                <div className="space-y-2">
                  {activeRecordings.map(ar => {
                    const vm = users.find(u => u.id === ar.videomarkerId);
                    const client = clients.find(c => c.id === ar.clientId);
                    const elapsed = ar.startedAt ? formatDistanceToNow(parseISO(ar.startedAt), { locale: ptBR, addSuffix: false }) : '';
                    return (
                      <div key={ar.recordingId} className="flex items-center gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                        <div className="relative">
                          {vm && <UserAvatar user={vm} size="sm" />}
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-background animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{vm?.name || '—'}</p>
                          <div className="flex items-center gap-1.5">
                            {client && <ClientLogo client={client} size="sm" className="w-4 h-4" />}
                            <p className="text-xs text-muted-foreground truncate">{client?.companyName || '—'}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> REC
                          </Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">há {elapsed}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Editors Editing */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Film size={14} className="text-blue-500" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Editando Agora</p>
                <Badge className="text-[10px] h-4 px-1.5 ml-1 bg-blue-500">{liveEditorTasks.length}</Badge>
              </div>
              {liveEditorTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">Nenhum editor em atividade</p>
              ) : (
                <div className="space-y-2">
                  {liveEditorTasks.map(task => {
                    const editor = users.find(u => u.id === task.assigned_to);
                    const client = clients.find(c => c.id === task.client_id);
                    const elapsed = task.editing_started_at ? formatDistanceToNow(parseISO(task.editing_started_at), { locale: ptBR, addSuffix: false }) : '';
                    const columnLabels: Record<string, string> = { em_edicao: 'Editando', revisao: 'Em Revisão', alteracao: 'Alteração' };
                    return (
                      <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
                        <div className="relative">
                          {editor && <UserAvatar user={editor} size="sm" />}
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-background animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{editor?.name || 'Sem editor'}</p>
                          <div className="flex items-center gap-1.5">
                            {client && <ClientLogo client={client} size="sm" className="w-4 h-4" />}
                            <p className="text-xs text-muted-foreground truncate">{task.title || client?.companyName || '—'}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge className="text-[10px] bg-blue-500 gap-1">
                            {columnLabels[task.kanban_column] || task.kanban_column}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">há {elapsed}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── SEASONAL DATES ALERTS ── */}
      {(() => {
        const allAlerts: { clientName: string; clientColor: string; label: string; date: Date; daysUntil: number; urgency: 'high' | 'medium' | 'low' }[] = [];
        clients.forEach(c => {
          if (!c.niche || c.niche === 'outro') return;
          const alerts = getSeasonalAlerts(c.niche);
          alerts.forEach(a => {
            // Avoid duplicate dates across clients
            if (!allAlerts.some(x => x.label === a.label && x.clientName === c.companyName)) {
              allAlerts.push({ ...a, clientName: c.companyName, clientColor: c.color });
            }
          });
        });
        // Deduplicate by date label, group clients
        const grouped = new Map<string, { label: string; date: Date; daysUntil: number; urgency: 'high' | 'medium' | 'low'; clients: { name: string; color: string }[] }>();
        allAlerts.forEach(a => {
          const key = a.label;
          if (!grouped.has(key)) {
            grouped.set(key, { label: a.label, date: a.date, daysUntil: a.daysUntil, urgency: a.urgency, clients: [] });
          }
          grouped.get(key)!.clients.push({ name: a.clientName, color: a.clientColor });
        });
        const sortedAlerts = Array.from(grouped.values()).sort((a, b) => a.daysUntil - b.daysUntil);
        if (sortedAlerts.length === 0) return null;
        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 border-warning/30">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-warning" />
              <h3 className="font-display font-semibold text-sm">📅 Datas Sazonais — Criar Conteúdo</h3>
              <Badge variant="outline" className="text-[10px] h-5 border-warning/40 text-warning">{sortedAlerts.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {sortedAlerts.slice(0, 6).map((alert, i) => (
                <div key={i} className={`p-3 rounded-lg border transition-all ${
                  alert.urgency === 'high' ? 'bg-destructive/5 border-destructive/30' :
                  alert.urgency === 'medium' ? 'bg-warning/5 border-warning/30' :
                  'bg-secondary/50 border-border'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold">
                      {alert.urgency === 'high' ? '🔴' : alert.urgency === 'medium' ? '🟡' : '🟢'} {alert.label}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      alert.urgency === 'high' ? 'bg-destructive/15 text-destructive' :
                      alert.urgency === 'medium' ? 'bg-warning/15 text-warning' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {alert.daysUntil}d
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">
                    {alert.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {alert.clients.slice(0, 3).map((c, j) => (
                      <span key={j} className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: `hsl(${c.color} / 0.12)`, color: `hsl(${c.color})` }}>
                        {c.name}
                      </span>
                    ))}
                    {alert.clients.length > 3 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        +{alert.clients.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        );
      })()}

      {/* ── ROW 2: Today Schedule + Videomaker Progress ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today schedule - 2 cols */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Gravações de Hoje</h3>
            <span className="text-xs text-muted-foreground">{todayRecordings.length} gravações</span>
          </div>
          {todayRecordings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma gravação hoje</div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {todayRecordings.map((rec, i) => {
                const clientColor = getClientColor(rec.clientId);
                return (
                  <motion.div key={rec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 group">
                    {(() => { const cl = getClient(rec.clientId); return cl ? <ClientLogo client={cl} size="sm" /> : <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: `hsl(${clientColor})` }} />; })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{getClientName(rec.clientId)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: `hsl(${clientColor} / 0.12)`, color: `hsl(${clientColor})` }}>
                          {typeLabels[rec.type]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{getVideomakerName(rec.videomakerId)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-sm">{rec.startTime}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">{statusIcons[rec.status]}<span className="text-[10px] text-muted-foreground capitalize">{rec.status}</span></div>
                    </div>
                    {rec.status === 'agendada' && (
                      <div className="hidden group-hover:flex gap-1 shrink-0">
                        <button onClick={() => updateRecording({ ...rec, status: 'concluida' })} className="w-7 h-7 rounded-md bg-success/15 text-success flex items-center justify-center hover:bg-success/25"><Check size={14} /></button>
                        <button onClick={() => cancelRecording(rec.id)} className="w-7 h-7 rounded-md bg-destructive/15 text-destructive flex items-center justify-center hover:bg-destructive/25"><XCircle size={14} /></button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Videomaker progress - 1 col */}
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Progresso do Time</h3>
          {videomakerStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Cadastre videomakers</p>
          ) : (
            <div className="space-y-4">
              {videomakerStats.map(({ vm, weekDone, weekTotal, todayDone, todayTotal }) => {
                const activeRec = activeRecordings.find(a => a.videomarkerId === vm.id);
                const activeClientName = activeRec ? getClientName(activeRec.clientId) : null;
                return (
                  <div key={vm.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0 ${activeRec ? 'ring-2 ring-success/40 animate-pulse' : ''}`}>
                        <UserAvatar user={vm} size="sm" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{vm.name}</p>
                        {activeRec ? (
                          <p className="text-[11px] text-success font-medium">● Gravando — {activeClientName}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Hoje: {todayDone}/{todayTotal} · Semana: {weekDone}/{weekTotal}</p>
                        )}
                      </div>
                    </div>
                    <Progress value={weekTotal > 0 ? (weekDone / weekTotal) * 100 : 0} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 2.5: Scoring Chart ── */}
      {vmScoring.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Trophy size={16} className="text-primary" /> Pontuação do Mês
            </h3>
            <button onClick={() => navigate('/desempenho')} className="text-[11px] text-primary font-semibold hover:underline">
              VER DETALHES
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vmScoring} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`${value} pts`, 'Pontuação']}
                />
                <Bar dataKey="score" name="Pontos" radius={[6, 6, 0, 0]}>
                  {vmScoring.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Mini ranking */}
            <div className="space-y-2">
              {vmScoring.slice(0, 5).map((s, i) => (
                <div key={s.vm.id} className={`flex items-center gap-3 p-2.5 rounded-lg ${i < 3 ? 'bg-primary/5' : 'bg-secondary/40'}`}>
                  <span className="text-sm font-bold w-6 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                  </span>
                  <UserAvatar user={s.vm} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.vm.name}</p>
                    <p className="text-[10px] text-muted-foreground">{s.reels} reels</p>
                  </div>
                  <p className="text-lg font-display font-bold text-primary">{s.score}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ── ROW 2.8: Agency Capacity ── */}
      <AgencyCapacityWidget clients={clients} users={users} recordings={recordings} settings={settings} />

      {/* ── ROW 2.9: Endomarketing Metrics (admin only) ── */}
      {endoMetrics.totalClients > 0 && currentUser?.role === 'admin' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Megaphone size={16} className="text-primary" /> Endomarketing
            </h3>
            <button onClick={() => navigate('/endomarketing')} className="text-[11px] text-primary font-semibold hover:underline">
              VER MÓDULO
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4 bg-primary/5 border border-primary/10">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Faturamento</p>
                <p className="text-xl font-display font-bold text-primary mt-1">R$ {endoMetrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{endoMetrics.totalClients} cliente{endoMetrics.totalClients !== 1 ? 's' : ''} ativo{endoMetrics.totalClients !== 1 ? 's' : ''}</p>
              </div>
              <div className="rounded-xl p-4 bg-destructive/5 border border-destructive/10">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Custos</p>
                <p className="text-xl font-display font-bold text-destructive mt-1">R$ {endoMetrics.costs.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Parceiros</p>
              </div>
              <div className="rounded-xl p-4 bg-success/5 border border-success/10">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Lucro</p>
                <p className="text-xl font-display font-bold text-success mt-1">R$ {endoMetrics.profit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
              </div>
              <div className="rounded-xl p-4 bg-info/5 border border-info/10">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Margem</p>
                <p className="text-xl font-display font-bold text-info mt-1">{endoMetrics.margin.toFixed(1)}%</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Clientes Mais Lucrativos</p>
              <div className="space-y-2">
                {endoMetrics.topClients.map((c, i) => (
                  <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg ${i < 3 ? 'bg-primary/5' : 'bg-secondary/40'}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                      <p className="text-sm font-medium">{c.name}</p>
                    </div>
                    <p className="text-sm font-display font-bold text-success">R$ {c.profit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── ROW 3: Week Agenda ── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-sm">Agenda Semanal</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"><ChevronLeft size={14} /></button>
            <span className="text-xs font-medium min-w-[160px] text-center">
              {format(weekDays[0], "d MMM", { locale: ptBR })} — {format(weekDays[6], "d MMM", { locale: ptBR })}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"><ChevronRight size={14} /></button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-[11px] text-primary font-medium ml-1">Hoje</button>}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 min-h-[160px]">
          {weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isToday = dateStr === today;
            const dayRecs = getRecsForDay(day);
            return (
              <div key={dateStr} className={`rounded-lg p-2 min-h-[140px] ${isToday ? 'bg-primary/5 ring-1 ring-primary/30' : 'bg-secondary/40'}`}>
                <p className={`text-[11px] font-semibold mb-1.5 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {format(day, 'EEE d', { locale: ptBR })}
                </p>
                <div className="space-y-1">
                  {dayRecs.slice(0, 5).map(rec => {
                    const color = getClientColor(rec.clientId);
                    return (
                      <div key={rec.id} className="rounded px-1.5 py-1 text-[10px] leading-tight group relative cursor-pointer flex items-center gap-1" style={{ backgroundColor: `hsl(${color} / 0.1)`, borderLeft: `2px solid hsl(${color})` }}>
                        {(() => { const cl = getClient(rec.clientId); return cl?.logoUrl ? <img src={cl.logoUrl} alt="" className="w-3.5 h-3.5 rounded object-cover shrink-0" /> : null; })()}
                        <p className="font-medium truncate" style={{ color: `hsl(${color})` }}>{getClientName(rec.clientId)}</p>
                        <p className="text-muted-foreground">{rec.startTime}</p>
                        <div className="absolute left-0 top-full mt-0.5 hidden group-hover:flex items-center gap-1.5 bg-card rounded-lg p-2 shadow-lg border border-border z-20 min-w-[120px]">
                          {(() => { const vm = users.find(u => u.id === rec.videomakerId); return vm ? <UserAvatar user={vm} size="sm" className="w-5 h-5 text-[8px]" /> : null; })()}
                          <span className="text-[10px] font-medium truncate">{getVideomakerName(rec.videomakerId)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {dayRecs.length > 5 && <p className="text-[10px] text-muted-foreground text-center">+{dayRecs.length - 5}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ROW 4: Client Progress ── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-sm">Progresso por Cliente</h3>
          <button onClick={() => navigate('/metas')} className="text-[11px] text-primary font-semibold hover:underline">VER METAS</button>
        </div>
        {clientProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente cadastrado</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clientProgress.map(({ client, tasksDone, goal, recsDone, recsTotal, progress }) => (
              <div key={client.id} className="rounded-xl p-4 border border-border bg-secondary/30" style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${client.color || '220 10% 50%'})` }}>
                <div className="flex items-center gap-3 mb-3">
                  <ClientLogo client={client} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{client.companyName}</p>
                    <p className="text-[11px] text-muted-foreground">{DAY_LABELS[client.fixedDay]} · {client.fixedTime}</p>
                  </div>
                  <span className="text-lg font-display font-bold" style={{ color: progress >= 80 ? 'hsl(var(--success))' : progress >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))' }}>
                    {progress}%
                  </span>
                </div>
                <Progress value={progress} className="h-1.5 mb-2" />
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>Meta: {goal}</span>
                  <span>Feitas: {tasksDone}</span>
                  <span>Gravações: {recsDone}/{recsTotal}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
