import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Camera, Square, Clock } from 'lucide-react';
import type { Client } from '@/types';

interface FieldworkActivity {
  id: string;
  videomaker_id: string;
  client_id: string;
  activity_type: string;
  notes: string | null;
  started_at: string;
  ended_at: string | null;
}

const ACTIVITY_TYPES = [
  { value: 'taker', label: '📹 Coletar Taker', emoji: '📹' },
  { value: 'story', label: '📱 Gravar Story', emoji: '📱' },
  { value: 'produtos', label: '🛍️ Fotos de Produtos', emoji: '🛍️' },
  { value: 'fotos', label: '📷 Fotos Gerais', emoji: '📷' },
  { value: 'evento', label: '🎪 Cobertura Evento', emoji: '🎪' },
  { value: 'entrega', label: '📦 Entrega de Material', emoji: '📦' },
  { value: 'outro', label: '🔧 Outro', emoji: '🔧' },
];

interface Props {
  videomakerId: string;
  clients: Client[];
}

export default function FieldworkButton({ videomakerId, clients }: Props) {
  const [active, setActive] = useState<FieldworkActivity | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedType, setSelectedType] = useState('taker');
  const [notes, setNotes] = useState('');
  const [elapsed, setElapsed] = useState(0);

  // Check for existing active fieldwork on mount
  const checkActive = useCallback(async () => {
    const { data } = await supabase
      .from('fieldwork_activities')
      .select('*')
      .eq('videomaker_id', videomakerId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1) as any;
    if (data?.[0]) setActive(data[0]);
  }, [videomakerId]);

  useEffect(() => { void checkActive(); }, [checkActive]);

  // Timer
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const update = () => setElapsed(Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [active]);

  const handleStart = async () => {
    if (!selectedClient) { toast.error('Selecione um cliente'); return; }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error } = await supabase.from('fieldwork_activities').insert({
      id,
      videomaker_id: videomakerId,
      client_id: selectedClient,
      activity_type: selectedType,
      notes: notes.trim() || null,
      started_at: now,
    } as any);
    if (error) { toast.error('Erro ao iniciar atividade externa'); console.error(error); return; }

    const newAct: FieldworkActivity = {
      id, videomaker_id: videomakerId, client_id: selectedClient,
      activity_type: selectedType, notes: notes.trim() || null,
      started_at: now, ended_at: null,
    };
    setActive(newAct);
    setDialogOpen(false);
    setNotes('');

    const client = clients.find(c => c.id === selectedClient);
    const typeLabel = ACTIVITY_TYPES.find(t => t.value === selectedType)?.label || selectedType;
    toast.success(`Atividade externa iniciada: ${typeLabel} — ${client?.companyName || 'Cliente'}`);
  };

  const handleStop = async () => {
    if (!active) return;
    const now = new Date().toISOString();
    await supabase.from('fieldwork_activities').update({ ended_at: now } as any).eq('id', active.id);
    
    const durMin = Math.floor(elapsed / 60);
    const client = clients.find(c => c.id === active.client_id);
    toast.success(`Atividade encerrada: ${durMin}min — ${client?.companyName || 'Cliente'}`);
    setActive(null);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const activeClient = active ? clients.find(c => c.id === active.client_id) : null;
  const activeType = active ? ACTIVITY_TYPES.find(t => t.value === active.activity_type) : null;

  return (
    <>
      {/* Active fieldwork banner */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border-2 border-info/40 bg-info/5 p-3 sm:p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-10 h-10 rounded-xl bg-info/15 flex items-center justify-center"
                >
                  <MapPin className="w-5 h-5 text-info" />
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {activeType?.emoji} {activeType?.label?.replace(activeType?.emoji + ' ', '') || active.activity_type}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-info/30 text-info">
                      <motion.div className="w-1.5 h-1.5 rounded-full bg-info mr-1"
                        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                      Em campo
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    🏢 {activeClient?.companyName || 'Cliente'} · <Clock className="inline w-3 h-3" /> {formatTime(elapsed)}
                  </p>
                  {active.notes && <p className="text-[11px] text-muted-foreground/70 mt-0.5">💬 {active.notes}</p>}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleStop}
                className="gap-1 border-destructive/50 text-destructive hover:bg-destructive/10">
                <Square size={14} /> Encerrar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start button (when no active fieldwork and no active recording) */}
      {!active && (
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}
          className="gap-1.5 border-info/40 text-info hover:bg-info/10">
          <MapPin size={14} /> Atividade Externa
        </Button>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin size={18} className="text-info" /> Iniciar Atividade Externa
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Cliente</label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Tipo de Atividade</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Observações (opcional)</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Ex: Coletar fotos da fachada nova" rows={2} />
            </div>

            <Button onClick={handleStart} className="w-full gap-2">
              <Camera size={16} /> Iniciar Atividade
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
