import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';

type CatStatus = 'atrasado' | 'onboarding' | 'em_dia';

interface CatStatusIndicatorProps {
  status: CatStatus;
  size?: 'sm' | 'md' | 'lg';
  showMessage?: boolean;
}

// Pure CSS/SVG animated cats — no external deps
function AngryCat({ size }: { size: number }) {
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
    >
      {/* Cat body */}
      <svg viewBox="0 0 80 80" width={size} height={size}>
        {/* Ears */}
        <polygon points="18,22 12,6 28,18" fill="hsl(var(--destructive))" opacity="0.8" />
        <polygon points="62,22 68,6 52,18" fill="hsl(var(--destructive))" opacity="0.8" />
        <polygon points="20,20 15,9 27,18" fill="hsl(350 80% 75%)" />
        <polygon points="60,20 65,9 53,18" fill="hsl(350 80% 75%)" />
        {/* Head */}
        <ellipse cx="40" cy="34" rx="22" ry="18" fill="hsl(30 30% 65%)" />
        {/* Angry eyes */}
        <motion.g
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
        >
          <ellipse cx="32" cy="32" rx="3.5" ry="4" fill="hsl(var(--destructive))" />
          <ellipse cx="48" cy="32" rx="3.5" ry="4" fill="hsl(var(--destructive))" />
          <circle cx="32" cy="31" r="1.5" fill="white" />
          <circle cx="48" cy="31" r="1.5" fill="white" />
        </motion.g>
        {/* Angry eyebrows */}
        <line x1="26" y1="25" x2="35" y2="27" stroke="hsl(30 30% 40%)" strokeWidth="2" strokeLinecap="round" />
        <line x1="54" y1="25" x2="45" y2="27" stroke="hsl(30 30% 40%)" strokeWidth="2" strokeLinecap="round" />
        {/* Nose */}
        <polygon points="40,36 38,39 42,39" fill="hsl(350 60% 55%)" />
        {/* Mouth - angry */}
        <path d="M35,42 Q40,39 45,42" stroke="hsl(30 30% 40%)" strokeWidth="1.5" fill="none" />
        {/* Whiskers */}
        <line x1="18" y1="36" x2="30" y2="38" stroke="hsl(30 30% 50%)" strokeWidth="0.8" />
        <line x1="18" y1="40" x2="30" y2="40" stroke="hsl(30 30% 50%)" strokeWidth="0.8" />
        <line x1="50" y1="38" x2="62" y2="36" stroke="hsl(30 30% 50%)" strokeWidth="0.8" />
        <line x1="50" y1="40" x2="62" y2="40" stroke="hsl(30 30% 50%)" strokeWidth="0.8" />
        {/* Body */}
        <ellipse cx="40" cy="58" rx="16" ry="14" fill="hsl(30 30% 65%)" />
        {/* Tail */}
        <motion.path
          d="M56,58 Q72,50 68,38"
          stroke="hsl(30 30% 55%)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          animate={{ d: ["M56,58 Q72,50 68,38", "M56,58 Q74,55 70,42", "M56,58 Q72,50 68,38"] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      </svg>
      {/* Knocking paw */}
      <motion.div
        className="absolute -left-1"
        style={{ top: size * 0.55 }}
        animate={{ x: [0, -6, 0], rotate: [0, -15, 0] }}
        transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 0.3 }}
      >
        <svg viewBox="0 0 20 20" width={size * 0.3} height={size * 0.3}>
          <ellipse cx="10" cy="12" rx="7" ry="5" fill="hsl(30 30% 60%)" />
          <circle cx="6" cy="11" r="2" fill="hsl(30 30% 70%)" />
          <circle cx="10" cy="9" r="2" fill="hsl(30 30% 70%)" />
          <circle cx="14" cy="11" r="2" fill="hsl(30 30% 70%)" />
          <circle cx="10" cy="14" r="3" fill="hsl(350 50% 70%)" opacity="0.6" />
        </svg>
      </motion.div>
    </motion.div>
  );
}

function SailorCat({ size }: { size: number }) {
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={{ rotate: [-3, 3, -3] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 80 80" width={size} height={size}>
        {/* Ears */}
        <polygon points="18,22 14,8 28,18" fill="hsl(30 40% 70%)" />
        <polygon points="62,22 66,8 52,18" fill="hsl(30 40% 70%)" />
        <polygon points="20,20 16,10 27,18" fill="hsl(350 60% 80%)" />
        <polygon points="60,20 64,10 53,18" fill="hsl(350 60% 80%)" />
        {/* Sailor hat */}
        <ellipse cx="40" cy="16" rx="20" ry="6" fill="hsl(220 70% 50%)" />
        <rect x="24" y="8" width="32" height="10" rx="3" fill="white" />
        <rect x="24" y="8" width="32" height="3" fill="hsl(220 70% 50%)" />
        <circle cx="40" cy="12" r="3" fill="hsl(45 90% 55%)" />
        {/* Head */}
        <ellipse cx="40" cy="34" rx="22" ry="18" fill="hsl(30 40% 75%)" />
        {/* Eyes - happy */}
        <motion.g
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, repeatDelay: 3 }}
        >
          <ellipse cx="32" cy="32" rx="3" ry="3.5" fill="hsl(220 60% 35%)" />
          <ellipse cx="48" cy="32" rx="3" ry="3.5" fill="hsl(220 60% 35%)" />
          <circle cx="33" cy="31" r="1.2" fill="white" />
          <circle cx="49" cy="31" r="1.2" fill="white" />
        </motion.g>
        {/* Nose */}
        <polygon points="40,37 38,40 42,40" fill="hsl(350 60% 60%)" />
        {/* Mouth - happy */}
        <path d="M35,42 Q40,46 45,42" stroke="hsl(30 30% 45%)" strokeWidth="1.5" fill="none" />
        {/* Whiskers */}
        <line x1="18" y1="37" x2="30" y2="39" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        <line x1="18" y1="41" x2="30" y2="41" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        <line x1="50" y1="39" x2="62" y2="37" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        <line x1="50" y1="41" x2="62" y2="41" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        {/* Body with sailor stripe */}
        <ellipse cx="40" cy="58" rx="16" ry="14" fill="white" />
        <rect x="28" y="52" width="24" height="3" fill="hsl(220 70% 50%)" rx="1" />
        <rect x="30" y="58" width="20" height="3" fill="hsl(220 70% 50%)" rx="1" />
        {/* Compass in paw */}
        <motion.g
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '62px 60px' }}
        >
          <circle cx="62" cy="60" r="5" fill="hsl(45 80% 85%)" stroke="hsl(45 80% 50%)" strokeWidth="1" />
          <line x1="62" y1="56" x2="62" y2="60" stroke="hsl(var(--destructive))" strokeWidth="1.5" />
          <line x1="62" y1="60" x2="62" y2="64" stroke="hsl(220 70% 50%)" strokeWidth="1" />
        </motion.g>
        {/* Tail */}
        <motion.path
          d="M56,60 Q68,54 64,44"
          stroke="hsl(30 40% 65%)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          animate={{ d: ["M56,60 Q68,54 64,44", "M56,60 Q70,58 66,48", "M56,60 Q68,54 64,44"] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>
    </motion.div>
  );
}

function RelaxedCat({ size }: { size: number }) {
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 80 80" width={size} height={size}>
        {/* Ears */}
        <polygon points="18,24 14,10 28,20" fill="hsl(30 35% 68%)" />
        <polygon points="62,24 66,10 52,20" fill="hsl(30 35% 68%)" />
        <polygon points="20,22 16,12 27,20" fill="hsl(350 55% 78%)" />
        <polygon points="60,22 64,12 53,20" fill="hsl(350 55% 78%)" />
        {/* Head */}
        <ellipse cx="40" cy="34" rx="22" ry="18" fill="hsl(30 35% 72%)" />
        {/* Eyes - sleepy/happy */}
        <motion.g
          animate={{ scaleY: [1, 0.15, 0.15, 1] }}
          transition={{ duration: 5, repeat: Infinity, times: [0, 0.1, 0.4, 0.5] }}
        >
          <path d="M28,31 Q32,28 36,31" stroke="hsl(30 30% 40%)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M44,31 Q48,28 52,31" stroke="hsl(30 30% 40%)" strokeWidth="2" fill="none" strokeLinecap="round" />
        </motion.g>
        {/* Blush */}
        <circle cx="26" cy="37" r="4" fill="hsl(350 60% 75%)" opacity="0.4" />
        <circle cx="54" cy="37" r="4" fill="hsl(350 60% 75%)" opacity="0.4" />
        {/* Nose */}
        <polygon points="40,37 38,40 42,40" fill="hsl(350 55% 58%)" />
        {/* Mouth - content smile */}
        <path d="M36,42 Q40,46 44,42" stroke="hsl(30 30% 45%)" strokeWidth="1.5" fill="none" />
        {/* Whiskers */}
        <line x1="18" y1="37" x2="30" y2="39" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        <line x1="18" y1="41" x2="30" y2="40" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        <line x1="50" y1="39" x2="62" y2="37" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        <line x1="50" y1="40" x2="62" y2="41" stroke="hsl(30 30% 55%)" strokeWidth="0.8" />
        {/* Body - lying down */}
        <ellipse cx="40" cy="60" rx="20" ry="12" fill="hsl(30 35% 72%)" />
        {/* Milk bowl */}
        <ellipse cx="20" cy="68" rx="10" ry="5" fill="hsl(30 20% 85%)" />
        <ellipse cx="20" cy="66" rx="8" ry="3" fill="white" />
        {/* Tongue licking */}
        <motion.ellipse
          cx="28"
          cy="65"
          rx="3"
          ry="1.5"
          fill="hsl(350 60% 65%)"
          animate={{ 
            cx: [28, 24, 28],
            ry: [1.5, 2, 1.5],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }}
        />
        {/* Paws */}
        <ellipse cx="28" cy="68" rx="5" ry="3" fill="hsl(30 35% 68%)" />
        <ellipse cx="52" cy="68" rx="5" ry="3" fill="hsl(30 35% 68%)" />
        {/* Tail */}
        <motion.path
          d="M58,56 Q70,52 72,44"
          stroke="hsl(30 35% 62%)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          animate={{ d: ["M58,56 Q70,52 72,44", "M58,56 Q72,54 74,46", "M58,56 Q70,52 72,44"] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Purr effect */}
        <motion.text
          x="54"
          y="50"
          fontSize="8"
          fill="hsl(var(--muted-foreground))"
          opacity="0.6"
          animate={{ opacity: [0, 0.6, 0], y: [50, 46, 42] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
        >
          zzz
        </motion.text>
      </svg>
    </motion.div>
  );
}

const MESSAGES: Record<CatStatus, string> = {
  atrasado: '😾 Miau! Prazo vencido!',
  onboarding: '⛵ Bem-vindo a bordo!',
  em_dia: '😺 Tudo certo! 🥛',
};

const SIZE_MAP = { sm: 40, md: 56, lg: 72 };

export default function CatStatusIndicator({ status, size = 'sm', showMessage = true }: CatStatusIndicatorProps) {
  const px = SIZE_MAP[size];

  const CatComponent = useMemo(() => {
    switch (status) {
      case 'atrasado': return AngryCat;
      case 'onboarding': return SailorCat;
      case 'em_dia': return RelaxedCat;
    }
  }, [status]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        className="flex flex-col items-center gap-0.5"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={{ duration: 0.4, type: 'spring' }}
      >
        <CatComponent size={px} />
        {showMessage && (
          <motion.span
            className="text-[9px] font-medium text-muted-foreground text-center leading-tight max-w-[80px]"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {MESSAGES[status]}
          </motion.span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function getCatStatus(opts: { hasOverdue: boolean; isOnboarding: boolean }): CatStatus {
  if (opts.hasOverdue) return 'atrasado';
  if (opts.isOnboarding) return 'onboarding';
  return 'em_dia';
}
