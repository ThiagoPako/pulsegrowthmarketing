import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Play, CheckCircle2, Circle, Clock, ChevronRight, ChevronLeft, Info, X, Video, FileText, Plus, Trash2, FolderPlus, Loader2, FileVideo, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface Track {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
  estimated_time?: string;
  difficulty?: string;
}

interface Module {
  id: string;
  title: string;
  description: string;
  display_order: number;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string;
  video_url: string;
  video_path?: string;
  methodology_name: string;
  duration: string;
  display_order: number;
  status?: 'not_started' | 'in_progress' | 'completed';
  content_markdown?: string;
  thumbnail_url?: string;
}

export default function TrainingModuleView({ userId }: { userId: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [catalogModules, setCatalogModules] = useState<Module[] & { track_id?: string }[]>([]);
  const [catalogLessons, setCatalogLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentVideo, setCurrentVideo] = useState<Lesson | null>(null);
  const [signedVideoUrl, setSignedVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadModalLesson, setUploadModalLesson] = useState<Lesson | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { profile, session } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const currentVideoSource = currentVideo?.video_url || currentVideo?.video_path || '';
  const isExternalVideo = /youtube|vimeo/i.test(currentVideoSource);

  const getTrainingAuthToken = () => {
    const vpsToken = localStorage.getItem('pulse_jwt');
    if (vpsToken) return vpsToken;

    if (session?.access_token) return session.access_token;

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.includes('auth-token')) continue;

        const rawValue = localStorage.getItem(key);
        if (!rawValue) continue;

        const parsedValue = JSON.parse(rawValue);

        if (typeof parsedValue?.access_token === 'string') return parsedValue.access_token;
        if (typeof parsedValue?.currentSession?.access_token === 'string') return parsedValue.currentSession.access_token;

        if (Array.isArray(parsedValue)) {
          const sessionCandidate = parsedValue.find(
            (entry) => typeof entry?.access_token === 'string' || typeof entry?.currentSession?.access_token === 'string',
          );

          if (typeof sessionCandidate?.access_token === 'string') return sessionCandidate.access_token;
          if (typeof sessionCandidate?.currentSession?.access_token === 'string') return sessionCandidate.currentSession.access_token;
        }
      }
    } catch {
      return null;
    }

    return null;
  };

  useEffect(() => {
    loadTracks();
  }, [forceUpdate]);

  useEffect(() => {
    if (selectedTrack) {
      loadTrackDetails(selectedTrack.id);
    }
  }, [selectedTrack, forceUpdate]);

  // Fetch short-lived signed URL whenever the selected video changes
  useEffect(() => {
    let cancelled = false;
    setSignedVideoUrl(null);
    if (!currentVideo?.id || !currentVideoSource) return;
    // External providers (YouTube/Vimeo) keep using iframe
    if (isExternalVideo) return;

    (async () => {
      try {
        setVideoLoading(true);
        const token = getTrainingAuthToken();
        const res = await fetch(
          `https://agenciapulse.tech/api/training/sign?lessonId=${encodeURIComponent(currentVideo.id)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.url) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('[training/sign] failed:', reason, data);
          toast.error(`Não foi possível liberar o vídeo: ${reason}`);
          return;
        }
        const url = data.url.startsWith('http') ? data.url : `https://agenciapulse.tech${data.url}`;
        setSignedVideoUrl(url);
      } catch {
        if (!cancelled) toast.error('Falha ao carregar vídeo protegido.');
      } finally {
        if (!cancelled) setVideoLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentVideo?.id, currentVideoSource, isExternalVideo, session?.access_token]);

  const loadTracks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('training_tracks')
        .select('id, title, description, thumbnail_url, category, estimated_time, difficulty, is_active')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const list = data || [];
      setTracks(list);

      if (list.length > 0) {
        const trackIds = list.map((t: any) => t.id);
        const [modsRes, lessRes] = await Promise.allSettled([
          supabase.from('training_modules').select('id, track_id, title, description, display_order').in('track_id', trackIds).order('display_order', { ascending: true }),
          supabase.from('training_lessons').select('id, module_id, title, description, video_url, video_path, methodology_name, duration, display_order, thumbnail_url').order('display_order', { ascending: true }),
        ]);
        const mods = modsRes.status === 'fulfilled' ? (modsRes.value.data || []) : [];
        const less = lessRes.status === 'fulfilled' ? (lessRes.value.data || []) : [];
        if (modsRes.status === 'fulfilled' && modsRes.value.error) console.error('[Academy] catalog modules:', modsRes.value.error);
        if (lessRes.status === 'fulfilled' && lessRes.value.error) console.error('[Academy] catalog lessons:', lessRes.value.error);
        setCatalogModules(mods as any);
        setCatalogLessons(less as any);
      }
    } catch (err: any) {
      console.error('Error loading tracks:', err);
      toast.error('Erro ao carregar trilhas: ' + (err.message || 'Erro de conexão'));
    } finally {
      setLoading(false);
    }
  };

  const loadTrackDetails = async (trackId: string) => {
    setLoading(true);
    try {
      const { data: modData, error: modErr } = await supabase
        .from('training_modules')
        .select('id, title, description, display_order')
        .eq('track_id', trackId)
        .order('display_order', { ascending: true });

      if (modErr) {
        console.error('[Academy] modules error:', modErr);
        toast.error('Erro ao carregar módulos: ' + (modErr.message || ''));
      }

      const safeModules = modData || [];
      setModules(safeModules);

      const moduleIds = safeModules.map(m => m.id);
      if (moduleIds.length === 0) {
        setLessons([]);
        return;
      }

      const [lessRes, progRes] = await Promise.allSettled([
        supabase
          .from('training_lessons')
          .select('id, module_id, title, description, video_url, video_path, methodology_name, duration, display_order, content_markdown, thumbnail_url')
          .in('module_id', moduleIds)
          .order('display_order', { ascending: true }),
        supabase
          .from('user_training_progress')
          .select('lesson_id, status')
          .eq('user_id', userId),
      ]);

      let lessData: any[] = [];
      if (lessRes.status === 'fulfilled') {
        if (lessRes.value.error) console.error('[Academy] lessons error:', lessRes.value.error);
        lessData = lessRes.value.data || [];
      } else {
        console.error('[Academy] lessons rejected:', lessRes.reason);
      }

      let progressData: any[] = [];
      if (progRes.status === 'fulfilled' && !progRes.value.error) {
        progressData = progRes.value.data || [];
      } else if (progRes.status === 'fulfilled') {
        console.warn('[Academy] progress error (ignorado):', progRes.value.error);
      }

      const progressMap = new Map(progressData.map(p => [p.lesson_id, p.status]));
      setLessons(lessData.map((l: any) => ({ ...l, status: progressMap.get(l.id) || 'not_started' })));
    } catch (error: any) {
      console.error('Error loading track details:', error);
      toast.error('Erro ao carregar detalhes: ' + (error?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, lessonId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(lessonId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'training-videos');
      formData.append('path', 'training-videos');

      const token = localStorage.getItem('pulse_jwt');
      const response = await fetch('https://agenciapulse.tech/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro no upload');

      const videoUrl = result.url;
      const resolvedVideoPath = result.path || result.filename || videoUrl;
      const { error: updateError } = await supabase
        .from('training_lessons')
        .update({ video_url: videoUrl, video_path: resolvedVideoPath } as any)
        .eq('id', lessonId);

      if (updateError) throw updateError;

      setLessons(prev => prev.map(l => 
        l.id === lessonId ? { ...l, video_url: videoUrl, video_path: resolvedVideoPath } : l
      ));

      toast.success('Vídeo enviado com sucesso!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro no upload: ' + error.message);
    } finally {
      setUploading(null);
      setSelectedFile(null);
      setUploadModalLesson(null);
    }
  };

  const deleteLessonVideo = async (id: string) => {
    if (!confirm('Excluir este vídeo?')) return;
    const { error } = await supabase.from('training_lessons').update({ video_url: null, video_path: null } as any).eq('id', id);
    if (!error) {
      setLessons(prev => prev.map(l => l.id === id ? { ...l, video_url: '', video_path: undefined } : l));
      toast.success('Vídeo removido');
    }
  };

  const updateProgress = async (lessonId: string, newStatus: 'not_started' | 'in_progress' | 'completed') => {
    try {
      const { data: existing } = await supabase
        .from('user_training_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('lesson_id', lessonId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_training_progress')
          .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null } as any)
          .eq('id', existing.id);
      } else {
        await supabase
          .from('user_training_progress')
          .insert({ 
            user_id: userId, 
            lesson_id: lessonId, 
            status: newStatus,
            completed_at: newStatus === 'completed' ? new Date().toISOString() : null
          } as any);
      }
      
      setLessons(lessons.map(l => l.id === lessonId ? { ...l, status: newStatus } : l));
      if (newStatus === 'completed') toast.success('Aula concluída!');
    } catch (e) {
      console.error('Progress update error:', e);
    }
  };

  const getCourseProgress = () => {
    if (lessons.length === 0) return 0;
    const completed = lessons.filter(l => l.status === 'completed').length;
    return Math.round((completed / lessons.length) * 100);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollContainerRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  if (loading && !selectedTrack) return (
    <div className="flex justify-center items-center h-[60vh]">
      <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white -m-6 font-sans">
      {!selectedTrack ? (
        <div className="pb-24">
          {/* ── HERO ── */}
          <div className="relative h-[58vh] min-h-[440px] overflow-hidden">
            <div className="absolute top-5 left-8 lg:left-12 z-50 flex items-center gap-4">
              <h2 className="text-xl font-black italic uppercase tracking-tighter text-red-600">Pulse <span className="text-white">Academy</span></h2>
              <Button size="sm" variant="ghost" className="text-[10px] text-white/20 hover:text-white h-7" onClick={() => setForceUpdate(p => p + 1)}>Recarregar</Button>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/70 to-transparent z-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent z-10" />
            <img
              src={tracks[0]?.thumbnail_url || "https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=2070"}
              className="w-full h-full object-cover opacity-70"
              alt="Featured"
            />
            <div className="absolute bottom-6 sm:bottom-12 left-4 sm:left-8 lg:left-12 right-4 z-20 max-w-2xl space-y-3 sm:space-y-4">
              <Badge className="bg-red-600 text-white border-none px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.25em] rounded-sm">Em Destaque</Badge>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tighter uppercase italic leading-[0.95]">{tracks[0]?.title || "Treinamento Pulse"}</h1>
              <p className="text-xs sm:text-sm lg:text-base text-gray-300/90 line-clamp-2 max-w-xl">{tracks[0]?.description}</p>
              <div className="flex gap-2 sm:gap-3 pt-1 sm:pt-2">
                <Button size="lg" className="bg-white text-black hover:bg-gray-200 px-4 sm:px-7 font-black uppercase italic tracking-widest text-[11px] sm:text-xs h-9 sm:h-11" onClick={() => tracks[0] && setSelectedTrack(tracks[0])}>
                  <Play className="mr-1.5 sm:mr-2 fill-current" size={16} /> Assistir
                </Button>
                <Button size="lg" variant="ghost" className="bg-white/10 backdrop-blur hover:bg-white/20 text-white px-4 sm:px-7 font-black uppercase italic tracking-widest text-[11px] sm:text-xs h-9 sm:h-11" onClick={() => { const el = document.getElementById('trilhas-catalogo'); el?.scrollIntoView({ behavior: 'smooth' }); }}>
                  <Info className="mr-1.5 sm:mr-2" size={14} /> Explorar
                </Button>
              </div>
            </div>
          </div>

          {/* ── CATÁLOGO COMPLETO ── */}
          <div id="trilhas-catalogo" className="px-3 sm:px-6 lg:px-12 pt-6 sm:pt-10 space-y-8 sm:space-y-14">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-red-600 mb-1">Catálogo</p>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Todas as Trilhas</h2>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">{tracks.length} {tracks.length === 1 ? 'trilha' : 'trilhas'}</p>
            </div>

            {tracks.map((track) => {
              const trackMods = (catalogModules as any[]).filter(m => m.track_id === track.id).sort((a,b) => (a.display_order||0)-(b.display_order||0));
              const trackLessonsAll = catalogLessons.filter(l => trackMods.some(m => m.id === l.module_id));
              const filled = trackLessonsAll.filter(l => l.video_url).length;
              return (
                <section key={`cat-${track.id}`} className="space-y-5">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 sm:pb-4">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden shrink-0 border border-white/10 shadow-xl">
                        <img src={track.thumbnail_url} className="w-full h-full object-cover" alt={track.title} onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=600'; }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-red-600 mb-0.5 sm:mb-1">{track.category || 'Trilha'}</p>
                        <h3 className="text-base sm:text-xl lg:text-2xl font-black italic uppercase tracking-tighter text-white truncate">{track.title}</h3>
                        <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-1.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-zinc-500 flex-wrap">
                          <span>{trackMods.length} mód.</span>
                          <span className="text-zinc-700">·</span>
                          <span>{trackLessonsAll.length} aulas</span>
                          <span className="text-zinc-700 hidden sm:inline">·</span>
                          <span className="text-emerald-500/80 hidden sm:inline">{filled} com vídeo</span>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" className="bg-white text-black hover:bg-gray-200 gap-1.5 sm:gap-2 font-black uppercase tracking-widest text-[10px] h-8 sm:h-9 px-3 sm:px-5 shrink-0" onClick={() => setSelectedTrack(track)}>
                      <Play size={12} className="fill-current" /> <span className="hidden sm:inline">Abrir trilha</span><span className="sm:hidden">Abrir</span>
                    </Button>
                  </div>

                  {trackMods.length === 0 ? (
                    <div className="text-[11px] uppercase tracking-widest text-zinc-600 font-bold px-2 py-8 text-center border border-dashed border-white/10 rounded-2xl">Nenhum módulo cadastrado</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                      {trackMods.map((mod, modIdx) => {
                        const modLessons = catalogLessons.filter(l => l.module_id === mod.id).sort((a,b) => (a.display_order||0)-(b.display_order||0));
                        const filledSlots = Math.max(modLessons.length, 2);
                        const slots: (Lesson | null)[] = Array.from({ length: filledSlots }, (_, i) => modLessons[i] || null);
                        const withVideo = modLessons.filter(l => l.video_url).length;
                        return (
                          <motion.div
                            key={mod.id}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: modIdx * 0.04 }}
                            className="group bg-gradient-to-b from-zinc-900/60 to-zinc-900/20 border border-white/5 hover:border-red-600/30 rounded-2xl p-4 space-y-3 transition-all hover:shadow-[0_0_30px_rgba(220,38,38,0.08)]"
                          >
                            <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-600/20 to-red-600/5 border border-red-600/30 flex items-center justify-center text-red-500 font-black text-sm italic shrink-0">{String(modIdx + 1).padStart(2, '0')}</div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-white truncate group-hover:text-red-500 transition-colors">{mod.title}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500/70" style={{ width: `${filledSlots ? (withVideo / filledSlots) * 100 : 0}%` }} />
                                  </div>
                                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 tabular-nums">{withVideo}/{filledSlots}</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              {slots.map((lesson, slotIdx) => (
                                <button
                                  key={lesson?.id || `empty-${mod.id}-${slotIdx}`}
                                  onClick={() => { if (lesson) { setSelectedTrack(track); setCurrentVideo(lesson); } else { setSelectedTrack(track); } }}
                                  className={cn(
                                    "w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left border transition-all",
                                    lesson?.video_url
                                      ? "bg-zinc-900/40 border-white/5 hover:border-red-600/40 hover:bg-red-600/5"
                                      : lesson
                                        ? "bg-zinc-900/30 border-white/5 hover:border-amber-500/30"
                                        : "bg-transparent border-dashed border-white/5 hover:border-white/20"
                                  )}
                                >
                                  <div className="relative w-12 aspect-video shrink-0 rounded-md overflow-hidden bg-zinc-950 border border-white/5">
                                    {lesson?.thumbnail_url ? (
                                      <img src={lesson.thumbnail_url} className="w-full h-full object-cover" alt={lesson.title} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                      <div className={cn("w-full h-full flex items-center justify-center", lesson ? "bg-gradient-to-br from-red-600/20 to-zinc-950" : "bg-zinc-950")}>
                                        <Video size={12} className={cn(lesson ? "text-white/40" : "text-white/15")} />
                                      </div>
                                    )}
                                    <span className="absolute top-0.5 left-0.5 text-[7px] font-black text-white/80 bg-black/60 px-1 rounded leading-none py-0.5">{String(slotIdx + 1).padStart(2, '0')}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={cn("text-[10px] font-black uppercase tracking-tight truncate", lesson?.video_url ? "text-white/95" : lesson ? "text-white/70" : "text-zinc-600")}>{lesson?.title || `Slot ${slotIdx + 1} — vazio`}</p>
                                    <p className={cn("text-[8px] font-bold uppercase tracking-[0.2em] mt-0.5", lesson?.video_url ? "text-emerald-500/80" : "text-zinc-600")}>
                                      {lesson?.video_url ? (lesson.duration || 'Disponível') : lesson ? 'Aguardando vídeo' : 'Vazio'}
                                    </p>
                                  </div>
                                  {lesson?.video_url ? (
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] shrink-0" />
                                  ) : lesson ? (
                                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500/60 shrink-0" />
                                  ) : (
                                    <div className="h-1.5 w-1.5 rounded-full bg-white/10 shrink-0" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>

      ) : (
        <div className="animate-in fade-in duration-300">
          {/* Top bar */}
          <div className="sticky top-0 z-40 flex items-center justify-between px-3 sm:px-5 lg:px-8 py-2 sm:py-3 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent backdrop-blur-sm">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedTrack(null); setCurrentVideo(null); }} className="text-white/80 hover:text-white hover:bg-white/5 gap-1.5 h-8 px-2 text-xs font-bold">
              <ChevronLeft size={16} /> Catálogo
            </Button>
            <h2 className="text-sm sm:text-base font-black italic uppercase tracking-tighter text-red-600">Pulse <span className="text-white">Academy</span></h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 px-3 sm:px-5 lg:px-8 pb-8 sm:pb-12">
            {/* LEFT — Player + metadata */}
            <div className="lg:col-span-8 space-y-3 sm:space-y-4">
              <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/5 relative shadow-2xl">
                {currentVideoSource ? (
                  isExternalVideo ? (
                    <iframe
                      src={currentVideoSource.includes('youtube') ? currentVideoSource.replace('watch?v=', 'embed/') : currentVideoSource}
                      className="w-full h-full"
                      allowFullScreen
                      key={currentVideoSource}
                    />
                  ) : signedVideoUrl ? (
                    <video
                      src={signedVideoUrl}
                      className="w-full h-full bg-black"
                      controls
                      crossOrigin="use-credentials"
                      controlsList="nodownload noremoteplayback noplaybackrate"
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      playsInline
                      preload="metadata"
                      key={signedVideoUrl}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/60 text-xs font-black uppercase tracking-[0.3em]">
                      {videoLoading ? <><Loader2 className="animate-spin mr-2" size={16} /> Liberando vídeo…</> : 'Aguardando autorização…'}
                    </div>
                  )
                ) : (
                  <div className="w-full h-full relative">
                    <img src={selectedTrack.thumbnail_url} className="w-full h-full object-cover opacity-40" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <Button size="lg" className="rounded-full w-16 h-16 bg-red-600 text-white hover:scale-110 hover:bg-red-700 transition-all p-0 shadow-[0_0_40px_rgba(220,38,38,0.5)]" onClick={() => { const firstLesson = lessons.find(l => l.video_url) || lessons[0]; if (firstLesson) setCurrentVideo(firstLesson); }}>
                        <Play size={28} className="ml-1 fill-current" />
                      </Button>
                      <p className="text-[11px] font-black uppercase tracking-[0.3em] italic text-white/90">Assistir Agora</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Title + actions row */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-2xl lg:text-3xl font-black tracking-tighter uppercase italic leading-tight truncate">{currentVideo?.title || selectedTrack.title}</h2>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] flex-wrap">
                    <span className="text-emerald-500">2026</span>
                    <Badge variant="outline" className="text-white/80 border-white/15 px-1.5 py-0 text-[9px] rounded-sm h-4">16+</Badge>
                    <span className="text-zinc-500 truncate">{currentVideo?.methodology_name || selectedTrack.category}</span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-500">{lessons.length} aulas</span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-emerald-500/80">{getCourseProgress()}% concluído</span>
                  </div>
                </div>
                {currentVideo && (
                  <Button size="sm" className={cn("rounded-full h-9 px-4 gap-1.5 font-black uppercase italic tracking-widest text-[10px] shrink-0", currentVideo.status === 'completed' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-white text-black hover:bg-zinc-200')} onClick={() => updateProgress(currentVideo.id, currentVideo.status === 'completed' ? 'in_progress' : 'completed')}>
                    {currentVideo.status === 'completed' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    {currentVideo.status === 'completed' ? 'Concluído' : 'Marcar'}
                  </Button>
                )}
              </div>

              {/* Description */}
              <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-3 sm:p-4">
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{currentVideo?.description || selectedTrack.description}</p>
              </div>

              {/* Progress strip */}
              <div className="bg-gradient-to-r from-zinc-900/60 to-zinc-900/20 border border-white/5 rounded-xl p-3 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-zinc-400 font-bold uppercase text-[9px] tracking-[0.25em]">Desempenho</span>
                    <span className="font-black text-lg text-emerald-500 italic leading-none">{getCourseProgress()}%</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${getCourseProgress()}%` }} className="bg-emerald-500 h-full shadow-[0_0_10px_rgba(16,185,129,0.6)]" transition={{ duration: 1.2 }} />
                  </div>
                </div>
                <div className="text-right shrink-0 border-l border-white/5 pl-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Aulas</p>
                  <p className="text-lg font-black italic text-white leading-none mt-1">{lessons.filter(l => l.status === 'completed').length}<span className="text-zinc-600">/{lessons.length}</span></p>
                </div>
              </div>
            </div>

            {/* RIGHT — Episodes list (Netflix style) */}
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-14 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-base font-black italic uppercase tracking-tighter text-white">Episódios</h3>
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">{modules.length} módulos</span>
                </div>

                <div className="space-y-3 lg:max-h-[78vh] lg:overflow-y-auto lg:pr-2 scrollbar-hide">
                  {modules.length === 0 && (
                    <div className="text-center py-10 text-zinc-500 text-[10px] font-bold uppercase tracking-widest border border-dashed border-white/10 rounded-xl">Nenhum módulo cadastrado</div>
                  )}
                  {modules.map((mod, modIdx) => {
                    const modLessons = lessons.filter(l => l.module_id === mod.id);
                    return (
                    <div key={mod.id} className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1 pb-1">
                        <div className="h-6 w-6 rounded-md bg-red-600/15 border border-red-600/30 flex items-center justify-center text-red-500 font-black text-[10px] italic shrink-0">{String(modIdx + 1).padStart(2, '0')}</div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/90 truncate flex-1">{mod.title}</h4>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">{modLessons.length}</span>
                      </div>
                      <div className="space-y-1">
                        {modLessons.length === 0 && (
                          <div className="px-3 py-2 rounded-lg border border-dashed border-white/5 text-[9px] uppercase tracking-widest text-zinc-600 font-bold text-center">Slots em breve</div>
                        )}
                        {modLessons.map((lesson, lessonIdx) => (
                          <button key={lesson.id} onClick={() => setCurrentVideo(lesson)} className={cn("w-full group flex items-center gap-2.5 p-1.5 rounded-lg transition-all border text-left relative", currentVideo?.id === lesson.id ? 'bg-red-600/10 border-red-600/40' : 'bg-zinc-900/40 border-white/5 hover:border-white/15 hover:bg-zinc-900/70')}>
                            <span className="text-[10px] font-black italic text-zinc-600 tabular-nums w-5 text-center shrink-0">{String(lessonIdx + 1).padStart(2, '0')}</span>
                            <div className="relative w-16 aspect-video shrink-0 bg-zinc-950 rounded-md overflow-hidden border border-white/5">
                              <div className={cn("absolute inset-0 z-10 flex items-center justify-center transition-all", currentVideo?.id === lesson.id ? 'bg-red-600/40 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100')}>
                                <Play size={14} className="text-white fill-current" />
                              </div>
                              {lesson.thumbnail_url ? (
                                <img src={lesson.thumbnail_url} className="w-full h-full object-cover" alt={lesson.title} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <div className={cn("w-full h-full flex items-center justify-center", lesson.video_url ? "bg-gradient-to-br from-red-600/30 to-zinc-950" : "bg-zinc-950")}>
                                  <Video size={12} className="text-white/30" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-[10px] font-black uppercase tracking-tight truncate", currentVideo?.id === lesson.id ? 'text-red-500' : 'text-white/90')}>{lesson.title || `Slot ${lessonIdx + 1}`}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-[0.15em]">{lesson.duration || (lesson.video_url ? 'Disponível' : 'Sem vídeo')}</span>
                                {lesson.status === 'completed' && <CheckCircle2 size={9} className="text-emerald-500" />}
                                {!lesson.video_url && <span className="h-1 w-1 rounded-full bg-amber-500/60" />}
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md bg-black/60 hover:bg-red-600 text-white" onClick={(e) => { e.stopPropagation(); setUploadModalLesson(lesson); }}><Upload size={10} /></Button>
                                {lesson.video_url && <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md bg-black/60 hover:bg-destructive text-white" onClick={(e) => { e.stopPropagation(); deleteLessonVideo(lesson.id); }}><Trash2 size={10} /></Button>}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );})}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!uploadModalLesson} onOpenChange={(open) => !open && setUploadModalLesson(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle className="text-2xl font-black italic uppercase italic tracking-tighter">Upload de Vídeo</DialogTitle><DialogDescription className="text-zinc-400">Selecione o vídeo para o slot: {uploadModalLesson?.title}</DialogDescription></DialogHeader>
          <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => modalFileInputRef.current?.click()}>
            <input type="file" ref={modalFileInputRef} className="hidden" accept="video/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            {selectedFile ? <div className="flex flex-col items-center gap-4"><div className="h-16 w-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500"><FileVideo size={32} /></div><div className="text-center"><p className="font-bold text-white truncate max-w-[250px]">{selectedFile.name}</p><p className="text-xs text-zinc-500 uppercase tracking-widest font-black mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p></div></div> : <div className="flex flex-col items-center gap-4 text-zinc-500"><div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center"><Upload size={32} /></div><p className="font-bold uppercase tracking-widest text-xs">Clique para selecionar o vídeo</p></div>}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="text-white hover:bg-white/5" onClick={() => setUploadModalLesson(null)}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white font-black uppercase italic tracking-widest px-8" disabled={!selectedFile || !!uploading} onClick={() => selectedFile && uploadModalLesson && handleFileUpload({ target: { files: [selectedFile] } } as any, uploadModalLesson.id)}>
              {uploading ? <Loader2 className="animate-spin mr-2" /> : <Upload className="mr-2" />} {uploading ? 'Enviando...' : 'Iniciar Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
