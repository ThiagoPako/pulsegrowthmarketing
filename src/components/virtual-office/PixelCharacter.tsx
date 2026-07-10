import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OfficeMember } from './types';

/* ── Walking hook ── */
function useWalk(isOnline: boolean) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [facingRight, setFacingRight] = useState(true);

  useEffect(() => {
    if (!isOnline) { setPos({ x: 0, y: 0 }); return; }
    const move = () => {
      const nx = (Math.random() - 0.5) * 40;
      const ny = (Math.random() - 0.5) * 10;
      setFacingRight(nx > pos.x);
      setPos({ x: nx, y: ny });
    };
    move();
    const iv = setInterval(move, 4000 + Math.random() * 4000);
    return () => clearInterval(iv);
  }, [isOnline]);

  return { pos, facingRight };
}

/* ── Color palettes per role ── */
const PALETTES: Record<string, { skin: string; hair: string; shirt: string; pants: string; accent: string }> = {
  admin:        { skin: '#f5c8a8', hair: '#3a2a1a', shirt: '#1e3a5f', pants: '#2c2c3e', accent: '#c9a84c' },
  social_media: { skin: '#f0c090', hair: '#8b4513', shirt: '#2d8a4e', pants: '#2a3a50', accent: '#48d597' },
  editor:       { skin: '#e8b898', hair: '#1a1a2e', shirt: '#4a2c6a', pants: '#1e1e2e', accent: '#a78bfa' },
  videomaker:   { skin: '#f5d0b0', hair: '#2a1a0a', shirt: '#c0392b', pants: '#2c2c2c', accent: '#e74c3c' },
  designer:     { skin: '#f0c8a0', hair: '#d35400', shirt: '#e67e22', pants: '#3a3a4a', accent: '#f39c12' },
  fotografo:    { skin: '#e8c0a0', hair: '#4a3020', shirt: '#ec4899', pants: '#2e2e3e', accent: '#f472b6' },
  endomarketing:{ skin: '#f0d0b8', hair: '#5a3a20', shirt: '#0ea5e9', pants: '#2a3a48', accent: '#38bdf8' },
  parceiro:     { skin: '#e0b090', hair: '#2a2a3a', shirt: '#6366f1', pants: '#2c2c3c', accent: '#818cf8' },
  copywriter:   { skin: '#f0c8a0', hair: '#3a2a1a', shirt: '#0f766e', pants: '#2c2c3c', accent: '#5eead4' },
  // Gestor de Projetos: mulher, cabelo preto longo, blazer roxo
  gestor_projetos: { skin: '#f2caa8', hair: '#0a0a0f', shirt: '#7c3aed', pants: '#1e1b2e', accent: '#e879f9' },
};

/* Female palettes — slightly different hair/shirt for variety */
const FEMALE_OVERRIDES: Record<string, Partial<typeof PALETTES['admin']>> = {
  admin:        { hair: '#5a3020', shirt: '#2e4a7f' },
  social_media: { hair: '#6b3010', shirt: '#2d7a5e' },
  editor:       { hair: '#4a2a3e', shirt: '#5a3c7a' },
  videomaker:   { hair: '#3a2010', shirt: '#d04a3b' },
  designer:     { hair: '#c04500', shirt: '#d06a22' },
  fotografo:    { hair: '#5a3828', shirt: '#d06090' },
  endomarketing:{ hair: '#6a4030', shirt: '#1095d0' },
  parceiro:     { hair: '#3a2a4a', shirt: '#7376f1' },
  copywriter:   { hair: '#3a2432', shirt: '#0e8478' },
  // Gestora de projetos mantém preto longo mesmo no override
  gestor_projetos: { hair: '#0a0a0f', shirt: '#7c3aed' },
};

function getPalette(role: string, gender?: 'male' | 'female') {
  const base = PALETTES[role] || PALETTES.admin;
  if (gender === 'female') {
    const overrides = FEMALE_OVERRIDES[role] || {};
    return { ...base, ...overrides };
  }
  return base;
}

/* ── Activity labels ── */
const ACTIVITY_LABELS: Record<string, string> = {
  gestao: '📋 Gestão',
  gravando: '🎬 Gravando',
  edicao: '✂️ Editando',
  revisao: '👁️ Revisando',
  alteracao: '🔧 Alteração',
  aprovacao: '✅ Aprovação',
  designing: '🎨 Criando arte',
  copywriting: '✍️ Escrevendo copy',
  idle: '💤 Ocioso',
  paused: '⏸️ Pausado',
};

/* ── Pixel Person Sprite (CSS-based) ── */
function PersonSprite({ role, gender, isTyping, isRecording }: { role: string; gender?: 'male' | 'female'; isTyping?: boolean; isRecording?: boolean }) {
  const p = getPalette(role, gender);
  const isFemale = gender === 'female';

  return (
    <div className="relative flex flex-col items-center" style={{ width: 24, height: 36 }}>
      {/* Hair */}
      <div style={{
        width: isFemale ? 16 : 14, height: isFemale ? 7 : 5, backgroundColor: p.hair,
        borderRadius: isFemale ? '6px 6px 1px 1px' : '4px 4px 0 0',
        position: 'absolute', top: 0, left: isFemale ? 4 : 5,
      }} />
      {/* Long hair sides (female) */}
      {isFemale && (
        <>
          <div style={{
            width: 3, height: 14, backgroundColor: p.hair,
            position: 'absolute', top: 4, left: 3, borderRadius: '0 0 2px 2px',
          }} />
          <div style={{
            width: 3, height: 14, backgroundColor: p.hair,
            position: 'absolute', top: 4, right: 2, borderRadius: '0 0 2px 2px',
          }} />
        </>
      )}
      {/* Head */}
      <div style={{
        width: 12, height: 10, backgroundColor: p.skin,
        borderRadius: '3px 3px 2px 2px',
        position: 'absolute', top: 4, left: 6,
        boxShadow: `inset -2px 0 0 rgba(0,0,0,0.08)`,
      }}>
        {/* Eyes */}
        <div style={{
          position: 'absolute', top: 3, left: 2,
          width: 2, height: 2, backgroundColor: '#1a1a2e', borderRadius: 1,
        }} />
        <div style={{
          position: 'absolute', top: 3, right: 2,
          width: 2, height: 2, backgroundColor: '#1a1a2e', borderRadius: 1,
        }} />
        {/* Eyelashes (female) */}
        {isFemale && (
          <>
            <div style={{ position: 'absolute', top: 2, left: 1, width: 3, height: 1, backgroundColor: '#1a1a2e' }} />
            <div style={{ position: 'absolute', top: 2, right: 1, width: 3, height: 1, backgroundColor: '#1a1a2e' }} />
          </>
        )}
        {/* Mouth */}
        <div style={{
          position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
          width: isFemale ? 3 : 4, height: 1,
          backgroundColor: isFemale ? '#e06080' : '#c0392b', borderRadius: 1,
        }} />
      </div>
      {/* Body/Shirt */}
      <motion.div
        animate={isTyping ? { y: [0, -0.5, 0] } : {}}
        transition={{ duration: 0.3, repeat: Infinity }}
        style={{
          width: isFemale ? 14 : 16, height: 10, backgroundColor: p.shirt,
          borderRadius: '2px 2px 0 0',
          position: 'absolute', top: 14, left: isFemale ? 5 : 4,
          boxShadow: `inset -3px 0 0 rgba(0,0,0,0.1)`,
        }}
      >
        {/* Collar/Accent */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 6, height: 2, backgroundColor: p.accent, borderRadius: '0 0 2px 2px',
        }} />
      </motion.div>
      {/* Arms */}
      <motion.div
        animate={isTyping ? { rotate: [0, -8, 0, 8, 0] } : isRecording ? { rotate: [-5, 5, -5] } : {}}
        transition={{ duration: isTyping ? 0.4 : 2, repeat: Infinity }}
        style={{
          width: 4, height: 8, backgroundColor: p.shirt,
          position: 'absolute', top: 15, left: isFemale ? 1 : 0, borderRadius: 2,
          transformOrigin: 'top center',
        }}
      >
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 4, height: 3, backgroundColor: p.skin, borderRadius: '0 0 2px 2px' }} />
      </motion.div>
      <motion.div
        animate={isTyping ? { rotate: [0, 8, 0, -8, 0] } : isRecording ? { rotate: [5, -5, 5] } : {}}
        transition={{ duration: isTyping ? 0.4 : 2, repeat: Infinity, delay: 0.15 }}
        style={{
          width: 4, height: 8, backgroundColor: p.shirt,
          position: 'absolute', top: 15, right: isFemale ? 1 : 0, borderRadius: 2,
          transformOrigin: 'top center',
        }}
      >
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 4, height: 3, backgroundColor: p.skin, borderRadius: '0 0 2px 2px' }} />
      </motion.div>
      {/* Pants/Skirt */}
      {isFemale ? (
        <div style={{
          width: 16, height: 8, backgroundColor: p.pants,
          position: 'absolute', top: 23, left: 4,
          borderRadius: '0 0 4px 4px',
          clipPath: 'polygon(10% 0, 90% 0, 100% 100%, 0% 100%)',
        }} />
      ) : (
        <div style={{
          width: 14, height: 6, backgroundColor: p.pants,
          position: 'absolute', top: 24, left: 5,
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.15)',
          }} />
        </div>
      )}
      {/* Legs */}
      <motion.div
        style={{
          position: 'absolute', bottom: 0, left: 6,
          width: 5, height: isFemale ? 5 : 6, backgroundColor: isFemale ? p.skin : p.pants, borderRadius: '0 0 2px 2px',
        }}
      >
        <div style={{ position: 'absolute', bottom: 0, left: -1, width: 6, height: 2, backgroundColor: isFemale ? '#e06080' : '#1a1a1a', borderRadius: 1 }} />
      </motion.div>
      <motion.div
        style={{
          position: 'absolute', bottom: 0, right: 5,
          width: 5, height: isFemale ? 5 : 6, backgroundColor: isFemale ? p.skin : p.pants, borderRadius: '0 0 2px 2px',
        }}
      >
        <div style={{ position: 'absolute', bottom: 0, right: -1, width: 6, height: 2, backgroundColor: isFemale ? '#e06080' : '#1a1a1a', borderRadius: 1 }} />
      </motion.div>
    </div>
  );
}

/* ── Desk with Monitor ── */
function DeskWithMonitor({ screenColor, screenGlow }: { screenColor: string; screenGlow?: string }) {
  return (
    <div className="relative" style={{ width: 28, height: 22 }}>
      <div style={{
        width: 20, height: 14, backgroundColor: '#2a2a2e',
        borderRadius: 2, position: 'absolute', top: 0, left: 4,
        border: '1px solid #444',
      }}>
        <motion.div
          animate={{ opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 3, repeat: Infinity }}
          style={{
            width: 16, height: 10, backgroundColor: screenColor,
            borderRadius: 1, position: 'absolute', top: 1, left: 1,
            boxShadow: screenGlow ? `0 0 8px ${screenGlow}` : undefined,
          }}
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 0.7, 0.3], width: ['60%', '80%', '50%'] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
              style={{
                height: 1, backgroundColor: 'rgba(255,255,255,0.5)',
                borderRadius: 1, position: 'absolute', top: 2 + i * 3, left: 2,
              }}
            />
          ))}
        </motion.div>
      </div>
      <div style={{ width: 4, height: 3, backgroundColor: '#3a3a3e', position: 'absolute', bottom: 5, left: 12 }} />
      <div style={{
        width: 28, height: 4, backgroundColor: '#8B6914',
        borderRadius: 1, position: 'absolute', bottom: 0, left: 0,
        boxShadow: '0 2px 0 #6a4f10',
      }} />
    </div>
  );
}

/* ── Camera Equipment ── */
function CameraRig() {
  return (
    <div className="relative" style={{ width: 16, height: 20 }}>
      <div style={{ width: 2, height: 12, backgroundColor: '#555', position: 'absolute', bottom: 0, left: 7 }} />
      <div style={{ width: 8, height: 2, backgroundColor: '#555', position: 'absolute', bottom: 0, left: 4, borderRadius: 1 }} />
      <motion.div
        animate={{ rotate: [-3, 3, -3] }}
        transition={{ duration: 4, repeat: Infinity }}
        style={{
          width: 12, height: 8, backgroundColor: '#2a2a2e',
          borderRadius: 2, position: 'absolute', top: 0, left: 2,
          border: '1px solid #444',
        }}
      >
        <div style={{
          width: 6, height: 6, backgroundColor: '#1a1a1e',
          borderRadius: '50%', position: 'absolute', top: 1, right: -2,
          border: '1px solid #555',
        }}>
          <div style={{ width: 3, height: 3, backgroundColor: '#334', borderRadius: '50%', position: 'absolute', top: 1, left: 1 }} />
        </div>
        <motion.div
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          style={{
            width: 3, height: 3, backgroundColor: '#ef4444',
            borderRadius: '50%', position: 'absolute', top: 1, left: 1,
            boxShadow: '0 0 4px #ef4444',
          }}
        />
      </motion.div>
    </div>
  );
}

/* ── Easel for designer ── */
function Easel() {
  return (
    <div className="relative" style={{ width: 20, height: 24 }}>
      <div style={{ width: 2, height: 18, backgroundColor: '#8B6914', position: 'absolute', bottom: 0, left: 3, transform: 'rotate(-5deg)' }} />
      <div style={{ width: 2, height: 18, backgroundColor: '#8B6914', position: 'absolute', bottom: 0, right: 3, transform: 'rotate(5deg)' }} />
      <motion.div
        style={{
          width: 16, height: 14, backgroundColor: '#fef9ef',
          border: '1px solid #c0a060', borderRadius: 1,
          position: 'absolute', top: 0, left: 2,
        }}
      >
        <motion.div
          animate={{ width: ['0%', '70%', '40%', '90%'] }}
          transition={{ duration: 4, repeat: Infinity }}
          style={{ height: 2, backgroundColor: '#e74c3c', borderRadius: 1, position: 'absolute', top: 3, left: 2 }}
        />
        <motion.div
          animate={{ width: ['20%', '50%', '80%', '30%'] }}
          transition={{ duration: 5, repeat: Infinity, delay: 1 }}
          style={{ height: 2, backgroundColor: '#3498db', borderRadius: 1, position: 'absolute', top: 7, left: 2 }}
        />
        <motion.div
          animate={{ width: ['40%', '60%', '20%', '70%'] }}
          transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }}
          style={{ height: 2, backgroundColor: '#f39c12', borderRadius: 1, position: 'absolute', top: 11, left: 2 }}
        />
      </motion.div>
    </div>
  );
}

/* ── Cat pixel ── */
function PixelCat({ index }: { index: number }) {
  const colors = ['#f59e0b', '#6b7280', '#1a1a1a', '#f97316', '#d1d5db', '#92400e'];
  const color = colors[index % colors.length];
  return (
    <motion.div
      className="absolute"
      style={{ left: 4 + index * 14, bottom: 2 }}
      animate={{ x: [0, 6 * (index % 2 ? 1 : -1), 0], y: [0, -4, 0] }}
      transition={{ duration: 3 + index * 0.5, repeat: Infinity, delay: index * 0.4 }}
    >
      <div className="relative" style={{ width: 8, height: 8 }}>
        <div style={{ width: 7, height: 4, backgroundColor: color, borderRadius: 2, position: 'absolute', bottom: 0, left: 0 }} />
        <div style={{ width: 5, height: 4, backgroundColor: color, borderRadius: '2px 2px 1px 1px', position: 'absolute', top: 0, left: 0 }} />
        <div style={{ width: 0, height: 0, borderLeft: '2px solid transparent', borderRight: '2px solid transparent', borderBottom: `3px solid ${color}`, position: 'absolute', top: -2, left: 0 }} />
        <div style={{ width: 0, height: 0, borderLeft: '2px solid transparent', borderRight: '2px solid transparent', borderBottom: `3px solid ${color}`, position: 'absolute', top: -2, left: 3 }} />
        <motion.div
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, delay: index * 2 }}
          style={{ width: 1, height: 1, backgroundColor: '#22c55e', borderRadius: '50%', position: 'absolute', top: 2, left: 1 }}
        />
        <motion.div
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, delay: index * 2 }}
          style={{ width: 1, height: 1, backgroundColor: '#22c55e', borderRadius: '50%', position: 'absolute', top: 2, left: 3 }}
        />
        <motion.div
          animate={{ rotate: [0, 30, -20, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            width: 5, height: 2, backgroundColor: color, borderRadius: '0 3px 3px 0',
            position: 'absolute', bottom: 2, right: -4, transformOrigin: 'left center',
          }}
        />
      </div>
    </motion.div>
  );
}

/* ── Tablet/iPad ── */
function Tablet() {
  return (
    <div style={{ width: 10, height: 14, backgroundColor: '#2a2a2e', borderRadius: 2, border: '1px solid #444', position: 'relative' }}>
      <motion.div
        animate={{ backgroundColor: ['#065f46', '#064e3b', '#065f46'] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{ width: 8, height: 10, borderRadius: 1, position: 'absolute', top: 1, left: 0.5 }}
      />
    </div>
  );
}

/* ── Activity Scene (full workstation) ── */
function ActivityScene({ member, inCoffeeRoom }: { member: OfficeMember; inCoffeeRoom?: boolean }) {
  const { role, activity, isOnline, gender } = member;

  if (!isOnline) {
    return (
      <div className="flex flex-col items-center opacity-25">
        <PersonSprite role={role} gender={gender} />
      </div>
    );
  }

  if (inCoffeeRoom) return (
    <div className="flex items-end gap-1">
      <PersonSprite role={role} gender={gender} />
      <div className="relative mb-1">
        <div style={{ width: 8, height: 8, backgroundColor: '#8B6914', borderRadius: '0 0 2px 2px', border: '1px solid #6a4f10' }}>
          <motion.div
            animate={{ y: [-2, -5, -2], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ width: 6, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 4, position: 'absolute', top: -4, left: 1 }}
          />
        </div>
      </div>
    </div>
  );

  if (role === 'videomaker' && activity === 'gravando') return (
    <div className="relative flex items-end gap-1">
      <PersonSprite role={role} gender={gender} isRecording />
      <CameraRig />
      <motion.div
        className="absolute -top-3 right-0 rounded px-1 text-[7px] font-bold"
        style={{ backgroundColor: '#dc2626', color: '#fff' }}
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      >
        ● REC
      </motion.div>
    </div>
  );

  if (role === 'editor' && (activity === 'edicao' || activity === 'revisao' || activity === 'alteracao')) return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-end gap-1">
        <PersonSprite role={role} gender={gender} isTyping />
        <DeskWithMonitor
          screenColor={activity === 'edicao' ? '#1a1a3e' : activity === 'revisao' ? '#1e3a1e' : '#3e1a1a'}
          screenGlow={activity === 'edicao' ? '#6366f1' : activity === 'revisao' ? '#22c55e' : '#ef4444'}
        />
      </div>
      <span className="text-[7px] font-bold px-1 rounded" style={{
        backgroundColor: activity === 'edicao' ? '#4338ca33' : activity === 'revisao' ? '#16653233' : '#991b1b33',
        color: activity === 'edicao' ? '#a5b4fc' : activity === 'revisao' ? '#86efac' : '#fca5a5',
      }}>
        {activity === 'edicao' ? '✂ Editando' : activity === 'revisao' ? '👁 Revisando' : '🔧 Alteração'}
      </span>
    </div>
  );

  if (role === 'designer' && activity === 'designing') return (
    <div className="flex items-end gap-1">
      <PersonSprite role={role} gender={gender} isTyping />
      <Easel />
    </div>
  );

  // Gestor(a) de Projetos trabalhando: anda com iPad e supervisa via computador
  if (role === 'gestor_projetos' && activity === 'gestao') return (
    <div className="relative flex flex-col items-center gap-0.5">
      <div className="flex items-end gap-1">
        <div className="relative">
          <PersonSprite role={role} gender="female" isTyping />
          {/* iPad na mão */}
          <motion.div
            animate={{ y: [0, -1, 0], rotate: [-2, 2, -2] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            style={{ position: 'absolute', top: 16, right: -6 }}
          >
            <Tablet />
          </motion.div>
        </div>
        <DeskWithMonitor screenColor="#3b0764" screenGlow="#c084fc" />
      </div>
      <span className="text-[7px] font-bold px-1 rounded" style={{ backgroundColor: '#7c3aed33', color: '#e9d5ff' }}>
        💼 Gerenciando
      </span>
    </div>
  );

  if (role === 'social_media') return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-end gap-1">
        <PersonSprite role={role} gender={gender} isTyping />
        <div className="flex items-end gap-0.5">
          <DeskWithMonitor screenColor="#064e3b" screenGlow="#10b981" />
          <div className="mb-1"><Tablet /></div>
        </div>
      </div>
      <div className="relative w-24 h-3">
        {[0, 1, 2, 3, 4, 5].map(i => <PixelCat key={i} index={i} />)}
      </div>
    </div>
  );

  if (role === 'admin') return (
    <div className="flex items-end gap-1">
      <PersonSprite role={role} gender={gender} isTyping />
      <DeskWithMonitor screenColor="#1a2a3e" screenGlow="#3b82f6" />
    </div>
  );

  if (role === 'videomaker') return (
    <div className="flex items-end gap-1">
      <PersonSprite role={role} gender={gender} />
      <CameraRig />
    </div>
  );

  if (role === 'designer') return (
    <div className="flex items-end gap-1">
      <PersonSprite role={role} gender={gender} />
      <Easel />
    </div>
  );

  if (role === 'editor') return (
    <div className="flex items-end gap-1">
      <PersonSprite role={role} gender={gender} />
      <DeskWithMonitor screenColor="#1a1a2e" />
    </div>
  );

  return (
    <div className="flex items-end gap-1">
      <PersonSprite role={role} gender={gender} />
      <DeskWithMonitor screenColor="#1a2a2e" />
    </div>
  );
}

/* ── Main character component ── */
interface Props {
  member: OfficeMember;
  onClick: () => void;
  inCoffeeRoom?: boolean;
  justJoined?: boolean;
}

export default function PixelCharacter({ member, onClick, inCoffeeRoom, justJoined }: Props) {
  const { pos, facingRight } = useWalk(member.isOnline);
  const delay = useMemo(() => Math.random() * 0.5, []);
  const [showTooltip, setShowTooltip] = useState(false);

  const activityLabel = member.activity ? (ACTIVITY_LABELS[member.activity] || `⚙️ ${member.activity}`) : (member.isOnline ? '🟢 Online' : '⚫ Offline');

  const handleClick = () => {
    setShowTooltip(prev => !prev);
    onClick();
  };

  // Auto-hide tooltip after 4s
  useEffect(() => {
    if (!showTooltip) return;
    const t = setTimeout(() => setShowTooltip(false), 4000);
    return () => clearTimeout(t);
  }, [showTooltip]);

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      initial={justJoined ? { scale: 0, y: 40, opacity: 0 } : false}
      animate={{ x: pos.x, y: pos.y, scale: 1, opacity: 1 }}
      transition={{ duration: justJoined ? 0.6 : 2.5, ease: justJoined ? 'backOut' : 'easeInOut', delay }}
      whileHover={{ scale: 1.12 }}
      className="group relative flex flex-col items-center gap-0.5 p-1.5 rounded-lg"
      style={{ imageRendering: 'pixelated' as any }}
    >
      {/* Activity tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            className="absolute -top-10 z-30 whitespace-nowrap rounded px-2 py-1 text-[9px] font-bold shadow-lg"
            style={{
              backgroundColor: 'rgba(0,0,0,0.9)',
              color: '#fff',
              border: `1px solid ${getPalette(member.role, member.gender).accent}`,
              pointerEvents: 'none',
            }}
          >
            <div>{member.name}</div>
            <div style={{ color: getPalette(member.role, member.gender).accent }}>{activityLabel}</div>
            {/* Arrow */}
            <div style={{
              position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
              borderTop: '4px solid rgba(0,0,0,0.9)',
            }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join sparkle effect */}
      <AnimatePresence>
        {justJoined && (
          <motion.div
            className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center"
            initial={{ opacity: 1, scale: 0.5 }}
            animate={{ opacity: 0, scale: 2.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
          >
            {[0, 1, 2, 3, 4, 5].map(i => (
              <motion.div
                key={i}
                className="absolute"
                style={{ width: 3, height: 3, backgroundColor: '#fbbf24' }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{
                  x: Math.cos(i * 60 * Math.PI / 180) * 20,
                  y: Math.sin(i * 60 * Math.PI / 180) * 20,
                  opacity: 0,
                }}
                transition={{ duration: 1, delay: i * 0.05 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full opacity-15"
          style={{ width: 36, height: 6, backgroundColor: '#000' }}
          animate={{ scaleX: [0.8, 1.1, 0.8] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
      )}

      {/* Character sprite area */}
      <div
        className="relative flex items-center justify-center"
        style={{
          minHeight: 50, minWidth: 60,
          transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)',
        }}
      >
        <motion.div
          animate={member.isOnline ? { y: [0, -1.5, 0] } : {}}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ActivityScene member={member} inCoffeeRoom={inCoffeeRoom} />
        </motion.div>
      </div>

      {/* Name plate */}
      <div
        className="px-1.5 py-0.5 rounded text-[8px] font-bold leading-none whitespace-nowrap max-w-[80px] truncate"
        style={{
          backgroundColor: 'rgba(0,0,0,0.75)',
          color: member.isOnline ? '#fff' : '#666',
          transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)',
          border: member.isOnline ? `1px solid ${getPalette(member.role, member.gender).accent}44` : '1px solid transparent',
        }}
      >
        {member.name.split(' ')[0]}
      </div>
    </motion.button>
  );
}
