import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, RotateCcw, Rocket, Video, Palette, Users, BarChart3,
  Shield, Calendar, Star, Sparkles, MessageCircle, Download,
  Camera, TrendingUp, MonitorPlay, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { avulsoAction } from '@/lib/portalApi';
import { toast } from 'sonner';
import pulseLogo from '@/assets/pulse-logo.png';

const VPS_API_BASE = 'https://agenciapulse.tech/api';
const WHATSAPP_CTA = 'https://wa.me/5562985382981?text=Olá!%20Vi%20meu%20vídeo%20avulso%20e%20quero%20saber%20mais%20sobre%20os%20planos%20da%20Pulse!';

const ROLE_LABELS: Record<string, string> = {
  admin: 'CEO & Estrategista',
  videomaker: 'Videomaker',
  editor: 'Editor de Vídeo',
  designer: 'Designer Gráfico',
  social_media: 'Social Media',
  parceiro: 'Parceiro',
  endomarketing: 'Endomarketing',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'from-orange-500 to-amber-500',
  videomaker: 'from-pink-500 to-rose-500',
  editor: 'from-purple-500 to-violet-500',
  designer: 'from-emerald-500 to-teal-500',
  social_media: 'from-yellow-500 to-orange-500',
  parceiro: 'from-blue-500 to-cyan-500',
  endomarketing: 'from-indigo-500 to-blue-500',
};

const ROLE_EMOJIS: Record<string, string> = {
  admin: '🚀',
  videomaker: '🎬',
  editor: '✂️',
  designer: '🎨',
  social_media: '📱',
  parceiro: '🤝',
  endomarketing: '📊',
};

const BENEFITS = [
  { icon: Video, title: 'Gravações Profissionais', desc: 'Videomaker dedicado com equipamento cinematográfico' },
  { icon: Palette, title: 'Design Exclusivo', desc: 'Artes, thumbnails e identidade visual sob medida' },
  { icon: BarChart3, title: 'Tráfego Pago', desc: 'Gestão estratégica de Meta Ads e Google Ads' },
  { icon: MonitorPlay, title: 'Portal do Cliente', desc: 'Acompanhe tudo em tempo real pela sua área exclusiva' },
  { icon: Calendar, title: 'Calendário Editorial', desc: 'Planejamento estratégico semanal de conteúdo' },
  { icon: Shield, title: 'Equipe Completa', desc: 'Videomaker, Editor, Designer, Social Media e Tráfego' },
  { icon: Camera, title: 'Ensaio Fotográfico', desc: 'Fotos profissionais para feed e campanhas' },
  { icon: TrendingUp, title: 'Relatórios', desc: 'Métricas detalhadas e análise de resultados' },
];

interface TeamMember {
  name: string;
  role: string;
  avatar_url?: string;
}

interface ClientLogo {
  id: string;
  company_name: string;
  logo_url: string | null;
  color: string;
}

export default function AvulsoApproval() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clientLogos, setClientLogos] = useState<ClientLogo[]>([]);

  useEffect(() => {
    if (!taskId) return;
    const loadTask = async () => {
      const result = await avulsoAction({ action: 'get_task', task_id: taskId });
      if (result.error) {
        toast.error(result.error);
      } else if (result.task) {
        setTask(result.task);
      }
      setLoading(false);
    };
    loadTask();

    // Load team and clients via public avulso endpoint
    const loadExtras = async () => {
      try {
        const [teamRes, clientsRes] = await Promise.all([
          avulsoAction({ action: 'get_team' }),
          avulsoAction({ action: 'get_client_logos' }),
        ]);
        if (Array.isArray(teamRes?.team)) setTeamMembers(teamRes.team.filter((m: any) => m.name && m.role));
        if (Array.isArray(clientsRes?.clients)) setClientLogos(clientsRes.clients.filter((c: any) => c.logo_url));
      } catch (e) {
        console.warn('Failed to load extras:', e);
      }
    };
    loadExtras();
  }, [taskId]);

  const handleApprove = async () => {
    if (!taskId) return;
    setSubmitting(true);
    const result = await avulsoAction({ action: 'approve', task_id: taskId });
    if (result.error) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    setApproved(true);
    setSubmitting(false);
    toast.success('Vídeo aprovado com sucesso!');
  };

  const handleRequestRevision = async () => {
    if (!taskId || !revisionNotes.trim()) return;
    setSubmitting(true);
    const result = await avulsoAction({
      action: 'request_revision',
      task_id: taskId,
      message: revisionNotes,
    });
    if (result.error) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    setSubmitting(false);
    setShowRevisionForm(false);
    toast.success('Solicitação de revisão enviada! Nosso editor vai ajustar seu vídeo.');
  };

  const handleDownload = () => {
    if (!task?.edited_video_link) return;
    const a = document.createElement('a');
    a.href = task.edited_video_link;
    a.download = `${task.title || 'video-pulse'}.mp4`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4">
        <motion.img
          src={pulseLogo}
          alt="Pulse"
          className="w-16 h-16"
          animate={{ rotate: [0, 360] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        />
        <div className="w-10 h-10 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <Rocket className="w-12 h-12 text-orange-400 mx-auto" />
          <p className="text-xl">Vídeo não encontrado.</p>
        </div>
      </div>
    );
  }

  const videoUrl = task.edited_video_link;
  const prospectName = task.prospect_name || task.title;

  // Filter unique team roles for display
  const displayTeam = teamMembers.length > 0
    ? teamMembers
    : [
        { name: 'Victor Morais', role: 'admin' },
        { name: 'Fabiely', role: 'videomaker' },
        { name: 'Victor Oliveira', role: 'editor' },
        { name: 'Adriely', role: 'designer' },
        { name: 'Rayssa', role: 'social_media' },
        { name: 'Thiago', role: 'admin' },
      ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-600/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative py-5 px-4 border-b border-white/5 backdrop-blur-sm bg-black/30 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-3">
          <motion.img
            src={pulseLogo}
            alt="Pulse Growth Marketing"
            className="w-10 h-10"
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          />
          <h1 className="text-xl md:text-2xl font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Pulse <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">Growth Marketing</span>
          </h1>
        </div>
      </header>

      {/* Main */}
      <main className="relative max-w-5xl mx-auto px-4 py-8 md:py-12">
        {approved ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-16 space-y-8"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center"
            >
              <Check className="w-14 h-14 text-green-400" />
            </motion.div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Vídeo Aprovado! 🎉
              </h2>
              <p className="text-gray-400 text-lg">Obrigado pela aprovação. Seu vídeo está pronto para uso!</p>
            </div>
            {videoUrl && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <Button
                  onClick={handleDownload}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold px-10 py-6 text-lg rounded-xl shadow-2xl shadow-orange-500/20"
                >
                  <Download className="w-6 h-6 mr-3" />
                  Baixar Vídeo
                </Button>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <>
            {/* Title */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8 md:mb-10">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 mb-4"
              >
                <Award className="w-4 h-4 text-orange-400" />
                <span className="text-sm text-orange-300 font-medium">Conteúdo Exclusivo</span>
              </motion.div>
              <h2 className="text-2xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Seu vídeo está pronto! 🎬
              </h2>
              <p className="text-gray-400 text-base md:text-lg">
                Olá, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400 font-bold">{prospectName}</span>! Confira seu conteúdo abaixo.
              </p>
            </motion.div>

            {/* Video Player */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', bounce: 0.3 }}
              className="relative mx-auto w-full max-w-sm md:max-w-md mb-10"
            >
              {/* Animated glow border */}
              <motion.div
                className="absolute -inset-2 md:-inset-3 rounded-3xl"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #f59e0b, #ef4444, #f97316, #f59e0b)',
                  backgroundSize: '300% 300%',
                }}
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute -inset-4 md:-inset-6 rounded-3xl blur-2xl"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #f59e0b, #ef4444, #f97316)',
                  backgroundSize: '300% 300%',
                }}
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  opacity: [0.2, 0.5, 0.2],
                }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
              />

              <div className="relative bg-[#111118] rounded-2xl overflow-hidden border border-orange-500/50">
                <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500">
                  <div className="flex items-center gap-2">
                    <img src={pulseLogo} alt="Pulse" className="w-5 h-5" />
                    <span className="text-xs md:text-sm font-bold text-white tracking-wider">PULSE GROWTH</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-white fill-white" />
                    <span className="text-[10px] md:text-xs text-white/90 font-medium">Premium</span>
                  </div>
                </div>

                {videoUrl ? (
                  <div className="aspect-[9/16] bg-black flex items-center justify-center">
                    <video src={videoUrl} controls className="w-full h-full object-contain" playsInline />
                  </div>
                ) : (
                  <div className="aspect-[9/16] bg-[#111118] flex flex-col items-center justify-center gap-3">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}>
                      <Video className="w-10 h-10 text-orange-400/50" />
                    </motion.div>
                    <p className="text-gray-600 text-sm">Vídeo em processamento...</p>
                  </div>
                )}

                <div className="px-3 md:px-4 py-2.5 bg-gradient-to-r from-[#111118] to-[#0d0d14] flex items-center justify-between">
                  <span className="text-xs text-gray-500 truncate max-w-[60%]">{task.title}</span>
                  <div className="flex items-center gap-1.5">
                    <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                      <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
                    </motion.div>
                    <span className="text-[10px] text-orange-400/80 font-medium">Qualidade Pulse</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-lg mx-auto mb-8"
            >
              <motion.div className="relative w-full sm:w-auto">
                <motion.div
                  className="absolute -inset-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 rounded-2xl blur-lg"
                  animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.98, 1.02, 0.98] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                />
                <Button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="relative w-full sm:w-auto bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold px-12 py-7 text-lg rounded-2xl shadow-2xl shadow-green-500/25 border-0"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="mr-2"
                  >
                    <Check className="w-7 h-7" />
                  </motion.div>
                  Aprovar Vídeo ✅
                </Button>
              </motion.div>

              <Button
                onClick={() => setShowRevisionForm(!showRevisionForm)}
                variant="outline"
                className="w-full sm:w-auto border-gray-700 text-gray-400 hover:bg-white/5 hover:text-white hover:border-orange-500/30 px-8 py-7 text-base rounded-2xl transition-all duration-300"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                Solicitar Revisão
              </Button>
            </motion.div>

            {/* Revision Form */}
            <AnimatePresence>
              {showRevisionForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="max-w-md mx-auto mb-10 overflow-hidden"
                >
                  <div className="bg-white/5 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-5 space-y-4">
                    <p className="text-sm text-gray-300 font-medium">Descreva o que gostaria de ajustar:</p>
                    <Textarea
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                      placeholder="Ex: Gostaria que o texto final fosse diferente, a música mais suave..."
                      className="bg-black/40 border-gray-700/50 text-white min-h-[100px] rounded-xl focus:border-orange-500/50"
                    />
                    <Button
                      onClick={handleRequestRevision}
                      disabled={submitting || !revisionNotes.trim()}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl py-5"
                    >
                      Enviar Solicitação de Revisão
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* ===== CLIENT LOGOS CAROUSEL ===== */}
        {clientLogos.length > 0 && (
          <div className="relative my-16 overflow-hidden">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-400/60 font-semibold mb-2">Empresas que confiam na Pulse</p>
              <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent mx-auto" />
            </div>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#0a0a0f] to-transparent z-10" />
              <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#0a0a0f] to-transparent z-10" />
              <motion.div
                className="flex gap-8 items-center"
                animate={{ x: ['0%', '-50%'] }}
                transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
              >
                {[...clientLogos, ...clientLogos].map((client, i) => (
                  <div
                    key={`${client.id}-${i}`}
                    className="flex-shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center p-3 hover:border-orange-500/30 transition-colors"
                    title={client.company_name}
                  >
                    {client.logo_url ? (
                      <img
                        src={client.logo_url}
                        alt={client.company_name}
                        className="w-full h-full object-contain rounded-lg"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[10px] text-gray-500 text-center leading-tight">{client.company_name}</span>
                    )}
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="relative my-12">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/5" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#0a0a0f] px-6 text-gray-600 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-400" />
              Conheça a Pulse
              <Sparkles className="w-4 h-4 text-orange-400" />
            </span>
          </div>
        </div>

        {/* Promotion Section */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="space-y-14"
        >
          <div className="text-center space-y-4">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-2xl md:text-4xl font-bold leading-tight"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Imagine ter uma{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500">
                equipe completa
              </span>{' '}
              trabalhando para você
            </motion.h2>
            <p className="text-gray-500 text-base md:text-lg max-w-2xl mx-auto">
              Na Pulse, você não contrata apenas um serviço. Você ganha um time inteiro dedicado ao crescimento do seu negócio.
            </p>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ scale: 1.03, y: -2 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/10 flex items-center justify-center mb-3 group-hover:from-orange-500/30 transition-colors">
                  <b.icon className="w-5 h-5 text-orange-400" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1">{b.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Team Section - Real Data */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 via-transparent to-transparent rounded-3xl" />
            <div className="relative bg-white/[0.02] border border-white/[0.06] rounded-3xl p-6 md:p-10">
              <div className="text-center mb-8">
                <h3 className="text-2xl md:text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Nossa Equipe 🔥
                </h3>
                <p className="text-gray-500 text-sm">Profissionais dedicados ao seu crescimento</p>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4 md:gap-6">
                {displayTeam.map((m, i) => (
                  <motion.div
                    key={`${m.name}-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.1 }}
                    className="text-center"
                  >
                    <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br ${ROLE_COLORS[m.role] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-xl md:text-2xl mb-2 mx-auto shadow-lg overflow-hidden`}>
                      {m.avatar_url && m.avatar_url.startsWith('http') ? (
                        <img src={m.avatar_url} alt={m.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{ROLE_EMOJIS[m.role] || '👤'}</span>
                      )}
                    </div>
                    <p className="font-semibold text-white text-xs md:text-sm">{m.name}</p>
                    <p className="text-[10px] md:text-xs text-gray-500">{ROLE_LABELS[m.role] || m.role}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-6 py-10"
          >
            <h3 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Pronto para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500">
                crescer de verdade
              </span>
              ?
            </h3>
            <p className="text-gray-500 max-w-lg mx-auto text-sm md:text-base">
              Junte-se aos nossos clientes que já estão transformando seus resultados.
            </p>

            <motion.div className="relative inline-block">
              <motion.div
                className="absolute -inset-3 rounded-2xl blur-xl"
                style={{ background: 'linear-gradient(135deg, #f97316, #f59e0b, #ef4444)' }}
                animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.97, 1.03, 0.97] }}
                transition={{ repeat: Infinity, duration: 3 }}
              />
              <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer">
                <Button className="relative bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold px-10 md:px-14 py-6 md:py-7 text-lg md:text-xl rounded-2xl shadow-2xl shadow-orange-500/25 border-0">
                  <MessageCircle className="w-6 h-6 mr-3" />
                  Vem fazer parte da Pulse 🚀
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 bg-black/30">
        <div className="max-w-5xl mx-auto px-4 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <img src={pulseLogo} alt="Pulse" className="w-6 h-6" loading="lazy" />
            <span className="text-gray-500 font-medium text-sm">Pulse Growth Marketing</span>
          </div>
          <p className="text-gray-600 text-xs">Minaçu - GO | © {new Date().getFullYear()} — Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  );
}
