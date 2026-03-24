import { useState, useEffect } from 'react';
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
import {
  Rocket, Film, Palette, Camera, Monitor, Share2, BarChart3,
  CheckCircle2, Gift, FileText, Scissors, Users, MessageCircle,
  ThumbsUp, ThumbsDown, Clock, Send
} from 'lucide-react';

const INTERNAL_PROCESS_STEPS = [
  { icon: Camera, title: 'Captação de Conteúdo', description: 'Gravação profissional com videomaker dedicado conforme calendário' },
  { icon: Scissors, title: 'Edição Profissional', description: 'Edição de vídeos com tratamento de cor, legendas e efeitos' },
  { icon: Palette, title: 'Design Gráfico', description: 'Criação de artes, criativos e identidade visual para redes' },
  { icon: FileText, title: 'Roteirização', description: 'Planejamento estratégico de conteúdo e criação de roteiros' },
  { icon: Share2, title: 'Gestão de Redes', description: 'Publicação, programação e gerenciamento das redes sociais' },
  { icon: BarChart3, title: 'Tráfego Pago', description: 'Gestão de campanhas patrocinadas para aumentar resultados' },
  { icon: Monitor, title: 'Portal do Cliente', description: 'Acesso exclusivo para acompanhar aprovações e resultados' },
];

const IMPLEMENTATION_FEES = {
  adAccounts: { label: 'Implementação de contas de anúncios', value: 800 },
  profileRedesign: { label: 'Reformulação de perfil', value: 750 },
  internalIntegration: { label: 'Integração interna, editorial e portal do cliente', value: 1250 },
};

export default function ProposalViewer() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<any>(null);
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
    const interval = setInterval(loadComments, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const loadProposal = async () => {
    const { data } = await supabase
      .from('commercial_proposals')
      .select('*')
      .eq('token', token)
      .single();
    setProposal(data);
    setLoading(false);
  };

  const loadComments = async () => {
    if (!token) return;
    const { data: prop } = await supabase
      .from('commercial_proposals')
      .select('id')
      .eq('token', token)
      .single();
    if (!prop) return;
    const { data } = await supabase
      .from('proposal_comments')
      .select('*')
      .eq('proposal_id', prop.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
  };

  const sendComment = async () => {
    if (!commentMsg.trim() || !commentName.trim() || !proposal) return;
    setSending(true);
    await supabase.from('proposal_comments').insert({
      proposal_id: proposal.id,
      author_name: commentName,
      message: commentMsg,
    });
    setCommentMsg('');
    await loadComments();
    setSending(false);
    toast.success('Comentário enviado!');
  };

  const respondProposal = async (status: 'aceita' | 'recusada') => {
    if (!proposal) return;
    setResponding(true);
    await supabase.from('commercial_proposals')
      .update({
        status,
        client_response_at: new Date().toISOString(),
        client_response_note: responseNote || null,
      })
      .eq('id', proposal.id);
    await loadProposal();
    setResponding(false);
    toast.success(status === 'aceita' ? '🎉 Proposta aceita com sucesso!' : 'Proposta recusada.');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Carregando proposta...</p>
        </div>
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

  const plan = proposal.plan_snapshot || {};
  const bonus: any[] = proposal.bonus_services || [];
  const team: any[] = proposal.team_members || [];
  const planPrice = plan.price || 0;
  const bonusTotal = bonus.reduce((s: number, b: any) => s + (b.value || 0), 0);
  const monthlyTotal = planPrice + bonusTotal;
  const discount = proposal.custom_discount || 0;
  const isExpired = new Date(proposal.validity_date) < new Date();
  const isResolved = proposal.status === 'aceita' || proposal.status === 'recusada';

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" />

      {/* Status banner */}
      {proposal.status === 'aceita' && (
        <div className="bg-green-500 text-white text-center py-3 text-sm font-semibold flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Proposta aceita em {format(new Date(proposal.client_response_at), "dd/MM/yyyy 'às' HH:mm")}
        </div>
      )}
      {proposal.status === 'recusada' && (
        <div className="bg-red-500 text-white text-center py-3 text-sm font-semibold flex items-center justify-center gap-2">
          <ThumbsDown className="h-4 w-4" /> Proposta recusada em {format(new Date(proposal.client_response_at), "dd/MM/yyyy 'às' HH:mm")}
        </div>
      )}
      {isExpired && proposal.status === 'pendente' && (
        <div className="bg-yellow-500 text-white text-center py-3 text-sm font-semibold flex items-center justify-center gap-2">
          <Clock className="h-4 w-4" /> Esta proposta expirou em {format(new Date(proposal.validity_date), "dd/MM/yyyy")}
        </div>
      )}

      <div className="max-w-[800px] mx-auto">
        {/* Proposal content */}
        <div className="bg-white shadow-xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {/* Header */}
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(16 82% 51%), hsl(16 82% 38%))' }}>
            <div className="absolute inset-0 opacity-10">
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full border-[40px] border-white/20" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full border-[30px] border-white/10" />
            </div>
            <div className="relative p-8 md:p-12 text-white">
              <img src={pulseLogo} alt="Pulse Growth Marketing" className="h-20 mb-6 drop-shadow-lg" />
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Proposta Comercial</h1>
              <p className="text-white/80 text-lg">Preparada exclusivamente para</p>
              <p className="text-2xl font-bold mt-1">{proposal.client_company || 'Sua Empresa'}</p>
              <p className="text-white/70 mt-1">Aos cuidados de {proposal.client_name || 'Cliente'}</p>
              <div className="mt-6 flex gap-4 text-sm text-white/70">
                <span>📅 {format(new Date(proposal.created_at), "dd/MM/yyyy")}</span>
                <span>⏰ Válida até {format(new Date(proposal.validity_date), "dd/MM/yyyy")}</span>
              </div>
            </div>
          </div>

          {/* Plan details */}
          {plan.name && (
            <div className="p-8 md:p-12">
              <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Rocket className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Pacote {plan.name}
              </h2>
              <p className="text-sm text-gray-500 mb-6">{plan.description || 'Solução completa de marketing digital'}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {plan.reels_qty > 0 && (
                  <div className="border rounded-lg p-3 text-center">
                    <Film className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                    <p className="text-2xl font-bold text-gray-800">{plan.reels_qty}</p>
                    <p className="text-xs text-gray-500">Reels/mês</p>
                  </div>
                )}
                {plan.creatives_qty > 0 && (
                  <div className="border rounded-lg p-3 text-center">
                    <Palette className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                    <p className="text-2xl font-bold text-gray-800">{plan.creatives_qty}</p>
                    <p className="text-xs text-gray-500">Criativos/mês</p>
                  </div>
                )}
                {plan.stories_qty > 0 && (
                  <div className="border rounded-lg p-3 text-center">
                    <Camera className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                    <p className="text-2xl font-bold text-gray-800">{plan.stories_qty}</p>
                    <p className="text-xs text-gray-500">Stories/mês</p>
                  </div>
                )}
                {plan.arts_qty > 0 && (
                  <div className="border rounded-lg p-3 text-center">
                    <Palette className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                    <p className="text-2xl font-bold text-gray-800">{plan.arts_qty}</p>
                    <p className="text-xs text-gray-500">Artes/mês</p>
                  </div>
                )}
                {plan.recording_sessions > 0 && (
                  <div className="border rounded-lg p-3 text-center">
                    <Film className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                    <p className="text-2xl font-bold text-gray-800">{plan.recording_sessions}</p>
                    <p className="text-xs text-gray-500">Captações/mês</p>
                  </div>
                )}
                <div className="border rounded-lg p-3 text-center">
                  <BarChart3 className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                  <p className="text-2xl font-bold text-gray-800">✓</p>
                  <p className="text-xs text-gray-500">Tráfego Pago</p>
                </div>
              </div>
            </div>
          )}

          {/* Bonus */}
          {bonus.length > 0 && (
            <div className="px-8 md:px-12 pb-8">
              <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, hsl(16 82% 96%), hsl(16 82% 92%))' }}>
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                  <Gift className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Bônus Exclusivos desta Proposta
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  ⚠️ Estes benefícios são exclusivos e válidos até {format(new Date(proposal.validity_date), "dd/MM/yyyy")}
                </p>
                <div className="space-y-2">
                  {bonus.map((b: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-white/70 rounded-lg p-3">
                      <div>
                        <p className="font-medium text-sm text-gray-800">✨ {b.name}</p>
                        {b.description && <p className="text-xs text-gray-500">{b.description}</p>}
                      </div>
                      <Badge variant="secondary" className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>
                        {b.value > 0 ? fmt(b.value) : '🎁 GRÁTIS'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Process */}
          <div className="px-8 md:px-12 pb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Como Funciona</h2>
            <p className="text-sm text-gray-500 mb-6">Nosso processo interno para garantir resultados</p>
            <div className="space-y-3">
              {INTERNAL_PROCESS_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: 'hsl(16 82% 80%)' }}>
                    <div className="rounded-full p-2 shrink-0" style={{ background: 'hsl(16 82% 96%)' }}>
                      <Icon className="h-4 w-4" style={{ color: 'hsl(16 82% 51%)' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-800 flex items-center gap-2">
                        {step.title}
                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full text-white" style={{ background: 'hsl(16 82% 51%)' }}>Incluso no pacote</span>
                      </p>
                      <p className="text-xs text-gray-500">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team */}
          {team.length > 0 && (
            <div className="px-8 md:px-12 pb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Users className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Sua Equipe Dedicada
              </h2>
              <p className="text-sm text-gray-500 mb-4">Profissionais envolvidos no seu projeto</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {team.map((m: any, i: number) => (
                  <div key={i} className="border rounded-lg p-3 text-center">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt={m.name} className="w-12 h-12 rounded-full mx-auto mb-2 object-cover border-2" style={{ borderColor: 'hsl(16 82% 80%)' }} />
                    ) : (
                      <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm" style={{ background: 'hsl(16 82% 51%)' }}>
                        {m.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <p className="font-semibold text-sm text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.role}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing */}
          <div className="px-8 md:px-12 pb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Investimento</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-800">Plano Semestral</h3>
                <p className="text-xs text-gray-500 mb-4">Contrato de 6 meses</p>
                <p className="text-3xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(monthlyTotal)}<span className="text-sm font-normal text-gray-500">/mês</span></p>
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p>✅ Sem taxa de implementação</p>
                  <p>✅ Todos os serviços do pacote</p>
                  <p>✅ Tráfego pago incluso</p>
                  {bonus.length > 0 && <p>✅ {bonus.length} bônus exclusivos</p>}
                  <p>✅ Equipe dedicada</p>
                  <p>✅ Portal do cliente</p>
                </div>
              </div>

              <div className="border-2 rounded-xl p-6 relative" style={{ borderColor: 'hsl(16 82% 51%)' }}>
                <div className="absolute -top-3 left-4 px-3 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: 'hsl(16 82% 51%)' }}>
                  RECOMENDADO
                </div>
                <h3 className="text-lg font-bold text-gray-800 mt-2">Plano Anual</h3>
                <p className="text-xs text-gray-500 mb-4">Contrato de 12 meses{discount > 0 ? ` com ${discount}% de desconto` : ''}</p>
                <p className="text-3xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>
                  {fmt(discount > 0 ? monthlyTotal * (1 - discount / 100) : monthlyTotal)}
                  <span className="text-sm font-normal text-gray-500">/mês</span>
                </p>
                {discount > 0 && <p className="text-xs text-gray-400 line-through">{fmt(monthlyTotal)}/mês</p>}
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p>✅ Sem taxa de implementação</p>
                  <p>✅ Todos os serviços do pacote</p>
                  <p>✅ Tráfego pago incluso</p>
                  {bonus.length > 0 && <p>✅ {bonus.length} bônus exclusivos</p>}
                  <p>✅ Equipe dedicada</p>
                  <p>✅ Portal do cliente</p>
                </div>
                {discount > 0 && (
                  <div className="mt-4 rounded-lg p-3 text-center" style={{ background: 'hsl(142 71% 95%)' }}>
                    <p className="text-xs text-gray-500">Economia total no plano anual</p>
                    <p className="text-xl font-bold" style={{ color: 'hsl(142 71% 35%)' }}>
                      {fmt(monthlyTotal * 12 - monthlyTotal * 12 * (1 - discount / 100))}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 bg-gray-50 border rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">Sem contrato de fidelidade</p>
              <p className="text-xs text-gray-500 mb-2">Caso opte por não aderir ao contrato de 6 meses, serão cobradas as seguintes taxas:</p>
              <div className="space-y-1">
                {Object.entries(IMPLEMENTATION_FEES).map(([k, f]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-gray-600">{f.label}</span>
                    <span className="font-semibold text-gray-800">{fmt(f.value)}</span>
                  </div>
                ))}
                <div className="border-t pt-1 mt-1 flex justify-between text-sm">
                  <span className="font-semibold text-gray-700">Total implementação</span>
                  <span className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(Object.values(IMPLEMENTATION_FEES).reduce((s, f) => s + f.value, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Observations */}
          {proposal.observations && (
            <div className="px-8 md:px-12 pb-8">
              <h2 className="text-lg font-bold text-gray-800 mb-2">Observações</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{proposal.observations}</p>
            </div>
          )}

          {/* Footer */}
          <div className="p-8 md:p-12 text-center" style={{ background: 'linear-gradient(135deg, hsl(16 82% 51%), hsl(16 82% 38%))' }}>
            <img src={pulseLogo} alt="Pulse" className="h-8 mx-auto mb-3 brightness-0 invert" />
            <p className="text-white/80 text-sm">Transformando marcas em movimentos.</p>
            <p className="text-white/60 text-xs mt-2">Proposta válida até {format(new Date(proposal.validity_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
          </div>
        </div>

        {/* === INTERACTIVE SECTION === */}
        <div className="bg-white shadow-xl mt-4 rounded-xl p-6 md:p-8 space-y-6">
          {/* Accept / Decline */}
          {!isResolved && !isExpired && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} />
                O que deseja fazer?
              </h3>
              <Textarea
                placeholder="Deixe uma observação (opcional)..."
                value={responseNote}
                onChange={e => setResponseNote(e.target.value)}
                rows={2}
                className="border-gray-200"
              />
              <div className="flex gap-3">
                <Button
                  onClick={() => respondProposal('aceita')}
                  disabled={responding}
                  className="flex-1 text-white font-bold py-6 text-base"
                  style={{ background: 'hsl(142 71% 45%)' }}
                >
                  <ThumbsUp className="h-5 w-5 mr-2" />
                  {responding ? 'Enviando...' : 'Aceitar Proposta'}
                </Button>
                <Button
                  onClick={() => respondProposal('recusada')}
                  disabled={responding}
                  variant="outline"
                  className="flex-1 py-6 text-base border-red-300 text-red-600 hover:bg-red-50"
                >
                  <ThumbsDown className="h-5 w-5 mr-2" />
                  Recusar
                </Button>
              </div>
            </div>
          )}

          {isResolved && proposal.client_response_note && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Observação do cliente:</p>
              <p className="text-sm text-gray-700">{proposal.client_response_note}</p>
            </div>
          )}

          <Separator />

          {/* Comments */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <MessageCircle className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} />
              Comentários e Dúvidas
            </h3>

            {comments.length > 0 && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {comments.map(c => (
                  <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: 'hsl(16 82% 51%)' }}>
                        {c.author_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{c.author_name}</span>
                      <span className="text-[10px] text-gray-400">{format(new Date(c.created_at), "dd/MM HH:mm")}</span>
                    </div>
                    <p className="text-sm text-gray-600 pl-8">{c.message}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Input
                placeholder="Seu nome"
                value={commentName}
                onChange={e => setCommentName(e.target.value)}
                className="border-gray-200"
              />
              <div className="flex gap-2">
                <Textarea
                  placeholder="Escreva sua dúvida ou comentário..."
                  value={commentMsg}
                  onChange={e => setCommentMsg(e.target.value)}
                  rows={2}
                  className="flex-1 border-gray-200"
                />
                <Button
                  onClick={sendComment}
                  disabled={sending || !commentMsg.trim() || !commentName.trim()}
                  className="self-end text-white"
                  style={{ background: 'hsl(16 82% 51%)' }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp floating button */}
        {proposal.whatsapp_number && (
          <a
            href={`https://wa.me/${proposal.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Estou vendo a proposta comercial para ${proposal.client_company}. Gostaria de tirar uma dúvida.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 w-14 h-14 bg-green-500 rounded-full shadow-lg flex items-center justify-center hover:bg-green-600 transition-colors z-50 hover:scale-110"
          >
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-white fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        )}

        <div className="h-20" />
      </div>
    </div>
  );
}
