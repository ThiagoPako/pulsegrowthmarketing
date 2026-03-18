import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadFileToVps, VPS_BASE_URL } from '@/services/vpsApi';
import {
  Upload, X, Play, Pause, Music, Film, Clapperboard, Check, Eye,
  Video, Loader2, VolumeX, ChevronDown, ChevronUp, Image as ImageIcon,
  Car, Gauge, MapPin, Phone, Save, CloudOff, Cloud, HardDrive
} from 'lucide-react';

interface Props {
  clientId: string;
  clientColor: string;
  clientName?: string;
  clientWhatsapp?: string;
  clientCity?: string;
  flyerImageDataUrl?: string | null;
}

type VideoSegment = 'intro' | 'car' | 'closing';

const TRANSMISSION_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatico', label: 'Automático' },
];
const FUEL_OPTIONS = [
  { value: 'flex', label: 'Flex' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'etanol', label: 'Etanol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'eletrico', label: 'Elétrico' },
  { value: 'hibrido', label: 'Híbrido' },
];
const TIRE_OPTIONS = [
  { value: 'novo', label: 'Novos' },
  { value: 'bom', label: 'Bons' },
  { value: 'regular', label: 'Regular' },
];
const IPVA_OPTIONS = [
  { value: 'pago', label: 'IPVA Pago' },
  { value: 'pendente', label: 'IPVA Pendente' },
  { value: 'nenhum', label: 'Não informar' },
];
const PORTAL_MEDIA_PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-media-proxy`;
const VPS_UPLOADS_URL = 'https://agenciapulse.tech/uploads';

function formatPrice(raw: string): string {
  const num = parseInt(raw, 10);
  if (isNaN(num)) return '';
  return `R$ ${(num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

const STORAGE_KEY_PREFIX = 'flyer-video-media-';

interface SavedMedia {
  introUrl?: string;
  closingUrl?: string;
  musicUrl?: string;
  musicName?: string;
}

function loadSavedMedia(clientId: string): SavedMedia {
  try {
    const s = localStorage.getItem(`${STORAGE_KEY_PREFIX}${clientId}`);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function persistMedia(clientId: string, media: SavedMedia) {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${clientId}`, JSON.stringify(media));
}

function shouldProxyPreviewVideo(url: string) {
  return url.startsWith(VPS_UPLOADS_URL);
}

async function createPreviewVideoObjectUrl(url: string) {
  const response = await fetch(PORTAL_MEDIA_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar o vídeo (${response.status})`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('O vídeo retornou vazio.');
  }

  return URL.createObjectURL(blob);
}

/** Upload file with XHR for progress tracking */
function uploadWithProgress(
  file: File,
  folder: string,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('folder', folder);
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${VPS_BASE_URL}/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const url = data.url || data.path;
          if (!url) { reject(new Error('No URL returned')); return; }
          const publicUrl = url.startsWith('http') ? url : `https://agenciapulse.tech/uploads/${url.replace(/^\/+|^uploads\//, '')}`;
          resolve(publicUrl);
        } catch { reject(new Error('Invalid response')); }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

export default function PortalPanfletagemVideo({ clientId, clientColor, clientName, clientWhatsapp, clientCity, flyerImageDataUrl }: Props) {
  // Saved media from VPS
  const saved = loadSavedMedia(clientId);

  // Video segments — URLs (can be blob: or https:)
  const [introVideo, setIntroVideo] = useState<string | null>(saved.introUrl || null);
  const [introFile, setIntroFile] = useState<File | null>(null);
  const [introSaved, setIntroSaved] = useState(!!saved.introUrl);

  const [carVideo, setCarVideo] = useState<string | null>(null);
  const [carFile, setCarFile] = useState<File | null>(null);

  const [closingVideo, setClosingVideo] = useState<string | null>(saved.closingUrl || null);
  const [closingFile, setClosingFile] = useState<File | null>(null);
  const [closingSaved, setClosingSaved] = useState(!!saved.closingUrl);

  // Music
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicName, setMusicName] = useState(saved.musicName || '');
  const [musicUrl, setMusicUrl] = useState<string | null>(saved.musicUrl || null);
  const [musicSaved, setMusicSaved] = useState(!!saved.musicUrl);

  // Upload progress
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  // Preview loading
  const [previewLoading, setPreviewLoading] = useState(false);

  // Options
  const [useLayoutOverlay, setUseLayoutOverlay] = useState(true);
  const [overlayDuration, setOverlayDuration] = useState(3);
  const [musicFadeIn, setMusicFadeIn] = useState(2);
  const [musicFadeOut, setMusicFadeOut] = useState(2);

  // Vehicle info
  const savedVehicle = (() => {
    try { const s = localStorage.getItem(`flyer-vehicle-video-${clientId}`); return s ? JSON.parse(s) : null; } catch { return null; }
  })();
  const [model, setModel] = useState(savedVehicle?.model || '');
  const [year, setYear] = useState(savedVehicle?.year || '');
  const [transmission, setTransmission] = useState(savedVehicle?.transmission || 'manual');
  const [fuelType, setFuelType] = useState(savedVehicle?.fuelType || 'flex');
  const [tireCondition, setTireCondition] = useState(savedVehicle?.tireCondition || 'bom');
  const [price, setPrice] = useState(savedVehicle?.price || '');
  const [ipvaStatus, setIpvaStatus] = useState(savedVehicle?.ipvaStatus || 'nenhum');
  const [extraInfo, setExtraInfo] = useState(savedVehicle?.extraInfo || '');
  const [footerAddress, setFooterAddress] = useState(savedVehicle?.footerAddress || clientCity || '');
  const [footerWhatsapp, setFooterWhatsapp] = useState(savedVehicle?.footerWhatsapp || clientWhatsapp || '');

  // Preview
  const [activePreview, setActivePreview] = useState<VideoSegment | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const previewRequestIdRef = useRef(0);

  const [generating, setGenerating] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('vehicle-info');

  const introInputRef = useRef<HTMLInputElement>(null);
  const carInputRef = useRef<HTMLInputElement>(null);
  const closingInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const releasePreviewObjectUrl = useCallback(() => {
    if (!previewObjectUrlRef.current) return;
    URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = null;
  }, []);

  // ===== UPLOAD HANDLERS =====
  const handleVideoUpload = (segment: VideoSegment) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Selecione um arquivo de vídeo'); return; }
    if (file.size > 200 * 1024 * 1024) { toast.error('Arquivo muito grande (máximo 200MB)'); return; }
    const url = URL.createObjectURL(file);
    switch (segment) {
      case 'intro': setIntroVideo(url); setIntroFile(file); setIntroSaved(false); break;
      case 'car': setCarVideo(url); setCarFile(file); break;
      case 'closing': setClosingVideo(url); setClosingFile(file); setClosingSaved(false); break;
    }
    toast.success(`Vídeo de ${segment === 'intro' ? 'abertura' : segment === 'car' ? 'veículo' : 'finalização'} adicionado!`);
    e.target.value = '';
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) { toast.error('Selecione um arquivo de áudio'); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error('Arquivo muito grande (máximo 50MB)'); return; }
    setMusicFile(file);
    setMusicName(file.name);
    setMusicUrl(URL.createObjectURL(file));
    setMusicSaved(false);
    toast.success('Música adicionada!');
    e.target.value = '';
  };

  // ===== SAVE TO VPS =====
  const saveToVps = async (type: 'intro' | 'closing' | 'music') => {
    const file = type === 'intro' ? introFile : type === 'closing' ? closingFile : musicFile;
    if (!file) { toast.error('Selecione um arquivo primeiro'); return; }

    const folder = `panfletagem/${clientId}`;
    setUploading(p => ({ ...p, [type]: true }));
    setUploadProgress(p => ({ ...p, [type]: 0 }));

    try {
      const url = await uploadWithProgress(file, folder, (pct) => {
        setUploadProgress(p => ({ ...p, [type]: pct }));
      });

      const media = loadSavedMedia(clientId);
      if (type === 'intro') {
        media.introUrl = url; setIntroVideo(url); setIntroSaved(true);
      } else if (type === 'closing') {
        media.closingUrl = url; setClosingVideo(url); setClosingSaved(true);
      } else {
        media.musicUrl = url; media.musicName = musicName; setMusicUrl(url); setMusicSaved(true);
      }
      persistMedia(clientId, media);
      toast.success(`${type === 'intro' ? 'Abertura' : type === 'closing' ? 'Finalização' : 'Música'} salva no sistema!`);
    } catch (err) {
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'erro desconhecido'}`);
    } finally {
      setUploading(p => ({ ...p, [type]: false }));
      setUploadProgress(p => ({ ...p, [type]: 0 }));
    }
  };

  const removeSegment = (segment: VideoSegment) => {
    switch (segment) {
      case 'intro':
        if (introVideo && introVideo.startsWith('blob:')) URL.revokeObjectURL(introVideo);
        setIntroVideo(null); setIntroFile(null); setIntroSaved(false);
        { const m = loadSavedMedia(clientId); delete m.introUrl; persistMedia(clientId, m); }
        break;
      case 'car':
        if (carVideo && carVideo.startsWith('blob:')) URL.revokeObjectURL(carVideo);
        setCarVideo(null); setCarFile(null);
        break;
      case 'closing':
        if (closingVideo && closingVideo.startsWith('blob:')) URL.revokeObjectURL(closingVideo);
        setClosingVideo(null); setClosingFile(null); setClosingSaved(false);
        { const m = loadSavedMedia(clientId); delete m.closingUrl; persistMedia(clientId, m); }
        break;
    }
    if (activePreview === segment) {
      setActivePreview(null);
      setIsPlaying(false);
      setPreviewLoading(false);
      const video = videoPreviewRef.current;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      releasePreviewObjectUrl();
    }
  };

  const removeMusic = () => {
    if (musicUrl && musicUrl.startsWith('blob:')) URL.revokeObjectURL(musicUrl);
    setMusicFile(null); setMusicName(''); setMusicUrl(null); setMusicSaved(false);
    const m = loadSavedMedia(clientId); delete m.musicUrl; delete m.musicName; persistMedia(clientId, m);
  };

  // ===== PREVIEW =====
  const previewSegment = useCallback((segment: VideoSegment) => {
    const url = segment === 'intro' ? introVideo : segment === 'car' ? carVideo : closingVideo;
    if (!url) return;

    if (activePreview === segment && videoPreviewRef.current?.currentSrc) {
      if (videoPreviewRef.current.paused) { videoPreviewRef.current.play().catch(() => {}); setIsPlaying(true); }
      else { videoPreviewRef.current.pause(); setIsPlaying(false); }
      return;
    }

    setActivePreview(segment);
    setIsPlaying(false);
    setPreviewLoading(true);
  }, [introVideo, carVideo, closingVideo, activePreview]);

  useEffect(() => {
    let cancelled = false;
    const video = videoPreviewRef.current;

    if (!activePreview || !video) {
      setPreviewLoading(false);
      setIsPlaying(false);
      return;
    }

    const sourceUrl = activePreview === 'intro' ? introVideo : activePreview === 'car' ? carVideo : closingVideo;
    if (!sourceUrl) {
      setPreviewLoading(false);
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    setPreviewLoading(true);
    setIsPlaying(false);

    const onReady = () => {
      if (cancelled || requestId !== previewRequestIdRef.current) return;
      setPreviewLoading(false);
      video.play().catch(() => setIsPlaying(false));
    };

    const onError = () => {
      if (cancelled || requestId !== previewRequestIdRef.current) return;
      setPreviewLoading(false);
      setIsPlaying(false);
      toast.error('Erro ao carregar vídeo para pré-visualização');
    };

    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });

    const preparePreview = async () => {
      try {
        const playbackUrl = shouldProxyPreviewVideo(sourceUrl)
          ? await createPreviewVideoObjectUrl(sourceUrl)
          : sourceUrl;

        if (cancelled || requestId !== previewRequestIdRef.current) {
          if (playbackUrl.startsWith('blob:') && playbackUrl !== sourceUrl) URL.revokeObjectURL(playbackUrl);
          return;
        }

        releasePreviewObjectUrl();
        if (playbackUrl.startsWith('blob:') && playbackUrl !== sourceUrl) {
          previewObjectUrlRef.current = playbackUrl;
        }

        video.pause();
        video.currentTime = 0;
        if (playbackUrl.startsWith('blob:')) video.removeAttribute('crossorigin');
        else video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.src = playbackUrl;
        video.load();
      } catch (error) {
        if (cancelled) return;
        setPreviewLoading(false);
        setIsPlaying(false);
        toast.error(error instanceof Error ? error.message : 'Erro ao preparar a pré-visualização');
      }
    };

    preparePreview();

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };
  }, [activePreview, introVideo, carVideo, closingVideo, releasePreviewObjectUrl]);

  const togglePlayPause = () => {
    const v = videoPreviewRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  // Auto-save vehicle data
  useEffect(() => {
    const data = { model, year, transmission, fuelType, tireCondition, price, ipvaStatus, extraInfo, footerAddress, footerWhatsapp };
    localStorage.setItem(`flyer-vehicle-video-${clientId}`, JSON.stringify(data));
  }, [model, year, transmission, fuelType, tireCondition, price, ipvaStatus, extraInfo, footerAddress, footerWhatsapp, clientId]);

  const importFromImage = () => {
    try {
      const s = localStorage.getItem(`flyer-vehicle-image-${clientId}`);
      if (!s) { toast.error('Nenhum dado salvo na aba Imagem'); return; }
      const d = JSON.parse(s);
      if (d.model) setModel(d.model); if (d.year) setYear(d.year);
      if (d.transmission) setTransmission(d.transmission); if (d.fuelType) setFuelType(d.fuelType);
      if (d.tireCondition) setTireCondition(d.tireCondition); if (d.price) setPrice(d.price);
      if (d.ipvaStatus) setIpvaStatus(d.ipvaStatus); if (d.extraInfo != null) setExtraInfo(d.extraInfo);
      if (d.footerAddress) setFooterAddress(d.footerAddress); if (d.footerWhatsapp) setFooterWhatsapp(d.footerWhatsapp);
      toast.success('Dados importados da aba Imagem!');
    } catch { toast.error('Erro ao importar dados'); }
  };

  const handleGenerate = async () => {
    if (!carVideo && !introVideo && !closingVideo) { toast.error('Adicione pelo menos um vídeo'); return; }
    setGenerating(true);
    toast.info('A composição de vídeo será processada no servidor...');
    setTimeout(() => { setGenerating(false); toast.success('Funcionalidade em desenvolvimento. Os vídeos foram salvos!'); }, 2000);
  };

  useEffect(() => {
    return () => {
      releasePreviewObjectUrl();
      [introVideo, carVideo, closingVideo, musicUrl].forEach(u => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
    };
  }, [releasePreviewObjectUrl, introVideo, carVideo, closingVideo, musicUrl]);

  const segmentConfig = [
    { key: 'intro' as VideoSegment, label: 'Vídeo de Abertura', desc: 'Vinheta ou intro. Áudio mutado — apenas música de fundo.', icon: Clapperboard, video: introVideo, file: introFile, inputRef: introInputRef, saved: introSaved, canSave: true },
    { key: 'car' as VideoSegment, label: 'Vídeo do Veículo', desc: 'Vídeo principal do carro. Áudio mutado — apenas música de fundo.', icon: Video, video: carVideo, file: carFile, inputRef: carInputRef, saved: false, canSave: false },
    { key: 'closing' as VideoSegment, label: 'Finalização', desc: 'Encerramento, CTA ou logo final. Áudio mutado — apenas música de fundo.', icon: Film, video: closingVideo, file: closingFile, inputRef: closingInputRef, saved: closingSaved, canSave: true },
  ];

  const totalSegments = [introVideo, carVideo, closingVideo].filter(Boolean).length;

  const renderOptionButtons = (options: { value: string; label: string }[], current: string, setter: (v: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt.value} onClick={() => setter(opt.value)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${current === opt.value ? 'text-white border-2' : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'}`}
          style={current === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
          {opt.label}
        </button>
      ))}
    </div>
  );

  const renderSaveButton = (type: 'intro' | 'closing' | 'music', isSaved: boolean, hasFile: boolean) => {
    if (isSaved) {
      return (
        <div className="flex items-center gap-1.5 text-[10px] text-green-400 font-medium">
          <Cloud size={11} /> Salvo no sistema
        </div>
      );
    }
    if (!hasFile) return null;
    if (uploading[type]) {
      return (
        <div className="space-y-1.5 w-full">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-white/50">Enviando...</span>
            <span className="text-white/40 font-mono">{uploadProgress[type] || 0}%</span>
          </div>
          <Progress value={uploadProgress[type] || 0} className="h-1.5" />
        </div>
      );
    }
    return (
      <button onClick={() => saveToVps(type)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.06] border border-white/[0.1] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition-all"
        title="Salvar no sistema para carregamento rápido">
        <HardDrive size={11} /> Salvar no sistema
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Reels format badge */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: `hsl(${clientColor})` }}>
            <Film size={12} /> 1080 × 1920 — Reels
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-medium">
            <VolumeX size={11} /> Todos os vídeos mutados — apenas música de fundo
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
          <p className="text-[10px] text-amber-300/80 leading-relaxed">
            <strong>Zona segura:</strong> Evite info nos <strong>250px superiores</strong> e <strong>280px inferiores</strong>.
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2 mb-4">
          <Film size={16} style={{ color: `hsl(${clientColor})` }} /> Linha do Tempo
        </h3>
        <div className="flex items-center gap-1">
          <div className={`flex-1 h-12 rounded-l-xl flex items-center justify-center text-xs font-medium transition-all ${introVideo ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
            style={introVideo ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
            <Clapperboard size={12} className="mr-1" /> Abertura
            {introSaved && <Cloud size={8} className="ml-1 text-green-400" />}
          </div>
          {useLayoutOverlay && flyerImageDataUrl && (
            <div className="w-16 h-12 flex items-center justify-center text-[9px] font-medium border-2 text-white rounded-md"
              style={{ borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.25)` }}>
              <ImageIcon size={10} className="mr-0.5" /> Layout
            </div>
          )}
          <div className={`flex-[2] h-12 flex items-center justify-center text-xs font-medium transition-all ${carVideo ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
            style={carVideo ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
            <Video size={12} className="mr-1" /> Veículo
          </div>
          <div className={`flex-1 h-12 rounded-r-xl flex items-center justify-center text-xs font-medium transition-all ${closingVideo ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
            style={closingVideo ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
            <Film size={12} className="mr-1" /> Final
            {closingSaved && <Cloud size={8} className="ml-1 text-green-400" />}
          </div>
        </div>
        <div className={`mt-2 h-8 rounded-xl flex items-center justify-center text-[10px] font-medium transition-all ${musicUrl ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
          style={musicUrl ? { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)' } : {}}>
          <Music size={10} className="mr-1" />
          {musicUrl ? `♪ ${musicName} (fade in ${musicFadeIn}s · fade out ${musicFadeOut}s)` : 'Música de fundo (opcional)'}
          {musicSaved && <Cloud size={8} className="ml-1.5 text-green-400" />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Vehicle Info */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
            <button onClick={() => setExpandedSection(expandedSection === 'vehicle-info' ? null : 'vehicle-info')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `hsl(${clientColor} / 0.15)` }}>
                  <Car size={16} style={{ color: `hsl(${clientColor})` }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">Dados do Veículo</p>
                  <p className="text-[10px] text-white/40">{model ? `${model} ${year}` : 'Preencha os dados'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {model && year && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `hsl(${clientColor})` }}><Check size={10} className="text-white" /></div>}
                {expandedSection === 'vehicle-info' ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
              </div>
            </button>
            <AnimatePresence>
              {expandedSection === 'vehicle-info' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-4">
                    <button onClick={(e) => { e.stopPropagation(); importFromImage(); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-white/[0.06] border border-white/[0.1] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition-all">
                      <ImageIcon size={13} /> Importar dados da aba Imagem
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">Modelo *</Label>
                        <Input value={model} onChange={e => setModel(e.target.value)} placeholder="Ex: Honda Civic" className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">Ano *</Label>
                        <Input value={year} onChange={e => setYear(e.target.value)} placeholder="Ex: 2023/2024" className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
                      </div>
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs text-white/60">Câmbio</Label>{renderOptionButtons(TRANSMISSION_OPTIONS, transmission, setTransmission)}</div>
                    <div className="space-y-1.5"><Label className="text-xs text-white/60">Combustível</Label>{renderOptionButtons(FUEL_OPTIONS, fuelType, setFuelType)}</div>
                    <div className="space-y-1.5"><Label className="text-xs text-white/60">Pneus</Label>{renderOptionButtons(TIRE_OPTIONS, tireCondition, setTireCondition)}</div>
                    <div className="space-y-1.5"><Label className="text-xs text-white/60">IPVA</Label>{renderOptionButtons(IPVA_OPTIONS, ipvaStatus, setIpvaStatus)}</div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/60">Valor</Label>
                      <Input value={price ? formatPrice(price) : ''} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="R$ 0,00" className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30 text-lg font-bold" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/60">Observações extras</Label>
                      <Textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} placeholder="Ex: KM 61.845&#10;Único dono" rows={3} className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30 resize-none" />
                    </div>
                    <div className="pt-3 border-t border-white/[0.06] space-y-3">
                      <p className="text-[11px] text-white/50 font-medium flex items-center gap-1.5"><MapPin size={10} /> Endereço e Contato</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60 flex items-center gap-1.5"><MapPin size={10} /> Endereço</Label>
                        <Input value={footerAddress} onChange={e => setFooterAddress(e.target.value)} placeholder="Ex: Av. Brasil, 1500" className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60 flex items-center gap-1.5"><Phone size={10} /> WhatsApp</Label>
                        <Input value={footerWhatsapp} onChange={e => setFooterWhatsapp(e.target.value)} placeholder="Ex: (11) 99999-9999" className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Video segments */}
          {segmentConfig.map(seg => (
            <div key={seg.key} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
              <button onClick={() => setExpandedSection(expandedSection === seg.key ? null : seg.key)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: seg.video ? `hsl(${clientColor} / 0.15)` : 'rgba(255,255,255,0.04)' }}>
                    <seg.icon size={16} style={{ color: seg.video ? `hsl(${clientColor})` : 'rgba(255,255,255,0.3)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">{seg.label}</p>
                    <p className="text-[10px] text-white/40">
                      {seg.saved ? '✓ Salvo no sistema' : seg.file ? seg.file.name : seg.video ? 'Carregado do sistema' : 'Nenhum vídeo'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {seg.saved && <Cloud size={12} className="text-green-400" />}
                  {seg.video && !seg.saved && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `hsl(${clientColor})` }}><Check size={10} className="text-white" /></div>}
                  {expandedSection === seg.key ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
                </div>
              </button>
              <AnimatePresence>
                {expandedSection === seg.key && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-4 pb-4 space-y-3">
                      <p className="text-[11px] text-white/40">{seg.desc}</p>
                      {seg.canSave && seg.video && (
                        <div className="flex items-center justify-between">
                          {renderSaveButton(seg.key as 'intro' | 'closing', seg.saved, !!seg.file)}
                        </div>
                      )}
                      {uploading[seg.key] && (
                        <div className="space-y-1">
                          <Progress value={uploadProgress[seg.key] || 0} className="h-2" />
                          <p className="text-[10px] text-white/40 text-center">{uploadProgress[seg.key] || 0}%</p>
                        </div>
                      )}
                      {seg.video ? (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-64">
                            <video src={seg.video} className="w-full h-full object-cover" muted playsInline crossOrigin="anonymous" />
                            <div className="absolute bottom-2 right-2 flex gap-1">
                              <button onClick={() => previewSegment(seg.key)}
                                className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors">
                                <Play size={12} className="text-white" />
                              </button>
                              <button onClick={() => removeSegment(seg.key)}
                                className="w-8 h-8 rounded-full bg-red-600/60 flex items-center justify-center hover:bg-red-600/80 transition-colors">
                                <X size={12} className="text-white" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => seg.inputRef.current?.click()}
                          className="w-full h-28 border-2 border-dashed border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-white/[0.25] hover:bg-white/[0.02] transition-all">
                          <Upload size={20} className="text-white/30" />
                          <span className="text-xs text-white/40">Clique para enviar vídeo</span>
                        </button>
                      )}
                      <input ref={seg.inputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload(seg.key)} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {/* Music */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
            <button onClick={() => setExpandedSection(expandedSection === 'music' ? null : 'music')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: musicUrl ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)' }}>
                  <Music size={16} style={{ color: musicUrl ? '#22c55e' : 'rgba(255,255,255,0.3)' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">Música de Fundo</p>
                  <p className="text-[10px] text-white/40">{musicSaved ? '✓ Salva no sistema' : musicUrl ? musicName : 'Nenhuma música'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {musicSaved && <Cloud size={12} className="text-green-400" />}
                {musicUrl && !musicSaved && <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check size={10} className="text-white" /></div>}
                {expandedSection === 'music' ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
              </div>
            </button>
            <AnimatePresence>
              {expandedSection === 'music' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[11px] text-white/40">Música para todo o vídeo. Todos os segmentos terão áudio mutado.</p>
                    {musicUrl ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/[0.08] border border-green-500/20">
                          <Music size={16} className="text-green-400 shrink-0" />
                          <span className="text-xs text-white/70 truncate flex-1">{musicName}</span>
                          {musicUrl && <audio ref={audioPreviewRef} src={musicUrl} className="hidden" />}
                          <button onClick={removeMusic} className="w-7 h-7 rounded-full bg-red-600/40 flex items-center justify-center hover:bg-red-600/60">
                            <X size={10} className="text-white" />
                          </button>
                        </div>
                        {renderSaveButton('music', musicSaved, !!musicFile)}
                        {uploading['music'] && (
                          <div className="space-y-1">
                            <Progress value={uploadProgress['music'] || 0} className="h-2" />
                            <p className="text-[10px] text-white/40 text-center">{uploadProgress['music'] || 0}%</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/50">Fade In</span>
                              <span className="text-[10px] text-white/40 font-mono">{musicFadeIn}s</span>
                            </div>
                            <Slider value={[musicFadeIn]} onValueChange={v => setMusicFadeIn(v[0])} min={0} max={5} step={0.5} className="w-full" />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/50">Fade Out</span>
                              <span className="text-[10px] text-white/40 font-mono">{musicFadeOut}s</span>
                            </div>
                            <Slider value={[musicFadeOut]} onValueChange={v => setMusicFadeOut(v[0])} min={0} max={5} step={0.5} className="w-full" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => musicInputRef.current?.click()}
                        className="w-full h-20 border-2 border-dashed border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-green-500/30 hover:bg-green-500/[0.02] transition-all">
                        <Music size={18} className="text-white/30" />
                        <span className="text-xs text-white/40">Enviar MP3 ou áudio</span>
                      </button>
                    )}
                    <input ref={musicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Layout overlay */}
          {flyerImageDataUrl && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon size={14} style={{ color: `hsl(${clientColor})` }} />
                  <Label className="text-xs text-white/70">Usar layout como slide</Label>
                </div>
                <button onClick={() => setUseLayoutOverlay(!useLayoutOverlay)}
                  className={`w-10 h-5 rounded-full transition-all ${useLayoutOverlay ? '' : 'bg-white/[0.15]'}`}
                  style={useLayoutOverlay ? { backgroundColor: `hsl(${clientColor})` } : {}}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${useLayoutOverlay ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {useLayoutOverlay && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Duração</span>
                    <span className="text-[10px] text-white/40 font-mono">{overlayDuration}s</span>
                  </div>
                  <Slider value={[overlayDuration]} onValueChange={v => setOverlayDuration(v[0])} min={1} max={8} step={1} className="w-full" />
                  <div className="w-20 h-28 rounded-lg overflow-hidden border border-white/[0.1]">
                    <img src={flyerImageDataUrl} alt="Layout" className="w-full h-full object-cover" />
                  </div>
                </div>
              )}
            </div>
          )}

          <Button onClick={handleGenerate} disabled={generating || totalSegments === 0}
            className="w-full h-12 text-sm font-semibold rounded-xl" style={{ backgroundColor: `hsl(${clientColor})` }}>
            {generating ? <><Loader2 size={16} className="animate-spin mr-2" /> Processando...</> : <><Film size={16} className="mr-2" /> Gerar Vídeo ({totalSegments})</>}
          </Button>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <Eye size={16} style={{ color: `hsl(${clientColor})` }} /> Pré-visualização
              </h3>
              <span className="text-[9px] text-white/30 font-mono">1080×1920</span>
            </div>

            {activePreview ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16]">
                  {previewLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/70">
                      <Loader2 size={28} className="animate-spin text-white/60 mb-2" />
                      <p className="text-[10px] text-white/40">Carregando vídeo...</p>
                    </div>
                  )}
                  <video
                    ref={videoPreviewRef}
                    className="w-full h-full object-cover"
                    onEnded={() => setIsPlaying(false)}
                    onPause={() => setIsPlaying(false)}
                    onPlay={() => { setIsPlaying(true); setPreviewLoading(false); }}
                    playsInline
                    muted
                    crossOrigin="anonymous"
                  />
                  <div className="absolute top-0 inset-x-0 h-[13%] bg-red-500/10 border-b border-dashed border-red-400/30 flex items-center justify-center pointer-events-none">
                    <span className="text-[8px] text-red-300/60 font-medium">ZONA COBERTA</span>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 h-[14.6%] bg-red-500/10 border-t border-dashed border-red-400/30 flex items-end justify-center pb-1 pointer-events-none">
                    <span className="text-[8px] text-red-300/60 font-medium">ZONA COBERTA</span>
                  </div>
                  <div className="absolute bottom-[16%] inset-x-3 flex items-center justify-between z-10">
                    <button onClick={togglePlayPause} className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80">
                      {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white ml-0.5" />}
                    </button>
                    <span className="text-[10px] text-white/50 bg-black/40 px-2 py-1 rounded-full">
                      {activePreview === 'intro' ? 'Abertura' : activePreview === 'car' ? 'Veículo' : 'Finalização'}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setActivePreview(null); setIsPlaying(false); setPreviewLoading(false); }}
                  className="w-full text-xs border-white/[0.1] text-white/60">
                  Fechar prévia
                </Button>
              </div>
            ) : (
              <div className="relative aspect-[9/16] rounded-xl bg-white/[0.02] border border-dashed border-white/[0.1] flex flex-col items-center justify-center gap-3">
                <div className="absolute top-0 inset-x-0 h-[13%] bg-red-500/5 border-b border-dashed border-red-400/20 flex items-center justify-center pointer-events-none">
                  <span className="text-[8px] text-red-300/40 font-medium">ZONA COBERTA</span>
                </div>
                <div className="absolute bottom-0 inset-x-0 h-[14.6%] bg-red-500/5 border-t border-dashed border-red-400/20 flex items-end justify-center pb-1 pointer-events-none">
                  <span className="text-[8px] text-red-300/40 font-medium">ZONA COBERTA</span>
                </div>
                <Video size={32} className="text-white/15" />
                <p className="text-xs text-white/30 text-center px-8">
                  Formato Reels 1080×1920<br />
                  Clique em <Play size={10} className="inline" /> para pré-visualizar
                </p>
              </div>
            )}
          </div>

          {/* Composition order */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-white/60 mb-3">Ordem de composição</h3>
            <div className="space-y-2">
              {[
                { label: '1. Abertura', done: !!introVideo, optional: true, saved: introSaved },
                { label: '2. Layout (imagem)', done: !!(useLayoutOverlay && flyerImageDataUrl), optional: true, saved: false },
                { label: '3. Vídeo do veículo', done: !!carVideo, optional: false, saved: false },
                { label: '4. Finalização', done: !!closingVideo, optional: true, saved: closingSaved },
                { label: '♪ Música de fundo', done: !!musicUrl, optional: true, saved: musicSaved },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${step.done ? '' : 'bg-white/[0.08]'}`}
                    style={step.done ? { backgroundColor: `hsl(${clientColor})` } : {}}>
                    {step.done && <Check size={8} className="text-white" />}
                  </div>
                  <span className={step.done ? 'text-white/70' : 'text-white/30'}>
                    {step.label} {step.saved && <Cloud size={8} className="inline text-green-400 ml-1" />}
                    {step.optional && !step.done && <span className="text-white/20">(opcional)</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
