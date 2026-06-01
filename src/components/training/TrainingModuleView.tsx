
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
    const { data } = await supabase
      .from('training_tracks')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (data) setTracks(data);
    setLoading(false);
  };

  const loadTrackDetails = async (trackId: string) => {
    setLoading(true);
    const { data: modData } = await supabase
      .from('training_modules')
      .select('*')
      .eq('track_id', trackId)
      .order('display_order', { ascending: true });

    if (modData) {
      setModules(modData);
      const moduleIds = modData.map(m => m.id);
      
      const { data: lessData } = await supabase
        .from('training_lessons')
        .select('*')
        .in('module_id', moduleIds)
        .order('display_order', { ascending: true });

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
    }
    setLoading(false);
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
        /* Track Detail View (Netflix Content Detail) */
        <div className="space-y-8 animate-in fade-in duration-500">
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
            <div className="lg:col-span-8 space-y-6">
              <div className="aspect-video bg-black rounded-sm overflow-hidden border border-white/10 relative shadow-2xl group">
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
                        className="rounded-full w-20 h-20 bg-white text-black hover:scale-110 transition-transform p-0"
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
                        <Play size={40} className="ml-2 fill-current" />
                      </Button>
                      <p className="mt-4 text-xl font-bold uppercase tracking-widest italic">Assistir Agora</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-4xl font-black tracking-tight">{currentVideo?.title || selectedTrack.title}</h2>
                    <div className="flex items-center gap-3 text-sm font-bold">
                       <span className="text-emerald-500">2026</span>
                       <Badge variant="outline" className="text-white border-white/30 px-1 py-0">16+</Badge>
                       <span className="text-gray-400">Metodologia {currentVideo?.methodology_name || selectedTrack.category}</span>
                    </div>
                  </div>
                  {currentVideo && (
                    <Button 
                      variant={currentVideo.status === 'completed' ? "secondary" : "destructive"}
                      className={`rounded-full h-12 gap-2 ${currentVideo.status === 'completed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-white text-black hover:bg-gray-200'}`}
                      onClick={() => updateProgress(currentVideo.id, currentVideo.status === 'completed' ? 'in_progress' : 'completed')}
                    >
                      {currentVideo.status === 'completed' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                      {currentVideo.status === 'completed' ? 'Concluído' : 'Marcar como concluído'}
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
                  <div className="md:col-span-2 space-y-6">
                    <p className="text-lg text-gray-300 leading-relaxed">
                      {currentVideo?.description || selectedTrack.description}
                    </p>
                    
                    {currentVideo?.content_markdown && (
                      <div className="bg-white/5 rounded-lg p-6 border border-white/10 prose prose-invert max-w-none">
                        <div className="flex items-center gap-2 text-red-500 mb-4 font-bold uppercase text-xs tracking-widest">
                          <FileText size={16} /> Guia de Apoio
                        </div>
                        <ReactMarkdown>
                          {currentVideo.content_markdown}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <h4 className="text-xs font-black uppercase text-gray-500 mb-3 tracking-widest">Detalhes do Curso</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Dificuldade</span>
                          <span className="font-bold text-white">{selectedTrack.difficulty || 'Iniciante'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Tempo Estimado</span>
                          <span className="font-bold text-white">{selectedTrack.estimated_time || '2h 30min'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Progresso</span>
                          <span className="font-bold text-emerald-500">{getCourseProgress()}%</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5 mt-1">
                          <div 
                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" 
                            style={{ width: `${getCourseProgress()}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-sm mt-3">
                          <span className="text-gray-400">Total de Aulas</span>
                          <span className="font-bold text-white">{lessons.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Episode List (Episodes Sidebar) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h3 className="text-xl font-bold">Aulas</h3>
                <span className="text-sm text-gray-400">{lessons.length} Vídeos</span>
              </div>

              <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-2 scrollbar-thin">
                {modules.map((mod, modIdx) => (
                  <div key={mod.id} className="space-y-3">
                    <h4 className="text-sm font-black uppercase tracking-widest text-gray-500 mt-4">Módulo {modIdx + 1}: {mod.title}</h4>
                    <div className="space-y-2">
                      {lessons
                        .filter(l => l.module_id === mod.id)
                        .map((lesson, idx) => (
                          <div 
                            key={lesson.id}
                            onClick={() => setCurrentVideo(lesson)}
                            className={`group flex items-center gap-4 p-4 rounded-md transition-all cursor-pointer border ${currentVideo?.id === lesson.id ? 'bg-[#333] border-white/20' : 'bg-transparent border-transparent hover:bg-[#222]'}`}
                          >
                            <div className="flex flex-col items-center">
                              <span className="text-xl font-bold text-gray-600 group-hover:text-white transition-colors">{idx + 1}</span>
                              {lesson.status === 'completed' ? (
                                <CheckCircle2 size={12} className="text-emerald-500" />
                              ) : lesson.status === 'in_progress' ? (
                                <Clock size={12} className="text-blue-400" />
                              ) : null}
                            </div>
                            <div className="relative w-24 aspect-video shrink-0 bg-[#222] rounded overflow-hidden">
                              <Play size={16} className={`absolute inset-0 m-auto z-10 ${currentVideo?.id === lesson.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`} />
                              {lesson.completed && (
                                <div className="absolute inset-0 bg-emerald-500/20 z-10 flex items-center justify-center">
                                  <CheckCircle2 size={16} className="text-emerald-500" />
                                </div>
                              )}
                              <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                                <Video size={20} className="text-gray-600" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{lesson.title}</p>
                              <p className="text-xs text-gray-500">{lesson.duration || '10s'}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
