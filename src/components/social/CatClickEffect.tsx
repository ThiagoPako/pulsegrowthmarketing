import { useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CatBurst {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

const CAT_EMOJIS = ['🐱', '😺', '😸', '😻', '🐾', '😽', '🙀', '😹', '😼', '🐈'];

export default function CatClickWrapper({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<CatBurst[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button, [role="button"]');
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const id = Date.now() + Math.random();
    const emoji = CAT_EMOJIS[Math.floor(Math.random() * CAT_EMOJIS.length)];
    setBursts(prev => [...prev, { id, x, y, emoji }]);
    setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), 1200);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('click', handleClick, true);
    return () => el.removeEventListener('click', handleClick, true);
  }, [handleClick]);

  return (
    <div ref={containerRef} className="contents">
      {children}
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        <AnimatePresence>
          {bursts.map(b => (
            <motion.div
              key={b.id}
              className="absolute"
              style={{ left: b.x, top: b.y }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.span
                className="text-2xl absolute -translate-x-1/2 -translate-y-1/2"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: [0, 1.5, 1], rotate: [-20, 10, 0], y: [0, -35, -55] }}
                exit={{ opacity: 0, scale: 0.3, y: -70 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              >
                {b.emoji}
              </motion.span>
              {[0, 1, 2].map(i => {
                const angle = (i * 120 + Math.random() * 40 - 20) * (Math.PI / 180);
                const dist = 25 + Math.random() * 20;
                return (
                  <motion.span
                    key={i}
                    className="text-xs absolute -translate-x-1/2 -translate-y-1/2"
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 20,
                      scale: [0, 1, 0.5],
                    }}
                    transition={{ duration: 0.7, delay: 0.08 + i * 0.05 }}
                  >
                    🐾
                  </motion.span>
                );
              })}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
