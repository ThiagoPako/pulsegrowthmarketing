import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { BookOpen, Play, ChevronLeft, ChevronRight, Maximize, Minimize, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Presentation {
  id: string;
  title: string;
  description: string;
  cover_color: string;
  created_at: string;
}

interface Slide {
  id: string;
  slide_order: number;
  title: string;
  subtitle: string;
  content: string;
  image_url: string | null;
  background_color: string;
  text_color: string;
  layout_type: string;
}

interface Props {
  clientId: string;
  clientColor: string;
  isTeamMember?: boolean;
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
};

export default function PortalTraining({ clientId, clientColor, isTeamMember }: Props) {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPresentation, setSelectedPresentation] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState(0);
  const [slidesLoading, setSlidesLoading] = useState(false);

  useEffect(() => {
    loadPresentations();
  }, [clientId]);

  const loadPresentations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('training_presentations')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'publicado')
      .order('created_at', { ascending: false });
    setPresentations((data as any[]) || []);
    setLoading(false);
  };

  const openPresentation = async (pres: Presentation) => {
    setSelectedPresentation(pres);
    setSlidesLoading(true);
    const { data } = await supabase
      .from('training_slides')
      .select('*')
      .eq('presentation_id', pres.id)
      .order('slide_order', { ascending: true });
    setSlides((data as any[]) || []);
    setCurrentSlide(0);
    setDirection(0);
    setSlidesLoading(false);
  };

  const goNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide(prev => prev + 1);
    }
  }, [currentSlide, slides.length]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide(prev => prev - 1);
    }
  }, [currentSlide]);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!selectedPresentation) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen?.();
        } else {
          setSelectedPresentation(null);
        }
      }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedPresentation, goNext, goPrev, isFullscreen, toggleFullscreen]);

  // ── List view ──
  if (!selectedPresentation) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `hsl(${clientColor} / 0.15)` }}>
            <BookOpen size={20} style={{ color: `hsl(${clientColor})` }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Treinamento Comercial</h2>
            <p className="text-xs text-white/40">Material de estudo disponível</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-white/30" size={32} />
          </div>
        ) : presentations.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={48} className="mx-auto text-white/10 mb-4" />
            <p className="text-white/30 text-sm">Nenhum material de treinamento disponível.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {presentations.map((pres, i) => (
              <motion.button
                key={pres.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => openPresentation(pres)}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:ring-1"
                style={{
                  background: `linear-gradient(135deg, hsl(${pres.cover_color} / 0.2), hsl(${pres.cover_color} / 0.05))`,
                  '--tw-ring-color': `hsl(${pres.cover_color} / 0.4)`,
                } as any}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `hsl(${pres.cover_color} / 0.2)` }}>
                    <Play size={24} style={{ color: `hsl(${pres.cover_color})` }} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">{pres.title}</h3>
                  {pres.description && <p className="text-xs text-white/40 line-clamp-2">{pres.description}</p>}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Presentation / Slide view ──
  const slide = slides[currentSlide];

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-[9999] bg-black' : 'max-w-5xl mx-auto px-4 py-8'}`}>
      {/* Header */}
      {!isFullscreen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
          <button onClick={() => setSelectedPresentation(null)} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm">
            <ChevronLeft size={16} />
            Voltar
          </button>
          <h2 className="text-sm font-semibold text-white/70">{selectedPresentation.title}</h2>
          <button onClick={toggleFullscreen} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition-all">
            <Maximize size={14} />
            Apresentar
          </button>
        </motion.div>
      )}

      {slidesLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-white/30" size={32} />
        </div>
      ) : slides.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/30 text-sm">Esta apresentação não possui slides.</p>
        </div>
      ) : (
        <>
          {/* Slide area */}
          <div
            className={`relative overflow-hidden rounded-2xl ${isFullscreen ? 'w-full h-full flex items-center justify-center' : 'aspect-[16/9]'}`}
            style={!isFullscreen ? {
              background: `linear-gradient(135deg, hsl(${slide?.background_color || clientColor} / 0.3), hsl(${slide?.background_color || clientColor} / 0.05))`,
            } : {}}
          >
            <AnimatePresence mode="wait" custom={direction}>
              {slide && (
                <motion.div
                  key={slide.id}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className={`${isFullscreen ? 'w-full h-full' : 'absolute inset-0'} flex`}
                  style={{
                    background: `linear-gradient(135deg, hsl(${slide.background_color} / 0.4), hsl(${slide.background_color} / 0.08))`,
                  }}
                >
                  <SlideContent slide={slide} isFullscreen={isFullscreen} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation overlays */}
            <button
              onClick={goPrev}
              className={`absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:bg-black/50 transition-all ${currentSlide === 0 ? 'opacity-30 pointer-events-none' : 'opacity-0 hover:opacity-100'}`}
              style={isFullscreen ? { left: 24, width: 48, height: 48 } : {}}
            >
              <ChevronLeft size={isFullscreen ? 28 : 20} />
            </button>
            <button
              onClick={goNext}
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:bg-black/50 transition-all ${currentSlide === slides.length - 1 ? 'opacity-30 pointer-events-none' : 'opacity-0 hover:opacity-100'}`}
              style={isFullscreen ? { right: 24, width: 48, height: 48 } : {}}
            >
              <ChevronRight size={isFullscreen ? 28 : 20} />
            </button>

            {/* Fullscreen controls */}
            {isFullscreen && (
              <div className="absolute top-4 right-4 flex gap-2">
                <button onClick={toggleFullscreen} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white transition-all">
                  <Minimize size={18} />
                </button>
              </div>
            )}

            {/* Slide counter */}
            <div className={`absolute ${isFullscreen ? 'bottom-8' : 'bottom-3'} left-1/2 -translate-x-1/2 flex items-center gap-1.5`}>
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDirection(i > currentSlide ? 1 : -1); setCurrentSlide(i); }}
                  className={`rounded-full transition-all duration-300 ${i === currentSlide ? 'w-6 h-2' : 'w-2 h-2 hover:bg-white/40'}`}
                  style={{
                    background: i === currentSlide ? `hsl(${slide?.background_color || clientColor})` : 'rgba(255,255,255,0.2)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          {!isFullscreen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mt-4 px-2">
              <span className="text-xs text-white/30">Slide {currentSlide + 1} de {slides.length}</span>
              <span className="text-xs text-white/30">Use ← → para navegar · F para tela cheia</span>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

// ── Slide renderer ──
function SlideContent({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  const textStyle = { color: `hsl(${slide.text_color})` };
  const baseFontSize = isFullscreen ? 1.5 : 1;

  if (slide.layout_type === 'title_only') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-16 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="font-bold leading-tight mb-4"
          style={{ ...textStyle, fontSize: `${2.5 * baseFontSize}rem` }}
        >
          {slide.title}
        </motion.h1>
        {slide.subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            style={{ ...textStyle, opacity: 0.6, fontSize: `${1.2 * baseFontSize}rem` }}
          >
            {slide.subtitle}
          </motion.p>
        )}
      </div>
    );
  }

  if (slide.layout_type === 'image_full') {
    return (
      <div className="flex-1 relative">
        {slide.image_url && (
          <img src={slide.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-16">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="font-bold text-white leading-tight mb-2"
            style={{ fontSize: `${2 * baseFontSize}rem` }}
          >
            {slide.title}
          </motion.h2>
          {slide.subtitle && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 0.3 }} className="text-white" style={{ fontSize: `${1 * baseFontSize}rem` }}>
              {slide.subtitle}
            </motion.p>
          )}
        </div>
      </div>
    );
  }

  if (slide.layout_type === 'image_left' || slide.layout_type === 'image_right') {
    const imgFirst = slide.layout_type === 'image_left';
    return (
      <div className={`flex-1 flex ${imgFirst ? 'flex-row' : 'flex-row-reverse'}`}>
        {slide.image_url && (
          <div className="w-1/2 relative overflow-hidden">
            <img src={slide.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        )}
        <div className={`${slide.image_url ? 'w-1/2' : 'w-full'} flex flex-col justify-center p-8 sm:p-12`}>
          <motion.h2
            initial={{ opacity: 0, x: imgFirst ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="font-bold leading-tight mb-3"
            style={{ ...textStyle, fontSize: `${1.8 * baseFontSize}rem` }}
          >
            {slide.title}
          </motion.h2>
          {slide.subtitle && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.2 }} className="mb-4" style={{ ...textStyle, fontSize: `${0.9 * baseFontSize}rem` }}>
              {slide.subtitle}
            </motion.p>
          )}
          {slide.content && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="space-y-2"
              style={{ ...textStyle, opacity: 0.8, fontSize: `${0.85 * baseFontSize}rem` }}
            >
              {slide.content.split('\n').map((line, i) => (
                <motion.p key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
                  {line.startsWith('•') || line.startsWith('-') ? line : line}
                </motion.p>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  // Default: title_content
  return (
    <div className="flex-1 flex flex-col justify-center p-8 sm:p-16">
      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="font-bold leading-tight mb-4"
        style={{ ...textStyle, fontSize: `${2 * baseFontSize}rem` }}
      >
        {slide.title}
      </motion.h2>
      {slide.subtitle && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.2 }} className="mb-6" style={{ ...textStyle, fontSize: `${1.1 * baseFontSize}rem` }}>
          {slide.subtitle}
        </motion.p>
      )}
      <div className="flex gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className={`space-y-3 ${slide.image_url ? 'flex-1' : 'w-full'}`}
          style={{ ...textStyle, opacity: 0.8, fontSize: `${0.9 * baseFontSize}rem` }}
        >
          {slide.content?.split('\n').map((line, i) => (
            <motion.p key={i} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.08 }}>
              {line}
            </motion.p>
          ))}
        </motion.div>
        {slide.image_url && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="flex-1 rounded-xl overflow-hidden"
          >
            <img src={slide.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
          </motion.div>
        )}
      </div>
    </div>
  );
}
