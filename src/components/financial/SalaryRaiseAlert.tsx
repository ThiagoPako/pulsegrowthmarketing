import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/vpsDb';
import { VM_SCORE, EDITOR_SCORE, DESIGNER_SCORE, SM_SCORE, PARCEIRO_SCORE, EDITOR_APPROVED_COLUMNS } from '@/lib/scoringSystem';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Award, ChevronDown, ChevronUp, Star, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import UserAvatar from '@/components/UserAvatar';
import { ROLE_LABELS } from '@/types';

const THRESHOLD = 85; // 85% minimum average over 2 months

interface MonthScore {
  month: string;
  label: string;
  score: number;
  maxExpected: number;
  percentage: number;
}

interface RaiseCandidate {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
  avgPercentage: number;
  months: MonthScore[];
  eligible: boolean;
}

function calculateRoleMaxExpected(role: string, workDaysInMonth: number): number {
  // Expected daily production capacity by role (points per work day)
  // Based on the scoring weights from TeamPerformanceWidget
  switch (role) {
    case 'videomaker':
      // ~2 recordings/day (15pts each) + ~3 reels (12pts) + 2 stories (3pts) = ~72pts/day
      // Realistic expectation: ~40pts/day considering travel, setup, etc
      return workDaysInMonth * 40;
    case 'editor':
      // ~2 videos approved/day (15pts) + 1 editing (5pts) = ~35pts/day
      // Realistic: ~25pts/day
      return workDaysInMonth * 25;
    case 'designer':
    case 'fotografo':
      // ~2 completed/day (12pts) + hours (2pts/h * 6h) = ~36pts/day
      // Realistic: ~22pts/day
      return workDaysInMonth * 22;
    case 'social_media':
      // ~3 published (10pts) + 2 scripts (6pts) + managing (2pts*5) = ~52pts/day
      // Realistic: ~20pts/day
      return workDaysInMonth * 20;
    case 'parceiro':
      // ~2 completed (15pts) + hours (5pts*4h) = ~50pts/day
      // Realistic: ~18pts/day
      return workDaysInMonth * 18;
    default:
      return workDaysInMonth * 20;
  }
}

function calculateScoreForMonth(
  role: string,
  userId: string,
  deliveryRecords: any[],
  contentTasks: any[],
  designTasks: any[],
  smDeliveries: any[],
  partnerTasks: any[],
  recordings: any[],
  scripts: any[],
): number {
  let score = 0;
  if (role === 'videomaker') {
    const vmDeliveries = deliveryRecords.filter(r => r.videomaker_id === userId);
    const reels = vmDeliveries.reduce((a, r) => a + (r.reels_produced || 0), 0);
    const creatives = vmDeliveries.reduce((a, r) => a + (r.creatives_produced || 0), 0);
    const stories = vmDeliveries.reduce((a, r) => a + (r.stories_produced || 0), 0);
    const extras = vmDeliveries.reduce((a, r) => a + (r.extras_produced || 0), 0);
    const arts = vmDeliveries.reduce((a, r) => a + (r.arts_produced || 0), 0);
    const recDone = recordings.filter(r => r.videomaker_id === userId && r.status === 'concluida' && (r as any).type !== 'endomarketing').length;
    const endoDone = recordings.filter(r => r.videomaker_id === userId && r.status === 'concluida' && (r as any).type === 'endomarketing').length;
    score = reels * VM_SCORE.REEL + creatives * VM_SCORE.CRIATIVO + stories * VM_SCORE.STORY +
      extras * VM_SCORE.EXTRA + arts * VM_SCORE.ARTE + recDone * VM_SCORE.GRAVACAO + endoDone * VM_SCORE.ENDO;
  } else if (role === 'editor') {
    const editorTasks = contentTasks.filter(t => t.assigned_to === userId || t.edited_by === userId);
    const approved = editorTasks.filter(t => !!t.approved_at || EDITOR_APPROVED_COLUMNS.includes(t.kanban_column as any)).length;
    const inEditing = editorTasks.filter(t => t.kanban_column === 'edicao').length;
    const inRevision = editorTasks.filter(t => t.kanban_column === 'revisao').length;
    const alterations = editorTasks.filter(t => t.kanban_column === 'alteracao').length;
    const priority = editorTasks.filter(t => t.editing_priority === true).length;
    score = approved * EDITOR_SCORE.APROVADO + inEditing * EDITOR_SCORE.EM_EDICAO +
      inRevision * EDITOR_SCORE.REVISAO + alterations * EDITOR_SCORE.ALTERACAO + priority * EDITOR_SCORE.PRIORIDADE;
  } else if (role === 'designer' || role === 'fotografo') {
    const dTasks = designTasks.filter(t => t.assigned_to === userId);
    const completed = dTasks.filter(t => ['concluida', 'aprovada_cliente'].includes(t.kanban_column)).length;
    const inProgress = dTasks.filter(t => ['em_andamento', 'revisao'].includes(t.kanban_column)).length;
    const totalTime = dTasks.reduce((a, t) => a + (t.time_spent_seconds || 0), 0);
    const totalVersions = dTasks.reduce((a, t) => a + (t.version || 1), 0);
    const highPriority = dTasks.filter(t => t.priority === 'alta' || t.priority === 'urgente').length;
    score = completed * DESIGNER_SCORE.CONCLUIDO + inProgress * DESIGNER_SCORE.EM_PROGRESSO +
      Math.round(totalTime / 3600) * DESIGNER_SCORE.POR_HORA + totalVersions * DESIGNER_SCORE.POR_VERSAO +
      highPriority * DESIGNER_SCORE.PRIORIDADE;
  } else if (role === 'social_media') {
    const smCreated = contentTasks.filter(t => t.created_by === userId);
    const published = smCreated.filter(t => t.kanban_column === 'arquivado').length;
    const managed = smCreated.length;
    const userDel = smDeliveries.filter(d => d.created_by === userId);
    const posted = userDel.filter(d => d.status === 'postado' || d.posted_at).length;
    const scheduled = userDel.filter(d => d.status === 'agendado').length;
    score = published * SM_SCORE.PUBLICADO + posted * SM_SCORE.POSTADO + scheduled * SM_SCORE.AGENDADO +
      managed * SM_SCORE.GERENCIADO;
  } else if (role === 'parceiro') {
    const pTasks = partnerTasks.filter(t => t.partner_id === userId);
    const completed = pTasks.filter(t => t.status === 'completed' || t.completed_at).length;
    const pending = pTasks.filter(t => t.status === 'pending' || t.status === 'scheduled').length;
    const totalMin = pTasks.reduce((a, t) => a + (t.duration_minutes || 0), 0);
    score = completed * PARCEIRO_SCORE.CONCLUIDO + pending * PARCEIRO_SCORE.PENDENTE +
      Math.round(totalMin / 60) * PARCEIRO_SCORE.POR_HORA;
  }
  return score;
}

export default function SalaryRaiseAlert() {
  const { users, recordings, scripts } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [monthsData, setMonthsData] = useState<Record<string, { dr: any[]; ct: any[]; dt: any[]; smd: any[]; pt: any[]; rec: any[] }>>({});
  const [loaded, setLoaded] = useState(false);

  // Load data for current month and previous month
  useEffect(() => {
    const now = new Date();
    const months = [now, subMonths(now, 1)];
    const promises = months.map(async (m) => {
      const mStart = format(startOfMonth(m), 'yyyy-MM-dd');
      const mEnd = format(endOfMonth(m), 'yyyy-MM-dd');
      const key = format(m, 'yyyy-MM');
      const [dr, ct, dt, smd, pt, rec] = await Promise.all([
        supabase.from('delivery_records').select('*').gte('date', mStart).lte('date', mEnd),
        supabase.from('content_tasks').select('*').gte('created_at', mStart + 'T00:00:00').lte('created_at', mEnd + 'T23:59:59'),
        supabase.from('design_tasks').select('*').gte('created_at', mStart + 'T00:00:00').lte('created_at', mEnd + 'T23:59:59'),
        supabase.from('social_media_deliveries').select('*').gte('delivered_at', mStart).lte('delivered_at', mEnd),
        supabase.from('endomarketing_partner_tasks').select('*').gte('date', mStart).lte('date', mEnd),
        supabase.from('recordings').select('*').gte('date', mStart).lte('date', mEnd),
      ]);
      return { key, dr: dr.data || [], ct: ct.data || [], dt: dt.data || [], smd: smd.data || [], pt: pt.data || [], rec: rec.data || [] };
    });

    Promise.all(promises).then(results => {
      const map: Record<string, any> = {};
      results.forEach(r => { map[r.key] = r; });
      setMonthsData(map);
      setLoaded(true);
    });
  }, []);

  const candidates = useMemo<RaiseCandidate[]>(() => {
    if (!loaded) return [];
    const teamUsers = users.filter(u => u.role !== 'admin');
    const now = new Date();
    const monthKeys = [format(subMonths(now, 1), 'yyyy-MM'), format(now, 'yyyy-MM')];

    return teamUsers.map(user => {
      const monthScores: MonthScore[] = monthKeys.map(key => {
        const data = monthsData[key];
        if (!data) return { month: key, label: key, score: 0, maxExpected: 1, percentage: 0 };

        const m = new Date(key + '-15');
        const workDays = 22; // average work days
        const maxExpected = calculateRoleMaxExpected(user.role, workDays);
        
        // Map recordings to the format expected by scoring
        const recsForScoring = data.rec;

        const score = calculateScoreForMonth(
          user.role, user.id,
          data.dr, data.ct, data.dt, data.smd, data.pt,
          recsForScoring, scripts as any[]
        );

        const percentage = maxExpected > 0 ? Math.min(Math.round((score / maxExpected) * 100), 100) : 0;

        return {
          month: key,
          label: format(m, 'MMM/yy', { locale: ptBR }),
          score,
          maxExpected,
          percentage,
        };
      });

      const avgPercentage = monthScores.length > 0
        ? Math.round(monthScores.reduce((s, ms) => s + ms.percentage, 0) / monthScores.length)
        : 0;

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        avgPercentage,
        months: monthScores,
        eligible: avgPercentage >= THRESHOLD,
      };
    }).filter(c => c.avgPercentage > 0).sort((a, b) => b.avgPercentage - a.avgPercentage);
  }, [users, monthsData, loaded, scripts]);

  const eligibleCount = candidates.filter(c => c.eligible).length;

  if (!loaded || candidates.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}>
      <Card className={`overflow-hidden border ${eligibleCount > 0 ? 'border-emerald-500/30 shadow-emerald-500/10 shadow-md' : 'border-border'}`}>
        <CardContent className="p-0">
          {/* Header */}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`w-full p-4 text-left transition-colors ${eligibleCount > 0 ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/5' : 'bg-muted/30'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${eligibleCount > 0 ? 'bg-emerald-500/20' : 'bg-muted'}`}>
                  <Award size={20} className={eligibleCount > 0 ? 'text-emerald-600' : 'text-muted-foreground'} />
                </div>
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    Análise de Mérito para Aumento
                    {eligibleCount > 0 && (
                      <Badge className="bg-emerald-500 text-white text-[10px]">
                        {eligibleCount} elegível{eligibleCount > 1 ? 'eis' : ''}
                      </Badge>
                    )}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Colaboradores com ≥{THRESHOLD}% de aproveitamento nos últimos 2 meses
                  </p>
                </div>
              </div>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {/* Content */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="p-4 pt-2 space-y-2">
                  {/* Legend */}
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-3 px-1">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" /> ≥{THRESHOLD}% — Elegível
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500" /> 70-84% — Quase lá
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground" /> &lt;70% — Precisa melhorar
                    </span>
                  </div>

                  {candidates.map((c, idx) => {
                    const user = users.find(u => u.id === c.id);
                    const colorClass = c.avgPercentage >= THRESHOLD
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : c.avgPercentage >= 70
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : 'border-border bg-background/50';
                    const barColor = c.avgPercentage >= THRESHOLD
                      ? 'bg-emerald-500'
                      : c.avgPercentage >= 70
                        ? 'bg-amber-500'
                        : 'bg-muted-foreground/50';
                    const textColor = c.avgPercentage >= THRESHOLD
                      ? 'text-emerald-600'
                      : c.avgPercentage >= 70
                        ? 'text-amber-600'
                        : 'text-muted-foreground';

                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`rounded-lg border p-3 ${colorClass}`}
                      >
                        <div className="flex items-center gap-3">
                          {user && <UserAvatar user={user} size="sm" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate">{c.name}</span>
                              {c.eligible && <Star size={12} className="text-emerald-500 shrink-0" fill="currentColor" />}
                              <Badge variant="outline" className="text-[9px] shrink-0">
                                {ROLE_LABELS[c.role as keyof typeof ROLE_LABELS] || c.role}
                              </Badge>
                            </div>
                            {/* Month bars */}
                            <div className="flex gap-3 mt-2">
                              {c.months.map(ms => (
                                <div key={ms.month} className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[9px] text-muted-foreground capitalize">{ms.label}</span>
                                    <span className={`text-[9px] font-bold ${textColor}`}>{ms.percentage}%</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <motion.div
                                      className={`h-full rounded-full ${barColor}`}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${ms.percentage}%` }}
                                      transition={{ duration: 0.6, delay: idx * 0.05 + 0.2 }}
                                    />
                                  </div>
                                  <span className="text-[8px] text-muted-foreground">{ms.score}/{ms.maxExpected} pts</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Average badge */}
                          <div className={`text-center px-3 py-1.5 rounded-lg ${c.eligible ? 'bg-emerald-500/10' : 'bg-muted/50'}`}>
                            <span className={`text-lg font-bold ${textColor}`}>{c.avgPercentage}%</span>
                            <p className="text-[8px] text-muted-foreground">Média</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {eligibleCount === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      Nenhum colaborador atingiu {THRESHOLD}% de aproveitamento nos últimos 2 meses ainda.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
