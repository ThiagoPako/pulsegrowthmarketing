import { useState, useMemo } from 'react';
import { useEndoClientes, useEndoAgendamentos, useEndoProfissionais, type EndoAgendamento } from '@/hooks/useEndomarketing';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus, Calendar, Clock, ChevronLeft, ChevronRight, AlertTriangle, Lightbulb, Check, X } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, addWeeks, parseISO, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function EndomarketingAgenda() {
  const { clientes } = useEndoClientes();
  const { agendamentos, addAgendamento, updateAgendamento, cancelAgendamento, hasConflict, hasVideomakerConflict, getDailyOccupation, suggestBestDays } = useEndoAgendamentos();
  const { profissionais } = useEndoProfissionais();
  const { profile } = useAuth();

  const [weekOffset, setWeekOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [selectedSuggestionClient, setSelectedSuggestionClient] = useState('');

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // Mon-Fri

  const [form, setForm] = useState({
    cliente_id: '',
    profissional_id: '',
    videomaker_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '09:00',
    duration: 60,
    notes: '',
  });

  const getClienteName = (id: string) => clientes.find(c => c.id === id)?.company_name || '?';
  const getClienteColor = (id: string) => clientes.find(c => c.id === id)?.color || '217 91% 60%';

  const getOccupationColor = (profissionalId: string, date: string) => {
    const prof = profissionais.find(p => p.id === profissionalId);
    if (!prof) return 'bg-secondary';
    const occupied = getDailyOccupation(profissionalId, date);
    const maxMinutes = prof.max_hours_per_day * 60;
    const pct = maxMinutes > 0 ? occupied / maxMinutes : 0;
    if (pct >= 1) return 'bg-destructive/20 border-destructive';
    if (pct >= 0.7) return 'bg-amber-500/20 border-amber-500';
    return 'bg-emerald-500/10 border-emerald-500';
  };

  const getOccupationPct = (profissionalId: string, date: string) => {
    const prof = profissionais.find(p => p.id === profissionalId);
    if (!prof) return 0;
    const occupied = getDailyOccupation(profissionalId, date);
    return Math.min(100, Math.round((occupied / (prof.max_hours_per_day * 60)) * 100));
  };

  const handleCreate = async () => {
    if (!form.cliente_id || !form.profissional_id) { toast.error('Selecione cliente e profissional'); return; }

    const cliente = clientes.find(c => c.id === form.cliente_id);

    // Check professional conflict
    if (hasConflict(form.profissional_id, form.date, form.start_time, form.duration)) {
      toast.error('Profissional com conflito de horário');
      return;
    }

    // Check videomaker conflict if needed
    if (cliente?.execution_type === 'com_videomaker' || cliente?.plan_type === 'gravacao_concentrada') {
      if (!form.videomaker_id) {
        toast.error('Videomaker é obrigatório para este cliente');
        return;
      }
      if (hasVideomakerConflict(form.videomaker_id, form.date, form.start_time, form.duration)) {
        toast.error('Sem disponibilidade conjunta para esse horário.');
        return;
      }
    }

    // Check daily capacity
    const prof = profissionais.find(p => p.id === form.profissional_id);
    if (prof) {
      const currentOccupation = getDailyOccupation(form.profissional_id, form.date);
      if (currentOccupation + form.duration > prof.max_hours_per_day * 60) {
        toast.error('Profissional excederia o limite de horas diárias');
        return;
      }
    }

    const ok = await addAgendamento({
      cliente_id: form.cliente_id,
      profissional_id: form.profissional_id,
      videomaker_id: form.videomaker_id || undefined,
      date: form.date,
      start_time: form.start_time,
      duration: form.duration,
      status: 'agendado',
      checklist: { stories: false, reels: false, institucional: false, estrategico: false },
      notes: form.notes,
    } as any);

    if (ok) {
      toast.success('Agendamento criado');
      setDialogOpen(false);
    } else {
      toast.error('Erro ao criar agendamento');
    }
  };

  const handleComplete = async (id: string) => {
    await updateAgendamento(id, { status: 'concluido' } as any);
    toast.success('Concluído');
  };

  const handleCancel = async (id: string) => {
    await cancelAgendamento(id);
    toast.success('Cancelado');
  };

  // Suggestions
  const suggestions = useMemo(() => {
    if (!selectedSuggestionClient) return [];
    const cliente = clientes.find(c => c.id === selectedSuggestionClient);
    if (!cliente || profissionais.length === 0) return [];

    const prof = profissionais[0]; // Use first professional for suggestions
    return suggestBestDays(prof.id, prof.max_hours_per_day * 60, cliente.session_duration);
  }, [selectedSuggestionClient, clientes, profissionais, suggestBestDays]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold font-display">Agenda Endomarketing</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setSelectedSuggestionClient(''); setSuggestDialogOpen(true); }}>
            <Lightbulb size={16} className="mr-1.5" /> Sugestão de Horários
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus size={16} className="mr-1.5" /> Agendar
          </Button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft size={18} /></Button>
        <span className="text-sm font-medium">
          {format(weekStart, "dd/MM", { locale: ptBR })} — {format(weekEnd, "dd/MM", { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight size={18} /></Button>
        {weekOffset !== 0 && <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>Hoje</Button>}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-5 gap-2">
        {weekDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
          const dayAgendamentos = agendamentos.filter(a => a.date === dateStr && a.status !== 'cancelado');

          // Occupation indicator per professional
          const occupationIndicators = profissionais.map(p => ({
            id: p.id,
            pct: getOccupationPct(p.id, dateStr),
            color: getOccupationColor(p.id, dateStr),
          }));

          return (
            <Card key={dateStr} className={`min-h-[200px] ${isToday ? 'ring-2 ring-primary' : ''}`}>
              <CardHeader className="p-2 pb-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {format(day, 'EEE dd', { locale: ptBR })}
                  </span>
                  {occupationIndicators.map(oi => (
                    <span key={oi.id} className={`text-[9px] px-1 py-0.5 rounded ${oi.color}`}>
                      {oi.pct}%
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {dayAgendamentos.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Livre</p>
                ) : (
                  dayAgendamentos.map(ag => {
                    const color = getClienteColor(ag.cliente_id);
                    return (
                      <motion.div key={ag.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="rounded px-1.5 py-1 text-[10px] leading-tight group relative"
                        style={{ backgroundColor: `hsl(${color} / 0.1)`, borderLeft: `2px solid hsl(${color})` }}>
                        <p className="font-medium truncate" style={{ color: `hsl(${color})` }}>{getClienteName(ag.cliente_id)}</p>
                        <p className="text-muted-foreground">{ag.start_time} · {ag.duration}min</p>
                        <div className="absolute right-0 top-0 hidden group-hover:flex gap-0.5 p-0.5">
                          <button onClick={() => handleComplete(ag.id)} className="p-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30">
                            <Check size={10} className="text-emerald-700" />
                          </button>
                          <button onClick={() => handleCancel(ag.id)} className="p-0.5 rounded bg-destructive/20 hover:bg-destructive/30">
                            <X size={10} className="text-destructive" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Select value={form.cliente_id} onValueChange={v => {
                const c = clientes.find(cl => cl.id === v);
                setForm(p => ({
                  ...p,
                  cliente_id: v,
                  duration: c?.session_duration || 60,
                }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clientes.filter(c => c.active).map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profissional</Label>
              <Select value={form.profissional_id} onValueChange={v => setForm(p => ({ ...p, profissional_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profissionais.filter(p => p.active).map(p => <SelectItem key={p.id} value={p.id}>{p.user_id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              const c = clientes.find(cl => cl.id === form.cliente_id);
              if (c?.execution_type === 'com_videomaker' || c?.plan_type === 'gravacao_concentrada') {
                return (
                  <div>
                    <Label>Videomaker (obrigatório)</Label>
                    <Input value={form.videomaker_id} onChange={e => setForm(p => ({ ...p, videomaker_id: e.target.value }))} placeholder="ID do videomaker" />
                  </div>
                );
              }
              return null;
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label>Horário</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Select value={String(form.duration)} onValueChange={v => setForm(p => ({ ...p, duration: +v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggestion dialog */}
      <Dialog open={suggestDialogOpen} onOpenChange={setSuggestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lightbulb size={18} className="text-amber-500" /> Sugestão de Melhores Dias</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Select value={selectedSuggestionClient} onValueChange={setSelectedSuggestionClient}>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.filter(c => c.active).map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">🎯 Plano ideal disponível:</p>
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary text-sm">
                    <span>{format(parseISO(s.date), "dd/MM (EEE)", { locale: ptBR })}</span>
                    <span className="text-muted-foreground">{s.occupation}min ocupado</span>
                    <Badge variant="outline" className="text-emerald-600">{s.available}min livres</Badge>
                  </div>
                ))}
              </div>
            )}
            {selectedSuggestionClient && suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum horário disponível nos próximos 30 dias.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
