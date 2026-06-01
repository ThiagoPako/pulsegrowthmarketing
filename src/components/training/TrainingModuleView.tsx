
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle2, Circle, Clock, ChevronRight, ChevronLeft, Info, X, Video, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

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
}

export default function TrainingModuleView({ userId }: { userId: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentVideo, setCurrentVideo] = useState<Lesson | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    if (selectedTrack) {
      loadTrackDetails(selectedTrack.id);
    }
  }, [selectedTrack]);

  const loadTracks = async () => {
    try {
      console.log('Fetching tracks...');
      const { data, error } = await supabase
        .from('training_tracks')
        .select('id, title, description, thumbnail_url, category, estimated_time, difficulty, is_active')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading tracks:', error);
        toast.error('Erro ao carregar trilhas: ' + (error.message || 'Erro de conexão'));
        return;
      }
      
      console.log('Tracks loaded:', data);
      if (data) {
        setTracks(data);
        if (data.length > 0 && !selectedTrack) {
           // Auto-select first track to show content if it's empty
           console.log('Auto-selecting track:', data[0].title);
        }
      }
    } catch (err) {
      console.error('Unexpected error loading tracks:', err);
    } finally {
      setLoading(false);
    }
  };




  const loadTrackDetails = async (trackId: string) => {
    setLoading(true);
    try {
      console.log('Loading track details for:', trackId);
      const { data: modData, error: modErr } = await supabase
        .from('training_modules')
        .select('id, title, description, display_order')
        .eq('track_id', trackId)
        .order('display_order', { ascending: true });

      if (modErr) throw modErr;

      if (modData) {
        setModules(modData);
        const moduleIds = modData.map(m => m.id);
        
        if (moduleIds.length > 0) {
          const { data: lessData, error: lessErr } = await supabase
            .from('training_lessons')
            .select('id, module_id, title, description, video_url, video_path, methodology_name, duration, display_order, content_markdown')
            .in('module_id', moduleIds)
            .order('display_order', { ascending: true });

          if (lessErr) throw lessErr;

          const { data: progressData } = await supabase
            .from('user_training_progress')
            .select('lesson_id, status')
            .eq('user_id', userId);

          const progressMap = new Map((progressData || []).map(p => [p.lesson_id, p.status]));

          if (lessData) {
            setLessons(lessData.map(l => ({
              ...l,
              status: progressMap.get(l.id) || 'not_started'
            })));
          }
        } else {
          setLessons([]);
        }
      }
    } catch (error: any) {
      console.error('Error loading track details:', error);
      toast.error('Erro ao carregar detalhes do treinamento');
    } finally {
      setLoading(false);
    }
  };



  const updateProgress = async (lessonId: string, newStatus: 'not_started' | 'in_progress' | 'completed') => {
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
    <div className="min-h-screen bg-[#141414] text-white -m-6 p-6 font-sans">
      {!selectedTrack ? (
        <div className="space-y-12 pb-20">
          {/* Billboard */}
          <div className="relative h-[80vh] -mt-6 -mx-6 mb-12 overflow-hidden">
            <div className="absolute top-6 left-12 z-50">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-red-600">Pulse <span className="text-white">Academy</span></h2>
            </div>
            
            <div className="absolute top-6 right-12 z-50 flex items-center gap-6">
               <button onClick={() => window.location.href = '/dashboard'} className="text-sm font-bold text-white/70 hover:text-white transition-colors">Dashboard</button>
               <div className="w-10 h-10 rounded bg-red-600 flex items-center justify-center font-bold text-sm">P</div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/40 to-transparent z-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent z-10" />
            <img 
              src={tracks[0]?.thumbnail_url || "https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=2070"} 
              className="w-full h-full object-cover opacity-60"
              alt="Featured"
            />
            <div className="absolute bottom-[20%] left-12 z-20 max-w-xl space-y-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-red-600 text-white hover:bg-red-700 border-none px-3 py-1 text-sm font-bold uppercase tracking-widest">
                  Destaque
                </Badge>
                {tracks[0]?.difficulty && (
                  <Badge variant="outline" className="border-white/40 text-white uppercase text-[10px] tracking-wider">
                    {tracks[0].difficulty}
                  </Badge>
                )}
              </div>
              <h1 className="text-6xl font-black tracking-tighter uppercase italic">{tracks[0]?.title || "Treinamento Pulse"}</h1>
              <div className="flex items-center gap-4 text-emerald-500 font-bold text-sm">
                <span>Recomendado para você</span>
                <span className="text-gray-400">{tracks[0]?.estimated_time || '2h 30min'}</span>
              </div>
              <p className="text-lg text-gray-300 line-clamp-3">
                {tracks[0]?.description || "Aprenda a nossa metodologia exclusiva de captação e edição rápida. O segredo para vídeos de alta qualidade em tempo recorde."}
              </p>
              <div className="flex gap-3 pt-4">
                <Button 
                  size="lg" 
                  className="bg-white text-black hover:bg-gray-200 px-8 text-lg font-bold"
                  onClick={() => tracks[0] && setSelectedTrack(tracks[0])}
                >
                  <Play className="mr-2 fill-current" /> Assistir
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="bg-gray-500/50 text-white border-none hover:bg-gray-500/70 px-8 text-lg font-bold backdrop-blur-md"
                >
                  <Info className="mr-2" /> Detalhes
                </Button>
              </div>
            </div>
          </div>

          {/* Catalog Row */}
          <div className="space-y-4 relative group">
            <h2 className="text-2xl font-bold ml-4 group-hover:text-red-600 transition-colors">Minhas Trilhas</h2>
            
            <div className="relative">
              <button 
                onClick={() => scroll('left')}
                className="absolute left-0 top-0 bottom-0 w-12 z-30 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/80"
              >
                <ChevronLeft size={40} />
              </button>
              
              <div 
                ref={scrollContainerRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-8"
              >
                {tracks.map(track => (
                  <motion.div 
                    key={track.id}
                    layoutId={track.id}
                    onMouseEnter={() => setHoveredTrack(track.id)}
                    onMouseLeave={() => setHoveredTrack(null)}
                    onClick={() => setSelectedTrack(track)}
                    className="relative flex-none w-72 aspect-video bg-[#2f2f2f] rounded-md overflow-hidden cursor-pointer shadow-lg"
                    whileHover={{ scale: 1.1, zIndex: 40 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <img src={track.thumbnail_url || "https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=400"} className="w-full h-full object-cover" alt={track.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                      <h3 className="font-bold text-sm">{track.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] py-0 border-gray-500 text-gray-300">{track.category}</Badge>
                        <span className="text-[10px] text-emerald-500 font-bold">98% Relevante</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button 
                onClick={() => scroll('right')}
                className="absolute right-0 top-0 bottom-0 w-12 z-30 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/80"
              >
                <ChevronRight size={40} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Track Detail View */
        <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between mb-8">
            <Button variant="ghost" onClick={() => { setSelectedTrack(null); setCurrentVideo(null); }} className="text-white hover:text-red-600 gap-2">
              <ChevronLeft size={24} /> Voltar para o catálogo
            </Button>
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-black italic uppercase tracking-tighter text-red-600">Pulse <span className="text-white">Original</span></h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Player / Preview */}
            <div className="lg:col-span-8 space-y-8">
              <div className="aspect-video bg-black rounded-3xl overflow-hidden border border-white/5 relative shadow-2xl group ring-1 ring-white/10">
                {currentVideo ? (
                  <iframe 
                    src={currentVideo.video_url.includes('youtube') ? currentVideo.video_url.replace('watch?v=', 'embed/') : currentVideo.video_url} 
                    className="w-full h-full" 
                    allowFullScreen 
                    key={currentVideo.video_url}
                    onLoad={() => {
                      if (currentVideo.status === 'not_started') {
                        updateProgress(currentVideo.id, 'in_progress');
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full relative">
                    <img src={selectedTrack.thumbnail_url} className="w-full h-full object-cover opacity-40" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <Button 
                        size="lg" 
                        className="rounded-full w-24 h-24 bg-red-600 text-white hover:scale-110 hover:bg-red-700 transition-all p-0 shadow-[0_0_50px_rgba(220,38,38,0.3)]"
                        onClick={() => {
                          const firstLesson = lessons[0];
                          if (firstLesson) {
                            setCurrentVideo(firstLesson);
                            if (firstLesson.status === 'not_started') {
                              updateProgress(firstLesson.id, 'in_progress');
                            }
                          }
                        }}
                      >
                        <Play size={48} className="ml-2 fill-current" />
                      </Button>
                      <p className="mt-6 text-2xl font-black uppercase tracking-[0.2em] italic text-white drop-shadow-lg">Assistir Agora</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-2">
                    <h2 className="text-5xl font-black tracking-tighter uppercase italic leading-none">{currentVideo?.title || selectedTrack.title}</h2>
                    <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                       <span className="text-emerald-500">2026</span>
                       <Badge variant="outline" className="text-white border-white/20 px-2 py-0.5 rounded-sm">16+</Badge>
                       <span className="text-gray-500">Metodologia {currentVideo?.methodology_name || selectedTrack.category}</span>
                    </div>
                  </div>
                  {currentVideo && (
                    <Button 
                      variant={currentVideo.status === 'completed' ? "secondary" : "destructive"}
                      className={cn(
                        "rounded-full h-14 px-8 gap-3 font-black uppercase italic tracking-widest transition-all",
                        currentVideo.status === 'completed' 
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                          : 'bg-white text-black hover:bg-gray-200'
                      )}
                      onClick={() => updateProgress(currentVideo.id, currentVideo.status === 'completed' ? 'in_progress' : 'completed')}
                    >
                      {currentVideo.status === 'completed' ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                      {currentVideo.status === 'completed' ? 'Concluído' : 'Marcar Aula'}
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  <div className="md:col-span-2 space-y-8">
                    <p className="text-xl text-gray-300 leading-relaxed font-medium">
                      {currentVideo?.description || selectedTrack.description}
                    </p>
                    
                    {currentVideo?.content_markdown && (
                      <div className="bg-zinc-900/50 rounded-3xl p-10 border border-white/5 backdrop-blur-md prose prose-invert max-w-none shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
                        <div className="flex items-center gap-3 text-red-600 mb-8 font-black uppercase text-xs tracking-[0.3em]">
                          <FileText size={20} /> Guia de Treinamento
                        </div>
                        <ReactMarkdown>
                          {currentVideo.content_markdown}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-8">
                    <div className="bg-zinc-900/50 rounded-3xl p-8 border border-white/5 backdrop-blur-md shadow-2xl ring-1 ring-white/5">
                      <h4 className="text-[10px] font-black uppercase text-gray-500 mb-6 tracking-[0.3em]">Status de Elite</h4>
                      <div className="space-y-6">
                        <div className="flex justify-between items-end">
                          <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Seu Desempenho</span>
                          <span className="font-black text-3xl text-emerald-500 italic leading-none">{getCourseProgress()}%</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${getCourseProgress()}%` }}
                            className="bg-emerald-500 h-full shadow-[0_0_15px_rgba(16,185,129,0.6)]" 
                            transition={{ duration: 1.5, ease: "easeOut" }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">Aulas</p>
                            <p className="text-2xl font-black italic text-white">{lessons.length}</p>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">Carga</p>
                            <p className="text-2xl font-black italic text-white">{selectedTrack.estimated_time || '2h'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-red-600/20">
                      {modules.map((mod, modIdx) => (
                        <div key={mod.id} className="space-y-4">
                          <div className="flex items-center gap-3 px-2">
                            <div className="h-10 w-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-600 font-black text-sm italic shadow-lg shadow-red-600/5">
                              {modIdx + 1}
                            </div>
                            <h4 className="text-[12px] font-black uppercase tracking-[0.15em] text-white/90 truncate">{mod.title}</h4>
                          </div>
                          
                          <div className="space-y-3">
                            {lessons
                              .filter(l => l.module_id === mod.id)
                              .map((lesson, idx) => (
                                <button 
                                  key={lesson.id}
                                  onClick={() => setCurrentVideo(lesson)}
                                  className={cn(
                                    "w-full group flex items-center gap-5 p-4 rounded-2xl transition-all duration-500 border text-left relative overflow-hidden",
                                    currentVideo?.id === lesson.id 
                                      ? 'bg-red-600/10 border-red-600/30 shadow-[0_0_30px_rgba(220,38,38,0.1)]' 
                                      : 'bg-zinc-900/40 border-transparent hover:bg-zinc-800/60 hover:border-white/10'
                                  )}
                                >
                                  {currentVideo?.id === lesson.id && (
                                    <div className="absolute left-0 top-0 w-1 h-full bg-red-600" />
                                  )}
                                  <div className="relative w-24 aspect-video shrink-0 bg-zinc-800 rounded-xl overflow-hidden border border-white/5 shadow-xl transition-transform duration-500 group-hover:scale-105">
                                    <div className={cn(
                                      "absolute inset-0 z-10 flex items-center justify-center transition-all duration-500",
                                      currentVideo?.id === lesson.id ? 'bg-red-600/40 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100'
                                    )}>
                                      <Play size={20} className={cn("text-white fill-current", currentVideo?.id === lesson.id && "animate-pulse")} />
                                    </div>
                                    {lesson.status === 'completed' && (
                                      <div className="absolute top-1.5 right-1.5 z-20 bg-emerald-500 rounded-full p-1 shadow-2xl ring-2 ring-black/20">
                                        <CheckCircle2 size={12} className="text-white" />
                                      </div>
                                    )}
                                    <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                                      <Video size={24} className="text-zinc-800" />
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={cn(
                                      "text-xs font-black italic uppercase tracking-tighter truncate transition-all duration-500",
                                      currentVideo?.id === lesson.id ? 'text-red-500 scale-105 origin-left' : 'text-zinc-400 group-hover:text-white'
                                    )}>
                                      {lesson.title}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1.5">
                                      <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em]">{lesson.duration || '10s'}</span>
                                      {lesson.status === 'in_progress' && (
                                        <div className="flex items-center gap-1.5">
                                          <div className="h-1 w-1 bg-blue-400 rounded-full animate-ping" />
                                          <span className="text-[9px] text-blue-400 font-black uppercase italic tracking-widest">No Player</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
