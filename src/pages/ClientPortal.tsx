import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Play, Pause, Maximize, Check, MessageSquare, X, ChevronLeft, ChevronRight,
  BarChart3, Send, Clock, Film, Image, Palette, Video, Award, Bell, Volume2,
  VolumeX, Eye, TrendingUp, Sparkles, ChevronDown, Loader2, LogOut, Shield
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import PortalNotifications from '@/components/portal/PortalNotifications';
import ZonaCriativa from '@/components/portal/ZonaCriativa';
import PortalTutorial from '@/components/portal/PortalTutorial';
import { syncPortalApproval, syncPortalAdjustment, syncPortalComment } from '@/lib/portalSync';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reel: 'Reel', criativo: 'Criativo', institucional: 'Institucional', anuncio: 'Anúncio', arte: 'Arte',
};
const CONTENT_TYPE_ICONS: Record<string, any> = {
  reel: Film, criativo: Palette, institucional: Video, anuncio: Video, arte: Image,
};
const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Aprovado', ajuste_solicitado: 'Ajuste Solicitado',
};
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pendente: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  aprovado: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  ajuste_solicitado: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
};

interface PortalContent {
  id: string; client_id: string; title: string; content_type: string;
  season_month: number; season_year: number; file_url: string | null;
  thumbnail_url: string | null; duration_seconds: number; status: string;
  approved_at: string | null; created_at: string;
}
interface PortalComment {
  id: string; content_id: string; author_name: string; author_type: string;
  author_id: string | null;
  message: string; created_at: string;
  avatar_url?: string | null;
}
interface ClientData {
  id: string; company_name: string; logo_url: string | null; color: string;
  weekly_reels: number; weekly_creatives: number; weekly_stories: number;
  monthly_recordings: number; plan_id: string | null; show_metrics: boolean;
}

type TabView = 'library' | 'metrics' | 'criativa';

export default function ClientPortal() {
  const { clientId: paramSlug } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [client, setClient] = useState<ClientData | null>(null);
  const [contents, setContents] = useState<PortalContent[]>([]);
  const [selectedContent, setSelectedContent] = useState<PortalContent | null>(null);
  const [comments, setComments] = useState<PortalComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [activeTab, setActiveTab] = useState<TabView>('library');
  const [loading, setLoading] = useState(true);
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [showAdjustment, setShowAdjustment] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Auth state: team member or client login
  const isTeamMember = !!user && !!profile;
  const isClientLoggedIn = !!sessionStorage.getItem('portal_client_id');
  const isAuthenticated = isTeamMember || isClientLoggedIn;
  
  const getCommentAuthor = () => {
    if (isTeamMember && profile) {
      return { name: profile.display_name || profile.name, type: 'team', id: profile.id };
    }
    return { name: client?.company_name || 'Cliente', type: 'client', id: null };
  };

  const handleLogout = () => {
    sessionStorage.removeItem('portal_client_id');
    sessionStorage.removeItem('portal_client_name');
    sessionStorage.removeItem('portal_auth_type');
    navigate(`/portal-login/${paramSlug}`);
  };


  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  useEffect(() => {
    if (!paramSlug) return;
    loadData();
  }, [paramSlug]);

  const loadData = async () => {
    if (!paramSlug) return;
    setLoading(true);

    // Support both UUID and slug (company name)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramSlug);
    const slug = decodeURIComponent(paramSlug);

    let clientQuery;
    if (isUUID) {
      clientQuery = supabase.from('clients').select('id, company_name, logo_url, color, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics').eq('id', slug).single();
    } else {
      // Match by slug (lowercase, hyphens → spaces)
      const companySearch = slug.replace(/-/g, ' ');
      clientQuery = supabase.from('clients').select('id, company_name, logo_url, color, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics').ilike('company_name', companySearch).single();
    }

    const [clientRes, contentsRes] = await Promise.all([
      clientQuery,
      // If UUID, fetch contents directly; otherwise we'll re-fetch after resolving client
      isUUID
        ? supabase.from('client_portal_contents').select('*').eq('client_id', slug).order('created_at', { ascending: false })
        : Promise.resolve({ data: null }),
    ]);

    if (clientRes.data) {
      const clientData = clientRes.data as ClientData;
      setClient(clientData);
      // If we used slug, now fetch contents with resolved ID
      if (!isUUID) {
        const { data: contData } = await supabase.from('client_portal_contents').select('*').eq('client_id', clientData.id).order('created_at', { ascending: false });
        if (contData) setContents(contData as PortalContent[]);
      } else if (contentsRes.data) {
        setContents(contentsRes.data as PortalContent[]);
      }
    }
    setLoading(false);
  };

  const loadComments = async (contentId: string) => {
    const { data } = await supabase.from('client_portal_comments').select('*').eq('content_id', contentId).order('created_at', { ascending: true });
    if (data) {
      // Fetch avatars for team comments
      const teamComments = data.filter((c: any) => c.author_id);
      const authorIds = [...new Set(teamComments.map((c: any) => c.author_id))];
      let avatarMap: Record<string, string | null> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, avatar_url').in('id', authorIds);
        if (profiles) {
          profiles.forEach((p: any) => { avatarMap[p.id] = p.avatar_url; });
        }
      }
      setComments((data as any[]).map(c => ({ ...c, avatar_url: c.author_id ? avatarMap[c.author_id] : null })) as PortalComment[]);
    }
  };

  const handleSelectContent = (content: PortalContent) => {
    setSelectedContent(content);
    setShowAdjustment(false);
    setAdjustmentNote('');
    setIsPlaying(false);
    setVideoProgress(0);
    loadComments(content.id);
  };

  const handleApprove = async () => {
    if (!selectedContent || !client) return;
    await supabase.from('client_portal_contents').update({ status: 'aprovado', approved_at: new Date().toISOString() }).eq('id', selectedContent.id);
    setContents(prev => prev.map(c => c.id === selectedContent.id ? { ...c, status: 'aprovado', approved_at: new Date().toISOString() } : c));
    setSelectedContent(prev => prev ? { ...prev, status: 'aprovado' } : null);
    toast.success('Conteúdo aprovado com sucesso!');
    // Sync with internal system
    syncPortalApproval(selectedContent.id, client.id, selectedContent.title).catch(console.error);
  };

  const handleRequestAdjustment = async () => {
    if (!selectedContent || !adjustmentNote.trim() || !client) return;
    const author = getCommentAuthor();
    await Promise.all([
      supabase.from('client_portal_contents').update({ status: 'ajuste_solicitado' }).eq('id', selectedContent.id),
      supabase.from('client_portal_comments').insert({ content_id: selectedContent.id, author_name: author.name, author_type: author.type, author_id: author.id, message: `🔧 Ajuste solicitado: ${adjustmentNote}` }),
    ]);
    setContents(prev => prev.map(c => c.id === selectedContent.id ? { ...c, status: 'ajuste_solicitado' } : c));
    setSelectedContent(prev => prev ? { ...prev, status: 'ajuste_solicitado' } : null);
    setShowAdjustment(false);
    setAdjustmentNote('');
    loadComments(selectedContent.id);
    toast.success('Ajuste solicitado com sucesso!');
    // Sync with internal system
    syncPortalAdjustment(selectedContent.id, client.id, selectedContent.title, adjustmentNote).catch(console.error);
  };

  const handleSendComment = async () => {
    if (!selectedContent || !newComment.trim() || !client) return;
    const author = getCommentAuthor();
    await supabase.from('client_portal_comments').insert({ content_id: selectedContent.id, author_name: author.name, author_type: author.type, author_id: author.id, message: newComment });
    const commentText = newComment;
    setNewComment('');
    loadComments(selectedContent.id);
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    // Sync comment notification
    syncPortalComment(client.id, selectedContent.title, author.name, author.type, commentText).catch(console.error);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else videoRef.current.requestFullscreen();
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setVideoProgress(videoRef.current.currentTime);
    setVideoDuration(videoRef.current.duration || 0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pct * videoRef.current.duration;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const changeMonth = (dir: number) => {
    const newMonth = selectedMonth + dir;
    if (newMonth < 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else if (newMonth > 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(newMonth);
  };

  // Group contents by type for current season
  const seasonContents = useMemo(() => 
    contents.filter(c => c.season_month === selectedMonth && c.season_year === selectedYear),
    [contents, selectedMonth, selectedYear]
  );

  const contentByType = useMemo(() => {
    const groups: Record<string, PortalContent[]> = {};
    seasonContents.forEach(c => {
      if (!groups[c.content_type]) groups[c.content_type] = [];
      groups[c.content_type].push(c);
    });
    return groups;
  }, [seasonContents]);

  // Also group all contents by season for browsing
  const allSeasons = useMemo(() => {
    const seasons = contents.reduce((acc, c) => {
      const key = `${c.season_year}-${c.season_month}`;
      if (!acc[key]) acc[key] = { month: c.season_month, year: c.season_year, items: [] };
      acc[key].items.push(c);
      return acc;
    }, {} as Record<string, { month: number; year: number; items: PortalContent[] }>);
    return Object.values(seasons).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [contents]);

  // Available months for selector
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    contents.forEach(c => months.add(`${c.season_year}-${c.season_month}`));
    return months;
  }, [contents]);

  // Metrics
  const reelsCount = seasonContents.filter(c => c.content_type === 'reel').length;
  const creativosCount = seasonContents.filter(c => c.content_type === 'criativo').length;
  const artesCount = seasonContents.filter(c => c.content_type === 'arte').length;
  const videosCount = seasonContents.filter(c => ['institucional', 'anuncio'].includes(c.content_type)).length;
  const approvedCount = seasonContents.filter(c => c.status === 'aprovado').length;
  const pendingCount = seasonContents.filter(c => c.status === 'pendente').length;
  const adjustmentCount = seasonContents.filter(c => c.status === 'ajuste_solicitado').length;
  const totalDelivered = seasonContents.length;

  const contractedReels = (client?.weekly_reels || 0) * 4;
  const contractedCreatives = (client?.weekly_creatives || 0) * 4;
  const contractedRecordings = client?.monthly_recordings || 4;
  const totalContracted = contractedReels + contractedCreatives;
  const deliveryPct = totalContracted > 0 ? Math.round((totalDelivered / totalContracted) * 100) : 0;

  const clientColor = client?.color || '217 91% 60%';
  const seasonLabel = format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy", { locale: pt });

  // Featured content (first video with thumbnail)
  const featuredContent = seasonContents.find(c => c.thumbnail_url || c.file_url) || seasonContents[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <p className="text-white/60">Cliente não encontrado.</p>
      </div>
    );
  }

  const ROW_LABELS: Record<string, string> = {
    reel: 'Reels',
    criativo: 'Criativos & Anúncios',
    institucional: 'Vídeos Institucionais',
    anuncio: 'Anúncios',
    arte: 'Artes & Design',
  };

  return (
    <div className="min-h-screen bg-[#080810] text-white selection:bg-white/20 overflow-x-hidden">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 bg-[#080810]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {client.logo_url ? (
              <img src={client.logo_url} alt={client.company_name} className="w-9 h-9 rounded-lg object-cover ring-1 ring-white/10" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: `hsl(${clientColor})` }}>
                {client.company_name.charAt(0)}
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-sm font-semibold tracking-tight leading-none">{client.company_name}</h1>
              <p className="text-[11px] text-white/40 mt-0.5">Pulse Club</p>
            </div>
          </div>

          {/* Season selector */}
          <div className="flex items-center gap-1 bg-white/[0.06] rounded-full px-1 py-1">
            <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium min-w-[120px] text-center capitalize">{seasonLabel}</span>
            <button onClick={() => changeMonth(1)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Nav tabs + notifications */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 bg-white/[0.06] rounded-full p-1">
              <button
                onClick={() => setActiveTab('library')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'library' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Biblioteca
              </button>
              <button
                onClick={() => setActiveTab('criativa')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'criativa' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Zona Criativa
              </button>
              {(client.show_metrics || isTeamMember) && (
                <button
                  onClick={() => setActiveTab('metrics')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'metrics' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
                >
                  Métricas
                </button>
              )}
            </div>
            <PortalNotifications
              clientId={client.id}
              clientColor={clientColor}
              onSelectContent={(contentId) => {
                const found = contents.find(c => c.id === contentId);
                if (found) {
                  setActiveTab('library');
                  handleSelectContent(found);
                } else {
                  supabase.from('client_portal_contents').select('*').eq('id', contentId).single().then(({ data }) => {
                    if (data) {
                      setActiveTab('library');
                      handleSelectContent(data as PortalContent);
                    }
                  });
                }
              }}
              onOpenScript={() => {
                setActiveTab('criativa');
              }}
            />
            <PortalTutorial clientColor={clientColor} />
            {isTeamMember && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/15 border border-violet-500/20">
                <Shield size={10} className="text-violet-400" />
                <span className="text-[10px] font-semibold text-violet-300">{profile?.name?.split(' ')[0]}</span>
              </div>
            )}
            {isClientLoggedIn && !isTeamMember && (
              <button onClick={handleLogout} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Sair">
                <LogOut size={14} className="text-white/50" />
              </button>
            )}
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: `hsl(${clientColor})` }}>
              {isTeamMember && profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                client.company_name.charAt(0)
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="sm:hidden flex border-b border-white/[0.06]">
        <button onClick={() => setActiveTab('library')} className={`flex-1 py-3 text-xs font-medium text-center transition-colors ${activeTab === 'library' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'library' ? { borderColor: `hsl(${clientColor})` } : {}}>
          Biblioteca
        </button>
        <button onClick={() => setActiveTab('criativa')} className={`flex-1 py-3 text-xs font-medium text-center transition-colors ${activeTab === 'criativa' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'criativa' ? { borderColor: `hsl(${clientColor})` } : {}}>
          Zona Criativa
        </button>
        <button onClick={() => setActiveTab('metrics')} className={`flex-1 py-3 text-xs font-medium text-center transition-colors ${activeTab === 'metrics' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'metrics' ? { borderColor: `hsl(${clientColor})` } : {}}>
          Métricas
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'library' ? (
          <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* ── HERO BANNER ── */}
            {featuredContent && (
              <div className="relative overflow-hidden">
                <div className="absolute inset-0">
                  {featuredContent.thumbnail_url ? (
                    <img src={featuredContent.thumbnail_url} alt="" className="w-full h-full object-cover opacity-30 blur-sm scale-110" />
                  ) : (
                    <div className="w-full h-full" style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.3), transparent)` }} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080810] via-[#080810]/80 to-[#080810]/40" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#080810]/90 to-transparent" />
                </div>

                <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-12 sm:py-20">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 mb-4">
                      <Sparkles size={12} style={{ color: `hsl(${clientColor})` }} />
                      <span className="capitalize">Temporada {seasonLabel}</span>
                    </div>
                    <h2 className="text-3xl sm:text-5xl font-bold tracking-tight max-w-lg leading-tight">
                      Sua biblioteca de conteúdos
                    </h2>
                    <p className="text-white/50 mt-3 max-w-md text-sm sm:text-base">
                      {totalDelivered} conteúdos produzidos • {reelsCount} vídeos • {artesCount + creativosCount} artes
                    </p>

                    <div className="flex flex-wrap gap-3 mt-6">
                      {totalDelivered > 0 && (
                        <button
                          onClick={() => {
                            const first = seasonContents.find(c => c.content_type !== 'arte');
                            if (first) handleSelectContent(first);
                          }}
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm transition-all hover:scale-105 active:scale-95 text-white"
                          style={{ background: `hsl(${clientColor})` }}
                        >
                          <Play size={16} fill="currentColor" /> Assistir conteúdos
                        </button>
                      )}
                      <button
                        onClick={() => setActiveTab('metrics')}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-white/10 hover:bg-white/15 transition-all hover:scale-105 active:scale-95"
                      >
                        <BarChart3 size={16} /> Ver métricas
                      </button>
                    </div>

                    {/* Quick stats */}
                    <div className="flex gap-6 mt-8">
                      {[
                        { label: 'Aprovados', value: approvedCount, color: 'text-emerald-400' },
                        { label: 'Pendentes', value: pendingCount, color: 'text-amber-400' },
                        { label: 'Em ajuste', value: adjustmentCount, color: 'text-orange-400' },
                      ].map(s => (
                        <div key={s.label} className="text-center">
                          <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            )}

            {/* ── CONTENT ROWS ── */}
            <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-20 space-y-10 mt-4">
              {seasonContents.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24">
                  <Film size={48} className="mx-auto mb-4 text-white/15" />
                  <p className="text-lg text-white/30 font-medium">Nenhum conteúdo nesta temporada</p>
                  <p className="text-sm text-white/20 mt-1">Conteúdos aparecerão aqui quando publicados pela equipe.</p>
                </motion.div>
              )}

              {Object.entries(contentByType).map(([type, items], idx) => (
                <ContentRow
                  key={type}
                  label={ROW_LABELS[type] || type}
                  items={items}
                  clientColor={clientColor}
                  onSelect={handleSelectContent}
                  delay={idx * 0.05}
                />
              ))}

              {/* Other seasons */}
              {allSeasons.filter(s => !(s.month === selectedMonth && s.year === selectedYear)).length > 0 && (
                <div className="pt-8 border-t border-white/[0.06]">
                  <h3 className="text-lg font-semibold text-white/60 mb-6">Outras temporadas</h3>
                  {allSeasons
                    .filter(s => !(s.month === selectedMonth && s.year === selectedYear))
                    .map(season => (
                      <ContentRow
                        key={`${season.year}-${season.month}`}
                        label={`Temporada ${format(new Date(season.year, season.month - 1), 'MMMM yyyy', { locale: pt })}`}
                        items={season.items}
                        clientColor={clientColor}
                        onSelect={handleSelectContent}
                        delay={0}
                      />
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        ) : activeTab === 'criativa' ? (
          <ZonaCriativa clientId={client.id} clientColor={clientColor} isAuthenticated={isAuthenticated} />
        ) : (
          /* ── METRICS TAB ── */
          <motion.div key="metrics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 pb-20 space-y-8">
            {/* Delivery percentage hero */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-8">
              <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Entrega da temporada</p>
              <div className="relative inline-flex items-center justify-center">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                  <circle
                    cx="80" cy="80" r="70" fill="none"
                    stroke={`hsl(${clientColor})`}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min(deliveryPct, 100) * 4.4} 440`}
                    transform="rotate(-90 80 80)"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black" style={{ color: `hsl(${clientColor})` }}>{deliveryPct}%</span>
                  <span className="text-[10px] text-white/40 mt-1">do pacote</span>
                </div>
              </div>
              {deliveryPct >= 100 && (
                <p className="text-sm text-emerald-400 mt-3 font-medium flex items-center justify-center gap-1">
                  <TrendingUp size={14} /> Entregamos acima do contratado!
                </p>
              )}
            </motion.div>

            {/* Contracted vs Delivered */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Reels', delivered: reelsCount, contracted: contractedReels, icon: Film },
                { label: 'Criativos', delivered: creativosCount, contracted: contractedCreatives, icon: Palette },
                { label: 'Artes', delivered: artesCount, contracted: 0, icon: Image },
                { label: 'Vídeos', delivered: videosCount, contracted: 0, icon: Video },
                { label: 'Gravações', delivered: 0, contracted: contractedRecordings, icon: Film },
              ].filter(m => m.delivered > 0 || m.contracted > 0).map(metric => {
                const pct = metric.contracted > 0 ? Math.round((metric.delivered / metric.contracted) * 100) : 0;
                const overDelivered = pct > 100;
                return (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-white/[0.06]">
                          <metric.icon size={16} className="text-white/60" />
                        </div>
                        <span className="text-sm font-medium text-white/80">{metric.label}</span>
                      </div>
                      {metric.contracted > 0 && (
                        <span className={`text-xs font-bold ${overDelivered ? 'text-emerald-400' : 'text-white/40'}`}>
                          {pct}%
                        </span>
                      )}
                    </div>
                    <div className="text-3xl font-bold">{metric.delivered}</div>
                    {metric.contracted > 0 && (
                      <>
                        <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              background: overDelivered ? '#34d399' : `hsl(${clientColor})`,
                            }}
                          />
                        </div>
                        <p className="text-[11px] text-white/30 mt-2">
                          {metric.delivered} de {metric.contracted} contratados
                        </p>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Status summary */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Aprovados', value: approvedCount, color: 'emerald' },
                { label: 'Pendentes', value: pendingCount, color: 'amber' },
                { label: 'Em Ajuste', value: adjustmentCount, color: 'orange' },
              ].map(s => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 text-center"
                >
                  <p className={`text-3xl font-bold text-${s.color}-400`}>{s.value}</p>
                  <p className="text-xs text-white/40 mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTENT DETAIL MODAL ── */}
      <AnimatePresence>
        {selectedContent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm overflow-y-auto"
            onClick={() => setSelectedContent(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="max-w-5xl mx-auto my-4 sm:my-8"
              onClick={e => e.stopPropagation()}
            >
              {/* Close button */}
              <div className="flex justify-end px-4 mb-2">
                <button onClick={() => setSelectedContent(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Player / Image */}
              <div className="relative bg-black rounded-2xl overflow-hidden mx-4 sm:mx-0">
                {selectedContent.content_type === 'arte' && selectedContent.file_url ? (
                  <div className="aspect-video flex items-center justify-center bg-[#0c0c14]">
                    <img src={selectedContent.file_url} alt={selectedContent.title} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : selectedContent.file_url ? (
                  <div className="relative group">
                    <video
                      ref={videoRef}
                      src={selectedContent.file_url}
                      className="w-full aspect-video object-contain bg-black"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleTimeUpdate}
                      onClick={togglePlay}
                    />
                    {/* Custom controls */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Progress bar */}
                      <div className="cursor-pointer h-1 bg-white/20 rounded-full mb-3 group/bar" onClick={handleSeek}>
                        <div
                          className="h-full rounded-full relative transition-all"
                          style={{
                            width: videoDuration ? `${(videoProgress / videoDuration) * 100}%` : '0%',
                            background: `hsl(${clientColor})`,
                          }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button onClick={togglePlay} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
                            {isPlaying ? <Pause size={18} /> : <Play size={18} fill="white" />}
                          </button>
                          <button onClick={toggleMute} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
                            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                          </button>
                          <span className="text-xs text-white/60 font-mono">
                            {formatDuration(videoProgress)} / {formatDuration(videoDuration)}
                          </span>
                        </div>
                        <button onClick={toggleFullscreen} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
                          <Maximize size={16} />
                        </button>
                      </div>
                    </div>
                    {/* Center play button */}
                    {!isPlaying && (
                      <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                          <Play size={28} fill="white" className="ml-1" />
                        </div>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video flex items-center justify-center bg-[#0c0c14]">
                    <Film size={64} className="text-white/10" />
                  </div>
                )}
              </div>

              {/* Content info + actions */}
              <div className="px-4 sm:px-0 mt-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold">{selectedContent.title}</h3>
                    <div className="flex flex-wrap items-center gap-2.5 mt-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-white/[0.08] text-white/60">{CONTENT_TYPE_LABELS[selectedContent.content_type]}</span>
                      <span className="text-xs text-white/40">{format(new Date(selectedContent.created_at), "dd MMM yyyy", { locale: pt })}</span>
                      {selectedContent.duration_seconds > 0 && (
                        <span className="text-xs text-white/40 flex items-center gap-1"><Clock size={12} /> {formatDuration(selectedContent.duration_seconds)}</span>
                      )}
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[selectedContent.status]?.bg} ${STATUS_COLORS[selectedContent.status]?.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[selectedContent.status]?.dot}`} />
                    {STATUS_LABELS[selectedContent.status]}
                  </div>
                </div>

                {/* Actions */}
                {selectedContent.status !== 'aprovado' && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleApprove}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm bg-emerald-500 hover:bg-emerald-400 text-white transition-all hover:scale-105 active:scale-95"
                    >
                      <Check size={16} /> Aprovar conteúdo
                    </button>
                    <button
                      onClick={() => setShowAdjustment(!showAdjustment)}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm bg-white/10 hover:bg-white/15 text-white transition-all hover:scale-105 active:scale-95"
                    >
                      <MessageSquare size={16} /> Solicitar ajuste
                    </button>
                  </div>
                )}

                {selectedContent.status === 'aprovado' && (
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                    <Check size={16} /> Conteúdo aprovado
                    {selectedContent.approved_at && (
                      <span className="text-emerald-400/60 text-xs ml-1">
                        em {format(new Date(selectedContent.approved_at), "dd/MM/yyyy 'às' HH:mm")}
                      </span>
                    )}
                  </div>
                )}

                {/* Adjustment form */}
                <AnimatePresence>
                  {showAdjustment && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                        <textarea
                          value={adjustmentNote}
                          onChange={e => setAdjustmentNote(e.target.value)}
                          placeholder="Descreva o ajuste necessário..."
                          className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl p-3 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-1 transition-all"
                          style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                          rows={3}
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={handleRequestAdjustment}
                            disabled={!adjustmentNote.trim()}
                            className="px-5 py-2 rounded-full text-sm font-semibold disabled:opacity-30 text-white transition-all hover:scale-105"
                            style={{ background: `hsl(${clientColor})` }}
                          >
                            Enviar solicitação
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Comments */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
                    <MessageSquare size={14} className="text-white/40" />
                    <span className="text-sm font-medium text-white/70">Comentários</span>
                    <span className="text-xs text-white/30">({comments.length})</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-4 space-y-3">
                    {comments.length === 0 && <p className="text-sm text-white/20 text-center py-4">Nenhum comentário ainda.</p>}
                    {comments.map(comment => (
                      <motion.div
                        key={comment.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-2.5 ${comment.author_type === 'client' ? 'justify-end' : 'justify-start'}`}
                      >
                        {comment.author_type === 'team' && (
                          <div className="shrink-0 mt-1">
                            {comment.avatar_url ? (
                              <img src={comment.avatar_url} alt={comment.author_name} className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10" />
                            ) : (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `hsl(${clientColor})` }}>
                                {comment.author_name.charAt(0)}
                              </div>
                            )}
                          </div>
                        )}
                        <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                          comment.author_type === 'client'
                            ? 'bg-white/[0.08] rounded-br-md'
                            : 'rounded-bl-md'
                        }`} style={comment.author_type === 'team' ? { background: `hsl(${clientColor} / 0.15)` } : {}}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-[11px]" style={comment.author_type === 'team' ? { color: `hsl(${clientColor})` } : {}}>
                              {comment.author_name}
                            </span>
                            <span className="text-[10px] text-white/25">{format(new Date(comment.created_at), "dd/MM HH:mm")}</span>
                          </div>
                          <p className="text-white/80 leading-relaxed">{comment.message}</p>
                        </div>
                        {comment.author_type === 'client' && (
                          <div className="shrink-0 mt-1">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-white/[0.1]">
                              {comment.author_name.charAt(0)}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                    <div ref={commentsEndRef} />
                  </div>
                  <div className="px-4 py-3 border-t border-white/[0.06] flex gap-2">
                    <input
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendComment()}
                      placeholder="Escreva um comentário..."
                      className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 transition-all"
                      style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                    />
                    <button
                      onClick={handleSendComment}
                      disabled={!newComment.trim()}
                      className="p-2.5 rounded-full disabled:opacity-20 text-white transition-all hover:scale-105"
                      style={{ background: `hsl(${clientColor})` }}
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-8" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Content Row Component ── */
function ContentRow({ label, items, clientColor, onSelect, delay = 0 }: {
  label: string;
  items: PortalContent[];
  clientColor: string;
  onSelect: (c: PortalContent) => void;
  delay?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    el?.addEventListener('scroll', checkScroll);
    return () => el?.removeEventListener('scroll', checkScroll);
  }, [items]);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  return (
    <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <span className="w-1 h-5 rounded-full" style={{ background: `hsl(${clientColor})` }} />
          {label}
          <span className="text-xs font-normal text-white/30 ml-1">{items.length}</span>
        </h3>
        <div className="flex gap-1">
          {canScrollLeft && (
            <button onClick={() => scroll(-1)} className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/10 transition-colors">
              <ChevronLeft size={14} />
            </button>
          )}
          {canScrollRight && (
            <button onClick={() => scroll(1)} className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/10 transition-colors">
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory" onScroll={checkScroll}>
        {items.map(content => (
          <ReelsCard key={content.id} content={content} clientColor={clientColor} onSelect={onSelect} />
        ))}
      </div>
    </motion.section>
  );
}

/* ── Reels Card with hover/touch video preview ── */
function ReelsCard({ content, clientColor, onSelect }: {
  content: PortalContent;
  clientColor: string;
  onSelect: (c: PortalContent) => void;
}) {
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  const isVideo = content.content_type !== 'arte' && !!content.file_url;
  const Icon = CONTENT_TYPE_ICONS[content.content_type] || Film;
  const statusStyle = STATUS_COLORS[content.status];

  // Auto-play first 5s in loop
  useEffect(() => {
    const vid = videoPreviewRef.current;
    if (!vid || !isVideo) return;

    const handleTimeUpdate = () => {
      if (vid.currentTime >= 5) {
        vid.currentTime = 0;
      }
    };

    const startAutoplay = () => {
      setVideoReady(true);
      vid.play().catch(() => {});
    };

    vid.addEventListener('timeupdate', handleTimeUpdate);
    vid.addEventListener('canplay', startAutoplay, { once: true });

    return () => {
      vid.removeEventListener('timeupdate', handleTimeUpdate);
      vid.removeEventListener('canplay', startAutoplay);
    };
  }, [isVideo]);

  return (
    <button
      onClick={() => onSelect(content)}
      className="group relative shrink-0 w-[140px] sm:w-[170px] snap-start rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.04] hover:ring-1 focus:outline-none bg-white/[0.03]"
      style={{ '--tw-ring-color': `hsl(${clientColor} / 0.5)` } as any}
    >
      <div className="aspect-[9/16] relative overflow-hidden">
        {/* Fallback thumbnail (behind video) */}
        {content.thumbnail_url ? (
          <img src={content.thumbnail_url} alt={content.title} className="w-full h-full object-cover" />
        ) : content.file_url && content.content_type === 'arte' ? (
          <img src={content.file_url} alt={content.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.04]">
            <Icon size={32} className="text-white/10" />
          </div>
        )}

        {/* Auto-playing 5s loop video preview */}
        {isVideo && (
          <video
            ref={videoPreviewRef}
            src={content.file_url!}
            muted
            playsInline
            preload="metadata"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
              videoReady ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {/* Play icon overlay for non-video content */}
        {isVideo && !videoReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <Play size={18} fill="white" className="ml-0.5" />
            </div>
          </div>
        )}

        {content.content_type === 'arte' && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Eye size={18} />
            </div>
          </div>
        )}

        {/* Duration */}
        {content.duration_seconds > 0 && (
          <span className="absolute bottom-8 right-1.5 bg-black/80 text-[10px] px-1.5 py-0.5 rounded font-mono text-white/80">
            {Math.floor(content.duration_seconds / 60)}:{(content.duration_seconds % 60).toString().padStart(2, '0')}
          </span>
        )}

        {/* Status */}
        <div className={`absolute top-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${statusStyle?.bg} ${statusStyle?.text} backdrop-blur-sm`}>
          <span className={`w-1 h-1 rounded-full ${statusStyle?.dot}`} />
          {STATUS_LABELS[content.status]}
        </div>

        {/* Title at bottom over gradient */}
        <div className="absolute bottom-0 inset-x-0 p-2.5">
          <p className="text-xs font-medium truncate text-white/90">{content.title}</p>
          <span className="text-[10px] text-white/40 mt-0.5 block">{CONTENT_TYPE_LABELS[content.content_type]}</span>
        </div>
      </div>
    </button>
  );
}
