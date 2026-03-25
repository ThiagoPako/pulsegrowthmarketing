import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { portalAction } from '@/lib/portalApi';
import { useAuth } from '@/hooks/useAuth';
import {
  Play, Pause, Maximize, Check, MessageSquare, X, ChevronLeft, ChevronRight,
  BarChart3, Send, Clock, Film, Image, Palette, Video, Award, Bell, Volume2,
  VolumeX, Eye, TrendingUp, Sparkles, ChevronDown, Loader2, LogOut, Shield, Download
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import PortalNotifications from '@/components/portal/PortalNotifications';
import ZonaCriativa from '@/components/portal/ZonaCriativa';
import PortalTutorial from '@/components/portal/PortalTutorial';
import PortalRecordingCalendar from '@/components/portal/PortalRecordingCalendar';
import PortalPanfletagem from '@/components/portal/PortalPanfletagem';
import PortalDesigner from '@/components/portal/PortalDesigner';
import { syncPortalApproval, syncPortalAdjustment, syncPortalComment } from '@/lib/portalSync';
import PortalWelcomeOverlay from '@/components/portal/PortalWelcomeOverlay';
import { PortalVideoButtons } from '@/components/portal/PortalWelcomeOverlay';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reel: 'Reel', criativo: 'Criativo', institucional: 'Institucional', anuncio: 'Anúncio', arte: 'Arte',
};
const CONTENT_TYPE_ICONS: Record<string, any> = {
  reel: Film, criativo: Palette, institucional: Video, anuncio: Video, arte: Image,
};
const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Aprovado', ajuste_solicitado: 'Ajuste Solicitado', revisao_interna: 'Em Revisão',
};
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pendente: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  aprovado: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  ajuste_solicitado: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
  revisao_interna: { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
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
  has_vehicle_flyer: boolean; niche: string | null;
  whatsapp?: string; city?: string;
}

type TabView = 'library' | 'metrics' | 'criativa' | 'agenda' | 'panfletagem' | 'designer';

const PORTAL_MEDIA_PROXY_URL = 'https://agenciapulse.tech/api/portal-media-proxy';
const VPS_UPLOADS_URL = 'https://agenciapulse.tech/uploads';

type VideoQuality = '480p' | 'original';

function isPortalVideo(content: Pick<PortalContent, 'content_type' | 'file_url'>) {
  return content.content_type !== 'arte' && !!content.file_url;
}

function shouldProxyPortalVideo(url: string) {
  return url.startsWith(VPS_UPLOADS_URL);
}

async function createPortalVideoObjectUrl(url: string, quality: VideoQuality = '480p') {
  const response = await fetch(PORTAL_MEDIA_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, quality }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar o vídeo (${response.status})`);
  }

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error('O vídeo retornou vazio.');
  }

  return URL.createObjectURL(blob);
}

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
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('480p');
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [portalVideoState, setPortalVideoState] = useState({ hasNews: false, hasWelcome: false, isNewClient: false });

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

    const slug = decodeURIComponent(paramSlug).trim();
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const storedClientId = sessionStorage.getItem('portal_client_id');
    const portalAuthType = sessionStorage.getItem('portal_auth_type');
    const mapClientData = (data: any): ClientData => ({
      id: data.id,
      company_name: data.company_name,
      logo_url: data.logo_url,
      color: data.color || '217 91% 60%',
      weekly_reels: data.weekly_reels || 0,
      weekly_creatives: data.weekly_creatives || 0,
      weekly_stories: data.weekly_stories || 0,
      monthly_recordings: data.monthly_recordings || 0,
      plan_id: data.plan_id || null,
      show_metrics: data.show_metrics ?? true,
      has_vehicle_flyer: data.has_vehicle_flyer ?? false,
      niche: data.niche || null,
      whatsapp: data.whatsapp,
      city: data.city,
    });

    let clientData: ClientData | null = null;

    // Try stored client ID first for logged-in clients
    const lookupId = (!isUUID && storedClientId && portalAuthType === 'client') ? storedClientId : slug;
    
    const clientResult = await portalAction({ action: 'get_client', client_id: lookupId });
    if (clientResult?.client) {
      clientData = mapClientData(clientResult.client);
    }

    // Fallback: try edge function
    if (!clientData) {
      const { data: edgeData } = await supabase.functions.invoke('client-portal-auth', {
        body: { action: 'get_info', ...(isUUID ? { client_id: slug } : { slug }) },
      });
      if (edgeData?.id) clientData = mapClientData(edgeData);
    }

    if (clientData) {
      setClient(clientData);
      const contResult = await portalAction({ action: 'get_contents', client_id: clientData.id });
      if (contResult?.contents && contResult.contents.length > 0) {
        setContents(contResult.contents as PortalContent[]);
      }
    }
    setLoading(false);
  };

  const loadComments = async (contentId: string) => {
    const result = await portalAction({ action: 'get_comments', content_id: contentId });
    if (result?.comments) {
      setComments(result.comments as PortalComment[]);
    }
  };

  // Real-time comment polling every 5s when a content is selected
  useEffect(() => {
    if (!selectedContent?.id) return;
    const interval = setInterval(() => {
      loadComments(selectedContent.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedContent?.id]);

  const handleSelectContent = (content: PortalContent) => {
    setSelectedContent(content);
    setShowAdjustment(false);
    setAdjustmentNote('');
    setIsPlaying(false);
    setVideoProgress(0);
    setVideoDuration(0);
    setResolvedVideoUrl(null);
    setVideoLoadError(null);
    setVideoQuality('480p');
    loadComments(content.id);
  };

  useEffect(() => {
    let objectUrlToRevoke: string | null = null;
    let cancelled = false;

    const loadSelectedVideo = async () => {
      setIsPlaying(false);
      setVideoProgress(0);
      setVideoDuration(0);

      if (!selectedContent?.file_url) {
        setResolvedVideoUrl(null);
        setVideoLoadError(null);
        setVideoLoading(false);
        return;
      }

      if (!isPortalVideo(selectedContent) || !shouldProxyPortalVideo(selectedContent.file_url)) {
        setResolvedVideoUrl(selectedContent.file_url);
        setVideoLoadError(null);
        setVideoLoading(false);
        return;
      }

      setResolvedVideoUrl(null);
      setVideoLoadError(null);
      setVideoLoading(true);

      try {
        const objectUrl = await createPortalVideoObjectUrl(selectedContent.file_url, videoQuality);

        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        objectUrlToRevoke = objectUrl;
        setResolvedVideoUrl(objectUrl);
      } catch (error) {
        console.error('[Portal Video] Failed to load proxied video', error);
        if (!cancelled) {
          setVideoLoadError(error instanceof Error ? error.message : 'Não foi possível carregar o vídeo.');
        }
      } finally {
        if (!cancelled) {
          setVideoLoading(false);
        }
      }
    };

    loadSelectedVideo();

    return () => {
      cancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [selectedContent?.id, selectedContent?.file_url, selectedContent?.content_type, videoQuality]);

  const handleApprove = async () => {
    if (!selectedContent || !client) return;
    await portalAction({ action: 'approve', content_id: selectedContent.id, client_id: client.id });
    setContents(prev => prev.map(c => c.id === selectedContent.id ? { ...c, status: 'aprovado', approved_at: new Date().toISOString() } : c));
    setSelectedContent(prev => prev ? { ...prev, status: 'aprovado' } : null);
    toast.success('Conteúdo aprovado com sucesso!');
    syncPortalApproval(selectedContent.id, client.id, selectedContent.title).catch(console.error);
  };

  const handleRequestAdjustment = async () => {
    if (!selectedContent || !adjustmentNote.trim() || !client) return;
    const author = getCommentAuthor();
    await portalAction({
      action: 'request_adjustment',
      content_id: selectedContent.id,
      client_id: client.id,
      author_name: author.name,
      author_type: author.type,
      author_id: author.id,
      message: adjustmentNote,
    });
    setContents(prev => prev.map(c => c.id === selectedContent.id ? { ...c, status: 'ajuste_solicitado' } : c));
    setSelectedContent(prev => prev ? { ...prev, status: 'ajuste_solicitado' } : null);
    setShowAdjustment(false);
    setAdjustmentNote('');
    loadComments(selectedContent.id);
    toast.success('Ajuste solicitado com sucesso!');
    syncPortalAdjustment(selectedContent.id, client.id, selectedContent.title, adjustmentNote).catch(console.error);
  };

  const handleSendComment = async () => {
    if (!selectedContent || !newComment.trim() || !client) return;
    const author = getCommentAuthor();
    await portalAction({
      action: 'add_comment',
      content_id: selectedContent.id,
      author_name: author.name,
      author_type: author.type,
      author_id: author.id,
      message: newComment,
    });
    const commentText = newComment;
    setNewComment('');
    loadComments(selectedContent.id);
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    syncPortalComment(client.id, selectedContent.title, author.name, author.type, commentText).catch(console.error);
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await videoRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('[Portal Video] Playback failed', error);
      setIsPlaying(false);
    }
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

  // Filter: clients can't see 'revisao_interna' content, only team members can
  const visibleContents = useMemo(() =>
    isTeamMember ? contents : contents.filter(c => c.status !== 'revisao_interna'),
    [contents, isTeamMember]
  );

  // Group contents by type for current season
  const seasonContents = useMemo(() => 
    visibleContents.filter(c => c.season_month === selectedMonth && c.season_year === selectedYear),
    [visibleContents, selectedMonth, selectedYear]
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
    const seasons = visibleContents.reduce((acc, c) => {
      const key = `${c.season_year}-${c.season_month}`;
      if (!acc[key]) acc[key] = { month: c.season_month, year: c.season_year, items: [] };
      acc[key].items.push(c);
      return acc;
    }, {} as Record<string, { month: number; year: number; items: PortalContent[] }>);
    return Object.values(seasons).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [visibleContents]);

  // Available months for selector
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    visibleContents.forEach(c => months.add(`${c.season_year}-${c.season_month}`));
    return months;
  }, [visibleContents]);

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
      {/* Welcome / News video overlay */}
      <PortalWelcomeOverlay
        clientId={client.id}
        onVideosLoaded={(data) => setPortalVideoState({ hasNews: data.hasNews, hasWelcome: data.hasWelcome, isNewClient: data.isNewClient })}
      />
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 bg-[#080810]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
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
           <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
             <div className="hidden sm:flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-white/[0.06] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => setActiveTab('library')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'library' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Biblioteca
              </button>
              <button
                onClick={() => setActiveTab('designer')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'designer' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                🎨 Designer
              </button>
              <button
                onClick={() => setActiveTab('criativa')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'criativa' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Zona Criativa
              </button>
              <button
                onClick={() => setActiveTab('agenda')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'agenda' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Agenda
              </button>
              {(client.show_metrics || isTeamMember) && (
                <button
                  onClick={() => setActiveTab('metrics')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'metrics' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
                >
                  Métricas
                </button>
              )}
              {client.has_vehicle_flyer && (
                <button
                  onClick={() => setActiveTab('panfletagem')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === 'panfletagem' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
                >
                  🚗 Panfletagem
                </button>
              )}
            </div>
            <PortalVideoButtons hasNews={portalVideoState.hasNews} hasWelcome={portalVideoState.hasWelcome} isNewClient={portalVideoState.isNewClient} />
            <PortalNotifications
              clientId={client.id}
              clientColor={clientColor}
              onSelectContent={(contentId) => {
                const found = contents.find(c => c.id === contentId);
                if (found) {
                  setActiveTab('library');
                  handleSelectContent(found);
                } else {
                  portalAction({ action: 'get_content_by_id', content_id: contentId }).then((result) => {
                    if (result?.content) {
                      setActiveTab('library');
                      handleSelectContent(result.content as PortalContent);
                    }
                  });
                }
              }}
              onOpenScript={() => {
                setActiveTab('criativa');
              }}
              onNavigateTab={(tab) => setActiveTab(tab as TabView)}
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
      <div className="sm:hidden flex overflow-x-auto border-b border-white/[0.06]" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setActiveTab('library')} className={`flex-none px-4 py-3 text-[11px] font-medium text-center transition-colors whitespace-nowrap ${activeTab === 'library' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'library' ? { borderColor: `hsl(${clientColor})` } : {}}>
          Biblioteca
        </button>
        <button onClick={() => setActiveTab('criativa')} className={`flex-none px-4 py-3 text-[11px] font-medium text-center transition-colors whitespace-nowrap ${activeTab === 'criativa' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'criativa' ? { borderColor: `hsl(${clientColor})` } : {}}>
          Zona Criativa
        </button>
        <button onClick={() => setActiveTab('agenda')} className={`flex-none px-4 py-3 text-[11px] font-medium text-center transition-colors whitespace-nowrap ${activeTab === 'agenda' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'agenda' ? { borderColor: `hsl(${clientColor})` } : {}}>
          Agenda
        </button>
        {(client.show_metrics || isTeamMember) && (
          <button onClick={() => setActiveTab('metrics')} className={`flex-none px-4 py-3 text-[11px] font-medium text-center transition-colors whitespace-nowrap ${activeTab === 'metrics' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'metrics' ? { borderColor: `hsl(${clientColor})` } : {}}>
            Métricas
          </button>
        )}
        <button onClick={() => setActiveTab('designer')} className={`flex-none px-4 py-3 text-[11px] font-medium text-center transition-colors whitespace-nowrap ${activeTab === 'designer' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'designer' ? { borderColor: `hsl(${clientColor})` } : {}}>
          🎨 Designer
        </button>
        {client.has_vehicle_flyer && (
          <button onClick={() => setActiveTab('panfletagem')} className={`flex-none px-4 py-3 text-[11px] font-medium text-center transition-colors whitespace-nowrap ${activeTab === 'panfletagem' ? 'text-white border-b-2' : 'text-white/40'}`} style={activeTab === 'panfletagem' ? { borderColor: `hsl(${clientColor})` } : {}}>
            🚗 Panfleto
          </button>
        )}
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

                <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-8 sm:py-20">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 mb-4">
                      <Sparkles size={12} style={{ color: `hsl(${clientColor})` }} />
                      <span className="capitalize">Temporada {seasonLabel}</span>
                    </div>
                    <h2 className="text-2xl sm:text-5xl font-bold tracking-tight max-w-lg leading-tight">
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
                      {(client.show_metrics || isTeamMember) && (
                        <button
                          onClick={() => setActiveTab('metrics')}
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-white/10 hover:bg-white/15 transition-all hover:scale-105 active:scale-95"
                        >
                          <BarChart3 size={16} /> Ver métricas
                        </button>
                      )}
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
            <div className="max-w-[1400px] mx-auto px-3 sm:px-8 pb-20 space-y-6 sm:space-y-10 mt-2 sm:mt-4">
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
        ) : activeTab === 'designer' ? (
          <PortalDesigner clientId={client.id} clientColor={clientColor} />
        ) : activeTab === 'agenda' ? (
          <PortalRecordingCalendar clientId={client.id} clientColor={clientColor} />
        ) : activeTab === 'panfletagem' && client.has_vehicle_flyer ? (
          <motion.div key="panfletagem" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <PortalPanfletagem clientId={client.id} clientColor={clientColor} clientName={client.company_name} clientLogoUrl={client.logo_url} clientWhatsapp={client.whatsapp} clientCity={client.city} />
          </motion.div>
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
              className="max-w-5xl mx-auto my-2 sm:my-8"
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
                    {videoLoading ? (
                      <div className="aspect-video flex flex-col items-center justify-center gap-3 bg-[#0c0c14] text-white/60">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Carregando vídeo...</p>
                      </div>
                    ) : videoLoadError ? (
                      <div className="aspect-video flex flex-col items-center justify-center gap-3 bg-[#0c0c14] text-center px-6 text-white/60">
                        <Film size={36} className="text-white/20" />
                        <p className="text-sm">{videoLoadError}</p>
                        <button
                          onClick={() => {
                            setVideoLoadError(null);
                            setResolvedVideoUrl(null);
                            setVideoLoading(true);
                            if (selectedContent?.file_url && shouldProxyPortalVideo(selectedContent.file_url)) {
                              createPortalVideoObjectUrl(selectedContent.file_url, videoQuality)
                                .then(url => { setResolvedVideoUrl(url); setVideoLoading(false); })
                                .catch(err => { setVideoLoadError(err instanceof Error ? err.message : 'Erro'); setVideoLoading(false); });
                            } else if (selectedContent?.file_url) {
                              setResolvedVideoUrl(selectedContent.file_url);
                              setVideoLoading(false);
                            }
                          }}
                          className="mt-1 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/80 transition-colors"
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ) : resolvedVideoUrl ? (
                      <>
                        <video
                          key={`${selectedContent.id}-${resolvedVideoUrl}`}
                          ref={videoRef}
                          src={resolvedVideoUrl}
                          playsInline
                          preload="metadata"
                          className="w-full aspect-video object-contain bg-black"
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onEnded={() => setIsPlaying(false)}
                          onTimeUpdate={handleTimeUpdate}
                          onLoadedMetadata={handleTimeUpdate}
                          onClick={() => void togglePlay()}
                        />
                        {/* Custom controls */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 sm:p-4 pt-12 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                              <button onClick={() => void togglePlay()} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
                                {isPlaying ? <Pause size={18} /> : <Play size={18} fill="white" />}
                              </button>
                              <button onClick={toggleMute} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
                                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                              </button>
                              <span className="text-xs text-white/60 font-mono">
                                {formatDuration(videoProgress)} / {formatDuration(videoDuration)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Quality selector */}
                              <button
                                onClick={() => {
                                  const next: VideoQuality = videoQuality === '480p' ? 'original' : '480p';
                                  setVideoQuality(next);
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                  videoQuality === 'original'
                                    ? 'bg-white/25 text-white'
                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                }`}
                                title={videoQuality === '480p' ? 'Clique para qualidade HD' : 'Clique para 480p (mais rápido)'}
                              >
                                {videoQuality === '480p' ? '480p' : 'HD'}
                              </button>
                              <button onClick={toggleFullscreen} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
                                <Maximize size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Center play button */}
                        {!isPlaying && (
                          <button onClick={() => void togglePlay()} className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                              <Play size={28} fill="white" className="ml-1" />
                            </div>
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="aspect-video flex items-center justify-center bg-[#0c0c14]">
                        <Film size={64} className="text-white/10" />
                      </div>
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

                {/* Download button */}
                {selectedContent.file_url && (
                  <div>
                    <a
                      href={selectedContent.file_url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm bg-white/10 hover:bg-white/15 text-white transition-all hover:scale-105 active:scale-95 border border-white/[0.08]"
                    >
                      <Download size={16} /> Baixar conteúdo
                    </a>
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

/* ── Reels Card with smart preview ── */
function ReelsCard({ content, clientColor, onSelect }: {
  content: PortalContent;
  clientColor: string;
  onSelect: (c: PortalContent) => void;
}) {
  const isVideo = isPortalVideo(content);
  const Icon = CONTENT_TYPE_ICONS[content.content_type] || Film;
  const statusStyle = STATUS_COLORS[content.status];
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const loadingRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);

  // Only load video when user hovers — NOT on mount
  useEffect(() => {
    if (!isHovering || !isVideo || !content.file_url || loadingRef.current || previewUrl) return;
    if (!shouldProxyPortalVideo(content.file_url)) {
      setPreviewUrl(content.file_url);
      return;
    }

    let cancelled = false;
    loadingRef.current = true;

    createPortalVideoObjectUrl(content.file_url)
      .then(url => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrlRef.current = url;
        setPreviewUrl(url);
      })
      .catch(() => { if (!cancelled) setPreviewUrl(null); })
      .finally(() => { loadingRef.current = false; });

    return () => { cancelled = true; };
  }, [isHovering, isVideo, content.file_url, previewUrl]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const canAutoplayPreview = isVideo && !!previewUrl && isHovering;

  return (
    <button
      onClick={() => onSelect(content)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => { setIsHovering(false); setPreviewVisible(false); }}
      className="group relative shrink-0 w-[120px] sm:w-[170px] snap-start rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.04] hover:ring-1 focus:outline-none bg-white/[0.03]"
      style={{ '--tw-ring-color': `hsl(${clientColor} / 0.5)` } as any}
    >
      <div className="aspect-[9/16] relative overflow-hidden">
        {content.thumbnail_url ? (
          <img src={content.thumbnail_url} alt={content.title} loading="lazy" className="w-full h-full object-cover" />
        ) : content.file_url && content.content_type === 'arte' ? (
          <img src={content.file_url} alt={content.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.04]">
            <Icon size={32} className="text-white/10" />
          </div>
        )}

        {canAutoplayPreview && (
          <video
            src={previewUrl!}
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${previewVisible ? 'opacity-100' : 'opacity-0'}`}
            onLoadedData={() => setPreviewVisible(true)}
            onError={() => {
              setPreviewVisible(false);
              setPreviewUrl(null);
            }}
            onTimeUpdate={(e) => {
              const vid = e.currentTarget;
              if (vid.currentTime >= 6) {
                vid.currentTime = 0;
              }
            }}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center transition-colors group-hover:bg-white/25">
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

        {content.duration_seconds > 0 && (
          <span className="absolute bottom-8 right-1.5 bg-black/80 text-[10px] px-1.5 py-0.5 rounded font-mono text-white/80">
            {Math.floor(content.duration_seconds / 60)}:{(content.duration_seconds % 60).toString().padStart(2, '0')}
          </span>
        )}

        <div className={`absolute top-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${statusStyle?.bg} ${statusStyle?.text} backdrop-blur-sm`}>
          <span className={`w-1 h-1 rounded-full ${statusStyle?.dot}`} />
          {STATUS_LABELS[content.status]}
        </div>

        <div className="absolute bottom-0 inset-x-0 p-2.5">
          <p className="text-xs font-medium truncate text-white/90">{content.title}</p>
          <span className="text-[10px] text-white/40 mt-0.5 block">{CONTENT_TYPE_LABELS[content.content_type]}</span>
        </div>
      </div>
    </button>
  );
}