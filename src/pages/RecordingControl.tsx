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
  Coffee, HelpCircle, Rocket, Plus, Trash2, X, FileText, Sparkles, User as UserIcon, ArrowRight, ArrowLeft, Pin
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
  const { recordings, clients, users, updateRecording, addRecording, deleteRecording, hasConflict, settings, refetchData } = useApp();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [draggedRecording, setDraggedRecording] = useState<Recording | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ vmId: string; time: string } | null>(null);
  const [dragOverVideomaker, setDragOverVideomaker] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);

  // New-recording dialog
  const [newDialog, setNewDialog] = useState<{ open: boolean; vmId: string; time: string; date: string }>({ open: false, vmId: '', time: '', date: '' });
  const [newForm, setNewForm] = useState<{ mode: 'client' | 'avulso'; clientId: string; prospectName: string; type: RecordingType }>({ mode: 'client', clientId: '', prospectName: '', type: 'extra' });
  const [saving, setSaving] = useState(false);

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
                            setNewForm({ mode: 'client', clientId: '', prospectName: '', type: 'extra' });
                            setNewDialog({ open: true, vmId: vm.id, time, date: displayDates[0] });
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

      {/* Unassigned / Others (Recordings not in standard slots) */}
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

      {/* New recording dialog */}
      <Dialog open={newDialog.open} onOpenChange={(open) => setNewDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar Gravação</DialogTitle>
            <DialogDescription>
              {(() => {
                const vm = users.find(u => u.id === newDialog.vmId);
                const dateLbl = newDialog.date ? format(new Date(newDialog.date + 'T12:00:00'), "dd/MM (EEE)", { locale: ptBR }) : '';
                return `${vm?.displayName || vm?.name || 'Videomaker'} • ${dateLbl} • ${newDialog.time}`;
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewForm(f => ({ ...f, mode: 'client' }))}
                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${newForm.mode === 'client' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-muted-foreground/30'}`}
              >
                Cliente
              </button>
              <button
                type="button"
                onClick={() => setNewForm(f => ({ ...f, mode: 'avulso', type: 'avulso' }))}
                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${newForm.mode === 'avulso' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-muted-foreground/30'}`}
              >
                Avulso / Prospect
              </button>
            </div>

            {newForm.mode === 'client' ? (
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={newForm.clientId} onValueChange={(v) => setNewForm(f => ({ ...f, clientId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                  <SelectContent>
                    {activeClients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Nome do prospect / avulso</Label>
                <Input
                  value={newForm.prospectName}
                  onChange={(e) => setNewForm(f => ({ ...f, prospectName: e.target.value }))}
                  placeholder="Ex.: Padaria do João"
                  autoFocus
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={newForm.type} onValueChange={(v) => setNewForm(f => ({ ...f, type: v as RecordingType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {newForm.mode === 'client' && <SelectItem value="fixa">Fixa</SelectItem>}
                  <SelectItem value="extra">Extra</SelectItem>
                  {newForm.mode === 'client' && <SelectItem value="secundaria">Secundária</SelectItem>}
                  {newForm.mode === 'client' && <SelectItem value="backup">Backup</SelectItem>}
                  {newForm.mode === 'avulso' && <SelectItem value="avulso">Avulso</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(prev => ({ ...prev, open: false }))} disabled={saving}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (newForm.mode === 'client' && !newForm.clientId) { toast.error('Selecione um cliente'); return; }
                if (newForm.mode === 'avulso' && !newForm.prospectName.trim()) { toast.error('Informe o nome do prospect'); return; }
                const conflict = hasConflict(newDialog.vmId, newDialog.date, newDialog.time, undefined, newForm.type, newForm.mode === 'avulso' ? undefined : newForm.clientId, { skipClientDayCheck: true });
                if (conflict.hasConflict) { toast.error(conflict.message || 'Conflito de horário'); return; }
                setSaving(true);
                const rec: Recording = {
                  id: crypto.randomUUID(),
                  clientId: newForm.mode === 'avulso' ? '' : newForm.clientId,
                  videomakerId: newDialog.vmId,
                  date: newDialog.date,
                  startTime: newDialog.time,
                  type: newForm.type,
                  status: 'agendada',
                  ...(newForm.mode === 'avulso' ? { prospectName: newForm.prospectName.trim() } : {}),
                };
                const ok = await addRecording(rec, { skipClientDayCheck: true });
                setSaving(false);
                if (!ok) { toast.error('Erro ao agendar'); return; }
                toast.success('Gravação agendada');
                setNewDialog({ open: false, vmId: '', time: '', date: '' });
                setTimeout(() => refetchData(), 300);
              }}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Check size={14} className="mr-1.5" />}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
