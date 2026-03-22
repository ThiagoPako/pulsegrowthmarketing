import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CatBurst {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

const CAT_EMOJIS = ['🐱', '😺', '😸', '😻', '🐾', '😽', '🙀', '😹', '😼', '🐈'];

const CatClickContext = createContext<{ triggerCat: (e: React.MouseEvent) => void }>({
  triggerCat: () => {},
});

export function useCatClick() {
  return useContext(CatClickContext);
}

export function CatClickProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<CatBurst[]>([]);

  const triggerCat = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const id = Date.now() + Math.random();
    const emoji = CAT_EMOJIS[Math.floor(Math.random() * CAT_EMOJIS.length)];
    setBursts(prev => [...prev, { id, x, y, emoji }]);
    setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), 1200);
  }, []);

  return (
    <CatClickContext.Provider value={{ triggerCat }}>
      {children}
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        <AnimatePresence>
          {bursts.map(b => (
            <motion.div
              key={b.id}
              className="absolute flex items-center justify-center"
              style={{ left: b.x, top: b.y }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Central cat */}
              <motion.span
                className="text-2xl absolute"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: [0, 1.4, 1], rotate: [-20, 10, 0], y: [0, -30, -50] }}
                exit={{ opacity: 0, scale: 0.5, y: -70 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              >
                {b.emoji}
              </motion.span>
              {/* Paw prints scatter */}
              {[...Array(3)].map((_, i) => {
                const angle = (i * 120 + Math.random() * 40 - 20) * (Math.PI / 180);
                const dist = 25 + Math.random() * 20;
                return (
                  <motion.span
                    key={i}
                    className="text-sm absolute"
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 20,
                      scale: [0, 1, 0.5],
                    }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.05 }}
                  >
                    🐾
                  </motion.span>
                );
              })}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </CatClickContext.Provider>
  );
}
