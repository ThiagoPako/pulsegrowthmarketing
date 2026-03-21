import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Video, Save, Upload, Trash2, ExternalLink, Rocket } from 'lucide-react';

export default function LandingPageAdmin() {
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('landing_page_settings')
        .select('*')
        .eq('section', 'quem_somos')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setRecordId(data.id);
        setVideoUrl(data.video_url || '');
        setTitle(data.title || '');
        setDescription(data.description || '');
      }
    } catch (err: any) {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx 100MB)');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `landing/quem-somos-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('client-content')
        .upload(path, file, { upsert: true });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('client-content')
        .getPublicUrl(path);

      setVideoUrl(urlData.publicUrl);
      toast.success('Vídeo enviado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao enviar vídeo: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        video_url: videoUrl || null,
        title,
        description,
        updated_at: new Date().toISOString(),
      };

      if (recordId) {
        const { error } = await supabase
          .from('landing_page_settings')
          .update(payload)
          .eq('id', recordId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('landing_page_settings')
          .insert({ ...payload, section: 'quem_somos' });
        if (error) throw error;
      }

      toast.success('Configurações salvas!');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Rocket size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Landing Page</h1>
          <p className="text-sm text-muted-foreground">Gerencie o conteúdo da seção "Quem Somos"</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video size={18} className="text-primary" />
            Vídeo Institucional
          </CardTitle>
          <CardDescription>
            Adicione um vídeo para apresentar a agência na landing page. O vídeo aparecerá na seção "Quem Somos".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload */}
          <div className="space-y-2">
            <Label>Upload de Vídeo</Label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
              <input
                type="file"
                accept="video/*"
                onChange={handleUpload}
                className="hidden"
                id="video-upload"
                disabled={uploading}
              />
              <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload size={20} className="text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {uploading ? 'Enviando...' : 'Clique para enviar um vídeo'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM (máx 100MB)</p>
                </div>
              </label>
            </div>
          </div>

          {/* URL manual */}
          <div className="space-y-2">
            <Label>ou cole a URL do vídeo</Label>
            <Input
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://exemplo.com/video.mp4 ou link do YouTube"
            />
          </div>

          {/* Preview */}
          {videoUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-xl overflow-hidden bg-muted aspect-video">
                {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
                  <iframe
                    src={videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                    className="w-full h-full"
                    allowFullScreen
                  />
                ) : (
                  <video src={videoUrl} controls className="w-full h-full object-cover" />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVideoUrl('')}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 size={14} className="mr-1" /> Remover vídeo
              </Button>
            </div>
          )}

          <div className="border-t border-border pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Título da seção</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Conheça a Pulse" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Breve descrição sobre a agência..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar alterações'}
            </Button>
            <Button variant="outline" asChild>
              <a href="/" target="_blank" rel="noopener noreferrer" className="gap-2">
                <ExternalLink size={14} /> Ver landing page
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
