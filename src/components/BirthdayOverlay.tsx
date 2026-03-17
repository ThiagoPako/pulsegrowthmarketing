import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBirthdays, type UpcomingBirthday } from '@/hooks/useBirthdays';
import { X, Cake, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppRole } from '@/hooks/useAuth';

/* ── Role-themed floating elements ── */
const ROLE_THEMES: Record<string, { emoji: string[]; bgGradient: string; title: string }> = {
  editor: {
    emoji: ['🎬', '✂️', '🎞️', '🎥', '🎚️', '🖥️', '📹', '🎛️'],
    bgGradient: 'from-emerald-500/10 via-transparent to-emerald-500/5',
    title: '🎬 Feliz Aniversário, mestre da edição!',
  },
  social_media: {
    emoji: ['🐱', '😺', '😸', '🐾', '🧶', '🐈', '😻', '🎀'],
    bgGradient: 'from-pink-500/10 via-transparent to-pink-500/5',
    title: '🐱 Miau! Feliz Aniversário, gatinho(a)!',
  },
  videomaker: {
    emoji: ['🎥', '📸', '🎬', '🎞️', '📽️', '🎦', '🏆', '⭐'],
    bgGradient: 'from-blue-500/10 via-transparent to-blue-500/5',
    title: '🎥 Feliz Aniversário, craque das câmeras!',
  },
  admin: {
    emoji: ['👑', '🏢', '💼', '🚀', '⭐', '🎯', '💎', '🌟'],
    bgGradient: 'from-amber-500/10 via-transparent to-amber-500/5',
    title: '👑 Feliz Aniversário, chefe!',
  },
  designer: {
    emoji: ['🎨', '🖌️', '✏️', '🖼️', '🎭', '💡', '🌈', '✨'],
    bgGradient: 'from-orange-500/10 via-transparent to-orange-500/5',
    title: '🎨 Feliz Aniversário, artista!',
  },
  fotografo: {
    emoji: ['📷', '📸', '🖼️', '🌅', '🏞️', '🎞️', '💫', '✨'],
    bgGradient: 'from-violet-500/10 via-transparent to-violet-500/5',
    title: '📷 Feliz Aniversário, fotógrafo(a)!',
  },
  endomarketing: {
    emoji: ['📢', '🎉', '🎊', '🎈', '🎁', '💝', '🥳', '🪅'],
    bgGradient: 'from-cyan-500/10 via-transparent to-cyan-500/5',
    title: '📢 Feliz Aniversário, mestre do marketing!',
  },
  parceiro: {
    emoji: ['🤝', '⭐', '🎯', '🏅', '💪', '🎉', '🥳', '🎊'],
    bgGradient: 'from-purple-500/10 via-transparent to-purple-500/5',
    title: '🤝 Feliz Aniversário, parceiro(a)!',
  },
};

function FloatingEmoji({ emoji, delay, duration, left }: { emoji: string; delay: number; duration: number; left: number }) {
  return (
    <motion.div
      className="fixed text-2xl sm:text-3xl pointer-events-none z-[60]"
      style={{ left: `${left}%` }}
      initial={{ bottom: -40, opacity: 0, rotate: 0 }}
      animate={{
        bottom: ['0%', '110%'],
        opacity: [0, 1, 1, 0],
        rotate: [0, Math.random() * 60 - 30],
        x: [0, Math.random() * 100 - 50],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        repeatDelay: Math.random() * 3 + 2,
        ease: 'easeOut',
      }}
    >
      {emoji}
    </motion.div>
  );
}

function BirthdayBanner({ person, onClose }: { person: UpcomingBirthday; onClose: () => void }) {
  const theme = ROLE_THEMES[person.role] || ROLE_THEMES.admin;

  // Generate floating emojis
  const floatingEmojis = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      emoji: theme.emoji[i % theme.emoji.length],
      delay: Math.random() * 5,
      duration: 6 + Math.random() * 4,
      left: Math.random() * 100,
    }));
  }, [theme.emoji]);

  return (
    <motion.div
      className={`fixed inset-0 z-[55] pointer-events-none bg-gradient-to-b ${theme.bgGradient}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Floating emojis */}
      {floatingEmojis.map(e => (
        <FloatingEmoji key={e.id} {...e} />
      ))}

      {/* Top banner */}
      <motion.div
        className="pointer-events-auto fixed top-0 left-0 right-0 z-[65]"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', bounce: 0.4, delay: 0.3 }}
      >
        <div className="bg-gradient-to-r from-primary/90 via-primary to-primary/90 text-primary-foreground py-3 px-4 flex items-center justify-center gap-3 shadow-lg">
          <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}>
            <PartyPopper size={22} />
          </motion.div>
          <div className="text-center">
            <p className="text-sm font-bold">{theme.title}</p>
            <p className="text-xs opacity-90">
              🎂 Hoje é aniversário de <strong>{person.display_name || person.name}</strong>! 🎂
            </p>
          </div>
          <motion.div animate={{ rotate: [0, -15, 15, 0] }} transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}>
            <Cake size={22} />
          </motion.div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function BirthdayOverlay() {
  const { todayBirthdays } = useBirthdays();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Check localStorage to not show again today
  useEffect(() => {
    const stored = localStorage.getItem('birthday_dismissed_today');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.date === new Date().toDateString()) {
          setDismissed(new Set(parsed.ids));
        }
      } catch {}
    }
  }, []);

  const handleDismiss = (id: string) => {
    const newDismissed = new Set(dismissed);
    newDismissed.add(id);
    setDismissed(newDismissed);
    localStorage.setItem('birthday_dismissed_today', JSON.stringify({
      date: new Date().toDateString(),
      ids: Array.from(newDismissed),
    }));
  };

  const activeBirthday = todayBirthdays.find(b => !dismissed.has(b.id));

  return (
    <AnimatePresence>
      {activeBirthday && (
        <BirthdayBanner
          key={activeBirthday.id}
          person={activeBirthday}
          onClose={() => handleDismiss(activeBirthday.id)}
        />
      )}
    </AnimatePresence>
  );
}
