import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Shield, Activity } from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/* ─── JARVIS-style HUD Arc Ring ─── */
function HudRing({ size = 120, delay = 0 }: { size?: number; delay?: number }) {
  return (
    <motion.svg
      width={size} height={size}
      viewBox="0 0 120 120"
      className="absolute"
      initial={{ rotate: 0, opacity: 0 }}
      animate={{ rotate: 360, opacity: [0, 0.6, 0.3] }}
      transition={{ rotate: { duration: 20, repeat: Infinity, ease: 'linear' }, opacity: { duration: 2, delay } }}
    >
      <circle cx="60" cy="60" r="55" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" opacity={0.3} />
      <motion.path
        d="M60 5 A55 55 0 0 1 115 60"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.7}
      />
      <motion.path
        d="M60 115 A55 55 0 0 1 5 60"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1"
        strokeLinecap="round"
        opacity={0.4}
      />
    </motion.svg>
  );
}

/* ─── Rocket Mascot SVG (JARVIS-enhanced) ─── */
function RocketMascot({ talking }: { talking?: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 80 80"
      className="w-full h-full drop-shadow-[0_0_15px_hsl(var(--primary)/0.5)]"
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
        <circle cx="35" cy="32" r="3" fill="hsl(var(--primary))" />
        <circle cx="45" cy="32" r="3" fill="hsl(var(--primary))" />
        <motion.circle cx="36" cy="31.5" r="1.2" fill="hsl(var(--background))" animate={{ cx: talking ? [36, 37, 36] : [36, 35, 36] }} transition={{ duration: 1.5, repeat: Infinity }} />
        <motion.circle cx="46" cy="31.5" r="1.2" fill="hsl(var(--background))" animate={{ cx: talking ? [46, 47, 46] : [46, 45, 46] }} transition={{ duration: 1.5, repeat: Infinity }} />
      </motion.g>
      <motion.path d={talking ? "M35 38 Q40 43 45 38" : "M36 38 Q40 41 44 38"} stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M22 52 L18 62 L28 56 Z" fill="hsl(var(--primary))" opacity={0.8} />
      <path d="M58 52 L62 62 L52 56 Z" fill="hsl(var(--primary))" opacity={0.8} />
      <path d="M30 18 Q40 6 50 18" fill="hsl(var(--primary))" />
    </motion.svg>
  );
}

/* ─── Scanning line effect ─── */
function ScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent pointer-events-none"
      initial={{ top: '0%' }}
      animate={{ top: ['0%', '100%', '0%'] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ─── Particle dots floating ─── */
function FloatingParticles() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 3,
  }));

  return (
    <>
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/30 pointer-events-none"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{ opacity: [0, 0.8, 0], y: [0, -20, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: 4, delay: p.delay, repeat: Infinity }}
        />
      ))}
    </>
  );
}

const STORAGE_KEY = 'pulse_welcome_last_date';

export default function WelcomeRocket() {
  const { user, profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [typing, setTyping] = useState(true);
  const [displayedText, setDisplayedText] = useState('');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isIggor = profile?.name?.toLowerCase().includes('iggor') || profile?.display_name?.toLowerCase().includes('iggor');

  const buildMessage = useCallback(async () => {
    if (!user || !profile) return '';

    const today = format(new Date(), 'yyyy-MM-dd');
    const dayName = format(new Date(), "EEEE", { locale: ptBR });
    const hour = new Date().getHours();
    const firstName = (profile.display_name || profile.name || 'Operador').split(' ')[0];
    const role = profile.role;

    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

    let lines: string[] = [];
    lines.push(`[SISTEMA FOGUETINHO v3.0 — ONLINE]`);
    lines.push('');
    lines.push(`${greeting}, ${firstName}. Todos os sistemas operacionais.`);
    lines.push(`Hoje é ${dayName}. Iniciando briefing do dia...`);
    lines.push('');

    const nameLower = (profile.display_name || profile.name || '').toLowerCase();
    const isVictor = nameLower.includes('victor');
    const isRayssa = nameLower.includes('rayssa');
    const isThiago = nameLower.includes('thiago');

    try {
      if (role === 'videomaker') {
        const { data: recs } = await supabase.from('recordings')
          .select('id, client_id, date, status, clients(company_name)')
          .eq('date', today).eq('videomaker_id', user.id).limit(20);
        const pending = recs?.filter((r: any) => r.status !== 'concluida' && r.status !== 'cancelada') || [];
        if (pending.length > 0) {
          lines.push(`▸ GRAVAÇÕES DETECTADAS: ${pending.length}`);
          pending.forEach((r: any) => lines.push(`  ◦ ${r.clients?.company_name || 'Cliente'}`));
        } else {
          lines.push('▸ GRAVAÇÕES: Nenhuma operação agendada.');
        }
      } else if (role === 'editor') {
        const { data: tasks } = await supabase.from('content_tasks')
          .select('id, title, kanban_column, client_id, clients(company_name)')
          .eq('assigned_to', user.id)
          .in('kanban_column', ['edicao', 'revisao', 'alteracao']).limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`▸ EDIÇÕES NA FILA: ${tasks.length}`);
          tasks.slice(0, 5).forEach((t: any) => lines.push(`  ◦ ${t.clients?.company_name || ''} — ${t.title}`));
          if (tasks.length > 5) lines.push(`  ◦ ... +${tasks.length - 5} tarefas`);
        } else {
          lines.push('▸ EDIÇÕES: Fila zerada. Sistemas limpos.');
        }
      } else if (role === 'designer' || role === 'fotografo') {
        const { data: tasks } = await supabase.from('design_tasks')
          .select('id, title, kanban_column, client_id, clients(company_name)')
          .eq('assigned_to', user.id)
          .in('kanban_column', ['nova_tarefa', 'em_andamento', 'revisao']).limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`▸ DESIGN PENDENTE: ${tasks.length}`);
          tasks.slice(0, 5).forEach((t: any) => lines.push(`  ◦ ${t.clients?.company_name || ''} — ${t.title}`));
        } else {
          lines.push('▸ DESIGN: Nenhuma tarefa pendente.');
        }
      } else if (role === 'social_media') {
        const { data: tasks } = await supabase.from('content_tasks')
          .select('id, title, kanban_column, client_id, clients(company_name)')
          .in('kanban_column', ['ideias', 'roteiro', 'pauta']).limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`▸ CONTEÚDOS NO RADAR: ${tasks.length}`);
          tasks.slice(0, 5).forEach((t: any) => lines.push(`  ◦ ${t.clients?.company_name || ''} — ${t.title}`));
        } else {
          lines.push('▸ CONTEÚDOS: Pipeline em dia.');
        }
      } else if (role === 'parceiro') {
        const { data: tasks } = await supabase.from('endomarketing_partner_tasks')
          .select('id, date, start_time, status, client_id, clients(company_name)')
          .eq('partner_id', user.id).eq('date', today).eq('status', 'pendente').limit(20);
        if (tasks && tasks.length > 0) {
          lines.push(`▸ OPERAÇÕES ENDOMARKETING: ${tasks.length}`);
          tasks.forEach((t: any) => lines.push(`  ◦ ${t.start_time || '—'} → ${t.clients?.company_name || 'Cliente'}`));
        } else {
          lines.push('▸ ENDOMARKETING: Sem operações agendadas.');
        }
      } else if (role === 'admin') {
        const { data: recs } = await supabase.from('recordings')
          .select('id, status').eq('date', today).limit(50);
        const { data: contentTasks } = await supabase.from('content_tasks')
          .select('id, kanban_column').in('kanban_column', ['edicao', 'revisao', 'alteracao']).limit(50);
        const { data: designTasks } = await supabase.from('design_tasks')
          .select('id, kanban_column').in('kanban_column', ['nova_tarefa', 'em_andamento', 'revisao']).limit(50);

        lines.push('▸ STATUS GERAL DA OPERAÇÃO:');
        lines.push(`  ◦ GRAVAÇÕES HOJE ........... ${recs?.length || 0}`);
        lines.push(`  ◦ EDIÇÕES PENDENTES ....... ${contentTasks?.length || 0}`);
        lines.push(`  ◦ DESIGN ATIVO ............ ${designTasks?.length || 0}`);
      } else {
        lines.push('▸ Sistemas prontos. Aguardando comandos.');
      }

      // === FINANCEIRO → só Victor (admin) ===
      if (isVictor && role === 'admin') {
        lines.push('');
        const { data: pendingRevs } = await supabase.from('revenues')
          .select('id, amount, due_date, status, client_id, clients(company_name)')
          .eq('status', 'pendente').limit(50);
        const overdue = (pendingRevs || []).filter((r: any) => r.due_date && r.due_date < today);
        const totalOverdue = overdue.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        lines.push(`▸ FINANCEIRO [ACESSO EXCLUSIVO]:`);
        lines.push(`  ◦ RECEITAS PENDENTES ...... ${pendingRevs?.length || 0}`);
        if (overdue.length > 0) {
          lines.push(`  ⚠ INADIMPLENTES ........... ${overdue.length} (R$ ${totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`);
          overdue.slice(0, 3).forEach((r: any) => lines.push(`    → ${r.clients?.company_name || 'Cliente'} — R$ ${Number(r.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`));
        } else {
          lines.push(`  ✓ INADIMPLÊNCIA: Zero. Caixa seguro.`);
        }
      }

      // === TRÁFEGO / TAREFAS ATRASADAS / CONTROLE DE TIMES → Victor + Rayssa ===
      if (isVictor || isRayssa) {
        lines.push('');
        // Tarefas de conteúdo atrasadas (editing_deadline ultrapassado)
        const { data: overdueTasks } = await supabase.from('content_tasks')
          .select('id, title, editing_deadline, kanban_column, client_id, clients(company_name)')
          .not('editing_deadline', 'is', null)
          .lt('editing_deadline', new Date().toISOString())
          .in('kanban_column', ['edicao', 'revisao', 'alteracao']).limit(20);
        
        const { data: overdueDesign } = await supabase.from('design_tasks')
          .select('id, title, kanban_column, client_id, clients(company_name)')
          .in('kanban_column', ['nova_tarefa', 'executando', 'em_analise']).limit(20);

        lines.push(`▸ GESTÃO DE TAREFAS & TRÁFEGO:`);
        if (overdueTasks && overdueTasks.length > 0) {
          lines.push(`  ⚠ CONTEÚDOS EM ATRASO ..... ${overdueTasks.length}`);
          overdueTasks.slice(0, 4).forEach((t: any) => lines.push(`    → ${t.clients?.company_name || ''} — ${t.title}`));
        } else {
          lines.push(`  ✓ CONTEÚDOS: Sem atrasos detectados.`);
        }
        if (overdueDesign && overdueDesign.length > 0) {
          lines.push(`  ◦ DESIGN PENDENTE ......... ${overdueDesign.length} tarefas ativas`);
        }
        // Clientes em onboarding
        const { data: onboardingClients } = await supabase.from('clients')
          .select('id, company_name, onboarding_completed')
          .eq('onboarding_completed', false).limit(20);
        if (onboardingClients && onboardingClients.length > 0) {
          lines.push('');
          lines.push(`▸ CLIENTES EM ONBOARDING: ${onboardingClients.length}`);
          onboardingClients.slice(0, 5).forEach((c: any) => lines.push(`  ◦ ${c.company_name}`));
          if (onboardingClients.length > 5) lines.push(`  ... +${onboardingClients.length - 5} clientes`);
        }

        // Clientes sem tráfego há muito tempo (criativos tipo 'criativo' sem atividade)
        const { data: allClients } = await supabase.from('clients')
          .select('id, company_name').limit(200);
        const { data: activeCreatives } = await supabase.from('content_tasks')
          .select('id, client_id, updated_at')
          .eq('content_type', 'criativo').limit(500);
        
        if (allClients && allClients.length > 0) {
          const clientsWithCreatives = new Set((activeCreatives || []).map((c: any) => c.client_id));
          const noTraffic = allClients.filter((c: any) => !clientsWithCreatives.has(c.id));
          if (noTraffic.length > 0) {
            lines.push('');
            lines.push(`▸ ⚠ CLIENTES SEM TRÁFEGO ATIVO: ${noTraffic.length}`);
            noTraffic.slice(0, 5).forEach((c: any) => lines.push(`  ◦ ${c.company_name}`));
            if (noTraffic.length > 5) lines.push(`  ... +${noTraffic.length - 5} clientes`);
          }
        }

        // Criativos ativos há muito tempo (mais de 7 dias na mesma coluna ativa)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { data: staleCreatives } = await supabase.from('content_tasks')
          .select('id, title, client_id, updated_at, clients(company_name)')
          .eq('content_type', 'criativo')
          .lt('updated_at', sevenDaysAgo.toISOString())
          .not('kanban_column', 'in', '("concluido","aprovado","publicado")').limit(20);
        if (staleCreatives && staleCreatives.length > 0) {
          lines.push('');
          lines.push(`▸ ⚠ CRIATIVOS ATIVOS HÁ MAIS DE 7 DIAS: ${staleCreatives.length}`);
          staleCreatives.slice(0, 5).forEach((c: any) => lines.push(`  ◦ ${c.clients?.company_name || ''} — ${c.title}`));
        }
      }

      // === ROTEIROS → Victor + Rayssa + Thiago ===
      if (isVictor || isRayssa || isThiago) {
        lines.push('');
        const { data: scripts } = await supabase.from('scripts')
          .select('id, title, client_id, recorded, clients(company_name)')
          .limit(500);
        
        const unrecorded = (scripts as any[] || []).filter((s: any) => !s.recorded);
        lines.push(`▸ ROTEIROS PENDENTES (não gravados): ${unrecorded.length}`);
        if (unrecorded.length > 0) {
          unrecorded.slice(0, 5).forEach((s: any) => lines.push(`    → ${s.clients?.company_name || ''} — ${s.title}`));
          if (unrecorded.length > 5) lines.push(`    ... +${unrecorded.length - 5} roteiros`);
        }

        // Clientes com menos de 3 roteiros disponíveis
        const { data: allClients } = await supabase.from('clients').select('id, company_name').limit(200);
        if (allClients) {
          const lowScriptClients = (allClients as any[]).filter(c => {
            const count = unrecorded.filter((s: any) => s.client_id === c.id).length;
            return count < 3;
          });
          if (lowScriptClients.length > 0) {
            lines.push('');
            lines.push(`▸ ⚠ CLIENTES COM POUCOS ROTEIROS (< 3):`);
            lowScriptClients.forEach((c: any) => {
              const count = unrecorded.filter((s: any) => s.client_id === c.id).length;
              lines.push(`  ◦ ${c.company_name} — ${count} roteiro${count !== 1 ? 's' : ''}`);
            });
          }
        }
      }
    } catch {
      lines.push('▸ Erro ao carregar dados. Sistemas em standby.');
    }

    lines.push('');
    lines.push('Todos os módulos carregados. Pronto para operar. 🚀');

    if (isIggor) {
      lines.push('');
      lines.push('P.S.: Beijão pra você, Iggor! 😘💋');
    }

    return lines.join('\n');
  }, [user, profile, isIggor]);

  useEffect(() => {
    if (!user || !profile) return;
    // Clear previous session to allow re-showing
    sessionStorage.removeItem(SESSION_KEY);

    const timer = setTimeout(async () => {
      const msg = await buildMessage();
      if (msg) {
        setMessage(msg);
        setVisible(true);
        setAudioPlaying(true);
        sessionStorage.setItem(SESSION_KEY, format(new Date(), 'yyyy-MM-dd'));
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, profile, buildMessage]);

  // Typewriter effect — faster JARVIS style
  useEffect(() => {
    if (!visible || !message) return;
    let i = 0;
    setDisplayedText('');
    setTyping(true);
    const interval = setInterval(() => {
      i += 2;
      if (i > message.length) i = message.length;
      setDisplayedText(message.slice(0, i));
      if (i >= message.length) {
        clearInterval(interval);
        setTyping(false);
        setAudioPlaying(false);
      }
    }, 18);
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
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={dismiss}
        >
          {/* Dark backdrop with grid pattern */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />

          {/* Main HUD container */}
          <motion.div
            ref={containerRef}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 200 }}
            className="relative max-w-lg w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Outer glow border */}
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-primary/40 via-primary/10 to-primary/30 blur-[1px]" />

            {/* Glass card */}
            <div className="relative rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-xl shadow-[0_0_60px_-10px_hsl(var(--primary)/0.3)] overflow-hidden">
              {/* Scan line */}
              <ScanLine />
              <FloatingParticles />

              {/* Header — JARVIS HUD */}
              <div className="relative p-5 pb-4 border-b border-primary/10">
                <div className="flex items-center gap-4">
                  {/* Rocket with HUD rings */}
                  <div className="relative w-20 h-20 flex items-center justify-center flex-shrink-0">
                    <HudRing size={80} delay={0} />
                    <motion.div
                      className="absolute inset-0"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                    >
                      <HudRing size={80} delay={0.5} />
                    </motion.div>
                    <div className="relative w-12 h-12 z-10">
                      <RocketMascot talking={typing} />
                    </div>
                    {/* Glow pulse behind rocket */}
                    <motion.div
                      className="absolute inset-0 rounded-full bg-primary/10 pointer-events-none"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <motion.h2
                      className="font-display font-bold text-xl tracking-wide"
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <span className="bg-gradient-to-r from-primary via-blue-400 to-primary bg-clip-text text-transparent">
                        F.O.G.U.E.T.I.N.H.O
                      </span>
                    </motion.h2>
                    <motion.div
                      className="flex items-center gap-2 mt-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <motion.div
                        className="w-2 h-2 rounded-full bg-emerald-400"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
                        Sistema Operacional • v3.0
                      </span>
                    </motion.div>
                    {/* Mini status indicators */}
                    <motion.div
                      className="flex items-center gap-3 mt-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                    >
                      <div className="flex items-center gap-1 text-[9px] text-primary/70 font-mono">
                        <Shield size={10} /> SEGURO
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-primary/70 font-mono">
                        <Activity size={10} /> ATIVO
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-primary/70 font-mono">
                        <Zap size={10} /> RÁPIDO
                      </div>
                    </motion.div>
                  </div>

                  <motion.button
                    onClick={dismiss}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-2 rounded-full border border-primary/20 hover:border-primary/50 hover:bg-primary/10 transition-all"
                  >
                    <X size={14} className="text-muted-foreground" />
                  </motion.button>
                </div>
              </div>

              {/* Message body — terminal style */}
              <div className="p-5 max-h-[45vh] overflow-y-auto relative">
                <motion.div
                  className="font-mono text-[13px] leading-relaxed text-foreground/90"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <pre className="whitespace-pre-wrap">
                    {displayedText}
                    {typing && (
                      <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.4, repeat: Infinity }}
                        className="text-primary font-bold text-base"
                      >
                        ▊
                      </motion.span>
                    )}
                  </pre>
                </motion.div>
              </div>

              {/* Footer — JARVIS action bar */}
              <div className="p-4 border-t border-primary/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {audioPlaying && (
                    <motion.div
                      className="flex items-center gap-[2px]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="w-[3px] bg-primary/60 rounded-full"
                          animate={{ height: [4, 12 + Math.random() * 8, 4] }}
                          transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                        />
                      ))}
                    </motion.div>
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
                    {typing ? 'TRANSMITINDO...' : 'BRIEFING COMPLETO'}
                  </span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 0 20px hsl(var(--primary) / 0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={dismiss}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-bold uppercase tracking-wider hover:from-primary/90 hover:to-primary/70 transition-all border border-primary/30 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.4)]"
                >
                  INICIAR OPERAÇÃO 🚀
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
