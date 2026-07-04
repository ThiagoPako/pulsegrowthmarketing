import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Megaphone, AlertTriangle, FileText, Palette, BookOpen, Calendar } from 'lucide-react';
import {
  CAMPAIGN_TYPE_LABELS, SLOT_STATUS_LABELS, SlotKind, SlotStatus, CampaignType,
  formatBrDate, recordingDeadline, isSlotDelayed,
} from '@/lib/campaignsUtils';

interface Campaign {
  id: string; client_id: string; name: string; type: CampaignType;
  objective: string | null; start_date: string; end_date: string;
  videos_qty: number; creatives_qty: number; status: string;
  editorial: any;
}
interface Slot {
  id: string; campaign_id: string; position: number; kind: SlotKind;
  title: string | null; post_date: string | null; status: SlotStatus;
  script_id: string | null; notes: string | null;
}

const KIND_ICON = { editorial: BookOpen, video: FileText, creative: Palette } as const;

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients } = useApp();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase.from('campaign_slots').select('*').eq('campaign_id', id).order('position', { ascending: true }),
    ]);
    setCampaign(c as Campaign);
    setSlots((s as Slot[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const client = campaign ? clients.find(c => c.id === campaign.client_id) : null;
  const completed = slots.filter(s => s.status === 'postado').length;
  const progress = slots.length ? Math.round((completed / slots.length) * 100) : 0;

  const nextRecordings = useMemo(
    () => slots.filter(s => s.kind === 'video' && s.status !== 'postado')
      .sort((a, b) => (a.post_date || '').localeCompare(b.post_date || ''))
      .slice(0, 5),
    [slots]
  );

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!campaign) return <div className="p-6">Campanha não encontrada.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/campanhas')}><ArrowLeft className="h-4 w-4" /></Button>
        <Megaphone className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{campaign.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            {client?.companyName} · {CAMPAIGN_TYPE_LABELS[campaign.type]} · {formatBrDate(campaign.start_date)} → {formatBrDate(campaign.end_date)}
          </p>
        </div>
        <Badge>{campaign.status}</Badge>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium">Progresso da campanha</span>
          <span className="text-muted-foreground">{completed}/{slots.length} slots postados ({progress}%)</span>
        </div>
        <div className="h-2 bg-muted rounded overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </Card>

      {nextRecordings.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2 font-medium"><Calendar className="h-4 w-4" /> Próximas gravações (por prioridade)</div>
          <ul className="text-sm space-y-1">
            {nextRecordings.map((s, i) => {
              const delayed = isSlotDelayed(s.post_date, s.status);
              return (
                <li key={s.id} className={`flex justify-between ${delayed ? 'text-destructive' : ''}`}>
                  <span>{i + 1}. {s.title}</span>
                  <span>postar {formatBrDate(s.post_date)} · gravar até {formatBrDate(recordingDeadline(s.post_date))}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Linha do tempo</h2>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {slots.map(slot => {
            const Icon = KIND_ICON[slot.kind];
            const delayed = slot.kind === 'video' && isSlotDelayed(slot.post_date, slot.status);
            return (
              <button
                key={slot.id}
                onClick={() => setEditingSlot(slot)}
                className={`shrink-0 w-56 p-4 rounded-lg border-2 text-left transition hover:shadow-md ${
                  delayed ? 'border-destructive bg-destructive/5' :
                  slot.kind === 'editorial' ? 'border-primary bg-primary/5' :
                  'border-border bg-card'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className="h-4 w-4" />
                  {delayed && <AlertTriangle className="h-4 w-4 text-destructive" />}
                </div>
                <div className="text-xs uppercase text-muted-foreground">{slot.kind}</div>
                <div className="font-semibold text-sm mb-2">{slot.title}</div>
                <div className="text-lg font-bold text-primary">{formatBrDate(slot.post_date)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  gravar até {formatBrDate(recordingDeadline(slot.post_date))}
                </div>
                <Badge variant="secondary" className="mt-2 text-[10px]">{SLOT_STATUS_LABELS[slot.status]}</Badge>
              </button>
            );
          })}
        </div>
      </div>

      {editingSlot && (
        <SlotDialog
          slot={editingSlot}
          campaign={campaign}
          onClose={() => setEditingSlot(null)}
          onSaved={() => { setEditingSlot(null); load(); }}
        />
      )}
    </div>
  );
}

// ---------- Slot editor ----------
function SlotDialog({ slot, campaign, onClose, onSaved }: {
  slot: Slot; campaign: Campaign; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(slot.title || '');
  const [postDate, setPostDate] = useState(slot.post_date || '');
  const [status, setStatus] = useState<SlotStatus>(slot.status);
  const [notes, setNotes] = useState(slot.notes || '');
  const [scriptContent, setScriptContent] = useState('');
  const [scriptTitle, setScriptTitle] = useState('');
  const [loadingScript, setLoadingScript] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (slot.kind !== 'video' || !slot.script_id) return;
      setLoadingScript(true);
      const { data } = await supabase.from('scripts').select('*').eq('id', slot.script_id).single();
      if (data) { setScriptContent(data.content || ''); setScriptTitle(data.title || ''); }
      setLoadingScript(false);
    })();
  }, [slot]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let scriptId = slot.script_id;

      if (slot.kind === 'video' && (scriptContent.trim() || scriptTitle.trim())) {
        if (scriptId) {
          await supabase.from('scripts').update({
            title: scriptTitle || title,
            content: scriptContent,
          }).eq('id', scriptId);
        } else {
          const { data: created, error } = await supabase.from('scripts').insert({
            title: scriptTitle || title || `${campaign.companyName} - ${slot.title}`,
            content: scriptContent,
            client_id: campaign.client_id,
            campaign_slot_id: slot.id,
            status: 'rascunho',
          }).select().single();
          if (error) throw error;
          scriptId = created.id;
        }
      }

      const newStatus: SlotStatus =
        slot.kind === 'video' && scriptContent.trim() && status === 'pendente' ? 'roteiro_pronto' : status;

      const { error: uErr } = await supabase.from('campaign_slots').update({
        title, post_date: postDate || null, status: newStatus, notes, script_id: scriptId,
      }).eq('id', slot.id);
      if (uErr) throw uErr;

      toast.success('Slot atualizado');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{slot.kind === 'editorial' ? 'Editorial da Campanha' : slot.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Data de postagem</Label>
              <Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SlotStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SLOT_STATUS_LABELS) as SlotStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{SLOT_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {slot.kind === 'video' && (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-base font-semibold">Roteiro do vídeo</Label>
              {loadingScript ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
                <>
                  <Input placeholder="Título do roteiro" value={scriptTitle} onChange={(e) => setScriptTitle(e.target.value)} />
                  <Textarea
                    placeholder="Escreva o roteiro do vídeo aqui..."
                    value={scriptContent}
                    onChange={(e) => setScriptContent(e.target.value)}
                    rows={10}
                  />
                  <p className="text-xs text-muted-foreground">Vinculado à campanha. Também aparece em /roteiros.</p>
                </>
              )}
            </div>
          )}

          {slot.kind === 'editorial' && (
            <p className="text-sm text-muted-foreground">
              Use as notas acima para definir o briefing estratégico da campanha: público-alvo, tom de voz,
              cores, hashtags, CTAs, palavras-chave.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
