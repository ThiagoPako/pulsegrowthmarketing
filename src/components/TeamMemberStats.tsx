import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import UserAvatar from '@/components/UserAvatar';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';
import { EDITOR_SCORE, VM_SCORE, DESIGNER_SCORE, EDITOR_APPROVED_COLUMNS } from '@/lib/scoringSystem';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Trophy, CheckCircle2, TrendingUp, Film, Palette, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  displayName?: string;
  jobTitle?: string;
}

interface Props {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ContentTypeMetric {
  count: number;
  totalTime: number;
  avgTime: number;
}

interface TaskStats {
  totalTasks: number;
  avgTimeSeconds: number;
  totalTimeSeconds: number;
  score: number;
  byStatus: Record<string, number>;
  byContentType: Record<string, number>;
  byContentTypeMetrics?: Record<string, ContentTypeMetric>;
}

interface AgencyHoursSettings {
  shiftAStart: string;
  shiftAEnd: string;
  shiftBStart: string;
  shiftBEnd: string;
  workDays: string[];
}

const DEFAULT_AGENCY_HOURS: AgencyHoursSettings = {
  shiftAStart: '08:30',
  shiftAEnd: '12:00',
  shiftBStart: '14:30',
  shiftBEnd: '18:00',
  workDays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
};

const EDITING_START_ACTIONS = new Set(['Edição iniciada', 'Alteração iniciada', 'Edição retomada']);
const EDITING_STOP_ACTIONS = new Set(['Edição pausada', 'Enviado para revisão']);
const FINISHED_EDITING_COLUMNS = new Set(['revisao', 'envio', 'agendamentos', 'acompanhamento', 'arquivado']);
const WEEK_DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function buildDateAtMinutes(baseDate: Date, totalMinutes: number) {
  const next = new Date(baseDate);
  next.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return next;
}

function getOverlapSeconds(startA: Date, endA: Date, startB: Date, endB: Date) {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  return end > start ? Math.floor((end - start) / 1000) : 0;
}

function getBusinessActiveSeconds(start: Date, end: Date, settings: AgencyHoursSettings) {
  if (end <= start) return 0;

  let totalSeconds = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(end);
  lastDay.setHours(0, 0, 0, 0);

  while (cursor <= lastDay) {
    const dayKey = WEEK_DAY_KEYS[cursor.getDay()];

    if (settings.workDays.includes(dayKey)) {
      const shifts = [
        [settings.shiftAStart, settings.shiftAEnd],
        [settings.shiftBStart, settings.shiftBEnd],
      ];

      for (const [shiftStart, shiftEnd] of shifts) {
        if (!shiftStart || !shiftEnd) continue;

        const shiftStartDate = buildDateAtMinutes(cursor, timeToMinutes(shiftStart));
        const shiftEndDate = buildDateAtMinutes(cursor, timeToMinutes(shiftEnd));
        totalSeconds += getOverlapSeconds(start, end, shiftStartDate, shiftEndDate);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return totalSeconds;
}

export default function TeamMemberStats({ member, open, onOpenChange }: Props) {
  const [period, setPeriod] = useState('current');
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'current') return { start: startOfMonth(now), end: endOfMonth(now) };
    if (period === 'last') return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
  }, [period]);

  useEffect(() => {
    if (!member || !open) return;
    loadStats();
  }, [member, open, period]);

  const loadStats = async () => {
    if (!member) return;
    setLoading(true);

    const role = member.role;
    const startStr = dateRange.start.toISOString();
    const endStr = dateRange.end.toISOString();

    try {
      const { data: settingsRows } = await supabase
        .from('company_settings')
        .select('shift_a_start, shift_a_end, shift_b_start, shift_b_end, work_days')
        .limit(1);

      const settingsRow = settingsRows?.[0];
      const agencyHours: AgencyHoursSettings = settingsRow ? {
        shiftAStart: settingsRow.shift_a_start || DEFAULT_AGENCY_HOURS.shiftAStart,
        shiftAEnd: settingsRow.shift_a_end || DEFAULT_AGENCY_HOURS.shiftAEnd,
        shiftBStart: settingsRow.shift_b_start || DEFAULT_AGENCY_HOURS.shiftBStart,
        shiftBEnd: settingsRow.shift_b_end || DEFAULT_AGENCY_HOURS.shiftBEnd,
        workDays: settingsRow.work_days || DEFAULT_AGENCY_HOURS.workDays,
      } : DEFAULT_AGENCY_HOURS;

      if (role === 'editor') {
        await loadEditorStats(member.id, startStr, endStr, agencyHours);
      } else if (role === 'videomaker') {
        await loadVideomakerStats(member.id, startStr, endStr);
      } else if (role === 'designer') {
        await loadDesignerStats(member.id, startStr, endStr);
      } else {
        await loadGenericStats(member.id, startStr, endStr);
      }
    } catch (err) {
      console.error('Stats error:', err);
    }
    setLoading(false);
  };

  const loadEditorStats = async (
    userId: string,
    startStr: string,
    endStr: string,
    agencyHours: AgencyHoursSettings,
  ) => {
    const [{ data: tasks }, { data: history }] = await Promise.all([
      supabase
        .from('content_tasks')
        .select('id, kanban_column, content_type, editing_started_at, approved_at, updated_at, edited_by')
        .eq('edited_by', userId)
        .gte('editing_started_at', startStr)
        .lte('editing_started_at', endStr),
      supabase
        .from('task_history')
        .select('task_id, action, created_at, user_id')
        .eq('user_id', userId)
        .gte('created_at', startStr)
        .lte('created_at', endStr)
        .order('created_at', { ascending: true }),
    ]);

    const editorTasks = tasks || [];
    const historyByTask = new Map<string, Array<{ action: string; created_at: string }>>();

    (history || []).forEach((entry: any) => {
      if (!historyByTask.has(entry.task_id)) historyByTask.set(entry.task_id, []);
      historyByTask.get(entry.task_id)!.push({ action: entry.action, created_at: entry.created_at });
    });

    const byStatus: Record<string, number> = {};
    const byContentType: Record<string, number> = {};
    const metricsMap: Record<string, { count: number; totalTime: number }> = {};
    let totalEditingTime = 0;
    let tasksWithTime = 0;
    let score = 0;

    editorTasks.forEach((task: any) => {
      const col = task.kanban_column;
      byStatus[col] = (byStatus[col] || 0) + 1;

      const cType = task.content_type || 'outro';
      byContentType[cType] = (byContentType[cType] || 0) + 1;
      if (!metricsMap[cType]) metricsMap[cType] = { count: 0, totalTime: 0 };

      const taskEvents = historyByTask.get(task.id) || [];
      let activeStart: Date | null = null;
      let activeSeconds = 0;

      taskEvents.forEach((event) => {
        const eventDate = new Date(event.created_at);

        if (EDITING_START_ACTIONS.has(event.action)) {
          activeStart = eventDate;
          return;
        }

        if (EDITING_STOP_ACTIONS.has(event.action) && activeStart) {
          activeSeconds += getBusinessActiveSeconds(activeStart, eventDate, agencyHours);
          activeStart = null;
        }
      });

      if (activeStart) {
        const endDate = FINISHED_EDITING_COLUMNS.has(col)
          ? new Date(task.approved_at || task.updated_at || activeStart)
          : new Date();
        activeSeconds += getBusinessActiveSeconds(activeStart, endDate, agencyHours);
      }

      metricsMap[cType].count += 1;
      metricsMap[cType].totalTime += activeSeconds;
      totalEditingTime += activeSeconds;
      if (activeSeconds > 0) tasksWithTime++;

      if (!!task.approved_at || EDITOR_APPROVED_COLUMNS.includes(col as any)) {
        score += EDITOR_SCORE.APROVADO;
      } else if (col === 'edicao') {
        score += EDITOR_SCORE.EM_EDICAO;
      } else if (col === 'revisao') {
        score += EDITOR_SCORE.REVISAO;
      } else if (col === 'alteracao') {
        score += EDITOR_SCORE.ALTERACAO;
      }
    });

    const byContentTypeMetrics: Record<string, ContentTypeMetric> = {};
    Object.entries(metricsMap).forEach(([type, metric]) => {
      byContentTypeMetrics[type] = {
        count: metric.count,
        totalTime: metric.totalTime,
        avgTime: metric.count > 0 ? Math.floor(metric.totalTime / metric.count) : 0,
      };
    });

    setStats({
      totalTasks: editorTasks.length,
      avgTimeSeconds: tasksWithTime > 0 ? Math.floor(totalEditingTime / tasksWithTime) : 0,
      totalTimeSeconds: totalEditingTime,
      score,
      byStatus,
      byContentType,
      byContentTypeMetrics,
    });
  };

  const loadVideomakerStats = async (userId: string, startStr: string, endStr: string) => {
    const { data: deliveries } = await supabase
      .from('delivery_records')
      .select('*')
      .eq('videomaker_id', userId)
      .gte('date', startStr.slice(0, 10))
      .lte('date', endStr.slice(0, 10));

    const { data: recordings } = await supabase
      .from('recordings')
      .select('id, status')
      .eq('videomaker_id', userId)
      .gte('date', startStr.slice(0, 10))
      .lte('date', endStr.slice(0, 10));

    const recs = deliveries || [];
    const byContentType: Record<string, number> = {};
    let score = 0;
    let totalProduced = 0;

    recs.forEach(d => {
      const reels = d.reels_produced || 0;
      const creatives = d.creatives_produced || 0;
      const stories = d.stories_produced || 0;
      const arts = d.arts_produced || 0;
      const extras = d.extras_produced || 0;

      byContentType['Reels'] = (byContentType['Reels'] || 0) + reels;
      byContentType['Criativos'] = (byContentType['Criativos'] || 0) + creatives;
      byContentType['Stories'] = (byContentType['Stories'] || 0) + stories;
      byContentType['Artes'] = (byContentType['Artes'] || 0) + arts;
      byContentType['Extras'] = (byContentType['Extras'] || 0) + extras;

      totalProduced += reels + creatives + stories + arts + extras;
      score += reels * VM_SCORE.REEL + creatives * VM_SCORE.CRIATIVO + stories * VM_SCORE.STORY + arts * VM_SCORE.ARTE + extras * VM_SCORE.EXTRA;
    });

    const completedRecs = (recordings || []).filter(r => r.status === 'concluida').length;
    score += completedRecs * VM_SCORE.GRAVACAO;

    setStats({
      totalTasks: totalProduced,
      avgTimeSeconds: 0,
      totalTimeSeconds: 0,
      score,
      byStatus: { 'Gravações concluídas': completedRecs, 'Conteúdos produzidos': totalProduced },
      byContentType,
    });
  };

  const loadDesignerStats = async (userId: string, startStr: string, endStr: string) => {
    const { data: tasks } = await supabase
      .from('design_tasks')
      .select('id, kanban_column, format_type, time_spent_seconds, started_at, completed_at, version, priority')
      .eq('assigned_to', userId)
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const designTasks = tasks || [];
    const byStatus: Record<string, number> = {};
    const byContentType: Record<string, number> = {};
    let totalTime = 0;
    let tasksWithTime = 0;
    let score = 0;

    designTasks.forEach(t => {
      byStatus[t.kanban_column] = (byStatus[t.kanban_column] || 0) + 1;
      byContentType[t.format_type] = (byContentType[t.format_type] || 0) + 1;

      if (t.time_spent_seconds > 0) {
        totalTime += t.time_spent_seconds;
        tasksWithTime++;
      }

      if (t.kanban_column === 'concluida') {
        score += DESIGNER_SCORE.CONCLUIDO;
      } else if (['em_progresso', 'revisao_interna'].includes(t.kanban_column)) {
        score += DESIGNER_SCORE.EM_PROGRESSO;
      }
      score += (t.version - 1) * DESIGNER_SCORE.POR_VERSAO;
      if (t.priority === 'alta' || t.priority === 'urgente') score += DESIGNER_SCORE.PRIORIDADE;
    });

    setStats({
      totalTasks: designTasks.length,
      avgTimeSeconds: tasksWithTime > 0 ? Math.floor(totalTime / tasksWithTime) : 0,
      totalTimeSeconds: totalTime,
      score,
      byStatus,
      byContentType,
    });
  };

  const loadGenericStats = async (userId: string, startStr: string, endStr: string) => {
    const { data: tasks } = await supabase
      .from('content_tasks')
      .select('id, kanban_column, content_type')
      .eq('created_by', userId)
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const byStatus: Record<string, number> = {};
    const byContentType: Record<string, number> = {};
    (tasks || []).forEach(t => {
      byStatus[t.kanban_column] = (byStatus[t.kanban_column] || 0) + 1;
      byContentType[t.content_type] = (byContentType[t.content_type] || 0) + 1;
    });

    setStats({
      totalTasks: (tasks || []).length,
      avgTimeSeconds: 0,
      totalTimeSeconds: 0,
      score: 0,
      byStatus,
      byContentType,
    });
  };

  const formatTime = (seconds: number) => {
    if (seconds === 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  };

  const contentTypeLabels: Record<string, string> = {
    reels: 'Reels', criativo: 'Criativo', story: 'Story', stories: 'Stories',
    arte: 'Arte', carrossel: 'Carrossel', foto: 'Foto', outro: 'Outro',
    feed: 'Feed', video: 'Vídeo',
  };

  const statusLabels: Record<string, string> = {
    ideias: 'Ideias', captacao: 'Captação', edicao: 'Edição', revisao: 'Revisão',
    alteracao: 'Alteração', envio: 'Enviado', agendamentos: 'Agendamentos',
    acompanhamento: 'Acompanhamento', arquivado: 'Arquivado',
    nova_tarefa: 'Nova', em_progresso: 'Em Progresso', revisao_interna: 'Revisão Int.',
    enviada_cliente: 'Env. Cliente', concluida: 'Concluída',
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 size={18} /> Desempenho do Membro
          </DialogTitle>
        </DialogHeader>

        {/* Member info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
          <UserAvatar user={member} size="lg" />
          <div className="flex-1">
            <p className="font-semibold text-sm">{member.displayName || member.name}</p>
            <p className="text-xs text-muted-foreground">{member.email}</p>
            <Badge variant="outline" className="text-[10px] mt-1">{ROLE_LABELS[member.role]}</Badge>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Período:</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">
                {format(startOfMonth(new Date()), 'MMMM yyyy', { locale: ptBR })}
              </SelectItem>
              <SelectItem value="last">
                {format(startOfMonth(subMonths(new Date(), 1)), 'MMMM yyyy', { locale: ptBR })}
              </SelectItem>
              <SelectItem value="trimester">Últimos 3 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : stats ? (
          <div className="space-y-4">
            {/* KPI Cards - top row */}
            <div className="grid grid-cols-2 gap-2">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
                <CheckCircle2 size={18} className="mx-auto text-primary mb-1" />
                <p className="text-xl font-bold text-primary">{stats.totalTasks}</p>
                <p className="text-[10px] text-muted-foreground">Total de Edições</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-center">
                <Trophy size={18} className="mx-auto text-warning mb-1" />
                <p className="text-xl font-bold text-warning">{stats.score}</p>
                <p className="text-[10px] text-muted-foreground">Pontuação</p>
              </motion.div>

              {stats.totalTimeSeconds > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="p-3 rounded-lg bg-success/5 border border-success/20 text-center col-span-2">
                  <TrendingUp size={18} className="mx-auto text-success mb-1" />
                  <p className="text-xl font-bold text-success">{formatTime(stats.totalTimeSeconds)}</p>
                  <p className="text-[10px] text-muted-foreground">Horas totais de edição</p>
                </motion.div>
              )}
            </div>

            {/* Per content type metrics */}
            {stats.byContentTypeMetrics && Object.keys(stats.byContentTypeMetrics).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Edições por Tipo de Conteúdo</p>
                <div className="space-y-2">
                  {Object.entries(stats.byContentTypeMetrics)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([type, m], i) => {
                      const label = contentTypeLabels[type] || type;
                      const icon = type === 'reels' ? <Film size={14} /> : type === 'criativo' ? <Palette size={14} /> : <Film size={14} />;
                      return (
                        <motion.div key={type} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border">
                          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">{label}</p>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                              <span>{m.count} edições</span>
                              {m.avgTime > 0 && <span>⏱ média: {formatTime(m.avgTime)}</span>}
                              {m.totalTime > 0 && <span>∑ {formatTime(m.totalTime)}</span>}
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs font-bold">{m.count}</Badge>
                        </motion.div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Fallback: generic content type badges (non-editor) */}
            {!stats.byContentTypeMetrics && Object.keys(stats.byContentType).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por Tipo de Conteúdo</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stats.byContentType).map(([type, count]) => (
                    <Badge key={type} variant="secondary" className="text-xs gap-1">
                      {type === 'reels' ? <Film size={10} /> : type === 'arte' ? <Palette size={10} /> : null}
                      {contentTypeLabels[type] || type}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* By Status */}
            {Object.keys(stats.byStatus).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por Status</p>
                <div className="space-y-1">
                  {Object.entries(stats.byStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between p-2 rounded bg-muted/30">
                      <span className="text-xs">{statusLabels[status] || status}</span>
                      <Badge variant="outline" className="text-xs">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">Nenhum dado encontrado</div>
        )}
      </DialogContent>
    </Dialog>
  );
}