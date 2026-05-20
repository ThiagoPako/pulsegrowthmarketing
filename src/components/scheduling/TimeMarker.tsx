import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface TimeMarkerProps {
  startHour?: number;
  endHour?: number;
  className?: string;
  showTimeLabel?: boolean;
}

export default function TimeMarker({ 
  startHour = 7, 
  endHour = 20, 
  className = "", 
  showTimeLabel = true 
}: TimeMarkerProps) {
  const [percent, setPercent] = useState(0);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const totalMinutes = hours * 60 + minutes;
      
      const start = startHour * 60;
      const end = endHour * 60;
      
      if (totalMinutes < start) {
        setPercent(0);
      } else if (totalMinutes > end) {
        setPercent(100);
      } else {
        const p = ((totalMinutes - start) / (end - start)) * 100;
        setPercent(p);
      }
      
      setCurrentTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    };

    update();
    const interval = setInterval(update, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [startHour, endHour]);

  if (percent <= 0 || percent >= 100) return null;

  return (
    <motion.div 
      className={`absolute left-0 right-0 z-50 flex items-center pointer-events-none ${className}`}
      style={{ top: `${percent}%` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
      {showTimeLabel && (
        <div className="absolute right-0 flex items-center gap-1 bg-orange-500 px-1.5 py-0.5 rounded-l-md shadow-[0_0_15px_rgba(249,115,22,0.4)]">
          <Clock className="w-2.5 h-2.5 text-white animate-pulse" />
          <span className="text-[10px] font-bold text-white tabular-nums">{currentTime}</span>
        </div>
      )}
    </motion.div>
  );
}
