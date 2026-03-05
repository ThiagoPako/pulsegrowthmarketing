import { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { Recording, RecordingType, Script, DayOfWeek, Client } from '@/types';
import { SCRIPT_VIDEO_TYPE_LABELS, DAY_LABELS } from '@/types';
import { useEndoClientes, useEndoAgendamentos } from '@/hooks/useEndomarketing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, ChevronLeft, ChevronRight, Check, XCircle, AlertTriangle, FileText, Undo2, CalendarDays, Columns3, Pencil, Sparkles, RefreshCw, MessageSquare } from 'lucide-react';
import { format, addDays, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';
import {
  sendManualConfirmation,
  sendRecordingCancelledNotification,
  sendRecordingConfirmedNotification,
  sendBackupInviteNotification,
} from '@/services/whatsappService';

// Endomarketing brand color (magenta/fuchsia)
const ENDO_COLOR = '292 84% 61%';

// Unified calendar event
interface CalendarEvent {
  id: string;
  type: 'recording' | 'endomarketing';
  clientName: string;
  color: string;
  startTime: string;
  date: string;
  status: string;
  // Recording-specific
  recording?: Recording;
  // Endo-specific
  endoDuration?: number;
  endoClientId?: string;
}

const DATE_TO_DAY: Record<number, DayOfWeek> = {
  0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
};

export default function Schedule() {
  const {
    clients, users, recordings, scripts, settings, activeRecordings,
    updateScript, addRecording, updateRecording, cancelRecording, cancelAndReschedule,
    regenerateScheduleForClient,
    hasConflict, isWithinWorkHours,
  } = useApp();

  // Endomarketing data
  const { clientes: endoClientes } = useEndoClientes();
  const { agendamentos: endoAgendamentos } = useEndoAgendamentos();

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
  const [showEndo, setShowEndo] = useState(true);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenClientId, setRegenClientId] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [cancellingRec, setCancellingRec] = useState<Recording | null>(null);

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

  const getEventsForDay = useCallback((date: Date): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const events: CalendarEvent[] = [];

    // Regular recordings
    filteredRecordings.filter(r => r.date === dateStr).forEach(rec => {
      events.push({
        id: rec.id,
        type: 'recording',
        clientName: clients.find(c => c.id === rec.clientId)?.companyName || '—',
        color: clients.find(c => c.id === rec.clientId)?.color || '220 10% 50%',
        startTime: rec.startTime,
        date: rec.date,
        status: rec.status,
        recording: rec,
      });
    });

    // Endomarketing agendamentos
    if (showEndo) {
      endoAgendamentos.filter(a => a.date === dateStr && a.status !== 'cancelado').forEach(ag => {
        const endoClient = endoClientes.find(c => c.id === ag.cliente_id);
        events.push({
          id: `endo-${ag.id}`,
          type: 'endomarketing',
          clientName: endoClient?.company_name || '?',
          color: ENDO_COLOR,
          startTime: ag.start_time,
          date: ag.date,
          status: ag.status,
          endoDuration: ag.duration,
          endoClientId: ag.cliente_id,
        });
      });
    }

    return events.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [filteredRecordings, clients, showEndo, endoAgendamentos, endoClientes]);

  // Keep legacy helper for internal use
  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return filteredRecordings.filter(r => r.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getVideomaker = (id: string) => users.find(u => u.id === id);
  const getVideomakerName = (id: string) => getVideomaker(id)?.name || '—';
  const getClientColor = (id: string) => clients.find(c => c.id === id)?.color || '220 10% 50%';

  const typeLabels: Record<RecordingType, string> = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.', backup: 'Backup' };

  const handleRegenerate = async () => {
    if (!regenClientId) { toast.error('Selecione um cliente'); return; }
    const client = clients.find(c => c.id === regenClientId);
    if (!client) return;
    setRegenLoading(true);
    try {
      const { deleted, created } = await regenerateScheduleForClient(client);
      toast.success(`Agenda regenerada: ${deleted} removida(s), ${created} criada(s)`);
      setRegenOpen(false);
    } catch (e) {
      toast.error('Erro ao regenerar agenda');
    }
    setRegenLoading(false);
  };

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

  // Get eligible backup clients for a cancelled slot
  const backupCandidates = useMemo(() => {
    if (!cancellingRec) return [];
    const recDate = new Date(cancellingRec.date + 'T12:00:00');
    const dayNum = getDay(recDate);
    const dayMap: Record<number, DayOfWeek> = { 0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado' };
    const recDayOfWeek = dayMap[dayNum];
    return clients.filter(c => {
      if (c.id === cancellingRec.clientId) return false;
      // Client must have this day as their backup day
      if (c.backupDay !== recDayOfWeek) return false;
      // Check if the backup time fits in the cancelled slot's time
      // Or simply: client has a backup configured for this day
      // Check no conflict for the client's videomaker on this slot
      return !hasConflict(cancellingRec.videomakerId, cancellingRec.date, cancellingRec.startTime, cancellingRec.id);
    });
  }, [cancellingRec, clients, hasConflict]);

  const handleCancel = (rec: Recording) => {
    setCancellingRec(rec);
    setBackupOpen(true);
  };

  const handleCancelWithoutBackup = async () => {
    if (!cancellingRec) return;
    cancelRecording(cancellingRec.id);
    // Send cancellation message
    const client = clients.find(c => c.id === cancellingRec.clientId);
    if (client?.whatsapp) {
      await sendRecordingCancelledNotification(client.whatsapp, client.companyName, client.id);
      toast.info('Mensagem de cancelamento enviada ao cliente');
    }
    toast.warning('Gravação cancelada sem substituição');
    setBackupOpen(false);
    setCancellingRec(null);
  };

  const handleSelectBackup = async (backupClient: Client) => {
    if (!cancellingRec) return;
    // Cancel original
    cancelRecording(cancellingRec.id);

    // Send cancellation message to original client
    const originalClient = clients.find(c => c.id === cancellingRec.clientId);
    if (originalClient?.whatsapp) {
      await sendRecordingCancelledNotification(originalClient.whatsapp, originalClient.companyName, originalClient.id);
    }

    // Create backup recording in same slot
    const newRec: Recording = {
      id: crypto.randomUUID(),
      clientId: backupClient.id,
      videomakerId: cancellingRec.videomakerId,
      date: cancellingRec.date,
      startTime: cancellingRec.startTime,
      type: 'backup',
      status: 'agendada',
    };
    addRecording(newRec);

    // Send backup invite to the backup client
    if (backupClient.whatsapp) {
      await sendBackupInviteNotification(
        backupClient.whatsapp, backupClient.companyName, backupClient.id,
        cancellingRec.date, cancellingRec.startTime
      );
      toast.success(`Convite de backup enviado para ${backupClient.companyName}`);
    }

    toast.success(`${backupClient.companyName} encaixado como Backup no lugar de ${getClientName(cancellingRec.clientId)}`);
    setBackupOpen(false);
    setCancellingRec(null);
  };

  const handleNoShow = (rec: Recording) => {
    updateRecording({ ...rec, status: 'cancelada' });
    toast.warning(`${getClientName(rec.clientId)} — não gravou`);
  };

  const handleComplete = async (rec: Recording) => {
    updateRecording({ ...rec, status: 'concluida' });
    toast.success('Gravação concluída');
    // Send confirmed message via WhatsApp
    const client = clients.find(c => c.id === rec.clientId);
    if (client?.whatsapp) {
      const result = await sendRecordingConfirmedNotification(
        client.whatsapp, client.companyName, client.id, rec.date, rec.startTime
      );
      if (result.success) toast.success('Mensagem de confirmação enviada ao cliente');
    }
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

  const handleSendConfirmation = async (rec: Recording) => {
    const client = clients.find(c => c.id === rec.clientId);
    const vm = users.find(u => u.id === rec.videomakerId);
    if (!client?.whatsapp) {
      toast.error('Cliente sem WhatsApp cadastrado');
      return;
    }
    toast.loading('Enviando confirmação...', { id: 'confirmation' });
    const result = await sendManualConfirmation(
      rec.id, client.id, client.whatsapp, client.companyName,
      rec.date, rec.startTime, vm?.name || 'Equipe'
    );
    if (result.success) {
      toast.success('Confirmação enviada via WhatsApp!', { id: 'confirmation' });
    } else {
      toast.error(result.error || 'Erro ao enviar confirmação', { id: 'confirmation' });
    }
  };


  const kanbanWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const kanbanAllDays = Array.from({ length: 7 }, (_, i) => addDays(kanbanWeekStart, i));
  const kanbanDays = kanbanAllDays.filter(day => {
    const dayNum = getDay(day);
    if (dayNum >= 1 && dayNum <= 5) return true;
    const events = getEventsForDay(day);
    return events.length > 0;
  });

  const isRecordingActive = (recId: string) => activeRecordings.some(a => a.recordingId === recId);

  const statusTag = (rec: Recording) => {
    if (isRecordingActive(rec.id)) return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] animate-pulse">● Gravando</Badge>;
    if (rec.status === 'concluida') return <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Gravado</Badge>;
    if (rec.status === 'cancelada') return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Não Gravou</Badge>;
    if (rec.type === 'backup') return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px]">Backup</Badge>;
    return <Badge variant="outline" className="text-[10px]">{typeLabels[rec.type]}</Badge>;
  };

  const endoTag = () => (
    <Badge className="text-[10px] border-0" style={{ backgroundColor: `hsl(${ENDO_COLOR} / 0.2)`, color: `hsl(${ENDO_COLOR})` }}>
      <Sparkles size={8} className="mr-0.5" /> Endomarketing
    </Badge>
  );

  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold">Agenda</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setRegenClientId(''); setRegenOpen(true); }}>
            <RefreshCw size={16} className="mr-2" /> Regenerar Agenda
          </Button>
          <Button onClick={() => { setForm({ clientId: '', videomakerId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', type: 'fixa' }); setNewOpen(true); }}>
            <Plus size={16} className="mr-2" /> Nova Gravação
          </Button>
        </div>
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
            <button
              onClick={() => setShowEndo(!showEndo)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                showEndo
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
              style={showEndo ? { backgroundColor: `hsl(${ENDO_COLOR})` } : undefined}
            >
              <Sparkles size={12} />
              Endomarketing
            </button>
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
              const dayEvents = getEventsForDay(day);

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
                    {dayEvents.slice(0, 4).map(evt => {
                      const active = evt.type === 'recording' && evt.recording && isRecordingActive(evt.recording.id);
                      return (
                      <div
                        key={evt.id}
                        className={`rounded px-1 py-0.5 text-[10px] truncate cursor-pointer group relative ${active ? 'ring-1 ring-primary animate-pulse' : ''}`}
                        style={{ backgroundColor: `hsl(${evt.color} / 0.15)`, borderLeft: `2px solid hsl(${evt.color})` }}
                      >
                        {evt.type === 'endomarketing' && <Sparkles size={7} className="inline mr-0.5" style={{ color: `hsl(${ENDO_COLOR})` }} />}
                        <span className="font-medium">{evt.clientName}</span>
                        <span className="text-muted-foreground ml-1">{evt.startTime}</span>
                        {active && <span className="inline ml-0.5 text-primary font-bold">●</span>}
                        {evt.type === 'recording' && evt.recording?.status === 'concluida' && <Check size={8} className="inline ml-0.5 text-success" />}
                        {evt.type === 'recording' && evt.recording?.status === 'cancelada' && <XCircle size={8} className="inline ml-0.5 text-destructive" />}

                        {/* Hover tooltip */}
                        <div className="absolute left-0 top-full mt-0.5 hidden group-hover:flex flex-col gap-1 bg-card rounded-lg p-2 shadow-lg border border-border z-20 min-w-[140px]">
                          {evt.type === 'endomarketing' ? (
                            <>
                              <div className="flex items-center gap-1">
                                <Sparkles size={10} style={{ color: `hsl(${ENDO_COLOR})` }} />
                                <span className="text-[10px] font-semibold" style={{ color: `hsl(${ENDO_COLOR})` }}>Endomarketing</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{evt.endoDuration}min</span>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                {(() => { const vm = getVideomaker(evt.recording!.videomakerId); return vm ? <UserAvatar user={vm} size="sm" className="w-5 h-5 text-[8px]" /> : null; })()}
                                <span className="text-[10px] font-medium truncate">{getVideomakerName(evt.recording!.videomakerId)}</span>
                              </div>
                              <div className="flex gap-0.5 pt-0.5">
                                <button onClick={() => openEditRecording(evt.recording!)} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Editar"><Pencil size={10} /></button>
                                {evt.recording!.status === 'agendada' && (
                                  <>
                                    <button onClick={() => openScriptsForClient(evt.recording!.clientId)} className="p-0.5 rounded hover:bg-primary/20 text-primary" title="Roteiros"><FileText size={10} /></button>
                                    <button onClick={() => handleSendConfirmation(evt.recording!)} className="p-0.5 rounded hover:bg-success/20 text-success" title="Enviar Confirmação"><MessageSquare size={10} /></button>
                                    <button onClick={() => handleComplete(evt.recording!)} className="p-0.5 rounded hover:bg-success/20 text-success" title="Gravado"><Check size={10} /></button>
                                    <button onClick={() => handleCancel(evt.recording!)} className="p-0.5 rounded hover:bg-destructive/20 text-destructive" title="Cancelar"><XCircle size={10} /></button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })}
                    {dayEvents.length > 4 && (
                      <p className="text-[9px] text-muted-foreground text-center">+{dayEvents.length - 4} mais</p>
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
              const dayEvents = getEventsForDay(day);

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
                    {dayEvents.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-4">Sem gravações</p>
                    )}
                    {dayEvents.map(evt => {
                      const active = evt.type === 'recording' && evt.recording && isRecordingActive(evt.recording.id);
                      return (
                      <motion.div
                        key={evt.id}
                        layout
                        className={`rounded-lg border p-2.5 space-y-1.5 bg-card hover:shadow-md transition-shadow group relative ${
                          active ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border'
                        }`}
                        style={{ borderLeft: `3px solid hsl(${evt.color})` }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {(() => { const cl = clients.find(c => c.id === (evt.recording?.clientId || '')); return cl ? <ClientLogo client={cl} size="sm" className="w-5 h-5 text-[8px] rounded" /> : null; })()}
                            <p className="font-medium text-xs truncate">{evt.clientName}</p>
                          </div>
                          {evt.type === 'endomarketing' ? endoTag() : evt.recording && statusTag(evt.recording)}
                        </div>
                        {evt.type === 'endomarketing' ? (
                          <p className="text-[10px] text-muted-foreground">{evt.startTime} · {evt.endoDuration}min</p>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {(() => { const vm = getVideomaker(evt.recording!.videomakerId); return vm ? <UserAvatar user={vm} size="sm" className="w-5 h-5 text-[8px]" /> : null; })()}
                            <p className="text-[10px] text-muted-foreground">{evt.startTime} — {getVideomakerName(evt.recording!.videomakerId)}</p>
                          </div>
                        )}

                        {/* Actions — only for recordings */}
                        {evt.type === 'recording' && evt.recording && (
                          <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-border/50 hidden group-hover:grid transition-all">
                            <button onClick={() => openEditRecording(evt.recording!)} className="text-[10px] py-1.5 rounded-md bg-muted/60 text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1">
                              <Pencil size={10} /> Editar
                            </button>
                            {evt.recording.status === 'agendada' && (
                              <>
                                <button onClick={() => openScriptsForClient(evt.recording!.clientId)} className="text-[10px] py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/15 transition-colors flex items-center justify-center gap-1">
                                  <FileText size={10} /> Roteiros
                                </button>
                                <button onClick={() => handleSendConfirmation(evt.recording!)} className="text-[10px] py-1.5 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors flex items-center justify-center gap-1">
                                  <MessageSquare size={10} /> Confirmar
                                </button>
                                <button onClick={() => handleComplete(evt.recording!)} className="text-[10px] py-1.5 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors flex items-center justify-center gap-1">
                                  <Check size={10} /> Gravado
                                </button>
                                <button onClick={() => handleCancel(evt.recording!)} className="text-[10px] py-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center gap-1">
                                  <XCircle size={10} /> Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </motion.div>
                      );
                    })}
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
                  <SelectItem value="backup">Backup</SelectItem>
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
                  <SelectItem value="backup">Backup</SelectItem>
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

      {/* Regenerate Schedule Dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Regenerar Agenda</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove todas as gravações futuras com status "agendada" do cliente selecionado e gera novas com base nas configurações atuais.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select value={regenClientId} onValueChange={setRegenClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => {
                    const futureCount = recordings.filter(r => r.clientId === c.id && r.status === 'agendada' && r.date >= format(new Date(), 'yyyy-MM-dd')).length;
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${c.color})` }} />
                          {c.companyName}
                          {futureCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {futureCount} agendada{futureCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRegenOpen(false)}>Cancelar</Button>
              <Button onClick={handleRegenerate} disabled={!regenClientId || regenLoading}>
                {regenLoading ? <RefreshCw size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                Regenerar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Backup selection dialog */}
      <Dialog open={backupOpen} onOpenChange={(open) => { if (!open) { setBackupOpen(false); setCancellingRec(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" /> Cancelar Gravação
            </DialogTitle>
          </DialogHeader>
          {cancellingRec && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm">
                  <strong>{getClientName(cancellingRec.clientId)}</strong> — {cancellingRec.date} às {cancellingRec.startTime}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Videomaker: {getVideomakerName(cancellingRec.videomakerId)}
                </p>
              </div>

              {backupCandidates.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Clientes disponíveis para preencher esta vaga como <strong>Backup</strong>:
                  </p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {backupCandidates.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectBackup(c)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-primary/5 hover:border-primary/30 transition-colors text-left"
                      >
                        <ClientLogo client={c} size="sm" className="w-8 h-8 rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.companyName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Backup: {DAY_LABELS[c.backupDay]} às {c.backupTime}
                          </p>
                        </div>
                        <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px] shrink-0">
                          Encaixar
                        </Badge>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum cliente com backup configurado para este dia.
                </p>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <Button variant="outline" onClick={() => { setBackupOpen(false); setCancellingRec(null); }}>
                  Voltar
                </Button>
                <Button variant="destructive" onClick={handleCancelWithoutBackup}>
                  <XCircle size={14} className="mr-1" /> Cancelar sem Backup
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
