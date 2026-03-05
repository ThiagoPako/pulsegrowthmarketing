import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ClipboardList } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';

interface DeliveryRecord {
  id: string;
  recording_id: string | null;
  client_id: string;
  videomaker_id: string;
  date: string;
  reels_produced: number;
  creatives_produced: number;
  stories_produced: number;
  arts_produced: number;
  extras_produced: number;
  videos_recorded: number;
  observations: string | null;
  delivery_status: string;
}

const STATUS_LABELS: Record<string, string> = {
  realizada: 'Realizada',
  cancelada_cliente: 'Cancelada pelo cliente',
  cancelada_agencia: 'Cancelada pela agência',
  encaixe: 'Encaixe de agenda',
  extra: 'Conteúdo extra',
};

const STATUS_COLORS: Record<string, string> = {
  realizada: 'default',
  cancelada_cliente: 'destructive',
  cancelada_agencia: 'destructive',
  encaixe: 'secondary',
  extra: 'outline',
};

const emptyRecord = (): Partial<DeliveryRecord> => ({
  client_id: '', videomaker_id: '', date: new Date().toISOString().split('T')[0],
  reels_produced: 0, creatives_produced: 0, stories_produced: 0, arts_produced: 0,
  extras_produced: 0, videos_recorded: 0, observations: '', delivery_status: 'realizada',
});

export default function DeliveryRecords() {
  const { clients, users, recordings } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryRecord | null>(null);
  const [form, setForm] = useState<Partial<DeliveryRecord>>(emptyRecord());
  const [loading, setLoading] = useState(true);
  const [filterClient, setFilterClient] = useState('all');

  const videomakers = users.filter(u => u.role === 'videomaker');

  const fetchRecords = useCallback(async () => {
    const { data } = await supabase.from('delivery_records').select('*').order('date', { ascending: false });
    if (data) setRecords(data as DeliveryRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    if (filterClient === 'all') return records;
    return records.filter(r => r.client_id === filterClient);
  }, [records, filterClient]);

  // Pre-fill from recording when selecting a recording
  const handlePrefillFromRecording = (recId: string) => {
    const rec = recordings.find(r => r.id === recId);
    if (rec) {
      setForm(prev => ({
        ...prev,
        recording_id: rec.id,
        client_id: rec.clientId,
        videomaker_id: rec.videomakerId,
        date: rec.date,
      }));
    }
  };

  // Available completed recordings not yet linked to a delivery
  const availableRecordings = useMemo(() => {
    const linkedIds = new Set(records.map(r => r.recording_id).filter(Boolean));
    return recordings.filter(r => r.status === 'concluida' && !linkedIds.has(r.id));
  }, [recordings, records]);

  const handleOpen = (record?: DeliveryRecord) => {
    if (record) { setEditing(record); setForm(record); }
    else { setEditing(null); setForm(emptyRecord()); }
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.client_id || !form.videomaker_id) { toast.error('Selecione cliente e videomaker'); return; }
    const payload = {
      recording_id: form.recording_id || null,
      client_id: form.client_id,
      videomaker_id: form.videomaker_id,
      date: form.date,
      reels_produced: form.reels_produced || 0,
      creatives_produced: form.creatives_produced || 0,
      stories_produced: form.stories_produced || 0,
      arts_produced: form.arts_produced || 0,
      extras_produced: form.extras_produced || 0,
      videos_recorded: form.videos_recorded || 0,
      observations: form.observations || null,
      delivery_status: form.delivery_status || 'realizada',
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error } = await supabase.from('delivery_records').update(payload as any).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Registro atualizado');
    } else {
      const { error } = await supabase.from('delivery_records').insert(payload as any);
      if (error) { toast.error('Erro ao criar registro'); return; }
      toast.success('Entrega registrada');
    }
    setOpen(false);
    fetchRecords();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este registro?')) return;
    await supabase.from('delivery_records').delete().eq('id', id);
    toast.success('Registro removido');
    fetchRecords();
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClient = (id: string) => clients.find(c => c.id === id);
  const getVmName = (id: string) => users.find(u => u.id === id)?.name || '—';
  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registro de Entregas</h1>
          <p className="text-sm text-muted-foreground">Registre e acompanhe as entregas realizadas</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2"><Plus size={16} /> Nova Entrega</Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-center">
        <Label className="text-sm">Filtrar por cliente:</Label>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <p className="text-muted-foreground">Carregando...</p> : filteredRecords.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <ClipboardList size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma entrega registrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Videomaker</TableHead>
                <TableHead className="text-center">Vídeos</TableHead>
                <TableHead className="text-center">Reels</TableHead>
                <TableHead className="text-center">Criativos</TableHead>
                <TableHead className="text-center">Stories</TableHead>
                <TableHead className="text-center">Extras</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map(rec => {
                const client = getClient(rec.client_id);
                return (
                  <TableRow key={rec.id}>
                    <TableCell className="whitespace-nowrap">{new Date(rec.date + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {client && <ClientLogo client={client} size="sm" />}
                        <span className="truncate max-w-[120px]">{getClientName(rec.client_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getVmName(rec.videomaker_id)}</TableCell>
                    <TableCell className="text-center">{rec.videos_recorded}</TableCell>
                    <TableCell className="text-center">{rec.reels_produced}</TableCell>
                    <TableCell className="text-center">{rec.creatives_produced}</TableCell>
                    <TableCell className="text-center">{rec.stories_produced}</TableCell>
                    <TableCell className="text-center">{rec.extras_produced}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[rec.delivery_status] as any || 'default'}>
                        {STATUS_LABELS[rec.delivery_status] || rec.delivery_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpen(rec)}><Pencil size={13} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(rec.id)}><Trash2 size={13} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Entrega' : 'Registrar Entrega'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Pre-fill from recording */}
            {!editing && availableRecordings.length > 0 && (
              <div className="space-y-1">
                <Label>Vincular a uma gravação concluída (opcional)</Label>
                <Select value={form.recording_id || ''} onValueChange={handlePrefillFromRecording}>
                  <SelectTrigger><SelectValue placeholder="Selecionar gravação..." /></SelectTrigger>
                  <SelectContent>
                    {availableRecordings.map(r => {
                      const cn = clients.find(c => c.id === r.clientId)?.companyName || '?';
                      return <SelectItem key={r.id} value={r.id}>{cn} — {new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR')} {r.startTime}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={v => setField('client_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Videomaker *</Label>
                <Select value={form.videomaker_id} onValueChange={v => setField('videomaker_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.delivery_status} onValueChange={v => setField('delivery_status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Vídeos</Label><Input type="number" min={0} value={form.videos_recorded} onChange={e => setField('videos_recorded', parseInt(e.target.value) || 0)} /></div>
              <div className="space-y-1"><Label>Reels</Label><Input type="number" min={0} value={form.reels_produced} onChange={e => setField('reels_produced', parseInt(e.target.value) || 0)} /></div>
              <div className="space-y-1"><Label>Criativos</Label><Input type="number" min={0} value={form.creatives_produced} onChange={e => setField('creatives_produced', parseInt(e.target.value) || 0)} /></div>
              <div className="space-y-1"><Label>Stories</Label><Input type="number" min={0} value={form.stories_produced} onChange={e => setField('stories_produced', parseInt(e.target.value) || 0)} /></div>
              <div className="space-y-1"><Label>Artes</Label><Input type="number" min={0} value={form.arts_produced} onChange={e => setField('arts_produced', parseInt(e.target.value) || 0)} /></div>
              <div className="space-y-1"><Label>Extras</Label><Input type="number" min={0} value={form.extras_produced} onChange={e => setField('extras_produced', parseInt(e.target.value) || 0)} /></div>
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={form.observations || ''} onChange={e => setField('observations', e.target.value)} rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>{editing ? 'Salvar' : 'Registrar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
