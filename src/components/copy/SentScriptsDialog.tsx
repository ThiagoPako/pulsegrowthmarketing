import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, CheckCircle2, TrendingUp } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { SCRIPT_CONTENT_FORMAT_LABELS } from '@/types';
import type { Script } from '@/types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

type Scope = 'mine' | 'all';
type TimeFilter = 'day' | 'week' | 'month' | 'all';
type StatusFilter = 'sent' | 'recorded';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scripts: Script[];
  clients: any[];
  users: any[];
  currentUserId?: string;
  onSelect: (s: Script) => void;
}

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); const day = x.getDay(); x.setDate(x.getDate() - day); return x; };
const startOfMonth = (d: Date) => { const x = startOfDay(d); x.setDate(1); return x; };

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const SentScriptsDialog: React.FC<Props> = ({
  open, onOpenChange, scripts, clients, users, currentUserId, onSelect,
}) => {
  const [scope, setScope] = useState<Scope>('mine');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('sent');

  const filtered = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (timeFilter === 'day') cutoff = startOfDay(now);
    else if (timeFilter === 'week') cutoff = startOfWeek(now);
    else if (timeFilter === 'month') cutoff = startOfMonth(now);

    return scripts
      .filter(s => scope === 'mine' ? (s as any).createdBy === currentUserId : true)
      .filter(s => statusFilter === 'recorded' ? !!s.recorded : true)
      .filter(s => {
        if (!cutoff) return true;
        return new Date(s.createdAt).getTime() >= cutoff.getTime();
      })
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [scripts, scope, timeFilter, statusFilter, currentUserId]);

  // Weekly chart data (últimos 7 dias, respeita escopo)
  const chartData = useMemo(() => {
    const base = scripts.filter(s => scope === 'mine' ? (s as any).createdBy === currentUserId : true);
    const today = startOfDay(new Date());
    const days: { label: string; enviados: number; gravados: number; date: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days.push({ label: WEEK_DAYS[d.getDay()], enviados: 0, gravados: 0, date: d });
    }
    for (const s of base) {
      const c = startOfDay(new Date(s.createdAt)).getTime();
      const bucket = days.find(d => d.date.getTime() === c);
      if (bucket) {
        bucket.enviados += 1;
        if (s.recorded) bucket.gravados += 1;
      }
    }
    return days.map(({ date, ...rest }) => rest);
  }, [scripts, scope, currentUserId]);

  // Ranking de autores (respeitando time filter atual)
  const authorRanking = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (timeFilter === 'day') cutoff = startOfDay(now);
    else if (timeFilter === 'week') cutoff = startOfWeek(now);
    else if (timeFilter === 'month') cutoff = startOfMonth(now);

    const map = new Map<string, { name: string; total: number; recorded: number }>();
    for (const s of scripts) {
      if (cutoff && new Date(s.createdAt).getTime() < cutoff.getTime()) continue;
      const uid = (s as any).createdBy || 'unknown';
      const name = users.find(u => u.id === uid)?.name || '—';
      const cur = map.get(uid) || { name, total: 0, recorded: 0 };
      cur.total += 1;
      if (s.recorded) cur.recorded += 1;
      map.set(uid, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [scripts, users, timeFilter]);

  const total = filtered.length;
  const recordedCount = filtered.filter(s => s.recorded).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border border-white/10 text-white max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-black italic uppercase tracking-tighter text-2xl flex items-center gap-2">
            <FileText size={20} className="text-red-500" /> Roteiros enviados
          </DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex flex-col gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {(['mine', 'all'] as Scope[]).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded ${scope === s ? 'bg-red-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
              >
                {s === 'mine' ? 'Meus envios' : 'Toda a equipe'}
              </button>
            ))}
            <span className="mx-2 h-4 w-px bg-white/10" />
            {(['day', 'week', 'month', 'all'] as TimeFilter[]).map(t => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded ${timeFilter === t ? 'bg-white text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
              >
                {t === 'day' ? 'Hoje' : t === 'week' ? 'Semana' : t === 'month' ? 'Mês' : 'Tudo'}
              </button>
            ))}
            <span className="mx-2 h-4 w-px bg-white/10" />
            {(['sent', 'recorded'] as StatusFilter[]).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded flex items-center gap-1 ${statusFilter === st ? (st === 'recorded' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
              >
                {st === 'recorded' && <CheckCircle2 size={11} />}
                {st === 'sent' ? 'Enviados' : 'Gravados'}
              </button>
            ))}
            <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">
              {total} · {recordedCount} gravado(s)
            </span>
          </div>
        </div>

        {/* Body: chart + list */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 pt-3">
          {/* Lista */}
          <div className="overflow-y-auto space-y-2 pr-1">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-white/30 text-sm">
                Nenhum roteiro no filtro atual.
              </div>
            ) : filtered.slice(0, 200).map(s => {
              const client = clients.find(c => c.id === s.clientId);
              const author = users.find(u => u.id === (s as any).createdBy)?.name || '—';
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-red-600/40 transition-all"
                >
                  <div className="flex items-start gap-3">
                    {client && <ClientLogo client={client as any} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{s.title}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                          {SCRIPT_CONTENT_FORMAT_LABELS[s.contentFormat] || s.contentFormat}
                        </span>
                        {s.priority === 'urgent' && (
                          <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-red-600 text-white">
                            Urgente
                          </span>
                        )}
                        {s.recorded && (
                          <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-600 text-white flex items-center gap-1">
                            <CheckCircle2 size={10} /> Gravado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 mt-1 truncate">
                        <span className="text-white/80 font-semibold">{author}</span>
                        {' · '}{client?.companyName || 'Sem cliente'}
                        {' · '}{new Date(s.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sidebar: chart + ranking */}
          <div className="overflow-y-auto space-y-4 pr-1">
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.2em] font-black text-white/70">
                <TrendingUp size={12} className="text-red-500" /> Produção 7 dias
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="enviados" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gravados" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[9px] uppercase tracking-widest text-white/50">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Enviados</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Gravados</span>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] font-black text-white/70 mb-2">
                Ranking autores
              </div>
              {authorRanking.length === 0 ? (
                <div className="text-[11px] text-white/30 py-4 text-center">Sem dados no período.</div>
              ) : (
                <div className="space-y-1.5">
                  {authorRanking.map((a, i) => (
                    <div key={a.name + i} className="flex items-center gap-2 text-[11px]">
                      <span className="w-5 text-center font-black text-white/40">{i + 1}</span>
                      <span className="flex-1 truncate text-white/90 font-semibold">{a.name}</span>
                      <span className="text-white/60">{a.total}</span>
                      <span className="text-emerald-400 text-[10px]">✓{a.recorded}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SentScriptsDialog;
