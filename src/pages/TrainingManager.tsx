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
import { motion } from 'framer-motion';
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

interface Client {
  id: string;
  company_name: string;
  color: string;
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
  const { clients: appClients } = useApp();
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
      // 1. Create presentation
      const { data: pres, error: presErr } = await supabase
        .from('training_presentations')
        .insert({ client_id: selectedClientId, title: newTitle, description: newDesc, cover_color: newColor, created_by: user?.id } as any)
        .select()
        .single();

      if (presErr || !pres) throw new Error('Erro ao criar apresentação');

      // 2. Call AI to generate slides
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

      // 3. Insert generated slides
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
          <h1 className="text-2xl font-bold">Módulo de Treinamento</h1>
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
          {currentUser?.role === 'admin' ? (
            <Tabs defaultValue="view" className="space-y-4">
              <div className="flex justify-end mb-4">
                <TabsList>
                  <TabsTrigger value="view">Visualizar</TabsTrigger>
                  <TabsTrigger value="admin">Gerenciar Slots</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="view">
                <TrainingModuleView userId={user?.id || ''} />
              </TabsContent>
              <TabsContent value="admin">
                <TrainingModuleAdmin />
              </TabsContent>
            </Tabs>
          ) : (
            <TrainingModuleView userId={user?.id || ''} />
          )}
        </TabsContent>

        <TabsContent value="presentations" className="space-y-6">
          {/* Header */}
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
            {/* Client + list */}
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
          /* Slides editor */
          <div className="flex gap-6">
            {/* Slide list */}
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

            {/* Slide editor */}
            <div className="flex-1">
              {editingSlide ? (
                <div className="space-y-4">
                  {/* Mini preview */}
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

        {/* Create dialog - simplified with AI */}
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
                <label className="text-sm text-muted-foreground mb-1 block">Título da Apresentação</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Ex: Treinamento de Vendas Q2 2026" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Descrição (opcional)</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Breve descrição..." />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Cor da Capa</label>
                <div className="flex flex-wrap gap-2">
                  {CLIENT_COLORS.slice(0, 12).map(c => (
                    <button key={c.value} onClick={() => setNewColor(c.value)}
                      className={`w-8 h-8 rounded-lg transition-all ${newColor === c.value ? 'ring-2 ring-primary scale-110' : 'hover:scale-105'}`}
                      style={{ background: `hsl(${c.value})` }} title={c.name} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Cole o conteúdo da apresentação abaixo
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Cole todo o material de treinamento. A IA vai organizar automaticamente em slides com títulos, textos e layouts.
                </p>
                <textarea
                  value={pastedContent}
                  onChange={e => setPastedContent(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none font-mono"
                  placeholder="Cole aqui o conteúdo completo da apresentação...&#10;&#10;Pode ser texto corrido, tópicos, roteiro, etc.&#10;A IA vai transformar em slides automaticamente."
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">{pastedContent.length} caracteres</p>
              </div>
              <Button onClick={createWithAI} disabled={generating || !newTitle.trim() || !pastedContent.trim()} className="w-full">
                {generating ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={14} />
                    Gerando slides com IA...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} className="mr-2" />
                    Gerar Apresentação com IA
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Fullscreen Presentation Mode — Pulse Theme */}
        {presenting && slides.length > 0 && (
          <div className="fixed inset-0 z-50" 
            style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              if (clickX > rect.width / 2) {
                setCurrentSlideIndex(i => Math.min(i + 1, slides.length - 1));
              } else {
                setCurrentSlideIndex(i => Math.max(i - 1, 0));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === ' ') setCurrentSlideIndex(i => Math.min(i + 1, slides.length - 1));
              if (e.key === 'ArrowLeft') setCurrentSlideIndex(i => Math.max(i - 1, 0));
              if (e.key === 'Escape') setPresenting(false);
            }}
            tabIndex={0}
            ref={(el) => el?.focus()}
          >
            {(() => {
              const slide = slides[currentSlideIndex];
              if (!slide) return null;
              const bg = slide.background_color || '220 15% 10%';
              const txt = slide.text_color || '0 0% 100%';
              const isOrange = bg.startsWith('16');
              const isDark = bg.includes('10%') || bg.includes('15%') || bg.includes('20%');
              
              return (
                <div className="w-full h-full flex flex-col justify-center items-center relative overflow-hidden"
                  style={{ background: `hsl(${bg})` }}>
                  
                  {/* Decorative elements */}
                  <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10"
                    style={{ background: isOrange ? 'hsl(0 0% 100%)' : 'hsl(16 82% 51%)', filter: 'blur(120px)' }} />
                  <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-8"
                    style={{ background: 'hsl(200 80% 55%)', filter: 'blur(100px)' }} />
                  
                  {/* Accent bar top */}
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'hsl(16 82% 51%)' }} />
                  
                  {/* Close button */}
                  <button onClick={(e) => { e.stopPropagation(); setPresenting(false); }}
                    className="absolute top-6 right-6 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-all z-10">
                    <X size={18} />
                  </button>

                  {/* Slide number badge */}
                  <div className="absolute top-6 left-6 px-3 py-1.5 rounded-lg text-xs font-medium z-10"
                    style={{ background: 'hsl(16 82% 51% / 0.2)', color: 'hsl(16 82% 51%)' }}>
                    {currentSlideIndex + 1} / {slides.length}
                  </div>

                  {/* Slide content */}
                  <div className={`max-w-5xl w-full px-16 ${slide.layout_type === 'title_only' || slide.layout_type === 'closing' ? 'text-center' : ''}`}>
                    
                    {/* Title */}
                    <motion.h1 key={`t-${currentSlideIndex}`} 
                      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                      className={`font-bold mb-4 leading-tight ${
                        slide.layout_type === 'title_only' || slide.layout_type === 'closing' 
                          ? 'text-5xl md:text-7xl' 
                          : 'text-3xl md:text-5xl'
                      }`}
                      style={{ 
                        color: isOrange ? `hsl(${txt})` : 'hsl(16 82% 51%)',
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontWeight: 700,
                      }}>
                      {slide.title}
                    </motion.h1>

                    {/* Subtitle */}
                    {slide.subtitle && (
                      <motion.p key={`s-${currentSlideIndex}`} 
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}
                        className="text-lg md:text-2xl mb-8 font-light"
                        style={{ color: `hsl(${txt} / 0.7)`, fontFamily: "'Inter', sans-serif" }}>
                        {slide.subtitle}
                      </motion.p>
                    )}

                    {/* Content */}
                    {slide.content && (
                      <motion.div key={`c-${currentSlideIndex}`} 
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}
                        className={`space-y-3 ${slide.layout_type === 'title_only' ? '' : 'max-w-3xl'}`}
                        style={{ fontFamily: "'Inter', sans-serif" }}>
                        {slide.content.split('\n').filter(l => l.trim()).map((line, i) => {
                          const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
                          return (
                            <motion.div key={i} 
                              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} 
                              transition={{ delay: 0.35 + i * 0.08 }}
                              className={`flex items-start gap-3 ${isBullet ? '' : ''}`}>
                              {isBullet && (
                                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(16 82% 51%)' }} />
                              )}
                              <p className="text-base md:text-xl font-light leading-relaxed"
                                style={{ color: `hsl(${txt} / 0.85)` }}>
                                {isBullet ? line.trim().replace(/^[•\-]\s*/, '') : line}
                              </p>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}

                    {/* Image */}
                    {slide.image_url && (
                      <motion.img key={`i-${currentSlideIndex}`} 
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
                        src={slide.image_url} alt="" 
                        className="mt-8 mx-auto max-h-[35vh] rounded-2xl object-contain shadow-2xl" />
                    )}
                  </div>

                  {/* Bottom navigation */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(i => Math.max(i - 1, 0)); }}
                      disabled={currentSlideIndex === 0}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-20 transition-all backdrop-blur-sm">
                      <ChevronLeft size={16} />
                    </button>
                    {/* Dot indicators */}
                    <div className="flex gap-1.5 px-3">
                      {slides.map((_, i) => (
                        <button key={i} onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(i); }}
                          className={`rounded-full transition-all ${i === currentSlideIndex ? 'w-6 h-2' : 'w-2 h-2 opacity-40 hover:opacity-70'}`}
                          style={{ background: i === currentSlideIndex ? 'hsl(16 82% 51%)' : 'hsl(0 0% 100%)' }} />
                      ))}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(i => Math.min(i + 1, slides.length - 1)); }}
                      disabled={currentSlideIndex === slides.length - 1}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-20 transition-all backdrop-blur-sm">
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Pulse branding */}
                  <div className="absolute bottom-6 right-6 text-xs font-medium opacity-30" style={{ color: `hsl(${txt})` }}>
                    Pulse Growth Marketing
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
  );
}
