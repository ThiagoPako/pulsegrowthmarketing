import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import ClientLogo from '@/components/ClientLogo';
import { Megaphone, Search, Play, Pause, Palette, Flame, Zap, Eye, RefreshCw, Send, MessageSquare, Download } from 'lucide-react';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';

interface Creative {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  edited_video_link: string | null;
  drive_link: string | null;
  approved_at: string | null;
  kanban_column: string;
  created_at: string;
  description: string | null;
  script_id: string | null;
  recording_id: string | null;
  assigned_to: string | null;
  adjustment_notes: string | null;
}

interface Campaign {
  id: string;
  client_id: string;
  design_task_id: string | null;
  title: string;
  status: string;
}

export default function TrafficManagement() {
  const { clients, users } = useApp();
  const { user } = useAuth();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Alteration dialog
  const [alterationDialogOpen, setAlterationDialogOpen] = useState(false);
  const [alterationCreative, setAlterationCreative] = useState<Creative | null>(null);
  const [alterationNotes, setAlterationNotes] = useState('');

  // Story request dialog
  const [storyDialogOpen, setStoryDialogOpen] = useState(false);
  const [storyCreative, setStoryCreative] = useState<Creative | null>(null);
  const [storyNotes, setStoryNotes] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [creativesRes, campaignsRes] = await Promise.all([
      supabase.from('content_tasks')
        .select('id, client_id, title, content_type, edited_video_link, drive_link, approved_at, kanban_column, created_at, description, script_id, recording_id, assigned_to, adjustment_notes')
        .eq('content_type', 'criativo')
        .not('approved_at', 'is', null)
        .order('created_at', { ascending: false }),
      supabase.from('traffic_campaigns').select('id, client_id, design_task_id, title, status').order('created_at', { ascending: false }),
    ]);
    if (creativesRes.data) setCreatives(creativesRes.data as Creative[]);
    if (campaignsRes.data) setCampaigns(campaignsRes.data as Campaign[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = creatives;
    if (filterClient !== 'all') result = result.filter(c => c.client_id === filterClient);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c => c.title.toLowerCase().includes(term));
    }
    return result;
  }, [creatives, filterClient, searchTerm]);

  const getCampaignForCreative = (creativeId: string) =>
    campaigns.find(c => c.design_task_id === creativeId);

  const isActive = (creativeId: string) => {
    const camp = getCampaignForCreative(creativeId);
    return camp?.status === 'ativo';
  };

  const handleToggleCampaign = async (creative: Creative) => {
    setTogglingIds(prev => new Set(prev).add(creative.id));
    const existing = getCampaignForCreative(creative.id);

    try {
      if (!existing) {
        const { error } = await supabase.from('traffic_campaigns').insert({
          client_id: creative.client_id,
          design_task_id: creative.id,
          title: creative.title,
          content_type: 'criativo',
          status: 'ativo',
          campaign_start_date: new Date().toISOString().split('T')[0],
          created_by: user?.id || null,
        } as any);
        if (error) throw error;
        toast.success('Campanha ativada!');
      } else {
        const newStatus = existing.status === 'ativo' ? 'pausado' : 'ativo';
        const { error } = await supabase.from('traffic_campaigns')
          .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
          .eq('id', existing.id);
        if (error) throw error;
        toast.success(newStatus === 'ativo' ? 'Campanha reativada!' : 'Campanha pausada');
      }
      await loadData();
    } catch {
      toast.error('Erro ao atualizar campanha');
    } finally {
      setTogglingIds(prev => { const s = new Set(prev); s.delete(creative.id); return s; });
    }
  };

  // Send criativo back to alteração
  const handleSendToAlteration = async () => {
    if (!alterationCreative || !alterationNotes.trim()) {
      toast.error('Descreva o que precisa ser alterado');
      return;
    }
    try {
      const { error } = await supabase.from('content_tasks').update({
        kanban_column: 'alteracao',
        adjustment_notes: alterationNotes.trim(),
        approved_at: null,
        updated_at: new Date().toISOString(),
      } as any).eq('id', alterationCreative.id);
      if (error) throw error;

      // Sync with delivery system
      const client = clients.find(c => c.id === alterationCreative.client_id);
      const ctx = buildSyncContext(alterationCreative as any, client as any);
      await syncContentTaskColumnChange('alteracao', ctx);

      toast.success('Criativo enviado para alteração');
      setAlterationDialogOpen(false);
      setAlterationNotes('');
      setAlterationCreative(null);
      await loadData();
    } catch {
      toast.error('Erro ao enviar para alteração');
    }
  };

  // Rayssa (Social Media) - always assigned to story tasks
  const RAYSSA_ID = '13be1a49-2856-4adc-94b7-6efc2c797330';

  // Request social media to post story with this criativo
  const handleRequestStory = async () => {
    if (!storyCreative) return;
    try {
      // Create a new content_task of type 'story' assigned to Rayssa
      const { data: inserted, error } = await supabase.from('content_tasks').insert({
        client_id: storyCreative.client_id,
        title: `Story - ${storyCreative.title}`,
        content_type: 'story',
        kanban_column: 'agendamentos',
        description: `Story solicitado pelo gestor de tráfego a partir do criativo "${storyCreative.title}".${storyNotes ? `\n\nObservações: ${storyNotes}` : ''}`,
        edited_video_link: storyCreative.edited_video_link,
        drive_link: storyCreative.drive_link,
        created_by: user?.id || null,
        assigned_to: RAYSSA_ID,
        position: 0,
      } as any).select('id').single();
      if (error) throw error;

      const taskId = inserted?.id || '';
      const clientName = clients.find(c => c.id === storyCreative.client_id)?.companyName || '';

      // Also create social_media_deliveries entry so it appears in SM kanban
      await supabase.from('social_media_deliveries').insert({
        client_id: storyCreative.client_id,
        content_type: 'story',
        title: `Story - ${storyCreative.title}`,
        description: `Story solicitado pelo tráfego. Criativo: "${storyCreative.title}".${storyNotes ? ` Obs: ${storyNotes}` : ''}`,
        delivered_at: new Date().toISOString().split('T')[0],
        status: 'entregue',
        created_by: user?.id || null,
        content_task_id: taskId || null,
      } as any);

      // Notify Rayssa directly
      await supabase.rpc('notify_user', {
        _user_id: RAYSSA_ID,
        _title: '📢 Story para postar!',
        _message: `Postar story do criativo "${storyCreative.title}" - ${clientName}. Baixe o vídeo e poste!`,
        _type: 'info',
        _link: `/conteudo?highlight=${taskId}`,
      });

      toast.success('Solicitação de story enviada para Social Media!');
      setStoryDialogOpen(false);
      setStoryNotes('');
      setStoryCreative(null);
    } catch {
      toast.error('Erro ao solicitar story');
    }
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClientObj = (id: string) => clients.find(c => c.id === id);
  const activeCount = creatives.filter(c => isActive(c.id)).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Megaphone className="text-primary" size={24} /> Gestão de Tráfego
          </h1>
          <p className="text-sm text-muted-foreground">Criativos aprovados — gerencie campanhas, alterações e stories</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1 text-xs font-medium">
              {/* Meta logo */}
              <svg viewBox="0 0 287.56 191" className="h-4 w-4" aria-label="Meta">
                <defs>
                  <linearGradient id="metaGradA" x1="62.34" y1="101.45" x2="260.34" y2="91.45" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#0064e1"/><stop offset=".4" stopColor="#0064e1"/><stop offset=".83" stopColor="#0073ee"/><stop offset="1" stopColor="#0082fb"/>
                  </linearGradient>
                  <linearGradient id="metaGradB" x1="41.42" y1="53" x2="41.42" y2="126" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#0082fb"/><stop offset="1" stopColor="#0064e0"/>
                  </linearGradient>
                </defs>
                <path fill="#0081fb" d="M31.06,126c0,11,2.41,19.41,5.56,24.51A19,19,0,0,0,53.19,160c8.1,0,15.51-2,29.79-21.76,11.44-15.83,24.92-38,34-52l15.36-23.6c10.67-16.39,23-34.61,37.18-47C181.07,5.6,193.54,0,206.09,0c21.07,0,41.14,12.21,56.5,35.11,16.81,25.08,25,56.67,25,89.27,0,19.38-3.82,33.62-10.32,44.87C271,180.13,258.72,191,238.13,191V160c17.63,0,22-16.2,22-34.74,0-26.42-6.16-55.74-19.73-76.69-9.63-14.86-22.11-23.94-35.84-23.94-14.85,0-26.8,11.2-40.23,31.17-7.14,10.61-14.47,23.54-22.7,38.13l-9.06,16C114.14,140.29,109.5,146.68,100.32,159c-16.09,21.44-29.83,29.53-47.13,29.53-21.27,0-34.72-9.21-43-23.09C3.34,154.15,0,139.55,0,122.87Z"/>
                <path fill="url(#metaGradA)" d="M24.49,37.3C38.73,15.35,59.28,0,82.85,0c13.65,0,27.22,4,41.39,15.61,15.5,12.65,32,33.48,52.63,67.81l7.39,12.32c17.84,29.72,28,45,33.93,52.22,7.64,9.26,13,12,19.94,12,17.63,0,22-16.2,22-34.74l27.4-.86c0,19.38-3.82,33.62-10.32,44.87C271,180.13,258.72,191,238.13,191c-12.8,0-24.14-2.78-36.68-14.61-9.64-9.08-20.91-25.21-29.58-39.71L146.08,93.6c-12.94-21.62-24.81-37.74-31.68-45C107,40.71,97.51,31.23,82.35,31.23c-12.27,0-22.69,8.61-31.41,21.78Z"/>
                <path fill="url(#metaGradB)" d="M82.35,31.23c-12.27,0-22.69,8.61-31.41,21.78C38.61,71.62,31.06,99.34,31.06,126c0,11,2.41,19.41,5.56,24.51L10.14,167.71C3.34,154.15,0,139.55,0,122.87,0,92.05,8.46,60,24.49,37.3,38.73,15.35,59.28,0,82.85,0Z"/>
              </svg>
              Meta Ads
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1 text-xs font-medium">
              {/* Google Ads logo */}
              <svg viewBox="0 0 192 192" className="h-4 w-4" aria-label="Google Ads">
                <path fill="#FBBC04" d="M63.98 15.63A24 24 0 0 1 96 23.99L23.99 148.72a24 24 0 0 1-42-23.98L54 0.01Z" transform="translate(0 21.4)"/>
                <path fill="#4285F4" d="M128.02 15.63A24 24 0 0 0 96 23.99l72 124.73a24 24 0 0 0 42-23.98L138 0.01Z" transform="translate(-24 21.4)"/>
                <circle fill="#34A853" cx="48" cy="156" r="24"/>
              </svg>
              Google Ads
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5 border-emerald-500/30 text-emerald-500">
            <Flame size={14} /> {activeCount} ativa{activeCount !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
            <Palette size={14} /> {creatives.length} criativo{creatives.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar criativo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Palette size={40} className="mx-auto mb-3 opacity-50" />
          <p>Nenhum criativo aprovado encontrado</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(creative => {
              const clientObj = getClientObj(creative.client_id);
              const active = isActive(creative.id);
              const toggling = togglingIds.has(creative.id);
              const campaign = getCampaignForCreative(creative.id);
              const isPaused = campaign?.status === 'pausado';

              return (
                <motion.div
                  key={creative.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative"
                >
                  {/* Fire glow effect for active campaigns */}
                  {active && (
                    <div className="absolute -inset-[1px] rounded-2xl overflow-hidden pointer-events-none z-0">
                      <motion.div
                        className="absolute inset-0 rounded-2xl"
                        style={{
                          background: 'linear-gradient(135deg, hsl(142 71% 45% / 0.4), hsl(142 71% 45% / 0.1), hsl(45 93% 47% / 0.3), hsl(142 71% 45% / 0.4))',
                          backgroundSize: '300% 300%',
                        }}
                        animate={{
                          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                  )}

                  <div className={`relative z-10 rounded-2xl p-4 flex flex-col gap-3 border transition-all duration-500 ${
                    active
                      ? 'bg-emerald-500/5 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                      : 'bg-card border-border hover:border-primary/20'
                  }`}>
                    {/* Active fire particles */}
                    {active && (
                      <div className="absolute top-2 right-2 flex gap-0.5">
                        {[0, 1, 2].map(i => (
                          <motion.div
                            key={i}
                            animate={{
                              y: [0, -6, -12, -6, 0],
                              opacity: [0.8, 1, 0.6, 1, 0.8],
                              scale: [1, 1.2, 0.9, 1.1, 1],
                            }}
                            transition={{
                              duration: 1.5,
                              repeat: Infinity,
                              delay: i * 0.3,
                            }}
                          >
                            <Flame size={12} className="text-emerald-500" />
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex items-start gap-2.5">
                      {clientObj && (
                        <ClientLogo client={clientObj} size="sm" className="w-8 h-8 text-[9px] rounded-lg shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{creative.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {getClientName(creative.client_id)}
                        </p>
                      </div>
                    </div>

                    {/* Video link + Download */}
                    {creative.edited_video_link && (
                      <div className="flex items-center gap-2">
                        <a
                          href={creative.edited_video_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-primary hover:underline"
                        >
                          <Eye size={12} /> Ver criativo
                        </a>
                        <a
                          href={creative.edited_video_link}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
                          title="Baixar criativo"
                        >
                          <Download size={12} /> Baixar
                        </a>
                      </div>
                    )}

                    {/* Status badge */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        ✓ Aprovado
                      </Badge>
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {creative.kanban_column.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Action Buttons: Traffic manager exclusive */}
                    <div className="flex gap-2 mt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                        onClick={() => {
                          setAlterationCreative(creative);
                          setAlterationNotes('');
                          setAlterationDialogOpen(true);
                        }}
                      >
                        <RefreshCw size={12} /> Alteração
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs gap-1.5 border-pink-500/30 text-pink-600 hover:bg-pink-500/10"
                        onClick={() => {
                          setStoryCreative(creative);
                          setStoryNotes('');
                          setStoryDialogOpen(true);
                        }}
                      >
                        <Send size={12} /> Story
                      </Button>
                    </div>

                    {/* Toggle Campaign Button */}
                    <motion.button
                      onClick={() => handleToggleCampaign(creative)}
                      disabled={toggling}
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ scale: 1.02 }}
                      className={`relative w-full mt-auto rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-300 overflow-hidden border ${
                        active
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/20'
                          : isPaused
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
                            : 'bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 hover:border-primary/40'
                      }`}
                    >
                      <motion.div
                        className="absolute inset-0 rounded-xl opacity-0 pointer-events-none"
                        style={{
                          boxShadow: active
                            ? '0 0 15px hsl(142 71% 45% / 0.3), inset 0 0 15px hsl(142 71% 45% / 0.1)'
                            : '0 0 15px hsl(var(--primary) / 0.3), inset 0 0 15px hsl(var(--primary) / 0.1)',
                        }}
                        animate={{ opacity: [0, 0.6, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />

                      {toggling ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Zap size={16} />
                        </motion.div>
                      ) : active ? (
                        <>
                          <Pause size={16} />
                          Pausar Campanha
                        </>
                      ) : isPaused ? (
                        <>
                          <Play size={16} />
                          Reativar Campanha
                        </>
                      ) : (
                        <>
                          <Flame size={16} />
                          Ativar Campanha
                        </>
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Alteration Dialog */}
      <Dialog open={alterationDialogOpen} onOpenChange={setAlterationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw size={18} className="text-amber-500" />
              Enviar para Alteração
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Criativo: <span className="font-medium text-foreground">{alterationCreative?.title}</span>
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">O que precisa ser alterado?</label>
              <Textarea
                value={alterationNotes}
                onChange={e => setAlterationNotes(e.target.value)}
                placeholder="Descreva as alterações necessárias..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlterationDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSendToAlteration}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              disabled={!alterationNotes.trim()}
            >
              <RefreshCw size={14} className="mr-1.5" /> Enviar para Alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Story Request Dialog */}
      <Dialog open={storyDialogOpen} onOpenChange={setStoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={18} className="text-pink-500" />
              Solicitar Story
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Criativo: <span className="font-medium text-foreground">{storyCreative?.title}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Um card de story será criado automaticamente na fila da Social Media com o material deste criativo.
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Observações (opcional)</label>
              <Textarea
                value={storyNotes}
                onChange={e => setStoryNotes(e.target.value)}
                placeholder="Instruções para o story..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoryDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleRequestStory}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Send size={14} className="mr-1.5" /> Solicitar Story
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
