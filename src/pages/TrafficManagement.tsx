import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import ClientLogo from '@/components/ClientLogo';
import { 
  Megaphone, Search, Filter, Play, Pause, Calendar, Plus, Eye, 
  TrendingUp, Target, Palette, Film, Image, Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Campaign {
  id: string;
  client_id: string;
  design_task_id: string | null;
  content_task_id: string | null;
  title: string;
  content_type: string;
  campaign_start_date: string | null;
  campaign_end_date: string | null;
  status: string;
  budget: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ApprovedCreative {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  edited_video_link: string | null;
  drive_link: string | null;
  approved_at: string | null;
  kanban_column: string;
  created_at: string;
}

const CONTENT_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  criativo: { label: 'Criativo', icon: Palette, color: 'text-cyan-400' },
  reels: { label: 'Reels', icon: Film, color: 'text-pink-400' },
  story: { label: 'Story', icon: Sparkles, color: 'text-amber-400' },
  feed: { label: 'Feed', icon: Image, color: 'text-blue-400' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Ativo', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/20' },
  pausado: { label: 'Pausado', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/20' },
  finalizado: { label: 'Finalizado', color: 'text-muted-foreground', bg: 'bg-muted/30 border-muted/20' },
};

export default function TrafficManagement() {
  const { clients } = useApp();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [approvedCreatives, setApprovedCreatives] = useState<ApprovedCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState<ApprovedCreative | null>(null);
  const [tab, setTab] = useState<'campaigns' | 'creatives'>('creatives');

  const [form, setForm] = useState({
    clientId: '',
    title: '',
    contentType: 'criativo',
    startDate: '',
    endDate: '',
    budget: '',
    notes: '',
    designTaskId: '' as string,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [campaignsRes, creativesRes] = await Promise.all([
      supabase.from('traffic_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('content_tasks')
        .select('id, client_id, title, content_type, edited_video_link, drive_link, approved_at, kanban_column, created_at')
        .eq('content_type', 'criativo')
        .order('created_at', { ascending: false }),
    ]);

    if (campaignsRes.data) setCampaigns(campaignsRes.data as Campaign[]);
    if (creativesRes.data) setApprovedCreatives(creativesRes.data as ApprovedCreative[]);
    setLoading(false);
  };

  const filteredCampaigns = useMemo(() => {
    let result = campaigns;
    if (filterClient !== 'all') result = result.filter(c => c.client_id === filterClient);
    if (filterStatus !== 'all') result = result.filter(c => c.status === filterStatus);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c => c.title.toLowerCase().includes(term));
    }
    return result;
  }, [campaigns, filterClient, filterStatus, searchTerm]);

  const filteredCreatives = useMemo(() => {
    let result = approvedCreatives;
    if (filterClient !== 'all') result = result.filter(c => c.client_id === filterClient);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c => c.title.toLowerCase().includes(term));
    }
    return result;
  }, [approvedCreatives, filterClient, searchTerm]);

  const handleCreateCampaign = async () => {
    if (!form.clientId || !form.title) {
      toast.error('Preencha o cliente e o título');
      return;
    }
    const { error } = await supabase.from('traffic_campaigns').insert({
      client_id: form.clientId,
      title: form.title,
      content_type: form.contentType,
      campaign_start_date: form.startDate || null,
      campaign_end_date: form.endDate || null,
      budget: form.budget ? parseFloat(form.budget) : 0,
      notes: form.notes || null,
      design_task_id: form.designTaskId || null,
      created_by: user?.id || null,
    } as any);

    if (error) {
      console.error('Error creating campaign:', error);
      toast.error('Erro ao criar campanha');
      return;
    }

    toast.success('Campanha criada!');
    setShowCreateDialog(false);
    setForm({ clientId: '', title: '', contentType: 'criativo', startDate: '', endDate: '', budget: '', notes: '', designTaskId: '' });
    loadData();
  };

  const handleToggleStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === 'ativo' ? 'pausado' : 'ativo';
    await supabase.from('traffic_campaigns').update({ status: newStatus, updated_at: new Date().toISOString() } as any).eq('id', campaign.id);
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c));
    toast.success(`Campanha ${newStatus === 'ativo' ? 'ativada' : 'pausada'}`);
  };

  const handleCreateFromCreative = (creative: ApprovedCreative) => {
    const client = clients.find(c => c.id === creative.client_id);
    setForm({
      clientId: creative.client_id,
      title: `Campanha - ${creative.title}`,
      contentType: creative.format_type || 'criativo',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      budget: '',
      notes: '',
      designTaskId: creative.id,
    });
    setShowCreateDialog(true);
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClientObj = (id: string) => clients.find(c => c.id === id);

  const activeCampaignsCount = campaigns.filter(c => c.status === 'ativo').length;
  const totalBudget = campaigns.filter(c => c.status === 'ativo').reduce((sum, c) => sum + (c.budget || 0), 0);

  // Check which creatives are already in a campaign
  const creativesInCampaign = new Set(campaigns.filter(c => c.design_task_id).map(c => c.design_task_id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Megaphone className="text-primary" size={24} /> Gestão de Tráfego
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie criativos e campanhas de tráfego pago</p>
        </div>
        <Button onClick={() => { setForm({ clientId: '', title: '', contentType: 'criativo', startDate: '', endDate: '', budget: '', notes: '', designTaskId: '' }); setShowCreateDialog(true); }}>
          <Plus size={16} className="mr-2" /> Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-primary">{activeCampaignsCount}</p>
          <p className="text-xs text-muted-foreground">Campanhas Ativas</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-500">{campaigns.length}</p>
          <p className="text-xs text-muted-foreground">Total Campanhas</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{approvedCreatives.length}</p>
          <p className="text-xs text-muted-foreground">Criativos Aprovados</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-cyan-500">
            {totalBudget > 0 ? `R$ ${totalBudget.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Budget Ativo</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/30 border border-border w-fit">
        {([['creatives', '🎨 Criativos Aprovados'], ['campaigns', '📊 Campanhas']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
          </SelectContent>
        </Select>
        {tab === 'campaigns' && (
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="pausado">Pausado</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : tab === 'creatives' ? (
        /* Approved Creatives Grid */
        filteredCreatives.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted-foreground">
            <Palette size={40} className="mx-auto mb-3 opacity-50" />
            <p>Nenhum criativo aprovado encontrado</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCreatives.map(creative => {
              const clientObj = getClientObj(creative.client_id);
              const isInCampaign = creativesInCampaign.has(creative.id);
              const typeConfig = CONTENT_TYPE_CONFIG[creative.format_type] || CONTENT_TYPE_CONFIG.criativo;
              const Icon = typeConfig.icon;

              return (
                <div key={creative.id} className="glass-card p-4 flex flex-col gap-3" style={{ borderLeftWidth: 4, borderLeftColor: clientObj ? `hsl(${clientObj.color})` : undefined }}>
                  {/* Preview */}
                  {(creative.mockup_url || creative.attachment_url) && (
                    <div className="relative h-32 rounded-lg overflow-hidden bg-muted/30">
                      <img src={creative.mockup_url || creative.attachment_url || ''} alt={creative.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {clientObj && <ClientLogo client={clientObj} size="sm" className="w-5 h-5 text-[8px] rounded" />}
                        <p className="font-medium text-sm truncate">{creative.title}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate ml-6">
                        {getClientName(creative.client_id)} · <Icon size={10} className={`inline ${typeConfig.color}`} /> {typeConfig.label}
                      </p>
                    </div>
                    {isInCampaign && (
                      <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20">Em Campanha</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-auto pt-2 border-t border-border">
                    {creative.client_approved_at && (
                      <span className="text-[10px] text-muted-foreground">
                        Aprovado em {format(new Date(creative.client_approved_at), "dd/MM/yy", { locale: pt })}
                      </span>
                    )}
                    <Button variant="outline" size="sm" className="ml-auto gap-1 text-xs" onClick={() => handleCreateFromCreative(creative)} disabled={isInCampaign}>
                      <TrendingUp size={12} /> {isInCampaign ? 'Já em campanha' : 'Criar Campanha'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Campaigns List */
        filteredCampaigns.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted-foreground">
            <Target size={40} className="mx-auto mb-3 opacity-50" />
            <p>Nenhuma campanha encontrada</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredCampaigns.map(campaign => {
              const clientObj = getClientObj(campaign.client_id);
              const statusCfg = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.ativo;
              const typeConfig = CONTENT_TYPE_CONFIG[campaign.content_type] || CONTENT_TYPE_CONFIG.criativo;
              const Icon = typeConfig.icon;

              return (
                <div key={campaign.id} className="glass-card p-4 flex items-center gap-4" style={{ borderLeftWidth: 4, borderLeftColor: clientObj ? `hsl(${clientObj.color})` : undefined }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {clientObj && <ClientLogo client={clientObj} size="sm" className="w-6 h-6 text-[9px] rounded" />}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{campaign.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {getClientName(campaign.client_id)} · <Icon size={10} className={`inline ${typeConfig.color}`} /> {typeConfig.label}
                        </p>
                      </div>
                    </div>
                  </div>

                  {campaign.campaign_start_date && (
                    <div className="text-center shrink-0">
                      <p className="text-[10px] text-muted-foreground">Início</p>
                      <p className="text-xs font-medium">{format(new Date(campaign.campaign_start_date + 'T12:00:00'), "dd/MM/yy")}</p>
                    </div>
                  )}

                  {campaign.budget > 0 && (
                    <div className="text-center shrink-0">
                      <p className="text-[10px] text-muted-foreground">Budget</p>
                      <p className="text-xs font-medium text-emerald-500">R$ {campaign.budget.toLocaleString('pt-BR')}</p>
                    </div>
                  )}

                  <Badge variant="outline" className={`text-[10px] ${statusCfg.bg} ${statusCfg.color}`}>
                    {statusCfg.label}
                  </Badge>

                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleStatus(campaign)} title={campaign.status === 'ativo' ? 'Pausar' : 'Ativar'}>
                    {campaign.status === 'ativo' ? <Pause size={14} /> : <Play size={14} />}
                  </Button>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Create Campaign Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Campanha de Tráfego</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Select value={form.clientId} onValueChange={v => setForm({ ...form, clientId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: `hsl(${c.color})` }} />
                        {c.companyName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Título da Campanha *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Black Friday 2026" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Conteúdo</Label>
                <Select value={form.contentType} onValueChange={v => setForm({ ...form, contentType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="criativo">Criativo</SelectItem>
                    <SelectItem value="reels">Reels</SelectItem>
                    <SelectItem value="story">Story</SelectItem>
                    <SelectItem value="feed">Feed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Budget (R$)</Label>
                <Input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data de Início</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Data de Término</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas sobre a campanha..." rows={3} />
            </div>

            <Button onClick={handleCreateCampaign} className="w-full">Criar Campanha</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
