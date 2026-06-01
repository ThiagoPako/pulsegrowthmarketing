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
      
      if (data && data.length > 0) {
        setTracks(data);
        const pulseTrack = data.find(t => t.title.includes('Pulse')) || data[0];
        setSelectedTrack(pulseTrack);
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

      if (modErr) throw modErr;

      if (modData) {
        setModules(modData);
        const moduleIds = modData.map(m => m.id);
        
        if (moduleIds.length > 0) {
          const { data: lessData, error: lessErr } = await supabase
            .from('training_lessons')
            .select('id, module_id, title, description, video_url, video_path, methodology_name, duration, display_order, content_markdown, thumbnail_url')
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
      toast.error('Erro ao carregar detalhes');
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
    <div className="min-h-screen bg-[#141414] text-white -m-6 p-6 font-sans">
      {!selectedTrack ? (
        <div className="space-y-12 pb-20">
          <div className="relative h-[80vh] -mt-6 -mx-6 mb-12 overflow-hidden">
            <div className="absolute top-6 left-12 z-50 flex items-center gap-4">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-red-600">Pulse <span className="text-white">Academy</span></h2>
              <Button size="sm" variant="ghost" className="text-[10px] text-white/20 hover:text-white h-7" onClick={() => setForceUpdate(p => p + 1)}>Recarregar</Button>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/40 to-transparent z-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent z-10" />
            <img 
              src={tracks[0]?.thumbnail_url || "https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=2070"} 
              className="w-full h-full object-cover opacity-60"
              alt="Featured"
            />
            <div className="absolute bottom-[20%] left-12 z-20 max-w-xl space-y-4">
              <Badge className="bg-red-600 text-white border-none px-3 py-1 text-sm font-bold uppercase tracking-widest">Destaque</Badge>
              <h1 className="text-6xl font-black tracking-tighter uppercase italic">{tracks[0]?.title || "Treinamento Pulse"}</h1>
              <p className="text-lg text-gray-300 line-clamp-3">{tracks[0]?.description}</p>
              <div className="flex gap-3 pt-4">
                <Button size="lg" className="bg-white text-black hover:bg-gray-200 px-8 text-lg font-bold" onClick={() => tracks[0] && setSelectedTrack(tracks[0])}><Play className="mr-2 fill-current" /> Assistir</Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 relative group">
            <h2 className="text-2xl font-bold ml-4 group-hover:text-red-600 transition-colors">Minhas Trilhas</h2>
            <div className="relative">
              <button onClick={() => scroll('left')} className="absolute left-0 top-0 bottom-0 w-12 z-30 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ChevronLeft size={40} /></button>
              <div ref={scrollContainerRef} className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-8">
                {tracks.map(track => (
                  <motion.div key={track.id} onClick={() => setSelectedTrack(track)} className="relative flex-none w-72 aspect-video bg-[#2f2f2f] rounded-md overflow-hidden cursor-pointer shadow-lg" whileHover={{ scale: 1.1, zIndex: 40 }}>
                    <img src={track.thumbnail_url} className="w-full h-full object-cover" alt={track.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity flex flex-col justify-end p-4"><h3 className="font-bold text-sm">{track.title}</h3></div>
                  </motion.div>
                ))}
              </div>
              <button onClick={() => scroll('right')} className="absolute right-0 top-0 bottom-0 w-12 z-30 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ChevronRight size={40} /></button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
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
                      {modules.map((mod, modIdx) => (
                        <div key={mod.id} className="space-y-4">
                          <div className="flex items-center gap-3 px-2"><div className="h-10 w-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-600 font-black text-sm italic">{modIdx + 1}</div><h4 className="text-[12px] font-black uppercase tracking-[0.15em] text-white/90 truncate">{mod.title}</h4></div>
                          <div className="space-y-3">
                            {lessons.filter(l => l.module_id === mod.id).map(lesson => (
                              <button key={lesson.id} onClick={() => setCurrentVideo(lesson)} className={cn("w-full group flex items-center gap-5 p-4 rounded-2xl transition-all border text-left relative overflow-hidden", currentVideo?.id === lesson.id ? 'bg-red-600/10 border-red-600/30' : 'bg-zinc-900/40 border-transparent hover:bg-zinc-800/60')}>
                                <div className="relative w-24 aspect-video shrink-0 bg-zinc-800 rounded-xl overflow-hidden border border-white/5 shadow-xl transition-transform duration-500 group-hover:scale-105">
                                  <div className={cn("absolute inset-0 z-10 flex items-center justify-center transition-all duration-300", currentVideo?.id === lesson.id ? 'bg-red-600/40 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100')}><Play size={20} className={cn("text-white fill-current", currentVideo?.id === lesson.id && "animate-pulse")} /></div>
                                  <div className="w-full h-full bg-zinc-950 flex items-center justify-center">{lesson.thumbnail_url ? <img src={lesson.thumbnail_url} className="w-full h-full object-cover" alt={lesson.title} /> : <Video size={24} className="text-zinc-800" />}</div>
                                </div>
                                <div className="flex-1 min-w-0"><p className={cn("text-xs font-black italic uppercase tracking-tighter truncate", currentVideo?.id === lesson.id ? 'text-red-500' : 'text-zinc-400')}>{lesson.title}</p><div className="flex items-center gap-3 mt-1.5"><span className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em]">{lesson.duration || '10s'}</span></div></div>
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
                      ))}
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
