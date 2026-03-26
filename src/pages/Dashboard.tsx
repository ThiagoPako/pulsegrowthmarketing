import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { VM_SCORE, calcVmDeliveryScore, calcWaitPoints } from '@/lib/scoringSystem';
import { DAY_LABELS } from '@/types';
import { fetchAISeasonalAlerts, NICHE_OPTIONS, type AISeasonalAlert, clearSeasonalCache } from '@/lib/seasonalDates';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Plus, XCircle, RefreshCw, TrendingUp, Calendar, Check,
  ChevronLeft, ChevronRight, Clock, Users as UsersIcon, MessageSquare, Trophy, BarChart3,
  Clapperboard, Film, Megaphone, AlertTriangle, Rocket, Bell, Send, Hourglass, Trash2, Package
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, addDays, formatDistanceToNow, differenceInMinutes, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import UserAvatar from '@/components/UserAvatar';
import AgencyCapacityWidget from '@/components/AgencyCapacityWidget';
import TeamPerformanceWidget from '@/components/TeamPerformanceWidget';
import BirthdayCountdown from '@/components/BirthdayCountdown';
import ClientLogo from '@/components/ClientLogo';
import { getMessageStats } from '@/services/whatsappService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

interface LiveEditorTask {
  id: string;
  title: string;
  client_id: string;
  assigned_to: string | null;
  kanban_column: string;
  editing_started_at: string | null;
  content_type: string;
}

const SCORE_WEIGHTS = { reel: VM_SCORE.REEL, criativo: VM_SCORE.CRIATIVO, story: VM_SCORE.STORY, arte: VM_SCORE.ARTE, extra: VM_SCORE.EXTRA };
const BAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

/* Floating rocket mascot */
const FloatingRocket = ({ className = '', size = 20 }: { className?: string; size?: number }) => (
  <motion.div
    className={className}
    animate={{ y: [0, -6, 0], rotate: [0, 5, -5, 0] }}
    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
  >
    <Rocket size={size} className="text-primary" />
  </motion.div>
);

/* Live timer for organizing material */
function OrganizingMaterialCard({ rec, vm, client, settings }: { rec: any; vm: any; client: any; settings: any }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const isStar = client?.fullShiftRecording || false;
  const expectedDuration = isStar
    ? (client?.preferredShift === 'tarde'
      ? (timeToMin(settings?.shiftBEnd || '18:00') - timeToMin(settings?.shiftBStart || '14:30'))
      : (timeToMin(settings?.shiftAEnd || '12:00') - timeToMin(settings?.shiftAStart || '08:30')))
    : (settings?.recordingDuration || 90);

  const recDate = new Date(rec.date + 'T' + rec.startTime + ':00');
  const organizingStarted = new Date(recDate.getTime() + expectedDuration * 60 * 1000);
  const elapsedMs = Math.max(now - organizingStarted.getTime(), 0);
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
  const isWarning = elapsedMin > 30;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className={`relative p-2.5 sm:p-3 rounded-xl border transition-all ${
        isWarning ? 'bg-warning/8 border-warning/30' : 'bg-primary/5 border-primary/15'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          {vm && <UserAvatar user={vm} size="sm" />}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-background" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{vm?.name || '—'}</p>
          <div className="flex items-center gap-1">
            {client && <ClientLogo client={client} size="sm" className="w-3.5 h-3.5" />}
            <p className="text-[10px] text-muted-foreground truncate">{client?.companyName || '—'}</p>
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <Badge className="text-[9px] bg-primary/80 px-1.5 gap-0.5">
            📦 Organizando
          </Badge>
          <div className="flex items-center gap-1">
            <Clock size={10} className="text-muted-foreground" />
            <span className={`text-[10px] font-mono font-bold tabular-nums ${isWarning ? 'text-warning' : 'text-muted-foreground'}`}>
              {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { currentUser, recordings, clients, users, tasks, cancelRecording, updateRecording, getSuggestionsForCancellation, activeRecordings, settings } = useApp();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const today = format(new Date(), 'yyyy-MM-dd');
  const normalizeDateKey = (value: string) => value?.slice(0, 10) || '';
  const [weekOffset, setWeekOffset] = useState(0);
  const [waStats, setWaStats] = useState({ total: 0, sent: 0, failed: 0 });
  const [deliveryRecords, setDeliveryRecords] = useState<any[]>([]);
  const [liveEditorTasks, setLiveEditorTasks] = useState<LiveEditorTask[]>([]);
  const [endoMetrics, setEndoMetrics] = useState({ totalClients: 0, revenue: 0, costs: 0, profit: 0, margin: 0, topClients: [] as { name: string; profit: number }[] });
  const [contractAlerts, setContractAlerts] = useState<{ clientName: string; daysLeft: number; endDate: string }[]>([]);
  const [expandedWeekDay, setExpandedWeekDay] = useState<string | null>(null);
  const [waitLogs, setWaitLogs] = useState<any[]>([]);

  useEffect(() => { getMessageStats().then(setWaStats); }, []);
  useEffect(() => {
    supabase.from('delivery_records').select('*').then(({ data }) => { if (data) setDeliveryRecords(data); });
  }, []);
  useEffect(() => {
    supabase.from('recording_wait_logs').select('*').then(({ data }) => { if (data) setWaitLogs(data); });
  }, []);

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

  useEffect(() => {
    const fetchLiveTasks = async () => {
      const { data } = await supabase
        .from('content_tasks')
        .select('id, title, client_id, assigned_to, kanban_column, editing_started_at, content_type')
        .not('editing_started_at', 'is', null)
        .in('kanban_column', ['edicao', 'revisao', 'alteracao']);
      if (data) setLiveEditorTasks(data);
    };
    fetchLiveTasks();
    const channel = supabase
      .channel('live-editor-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => fetchLiveTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const stats = useMemo(() => {
    const todayRecs = recordings.filter(r => normalizeDateKey(r.date) === today);
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

  const todayRecordings = useMemo(() => {
    let recs = recordings.filter(r => normalizeDateKey(r.date) === today && r.status !== 'cancelada');
    if (currentUser?.role === 'videomaker') recs = recs.filter(r => r.videomakerId === currentUser.id);
    return recs.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [recordings, today, currentUser]);

  const videomakers = users.filter(u => u.role === 'videomaker');
  const videomakerStats = useMemo(() => {
    return videomakers.map(vm => {
      const weekRecs = recordings.filter(r => r.videomakerId === vm.id && isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd }));
      const done = weekRecs.filter(r => r.status === 'concluida').length;
      const total = weekRecs.length;
      const todayRecs = weekRecs.filter(r => normalizeDateKey(r.date) === today);
      const todayDone = todayRecs.filter(r => r.status === 'concluida').length;
      const todayTotal = todayRecs.filter(r => r.status !== 'cancelada').length;
      return { vm, weekDone: done, weekTotal: total, todayDone, todayTotal };
    });
  }, [videomakers, recordings, weekStart, weekEnd, today]);

  const vmScoring = useMemo(() => {
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    return videomakers.map(vm => {
      const vmRecs = deliveryRecords.filter((r: any) =>
        r.videomaker_id === vm.id && r.date >= monthStart && r.date <= monthEnd &&
        (r.delivery_status === 'realizada' || r.delivery_status === 'encaixe' || r.delivery_status === 'extra')
      );
      const deliveryScore = vmRecs.reduce((a: number, r: any) =>
        a + r.reels_produced * SCORE_WEIGHTS.reel + r.creatives_produced * SCORE_WEIGHTS.criativo +
        r.stories_produced * SCORE_WEIGHTS.story + r.arts_produced * SCORE_WEIGHTS.arte +
        r.extras_produced * SCORE_WEIGHTS.extra, 0);

      // Gravações concluídas no mês
      const monthRecs = recordings.filter(r =>
        r.videomakerId === vm.id && r.date >= monthStart && r.date <= monthEnd && r.status === 'concluida'
      );
      const recsDone = monthRecs.filter(r => r.type !== 'endomarketing').length;
      const endoDone = monthRecs.filter(r => r.type === 'endomarketing').length;

      // Wait points
      const vmWaitLogs = waitLogs.filter((l: any) => {
        if (l.videomaker_id !== vm.id) return false;
        const d = l.created_at?.slice(0, 10);
        return d >= monthStart && d <= monthEnd;
      });
      const totalWaitSec = vmWaitLogs.reduce((a: number, l: any) => a + (l.wait_duration_seconds || 0), 0);
      const waitPts = calcWaitPoints(totalWaitSec);

      const score = deliveryScore + recsDone * VM_SCORE.GRAVACAO + endoDone * VM_SCORE.ENDO + waitPts;
      const reels = vmRecs.reduce((a: number, r: any) => a + r.reels_produced, 0);
      return { name: vm.name.split(' ')[0], score, reels, vm };
    }).sort((a, b) => b.score - a.score);
  }, [videomakers, deliveryRecords, recordings, waitLogs]);

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

  const waitTimeStats = useMemo(() => {
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    const monthLogs = waitLogs.filter(w => {
      const d = w.started_at?.split('T')[0] || '';
      return d >= monthStart && d <= monthEnd && w.wait_duration_seconds;
    });
    const vmMap = new Map<string, { totalSeconds: number; count: number; clients: Map<string, number> }>();
    monthLogs.forEach(w => {
      const vmId = w.videomaker_id;
      if (!vmMap.has(vmId)) vmMap.set(vmId, { totalSeconds: 0, count: 0, clients: new Map() });
      const entry = vmMap.get(vmId)!;
      entry.totalSeconds += w.wait_duration_seconds || 0;
      entry.count += 1;
      entry.clients.set(w.client_id, (entry.clients.get(w.client_id) || 0) + (w.wait_duration_seconds || 0));
    });
    const clientMap = new Map<string, { totalSeconds: number; count: number }>();
    monthLogs.forEach(w => {
      if (!clientMap.has(w.client_id)) clientMap.set(w.client_id, { totalSeconds: 0, count: 0 });
      const entry = clientMap.get(w.client_id)!;
      entry.totalSeconds += w.wait_duration_seconds || 0;
      entry.count += 1;
    });
    const topClients = Array.from(clientMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 5);
    const vmStats = Array.from(vmMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds);
    const totalSeconds = monthLogs.reduce((a, w) => a + (w.wait_duration_seconds || 0), 0);
    return { totalSeconds, totalCount: monthLogs.length, vmStats, topClients };
  }, [waitLogs]);

  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return recordings.filter(r => normalizeDateKey(r.date) === dateStr && r.status !== 'cancelada').sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || '—';
  const getClientColor = (id: string) => getClient(id)?.color || '220 10% 50%';
  const getVideomakerName = (id: string) => users.find(u => u.id === id)?.name || '—';

  const typeLabels: Record<string, string> = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.' };
  const statusIcons: Record<string, React.ReactNode> = {
    agendada: <Clock size={12} className="text-info" />,
    concluida: <Check size={12} className="text-success" />,
    organizando_material: <span className="text-[10px]">📦</span>,
  };

  const statItems = [
    { label: 'Gravados', value: stats.todayDone, icon: Video, color: 'bg-success/15 text-success' },
    { label: 'Agendados', value: stats.todayScheduled, icon: Clock, color: 'bg-info/15 text-info' },
    { label: 'Extras', value: stats.todayExtras, icon: Plus, color: 'bg-warning/15 text-warning' },
    { label: 'Cancelados', value: stats.todayCancelled, icon: XCircle, color: 'bg-destructive/15 text-destructive' },
    { label: 'Semana', value: stats.weekDone, icon: TrendingUp, color: 'bg-primary/15 text-primary' },
    { label: 'Clientes', value: stats.totalClients, icon: UsersIcon, color: 'bg-info/15 text-info' },
    { label: 'WhatsApp', value: waStats.sent, icon: MessageSquare, color: 'bg-success/15 text-success' },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 max-w-[1400px]">
      {/* Header with rocket */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <FloatingRocket size={isMobile ? 22 : 28} />
          <div>
            <h1 className="text-lg sm:text-2xl font-display font-bold">
              {currentUser?.role === 'videomaker' ? `Olá, ${currentUser.name} 👋` : 'Painel de Controle'}
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          </div>
        </div>
        {/* Mini rocket exhaust on desktop */}
        {!isMobile && (
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-primary/30"
          >
            <Rocket size={40} />
          </motion.div>
        )}
      </motion.div>

      <BirthdayCountdown />

      {/* Stats grid — 4 cols mobile, 7 cols desktop */}
      <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 sm:gap-3">
        {statItems.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.95 }}
            className="stat-card p-2 sm:p-3"
          >
            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-1 sm:mb-2 ${s.color}`}>
              <s.icon size={isMobile ? 12 : 16} />
            </div>
            <p className="text-base sm:text-xl font-display font-bold">{s.value}</p>
            <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 truncate">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* CONTRACT EXPIRATION ALERTS */}
      {contractAlerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 sm:p-4 border-warning/30 bg-warning/5">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <AlertTriangle size={14} className="text-warning" />
            <h3 className="font-display font-semibold text-xs sm:text-sm">Contratos Vencendo</h3>
            <Badge variant="outline" className="text-[9px] h-4 px-1 border-warning/50 text-warning">{contractAlerts.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2">
            {contractAlerts.map((alert, i) => (
              <motion.div key={i} whileTap={{ scale: 0.97 }} className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border ${alert.daysLeft <= 30 ? 'bg-destructive/10 border-destructive/30' : 'bg-warning/10 border-warning/30'}`}>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">{alert.clientName}</p>
                  <p className="text-[10px] text-muted-foreground">Vence {alert.endDate}</p>
                </div>
                <Badge variant={alert.daysLeft <= 30 ? 'destructive' : 'outline'} className="text-[10px] shrink-0 ml-1">
                  {alert.daysLeft}d
                </Badge>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* LIVE ACTIVITY — Redesigned with proper status separation */}
      {(() => {
        const organizingRecordings = recordings.filter(r => r.status === 'organizando_material' && normalizeDateKey(r.date) === today);
        // Separate editor tasks by actual kanban_column
        const editingTasks = liveEditorTasks.filter(t => t.kanban_column === 'edicao');
        const reviewTasks = liveEditorTasks.filter(t => t.kanban_column === 'revisao');
        const alterationTasks = liveEditorTasks.filter(t => t.kanban_column === 'alteracao');
        const totalActive = activeRecordings.length + liveEditorTasks.length + organizingRecordings.length;

        const columnConfig = {
          edicao: { label: 'Editando', icon: Film, color: 'info', dotColor: 'bg-info', badgeBg: 'bg-info', borderColor: 'border-info/20', bgColor: 'bg-info/5' },
          revisao: { label: 'Revisão', icon: AlertTriangle, color: 'warning', dotColor: 'bg-warning', badgeBg: 'bg-warning', borderColor: 'border-warning/20', bgColor: 'bg-warning/5' },
          alteracao: { label: 'Alteração', icon: RefreshCw, color: 'destructive', dotColor: 'bg-destructive', badgeBg: 'bg-destructive', borderColor: 'border-destructive/20', bgColor: 'bg-destructive/5' },
        };

        const renderEditorCard = (task: LiveEditorTask, config: typeof columnConfig.edicao) => {
          const editor = users.find(u => u.id === task.assigned_to);
          const client = clients.find(c => c.id === task.client_id);
          const startTime = task.editing_started_at ? parseISO(task.editing_started_at) : null;
          const elapsedMin = startTime ? differenceInMinutes(new Date(), startTime) : 0;
          const elapsedHrs = startTime ? differenceInHours(new Date(), startTime) : 0;
          const elapsedLabel = startTime ? formatDistanceToNow(startTime, { locale: ptBR, addSuffix: false }) : '';

          const thresholds = task.kanban_column === 'alteracao' ? { warn: 120, stale: 360 } : task.kanban_column === 'revisao' ? { warn: 480, stale: 1440 } : { warn: 240, stale: 480 };
          const isWarning = elapsedMin > thresholds.warn;
          const isStale = elapsedMin > thresholds.stale;
          const maxMin = thresholds.stale;
          const progressPct = Math.min((elapsedMin / maxMin) * 100, 100);

          const handleDemandNotification = async () => {
            const targetId = task.assigned_to;
            if (!targetId) return;
            await supabase.from('notifications').insert({
              user_id: targetId,
              title: `Cobrança — ${config.label}`,
              message: `A tarefa "${task.title}" (${client?.companyName || 'cliente'}) está em ${config.label} há ${elapsedLabel}. Atualize o status.`,
              type: 'warning',
              link: '/editor',
            });
            const { toast } = await import('@/hooks/use-toast');
            toast({ title: 'Notificação enviada', description: `Cobrança enviada para ${editor?.name || 'editor'}` });
          };

          return (
            <motion.div
              key={task.id}
              whileTap={{ scale: 0.97 }}
              className={`relative p-2.5 sm:p-3 rounded-xl border transition-all ${
                isStale ? 'bg-destructive/8 border-destructive/30 shadow-sm shadow-destructive/10' :
                isWarning ? 'bg-warning/8 border-warning/30' :
                `${config.bgColor} ${config.borderColor}`
              }`}
            >
              {isStale && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-destructive/15 text-destructive">
                  <AlertTriangle size={11} />
                  <span className="text-[10px] font-semibold">
                    {task.kanban_column === 'alteracao' ? 'Alteração parada há muito tempo!' : task.kanban_column === 'revisao' ? 'Revisão pendente há muito tempo!' : 'Edição parada há muito tempo!'}
                  </span>
                </motion.div>
              )}
              {isWarning && !isStale && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-warning/15 text-warning">
                  <Clock size={11} />
                  <span className="text-[10px] font-semibold">Tempo acima do esperado</span>
                </motion.div>
              )}

              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  {editor ? <UserAvatar user={editor} size="sm" /> : (
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                      <UsersIcon size={12} className="text-muted-foreground" />
                    </div>
                  )}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${config.dotColor} rounded-full border-2 border-background ${isStale ? '' : 'animate-pulse'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{editor?.name || (task.kanban_column === 'alteracao' ? 'Na fila' : 'Sem editor')}</p>
                  <div className="flex items-center gap-1">
                    {client && <ClientLogo client={client} size="sm" className="w-3.5 h-3.5" />}
                    <p className="text-[10px] text-muted-foreground truncate">{task.title || client?.companyName || '—'}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <Clock size={10} className="text-muted-foreground" />
                    <span className={`text-[10px] font-mono font-bold tabular-nums ${isStale ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'}`}>
                      {elapsedHrs > 0 ? `${elapsedHrs}h${String(elapsedMin % 60).padStart(2, '0')}` : `${elapsedMin}min`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                  <span>Tempo dedicado</span>
                  <span>{Math.round(progressPct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${isStale ? 'bg-destructive' : isWarning ? 'bg-warning' : config.color === 'info' ? 'bg-info/70' : config.color === 'warning' ? 'bg-warning/70' : 'bg-destructive/70'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {(isWarning || isStale) && task.assigned_to && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDemandNotification}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-warning/15 hover:bg-warning/25 text-warning text-[10px] font-semibold transition-colors"
                >
                  <Send size={11} />
                  Cobrar Atualização
                </motion.button>
              )}
            </motion.div>
          );
        };

        return totalActive > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 sm:p-5 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
            </span>
            <h3 className="font-display font-semibold text-sm sm:text-base">Atividade em Tempo Real</h3>
            <Badge variant="outline" className="text-[9px] ml-auto">{totalActive} ativas</Badge>
          </div>

          {/* Two main columns: GRAVANDO | PÓS-PRODUÇÃO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* ── COLUNA GRAVANDO ── */}
            <div className="rounded-xl border-2 border-destructive/20 bg-destructive/[0.03] p-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-destructive/10">
                <div className="w-7 h-7 rounded-lg bg-destructive/15 flex items-center justify-center">
                  <Clapperboard size={14} className="text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-display font-bold text-destructive">GRAVANDO</p>
                  <p className="text-[9px] text-muted-foreground">Videomakers em campo</p>
                </div>
                <Badge variant="destructive" className="text-[10px] h-5 px-2">{activeRecordings.length + organizingRecordings.length}</Badge>
              </div>
              {activeRecordings.length === 0 && organizingRecordings.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhum videomaker gravando</p>
              ) : (
                <div className="space-y-2">
                  {activeRecordings.map(ar => {
                    const vm = users.find(u => u.id === ar.videomarkerId);
                    const client = clients.find(c => c.id === ar.clientId);
                    const startTime = ar.startedAt ? parseISO(ar.startedAt) : null;
                    const elapsedMin = startTime ? differenceInMinutes(new Date(), startTime) : 0;
                    const elapsedHrs = startTime ? differenceInHours(new Date(), startTime) : 0;
                    const elapsedLabel = startTime ? formatDistanceToNow(startTime, { locale: ptBR, addSuffix: false }) : '';
                    const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
                    const isStar = client?.fullShiftRecording || false;
                    const expectedDuration = isStar
                      ? (client?.preferredShift === 'tarde'
                        ? (timeToMin(settings?.shiftBEnd || '18:00') - timeToMin(settings?.shiftBStart || '14:30'))
                        : (timeToMin(settings?.shiftAEnd || '12:00') - timeToMin(settings?.shiftAStart || '08:30')))
                      : (settings?.recordingDuration || 90);
                    const progressPct = Math.min((elapsedMin / expectedDuration) * 100, 100);
                    const isStale = elapsedMin > expectedDuration * 1.5;
                    const isWarning = elapsedMin > expectedDuration;

                    const handleDemandNotification = async () => {
                      if (!vm) return;
                      await supabase.from('notifications').insert({
                        user_id: vm.id,
                        title: 'Cobrança de Gravação',
                        message: `A gravação de ${client?.companyName || 'cliente'} está em andamento há ${elapsedLabel}. Atualize o status.`,
                        type: 'warning',
                        link: '/agenda',
                      });
                      const { toast } = await import('@/hooks/use-toast');
                      toast({ title: 'Notificação enviada', description: `Cobrança enviada para ${vm.name}` });
                    };

                    return (
                      <motion.div key={ar.recordingId} whileTap={{ scale: 0.97 }}
                        className={`relative p-2.5 sm:p-3 rounded-xl border transition-all ${
                          isStale ? 'bg-destructive/8 border-destructive/30 shadow-sm shadow-destructive/10' :
                          isWarning ? 'bg-warning/8 border-warning/30' : 'bg-background border-destructive/10'
                        }`}>
                        {isStale && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-destructive/15 text-destructive">
                            <AlertTriangle size={11} />
                            <span className="text-[10px] font-semibold">Atividade parada há muito tempo!</span>
                          </motion.div>
                        )}
                        {isWarning && !isStale && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-warning/15 text-warning">
                            <Clock size={11} />
                            <span className="text-[10px] font-semibold">Tempo acima do esperado</span>
                          </motion.div>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            {vm && <UserAvatar user={vm} size="sm" />}
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-background animate-pulse" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{vm?.name || '—'}</p>
                            <div className="flex items-center gap-1">
                              {client && <ClientLogo client={client} size="sm" className="w-3.5 h-3.5" />}
                              <p className="text-[10px] text-muted-foreground truncate">{client?.companyName || '—'}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <Badge variant="destructive" className="text-[9px] gap-0.5 px-1.5">
                              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> REC
                            </Badge>
                            <div className="flex items-center gap-1">
                              <Clock size={10} className="text-muted-foreground" />
                              <span className={`text-[10px] font-mono font-bold tabular-nums ${isStale ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'}`}>
                                {elapsedHrs > 0 ? `${elapsedHrs}h${String(elapsedMin % 60).padStart(2, '0')}` : `${elapsedMin}min`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                            <span>Tempo dedicado</span>
                            <span>{Math.round(progressPct)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <motion.div className={`h-full rounded-full ${isStale ? 'bg-destructive' : isWarning ? 'bg-warning' : 'bg-destructive/70'}`}
                              initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
                          </div>
                        </div>
                        {(isWarning || isStale) && (
                          <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} whileTap={{ scale: 0.95 }}
                            onClick={handleDemandNotification}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-warning/15 hover:bg-warning/25 text-warning text-[10px] font-semibold transition-colors">
                            <Send size={11} /> Cobrar Atualização
                          </motion.button>
                        )}
                      </motion.div>
                    );
                  })}
                  {/* Organizando Material inline */}
                  {organizingRecordings.map(rec => {
                    const vm = users.find(u => u.id === rec.videomakerId);
                    const client = clients.find(c => c.id === rec.clientId);
                    return <OrganizingMaterialCard key={rec.id} rec={rec} vm={vm} client={client} settings={settings} />;
                  })}
                </div>
              )}
            </div>

            {/* ── COLUNA PÓS-PRODUÇÃO (Editando / Revisão / Alteração) ── */}
            <div className="rounded-xl border-2 border-info/20 bg-info/[0.03] p-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-info/10">
                <div className="w-7 h-7 rounded-lg bg-info/15 flex items-center justify-center">
                  <Film size={14} className="text-info" />
                </div>
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-display font-bold text-info">PÓS-PRODUÇÃO</p>
                  <p className="text-[9px] text-muted-foreground">Editores e revisões</p>
                </div>
                <Badge className="text-[10px] h-5 px-2 bg-info">{liveEditorTasks.length}</Badge>
              </div>

              {liveEditorTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhum editor em atividade</p>
              ) : (
                <div className="space-y-3">
                  {/* Sub-section: Editando */}
                  {editingTasks.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Film size={12} className="text-info" />
                        <span className="text-[10px] font-bold text-info uppercase tracking-wider">Editando</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{editingTasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {editingTasks.map(t => renderEditorCard(t, columnConfig.edicao))}
                      </div>
                    </div>
                  )}
                  {/* Sub-section: Revisão */}
                  {reviewTasks.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <AlertTriangle size={12} className="text-warning" />
                        <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Revisão</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{reviewTasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {reviewTasks.map(t => renderEditorCard(t, columnConfig.revisao))}
                      </div>
                    </div>
                  )}
                  {/* Sub-section: Alteração */}
                  {alterationTasks.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <RefreshCw size={12} className="text-destructive" />
                        <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Alteração</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{alterationTasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {alterationTasks.map(t => renderEditorCard(t, columnConfig.alteracao))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
        );
      })()}

      {/* WAITING TIME STATS */}
      {waitTimeStats.totalCount > 0 && currentUser?.role === 'admin' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 sm:p-5 border-warning/20">
          <div className="flex items-center gap-2 mb-3">
            <Hourglass size={16} className="text-warning" />
            <h3 className="font-display font-semibold text-xs sm:text-sm">⏳ Tempo de Espera — {format(new Date(), "MMMM", { locale: ptBR })}</h3>
            <Badge variant="outline" className="text-[9px] h-4 px-1 border-warning/40 text-warning ml-auto">
              {waitTimeStats.totalCount} esperas · {Math.floor(waitTimeStats.totalSeconds / 60)}min total
            </Badge>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-destructive text-[10px] h-6 px-2 ml-1 rounded hover:bg-destructive/10 flex items-center"
              onClick={async () => {
                if (!confirm('Limpar todos os dados de tempo de espera?')) return;
                const ids = waitLogs.map((l: any) => l.id);
                for (const id of ids) {
                  await supabase.from('recording_wait_logs').delete().eq('id', id);
                }
                setWaitLogs([]);
              }}
            >
              <Trash2 size={12} className="mr-1" /> Limpar
            </motion.button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {/* Per Videomaker */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por Videomaker</p>
              <div className="space-y-1.5">
                {waitTimeStats.vmStats.map(vs => {
                  const vm = users.find(u => u.id === vs.id);
                  const mins = Math.floor(vs.totalSeconds / 60);
                  const avgMins = vs.count > 0 ? Math.round(vs.totalSeconds / vs.count / 60) : 0;
                  return (
                    <div key={vs.id} className="flex items-center gap-2 p-2 rounded-lg bg-warning/5 border border-warning/15">
                      {vm && <UserAvatar user={vm} size="sm" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{vm?.name || 'Videomaker'}</p>
                        <p className="text-[10px] text-muted-foreground">{vs.count} esperas · média {avgMins}min</p>
                      </div>
                      <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">{mins}min</Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per Client - top offenders */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Clientes que Mais Fizeram Esperar</p>
              <div className="space-y-1.5">
                {waitTimeStats.topClients.map(tc => {
                  const client = clients.find(c => c.id === tc.id);
                  const mins = Math.floor(tc.totalSeconds / 60);
                  const avgMins = tc.count > 0 ? Math.round(tc.totalSeconds / tc.count / 60) : 0;
                  return (
                    <div key={tc.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border-border">
                      {client && <ClientLogo client={client} size="sm" className="w-6 h-6" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{client?.companyName || 'Cliente'}</p>
                        <p className="text-[10px] text-muted-foreground">{tc.count}x · média {avgMins}min</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">{mins}min</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* SEASONAL DATES */}
      {(() => {
        const allAlerts: { clientName: string; clientColor: string; label: string; date: Date; daysUntil: number; urgency: 'high' | 'medium' | 'low' }[] = [];
        clients.forEach(c => {
          if (!c.niche || c.niche === 'outro') return;
          const alerts = getSeasonalAlerts(c.niche);
          alerts.forEach(a => {
            if (!allAlerts.some(x => x.label === a.label && x.clientName === c.companyName)) {
              allAlerts.push({ ...a, clientName: c.companyName, clientColor: c.color });
            }
          });
        });
        const grouped = new Map<string, { label: string; date: Date; daysUntil: number; urgency: 'high' | 'medium' | 'low'; clients: { name: string; color: string }[] }>();
        allAlerts.forEach(a => {
          const key = a.label;
          if (!grouped.has(key)) grouped.set(key, { label: a.label, date: a.date, daysUntil: a.daysUntil, urgency: a.urgency, clients: [] });
          grouped.get(key)!.clients.push({ name: a.clientName, color: a.clientColor });
        });
        const sortedAlerts = Array.from(grouped.values()).sort((a, b) => a.daysUntil - b.daysUntil);
        if (sortedAlerts.length === 0) return null;
        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 sm:p-5 border-warning/30">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-warning" />
              <h3 className="font-display font-semibold text-xs sm:text-sm">📅 Datas Sazonais</h3>
              <Badge variant="outline" className="text-[9px] h-4 px-1 border-warning/40 text-warning">{sortedAlerts.length}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2">
              {sortedAlerts.slice(0, 6).map((alert, i) => (
                <motion.div key={i} whileTap={{ scale: 0.97 }} className={`p-2 sm:p-3 rounded-lg border transition-all ${
                  alert.urgency === 'high' ? 'bg-destructive/5 border-destructive/30' :
                  alert.urgency === 'medium' ? 'bg-warning/5 border-warning/30' :
                  'bg-secondary/50 border-border'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] sm:text-xs font-semibold truncate">
                      {alert.urgency === 'high' ? '🔴' : alert.urgency === 'medium' ? '🟡' : '🟢'} {alert.label}
                    </span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ml-1 ${
                      alert.urgency === 'high' ? 'bg-destructive/15 text-destructive' :
                      alert.urgency === 'medium' ? 'bg-warning/15 text-warning' :
                      'bg-muted text-muted-foreground'
                    }`}>{alert.daysUntil}d</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mb-1">
                    {alert.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                  </p>
                  <div className="flex flex-wrap gap-0.5">
                    {alert.clients.slice(0, 3).map((c, j) => (
                      <span key={j} className="text-[8px] px-1 py-0.5 rounded font-medium"
                        style={{ backgroundColor: `hsl(${c.color} / 0.12)`, color: `hsl(${c.color})` }}>
                        {c.name}
                      </span>
                    ))}
                    {alert.clients.length > 3 && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground">+{alert.clients.length - 3}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        );
      })()}

      {/* TODAY SCHEDULE + VM PROGRESS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="lg:col-span-2 glass-card p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <FloatingRocket size={16} />
              <h3 className="font-display font-semibold text-xs sm:text-sm">Gravações de Hoje</h3>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground">{todayRecordings.length} gravações</span>
          </div>
          {todayRecordings.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-xs sm:text-sm flex flex-col items-center gap-2">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                <Rocket size={28} className="text-muted-foreground/40" />
              </motion.div>
              Nenhuma gravação hoje
            </div>
          ) : (
            <div className="space-y-1.5 sm:space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {todayRecordings.map((rec, i) => {
                const clientColor = getClientColor(rec.clientId);
                return (
                  <motion.div key={rec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-secondary/50 group">
                    {(() => { const cl = getClient(rec.clientId); return cl ? <ClientLogo client={cl} size="sm" /> : <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: `hsl(${clientColor})` }} />; })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs sm:text-sm truncate">{getClientName(rec.clientId)}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0"
                          style={{ backgroundColor: `hsl(${clientColor} / 0.12)`, color: `hsl(${clientColor})` }}>
                          {typeLabels[rec.type]}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{getVideomakerName(rec.videomakerId)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-xs sm:text-sm">{rec.startTime}</p>
                      <div className="flex items-center justify-end gap-0.5 mt-0.5">{statusIcons[rec.status]}<span className="text-[9px] text-muted-foreground capitalize">{rec.status}</span></div>
                    </div>
                    {rec.status === 'agendada' && !isMobile && (
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

        {/* Videomaker progress */}
        <div className="glass-card p-3 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <FloatingRocket size={16} />
            <h3 className="font-display font-semibold text-xs sm:text-sm">Progresso do Time</h3>
          </div>
          {videomakerStats.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Cadastre videomakers</p>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {videomakerStats.map(({ vm, weekDone, weekTotal, todayDone, todayTotal }) => {
                const activeRec = activeRecordings.find(a => a.videomarkerId === vm.id);
                const activeClientName = activeRec ? getClientName(activeRec.clientId) : null;
                return (
                  <motion.div key={vm.id} className="space-y-1.5" whileTap={{ scale: 0.97 }}>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0 ${activeRec ? 'ring-2 ring-success/40 animate-pulse' : ''}`}>
                        <UserAvatar user={vm} size="sm" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">{vm.name}</p>
                        {activeRec ? (
                          <p className="text-[10px] text-success font-medium truncate">● Gravando — {activeClientName}</p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">Hoje: {todayDone}/{todayTotal} · Sem: {weekDone}/{weekTotal}</p>
                        )}
                      </div>
                    </div>
                    <Progress value={weekTotal > 0 ? (weekDone / weekTotal) * 100 : 0} className="h-1.5" />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SCORING */}
      {vmScoring.length > 0 && (
        <div className="glass-card p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-display font-semibold text-xs sm:text-sm flex items-center gap-2">
              <Trophy size={14} className="text-primary" /> Pontuação do Mês
            </h3>
            <button onClick={() => navigate('/desempenho')} className="text-[10px] sm:text-[11px] text-primary font-semibold hover:underline">
              DETALHES
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
              <BarChart data={vmScoring} barSize={isMobile ? 20 : 28}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 11 }} />
                <YAxis tick={{ fontSize: isMobile ? 9 : 11 }} width={isMobile ? 30 : 40} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                  formatter={(value: number) => [`${value} pts`, 'Pontuação']}
                />
                <Bar dataKey="score" name="Pontos" radius={[6, 6, 0, 0]}>
                  {vmScoring.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 sm:space-y-2">
              {vmScoring.slice(0, 5).map((s, i) => (
                <motion.div key={s.vm.id} whileTap={{ scale: 0.97 }} className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg ${i < 3 ? 'bg-primary/5' : 'bg-secondary/40'}`}>
                  <span className="text-xs sm:text-sm font-bold w-5 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                  </span>
                  <UserAvatar user={s.vm} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium truncate">{s.vm.name}</p>
                    <p className="text-[9px] text-muted-foreground">{s.reels} reels</p>
                  </div>
                  <p className="text-sm sm:text-lg font-display font-bold text-primary">{s.score}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {currentUser?.role === 'admin' && <TeamPerformanceWidget />}

      <AgencyCapacityWidget clients={clients} users={users} recordings={recordings} settings={settings} />

      {/* ENDOMARKETING */}
      {endoMetrics.totalClients > 0 && currentUser?.role === 'admin' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-display font-semibold text-xs sm:text-sm flex items-center gap-2">
              <Megaphone size={14} className="text-primary" /> Endomarketing
            </h3>
            <button onClick={() => navigate('/endomarketing')} className="text-[10px] sm:text-[11px] text-primary font-semibold hover:underline">
              VER MÓDULO
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
              {[
                { label: 'Faturamento', value: `R$ ${endoMetrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, sub: `${endoMetrics.totalClients} ativo${endoMetrics.totalClients !== 1 ? 's' : ''}`, cls: 'bg-primary/5 border-primary/10 text-primary' },
                { label: 'Custos', value: `R$ ${endoMetrics.costs.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, sub: 'Parceiros', cls: 'bg-destructive/5 border-destructive/10 text-destructive' },
                { label: 'Lucro', value: `R$ ${endoMetrics.profit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, sub: '', cls: 'bg-success/5 border-success/10 text-success' },
                { label: 'Margem', value: `${endoMetrics.margin.toFixed(1)}%`, sub: '', cls: 'bg-info/5 border-info/10 text-info' },
              ].map((m, i) => (
                <motion.div key={i} whileTap={{ scale: 0.97 }} className={`rounded-xl p-2.5 sm:p-4 border ${m.cls.split(' ').slice(0, 2).join(' ')}`}>
                  <p className="text-[9px] sm:text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{m.label}</p>
                  <p className={`text-sm sm:text-xl font-display font-bold mt-0.5 sm:mt-1 ${m.cls.split(' ')[2]}`}>{m.value}</p>
                  {m.sub && <p className="text-[9px] text-muted-foreground mt-0.5">{m.sub}</p>}
                </motion.div>
              ))}
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 sm:mb-3">Top Lucrativos</p>
              <div className="space-y-1.5 sm:space-y-2">
                {endoMetrics.topClients.map((c, i) => (
                  <div key={i} className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg ${i < 3 ? 'bg-primary/5' : 'bg-secondary/40'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold w-5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                      <p className="text-xs sm:text-sm font-medium truncate">{c.name}</p>
                    </div>
                    <p className="text-xs sm:text-sm font-display font-bold text-success">R$ {c.profit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* WEEK AGENDA — mobile: vertical list, desktop: 7-col grid */}
      <div className="glass-card p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <FloatingRocket size={16} />
            <h3 className="font-display font-semibold text-xs sm:text-sm">Agenda Semanal</h3>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"><ChevronLeft size={12} /></button>
            <span className="text-[10px] sm:text-xs font-medium min-w-[100px] sm:min-w-[160px] text-center">
              {format(weekDays[0], "d MMM", { locale: ptBR })} — {format(weekDays[6], "d MMM", { locale: ptBR })}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"><ChevronRight size={12} /></button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-[10px] text-primary font-medium ml-0.5">Hoje</button>}
          </div>
        </div>

        {/* Mobile: compact day rows */}
        {isMobile ? (
          <div className="space-y-1.5">
            {weekDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isToday = dateStr === today;
              const dayRecs = getRecsForDay(day);
              const isExpanded = expandedWeekDay === dateStr;
              return (
                <motion.div key={dateStr} whileTap={{ scale: 0.98 }}>
                  <button
                    onClick={() => setExpandedWeekDay(isExpanded ? null : dateStr)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left ${isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-secondary/40'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {format(day, 'EEE d', { locale: ptBR })}
                      </span>
                      {dayRecs.length > 0 && (
                        <Badge variant={isToday ? 'default' : 'secondary'} className="text-[9px] h-4 px-1">
                          {dayRecs.length}
                        </Badge>
                      )}
                    </div>
                    {dayRecs.length > 0 && (
                      <div className="flex -space-x-1">
                        {dayRecs.slice(0, 4).map(rec => {
                          const color = getClientColor(rec.clientId);
                          return <div key={rec.id} className="w-3 h-3 rounded-full border border-background" style={{ backgroundColor: `hsl(${color})` }} />;
                        })}
                      </div>
                    )}
                  </button>
                  <AnimatePresence>
                    {isExpanded && dayRecs.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1 pt-1 pl-2">
                          {dayRecs.map(rec => {
                            const color = getClientColor(rec.clientId);
                            return (
                              <div key={rec.id} className="flex items-center gap-2 p-1.5 rounded text-[10px]" style={{ backgroundColor: `hsl(${color} / 0.08)`, borderLeft: `2px solid hsl(${color})` }}>
                                <span className="font-medium truncate" style={{ color: `hsl(${color})` }}>{getClientName(rec.clientId)}</span>
                                <span className="text-muted-foreground ml-auto shrink-0">{rec.startTime}</span>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Desktop: 7-col grid */
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
        )}
      </div>

      {/* CLIENT PROGRESS */}
      <div className="glass-card p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <FloatingRocket size={16} />
            <h3 className="font-display font-semibold text-xs sm:text-sm">Progresso por Cliente</h3>
          </div>
          <button onClick={() => navigate('/metas')} className="text-[10px] sm:text-[11px] text-primary font-semibold hover:underline">METAS</button>
        </div>
        {clientProgress.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
              <Rocket size={28} className="text-muted-foreground/40" />
            </motion.div>
            Nenhum cliente cadastrado
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {clientProgress.map(({ client, tasksDone, goal, recsDone, recsTotal, progress }) => (
              <motion.div key={client.id} whileTap={{ scale: 0.97 }} className="rounded-xl p-3 sm:p-4 border border-border bg-secondary/30" style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${client.color || '220 10% 50%'})` }}>
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <ClientLogo client={client} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold truncate">{client.companyName}</p>
                    <p className="text-[9px] sm:text-[11px] text-muted-foreground">{DAY_LABELS[client.fixedDay]} · {client.fixedTime}</p>
                  </div>
                  <span className="text-sm sm:text-lg font-display font-bold" style={{ color: progress >= 80 ? 'hsl(var(--success))' : progress >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))' }}>
                    {progress}%
                  </span>
                </div>
                <Progress value={progress} className="h-1.5 mb-1.5 sm:mb-2" />
                <div className="flex gap-2 sm:gap-3 text-[9px] sm:text-[11px] text-muted-foreground">
                  <span>Meta: {goal}</span>
                  <span>Feitas: {tasksDone}</span>
                  <span>Grav: {recsDone}/{recsTotal}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
