import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Square, Clock, Video, FileText, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface LiveRecordingCardProps {
  clientName: string;
  clientColor: string;
  startedAt: string;
  recordingDurationHours: number;
  scriptsCount: number;
  onFinish: () => void;
  onViewScripts: () => void;
}

export default function LiveRecordingCard({
  clientName,
  clientColor,
  startedAt,
  recordingDurationHours,
  scriptsCount,
  onFinish,
  onViewScripts,
}: LiveRecordingCardProps) {
  const [elapsed, setElapsed] = useState(0);

  const totalSeconds = recordingDurationHours * 3600;

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
  const isWarning = !isOvertime && remaining <= 600; // last 10 min

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
      className={`relative overflow-hidden rounded-xl border-2 p-5 ${
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
            <div className={`text-2xl font-mono font-bold tabular-nums ${
              isOvertime ? 'text-destructive' : isWarning ? 'text-warning' : 'text-foreground'
            }`}>
              {isOvertime ? '+' : ''}{formatTime(isOvertime ? elapsed - totalSeconds : remaining)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isOvertime ? 'Tempo excedido' : 'Tempo restante'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Decorrido: {formatTime(elapsed)}</span>
            <span>Duração: {recordingDurationHours}h</span>
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
            {isWarning && !isOvertime && (
              <motion.div
                className="absolute inset-0 bg-warning/20 rounded-full"
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
        </div>

        {/* Warning message */}
        {isWarning && !isOvertime && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 mb-3"
          >
            <Clock size={14} className="text-destructive shrink-0" />
            <p className="text-xs text-destructive font-medium">
              Tempo da gravação excedido. Finalize agora para liberar a agenda.
            </p>
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onViewScripts} className="gap-1.5">
            <FileText size={14} /> Ver Roteiros
          </Button>
          <Button
            onClick={onFinish}
            className={`flex-1 gap-1.5 font-semibold ${
              isOvertime
                ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                : 'bg-success hover:bg-success/90 text-success-foreground'
            }`}
          >
            <Square size={14} /> Finalizar Gravação
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
