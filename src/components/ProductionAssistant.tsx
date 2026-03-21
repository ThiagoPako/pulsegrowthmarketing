import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import ReactMarkdown from 'react-markdown';

/* ─── Rocket Mascot SVG ─── */
function RocketMascot({ talking }: { talking?: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 80 80"
      className="w-full h-full"
      animate={talking ? { rotate: [0, -3, 3, -2, 0] } : { y: [0, -3, 0] }}
      transition={talking
        ? { duration: 0.5, repeat: Infinity, repeatType: 'mirror' }
        : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
      }
    >
      {/* Flame */}
      <motion.ellipse
        cx="40" cy="72" rx="8" ry="6"
        fill="hsl(var(--primary))"
        opacity={0.8}
        animate={{ ry: [6, 9, 6], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 0.4, repeat: Infinity }}
      />
      <motion.ellipse
        cx="40" cy="72" rx="5" ry="4"
        fill="#FFD700"
        animate={{ ry: [4, 7, 4] }}
        transition={{ duration: 0.3, repeat: Infinity }}
      />

      {/* Body */}
      <ellipse cx="40" cy="42" rx="18" ry="26" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2.5" />

      {/* Window / Face area */}
      <circle cx="40" cy="34" r="12" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary))" strokeWidth="1.5" />

      {/* Eyes */}
      <motion.g
        animate={talking ? { scaleY: [1, 0.2, 1] } : {}}
        transition={{ duration: 0.3, repeat: Infinity, repeatDelay: 2 }}
        style={{ transformOrigin: '40px 32px' }}
      >
        <circle cx="35" cy="32" r="3" fill="hsl(var(--foreground))" />
        <circle cx="45" cy="32" r="3" fill="hsl(var(--foreground))" />
        {/* Pupils */}
        <motion.circle
          cx="36" cy="31.5" r="1.2" fill="hsl(var(--background))"
          animate={{ cx: talking ? [36, 37, 36] : [36, 35, 36] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <motion.circle
          cx="46" cy="31.5" r="1.2" fill="hsl(var(--background))"
          animate={{ cx: talking ? [46, 47, 46] : [46, 45, 46] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </motion.g>

      {/* Smile */}
      <motion.path
        d={talking ? "M35 38 Q40 43 45 38" : "M36 38 Q40 41 44 38"}
        stroke="hsl(var(--foreground))"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Fins */}
      <path d="M22 52 L18 62 L28 56 Z" fill="hsl(var(--primary))" opacity={0.8} />
      <path d="M58 52 L62 62 L52 56 Z" fill="hsl(var(--primary))" opacity={0.8} />

      {/* Tip */}
      <path d="M30 18 Q40 6 50 18" fill="hsl(var(--primary))" />
    </motion.svg>
  );
}

/* ─── Types ─── */
interface AssistantMessage {
  id: string;
  text: string;
  timestamp: Date;
  type: 'deadline' | 'motivation' | 'friday' | 'general';
}

const ASSISTANT_KEY = 'pulse_assistant_enabled';

/* ─── Main Component ─── */
export default function ProductionAssistant() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [currentMsg, setCurrentMsg] = useState<AssistantMessage | null>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMessage, setHasMessage] = useState(false);
  const checkedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const checkProduction = useCallback(async () => {
    if (!user || !profile || loading) return;
    setLoading(true);

    try {
      // Fetch overdue/pending items
      const now = new Date();
      const isFriday = now.getDay() === 5;

      // Get content tasks with deadlines
      const { data: tasks } = await supabase
        .from('content_tasks')
        .select('id, title, kanban_column, editing_deadline, review_deadline, alteration_deadline, assigned_to, client_id')
        .in('kanban_column', ['edicao', 'revisao', 'alteracao'])
        .limit(50);

      // Get design tasks pending
      const { data: designTasks } = await supabase
        .from('design_tasks')
        .select('id, title, kanban_column, assigned_to, created_at')
        .in('kanban_column', ['pendente', 'em_andamento', 'revisao'])
        .limit(30);

      // Build context for AI
      const overdueTasks = (tasks || []).filter((t: any) => {
        const deadline = t.editing_deadline || t.review_deadline || t.alteration_deadline;
        return deadline && new Date(deadline) < now;
      });

      const myTasks = (tasks || []).filter((t: any) => t.assigned_to === user.id);
      const myDesignTasks = (designTasks || []).filter((t: any) => t.assigned_to === user.id);

      // Decide if assistant should speak
      const shouldSpeak =
        isFriday ||
        overdueTasks.length > 0 ||
        myTasks.some((t: any) => {
          const dl = t.editing_deadline || t.review_deadline;
          return dl && new Date(dl) < new Date(now.getTime() + 2 * 3600000);
        });

      if (!shouldSpeak && checkedRef.current) {
        setLoading(false);
        return;
      }
      checkedRef.current = true;

      // Build prompt context
      const context = {
        userName: profile.display_name || profile.name,
        userRole: profile.role,
        isFriday,
        overdueCount: overdueTasks.length,
        myPendingContent: myTasks.length,
        myPendingDesign: myDesignTasks.length,
        overdueTitles: overdueTasks.slice(0, 5).map((t: any) => t.title),
        totalPending: (tasks || []).length + (designTasks || []).length,
      };

      // Call AI via VPS
      const { data: aiIntegration } = await supabase
        .from('api_integrations')
        .select('config')
        .in('provider', ['ai_gemini', 'ai_openai', 'lovable_ai'])
        .eq('status', 'ativo')
        .limit(1)
        .single();

      const aiModel = (aiIntegration as any)?.config?.ai_model || undefined;
      const aiProvider = (aiIntegration as any)?.config?.ai_provider || undefined;

      const { data: aiResponse } = await invokeVpsFunction('production-assistant', {
        body: { context, aiModel, aiProvider },
      });

      if (aiResponse?.message) {
        const msg: AssistantMessage = {
          id: crypto.randomUUID(),
          text: aiResponse.message,
          timestamp: new Date(),
          type: isFriday ? 'friday' : overdueTasks.length > 0 ? 'deadline' : 'motivation',
        };
        setMessages(prev => [msg, ...prev].slice(0, 20));
        setCurrentMsg(msg);
        setShowBubble(true);
        setHasMessage(true);
      }
    } catch (err) {
      console.error('Production assistant error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, profile, loading]);

  // Check on mount + every 15 min
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => checkProduction(), 3000);
    intervalRef.current = setInterval(() => checkProduction(), 15 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, checkProduction]);

  // Auto-dismiss bubble after 30s
  useEffect(() => {
    if (showBubble && currentMsg) {
      const t = setTimeout(() => setShowBubble(false), 30000);
      return () => clearTimeout(t);
    }
  }, [showBubble, currentMsg]);

  if (!user) return null;

  return (
    <>
      {/* Chat bubble overlay */}
      <AnimatePresence>
        {showBubble && currentMsg && !minimized && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="fixed bottom-24 right-4 z-50 max-w-xs sm:max-w-sm"
          >
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-4 pr-8">
              {/* Close */}
              <button
                onClick={() => setShowBubble(false)}
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>

              {/* Speech arrow */}
              <div className="absolute -bottom-2 right-8 w-4 h-4 bg-card border-b border-r border-border rotate-45" />

              {/* Message */}
              <div className="prose prose-sm max-w-none text-foreground text-sm leading-relaxed">
                <ReactMarkdown>{currentMsg.text}</ReactMarkdown>
              </div>

              {/* Timestamp */}
              <p className="text-[10px] text-muted-foreground mt-2">
                Foguetinho • agora
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating mascot button */}
      <motion.button
        onClick={() => {
          if (minimized) {
            setMinimized(false);
            if (currentMsg) setShowBubble(true);
          } else if (showBubble) {
            setShowBubble(false);
          } else if (currentMsg) {
            setShowBubble(true);
          } else {
            checkProduction();
          }
        }}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-card border-2 border-primary shadow-lg shadow-primary/20 flex items-center justify-center overflow-visible cursor-pointer"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        animate={loading ? { rotate: [0, 10, -10, 0] } : {}}
        transition={loading ? { duration: 0.5, repeat: Infinity } : {}}
      >
        <div className="w-10 h-10 sm:w-12 sm:h-12">
          <RocketMascot talking={showBubble} />
        </div>

        {/* Notification dot */}
        {messages.length > 0 && !showBubble && (
          <motion.div
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <span className="text-[9px] text-destructive-foreground font-bold">
              {messages.length > 9 ? '9+' : messages.length}
            </span>
          </motion.div>
        )}

        {/* Loading ring */}
        {loading && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </motion.button>

      {/* Message history panel (opens on long press or click when bubble hidden) */}
      <AnimatePresence>
        {minimized === false && !showBubble && messages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
