import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ScratchCardProps {
  /** Conteúdo revelado embaixo da camada dourada. */
  children: React.ReactNode;
  onRevealed?: () => void;
  /** Percentual raspado necessário para revelar tudo (0 a 1). */
  threshold?: number;
  className?: string;
}

/**
 * Raspadinha em canvas com textura metálica, poeira dourada ao raspar,
 * vibração no celular e revelação suave ao atingir o percentual.
 */
export default function ScratchCard({ children, onRevealed, threshold = 0.45, className }: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const revealedRef = useRef(false);
  const lastCheck = useRef(0);
  const lastVibe = useRef(0);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [touched, setTouched] = useState(false);

  const paintCover = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const { width, height } = wrapper.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = width;
    const h = height;

    ctx.globalCompositeOperation = 'source-over';
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#8a6412');
    gradient.addColorStop(0.25, '#F7E08A');
    gradient.addColorStop(0.45, '#C79A2E');
    gradient.addColorStop(0.62, '#FFF3C4');
    gradient.addColorStop(0.8, '#B8860B');
    gradient.addColorStop(1, '#7a5a10');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Textura escovada (linhas diagonais sutis)
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    // Grãos
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    for (let i = 0; i < Math.floor((w * h) / 900); i += 1) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }

    ctx.fillStyle = 'rgba(60,40,0,.55)';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RASPE COM O DEDO', w / 2, h / 2 - 6);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(60,40,0,.4)';
    ctx.fillText('e descubra seu prêmio', w / 2, h / 2 + 14);
  }, []);

  useEffect(() => {
    paintCover();
    const onResize = () => {
      if (!revealedRef.current) paintCover();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paintCover]);

  const checkProgress = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || revealedRef.current) return;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 64) {
      total += 1;
      if (data[i] < 24) clear += 1;
    }
    const ratio = total ? clear / total : 0;
    setProgress(ratio);
    if (ratio >= threshold) {
      revealedRef.current = true;
      if (navigator.vibrate) navigator.vibrate([25, 40, 60]);
      setRevealed(true);
      // Deixa a camada sumir com transição antes de avisar o pai.
      setTimeout(() => onRevealed?.(), 520);
    }
  }, [onRevealed, threshold]);

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || revealedRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const radius = Math.max(20, Math.min(rect.width, rect.height) * 0.11);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = radius * 2;
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    // Borda irregular, como raspagem real
    for (let i = 0; i < 6; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.8 + Math.random() * 0.5);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPoint.current = { x, y };

    const now = Date.now();
    if (navigator.vibrate && now - lastVibe.current > 120) {
      lastVibe.current = now;
      navigator.vibrate(6);
    }
    if (now - lastCheck.current > 180) {
      lastCheck.current = now;
      checkProgress();
    }
  };

  const stop = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    checkProgress();
  };

  return (
    <div ref={wrapperRef} className={cn('relative select-none overflow-hidden rounded-2xl', className)}>
      <div
        className="pointer-events-none transition-transform duration-500"
        style={{ transform: revealed ? 'scale(1)' : 'scale(1.04)' }}
      >
        {children}
      </div>

      <canvas
        ref={canvasRef}
        className={cn(
          'absolute inset-0 h-full w-full touch-none transition-opacity duration-500',
          revealed ? 'pointer-events-none opacity-0' : 'cursor-crosshair opacity-100'
        )}
        onPointerDown={(event) => {
          drawing.current = true;
          setTouched(true);
          lastPoint.current = null;
          (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
          scratchAt(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          scratchAt(event.clientX, event.clientY);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      />

      {!revealed ? (
        <>
          {!touched ? (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4">
              <span className="animate-bounce text-3xl drop-shadow">👆</span>
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-500 transition-[width] duration-200"
              style={{ width: `${Math.min(100, (progress / threshold) * 100).toFixed(0)}%` }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
