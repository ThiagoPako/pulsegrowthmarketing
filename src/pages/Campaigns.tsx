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
import { Plus, Megaphone, Search, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NewCampaignDialog from '@/components/campaigns/NewCampaignDialog';
import { CAMPAIGN_TYPE_LABELS, CampaignStatus, formatBrDate } from '@/lib/campaignsUtils';
import { toast } from 'sonner';


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

export default function Campaigns() {
  const { clients } = useApp();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('todas');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (error) { toast.error('Erro ao carregar campanhas'); }
    setCampaigns((data as Campaign[]) || []);
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Campanhas</h1>
            <p className="text-sm text-muted-foreground">Planejamento estratégico por cliente</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> Nova campanha</Button>
      </div>

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

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhuma campanha encontrada. Clique em <b>Nova campanha</b> para começar.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card
              key={c.id}
              className="p-4 cursor-pointer hover:border-primary transition group relative"
              onClick={() => navigate(`/campanhas/${c.id}`)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold pr-6">{c.name}</h3>
                <Badge variant={c.status === 'ativa' ? 'default' : 'secondary'}>{c.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{clientById[c.client_id]?.companyName || '—'}</p>
              <p className="text-xs text-muted-foreground mt-1">{CAMPAIGN_TYPE_LABELS[c.type]}</p>
              <div className="mt-3 text-xs text-muted-foreground flex justify-between">
                <span>{formatBrDate(c.start_date)} → {formatBrDate(c.end_date)}</span>
                <span>{c.videos_qty}🎬 · {c.creatives_qty}🎨</span>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Apagar campanha"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar campanha?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso remove permanentemente <b>{c.name}</b> e todos os seus slots. Roteiros vinculados serão desassociados, mas não apagados.
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
          ))}
        </div>
      )}

      <NewCampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={load} />
    </div>
  );
}
