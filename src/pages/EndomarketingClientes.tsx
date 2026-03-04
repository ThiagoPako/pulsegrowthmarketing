import { useState, useMemo } from 'react';
import { useEndoClientes, useEndoAgendamentos, type EndoCliente } from '@/hooks/useEndomarketing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus, Building2, ArrowLeft, Edit2, Trash2, Phone, Clock, Calendar as CalIcon } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CLIENT_COLORS, DAY_LABELS } from '@/types';
import { format, parseISO, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAYS = [
  { value: 'segunda', label: 'Segunda' },
  { value: 'terca', label: 'Terça' },
  { value: 'quarta', label: 'Quarta' },
  { value: 'quinta', label: 'Quinta' },
  { value: 'sexta', label: 'Sexta' },
];

const DURATION_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h30' },
];

const emptyCliente: Omit<EndoCliente, 'id' | 'created_at' | 'updated_at'> = {
  company_name: '',
  responsible_person: '',
  phone: '',
  color: '217 91% 60%',
  active: true,
  stories_per_week: 5,
  presence_days_per_week: 3,
  selected_days: ['segunda', 'quarta', 'sexta'],
  session_duration: 60,
  execution_type: 'sozinho',
  plan_type: 'presencial_recorrente',
  total_contracted_hours: 0,
  notes: '',
};

export default function EndomarketingClientes() {
  const { clientes, addCliente, updateCliente, deleteCliente } = useEndoClientes();
  const { agendamentos } = useEndoAgendamentos();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<EndoCliente | null>(null);
  const [form, setForm] = useState(emptyCliente);

  const detailId = searchParams.get('detail');
  const detailCliente = clientes.find(c => c.id === detailId);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const openCreate = () => {
    setEditingCliente(null);
    setForm(emptyCliente);
    setDialogOpen(true);
  };

  const openEdit = (c: EndoCliente) => {
    setEditingCliente(c);
    setForm({
      company_name: c.company_name,
      responsible_person: c.responsible_person || '',
      phone: c.phone || '',
      color: c.color,
      active: c.active,
      stories_per_week: c.stories_per_week,
      presence_days_per_week: c.presence_days_per_week,
      selected_days: c.selected_days,
      session_duration: c.session_duration,
      execution_type: c.execution_type,
      plan_type: c.plan_type,
      total_contracted_hours: c.total_contracted_hours,
      notes: c.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) { toast.error('Nome é obrigatório'); return; }
    if (editingCliente) {
      await updateCliente(editingCliente.id, form as any);
      toast.success('Cliente atualizado');
    } else {
      const ok = await addCliente(form as any);
      if (ok) toast.success('Cliente adicionado');
      else toast.error('Erro ao adicionar');
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteCliente(id);
    toast.success('Cliente removido');
    if (detailId === id) setSearchParams({});
  };

  const toggleDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      selected_days: prev.selected_days.includes(day)
        ? prev.selected_days.filter(d => d !== day)
        : [...prev.selected_days, day],
    }));
  };

  // Detail view
  if (detailCliente) {
    const clientSchedules = agendamentos.filter(a => a.cliente_id === detailCliente.id);
    const weekSchedules = clientSchedules.filter(a => {
      try {
        return isWithinInterval(parseISO(a.date), { start: weekStart, end: weekEnd }) && a.status !== 'cancelado';
      } catch { return false; }
    });
    const completedCount = clientSchedules.filter(a => a.status === 'concluido').length;
    const cancelledCount = clientSchedules.filter(a => a.status === 'cancelado').length;
    const totalHoursExecuted = clientSchedules.filter(a => a.status === 'concluido').reduce((s, a) => s + a.duration, 0) / 60;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            <ArrowLeft size={16} className="mr-1" /> Voltar
          </Button>
          <h1 className="text-xl font-bold font-display" style={{ color: `hsl(${detailCliente.color})` }}>
            {detailCliente.company_name}
          </h1>
          <Button variant="outline" size="sm" onClick={() => openEdit(detailCliente)}>
            <Edit2 size={14} className="mr-1" /> Editar
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Responsável:</strong> {detailCliente.responsible_person || '–'}</p>
              <p><strong>Telefone:</strong> {detailCliente.phone || '–'}</p>
              <p><strong>Tipo:</strong> {detailCliente.plan_type === 'gravacao_concentrada' ? 'Gravação Concentrada' : 'Presencial Recorrente'}</p>
              <p><strong>Execução:</strong> {detailCliente.execution_type === 'com_videomaker' ? 'Com Videomaker' : 'Sozinho'}</p>
              <p><strong>Duração/sessão:</strong> {detailCliente.session_duration}min</p>
              <p><strong>Stories/semana:</strong> {detailCliente.stories_per_week}</p>
              <p><strong>Dias presenciais:</strong> {detailCliente.presence_days_per_week}</p>
              <p><strong>Horas contratadas:</strong> {detailCliente.total_contracted_hours}h</p>
              <div className="flex gap-1 flex-wrap">
                <strong>Dias fixos:</strong>
                {detailCliente.selected_days.map(d => (
                  <Badge key={d} variant="secondary" className="text-[10px]">{DAY_LABELS[d as keyof typeof DAY_LABELS] || d}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Performance</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Gravações realizadas:</strong> {completedCount}</p>
              <p><strong>Cancelamentos:</strong> {cancelledCount}</p>
              <p><strong>Taxa de cancelamento:</strong> {clientSchedules.length > 0 ? ((cancelledCount / clientSchedules.length) * 100).toFixed(0) : 0}%</p>
              <p><strong>Horas executadas:</strong> {totalHoursExecuted.toFixed(1)}h</p>
              <p><strong>Esta semana:</strong> {weekSchedules.length} agendamentos</p>
            </CardContent>
          </Card>
        </div>

        {detailCliente.notes && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Observações Estratégicas</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{detailCliente.notes}</p></CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Próximos Agendamentos</CardTitle></CardHeader>
          <CardContent>
            {clientSchedules.filter(a => a.date >= format(new Date(), 'yyyy-MM-dd') && a.status !== 'cancelado').length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
            ) : (
              <div className="space-y-2">
                {clientSchedules
                  .filter(a => a.date >= format(new Date(), 'yyyy-MM-dd') && a.status !== 'cancelado')
                  .slice(0, 10)
                  .map(a => (
                    <div key={a.id} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-secondary">
                      <CalIcon size={14} className="text-muted-foreground" />
                      <span>{format(parseISO(a.date), "dd/MM (EEE)", { locale: ptBR })}</span>
                      <Clock size={14} className="text-muted-foreground" />
                      <span>{a.start_time} ({a.duration}min)</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{a.status}</Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display">Clientes Endomarketing</h1>
          <p className="text-sm text-muted-foreground">{clientes.length} clientes cadastrados</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus size={16} className="mr-1.5" /> Novo Cliente</Button>
      </div>

      {clientes.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum cliente cadastrado ainda.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clientes.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
                style={{ borderLeftColor: `hsl(${c.color})` }}
                onClick={() => setSearchParams({ detail: c.id })}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold truncate">{c.company_name}</h3>
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="p-1 hover:bg-secondary rounded"><Edit2 size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }} className="p-1 hover:bg-destructive/10 rounded text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>📱 {c.stories_per_week} stories/sem · 📅 {c.presence_days_per_week} dias/sem</p>
                    <p>⏱ {c.session_duration}min · {c.plan_type === 'gravacao_concentrada' ? '🎬 Concentrada' : '🏢 Recorrente'}</p>
                    {c.execution_type === 'com_videomaker' && <Badge variant="outline" className="text-[10px]">Com videomaker</Badge>}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCliente ? 'Editar Cliente' : 'Novo Cliente de Endomarketing'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome da empresa *</Label>
                <Input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
              </div>
              <div>
                <Label>Responsável</Label>
                <Input value={form.responsible_person} onChange={e => setForm(p => ({ ...p, responsible_person: e.target.value }))} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label>Cor</Label>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {CLIENT_COLORS.map(c => (
                  <button key={c.value} className={`w-6 h-6 rounded-full border-2 ${form.color === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: `hsl(${c.value})` }} onClick={() => setForm(p => ({ ...p, color: c.value }))} title={c.name} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stories/semana</Label>
                <Input type="number" min={0} value={form.stories_per_week} onChange={e => setForm(p => ({ ...p, stories_per_week: +e.target.value }))} />
              </div>
              <div>
                <Label>Dias presenciais/semana</Label>
                <Input type="number" min={1} max={5} value={form.presence_days_per_week} onChange={e => setForm(p => ({ ...p, presence_days_per_week: +e.target.value }))} />
              </div>
            </div>

            <div>
              <Label>Dias da semana</Label>
              <div className="flex gap-2 mt-1">
                {DAYS.map(d => (
                  <label key={d.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={form.selected_days.includes(d.value)} onCheckedChange={() => toggleDay(d.value)} />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duração por sessão</Label>
                <Select value={String(form.session_duration)} onValueChange={v => setForm(p => ({ ...p, session_duration: +v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de execução</Label>
                <Select value={form.execution_type} onValueChange={v => setForm(p => ({ ...p, execution_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sozinho">Sozinho</SelectItem>
                    <SelectItem value="com_videomaker">Com Videomaker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de plano</Label>
                <Select value={form.plan_type} onValueChange={v => setForm(p => ({ ...p, plan_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presencial_recorrente">Presencial Recorrente</SelectItem>
                    <SelectItem value="gravacao_concentrada">Gravação Concentrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Horas contratadas/mês</Label>
                <Input type="number" min={0} step={0.5} value={form.total_contracted_hours} onChange={e => setForm(p => ({ ...p, total_contracted_hours: +e.target.value }))} />
              </div>
            </div>

            <div>
              <Label>Observações estratégicas</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingCliente ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
