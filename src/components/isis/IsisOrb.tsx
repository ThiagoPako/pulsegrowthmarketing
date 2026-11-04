/**
 * A Ísis como nuvem de pontos (04/11/2026, pedido do Thiago: "não vamos usar avatar mais; nuvem de pontos e interface
 * holográfica HUD, assim fica mais tecnológico"). Uma esfera de ~700 pontos em canvas 2D, girando em 3D, com anéis de
 * HUD em volta. O estado da conversa muda o movimento:
 *   idle      gira devagar e respira
 *   ouvindo   a superfície pulsa como uma onda de voz (gravando)
 *   pensando  gira rápido e os pontos fazem redemoinho
 *   falando   ondas correm do equador para os polos
 *   feliz     os pontos se espalham e voltam (clique)
 * Sem biblioteca 3D: projeção em perspectiva feita aqui, para pesar pouco no bolinha flutuante de todas as telas.
 */
import { useEffect, useRef } from 'react';

export type IsisMood = 'idle' | 'ouvindo' | 'pensando' | 'falando' | 'feliz';

const CYAN = [94, 234, 255];
const ORANGE = [255, 122, 26];

export default function IsisOrb({ mood = 'idle', size = 180, hud = true, className = '' }: {
  mood?: IsisMood; size?: number; hud?: boolean; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef(mood);
  const burstRef = useRef(0);
  useEffect(() => {
    if (mood === 'feliz' && moodRef.current !== 'feliz') burstRef.current = 1;
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // pontos numa esfera de Fibonacci (distribuição uniforme)
    const n = size < 80 ? 220 : 700;
    const pts: { x: number; y: number; z: number; seed: number }[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, seed: Math.random() * Math.PI * 2 });
    }

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let angle = 0;
    let last = performance.now();
    const R = size * (hud ? 0.3 : 0.4);
    const cx = size / 2;
    const cy = size / 2;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const m = moodRef.current;
      const speed = m === 'pensando' ? 1.6 : m === 'ouvindo' ? 0.5 : 0.35;
      angle += reduce ? 0 : dt * speed;
      burstRef.current = Math.max(0, burstRef.current - dt * 0.9);
      const burst = burstRef.current;

      ctx.clearRect(0, 0, size, size);

      // brilho de fundo
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
      glow.addColorStop(0, 'rgba(94,234,255,0.16)');
      glow.addColorStop(1, 'rgba(94,234,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      const ca = Math.cos(angle), sa = Math.sin(angle);
      const tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (const p of pts) {
        // deformação por estado
        let k = 1 + Math.sin(t * 1.6 + p.seed) * 0.015;
        if (m === 'ouvindo') k += Math.sin(t * 9 + p.y * 6) * 0.06;
        if (m === 'falando') k += Math.sin(t * 7 - Math.abs(p.y) * 8) * 0.07;
        if (m === 'pensando') k += Math.sin(t * 3 + p.seed * 3) * 0.04;
        k += burst * (0.6 + Math.sin(p.seed) * 0.3);
        const x0 = p.x * k, y0 = p.y * k, z0 = p.z * k;
        // giro no eixo Y e inclinação no X
        const x1 = x0 * ca + z0 * sa;
        const z1 = -x0 * sa + z0 * ca;
        const y1 = y0 * ct - z1 * st;
        const z2 = y0 * st + z1 * ct;
        const persp = 2.6 / (2.6 + z2);
        const sx = cx + x1 * R * persp;
        const sy = cy + y1 * R * persp;
        const depth = (z2 + 1) / 2; // 0 longe, 1 perto
        const col = m === 'pensando' || m === 'feliz' ? (p.seed > 4.6 ? ORANGE : CYAN) : p.seed > 5.8 ? ORANGE : CYAN;
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.18 + depth * 0.75})`;
        const s = (0.6 + depth * 1.3) * (size < 80 ? 0.8 : 1);
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }

      if (hud) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(94,234,255,0.55)';
        ctx.lineWidth = 1;
        // anel externo em arcos que giram
        const r1 = R * 1.42;
        for (let i = 0; i < 4; i++) {
          const a0 = angle * 0.6 + i * (Math.PI / 2);
          ctx.beginPath();
          ctx.arc(0, 0, r1, a0, a0 + Math.PI / 3.2);
          ctx.stroke();
        }
        // anel de marcações
        const r2 = R * 1.26;
        ctx.strokeStyle = 'rgba(94,234,255,0.35)';
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2 - angle * 0.25;
          const len = i % 6 === 0 ? 6 : 2.5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r2, Math.sin(a) * r2);
          ctx.lineTo(Math.cos(a) * (r2 + len), Math.sin(a) * (r2 + len));
          ctx.stroke();
        }
        // arco laranja do estado (gira mais rápido pensando, pulsa ouvindo)
        ctx.strokeStyle = `rgba(255,122,26,${m === 'idle' ? 0.5 : 0.9})`;
        ctx.lineWidth = 2;
        const span = m === 'ouvindo' ? 0.6 + Math.abs(Math.sin(t * 5)) * 0.9 : m === 'pensando' ? 1.2 : 0.5;
        const a1 = -angle * (m === 'pensando' ? 2.4 : 1.1);
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.52, a1, a1 + span);
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, hud]);

  return <canvas ref={ref} style={{ width: size, height: size }} className={className} aria-hidden />;
}
