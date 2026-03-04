import { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { Recording, RecordingType, Script, DayOfWeek } from '@/types';
import { SCRIPT_VIDEO_TYPE_LABELS, DAY_LABELS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, ChevronLeft, ChevronRight, Check, XCircle, AlertTriangle, FileText, Undo2, CalendarDays, Columns3, Pencil } from 'lucide-react';
import { format, addDays, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import UserAvatar from '@/components/UserAvatar';

const DATE_TO_DAY: Record<number, DayOfWeek> = {
  0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
};

export default function Schedule() {
  const {
    clients, users, recordings, scripts, settings,
    updateScript, addRecording, updateRecording, cancelRecording,
    hasConflict, isWithinWorkHours,
  } = useApp();

  const [monthOffset, setMonthOffset] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<Recording | null>(null);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [scriptsClientId, setScriptsClientId] = useState('');
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ clientId: '', videomakerId: '', date: '', startTime: '09:00', type: 'fixa' as RecordingType });
  const [editForm, setEditForm] = useState({ clientId: '', videomakerId: '', date: '', startTime: '', type: 'fixa' as RecordingType, status: 'agendada' as Recording['status'] });
  const [filterVideomaker, setFilterVideomaker] = useState('all');

  const videomakers = users.filter(u => u.role === 'videomaker');
  const currentMonth = addMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Build calendar grid days
  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let d = calendarStart;
    while (d <= calendarEnd) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [calendarStart, calendarEnd]);

  const filteredRecordings = useMemo(() => {
    let recs = recordings;
    if (filterVideomaker !== 'all') recs = recs.filter(r => r.videomakerId === filterVideomaker);
    return recs;
  }, [recordings, filterVideomaker]);

  // Low-script warning
  const lowScriptClients = useMemo(() => {
    return clients.filter(c => {
      const pending = scripts.filter(s => s.clientId === c.id && !s.recorded);
      return pending.length <= 2;
    }).map(c => ({
      ...c,
      pendingCount: scripts.filter(s => s.clientId === c.id && !s.recorded).length,
    }));
  }, [clients, scripts]);

  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return filteredRecordings.filter(r => r.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getVideomaker = (id: string) => users.find(u => u.id === id);
  const getVideomakerName = (id: string) => getVideomaker(id)?.name || '—';
  const getClientColor = (id: string) => clients.find(c => c.id === id)?.color || '220 10% 50%';

  const typeLabels: Record<RecordingType, string> = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.' };

  // ====== AUTO-RESCHEDULING LOGIC ======
  const findNextDateForDay = (dayOfWeek: DayOfWeek, afterDate: string): string => {
    const base = new Date(afterDate + 'T12:00:00');
    const targetDayNum = Object.entries(DATE_TO_DAY).find(([_, v]) => v === dayOfWeek)?.[0];
    if (!targetDayNum) return afterDate;
    const target = parseInt(targetDayNum);
    for (let i = 0; i <= 14; i++) {
      const candidate = addDays(base, i);
      if (getDay(candidate) === target && format(candidate, 'yyyy-MM-dd') >= afterDate) {
        return format(candidate, 'yyyy-MM-dd');
      }
    }
    return afterDate;
  };

  const tryAutoReschedule = useCallback((rec: Recording) => {
    const client = clients.find(c => c.id === rec.clientId);
    if (!client) return false;

    const today = format(new Date(), 'yyyy-MM-dd');
    // Use the client's assigned videomaker — each client has their own
    const assignedVm = client.videomaker;
    const assignedVmName = getVideomakerName(assignedVm);

    // Attempt 1: backup day + backup time with client's videomaker
    const backupDate = findNextDateForDay(client.backupDay, today);
    const backupDayOfWeek = DATE_TO_DAY[getDay(new Date(backupDate + 'T12:00:00'))];
    if (isWithinWorkHours(backupDayOfWeek, client.backupTime)) {
      if (!hasConflict(assignedVm, backupDate, client.backupTime)) {
        const ok = addRecording({
          id: crypto.randomUUID(), clientId: rec.clientId, videomakerId: assignedVm,
          date: backupDate, startTime: client.backupTime, type: 'secundaria', status: 'agendada',
        });
        if (ok) {
          toast.success(`Reagendado para ${format(new Date(backupDate + 'T12:00:00'), 'dd/MM')} (backup) às ${client.backupTime} com ${assignedVmName}`);
          return true;
        }
      }
    }

    // Attempt 2: extra day + fixed time with client's videomaker
    if (client.acceptsExtra) {
      const extraDate = findNextDateForDay(client.extraDay, today);
      const extraDayOfWeek = DATE_TO_DAY[getDay(new Date(extraDate + 'T12:00:00'))];
      if (isWithinWorkHours(extraDayOfWeek, client.fixedTime)) {
        if (!hasConflict(assignedVm, extraDate, client.fixedTime)) {
          const ok = addRecording({
            id: crypto.randomUUID(), clientId: rec.clientId, videomakerId: assignedVm,
            date: extraDate, startTime: client.fixedTime, type: 'extra', status: 'agendada',
          });
          if (ok) {
            toast.success(`Reagendado para dia extra ${format(new Date(extraDate + 'T12:00:00'), 'dd/MM')} às ${client.fixedTime} com ${assignedVmName}`);
            return true;
          }
        }
      }
    }

    toast.warning(`Não foi possível reagendar — ${assignedVmName} sem vagas disponíveis no backup ou extra`);
    return false;
  }, [clients, hasConflict, isWithinWorkHours, addRecording]);

  const handleAdd = () => {
    if (!form.clientId || !form.videomakerId || !form.date || !form.startTime) {
      toast.error('Preencha todos os campos'); return;
    }
    if (hasConflict(form.videomakerId, form.date, form.startTime)) {
      toast.error('Conflito de horário!'); return;
    }
    const ok = addRecording({ ...form, id: crypto.randomUUID(), status: 'agendada' });
    if (!ok) { toast.error('Conflito de horário!'); return; }
    toast.success('Gravação agendada');
    setNewOpen(false);
  };

  const handleCancel = (rec: Recording) => {
    cancelRecording(rec.id);
    toast.info('Gravação cancelada — tentando reagendar...');
    tryAutoReschedule(rec);
  };

  const handleNoShow = (rec: Recording) => {
    updateRecording({ ...rec, status: 'cancelada' });
    toast.warning(`${getClientName(rec.clientId)} — não gravou`);
    tryAutoReschedule(rec);
  };

  const handleComplete = (rec: Recording) => {
    updateRecording({ ...rec, status: 'concluida' });
    toast.success('Gravação concluída');
  };

  const openEditRecording = (rec: Recording) => {
    setEditingRec(rec);
    setEditForm({ clientId: rec.clientId, videomakerId: rec.videomakerId, date: rec.date, startTime: rec.startTime, type: rec.type, status: rec.status });
    setEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editingRec) return;
    if (!editForm.clientId || !editForm.videomakerId || !editForm.date || !editForm.startTime) {
      toast.error('Preencha todos os campos'); return;
    }
    // Check conflict only if date/time/videomaker changed
    const changed = editForm.date !== editingRec.date || editForm.startTime !== editingRec.startTime || editForm.videomakerId !== editingRec.videomakerId;
    if (changed && editForm.status !== 'cancelada' && hasConflict(editForm.videomakerId, editForm.date, editForm.startTime, editingRec.id)) {
      toast.error('Conflito de horário!'); return;
    }
    updateRecording({ ...editingRec, ...editForm });
    toast.success('Gravação atualizada');
    setEditOpen(false);
    setEditingRec(null);
  };

  const clientScripts = useMemo(() => {
    if (!scriptsClientId) return [];
    return scripts.filter(s => s.clientId === scriptsClientId && !s.recorded);
  }, [scripts, scriptsClientId]);

  const openScriptsForClient = (clientId: string) => {
    setScriptsClientId(clientId);
    setSelectedScriptIds(new Set());
    setScriptsOpen(true);
  };

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
    toast.success('Roteiro retornado ao banco de dados');
  };

  // ====== KANBAN: grouped by day of current week ======
  const kanbanWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const kanbanAllDays = Array.from({ length: 7 }, (_, i) => addDays(kanbanWeekStart, i));
  const kanbanDays = kanbanAllDays.filter(day => {
    const dayNum = getDay(day);
    if (dayNum >= 1 && dayNum <= 5) return true; // seg-sex always
    // Show weekend only if there are recordings
    const dateStr = format(day, 'yyyy-MM-dd');
    return filteredRecordings.some(r => r.date === dateStr);
  });

  const statusTag = (rec: Recording) => {
    if (rec.status === 'concluida') return <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Gravado</Badge>;
    if (rec.status === 'cancelada') return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Não Gravou</Badge>;
    return <Badge variant="outline" className="text-[10px]">{typeLabels[rec.type]}</Badge>;
  };

  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold">Agenda</h1>
        <Button onClick={() => { setForm({ clientId: '', videomakerId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', type: 'fixa' }); setNewOpen(true); }}>
          <Plus size={16} className="mr-2" /> Nova Gravação
        </Button>
      </div>

      {/* Low script warnings */}
      {lowScriptClients.length > 0 && (
        <div className="space-y-1.5">
          {lowScriptClients.map(c => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-sm">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <span>
                <strong>{c.companyName}</strong> tem apenas <strong>{c.pendingCount}</strong> roteiro{c.pendingCount !== 1 ? 's' : ''} pendente{c.pendingCount !== 1 ? 's' : ''}.
                <span className="text-muted-foreground ml-1">Crie novos roteiros!</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="calendar" className="w-full">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays size={14} /> Calendário</TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1.5"><Columns3 size={14} /> Kanban</TabsTrigger>
        </TabsList>

        {/* ===== MONTHLY CALENDAR VIEW ===== */}
        <TabsContent value="calendar" className="space-y-3 mt-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterVideomaker} onValueChange={setFilterVideomaker}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Videomaker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft size={18} /></Button>
              <span className="font-display font-semibold text-sm capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </span>
              <Button variant="ghost" size="icon" onClick={() => setMonthOffset(m => m + 1)}><ChevronRight size={18} /></Button>
              <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)}>Hoje</Button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
              <div key={d} className="text-xs font-semibold text-muted-foreground text-center py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const dayRecs = getRecsForDay(day);

              return (
                <div
                  key={dateStr}
                  className={`glass-card p-1.5 min-h-[90px] transition-all ${
                    !isCurrentMonth ? 'opacity-40' : ''
                  } ${isToday ? 'ring-1 ring-primary' : ''}`}
                >
                  <p className={`text-xs font-semibold mb-1 text-center ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {format(day, 'd')}
                  </p>
                  <div className="space-y-0.5">
                    {dayRecs.slice(0, 3).map(rec => (
                      <div
                        key={rec.id}
                        className="rounded px-1 py-0.5 text-[10px] truncate cursor-pointer group relative"
                        style={{ backgroundColor: `hsl(${getClientColor(rec.clientId)} / 0.15)`, borderLeft: `2px solid hsl(${getClientColor(rec.clientId)})` }}
                      >
                        <span className="font-medium">{getClientName(rec.clientId)}</span>
                        <span className="text-muted-foreground ml-1">{rec.startTime}</span>
                        {rec.status === 'concluida' && <Check size={8} className="inline ml-0.5 text-success" />}
                        {rec.status === 'cancelada' && <XCircle size={8} className="inline ml-0.5 text-destructive" />}

                        {/* Hover tooltip with avatar + actions */}
                        <div className="absolute left-0 top-full mt-0.5 hidden group-hover:flex flex-col gap-1 bg-card rounded-lg p-2 shadow-lg border border-border z-20 min-w-[140px]">
                          <div className="flex items-center gap-1.5">
                            {(() => { const vm = getVideomaker(rec.videomakerId); return vm ? <UserAvatar user={vm} size="sm" className="w-5 h-5 text-[8px]" /> : null; })()}
                            <span className="text-[10px] font-medium truncate">{getVideomakerName(rec.videomakerId)}</span>
                          </div>
                          <div className="flex gap-0.5 pt-0.5">
                            <button onClick={() => openEditRecording(rec)} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Editar"><Pencil size={10} /></button>
                            {rec.status === 'agendada' && (
                              <>
                                <button onClick={() => openScriptsForClient(rec.clientId)} className="p-0.5 rounded hover:bg-primary/20 text-primary" title="Roteiros"><FileText size={10} /></button>
                                <button onClick={() => handleComplete(rec)} className="p-0.5 rounded hover:bg-success/20 text-success"><Check size={10} /></button>
                                <button onClick={() => handleNoShow(rec)} className="p-0.5 rounded hover:bg-warning/20 text-warning" title="Não gravou"><XCircle size={10} /></button>
                                <button onClick={() => handleCancel(rec)} className="p-0.5 rounded hover:bg-destructive/20 text-destructive" title="Cancelar"><XCircle size={10} /></button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {dayRecs.length > 3 && (
                      <p className="text-[9px] text-muted-foreground text-center">+{dayRecs.length - 3} mais</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ===== KANBAN VIEW — Recording cards grouped by day ===== */}
        <TabsContent value="kanban" className="space-y-3 mt-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterVideomaker} onValueChange={setFilterVideomaker}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Videomaker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">Semana atual</span>
          </div>

          <div className={`grid grid-cols-1 gap-2 min-h-[400px]`} style={{ gridTemplateColumns: `repeat(${kanbanDays.length}, minmax(0, 1fr))` }}>
            {kanbanDays.map(day => {
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
                    <p className="text-[10px] text-muted-foreground">{format(day, 'MMM', { locale: ptBR })}</p>
                  </div>

                  <div className="space-y-2">
                    {dayRecs.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-4">Sem gravações</p>
                    )}
                    {dayRecs.map(rec => (
                      <motion.div
                        key={rec.id}
                        layout
                        className="rounded-lg border border-border p-2.5 space-y-1.5 bg-card hover:shadow-md transition-shadow group relative"
                        style={{ borderLeft: `3px solid hsl(${getClientColor(rec.clientId)})` }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-medium text-xs truncate">{getClientName(rec.clientId)}</p>
                          {statusTag(rec)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(() => { const vm = getVideomaker(rec.videomakerId); return vm ? <UserAvatar user={vm} size="sm" className="w-5 h-5 text-[8px]" /> : null; })()}
                          <p className="text-[10px] text-muted-foreground">{rec.startTime} — {getVideomakerName(rec.videomakerId)}</p>
                        </div>

                        {/* Actions — edit always visible, status actions for agendada */}
                        <div className="flex gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                          <button onClick={() => openEditRecording(rec)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80 flex items-center gap-0.5">
                            <Pencil size={10} /> Editar
                          </button>
                          {rec.status === 'agendada' && (
                            <>
                              <button onClick={() => openScriptsForClient(rec.clientId)} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-0.5">
                                <FileText size={10} /> Roteiros
                              </button>
                              <button onClick={() => handleComplete(rec)} className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success hover:bg-success/20 flex items-center gap-0.5">
                                <Check size={10} /> Gravado
                              </button>
                              <button onClick={() => handleNoShow(rec)} className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center gap-0.5">
                                <XCircle size={10} /> Não Gravou
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* New recording dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Gravação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select value={form.clientId} onValueChange={v => setForm({ ...form, clientId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Videomaker</Label>
              <Select value={form.videomakerId} onValueChange={v => setForm({ ...form, videomakerId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Data</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="space-y-1"><Label>Horário</Label><Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></div>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as RecordingType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixa">Fixa</SelectItem>
                  <SelectItem value="extra">Extra</SelectItem>
                  <SelectItem value="secundaria">Secundária</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} className="w-full">Agendar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit recording dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil size={18} /> Editar Gravação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select value={editForm.clientId} onValueChange={v => setEditForm({ ...editForm, clientId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Videomaker</Label>
              <Select value={editForm.videomakerId} onValueChange={v => setEditForm({ ...editForm, videomakerId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Data</Label><Input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} /></div>
              <div className="space-y-1"><Label>Horário</Label><Input type="time" value={editForm.startTime} onChange={e => setEditForm({ ...editForm, startTime: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={editForm.type} onValueChange={v => setEditForm({ ...editForm, type: v as RecordingType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixa">Fixa</SelectItem>
                    <SelectItem value="extra">Extra</SelectItem>
                    <SelectItem value="secundaria">Secundária</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v as Recording['status'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendada">Agendada</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleEditSave} className="w-full">Salvar Alterações</Button>
          </div>
        </DialogContent>
      </Dialog>

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
              <p className="text-sm">Nenhum roteiro pendente para este cliente</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Selecione os roteiros que serão gravados nesta sessão:</p>
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

          {/* Already recorded scripts */}
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
                      <Button variant="ghost" size="sm" onClick={() => handleReturnScript(script)} title="Retornar ao banco">
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
