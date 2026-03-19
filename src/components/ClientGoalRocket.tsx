import { useState, useEffect, useMemo } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { supabase } from '@/lib/vpsDb';
import { Rocket, Flame, Target, Users, Pencil, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  currentClients: number;
}

export default function ClientGoalRocket({ currentClients }: Props) {
  const [goalTarget, setGoalTarget] = useState<number>(30);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Fetch or create client goal
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('type', 'clientes')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setGoalTarget(data[0].target_value);
        setGoalId(data[0].id);
      }
      setLoaded(true);
    })();
  }, []);

  // Update current_value on goal when clients change
  useEffect(() => {
    if (goalId && loaded) {
      supabase.from('goals').update({ current_value: currentClients }).eq('id', goalId).then();
    }
  }, [currentClients, goalId, loaded]);

  const percentage = useMemo(() => {
    if (goalTarget <= 0) return 0;
    return Math.min((currentClients / goalTarget) * 100, 100);
  }, [currentClients, goalTarget]);

  const springPercentage = useSpring(0, { stiffness: 60, damping: 20 });

  useEffect(() => {
    if (loaded) springPercentage.set(percentage);
  }, [percentage, loaded]);

  const rocketLeft = useTransform(springPercentage, [0, 100], [0, 100]);

  // Fire intensity based on proximity to goal
  const fireIntensity = percentage >= 90 ? 3 : percentage >= 60 ? 2 : percentage >= 30 ? 1 : 0;

  const handleSaveGoal = async () => {
    const val = parseInt(editValue);
    if (isNaN(val) || val <= 0) {
      toast.error('Digite um valor válido');
      return;
    }

    if (goalId) {
      await supabase.from('goals').update({ target_value: val }).eq('id', goalId);
    } else {
      const { data } = await supabase.from('goals').insert({
        title: 'Meta de Clientes Ativos',
        type: 'clientes',
        target_value: val,
        current_value: currentClients,
        period: 'mensal',
        status: 'em_andamento',
      }).select().single();
      if (data) setGoalId(data.id);
    }

    setGoalTarget(val);
    setEditing(false);
    toast.success('Meta atualizada!');
  };

  if (!loaded) return null;

  const reached = currentClients >= goalTarget;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card p-5 relative overflow-hidden"
    >
      {/* Background glow when close to goal */}
      {percentage >= 80 && (
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-amber-500/10 to-red-500/5 pointer-events-none" />
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Target size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">Meta de Clientes Ativos</h3>
              <p className="text-[11px] text-muted-foreground">Acompanhe o crescimento da agência</p>
            </div>
          </div>

          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                className="w-20 h-8 text-sm"
                min={1}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveGoal()}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveGoal}>
                <Check size={14} className="text-emerald-500" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)}>
                <X size={14} />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setEditValue(String(goalTarget)); setEditing(true); }}
            >
              <Pencil size={12} /> Editar meta
            </Button>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 mb-5">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <div>
              <p className="text-2xl font-display font-bold leading-none">{currentClients}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Ativos</p>
            </div>
          </div>
          <div className="text-muted-foreground text-lg font-light">/</div>
          <div>
            <p className="text-2xl font-display font-bold leading-none text-muted-foreground">{goalTarget}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Meta</p>
          </div>
          <div className="ml-auto">
            <motion.p
              className={`text-xl font-display font-bold ${reached ? 'text-emerald-500' : percentage >= 70 ? 'text-amber-500' : 'text-primary'}`}
              key={percentage}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              {percentage.toFixed(0)}%
            </motion.p>
          </div>
        </div>

        {/* Rocket Progress Bar */}
        <div className="relative">
          {/* Track */}
          <div className="h-4 rounded-full bg-secondary/80 relative overflow-hidden">
            {/* Fill */}
            <motion.div
              className="h-full rounded-full relative"
              style={{
                width: `${percentage}%`,
                background: reached
                  ? 'linear-gradient(90deg, hsl(var(--primary)), #10b981, #34d399)'
                  : percentage >= 70
                  ? 'linear-gradient(90deg, hsl(var(--primary)), #f59e0b, #ef4444)'
                  : 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </div>

          {/* Rocket indicator */}
          <motion.div
            className="absolute -top-6 z-20"
            style={{ left: `calc(${Math.min(percentage, 96)}% - 16px)` }}
            initial={{ left: '-16px' }}
            animate={{ left: `calc(${Math.min(percentage, 96)}% - 16px)` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          >
            <div className="relative">
              {/* Rocket */}
              <motion.div
                className="text-2xl"
                style={{ transform: 'rotate(-45deg)' }}
                animate={reached ? { 
                  y: [0, -3, 0],
                  rotate: [-45, -50, -45],
                } : {
                  y: [0, -2, 0],
                }}
                transition={{ repeat: Infinity, duration: reached ? 0.5 : 1.5 }}
              >
                🚀
              </motion.div>

              {/* Fire particles behind rocket */}
              {fireIntensity >= 1 && (
                <div className="absolute -bottom-1 -left-1 flex gap-0.5">
                  <motion.span
                    className="text-sm"
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.8, 1.2, 0.8] }}
                    transition={{ repeat: Infinity, duration: 0.3 }}
                  >
                    🔥
                  </motion.span>
                  {fireIntensity >= 2 && (
                    <motion.span
                      className="text-xs"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.6, 1, 0.6], y: [0, 2, 0] }}
                      transition={{ repeat: Infinity, duration: 0.4, delay: 0.1 }}
                    >
                      🔥
                    </motion.span>
                  )}
                  {fireIntensity >= 3 && (
                    <>
                      <motion.span
                        className="text-xs"
                        animate={{ opacity: [0.4, 1, 0.4], scale: [0.5, 1.3, 0.5], x: [-2, 2, -2] }}
                        transition={{ repeat: Infinity, duration: 0.25, delay: 0.05 }}
                      >
                        🔥
                      </motion.span>
                      <motion.span
                        className="text-[10px]"
                        animate={{ opacity: [0.2, 0.8, 0.2], y: [0, 4, 0] }}
                        transition={{ repeat: Infinity, duration: 0.35 }}
                      >
                        💥
                      </motion.span>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {/* Goal flag at the end */}
          <div className="absolute -top-5 right-0 text-lg">🏁</div>
        </div>

        {/* Milestone markers */}
        <div className="flex justify-between mt-2 px-1">
          {[0, 25, 50, 75, 100].map(m => {
            const val = Math.round((m / 100) * goalTarget);
            return (
              <div key={m} className="flex flex-col items-center">
                <div className={`w-1 h-1.5 rounded-full ${percentage >= m ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                <span className={`text-[9px] mt-0.5 ${percentage >= m ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {val}
                </span>
              </div>
            );
          })}
        </div>

        {/* Reached celebration */}
        {reached && (
          <motion.div
            className="mt-3 p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <p className="text-xs font-semibold text-emerald-500 flex items-center justify-center gap-1.5">
              🎉 Meta atingida! Parabéns pela conquista!
            </p>
          </motion.div>
        )}

        {/* Remaining */}
        {!reached && (
          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            Faltam <span className="font-bold text-foreground">{goalTarget - currentClients}</span> clientes para atingir a meta
          </p>
        )}
      </div>
    </motion.div>
  );
}
