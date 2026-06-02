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
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadModalLesson, setUploadModalLesson] = useState<Lesson | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    loadTracks();
  }, [forceUpdate]);

  useEffect(() => {
    if (selectedTrack) {
      loadTrackDetails(selectedTrack.id);
    }
  }, [selectedTrack, forceUpdate]);

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
      const { error: updateError } = await supabase
        .from('training_lessons')
        .update({ video_url: videoUrl, video_path: result.path || videoUrl } as any)
        .eq('id', lessonId);

      if (updateError) throw updateError;

      setLessons(prev => prev.map(l => 
        l.id === lessonId ? { ...l, video_url: videoUrl, video_path: result.path || videoUrl } : l
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
            <div className="absolute bottom-12 left-8 lg:left-12 z-20 max-w-2xl space-y-4">
              <Badge className="bg-red-600 text-white border-none px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.25em] rounded-sm">Em Destaque</Badge>
              <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase italic leading-[0.95]">{tracks[0]?.title || "Treinamento Pulse"}</h1>
              <p className="text-sm lg:text-base text-gray-300/90 line-clamp-2 max-w-xl">{tracks[0]?.description}</p>
              <div className="flex gap-3 pt-2">
                <Button size="lg" className="bg-white text-black hover:bg-gray-200 px-7 font-black uppercase italic tracking-widest text-xs h-11" onClick={() => tracks[0] && setSelectedTrack(tracks[0])}>
                  <Play className="mr-2 fill-current" size={18} /> Assistir
                </Button>
                <Button size="lg" variant="ghost" className="bg-white/10 backdrop-blur hover:bg-white/20 text-white px-7 font-black uppercase italic tracking-widest text-xs h-11" onClick={() => { const el = document.getElementById('trilhas-catalogo'); el?.scrollIntoView({ behavior: 'smooth' }); }}>
                  <Info className="mr-2" size={16} /> Explorar
                </Button>
              </div>
            </div>
          </div>

          {/* ── CATÁLOGO COMPLETO ── */}
          <div id="trilhas-catalogo" className="px-6 lg:px-12 pt-10 space-y-14">
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
                  <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-white/10 shadow-xl">
                        <img src={track.thumbnail_url} className="w-full h-full object-cover" alt={track.title} onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=600'; }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-600 mb-1">{track.category || 'Trilha'}</p>
                        <h3 className="text-xl lg:text-2xl font-black italic uppercase tracking-tighter text-white truncate">{track.title}</h3>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                          <span>{trackMods.length} módulos</span>
                          <span className="text-zinc-700">·</span>
                          <span>{trackLessonsAll.length} aulas</span>
                          <span className="text-zinc-700">·</span>
                          <span className="text-emerald-500/80">{filled} com vídeo</span>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" className="bg-white text-black hover:bg-gray-200 gap-2 font-black uppercase tracking-widest text-[10px] h-9 px-5 shrink-0" onClick={() => setSelectedTrack(track)}>
                      <Play size={12} className="fill-current" /> Abrir trilha
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
        <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto p-6 lg:p-10">
          <div className="flex items-center justify-between mb-8">
            <Button variant="ghost" onClick={() => { setSelectedTrack(null); setCurrentVideo(null); }} className="text-white hover:text-red-600 gap-2"><ChevronLeft size={24} /> Voltar para o catálogo</Button>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-red-600">Pulse <span className="text-white">Original</span></h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8 space-y-8">
              <div className="aspect-video bg-black rounded-3xl overflow-hidden border border-white/5 relative shadow-2xl group ring-1 ring-white/10">
                {currentVideo?.video_url ? (
                  <iframe src={currentVideo.video_url.includes('youtube') ? currentVideo.video_url.replace('watch?v=', 'embed/') : currentVideo.video_url} className="w-full h-full" allowFullScreen key={currentVideo.video_url} />
                ) : (
                  <div className="w-full h-full relative">
                    <img src={selectedTrack.thumbnail_url} className="w-full h-full object-cover opacity-40" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <Button size="lg" className="rounded-full w-24 h-24 bg-red-600 text-white hover:scale-110 hover:bg-red-700 transition-all p-0 shadow-[0_0_50px_rgba(220,38,38,0.3)]" onClick={() => { const firstLesson = lessons[0]; if (firstLesson) setCurrentVideo(firstLesson); }}><Play size={48} className="ml-2 fill-current" /></Button>
                      <p className="mt-6 text-2xl font-black uppercase tracking-[0.2em] italic text-white drop-shadow-lg">Assistir Agora</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-2">
                    <h2 className="text-5xl font-black tracking-tighter uppercase italic leading-none">{currentVideo?.title || selectedTrack.title}</h2>
                    <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest"><span className="text-emerald-500">2026</span><Badge variant="outline" className="text-white border-white/20 px-2 py-0.5 rounded-sm">16+</Badge><span className="text-gray-500">Metodologia {currentVideo?.methodology_name || selectedTrack.category}</span></div>
                  </div>
                  {currentVideo && (
                    <Button variant={currentVideo.status === 'completed' ? "secondary" : "destructive"} className={cn("rounded-full h-14 px-8 gap-3 font-black uppercase italic tracking-widest transition-all", currentVideo.status === 'completed' ? 'bg-emerald-600 text-white' : 'bg-white text-black')} onClick={() => updateProgress(currentVideo.id, currentVideo.status === 'completed' ? 'in_progress' : 'completed')}>
                      {currentVideo.status === 'completed' ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                      {currentVideo.status === 'completed' ? 'Concluído' : 'Marcar Aula'}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  <div className="md:col-span-2 space-y-8"><p className="text-xl text-gray-300 leading-relaxed font-medium">{currentVideo?.description || selectedTrack.description}</p></div>
                  <div className="space-y-8">
                    <div className="bg-zinc-900/50 rounded-3xl p-8 border border-white/5 backdrop-blur-md shadow-2xl ring-1 ring-white/5">
                      <h4 className="text-[10px] font-black uppercase text-gray-500 mb-6 tracking-[0.3em]">Status de Elite</h4>
                      <div className="space-y-6">
                        <div className="flex justify-between items-end"><span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Desempenho</span><span className="font-black text-3xl text-emerald-500 italic leading-none">{getCourseProgress()}%</span></div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${getCourseProgress()}%` }} className="bg-emerald-500 h-full shadow-[0_0_15px_rgba(16,185,129,0.6)]" transition={{ duration: 1.5 }} /></div>
                      </div>
                    </div>
                    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-red-600/20">
                      {modules.length === 0 && (
                        <div className="text-center py-12 text-zinc-500 text-xs font-bold uppercase tracking-widest">Nenhum módulo cadastrado ainda</div>
                      )}
                      {modules.map((mod, modIdx) => {
                        const modLessons = lessons.filter(l => l.module_id === mod.id);
                        return (
                        <div key={mod.id} className="space-y-4">
                          <div className="flex items-center gap-3 px-2"><div className="h-10 w-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-600 font-black text-sm italic">{modIdx + 1}</div><h4 className="text-[12px] font-black uppercase tracking-[0.15em] text-white/90 truncate">{mod.title}</h4></div>
                          <div className="space-y-3">
                            {modLessons.length === 0 && (
                              <div className="px-4 py-3 rounded-2xl border border-dashed border-white/10 text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Slots em breve</div>
                            )}
                            {modLessons.map((lesson, lessonIdx) => (
                              <button key={lesson.id} onClick={() => setCurrentVideo(lesson)} className={cn("w-full group flex items-center gap-5 p-4 rounded-2xl transition-all border text-left relative overflow-hidden", currentVideo?.id === lesson.id ? 'bg-red-600/10 border-red-600/30' : 'bg-zinc-900/40 border-transparent hover:bg-zinc-800/60')}>
                                <div className="relative w-24 aspect-video shrink-0 bg-zinc-800 rounded-xl overflow-hidden border border-white/5 shadow-xl transition-transform duration-500 group-hover:scale-105">
                                  <div className={cn("absolute inset-0 z-10 flex items-center justify-center transition-all duration-300", currentVideo?.id === lesson.id ? 'bg-red-600/40 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100')}><Play size={20} className={cn("text-white fill-current", currentVideo?.id === lesson.id && "animate-pulse")} /></div>
                                  {lesson.thumbnail_url ? (
                                    <img src={lesson.thumbnail_url} className="w-full h-full object-cover" alt={lesson.title} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-red-600/30 to-zinc-950 flex flex-col items-center justify-center gap-1">
                                      <Video size={20} className="text-white/40" />
                                      <span className="text-[8px] font-black uppercase tracking-widest text-white/60">Slot {lessonIdx + 1}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-xs font-black italic uppercase tracking-tighter truncate", currentVideo?.id === lesson.id ? 'text-red-500' : 'text-zinc-300')}>{lesson.title || `Slot ${lessonIdx + 1}`}</p>
                                  <div className="flex items-center gap-3 mt-1.5">
                                    <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em]">{lesson.duration || (lesson.video_url ? '—' : 'Sem vídeo')}</span>
                                    {lesson.status === 'completed' && <CheckCircle2 size={12} className="text-emerald-500" />}
                                  </div>
                                </div>
                                {isAdmin && (
                                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                     <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-black/60 backdrop-blur-md hover:bg-red-600 text-white" onClick={(e) => { e.stopPropagation(); setUploadModalLesson(lesson); }}><Upload size={12} /></Button>
                                     {lesson.video_url && <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-black/60 backdrop-blur-md hover:bg-destructive text-white" onClick={(e) => { e.stopPropagation(); deleteLessonVideo(lesson.id); }}><Trash2 size={12} /></Button>}
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
