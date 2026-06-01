import { cn } from '@/lib/utils';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, GripVertical, Video, FolderPlus, BookOpen, Upload, Loader2, Play, FileVideo, CheckCircle2 } from 'lucide-react';
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
  const [uploadModalLesson, setUploadModalLesson] = useState<Lesson | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

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
    if (!trackForm.title.trim()) {
      toast.error('O título da trilha é obrigatório');
      return;
    }
    const insertData = {
      title: trackForm.title,
      description: trackForm.description,
      category: trackForm.category,
      estimated_time: trackForm.estimated_time,
      difficulty: trackForm.difficulty,
      is_active: true
    };
    const { data, error } = await supabase.from('training_tracks').insert(insertData).select().single();
    if (error) { 
      console.error('Error creating track:', error);
      toast.error('Erro ao criar trilha'); 
      return; 
    }
    setTracks([data, ...tracks]);
    setSelectedTrack(data);
    setTrackForm({ title: '', description: '', category: 'Metodologia', estimated_time: '', difficulty: 'Iniciante' });
    toast.success('Trilha/Curso criado com sucesso!');
  };

  const createModule = async () => {
    if (!selectedTrack || !moduleForm.title.trim()) {
      toast.error('O título do módulo é obrigatório');
      return;
    }
    const insertData = { 
      title: moduleForm.title, 
      track_id: selectedTrack.id,
      display_order: modules.length 
    };
    const { data, error } = await supabase.from('training_modules').insert(insertData).select().single();
    if (error) { 
      console.error('Error creating module:', error);
      toast.error('Erro ao criar módulo'); 
      return; 
    }
    setModules(prev => [...prev, data]);
    setModuleForm({ title: '' });
    toast.success('Módulo adicionado!');
  };


  const createLesson = async (moduleId: string) => {
    if (!lessonForm.title.trim()) {
      toast.error('O título da aula é obrigatório');
      return;
    }
    const moduleLessons = lessons.filter(l => l.module_id === moduleId);
    const insertData = { 
      title: lessonForm.title,
      description: lessonForm.description,
      video_url: lessonForm.video_url,
      methodology_name: lessonForm.methodology_name,
      duration: lessonForm.duration,
      content_markdown: lessonForm.content_markdown,
      module_id: moduleId,
      display_order: moduleLessons.length
    };
    const { data, error } = await supabase.from('training_lessons').insert(insertData).select().single();
    if (error) { 
      console.error('Error creating lesson:', error);
      toast.error('Erro ao adicionar aula'); 
      return; 
    }
    setLessons(prev => [...prev, data]);
    setLessonForm({ title: '', description: '', video_url: '', methodology_name: '', duration: '10s', content_markdown: '' });
    toast.success('Aula adicionada ao módulo!');

  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = async (e: React.DragEvent, lessonId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const mockEvent = {
        target: {
          files: [file]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(mockEvent, lessonId);
    }
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', 'training-videos');

      const token = localStorage.getItem('pulse_jwt');
      const response = await fetch('https://agenciapulse.tech/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Erro no upload');

      const videoUrl = result.url; // URL retornada pela sua API da VPS

      // Update lesson in DB via your VPS API
      const { error: updateError } = await supabase
        .from('training_lessons')
        .update({ 
          video_url: videoUrl,
          video_path: result.path || videoUrl 
        } as any)
        .eq('id', lessonId);

      if (updateError) throw updateError;

      // Update local state
      setLessons(prev => prev.map(l => 
        l.id === lessonId ? { ...l, video_url: videoUrl, video_path: result.path || videoUrl } : l
      ));

      toast.success('Vídeo enviado com sucesso para a VPS!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload do vídeo: ' + error.message);
    } finally {
      setUploading(null);
      setSelectedFile(null);
      setUploadModalLesson(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (modalFileInputRef.current) modalFileInputRef.current.value = '';
    }
  };

  const handleModalFileUpload = () => {
    if (selectedFile && uploadModalLesson) {
      const mockEvent = {
        target: {
          files: [selectedFile]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(mockEvent, uploadModalLesson.id);
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
        <div className="md:col-span-1 space-y-2 overflow-y-auto max-h-[70vh] pr-2">
          {tracks.length === 0 && !loading && (
            <div className="p-4 text-center border border-dashed rounded-lg text-muted-foreground text-xs">
              Nenhuma trilha encontrada
            </div>
          )}
          {tracks.map(track => (
            <div 
              key={track.id} 
              onClick={() => setSelectedTrack(track)}
              className={`p-4 rounded-xl border cursor-pointer transition-all group relative ${selectedTrack?.id === track.id ? 'border-red-600 bg-red-600/5 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : 'border-white/5 hover:border-white/20 bg-zinc-900/40'}`}
            >
              <p className="font-black italic uppercase tracking-tighter text-sm truncate">{track.title}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{track.category}</p>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}
                className="absolute right-3 top-4 opacity-0 group-hover:opacity-100 p-1.5 text-red-500 hover:bg-red-500/10 rounded-full transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Track Detail & Modules */}
        <div className="md:col-span-3">
          {selectedTrack ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-zinc-900/50 p-6 rounded-3xl border border-white/5 backdrop-blur-sm shadow-xl">
                <div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">{selectedTrack.title}</h3>
                  <p className="text-sm text-gray-400 font-medium mt-1">{selectedTrack.description}</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="border-red-600/30 text-red-600 hover:bg-red-600 hover:text-white rounded-full font-black uppercase italic tracking-widest text-xs h-10 px-6 transition-all"><FolderPlus className="mr-2" size={16} /> Novo Módulo</Button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#1a1a1a] border-white/10 text-white rounded-[2rem]">
                    <DialogHeader><DialogTitle className="italic uppercase font-black">Adicionar Módulo à Trilha</DialogTitle></DialogHeader>
                    <div className="space-y-6 pt-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Título do Módulo</label>
                        <Input placeholder="Módulo 1: Gravação de Falas" value={moduleForm.title} onChange={e => setModuleForm({title: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                      </div>
                      <Button className="w-full bg-red-600 hover:bg-red-700 h-12 rounded-2xl font-black uppercase italic tracking-widest" onClick={createModule}>Adicionar Módulo</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-8">
                {modules.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/30 rounded-[2.5rem] border border-dashed border-white/5">
                    <FolderPlus size={40} className="text-zinc-700 mb-4" />
                    <p className="text-sm font-bold uppercase tracking-widest text-zinc-500 italic">Nenhum módulo nesta trilha</p>
                  </div>
                )}
                {modules.map(mod => (
                  <div key={mod.id} className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative overflow-hidden group/mod">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-600/40 group-hover/mod:bg-red-600 transition-colors" />
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-600 font-black text-xl italic shadow-lg shadow-red-600/5">
                          {mod.display_order + 1}
                        </div>
                        <h4 className="font-black italic uppercase tracking-tighter text-xl text-white">
                          {mod.title}
                        </h4>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-600 hover:text-white rounded-full font-black uppercase italic tracking-widest text-[10px] h-10 px-6 border border-red-600/10 transition-all shadow-xl"><Plus size={14} className="mr-2" /> Add Vídeo Slot</Button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white rounded-[2rem] sm:max-w-xl">
                          <DialogHeader><DialogTitle className="italic uppercase font-black">Novo Slot de Vídeo Elite</DialogTitle></DialogHeader>
                          <div className="space-y-4 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Título da Aula</label>
                              <Input placeholder="Caminhada Dinâmica" value={lessonForm.title} onChange={e => setLessonForm({...lessonForm, title: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Método (Subtítulo)</label>
                              <Input placeholder="Dynamic Entry" value={lessonForm.methodology_name} onChange={e => setLessonForm({...lessonForm, methodology_name: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Duração (S)</label>
                              <Input placeholder="10s" value={lessonForm.duration} onChange={e => setLessonForm({...lessonForm, duration: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Vídeo URL (Opcional)</label>
                              <Input placeholder="URL do Vídeo" value={lessonForm.video_url} onChange={e => setLessonForm({...lessonForm, video_url: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Descrição Curta</label>
                              <Textarea placeholder="Instruções para o treinamento..." value={lessonForm.description} onChange={e => setLessonForm({...lessonForm, description: e.target.value})} className="bg-zinc-900 border-white/10 rounded-2xl resize-none" rows={3} />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Guia de Apoio (Markdown)</label>
                              <Textarea placeholder="Conteúdo detalhado..." value={lessonForm.content_markdown} onChange={e => setLessonForm({...lessonForm, content_markdown: e.target.value})} className="bg-zinc-900 border-white/10 rounded-2xl min-h-[150px]" rows={6} />
                            </div>
                            <Button className="md:col-span-2 bg-red-600 hover:bg-red-700 h-12 rounded-2xl font-black uppercase italic tracking-widest mt-4" onClick={() => createLesson(mod.id)}>Salvar Slot de Elite</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {lessons.filter(l => l.module_id === mod.id).map(lesson => (
                        <div 
                          key={lesson.id} 
                          onDragOver={onDragOver}
                          onDrop={(e) => onDrop(e, lesson.id)}
                          className={`relative aspect-video rounded-2xl overflow-hidden group shadow-2xl transition-all duration-300 ${
                            !lesson.video_url 
                              ? 'border-2 border-dashed border-red-600/20 bg-red-600/[0.02] hover:border-red-600/50 hover:bg-red-600/[0.05]' 
                              : 'border border-white/5 bg-[#1a1a1a]'

                          }`}
                        >
                          {/* Background Content */}
                          <div className="absolute inset-0 z-0">
                            {lesson.video_url ? (
                              <div className="relative w-full h-full">
                                <video src={lesson.video_url} className="w-full h-full object-cover opacity-40" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 group-hover:scale-110 transition-transform duration-300">
                                    <Play size={24} className="text-white fill-current ml-1" />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-red-600/10 flex items-center justify-center mb-3 text-red-600 group-hover:scale-110 transition-transform duration-300">
                                  <Upload size={32} />
                                </div>
                                <p className="text-xs font-bold text-red-600/60 uppercase tracking-tighter mb-1">Slot Vazio</p>
                                <p className="text-[10px] text-muted-foreground leading-tight px-4 font-bold uppercase tracking-widest">Clique para subir vídeo</p>

                                
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-4 h-8 bg-transparent border-red-600/20 text-red-600 hover:bg-red-600 hover:text-white transition-all text-[10px] font-black uppercase italic tracking-widest px-6 rounded-full"
                                  onClick={() => setUploadModalLesson(lesson)}
                                  disabled={uploading === lesson.id}
                                >

                                  {uploading === lesson.id ? <Loader2 size={12} className="animate-spin mr-2" /> : <Plus size={12} className="mr-2" />}
                                  Selecionar Vídeo
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Info Overlay (Sempre visível se tiver vídeo, ou no hover) */}
                          {lesson.video_url && (
                            <div className="absolute bottom-0 left-0 right-0 p-4 z-20 bg-gradient-to-t from-black to-transparent">
                              <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                  <h5 className="text-sm font-black text-white truncate italic uppercase tracking-tighter">{lesson.title}</h5>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    {lesson.methodology_name || 'Pulse Methodology'} • {lesson.duration}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full bg-white/10 hover:bg-red-600 hover:text-white transition-all backdrop-blur-md border border-white/10"
                                    onClick={() => setUploadModalLesson(lesson)}
                                    disabled={uploading === lesson.id}
                                  >

                                    {uploading === lesson.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full bg-white/10 hover:bg-destructive hover:text-white transition-all backdrop-blur-md border border-white/10"
                                    onClick={() => deleteLesson(lesson.id)}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Status Badge */}
                          <div className="absolute top-4 left-4 z-30">
                            <Badge className={`border-none px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                              lesson.video_url 
                                ? "bg-emerald-500 text-white" 
                                : "bg-amber-500 text-white animate-pulse"
                            }`}>
                              {lesson.video_url ? 'Ativo' : 'Pendente'}
                            </Badge>
                          </div>

                          {/* Uploading Overlay */}
                          {uploading === lesson.id && (
                            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                              <Loader2 size={32} className="text-primary animate-spin mb-3" />
                              <p className="text-xs font-black text-white uppercase tracking-widest italic animate-pulse">Enviando Vídeo...</p>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Empty State / Add Slot Helper */}
                      {lessons.filter(l => l.module_id === mod.id).length === 0 && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                          <Video size={48} className="mb-4 opacity-10" />
                          <p className="text-sm font-bold uppercase tracking-widest italic opacity-40">Nenhum slot neste módulo</p>
                        </div>
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

      {/* Modal de Upload de Vídeo */}
      <Dialog open={!!uploadModalLesson} onOpenChange={(open) => !open && setUploadModalLesson(null)}>
        <DialogContent className="sm:max-w-md bg-[#1a1a1a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl italic uppercase tracking-tighter">
              <FileVideo className="text-primary" />
              Upload de Vídeo
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Escolha o vídeo para a aula: <span className="text-white font-bold">{uploadModalLesson?.title}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors group cursor-pointer"
               onClick={() => modalFileInputRef.current?.click()}>
            <input 
              type="file" 
              ref={modalFileInputRef} 
              className="hidden" 
              accept="video/*" 
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            
            {selectedFile ? (
              <div className="flex flex-col items-center animate-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 text-emerald-500">
                  <CheckCircle2 size={32} />
                </div>
                <p className="text-sm font-bold text-white mb-1 truncate max-w-[250px]">{selectedFile.name}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="mt-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 h-7 text-[10px] uppercase font-bold"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (modalFileInputRef.current) modalFileInputRef.current.value = '';
                  }}
                >
                  Remover
                </Button>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-red-600/10 flex items-center justify-center mb-3 text-red-600 group-hover:scale-110 transition-transform duration-300">
                  <Upload size={32} />
                </div>
                <p className="text-sm font-black italic uppercase tracking-widest text-white mb-1">Clique para selecionar</p>

                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Formatos aceitos: MP4, MOV, WEBM</p>
              </>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setUploadModalLesson(null)}
              className="flex-1 text-gray-400 hover:text-white hover:bg-white/5 uppercase text-xs font-bold tracking-widest"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleModalFileUpload}
              disabled={!selectedFile || uploading === uploadModalLesson?.id}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black uppercase italic tracking-widest text-xs h-12 rounded-2xl"
            >

              {uploading === uploadModalLesson?.id ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2" />
                  Enviando...
                </>
              ) : (
                'Confirmar Upload'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
