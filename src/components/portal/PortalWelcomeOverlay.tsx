import { useState, useEffect, useRef } from 'react';
import { portalAction } from '@/lib/portalApi';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PortalVideo {
  id: string;
  video_type: string;
  title: string;
  description: string | null;
  video_url: string;
  is_active: boolean;
}

const PORTAL_MEDIA_PROXY_URL = 'https://agenciapulse.tech/api/portal-media-proxy';
const VPS_UPLOADS_URL = 'https://agenciapulse.tech/uploads';

async function resolveVideoUrl(url: string): Promise<string> {
  if (!url.startsWith(VPS_UPLOADS_URL)) return url;
  const response = await fetch(PORTAL_MEDIA_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(`Proxy error ${response.status}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('Video empty');
  return URL.createObjectURL(blob);
}

const PARTICLE_COUNT = 30;
const ROCKET_COUNT = 8;

function RocketParticle({ delay, side }: { delay: number; side: 'left' | 'right' }) {
  const x = side === 'left' ? Math.random() * 40 : 60 + Math.random() * 40;
  return (
    <motion.div
      className="absolute text-2xl md:text-4xl pointer-events-none"
      initial={{ x: `${x}vw`, y: '110vh', opacity: 1, rotate: 0 }}
      animate={{
        y: [110, -20].map(v => `${v}vh`),
        x: [`${x}vw`, `${x + (Math.random() - 0.5) * 20}vw`],
        rotate: [0, (Math.random() - 0.5) * 60],
        opacity: [1, 1, 0],
      }}
      transition={{ duration: 2.5 + Math.random(), delay, ease: 'easeOut' }}
    >
      🚀
    </motion.div>
  );
}

function LightBeam({ index }: { index: number }) {
  const angle = (index / PARTICLE_COUNT) * 360;
  const hue = (index / PARTICLE_COUNT) * 360;
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 origin-bottom-left pointer-events-none"
      style={{
        width: 3,
        height: '60vh',
        background: `linear-gradient(to top, hsla(${hue}, 100%, 60%, 0.8), transparent)`,
        transform: `rotate(${angle}deg)`,
      }}
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: [0, 1, 0.6], opacity: [0, 0.9, 0] }}
      transition={{ duration: 2, delay: 0.3 + index * 0.04, ease: 'easeOut' }}
    />
  );
}

function SparkleParticle({ delay }: { delay: number }) {
  const x = Math.random() * 100;
  const y = Math.random() * 100;
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
      transition={{ duration: 1.5, delay, ease: 'easeOut' }}
    >
      <Sparkles className="h-4 w-4 text-amber-300" />
    </motion.div>
  );
}

export default function PortalWelcomeOverlay({ clientId }: { clientId: string }) {
  const [video, setVideo] = useState<PortalVideo | null>(null);
  const [phase, setPhase] = useState<'idle' | 'animation' | 'video' | 'done'>('idle');
  const [muted, setMuted] = useState(false);
  const [videoType, setVideoType] = useState<'welcome' | 'news'>('welcome');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    checkForVideos();
  }, [clientId]);

  const checkForVideos = async () => {
    const result = await portalAction({ action: 'get_portal_videos', client_id: clientId });
    if (!result?.videos?.length) return;

    const viewedIds = new Set((result.viewed_ids || []) as string[]);
    const unseenWelcome = result.videos.find((v: any) => v.video_type === 'welcome' && !viewedIds.has(v.id));
    const unseenNews = result.videos.find((v: any) => v.video_type === 'news' && !viewedIds.has(v.id));

    const target = unseenWelcome || unseenNews;
    if (!target) return;

    setVideo(target);
    setVideoType(target.video_type as any);
    setPhase('animation');
    setTimeout(() => setPhase('video'), 3500);
  };

  const markViewed = async (videoId: string) => {
    await portalAction({ action: 'mark_video_viewed', client_id: clientId, video_id: videoId });
  };

  const handleClose = () => {
    if (video) markViewed(video.id);
    setPhase('done');
  };

  const handleVideoEnd = () => {
    if (video) markViewed(video.id);
    // Keep showing for a moment then auto-close
    setTimeout(() => setPhase('done'), 1500);
  };

  if (phase === 'idle' || phase === 'done') return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Dark overlay */}
        <motion.div
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />

        {/* Animation phase: rockets + light beams */}
        {phase === 'animation' && (
          <>
            {/* Light beams from center */}
            {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
              <LightBeam key={`beam-${i}`} index={i} />
            ))}

            {/* Rockets flying up */}
            {Array.from({ length: ROCKET_COUNT }).map((_, i) => (
              <RocketParticle
                key={`rocket-${i}`}
                delay={i * 0.2}
                side={i % 2 === 0 ? 'left' : 'right'}
              />
            ))}

            {/* Sparkles */}
            {Array.from({ length: 20 }).map((_, i) => (
              <SparkleParticle key={`spark-${i}`} delay={0.5 + i * 0.1} />
            ))}

            {/* Center text */}
            <motion.div
              className="relative z-10 text-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 1, delay: 0.8 }}
            >
              <motion.div
                className="text-5xl md:text-7xl font-black bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent drop-shadow-2xl"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {videoType === 'welcome' ? '🌟 BEM-VINDO!' : '🔥 NOVIDADES!'}
              </motion.div>
              <motion.p
                className="text-lg md:text-xl text-white/80 mt-3 font-medium"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 }}
              >
                {videoType === 'welcome'
                  ? 'Preparamos algo especial pra você'
                  : 'Temos novidades incríveis pra você!'}
              </motion.p>
            </motion.div>
          </>
        )}

        {/* Video phase */}
        {phase === 'video' && video && (
          <motion.div
            className="relative z-10 w-[90vw] max-w-2xl"
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
          >
            {/* Glowing border */}
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-500 opacity-75 blur-sm animate-pulse" />

            <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-900/50 to-orange-900/50">
                <div className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-xl"
                  >
                    {videoType === 'welcome' ? '🌟' : '📢'}
                  </motion.span>
                  <span className="text-white font-bold text-sm md:text-base">{video.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white/70 hover:text-white"
                    onClick={() => {
                      setMuted(!muted);
                      if (videoRef.current) videoRef.current.muted = !muted;
                    }}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white/70 hover:text-white"
                    onClick={handleClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Video player */}
              <div className="aspect-video bg-black">
                <video
                  ref={videoRef}
                  src={video.video_url}
                  className="w-full h-full object-contain"
                  autoPlay
                  playsInline
                  muted={muted}
                  onEnded={handleVideoEnd}
                />
              </div>

              {video.description && (
                <div className="p-3 bg-gradient-to-r from-amber-900/30 to-transparent">
                  <p className="text-white/70 text-sm">{video.description}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
