import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { Recording, RecordingType, Script } from '@/types';
import { SCRIPT_VIDEO_TYPE_LABELS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, ChevronLeft, ChevronRight, Check, XCircle, AlertTriangle, FileText, Undo2 } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Schedule() {
  const { clients, users, recordings, scripts, updateScript, addRecording, updateRecording, cancelRecording, hasConflict, getSuggestionsForCancellation } = useApp();
  const [weekOffset, setWeekOffset] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [scriptsClientId, setScriptsClientId] = useState('');
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [selectedRec, setSelectedRec] = useState<Recording | null>(null);
  const [form, setForm] = useState({ clientId: '', videomakerId: '', date: '', startTime: '09:00', type: 'fixa' as RecordingType });
  const [filterVideomaker, setFilterVideomaker] = useState('all');

  const videomakers = users.filter(u => u.role === 'videomaker');
  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const filteredRecordings = useMemo(() => {
    let recs = recordings;
    if (filterVideomaker !== 'all') recs = recs.filter(r => r.videomakerId === filterVideomaker);
    return recs;
  }, [recordings, filterVideomaker]);

  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return filteredRecordings.filter(r => r.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
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

  const handleCancel = (rec: Recording) => {
    cancelRecording(rec.id);
    const suggestions = getSuggestionsForCancellation(rec);
    if (suggestions.length > 0) {
      setSelectedRec(rec);
      setSuggestOpen(true);
    }
    toast.success('Gravação cancelada');
  };

  const handleComplete = (rec: Recording) => {
    updateRecording({ ...rec, status: 'concluida' });
    toast.success('Gravação concluída');
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getVideomakerName = (id: string) => users.find(u => u.id === id)?.name || '—';

  const statusColors = { agendada: 'border-l-info', concluida: 'border-l-success', cancelada: 'border-l-destructive' };
  const typeLabels = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.' };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold">Agenda</h1>
        <div className="flex items-center gap-3">
          <Select value={filterVideomaker} onValueChange={setFilterVideomaker}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Videomaker" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setForm({ clientId: '', videomakerId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', type: 'fixa' }); setNewOpen(true); }}>
            <Plus size={16} className="mr-2" /> Nova Gravação
          </Button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft size={18} /></Button>
        <span className="font-display font-semibold">
          {format(weekDays[0], "d MMM", { locale: ptBR })} — {format(weekDays[6], "d MMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight size={18} /></Button>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Hoje</Button>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {weekDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
          const dayRecs = getRecsForDay(day);

          return (
            <div key={dateStr} className={`glass-card p-3 min-h-[160px] ${isToday ? 'ring-1 ring-primary' : ''}`}>
              <p className={`text-xs font-semibold mb-2 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                {format(day, 'EEE d', { locale: ptBR })}
              </p>
              <div className="space-y-1.5">
                {dayRecs.map(rec => {
                  const clientColor = clients.find(c => c.id === rec.clientId)?.color || '220 10% 50%';
                  return (
                    <div key={rec.id} className="bg-secondary/50 rounded-r px-2 py-1.5 text-xs group relative"
                      style={{ borderLeft: `2px solid hsl(${clientColor})` }}>
                      <p className="font-medium truncate">{getClientName(rec.clientId)}</p>
                      <p className="text-muted-foreground">{rec.startTime} · {typeLabels[rec.type]}</p>
                      {rec.status === 'agendada' && (
                        <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                          <button onClick={() => openScriptsForClient(rec.clientId)} className="p-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30" title="Ver roteiros"><FileText size={12} /></button>
                          <button onClick={() => handleComplete(rec)} className="p-0.5 rounded bg-success/20 text-success hover:bg-success/30"><Check size={12} /></button>
                          <button onClick={() => handleCancel(rec)} className="p-0.5 rounded bg-destructive/20 text-destructive hover:bg-destructive/30"><XCircle size={12} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

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

      {/* Suggestion dialog */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle size={18} className="text-warning" /> Horário Liberado</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Clientes disponíveis para este horário:</p>
          <div className="space-y-2">
            {selectedRec && getSuggestionsForCancellation(selectedRec).map(c => (
              <div key={c.id} className="glass-card p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{c.companyName}</p>
                  <p className="text-xs text-muted-foreground">Backup: {c.backupTime} · {c.extraContentTypes.join(', ')}</p>
                </div>
                <Button size="sm" onClick={() => {
                  addRecording({
                    id: crypto.randomUUID(), clientId: c.id, videomakerId: selectedRec.videomakerId,
                    date: selectedRec.date, startTime: c.backupTime, type: 'secundaria', status: 'agendada',
                  });
                  setSuggestOpen(false);
                  toast.success('Gravação secundária criada');
                }}>Agendar</Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Scripts for client dialog */}
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

          {/* Already recorded scripts that can be returned */}
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
                        <Badge className="text-[10px] bg-success text-success-foreground">{SCRIPT_VIDEO_TYPE_LABELS[script.videoType]}</Badge>
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
