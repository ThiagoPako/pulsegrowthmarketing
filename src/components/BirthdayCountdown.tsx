import { useBirthdays } from '@/hooks/useBirthdays';
import { ROLE_LABELS } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Cake, PartyPopper, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import UserAvatar from '@/components/UserAvatar';

export default function BirthdayCountdown() {
  const { upcoming, loading } = useBirthdays();

  if (loading || upcoming.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Cake size={18} className="text-primary" />
        </motion.div>
        <h3 className="text-sm font-bold text-foreground">Aniversários da Semana</h3>
      </div>

      <div className="space-y-2.5">
        <AnimatePresence>
          {upcoming.map((person, i) => {
            const isToday = person.daysUntil === 0;

            return (
              <motion.div
                key={person.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${
                  isToday
                    ? 'bg-primary/10 border border-primary/30 shadow-sm'
                    : 'bg-muted/30 border border-border/50 hover:bg-muted/50'
                }`}
              >
                <UserAvatar
                  user={{
                    name: person.display_name || person.name,
                    avatarUrl: person.avatar_url || undefined,
                  }}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {person.display_name || person.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {ROLE_LABELS[person.role] || person.role} · {format(person.birthdayThisYear, "dd 'de' MMM", { locale: ptBR })}
                  </p>
                </div>

                {isToday ? (
                  <motion.div
                    className="flex items-center gap-1 bg-primary text-primary-foreground px-2.5 py-1 rounded-full"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <PartyPopper size={12} />
                    <span className="text-[10px] font-bold">HOJE!</span>
                  </motion.div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="text-center">
                      <motion.p
                        className="text-lg font-bold text-primary leading-none"
                        animate={person.daysUntil <= 2 ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        {person.daysUntil}
                      </motion.p>
                      <p className="text-[9px] text-muted-foreground">{person.daysUntil === 1 ? 'dia' : 'dias'}</p>
                    </div>
                    <Gift size={14} className="text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
