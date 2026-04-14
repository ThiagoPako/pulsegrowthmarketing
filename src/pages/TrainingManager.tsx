import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Save, BookOpen, GripVertical, Eye, ArrowUp, ArrowDown,
  Loader2, Presentation, Image as ImageIcon, Layout as LayoutIcon, ChevronLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { CLIENT_COLORS } from '@/types';

interface Presentation {
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
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [selectedPres, setSelectedPres] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreatePres, setShowCreatePres] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('217 91% 60%');

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (selectedClientId) loadPresentations();
  }, [selectedClientId]);

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, company_name, color')
      .eq('status', 'ativo')
      .order('company_name');
    setClients((data as any[]) || []);
  };

  const loadPresentations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('training_presentations')
      .select('*')
      .eq('client_id', selectedClientId)
      .order('created_at', { ascending: false });
    setPresentations((data as any[]) || []);
    setLoading(false);
  };

  const createPresentation = async () => {
    if (!newTitle.trim() || !selectedClientId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('training_presentations')
      .insert({
        client_id: selectedClientId,
        title: newTitle,
        description: newDesc,
        cover_color: newColor,
        created_by: user?.id,
      } as any)
      .select()
      .single();
    setSaving(false);
    if (error) { toast.error('Erro ao criar apresentação'); return; }
    toast.success('Apresentação criada!');
    setShowCreatePres(false);
    setNewTitle('');
    setNewDesc('');
    loadPresentations();
  };

  const openPresentation = async (pres: Presentation) => {
    setSelectedPres(pres);
    const { data } = await supabase
      .from('training_slides')
      .select('*')
      .eq('presentation_id', pres.id)
      .order('slide_order', { ascending: true });
    setSlides((data as any[]) || []);
  };

  const addSlide = async () => {
    if (!selectedPres) return;
    const order = slides.length;
    const { data, error } = await supabase
      .from('training_slides')
      .insert({
        presentation_id: selectedPres.id,
        slide_order: order,
        title: `Slide ${order + 1}`,
        background_color: selectedPres.cover_color,
      } as any)
      .select()
      .single();
    if (error) { toast.error('Erro ao adicionar slide'); return; }
    setSlides([...slides, data as any]);
    setEditingSlide(data as any);
    toast.success('Slide adicionado');
  };

  const saveSlide = async () => {
    if (!editingSlide) return;
    setSaving(true);
    const { error } = await supabase
      .from('training_slides')
      .update({
        title: editingSlide.title,
        subtitle: editingSlide.subtitle,
        content: editingSlide.content,
        image_url: editingSlide.image_url,
        background_color: editingSlide.background_color,
        text_color: editingSlide.text_color,
        layout_type: editingSlide.layout_type,
      } as any)
      .eq('id', editingSlide.id);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar'); return; }
    setSlides(slides.map(s => s.id === editingSlide.id ? editingSlide : s));
    toast.success('Slide salvo!');
  };

  const deleteSlide = async (slideId: string) => {
    const { error } = await supabase.from('training_slides').delete().eq('id', slideId);
    if (error) { toast.error('Erro ao excluir'); return; }
    setSlides(slides.filter(s => s.id !== slideId));
    if (editingSlide?.id === slideId) setEditingSlide(null);
    toast.success('Slide excluído');
  };

  const moveSlide = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const updated = [...slides];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    updated.forEach((s, i) => { s.slide_order = i; });
    setSlides(updated);
    // batch update orders
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
    toast.success(newStatus === 'publicado' ? 'Apresentação publicada!' : 'Apresentação despublicada');
  };

  const deletePresentation = async () => {
    if (!selectedPres) return;
    if (!confirm('Excluir esta apresentação e todos os slides?')) return;
    await supabase.from('training_presentations').delete().eq('id', selectedPres.id);
    setSelectedPres(null);
    setSlides([]);
    loadPresentations();
    toast.success('Apresentação excluída');
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedPres && (
              <Button variant="ghost" size="icon" onClick={() => { setSelectedPres(null); setEditingSlide(null); }}>
                <ChevronLeft size={18} />
              </Button>
            )}
            <BookOpen size={24} className="text-primary" />
            <h1 className="text-xl font-bold">
              {selectedPres ? selectedPres.title : 'Treinamento Comercial'}
            </h1>
          </div>
          {selectedPres && (
            <div className="flex gap-2">
              <Button variant={selectedPres.status === 'publicado' ? 'secondary' : 'default'} size="sm" onClick={togglePublish}>
                <Eye size={14} className="mr-1" />
                {selectedPres.status === 'publicado' ? 'Despublicar' : 'Publicar'}
              </Button>
              <Button variant="destructive" size="sm" onClick={deletePresentation}>
                <Trash2 size={14} />
              </Button>
            </div>
          )}
        </div>

        {!selectedPres ? (
          <>
            {/* Client selector + presentations list */}
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm text-muted-foreground mb-1 block">Cliente</label>
                <select
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              {selectedClientId && (
                <Button onClick={() => setShowCreatePres(true)} size="sm">
                  <Plus size={14} className="mr-1" /> Nova Apresentação
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
            ) : presentations.length === 0 && selectedClientId ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhuma apresentação para este cliente.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {presentations.map(pres => (
                  <motion.div
                    key={pres.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border p-4 cursor-pointer hover:border-primary/30 transition-colors"
                    onClick={() => openPresentation(pres)}
                  >
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
            {/* Slides list */}
            <div className="w-64 shrink-0 space-y-2">
              <Button variant="outline" size="sm" onClick={addSlide} className="w-full">
                <Plus size={14} className="mr-1" /> Novo Slide
              </Button>
              {slides.map((slide, i) => (
                <div
                  key={slide.id}
                  onClick={() => setEditingSlide(slide)}
                  className={`group relative rounded-lg border p-3 cursor-pointer transition-all text-sm ${editingSlide?.id === slide.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/20'}`}
                >
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
                  {/* Preview */}
                  <div
                    className="aspect-[16/9] rounded-xl overflow-hidden relative"
                    style={{
                      background: `linear-gradient(135deg, hsl(${editingSlide.background_color} / 0.4), hsl(${editingSlide.background_color} / 0.08))`,
                    }}
                  >
                    <div className="absolute inset-0 flex flex-col justify-center p-8">
                      <h2 className="text-xl font-bold mb-2" style={{ color: `hsl(${editingSlide.text_color})` }}>{editingSlide.title || 'Título do Slide'}</h2>
                      {editingSlide.subtitle && <p className="text-sm opacity-60" style={{ color: `hsl(${editingSlide.text_color})` }}>{editingSlide.subtitle}</p>}
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Título</label>
                      <input
                        value={editingSlide.title}
                        onChange={e => setEditingSlide({ ...editingSlide, title: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Subtítulo</label>
                      <input
                        value={editingSlide.subtitle}
                        onChange={e => setEditingSlide({ ...editingSlide, subtitle: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Conteúdo (um ponto por linha)</label>
                    <textarea
                      value={editingSlide.content}
                      onChange={e => setEditingSlide({ ...editingSlide, content: e.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                      placeholder="• Primeiro ponto&#10;• Segundo ponto&#10;• Terceiro ponto"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">URL da Imagem (opcional)</label>
                    <input
                      value={editingSlide.image_url || ''}
                      onChange={e => setEditingSlide({ ...editingSlide, image_url: e.target.value || null })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="https://..."
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Layout</label>
                      <select
                        value={editingSlide.layout_type}
                        onChange={e => setEditingSlide({ ...editingSlide, layout_type: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        {LAYOUT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Cor do Fundo</label>
                      <select
                        value={editingSlide.background_color}
                        onChange={e => setEditingSlide({ ...editingSlide, background_color: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        {CLIENT_COLORS.map(c => (
                          <option key={c.value} value={c.value}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Cor do Texto</label>
                      <select
                        value={editingSlide.text_color}
                        onChange={e => setEditingSlide({ ...editingSlide, text_color: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="0 0% 100%">Branco</option>
                        <option value="0 0% 0%">Preto</option>
                        <option value="0 0% 15%">Escuro</option>
                        {CLIENT_COLORS.map(c => (
                          <option key={c.value} value={c.value}>{c.name}</option>
                        ))}
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

        {/* Create dialog */}
        <Dialog open={showCreatePres} onOpenChange={setShowCreatePres}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Apresentação de Treinamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Título</label>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Ex: Treinamento de Vendas"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Descrição</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Cor da Capa</label>
                <div className="flex flex-wrap gap-2">
                  {CLIENT_COLORS.slice(0, 12).map(c => (
                    <button
                      key={c.value}
                      onClick={() => setNewColor(c.value)}
                      className={`w-8 h-8 rounded-lg transition-all ${newColor === c.value ? 'ring-2 ring-primary scale-110' : 'hover:scale-105'}`}
                      style={{ background: `hsl(${c.value})` }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={createPresentation} disabled={saving || !newTitle.trim()} className="w-full">
                {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
                Criar Apresentação
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
