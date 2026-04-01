import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OfficeMember } from './types';

/* ────────────────── Pixel-art sprite helpers ────────────────── */

const ROLE_SKIN: Record<string, { body: string; hat?: string; tool?: string }> = {
  admin:         { body: '🧑‍💼', hat: '🎩' },
  videomaker:    { body: '🧑‍🎤', tool: '📹' },
  editor:        { body: '🧑‍💻', tool: '🖥️' },
  designer:      { body: '🧑‍🎨', tool: '🖌️' },
  social_media:  { body: '🧑‍💻', tool: '💻' },
  fotografo:     { body: '📸' },
  parceiro:      { body: '🤝' },
  endomarketing: { body: '📣' },
};

/* ────────────────── Designer rage animation cycle ────────────── */
const DESIGNER_FRAMES = [
  { emoji: '😊', label: 'Pintando...', canvas: '🖼️', duration: 3000 },
  { emoji: '🤔', label: 'Hmm...', canvas: '🖼️', duration: 1500 },
  { emoji: '😠', label: 'Não gostei!', canvas: '💥', duration: 1200 },
  { emoji: '😤', label: 'Rasgando!', canvas: '🗑️', duration: 1000 },
  { emoji: '😌', label: 'Vamos de novo', canvas: '🆕', duration: 1500 },
];

function DesignerRageAnimation() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFrame(f => (f + 1) % DESIGNER_FRAMES.length);
    }, DESIGNER_FRAMES[frame].duration);
    return () => clearTimeout(timer);
  }, [frame]);

  const f = DESIGNER_FRAMES[frame];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-end gap-1">
        <motion.div
          key={frame}
          initial={{ scale: 0.7, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          className="text-2xl"
        >
          {f.emoji}
        </motion.div>
        <motion.div
          key={`canvas-${frame}`}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0, rotate: 45 }}
          className="text-xl"
        >
          {f.canvas}
        </motion.div>
      </div>
      <motion.span
        key={`label-${frame}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[9px] font-medium text-foreground/70"
      >
        {f.label}
      </motion.span>
    </div>
  );
}

/* ────────────────── Cat component for social media ──────────── */
function Cat({ delay, x }: { delay: number; x: number }) {
  const catEmojis = ['🐱', '🐈', '😺', '🐈‍⬛', '😸', '🐾'];
  const [idx] = useState(() => Math.floor(Math.random() * catEmojis.length));

  return (
    <motion.span
      className="absolute text-sm pointer-events-none select-none"
      style={{ left: `${x}%`, bottom: '2px' }}
      animate={{
        y: [0, -4, 0, -2, 0],
        x: [0, 3, -3, 2, 0],
      }}
      transition={{
        duration: 3 + delay,
        repeat: Infinity,
        delay: delay * 0.5,
      }}
    >
      {catEmojis[idx]}
    </motion.span>
  );
}

/* ────────────────── Activity-specific scene rendering ───────── */
function ActivityScene({ member }: { member: OfficeMember }) {
  const { role, activity } = member;

  // ── VIDEOMAKER gravando ──
  if (role === 'videomaker' && activity === 'gravando') {
    return (
      <div className="flex items-center gap-1">
        <motion.div
          animate={{ rotate: [-2, 2, -2] }}
          transition={{ duration: 0.4, repeat: Infinity }}
          className="text-2xl"
        >
          🧑‍🎤
        </motion.div>
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [1, 0.8, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="text-lg"
        >
          📱
        </motion.div>
        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-xl"
        >
          🧑
        </motion.div>
        <motion.div
          className="absolute -top-3 right-0 rounded-full bg-destructive px-1.5 py-0.5 text-[8px] font-bold text-destructive-foreground"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          ● REC
        </motion.div>
      </div>
    );
  }

  // ── EDITOR editando ──
  if (role === 'editor' && (activity === 'edicao' || activity === 'revisao' || activity === 'alteracao')) {
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-end gap-1">
          <motion.div
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-2xl"
          >
            🧑‍💻
          </motion.div>
          <div className="relative">
            <span className="text-xl">🖥️</span>
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="text-[8px]">▶️</span>
            </motion.div>
          </div>
        </div>
        <span className="text-[9px] text-primary font-medium mt-0.5">
          {activity === 'edicao' ? '✂️ Editando' : activity === 'revisao' ? '👁️ Revisando' : '🔧 Alteração'}
        </span>
      </div>
    );
  }

  // ── DESIGNER com tarefa ativa ──
  if (role === 'designer' && activity === 'designing') {
    return <DesignerRageAnimation />;
  }

  // ── SOCIAL MEDIA (always working when online) ──
  if (role === 'social_media' && member.isOnline) {
    return (
      <div className="relative flex flex-col items-center">
        <div className="flex items-end gap-1">
          <motion.div
            animate={{ y: [0, -1, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-2xl"
          >
            🧑‍💻
          </motion.div>
          <span className="text-lg">💻</span>
          <span className="text-xs opacity-70">📱</span>
        </div>
        {/* 6 cats */}
        <div className="relative w-24 h-5 mt-1">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <Cat key={i} delay={i * 0.7} x={i * 16} />
          ))}
        </div>
      </div>
    );
  }

  // ── ADMIN ──
  if (role === 'admin' && member.isOnline) {
    return (
      <div className="flex items-end gap-1">
        <motion.div
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="text-2xl"
        >
          🧑‍💼
        </motion.div>
        <span className="text-lg">🖥️</span>
        <span className="text-xs">📊</span>
      </div>
    );
  }

  // ── COFFEE ROOM (idle/paused) ──
  if (member.activity === 'idle' || member.activity === 'paused' || (!member.activity && member.isOnline && role !== 'social_media' && role !== 'admin')) {
    return (
      <div className="flex items-center gap-1">
        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="text-2xl"
        >
          {ROLE_SKIN[role]?.body || '🧑'}
        </motion.div>
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-lg"
        >
          ☕
        </motion.div>
      </div>
    );
  }

  // ── DEFAULT (online but no specific activity) ──
  const skin = ROLE_SKIN[role] || { body: '🧑' };
  return (
    <div className="flex items-center gap-0.5">
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="text-2xl"
      >
        {skin.body}
      </motion.div>
      {skin.tool && <span className="text-sm opacity-70">{skin.tool}</span>}
    </div>
  );
}

/* ────────────────── Main character card ─────────────────────── */
interface RpgCharacterProps {
  member: OfficeMember;
  onClick: () => void;
  inCoffeeRoom?: boolean;
}

export default function RpgCharacter({ member, onClick, inCoffeeRoom }: RpgCharacterProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.08, y: -4 }}
      whileTap={{ scale: 0.95 }}
      className="group relative flex flex-col items-center gap-1 rounded-xl p-2 transition-colors hover:bg-foreground/5"
      style={{ imageRendering: 'auto' }}
    >
      {/* Online indicator */}
      <div className="absolute right-1 top-1 z-10">
        <motion.span
          className={`block h-2.5 w-2.5 rounded-full border border-background ${
            member.isOnline
              ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]'
              : 'bg-muted-foreground/40'
          }`}
          animate={member.isOnline ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>

      {/* Character sprite area */}
      <div className={`relative flex h-16 w-20 items-center justify-center rounded-lg border-2 border-dashed ${
        member.isOnline
          ? inCoffeeRoom
            ? 'border-amber-500/30 bg-amber-900/10'
            : 'border-primary/30 bg-primary/5'
          : 'border-border/40 bg-muted/30'
      }`}>
        {member.isOnline ? (
          <ActivityScene member={{ ...member, activity: inCoffeeRoom ? 'idle' : member.activity }} />
        ) : (
          <div className="text-2xl opacity-30 grayscale">
            {ROLE_SKIN[member.role]?.body || '🧑'}
          </div>
        )}
      </div>

      {/* Name tag */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="max-w-[80px] truncate text-[10px] font-bold text-foreground leading-tight">
          {member.name.split(' ')[0]}
        </span>
        {member.isOnline && !inCoffeeRoom && member.activity && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[8px] font-medium text-primary"
          >
            {member.activity === 'gravando' && '🔴 Gravando'}
            {member.activity === 'edicao' && '✂️ Editando'}
            {member.activity === 'revisao' && '👁️ Revisando'}
            {member.activity === 'alteracao' && '🔧 Alteração'}
            {member.activity === 'designing' && '🎨 Criando'}
            {member.activity === 'aprovacao' && '✅ Aprovando'}
          </motion.span>
        )}
        {inCoffeeRoom && (
          <span className="text-[8px] text-amber-600 dark:text-amber-400">☕ Café</span>
        )}
        {!member.isOnline && (
          <span className="text-[8px] text-muted-foreground">Offline</span>
        )}
      </div>
    </motion.button>
  );
}
