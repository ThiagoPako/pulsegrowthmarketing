import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

type Fmt = 'reels' | 'criativo' | 'story';

const FORMATS: { key: Fmt; label: string; field: 'weeklyReels' | 'weeklyCreatives' | 'weeklyStories' }[] = [
  { key: 'reels', label: 'Reels', field: 'weeklyReels' },
  { key: 'criativo', label: 'Criativos', field: 'weeklyCreatives' },
  { key: 'story', label: 'Stories', field: 'weeklyStories' },
];

interface TaskRow { client_id: string | null; content_type: string; }

export default function ContentCoverageWidget() {
  const { clients, scripts } = useApp();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('content_tasks')
          .select('client_id, content_type')
          .in('kanban_column', ['ideias', 'em_producao', 'em_revisao']);
        if (mounted) setTasks((data as any) || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const activeClients = useMemo(() => clients.filter(c => (c as any).status !== 'inactive'), [clients]);

  const coverage = useMemo(() => {
    return FORMATS.map(f => {
      let target = 0, stock = 0, pending = 0;
      const deficitClients: { name: string; deficit: number }[] = [];
      activeClients.forEach(c => {
        const t = Number((c as any)[f.field] || 0);
        if (t <= 0) return;
        target += t;
        const s = scripts.filter(s => !s.recorded && s.clientId === c.id && (s.contentFormat || 'reels') === f.key).length;
        const p = tasks.filter(x => x.client_id === c.id && x.content_type === f.key).length;
        stock += s; pending += p;
        const have = s + p;
        if (have < t) deficitClients.push({ name: (c as any).companyName || (c as any).name || 'Cliente', deficit: t - have });
      });
      const have = stock + pending;
      const pct = target > 0 ? Math.round((have / target) * 100) : 100;
      deficitClients.sort((a, b) => b.deficit - a.deficit);
      return { ...f, target, stock, pending, have, pct, deficitClients: deficitClients.slice(0, 5), deficit: Math.max(target - have, 0) };
    });
  }, [activeClients, scripts, tasks]);

  const globalDeficit = coverage.reduce((a, c) => a + c.deficit, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 sm:p-5">
      <div className="section-header">
        <Package size={16} className="text-primary" />
        <div className="flex-1">
          <h3 className="section-title">Cobertura de conteúdo</h3>
          <p className="section-subtitle">Estoque + tarefas pendentes vs. demanda semanal</p>
        </div>
        {globalDeficit > 0 ? (
          <Badge variant="destructive" className="gap-1"><AlertTriangle size={12} />{globalDeficit} em déficit</Badge>
        ) : (
          <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30"><CheckCircle2 size={12} />Cobertura ok</Badge>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Calculando cobertura...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          {coverage.map(c => {
            const isDeficit = c.deficit > 0;
            const isOver = c.pct >= 100;
            const color = isOver ? 'text-emerald-500' : c.pct >= 70 ? 'text-amber-500' : 'text-destructive';
            return (
              <div key={c.key} className={`rounded-xl border p-3 ${isDeficit ? 'border-destructive/40 bg-destructive/5' : 'border-border/50 bg-card/40'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground">meta semanal {c.target}</p>
                  </div>
                  <div className={`text-right ${color}`}>
                    <p className="text-xl font-display font-bold leading-none">{c.pct}%</p>
                    <p className="text-[10px] uppercase tracking-wide">cobertura</p>
                  </div>
                </div>
                <Progress value={Math.min(c.pct, 100)} className="h-1.5" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
                  <span>estoque {c.stock}</span>
                  <span>pendentes {c.pending}</span>
                  <span className={isDeficit ? 'text-destructive font-semibold' : ''}>
                    {isDeficit ? `-${c.deficit}` : `+${c.have - c.target}`}
                  </span>
                </div>
                {isDeficit && c.deficitClients.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
                      <TrendingDown size={10} /> maiores déficits
                    </p>
                    <ul className="space-y-0.5">
                      {c.deficitClients.map(dc => (
                        <li key={dc.name} className="flex justify-between text-[11px]">
                          <span className="truncate">{dc.name}</span>
                          <span className="text-destructive font-semibold ml-2">-{dc.deficit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
