import { useState, useEffect } from 'react';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Video, Eye, Upload, Sparkles, Megaphone } from 'lucide-react';
import { format } from 'date-fns';

interface PortalVideo {
  id: string;
  video_type: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  is_active: boolean;
  created_at: string;
}

export default function PortalVideosAdmin() {
  const [videos, setVideos] = useState<PortalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoType, setVideoType] = useState<'welcome' | 'news'>('welcome');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => { loadVideos(); }, []);

  const loadVideos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('portal_videos')
      .select('*')
      .order('created_at', { ascending: false });
    setVideos(data || []);
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      toast.error('Preencha o título e selecione um vídeo');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFileToVps(file, 'portal-videos');
      await supabase.from('portal_videos').insert({
        title: title.trim(),
        description: description.trim() || null,
        video_type: videoType,
        video_url: url,
        is_active: true,
      });
      toast.success('Vídeo publicado com sucesso! 🎬');
      setTitle('');
      setDescription('');
      setFile(null);
      loadVideos();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('portal_videos').update({ is_active: !current }).eq('id', id);
    setVideos(prev => prev.map(v => v.id === id ? { ...v, is_active: !current } : v));
    toast.success(!current ? 'Vídeo ativado' : 'Vídeo desativado');
  };

  const deleteVideo = async (id: string) => {
    if (!confirm('Excluir este vídeo?')) return;
    await supabase.from('portal_videos').delete().eq('id', id);
    setVideos(prev => prev.filter(v => v.id !== id));
    toast.success('Vídeo excluído');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Video className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Vídeos do Portal</h1>
      </div>

      {/* Upload form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5" />
            Novo Vídeo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Boas-vindas ao Pulse Club" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={videoType} onValueChange={v => setVideoType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="welcome">
                    <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-400" /> Boas-vindas</span>
                  </SelectItem>
                  <SelectItem value="news">
                    <span className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-blue-400" /> Novidades</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Uma breve descrição do vídeo..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Arquivo de Vídeo</Label>
            <Input type="file" accept="video/*" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file || !title.trim()}>
            {uploading ? 'Enviando...' : 'Publicar Vídeo'}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="grid gap-4">
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : videos.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum vídeo cadastrado</p>
        ) : videos.map(v => (
          <Card key={v.id} className={!v.is_active ? 'opacity-50' : ''}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center shrink-0">
                <Video className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold truncate">{v.title}</h3>
                  <Badge variant={v.video_type === 'welcome' ? 'default' : 'secondary'}>
                    {v.video_type === 'welcome' ? '🌟 Boas-vindas' : '📢 Novidades'}
                  </Badge>
                </div>
                {v.description && <p className="text-sm text-muted-foreground truncate">{v.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(v.created_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Ativo</Label>
                  <Switch checked={v.is_active} onCheckedChange={() => toggleActive(v.id, v.is_active)} />
                </div>
                <Button size="icon" variant="ghost" onClick={() => window.open(v.video_url, '_blank')}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteVideo(v.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
