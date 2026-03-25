import { useState, useMemo, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import type { Recording } from '@/types';
import { format, addDays, subDays, startOfWeek, endOfWeek, isToday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar, Users, GripVertical,
  Clock, Video, AlertTriangle, ArrowLeftRight, Check, Loader2, CalendarDays
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';

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

export default function RecordingControl() {
  const { recordings, clients, users, updateRecording, settings, refetchData } = useApp();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [draggedRecording, setDraggedRecording] = useState<Recording | null>(null);
  const [dragOverVideomaker, setDragOverVideomaker] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);

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

  // Group recordings by videomaker
  const recordingsByVideomaker = useMemo(() => {
    const map: Record<string, Recording[]> = {};
    videomakers.forEach(vm => { map[vm.id] = []; });
    // Add "unassigned" column
    map['__unassigned__'] = [];

    filteredRecordings.forEach(r => {
      if (r.videomakerId && map[r.videomakerId]) {
        map[r.videomakerId].push(r);
      } else {
        map['__unassigned__'].push(r);
      }
    });

    // Sort by time within each column
    Object.values(map).forEach(arr => arr.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [filteredRecordings, videomakers]);

  // Stats
  const totalToday = filteredRecordings.length;
  const completedToday = filteredRecordings.filter(r => r.status === 'concluida').length;

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

  const handleDragOver = (e: React.DragEvent, videomakerId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverVideomaker(videomakerId);
  };

  const handleDragLeave = () => {
    setDragOverVideomaker(null);
  };

  const handleDrop = async (e: React.DragEvent, targetVideomakerId: string) => {
    e.preventDefault();
    setDragOverVideomaker(null);

    if (!draggedRecording || draggedRecording.videomakerId === targetVideomakerId) {
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
      };
      updateRecording(updatedRecording);

      // Also update the client's default videomaker if this is a fixed recording
      if (draggedRecording.type === 'fixa' && client) {
        await supabase.from('clients').update({ videomaker_id: targetVideomakerId }).eq('id', client.id);
      }

      toast.success(
        `Gravação "${client?.companyName || 'Cliente'}" reatribuída de ${oldVideomaker?.name || '?'} para ${newVideomaker?.name || '?'}`,
        { duration: 4000 }
      );

      // Refetch to sync
      setTimeout(() => refetchData(), 500);
    } catch (err: any) {
      toast.error('Erro ao reatribuir gravação: ' + (err.message || 'erro'));
    } finally {
      setReassigning(false);
      setDraggedRecording(null);
    }
  };

  const getClient = (clientId: string) => clients.find(c => c.id === clientId);

  const dateLabel = viewMode === 'day'
    ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
    : `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "dd/MM")} - ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "dd/MM")}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Users size={22} className="text-primary" />
            </div>
            Controle de Gravações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e reatribua gravações entre videomakers arrastando os cards
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-primary">{totalToday}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground">Concluídas</p>
            <p className="text-xl font-bold text-emerald-500">{completedToday}</p>
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

      {/* Mobile date label */}
      <p className="text-sm font-semibold capitalize text-center sm:hidden">{dateLabel}</p>

      {/* Reassigning overlay */}
      <AnimatePresence>
        {reassigning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="flex items-center gap-3 text-foreground">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-lg font-medium">Reatribuindo gravação...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kanban columns — one per videomaker */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 320px)' }}>
        {videomakers.map(vm => {
          const vmRecordings = recordingsByVideomaker[vm.id] || [];
          const isOver = dragOverVideomaker === vm.id;
          const vmCompleted = vmRecordings.filter(r => r.status === 'concluida').length;

          return (
            <div
              key={vm.id}
              className={`flex-shrink-0 w-[280px] flex flex-col rounded-xl border transition-all duration-200 ${
                isOver
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-border bg-muted/20'
              }`}
              onDragOver={e => handleDragOver(e, vm.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, vm.id)}
            >
              {/* Column header */}
              <div className="p-3 border-b border-border flex items-center gap-2.5">
                <UserAvatar user={vm} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{vm.displayName || vm.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {vmRecordings.length} gravação(ões) · {vmCompleted} concluída(s)
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {vmRecordings.length}
                </Badge>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-420px)]">
                {vmRecordings.length === 0 && (
                  <div className="py-8 text-center">
                    <Video size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground/50">Sem gravações</p>
                  </div>
                )}

                <AnimatePresence>
                  {vmRecordings.map(rec => (
                    <RecordingCard
                      key={rec.id}
                      recording={rec}
                      client={getClient(rec.clientId)}
                      isDragging={draggedRecording?.id === rec.id}
                      onDragStart={handleDragStart}
                      viewMode={viewMode}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Drop zone indicator */}
              {isOver && draggedRecording && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mx-2 mb-2 p-3 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 text-center"
                >
                  <ArrowLeftRight size={16} className="mx-auto mb-1 text-primary" />
                  <p className="text-xs font-medium text-primary">Soltar aqui para reatribuir</p>
                </motion.div>
              )}
            </div>
          );
        })}

        {/* Unassigned column */}
        {(recordingsByVideomaker['__unassigned__']?.length || 0) > 0 && (
          <div
            className={`flex-shrink-0 w-[280px] flex flex-col rounded-xl border transition-all ${
              dragOverVideomaker === '__unassigned__'
                ? 'border-amber-500 bg-amber-500/5'
                : 'border-border bg-muted/20'
            }`}
          >
            <div className="p-3 border-b border-border flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle size={14} className="text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Sem Videomaker</p>
                <p className="text-[10px] text-muted-foreground">
                  {recordingsByVideomaker['__unassigned__'].length} gravação(ões)
                </p>
              </div>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-420px)]">
              {recordingsByVideomaker['__unassigned__'].map(rec => (
                <RecordingCard
                  key={rec.id}
                  recording={rec}
                  client={getClient(rec.clientId)}
                  isDragging={draggedRecording?.id === rec.id}
                  onDragStart={handleDragStart}
                  viewMode={viewMode}
                />
              ))}
            </div>
          </div>
        )}
      </div>

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
          <GripVertical size={10} /> Arraste para reatribuir
        </span>
      </div>
    </div>
  );
}

/* ── Recording Card ── */
function RecordingCard({
  recording, client, isDragging, onDragStart, viewMode,
}: {
  recording: Recording;
  client?: { id: string; companyName: string; color: string; logoUrl?: string; responsiblePerson: string };
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, r: Recording) => void;
  viewMode: 'day' | 'week';
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
      onDragStart={e => onDragStart(e, recording)}
      className={`group relative p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
          : isCompleted
            ? 'border-border/50 bg-muted/30 opacity-70 cursor-default'
            : 'border-border bg-background hover:border-primary/30 hover:shadow-md'
      }`}
    >
      {/* Drag handle */}
      {!isCompleted && (
        <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={12} className="text-muted-foreground" />
        </div>
      )}

      {/* Date label in week mode */}
      {viewMode === 'week' && (
        <p className="text-[9px] text-muted-foreground mb-1 font-medium">
          {format(new Date(recording.date + 'T12:00:00'), 'EEE dd/MM', { locale: ptBR })}
        </p>
      )}

      {/* Client info */}
      <div className="flex items-center gap-2 mb-2">
        {client && (
          <ClientLogo
            client={{ companyName: client.companyName, color: client.color, logoUrl: client.logoUrl }}
            size="sm"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">
            {recording.prospectName || client?.companyName || 'Cliente'}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {client?.responsiblePerson}
          </p>
        </div>
      </div>

      {/* Time & type */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-mono flex items-center gap-0.5 text-foreground/70">
          <Clock size={9} /> {recording.startTime}
        </span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
          {TYPE_LABELS[recording.type] || recording.type}
        </Badge>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${status.bg} ${status.text}`}>
          {status.label}
        </span>
      </div>

      {/* Completed indicator */}
      {isCompleted && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
          <Check size={10} className="text-white" />
        </div>
      )}
    </motion.div>
  );
}
