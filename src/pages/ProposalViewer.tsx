import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import pulseLogo from '@/assets/pulse_logo.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast, Toaster } from 'sonner';
import { motion, useInView } from 'framer-motion';
import {
  Rocket, Film, Palette, Camera, Monitor, Share2, BarChart3,
  CheckCircle2, Gift, FileText, Scissors, Users, MessageCircle,
  ThumbsUp, ThumbsDown, Clock, Send, Code, Megaphone, Star, Zap
} from 'lucide-react';

const INTERNAL_PROCESS_STEPS = [
  { icon: Camera, title: 'Captação de Conteúdo', description: 'Gravação profissional com videomaker dedicado' },
  { icon: Scissors, title: 'Edição Profissional', description: 'Edição com tratamento de cor, legendas e efeitos' },
  { icon: Palette, title: 'Design Gráfico', description: 'Artes, criativos e identidade visual para redes' },
  { icon: FileText, title: 'Roteirização', description: 'Planejamento estratégico e criação de roteiros' },
  { icon: Share2, title: 'Gestão de Redes', description: 'Publicação, programação e gerenciamento' },
  { icon: BarChart3, title: 'Tráfego Pago', description: 'Campanhas patrocinadas para resultados' },
  { icon: Monitor, title: 'Portal do Cliente', description: 'Acompanhe aprovações e resultados' },
];

const IMPLEMENTATION_FEES = {
  adAccounts: { label: 'Implementação de contas de anúncios', value: 800 },
  profileRedesign: { label: 'Reformulação de perfil', value: 750 },
  internalIntegration: { label: 'Integração interna, editorial e portal', value: 1250 },
};

const PAYMENT_METHODS: Record<string, string> = {
  pix: 'PIX', boleto: 'Boleto Bancário', cartao: 'Cartão de Crédito', transferencia: 'Transferência Bancária',
};

// Animated section wrapper
function AnimatedSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Marquee of client logos
function ClientLogosMarquee({ clients }: { clients: any[] }) {
  if (clients.length === 0) return null;
  const doubled = [...clients, ...clients];
  return (
    <div className="relative overflow-hidden py-6" style={{ background: 'linear-gradient(180deg, hsl(16 82% 97%), white)' }}>
      <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-[0.2em] mb-4">Empresas que confiam na Pulse</p>
      <div className="flex animate-marquee">
        {doubled.map((c, i) => (
          <div key={`${c.id}-${i}`} className="flex-shrink-0 mx-4">
            {c.logo_url ? (
              <img src={c.logo_url} alt={c.company_name} className="h-10 w-auto object-contain grayscale hover:grayscale-0 transition-all duration-500 opacity-60 hover:opacity-100" />
            ) : (
              <div
                className="h-10 px-4 rounded-lg flex items-center justify-center text-xs font-bold text-white whitespace-nowrap"
                style={{ background: `hsl(${c.color || '16 82% 51%'})` }}
              >
                {c.company_name}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProposalViewer() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentName, setCommentName] = useState('');
  const [commentMsg, setCommentMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);
  const [responseNote, setResponseNote] = useState('');

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  useEffect(() => {
    if (!token) return;
    loadProposal();
    loadComments();
    loadClients();
    const interval = setInterval(loadComments, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const loadClients = async () => {
    const { data } = await supabase.from('clients_public_logos').select('*');
    setClients(data || []);
  };

  const loadProposal = async () => {
    const { data } = await supabase.from('commercial_proposals').select('*').eq('token', token).single();
    setProposal(data);
    setLoading(false);
  };

  const loadComments = async () => {
    if (!token) return;
    const { data: prop } = await supabase.from('commercial_proposals').select('id').eq('token', token).single();
    if (!prop) return;
    const { data } = await supabase.from('proposal_comments').select('*').eq('proposal_id', prop.id).order('created_at', { ascending: true });
    setComments(data || []);
  };

  const sendComment = async () => {
    if (!commentMsg.trim() || !commentName.trim() || !proposal) return;
    setSending(true);
    await supabase.from('proposal_comments').insert({ proposal_id: proposal.id, author_name: commentName, message: commentMsg });
    setCommentMsg('');
    await loadComments();
    setSending(false);
    toast.success('Comentário enviado!');
  };

  const respondProposal = async (status: 'aceita' | 'recusada') => {
    if (!proposal) return;
    setResponding(true);
    await supabase.from('commercial_proposals').update({ status, client_response_at: new Date().toISOString(), client_response_note: responseNote || null }).eq('id', proposal.id);
    await loadProposal();
    setResponding(false);
    toast.success(status === 'aceita' ? '🎉 Proposta aceita com sucesso!' : 'Proposta recusada.');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(16 82% 98%), hsl(16 82% 95%))' }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-4">
          <img src={pulseLogo} alt="Pulse" className="h-16 animate-pulse" />
          <div className="w-8 h-8 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
        </motion.div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <FileText className="h-12 w-12 mx-auto text-gray-300" />
          <h2 className="text-xl font-bold text-gray-700">Proposta não encontrada</h2>
          <p className="text-gray-500">Este link pode ter expirado ou ser inválido.</p>
        </div>
      </div>
    );
  }

  const proposalType = proposal.proposal_type || 'marketing';
  const plan = proposal.plan_snapshot || {};
  const bonus: any[] = proposal.bonus_services || [];
  const team: any[] = proposal.team_members || [];
  const systemData = proposal.system_data || {};
  const endoData = proposal.endomarketing_data || {};
  const planPrice = plan.price || 0;
  const bonusTotal = bonus.reduce((s: number, b: any) => s + (b.value || 0), 0);
  const monthlyTotal = planPrice + bonusTotal;
  const discount = proposal.custom_discount || 0;
  const isExpired = new Date(proposal.validity_date) < new Date();
  const isResolved = proposal.status === 'aceita' || proposal.status === 'recusada';
  const headerTitle = proposalType === 'sistema' ? 'Proposta de Sistema' : proposalType === 'endomarketing' ? 'Proposta de Endomarketing' : 'Proposta Comercial';

  const accentColor = 'hsl(16 82% 51%)';
  const accentDark = 'hsl(16 82% 38%)';

  // ===== STAT CARD =====
  const StatCard = ({ icon: Icon, value, label, delay = 0 }: { icon: any; value: string | number; label: string; delay?: number }) => (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay }}
      className="rounded-xl p-4 text-center border border-gray-100 hover:shadow-lg transition-shadow"
      style={{ background: 'linear-gradient(135deg, white, hsl(16 82% 98%))' }}
    >
      <Icon className="h-5 w-5 mx-auto mb-2" style={{ color: accentColor }} />
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
    </motion.div>
  );

  // ===== MARKETING =====
  const renderMarketingContent = () => (
    <>
      {plan.name && (
        <AnimatedSection className="px-6 md:px-10 py-8">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="h-5 w-5" style={{ color: accentColor }} />
            <h2 className="text-xl font-bold text-gray-800">Pacote {plan.name}</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">{plan.description || 'Solução completa de marketing digital'}</p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {plan.reels_qty > 0 && <StatCard icon={Film} value={plan.reels_qty} label="Reels/mês" delay={0.1} />}
            {plan.creatives_qty > 0 && <StatCard icon={Palette} value={plan.creatives_qty} label="Criativos" delay={0.15} />}
            {plan.stories_qty > 0 && <StatCard icon={Camera} value={plan.stories_qty} label="Stories" delay={0.2} />}
            {plan.arts_qty > 0 && <StatCard icon={Palette} value={plan.arts_qty} label="Artes" delay={0.25} />}
            {plan.recording_sessions > 0 && <StatCard icon={Film} value={plan.recording_sessions} label="Captações" delay={0.3} />}
            <StatCard icon={BarChart3} value="✓" label="Tráfego Pago" delay={0.35} />
          </div>
        </AnimatedSection>
      )}

      <AnimatedSection className="px-6 md:px-10 pb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Como Funciona</h2>
        <p className="text-xs text-gray-500 mb-4">Nosso processo interno</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {INTERNAL_PROCESS_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={i}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 * i, duration: 0.4 }}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:shadow-md transition-all group"
              >
                <div className="rounded-xl p-2 shrink-0 group-hover:scale-110 transition-transform" style={{ background: 'hsl(16 82% 96%)' }}>
                  <Icon className="h-4 w-4" style={{ color: accentColor }} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-xs text-gray-800">{step.title}</p>
                  <p className="text-[10px] text-gray-500 leading-tight">{step.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </AnimatedSection>

      <AnimatedSection className="px-6 md:px-10 pb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Investimento</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <motion.div whileHover={{ scale: 1.02 }} className="border rounded-2xl p-5 transition-shadow hover:shadow-lg">
            <h3 className="text-base font-bold text-gray-800">Semestral</h3>
            <p className="text-[10px] text-gray-500 mb-3">Contrato de 6 meses</p>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{fmt(monthlyTotal)}<span className="text-xs font-normal text-gray-500">/mês</span></p>
            <div className="mt-3 space-y-0.5 text-[11px] text-gray-500">
              <p>✅ Sem taxa de implementação</p>
              <p>✅ Todos os serviços</p>
              <p>✅ Tráfego pago incluso</p>
              <p>✅ Equipe dedicada</p>
            </div>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="border-2 rounded-2xl p-5 relative overflow-hidden" style={{ borderColor: accentColor }}>
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-3 left-4 px-3 py-0.5 rounded-full text-[10px] font-bold text-white flex items-center gap-1"
              style={{ background: accentColor }}
            >
              <Zap className="h-3 w-3" /> RECOMENDADO
            </motion.div>
            <h3 className="text-base font-bold text-gray-800 mt-3">Anual</h3>
            <p className="text-[10px] text-gray-500 mb-3">12 meses{discount > 0 ? ` · ${discount}% off` : ''}</p>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>
              {fmt(discount > 0 ? monthlyTotal * (1 - discount / 100) : monthlyTotal)}
              <span className="text-xs font-normal text-gray-500">/mês</span>
            </p>
            {discount > 0 && <p className="text-[10px] text-gray-400 line-through">{fmt(monthlyTotal)}/mês</p>}
            <div className="mt-3 space-y-0.5 text-[11px] text-gray-500">
              <p>✅ Tudo do semestral</p>
              {bonus.length > 0 && <p>✅ {bonus.length} bônus exclusivos</p>}
              <p>✅ Portal do cliente</p>
            </div>
            {discount > 0 && (
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: [0.9, 1.02, 1] }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="mt-3 rounded-lg p-2 text-center" style={{ background: 'hsl(142 71% 95%)' }}
              >
                <p className="text-[10px] text-gray-500">Economia anual</p>
                <p className="text-lg font-bold" style={{ color: 'hsl(142 71% 35%)' }}>
                  {fmt(monthlyTotal * 12 - monthlyTotal * 12 * (1 - discount / 100))}
                </p>
              </motion.div>
            )}
          </motion.div>
        </div>
        <div className="mt-3 bg-gray-50 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-gray-600 mb-2">Sem contrato de fidelidade</p>
          <div className="space-y-0.5">
            {Object.entries(IMPLEMENTATION_FEES).map(([k, f]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-gray-600">{f.label}</span>
                <span className="font-semibold">{fmt(f.value)}</span>
              </div>
            ))}
            <div className="border-t pt-1 mt-1 flex justify-between text-xs">
              <span className="font-semibold">Total</span>
              <span className="font-bold" style={{ color: accentColor }}>{fmt(Object.values(IMPLEMENTATION_FEES).reduce((s, f) => s + f.value, 0))}</span>
            </div>
          </div>
        </div>
      </AnimatedSection>
    </>
  );

  // ===== SYSTEM =====
  const renderSystemContent = () => {
    const sysVal = systemData.value || 0;
    const discountedVal = sysVal * (1 - discount / 100);
    const installments = systemData.installments || 1;
    const installmentVal = discountedVal / installments;
    return (
      <>
        {systemData.scope?.length > 0 && (
          <AnimatedSection className="px-6 md:px-10 py-8">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Code className="h-5 w-5" style={{ color: accentColor }} /> Escopo do Projeto
            </h2>
            <div className="space-y-2">
              {systemData.scope.map((item: any, i: number) => (
                <motion.div
                  key={item.id || i}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.08 * i }}
                  className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:shadow-md transition-all"
                >
                  <div className="rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: accentColor }}>{i + 1}</div>
                  <p className="text-sm text-gray-700">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        )}
        {systemData.deliverables?.length > 0 && (
          <AnimatedSection className="px-6 md:px-10 pb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Entregas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {systemData.deliverables.map((item: any, i: number) => (
                <motion.div key={item.id || i} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 * i }}
                  className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accentColor }} />
                  <div>
                    <p className="font-medium text-xs text-gray-800">{item.name}</p>
                    {item.description && <p className="text-[10px] text-gray-500">{item.description}</p>}
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        )}
        <AnimatedSection className="px-6 md:px-10 pb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Investimento</h2>
          <motion.div whileHover={{ scale: 1.01 }} className="border-2 rounded-2xl p-6" style={{ borderColor: accentColor }}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Valor do projeto</span>
                <span className="text-xl font-bold" style={{ color: accentColor }}>{fmt(sysVal)}</span>
              </div>
              {discount > 0 && (
                <>
                  <div className="flex justify-between items-center text-green-600 text-sm">
                    <span>Desconto ({discount}%)</span>
                    <span className="font-bold">-{fmt(sysVal - discountedVal)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="font-bold text-gray-800">Total</span>
                    <motion.span animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1, delay: 0.5 }} className="text-2xl font-bold" style={{ color: accentColor }}>{fmt(discountedVal)}</motion.span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Pagamento</span>
                <span className="font-medium">{PAYMENT_METHODS[systemData.paymentMethod] || systemData.paymentMethod}</span>
              </div>
              {installments > 1 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{installments}x de</span>
                  <span className="font-bold" style={{ color: accentColor }}>{fmt(installmentVal)}</span>
                </div>
              )}
              {systemData.timeline && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Prazo</span>
                  <span className="font-medium">{systemData.timeline}</span>
                </div>
              )}
            </div>
          </motion.div>
          {systemData.additionalCosts && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-yellow-800 mb-1">Custos adicionais</p>
              <p className="text-xs text-yellow-700 whitespace-pre-wrap">{systemData.additionalCosts}</p>
            </div>
          )}
        </AnimatedSection>
      </>
    );
  };

  // ===== ENDO =====
  const renderEndoContent = () => {
    const endoVal = endoData.monthlyValue || 0;
    const discountedVal = endoVal * (1 - discount / 100);
    return (
      <>
        <AnimatedSection className="px-6 md:px-10 py-8">
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Megaphone className="h-5 w-5" style={{ color: accentColor }} /> Plano de Endomarketing
          </h2>
          {endoData.plan && (
            <motion.div whileHover={{ scale: 1.01 }} className="rounded-xl p-4 mb-4" style={{ background: `linear-gradient(135deg, hsl(16 82% 96%), hsl(16 82% 92%))` }}>
              <p className="font-bold text-lg text-gray-800">
                {endoData.plan === 'presenca_completa' ? 'Presença Completa' : endoData.plan === 'gravacao_concentrada' ? 'Gravação Concentrada' : endoData.plan}
              </p>
            </motion.div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={Clock} value={endoData.daysPerWeek || 3} label="Dias/semana" delay={0.1} />
            <StatCard icon={Film} value={`${endoData.sessionDuration || 2}h`} label="Por sessão" delay={0.2} />
            <StatCard icon={Camera} value={endoData.storiesPerDay || 5} label="Stories/dia" delay={0.3} />
          </div>
          {endoData.description && <p className="text-sm text-gray-600 mt-4">{endoData.description}</p>}
        </AnimatedSection>
        <AnimatedSection className="px-6 md:px-10 pb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Investimento</h2>
          <motion.div whileHover={{ scale: 1.01 }} className="border-2 rounded-2xl p-6" style={{ borderColor: accentColor }}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Valor mensal</span>
                <span className="text-2xl font-bold" style={{ color: accentColor }}>{fmt(endoVal)}<span className="text-xs font-normal text-gray-500">/mês</span></span>
              </div>
              {discount > 0 && (
                <>
                  <div className="flex justify-between items-center text-green-600 text-sm">
                    <span>Desconto ({discount}%)</span>
                    <span className="font-bold">-{fmt(endoVal - discountedVal)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="font-bold text-gray-800">Total mensal</span>
                    <span className="text-2xl font-bold" style={{ color: accentColor }}>{fmt(discountedVal)}<span className="text-xs font-normal text-gray-500">/mês</span></span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </AnimatedSection>
      </>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, hsl(16 82% 97%), #f8f8f8)' }}>
      <Toaster position="top-center" />

      {/* Status banner */}
      {proposal.status === 'aceita' && (
        <motion.div initial={{ y: -50 }} animate={{ y: 0 }} className="bg-green-500 text-white text-center py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Proposta aceita em {format(new Date(proposal.client_response_at), "dd/MM/yyyy 'às' HH:mm")}
        </motion.div>
      )}
      {proposal.status === 'recusada' && (
        <motion.div initial={{ y: -50 }} animate={{ y: 0 }} className="bg-red-500 text-white text-center py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
          <ThumbsDown className="h-4 w-4" /> Proposta recusada em {format(new Date(proposal.client_response_at), "dd/MM/yyyy 'às' HH:mm")}
        </motion.div>
      )}
      {isExpired && proposal.status === 'pendente' && (
        <div className="bg-yellow-500 text-white text-center py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
          <Clock className="h-4 w-4" /> Proposta expirou em {format(new Date(proposal.validity_date), "dd/MM/yyyy")}
        </div>
      )}

      <div className="max-w-[800px] mx-auto">
        {/* Main card */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white shadow-2xl overflow-hidden"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {/* Header */}
          <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentDark})` }}>
            {/* Animated shapes */}
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }} className="absolute -top-20 -right-20 w-60 h-60 rounded-full border-[40px] border-white/10" />
            <motion.div animate={{ rotate: -360 }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }} className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full border-[30px] border-white/5" />
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity }} className="absolute top-10 right-10 w-20 h-20 rounded-full bg-white/5" />

            <div className="relative p-6 md:p-10 text-white">
              <motion.img
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, type: 'spring' }}
                src={pulseLogo}
                alt="Pulse Growth Marketing"
                className="h-12 md:h-14 mb-5 drop-shadow-2xl"
              />
              <motion.h1
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="text-2xl md:text-3xl font-bold mb-1"
              >
                {headerTitle}
              </motion.h1>
              <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
                <p className="text-white/80 text-sm">Preparada exclusivamente para</p>
                <p className="text-xl font-bold mt-0.5">{proposal.client_company || 'Sua Empresa'}</p>
                <p className="text-white/70 text-sm mt-0.5">Aos cuidados de {proposal.client_name || 'Cliente'}</p>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-4 flex gap-4 text-xs text-white/60">
                <span>📅 {format(new Date(proposal.created_at), "dd/MM/yyyy")}</span>
                <span>⏰ Válida até {format(new Date(proposal.validity_date), "dd/MM/yyyy")}</span>
              </motion.div>
            </div>
          </div>

          {/* Client logos marquee - Social proof */}
          <ClientLogosMarquee clients={clients} />

          {/* Type-specific content */}
          {proposalType === 'marketing' && renderMarketingContent()}
          {proposalType === 'sistema' && renderSystemContent()}
          {proposalType === 'endomarketing' && renderEndoContent()}

          {/* Bonus */}
          {bonus.length > 0 && (
            <AnimatedSection className="px-6 md:px-10 pb-6">
              <motion.div whileHover={{ scale: 1.01 }} className="rounded-2xl p-5 overflow-hidden relative" style={{ background: `linear-gradient(135deg, hsl(16 82% 96%), hsl(16 82% 92%))` }}>
                <motion.div animate={{ x: ['-100%', '200%'] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                  <Gift className="h-5 w-5" style={{ color: accentColor }} /> Bônus Exclusivos
                </h3>
                <p className="text-[10px] text-gray-500 mb-3">
                  ⚠️ Válidos até {format(new Date(proposal.validity_date), "dd/MM/yyyy")}
                </p>
                <div className="space-y-1.5">
                  {bonus.map((b: any, i: number) => (
                    <motion.div key={i} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 * i }}
                      className="flex items-center justify-between bg-white/70 rounded-xl p-3 hover:bg-white transition-colors"
                    >
                      <div>
                        <p className="font-medium text-xs text-gray-800">✨ {b.name}</p>
                        {b.description && <p className="text-[10px] text-gray-500">{b.description}</p>}
                      </div>
                      <Badge variant="secondary" className="font-bold text-[10px]" style={{ color: accentColor }}>
                        {b.value > 0 ? fmt(b.value) : '🎁 GRÁTIS'}
                      </Badge>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatedSection>
          )}

          {/* Team */}
          {team.length > 0 && (
            <AnimatedSection className="px-6 md:px-10 pb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Users className="h-5 w-5" style={{ color: accentColor }} /> Sua Equipe Dedicada
              </h2>
              <p className="text-xs text-gray-500 mb-3">Profissionais do seu projeto</p>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {team.map((m: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.08 * i }}
                    whileHover={{ y: -4, scale: 1.03 }}
                    className="border border-gray-100 rounded-xl p-3 text-center hover:shadow-lg transition-shadow"
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt={m.name} className="w-10 h-10 rounded-full mx-auto mb-1.5 object-cover border-2" style={{ borderColor: 'hsl(16 82% 80%)' }} />
                    ) : (
                      <div className="w-10 h-10 rounded-full mx-auto mb-1.5 flex items-center justify-center text-white font-bold text-xs" style={{ background: accentColor }}>
                        {m.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <p className="font-semibold text-[11px] text-gray-800 truncate">{m.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">{m.role}</p>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          )}

          {/* Observations */}
          {proposal.observations && (
            <AnimatedSection className="px-6 md:px-10 pb-6">
              <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-4">{proposal.observations}</p>
            </AnimatedSection>
          )}

          {/* Footer */}
          <div className="p-6 md:p-8 text-center relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentDark})` }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }} className="absolute -top-10 -right-10 w-32 h-32 rounded-full border-[20px] border-white/5" />
            <img src={pulseLogo} alt="Pulse Growth Marketing" className="h-14 mx-auto mb-3 brightness-0 invert drop-shadow-lg" />
            <p className="text-white/80 text-xs">Transformando marcas em movimentos.</p>
            <p className="text-white/50 text-[10px] mt-1">Válida até {format(new Date(proposal.validity_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
            <p className="text-white/40 text-[10px] mt-0.5">© {new Date().getFullYear()} Pulse Growth Marketing</p>
          </div>
        </motion.div>

        {/* === INTERACTIVE SECTION === */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="bg-white shadow-xl mt-3 rounded-2xl p-5 md:p-7 space-y-5"
        >
          {!isResolved && !isExpired && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <Star className="h-5 w-5" style={{ color: accentColor }} />
                O que deseja fazer?
              </h3>
              <Textarea placeholder="Deixe uma observação (opcional)..." value={responseNote} onChange={e => setResponseNote(e.target.value)} rows={2} className="border-gray-200 rounded-xl" />
              <div className="flex gap-2">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex-1">
                  <Button onClick={() => respondProposal('aceita')} disabled={responding} className="w-full text-white font-bold py-5 text-sm rounded-xl" style={{ background: 'hsl(142 71% 45%)' }}>
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    {responding ? 'Enviando...' : 'Aceitar Proposta'}
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex-1">
                  <Button onClick={() => respondProposal('recusada')} disabled={responding} variant="outline" className="w-full py-5 text-sm rounded-xl border-red-300 text-red-600 hover:bg-red-50">
                    <ThumbsDown className="h-4 w-4 mr-2" /> Recusar
                  </Button>
                </motion.div>
              </div>
            </div>
          )}

          {isResolved && proposal.client_response_note && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 mb-1">Observação do cliente:</p>
              <p className="text-sm text-gray-700">{proposal.client_response_note}</p>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <MessageCircle className="h-5 w-5" style={{ color: accentColor }} /> Comentários e Dúvidas
            </h3>
            {comments.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {comments.map(c => (
                  <div key={c.id} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: accentColor }}>
                        {c.author_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-xs font-semibold text-gray-700">{c.author_name}</span>
                      <span className="text-[9px] text-gray-400">{format(new Date(c.created_at), "dd/MM HH:mm")}</span>
                    </div>
                    <p className="text-xs text-gray-600 pl-7">{c.message}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Input placeholder="Seu nome" value={commentName} onChange={e => setCommentName(e.target.value)} className="border-gray-200 rounded-xl" />
              <div className="flex gap-2">
                <Textarea placeholder="Escreva sua dúvida..." value={commentMsg} onChange={e => setCommentMsg(e.target.value)} rows={2} className="flex-1 border-gray-200 rounded-xl" />
                <Button onClick={sendComment} disabled={sending || !commentMsg.trim() || !commentName.trim()} className="self-end text-white rounded-xl" style={{ background: accentColor }}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* WhatsApp floating */}
        {proposal.whatsapp_number && (
          <motion.a
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: 'spring' }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            href={`https://wa.me/${proposal.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Estou vendo a proposta comercial para ${proposal.client_company}. Gostaria de tirar uma dúvida.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 w-14 h-14 bg-green-500 rounded-full shadow-lg flex items-center justify-center z-50"
          >
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-white fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </motion.a>
        )}

        <div className="h-16" />
      </div>

      {/* Marquee CSS */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
          width: max-content;
        }
      `}</style>
    </div>
  );
}
