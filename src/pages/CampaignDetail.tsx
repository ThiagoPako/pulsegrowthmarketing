import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft, Megaphone, AlertTriangle, PlayCircle, Palette, BookOpen,
  Calendar, Trash2, CheckCircle2,
} from 'lucide-react';
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

// ─── Identidade visual por tipo de slot ─────────────────────────────
type KindStyle = {
  label: string;
  Icon: typeof PlayCircle;
  /** cor base HSL — completo/ativo */
  color: string;         // ex.: '199 89% 48%' (cyan)
  glow: string;          // rgba glow para shadow
};

const KIND_STYLE: Record<SlotKind, KindStyle> = {
  editorial: { label: 'Editorial', Icon: BookOpen,   color: '199 89% 48%',  glow: 'rgba(14,165,233,0.35)' },
  video:     { label: 'Reel',      Icon: PlayCircle, color: '16 82% 51%',   glow: 'rgba(241,89,42,0.45)'  },
  creative:  { label: 'Arte',      Icon: Palette,    color: '243 75% 59%',  glow: 'rgba(99,102,241,0.45)' },
};

const isDone = (s: SlotStatus) => s === 'postado';

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients } = useApp();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState(false);

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
  const completed = slots.filter(s => isDone(s.status)).length;
  const progress = slots.length ? Math.round((completed / slots.length) * 100) : 0;

  // índice do próximo slot ainda não concluído (destaque pulsante)
  const nextIdx = slots.findIndex(s => !isDone(s.status));

  const nextRecordings = useMemo(
    () => slots.filter(s => s.kind === 'video' && s.status !== 'postado')
      .sort((a, b) => (a.post_date || '').localeCompare(b.post_date || ''))
      .slice(0, 5),
    [slots]
  );

  const handleDelete = async () => {
    if (!campaign) return;
    setDeleting(true);
    try {
      await supabase.from('campaign_slots').delete().eq('campaign_id', campaign.id);
      const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id);
      if (error) throw error;
      toast.success('Campanha apagada');
      navigate('/campanhas');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao apagar campanha');
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!campaign) return <div className="p-6">Campanha não encontrada.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/campanhas')}><ArrowLeft className="h-4 w-4" /></Button>
        <Megaphone className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {client?.companyName} · {CAMPAIGN_TYPE_LABELS[campaign.type]} · {formatBrDate(campaign.start_date)} → {formatBrDate(campaign.end_date)}
          </p>
        </div>
        <Badge>{campaign.status}</Badge>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" title="Apagar campanha">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar campanha?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso remove permanentemente a campanha <b>{campaign.name}</b> e todos os seus {slots.length} slots.
                Roteiros vinculados serão desassociados, mas <b>não</b> serão apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Apagando...' : 'Apagar campanha'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

      {/* ─── LINHA DO TEMPO (Sequential Flow Timeline) ─── */}
      <div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Linha do tempo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Slots conectados na ordem de execução — cada etapa se acende quando concluída
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            {(Object.keys(KIND_STYLE) as SlotKind[]).map(k => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${KIND_STYLE[k].color})` }} />
                {KIND_STYLE[k].label}
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto pb-8 -mx-2 px-2">
          <div className="relative flex items-center min-w-max">
            {/* trilha base */}
            <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-muted/60" />
            {/* trilha preenchida (progresso) */}
            <div
              className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-primary transition-all duration-700"
              style={{
                width: slots.length ? `${(completed / slots.length) * 100}%` : '0%',
                boxShadow: '0 0 15px rgba(241,89,42,0.5)',
              }}
            />

            {slots.map((slot, i) => {
              const style = KIND_STYLE[slot.kind];
              const done = isDone(slot.status);
              const isNext = i === nextIdx;
              const delayed = slot.kind === 'video' && isSlotDelayed(slot.post_date, slot.status);
              const Icon = style.Icon;
              const accent = `hsl(${style.color})`;

              return (
                <div key={slot.id} className="relative flex flex-col items-center px-4 shrink-0">
                  {/* nó da timeline */}
                  <div
                    className={`relative z-10 flex items-center justify-center rounded-full transition-all
                      ${isNext ? 'w-12 h-12 mb-4' : done ? 'w-10 h-10 mb-6' : 'w-8 h-8 mb-8'}
                    `}
                    style={
                      done
                        ? { background: accent, boxShadow: `0 0 20px ${style.glow}` }
                        : isNext
                          ? { background: accent, boxShadow: `0 0 30px ${style.glow}` }
                          : { background: 'hsl(var(--muted))', border: '2px solid hsl(var(--border))' }
                    }
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                    ) : isNext ? (
                      <>
                        <span
                          className="absolute inset-0 rounded-full animate-ping"
                          style={{ background: accent, opacity: 0.5 }}
                        />
                        <Icon className="h-5 w-5 text-white relative" strokeWidth={2.5} />
                      </>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                    )}
                  </div>

                  {/* card */}
                  <button
                    onClick={() => setEditingSlot(slot)}
                    className={`group relative text-left rounded-2xl p-5 backdrop-blur-md transition-all overflow-hidden
                      ${isNext ? 'w-72 scale-[1.02]' : 'w-64'}
                      ${!done && !isNext ? 'opacity-50 hover:opacity-100' : ''}
                      hover:-translate-y-1
                    `}
                    style={{
                      background: isNext
                        ? 'hsl(var(--card))'
                        : done
                          ? 'hsl(var(--card) / 0.9)'
                          : 'hsl(var(--card) / 0.5)',
                      border: `${isNext ? 2 : 1}px solid ${
                        delayed ? 'hsl(var(--destructive))' :
                        (done || isNext) ? accent + (isNext ? '' : '66') : 'hsl(var(--border))'
                      }`,
                      boxShadow: isNext ? `0 20px 40px -12px ${style.glow}` : undefined,
                    }}
                  >
                    {/* watermark do ícone do tipo */}
                    <Icon
                      className="absolute -top-2 -right-2 h-24 w-24 pointer-events-none"
                      style={{ color: accent, opacity: done || isNext ? 0.08 : 0.04 }}
                      strokeWidth={1}
                    />

                    <div className="relative flex items-center justify-between mb-3">
                      <span
                        className="text-[10px] font-bold tracking-widest uppercase"
                        style={{ color: done || isNext ? accent : 'hsl(var(--muted-foreground))', fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        {style.label}
                      </span>
                      {delayed ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : isNext ? (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: accent }} />
                          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: accent }} />
                        </span>
                      ) : null}
                    </div>

                    <div
                      className="relative text-3xl font-bold mb-2 leading-none"
                      style={{ fontFamily: 'Space Grotesk, sans-serif', color: done || isNext ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                    >
                      {formatBrDate(slot.post_date)}
                    </div>

                    <p className="relative text-sm leading-snug mb-4 line-clamp-3 min-h-[3.5rem] text-foreground/80">
                      {slot.title || '—'}
                    </p>

                    <div className="relative flex items-center justify-between pt-3 border-t border-border/50">
                      <span
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
                        style={
                          done
                            ? { background: accent, color: 'white' }
                            : isNext
                              ? { background: `${accent}22`, color: accent, border: `1px solid ${accent}66` }
                              : { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }
                        }
                      >
                        {SLOT_STATUS_LABELS[slot.status]}
                      </span>
                      {slot.kind === 'video' && (
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                          Grav. {formatBrDate(recordingDeadline(slot.post_date))}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
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
            title: scriptTitle || title || `${campaign.name} - ${slot.title}`,
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
