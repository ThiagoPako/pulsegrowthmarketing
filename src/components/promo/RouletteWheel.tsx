import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface RouletteSlice {
  id: string;
  label: string;
  /** URL da foto do prêmio — exibida dentro da fatia quando disponível. */
  imageUrl?: string | null;
}

interface RouletteWheelProps {
  slices: RouletteSlice[];
  /** Índice sorteado pelo servidor. Quando definido, a roleta desacelera até a fatia. */
  targetIndex: number | null;
  /** true enquanto o jogador mantém a roleta girando (modo manual). */
  continuousSpin?: boolean;
  onSpinEnd?: () => void;
  accentColor?: string;
  className?: string;
}

/** Pares (fundo, texto) alternados — visual cassino premium preto/vermelho/dourado. */
const SLICE_THEMES = [
  { from: '#1b1b1b', to: '#0a0a0a', text: '#FDE68A' },
  { from: '#E11D48', to: '#8B0F2E', text: '#FFFFFF' },
  { from: '#141414', to: '#050505', text: '#FDE68A' },
  { from: '#F59E0B', to: '#B45309', text: '#1A1A1A' },
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx: number, cy: number, r: number, start: number, end: number) {
  const a = polarToCartesian(cx, cy, r, end);
  const b = polarToCartesian(cx, cy, r, start);
  const largeArc = end - start <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${largeArc} 0 ${b.x} ${b.y} Z`;
}

function truncate(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Roleta em SVG controlada pelo jogador: gira continuamente enquanto
 * `continuousSpin` estiver ativo e desacelera exatamente na fatia devolvida
 * pelo servidor quando `targetIndex` é definido (botão "Parar").
 */
export default function RouletteWheel({ slices, targetIndex, continuousSpin = false, onSpinEnd, accentColor = '#E11D48', className }: RouletteWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [decelerating, setDecelerating] = useState(false);
  const [settled, setSettled] = useState(false);
  const spunFor = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const rotRef = useRef(0);

  const sliceAngle = useMemo(() => (slices.length ? 360 / slices.length : 360), [slices.length]);
  // Lâmpadas decorativas na borda.
  const bulbs = useMemo(() => Array.from({ length: 24 }, (_, i) => polarToCartesian(100, 100, 94, (360 / 24) * i)), []);

  // Giro contínuo enquanto o jogador segura o estado "girando".
  useEffect(() => {
    if (!continuousSpin) return;
    let last = performance.now();
    let speed = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Acelera suavemente até ~520°/s para dar sensação de partida real.
      speed = Math.min(520, speed + 900 * dt);
      rotRef.current += speed * dt;
      setRotation(rotRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [continuousSpin]);

  // Desaceleração até a fatia sorteada quando o jogador clica em "Parar".
  useEffect(() => {
    if (targetIndex === null || !slices.length) return;
    if (spunFor.current === targetIndex) return;
    spunFor.current = targetIndex;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const center = targetIndex * sliceAngle + sliceAngle / 2;
    // Leve desvio dentro da fatia para não parar sempre no centro exato.
    const jitter = (Math.random() - 0.5) * sliceAngle * 0.5;
    const targetMod = (((360 - center - jitter) % 360) + 360) % 360;
    const currentMod = ((rotRef.current % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta < 0) delta += 360;
    // 3 voltas completas de desaceleração para dar suspense.
    const final = rotRef.current + 360 * 3 + delta;

    setDecelerating(true);
    rotRef.current = final;
    setRotation(final);
    const timer = setTimeout(() => {
      setDecelerating(false);
      setSettled(true);
      if (navigator.vibrate) navigator.vibrate([18, 60, 30]);
      onSpinEnd?.();
    }, 3600);
    return () => clearTimeout(timer);
  }, [targetIndex, sliceAngle, slices.length, onSpinEnd]);

  if (!slices.length) return null;

  const active = continuousSpin || decelerating;

  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[340px]', className)}>
      {/* Brilho ambiente */}
      <div
        className="pointer-events-none absolute -inset-8 rounded-full blur-3xl transition-opacity duration-700"
        style={{ background: `radial-gradient(circle, ${accentColor}55, transparent 70%)`, opacity: active ? 1 : 0.55 }}
        aria-hidden
      />

      {/* Ponteiro */}
      <div className={cn('absolute left-1/2 top-[-6px] z-20 -translate-x-1/2 transition-transform', decelerating && 'animate-bounce')} aria-hidden>
        <svg width="38" height="46" viewBox="0 0 38 46">
          <defs>
            <linearGradient id="ptr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FEF3C7" />
              <stop offset="45%" stopColor="#FACC15" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>
          <path d="M19 46 L4 12 A16 16 0 0 1 34 12 Z" fill="url(#ptr)" stroke="#7C2D12" strokeWidth="1.5" />
          <circle cx="19" cy="14" r="5" fill="#1a1a1a" />
        </svg>
      </div>

      <svg
        viewBox="0 0 200 200"
        className="relative z-10 h-full w-full rounded-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: decelerating ? 'transform 3.4s cubic-bezier(0.1, 0.85, 0.1, 1)' : undefined,
          filter: `drop-shadow(0 18px 40px rgba(0,0,0,.7))`,
        }}
      >
        <defs>
          {SLICE_THEMES.map((theme, i) => (
            <linearGradient key={i} id={`slice-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.from} />
              <stop offset="100%" stopColor={theme.to} />
            </linearGradient>
          ))}
          <radialGradient id="hub" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#FFF8DC" />
            <stop offset="55%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#A16207" />
          </radialGradient>
          <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="35%" stopColor="#B7791F" />
            <stop offset="65%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#8B5E12" />
          </linearGradient>
          <radialGradient id="gloss" cx="30%" cy="22%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
          </radialGradient>
        </defs>

        <circle cx="100" cy="100" r="99" fill="url(#rim)" />
        <circle cx="100" cy="100" r="90" fill="#0a0a0a" />

        {slices.map((slice, index) => {
          const start = index * sliceAngle;
          const end = start + sliceAngle;
          const mid = start + sliceAngle / 2;
          const theme = SLICE_THEMES[index % SLICE_THEMES.length];
          const hasImage = Boolean(slice.imageUrl);
          // Com foto: imagem na parte externa da fatia e nome mais perto do centro.
          const textPos = polarToCartesian(100, 100, hasImage ? 42 : 56, mid);
          const imgPos = polarToCartesian(100, 100, 72, mid);
          const imgR = Math.min(13, Math.max(8, sliceAngle / 9));
          return (
            <g key={slice.id}>
              <path d={slicePath(100, 100, 89, start, end)} fill={`url(#slice-${index % SLICE_THEMES.length})`} stroke="#F5C64B" strokeWidth="0.6" />
              {hasImage ? (
                <>
                  <clipPath id={`clip-${slice.id}`}>
                    <circle cx={imgPos.x} cy={imgPos.y} r={imgR} />
                  </clipPath>
                  <circle cx={imgPos.x} cy={imgPos.y} r={imgR + 1.2} fill="#FFF8DC" opacity={0.9} />
                  <image
                    href={slice.imageUrl as string}
                    x={imgPos.x - imgR}
                    y={imgPos.y - imgR}
                    width={imgR * 2}
                    height={imgR * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#clip-${slice.id})`}
                  />
                </>
              ) : null}
              <text
                x={textPos.x}
                y={textPos.y}
                fill={theme.text}
                fontSize={slices.length > 8 ? 5.6 : 6.8}
                fontWeight="800"
                letterSpacing="0.3"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid} ${textPos.x} ${textPos.y})`}
              >
                {truncate(slice.label, slices.length > 8 ? 13 : 18)}
              </text>
            </g>
          );
        })}

        {/* Lâmpadas da borda */}
        {bulbs.map((bulb, i) => (
          <circle key={i} cx={bulb.x} cy={bulb.y} r="2.1" fill={i % 2 ? '#FFF3C4' : '#F59E0B'} opacity={active ? 0.95 : 0.7} />
        ))}

        <circle cx="100" cy="100" r="99" fill="url(#gloss)" pointerEvents="none" />
        <circle cx="100" cy="100" r="16" fill="url(#hub)" stroke="#5a3a06" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="6" fill="#1a1a1a" />
      </svg>

      {settled ? (
        <div
          className="pointer-events-none absolute inset-0 z-0 animate-ping rounded-full"
          style={{ boxShadow: `0 0 0 2px ${accentColor}`, animationIterationCount: 2 }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
