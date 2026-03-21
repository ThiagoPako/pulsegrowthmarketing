import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { ROLE_LABELS } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Video, Palette, Film, Megaphone, Users, ChevronDown, ChevronUp, TrendingUp, Star } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import { useIsMobile } from '@/hooks/use-mobile';

interface MemberPerformance {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
  score: number;
  maxScore: number;
  metrics: { label: string; value: number }[];
}

const ROLE_ICONS: Record<string, any> = {
  videomaker: Video, editor: Film, designer: Palette,
  social_media: Megaphone, fotografo: Palette, parceiro: Users,
};

const ROLE_GRADIENT: Record<string, string> = {
  videomaker: 'from-red-500/20 to-orange-500/10',
  editor: 'from-blue-500/20 to-cyan-500/10',
  designer: 'from-amber-500/20 to-yellow-500/10',
  social_media: 'from-violet-500/20 to-purple-500/10',
  fotografo: 'from-pink-500/20 to-rose-500/10',
  parceiro: 'from-emerald-500/20 to-green-500/10',
};

const ROLE_ACCENT: Record<string, string> = {
  videomaker: 'bg-red-500', editor: 'bg-blue-500', designer: 'bg-amber-500',
  social_media: 'bg-violet-500', fotografo: 'bg-pink-500', parceiro: 'bg-emerald-500',
};

const ROLE_TEXT: Record<string, string> = {
  videomaker: 'text-red-400', editor: 'text-blue-400', designer: 'text-amber-400',
  social_media: 'text-violet-400', fotografo: 'text-pink-400', parceiro: 'text-emerald-400',
};

const ROLE_BORDER: Record<string, string> = {
  videomaker: 'border-red-500/20', editor: 'border-blue-500/20', designer: 'border-amber-500/20',
  social_media: 'border-violet-500/20', fotografo: 'border-pink-500/20', parceiro: 'border-emerald-500/20',
};

export default function TeamPerformanceWidget() {
  const { users, recordings, clients } = useApp();
  const isMobile = useIsMobile();
  const [deliveryRecords, setDeliveryRecords] = useState<any[]>([]);
  const [contentTasks, setContentTasks] = useState<any[]>([]);
  const [designTasks, setDesignTasks] = useState<any[]>([]);
  const [smDeliveries, setSmDeliveries] = useState<any[]>([]);
  const [partnerTasks, setPartnerTasks] = useState<any[]>([]);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  useEffect(() => {
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    Promise.all([
      supabase.from('delivery_records').select('*').gte('date', monthStart).lte('date', monthEnd),
      supabase.from('content_tasks').select('*'),
      supabase.from('design_tasks').select('*'),
      supabase.from('social_media_deliveries').select('*').gte('delivered_at', monthStart).lte('delivered_at', monthEnd),
      supabase.from('endomarketing_partner_tasks').select('*').gte('date', monthStart).lte('date', monthEnd),
    ]).then(([dr, ct, dt, smd, pt]) => {
      if (dr.data) setDeliveryRecords(dr.data);
      if (ct.data) setContentTasks(ct.data);
      if (dt.data) setDesignTasks(dt.data);
      if (smd.data) setSmDeliveries(smd.data);
      if (pt.data) setPartnerTasks(pt.data);
    });
  }, []);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const teamMembers = useMemo(() => {
    const members: MemberPerformance[] = [];
    const teamUsers = users.filter(u => u.role !== 'admin');

    for (const user of teamUsers) {
      let score = 0;
      let maxScore = 100;
      const metrics: { label: string; value: number }[] = [];

      if (user.role === 'videomaker') {
        // Videomaker: gravação exige deslocamento, setup, tempo no local
        const vmDeliveries = deliveryRecords.filter(r => r.videomaker_id === user.id);
        const reels = vmDeliveries.reduce((a, r) => a + (r.reels_produced || 0), 0);
        const creatives = vmDeliveries.reduce((a, r) => a + (r.creatives_produced || 0), 0);
        const stories = vmDeliveries.reduce((a, r) => a + (r.stories_produced || 0), 0);
        const extras = vmDeliveries.reduce((a, r) => a + (r.extras_produced || 0), 0);
        const arts = vmDeliveries.reduce((a, r) => a + (r.arts_produced || 0), 0);
        const weekRecs = recordings.filter(r =>
          r.videomakerId === user.id &&
          isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd })
        );
        const weekDone = weekRecs.filter(r => r.status === 'concluida').length;
        // Pontuação por esforço: Reel (roteiro+gravação+setup) = 12pts, Criativo (setup+gravação) = 6pts
        // Story (rápido, menor esforço) = 3pts, Extra (fora do padrão, esforço adicional) = 10pts
        // Gravação concluída na semana = 15pts (deslocamento+tempo no local)
        score = reels * 12 + creatives * 6 + stories * 3 + extras * 10 + arts * 4 + weekDone * 15;
        metrics.push(
          { label: 'Reels', value: reels },
          { label: 'Criativos', value: creatives },
          { label: 'Stories', value: stories },
          { label: 'Extras', value: extras },
          { label: 'Grav. Sem.', value: weekDone },
        );
        maxScore = Math.max(score, 200);

      } else if (user.role === 'editor') {
        // Editor: edição de vídeo é trabalho intenso e técnico
        const editorTasks = contentTasks.filter(t => t.assigned_to === user.id);
        const approved = editorTasks.filter(t => ['aprovado', 'publicado', 'finalizado'].includes(t.kanban_column)).length;
        const inRevision = editorTasks.filter(t => t.kanban_column === 'revisao').length;
        const inEditing = editorTasks.filter(t => t.kanban_column === 'em_edicao').length;
        const alterations = editorTasks.filter(t => t.kanban_column === 'alteracao').length;
        const priorityTasks = editorTasks.filter(t => t.editing_priority === true).length;
        // Aprovado/finalizado (ciclo completo) = 15pts, Em edição (esforço ativo) = 5pts
        // Revisão (aguardando feedback) = 3pts, Alteração (retrabalho) = 8pts (exige atenção extra)
        // Tarefa prioritária = bônus +5pts por tarefa
        score = approved * 15 + inEditing * 5 + inRevision * 3 + alterations * 8 + priorityTasks * 5;
        metrics.push(
          { label: 'Aprovados', value: approved },
          { label: 'Editando', value: inEditing },
          { label: 'Alterações', value: alterations },
          { label: 'Prioritários', value: priorityTasks },
        );
        maxScore = Math.max(score, 150);

      } else if (user.role === 'designer' || user.role === 'fotografo') {
        // Designer/Fotógrafo: criação visual exige conceito, execução e revisões
        const dTasks = designTasks.filter(t => t.assigned_to === user.id);
        const completed = dTasks.filter(t => ['concluida', 'aprovada_cliente'].includes(t.kanban_column)).length;
        const inProgress = dTasks.filter(t => ['em_andamento', 'revisao'].includes(t.kanban_column)).length;
        const totalTime = dTasks.reduce((a, t) => a + (t.time_spent_seconds || 0), 0);
        const totalVersions = dTasks.reduce((a, t) => a + (t.version || 1), 0);
        const highPriority = dTasks.filter(t => t.priority === 'alta' || t.priority === 'urgente').length;
        // Concluída = 12pts, Em progresso = 4pts, Cada hora trabalhada = 2pts
        // Versões extras (revisões do cliente) = 3pts por versão, Prioridade alta/urgente = bônus +6pts
        score = completed * 12 + inProgress * 4 + Math.round(totalTime / 3600) * 2 + totalVersions * 3 + highPriority * 6;
        metrics.push(
          { label: 'Concluídos', value: completed },
          { label: 'Em progresso', value: inProgress },
          { label: 'Tempo (h)', value: Math.round(totalTime / 3600) },
          { label: 'Versões', value: totalVersions },
        );
        maxScore = Math.max(score, 120);

      } else if (user.role === 'social_media') {
        // Social Media: gestão de conteúdo, postagem, planejamento, roteiros
        const smCreated = contentTasks.filter(t => t.created_by === user.id);
        const published = smCreated.filter(t => t.kanban_column === 'publicado').length;
        const managed = smCreated.length;
        const userDeliveries = smDeliveries.filter(d => d.created_by === user.id);
        const posted = userDeliveries.filter(d => d.status === 'posted' || d.posted_at).length;
        const scheduled = userDeliveries.filter(d => d.status === 'scheduled').length;
        const scriptsCreated = (useApp as any)?.scripts?.filter?.((s: any) => s.created_by === user.id)?.length || 0;
        // Publicado = 10pts (resultado final), Agendado = 5pts (planejamento), Gerenciado = 2pts
        // Postado em rede social = 8pts (execução), Roteiro criado = 6pts (esforço criativo)
        score = published * 10 + posted * 8 + scheduled * 5 + managed * 2;
        metrics.push(
          { label: 'Publicados', value: published },
          { label: 'Postados', value: posted },
          { label: 'Agendados', value: scheduled },
          { label: 'Gerenciados', value: managed },
        );
        maxScore = Math.max(score, 120);

      } else if (user.role === 'parceiro') {
        // Parceiro: atendimentos de endomarketing exigem deslocamento e presença
        const pTasks = partnerTasks.filter(t => t.partner_id === user.id);
        const completed = pTasks.filter(t => t.status === 'completed' || t.completed_at).length;
        const pending = pTasks.filter(t => t.status === 'pending' || t.status === 'scheduled').length;
        const totalMinutes = pTasks.reduce((a, t) => a + (t.duration_minutes || 0), 0);
        // Atendimento concluído = 15pts (deslocamento+execução), Pendente = 3pts
        // Cada hora de atendimento = 5pts (tempo investido no local)
        score = completed * 15 + pending * 3 + Math.round(totalMinutes / 60) * 5;
        metrics.push(
          { label: 'Concluídos', value: completed },
          { label: 'Pendentes', value: pending },
          { label: 'Horas', value: Math.round(totalMinutes / 60) },
        );
        maxScore = Math.max(score, 100);
      } else {
        continue;
      }

      members.push({
        id: user.id, name: user.name, role: user.role,
        avatarUrl: user.avatarUrl, score, maxScore, metrics,
      });
    }

    return members.sort((a, b) => b.score - a.score);
  }, [users, deliveryRecords, contentTasks, designTasks, recordings, weekStart, weekEnd]);

  const roleGroups = useMemo(() => {
    const groups: Record<string, MemberPerformance[]> = {};
    for (const m of teamMembers) {
      if (!groups[m.role]) groups[m.role] = [];
      groups[m.role].push(m);
    }
    return Object.entries(groups).sort((a, b) => {
      const totalA = a[1].reduce((s, m) => s + m.score, 0);
      const totalB = b[1].reduce((s, m) => s + m.score, 0);
      return totalB - totalA;
    });
  }, [teamMembers]);

  if (teamMembers.length === 0) return null;

  const monthLabel = format(new Date(), 'MMMM');
  const capitalMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3 sm:p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-display font-semibold text-sm sm:text-base flex items-center gap-2">
          <Trophy size={16} className="text-primary" />
          Desempenho por Função — {capitalMonth}
        </h3>
        <Badge variant="outline" className="text-[9px]">{teamMembers.length} membros</Badge>
      </div>

      {/* Category cards */}
      <div className="space-y-3">
        {roleGroups.map(([role, members]) => {
          const RoleIcon = ROLE_ICONS[role] || Users;
          const isExpanded = expandedRole === role;
          const accent = ROLE_ACCENT[role] || 'bg-primary';
          const textColor = ROLE_TEXT[role] || 'text-primary';
          const borderColor = ROLE_BORDER[role] || 'border-border';
          const gradient = ROLE_GRADIENT[role] || 'from-primary/20 to-primary/5';
          const groupMax = Math.max(...members.map(m => m.score), 1);
          const totalScore = members.reduce((s, m) => s + m.score, 0);
          const leader = members[0];

          return (
            <div key={role} className={`rounded-xl border overflow-hidden ${borderColor} bg-card/50`}>
              {/* Category header with summary */}
              <button
                onClick={() => setExpandedRole(isExpanded ? null : role)}
                className={`w-full bg-gradient-to-r ${gradient} p-3 sm:p-4 transition-colors`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center`}>
                      <RoleIcon size={16} className="text-white" />
                    </div>
                    <div className="text-left">
                      <span className="text-xs sm:text-sm font-bold block">
                        {ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {members.length} {members.length === 1 ? 'membro' : 'membros'} · {totalScore} pts total
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Mini leader indicator */}
                    {leader && (
                      <div className="hidden sm:flex items-center gap-1.5 bg-background/60 rounded-full pl-1 pr-2.5 py-1">
                        <Star size={10} className={textColor} />
                        <span className="text-[10px] font-medium">{leader.name.split(' ')[0]}</span>
                        <span className={`text-[10px] font-bold ${textColor}`}>{leader.score}pts</span>
                      </div>
                    )}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {/* Mini comparison bars (always visible) */}
                <div className="mt-3 space-y-1.5">
                  {members.map((m, idx) => {
                    const pct = groupMax > 0 ? Math.round((m.score / groupMax) * 100) : 0;
                    return (
                      <div key={m.id} className="flex items-center gap-2">
                        <span className="text-[9px] w-16 sm:w-20 truncate text-left text-muted-foreground font-medium">
                          {m.name.split(' ')[0]}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-background/50 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${accent}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: idx * 0.08 }}
                          />
                        </div>
                        <span className={`text-[9px] font-bold w-8 text-right ${textColor}`}>{m.score}</span>
                      </div>
                    );
                  })}
                </div>
              </button>

              {/* Expanded detail */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="p-2.5 sm:p-3 space-y-2 border-t border-border/50">
                      {members.map((m, idx) => {
                        const user = users.find(u => u.id === m.id);
                        const pct = groupMax > 0 ? Math.round((m.score / groupMax) * 100) : 0;
                        const isLeader = idx === 0;
                        return (
                          <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.06 }}
                            className={`rounded-lg p-3 ${isLeader ? `bg-gradient-to-r ${gradient} border ${borderColor}` : 'bg-background/40'}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold w-5 text-center ${isLeader ? textColor : 'text-muted-foreground'}`}>
                                {idx + 1}º
                              </span>
                              {user && <UserAvatar user={user} size="sm" />}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs sm:text-sm font-semibold truncate">{m.name}</p>
                                  {isLeader && <Star size={12} className={`${textColor} shrink-0`} fill="currentColor" />}
                                </div>
                                {/* Metrics grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 mt-1">
                                  {m.metrics.map((mt, j) => (
                                    <span key={j} className="text-[10px] text-muted-foreground">
                                      {mt.label}: <strong className={isLeader ? textColor : 'text-foreground'}>{mt.value}</strong>
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-base sm:text-xl font-display font-bold ${textColor}`}>{m.score}</p>
                                <p className="text-[8px] text-muted-foreground">pts</p>
                              </div>
                            </div>
                            {/* Performance bar within category */}
                            <div className="mt-2">
                              <div className="flex justify-between text-[8px] text-muted-foreground mb-0.5">
                                <span>Comparativo na função</span>
                                <span>{pct}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${accent}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.8, delay: idx * 0.1 }}
                                />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
