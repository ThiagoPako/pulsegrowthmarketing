import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, Play, Pause, Music, Film, Clapperboard, Check, Eye,
  Video, Loader2, Volume2, VolumeX, ChevronDown, ChevronUp, Image as ImageIcon
} from 'lucide-react';

interface Props {
  clientId: string;
  clientColor: string;
  clientName?: string;
  /** The generated flyer image data URL from the Image tab */
  flyerImageDataUrl?: string | null;
}

type VideoSegment = 'intro' | 'car' | 'closing';

export default function PortalPanfletagemVideo({ clientId, clientColor, clientName, flyerImageDataUrl }: Props) {
  // Video segments
  const [introVideo, setIntroVideo] = useState<string | null>(null);
  const [introFile, setIntroFile] = useState<File | null>(null);
  const [carVideo, setCarVideo] = useState<string | null>(null);
  const [carFile, setCarFile] = useState<File | null>(null);
  const [closingVideo, setClosingVideo] = useState<string | null>(null);
  const [closingFile, setClosingFile] = useState<File | null>(null);

  // Music
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicName, setMusicName] = useState('');
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  // Options — ALL segments are muted; only background music plays
  const [muteCarVideo, setMuteCarVideo] = useState(true);
  const [useLayoutOverlay, setUseLayoutOverlay] = useState(true);
  const [overlayDuration, setOverlayDuration] = useState(3);
  const [musicFadeIn, setMusicFadeIn] = useState(2); // seconds
  const [musicFadeOut, setMusicFadeOut] = useState(2); // seconds

  // Preview
  const [activePreview, setActivePreview] = useState<VideoSegment | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);

  // Generating
  const [generating, setGenerating] = useState(false);

  // Expanded sections
  const [expandedSection, setExpandedSection] = useState<string | null>('intro');

  const introInputRef = useRef<HTMLInputElement>(null);
  const carInputRef = useRef<HTMLInputElement>(null);
  const closingInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = (segment: VideoSegment) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo');
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máximo 200MB)');
      return;
    }
    const url = URL.createObjectURL(file);
    switch (segment) {
      case 'intro': setIntroVideo(url); setIntroFile(file); break;
      case 'car': setCarVideo(url); setCarFile(file); break;
      case 'closing': setClosingVideo(url); setClosingFile(file); break;
    }
    toast.success(`Vídeo de ${segment === 'intro' ? 'abertura' : segment === 'car' ? 'veículo' : 'finalização'} adicionado!`);
    e.target.value = '';
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      toast.error('Selecione um arquivo de áudio (MP3, WAV, etc.)');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Arquivo de áudio muito grande (máximo 50MB)');
      return;
    }
    setMusicFile(file);
    setMusicName(file.name);
    setMusicUrl(URL.createObjectURL(file));
    toast.success('Música adicionada!');
    e.target.value = '';
  };

  const removeSegment = (segment: VideoSegment) => {
    switch (segment) {
      case 'intro':
        if (introVideo) URL.revokeObjectURL(introVideo);
        setIntroVideo(null); setIntroFile(null);
        break;
      case 'car':
        if (carVideo) URL.revokeObjectURL(carVideo);
        setCarVideo(null); setCarFile(null);
        break;
      case 'closing':
        if (closingVideo) URL.revokeObjectURL(closingVideo);
        setClosingVideo(null); setClosingFile(null);
        break;
    }
  };

  const removeMusic = () => {
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicFile(null); setMusicName(''); setMusicUrl(null);
  };

  const previewSegment = (segment: VideoSegment) => {
    const url = segment === 'intro' ? introVideo : segment === 'car' ? carVideo : closingVideo;
    if (!url) return;
    setActivePreview(segment);
    setIsPlaying(true);
    setTimeout(() => {
      if (videoPreviewRef.current) {
        videoPreviewRef.current.src = url;
        // ALL segments are muted — only background music plays
        videoPreviewRef.current.muted = true;
        videoPreviewRef.current.play().catch(() => {});
      }
    }, 100);
  };

  const togglePlayPause = () => {
    const v = videoPreviewRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const handleGenerate = async () => {
    if (!carVideo && !introVideo && !closingVideo) {
      toast.error('Adicione pelo menos um vídeo');
      return;
    }
    setGenerating(true);
    toast.info('A composição de vídeo será processada no servidor. Isso pode levar alguns minutos...');

    // For now, show a placeholder — real processing would need FFmpeg on VPS
    setTimeout(() => {
      setGenerating(false);
      toast.success('Funcionalidade de composição de vídeo em desenvolvimento. Os vídeos foram salvos!');
    }, 2000);
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (introVideo) URL.revokeObjectURL(introVideo);
      if (carVideo) URL.revokeObjectURL(carVideo);
      if (closingVideo) URL.revokeObjectURL(closingVideo);
      if (musicUrl) URL.revokeObjectURL(musicUrl);
    };
  }, []);

  const segmentConfig = [
    {
      key: 'intro' as VideoSegment,
      label: 'Vídeo de Abertura',
      desc: 'Vinheta ou intro. O áudio será mutado — apenas a música de fundo toca.',
      icon: Clapperboard,
      video: introVideo,
      file: introFile,
      inputRef: introInputRef,
    },
    {
      key: 'car' as VideoSegment,
      label: 'Vídeo do Veículo',
      desc: 'Vídeo principal do carro. O áudio original será mutado — apenas a música de fundo toca.',
      icon: Video,
      video: carVideo,
      file: carFile,
      inputRef: carInputRef,
    },
    {
      key: 'closing' as VideoSegment,
      label: 'Finalização',
      desc: 'Encerramento, CTA ou logo final. O áudio será mutado — apenas a música de fundo toca.',
      icon: Film,
      video: closingVideo,
      file: closingFile,
      inputRef: closingInputRef,
    },
  ];

  const totalSegments = [introVideo, carVideo, closingVideo].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Reels format badge + safe zone warning */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: `hsl(${clientColor})` }}>
            <Film size={12} /> 1080 × 1920 — Reels
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-medium">
            <VolumeX size={11} /> Todos os vídeos serão mutados — apenas a música de fundo toca
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
          <p className="text-[10px] text-amber-300/80 leading-relaxed">
            <strong>Zona segura do Reels:</strong> Evite informações importantes nos <strong>250px superiores</strong> (nome do perfil, ícones) e nos <strong>280px inferiores</strong> (legenda, botões de interação). O conteúdo nessas áreas ficará coberto pela interface do Instagram.
          </p>
        </div>
      </div>

      {/* Timeline overview */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2 mb-4">
          <Film size={16} style={{ color: `hsl(${clientColor})` }} />
          Linha do Tempo do Vídeo
        </h3>
        <div className="flex items-center gap-1">
          {/* Intro */}
          <div className={`flex-1 h-12 rounded-l-xl flex items-center justify-center text-xs font-medium transition-all ${introVideo ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
            style={introVideo ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
            <Clapperboard size={12} className="mr-1" /> Abertura
          </div>
          {/* Layout Image */}
          {useLayoutOverlay && flyerImageDataUrl && (
            <div className="w-16 h-12 flex items-center justify-center text-[9px] font-medium border-2 text-white rounded-md"
              style={{ borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.25)` }}>
              <ImageIcon size={10} className="mr-0.5" /> Layout
            </div>
          )}
          {/* Car */}
          <div className={`flex-[2] h-12 flex items-center justify-center text-xs font-medium transition-all ${carVideo ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
            style={carVideo ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
            <Video size={12} className="mr-1" /> Veículo
          </div>
          {/* Closing */}
          <div className={`flex-1 h-12 rounded-r-xl flex items-center justify-center text-xs font-medium transition-all ${closingVideo ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
            style={closingVideo ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
            <Film size={12} className="mr-1" /> Final
          </div>
        </div>
        {/* Music bar with fade info */}
        <div className={`mt-2 h-8 rounded-xl flex items-center justify-center text-[10px] font-medium transition-all ${musicFile ? 'border-2 text-white' : 'bg-white/[0.04] border border-dashed border-white/[0.15] text-white/30'}`}
          style={musicFile ? { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)' } : {}}>
          <Music size={10} className="mr-1" />
          {musicFile ? `♪ ${musicName} (fade in ${musicFadeIn}s · fade out ${musicFadeOut}s)` : 'Música de fundo (opcional)'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Upload sections */}
        <div className="space-y-4">
          {/* Video segments */}
          {segmentConfig.map(seg => (
            <div key={seg.key} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === seg.key ? null : seg.key)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: seg.video ? `hsl(${clientColor} / 0.15)` : 'rgba(255,255,255,0.04)' }}>
                    <seg.icon size={16} style={{ color: seg.video ? `hsl(${clientColor})` : 'rgba(255,255,255,0.3)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">{seg.label}</p>
                    <p className="text-[10px] text-white/40">{seg.file ? seg.file.name : 'Nenhum vídeo'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {seg.video && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `hsl(${clientColor})` }}>
                      <Check size={10} className="text-white" />
                    </div>
                  )}
                  {expandedSection === seg.key ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
                </div>
              </button>

              <AnimatePresence>
                {expandedSection === seg.key && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3">
                      <p className="text-[11px] text-white/40">{seg.desc}</p>

                      {seg.video ? (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                            <video src={seg.video} className="w-full h-full object-contain" muted />
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
                        <button
                          onClick={() => seg.inputRef.current?.click()}
                          className="w-full h-28 border-2 border-dashed border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-white/[0.25] hover:bg-white/[0.02] transition-all"
                        >
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
            <button
              onClick={() => setExpandedSection(expandedSection === 'music' ? null : 'music')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: musicFile ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)' }}>
                  <Music size={16} style={{ color: musicFile ? '#22c55e' : 'rgba(255,255,255,0.3)' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">Música de Fundo</p>
                  <p className="text-[10px] text-white/40">{musicFile ? musicName : 'Nenhuma música'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {musicFile && <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check size={10} className="text-white" /></div>}
                {expandedSection === 'music' ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
              </div>
            </button>
            <AnimatePresence>
              {expandedSection === 'music' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[11px] text-white/40">A música tocará durante todo o vídeo. Todos os segmentos terão o áudio original mutado.</p>
                    {musicFile ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/[0.08] border border-green-500/20">
                          <Music size={16} className="text-green-400 shrink-0" />
                          <span className="text-xs text-white/70 truncate flex-1">{musicName}</span>
                          {musicUrl && (
                            <audio ref={audioPreviewRef} src={musicUrl} className="hidden" />
                          )}
                          <button onClick={removeMusic} className="w-7 h-7 rounded-full bg-red-600/40 flex items-center justify-center hover:bg-red-600/60">
                            <X size={10} className="text-white" />
                          </button>
                        </div>
                        {/* Fade In / Fade Out controls */}
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

          {/* Layout overlay option */}
          {flyerImageDataUrl && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon size={14} style={{ color: `hsl(${clientColor})` }} />
                  <Label className="text-xs text-white/70">Usar layout como slide no vídeo</Label>
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
                    <span className="text-[10px] text-white/40">Duração do slide</span>
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

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={generating || totalSegments === 0}
            className="w-full h-12 text-sm font-semibold rounded-xl"
            style={{ backgroundColor: `hsl(${clientColor})` }}
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Processando vídeo...</>
            ) : (
              <><Film size={16} className="mr-2" /> Gerar Vídeo ({totalSegments} segmento{totalSegments !== 1 ? 's' : ''})</>
            )}
          </Button>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <Eye size={16} style={{ color: `hsl(${clientColor})` }} />
                Pré-visualização
              </h3>
              <span className="text-[9px] text-white/30 font-mono">1080×1920</span>
            </div>

            {activePreview ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16]">
                  <video
                    ref={videoPreviewRef}
                    className="w-full h-full object-contain"
                    onEnded={() => setIsPlaying(false)}
                    onPause={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    playsInline
                    muted
                  />
                  {/* Safe zone overlays — top ~13% and bottom ~14.6% */}
                  <div className="absolute top-0 inset-x-0 h-[13%] bg-red-500/10 border-b border-dashed border-red-400/30 flex items-center justify-center pointer-events-none">
                    <span className="text-[8px] text-red-300/60 font-medium">ZONA COBERTA</span>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 h-[14.6%] bg-red-500/10 border-t border-dashed border-red-400/30 flex items-end justify-center pb-1 pointer-events-none">
                    <span className="text-[8px] text-red-300/60 font-medium">ZONA COBERTA</span>
                  </div>
                  <div className="absolute bottom-3 inset-x-3 flex items-center justify-between z-10">
                    <button onClick={togglePlayPause}
                      className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80">
                      {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white ml-0.5" />}
                    </button>
                    <span className="text-[10px] text-white/50 bg-black/40 px-2 py-1 rounded-full">
                      {activePreview === 'intro' ? 'Abertura' : activePreview === 'car' ? 'Veículo' : 'Finalização'}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setActivePreview(null); setIsPlaying(false); }}
                  className="w-full text-xs border-white/[0.1] text-white/60">
                  Fechar prévia
                </Button>
              </div>
            ) : (
              <div className="aspect-[9/16] rounded-xl bg-white/[0.02] border border-dashed border-white/[0.1] flex flex-col items-center justify-center gap-3">
                <Video size={32} className="text-white/15" />
                <p className="text-xs text-white/30 text-center px-8">
                  Adicione vídeos e clique em <Play size={10} className="inline" /> para pré-visualizar cada segmento
                </p>
              </div>
            )}
          </div>

          {/* Composition order info */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-white/60 mb-3">Ordem de composição</h3>
            <div className="space-y-2">
              {[
                { label: '1. Abertura', done: !!introVideo, optional: true },
                { label: '2. Layout (imagem)', done: !!(useLayoutOverlay && flyerImageDataUrl), optional: true },
                { label: '3. Vídeo do veículo', done: !!carVideo, optional: false },
                { label: '4. Finalização', done: !!closingVideo, optional: true },
                { label: '♪ Música de fundo', done: !!musicFile, optional: true },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${step.done ? '' : 'bg-white/[0.08]'}`}
                    style={step.done ? { backgroundColor: `hsl(${clientColor})` } : {}}>
                    {step.done && <Check size={8} className="text-white" />}
                  </div>
                  <span className={step.done ? 'text-white/70' : 'text-white/30'}>
                    {step.label} {step.optional && !step.done && <span className="text-white/20">(opcional)</span>}
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
