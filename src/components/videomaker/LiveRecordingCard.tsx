import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Square, Clock, Video, FileText, Zap, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LiveRecordingCardProps {
  clientName: string;
  clientColor: string;
  startedAt: string;
  recordingDurationMinutes: number;
  scriptsCount: number;
  isStarClient?: boolean;
  onFinish: () => void;
  onViewScripts: () => void;
}

export default function LiveRecordingCard({
  clientName,
  clientColor,
  startedAt,
  recordingDurationMinutes,
  scriptsCount,
  isStarClient,
  onFinish,
  onViewScripts,
}: LiveRecordingCardProps) {
  const [elapsed, setElapsed] = useState(0);

  const totalSeconds = recordingDurationMinutes * 60;

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const progress = Math.min((elapsed / totalSeconds) * 100, 100);
  const remaining = Math.max(totalSeconds - elapsed, 0);
  const isOvertime = elapsed >= totalSeconds;
  const isWarning = !isOvertime && remaining <= 600;

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`relative overflow-hidden rounded-2xl border-2 p-5 ${
        isOvertime
          ? 'border-destructive bg-destructive/5'
          : isWarning
          ? 'border-warning bg-warning/5'
          : 'border-primary bg-primary/5'
      }`}
    >
      {/* Animated pulse background */}
      <motion.div
        className={`absolute inset-0 ${
          isOvertime ? 'bg-destructive/5' : isWarning ? 'bg-warning/5' : 'bg-primary/5'
        }`}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Animated rocket particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className={`absolute w-1 h-1 rounded-full ${isOvertime ? 'bg-destructive/30' : 'bg-primary/30'}`}
            initial={{ x: `${20 + i * 15}%`, y: '100%', opacity: 0 }}
            animate={{
              y: ['-10%', '110%'],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.7,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-3 h-3 rounded-full bg-destructive"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <div>
              <div className="flex items-center gap-2">
                <Video size={16} className="text-primary" />
                <span className="font-display font-bold text-lg">GRAVAÇÃO AO VIVO</span>
                {isStarClient && (
                  <Badge className="bg-warning/20 text-warning border-warning/40 text-[10px] gap-0.5">
                    ⭐ Star
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: `hsl(${clientColor})` }}
                />
                <span className="text-sm font-medium">{clientName}</span>
                <Badge variant="outline" className="text-[10px]">
                  <FileText size={10} className="mr-0.5" />
                  {scriptsCount} roteiro{scriptsCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </div>

          <div className="text-right">
            <motion.div
              className={`text-2xl font-mono font-bold tabular-nums ${
                isOvertime ? 'text-destructive' : isWarning ? 'text-warning' : 'text-foreground'
              }`}
              animate={isWarning || isOvertime ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {isOvertime ? '+' : ''}{formatTime(isOvertime ? elapsed - totalSeconds : remaining)}
            </motion.div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isOvertime ? 'Tempo excedido' : 'Tempo restante'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Decorrido: {formatTime(elapsed)}</span>
            <span>Duração: {recordingDurationMinutes}min</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
            <motion.div
              className={`h-full rounded-full ${
                isOvertime
                  ? 'bg-destructive'
                  : isWarning
                  ? 'bg-warning'
                  : 'bg-primary'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
            {/* Rocket icon on progress edge */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: `${Math.min(progress, 98)}%` }}
              animate={{ x: [0, 2, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              <Rocket size={12} className={`-rotate-45 ${isOvertime ? 'text-destructive' : isWarning ? 'text-warning' : 'text-primary'}`} />
            </motion.div>
            {isWarning && !isOvertime && (
              <motion.div
                className="absolute inset-0 bg-warning/20 rounded-full"
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
        </div>

        {/* Warning messages */}
        <AnimatePresence>
          {isWarning && !isOvertime && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 mb-3"
            >
              <Zap size={14} className="text-warning shrink-0" />
              <p className="text-xs text-warning font-medium">
                Tempo quase esgotado! Finalize a gravação em breve.
              </p>
            </motion.div>
          )}
          {isOvertime && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 mb-3"
            >
              <Clock size={14} className="text-destructive shrink-0" />
              <p className="text-xs text-destructive font-medium">
                Tempo da gravação excedido. Finalize agora para liberar a agenda.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onViewScripts} className="gap-1.5">
            <FileText size={14} /> Ver Roteiros
          </Button>
          <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              onClick={onFinish}
              className={`w-full gap-2 font-bold text-base py-5 rounded-xl shadow-lg transition-all ${
                isOvertime
                  ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-destructive/25'
                  : 'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-primary/25'
              }`}
            >
              <motion.div
                animate={{ y: [0, -3, 0], rotate: [0, -10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Rocket size={18} className="-rotate-45" />
              </motion.div>
              Finalizar Gravação
              <motion.div
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
