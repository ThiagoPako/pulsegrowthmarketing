import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { uploadFileToVps, uploadBlobToVps } from '@/services/vpsApi';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Film, Image, Palette, Video, Trash2, ExternalLink, Eye, Loader2, Play, Grid3X3, Sparkles, Copy, KeyRound, X } from 'lucide-react';
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

/* ── Video Player Modal ── */
function VideoPlayerModal({ content, onClose }: { content: ContentRow; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full mb-3">
          <div>
            <h3 className="text-white font-semibold text-lg">{content.title}</h3>
            <p className="text-white/60 text-sm">{(content as any).clients?.company_name}</p>
          </div>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        {content.file_url?.match(/\.(mp4|mov|webm|avi)(\?|$)/i) || ['reel', 'institucional', 'anuncio'].includes(content.content_type) ? (
          <video
            ref={videoRef}
            src={content.file_url || ''}
            controls
            autoPlay
            playsInline
            className="w-full max-h-[80vh] rounded-xl bg-black"
          />
        ) : (
          <img src={content.file_url || ''} alt={content.title} className="w-full max-h-[80vh] object-contain rounded-xl" />
        )}
      </motion.div>
    </div>
  );
}

/* ── Instagram-style grid tile with hover video preview ── */
function ContentTile({ content, onDelete, onPlay }: { content: ContentRow; onDelete: (id: string) => void; onPlay: (content: ContentRow) => void }) {
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
    s === 'revisao_interna' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  const statusLabel = (s: string) =>
    s === 'aprovado' ? 'Aprovado' : s === 'ajuste_solicitado' ? 'Ajuste' : s === 'revisao_interna' ? 'Em Revisão' : 'Pendente';

  return (
    <div
      className="relative aspect-[9/16] bg-muted overflow-hidden cursor-pointer group"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onTouchStart={startPreview}
      onTouchEnd={stopPreview}
      onClick={() => content.file_url && onPlay(content)}
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
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={e => { e.stopPropagation(); onPlay(content); }}>
              <Eye size={14} />
            </Button>
          )}
          {content.file_url && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={e => { e.stopPropagation(); window.open(content.file_url!, '_blank'); }}>
              <ExternalLink size={14} />
            </Button>
          )}
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
  const navigate = useNavigate();
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
  const [showPortalSelector, setShowPortalSelector] = useState(false);
  const [playingContent, setPlayingContent] = useState<ContentRow | null>(null);

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
      const fileUrl = await uploadFileToVps(file, `content/${clientId}`);

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
            thumbnailUrl = await uploadBlobToVps(thumbBlob, `thumb_${Date.now()}.jpg`, `content/${clientId}/thumbs`);
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
    const { deletePortalContent } = await import('@/lib/contentDeleteSync');
    await deletePortalContent(id);
    setContents(prev => prev.filter(c => c.id !== id));
    toast.success('Conteúdo excluído.');
  };

  const filteredContents = filterClient === 'all' ? contents : contents.filter(c => c.client_id === filterClient);

  return (
    <div className="space-y-6">
      {/* Pulse Club Netflix-style portal access */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-violet-600/20 via-purple-600/15 to-fuchsia-600/20 p-6 cursor-pointer group"
        onClick={() => {
          // Show client selector
          setShowPortalSelector(true);
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-fuchsia-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">Pulse Club</h2>
              <p className="text-sm text-muted-foreground">Acessar portal do cliente para gerenciar conteúdos e comentar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={e => {
                e.stopPropagation();
                setShowPortalSelector(true);
              }}
            >
              <Play size={14} className="fill-current" /> Acessar Portal
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Portal Client Selector Dialog */}
      {showPortalSelector && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPortalSelector(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[70vh] overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Sparkles size={18} className="text-violet-400" />
                Pulse Club — Selecionar Cliente
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Escolha o portal do cliente que deseja acessar</p>
            </div>
            <div className="p-3 max-h-[50vh] overflow-y-auto space-y-1">
              {clients.map(c => (
                <button
                  key={c.id}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent/50 transition-colors text-left group"
                  onClick={() => {
                    setShowPortalSelector(false);
                    const slug = encodeURIComponent(c.company_name.replace(/\s+/g, '-').toLowerCase());
                    navigate(`/portal/${slug}`);
                  }}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {c.company_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.company_name}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Copiar link de login"
                      onClick={e => {
                        e.stopPropagation();
                        const slug = encodeURIComponent(c.company_name.replace(/\s+/g, '-').toLowerCase());
                        navigator.clipboard.writeText(`${window.location.origin}/portal-login/${slug}`);
                        toast.success('Link de login copiado!');
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Copiar link de registro"
                      onClick={e => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(`${window.location.origin}/portal-registro/${c.id}`);
                        toast.success('Link de registro copiado!');
                      }}
                    >
                      <KeyRound size={14} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gerenciador de Conteúdos</h1>
          <p className="text-sm text-muted-foreground">Envie conteúdos para o Pulse Club</p>
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
                <ContentTile key={content.id} content={content} onDelete={handleDelete} onPlay={setPlayingContent} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Player Modal */}
      {playingContent && (
        <VideoPlayerModal content={playingContent} onClose={() => setPlayingContent(null)} />
      )}
    </div>
  );
}
