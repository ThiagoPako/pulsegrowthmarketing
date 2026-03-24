import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Square, Clock, Video, FileText, Zap, Rocket, Hourglass, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';

interface LiveRecordingCardProps {
  clientName: string;
  clientColor: string;
  startedAt: string;
  recordingDurationMinutes: number;
  scriptsCount: number;
  isStarClient?: boolean;
  recordingId: string;
  videomakerId: string;
  clientId: string;
  onFinish: () => void;
  onViewScripts: () => void;
  onCancel?: () => void;
}

export default function LiveRecordingCard({
  clientName,
  clientColor,
  startedAt,
  recordingDurationMinutes,
  scriptsCount,
  isStarClient,
  recordingId,
  videomakerId,
  clientId,
  onFinish,
  onViewScripts,
  onCancel,
}: LiveRecordingCardProps) {
  const [elapsed, setElapsed] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitLogId, setWaitLogId] = useState<string | null>(null);
  const [waitStartedAt, setWaitStartedAt] = useState<Date | null>(null);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const [totalWaitSeconds, setTotalWaitSeconds] = useState(0);

  const totalSeconds = recordingDurationMinutes * 60;

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Wait timer
  useEffect(() => {
    if (!waitStartedAt) return;
    const interval = setInterval(() => {
      setWaitElapsed(Math.floor((Date.now() - waitStartedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [waitStartedAt]);

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

  const handleStartWaiting = async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const { error } = await supabase.from('recording_wait_logs').insert({
      id,
      recording_id: recordingId,
      videomaker_id: videomakerId,
      client_id: clientId,
      started_at: now.toISOString(),
    } as any);
    if (error) {
      console.error('Wait log insert error:', error);
      toast.error('Erro ao registrar espera: ' + (error.message || JSON.stringify(error)));
      return;
    }
    setIsWaiting(true);
    setWaitLogId(id);
    setWaitStartedAt(now);
    setWaitElapsed(0);
    toast.info('Gravação em espera — aguardando cliente...', { icon: '⏳' });
  };

  const handleStopWaiting = async () => {
    if (!waitLogId || !waitStartedAt) return;
    const durationSec = Math.floor((Date.now() - waitStartedAt.getTime()) / 1000);
    await supabase.from('recording_wait_logs').update({
      ended_at: new Date().toISOString(),
      wait_duration_seconds: durationSec,
    } as any).eq('id', waitLogId);
    setTotalWaitSeconds(prev => prev + durationSec);
    setIsWaiting(false);
    setWaitLogId(null);
    setWaitStartedAt(null);
    setWaitElapsed(0);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    toast.success(`Cliente retornou! Espera de ${mins}m${secs}s registrada.`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`relative overflow-hidden rounded-2xl border-2 p-5 ${
        isWaiting
          ? 'border-warning bg-warning/5'
          : isOvertime
          ? 'border-destructive bg-destructive/5'
          : isWarning
          ? 'border-warning bg-warning/5'
          : 'border-primary bg-primary/5'
      }`}
    >
      {/* Animated pulse background */}
      <motion.div
        className={`absolute inset-0 ${
          isWaiting ? 'bg-warning/5' : isOvertime ? 'bg-destructive/5' : isWarning ? 'bg-warning/5' : 'bg-primary/5'
        }`}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Animated rocket particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className={`absolute w-1 h-1 rounded-full ${isOvertime ? 'bg-destructive/30' : isWaiting ? 'bg-warning/30' : 'bg-primary/30'}`}
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
              className={`w-3 h-3 rounded-full ${isWaiting ? 'bg-warning' : 'bg-destructive'}`}
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: isWaiting ? 2 : 1.5, repeat: Infinity }}
            />
            <div>
              <div className="flex items-center gap-2">
                {isWaiting ? (
                  <Hourglass size={16} className="text-warning" />
                ) : (
                  <Video size={16} className="text-primary" />
                )}
                <span className="font-display font-bold text-lg">
                  {isWaiting ? 'EM ESPERA' : 'GRAVAÇÃO AO VIVO'}
                </span>
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
                isWaiting ? 'text-warning' : isOvertime ? 'text-destructive' : isWarning ? 'text-warning' : 'text-foreground'
              }`}
              animate={isWarning || isOvertime || isWaiting ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {isOvertime ? '+' : ''}{formatTime(isOvertime ? elapsed - totalSeconds : remaining)}
            </motion.div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isOvertime ? 'Tempo excedido' : 'Tempo restante'}
            </p>
          </div>
        </div>

        {/* Waiting banner */}
        <AnimatePresence>
          {isWaiting && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 rounded-xl border-2 border-warning/40 bg-warning/10 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 180, 360] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  >
                    <Hourglass size={24} className="text-warning" />
                  </motion.div>
                  <div>
                    <p className="text-sm font-bold text-warning">Aguardando cliente...</p>
                    <p className="text-xs text-muted-foreground">O tempo de espera está sendo registrado</p>
                  </div>
                </div>
                <div className="text-right">
                  <motion.span
                    className="text-xl font-mono font-bold text-warning tabular-nums"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    {formatTime(waitElapsed)}
                  </motion.span>
                  <p className="text-[10px] text-muted-foreground">em espera</p>
                </div>
              </div>
              {totalWaitSeconds > 0 && (
                <p className="text-[10px] text-muted-foreground mt-2 border-t border-warning/20 pt-2">
                  Total acumulado de espera nesta gravação: {formatTime(totalWaitSeconds + waitElapsed)}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Decorrido: {formatTime(elapsed)}{totalWaitSeconds > 0 ? ` (espera: ${formatTime(totalWaitSeconds)})` : ''}</span>
            <span>Duração: {recordingDurationMinutes}min</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
            <motion.div
              className={`h-full rounded-full ${
                isWaiting ? 'bg-warning' : isOvertime ? 'bg-destructive' : isWarning ? 'bg-warning' : 'bg-primary'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
            {/* Rocket icon on progress edge */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: `${Math.min(progress, 98)}%` }}
              animate={isWaiting ? { x: [0, 0, 0] } : { x: [0, 2, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              {isWaiting ? (
                <Hourglass size={12} className="text-warning" />
              ) : (
                <Rocket size={12} className={`-rotate-45 ${isOvertime ? 'text-destructive' : isWarning ? 'text-warning' : 'text-primary'}`} />
              )}
            </motion.div>
            {isWarning && !isOvertime && !isWaiting && (
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
          {isWarning && !isOvertime && !isWaiting && (
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
          {isOvertime && !isWaiting && (
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
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="flex gap-2">
            {onCancel && (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  className="gap-1 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs"
                >
                  <RotateCcw size={13} />
                  Reiniciar
                </Button>
              </motion.div>
            )}
            <Button variant="outline" size="sm" onClick={onViewScripts} className="gap-1 text-xs">
              <FileText size={13} /> Ver Roteiros
            </Button>

            {/* Waiting toggle button */}
            {isWaiting ? (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="sm"
                  onClick={handleStopWaiting}
                  className="gap-1 bg-success hover:bg-success/90 text-success-foreground shadow-md text-xs"
                >
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                    <Play size={14} />
                  </motion.div>
                  Iniciamos!
                </Button>
              </motion.div>
            ) : (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartWaiting}
                  className="gap-1 border-warning/50 text-warning hover:bg-warning/10 hover:text-warning text-xs"
                >
                  <Hourglass size={13} />
                  Em Espera
                </Button>
              </motion.div>
            )}
          </div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              onClick={async () => {
                if (isWaiting) await handleStopWaiting();
                onFinish();
              }}
              className={`w-full gap-2 font-bold text-sm py-4 rounded-xl shadow-lg transition-all ${
                isOvertime
                  ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-destructive/25'
                  : 'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-primary/25'
              }`}
            >
              <motion.div
                animate={{ y: [0, -3, 0], rotate: [0, -10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Rocket size={16} className="-rotate-45" />
              </motion.div>
              Finalizar Gravação
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
