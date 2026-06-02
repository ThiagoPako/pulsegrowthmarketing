import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Video, FolderPlus, BookOpen, Upload, Loader2, Play, FileVideo, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [previewLesson, setPreviewLesson] = useState<Lesson | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsExternal, setPreviewIsExternal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewIsExternal(false);
    if (!previewLesson) return;
    const src = previewLesson.video_url || previewLesson.video_path || '';
    const isExternal = /youtube\.com|youtu\.be|vimeo\.com/i.test(src);
    if (isExternal) {
      setPreviewIsExternal(true);
      setPreviewUrl(src.includes('youtube') ? src.replace('watch?v=', 'embed/') : src);
      return;
    }
    (async () => {
      try {
        setPreviewLoading(true);
        const token = localStorage.getItem('pulse_jwt');
        const res = await fetch(
          `https://agenciapulse.tech/api/training/sign?lessonId=${encodeURIComponent(previewLesson.id)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.url) {
          toast.error(`Não foi possível abrir o vídeo: ${data?.error || `HTTP ${res.status}`}`);
          return;
        }
        const url = data.url.startsWith('http') ? data.url : `https://agenciapulse.tech${data.url}`;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) toast.error('Falha ao carregar vídeo.');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [previewLesson]);

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
    } else {
      setModules([]);
      setLessons([]);
    }
  }, [selectedTrack]);

  const loadTracks = async () => {
    try {
      const { data, error } = await supabase
        .from('training_tracks')
        .select('id, title, description, category, is_active, estimated_time, difficulty')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error loading tracks:', error);
        toast.error('Erro ao carregar trilhas: ' + (error.message || 'Falha de conexão'));
        return;
      }
      if (data) setTracks(data);
    } catch (err) {
      console.error('Unexpected error loading tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTrackDetails = async (trackId: string) => {
    try {
      const { data: modData, error: modErr } = await supabase
        .from('training_modules')
        .select('id, track_id, title, display_order')
        .eq('track_id', trackId)
        .order('display_order', { ascending: true });
        
      if (modErr) throw modErr;
      
      if (modData) {
        setModules(modData);
        const moduleIds = modData.map(m => m.id);
        if (moduleIds.length > 0) {
          const { data: lessData, error: lessErr } = await supabase
            .from('training_lessons')
            .select('id, module_id, title, description, video_url, video_path, methodology_name, duration, display_order')
            .in('module_id', moduleIds)
            .order('display_order', { ascending: true });
            
          if (lessErr) throw lessErr;
          if (lessData) setLessons(lessData);
        } else {
          setLessons([]);
        }
      }
    } catch (error: any) {
      console.error('Error loading track details:', error);
      toast.error('Erro ao carregar módulos/aulas');
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
    setTracks(prev => [data, ...prev]);
    setSelectedTrack(data);
    setTrackForm({ title: '', description: '', category: 'Metodologia', estimated_time: '', difficulty: 'Iniciante' });
    toast.success('Trilha/Curso criado!');
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
    toast.success('Aula adicionada!');
  };

  const deleteTrack = async (id: string) => {
    if (!confirm('Excluir trilha completa?')) return;
    const { error } = await supabase.from('training_tracks').delete().eq('id', id);
    if (!error) {
      setTracks(prev => prev.filter(t => t.id !== id));
      if (selectedTrack?.id === id) setSelectedTrack(null);
      toast.success('Trilha excluída');
    }
  };

  const deleteLesson = async (id: string) => {
    if (!confirm('Excluir esta aula?')) return;
    const { error } = await supabase.from('training_lessons').delete().eq('id', id);
    if (!error) {
      setLessons(prev => prev.filter(l => l.id !== id));
      toast.success('Aula removida');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, lessonId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo.');
      return;
    }

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
      const videoPath = result.path || result.filename || videoUrl;

      // Validação real: confirma que o arquivo existe no caminho esperado antes de liberar
      let verified = false;
      try {
        const verifyRes = await fetch(
          `https://agenciapulse.tech/api/training/verify?path=${encodeURIComponent(videoPath)}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const verifyJson = await verifyRes.json().catch(() => ({}));
        verified = !!(verifyRes.ok && verifyJson?.ok);
        if (!verified) {
          console.warn('[training upload] verify falhou, tentando HEAD direto', verifyJson);
        }
      } catch (e) {
        console.warn('[training upload] verify endpoint erro, tentando HEAD direto', e);
      }

      // Fallback: HEAD direto no arquivo público
      if (!verified) {
        try {
          const head = await fetch(videoUrl, { method: 'HEAD', cache: 'no-store' });
          verified = head.ok;
        } catch {}
      }

      if (!verified) {
        throw new Error('Upload concluído mas arquivo não pôde ser confirmado no servidor.');
      }


      const { error: updateError } = await supabase
        .from('training_lessons')
        .update({ video_url: videoUrl, video_path: videoPath } as any)
        .eq('id', lessonId);

      if (updateError) throw updateError;

      setLessons(prev => prev.map(l => 
        l.id === lessonId ? { ...l, video_url: videoUrl, video_path: videoPath } : l
      ));

      toast.success('Vídeo enviado e validado!');

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro no upload: ' + error.message);
    } finally {
      setUploading(null);
      setSelectedFile(null);
      setUploadModalLesson(null);
      if (modalFileInputRef.current) modalFileInputRef.current.value = '';
    }
  };

  const handleModalFileUpload = () => {
    if (selectedFile && uploadModalLesson) {
      const mockEvent = {
        target: { files: [selectedFile] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(mockEvent, uploadModalLesson.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">Gestão de Treinamento Pulse</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-red-600 hover:bg-red-700 text-white font-black uppercase italic tracking-widest text-xs h-10 px-6 rounded-full"><Plus className="mr-2" size={16} /> Nova Trilha</Button>
          </DialogTrigger>
          <DialogContent className="bg-[#1a1a1a] border-white/10 text-white rounded-[2rem]">
            <DialogHeader><DialogTitle className="italic uppercase font-black">Criar Nova Trilha</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-6">
              <Input placeholder="Título da Trilha" value={trackForm.title} onChange={e => setTrackForm({...trackForm, title: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
              <Textarea placeholder="Descrição curta" value={trackForm.description} onChange={e => setTrackForm({...trackForm, description: e.target.value})} className="bg-zinc-900 border-white/10 rounded-2xl" />
              <div className="grid grid-cols-2 gap-4">
                <Input placeholder="Categoria" value={trackForm.category} onChange={e => setTrackForm({...trackForm, category: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                <Input placeholder="Tempo Estimado" value={trackForm.estimated_time} onChange={e => setTrackForm({...trackForm, estimated_time: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
              </div>
              <Select value={trackForm.difficulty} onValueChange={val => setTrackForm({...trackForm, difficulty: val})}>
                <SelectTrigger className="bg-zinc-900 border-white/10 h-12 rounded-2xl"><SelectValue placeholder="Dificuldade" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                  <SelectItem value="Iniciante">Iniciante</SelectItem>
                  <SelectItem value="Intermediário">Intermediário</SelectItem>
                  <SelectItem value="Avançado">Avançado</SelectItem>
                  <SelectItem value="Especialista">Especialista</SelectItem>
                </SelectContent>
              </Select>
              <Button className="w-full bg-red-600 hover:bg-red-700 h-12 rounded-2xl font-black uppercase italic tracking-widest mt-4" onClick={createTrack}>Criar Trilha</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Track List */}
        <div className="md:col-span-1 space-y-2 overflow-y-auto max-h-[70vh] pr-2">
          {tracks.length === 0 && !loading && (
            <div className="p-4 text-center border border-dashed rounded-lg border-white/5 text-zinc-500 text-xs font-bold uppercase tracking-widest italic">Nenhuma trilha encontrada</div>
          )}
          {tracks.map(track => (
            <div 
              key={track.id} 
              onClick={() => setSelectedTrack(track)}
              className={cn(
                "p-4 rounded-xl border cursor-pointer transition-all group relative",
                selectedTrack?.id === track.id 
                  ? 'border-red-600 bg-red-600/5 shadow-[0_0_20px_rgba(220,38,38,0.1)]' 
                  : 'border-white/5 hover:border-white/20 bg-zinc-900/40'
              )}
            >
              <p className="font-black italic uppercase tracking-tighter text-sm truncate text-white">{track.title}</p>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-1">{track.category}</p>
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
              <div className="flex justify-between items-center bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5 backdrop-blur-md shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
                <div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">{selectedTrack.title}</h3>
                  <p className="text-sm text-zinc-400 font-medium mt-1">{selectedTrack.description}</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="border-red-600/30 text-red-600 hover:bg-red-600 hover:text-white rounded-full font-black uppercase italic tracking-widest text-[10px] h-10 px-6 transition-all"><FolderPlus className="mr-2" size={16} /> Novo Módulo</Button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#1a1a1a] border-white/10 text-white rounded-[2rem]">
                    <DialogHeader><DialogTitle className="italic uppercase font-black text-xl">Adicionar Módulo</DialogTitle></DialogHeader>
                    <div className="space-y-6 pt-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-2">Título do Módulo</label>
                        <Input placeholder="Ex: Módulo 1: Fundamentos" value={moduleForm.title} onChange={e => setModuleForm({title: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                      </div>
                      <Button className="w-full bg-red-600 hover:bg-red-700 h-12 rounded-2xl font-black uppercase italic tracking-widest shadow-xl" onClick={createModule}>Criar Módulo</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-8 pb-10">
                {modules.map(mod => (
                  <div key={mod.id} className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative overflow-hidden group/mod transition-all hover:bg-zinc-900/60">
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
                          <DialogHeader><DialogTitle className="italic uppercase font-black">Novo Slot Elite</DialogTitle></DialogHeader>
                          <div className="space-y-4 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-2">Título da Aula</label>
                              <Input placeholder="Título" value={lessonForm.title} onChange={e => setLessonForm({...lessonForm, title: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-2">Método (Subtítulo)</label>
                              <Input placeholder="Subtítulo" value={lessonForm.methodology_name} onChange={e => setLessonForm({...lessonForm, methodology_name: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-2">Duração</label>
                              <Input placeholder="Ex: 10s ou 5 min" value={lessonForm.duration} onChange={e => setLessonForm({...lessonForm, duration: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-2">Vídeo URL (YouTube/Direto)</label>
                              <Input placeholder="Opcional se for fazer upload" value={lessonForm.video_url} onChange={e => setLessonForm({...lessonForm, video_url: e.target.value})} className="bg-zinc-900 border-white/10 h-12 rounded-2xl" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-2">Instruções Curtas</label>
                              <Textarea placeholder="Descritivo..." value={lessonForm.description} onChange={e => setLessonForm({...lessonForm, description: e.target.value})} className="bg-zinc-900 border-white/10 rounded-2xl resize-none" rows={2} />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-2">Guia de Apoio (Markdown)</label>
                              <Textarea placeholder="Dicas, roteiros..." value={lessonForm.content_markdown} onChange={e => setLessonForm({...lessonForm, content_markdown: e.target.value})} className="bg-zinc-900 border-white/10 rounded-2xl min-h-[120px]" rows={5} />
                            </div>
                            <Button className="md:col-span-2 bg-red-600 hover:bg-red-700 h-12 rounded-2xl font-black uppercase italic tracking-widest shadow-2xl mt-4" onClick={() => createLesson(mod.id)}>Salvar Slot de Elite</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {lessons.filter(l => l.module_id === mod.id).map(lesson => (
                        <div 
                          key={lesson.id} 
                          onClick={() => { if (lesson.video_url) setPreviewLesson(lesson); }}
                          className={cn(
                            "relative aspect-video rounded-3xl overflow-hidden group shadow-2xl transition-all duration-500 border",
                            !lesson.video_url 
                              ? 'border-2 border-dashed border-red-600/20 bg-red-600/[0.02] hover:border-red-600/50' 
                              : 'border-white/5 bg-zinc-950 cursor-pointer'
                          )}
                        >
                          <div className="absolute inset-0 z-0">
                            {lesson.video_url ? (
                              <div className="relative w-full h-full">
                                <div className="absolute inset-0 bg-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                                <div className="absolute inset-0 flex items-center justify-center z-20">
                                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 group-hover:scale-110 group-hover:bg-red-600 group-hover:border-red-600 transition-all duration-500 shadow-2xl">
                                    <Play size={24} className="text-white fill-current ml-1" />
                                  </div>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-5 z-30 bg-gradient-to-t from-black to-transparent">
                                  <p className="text-xs font-black italic uppercase tracking-tighter text-white truncate">{lesson.title}</p>
                                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400 mt-1">{lesson.methodology_name || 'Pulse'} • {lesson.duration}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-red-600/10 flex items-center justify-center mb-3 text-red-600 group-hover:scale-110 group-hover:bg-red-600 group-hover:text-white transition-all duration-500 shadow-lg">
                                  <Upload size={32} />
                                </div>
                                <p className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em] mb-1">Slot Vazio</p>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="mt-2 h-8 text-[9px] font-black uppercase italic tracking-widest text-zinc-500 hover:text-white hover:bg-red-600 rounded-full px-5 transition-all"
                                  onClick={() => setUploadModalLesson(lesson)}
                                >
                                  Subir Vídeo
                                </Button>
                              </div>
                            )}
                          </div>

                          {lesson.video_url && (
                            <div className="absolute top-4 right-4 z-40 flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-[-10px] group-hover:translate-y-0">
                              <Button 
                                variant="ghost" size="icon" 
                                className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-md hover:bg-red-600 text-white transition-all border border-white/5"
                                onClick={(e) => { e.stopPropagation(); setUploadModalLesson(lesson); }}
                              ><Upload size={14} /></Button>
                              <Button 
                                variant="ghost" size="icon" 
                                className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-md hover:bg-destructive text-white transition-all border border-white/5"
                                onClick={(e) => { e.stopPropagation(); deleteLesson(lesson.id); }}
                              ><Trash2 size={14} /></Button>
                            </div>
                          )}

                          {uploading === lesson.id && (
                            <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
                              <div className="relative h-1 w-full bg-white/5 rounded-full overflow-hidden mb-4">
                                <motion.div initial={{width:0}} animate={{width:'100%'}} transition={{duration:2, repeat:Infinity}} className="absolute inset-0 bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
                              </div>
                              <p className="text-[10px] font-black text-white uppercase italic tracking-[0.3em] animate-pulse">Enviando Vídeo de Elite...</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[60vh] flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-white/5 rounded-[3rem] p-12 bg-zinc-900/20">
              <BookOpen size={64} className="mb-6 opacity-10" />
              <p className="font-black italic uppercase tracking-[0.2em] text-sm text-zinc-700">Selecione uma trilha Elite</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-800 mt-2">Para gerenciar os módulos e slots da metodologia</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!uploadModalLesson} onOpenChange={(open) => !open && setUploadModalLesson(null)}>
        <DialogContent className="sm:max-w-md bg-[#111] border-white/5 text-white rounded-[2.5rem] shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl font-black italic uppercase tracking-tighter text-white">
              <FileVideo className="text-red-600" />
              Upload Elite
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-2">
              Vídeo para: <span className="text-red-500 italic">{uploadModalLesson?.title}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-10 mt-6 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.01] hover:bg-white/[0.03] transition-all group cursor-pointer"
               onClick={() => modalFileInputRef.current?.click()}>
            <input type="file" ref={modalFileInputRef} className="hidden" accept="video/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            
            {selectedFile ? (
              <div className="flex flex-col items-center animate-in zoom-in duration-500">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 text-emerald-500 shadow-2xl shadow-emerald-500/10">
                  <CheckCircle2 size={40} />
                </div>
                <p className="text-sm font-black italic text-white mb-1 truncate max-w-[280px]">{selectedFile.name}</p>
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em]">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Pronto</p>
                <button 
                  className="mt-6 text-zinc-600 hover:text-red-500 font-black uppercase tracking-widest text-[9px] transition-colors"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                >Remover Arquivo</button>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 rounded-3xl bg-red-600/10 flex items-center justify-center mb-4 text-red-600 group-hover:scale-110 group-hover:bg-red-600 group-hover:text-white transition-all duration-500 shadow-xl">
                  <Upload size={38} />
                </div>
                <p className="text-sm font-black italic uppercase tracking-[0.2em] text-white">Clique para selecionar</p>
                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.1em] mt-2">MP4, MOV OU WEBM de alta qualidade</p>
              </>
            )}
          </div>

          <DialogFooter className="flex gap-3 mt-8">
            <Button variant="ghost" onClick={() => setUploadModalLesson(null)} className="flex-1 text-zinc-600 hover:text-white hover:bg-white/5 font-black uppercase italic tracking-widest h-12 rounded-2xl">Cancelar</Button>
            <Button onClick={handleModalFileUpload} disabled={!selectedFile || uploading === uploadModalLesson?.id} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black uppercase italic tracking-widest h-12 rounded-2xl shadow-xl shadow-red-600/10">
              {uploading === uploadModalLesson?.id ? (<><Loader2 size={16} className="animate-spin mr-2" />Enviando...</>) : 'Confirmar Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
