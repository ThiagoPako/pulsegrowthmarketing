import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Trash2, Video, Eye, Upload, Sparkles, Megaphone, Rocket, Film, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [showSuccess, setShowSuccess] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoType, setVideoType] = useState<'welcome' | 'news'>('welcome');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const { error } = await supabase.from('portal_videos').insert({
        title: title.trim(),
        description: description.trim() || null,
        video_type: videoType,
        video_url: url,
        is_active: true,
      });
      if (error) throw error;
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      toast.success('Vídeo publicado com sucesso! 🎬');
      setTitle('');
      setDescription('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadVideos();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao publicar vídeo');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('portal_videos').update({ is_active: !current }).eq('id', id);
    setVideos(prev => prev.map(v => v.id === id ? { ...v, is_active: !current } : v));
    toast.success(!current ? 'Vídeo ativado ✅' : 'Vídeo desativado');
  };

  const deleteVideo = async (id: string) => {
    if (!confirm('Excluir este vídeo permanentemente?')) return;
    await supabase.from('portal_videos').delete().eq('id', id);
    setVideos(prev => prev.filter(v => v.id !== id));
    toast.success('Vídeo excluído');
  };

  const welcomeVideos = videos.filter(v => v.video_type === 'welcome');
  const newsVideos = videos.filter(v => v.video_type === 'news');

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        className="flex items-center gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div
          className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Film className="h-7 w-7 text-amber-400" />
        </motion.div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
            Vídeos do Portal
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie os vídeos de boas-vindas e novidades do Pulse Club</p>
        </div>
      </motion.div>

      {/* Upload Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-card/80">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-orange-500/5" />
          <CardContent className="relative p-6 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Rocket className="h-5 w-5 text-amber-400" />
              </motion.div>
              <h2 className="text-lg font-bold">Novo Vídeo</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Título do Vídeo</Label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Boas-vindas ao Pulse Club"
                  className="border-primary/20 focus:border-amber-400/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo do Vídeo</Label>
                <Select value={videoType} onValueChange={v => setVideoType(v as any)}>
                  <SelectTrigger className="border-primary/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="welcome">
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        Boas-vindas
                      </span>
                    </SelectItem>
                    <SelectItem value="news">
                      <span className="flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-blue-400" />
                        Novidades
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Descrição (opcional)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Uma breve descrição sobre o conteúdo do vídeo..."
                rows={2}
                className="border-primary/20 resize-none"
              />
            </div>

            {/* File drop area */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Arquivo de Vídeo</Label>
              <motion.label
                className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                  file
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-primary/20 hover:border-amber-400/40 hover:bg-amber-500/5'
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {file ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-green-400" />
                    <span className="text-sm text-green-400 font-medium truncate max-w-xs">{file.name}</span>
                    <span className="text-xs text-muted-foreground">Clique para trocar</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para selecionar o vídeo</span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </motion.label>
            </div>

            {/* Publish button */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleUpload}
                disabled={uploading || !file || !title.trim()}
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25 disabled:opacity-40"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <Rocket className="h-5 w-5" />
                    </motion.div>
                    Enviando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Rocket className="h-5 w-5" />
                    Publicar Vídeo
                  </span>
                )}
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Success animation */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-500/90 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3"
          >
            <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: 2 }} className="text-2xl">🚀</motion.span>
            <span className="font-bold">Vídeo publicado com sucesso!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video lists */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <Rocket className="h-8 w-8 mx-auto text-amber-400" />
          </motion.div>
          <p className="mt-3">Carregando vídeos...</p>
        </div>
      ) : videos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <Video className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nenhum vídeo cadastrado ainda</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Publique o primeiro vídeo acima!</p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {/* Welcome videos */}
          {welcomeVideos.length > 0 && (
            <VideoSection
              icon={<Sparkles className="h-5 w-5 text-amber-400" />}
              title="Boas-vindas"
              subtitle={`${welcomeVideos.length} vídeo(s)`}
              videos={welcomeVideos}
              onToggle={toggleActive}
              onDelete={deleteVideo}
              accentColor="amber"
            />
          )}

          {/* News videos */}
          {newsVideos.length > 0 && (
            <VideoSection
              icon={<Megaphone className="h-5 w-5 text-blue-400" />}
              title="Novidades"
              subtitle={`${newsVideos.length} vídeo(s)`}
              videos={newsVideos}
              onToggle={toggleActive}
              onDelete={deleteVideo}
              accentColor="blue"
            />
          )}
        </div>
      )}
    </div>
  );
}

function VideoSection({
  icon, title, subtitle, videos, onToggle, onDelete, accentColor,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  videos: PortalVideo[];
  onToggle: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
  accentColor: 'amber' | 'blue';
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-bold text-lg">{title}</h3>
        <Badge variant="secondary" className="text-xs">{subtitle}</Badge>
      </div>
      <div className="grid gap-3">
        {videos.map((v, i) => (
          <VideoCard key={v.id} video={v} index={i} onToggle={onToggle} onDelete={onDelete} accentColor={accentColor} />
        ))}
      </div>
    </motion.div>
  );
}

function VideoCard({
  video: v, index, onToggle, onDelete, accentColor,
}: {
  video: PortalVideo;
  index: number;
  onToggle: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
  accentColor: 'amber' | 'blue';
}) {
  const borderColor = v.is_active
    ? accentColor === 'amber' ? 'border-amber-500/30' : 'border-blue-500/30'
    : 'border-muted/30';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className={`transition-all ${borderColor} ${!v.is_active ? 'opacity-50' : ''}`}>
        <CardContent className="flex items-center gap-4 p-4">
          <motion.div
            className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
              v.is_active
                ? accentColor === 'amber'
                  ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20'
                  : 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20'
                : 'bg-muted/30'
            }`}
            animate={v.is_active ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Video className={`h-6 w-6 ${v.is_active ? (accentColor === 'amber' ? 'text-amber-400' : 'text-blue-400') : 'text-muted-foreground'}`} />
          </motion.div>

          <div className="flex-1 min-w-0">
            <h4 className="font-semibold truncate">{v.title}</h4>
            {v.description && <p className="text-sm text-muted-foreground truncate">{v.description}</p>}
            <p className="text-xs text-muted-foreground/60 mt-1">
              {format(new Date(v.created_at), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {v.is_active ? 'Ativo' : 'Off'}
              </span>
              <Switch
                checked={v.is_active}
                onCheckedChange={() => onToggle(v.id, v.is_active)}
              />
            </div>

            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 hover:bg-primary/10"
                onClick={() => window.open(v.video_url, '_blank')}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(v.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
