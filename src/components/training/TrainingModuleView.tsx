
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle2, Circle, Clock, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Track {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
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
  methodology_name: string;
  duration: string;
  display_order: number;
  completed?: boolean;
}

export default function TrainingModuleView({ userId }: { userId: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentVideo, setCurrentVideo] = useState<Lesson | null>(null);

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    if (selectedTrack) {
      loadTrackDetails(selectedTrack.id);
    }
  }, [selectedTrack]);

  const loadTracks = async () => {
    const { data, error } = await supabase
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
        .select('lesson_id')
        .eq('user_id', userId);

      const completedIds = progressData?.map(p => p.lesson_id) || [];

      if (lessData) {
        setLessons(lessData.map(l => ({
          ...l,
          completed: completedIds.includes(l.id)
        })));
      }
    }
    setLoading(false);
  };

  const toggleComplete = async (lessonId: string, currentStatus: boolean) => {
    if (!currentStatus) {
      const { error } = await supabase
        .from('user_training_progress')
        .insert({ user_id: userId, lesson_id: lessonId });
      
      if (!error) {
        setLessons(lessons.map(l => l.id === lessonId ? { ...l, completed: true } : l));
        toast.success('Aula marcada como concluída!');
      }
    } else {
      const { error } = await supabase
        .from('user_training_progress')
        .delete()
        .eq('user_id', userId)
        .eq('lesson_id', lessonId);
      
      if (!error) {
        setLessons(lessons.map(l => l.id === lessonId ? { ...l, completed: false } : l));
      }
    }
  };

  if (loading && !selectedTrack) return <div className="flex justify-center p-12">Carregando treinamentos...</div>;

  return (
    <div className="space-y-6">
      {!selectedTrack ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tracks.map(track => (
            <Card key={track.id} className="cursor-pointer hover:shadow-lg transition-all group" onClick={() => setSelectedTrack(track)}>
              <div className="aspect-video bg-muted relative overflow-hidden">
                {track.thumbnail_url ? (
                  <img src={track.thumbnail_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Play size={48} className="opacity-20" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary">{track.category || 'Geral'}</Badge>
                </div>
              </div>
              <CardHeader className="p-4">
                <CardTitle className="text-lg">{track.title}</CardTitle>
                <CardDescription className="line-clamp-2">{track.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
          {tracks.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Nenhum treinamento disponível no momento.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-4">
            <Button variant="ghost" onClick={() => setSelectedTrack(null)} className="mb-2">
              <ChevronRight size={16} className="rotate-180 mr-2" /> Voltar para trilhas
            </Button>
            
            {currentVideo ? (
              <div className="space-y-4">
                <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative">
                  {/* For now, just a placeholder or iframe if video_url is valid */}
                  {currentVideo.video_url?.includes('youtube') || currentVideo.video_url?.includes('vimeo') ? (
                    <iframe 
                      src={currentVideo.video_url.replace('watch?v=', 'embed/')} 
                      className="w-full h-full" 
                      allowFullScreen 
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white bg-slate-900">
                      <Play size={64} className="mb-4 text-primary" />
                      <p className="text-lg font-medium">Visualizando: {currentVideo.title}</p>
                      <p className="text-sm text-slate-400 mt-2">Metodologia: {currentVideo.methodology_name || 'Não especificada'}</p>
                      <Button className="mt-6" variant="outline" onClick={() => window.open(currentVideo.video_url, '_blank')}>
                        Abrir vídeo original
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{currentVideo.title}</h2>
                    <p className="text-muted-foreground">{currentVideo.description}</p>
                    {currentVideo.methodology_name && (
                      <Badge className="mt-2" variant="outline">Metodologia: {currentVideo.methodology_name}</Badge>
                    )}
                  </div>
                  <Button 
                    variant={currentVideo.completed ? "secondary" : "default"}
                    onClick={() => toggleComplete(currentVideo.id, !!currentVideo.completed)}
                  >
                    {currentVideo.completed ? <CheckCircle2 className="mr-2" /> : <Circle className="mr-2" />}
                    {currentVideo.completed ? 'Concluído' : 'Marcar como concluído'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-muted rounded-xl flex flex-col items-center justify-center text-muted-foreground">
                <Play size={48} className="mb-4 opacity-20" />
                <p>Selecione uma aula para começar a assistir</p>
              </div>
            )}
          </div>

          {/* Sidebar - Modules & Lessons */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg px-2">Conteúdo do Curso</h3>
            <div className="space-y-3">
              {modules.map(mod => (
                <div key={mod.id} className="space-y-1">
                  <div className="bg-secondary/50 p-2 rounded-lg text-sm font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">{mod.display_order + 1}</span>
                    {mod.title}
                  </div>
                  <div className="space-y-1 pl-2">
                    {lessons
                      .filter(l => l.module_id === mod.id)
                      .map(lesson => (
                        <div 
                          key={lesson.id} 
                          onClick={() => setCurrentVideo(lesson)}
                          className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${currentVideo?.id === lesson.id ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-accent'}`}
                        >
                          {lesson.completed ? (
                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                          ) : (
                            <Circle size={18} className="text-muted-foreground shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{lesson.title}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock size={10} /> {lesson.duration || '5-10s'}</span>
                              {lesson.methodology_name && <span>• {lesson.methodology_name}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
