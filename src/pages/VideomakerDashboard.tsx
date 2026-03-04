import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { Recording, Script } from '@/types';
import { SCRIPT_VIDEO_TYPE_LABELS } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Play, Square, FileText, Check, Clock, Video, Users as UsersIcon,
  TrendingUp, BarChart3, Undo2
} from 'lucide-react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, endOfWeek, isWithinInterval, parseISO, getDay, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function VideomakerDashboard() {
  const {
    currentUser, recordings, clients, scripts, users, activeRecordings,
    updateRecording, updateScript, startActiveRecording, stopActiveRecording,
  } = useApp();

  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [scriptsClientId, setScriptsClientId] = useState('');
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());

  const vmId = currentUser?.id || '';
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // Mon-Fri

  // ── My recordings ──
  const myRecordings = useMemo(() =>
    recordings.filter(r => r.videomakerId === vmId),
    [recordings, vmId]
  );

  const todayRecs = useMemo(() =>
    myRecordings.filter(r => r.date === todayStr && r.status !== 'cancelada')
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [myRecordings, todayStr]
  );

  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return myRecordings.filter(r => r.date === dateStr && r.status !== 'cancelada')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClientColor = (id: string) => clients.find(c => c.id === id)?.color || '220 10% 50%';

  const typeLabels: Record<string, string> = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.' };

  // ── Active recording ──
  const myActiveRec = activeRecordings.find(a => a.videomarkerId === vmId);

  const handleStartRecording = (rec: Recording) => {
    startActiveRecording({
      recordingId: rec.id,
      videomarkerId: vmId,
      clientId: rec.clientId,
      startedAt: new Date().toISOString(),
    });
    toast.success(`Gravação iniciada — ${getClientName(rec.clientId)}`);
  };

  const handleFinishRecording = (rec: Recording) => {
    stopActiveRecording(rec.id);
    updateRecording({ ...rec, status: 'concluida' });
    toast.success('Gravação concluída!');
  };

  // ── Scripts ──
  const openScripts = (clientId: string) => {
    setScriptsClientId(clientId);
    setSelectedScriptIds(new Set());
    setScriptsOpen(true);
  };

  const clientScripts = useMemo(() => {
    if (!scriptsClientId) return [];
    return scripts.filter(s => s.clientId === scriptsClientId && !s.recorded);
  }, [scripts, scriptsClientId]);

  const handleMarkScriptsRecorded = () => {
    const now = new Date().toISOString();
    selectedScriptIds.forEach(id => {
      const script = scripts.find(s => s.id === id);
      if (script) updateScript({ ...script, recorded: true, updatedAt: now });
    });
    toast.success(`${selectedScriptIds.size} roteiro(s) marcado(s) como gravado(s)`);
    setScriptsOpen(false);
  };

  const handleReturnScript = (script: Script) => {
    updateScript({ ...script, recorded: false, updatedAt: new Date().toISOString() });
    toast.success('Roteiro retornado');
  };

  // ── Performance stats ──
  const stats = useMemo(() => {
    const monthStart2 = startOfMonth(today);
    const monthEnd2 = endOfMonth(today);
    const monthRecs = myRecordings.filter(r => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start: monthStart2, end: monthEnd2 });
    });
    const weekRecs = myRecordings.filter(r => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    });

    const doneMonth = monthRecs.filter(r => r.status === 'concluida');
    const doneWeek = weekRecs.filter(r => r.status === 'concluida');

    // Unique clients served this month
    const uniqueClients = new Set(doneMonth.map(r => r.clientId)).size;

    // Total reels from tasks (approximate via recordings done)
    const totalRecordings = doneMonth.length;

    // Average reels per recording - count tasks finalized per recording
    // Using a simple metric: total weekly reels goals of clients recorded
    const reelsProduced = doneMonth.reduce((acc, rec) => {
      const client = clients.find(c => c.id === rec.clientId);
      return acc + (client?.weeklyReels || 0);
    }, 0);
    const avgReelsPerRec = totalRecordings > 0 ? (reelsProduced / totalRecordings).toFixed(1) : '0';

    return {
      todayDone: todayRecs.filter(r => r.status === 'concluida').length,
      todayTotal: todayRecs.length,
      weekDone: doneWeek.length,
      weekTotal: weekRecs.filter(r => r.status !== 'cancelada').length,
      monthRecordings: totalRecordings,
      uniqueClients,
      reelsProduced,
      avgReelsPerRec,
    };
  }, [myRecordings, todayRecs, clients, today, weekStart, weekEnd]);

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold">Olá, {currentUser?.name} 👋</h1>
        <p className="text-muted-foreground text-sm">{format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Gravações Hoje', value: `${stats.todayDone}/${stats.todayTotal}`, icon: Video, color: 'bg-success/15 text-success' },
          { label: 'Clientes Atendidos', value: stats.uniqueClients, icon: UsersIcon, color: 'bg-info/15 text-info' },
          { label: 'Gravações (mês)', value: stats.monthRecordings, icon: TrendingUp, color: 'bg-primary/15 text-primary' },
          { label: 'Média Reels/Grav.', value: stats.avgReelsPerRec, icon: BarChart3, color: 'bg-warning/15 text-warning' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="stat-card">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <p className="text-xl font-display font-bold">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── ROW: Today's Recordings + Active ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Gravações de Hoje</h3>
            <span className="text-xs text-muted-foreground">{todayRecs.length} gravações</span>
          </div>

          {todayRecs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma gravação hoje</div>
          ) : (
            <div className="space-y-2">
              {todayRecs.map((rec, i) => {
                const color = getClientColor(rec.clientId);
                const isActive = myActiveRec?.recordingId === rec.id;
                const isDone = rec.status === 'concluida';

                return (
                  <motion.div key={rec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' :
                      isDone ? 'border-success/30 bg-success/5' : 'border-border bg-secondary/50'
                    }`}>
                    <div className="w-1.5 h-12 rounded-full shrink-0" style={{ backgroundColor: `hsl(${color})` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{getClientName(rec.clientId)}</span>
                        <Badge variant="outline" className="text-[10px]">{typeLabels[rec.type]}</Badge>
                        {isActive && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] animate-pulse">
                            ● Em andamento
                          </Badge>
                        )}
                        {isDone && (
                          <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
                            <Check size={10} className="mr-0.5" /> Concluída
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Clock size={10} className="inline mr-1" />{rec.startTime}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {rec.status === 'agendada' && !isActive && (
                        <Button size="sm" onClick={() => handleStartRecording(rec)} className="gap-1">
                          <Play size={14} /> Iniciar
                        </Button>
                      )}
                      {isActive && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openScripts(rec.clientId)} className="gap-1">
                            <FileText size={14} /> Roteiros
                          </Button>
                          <Button size="sm" onClick={() => handleFinishRecording(rec)} className="gap-1 bg-success hover:bg-success/90 text-success-foreground">
                            <Square size={14} /> Finalizar
                          </Button>
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Performance card */}
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Meu Desempenho</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Semana</span>
                <span className="font-bold">{stats.weekDone}/{stats.weekTotal}</span>
              </div>
              <Progress value={stats.weekTotal > 0 ? (stats.weekDone / stats.weekTotal) * 100 : 0} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.uniqueClients}</p>
                <p className="text-[10px] text-muted-foreground">Clientes atendidos</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.monthRecordings}</p>
                <p className="text-[10px] text-muted-foreground">Gravações (mês)</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.reelsProduced}</p>
                <p className="text-[10px] text-muted-foreground">Reels produzidos</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.avgReelsPerRec}</p>
                <p className="text-[10px] text-muted-foreground">Média reels/grav.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Kanban Semanal ── */}
      <div className="glass-card p-5">
        <h3 className="font-display font-semibold text-sm mb-4">Minha Semana</h3>
        <div className="grid grid-cols-5 gap-2 min-h-[300px]">
          {weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, today);
            const dayRecs = getRecsForDay(day);

            return (
              <div key={dateStr} className={`glass-card p-3 ${isToday ? 'ring-1 ring-primary' : ''}`}>
                <div className="text-center mb-3">
                  <p className={`text-xs font-semibold uppercase ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {format(day, 'EEE', { locale: ptBR })}
                  </p>
                  <p className={`text-lg font-display font-bold ${isToday ? 'text-primary' : ''}`}>
                    {format(day, 'd')}
                  </p>
                </div>
                <div className="space-y-2">
                  {dayRecs.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">Livre</p>
                  )}
                  {dayRecs.map(rec => {
                    const color = getClientColor(rec.clientId);
                    const isActive = myActiveRec?.recordingId === rec.id;
                    return (
                      <div key={rec.id}
                        className={`rounded-lg border p-2 text-xs space-y-1 ${
                          isActive ? 'border-primary bg-primary/5' :
                          rec.status === 'concluida' ? 'border-success/30 bg-success/5' : 'border-border bg-card'
                        }`}
                        style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${color})` }}
                      >
                        <p className="font-medium truncate">{getClientName(rec.clientId)}</p>
                        <p className="text-muted-foreground">{rec.startTime}</p>
                        {rec.status === 'concluida' && (
                          <Badge className="bg-success/20 text-success border-success/30 text-[9px]">Gravado</Badge>
                        )}
                        {isActive && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] animate-pulse">● Ao vivo</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scripts Dialog ── */}
      <Dialog open={scriptsOpen} onOpenChange={setScriptsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} />
              Roteiros — {clients.find(c => c.id === scriptsClientId)?.companyName}
            </DialogTitle>
          </DialogHeader>

          {clientScripts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum roteiro pendente</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Selecione os roteiros para esta gravação:</p>
              <div className="space-y-2">
                {clientScripts.map(script => (
                  <label key={script.id} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors">
                    <Checkbox
                      checked={selectedScriptIds.has(script.id)}
                      onCheckedChange={checked => {
                        const next = new Set(selectedScriptIds);
                        checked ? next.add(script.id) : next.delete(script.id);
                        setSelectedScriptIds(next);
                      }}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{script.title}</p>
                      <Badge variant="outline" className="text-[10px] mt-1">{SCRIPT_VIDEO_TYPE_LABELS[script.videoType]}</Badge>
                    </div>
                  </label>
                ))}
              </div>
              {selectedScriptIds.size > 0 && (
                <Button onClick={handleMarkScriptsRecorded} className="w-full">
                  <Check size={16} className="mr-2" />
                  Marcar {selectedScriptIds.size} como gravado(s)
                </Button>
              )}
            </>
          )}

          {/* Already recorded */}
          {(() => {
            const recorded = scripts.filter(s => s.clientId === scriptsClientId && s.recorded);
            if (recorded.length === 0) return null;
            return (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm font-medium mb-2">Roteiros já gravados</p>
                <div className="space-y-2">
                  {recorded.map(script => (
                    <div key={script.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{script.title}</p>
                        <Badge className="text-[10px] bg-success/20 text-success border-success/30">{SCRIPT_VIDEO_TYPE_LABELS[script.videoType]}</Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleReturnScript(script)}>
                        <Undo2 size={14} className="mr-1" /> Retornar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
