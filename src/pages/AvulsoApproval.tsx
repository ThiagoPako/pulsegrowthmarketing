import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, RotateCcw, Rocket, Video, Palette, Users, BarChart3, Shield, Calendar, Star, Sparkles, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';

const WHATSAPP_CTA = 'https://wa.me/5562985382981?text=Olá!%20Vi%20meu%20vídeo%20avulso%20e%20quero%20saber%20mais%20sobre%20os%20planos%20da%20Pulse!';

const TEAM_MEMBERS = [
  { name: 'Victor Morais', role: 'CEO & Estrategista', emoji: '🚀' },
  { name: 'Fabyely', role: 'Videomaker', emoji: '🎬' },
  { name: 'Time de Editores', role: 'Pós-Produção', emoji: '✂️' },
  { name: 'Time de Design', role: 'Identidade Visual', emoji: '🎨' },
  { name: 'Social Media', role: 'Gestão de Conteúdo', emoji: '📱' },
];

const BENEFITS = [
  { icon: Video, title: 'Gravações Profissionais', desc: 'Videomaker dedicado com equipamento profissional' },
  { icon: Palette, title: 'Design Exclusivo', desc: 'Artes, thumbnails e identidade visual personalizada' },
  { icon: BarChart3, title: 'Tráfego Pago', desc: 'Gestão de anúncios no Meta Ads e Google Ads' },
  { icon: Users, title: 'Portal do Cliente', desc: 'Acompanhe tudo em tempo real pela sua Área do Cliente' },
  { icon: Calendar, title: 'Calendário Editorial', desc: 'Planejamento estratégico semanal de conteúdo' },
  { icon: Shield, title: 'Equipe Completa', desc: 'Videomaker, Editor, Designer, Social Media e Gestor de Tráfego' },
];

export default function AvulsoApproval() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    supabase.from('content_tasks')
      .select('*, recordings(prospect_name)')
      .eq('id', taskId)
      .single()
      .then(({ data }) => {
        setTask(data);
        setLoading(false);
      });
  }, [taskId]);

  const handleApprove = async () => {
    if (!taskId) return;
    setSubmitting(true);
    await supabase.from('content_tasks').update({
      kanban_column: 'arquivado',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', taskId);
    await supabase.from('task_history').insert({
      task_id: taskId,
      action: 'Cliente avulso aprovou o vídeo',
    });
    setApproved(true);
    setSubmitting(false);
    toast.success('Vídeo aprovado com sucesso!');
  };

  const handleRequestRevision = async () => {
    if (!taskId || !revisionNotes.trim()) return;
    setSubmitting(true);
    await supabase.from('content_tasks').update({
      kanban_column: 'alteracao',
      adjustment_notes: revisionNotes,
      updated_at: new Date().toISOString(),
    } as any).eq('id', taskId);
    await supabase.from('task_history').insert({
      task_id: taskId,
      action: 'Cliente avulso solicitou revisão',
      details: revisionNotes,
    });
    setSubmitting(false);
    setShowRevisionForm(false);
    toast.success('Solicitação de revisão enviada! Nosso editor vai ajustar seu vídeo.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center text-white">
        <p>Vídeo não encontrado.</p>
      </div>
    );
  }

  const videoUrl = task.edited_video_link;
  const prospectName = (task.recordings as any)?.prospect_name || task.title;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Header */}
      <header className="py-6 px-4 border-b border-white/10">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            <Rocket className="w-8 h-8 text-orange-400" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Pulse <span className="text-orange-400">Growth Marketing</span>
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-10">
        {approved ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-20"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
            >
              <Check className="w-12 h-12 text-green-400" />
            </motion.div>
            <h2 className="text-3xl font-bold mb-3">Vídeo Aprovado! 🎉</h2>
            <p className="text-gray-400 text-lg">Obrigado pela aprovação. Seu vídeo está pronto para uso!</p>
          </motion.div>
        ) : (
          <>
            {/* Video Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-8"
            >
              <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Seu vídeo está pronto! 🎬
              </h2>
              <p className="text-gray-400 text-lg">
                Olá, <span className="text-orange-400 font-semibold">{prospectName}</span>! Confira seu conteúdo abaixo.
              </p>
            </motion.div>

            {/* Video Player with Pulse Frame */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="relative mx-auto max-w-2xl mb-10"
            >
              {/* Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/30 via-orange-400/20 to-orange-500/30 rounded-2xl blur-lg" />

              <div className="relative bg-gray-900 rounded-2xl overflow-hidden border-2 border-orange-500/40">
                {/* Top Bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500">
                  <div className="flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-white" />
                    <span className="text-sm font-bold text-white tracking-wide">PULSE GROWTH MARKETING</span>
                  </div>
                  <span className="text-xs text-white/80">Conteúdo Exclusivo</span>
                </div>

                {/* Video */}
                {videoUrl ? (
                  <div className="aspect-[9/16] max-h-[70vh] bg-black">
                    <video
                      src={videoUrl}
                      controls
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  </div>
                ) : (
                  <div className="aspect-[9/16] max-h-[70vh] bg-gray-800 flex items-center justify-center">
                    <p className="text-gray-500">Vídeo em processamento...</p>
                  </div>
                )}

                {/* Bottom Bar */}
                <div className="px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-900 flex items-center justify-between">
                  <span className="text-xs text-gray-400">{task.title}</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
                    <span className="text-xs text-orange-400">Qualidade Pulse</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto mb-6"
            >
              {/* Approve Button - Glowing */}
              <motion.div className="relative w-full sm:w-auto">
                <motion.div
                  className="absolute -inset-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 rounded-xl opacity-75 blur-md"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                />
                <Button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="relative w-full sm:w-auto bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold px-10 py-6 text-lg rounded-xl shadow-2xl"
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="mr-2"
                  >
                    <Check className="w-6 h-6" />
                  </motion.div>
                  Aprovar Vídeo ✅
                </Button>
              </motion.div>

              {/* Revision Button */}
              <Button
                onClick={() => setShowRevisionForm(!showRevisionForm)}
                variant="outline"
                className="w-full sm:w-auto border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white px-8 py-6 text-base rounded-xl"
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
                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-4">
                    <p className="text-sm text-gray-300">Descreva o que gostaria de ajustar:</p>
                    <Textarea
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                      placeholder="Ex: Gostaria que o texto final fosse diferente, a música mais suave..."
                      className="bg-gray-900 border-gray-700 text-white min-h-[100px]"
                    />
                    <Button
                      onClick={handleRequestRevision}
                      disabled={submitting || !revisionNotes.trim()}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      Enviar Solicitação de Revisão
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Divider */}
        <div className="relative my-16">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-gray-950 px-6 text-gray-500 text-sm flex items-center gap-2">
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
          className="space-y-12"
        >
          <div className="text-center space-y-4">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Imagine ter uma{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
                equipe completa
              </span>{' '}
              trabalhando para você
            </motion.h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Na Pulse, você não contrata apenas um serviço. Você ganha um time inteiro dedicado ao crescimento do seu negócio.
            </p>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5 hover:border-orange-500/30 transition-colors"
              >
                <b.icon className="w-8 h-8 text-orange-400 mb-3" />
                <h3 className="font-bold text-white mb-1">{b.title}</h3>
                <p className="text-sm text-gray-400">{b.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Team Section */}
          <div className="bg-gradient-to-r from-gray-800/30 to-gray-900/30 border border-gray-800 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-center mb-6" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Nossa Equipe 👥
            </h3>
            <div className="flex flex-wrap justify-center gap-6">
              {TEAM_MEMBERS.map((m, i) => (
                <motion.div
                  key={m.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-2xl mb-2 mx-auto">
                    {m.emoji}
                  </div>
                  <p className="font-semibold text-white text-sm">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.role}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-6 py-8"
          >
            <h3 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Pronto para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
                crescer de verdade
              </span>
              ?
            </h3>
            <p className="text-gray-400 max-w-lg mx-auto">
              Junte-se aos nossos clientes que já estão transformando seus resultados com a Pulse Growth Marketing.
            </p>

            <motion.div className="relative inline-block">
              <motion.div
                className="absolute -inset-2 bg-gradient-to-r from-orange-500/40 via-orange-400/30 to-orange-500/40 rounded-2xl blur-xl"
                animate={{ opacity: [0.4, 1, 0.4], scale: [0.98, 1.02, 0.98] }}
                transition={{ repeat: Infinity, duration: 3 }}
              />
              <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer">
                <Button className="relative bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold px-12 py-7 text-xl rounded-2xl shadow-2xl">
                  <MessageCircle className="w-6 h-6 mr-3" />
                  Vem fazer parte da Pulse 🚀
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-gray-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Rocket className="w-4 h-4 text-orange-400" />
          <span>Pulse Growth Marketing</span>
        </div>
        <p>Minaçu - GO | © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
