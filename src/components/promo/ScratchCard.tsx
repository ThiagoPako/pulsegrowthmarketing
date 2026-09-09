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

/** Raspadinha em canvas: funciona com dedo (mobile) e mouse. */
export default function ScratchCard({ children, onRevealed, threshold = 0.5, className }: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const revealedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);

  const paintCover = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const { width, height } = wrapper.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#C79A2E');
    gradient.addColorStop(0.45, '#F4D774');
    gradient.addColorStop(0.7, '#B8860B');
    gradient.addColorStop(1, '#EFC75E');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RASPE AQUI COM O DEDO', canvas.width / 2, canvas.height / 2);
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
    for (let i = 3; i < data.length; i += 40) {
      if (data[i] === 0) clear += 1;
    }
    const ratio = clear / (data.length / 40);
    if (ratio >= threshold) {
      revealedRef.current = true;
      setRevealed(true);
      onRevealed?.();
    }
  }, [onRevealed, threshold]);

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || revealedRef.current) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 22, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div ref={wrapperRef} className={cn('relative overflow-hidden rounded-2xl', className)}>
      <div className="pointer-events-none select-none">{children}</div>
      {!revealed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab touch-none"
          onPointerDown={(event) => {
            drawing.current = true;
            (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
            scratchAt(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            scratchAt(event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            drawing.current = false;
            checkProgress();
          }}
          onPointerLeave={() => {
            if (drawing.current) {
              drawing.current = false;
              checkProgress();
            }
          }}
        />
      )}
    </div>
  );
}
