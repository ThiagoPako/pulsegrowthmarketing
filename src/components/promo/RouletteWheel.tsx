import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface RouletteSlice {
  id: string;
  label: string;
}

interface RouletteWheelProps {
  slices: RouletteSlice[];
  /** Índice sorteado pelo servidor. Enquanto for null a roleta fica parada. */
  targetIndex: number | null;
  onSpinEnd?: () => void;
  accentColor?: string;
  className?: string;
}

const SLICE_COLORS = ['#111111', '#E11D48', '#1a1a1a', '#F59E0B', '#0f0f0f', '#DC2626', '#171717', '#D97706'];

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

/** Roleta em SVG que desacelera exatamente na fatia devolvida pelo servidor. */
export default function RouletteWheel({ slices, targetIndex, onSpinEnd, accentColor = '#E11D48', className }: RouletteWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const spunFor = useRef<number | null>(null);

  const sliceAngle = useMemo(() => (slices.length ? 360 / slices.length : 360), [slices.length]);

  useEffect(() => {
    if (targetIndex === null || !slices.length) return;
    if (spunFor.current === targetIndex) return;
    spunFor.current = targetIndex;

    const center = targetIndex * sliceAngle + sliceAngle / 2;
    // 6 voltas completas + o ajuste para o ponteiro (topo) cair no centro da fatia.
    const final = 360 * 6 + (360 - center);
    setSpinning(true);
    setRotation(final);
    const timer = setTimeout(() => {
      setSpinning(false);
      onSpinEnd?.();
    }, 5200);
    return () => clearTimeout(timer);
  }, [targetIndex, sliceAngle, slices.length, onSpinEnd]);

  if (!slices.length) return null;

  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[320px]', className)}>
      <div
        className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2"
        style={{
          borderLeft: '14px solid transparent',
          borderRight: '14px solid transparent',
          borderTop: `26px solid ${accentColor}`,
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))',
        }}
        aria-hidden
      />
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full rounded-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 5s cubic-bezier(0.12, 0.75, 0.12, 1)' : undefined,
          boxShadow: `0 0 40px ${accentColor}66, inset 0 0 0 6px #FACC15`,
        }}
      >
        {slices.map((slice, index) => {
          const start = index * sliceAngle;
          const end = start + sliceAngle;
          const mid = start + sliceAngle / 2;
          const textPos = polarToCartesian(100, 100, 62, mid);
          return (
            <g key={slice.id}>
              <path d={slicePath(100, 100, 96, start, end)} fill={SLICE_COLORS[index % SLICE_COLORS.length]} stroke="#FACC15" strokeWidth="0.8" />
              <text
                x={textPos.x}
                y={textPos.y}
                fill="#FFFFFF"
                fontSize="7"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid} ${textPos.x} ${textPos.y})`}
              >
                {slice.label.length > 16 ? `${slice.label.slice(0, 15)}…` : slice.label}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="100" r="14" fill="#FACC15" stroke="#111" strokeWidth="2" />
      </svg>
    </div>
  );
}
