import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus, Megaphone, Search, Trash2, PlayCircle, Palette, BookOpen,
  Calendar, ArrowRight, BookMarked, Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NewCampaignDialog from '@/components/campaigns/NewCampaignDialog';
import { CAMPAIGN_TYPE_LABELS, CampaignStatus, formatBrDate } from '@/lib/campaignsUtils';
import { toast } from 'sonner';
import ClientLogo from '@/components/ClientLogo';

interface Campaign {
  id: string;
  client_id: string;
  name: string;
  type: keyof typeof CAMPAIGN_TYPE_LABELS;
  start_date: string;
  end_date: string;
  videos_qty: number;
  creatives_qty: number;
  status: CampaignStatus;
}

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  ativa:      { label: 'Ativa',      bg: 'bg-emerald-500/15', text: 'text-emerald-500', ring: 'ring-emerald-500/30' },
  rascunho:   { label: 'Rascunho',   bg: 'bg-muted',          text: 'text-muted-foreground', ring: 'ring-border' },
  concluida:  { label: 'Concluída',  bg: 'bg-blue-500/15',    text: 'text-blue-500',    ring: 'ring-blue-500/30' },
  arquivada:  { label: 'Arquivada',  bg: 'bg-zinc-500/15',    text: 'text-zinc-500',    ring: 'ring-zinc-500/30' },
};

export default function Campaigns() {
  const { clients } = useApp();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [slotCounts, setSlotCounts] = useState<Record<string, { done: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('todas');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (error) { toast.error('Erro ao carregar campanhas'); }
    const list = (data as Campaign[]) || [];
    setCampaigns(list);

    // Load slot counts for progress bars
    if (list.length > 0) {
      const ids = list.map(c => c.id);
      const { data: slots } = await supabase
        .from('campaign_slots')
        .select('campaign_id,status')
        .in('campaign_id', ids);
      const counts: Record<string, { done: number; total: number }> = {};
      (slots || []).forEach((s: any) => {
        if (!counts[s.campaign_id]) counts[s.campaign_id] = { done: 0, total: 0 };
        counts[s.campaign_id].total += 1;
        if (s.status === 'postado') counts[s.campaign_id].done += 1;
      });
      setSlotCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (campaignId: string, name: string) => {
    try {
      await supabase.from('campaign_slots').delete().eq('campaign_id', campaignId);
      const { error } = await supabase.from('campaigns').delete().eq('id', campaignId);
      if (error) throw error;
      toast.success(`Campanha "${name}" apagada`);
      setCampaigns(prev => prev.filter(c => c.id !== campaignId));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao apagar campanha');
    }
  };

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);

  const filtered = campaigns.filter(c => {
    if (filterStatus !== 'todas' && c.status !== filterStatus) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center ring-1 ring-primary/30">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
            <p className="text-sm text-muted-foreground">Planejamento estratégico por cliente</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Playbook — botão destacado com animação */}
          <button
            onClick={() => navigate('/treinamento/campanhas-playbook')}
            className="group relative overflow-hidden rounded-xl px-4 py-2.5 font-semibold text-sm text-white
              bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500
              shadow-[0_8px_24px_-8px_rgba(217,70,239,0.55)] hover:shadow-[0_12px_32px_-8px_rgba(217,70,239,0.7)]
              transition-all duration-300 hover:-translate-y-0.5"
          >
            {/* shimmer */}
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out
                bg-gradient-to-r from-transparent via-white/30 to-transparent"
            />
            {/* pulse ring */}
            <span className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 opacity-40 blur-md animate-pulse -z-10" />
            <span className="relative flex items-center gap-2">
              <BookMarked className="h-4 w-4" />
              Playbook Campanhas
              <Sparkles className="h-3.5 w-3.5 opacity-80 group-hover:rotate-12 transition-transform" />
            </span>
          </button>

          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova campanha
          </Button>
        </div>
      </div>

      {/* ─── Filtros ─── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome" className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="ativa">Ativas</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
            <SelectItem value="arquivada">Arquivadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Lista ─── */}
      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground border-dashed">
          <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma campanha encontrada.</p>
          <p className="text-xs mt-1">Clique em <b>Nova campanha</b> para começar.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const client = clientById[c.client_id];
            const counts = slotCounts[c.id] || { done: 0, total: c.videos_qty + c.creatives_qty };
            const progress = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
            const statusStyle = STATUS_STYLE[c.status] || STATUS_STYLE.rascunho;
            const accent = client?.color ? `hsl(${client.color})` : 'hsl(var(--primary))';

            return (
              <Card
                key={c.id}
                className="group relative overflow-hidden cursor-pointer transition-all duration-300
                  hover:-translate-y-1 hover:shadow-2xl border-border/60 hover:border-primary/40"
                onClick={() => navigate(`/campanhas/${c.id}`)}
                style={{ boxShadow: 'none' }}
              >
                {/* Faixa colorida do cliente */}
                <div className="h-1.5 w-full" style={{ background: accent }} />

                {/* Watermark do megafone */}
                <Megaphone
                  className="absolute -bottom-6 -right-6 h-32 w-32 pointer-events-none text-primary/[0.04] group-hover:text-primary/[0.08] transition-colors"
                  strokeWidth={1}
                />

                <div className="p-4 space-y-3 relative">
                  {/* Header do card: logo + nome + status */}
                  <div className="flex items-start gap-3">
                    {client ? (
                      <ClientLogo client={client} size="md" className="ring-2 ring-background shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
                        ?
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate leading-tight">{c.name}</h3>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {client?.companyName || '—'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
                    >
                      {statusStyle.label}
                    </span>
                  </div>

                  {/* Tipo */}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-primary" />
                    {CAMPAIGN_TYPE_LABELS[c.type]}
                  </div>

                  {/* Métricas: reels + artes */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5 rounded-lg bg-orange-500/10 text-orange-500 px-2.5 py-1.5 border border-orange-500/20">
                      <PlayCircle className="h-4 w-4" />
                      <span className="text-sm font-semibold">{c.videos_qty}</span>
                      <span className="text-[10px] uppercase tracking-wider opacity-80">Reels</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 px-2.5 py-1.5 border border-indigo-500/20">
                      <Palette className="h-4 w-4" />
                      <span className="text-sm font-semibold">{c.creatives_qty}</span>
                      <span className="text-[10px] uppercase tracking-wider opacity-80">Artes</span>
                    </div>
                  </div>

                  {/* Progresso */}
                  {counts.total > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="font-medium uppercase tracking-wider">Progresso</span>
                        <span className="font-bold">{counts.done}/{counts.total} · {progress}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${progress}%`,
                            background: `linear-gradient(90deg, ${accent}, hsl(var(--primary)))`,
                            boxShadow: `0 0 12px ${accent}88`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Rodapé: datas + CTA */}
                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatBrDate(c.start_date)} → {formatBrDate(c.end_date)}
                    </span>
                    <span className="flex items-center gap-0.5 text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Abrir <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>

                {/* Botão apagar — sempre visível */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 z-10 h-7 w-7 rounded-lg flex items-center justify-center
                        bg-background/80 backdrop-blur border border-border/60
                        text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10
                        transition-all opacity-70 group-hover:opacity-100"
                      title="Apagar campanha"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apagar campanha?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso remove permanentemente <b>{c.name}</b> e todos os seus slots.
                        Roteiros vinculados serão desassociados, mas não apagados.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(c.id, c.name)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Apagar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Card>
            );
          })}
        </div>
      )}

      <NewCampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={load} />
    </div>
  );
}
