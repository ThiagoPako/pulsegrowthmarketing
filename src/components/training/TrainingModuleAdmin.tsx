
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { supabase as supabaseReal } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, GripVertical, Video, FolderPlus, BookOpen, Upload, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

interface Track {
  id: string;
  title: string;
  description: string;
  category: string;
  is_active: boolean;
  estimated_time?: string;
  difficulty?: string;
}

interface Module {
  id: string;
  track_id: string;
  title: string;
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
}

export default function TrainingModuleAdmin() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [trackForm, setTrackForm] = useState({ title: '', description: '', category: 'Metodologia', estimated_time: '', difficulty: 'Iniciante' });
  const [moduleForm, setModuleForm] = useState({ title: '' });
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', video_url: '', methodology_name: '', duration: '10s', content_markdown: '' });

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    if (selectedTrack) {
      loadTrackDetails(selectedTrack.id);
    }
  }, [selectedTrack]);

  const loadTracks = async () => {
    const { data } = await supabase.from('training_tracks').select('*').order('created_at', { ascending: false });
    if (data) setTracks(data);
    setLoading(false);
  };

  const loadTrackDetails = async (trackId: string) => {
    const { data: modData } = await supabase.from('training_modules').select('*').eq('track_id', trackId).order('display_order', { ascending: true });
    if (modData) {
      setModules(modData);
      const moduleIds = modData.map(m => m.id);
      const { data: lessData } = await supabase.from('training_lessons').select('*').in('module_id', moduleIds).order('display_order', { ascending: true });
      if (lessData) setLessons(lessData);
    }
  };

  const createTrack = async () => {
    const { data, error } = await supabase.from('training_tracks').insert(trackForm).select().single();
    if (error) { toast.error('Erro ao criar trilha'); return; }
    setTracks([data, ...tracks]);
    setTrackForm({ title: '', description: '', category: 'Metodologia', estimated_time: '', difficulty: 'Iniciante' });
    toast.success('Trilha criada com sucesso!');
  };

  const createModule = async () => {
    if (!selectedTrack) return;
    const { data, error } = await supabase.from('training_modules').insert({ 
      ...moduleForm, 
      track_id: selectedTrack.id,
      display_order: modules.length 
    }).select().single();
    if (error) { toast.error('Erro ao criar módulo'); return; }
    setModules([...modules, data]);
    setModuleForm({ title: '' });
    toast.success('Módulo criado!');
  };

  const createLesson = async (moduleId: string) => {
    const moduleLessons = lessons.filter(l => l.module_id === moduleId);
    const { data, error } = await supabase.from('training_lessons').insert({ 
      ...lessonForm, 
      module_id: moduleId,
      display_order: moduleLessons.length
    }).select().single();
    if (error) { toast.error('Erro ao adicionar aula'); return; }
    setLessons([...lessons, data]);
    setLessonForm({ title: '', description: '', video_url: '', methodology_name: '', duration: '10s', content_markdown: '' });
    toast.success('Vídeo/Aula adicionada ao slot!');
  };

  const deleteTrack = async (id: string) => {
    if (!confirm('Tem certeza? Isso excluirá todos os módulos e vídeos desta trilha.')) return;
    const { error } = await supabase.from('training_tracks').delete().eq('id', id);
    if (!error) {
      setTracks(tracks.filter(t => t.id !== id));
      if (selectedTrack?.id === id) setSelectedTrack(null);
      toast.success('Trilha excluída');
    }
  };

  const deleteLesson = async (id: string) => {
    const { error } = await supabase.from('training_lessons').delete().eq('id', id);
    if (!error) {
      setLessons(lessons.filter(l => l.id !== id));
      toast.success('Aula removida');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, lessonId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's a video
    if (!file.type.startsWith('video/')) {
      toast.error('Por favor, selecione um arquivo de vídeo.');
      return;
    }

    setUploading(lessonId);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `lessons/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabaseReal.storage
        .from('training-videos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabaseReal.storage
        .from('training-videos')
        .getPublicUrl(filePath);

      // Update lesson in DB
      const { error: updateError } = await supabase
        .from('training_lessons')
        .update({ 
          video_url: publicUrl,
          video_path: filePath 
        } as any)
        .eq('id', lessonId);

      if (updateError) throw updateError;

      // Update local state
      setLessons(prev => prev.map(l => 
        l.id === lessonId ? { ...l, video_url: publicUrl, video_path: filePath } : l
      ));

      toast.success('Vídeo enviado com sucesso!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload do vídeo: ' + error.message);
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Gestão de Trilhas de Treinamento</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2" size={16} /> Nova Trilha</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Nova Trilha de Treinamento</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <Input placeholder="Título da Trilha (ex: Metodologia de Captação)" value={trackForm.title} onChange={e => setTrackForm({...trackForm, title: e.target.value})} />
              <Textarea placeholder="Descrição curta" value={trackForm.description} onChange={e => setTrackForm({...trackForm, description: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <Input placeholder="Categoria" value={trackForm.category} onChange={e => setTrackForm({...trackForm, category: e.target.value})} />
                <Input placeholder="Tempo Estimado (ex: 2h)" value={trackForm.estimated_time} onChange={e => setTrackForm({...trackForm, estimated_time: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Dificuldade</label>
                <Select value={trackForm.difficulty} onValueChange={val => setTrackForm({...trackForm, difficulty: val})}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Iniciante">Iniciante</SelectItem>
                    <SelectItem value="Intermediário">Intermediário</SelectItem>
                    <SelectItem value="Avançado">Avançado</SelectItem>
                    <SelectItem value="Especialista">Especialista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={createTrack}>Criar Trilha</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Track List */}
        <div className="md:col-span-1 space-y-2">
          {tracks.map(track => (
            <div 
              key={track.id} 
              onClick={() => setSelectedTrack(track)}
              className={`p-3 rounded-lg border cursor-pointer transition-all group relative ${selectedTrack?.id === track.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50'}`}
            >
              <p className="font-semibold text-sm truncate">{track.title}</p>
              <p className="text-[10px] text-muted-foreground">{track.category}</p>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 text-destructive hover:bg-destructive/10 rounded transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Track Detail & Modules */}
        <div className="md:col-span-3">
          {selectedTrack ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-secondary/30 p-4 rounded-xl">
                <div>
                  <h3 className="text-lg font-bold">{selectedTrack.title}</h3>
                  <p className="text-sm text-muted-foreground">{selectedTrack.description}</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><FolderPlus className="mr-2" size={16} /> Novo Módulo</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Adicionar Módulo à Trilha</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <Input placeholder="Nome do Módulo (ex: Módulo 1: Gravação de Falas)" value={moduleForm.title} onChange={e => setModuleForm({title: e.target.value})} />
                      <Button className="w-full" onClick={createModule}>Adicionar Módulo</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-6">
                {modules.map(mod => (
                  <div key={mod.id} className="border border-border rounded-xl p-4 space-y-4 bg-card shadow-sm">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold flex items-center gap-2">
                        <Badge variant="outline">{mod.display_order + 1}</Badge>
                        {mod.title}
                      </h4>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-primary h-8"><Plus size={14} className="mr-1" /> Add Vídeo Slot</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Novo Slot de Vídeo/Metodologia</DialogTitle></DialogHeader>
                          <div className="space-y-4 pt-4">
                            <Input placeholder="Título (ex: Caminhada Dinâmica)" value={lessonForm.title} onChange={e => setLessonForm({...lessonForm, title: e.target.value})} />
                            <Input placeholder="Nome da Metodologia (ex: Dynamic Entry)" value={lessonForm.methodology_name} onChange={e => setLessonForm({...lessonForm, methodology_name: e.target.value})} />
                            <Input placeholder="URL do Vídeo (YouTube/Vimeo ou Direto)" value={lessonForm.video_url} onChange={e => setLessonForm({...lessonForm, video_url: e.target.value})} />
                            <div className="grid grid-cols-2 gap-4">
                                <Input placeholder="Duração (ex: 5-10s)" value={lessonForm.duration} onChange={e => setLessonForm({...lessonForm, duration: e.target.value})} />
                            </div>
                            <Textarea placeholder="Instruções curtas" value={lessonForm.description} onChange={e => setLessonForm({...lessonForm, description: e.target.value})} />
                            <Textarea placeholder="Conteúdo detalhado (Markdown)" value={lessonForm.content_markdown} onChange={e => setLessonForm({...lessonForm, content_markdown: e.target.value})} rows={6} />
                            <Button className="w-full" onClick={() => createLesson(mod.id)}>Salvar Slot</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {lessons.filter(l => l.module_id === mod.id).map(lesson => (
                        <div key={lesson.id} className="p-3 bg-secondary/20 rounded-lg flex flex-col gap-3 group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary">
                                {lesson.video_url ? <Play size={18} /> : <Video size={18} />}
                              </div>
                              <div>
                                <p className="text-sm font-semibold">{lesson.title}</p>
                                <p className="text-[10px] text-muted-foreground">{lesson.methodology_name} • {lesson.duration}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-primary hover:bg-primary/10"
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'video/*';
                                  input.onchange = (e) => handleFileUpload(e as any, lesson.id);
                                  input.click();
                                }}
                                disabled={uploading === lesson.id}
                              >
                                {uploading === lesson.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => deleteLesson(lesson.id)}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                          
                          {lesson.video_url && (
                            <div className="text-[10px] text-muted-foreground truncate bg-background/50 p-1 px-2 rounded">
                              Link: <a href={lesson.video_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{lesson.video_url}</a>
                            </div>
                          )}
                        </div>
                      ))}
                      {lessons.filter(l => l.module_id === mod.id).length === 0 && (
                        <p className="col-span-full text-center text-xs text-muted-foreground py-4 border border-dashed rounded-lg">
                          Nenhum vídeo adicionado a este módulo.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {modules.length === 0 && (
                  <div className="text-center py-12 border border-dashed rounded-xl">
                    <p className="text-muted-foreground">Nenhum módulo criado para esta trilha ainda.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-xl p-12">
              <BookOpen size={48} className="mb-4 opacity-10" />
              <p>Selecione uma trilha para gerenciar os módulos e aulas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
