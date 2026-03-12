import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Film, Image, Palette, Video, Trash2, ExternalLink, Eye, Loader2, Play, Grid3X3, Sparkles, Copy, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion } from 'framer-motion';

const CONTENT_TYPES = [
  { value: 'reel', label: 'Reel', icon: Film },
  { value: 'criativo', label: 'Criativo', icon: Palette },
  { value: 'institucional', label: 'Institucional', icon: Video },
  { value: 'anuncio', label: 'Anúncio', icon: Video },
  { value: 'arte', label: 'Arte', icon: Image },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: format(new Date(2026, i), 'MMMM', { locale: pt }),
}));

interface ClientOption { id: string; company_name: string; }
interface ContentRow {
  id: string; client_id: string; title: string; content_type: string;
  season_month: number; season_year: number; file_url: string | null;
  thumbnail_url: string | null; duration_seconds: number; status: string;
  created_at: string; clients?: { company_name: string } | null;
}

/* ── Instagram-style grid tile with hover video preview ── */
function ContentTile({ content, onDelete }: { content: ContentRow; onDelete: (id: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovering, setHovering] = useState(false);

  const isVideo = !!(content.file_url?.match(/\.(mp4|mov|webm|avi)(\?|$)/i) ||
    ['reel', 'institucional', 'anuncio'].includes(content.content_type));

  const startPreview = useCallback(() => {
    setHovering(true);
    const vid = videoRef.current;
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
    }
  }, []);

  const stopPreview = useCallback(() => {
    setHovering(false);
    const vid = videoRef.current;
    if (vid) {
      vid.pause();
      vid.currentTime = 0;
    }
  }, []);

  const statusColor = (s: string) =>
    s === 'aprovado' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
    s === 'ajuste_solicitado' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  const statusLabel = (s: string) =>
    s === 'aprovado' ? 'Aprovado' : s === 'ajuste_solicitado' ? 'Ajuste' : 'Pendente';

  return (
    <div
      className="relative aspect-[9/16] bg-muted overflow-hidden cursor-pointer group"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onTouchStart={startPreview}
      onTouchEnd={stopPreview}
    >
      {/* Thumbnail / image layer */}
      {content.thumbnail_url ? (
        <img src={content.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : content.content_type === 'arte' && content.file_url ? (
        <img src={content.file_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Film size={36} />
        </div>
      )}

      {/* Video preview layer (hidden until hover) */}
      {isVideo && content.file_url && (
        <video
          ref={videoRef}
          src={content.file_url}
          muted
          playsInline
          preload="metadata"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${hovering ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {/* Play icon for videos (when not hovering) */}
      {isVideo && !hovering && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full p-1">
          <Play size={14} className="text-white fill-white" />
        </div>
      )}

      {/* Duration badge */}
      {content.duration_seconds > 0 && (
        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono z-10">
          {Math.floor(content.duration_seconds / 60)}:{(content.duration_seconds % 60).toString().padStart(2, '0')}
        </span>
      )}

      {/* Hover overlay with info */}
      <div className={`absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-white text-sm font-semibold text-center px-3 line-clamp-2">{content.title}</p>
        <p className="text-white/70 text-xs">{(content as any).clients?.company_name}</p>
        <Badge className={`text-[10px] ${statusColor(content.status)}`}>{statusLabel(content.status)}</Badge>
        <div className="flex items-center gap-1 mt-1">
          {content.file_url && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={e => { e.stopPropagation(); window.open(content.file_url!, '_blank'); }}>
              <ExternalLink size={14} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={e => { e.stopPropagation(); const name = (content as any).clients?.company_name || content.client_id; window.open(`/portal/${encodeURIComponent(name.replace(/\s+/g, '-').toLowerCase())}`, '_blank'); }}>
            <Eye size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-white/20" onClick={e => { e.stopPropagation(); onDelete(content.id); }}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ContentManager() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const now = new Date();
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [contentType, setContentType] = useState('reel');
  const [seasonMonth, setSeasonMonth] = useState(String(now.getMonth() + 1));
  const [seasonYear, setSeasonYear] = useState(String(now.getFullYear()));
  const [file, setFile] = useState<File | null>(null);
  const [filterClient, setFilterClient] = useState('all');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [clientsRes, contentsRes] = await Promise.all([
      supabase.from('clients').select('id, company_name').order('company_name'),
      supabase.from('client_portal_contents').select('*, clients(company_name)').order('created_at', { ascending: false }).limit(100),
    ]);
    if (clientsRes.data) setClients(clientsRes.data);
    if (contentsRes.data) setContents(contentsRes.data as ContentRow[]);
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!title.trim() || !clientId || !file) {
      toast.error('Preencha título, cliente e selecione um arquivo.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('client-content').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('client-content').getPublicUrl(filePath);
      const fileUrl = urlData.publicUrl;

      let thumbnailUrl: string | null = null;
      let durationSeconds = 0;

      if (file.type.startsWith('video/')) {
        try {
          const videoEl = document.createElement('video');
          videoEl.preload = 'metadata';
          videoEl.src = URL.createObjectURL(file);
          await new Promise<void>((resolve) => {
            videoEl.onloadedmetadata = () => {
              durationSeconds = Math.round(videoEl.duration);
              videoEl.currentTime = 1;
            };
            videoEl.onseeked = () => {
              const canvas = document.createElement('canvas');
              canvas.width = 480;
              canvas.height = 480;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const size = Math.min(videoEl.videoWidth, videoEl.videoHeight);
                const sx = (videoEl.videoWidth - size) / 2;
                const sy = (videoEl.videoHeight - size) / 2;
                ctx.drawImage(videoEl, sx, sy, size, size, 0, 0, 480, 480);
                thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
              }
              URL.revokeObjectURL(videoEl.src);
              resolve();
            };
            videoEl.onerror = () => resolve();
          });

          if (thumbnailUrl) {
            const thumbBlob = await fetch(thumbnailUrl).then(r => r.blob());
            const thumbPath = `${clientId}/thumbs/${Date.now()}.jpg`;
            await supabase.storage.from('client-content').upload(thumbPath, thumbBlob);
            const { data: thumbUrlData } = supabase.storage.from('client-content').getPublicUrl(thumbPath);
            thumbnailUrl = thumbUrlData.publicUrl;
          }
        } catch { /* thumbnail generation is best-effort */ }
      }

      const { error: insertError } = await supabase.from('client_portal_contents').insert({
        client_id: clientId,
        title: title.trim(),
        content_type: contentType,
        season_month: parseInt(seasonMonth),
        season_year: parseInt(seasonYear),
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl,
        duration_seconds: durationSeconds,
        uploaded_by: user?.id,
      });

      if (insertError) throw insertError;

      toast.success('Conteúdo enviado com sucesso!');
      setTitle('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadData();
    } catch (err: any) {
      toast.error(`Erro ao enviar: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este conteúdo?')) return;
    await supabase.from('client_portal_contents').delete().eq('id', id);
    setContents(prev => prev.filter(c => c.id !== id));
    toast.success('Conteúdo excluído.');
  };

  const filteredContents = filterClient === 'all' ? contents : contents.filter(c => c.client_id === filterClient);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gerenciador de Conteúdos</h1>
          <p className="text-sm text-muted-foreground">Envie conteúdos para a área do cliente</p>
        </div>
      </div>

      {/* Upload form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Upload size={18} /> Enviar Novo Conteúdo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Título</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome do conteúdo" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Cliente</label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Tipo de Conteúdo</label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Mês (Temporada)</label>
              <Select value={seasonMonth} onValueChange={setSeasonMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Ano</label>
              <Input type="number" value={seasonYear} onChange={e => setSeasonYear(e.target.value)} min={2024} max={2030} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Arquivo</label>
              <Input ref={fileInputRef} type="file" accept="video/*,image/*,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleUpload} disabled={uploading || !title || !clientId || !file}>
              {uploading ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : <><Upload size={16} /> Enviar Conteúdo</>}
            </Button>
            {file && <span className="text-sm text-muted-foreground">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>}
          </div>
        </CardContent>
      </Card>

      {/* Instagram-style grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Grid3X3 size={18} />
              Conteúdos Enviados ({filteredContents.length})
            </CardTitle>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar por cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : filteredContents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum conteúdo encontrado.</p>
          ) : (
            <div className="grid grid-cols-3 gap-px bg-border">
              {filteredContents.map(content => (
                <ContentTile key={content.id} content={content} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
