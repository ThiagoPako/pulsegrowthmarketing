import React from 'react';
import { motion } from 'framer-motion';
import type { OfficeMember, RoomConfig } from './types';
import PixelCharacter from './PixelCharacter';

/* ── Furniture per room ── */
function Furniture({ id }: { id: string }) {
  const items: Record<string, React.ReactNode> = {
    admin: <><span>🪑</span><span>🖥️</span><span>📁</span><span>📋</span></>,
    studio: <><span>💡</span><span>🎥</span><span>🎙️</span><span>🟩</span></>,
    editing: <><span>🖥️</span><span>🎧</span><span>⌨️</span><span>🖥️</span></>,
    atelier: <><span>🎨</span><span>🖼️</span><span>✏️</span><span>🎭</span></>,
    social: <><span>💻</span><span>📱</span><span>📊</span><span>🪴</span></>,
    coffee: <><span>☕</span><span>🍰</span><span>🪑</span><span>🪑</span><span>☕</span></>,
    photo: <><span>📷</span><span>💡</span><span>🖼️</span></>,
    endomarketing: <><span>📣</span><span>📋</span><span>🖥️</span></>,
  };
  return (
    <div className="absolute bottom-1 left-2 right-2 flex items-end justify-between gap-1 opacity-30 text-xs pointer-events-none select-none">
      {items[id] ?? null}
    </div>
  );
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
      <Furniture id={config.id} />

      {/* Room header */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{ backgroundColor: `${config.wallColor}cc`, borderBottom: `2px solid ${config.wallColor}` }}
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
      <div className="relative min-h-[110px] px-1 py-2">
        {members.length === 0 ? (
          <div className="flex h-20 items-center justify-center">
            <span className="text-[10px] italic" style={{ color: '#888' }}>
              {isCoffeeRoom ? '☕ Ninguém no café' : 'Sala vazia'}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-0.5">
            {members.map(m => (
              <PixelCharacter key={m.id} member={m} onClick={() => onMemberClick(m)} inCoffeeRoom={isCoffeeRoom} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
