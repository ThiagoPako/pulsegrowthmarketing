import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Camera, Copy, Download, Gift, Image as ImageIcon, Loader2, Plus, Printer, Sparkles, Ticket, Trash2, Upload, X } from 'lucide-react';
import TicketPrintSheet from '@/components/promo/TicketPrintSheet';
import {
  deletePromoCampaign,
  deletePromoPrize,
  generatePromoTickets,
  listPromoCampaigns,
  listPromoLeads,
  listPromoRedemptions,
  listPromoPrizes,
  listPromoTickets,
  savePromoCampaign,
  savePromoPrize,
  uploadPromoImage,
  promoAssetUrl,
  defaultPromoRules,
  type PromoBatch,
  type PromoCampaign,
  type PromoLead,
  type PromoRedemption,
  type PromoPrize,
  type PromoTicket,
} from '@/services/promoApi';

const EMPTY_CAMPAIGN: Partial<PromoCampaign> = {
  title: '',
  slug: '',
  rules_text: '',
  lgpd_terms_text: '',
  require_lead_capture: false,
  require_document: false,
  accent_color: '#E11D48',
  code_prefix: 'A3P',
  validation_pin: '1234',
  is_active: true,
};

const EMPTY_PRIZE: Partial<PromoPrize> = {
  name: '',
  description: '',
  image_url: '',
  total_quantity: 1,
  win_probability_percent: 10,
  is_active: true,
};

interface ImageFieldProps {
  label: string;
  hint: string;
  value?: string | null;
  uploading?: boolean;
  aspect?: string;
  onSelect: (file: File) => void;
  onClear: () => void;
}

/** Campo de upload visual com prévia, dimensões recomendadas e botão de remover. */
function ImageField({ label, hint, value, uploading, aspect = 'aspect-video', onSelect, onClear }: ImageFieldProps) {
  const inputId = `upload-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const cameraId = `${inputId}-camera`;
  const preview = promoAssetUrl(value);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [preview]);

  const fileInput = (id: string, camera: boolean) => (
    <input
      id={id}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      {...(camera ? { capture: 'environment' as const } : {})}
      className="hidden"
      disabled={uploading}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onSelect(file);
        e.target.value = '';
      }}
    />
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <label
        htmlFor={inputId}
        className={`relative flex ${aspect} max-h-64 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary hover:bg-muted`}
      >
        {preview && !broken ? (
          <img src={preview} alt={label} className="h-full w-full object-contain p-1" onError={() => setBroken(true)} />
        ) : preview && broken ? (
          <div className="flex flex-col items-center gap-1 p-4 text-center text-destructive">
            <X className="h-6 w-6" />
            <span className="text-xs font-medium">Imagem não encontrada no servidor</span>
            <span className="text-[10px] text-muted-foreground">Toque para enviar novamente</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 p-4 text-center text-muted-foreground">
            {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
            <span className="text-xs font-medium">Toque para escolher da galeria</span>
          </div>
        )}
        {fileInput(inputId, false)}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9 flex-1 min-w-[130px]" disabled={uploading} asChild>
          <label htmlFor={inputId} className="cursor-pointer">
            <Upload className="mr-2 h-4 w-4" /> Galeria
          </label>
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9 flex-1 min-w-[130px] sm:hidden" disabled={uploading} asChild>
          <label htmlFor={cameraId} className="cursor-pointer">
            <Camera className="mr-2 h-4 w-4" /> Câmera
          </label>
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" className="h-9 text-destructive" onClick={onClear}>
            <X className="mr-1 h-4 w-4" /> Remover
          </Button>
        ) : null}
      </div>
      {fileInput(cameraId, true)}

      <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
        <ImageIcon className="mt-0.5 h-3 w-3 shrink-0" /> {hint}
      </p>
    </div>
  );
}

function num(value: unknown) {
  return Number(value || 0);
}

export default function PromoAdmin() {
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [campaignForm, setCampaignForm] = useState<Partial<PromoCampaign>>(EMPTY_CAMPAIGN);
  const [campaignDialog, setCampaignDialog] = useState(false);

  const [prizes, setPrizes] = useState<PromoPrize[]>([]);
  const [prizeForm, setPrizeForm] = useState<Partial<PromoPrize>>(EMPTY_PRIZE);
  const [prizeDialog, setPrizeDialog] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [tickets, setTickets] = useState<PromoTicket[]>([]);
  const [batches, setBatches] = useState<PromoBatch[]>([]);
  const [batchFilter, setBatchFilter] = useState<string>('');
  const [quantity, setQuantity] = useState(50);
  const [printTickets, setPrintTickets] = useState<PromoTicket[] | null>(null);

  const [leads, setLeads] = useState<PromoLead[]>([]);
  const [redemptions, setRedemptions] = useState<PromoRedemption[]>([]);

  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) || null, [campaigns, selectedId]);
  const probabilityTotal = useMemo(
    () => prizes.filter((p) => p.is_active).reduce((sum, p) => sum + num(p.win_probability_percent), 0),
    [prizes]
  );

  async function loadCampaigns(keepSelection = true) {
    setLoading(true);
    try {
      const { campaigns: rows } = await listPromoCampaigns();
      setCampaigns(rows);
      setSelectedId((current) => (keepSelection && current && rows.some((r) => r.id === current) ? current : rows[0]?.id || null));
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao carregar sorteios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns(false);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPrizes([]);
      setTickets([]);
      setLeads([]);
      setRedemptions([]);
      return;
    }
    listPromoPrizes(selectedId).then((r) => setPrizes(r.prizes)).catch(() => setPrizes([]));
    listPromoTickets(selectedId).then((r) => {
      setTickets(r.tickets);
      setBatches(r.batches);
    }).catch(() => setTickets([]));
    listPromoLeads(selectedId).then((r) => setLeads(r.leads)).catch(() => setLeads([]));
    listPromoRedemptions(selectedId).then((r) => setRedemptions(r.redemptions)).catch(() => setRedemptions([]));
  }, [selectedId]);

  async function refreshTickets(batch = batchFilter) {
    if (!selectedId) return;
    const r = await listPromoTickets(selectedId, batch || undefined);
    setTickets(r.tickets);
    setBatches(r.batches);
  }

  async function handleSaveCampaign() {
    setSaving(true);
    try {
      const payload = {
        ...campaignForm,
        rules_text: (campaignForm.rules_text || '').trim() || defaultPromoRules(campaignForm.title || 'Promoção', prizes.map((p) => p.name)),
      };
      const { campaign } = await savePromoCampaign(payload);
      toast.success('Sorteio salvo!');
      setCampaignDialog(false);
      await loadCampaigns();
      setSelectedId(campaign.id);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePrize() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await savePromoPrize({ ...prizeForm, campaign_id: selectedId });
      toast.success('Prêmio salvo!');
      setPrizeDialog(false);
      const r = await listPromoPrizes(selectedId);
      setPrizes(r.prizes);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao salvar prêmio');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File, target: 'prize' | 'banner' | 'logo') {
    setUploading(true);
    try {
      const url = await uploadPromoImage(file);
      if (target === 'prize') setPrizeForm((f) => ({ ...f, image_url: url }));
      if (target === 'banner') setCampaignForm((f) => ({ ...f, banner_url: url }));
      if (target === 'logo') setCampaignForm((f) => ({ ...f, logo_url: url }));
      toast.success('Imagem enviada!');
    } catch (error: any) {
      toast.error(error?.message || 'Falha no upload');
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { tickets: created, batch_label } = await generatePromoTickets(selectedId, quantity);
      toast.success(`${created.length} cupons gerados (${batch_label})`);
      setPrintTickets(created);
      await refreshTickets('');
      await loadCampaigns();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao gerar cupons');
    } finally {
      setSaving(false);
    }
  }

  function exportLeadsCsv() {
    const header = ['Nome', 'Telefone', 'CPF', 'Prêmio', 'Código', 'Data do sorteio', 'Resgatado em', 'Opt-in LGPD'];
    const lines = leads.map((lead) => [
      lead.participant_name || '',
      lead.participant_phone || '',
      lead.participant_document || '',
      lead.prize_name || 'Sem prêmio',
      lead.redemption_code || '',
      lead.revealed_at ? new Date(lead.revealed_at).toLocaleString('pt-BR') : '',
      lead.redeemed_at ? new Date(lead.redeemed_at).toLocaleString('pt-BR') : '',
      lead.lgpd_accepted ? 'Sim' : 'Não',
    ]);
    const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leads-${selected?.slug || 'sorteio'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /** Exporta a lista de prêmios efetivamente entregues no caixa. */
  function exportRedemptionsCsv() {
    const header = ['Cliente', 'WhatsApp', 'Prêmio', 'Código', 'Entregue em', 'Operador', 'Lote'];
    const lines = redemptions.map((item) => [
      item.participant_name || '',
      item.participant_phone || '',
      item.prize_name || '',
      item.redemption_code || '',
      item.redeemed_at ? new Date(item.redeemed_at).toLocaleString('pt-BR') : '',
      item.redeemed_by || '',
      item.batch_label || '',
    ]);
    const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `resgatados-${selected?.slug || 'sorteio'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }



  if (printTickets) {
    return (
      <div className="min-h-screen bg-white p-6">
        <div className="mb-4 flex gap-2 print:hidden">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir folha A4
          </Button>
          <Button variant="outline" onClick={() => setPrintTickets(null)}>
            Voltar ao painel
          </Button>
        </div>
        {selected ? <TicketPrintSheet campaign={selected} tickets={printTickets} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3 pb-24 sm:space-y-6 sm:p-6 sm:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Sorteios de Prêmios</h1>
          <p className="text-sm text-muted-foreground">Roleta e raspadinha com QR Code descartável.</p>
        </div>
        <Button
          className="hidden sm:inline-flex"
          onClick={() => {
            setCampaignForm(EMPTY_CAMPAIGN);
            setCampaignDialog(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Novo sorteio
        </Button>
      </div>

      {/* Botão fixo para cadastro pelo celular */}
      <Button
        size="lg"
        className="fixed bottom-4 left-3 right-3 z-40 h-12 shadow-lg sm:hidden"
        onClick={() => {
          setCampaignForm(EMPTY_CAMPAIGN);
          setCampaignDialog(true);
        }}
      >
        <Plus className="mr-2 h-5 w-5" /> Novo sorteio
      </Button>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum sorteio cadastrado ainda. Crie o primeiro para gerar os cupons.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => setSelectedId(campaign.id)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                  campaign.id === selectedId ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {campaign.title}
              </button>
            ))}
          </div>

          {selected ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
                {[
                  { label: 'Cupons gerados', value: num(selected.tickets_total) },
                  { label: 'Cupons escaneados', value: num(selected.tickets_opened) },
                  { label: 'Prêmios sorteados', value: num(selected.prizes_drawn) },
                  { label: 'Prêmios resgatados', value: num(selected.prizes_redeemed) },
                  { label: 'Leads capturados', value: num(selected.leads_total) },
                ].map((metric) => (
                  <Card key={metric.label}>
                    <CardContent className="p-3 sm:p-4">
                      <p className="text-[11px] text-muted-foreground sm:text-xs">{metric.label}</p>
                      <p className="mt-1 text-xl font-bold sm:text-2xl">{metric.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Tabs defaultValue="premios">
                <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
                  <TabsList className="w-max">
                    <TabsTrigger value="premios">Prêmios</TabsTrigger>
                    <TabsTrigger value="cupons">Cupons e impressão</TabsTrigger>
                    <TabsTrigger value="resgatados">Prêmios resgatados</TabsTrigger>
                    <TabsTrigger value="leads">Leads</TabsTrigger>
                    <TabsTrigger value="config">Configurações</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="premios" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-sm ${probabilityTotal > 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      Soma das chances: {probabilityTotal.toFixed(2)}% {probabilityTotal > 100 ? '— acima de 100%, ajuste os percentuais!' : `— ${(100 - probabilityTotal).toFixed(2)}% ficam como "Tente novamente"`}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setPrizeForm(EMPTY_PRIZE);
                        setPrizeDialog(true);
                      }}
                    >
                      <Gift className="mr-2 h-4 w-4" /> Novo prêmio
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {prizes.map((prize) => (
                      <Card key={prize.id}>
                        <CardContent className="flex gap-3 p-4">
                          {prize.image_url ? (
                            <img src={promoAssetUrl(prize.image_url)} alt={prize.name} className="h-20 w-20 rounded-lg border border-border bg-muted object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted">
                              <Gift className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold">{prize.name}</p>
                              {!prize.is_active ? <Badge variant="secondary">Inativo</Badge> : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{prize.description}</p>
                            <p className="mt-2 text-xs">
                              Chance <strong>{num(prize.win_probability_percent).toFixed(2)}%</strong> · Saldo{' '}
                              <strong>{prize.remaining_quantity}/{prize.total_quantity}</strong>
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPrizeForm(prize);
                                  setPrizeDialog(true);
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  await deletePromoPrize(prize.id);
                                  setPrizes((list) => list.filter((p) => p.id !== prize.id));
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="cupons" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Gerar lote de cupons</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-end gap-3">
                      <div className="w-full sm:w-32">
                        <Label>Quantidade</Label>
                        <Input type="number" min={1} max={1000} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                      </div>
                      {[50, 100, 250].map((preset) => (
                        <Button key={preset} variant="outline" size="sm" onClick={() => setQuantity(preset)}>
                          {preset}
                        </Button>
                      ))}
                      <Button onClick={handleGenerate} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ticket className="mr-2 h-4 w-4" />}
                        Gerar e imprimir
                      </Button>
                    </CardContent>
                  </Card>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={batchFilter === '' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setBatchFilter('');
                        refreshTickets('');
                      }}
                    >
                      Todos
                    </Button>
                    {batches.map((batch) => (
                      <Button
                        key={batch.batch_label}
                        variant={batchFilter === batch.batch_label ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setBatchFilter(batch.batch_label);
                          refreshTickets(batch.batch_label);
                        }}
                      >
                        {batch.batch_label} ({batch.total})
                      </Button>
                    ))}
                    {tickets.length ? (
                      <Button size="sm" variant="secondary" onClick={() => setPrintTickets(tickets)}>
                        <Printer className="mr-2 h-4 w-4" /> Imprimir estes {tickets.length}
                      </Button>
                    ) : null}
                  </div>

                  <Card>
                    <CardContent className="max-h-80 overflow-y-auto p-4 text-sm">
                      {tickets.length === 0 ? (
                        <p className="text-muted-foreground">Nenhum cupom gerado ainda.</p>
                      ) : (
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                          {tickets.map((ticket) => (
                            <div key={ticket.id} className="flex items-center justify-between rounded border border-border px-2 py-1">
                              <span className="font-mono text-xs">{ticket.token}</span>
                              <Badge variant={ticket.status === 'available' ? 'secondary' : 'default'}>{ticket.status}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="resgatados" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {redemptions.length} prêmio(s) entregues no caixa.
                    </p>
                    <Button size="sm" variant="outline" onClick={exportRedemptionsCsv} disabled={!redemptions.length}>
                      <Download className="mr-2 h-4 w-4" /> Exportar CSV
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="p-3">Prêmio</th>
                            <th className="p-3">Cliente</th>
                            <th className="p-3">WhatsApp</th>
                            <th className="p-3">Código</th>
                            <th className="p-3">Entregue em</th>
                            <th className="p-3">Operador</th>
                          </tr>
                        </thead>
                        <tbody>
                          {redemptions.map((item) => (
                            <tr key={item.id} className="border-t border-border">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  {item.prize_image_url ? (
                                    <img
                                      src={promoAssetUrl(item.prize_image_url)}
                                      alt={item.prize_name || 'Prêmio'}
                                      className="h-9 w-9 rounded object-cover"
                                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  ) : null}
                                  <span>{item.prize_name || '—'}</span>
                                </div>
                              </td>
                              <td className="p-3 font-medium">{item.participant_name || '—'}</td>
                              <td className="p-3">{item.participant_phone || '—'}</td>
                              <td className="p-3 font-mono text-xs">{item.redemption_code || '—'}</td>
                              <td className="p-3">{item.redeemed_at ? new Date(item.redeemed_at).toLocaleString('pt-BR') : '—'}</td>
                              <td className="p-3">{item.redeemed_by || '—'}</td>
                            </tr>
                          ))}
                          {redemptions.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                Nenhum prêmio resgatado ainda.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </TabsContent>



                <TabsContent value="leads" className="space-y-3">
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={exportLeadsCsv} disabled={!leads.length}>
                      <Download className="mr-2 h-4 w-4" /> Exportar CSV
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="p-3">Nome</th>
                            <th className="p-3">WhatsApp</th>
                            <th className="p-3">Prêmio</th>
                            <th className="p-3">Código</th>
                            <th className="p-3">Data</th>
                            <th className="p-3">LGPD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leads.map((lead, index) => (
                            <tr key={`${lead.redemption_code || 'lead'}-${index}`} className="border-t border-border">
                              <td className="p-3">{lead.participant_name || '—'}</td>
                              <td className="p-3">{lead.participant_phone || '—'}</td>
                              <td className="p-3">{lead.prize_name || 'Sem prêmio'}</td>
                              <td className="p-3 font-mono text-xs">{lead.redemption_code || '—'}</td>
                              <td className="p-3">{lead.revealed_at ? new Date(lead.revealed_at).toLocaleString('pt-BR') : '—'}</td>
                              <td className="p-3">{lead.lgpd_accepted ? 'Sim' : 'Não'}</td>
                            </tr>
                          ))}
                          {leads.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                Nenhum lead capturado ainda.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="config" className="space-y-3">
                  <Card>
                    <CardContent className="space-y-3 p-5 text-sm">
                      <p>
                        Link do jogo:{' '}
                        <span className="font-mono text-xs">{window.location.origin}/sorteio/{selected.slug}/&#123;token&#125;</span>
                      </p>
                      <p className="flex items-center gap-2">
                        Link do caixa:{' '}
                        <span className="font-mono text-xs">{window.location.origin}/sorteio/{selected.slug}/validar</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/sorteio/${selected.slug}/validar`);
                            toast.success('Link copiado!');
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </p>
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setCampaignForm(selected);
                            setCampaignDialog(true);
                          }}
                        >
                          Editar sorteio
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            if (!window.confirm('Excluir este sorteio e todos os cupons?')) return;
                            await deletePromoCampaign(selected.id);
                            await loadCampaigns(false);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4 text-destructive" /> Excluir
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </>
      )}

      {/* Dialog de campanha */}
      <Dialog open={campaignDialog} onOpenChange={setCampaignDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{campaignForm.id ? 'Editar sorteio' : 'Novo sorteio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={campaignForm.title || ''}
                onChange={(e) =>
                  setCampaignForm((f) => ({
                    ...f,
                    title: e.target.value,
                    slug: f.id ? f.slug : e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                  }))
                }
                placeholder="Sorteios de Prêmios - Posto A3P Mara Rosa"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Slug (URL)</Label>
                <Input value={campaignForm.slug || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, slug: e.target.value }))} placeholder="a3p-mara-rosa" />
              </div>
              <div>
                <Label>Prefixo do código</Label>
                <Input value={campaignForm.code_prefix || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, code_prefix: e.target.value.toUpperCase() }))} placeholder="A3P" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cor de destaque</Label>
                <Input type="color" value={campaignForm.accent_color || '#E11D48'} onChange={(e) => setCampaignForm((f) => ({ ...f, accent_color: e.target.value }))} />
              </div>
              <div>
                <Label>PIN do caixa</Label>
                <Input value={campaignForm.validation_pin || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, validation_pin: e.target.value }))} placeholder="1234" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageField
                label="Banner do sorteio"
                hint="1080 x 608 px (16:9) · JPG/PNG até 2 MB"
                value={campaignForm.banner_url}
                uploading={uploading}
                onSelect={(file) => handleUpload(file, 'banner')}
                onClear={() => setCampaignForm((f) => ({ ...f, banner_url: '' }))}
              />
              <ImageField
                label="Logo do posto"
                hint="512 x 512 px (quadrada) · PNG com fundo transparente"
                value={campaignForm.logo_url}
                uploading={uploading}
                aspect="aspect-square"
                onSelect={(file) => handleUpload(file, 'logo')}
                onClear={() => setCampaignForm((f) => ({ ...f, logo_url: '' }))}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <Label>Regulamento</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCampaignForm((f) => ({
                      ...f,
                      rules_text: defaultPromoRules(f.title || 'Promoção', prizes.map((p) => p.name)),
                    }))
                  }
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5" /> Gerar regulamento padrão
                </Button>
              </div>
              <Textarea
                rows={6}
                value={campaignForm.rules_text || ''}
                onChange={(e) => setCampaignForm((f) => ({ ...f, rules_text: e.target.value }))}
                placeholder="Se ficar vazio, um regulamento padrão completo será gerado automaticamente ao salvar."
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Deixe em branco para o sistema gerar o regulamento padrão ao salvar.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Exigir cadastro (LGPD)</p>
                <p className="text-xs text-muted-foreground">Pede nome, WhatsApp e aceite antes de jogar.</p>
              </div>
              <Switch checked={!!campaignForm.require_lead_capture} onCheckedChange={(v) => setCampaignForm((f) => ({ ...f, require_lead_capture: v }))} />
            </div>
            {campaignForm.require_lead_capture ? (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">Pedir também o CPF</p>
                  <Switch checked={!!campaignForm.require_document} onCheckedChange={(v) => setCampaignForm((f) => ({ ...f, require_document: v }))} />
                </div>
                <div>
                  <Label>Termos LGPD</Label>
                  <Textarea rows={3} value={campaignForm.lgpd_terms_text || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, lgpd_terms_text: e.target.value }))} />
                </div>
              </>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Sorteio ativo</p>
              <Switch checked={campaignForm.is_active !== false} onCheckedChange={(v) => setCampaignForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveCampaign} disabled={saving || !campaignForm.title}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de prêmio */}
      <Dialog open={prizeDialog} onOpenChange={setPrizeDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{prizeForm.id ? 'Editar prêmio' : 'Novo prêmio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do prêmio</Label>
              <Input value={prizeForm.name || ''} onChange={(e) => setPrizeForm((f) => ({ ...f, name: e.target.value }))} placeholder="Liquidificador Mondial" />
            </div>
            <div>
              <Label>Descrição / instruções de retirada</Label>
              <Textarea rows={3} value={prizeForm.description || ''} onChange={(e) => setPrizeForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <ImageField
              label="Foto do prêmio"
              hint="800 x 800 px (quadrada) · aparece na raspadinha e no voucher"
              value={prizeForm.image_url}
              uploading={uploading}
              aspect="aspect-square"
              onSelect={(file) => handleUpload(file, 'prize')}
              onClear={() => setPrizeForm((f) => ({ ...f, image_url: '' }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade total</Label>
                <Input type="number" min={0} value={prizeForm.total_quantity ?? 0} onChange={(e) => setPrizeForm((f) => ({ ...f, total_quantity: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Chance (%)</Label>
                <Input type="number" min={0} max={100} step="0.01" value={prizeForm.win_probability_percent as number} onChange={(e) => setPrizeForm((f) => ({ ...f, win_probability_percent: Number(e.target.value) }))} />
              </div>
            </div>
            {prizeForm.id ? (
              <div>
                <Label>Saldo restante</Label>
                <Input type="number" min={0} value={prizeForm.remaining_quantity ?? 0} onChange={(e) => setPrizeForm((f) => ({ ...f, remaining_quantity: Number(e.target.value) }))} />
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Prêmio ativo</p>
              <Switch checked={prizeForm.is_active !== false} onCheckedChange={(v) => setPrizeForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSavePrize} disabled={saving || !prizeForm.name}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar prêmio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
