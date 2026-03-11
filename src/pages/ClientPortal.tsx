import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Play, Pause, Maximize, Check, MessageSquare, X, ChevronLeft, ChevronRight, BarChart3, Send, Clock, Film, Image, Palette, Video, Award } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reel: 'Reel', criativo: 'Criativo', institucional: 'Institucional', anuncio: 'Anúncio', arte: 'Arte',
};
const CONTENT_TYPE_ICONS: Record<string, any> = {
  reel: Film, criativo: Palette, institucional: Video, anuncio: Video, arte: Image,
};
const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Aprovado', ajuste_solicitado: 'Ajuste Solicitado',
};

interface PortalContent {
  id: string; client_id: string; title: string; content_type: string;
  season_month: number; season_year: number; file_url: string | null;
  thumbnail_url: string | null; duration_seconds: number; status: string;
  approved_at: string | null; created_at: string;
}
interface PortalComment {
  id: string; content_id: string; author_name: string; author_type: string;
  message: string; created_at: string;
}
interface ClientData {
  id: string; company_name: string; logo_url: string | null; color: string;
  weekly_reels: number; weekly_creatives: number; weekly_stories: number;
  monthly_recordings: number; plan_id: string | null;
}

export default function ClientPortal() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<ClientData | null>(null);
  const [contents, setContents] = useState<PortalContent[]>([]);
  const [selectedContent, setSelectedContent] = useState<PortalContent | null>(null);
  const [comments, setComments] = useState<PortalComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [showMetrics, setShowMetrics] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [showAdjustment, setShowAdjustment] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  useEffect(() => {
    if (!clientId) return;
    loadData();
  }, [clientId]);

  const loadData = async () => {
    if (!clientId) return;
    setLoading(true);
    const [clientRes, contentsRes] = await Promise.all([
      supabase.from('clients').select('id, company_name, logo_url, color, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id').eq('id', clientId).single(),
      supabase.from('client_portal_contents').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);
    if (clientRes.data) setClient(clientRes.data as ClientData);
    if (contentsRes.data) setContents(contentsRes.data as PortalContent[]);
    setLoading(false);
  };

  const loadComments = async (contentId: string) => {
    const { data } = await supabase.from('client_portal_comments').select('*').eq('content_id', contentId).order('created_at', { ascending: true });
    if (data) setComments(data as PortalComment[]);
  };

  const handleSelectContent = (content: PortalContent) => {
    setSelectedContent(content);
    setShowAdjustment(false);
    setAdjustmentNote('');
    loadComments(content.id);
  };

  const handleApprove = async () => {
    if (!selectedContent) return;
    await supabase.from('client_portal_contents').update({ status: 'aprovado', approved_at: new Date().toISOString() }).eq('id', selectedContent.id);
    setContents(prev => prev.map(c => c.id === selectedContent.id ? { ...c, status: 'aprovado', approved_at: new Date().toISOString() } : c));
    setSelectedContent(prev => prev ? { ...prev, status: 'aprovado' } : null);
    toast.success('Conteúdo aprovado com sucesso!');
  };

  const handleRequestAdjustment = async () => {
    if (!selectedContent || !adjustmentNote.trim()) return;
    await Promise.all([
      supabase.from('client_portal_contents').update({ status: 'ajuste_solicitado' }).eq('id', selectedContent.id),
      supabase.from('client_portal_comments').insert({ content_id: selectedContent.id, author_name: client?.company_name || 'Cliente', author_type: 'client', message: `🔧 Ajuste solicitado: ${adjustmentNote}` }),
    ]);
    setContents(prev => prev.map(c => c.id === selectedContent.id ? { ...c, status: 'ajuste_solicitado' } : c));
    setSelectedContent(prev => prev ? { ...prev, status: 'ajuste_solicitado' } : null);
    setShowAdjustment(false);
    setAdjustmentNote('');
    loadComments(selectedContent.id);
    toast.success('Ajuste solicitado com sucesso!');
  };

  const handleSendComment = async () => {
    if (!selectedContent || !newComment.trim()) return;
    await supabase.from('client_portal_comments').insert({ content_id: selectedContent.id, author_name: client?.company_name || 'Cliente', author_type: 'client', message: newComment });
    setNewComment('');
    loadComments(selectedContent.id);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) { videoRef.current.pause(); } else { videoRef.current.play(); }
    setIsPlaying(!isPlaying);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else videoRef.current.requestFullscreen();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Group contents by season
  const seasons = contents.reduce((acc, c) => {
    const key = `${c.season_year}-${c.season_month}`;
    if (!acc[key]) acc[key] = { month: c.season_month, year: c.season_year, items: [] };
    acc[key].items.push(c);
    return acc;
  }, {} as Record<string, { month: number; year: number; items: PortalContent[] }>);

  const sortedSeasons = Object.values(seasons).sort((a, b) => b.year - a.year || b.month - a.month);

  // Metrics for selected month
  const monthContents = contents.filter(c => c.season_month === selectedMonth && c.season_year === selectedYear);
  const reelsCount = monthContents.filter(c => c.content_type === 'reel').length;
  const creativosCount = monthContents.filter(c => c.content_type === 'criativo').length;
  const artesCount = monthContents.filter(c => c.content_type === 'arte').length;
  const videosCount = monthContents.filter(c => ['institucional', 'anuncio'].includes(c.content_type)).length;
  const approvedCount = monthContents.filter(c => c.status === 'aprovado').length;
  const totalDelivered = monthContents.length;

  // Contracted (weekly * 4)
  const contractedReels = (client?.weekly_reels || 0) * 4;
  const contractedCreatives = (client?.weekly_creatives || 0) * 4;
  const contractedRecordings = client?.monthly_recordings || 4;

  const clientColor = client?.color || '217 91% 60%';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-pulse text-white/60 text-lg">Carregando...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-white/60">Cliente não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {client.logo_url ? (
              <img src={client.logo_url} alt={client.company_name} className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: `hsl(${clientColor})` }}>
                {client.company_name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold">{client.company_name}</h1>
              <p className="text-xs text-white/50">Área de Conteúdos</p>
            </div>
          </div>
          <button onClick={() => setShowMetrics(!showMetrics)} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105" style={{ background: `hsl(${clientColor})` }}>
            <BarChart3 size={16} />
            Métricas
          </button>
        </div>
      </header>

      {/* Metrics Dashboard */}
      {showMetrics && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2"><Award size={22} /> Relatório do Mês</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); } else setSelectedMonth(m => m - 1); }} className="p-1 rounded hover:bg-white/10"><ChevronLeft size={18} /></button>
                <span className="text-sm font-medium min-w-[140px] text-center">
                  {format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: pt })}
                </span>
                <button onClick={() => { if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); } else setSelectedMonth(m => m + 1); }} className="p-1 rounded hover:bg-white/10"><ChevronRight size={18} /></button>
              </div>
            </div>

            {/* Overall delivery percentage */}
            {contractedReels > 0 && (
              <div className="text-center py-4">
                <div className="text-5xl font-black" style={{ color: `hsl(${clientColor})` }}>
                  {contractedReels > 0 ? Math.round((totalDelivered / contractedReels) * 100) : 0}%
                </div>
                <p className="text-white/60 text-sm mt-1">do pacote entregue</p>
              </div>
            )}

            {/* Metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Reels', value: reelsCount, contracted: contractedReels, icon: Film },
                { label: 'Criativos', value: creativosCount, contracted: contractedCreatives, icon: Palette },
                { label: 'Artes', value: artesCount, contracted: 0, icon: Image },
                { label: 'Vídeos', value: videosCount, contracted: 0, icon: Video },
              ].map(metric => {
                const pct = metric.contracted > 0 ? Math.round((metric.value / metric.contracted) * 100) : 0;
                return (
                  <div key={metric.label} className="bg-white/5 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-white/70">
                      <metric.icon size={16} />
                      <span className="text-sm font-medium">{metric.label}</span>
                    </div>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    {metric.contracted > 0 && (
                      <>
                        <Progress value={Math.min(pct, 100)} className="h-2 bg-white/10" />
                        <p className="text-xs text-white/50">
                          {metric.value}/{metric.contracted} contratados •{' '}
                          <span style={{ color: pct >= 100 ? '#22c55e' : `hsl(${clientColor})` }} className="font-semibold">{pct}%</span>
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-white/70 text-sm">Aprovados</p>
                <p className="text-2xl font-bold text-green-400">{approvedCount}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-white/70 text-sm">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-400">{monthContents.filter(c => c.status === 'pendente').length}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-white/70 text-sm">Em Ajuste</p>
                <p className="text-2xl font-bold text-orange-400">{monthContents.filter(c => c.status === 'ajuste_solicitado').length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Rows by Season */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 space-y-10">
        {sortedSeasons.length === 0 && (
          <div className="text-center py-20 text-white/40">
            <Film size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhum conteúdo disponível ainda.</p>
            <p className="text-sm mt-2">Os conteúdos aparecerão aqui assim que forem publicados pela equipe.</p>
          </div>
        )}

        {sortedSeasons.map(season => {
          const seasonLabel = format(new Date(season.year, season.month - 1), "MMMM yyyy", { locale: pt });
          return (
            <section key={`${season.year}-${season.month}`}>
              <h2 className="text-xl font-bold mb-4 capitalize flex items-center gap-2">
                <span className="w-1 h-6 rounded-full" style={{ background: `hsl(${clientColor})` }} />
                Temporada {seasonLabel}
                <span className="text-sm font-normal text-white/40 ml-2">{season.items.length} conteúdos</span>
              </h2>

              <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-none">
                {season.items.map(content => {
                  const Icon = CONTENT_TYPE_ICONS[content.content_type] || Film;
                  return (
                    <button
                      key={content.id}
                      onClick={() => handleSelectContent(content)}
                      className="group relative shrink-0 w-[200px] sm:w-[240px] snap-start rounded-xl overflow-hidden transition-all duration-300 hover:scale-105 hover:ring-2 focus:outline-none"
                      style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-[9/16] sm:aspect-video bg-white/5 relative">
                        {content.thumbnail_url ? (
                          <img src={content.thumbnail_url} alt={content.title} className="w-full h-full object-cover" />
                        ) : content.content_type === 'arte' && content.file_url ? (
                          <img src={content.file_url} alt={content.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon size={40} className="text-white/20" />
                          </div>
                        )}
                        {/* Play overlay */}
                        {content.content_type !== 'arte' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play size={40} className="text-white drop-shadow-lg" />
                          </div>
                        )}
                        {/* Duration badge */}
                        {content.duration_seconds > 0 && (
                          <span className="absolute bottom-2 right-2 bg-black/80 text-xs px-1.5 py-0.5 rounded font-mono">
                            {formatDuration(content.duration_seconds)}
                          </span>
                        )}
                        {/* Status badge */}
                        <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          content.status === 'aprovado' ? 'bg-green-500/90 text-white' :
                          content.status === 'ajuste_solicitado' ? 'bg-orange-500/90 text-white' :
                          'bg-yellow-500/90 text-black'
                        }`}>
                          {STATUS_LABELS[content.status]}
                        </span>
                      </div>
                      {/* Info */}
                      <div className="p-3 text-left bg-white/5">
                        <p className="text-sm font-medium truncate">{content.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">{CONTENT_TYPE_LABELS[content.content_type]}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Content Detail Modal */}
      {selectedContent && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedContent(null)}>
          <div className="bg-[#141414] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Video Player / Image */}
            <div className="relative aspect-video bg-black rounded-t-2xl overflow-hidden">
              {selectedContent.content_type === 'arte' && selectedContent.file_url ? (
                <img src={selectedContent.file_url} alt={selectedContent.title} className="w-full h-full object-contain" />
              ) : selectedContent.file_url ? (
                <>
                  <video
                    ref={videoRef}
                    src={selectedContent.file_url}
                    className="w-full h-full object-contain"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    controls
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30">
                  <Film size={64} />
                </div>
              )}
              <button onClick={() => setSelectedContent(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Content info */}
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">{selectedContent.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-white/60">
                    <span className="px-2 py-0.5 rounded bg-white/10">{CONTENT_TYPE_LABELS[selectedContent.content_type]}</span>
                    <span>{format(new Date(selectedContent.created_at), "dd/MM/yyyy", { locale: pt })}</span>
                    {selectedContent.duration_seconds > 0 && (
                      <span className="flex items-center gap-1"><Clock size={14} /> {formatDuration(selectedContent.duration_seconds)}</span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 px-3 py-1 rounded-full text-sm font-semibold ${
                  selectedContent.status === 'aprovado' ? 'bg-green-500/20 text-green-400' :
                  selectedContent.status === 'ajuste_solicitado' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {STATUS_LABELS[selectedContent.status]}
                </span>
              </div>

              {/* Action buttons */}
              {selectedContent.status !== 'aprovado' && (
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleApprove} className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all hover:scale-105 bg-green-500 text-white">
                    <Check size={18} /> Aprovar
                  </button>
                  <button onClick={() => setShowAdjustment(!showAdjustment)} className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all hover:scale-105 bg-orange-500 text-white">
                    <MessageSquare size={18} /> Solicitar Ajuste
                  </button>
                </div>
              )}

              {/* Adjustment input */}
              {showAdjustment && (
                <div className="space-y-3 bg-white/5 rounded-xl p-4">
                  <textarea
                    value={adjustmentNote}
                    onChange={e => setAdjustmentNote(e.target.value)}
                    placeholder="Descreva o ajuste necessário..."
                    className="w-full bg-white/10 border border-white/20 rounded-lg p-3 text-sm text-white placeholder:text-white/40 resize-none focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                    rows={3}
                  />
                  <button onClick={handleRequestAdjustment} disabled={!adjustmentNote.trim()} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-all" style={{ background: `hsl(${clientColor})` }}>
                    Enviar Solicitação
                  </button>
                </div>
              )}

              {/* Comments */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-white/80 flex items-center gap-2"><MessageSquare size={16} /> Comentários</h4>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {comments.length === 0 && <p className="text-sm text-white/40">Nenhum comentário ainda.</p>}
                  {comments.map(comment => (
                    <div key={comment.id} className={`p-3 rounded-xl text-sm ${comment.author_type === 'client' ? 'bg-white/5 ml-0 mr-8' : 'bg-white/10 ml-8 mr-0'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-xs" style={comment.author_type === 'team' ? { color: `hsl(${clientColor})` } : {}}>
                          {comment.author_name}
                        </span>
                        <span className="text-[10px] text-white/40">{format(new Date(comment.created_at), "dd/MM HH:mm")}</span>
                      </div>
                      <p className="text-white/80">{comment.message}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendComment()}
                    placeholder="Escreva um comentário..."
                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                  />
                  <button onClick={handleSendComment} disabled={!newComment.trim()} className="p-2.5 rounded-full disabled:opacity-40 transition-all" style={{ background: `hsl(${clientColor})` }}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
