import React from 'react';
import { motion } from 'framer-motion';
import type { OfficeMember, RoomConfig } from './types';
import RpgCharacter from './RpgCharacter';

/* ────────────── Furniture per room type ─────────────── */
function RoomFurniture({ roomId }: { roomId: string }) {
  switch (roomId) {
    case 'admin':
      return (
        <div className="pointer-events-none absolute bottom-1 left-2 flex items-end gap-1 opacity-40">
          <span className="text-xs">🪑</span>
          <span className="text-sm">🖥️</span>
          <span className="text-xs">📁</span>
        </div>
      );
    case 'studio':
      return (
        <div className="pointer-events-none absolute bottom-1 right-2 flex items-end gap-1 opacity-40">
          <span className="text-xs">💡</span>
          <span className="text-sm">🎥</span>
          <span className="text-xs">🎙️</span>
        </div>
      );
    case 'editing':
      return (
        <div className="pointer-events-none absolute bottom-1 left-2 flex items-end gap-1 opacity-40">
          <span className="text-sm">🖥️</span>
          <span className="text-xs">🎧</span>
          <span className="text-xs">⌨️</span>
        </div>
      );
    case 'atelier':
      return (
        <div className="pointer-events-none absolute bottom-1 right-2 flex items-end gap-1 opacity-40">
          <span className="text-sm">🎨</span>
          <span className="text-xs">🖼️</span>
          <span className="text-xs">✏️</span>
        </div>
      );
    case 'social':
      return (
        <div className="pointer-events-none absolute bottom-1 left-2 flex items-end gap-1 opacity-40">
          <span className="text-sm">💻</span>
          <span className="text-xs">📱</span>
          <span className="text-xs">📊</span>
        </div>
      );
    case 'coffee':
      return (
        <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 flex items-end gap-2 opacity-40">
          <span className="text-xs">🪑</span>
          <span className="text-sm">☕</span>
          <span className="text-xs">🍰</span>
          <span className="text-xs">🪑</span>
        </div>
      );
    default:
      return null;
  }
}

/* ────────────── Floor tile pattern ──────────────────── */
function FloorPattern() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage: `repeating-linear-gradient(
          0deg, transparent, transparent 23px, currentColor 23px, currentColor 24px
        ), repeating-linear-gradient(
          90deg, transparent, transparent 23px, currentColor 23px, currentColor 24px
        )`,
      }}
    />
  );
}

/* ────────────── Room component ─────────────────────── */
interface RpgRoomProps {
  config: RoomConfig;
  members: OfficeMember[];
  onMemberClick: (member: OfficeMember) => void;
  isCoffeeRoom?: boolean;
}

export default function RpgRoom({ config, members, onMemberClick, isCoffeeRoom }: RpgRoomProps) {
  const onlineCount = members.filter(m => m.isOnline).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border-2 ${
        onlineCount > 0
          ? 'border-primary/20 shadow-[0_0_15px_hsl(var(--primary)/0.08)]'
          : 'border-border/50'
      } bg-gradient-to-br ${config.bgClass} backdrop-blur-sm`}
    >
      <FloorPattern />

      {/* Room header */}
      <div className="relative flex items-center justify-between border-b border-border/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{config.emoji}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-foreground/80">
            {config.label}
          </span>
        </div>
        {onlineCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5"
          >
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-green-500"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">
              {onlineCount}
            </span>
          </motion.div>
        )}
      </div>

      {/* Characters area */}
      <div className="relative min-h-[120px] px-2 py-3">
        <RoomFurniture roomId={config.id} />

        {members.length === 0 ? (
          <div className="flex h-20 items-center justify-center">
            <span className="text-xs text-muted-foreground/50 italic">
              {isCoffeeRoom ? 'Ninguém no café' : 'Sala vazia'}
            </span>
          </div>
        ) : (
          <div className="relative flex flex-wrap justify-center gap-1">
            {members.map(member => (
              <RpgCharacter
                key={member.id}
                member={member}
                onClick={() => onMemberClick(member)}
                inCoffeeRoom={isCoffeeRoom}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
