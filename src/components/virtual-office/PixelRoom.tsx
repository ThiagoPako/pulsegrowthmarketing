import React from 'react';
import { motion } from 'framer-motion';
import type { OfficeMember, RoomConfig } from './types';
import PixelCharacter from './PixelCharacter';

/* ── Pixel furniture per room ── */
function RoomDecor({ id }: { id: string }) {
  if (id === 'admin') return (
    <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between pointer-events-none select-none opacity-40">
      {/* Filing cabinet */}
      <div style={{ width: 10, height: 18, backgroundColor: '#4a4a50', borderRadius: 1, border: '1px solid #5a5a60' }}>
        <div style={{ width: 4, height: 1, backgroundColor: '#888', position: 'absolute', top: 4, left: 3 }} />
        <div style={{ width: 4, height: 1, backgroundColor: '#888', position: 'absolute', top: 10, left: 3 }} />
      </div>
      {/* Plant */}
      <div className="relative" style={{ width: 12, height: 16 }}>
        <div style={{ width: 8, height: 6, backgroundColor: '#6b4423', borderRadius: '0 0 2px 2px', position: 'absolute', bottom: 0, left: 2 }} />
        <motion.div animate={{ rotate: [-2, 2, -2] }} transition={{ duration: 4, repeat: Infinity }}
          style={{ width: 10, height: 10, backgroundColor: '#22c55e', borderRadius: '50%', position: 'absolute', top: 0, left: 1, opacity: 0.8 }} />
      </div>
      {/* Water cooler */}
      <div style={{ width: 8, height: 16 }}>
        <div style={{ width: 6, height: 8, backgroundColor: '#93c5fd', borderRadius: '3px 3px 0 0', position: 'absolute', bottom: 8, right: 2, opacity: 0.6 }} />
        <div style={{ width: 8, height: 8, backgroundColor: '#e5e7eb', borderRadius: 1, position: 'absolute', bottom: 0, right: 1 }} />
      </div>
    </div>
  );

  if (id === 'studio') return (
    <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between pointer-events-none select-none opacity-40">
      {/* Softbox light */}
      <div className="relative" style={{ width: 8, height: 22 }}>
        <div style={{ width: 2, height: 16, backgroundColor: '#555', position: 'absolute', bottom: 0, left: 3 }} />
        <motion.div animate={{ opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
          style={{ width: 8, height: 6, backgroundColor: '#fef3c7', borderRadius: 1, position: 'absolute', top: 0, left: 0, boxShadow: '0 0 8px #fde68a' }} />
      </div>
      {/* Green screen */}
      <div style={{ width: 20, height: 20, backgroundColor: '#16a34a', borderRadius: 1, opacity: 0.5 }} />
      {/* Another light */}
      <div className="relative" style={{ width: 8, height: 22 }}>
        <div style={{ width: 2, height: 16, backgroundColor: '#555', position: 'absolute', bottom: 0, left: 3 }} />
        <motion.div animate={{ opacity: [0.6, 0.9, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }}
          style={{ width: 8, height: 6, backgroundColor: '#fef3c7', borderRadius: 1, position: 'absolute', top: 0, left: 0, boxShadow: '0 0 8px #fde68a' }} />
      </div>
    </div>
  );

  if (id === 'editing') return (
    <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between pointer-events-none select-none opacity-30">
      {/* Headphones */}
      <div className="relative" style={{ width: 10, height: 10 }}>
        <div style={{ width: 10, height: 6, border: '2px solid #555', borderBottom: 'none', borderRadius: '5px 5px 0 0', position: 'absolute', top: 0 }} />
        <div style={{ width: 3, height: 4, backgroundColor: '#444', borderRadius: 1, position: 'absolute', bottom: 0, left: 0 }} />
        <div style={{ width: 3, height: 4, backgroundColor: '#444', borderRadius: 1, position: 'absolute', bottom: 0, right: 0 }} />
      </div>
      {/* Sound wave decoration */}
      <div className="flex items-end gap-0.5" style={{ height: 14 }}>
        {[6, 10, 14, 8, 12, 6, 10].map((h, i) => (
          <motion.div key={i}
            animate={{ height: [h, h * 0.5, h] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
            style={{ width: 2, backgroundColor: '#6366f1', borderRadius: 1, opacity: 0.6 }}
          />
        ))}
      </div>
      {/* USB drive */}
      <div style={{ width: 6, height: 3, backgroundColor: '#555', borderRadius: 1 }} />
    </div>
  );

  if (id === 'atelier') return (
    <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between pointer-events-none select-none opacity-40">
      {/* Paint tubes */}
      <div className="flex gap-0.5 items-end">
        {['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7'].map((c, i) => (
          <div key={i} style={{ width: 3, height: 8 + i * 2, backgroundColor: c, borderRadius: 1 }} />
        ))}
      </div>
      {/* Pen holder */}
      <div style={{ width: 10, height: 12, backgroundColor: '#8B6914', borderRadius: '0 0 2px 2px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 1, height: 6, backgroundColor: '#888', position: 'absolute', top: -4, left: 2 + i * 3 }} />
        ))}
      </div>
    </div>
  );

  if (id === 'social') return (
    <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between pointer-events-none select-none opacity-30">
      {/* Phone stand */}
      <div style={{ width: 8, height: 14 }}>
        <div style={{ width: 6, height: 10, backgroundColor: '#1f2937', borderRadius: 2, border: '1px solid #374151', position: 'absolute', bottom: 3, left: 1 }}>
          <div style={{ width: 4, height: 7, backgroundColor: '#065f46', borderRadius: 1, position: 'absolute', top: 1, left: 0.5 }} />
        </div>
        <div style={{ width: 8, height: 3, backgroundColor: '#555', borderRadius: 1, position: 'absolute', bottom: 0 }} />
      </div>
      {/* Cat bed */}
      <div style={{ width: 14, height: 4, backgroundColor: '#92400e', borderRadius: '4px 4px 2px 2px', opacity: 0.5 }} />
    </div>
  );

  if (id === 'coffee') return (
    <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between pointer-events-none select-none opacity-35">
      {/* Coffee machine */}
      <div style={{ width: 14, height: 18, backgroundColor: '#78350f', borderRadius: 2 }}>
        <div style={{ width: 10, height: 4, backgroundColor: '#451a03', borderRadius: 1, position: 'absolute', top: 3, left: 2 }} />
        <motion.div animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 3, repeat: Infinity }}
          style={{ width: 2, height: 2, backgroundColor: '#22c55e', borderRadius: '50%', position: 'absolute', top: 2, right: 2 }} />
      </div>
      {/* Table */}
      <div style={{ width: 24, height: 10, backgroundColor: '#8B6914', borderRadius: 2, position: 'relative' }}>
        <div style={{ width: 4, height: 8, backgroundColor: '#6b4f10', position: 'absolute', bottom: -8, left: 2 }} />
        <div style={{ width: 4, height: 8, backgroundColor: '#6b4f10', position: 'absolute', bottom: -8, right: 2 }} />
      </div>
      {/* Cookies plate */}
      <div style={{ width: 10, height: 3, backgroundColor: '#f5f5dc', borderRadius: '50%' }}>
        <div style={{ width: 3, height: 3, backgroundColor: '#d97706', borderRadius: '50%', position: 'absolute', top: -1, left: 2 }} />
        <div style={{ width: 3, height: 3, backgroundColor: '#b45309', borderRadius: '50%', position: 'absolute', top: -1, right: 2 }} />
      </div>
    </div>
  );

  if (id === 'projetos') return (
    <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between pointer-events-none select-none opacity-45">
      {/* Espelho camarim com lâmpadas */}
      <div className="relative" style={{ width: 18, height: 26 }}>
        {/* Moldura do espelho */}
        <div style={{
          width: 16, height: 18, backgroundColor: '#d4a5d4',
          border: '2px solid #a06aa0', borderRadius: 3,
          position: 'absolute', top: 0, left: 1,
        }}>
          {/* Reflexo */}
          <div style={{
            position: 'absolute', inset: 2,
            background: 'linear-gradient(135deg, #f0e0f5 0%, #d0c0d5 100%)',
            borderRadius: 2,
          }} />
        </div>
        {/* Lâmpadas do camarim */}
        {[0, 1, 2].map(i => (
          <motion.div key={`top-${i}`}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
            style={{
              width: 3, height: 3, backgroundColor: '#fef3c7',
              borderRadius: '50%', position: 'absolute',
              top: -2, left: 2 + i * 5,
              boxShadow: '0 0 4px #fde68a',
            }}
          />
        ))}
        {[0, 1].map(i => (
          <motion.div key={`side-${i}`}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 + i * 0.4 }}
            style={{
              width: 3, height: 3, backgroundColor: '#fef3c7',
              borderRadius: '50%', position: 'absolute',
              top: 4 + i * 8, left: -2,
              boxShadow: '0 0 4px #fde68a',
            }}
          />
        ))}
        {/* Penteadeira (mesa embaixo) */}
        <div style={{
          width: 18, height: 6, backgroundColor: '#8b5a8b',
          borderRadius: '2px 2px 0 0',
          position: 'absolute', bottom: 2, left: 0,
          boxShadow: 'inset 0 -1px 0 #6a3a6a',
        }}>
          {/* Frascos de perfume */}
          <div style={{ width: 2, height: 3, backgroundColor: '#ec4899', position: 'absolute', top: -3, left: 3, borderRadius: 1 }} />
          <div style={{ width: 2, height: 4, backgroundColor: '#c084fc', position: 'absolute', top: -4, left: 7, borderRadius: 1 }} />
          <div style={{ width: 2, height: 3, backgroundColor: '#fde047', position: 'absolute', top: -3, left: 11, borderRadius: 1 }} />
        </div>
        {/* Perninhas */}
        <div style={{ width: 2, height: 2, backgroundColor: '#6a3a6a', position: 'absolute', bottom: 0, left: 1 }} />
        <div style={{ width: 2, height: 2, backgroundColor: '#6a3a6a', position: 'absolute', bottom: 0, right: 1 }} />
      </div>
      {/* Quadro de gestão / kanban */}
      <div style={{ width: 20, height: 16, backgroundColor: '#1f1235', border: '1px solid #4c1d95', borderRadius: 1, position: 'relative' }}>
        {[0, 1, 2].map(col => (
          <div key={col} style={{
            position: 'absolute', top: 2, left: 2 + col * 6,
            width: 4, height: 12, backgroundColor: '#2e1b4d', borderRadius: 1,
          }}>
            {[0, 1, 2].map(row => (
              <motion.div key={row}
                animate={{ opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, delay: col * 0.4 + row * 0.2 }}
                style={{
                  width: 3, height: 1.5,
                  backgroundColor: ['#f472b6', '#c084fc', '#a78bfa'][col],
                  position: 'absolute', top: 1 + row * 3, left: 0.5, borderRadius: 0.5,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Planta decorativa */}
      <div className="relative" style={{ width: 10, height: 14 }}>
        <div style={{ width: 6, height: 5, backgroundColor: '#6b4423', borderRadius: '0 0 2px 2px', position: 'absolute', bottom: 0, left: 2 }} />
        <motion.div animate={{ rotate: [-3, 3, -3] }} transition={{ duration: 3.5, repeat: Infinity }}
          style={{ width: 8, height: 9, backgroundColor: '#22c55e', borderRadius: '50%', position: 'absolute', top: 0, left: 1, opacity: 0.8 }} />
      </div>
    </div>
  );

  return null;
}

/* ── Pixel tile floor pattern ── */
const tileCSS = (color: string) => ({
  backgroundColor: color,
  backgroundImage: `
    linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%)
  `,
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
});

/* ── Room component ── */
interface Props {
  config: RoomConfig;
  members: OfficeMember[];
  onMemberClick: (m: OfficeMember) => void;
  isCoffeeRoom?: boolean;
  joinedIds?: Set<string>;
}

export default function PixelRoom({ config, members, onMemberClick, isCoffeeRoom, joinedIds }: Props) {
  const onlineCount = members.filter(m => m.isOnline).length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden"
      style={{
        ...tileCSS(config.floorColor),
        border: `4px solid ${config.wallColor}`,
        boxShadow: `inset 0 0 0 2px ${config.wallColor}44, 0 3px 0 ${config.wallColor}88`,
        borderRadius: 8,
        imageRendering: 'pixelated' as any,
      }}
    >
      {/* Wall texture at top */}
      <div className="absolute top-0 left-0 right-0 h-8 pointer-events-none" style={{
        background: `linear-gradient(180deg, ${config.wallColor}66 0%, transparent 100%)`,
      }} />

      <RoomDecor id={config.id} />

      {/* Room header */}
      <div
        className="relative flex items-center justify-between px-2.5 py-1.5 z-10"
        style={{ backgroundColor: `${config.wallColor}dd`, borderBottom: `2px solid ${config.wallColor}` }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{config.emoji}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#e5d5b5' }}>
            {config.label}
          </span>
        </div>
        {onlineCount > 0 && (
          <div className="flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ backgroundColor: 'rgba(34,197,94,0.25)' }}>
            <motion.span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#22c55e' }}
              animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
            <span className="text-[9px] font-bold" style={{ color: '#86efac' }}>{onlineCount}</span>
          </div>
        )}
      </div>

      {/* Characters area */}
      <div className="relative min-h-[130px] px-1 py-3">
        {members.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <span className="text-[10px] italic" style={{ color: '#888' }}>
              {isCoffeeRoom ? '☕ Ninguém no café' : 'Sala vazia'}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-1">
            {members.map(m => (
              <PixelCharacter key={m.id} member={m} onClick={() => onMemberClick(m)} inCoffeeRoom={isCoffeeRoom} justJoined={joinedIds?.has(m.id)} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
