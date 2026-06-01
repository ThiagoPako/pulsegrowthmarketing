import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { invokeCloudFunction } from '@/services/vpsEdgeFunctions';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Plus, Trash2, Save, BookOpen, Eye, ArrowUp, ArrowDown,
  Loader2, Presentation, ChevronLeft, Sparkles, Wand2,
  Play, ChevronRight, X, GraduationCap, Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CLIENT_COLORS } from '@/types';
import TrainingModuleView from '@/components/training/TrainingModuleView';
import TrainingModuleAdmin from '@/components/training/TrainingModuleAdmin';

interface PresentationData {
  id: string;
  client_id: string;
  title: string;
  description: string;
  status: string;
  cover_color: string;
  created_at: string;
}

interface Slide {
  id: string;
  presentation_id: string;
  slide_order: number;
  title: string;
  subtitle: string;
  content: string;
  image_url: string | null;
  background_color: string;
  text_color: string;
  layout_type: string;
}

const LAYOUT_OPTIONS = [
  { value: 'title_only', label: 'Apenas Título', icon: '🎯' },
  { value: 'title_content', label: 'Título + Conteúdo', icon: '📝' },
  { value: 'image_left', label: 'Imagem Esquerda', icon: '🖼️' },
  { value: 'image_right', label: 'Imagem Direita', icon: '🖼️' },
  { value: 'image_full', label: 'Imagem de Fundo', icon: '🌄' },
];

export default function TrainingManager() {
  const { user } = useAuth();
  const { clients: appClients, currentUser } = useApp();
  const [selectedClientId, setSelectedClientId] = useState('');
  const [presentations, setPresentations] = useState<PresentationData[]>([]);
  const [selectedPres, setSelectedPres] = useState<PresentationData | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('217 91% 60%');
  const [pastedContent, setPastedContent] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => { if (selectedClientId) loadPresentations(); }, [selectedClientId]);

  const loadPresentations = async () => {
    setLoading(true);
    const { data } = await supabase.from('training_presentations').select('*').eq('client_id', selectedClientId).order('created_at', { ascending: false });
    setPresentations((data as any[]) || []);
    setLoading(false);
  };

  const createWithAI = async () => {
    if (!newTitle.trim() || !selectedClientId || !pastedContent.trim()) {
      toast.error('Preencha o título e cole o conteúdo da apresentação');
      return;
    }

    setGenerating(true);
    try {
      const { data: pres, error: presErr } = await supabase
        .from('training_presentations')
        .insert({ client_id: selectedClientId, title: newTitle, description: newDesc, cover_color: newColor, created_by: user?.id } as any)
        .select()
        .single();

      if (presErr || !pres) throw new Error('Erro ao criar apresentação');

      const { data: aiData, error: aiErr } = await invokeCloudFunction('generate-slides', {
        content: pastedContent, title: newTitle,
      });

      if (aiErr || !aiData?.slides) {
        toast.error('Erro ao gerar slides com IA. Criando apresentação vazia.');
        setGenerating(false);
        setShowCreate(false);
        loadPresentations();
        return;
      }

      const slidesToInsert = aiData.slides.map((s: any, i: number) => ({
        presentation_id: (pres as any).id,
        slide_order: i,
        title: s.title || '',
        subtitle: s.subtitle || '',
        content: s.content || '',
        background_color: s.background_color || newColor,
        text_color: s.text_color || '0 0% 100%',
        layout_type: s.layout_type || 'title_content',
      }));

      await supabase.from('training_slides').insert(slidesToInsert as any);

      toast.success(`Apresentação criada com ${slidesToInsert.length} slides!`);
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setPastedContent('');
      loadPresentations();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar apresentação');
    }
    setGenerating(false);
  };

  const openPresentation = async (pres: PresentationData) => {
    setSelectedPres(pres);
    const { data } = await supabase.from('training_slides').select('*').eq('presentation_id', pres.id).order('slide_order', { ascending: true });
    setSlides((data as any[]) || []);
    setEditingSlide(null);
  };

  const saveSlide = async () => {
    if (!editingSlide) return;
    setSaving(true);
    const { error } = await supabase.from('training_slides')
      .update({ title: editingSlide.title, subtitle: editingSlide.subtitle, content: editingSlide.content, image_url: editingSlide.image_url, background_color: editingSlide.background_color, text_color: editingSlide.text_color, layout_type: editingSlide.layout_type } as any)
      .eq('id', editingSlide.id);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar'); return; }
    setSlides(slides.map(s => s.id === editingSlide.id ? editingSlide : s));
    toast.success('Slide salvo!');
  };

  const deleteSlide = async (slideId: string) => {
    await supabase.from('training_slides').delete().eq('id', slideId);
    setSlides(slides.filter(s => s.id !== slideId));
    if (editingSlide?.id === slideId) setEditingSlide(null);
    toast.success('Slide excluído');
  };

  const addSlide = async () => {
    if (!selectedPres) return;
    const { data } = await supabase.from('training_slides')
      .insert({ presentation_id: selectedPres.id, slide_order: slides.length, title: `Slide ${slides.length + 1}`, background_color: selectedPres.cover_color } as any)
      .select().single();
    if (data) { setSlides([...slides, data as any]); setEditingSlide(data as any); }
  };

  const moveSlide = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const updated = [...slides];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    updated.forEach((s, i) => { s.slide_order = i; });
    setSlides(updated);
    for (const s of updated) {
      await supabase.from('training_slides').update({ slide_order: s.slide_order } as any).eq('id', s.id);
    }
  };

  const togglePublish = async () => {
    if (!selectedPres) return;
    const newStatus = selectedPres.status === 'publicado' ? 'rascunho' : 'publicado';
    await supabase.from('training_presentations').update({ status: newStatus } as any).eq('id', selectedPres.id);
    setSelectedPres({ ...selectedPres, status: newStatus });
    setPresentations(presentations.map(p => p.id === selectedPres.id ? { ...p, status: newStatus } : p));
    toast.success(newStatus === 'publicado' ? 'Publicada!' : 'Despublicada');
  };

  const deletePresentation = async () => {
    if (!selectedPres || !confirm('Excluir esta apresentação e todos os slides?')) return;
    await supabase.from('training_presentations').delete().eq('id', selectedPres.id);
    setSelectedPres(null);
    setSlides([]);
    loadPresentations();
    toast.success('Excluída');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Gestão de Treinamento</h1>
        </div>
      </div>

      <Tabs defaultValue="structured" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
          <TabsTrigger value="structured" className="flex items-center gap-2">
            <Video size={16} /> Metodologia
          </TabsTrigger>
          <TabsTrigger value="presentations" className="flex items-center gap-2">
            <Presentation size={16} /> Apresentações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="structured" className="mt-0">
          <TrainingModuleAdmin />
        </TabsContent>

        <TabsContent value="presentations" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedPres && (
                <Button variant="ghost" size="icon" onClick={() => { setSelectedPres(null); setEditingSlide(null); }}>
                  <ChevronLeft size={18} />
                </Button>
              )}
              <BookOpen size={24} className="text-primary" />
              <h1 className="text-xl font-bold">{selectedPres ? selectedPres.title : 'Treinamento Comercial (Slides)'}</h1>
            </div>
            {selectedPres && (
              <div className="flex gap-2">
                {slides.length > 0 && (
                  <Button variant="default" size="sm" onClick={() => { setCurrentSlideIndex(0); setPresenting(true); }}>
                    <Play size={14} className="mr-1" /> Apresentar
                  </Button>
                )}
                <Button variant={selectedPres.status === 'publicado' ? 'secondary' : 'default'} size="sm" onClick={togglePublish}>
                  <Eye size={14} className="mr-1" />
                  {selectedPres.status === 'publicado' ? 'Despublicar' : 'Publicar'}
                </Button>
                <Button variant="destructive" size="sm" onClick={deletePresentation}><Trash2 size={14} /></Button>
              </div>
            )}
          </div>

          {!selectedPres ? (
            <>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground mb-1 block">Cliente</label>
                  <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="">Selecione um cliente</option>
                    {appClients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                  </select>
                </div>
                {selectedClientId && (
                  <Button onClick={() => setShowCreate(true)} size="sm">
                    <Sparkles size={14} className="mr-1" /> Nova Apresentação
                  </Button>
                )}
              </div>

              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : presentations.length === 0 && selectedClientId ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma apresentação para este cliente.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {presentations.map(pres => (
                    <motion.div key={pres.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-border p-4 cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => openPresentation(pres)}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `hsl(${pres.cover_color} / 0.15)` }}>
                          <Presentation size={16} style={{ color: `hsl(${pres.cover_color})` }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold truncate">{pres.title}</h3>
                          <span className={`text-xs ${pres.status === 'publicado' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                            {pres.status === 'publicado' ? '● Publicado' : '○ Rascunho'}
                          </span>
                        </div>
                      </div>
                      {pres.description && <p className="text-xs text-muted-foreground line-clamp-2">{pres.description}</p>}
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex gap-6">
              <div className="w-64 shrink-0 space-y-2">
                <Button variant="outline" size="sm" onClick={addSlide} className="w-full">
                  <Plus size={14} className="mr-1" /> Novo Slide
                </Button>
                {slides.map((slide, i) => (
                  <div key={slide.id} onClick={() => setEditingSlide(slide)}
                    className={`group relative rounded-lg border p-3 cursor-pointer transition-all text-sm ${editingSlide?.id === slide.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/20'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono w-5">{i + 1}</span>
                      <span className="truncate flex-1 text-xs font-medium">{slide.title || 'Sem título'}</span>
                    </div>
                    <div className="absolute right-1 top-1 hidden group-hover:flex gap-0.5">
                      <button onClick={e => { e.stopPropagation(); moveSlide(i, -1); }} className="p-0.5 rounded hover:bg-muted"><ArrowUp size={12} /></button>
                      <button onClick={e => { e.stopPropagation(); moveSlide(i, 1); }} className="p-0.5 rounded hover:bg-muted"><ArrowDown size={12} /></button>
                      <button onClick={e => { e.stopPropagation(); deleteSlide(slide.id); }} className="p-0.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex-1">
                {editingSlide ? (
                  <div className="space-y-4">
                    <div className="aspect-[16/9] rounded-xl overflow-hidden relative"
                      style={{ background: `linear-gradient(135deg, hsl(${editingSlide.background_color} / 0.4), hsl(${editingSlide.background_color} / 0.08))` }}>
                      <div className="absolute inset-0 flex flex-col justify-center p-8">
                        <h2 className="text-xl font-bold mb-2" style={{ color: `hsl(${editingSlide.text_color})` }}>{editingSlide.title || 'Título'}</h2>
                        {editingSlide.subtitle && <p className="text-sm opacity-60" style={{ color: `hsl(${editingSlide.text_color})` }}>{editingSlide.subtitle}</p>}
                        {editingSlide.content && (
                          <div className="mt-3 text-xs opacity-70 space-y-1" style={{ color: `hsl(${editingSlide.text_color})` }}>
                            {editingSlide.content.split('\n').slice(0, 4).map((l, i) => <p key={i}>{l}</p>)}
                            {editingSlide.content.split('\n').length > 4 && <p>...</p>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Título</label>
                        <input value={editingSlide.title} onChange={e => setEditingSlide({ ...editingSlide, title: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Subtítulo</label>
                        <input value={editingSlide.subtitle} onChange={e => setEditingSlide({ ...editingSlide, subtitle: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Conteúdo</label>
                      <textarea value={editingSlide.content} onChange={e => setEditingSlide({ ...editingSlide, content: e.target.value })} rows={5} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">URL da Imagem (opcional)</label>
                      <input value={editingSlide.image_url || ''} onChange={e => setEditingSlide({ ...editingSlide, image_url: e.target.value || null })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="https://..." />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Layout</label>
                        <select value={editingSlide.layout_type} onChange={e => setEditingSlide({ ...editingSlide, layout_type: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                          {LAYOUT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Cor Fundo</label>
                        <select value={editingSlide.background_color} onChange={e => setEditingSlide({ ...editingSlide, background_color: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                          {CLIENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Cor Texto</label>
                        <select value={editingSlide.text_color} onChange={e => setEditingSlide({ ...editingSlide, text_color: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                          <option value="0 0% 100%">Branco</option>
                          <option value="0 0% 0%">Preto</option>
                          <option value="0 0% 15%">Escuro</option>
                          {CLIENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <Button onClick={saveSlide} disabled={saving}>
                      {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                      Salvar Slide
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                    Selecione um slide para editar ou crie um novo.
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AnimatePresence>
        {presenting && slides.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              if (clickX > rect.width / 2) {
                if (currentSlideIndex < slides.length - 1) setCurrentSlideIndex(currentSlideIndex + 1);
              } else {
                if (currentSlideIndex > 0) setCurrentSlideIndex(currentSlideIndex - 1);
              }
            }}>
            <button onClick={(e) => { e.stopPropagation(); setPresenting(false); }} className="absolute top-6 right-6 text-white/50 hover:text-white z-[60]"><X size={32} /></button>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1 z-[60]">
              {slides.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === currentSlideIndex ? 'w-8 bg-primary' : 'w-2 bg-white/20'}`} />
              ))}
            </div>
            <motion.div key={currentSlideIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full h-full p-20 flex flex-col justify-center text-white"
              style={{ background: `linear-gradient(135deg, hsl(${slides[currentSlideIndex].background_color} / 0.8), hsl(${slides[currentSlideIndex].background_color} / 0.2))` }}>
              <h1 className="text-6xl font-black mb-6 leading-tight" style={{ color: `hsl(${slides[currentSlideIndex].text_color})` }}>{slides[currentSlideIndex].title}</h1>
              {slides[currentSlideIndex].subtitle && <p className="text-3xl font-medium opacity-80 mb-8" style={{ color: `hsl(${slides[currentSlideIndex].text_color})` }}>{slides[currentSlideIndex].subtitle}</p>}
              <div className="text-xl opacity-70 max-w-4xl whitespace-pre-wrap leading-relaxed" style={{ color: `hsl(${slides[currentSlideIndex].text_color})` }}>{slides[currentSlideIndex].content}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 size={18} className="text-primary" />
              Nova Apresentação com IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Título</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Ex: Treinamento de Vendas" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Descrição</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Breve descrição..." />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Conteúdo</label>
              <textarea value={pastedContent} onChange={e => setPastedContent(e.target.value)} rows={10} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none font-mono" placeholder="Cole o conteúdo aqui..." />
            </div>
            <Button onClick={createWithAI} disabled={generating || !newTitle.trim() || !pastedContent.trim()} className="w-full">
              {generating ? <Loader2 className="animate-spin mr-2" size={14} /> : <Sparkles size={14} className="mr-2" />}
              {generating ? 'Gerando...' : 'Gerar com IA'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
