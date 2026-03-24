import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
      <motion.ellipse cx="40" cy="72" rx="8" ry="6" fill="hsl(var(--primary))" opacity={0.8}
        animate={{ ry: [6, 9, 6], opacity: [0.8, 1, 0.8] }} transition={{ duration: 0.4, repeat: Infinity }} />
      <motion.ellipse cx="40" cy="72" rx="5" ry="4" fill="#FFD700"
        animate={{ ry: [4, 7, 4] }} transition={{ duration: 0.3, repeat: Infinity }} />
      <ellipse cx="40" cy="42" rx="18" ry="26" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2.5" />
      <circle cx="40" cy="34" r="12" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <motion.g animate={talking ? { scaleY: [1, 0.2, 1] } : {}} transition={{ duration: 0.3, repeat: Infinity, repeatDelay: 2 }} style={{ transformOrigin: '40px 32px' }}>
        <circle cx="35" cy="32" r="3" fill="hsl(var(--foreground))" />
        <circle cx="45" cy="32" r="3" fill="hsl(var(--foreground))" />
        <motion.circle cx="36" cy="31.5" r="1.2" fill="hsl(var(--background))" animate={{ cx: talking ? [36, 37, 36] : [36, 35, 36] }} transition={{ duration: 1.5, repeat: Infinity }} />
        <motion.circle cx="46" cy="31.5" r="1.2" fill="hsl(var(--background))" animate={{ cx: talking ? [46, 47, 46] : [46, 45, 46] }} transition={{ duration: 1.5, repeat: Infinity }} />
      </motion.g>
      <motion.path d={talking ? "M35 38 Q40 43 45 38" : "M36 38 Q40 41 44 38"} stroke="hsl(var(--foreground))" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M22 52 L18 62 L28 56 Z" fill="hsl(var(--primary))" opacity={0.8} />
      <path d="M58 52 L62 62 L52 56 Z" fill="hsl(var(--primary))" opacity={0.8} />
      <path d="M30 18 Q40 6 50 18" fill="hsl(var(--primary))" />
    </motion.svg>
  );
}

const SESSION_KEY = 'pulse_welcome_shown';

export default function WelcomeRocket() {
  const { user, profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [typing, setTyping] = useState(true);
  const [displayedText, setDisplayedText] = useState('');

  const isIggor = profile?.name?.toLowerCase().includes('iggor') || profile?.display_name?.toLowerCase().includes('iggor');

  const buildMessage = useCallback(async () => {
    if (!user || !profile) return '';

    const today = format(new Date(), 'yyyy-MM-dd');
    const dayName = format(new Date(), "EEEE", { locale: ptBR });
    const firstName = (profile.display_name || profile.name || 'Amigo').split(' ')[0];
    const role = profile.role;

    let lines: string[] = [];
    lines.push(`E aí, ${firstName}! 🔥`);
    lines.push(`Hoje é ${dayName}, bora meter bronca!`);
    lines.push('');

    try {
      // Fetch tasks based on role
      if (role === 'videomaker') {
        const { data: recs } = await supabase.from('recordings')
          .select('id, client_id, date, status, clients(company_name)')
          .eq('date', today).eq('videomaker_id', user.id).limit(20);
        const pending = recs?.filter((r: any) => r.status !== 'concluida' && r.status !== 'cancelada') || [];
        if (pending.length > 0) {
          lines.push(`📹 Você tem ${pending.length} gravação(ões) hoje:`);
          pending.forEach((r: any) => lines.push(`  • ${r.clients?.company_name || 'Cliente'}`));
        } else {
          lines.push('📹 Nenhuma gravação agendada pra hoje. Dia tranquilo!');
        }
      } else if (role === 'editor') {
        const { data: tasks } = await supabase.from('content_tasks')
          .select('id, title, kanban_column, client_id, clients(company_name)')
          .eq('assigned_to', user.id)
          .in('kanban_column', ['edicao', 'revisao', 'alteracao']).limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`🎬 Você tem ${tasks.length} tarefa(s) de edição:`);
          tasks.slice(0, 5).forEach((t: any) => lines.push(`  • ${t.clients?.company_name || ''} - ${t.title}`));
          if (tasks.length > 5) lines.push(`  ... e mais ${tasks.length - 5}`);
        } else {
          lines.push('🎬 Fila limpa! Nenhuma edição pendente.');
        }
      } else if (role === 'designer' || role === 'fotografo') {
        const { data: tasks } = await supabase.from('design_tasks')
          .select('id, title, kanban_column, client_id, clients(company_name)')
          .eq('assigned_to', user.id)
          .in('kanban_column', ['nova_tarefa', 'em_andamento', 'revisao']).limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`🎨 Você tem ${tasks.length} tarefa(s) de design:`);
          tasks.slice(0, 5).forEach((t: any) => lines.push(`  • ${t.clients?.company_name || ''} - ${t.title}`));
        } else {
          lines.push('🎨 Nenhuma tarefa de design pendente. Tá suave!');
        }
      } else if (role === 'social_media') {
        const { data: tasks } = await supabase.from('content_tasks')
          .select('id, title, kanban_column, client_id, clients(company_name)')
          .in('kanban_column', ['ideias', 'roteiro', 'pauta']).limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`📱 ${tasks.length} tarefa(s) de conteúdo no radar:`);
          tasks.slice(0, 5).forEach((t: any) => lines.push(`  • ${t.clients?.company_name || ''} - ${t.title}`));
        } else {
          lines.push('📱 Conteúdos em dia! Bora criar mais!');
        }
      } else if (role === 'parceiro') {
        const { data: tasks } = await supabase.from('endomarketing_partner_tasks')
          .select('id, date, start_time, status, client_id, clients(company_name)')
          .eq('partner_id', user.id).eq('date', today).eq('status', 'pendente').limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`📋 Você tem ${tasks.length} tarefa(s) de endomarketing hoje:`);
          tasks.forEach((t: any) => lines.push(`  • ${t.start_time || ''} - ${t.clients?.company_name || 'Cliente'}`));
        } else {
          lines.push('📋 Nenhuma tarefa de endomarketing pra hoje!');
        }
      } else if (role === 'admin') {
        // Admin sees overview
        const { data: recs } = await supabase.from('recordings')
          .select('id, status').eq('date', today).limit(50);
        const { data: contentTasks } = await supabase.from('content_tasks')
          .select('id, kanban_column').in('kanban_column', ['edicao', 'revisao', 'alteracao']).limit(50);
        const { data: designTasks } = await supabase.from('design_tasks')
          .select('id, kanban_column').in('kanban_column', ['nova_tarefa', 'em_andamento', 'revisao']).limit(50);

        const recsToday = recs?.length || 0;
        const editing = contentTasks?.length || 0;
        const designing = designTasks?.length || 0;

        lines.push('📊 Visão geral do dia:');
        lines.push(`  📹 ${recsToday} gravação(ões) agendadas`);
        lines.push(`  🎬 ${editing} edição(ões) pendente(s)`);
        lines.push(`  🎨 ${designing} tarefa(s) de design`);
      } else {
        lines.push('💪 Bora trabalhar! O dia é nosso!');
      }
    } catch {
      lines.push('💪 Bora trabalhar! O dia é nosso!');
    }

    lines.push('');
    lines.push('Vamo que vamo! 🚀');

    if (isIggor) {
      lines.push('');
      lines.push('Beijão pra você, Iggor! 😘💋');
    }

    return lines.join('\n');
  }, [user, profile, isIggor]);

  // Check if already shown this session
  useEffect(() => {
    if (!user || !profile) return;
    const shown = sessionStorage.getItem(SESSION_KEY);
    if (shown === format(new Date(), 'yyyy-MM-dd')) return;

    const timer = setTimeout(async () => {
      const msg = await buildMessage();
      if (msg) {
        setMessage(msg);
        setVisible(true);
        sessionStorage.setItem(SESSION_KEY, format(new Date(), 'yyyy-MM-dd'));
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [user, profile, buildMessage]);

  // Typewriter effect
  useEffect(() => {
    if (!visible || !message) return;
    let i = 0;
    setDisplayedText('');
    setTyping(true);
    const interval = setInterval(() => {
      i++;
      setDisplayedText(message.slice(0, i));
      if (i >= message.length) {
        clearInterval(interval);
        setTyping(false);
      }
    }, 25);
    return () => clearInterval(interval);
  }, [visible, message]);

  const dismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.5, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.5, y: 50, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="relative bg-card border-2 border-primary/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Glow header */}
            <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-4 flex items-center gap-3">
              <div className="w-14 h-14 flex-shrink-0">
                <RocketMascot talking={typing} />
              </div>
              <div className="flex-1">
                <h2 className="font-display font-bold text-lg bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
                  Foguetinho 🔥
                </h2>
                <p className="text-[11px] text-muted-foreground">Seu assistente de produção</p>
              </div>
              <button onClick={dismiss} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>

            {/* Message body */}
            <div className="p-4 max-h-[50vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                {displayedText}
                {typing && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="text-primary font-bold"
                  >
                    |
                  </motion.span>
                )}
              </pre>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border flex justify-end">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={dismiss}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Bora! 🚀
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
