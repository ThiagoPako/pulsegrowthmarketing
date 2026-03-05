import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Film, Megaphone, Image, Palette, ExternalLink, Clock, AlertTriangle,
  Eye, Star, TrendingUp, BarChart3, Timer, Scissors, Kanban, ArrowRight, Check
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { highlightQuotes } from '@/lib/highlightQuotes';
import { format, differenceInHours, isPast, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400', points: 10 },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400', points: 5 },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400', points: 3 },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400', points: 2 },
];

interface EditorTask {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  kanban_column: string;
  description: string | null;
  script_id: string | null;
  recording_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  drive_link: string | null;
  editing_deadline: string | null;
  editing_started_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

function getDeadlineStatus(deadline: string | null) {
  if (!deadline) return { label: 'Sem prazo', variant: 'default' as const };
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const hoursLeft = differenceInHours(deadlineDate, now);
  if (isPast(deadlineDate)) return { label: 'Atrasado', variant: 'destructive' as const };
  if (hoursLeft <= 12) return { label: 'Vence hoje', variant: 'warning' as const };
  if (hoursLeft <= 24) return { label: 'Vence amanhã', variant: 'warning' as const };
  return { label: `${Math.ceil(hoursLeft / 24)}d restantes`, variant: 'success' as const };
}

function getTypeConfig(type: string) {
  return CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
}

export default function EditorDashboard() {
  const { clients, scripts } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<EditorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingScript, setViewingScript] = useState<any>(null);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase.from('content_tasks').select('*')
      .in('kanban_column', ['edicao', 'revisao', 'alteracao', 'envio'])
      .order('position', { ascending: true });
    if (data) setTasks(data as EditorTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase.channel('editor_dash_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const completedTasks = tasks.filter(t => t.kanban_column === 'envio');
  const weekCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: weekStart, end: weekEnd }));
  const monthCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: monthStart, end: monthEnd }));

  const calcPoints = (list: EditorTask[]) => list.reduce((sum, t) => sum + (getTypeConfig(t.content_type).points || 0), 0);
  const weekPoints = calcPoints(weekCompleted);
  const monthPoints = calcPoints(monthCompleted);

  const pendingTasks = tasks.filter(t => t.kanban_column === 'edicao');
  const overdueCount = pendingTasks.filter(t => getDeadlineStatus(t.editing_deadline).variant === 'destructive').length;
  const inReviewCount = tasks.filter(t => t.kanban_column === 'revisao').length;

  const avgTimes = useMemo(() => {
    const byType: Record<string, number[]> = {};
    completedTasks.forEach(t => {
      if (t.editing_started_at && t.updated_at) {
        const hours = (new Date(t.updated_at).getTime() - new Date(t.editing_started_at).getTime()) / (1000 * 60 * 60);
        if (hours > 0 && hours < 200) {
          if (!byType[t.content_type]) byType[t.content_type] = [];
          byType[t.content_type].push(hours);
        }
      }
    });
    return Object.entries(byType).map(([type, times]) => ({
      type, avg: times.reduce((a, b) => a + b, 0) / times.length, count: times.length,
    }));
  }, [completedTasks]);

  const openScript = (scriptId: string) => {
    const script = scripts.find(s => s.id === scriptId);
    if (script) { setViewingScript(script); setScriptDialogOpen(true); }
  };

  const sortedPending = [...pendingTasks].sort((a, b) => {
    if (!a.editing_deadline && !b.editing_deadline) return 0;
    if (!a.editing_deadline) return 1;
    if (!b.editing_deadline) return -1;
    return new Date(a.editing_deadline).getTime() - new Date(b.editing_deadline).getTime();
  });

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;

  const stats = [
    { label: 'Para Editar', value: pendingTasks.length, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Atrasados', value: overdueCount, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Em Revisão', value: inReviewCount, icon: Eye, color: 'text-teal-500', bg: 'bg-teal-500/10' },
    { label: 'Pontos (Semana)', value: weekPoints, icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Pontos (Mês)', value: monthPoints, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Concluídos (Mês)', value: monthCompleted.length, icon: Check, color: 'text-green-500', bg: 'bg-green-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Scissors size={20} className="text-primary" /> Painel do Editor
          </h1>
          <p className="text-sm text-muted-foreground">
            {pendingTasks.length} vídeo{pendingTasks.length !== 1 ? 's' : ''} para editar
            {overdueCount > 0 && <span className="text-destructive font-semibold"> · {overdueCount} atrasado{overdueCount !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/edicao/kanban')}>
          <Kanban size={14} /> Abrir Kanban <ArrowRight size={12} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`${s.bg} rounded-xl p-3 border border-border/50`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Production + Avg Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-primary" /> Produção do Mês
          </h3>
          <div className="space-y-2">
            {CONTENT_TYPES.map(ct => {
              const count = monthCompleted.filter(t => t.content_type === ct.value).length;
              const pts = count * ct.points;
              return (
                <div key={ct.value} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ct.icon size={14} className={ct.color.split(' ')[0]} />
                    <span className="text-sm text-foreground">{ct.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground">{count}</span>
                    <Badge variant="outline" className="text-[10px]">
                      <Star size={9} className="mr-0.5 text-amber-500" /> {pts} pts
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Timer size={14} className="text-primary" /> Tempo Médio de Edição
          </h3>
          {avgTimes.length > 0 ? (
            <div className="space-y-2">
              {avgTimes.map(at => {
                const cfg = getTypeConfig(at.type);
                const hours = Math.floor(at.avg);
                const mins = Math.round((at.avg - hours) * 60);
                return (
                  <div key={at.type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <cfg.icon size={14} className={cfg.color.split(' ')[0]} />
                      <span className="text-sm text-foreground">{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{hours > 0 ? `${hours}h ` : ''}{mins}min</span>
                      <span className="text-[10px] text-muted-foreground">({at.count} edições)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Dados insuficientes para calcular</p>
          )}
        </div>
      </div>

      {/* Pending cards - available for editing */}
      <div>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Film size={14} className="text-primary" /> Vídeos Disponíveis para Edição
          <Badge variant="outline" className="ml-1">{sortedPending.length}</Badge>
        </h3>

        {sortedPending.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted-foreground">Nenhum vídeo pendente para edição 🎉</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedPending.map((task, i) => {
              const client = clients.find(c => c.id === task.client_id);
              const cfg = getTypeConfig(task.content_type);
              const deadline = getDeadlineStatus(task.editing_deadline);
              const clientColor = client?.color || '217 91% 60%';
              const isExpanded = expandedCard === task.id;

              return (
                <motion.div key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all ${
                    deadline.variant === 'destructive' ? 'ring-1 ring-destructive/40' : ''
                  }`}
                  onClick={() => setExpandedCard(isExpanded ? null : task.id)}
                >
                  <div className="h-1.5 w-full" style={{ backgroundColor: `hsl(${clientColor})` }} />
                  <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClientLogo client={client as any} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{client?.companyName || 'Cliente'}</p>
                          <Badge className={`text-[10px] px-1.5 py-0 ${cfg.color} border-0`}>
                            <cfg.icon size={10} className="mr-0.5" />{cfg.label}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant={deadline.variant === 'destructive' ? 'destructive' : 'outline'}
                        className={`text-[10px] shrink-0 ${
                          deadline.variant === 'warning' ? 'bg-warning/20 text-warning border-warning/30' :
                          deadline.variant === 'success' ? 'bg-success/20 text-success border-success/30' : ''
                        }`}>
                        {deadline.variant === 'destructive' && <AlertTriangle size={10} className="mr-0.5" />}
                        {deadline.variant === 'warning' && <Clock size={10} className="mr-0.5" />}
                        {deadline.label}
                      </Badge>
                    </div>

                    <p className="text-sm font-semibold text-foreground leading-tight">{task.title}</p>

                    {task.editing_deadline && (
                      <p className="text-[11px] text-muted-foreground">
                        Prazo: {format(new Date(task.editing_deadline), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}

                    {/* Expanded details */}
                    {isExpanded && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-2 pt-2 border-t border-border">
                        {task.description && (
                          <p className="text-xs text-muted-foreground">{task.description}</p>
                        )}
                        {task.script_id && (
                          <button onClick={(e) => { e.stopPropagation(); openScript(task.script_id!); }}
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                            <Eye size={12} /> Ver roteiro gravado
                          </button>
                        )}
                        {task.drive_link && (
                          <a href={task.drive_link} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                            <ExternalLink size={12} />📁 Abrir materiais no Drive
                          </a>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <Badge variant="outline" className="text-[10px]">
                            <Star size={9} className="mr-0.5 text-amber-500" /> {cfg.points} pts
                          </Badge>
                          {task.editing_started_at && (
                            <span className="text-[10px] text-muted-foreground">
                              Iniciado em {format(new Date(task.editing_started_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Script viewer dialog */}
      <Dialog open={scriptDialogOpen} onOpenChange={setScriptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye size={18} /> {viewingScript?.title || 'Roteiro'}</DialogTitle>
          </DialogHeader>
          {viewingScript && (
            <div className="prose prose-sm max-w-none p-4 rounded-xl bg-muted/30 border border-border min-h-[200px]"
              dangerouslySetInnerHTML={{ __html: highlightQuotes(viewingScript.content) || '<em>Sem conteúdo</em>' }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
