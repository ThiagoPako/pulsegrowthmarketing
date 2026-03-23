import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { portalAction } from '@/lib/portalApi';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadFileToVps, VPS_BASE_URL } from '@/services/vpsApi';
import {
  Upload, X, Play, Pause, Music, Film, Clapperboard, Check, Eye,
  Video, Loader2, VolumeX, ChevronDown, ChevronUp, Image as ImageIcon,
  Car, Gauge, MapPin, Phone, Cloud, HardDrive, Download, Plus, Trash2
} from 'lucide-react';

/* ================================================================ */
/*  TYPES & CONSTANTS                                                */
/* ================================================================ */

interface Props {
  clientId: string;
  clientColor: string;
  clientName?: string;
  clientWhatsapp?: string;
  clientCity?: string;
  flyerImageDataUrl?: string | null;
  flyerOverlayDataUrl?: string | null;
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

const PORTAL_MEDIA_PROXY_URL = 'https://agenciapulse.tech/api/portal-media-proxy';
const VPS_UPLOADS_URL = 'https://agenciapulse.tech/uploads';
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const FPS = 30;

/* ================================================================ */
/*  HELPERS                                                          */
/* ================================================================ */

function formatPrice(raw: string): string {
  const num = parseInt(raw, 10);
  if (isNaN(num)) return '';
  return `R$ ${(num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

const STORAGE_KEY_PREFIX = 'flyer-video-media-';

interface SavedMedia { introUrl?: string; closingUrl?: string; musicUrl?: string; musicName?: string; }

function loadSavedMedia(clientId: string): SavedMedia {
  try { const s = localStorage.getItem(`${STORAGE_KEY_PREFIX}${clientId}`); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function persistMedia(clientId: string, media: SavedMedia) {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${clientId}`, JSON.stringify(media));
}

function shouldProxy(url: string) { return url.startsWith(VPS_UPLOADS_URL); }

async function proxyToBlobUrl(url: string): Promise<string> {
  const res = await fetch(PORTAL_MEDIA_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Proxy falhou (${res.status})`);
  const blob = await res.blob();
  if (!blob.size) throw new Error('Vídeo vazio');
  return URL.createObjectURL(blob);
}

async function ensureBlobUrl(url: string): Promise<string> {
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (shouldProxy(url)) return proxyToBlobUrl(url);
  // For other URLs, try fetching as blob
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return url; // fallback
  }
}

function uploadWithProgress(file: File, folder: string, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('folder', folder);
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${VPS_BASE_URL}/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const u = data.url || data.path;
          if (!u) { reject(new Error('No URL')); return; }
          resolve(u.startsWith('http') ? u : `https://agenciapulse.tech/uploads/${u.replace(/^\/+|^uploads\//, '')}`);
        } catch { reject(new Error('Bad response')); }
      } else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}

/* ================================================================ */
/*  COMPOSITION ENGINE                                               */
/* ================================================================ */

interface CompSegment { type: 'intro' | 'vehicle' | 'closing'; blobUrl: string; originalUrl: string; }

/* ================================================================ */
/*  COMPONENT                                                        */
/* ================================================================ */

export default function PortalPanfletagemVideo({ clientId, clientColor, clientName, clientWhatsapp, clientCity, flyerImageDataUrl, flyerOverlayDataUrl }: Props) {
  const saved = loadSavedMedia(clientId);

  // --- Media state ---
  const [introVideo, setIntroVideo] = useState<string | null>(saved.introUrl || null);
  const [introFile, setIntroFile] = useState<File | null>(null);
  const [introSaved, setIntroSaved] = useState(!!saved.introUrl);

  const [carVideos, setCarVideos] = useState<string[]>([]);
  const [carFiles, setCarFiles] = useState<File[]>([]);

  const [closingVideo, setClosingVideo] = useState<string | null>(saved.closingUrl || null);
  const [closingFile, setClosingFile] = useState<File | null>(null);
  const [closingSaved, setClosingSaved] = useState(!!saved.closingUrl);

  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicName, setMusicName] = useState(saved.musicName || '');
  const [musicUrl, setMusicUrl] = useState<string | null>(saved.musicUrl || null);
  const [musicSaved, setMusicSaved] = useState(!!saved.musicUrl);

  // --- Upload progress ---
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  // --- Vehicle info ---
  const savedVehicle = (() => { try { const s = localStorage.getItem(`flyer-vehicle-video-${clientId}`); return s ? JSON.parse(s) : null; } catch { return null; } })();
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

  // --- Composition ---
  const [compositionState, setCompositionState] = useState<'idle' | 'preparing' | 'previewing' | 'generating' | 'done'>('idle');
  const [compositionProgress, setCompositionProgress] = useState(0);
  const [currentSegLabel, setCurrentSegLabel] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedVideoBlob, setGeneratedVideoBlob] = useState<Blob | null>(null);
  const [savingToPortal, setSavingToPortal] = useState(false);

  const compositionCanvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const hiddenAudioRef = useRef<HTMLAudioElement>(null);
  const animFrameRef = useRef(0);
  const compositionSegmentsRef = useRef<CompSegment[]>([]);
  const currentSegIndexRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const isGeneratingRef = useRef(false);
  const blobUrlsToRevokeRef = useRef<string[]>([]);

  // Layout overlay image
  const [layoutOverlayImg, setLayoutOverlayImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!flyerImageDataUrl) { setLayoutOverlayImg(null); return; }
    const img = new Image();
    img.onload = () => setLayoutOverlayImg(img);
    img.src = flyerImageDataUrl;
  }, [flyerImageDataUrl]);

  // --- Options ---
  const [musicFadeIn, setMusicFadeIn] = useState(2);
  const [musicFadeOut, setMusicFadeOut] = useState(2);

  const [expandedSection, setExpandedSection] = useState<string | null>('vehicle-info');

  const introInputRef = useRef<HTMLInputElement>(null);
  const carInputRef = useRef<HTMLInputElement>(null);
  const closingInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  // --- Segment counts ---
  const totalSegments = (introVideo ? 1 : 0) + carVideos.length + (closingVideo ? 1 : 0);

  // ===== AUTO-SAVE =====
  useEffect(() => {
    const data = { model, year, transmission, fuelType, tireCondition, price, ipvaStatus, extraInfo, footerAddress, footerWhatsapp };
    localStorage.setItem(`flyer-vehicle-video-${clientId}`, JSON.stringify(data));
  }, [model, year, transmission, fuelType, tireCondition, price, ipvaStatus, extraInfo, footerAddress, footerWhatsapp, clientId]);

  // ===== UPLOAD HANDLERS =====
  const handleVideoUpload = (segment: VideoSegment) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    if (segment === 'car') {
      const newUrls: string[] = [];
      const newFiles: File[] = [];
      Array.from(files).forEach(file => {
        if (!file.type.startsWith('video/')) { toast.error(`${file.name} não é vídeo`); return; }
        if (file.size > 200 * 1024 * 1024) { toast.error(`${file.name} muito grande (max 200MB)`); return; }
        newUrls.push(URL.createObjectURL(file));
        newFiles.push(file);
      });
      setCarVideos(prev => [...prev, ...newUrls]);
      setCarFiles(prev => [...prev, ...newFiles]);
      if (newFiles.length) toast.success(`${newFiles.length} vídeo(s) do veículo adicionado(s)!`);
    } else {
      const file = files[0];
      if (!file.type.startsWith('video/')) { toast.error('Selecione um vídeo'); return; }
      if (file.size > 200 * 1024 * 1024) { toast.error('Muito grande (max 200MB)'); return; }
      const url = URL.createObjectURL(file);
      if (segment === 'intro') { setIntroVideo(url); setIntroFile(file); setIntroSaved(false); }
      else { setClosingVideo(url); setClosingFile(file); setClosingSaved(false); }
      toast.success(`Vídeo de ${segment === 'intro' ? 'abertura' : 'finalização'} adicionado!`);
    }
    e.target.value = '';
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) { toast.error('Selecione áudio'); return; }
    setMusicFile(file); setMusicName(file.name); setMusicUrl(URL.createObjectURL(file)); setMusicSaved(false);
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
      const url = await uploadWithProgress(file, folder, pct => setUploadProgress(p => ({ ...p, [type]: pct })));
      const media = loadSavedMedia(clientId);
      if (type === 'intro') { media.introUrl = url; setIntroVideo(url); setIntroSaved(true); }
      else if (type === 'closing') { media.closingUrl = url; setClosingVideo(url); setClosingSaved(true); }
      else { media.musicUrl = url; media.musicName = musicName; setMusicUrl(url); setMusicSaved(true); }
      persistMedia(clientId, media);
      toast.success(`${type === 'intro' ? 'Abertura' : type === 'closing' ? 'Finalização' : 'Música'} salva!`);
    } catch (err) { toast.error(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`); }
    finally { setUploading(p => ({ ...p, [type]: false })); setUploadProgress(p => ({ ...p, [type]: 0 })); }
  };

  const removeSegment = (segment: VideoSegment, index?: number) => {
    if (segment === 'car' && index != null) {
      setCarVideos(prev => { const n = [...prev]; if (n[index]?.startsWith('blob:')) URL.revokeObjectURL(n[index]); n.splice(index, 1); return n; });
      setCarFiles(prev => { const n = [...prev]; n.splice(index, 1); return n; });
    } else if (segment === 'intro') {
      if (introVideo?.startsWith('blob:')) URL.revokeObjectURL(introVideo);
      setIntroVideo(null); setIntroFile(null); setIntroSaved(false);
      const m = loadSavedMedia(clientId); delete m.introUrl; persistMedia(clientId, m);
    } else if (segment === 'closing') {
      if (closingVideo?.startsWith('blob:')) URL.revokeObjectURL(closingVideo);
      setClosingVideo(null); setClosingFile(null); setClosingSaved(false);
      const m = loadSavedMedia(clientId); delete m.closingUrl; persistMedia(clientId, m);
    }
  };

  const removeMusic = () => {
    if (musicUrl?.startsWith('blob:')) URL.revokeObjectURL(musicUrl);
    setMusicFile(null); setMusicName(''); setMusicUrl(null); setMusicSaved(false);
    const m = loadSavedMedia(clientId); delete m.musicUrl; delete m.musicName; persistMedia(clientId, m);
  };

  const importFromImage = () => {
    try {
      const s = localStorage.getItem(`flyer-vehicle-image-${clientId}`);
      if (!s) { toast.error('Nenhum dado na aba Imagem'); return; }
      const d = JSON.parse(s);
      if (d.model) setModel(d.model); if (d.year) setYear(d.year);
      if (d.transmission) setTransmission(d.transmission); if (d.fuelType) setFuelType(d.fuelType);
      if (d.tireCondition) setTireCondition(d.tireCondition); if (d.price) setPrice(d.price);
      if (d.ipvaStatus) setIpvaStatus(d.ipvaStatus); if (d.extraInfo != null) setExtraInfo(d.extraInfo);
      if (d.footerAddress) setFooterAddress(d.footerAddress); if (d.footerWhatsapp) setFooterWhatsapp(d.footerWhatsapp);
      toast.success('Dados importados!');
    } catch { toast.error('Erro ao importar'); }
  };

  // ===== COMPOSITION ENGINE =====

  const stopComposition = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    const video = hiddenVideoRef.current;
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    const audio = hiddenAudioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    isGeneratingRef.current = false;
    blobUrlsToRevokeRef.current.forEach(u => URL.revokeObjectURL(u));
    blobUrlsToRevokeRef.current = [];
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = compositionCanvasRef.current;
    const video = hiddenVideoRef.current;
    if (!canvas || !video || video.paused || video.ended) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame scaled to fill canvas (cover)
    const vw = video.videoWidth || CANVAS_W;
    const vh = video.videoHeight || CANVAS_H;
    const scale = Math.max(CANVAS_W / vw, CANVAS_H / vh);
    const sw = vw * scale;
    const sh = vh * scale;
    const sx = (CANVAS_W - sw) / 2;
    const sy = (CANVAS_H - sh) / 2;
    ctx.drawImage(video, sx, sy, sw, sh);

    // Overlay layout during vehicle segments
    const seg = compositionSegmentsRef.current[currentSegIndexRef.current];
    if (seg?.type === 'vehicle' && layoutOverlayImg) {
      ctx.globalAlpha = 0.75;
      // Detect overlay aspect — if it matches story (9:16) draw full, otherwise center feed (4:5)
      const overlayRatio = layoutOverlayImg.naturalWidth / layoutOverlayImg.naturalHeight;
      if (overlayRatio < 0.6) {
        // Story format (9:16 ≈ 0.5625) — draw full canvas
        ctx.drawImage(layoutOverlayImg, 0, 0, CANVAS_W, CANVAS_H);
      } else {
        // Feed format (4:5 = 0.8) — center vertically
        const lh = Math.round(CANVAS_H * (1350 / 1920));
        const ly = Math.round((CANVAS_H - lh) / 2);
        ctx.drawImage(layoutOverlayImg, 0, ly, CANVAS_W, lh);
      }
      ctx.globalAlpha = 1.0;
    }

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, [layoutOverlayImg]);

  const playNextSegment = useCallback(() => {
    const segments = compositionSegmentsRef.current;
    const idx = currentSegIndexRef.current;
    if (idx >= segments.length) {
      // Composition ended
      cancelAnimationFrame(animFrameRef.current);
      const audio = hiddenAudioRef.current;
      if (audio) { audio.pause(); }
      if (isGeneratingRef.current && mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (!isGeneratingRef.current) {
        setCompositionState('idle');
        setCurrentSegLabel('Concluído');
      }
      return;
    }

    const seg = segments[idx];
    setCurrentSegLabel(seg.type === 'intro' ? 'Abertura' : seg.type === 'closing' ? 'Finalização' : `Veículo ${idx - (compositionSegmentsRef.current[0]?.type === 'intro' ? 1 : 0) + (compositionSegmentsRef.current[0]?.type !== 'intro' ? 1 : 0)}`);
    setCompositionProgress(Math.round(((idx) / segments.length) * 100));

    const video = hiddenVideoRef.current;
    if (!video) return;

    video.onended = () => {
      currentSegIndexRef.current += 1;
      playNextSegment();
    };

    video.onerror = () => {
      toast.error(`Erro ao reproduzir segmento: ${seg.type}`);
      currentSegIndexRef.current += 1;
      playNextSegment();
    };

    video.src = seg.blobUrl;
    video.muted = true;
    video.load();
    video.play().then(() => {
      drawFrame();
    }).catch(() => {
      currentSegIndexRef.current += 1;
      playNextSegment();
    });
  }, [drawFrame]);

  const startComposition = useCallback(async (generate: boolean) => {
    if (totalSegments === 0) { toast.error('Adicione pelo menos um vídeo'); return; }

    stopComposition();
    setCompositionState('preparing');
    setCompositionProgress(0);
    setGeneratedVideoUrl(null);
    setGeneratedVideoBlob(null);
    isGeneratingRef.current = generate;
    recordedChunksRef.current = [];

    try {
      // Build & proxy segments
      const segments: CompSegment[] = [];
      const blobUrls: string[] = [];

      const prepare = async (url: string, type: CompSegment['type']) => {
        const blobUrl = await ensureBlobUrl(url);
        if (blobUrl !== url && blobUrl.startsWith('blob:')) blobUrls.push(blobUrl);
        return { type, blobUrl, originalUrl: url };
      };

      if (introVideo) segments.push(await prepare(introVideo, 'intro'));
      for (const cv of carVideos) segments.push(await prepare(cv, 'vehicle'));
      if (closingVideo) segments.push(await prepare(closingVideo, 'closing'));

      if (segments.length === 0) { toast.error('Nenhum segmento disponível'); setCompositionState('idle'); return; }

      blobUrlsToRevokeRef.current = blobUrls;
      compositionSegmentsRef.current = segments;
      currentSegIndexRef.current = 0;

      // Setup canvas
      const canvas = compositionCanvasRef.current;
      if (!canvas) { toast.error('Canvas indisponível'); setCompositionState('idle'); return; }
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;

      // Setup MediaRecorder if generating
      if (generate) {
        const stream = canvas.captureStream(FPS);

        // Add music audio track if available
        if (musicUrl) {
          try {
            const audio = hiddenAudioRef.current;
            if (audio) {
              const musicBlobUrl = await ensureBlobUrl(musicUrl);
              if (musicBlobUrl !== musicUrl && musicBlobUrl.startsWith('blob:')) blobUrls.push(musicBlobUrl);
              audio.src = musicBlobUrl;
              audio.loop = true;
              audio.volume = 1;
              audio.load();

              const audioCtx = new AudioContext();
              const source = audioCtx.createMediaElementSource(audio);
              const dest = audioCtx.createMediaStreamDestination();
              source.connect(dest);
              source.connect(audioCtx.destination);
              dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
              audio.play().catch(() => {});
            }
          } catch (e) {
            console.warn('Could not add audio track:', e);
          }
        }

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';

        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setGeneratedVideoUrl(url);
          setGeneratedVideoBlob(blob);
          setCompositionState('done');
          setCompositionProgress(100);
          blobUrlsToRevokeRef.current.forEach(u => URL.revokeObjectURL(u));
          blobUrlsToRevokeRef.current = [];
          toast.success('Vídeo gerado com sucesso!');
        };
        mediaRecorderRef.current = recorder;
        recorder.start(100);
      }

      // Start music for preview mode too
      if (!generate && musicUrl) {
        try {
          const audio = hiddenAudioRef.current;
          if (audio) {
            const musicBlobUrl = await ensureBlobUrl(musicUrl);
            if (musicBlobUrl !== musicUrl && musicBlobUrl.startsWith('blob:')) blobUrls.push(musicBlobUrl);
            audio.src = musicBlobUrl;
            audio.loop = true;
            audio.volume = 1;
            audio.load();
            audio.play().catch(() => {});
          }
        } catch {}
      }

      setCompositionState(generate ? 'generating' : 'previewing');
      playNextSegment();

    } catch (err) {
      toast.error(`Erro ao preparar: ${err instanceof Error ? err.message : 'desconhecido'}`);
      setCompositionState('idle');
    }
  }, [introVideo, carVideos, closingVideo, musicUrl, totalSegments, stopComposition, playNextSegment]);

  // ===== SAVE TO PORTAL =====
  const saveToPortal = async () => {
    if (!generatedVideoBlob) { toast.error('Gere o vídeo primeiro'); return; }
    setSavingToPortal(true);
    try {
      const filename = `panfleto-${model || 'video'}-${Date.now()}.webm`;
      const file = new File([generatedVideoBlob], filename, { type: generatedVideoBlob.type });
      const uploadedUrl = await uploadFileToVps(file, `panfletagem/${clientId}/generated`);

      const now = new Date();
      await portalAction({
        action: 'create_portal_content',
        client_id: clientId,
        title: `Panfleto Digital${model ? ` - ${model}` : ''}${year ? ` ${year}` : ''}`,
        content_type: 'reel',
        file_url: uploadedUrl,
        season_month: now.getMonth() + 1,
        season_year: now.getFullYear(),
        status: 'aprovado',
      });

      toast.success('Vídeo salvo no portal do cliente!');
    } catch (err) {
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`);
    } finally {
      setSavingToPortal(false);
    }
  };

  const handleDownload = () => {
    if (!generatedVideoUrl) return;
    const a = document.createElement('a');
    a.href = generatedVideoUrl;
    a.download = `panfleto-${model || 'video'}-${Date.now()}.webm`;
    a.click();
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopComposition();
      carVideos.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
      if (generatedVideoUrl?.startsWith('blob:')) URL.revokeObjectURL(generatedVideoUrl);
    };
  }, []);

  // ===== RENDER HELPERS =====
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
    if (isSaved) return <div className="flex items-center gap-1.5 text-[10px] text-green-400 font-medium"><Cloud size={11} /> Salvo no sistema</div>;
    if (!hasFile) return null;
    if (uploading[type]) return (
      <div className="space-y-1.5 w-full">
        <div className="flex items-center justify-between text-[10px]"><span className="text-white/50">Enviando...</span><span className="text-white/40 font-mono">{uploadProgress[type] || 0}%</span></div>
        <Progress value={uploadProgress[type] || 0} className="h-1.5" />
      </div>
    );
    return (
      <button onClick={() => saveToVps(type)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.06] border border-white/[0.1] text-white/60 hover:bg-white/[0.1] transition-all">
        <HardDrive size={11} /> Salvar no sistema
      </button>
    );
  };

  const segmentConfig = [
    { key: 'intro' as VideoSegment, label: 'Vídeo de Abertura', desc: 'Vinheta ou intro', icon: Clapperboard, video: introVideo, file: introFile, saved: introSaved, canSave: true, inputRef: introInputRef },
    { key: 'closing' as VideoSegment, label: 'Finalização', desc: 'Encerramento ou CTA', icon: Film, video: closingVideo, file: closingFile, saved: closingSaved, canSave: true, inputRef: closingInputRef },
  ];

  return (
    <div className="space-y-6">
      {/* Hidden elements */}
      <video ref={hiddenVideoRef} className="hidden" playsInline muted preload="auto" />
      <audio ref={hiddenAudioRef} className="hidden" preload="auto" />

      {/* Header */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: `hsl(${clientColor})` }}>
            <Film size={12} /> 1080 × 1920 — Reels
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-medium">
            <VolumeX size={11} /> Vídeos mutados — apenas música de fundo
          </div>
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
          {carVideos.map((_, i) => (
            <div key={i} className="flex-[2] h-12 flex items-center justify-center text-xs font-medium border-2 text-white"
              style={{ borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` }}>
              <Video size={12} className="mr-1" /> Veículo {carVideos.length > 1 ? i + 1 : ''}
            </div>
          ))}
          {carVideos.length === 0 && (
            <div className="flex-[2] h-12 flex items-center justify-center text-xs font-medium bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30">
              <Video size={12} className="mr-1" /> Veículo
            </div>
          )}
          <div className={`flex-1 h-12 rounded-r-xl flex items-center justify-center text-xs font-medium transition-all ${closingVideo ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
            style={closingVideo ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
            <Film size={12} className="mr-1" /> Final
            {closingSaved && <Cloud size={8} className="ml-1 text-green-400" />}
          </div>
        </div>
        {musicUrl && (
          <div className="mt-2 h-8 rounded-xl flex items-center justify-center text-[10px] font-medium border-2 text-white"
            style={{ borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)' }}>
            <Music size={10} className="mr-1" /> ♪ {musicName}
            {musicSaved && <Cloud size={8} className="ml-1.5 text-green-400" />}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ====== LEFT COLUMN ====== */}
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
              {expandedSection === 'vehicle-info' ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
            </button>
            <AnimatePresence>
              {expandedSection === 'vehicle-info' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-4">
                    <button onClick={(e) => { e.stopPropagation(); importFromImage(); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-white/[0.06] border border-white/[0.1] text-white/60 hover:bg-white/[0.1] transition-all">
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
                      <Label className="text-xs text-white/60">Observações</Label>
                      <Textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} placeholder="KM, único dono..." rows={2} className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30 resize-none" />
                    </div>
                    <div className="pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60 flex items-center gap-1.5"><MapPin size={10} /> Endereço</Label>
                        <Input value={footerAddress} onChange={e => setFooterAddress(e.target.value)} className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60 flex items-center gap-1.5"><Phone size={10} /> WhatsApp</Label>
                        <Input value={footerWhatsapp} onChange={e => setFooterWhatsapp(e.target.value)} className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Intro & Closing segments */}
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
                    <p className="text-[10px] text-white/40">{seg.saved ? '✓ Salvo' : seg.file ? seg.file.name : seg.video ? 'Carregado' : 'Nenhum'}</p>
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
                      {seg.canSave && seg.video && renderSaveButton(seg.key as 'intro' | 'closing', seg.saved, !!seg.file)}
                      {seg.video ? (
                        <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-40">
                          <video src={seg.video} className="w-full h-full object-cover" muted playsInline />
                          <button onClick={() => removeSegment(seg.key)}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600/60 flex items-center justify-center hover:bg-red-600/80">
                            <X size={10} className="text-white" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => seg.inputRef.current?.click()}
                          className="w-full h-20 border-2 border-dashed border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-white/[0.25] transition-all">
                          <Upload size={18} className="text-white/30" />
                          <span className="text-xs text-white/40">Enviar vídeo</span>
                        </button>
                      )}
                      <input ref={seg.inputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload(seg.key)} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {/* Car Videos (multiple) */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
            <button onClick={() => setExpandedSection(expandedSection === 'car' ? null : 'car')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: carVideos.length ? `hsl(${clientColor} / 0.15)` : 'rgba(255,255,255,0.04)' }}>
                  <Video size={16} style={{ color: carVideos.length ? `hsl(${clientColor})` : 'rgba(255,255,255,0.3)' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">Vídeos do Veículo</p>
                  <p className="text-[10px] text-white/40">{carVideos.length ? `${carVideos.length} vídeo(s)` : 'Nenhum'} — Layout sobreposto</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {carVideos.length > 0 && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `hsl(${clientColor})` }}><span className="text-[9px] text-white font-bold">{carVideos.length}</span></div>}
                {expandedSection === 'car' ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
              </div>
            </button>
            <AnimatePresence>
              {expandedSection === 'car' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[11px] text-white/40">Adicione um ou mais vídeos do veículo. O layout será sobreposto.</p>
                    {carVideos.map((cv, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-32">
                        <video src={cv} className="w-full h-full object-cover" muted playsInline />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: `hsl(${clientColor})` }}>
                          {i + 1}
                        </div>
                        <button onClick={() => removeSegment('car', i)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600/60 flex items-center justify-center hover:bg-red-600/80">
                          <Trash2 size={10} className="text-white" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => carInputRef.current?.click()}
                      className="w-full h-20 border-2 border-dashed border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-white/[0.25] transition-all">
                      <Plus size={18} className="text-white/30" />
                      <span className="text-xs text-white/40">{carVideos.length ? 'Adicionar mais vídeos' : 'Enviar vídeo(s) do veículo'}</span>
                    </button>
                    <input ref={carInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleVideoUpload('car')} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
                  <p className="text-[10px] text-white/40">{musicSaved ? '✓ Salva' : musicUrl ? musicName : 'Nenhuma'}</p>
                </div>
              </div>
              {expandedSection === 'music' ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
            </button>
            <AnimatePresence>
              {expandedSection === 'music' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-3">
                    {musicUrl ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/[0.08] border border-green-500/20">
                          <Music size={16} className="text-green-400 shrink-0" />
                          <span className="text-xs text-white/70 truncate flex-1">{musicName}</span>
                          <button onClick={removeMusic} className="w-7 h-7 rounded-full bg-red-600/40 flex items-center justify-center hover:bg-red-600/60">
                            <X size={10} className="text-white" />
                          </button>
                        </div>
                        {renderSaveButton('music', musicSaved, !!musicFile)}
                      </div>
                    ) : (
                      <button onClick={() => musicInputRef.current?.click()}
                        className="w-full h-20 border-2 border-dashed border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-green-500/30 transition-all">
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

          {/* Layout overlay toggle */}
          {flyerImageDataUrl && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `hsl(${clientColor} / 0.15)` }}>
                  <ImageIcon size={14} style={{ color: `hsl(${clientColor})` }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white/80">Overlay do Layout</p>
                  <p className="text-[10px] text-white/40">Layout da aba Imagem sobreposto nos vídeos do veículo</p>
                </div>
                <Check size={14} className="text-green-400" />
              </div>
              <div className="w-16 h-24 rounded-lg overflow-hidden border border-white/[0.1]">
                <img src={flyerImageDataUrl} alt="Layout" className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button onClick={() => startComposition(false)} disabled={compositionState !== 'idle' && compositionState !== 'done' || totalSegments === 0}
              variant="outline" className="w-full h-12 text-sm font-semibold rounded-xl border-white/[0.15] text-white/80 hover:bg-white/[0.08]">
              <Eye size={16} className="mr-2" /> Pré-visualizar Montagem
            </Button>
            <Button onClick={() => startComposition(true)} disabled={compositionState === 'preparing' || compositionState === 'generating' || compositionState === 'previewing' || totalSegments === 0}
              className="w-full h-12 text-sm font-semibold rounded-xl" style={{ backgroundColor: `hsl(${clientColor})` }}>
              {compositionState === 'generating' ? <><Loader2 size={16} className="animate-spin mr-2" /> Gerando...</> : <><Film size={16} className="mr-2" /> Gerar Vídeo ({totalSegments})</>}
            </Button>
          </div>
        </div>

        {/* ====== RIGHT: PREVIEW ====== */}
        <div className="space-y-4">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <Eye size={16} style={{ color: `hsl(${clientColor})` }} /> Pré-visualização
              </h3>
              <span className="text-[9px] text-white/30 font-mono">1080×1920</span>
            </div>

            {compositionState !== 'idle' ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16]">
                  <canvas ref={compositionCanvasRef} className="w-full h-full object-contain" style={{ imageRendering: 'auto' }} />

                  {compositionState === 'preparing' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/70">
                      <Loader2 size={28} className="animate-spin text-white/60 mb-2" />
                      <p className="text-[10px] text-white/40">Preparando vídeos...</p>
                    </div>
                  )}

                  {/* Safe zones */}
                  <div className="absolute top-0 inset-x-0 h-[13%] bg-red-500/10 border-b border-dashed border-red-400/30 flex items-center justify-center pointer-events-none">
                    <span className="text-[8px] text-red-300/60 font-medium">ZONA COBERTA</span>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 h-[14.6%] bg-red-500/10 border-t border-dashed border-red-400/30 flex items-end justify-center pb-1 pointer-events-none">
                    <span className="text-[8px] text-red-300/60 font-medium">ZONA COBERTA</span>
                  </div>

                  {/* Segment label */}
                  <div className="absolute top-[14%] right-3 z-10">
                    <span className="text-[10px] text-white/50 bg-black/40 px-2 py-1 rounded-full">{currentSegLabel}</span>
                  </div>
                </div>

                {/* Progress */}
                {(compositionState === 'generating' || compositionState === 'previewing') && (
                  <div className="space-y-1">
                    <Progress value={compositionProgress} className="h-2" />
                    <p className="text-[10px] text-white/40 text-center">
                      {compositionState === 'generating' ? 'Gravando...' : 'Reproduzindo...'} {compositionProgress}%
                    </p>
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={() => { stopComposition(); setCompositionState('idle'); }}
                  className="w-full text-xs border-white/[0.1] text-white/60">
                  {compositionState === 'done' ? 'Fechar' : 'Parar'}
                </Button>
              </div>
            ) : generatedVideoUrl ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16]">
                  <video src={generatedVideoUrl} controls className="w-full h-full object-contain" playsInline />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={handleDownload} variant="outline" className="text-xs border-white/[0.1] text-white/70">
                    <Download size={14} className="mr-1.5" /> Download
                  </Button>
                  <Button onClick={saveToPortal} disabled={savingToPortal} className="text-xs" style={{ backgroundColor: `hsl(${clientColor})` }}>
                    {savingToPortal ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Cloud size={14} className="mr-1.5" />}
                    Salvar no Portal
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative aspect-[9/16] rounded-xl bg-black border border-white/[0.08] overflow-hidden flex flex-col items-center justify-center">
                {/* Show layout overlay from image tab in real-time */}
                {flyerImageDataUrl ? (
                  <img src={flyerImageDataUrl} alt="Layout overlay" className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <>
                    <Video size={32} className="text-white/15" />
                    <p className="text-xs text-white/30 text-center px-8 mt-3">
                      Formato Reels 1080×1920<br />
                      Preencha os dados na aba <strong>Imagem</strong> para ver o layout aqui
                    </p>
                  </>
                )}
                {/* Safe zones */}
                <div className="absolute top-0 inset-x-0 h-[13%] bg-red-500/5 border-b border-dashed border-red-400/20 flex items-center justify-center pointer-events-none">
                  <span className="text-[8px] text-red-300/40 font-medium">ZONA COBERTA</span>
                </div>
                <div className="absolute bottom-0 inset-x-0 h-[14.6%] bg-red-500/5 border-t border-dashed border-red-400/20 flex items-end justify-center pb-1 pointer-events-none">
                  <span className="text-[8px] text-red-300/40 font-medium">ZONA COBERTA</span>
                </div>
                {flyerImageDataUrl && (
                  <div className="absolute bottom-[16%] inset-x-0 flex justify-center pointer-events-none">
                    <span className="text-[10px] text-white/40 bg-black/50 px-3 py-1 rounded-full">
                      Layout sobreposto • Adicione vídeos e clique Pré-visualizar
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Composition checklist */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-white/60 mb-3">Ordem de composição</h3>
            <div className="space-y-2">
              {[
                { label: '1. Abertura', done: !!introVideo, saved: introSaved },
                ...carVideos.map((_, i) => ({ label: `${i + 2}. Vídeo veículo ${carVideos.length > 1 ? i + 1 : ''}`, done: true, saved: false })),
                { label: `${(introVideo ? 1 : 0) + carVideos.length + 1}. Finalização`, done: !!closingVideo, saved: closingSaved },
                { label: '♪ Música', done: !!musicUrl, saved: musicSaved },
                { label: '🖼 Overlay layout', done: !!flyerImageDataUrl, saved: false },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${step.done ? '' : 'bg-white/[0.08]'}`}
                    style={step.done ? { backgroundColor: `hsl(${clientColor})` } : {}}>
                    {step.done && <Check size={8} className="text-white" />}
                  </div>
                  <span className={step.done ? 'text-white/70' : 'text-white/30'}>
                    {step.label} {step.saved && <Cloud size={8} className="inline text-green-400 ml-1" />}
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
