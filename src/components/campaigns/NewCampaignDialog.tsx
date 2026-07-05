import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CAMPAIGN_TYPE_LABELS, CAMPAIGN_TYPE_DESCRIPTIONS, CampaignType, formatBrDate } from '@/lib/campaignsUtils';
import { buildCampaignSlots, RECOMMENDED_QUANTITIES } from '@/lib/campaignTemplates';
import { Sparkles, FileText, Palette, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export default function NewCampaignDialog({ open, onOpenChange, onCreated }: Props) {
  const { clients } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('institucional');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [videosQty, setVideosQty] = useState(4);
  const [creativesQty, setCreativesQty] = useState(2);
  const [objective, setObjective] = useState('');
  const [saving, setSaving] = useState(false);

  const clientOptions = useMemo(
    () => [...clients].sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [clients]
  );

  const previewSlots = useMemo(
    () => (startDate && endDate ? buildCampaignSlots({ type, startDate, endDate, videosQty, creativesQty }) : []),
    [type, startDate, endDate, videosQty, creativesQty]
  );

  const reset = () => {
    setStep(1); setClientId(''); setName(''); setType('institucional');
    setStartDate(''); setEndDate(''); setVideosQty(4); setCreativesQty(2); setObjective('');
  };

  const canNext = () => {
    if (step === 1) return !!clientId && !!name.trim();
    if (step === 2) return !!type;
    if (step === 3) return !!startDate && !!endDate && videosQty >= 0 && creativesQty >= 0 && startDate <= endDate;
    return true;
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          client_id: clientId,
          name: name.trim(),
          type,
          objective: objective.trim() || null,
          start_date: startDate,
          end_date: endDate,
          videos_qty: videosQty,
          creatives_qty: creativesQty,
          status: 'ativa',
          owner_id: user?.id || null,
        })
        .select()
        .single();

      if (error || !campaign) throw error || new Error('Falha ao criar campanha');

      const videoDates = distributeDates(startDate, endDate, videosQty);
      const creativeDates = distributeDates(startDate, endDate, creativesQty);

      const slots: any[] = [
        {
          campaign_id: campaign.id,
          position: 0,
          kind: 'editorial',
          title: 'Editorial da Campanha',
          post_date: startDate,
          status: 'pendente',
        },
      ];
      videoDates.forEach((d, i) =>
        slots.push({
          campaign_id: campaign.id,
          position: 1 + i,
          kind: 'video',
          title: `Vídeo ${i + 1}`,
          post_date: d,
          status: 'pendente',
        })
      );
      creativeDates.forEach((d, i) =>
        slots.push({
          campaign_id: campaign.id,
          position: 1 + videoDates.length + i,
          kind: 'creative',
          title: `Criativo ${i + 1}`,
          post_date: d,
          status: 'pendente',
        })
      );

      if (slots.length > 0) {
        const { error: sErr } = await supabase.from('campaign_slots').insert(slots);
        if (sErr) throw sErr;
      }

      toast.success('Campanha criada!');
      onCreated?.();
      onOpenChange(false);
      reset();
      navigate(`/campanhas/${campaign.id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar campanha');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova Campanha — passo {step} de 4</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome da campanha</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Black Friday 2026" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <Label>Tipo de campanha</Label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`text-left p-3 rounded-md border transition ${
                    type === t ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="font-medium flex items-center gap-2">
                    {CAMPAIGN_TYPE_LABELS[t]}
                    {t === 'evento' && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                        Novo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{CAMPAIGN_TYPE_DESCRIPTIONS[t]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <Label>Quantidade de vídeos</Label>
                <Input type="number" min={0} value={videosQty} onChange={(e) => setVideosQty(Math.max(0, +e.target.value || 0))} />
              </div>
              <div>
                <Label>Quantidade de criativos</Label>
                <Input type="number" min={0} value={creativesQty} onChange={(e) => setCreativesQty(Math.max(0, +e.target.value || 0))} />
              </div>
            </div>
            <div>
              <Label>Objetivo / observações</Label>
              <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded border bg-muted/40">
              <div><b>Cliente:</b> {clients.find(c => c.id === clientId)?.companyName}</div>
              <div><b>Nome:</b> {name}</div>
              <div><b>Tipo:</b> {CAMPAIGN_TYPE_LABELS[type]}</div>
              <div><b>Período:</b> {startDate} até {endDate}</div>
              <div><b>Vídeos:</b> {videosQty} · <b>Criativos:</b> {creativesQty}</div>
            </div>
            <div>
              <div className="font-medium mb-1">Datas sugeridas de postagem dos vídeos:</div>
              <div className="flex flex-wrap gap-1">
                {previewDates.map((d, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded bg-primary/10 border border-primary/30">
                    Vídeo {i + 1}: {d}
                  </span>
                ))}
                {previewDates.length === 0 && <span className="text-muted-foreground">Sem vídeos.</span>}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="ghost" disabled={step === 1 || saving} onClick={() => setStep(step - 1)}>Voltar</Button>
          {step < 4 ? (
            <Button disabled={!canNext()} onClick={() => setStep(step + 1)}>Próximo</Button>
          ) : (
            <Button disabled={saving} onClick={handleCreate}>{saving ? 'Criando...' : 'Criar campanha'}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
