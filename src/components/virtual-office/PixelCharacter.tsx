import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { OfficeMember } from './types';

/* ── Walking hook ── */
function useWalk(isOnline: boolean) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [facingRight, setFacingRight] = useState(true);

  useEffect(() => {
    if (!isOnline) { setPos({ x: 0, y: 0 }); return; }
    const move = () => {
      const nx = (Math.random() - 0.5) * 50;
      const ny = (Math.random() - 0.5) * 14;
      setFacingRight(nx > pos.x);
      setPos({ x: nx, y: ny });
    };
    move();
    const iv = setInterval(move, 3500 + Math.random() * 4000);
    return () => clearInterval(iv);
  }, [isOnline]);

  return { pos, facingRight };
}

/* ── Designer rage cycle ── */
const RAGE = [
  { face: '😊', item: '🖌️', canvas: '🖼️', dur: 2800 },
  { face: '🤔', item: '🖌️', canvas: '🖼️', dur: 1400 },
  { face: '😠', item: '💢', canvas: '💥', dur: 1000 },
  { face: '😤', item: '✋', canvas: '🗑️', dur: 900 },
  { face: '😌', item: '🖌️', canvas: '🆕', dur: 1400 },
];

function DesignerRage() {
  const [f, setF] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setF(i => (i + 1) % RAGE.length), RAGE[f].dur);
    return () => clearTimeout(t);
  }, [f]);
  const r = RAGE[f];
  return (
    <motion.div key={f} initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex items-end gap-0.5">
      <span className="text-lg">{r.face}</span>
      <span className="text-sm">{r.item}</span>
      <span className="text-base">{r.canvas}</span>
    </motion.div>
  );
}

/* ── Cat component ── */
function Cat({ i }: { i: number }) {
  const cats = ['🐱', '🐈', '😺', '🐈‍⬛', '😸', '🐾'];
  return (
    <motion.span
      className="absolute text-[10px]"
      style={{ left: `${8 + i * 14}%`, bottom: 0 }}
      animate={{ x: [0, 4 * (i % 2 ? 1 : -1), 0], y: [0, -3, 0] }}
      transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}
    >
      {cats[i]}
    </motion.span>
  );
}

/* ── Activity scene ── */
function ActivityScene({ member, inCoffeeRoom }: { member: OfficeMember; inCoffeeRoom?: boolean }) {
  const { role, activity, isOnline } = member;

  if (!isOnline) return <span className="text-xl opacity-20 grayscale">👤</span>;

  if (inCoffeeRoom) return (
    <div className="flex items-end gap-0.5">
      <motion.span animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-lg">☕</motion.span>
      <span className="text-xl">🧑</span>
    </div>
  );

  // Videomaker gravando
  if (role === 'videomaker' && activity === 'gravando') return (
    <div className="relative flex items-end gap-0.5">
      <motion.span animate={{ rotate: [-2, 2, -2] }} transition={{ duration: 0.4, repeat: Infinity }} className="text-xl">🧑‍🎤</motion.span>
      <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }} className="text-base">📱</motion.span>
      <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-lg">🧑</motion.span>
      <motion.span className="absolute -top-2.5 right-0 rounded bg-red-600 px-1 text-[7px] font-bold text-white" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
        ● REC
      </motion.span>
    </div>
  );

  // Editor editando
  if (role === 'editor' && (activity === 'edicao' || activity === 'revisao' || activity === 'alteracao')) return (
    <div className="flex flex-col items-center">
      <div className="flex items-end gap-0.5">
        <motion.span animate={{ y: [0, -1, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-xl">🧑‍💻</motion.span>
        <span className="text-lg">🖥️</span>
        <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }} className="text-xs">▶️</motion.span>
      </div>
      <span className="text-[8px] mt-0.5" style={{ color: '#7dd3fc' }}>
        {activity === 'edicao' ? '✂️ Editando' : activity === 'revisao' ? '👁️ Revisando' : '🔧 Alteração'}
      </span>
    </div>
  );

  // Designer ativo
  if (role === 'designer' && activity === 'designing') return <DesignerRage />;

  // Social media (sempre trabalhando quando online)
  if (role === 'social_media') return (
    <div className="relative flex flex-col items-center">
      <div className="flex items-end gap-0.5">
        <motion.span animate={{ y: [0, -1, 0] }} transition={{ duration: 3, repeat: Infinity }} className="text-xl">🧑‍💻</motion.span>
        <span className="text-base">💻</span>
        <span className="text-xs opacity-70">📱</span>
      </div>
      <div className="relative w-20 h-4 mt-0.5">
        {[0, 1, 2, 3, 4, 5].map(i => <Cat key={i} i={i} />)}
      </div>
    </div>
  );

  // Admin (sempre trabalhando quando online)
  if (role === 'admin') return (
    <div className="flex items-end gap-0.5">
      <motion.span animate={{ y: [0, -1, 0] }} transition={{ duration: 4, repeat: Infinity }} className="text-xl">🧑‍💼</motion.span>
      <span className="text-base">🖥️</span>
      <span className="text-xs">📊</span>
    </div>
  );

  // Videomaker online sem gravar
  if (role === 'videomaker') return (
    <div className="flex items-end gap-0.5">
      <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-xl">🧑‍🎤</motion.span>
      <span className="text-sm">📹</span>
    </div>
  );

  // Default
  return (
    <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-xl">
      {role === 'fotografo' ? '📸' : role === 'endomarketing' ? '📣' : role === 'parceiro' ? '🤝' : '🧑'}
    </motion.span>
  );
}

/* ── Main character component ── */
interface Props {
  member: OfficeMember;
  onClick: () => void;
  inCoffeeRoom?: boolean;
}

export default function PixelCharacter({ member, onClick, inCoffeeRoom }: Props) {
  const { pos, facingRight } = useWalk(member.isOnline);
  const delay = useMemo(() => Math.random() * 0.5, []);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ duration: 2.5, ease: 'easeInOut', delay }}
      whileHover={{ scale: 1.15 }}
      className="group relative flex flex-col items-center gap-0.5 p-1.5 rounded-lg"
      style={{ imageRendering: 'pixelated' as any }}
    >
      {/* Online pulse */}
      {member.isOnline && (
        <motion.div
          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full z-10"
          style={{ backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e' }}
          animate={{ scale: [1, 1.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Shadow */}
      {member.isOnline && (
        <motion.div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full opacity-20"
          style={{ width: 28, height: 6, backgroundColor: '#000' }}
          animate={{ scaleX: [0.8, 1.1, 0.8] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
      )}

      {/* Character sprite area */}
      <div
        className="relative flex items-center justify-center min-h-[40px] min-w-[48px]"
        style={{ transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)' }}
      >
        {/* Bob animation while walking */}
        <motion.div
          animate={member.isOnline ? { y: [0, -2, 0] } : {}}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ActivityScene member={member} inCoffeeRoom={inCoffeeRoom} />
        </motion.div>
      </div>

      {/* Name plate */}
      <div
        className="px-1.5 py-0.5 rounded text-[8px] font-bold leading-none whitespace-nowrap max-w-[70px] truncate"
        style={{
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: member.isOnline ? '#fff' : '#888',
          transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)',
        }}
      >
        {member.name.split(' ')[0]}
      </div>
    </motion.button>
  );
}
