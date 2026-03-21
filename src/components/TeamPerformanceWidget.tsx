import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { ROLE_LABELS } from '@/types';
import { motion } from 'framer-motion';
import { Trophy, Video, Palette, Film, Megaphone, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import { Progress } from '@/components/ui/progress';
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
  videomaker: Video,
  editor: Film,
  designer: Palette,
  social_media: Megaphone,
  fotografo: Palette,
  parceiro: Users,
};

const ROLE_COLORS: Record<string, string> = {
  videomaker: 'text-destructive',
  editor: 'text-info',
  designer: 'text-warning',
  social_media: 'text-primary',
  fotografo: 'text-accent-foreground',
  parceiro: 'text-success',
};

const ROLE_BG: Record<string, string> = {
  videomaker: 'bg-destructive/10 border-destructive/20',
  editor: 'bg-info/10 border-info/20',
  designer: 'bg-warning/10 border-warning/20',
  social_media: 'bg-primary/10 border-primary/20',
  fotografo: 'bg-accent/10 border-accent/20',
  parceiro: 'bg-success/10 border-success/20',
};

export default function TeamPerformanceWidget() {
  const { users, recordings, clients } = useApp();
  const isMobile = useIsMobile();
  const [deliveryRecords, setDeliveryRecords] = useState<any[]>([]);
  const [contentTasks, setContentTasks] = useState<any[]>([]);
  const [designTasks, setDesignTasks] = useState<any[]>([]);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  useEffect(() => {
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    Promise.all([
      supabase.from('delivery_records').select('*').gte('date', monthStart).lte('date', monthEnd),
      supabase.from('content_tasks').select('*'),
      supabase.from('design_tasks').select('*'),
    ]).then(([dr, ct, dt]) => {
      if (dr.data) setDeliveryRecords(dr.data);
      if (ct.data) setContentTasks(ct.data);
      if (dt.data) setDesignTasks(dt.data);
    });
  }, []);

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
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
        const vmDeliveries = deliveryRecords.filter(r => r.videomaker_id === user.id);
        const reels = vmDeliveries.reduce((a, r) => a + (r.reels_produced || 0), 0);
        const creatives = vmDeliveries.reduce((a, r) => a + (r.creatives_produced || 0), 0);
        const stories = vmDeliveries.reduce((a, r) => a + (r.stories_produced || 0), 0);
        const extras = vmDeliveries.reduce((a, r) => a + (r.extras_produced || 0), 0);
        score = reels * 10 + creatives * 5 + stories * 3 + extras * 8;

        const weekRecs = recordings.filter(r =>
          r.videomakerId === user.id &&
          isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd })
        );
        const weekDone = weekRecs.filter(r => r.status === 'concluida').length;

        metrics.push(
          { label: 'Reels', value: reels },
          { label: 'Criativos', value: creatives },
          { label: 'Stories', value: stories },
          { label: 'Gravações Sem.', value: weekDone },
        );
        maxScore = Math.max(score, 200);
      } else if (user.role === 'editor') {
        const editorTasks = contentTasks.filter(t => t.assigned_to === user.id);
        const completed = editorTasks.filter(t => ['aprovado', 'publicado', 'finalizado'].includes(t.kanban_column)).length;
        const inProgress = editorTasks.filter(t => ['em_edicao', 'revisao', 'alteracao'].includes(t.kanban_column)).length;
        const total = editorTasks.length;
        score = completed * 10 + inProgress * 3;
        metrics.push(
          { label: 'Finalizados', value: completed },
          { label: 'Em progresso', value: inProgress },
          { label: 'Total tarefas', value: total },
        );
        maxScore = Math.max(score, 100);
      } else if (user.role === 'designer' || user.role === 'fotografo') {
        const dTasks = designTasks.filter(t => t.assigned_to === user.id);
        const completed = dTasks.filter(t => ['concluida', 'aprovada_cliente'].includes(t.kanban_column)).length;
        const inProgress = dTasks.filter(t => ['em_andamento', 'revisao'].includes(t.kanban_column)).length;
        const totalTime = dTasks.reduce((a, t) => a + (t.time_spent_seconds || 0), 0);
        score = completed * 10 + inProgress * 3;
        metrics.push(
          { label: 'Finalizados', value: completed },
          { label: 'Em progresso', value: inProgress },
          { label: 'Tempo (h)', value: Math.round(totalTime / 3600) },
        );
        maxScore = Math.max(score, 80);
      } else if (user.role === 'social_media') {
        const smTasks = contentTasks.filter(t => t.created_by === user.id);
        const published = smTasks.filter(t => t.kanban_column === 'publicado').length;
        const managed = smTasks.length;
        score = published * 10 + managed * 2;
        metrics.push(
          { label: 'Publicados', value: published },
          { label: 'Gerenciados', value: managed },
        );
        maxScore = Math.max(score, 100);
      } else if (user.role === 'parceiro') {
        score = 0;
        metrics.push({ label: 'Atividades', value: 0 });
        maxScore = 50;
      } else {
        continue;
      }

      members.push({
        id: user.id,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        score,
        maxScore,
        metrics,
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

  const globalMax = useMemo(() => Math.max(...teamMembers.map(m => m.score), 1), [teamMembers]);

  if (teamMembers.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3 sm:p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-xs sm:text-sm flex items-center gap-2">
          <Trophy size={14} className="text-primary" />
          Desempenho do Time — {format(new Date(), 'MMMM', { locale: undefined }).charAt(0).toUpperCase() + format(new Date(), 'MMMM').slice(1)}
        </h3>
        <Badge variant="outline" className="text-[9px]">{teamMembers.length} membros</Badge>
      </div>

      {/* Top 3 ranking */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {teamMembers.slice(0, 3).map((m, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
          const user = users.find(u => u.id === m.id);
          const pct = Math.round((m.score / globalMax) * 100);
          return (
            <motion.div
              key={m.id}
              whileTap={{ scale: 0.97 }}
              className={`relative flex flex-col items-center p-2 sm:p-3 rounded-xl border ${
                i === 0 ? 'bg-primary/5 border-primary/20' : 'bg-secondary/50 border-border'
              }`}
            >
              <span className="text-sm sm:text-lg mb-1">{medal}</span>
              {user && <UserAvatar user={user} size="sm" />}
              <p className="text-[10px] sm:text-xs font-semibold mt-1 truncate max-w-full">{m.name.split(' ')[0]}</p>
              <Badge variant="secondary" className="text-[8px] mt-0.5 px-1">
                {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] || m.role}
              </Badge>
              <p className="text-sm sm:text-lg font-display font-bold text-primary mt-1">{m.score}</p>
              <p className="text-[8px] text-muted-foreground">pts</p>
              <div className="w-full mt-1.5">
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: i * 0.15 }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Role groups */}
      <div className="space-y-2">
        {roleGroups.map(([role, members]) => {
          const RoleIcon = ROLE_ICONS[role] || Users;
          const isExpanded = expandedRole === role || expandedRole === null;
          const roleColor = ROLE_COLORS[role] || 'text-foreground';
          const roleBg = ROLE_BG[role] || 'bg-secondary/50 border-border';
          const groupMax = Math.max(...members.map(m => m.score), 1);

          return (
            <div key={role} className={`rounded-xl border overflow-hidden ${roleBg}`}>
              <button
                onClick={() => setExpandedRole(expandedRole === role ? null : role)}
                className="w-full flex items-center justify-between p-2.5 sm:p-3"
              >
                <div className="flex items-center gap-2">
                  <RoleIcon size={14} className={roleColor} />
                  <span className="text-xs sm:text-sm font-semibold">
                    {ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}
                  </span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1">{members.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Total: {members.reduce((s, m) => s + m.score, 0)} pts
                  </span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>

              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="px-2.5 pb-2.5 sm:px-3 sm:pb-3 space-y-2"
                >
                  {members.map((m, idx) => {
                    const user = users.find(u => u.id === m.id);
                    const pct = Math.round((m.score / globalMax) * 100);
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-background/60 rounded-lg p-2 sm:p-3"
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="text-[10px] font-bold w-4 text-center text-muted-foreground">
                            {idx + 1}º
                          </span>
                          {user && <UserAvatar user={user} size="sm" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-medium truncate">{m.name}</p>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                              {m.metrics.map((mt, j) => (
                                <span key={j} className="text-[9px] text-muted-foreground">
                                  {mt.label}: <strong className="text-foreground">{mt.value}</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm sm:text-lg font-display font-bold ${roleColor}`}>{m.score}</p>
                            <p className="text-[8px] text-muted-foreground">pts</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-[8px] text-muted-foreground mb-0.5">
                            <span>Desempenho relativo</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${
                                pct >= 75 ? 'bg-success' :
                                pct >= 50 ? 'bg-primary' :
                                pct >= 25 ? 'bg-warning' :
                                'bg-destructive'
                              }`}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, delay: idx * 0.1 }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
