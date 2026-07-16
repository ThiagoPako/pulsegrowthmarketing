import { useState, useMemo, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import type { Recording, RecordingType, Script, ScriptVideoType, ScriptContentFormat } from '@/types';
import { format, addDays, subDays, startOfWeek, endOfWeek, isToday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar, Users, GripVertical,
  Clock, Video, AlertTriangle, ArrowLeftRight, Check, Loader2, CalendarDays,
  Coffee, HelpCircle, Rocket, Plus, Trash2, X, FileText, Sparkles, User as UserIcon, ArrowRight, ArrowLeft, Pin, Clapperboard
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';
import TimeMarker from '@/components/scheduling/TimeMarker';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  agendada: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Agendada' },
  concluida: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Concluída' },
  cancelada: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Cancelada' },
  organizando_material: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Organizando' },
};

const TYPE_LABELS: Record<string, string> = {
  fixa: 'Fixa', extra: 'Extra', secundaria: 'Secundária',
  backup: 'Backup', endomarketing: 'Endomkt', avulso: 'Avulso',
};

const STANDARD_SLOTS = ['08:30', '10:30', '14:30', '16:30'];
const PULSE_SLOTS = ['08:00', '10:00', '14:00', '16:00', '18:00'];
const LUNCH_SLOTS = ['12:30', '13:30'];




export default function RecordingControl() {
  const { recordings, clients, users, scripts, addScript, updateScript, updateRecording, addRecording, deleteRecording, hasConflict, settings, refetchData } = useApp();
  const { user: authUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [draggedRecording, setDraggedRecording] = useState<Recording | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ vmId: string; time: string } | null>(null);
  const [dragOverVideomaker, setDragOverVideomaker] = useState<string | null>(null);
  const [dragOverWeekCell, setDragOverWeekCell] = useState<{ date: string; time: string } | null>(null);
  const [reassigning, setReassigning] = useState(false);

  // Multi-step wizard state
  type WizardStep = 'mode' | 'client' | 'script' | 'confirm';
  const [wizard, setWizard] = useState<{
    open: boolean; step: WizardStep; vmId: string; time: string; date: string;
    mode: 'client' | 'avulso' | 'story' | null;
    clientId: string;
    prospectName: string;
    type: RecordingType;
    scriptId: string | null;
    creatingScript: boolean;
    newScriptTitle: string;
    newScriptContent: string;
    newScriptVideoType: ScriptVideoType;
    newScriptFormat: ScriptContentFormat;
  }>({
    open: false, step: 'mode', vmId: '', time: '', date: '',
    mode: null, clientId: '', prospectName: '', type: 'extra',
    scriptId: null, creatingScript: false,
    newScriptTitle: '', newScriptContent: '',
    newScriptVideoType: 'vendas', newScriptFormat: 'reels',
  });
  const [saving, setSaving] = useState(false);
  const [creatingScriptSaving, setCreatingScriptSaving] = useState(false);

  const activeClients = useMemo(() =>
    clients.filter(c => c.status !== 'cancelado').sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [clients]
  );

  // Get all videomakers
  const videomakers = useMemo(() =>
    users.filter(u => u.role === 'videomaker').sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  // Get dates to display
  const displayDates = useMemo(() => {
    if (viewMode === 'day') return [format(selectedDate, 'yyyy-MM-dd')];
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 6 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));
  }, [selectedDate, viewMode]);

  // Filter recordings for selected date(s) — exclude cancelled
  const filteredRecordings = useMemo(() =>
    recordings.filter(r => displayDates.includes(r.date) && r.status !== 'cancelada'),
    [recordings, displayDates]
  );

  // Group recordings by videomaker and time slot
  const recordingsByVmAndSlot = useMemo(() => {
    const map: Record<string, Record<string, Recording>> = {};
    videomakers.forEach(vm => { map[vm.id] = {}; });
    map['__unassigned__'] = {};

    filteredRecordings.forEach(r => {
      const vmId = r.videomakerId && map[r.videomakerId] ? r.videomakerId : '__unassigned__';
      map[vmId][r.startTime] = r;
    });

    return map;
  }, [filteredRecordings, videomakers]);

  // Week grid: { [date]: { [time]: Recording[] } }
  const recordingsByDayAndSlot = useMemo(() => {
    const map: Record<string, Record<string, Recording[]>> = {};
    displayDates.forEach(d => { map[d] = {}; });
    filteredRecordings.forEach(r => {
      if (!map[r.date]) map[r.date] = {};
      if (!map[r.date][r.startTime]) map[r.date][r.startTime] = [];
      map[r.date][r.startTime].push(r);
    });
    return map;
  }, [filteredRecordings, displayDates]);

  // Navigation
  const goToday = () => setSelectedDate(new Date());
  const goPrev = () => setSelectedDate(d => viewMode === 'day' ? subDays(d, 1) : subDays(d, 7));
  const goNext = () => setSelectedDate(d => viewMode === 'day' ? addDays(d, 1) : addDays(d, 7));

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, recording: Recording) => {
    setDraggedRecording(recording);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', recording.id);
  };

  const handleDragOver = (e: React.DragEvent, videomakerId: string, time?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (time) {
      setDragOverSlot({ vmId: videomakerId, time });
    } else {
      setDragOverVideomaker(videomakerId);
    }
  };

  const handleDragLeave = () => {
    setDragOverSlot(null);
    setDragOverVideomaker(null);
  };

  const handleDrop = async (e: React.DragEvent, targetVideomakerId: string, targetTime?: string) => {
    e.preventDefault();
    setDragOverSlot(null);
    setDragOverVideomaker(null);

    if (!draggedRecording) return;
    
    // Check if anything actually changed
    const sameVideomaker = draggedRecording.videomakerId === targetVideomakerId;
    const sameTime = !targetTime || draggedRecording.startTime === targetTime;
    
    if (sameVideomaker && sameTime) {
      setDraggedRecording(null);
      return;
    }

    if (targetVideomakerId === '__unassigned__') {
      setDraggedRecording(null);
      return;
    }

    setReassigning(true);
    const oldVideomaker = users.find(u => u.id === draggedRecording.videomakerId);
    const newVideomaker = users.find(u => u.id === targetVideomakerId);
    const client = clients.find(c => c.id === draggedRecording.clientId);

    try {
      // Update recording
      const updatedRecording: Recording = {
        ...draggedRecording,
        videomakerId: targetVideomakerId,
        startTime: targetTime || draggedRecording.startTime,
      };
      updateRecording(updatedRecording);

      // Also update the client's default settings if this is a fixed recording
      if (draggedRecording.type === 'fixa' && client) {
        const updates: any = { videomaker_id: targetVideomakerId };
        if (targetTime && STANDARD_SLOTS.includes(targetTime)) {
          updates.fixed_time = targetTime;
        }
        await (supabase as any).from('clients').update(updates).eq('id', client.id);

      }

      toast.success(
        `Gravação "${client?.companyName || 'Cliente'}" movida para ${newVideomaker?.name || '?'} às ${targetTime || draggedRecording.startTime}`,
        { duration: 4000 }
      );

      // Refetch to sync
      setTimeout(() => refetchData(), 500);
    } catch (err: any) {
      toast.error('Erro ao mover gravação: ' + (err.message || 'erro'));
    } finally {
      setReassigning(false);
      setDraggedRecording(null);
    }
  };

  // Drop on a week-view cell: move recording to a different date/time, keeping the same videomaker
  const handleDropOnDayCell = async (e: React.DragEvent, targetDate: string, targetTime: string) => {
    e.preventDefault();
    setDragOverWeekCell(null);
    if (!draggedRecording) return;
    if (draggedRecording.date === targetDate && draggedRecording.startTime === targetTime) {
      setDraggedRecording(null);
      return;
    }
    // Conflict check with the same videomaker on target date/time (skip client-day rule to allow multi/day)
    const conflict = hasConflict(
      draggedRecording.videomakerId,
      targetDate,
      targetTime,
      draggedRecording.id,
      draggedRecording.type,
      draggedRecording.clientId,
      { skipClientDayCheck: true }
    );
    if (conflict.hasConflict) {
      toast.error(conflict.message || 'Conflito de horário no destino');
      setDraggedRecording(null);
      return;
    }
    setReassigning(true);
    const client = clients.find(c => c.id === draggedRecording.clientId);
    try {
      const updated: Recording = { ...draggedRecording, date: targetDate, startTime: targetTime };
      updateRecording(updated);
      toast.success(
        `Gravação "${client?.companyName || draggedRecording.prospectName || 'Cliente'}" movida para ${format(new Date(targetDate + 'T12:00:00'), 'dd/MM', { locale: ptBR })} às ${targetTime}`,
        { duration: 3500 }
      );
      setTimeout(() => refetchData(), 400);
    } catch (err: any) {
      toast.error('Erro ao mover: ' + (err.message || 'erro'));
    } finally {
      setReassigning(false);
      setDraggedRecording(null);
    }
  };

  const getClient = (clientId: string) => clients.find(c => c.id === clientId);

  const dateLabel = viewMode === 'day'
    ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
    : `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "dd/MM")} - ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "dd/MM")}`;

  const allSlots = useMemo(() => {
    const combined = [...STANDARD_SLOTS, ...PULSE_SLOTS, ...LUNCH_SLOTS].sort();
    return combined;
  }, []);



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Calendar size={22} className="text-primary" />
            </div>
            Controle de Gravações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agenda dinâmica: arraste os cards entre os horários e videomakers
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-primary">{filteredRecordings.length}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground">Concluídas</p>
            <p className="text-xl font-bold text-emerald-500">
              {filteredRecordings.filter(r => r.status === 'concluida').length}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-between bg-muted/30 border border-border rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="gap-1.5">
            <CalendarDays size={14} /> Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={goNext}>
            <ChevronRight size={16} />
          </Button>
        </div>

        <p className="text-sm font-semibold capitalize hidden sm:block">{dateLabel}</p>

        <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Dia
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Semana
          </button>
        </div>
      </div>

      {/* Reassigning overlay */}
      <AnimatePresence>
        {reassigning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="flex items-center gap-3 text-foreground">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-lg font-medium">Atualizando agenda...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid View */}
      {viewMode === 'day' && (
      <div className="relative overflow-x-auto pb-6 border rounded-2xl bg-muted/5">
        <div className="min-w-[1000px] relative">
          {/* Time Marker */}
          {viewMode === 'day' && (
            <div className="absolute inset-y-0 left-0 right-0 pointer-events-none mt-[60px] z-20">
              <TimeMarker startHour={8} endHour={19} showTimeLabel={true} />
            </div>
          )}

          {/* Header Row: Videomakers */}
          <div className="flex border-b sticky top-0 bg-background z-30">
            <div className="w-20 shrink-0 border-r bg-muted/20 flex items-center justify-center">
              <Clock size={16} className="text-muted-foreground/50" />
            </div>
            {videomakers.map(vm => (
              <div key={vm.id} className="flex-1 min-w-[200px] p-3 border-r last:border-r-0 flex items-center gap-2.5 bg-background">
                <UserAvatar user={vm} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{vm.displayName || vm.name}</p>
                  <p className="text-[10px] text-muted-foreground">Videomaker</p>
                </div>
              </div>
            ))}
          </div>

          {/* Slots Rows */}
          {allSlots.map(time => {
            const isPulse = PULSE_SLOTS.includes(time);
            const isLunch = LUNCH_SLOTS.includes(time);
            const isRestricted = isPulse || isLunch;
            
            return (
              <div key={time} className={`flex border-b last:border-b-0 ${isRestricted ? 'h-12 bg-muted/5' : 'h-32'}`}>
                {/* Time Label */}
                <div className={`w-20 shrink-0 border-r flex flex-col items-center justify-center ${isRestricted ? 'bg-muted/10' : 'bg-background'}`}>
                  <span className={`text-xs font-mono font-bold ${isRestricted ? 'text-muted-foreground/40' : 'text-foreground'}`}>
                    {time}
                  </span>
                  {isLunch ? <Coffee size={12} className="text-amber-500/20 mt-1" /> : isPulse ? <Rocket size={12} className="text-orange-500/30 mt-1" /> : null}
                </div>

                {/* Videomaker Cells */}
                {videomakers.map(vm => {
                  const recording = recordingsByVmAndSlot[vm.id]?.[time];
                  const isOver = dragOverSlot?.vmId === vm.id && dragOverSlot?.time === time;
                  
                  return (
                    <div
                      key={`${vm.id}-${time}`}
                      className={`flex-1 min-w-[200px] border-r last:border-r-0 relative p-1.5 transition-colors ${
                        isOver ? 'bg-primary/10 ring-2 ring-primary/30 ring-inset z-10' : ''
                      } ${isRestricted ? 'bg-muted/5' : 'bg-background/40 hover:bg-muted/5'}`}
                      onDragOver={e => !isRestricted && handleDragOver(e, vm.id, time)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => !isRestricted && handleDrop(e, vm.id, time)}
                    >
                      {recording ? (
                        <RecordingCard
                          recording={recording}
                          client={getClient(recording.clientId)}
                          isDragging={draggedRecording?.id === recording.id}
                          onDragStart={handleDragStart}
                          onDelete={async () => {
                            const label = getClient(recording.clientId)?.companyName || recording.prospectName || 'esta gravação';
                            if (!window.confirm(`Apagar permanentemente "${label}" às ${recording.startTime}?`)) return;
                            const ok = await deleteRecording(recording.id);
                            if (ok) { toast.success('Gravação apagada'); setTimeout(() => refetchData(), 300); }
                            else toast.error('Erro ao apagar');
                          }}
                        />
                      ) : isLunch ? (
                        <div className="h-full flex items-center justify-center bg-amber-500/5">
                          <span className="text-[9px] font-bold text-amber-500/20 uppercase tracking-[0.2em] font-mono">Almoço</span>
                        </div>
                      ) : isPulse ? (
                        <div className="h-full flex items-center justify-center overflow-hidden">
                          <motion.div 
                            className="flex items-center gap-1.5"
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Rocket size={10} className="text-orange-500/50" />
                            <span className="text-[9px] font-bold text-orange-500/30 uppercase tracking-[0.2em] font-mono">PULSE</span>
                          </motion.div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setWizard({
                              open: true, step: 'mode', vmId: vm.id, time, date: displayDates[0],
                              mode: null, clientId: '', prospectName: '', type: 'extra',
                              scriptId: null, creatingScript: false,
                              newScriptTitle: '', newScriptContent: '',
                              newScriptVideoType: 'vendas', newScriptFormat: 'reels',
                            });
                          }}
                          className="h-full w-full rounded-lg border-2 border-dashed border-transparent hover:border-primary/30 hover:bg-primary/5 flex items-center justify-center transition-colors group"
                        >
                          {draggedRecording ? (
                            <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-1">
                              <ArrowLeftRight size={14} className="text-primary/40" />
                              <span className="text-[10px] text-primary/40 font-medium">Soltar aqui</span>
                            </div>
                          ) : (
                            <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-1">
                              <Plus size={16} className="text-primary/50" />
                              <span className="text-[10px] text-primary/50 font-medium">Agendar</span>
                            </div>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}


        </div>
      </div>
      )}

      {viewMode === 'week' && (
        <div className="relative overflow-x-auto pb-6 border rounded-2xl bg-muted/5">
          <div className="min-w-[1100px]">
            {/* Header Row: Days */}
            <div className="flex border-b sticky top-0 bg-background z-30">
              <div className="w-20 shrink-0 border-r bg-muted/20 flex items-center justify-center">
                <Clock size={16} className="text-muted-foreground/50" />
              </div>
              {displayDates.map(d => {
                const dObj = new Date(d + 'T12:00:00');
                const isTodayCol = isSameDay(dObj, new Date());
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setSelectedDate(dObj); setViewMode('day'); }}
                    className={`flex-1 min-w-[160px] p-3 border-r last:border-r-0 text-left transition-colors ${
                      isTodayCol ? 'bg-primary/5' : 'bg-background hover:bg-muted/30'
                    }`}
                    title="Abrir este dia em modo Dia"
                  >
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isTodayCol ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(dObj, 'EEE', { locale: ptBR })}
                    </p>
                    <p className="text-lg font-bold leading-tight">{format(dObj, 'dd/MM')}</p>
                  </button>
                );
              })}
            </div>

            {/* Slot rows × Days */}
            {allSlots.map(time => {
              const isPulse = PULSE_SLOTS.includes(time);
              const isLunch = LUNCH_SLOTS.includes(time);
              const isRestricted = isPulse || isLunch;
              return (
                <div key={time} className={`flex border-b last:border-b-0 ${isRestricted ? 'h-10 bg-muted/5' : 'min-h-[110px]'}`}>
                  <div className={`w-20 shrink-0 border-r flex flex-col items-center justify-center ${isRestricted ? 'bg-muted/10' : 'bg-background'}`}>
                    <span className={`text-xs font-mono font-bold ${isRestricted ? 'text-muted-foreground/40' : 'text-foreground'}`}>{time}</span>
                    {isLunch ? <Coffee size={12} className="text-amber-500/20 mt-1" /> : isPulse ? <Rocket size={12} className="text-orange-500/30 mt-1" /> : null}
                  </div>
                  {displayDates.map(d => {
                    const cellRecs = recordingsByDayAndSlot[d]?.[time] || [];
                    const isOver = dragOverWeekCell?.date === d && dragOverWeekCell?.time === time;
                    const wouldConflict = !!(draggedRecording && isOver && !isRestricted && !(draggedRecording.date === d && draggedRecording.startTime === time) &&
                      hasConflict(
                        draggedRecording.videomakerId,
                        d,
                        time,
                        draggedRecording.id,
                        draggedRecording.type,
                        draggedRecording.clientId,
                        { skipClientDayCheck: true }
                      ).hasConflict);
                    return (
                      <div
                        key={`${d}-${time}`}
                        onDragOver={e => {
                          if (isRestricted) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = wouldConflict ? 'none' : 'move';
                          setDragOverWeekCell({ date: d, time });
                        }}
                        onDragLeave={() => setDragOverWeekCell(null)}
                        onDrop={e => !isRestricted && handleDropOnDayCell(e, d, time)}
                        className={`flex-1 min-w-[160px] border-r last:border-r-0 relative p-1.5 transition-colors ${
                          isOver
                            ? wouldConflict
                              ? 'bg-red-500/10 ring-2 ring-red-500/40 ring-inset z-10'
                              : 'bg-primary/10 ring-2 ring-primary/30 ring-inset z-10'
                            : ''
                        } ${isRestricted ? 'bg-muted/5' : 'bg-background/40 hover:bg-muted/5'}`}
                      >
                        {isLunch ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-[9px] font-bold text-amber-500/20 uppercase tracking-[0.2em] font-mono">Almoço</span>
                          </div>
                        ) : isPulse ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-[9px] font-bold text-orange-500/30 uppercase tracking-[0.2em] font-mono">PULSE</span>
                          </div>
                        ) : cellRecs.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {cellRecs.map(rec => {
                              const client = getClient(rec.clientId);
                              const vm = users.find(u => u.id === rec.videomakerId);
                              const status = STATUS_COLORS[rec.status] || STATUS_COLORS.agendada;
                              return (
                                <div
                                  key={rec.id}
                                  draggable={rec.status !== 'concluida'}
                                  onDragStart={e => handleDragStart(e, rec)}
                                  className={`group relative p-1.5 rounded-lg border text-[10px] cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-md transition-all ${
                                    draggedRecording?.id === rec.id ? 'opacity-50' : ''
                                  } bg-background`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    {client && (
                                      <ClientLogo client={{ companyName: client.companyName, color: client.color, logoUrl: client.logoUrl }} size="sm" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold truncate leading-tight">
                                        {rec.prospectName || client?.companyName || 'Cliente'}
                                      </p>
                                      <p className="text-muted-foreground truncate opacity-70">
                                        {vm?.displayName || vm?.name || 'Sem VM'}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const label = client?.companyName || rec.prospectName || 'esta gravação';
                                        if (!window.confirm(`Apagar "${label}" às ${rec.startTime}?`)) return;
                                        const ok = await deleteRecording(rec.id);
                                        if (ok) { toast.success('Gravação apagada'); setTimeout(() => refetchData(), 300); }
                                        else toast.error('Erro ao apagar');
                                      }}
                                      onMouseDown={e => e.stopPropagation()}
                                      draggable={false}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/15 text-red-400"
                                      title="Apagar"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between mt-1">
                                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 leading-none">{TYPE_LABELS[rec.type] || rec.type}</Badge>
                                    <span className={`text-[7px] px-1 py-0.5 rounded font-bold uppercase ${status.bg} ${status.text}`}>{status.label}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setSelectedDate(new Date(d + 'T12:00:00')); setViewMode('day'); }}
                            className="h-full w-full min-h-[80px] rounded-lg border-2 border-dashed border-transparent hover:border-primary/30 hover:bg-primary/5 flex items-center justify-center transition-colors group"
                            title="Abrir dia para agendar"
                          >
                            {draggedRecording ? (
                              <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-0.5">
                                <ArrowLeftRight size={12} className="text-primary/40" />
                                <span className="text-[9px] text-primary/40 font-medium">Soltar</span>
                              </div>
                            ) : (
                              <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-0.5">
                                <Plus size={14} className="text-primary/50" />
                                <span className="text-[9px] text-primary/50 font-medium">Abrir dia</span>
                              </div>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {viewMode === 'day' && Object.keys(recordingsByVmAndSlot['__unassigned__'] || {}).length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Fora do Padrão ou Sem Videomaker</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.values(recordingsByVmAndSlot['__unassigned__']).map(rec => (
              <RecordingCard
                key={rec.id}
                recording={rec}
                client={getClient(rec.clientId)}
                isDragging={draggedRecording?.id === rec.id}
                onDragStart={handleDragStart}
                onDelete={async () => {
                  const label = getClient(rec.clientId)?.companyName || rec.prospectName || 'esta gravação';
                  if (!window.confirm(`Apagar permanentemente "${label}" às ${rec.startTime}?`)) return;
                  const ok = await deleteRecording(rec.id);
                  if (ok) { toast.success('Gravação apagada'); setTimeout(() => refetchData(), 300); }
                  else toast.error('Erro ao apagar');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground border-t border-border pt-4">
        <span className="font-medium text-foreground/70">Legenda:</span>
        {Object.entries(STATUS_COLORS).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${val.bg.replace('/15', '')}`} style={{ backgroundColor: key === 'agendada' ? 'hsl(217 91% 60%)' : key === 'concluida' ? 'hsl(142 71% 45%)' : key === 'cancelada' ? 'hsl(0 72% 51%)' : 'hsl(45 93% 47%)' }} />
            {val.label}
          </span>
        ))}
        <span className="ml-2 flex items-center gap-1">
          <GripVertical size={10} /> Arraste entre os slots para remarcar automaticamente
        </span>
      </div>

      {/* Wizard: agendar gravação por etapas */}
      {(() => {
        const vm = users.find(u => u.id === wizard.vmId);
        const dateLbl = wizard.date ? format(new Date(wizard.date + 'T12:00:00'), "dd/MM (EEE)", { locale: ptBR }) : '';
        const selectedClient = clients.find(c => c.id === wizard.clientId);
        const clientScripts = wizard.clientId
          ? scripts.filter(s => s.clientId === wizard.clientId && !s.recorded).sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''))
          : [];
        const steps: WizardStep[] = wizard.mode === 'avulso'
          ? ['mode', 'script', 'confirm']
          : ['mode', 'client', 'script', 'confirm'];
        const isStory = wizard.mode === 'story';
        const currentIdx = steps.indexOf(wizard.step);

        const closeWizard = () => setWizard(w => ({ ...w, open: false }));
        const goNext = () => {
          const next = steps[currentIdx + 1];
          if (next) setWizard(w => ({ ...w, step: next }));
        };
        const goBack = () => {
          const prev = steps[currentIdx - 1];
          if (prev) setWizard(w => ({ ...w, step: prev }));
        };

        const handleCreateScript = async () => {
          if (!wizard.newScriptTitle.trim()) { toast.error('Informe o título do roteiro'); return; }
          if (wizard.mode !== 'avulso' && !wizard.clientId) { toast.error('Selecione um cliente antes'); return; }
          setCreatingScriptSaving(true);
          const nowIso = new Date().toISOString();
          const newScript: Script = {
            id: crypto.randomUUID(),
            clientId: wizard.clientId,
            title: wizard.newScriptTitle.trim(),
            videoType: wizard.newScriptVideoType,
            contentFormat: wizard.newScriptFormat,
            content: wizard.newScriptContent ? `<p>${wizard.newScriptContent.replace(/\n/g,'</p><p>')}</p>` : '',
            recorded: false,
            priority: 'priority',
            createdAt: nowIso,
            updatedAt: nowIso,
            isEndomarketing: false,
            createdBy: authUser?.id,
          };
          try {
            await addScript(newScript);
            setWizard(w => ({
              ...w,
              scriptId: newScript.id,
              creatingScript: false,
              newScriptTitle: '', newScriptContent: '',
            }));
            toast.success('Roteiro criado e marcado como prioridade');
          } catch (e: any) {
            toast.error('Erro ao criar roteiro: ' + (e?.message || 'erro'));
          } finally {
            setCreatingScriptSaving(false);
          }
        };

        const handleFinalize = async () => {
          if (wizard.mode !== 'avulso' && !wizard.clientId) { toast.error('Selecione um cliente'); return; }
          if (wizard.mode === 'avulso' && !wizard.prospectName.trim()) { toast.error('Informe o nome do prospect'); return; }
          const conflict = hasConflict(wizard.vmId, wizard.date, wizard.time, undefined, wizard.type, wizard.mode === 'avulso' ? undefined : wizard.clientId, { skipClientDayCheck: true });
          if (conflict.hasConflict) { toast.error(conflict.message || 'Conflito de horário'); return; }
          setSaving(true);
          const recId = crypto.randomUUID();
          const rec: Recording = {
            id: recId,
            clientId: wizard.mode === 'avulso' ? '' : wizard.clientId,
            videomakerId: wizard.vmId,
            date: wizard.date,
            startTime: wizard.time,
            type: wizard.type,
            status: 'agendada',
            ...(wizard.mode === 'avulso' ? { prospectName: wizard.prospectName.trim() } : {}),
          };
          const ok = await addRecording(rec, { skipClientDayCheck: true });
          if (!ok) { setSaving(false); toast.error('Erro ao agendar'); return; }

          // Link chosen script to this recording as priority (best effort)
          if (wizard.scriptId) {
            const s = scripts.find(x => x.id === wizard.scriptId);
            if (s) {
              try {
                await updateScript({ ...s, recordingId: recId, priority: 'priority', updatedAt: new Date().toISOString() } as Script);
              } catch {}
            }
          }

          // Notify videomaker (best effort)
          try {
            const clientLabel = wizard.mode === 'avulso' ? wizard.prospectName.trim() : (selectedClient?.companyName || 'Cliente');
            await (supabase as any).from('notifications').insert({
              user_id: wizard.vmId,
              title: '🎬 Nova tarefa de gravação',
              message: `${clientLabel} • ${format(new Date(wizard.date + 'T12:00:00'), "dd/MM", { locale: ptBR })} às ${wizard.time}${wizard.scriptId ? ' • roteiro anexado' : ''}`,
              type: 'info',
              link: '/videomaker',
            });
          } catch {}

          setSaving(false);
          toast.success('Tarefa fixada na agenda do videomaker');
          setWizard(w => ({ ...w, open: false }));
          setTimeout(() => refetchData(), 300);
        };

        const canAdvance = (() => {
          if (wizard.step === 'mode') return wizard.mode !== null;
          if (wizard.step === 'client') return !!wizard.clientId;
          if (wizard.step === 'script') return true; // opcional
          return true;
        })();

        return (
          <Dialog open={wizard.open} onOpenChange={(open) => setWizard(w => ({ ...w, open }))}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {isStory ? <Clapperboard size={18} className="text-primary" /> : <Pin size={18} className="text-primary" />}
                  {isStory ? 'Produção de Story' : 'Fixar tarefa de gravação'}
                </DialogTitle>
                <DialogDescription>
                  {vm?.displayName || vm?.name || 'Videomaker'} • {dateLbl} • {wizard.time}
                </DialogDescription>
              </DialogHeader>

              {/* Stepper */}
              <div className="flex items-center gap-2 mb-2">
                {steps.map((s, i) => {
                  const active = i === currentIdx;
                  const done = i < currentIdx;
                  const label = s === 'mode' ? 'Tipo' : s === 'client' ? 'Cliente' : s === 'script' ? 'Roteiro' : 'Confirmar';
                  return (
                    <div key={s} className="flex-1 flex items-center gap-2">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
                        done ? 'bg-primary border-primary text-primary-foreground' :
                        active ? 'border-primary text-primary bg-primary/10' :
                        'border-border text-muted-foreground'
                      }`}>
                        {done ? <Check size={12} /> : i + 1}
                      </div>
                      <span className={`text-[11px] font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                      {i < steps.length - 1 && <div className={`flex-1 h-px ${done ? 'bg-primary' : 'bg-border'}`} />}
                    </div>
                  );
                })}
              </div>

              <div className="min-h-[220px] py-2">
                {wizard.step === 'mode' && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Que tipo de conteúdo esse slot vai produzir?</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setWizard(w => ({ ...w, mode: 'client', type: 'extra', newScriptFormat: 'reels' }))}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${wizard.mode === 'client' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/40'}`}
                      >
                        <UserIcon size={20} className={wizard.mode === 'client' ? 'text-primary' : 'text-muted-foreground'} />
                        <p className="text-sm font-bold mt-2">Cliente Fixo</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Contrato ativo</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizard(w => ({ ...w, mode: 'story', type: 'extra', newScriptFormat: 'story' }))}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${wizard.mode === 'story' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/40'}`}
                      >
                        <Clapperboard size={20} className={wizard.mode === 'story' ? 'text-primary' : 'text-muted-foreground'} />
                        <p className="text-sm font-bold mt-2">Produção de Story</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Sessão de stories</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizard(w => ({ ...w, mode: 'avulso', type: 'avulso', clientId: '', newScriptFormat: 'reels' }))}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${wizard.mode === 'avulso' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/40'}`}
                      >
                        <Sparkles size={20} className={wizard.mode === 'avulso' ? 'text-primary' : 'text-muted-foreground'} />
                        <p className="text-sm font-bold mt-2">Conteúdo Avulso</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Prospect / one-shot</p>
                      </button>
                    </div>
                  </div>
                )}

                {wizard.step === 'client' && (
                  <div className="space-y-3">
                    <Label>Cliente</Label>
                    <Select value={wizard.clientId} onValueChange={(v) => setWizard(w => ({ ...w, clientId: v, scriptId: null }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                      <SelectContent>
                        {activeClients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="space-y-1.5">
                      <Label>Tipo de gravação</Label>
                      <Select value={wizard.type} onValueChange={(v) => setWizard(w => ({ ...w, type: v as RecordingType }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixa">Fixa</SelectItem>
                          <SelectItem value="extra">Extra</SelectItem>
                          <SelectItem value="secundaria">Secundária</SelectItem>
                          <SelectItem value="backup">Backup</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {wizard.step === 'script' && (
                  <div className="space-y-3">
                    {wizard.mode === 'avulso' && (
                      <div className="space-y-1.5">
                        <Label>Nome do prospect / avulso</Label>
                        <Input
                          value={wizard.prospectName}
                          onChange={(e) => setWizard(w => ({ ...w, prospectName: e.target.value }))}
                          placeholder="Ex.: Padaria do João"
                        />
                      </div>
                    )}

                    {!wizard.creatingScript ? (
                      <>
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-1.5"><FileText size={14} /> Roteiro (opcional)</Label>
                          <Button size="sm" variant="outline" onClick={() => setWizard(w => ({ ...w, creatingScript: true }))} className="h-7 gap-1 text-xs">
                            <Plus size={12} /> Novo roteiro
                          </Button>
                        </div>
                        {wizard.mode !== 'avulso' ? (
                          clientScripts.length === 0 ? (
                            <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed">
                              Nenhum roteiro disponível para este cliente. Crie um novo ou avance sem roteiro.
                            </div>
                          ) : (
                            <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                              {clientScripts.map(s => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => setWizard(w => ({ ...w, scriptId: w.scriptId === s.id ? null : s.id }))}
                                  className={`w-full text-left p-2.5 rounded-lg border-2 transition-all ${wizard.scriptId === s.id ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/40'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText size={14} className={wizard.scriptId === s.id ? 'text-primary' : 'text-muted-foreground'} />
                                    <span className="text-sm font-semibold flex-1 truncate">{s.title}</span>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">{s.videoType}</Badge>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )
                        ) : (
                          <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed">
                            Avulso não tem roteiros arquivados. Crie um novo se necessário.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-2 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-primary">Novo roteiro (prioridade)</Label>
                          <button type="button" onClick={() => setWizard(w => ({ ...w, creatingScript: false }))} className="text-muted-foreground hover:text-foreground">
                            <X size={14} />
                          </button>
                        </div>
                        <Input
                          placeholder="Título do roteiro"
                          value={wizard.newScriptTitle}
                          onChange={(e) => setWizard(w => ({ ...w, newScriptTitle: e.target.value }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={wizard.newScriptVideoType} onValueChange={(v) => setWizard(w => ({ ...w, newScriptVideoType: v as ScriptVideoType }))}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vendas">Vendas</SelectItem>
                              <SelectItem value="institucional">Institucional</SelectItem>
                              <SelectItem value="reconhecimento">Reconhecimento</SelectItem>
                              <SelectItem value="educacional">Educacional</SelectItem>
                              <SelectItem value="bastidores">Bastidores</SelectItem>
                              <SelectItem value="depoimento">Depoimento</SelectItem>
                              <SelectItem value="lancamento">Lançamento</SelectItem>
                              <SelectItem value="evento">Evento</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={wizard.newScriptFormat} onValueChange={(v) => setWizard(w => ({ ...w, newScriptFormat: v as ScriptContentFormat }))}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="reels">Reels</SelectItem>
                              <SelectItem value="story">Story</SelectItem>
                              <SelectItem value="criativo">Criativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Textarea
                          placeholder="Conteúdo / instruções para o videomaker (opcional)"
                          rows={4}
                          value={wizard.newScriptContent}
                          onChange={(e) => setWizard(w => ({ ...w, newScriptContent: e.target.value }))}
                        />
                        <Button size="sm" onClick={handleCreateScript} disabled={creatingScriptSaving} className="w-full">
                          {creatingScriptSaving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Check size={12} className="mr-1.5" />}
                          Criar e selecionar como prioridade
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {wizard.step === 'confirm' && (
                  <div className="space-y-3 text-sm">
                    <div className="p-3 rounded-lg bg-muted/40 border space-y-2">
                      <div className="flex justify-between"><span className="text-muted-foreground text-xs">Videomaker</span><span className="font-semibold">{vm?.displayName || vm?.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground text-xs">Data / horário</span><span className="font-semibold">{dateLbl} • {wizard.time}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground text-xs">Cliente</span><span className="font-semibold">{wizard.mode === 'avulso' ? (wizard.prospectName || '—') : (selectedClient?.companyName || '—')}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground text-xs">Tipo</span><Badge variant="outline">{TYPE_LABELS[wizard.type]}</Badge></div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Roteiro</span>
                        {wizard.scriptId ? (
                          <span className="font-semibold text-primary flex items-center gap-1.5">
                            <FileText size={12} />
                            {scripts.find(s => s.id === wizard.scriptId)?.title || '—'}
                          </span>
                        ) : <span className="text-muted-foreground text-xs italic">Sem roteiro</span>}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Ao fixar, a tarefa aparece na agenda do videomaker e ele recebe uma notificação.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-row justify-between sm:justify-between">
                <div>
                  {currentIdx > 0 && (
                    <Button variant="ghost" onClick={goBack} disabled={saving}>
                      <ArrowLeft size={14} className="mr-1.5" /> Voltar
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={closeWizard} disabled={saving}>Cancelar</Button>
                  {wizard.step !== 'confirm' ? (
                    <Button onClick={goNext} disabled={!canAdvance}>
                      Próximo <ArrowRight size={14} className="ml-1.5" />
                    </Button>
                  ) : (
                    <Button onClick={handleFinalize} disabled={saving}>
                      {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Pin size={14} className="mr-1.5" />}
                      Fixar tarefa
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

/* ── Recording Card ── */
function RecordingCard({
  recording, client, isDragging, onDragStart, onDelete,
}: {
  recording: Recording;
  client?: { id: string; companyName: string; color: string; logoUrl?: string; responsiblePerson: string };
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, r: Recording) => void;
  onDelete?: () => void;
}) {
  const status = STATUS_COLORS[recording.status] || STATUS_COLORS.agendada;
  const isCompleted = recording.status === 'concluida';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      draggable={!isCompleted}
      onDragStart={e => onDragStart(e as unknown as React.DragEvent, recording)}
      className={`group relative h-full p-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing flex flex-col justify-between ${
        isDragging
          ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20 shadow-lg'
          : isCompleted
            ? 'border-border/50 bg-muted/30 opacity-70 cursor-default'
            : 'border-border bg-background hover:border-primary/40 hover:shadow-xl hover:-translate-y-0.5'
      }`}
    >
      {/* Delete button */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onMouseDown={(e) => e.stopPropagation()}
          draggable={false}
          className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/15 text-red-400 z-10"
          title="Apagar gravação"
        >
          <Trash2 size={12} />
        </button>
      )}
      {/* Drag handle */}
      {!isCompleted && !onDelete && (
        <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={12} className="text-muted-foreground" />
        </div>
      )}

      {/* Client info */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          {client && (
            <ClientLogo
              client={{ companyName: client.companyName, color: client.color, logoUrl: client.logoUrl }}
              size="sm"
            />

          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold truncate leading-tight">
              {recording.prospectName || client?.companyName || 'Cliente'}
            </p>
            <p className="text-[9px] text-muted-foreground truncate opacity-70">
              {client?.responsiblePerson}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom info */}
      <div className="flex items-center justify-between mt-auto">
        <Badge variant="outline" className="text-[8px] h-4 px-1 leading-none font-medium bg-muted/30">
          {TYPE_LABELS[recording.type] || recording.type}
        </Badge>
        <div className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${status.bg} ${status.text}`}>
          {status.label}
        </div>
      </div>
    </motion.div>
  );
}
