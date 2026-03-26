import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import UserAvatar from '@/components/UserAvatar';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';
import { EDITOR_SCORE, VM_SCORE, DESIGNER_SCORE } from '@/lib/scoringSystem';
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

interface TaskStats {
  totalTasks: number;
  avgTimeSeconds: number;
  totalTimeSeconds: number;
  score: number;
  byStatus: Record<string, number>;
  byContentType: Record<string, number>;
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
      if (role === 'editor') {
        await loadEditorStats(member.id, startStr, endStr);
      } else if (role === 'videomaker') {
        await loadVideomakerStats(member.id, startStr, endStr);
      } else if (role === 'designer') {
        await loadDesignerStats(member.id, startStr, endStr);
      } else {
        // Generic: content tasks created_by
        await loadGenericStats(member.id, startStr, endStr);
      }
    } catch (err) {
      console.error('Stats error:', err);
    }
    setLoading(false);
  };

  const loadEditorStats = async (userId: string, startStr: string, endStr: string) => {
    // Get tasks where this editor worked (edited_by or assigned_to)
    const { data: tasks } = await supabase
      .from('content_tasks')
      .select('id, kanban_column, content_type, editing_started_at, editing_paused_seconds, editing_paused_at, approved_at, updated_at, edited_by, assigned_to')
      .or(`edited_by.eq.${userId},assigned_to.eq.${userId}`)
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    // Get task_history for time calculations
    const { data: history } = await supabase
      .from('task_history')
      .select('task_id, action, created_at, user_id')
      .eq('user_id', userId)
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const editorTasks = tasks || [];
    const byStatus: Record<string, number> = {};
    const byContentType: Record<string, number> = {};
    let totalEditingTime = 0;
    let tasksWithTime = 0;
    let score = 0;

    editorTasks.forEach(t => {
      const col = t.kanban_column;
      byStatus[col] = (byStatus[col] || 0) + 1;
      byContentType[t.content_type] = (byContentType[t.content_type] || 0) + 1;

      // Calculate real editing time (excluding paused time)
      if (t.editing_started_at) {
        const start = new Date(t.editing_started_at).getTime();
        const pausedSecs = t.editing_paused_seconds || 0;
        let end: number;

        if (t.editing_paused_at) {
          // Currently paused — count time up to pause
          end = new Date(t.editing_paused_at).getTime();
        } else if (['revisao', 'envio', 'agendamentos', 'acompanhamento', 'arquivado'].includes(col)) {
          // Task already moved past editing — use updated_at as end
          end = new Date(t.updated_at).getTime();
        } else {
          end = Date.now();
        }

        const realTime = Math.max(0, Math.floor((end - start) / 1000) - pausedSecs);
        totalEditingTime += realTime;
        tasksWithTime++;
      }

      // Score
      if (['agendamentos', 'acompanhamento', 'arquivado', 'envio'].includes(col)) {
        score += EDITOR_SCORE.APROVADO;
      } else if (col === 'edicao') {
        score += EDITOR_SCORE.EM_EDICAO;
      } else if (col === 'revisao') {
        score += EDITOR_SCORE.REVISAO;
      } else if (col === 'alteracao') {
        score += EDITOR_SCORE.ALTERACAO;
      }
    });

    setStats({
      totalTasks: editorTasks.length,
      avgTimeSeconds: tasksWithTime > 0 ? Math.floor(totalEditingTime / tasksWithTime) : 0,
      totalTimeSeconds: totalEditingTime,
      score,
      byStatus,
      byContentType,
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
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-2">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
                <CheckCircle2 size={18} className="mx-auto text-primary mb-1" />
                <p className="text-xl font-bold text-primary">{stats.totalTasks}</p>
                <p className="text-[10px] text-muted-foreground">Entregas / Tarefas</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-center">
                <Trophy size={18} className="mx-auto text-warning mb-1" />
                <p className="text-xl font-bold text-warning">{stats.score}</p>
                <p className="text-[10px] text-muted-foreground">Pontuação</p>
              </motion.div>

              {stats.avgTimeSeconds > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="p-3 rounded-lg bg-info/5 border border-info/20 text-center">
                  <Clock size={18} className="mx-auto text-info mb-1" />
                  <p className="text-xl font-bold text-info">{formatTime(stats.avgTimeSeconds)}</p>
                  <p className="text-[10px] text-muted-foreground">Tempo médio / tarefa</p>
                </motion.div>
              )}

              {stats.totalTimeSeconds > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="p-3 rounded-lg bg-success/5 border border-success/20 text-center">
                  <TrendingUp size={18} className="mx-auto text-success mb-1" />
                  <p className="text-xl font-bold text-success">{formatTime(stats.totalTimeSeconds)}</p>
                  <p className="text-[10px] text-muted-foreground">Tempo dedicado total</p>
                </motion.div>
              )}
            </div>

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

            {/* By Content Type */}
            {Object.keys(stats.byContentType).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por Tipo de Conteúdo</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stats.byContentType).map(([type, count]) => (
                    <Badge key={type} variant="secondary" className="text-xs gap-1">
                      {type === 'reels' ? <Film size={10} /> : type === 'arte' ? <Palette size={10} /> : null}
                      {type}: {count}
                    </Badge>
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