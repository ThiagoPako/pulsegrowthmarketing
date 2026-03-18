import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Upload, Image, Video, Music, Loader2, Eye, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FlyerTemplate {
  id: string;
  name: string;
  template_type: string;
  file_url: string;
  preview_url: string | null;
  is_active: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  frame: 'Moldura',
  intro_video: 'Vídeo de Intro',
  base_music: 'Música Base',
};

const TYPE_ICONS: Record<string, any> = {
  frame: Image,
  intro_video: Video,
  base_music: Music,
};

export default function FlyerTemplates() {
  const [templates, setTemplates] = useState<FlyerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState('frame');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    const { data } = await supabase.from('flyer_templates').select('*').order('created_at', { ascending: false });
    if (data) setTemplates(data as FlyerTemplate[]);
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setFilePreview(null);
    }
  };

  const handleAdd = async () => {
    if (!name.trim() || !file) {
      toast.error('Preencha o nome e selecione um arquivo');
      return;
    }
    setSaving(true);
    try {
      const url = await uploadFileToVps(file, `flyer-templates/${templateType}`);

      const { error } = await supabase.from('flyer_templates').insert({
        name: name.trim(),
        template_type: templateType,
        file_url: url,
        preview_url: templateType === 'frame' ? url : null,
        is_active: true,
      });

      if (error) throw error;

      toast.success('Template adicionado!');
      setAddOpen(false);
      setName('');
      setFile(null);
      setFilePreview(null);
      loadTemplates();
    } catch (err: any) {
      toast.error('Erro: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from('flyer_templates').update({ is_active: !active }).eq('id', id);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: !active } : t));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este template?')) return;
    await supabase.from('flyer_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template removido');
  };

  const grouped = {
    frame: templates.filter(t => t.template_type === 'frame'),
    intro_video: templates.filter(t => t.template_type === 'intro_video'),
    base_music: templates.filter(t => t.template_type === 'base_music'),
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Panfletagem Digital</h1>
          <p className="text-sm text-muted-foreground">Gerencie molduras, vídeos de intro e músicas base para os panfletos de veículos</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} /> Novo Template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Moldura Premium" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={templateType} onValueChange={setTemplateType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frame">🖼️ Moldura (PNG transparente)</SelectItem>
                    <SelectItem value="intro_video">🎬 Vídeo de Intro</SelectItem>
                    <SelectItem value="base_music">🎵 Música Base</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Arquivo</Label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  {file ? (
                    <div className="space-y-2">
                      {filePreview && (
                        <img src={filePreview} alt="" className="w-32 h-40 object-contain mx-auto rounded-lg" />
                      )}
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-muted-foreground">
                      <Upload size={24} className="mx-auto" />
                      <p className="text-sm">Clique para selecionar</p>
                      <p className="text-xs">
                        {templateType === 'frame' ? 'PNG com transparência (1080x1350 recomendado)' :
                         templateType === 'intro_video' ? 'MP4 (até 10s recomendado)' :
                         'MP3 ou WAV'}
                      </p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect}
                  accept={templateType === 'frame' ? 'image/png,image/webp' : templateType === 'intro_video' ? 'video/*' : 'audio/*'}
                />
              </div>
              <Button onClick={handleAdd} disabled={saving} className="w-full">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : 'Salvar Template'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {(['frame', 'intro_video', 'base_music'] as const).map(type => {
            const Icon = TYPE_ICONS[type];
            const items = grouped[type];
            return (
              <div key={type}>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Icon size={18} />
                  {TYPE_LABELS[type]}
                  <Badge variant="secondary" className="ml-2">{items.length}</Badge>
                </h2>
                {items.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      Nenhum {TYPE_LABELS[type].toLowerCase()} cadastrado
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {items.map(t => (
                      <Card key={t.id} className={`overflow-hidden ${!t.is_active ? 'opacity-50' : ''}`}>
                        <div className="aspect-[3/4] relative bg-muted">
                          {type === 'frame' && t.file_url && (
                            <img src={t.file_url} alt={t.name} className="w-full h-full object-contain p-2 bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]" />
                          )}
                          {type === 'intro_video' && t.file_url && (
                            <video src={t.file_url} className="w-full h-full object-cover" muted />
                          )}
                          {type === 'base_music' && (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music size={32} className="text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3 space-y-2">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <div className="flex items-center justify-between">
                            <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t.id, t.is_active)} />
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
