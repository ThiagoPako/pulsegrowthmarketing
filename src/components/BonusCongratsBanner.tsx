import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift } from 'lucide-react';
import { format } from 'date-fns';

interface SalaryBonus {
  id: string;
  user_name: string;
  bonus_amount: number;
  reference_month: string;
}

export default function BonusCongratsBanner() {
  const { user } = useAuth();
  const { currentUser } = useApp();
  const [bonuses, setBonuses] = useState<SalaryBonus[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const currentMonth = format(new Date(), 'yyyy-MM');

  useEffect(() => {
    if (!currentUser?.name) return;

    const fetchBonuses = async () => {
      const { data } = await supabase
        .from('salary_bonuses')
        .select('*')
        .eq('reference_month', currentMonth)
        .eq('user_name', currentUser.name);

      if (data && data.length > 0) {
        setBonuses(data as SalaryBonus[]);
      }
    };

    fetchBonuses();
  }, [currentUser?.name, currentMonth]);

  // Load dismissed from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('dismissed_bonuses');
    if (stored) setDismissed(new Set(JSON.parse(stored)));
  }, []);

  const visibleBonuses = useMemo(
    () => bonuses.filter(b => !dismissed.has(b.id)),
    [bonuses, dismissed]
  );

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    sessionStorage.setItem('dismissed_bonuses', JSON.stringify([...next]));
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (visibleBonuses.length === 0) return null;

  return (
    <AnimatePresence>
      {visibleBonuses.map(bonus => (
        <motion.div
          key={bonus.id}
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="relative overflow-hidden rounded-2xl border border-violet-200/50 dark:border-violet-800/30 shadow-lg"
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-pink-500/10 to-amber-500/10" />
          
          {/* Animated particles */}
          <motion.div
            className="absolute top-2 left-8 text-lg"
            animate={{ y: [0, -8, 0], rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            🎉
          </motion.div>
          <motion.div
            className="absolute top-3 right-16 text-lg"
            animate={{ y: [0, -6, 0], scale: [1, 1.2, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: 0.3 }}
          >
            ⭐
          </motion.div>
          <motion.div
            className="absolute bottom-2 left-1/3 text-lg"
            animate={{ y: [0, -5, 0], rotate: [0, -10, 10, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: 0.6 }}
          >
            🏆
          </motion.div>

          <div className="relative p-4 sm:p-5 flex items-center gap-4">
            {/* Gift icon */}
            <motion.div
              className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-lg shadow-violet-500/30"
              animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Gift size={24} className="text-white" />
            </motion.div>

            <div className="flex-1 min-w-0">
              <motion.h3
                className="text-base sm:text-lg font-bold text-foreground"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                🎉 Parabéns pelo bônus deste mês!
              </motion.h3>
              <motion.p
                className="text-sm text-muted-foreground mt-0.5"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                Você recebeu um bônus de{' '}
                <span className="font-bold text-violet-600 dark:text-violet-400">{fmt(Number(bonus.bonus_amount))}</span>.
                É bom ter você no time! 💪
              </motion.p>
            </div>

            {/* Close button */}
            <button
              onClick={() => handleDismiss(bonus.id)}
              className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
