import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Video, Save, Upload, Trash2, ExternalLink, Rocket, Play, Film } from 'lucide-react';

interface PlanVideo {
  id: string;
  plan_name: string;
  video_url: string | null;
}

export default function LandingPageAdmin() {
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [planVideos, setPlanVideos] = useState<PlanVideo[]>([]);
  const [planUploading, setPlanUploading] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadPlanVideos();
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
    } catch {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  async function loadPlanVideos() {
    const { data } = await supabase
      .from('plan_videos')
      .select('*')
      .order('plan_name');
    if (data) setPlanVideos(data as PlanVideo[]);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Selecione um arquivo de vídeo'); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error('Arquivo muito grande (máx 100MB)'); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `landing/quem-somos-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-content').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('client-content').getPublicUrl(path);
      setVideoUrl(urlData.publicUrl);
      toast.success('Vídeo enviado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao enviar vídeo: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handlePlanVideoUpload(planName: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Selecione um arquivo de vídeo'); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error('Arquivo muito grande (máx 100MB)'); return; }

    setPlanUploading(planName);
    try {
      const ext = file.name.split('.').pop();
      const path = `landing/plan-${planName.toLowerCase()}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-content').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('client-content').getPublicUrl(path);
      await updatePlanVideoUrl(planName, urlData.publicUrl);
      toast.success(`Vídeo do plano ${planName} enviado!`);
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + err.message);
    } finally {
      setPlanUploading(null);
    }
  }

  async function updatePlanVideoUrl(planName: string, url: string | null) {
    await supabase
      .from('plan_videos')
      .update({ video_url: url, updated_at: new Date().toISOString() })
      .eq('plan_name', planName);
    setPlanVideos(prev => prev.map(p => p.plan_name === planName ? { ...p, video_url: url } : p));
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
        const { error } = await supabase.from('landing_page_settings').update(payload).eq('id', recordId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('landing_page_settings').insert({ ...payload, section: 'quem_somos' });
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
          <p className="text-sm text-muted-foreground">Gerencie o conteúdo da landing page</p>
        </div>
      </div>

      {/* Quem Somos Video */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video size={18} className="text-primary" />
            Vídeo Institucional — Quem Somos
          </CardTitle>
          <CardDescription>
            O vídeo aparecerá na seção "Quem Somos" da landing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Upload de Vídeo</Label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
              <input type="file" accept="video/*" onChange={handleUpload} className="hidden" id="video-upload" disabled={uploading} />
              <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload size={20} className="text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{uploading ? 'Enviando...' : 'Clique para enviar um vídeo'}</p>
                  <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM (máx 100MB)</p>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>ou cole a URL do vídeo</Label>
            <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://exemplo.com/video.mp4 ou link do YouTube" />
          </div>

          {videoUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-xl overflow-hidden bg-muted aspect-video">
                {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
                  <iframe src={videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')} className="w-full h-full" allowFullScreen />
                ) : (
                  <video src={videoUrl} controls className="w-full h-full object-cover" />
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setVideoUrl('')} className="text-destructive hover:text-destructive">
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
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição sobre a agência..." rows={3} />
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

      {/* Plan Videos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film size={18} className="text-primary" />
            Vídeos Explicativos dos Planos
          </CardTitle>
          <CardDescription>
            Adicione um vídeo para cada plano. O botão "Entender melhor" será exibido na landing page quando o vídeo estiver configurado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {planVideos.map(pv => (
            <div key={pv.id} className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play size={16} className="text-primary" />
                  <span className="font-semibold text-foreground">{pv.plan_name}</span>
                </div>
                {pv.video_url && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Ativo</span>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={pv.video_url || ''}
                  onChange={e => setPlanVideos(prev => prev.map(p => p.plan_name === pv.plan_name ? { ...p, video_url: e.target.value } : p))}
                  placeholder="Cole a URL do vídeo ou YouTube"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updatePlanVideoUrl(pv.plan_name, pv.video_url).then(() => toast.success('Salvo!'))}
                  className="gap-1"
                >
                  <Save size={14} />
                </Button>
              </div>

              <div className="flex gap-2">
                <div className="relative">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={e => handlePlanVideoUpload(pv.plan_name, e)}
                    className="hidden"
                    id={`plan-upload-${pv.plan_name}`}
                    disabled={planUploading === pv.plan_name}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="gap-1"
                  >
                    <label htmlFor={`plan-upload-${pv.plan_name}`} className="cursor-pointer">
                      <Upload size={14} />
                      {planUploading === pv.plan_name ? 'Enviando...' : 'Upload'}
                    </label>
                  </Button>
                </div>
                {pv.video_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updatePlanVideoUrl(pv.plan_name, null).then(() => toast.success('Removido!'))}
                    className="text-destructive hover:text-destructive gap-1"
                  >
                    <Trash2 size={14} /> Remover
                  </Button>
                )}
              </div>

              {pv.video_url && (
                <div className="rounded-lg overflow-hidden bg-muted aspect-video max-h-40">
                  {pv.video_url.includes('youtube.com') || pv.video_url.includes('youtu.be') ? (
                    <iframe src={pv.video_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')} className="w-full h-full" allowFullScreen />
                  ) : (
                    <video src={pv.video_url} controls className="w-full h-full object-cover" />
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
