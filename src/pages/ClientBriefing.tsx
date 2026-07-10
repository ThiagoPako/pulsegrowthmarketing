import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
const BRIEFING_API = 'https://agenciapulse.tech/api/client-briefing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Building2, Users, Star, MessageSquare, Camera, AlertTriangle, Shield, Globe, Target, Megaphone, Eye, Lock, Upload, Link2, Plus, X, Paperclip, DollarSign, TrendingUp, Rocket, Sparkles, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

const ATTENDANCE_OPTIONS = [
  { id: 'digital', label: 'Digital' },
  { id: 'presencial', label: 'Presencial' },
  { id: 'ambas', label: 'Ambas as formas' },
];

const SOCIAL_OBJECTIVES = [
  { id: 'captar_clientes', label: 'Captar clientes' },
  { id: 'aumentar_visibilidade', label: 'Aumentar a visibilidade do meu negócio' },
  { id: 'gerar_autoridade', label: 'Gerar autoridade' },
  { id: 'iniciar_negocio', label: 'Iniciar um novo negócio' },
  { id: 'presenca_digital', label: 'Não preciso de clientes mas preciso estar presente na rede social' },
];

const COMFORT_OPTIONS = [
  { id: 'sim', label: 'Sim' },
  { id: 'nao', label: 'Não' },
  { id: 'melhorar', label: 'Ainda não, mas desejo melhorar.' },
];

const AGE_RANGES = [
  { id: 'criancas', label: 'Crianças e adolescente' },
  { id: '18-24', label: '18 - 24 anos' },
  { id: '25-34', label: '25 - 34 anos' },
  { id: '35-45', label: '35 - 45 anos' },
  { id: '45+', label: '45+' },
];

const EDUCATION_LEVELS = [
  { id: 'fundamental', label: 'Ensino Fundamental Completo' },
  { id: 'medio', label: 'Ensino Médio Completo' },
  { id: 'superior', label: 'Ensino Superior Completo' },
];

const SOCIAL_CLASSES = [
  { id: 'a+', label: 'Classe A+' },
  { id: 'a', label: 'Classe A' },
  { id: 'b', label: 'Classe B' },
  { id: 'c', label: 'Classe C' },
  { id: 'd', label: 'Classe D' },
  { id: 'todas', label: 'Todas' },
];

function SectionCard({ icon: Icon, title, children, color = 'text-primary' }: { icon: any; title: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="p-4 md:p-5 rounded-xl bg-muted/50 border border-border space-y-3">
      <Label className={`flex items-center gap-2 text-sm font-semibold ${color}`}>
        <Icon size={16} /> {title}
      </Label>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-4 pb-1">
      <h2 className="text-base font-bold text-primary">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function CheckboxGroup({ options, selected, onChange }: { options: { id: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {options.map(opt => (
        <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={selected.includes(opt.id)}
            onCheckedChange={(checked) => {
              if (checked) onChange([...selected, opt.id]);
              else onChange(selected.filter(s => s !== opt.id));
            }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function RadioGroup({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      {options.map(opt => (
        <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" name={opt.id + '-group'} checked={value === opt.id} onChange={() => onChange(opt.id)} className="accent-[hsl(var(--primary))]" />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export default function ClientBriefing() {
  const { clientId } = useParams<{ clientId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [client, setClient] = useState<any>(null);
  // 🔒 trava o clientId carregado para impedir que troca de URL/aba sobrescreva outra tarefa
  const [lockedClientId, setLockedClientId] = useState<string | null>(null);

  // Sobre o negócio
  const [ownerName, setOwnerName] = useState('');
  const [niche, setNiche] = useState('');
  const [mainDifferential, setMainDifferential] = useState('');
  const [productsServices, setProductsServices] = useState('');
  const [businessGoals, setBusinessGoals] = useState('');
  const [attendanceType, setAttendanceType] = useState('');
  const [targetCities, setTargetCities] = useState('');
  const [hasVisualIdentity, setHasVisualIdentity] = useState('');
  const [hasSite, setHasSite] = useState('');

  // Concorrentes
  const [competitors, setCompetitors] = useState('');
  const [digitalReferences, setDigitalReferences] = useState('');
  const [nicheReferences, setNicheReferences] = useState('');
  const [dislikedCommunication, setDislikedCommunication] = useState('');

  // Redes sociais
  const [socialObjectives, setSocialObjectives] = useState<string[]>([]);
  const [digitalDifficulty, setDigitalDifficulty] = useState('');
  const [socialLinks, setSocialLinks] = useState('');
  const [importantTopics, setImportantTopics] = useState('');
  const [comfortOnCamera, setComfortOnCamera] = useState('');
  const [focusProducts, setFocusProducts] = useState('');
  const [businessDifficulty, setBusinessDifficulty] = useState('');
  const [desiredRecognition, setDesiredRecognition] = useState('');
  const [undesiredRecognition, setUndesiredRecognition] = useState('');
  const [contentReferences, setContentReferences] = useState('');
  const [keywords, setKeywords] = useState('');

  // Público-alvo
  const [ageRangesTarget, setAgeRangesTarget] = useState<string[]>([]);
  const [ageRangesBuyer, setAgeRangesBuyer] = useState<string[]>([]);
  const [isAuthority, setIsAuthority] = useState('');
  const [educationLevel, setEducationLevel] = useState<string[]>([]);
  const [socialClass, setSocialClass] = useState<string[]>([]);
  const [clientUsesSocial, setClientUsesSocial] = useState('');
  const [idealClient, setIdealClient] = useState('');

  // Considerações finais e Acessos
  const [finalNotes, setFinalNotes] = useState('');
  const [instagramLogin, setInstagramLogin] = useState('');
  const [instagramPassword, setInstagramPassword] = useState('');
  const [facebookLogin, setFacebookLogin] = useState('');
  const [facebookPassword, setFacebookPassword] = useState('');
  const [otherAccesses, setOtherAccesses] = useState('');

  // Foto preferência (mantido para retrocompat — decisão é interna agora)
  const [useRealPhotos, setUseRealPhotos] = useState('');

  // Comercial / Vendas
  const [ticketMedio, setTicketMedio] = useState('');
  const [faturamentoAtual, setFaturamentoAtual] = useState('');
  const [metaFaturamento, setMetaFaturamento] = useState('');
  const [canaisAquisicao, setCanaisAquisicao] = useState<string[]>([]);
  const [jaInvesteAds, setJaInvesteAds] = useState('');
  const [orcamentoMkt, setOrcamentoMkt] = useState('');
  const [ciclovenda, setCicloVenda] = useState('');
  const [sazonalidade, setSazonalidade] = useState('');

  // Materiais opcionais (links)
  const [identidadeVisualLink, setIdentidadeVisualLink] = useState('');
  const [fotosEstudioLink, setFotosEstudioLink] = useState('');

  // Anexos / Links adicionais
  const [additionalAttachments, setAdditionalAttachments] = useState<{ label: string; url: string }[]>([]);
  const [newAttachLabel, setNewAttachLabel] = useState('');
  const [newAttachUrl, setNewAttachUrl] = useState('');
  useEffect(() => {
    if (!clientId) return;
    const fetchData = async () => {
      try {
        // 🔒 valida formato UUID antes de bater no servidor
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_RE.test(clientId)) {
          setLoading(false);
          return;
        }
        const res = await fetch(`${BRIEFING_API}?clientId=${clientId}`);
        const data = await res.json();
        if (!res.ok || data.error || !data.client) {
          setLoading(false);
          return;
        }
        const clientData = data.client;
        // 🔒 garante que o cliente devolvido pelo servidor é o MESMO da URL
        if (clientData.id && clientData.id !== clientId) {
          setLoading(false);
          return;
        }
        setClient(clientData);
        setLockedClientId(clientData.id || clientId);
        const bd = clientData.briefing_data;
        if (bd) {
          const d = typeof bd === 'string' ? JSON.parse(bd) : bd;
          // 🔒 se o JSON salvo carrega um _clientId diferente, trata como vazio (não popula campos cruzados)
          if (d?._clientId && d._clientId !== clientId) {
            setLoading(false);
            return;
          }
          setOwnerName(d.ownerName || '');
          setNiche(d.niche || '');
          setMainDifferential(d.mainDifferential || '');
          setProductsServices(d.productsServices || '');
          setBusinessGoals(d.businessGoals || '');
          setAttendanceType(d.attendanceType || '');
          setTargetCities(d.targetCities || '');
          setHasVisualIdentity(d.hasVisualIdentity || '');
          setHasSite(d.hasSite || '');
          setCompetitors(d.competitors || '');
          setDigitalReferences(d.digitalReferences || '');
          setNicheReferences(d.nicheReferences || '');
          setDislikedCommunication(d.dislikedCommunication || '');
          setSocialObjectives(d.socialObjectives || []);
          setDigitalDifficulty(d.digitalDifficulty || '');
          setSocialLinks(d.socialLinks || '');
          setImportantTopics(d.importantTopics || '');
          setComfortOnCamera(d.comfortOnCamera || '');
          setFocusProducts(d.focusProducts || '');
          setBusinessDifficulty(d.businessDifficulty || '');
          setDesiredRecognition(d.desiredRecognition || '');
          setUndesiredRecognition(d.undesiredRecognition || '');
          setContentReferences(d.contentReferences || '');
          setKeywords(d.keywords || '');
          setAgeRangesTarget(d.ageRangesTarget || []);
          setAgeRangesBuyer(d.ageRangesBuyer || []);
          setIsAuthority(d.isAuthority || '');
          setEducationLevel(d.educationLevel || []);
          setSocialClass(d.socialClass || []);
          setClientUsesSocial(d.clientUsesSocial || '');
          setIdealClient(d.idealClient || '');
          setFinalNotes(d.finalNotes || '');
          setInstagramLogin(d.instagramLogin || '');
          setInstagramPassword(d.instagramPassword || '');
          setFacebookLogin(d.facebookLogin || '');
          setFacebookPassword(d.facebookPassword || '');
          setOtherAccesses(d.otherAccesses || '');
          setUseRealPhotos(d.useRealPhotos || '');
          setTicketMedio(d.ticketMedio || '');
          setFaturamentoAtual(d.faturamentoAtual || '');
          setMetaFaturamento(d.metaFaturamento || '');
          setCanaisAquisicao(Array.isArray(d.canaisAquisicao) ? d.canaisAquisicao : []);
          setJaInvesteAds(d.jaInvesteAds || '');
          setOrcamentoMkt(d.orcamentoMkt || '');
          setCicloVenda(d.ciclovenda || '');
          setSazonalidade(d.sazonalidade || '');
          setIdentidadeVisualLink(d.identidadeVisualLink || '');
          setFotosEstudioLink(d.fotosEstudioLink || '');
          setAdditionalAttachments(Array.isArray(d.additionalAttachments) ? d.additionalAttachments : []);
          if (d._completed) setCompleted(true);
        }
        if (data.briefingCompleted) setCompleted(true);
      } catch (_) {
        // network/error → keep client null so the friendly message shows
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [clientId]);

  const handleSubmit = async () => {
    if (!ownerName || !niche || !mainDifferential) {
      toast.error('Preencha os campos obrigatórios (nome, nicho, diferencial)');
      return;
    }
    // 🔒 só permite enviar para o MESMO cliente que foi carregado nesta sessão
    if (!lockedClientId || lockedClientId !== clientId) {
      toast.error('Sessão inválida. Recarregue a página com o link correto.');
      return;
    }
    if (completed) {
      toast.error('Este briefing já foi enviado e está bloqueado para edição.');
      return;
    }
    setSaving(true);
    try {
      const briefingData = {
        ownerName, niche, mainDifferential, productsServices, businessGoals, attendanceType,
        targetCities, hasVisualIdentity, hasSite, competitors, digitalReferences, nicheReferences,
        dislikedCommunication, socialObjectives, digitalDifficulty, socialLinks, importantTopics,
        comfortOnCamera, focusProducts, businessDifficulty, desiredRecognition, undesiredRecognition,
        contentReferences, keywords, ageRangesTarget, ageRangesBuyer, isAuthority, educationLevel,
        socialClass, clientUsesSocial, idealClient, finalNotes,
        instagramLogin, instagramPassword, facebookLogin, facebookPassword, otherAccesses,
        useRealPhotos,
        ticketMedio, faturamentoAtual, metaFaturamento, canaisAquisicao, jaInvesteAds, orcamentoMkt, ciclovenda, sazonalidade,
        identidadeVisualLink, fotosEstudioLink,
        additionalAttachments: additionalAttachments.filter(a => a.url && a.url.trim()),
        _completed: true, _submittedAt: new Date().toISOString(),
        _clientId: lockedClientId, // 🔒 carimba o destino dentro do payload
      };

      // Build editorial text
      const editorial = [
        `## Sobre o Negócio`,
        `**Responsável:** ${ownerName}`,
        `**Nicho:** ${niche}`,
        `**Diferencial:** ${mainDifferential}`,
        productsServices && `**Produtos/Serviços:** ${productsServices}`,
        businessGoals && `**Objetivos:** ${businessGoals}`,
        targetCities && `**Cidades-alvo:** ${targetCities}`,
        `\n## Concorrentes`,
        competitors && `${competitors}`,
        `\n## Redes Sociais`,
        socialLinks && `**Links:** ${socialLinks}`,
        desiredRecognition && `**Reconhecimento desejado:** ${desiredRecognition}`,
        focusProducts && `**Foco em redes:** ${focusProducts}`,
        `\n## Público-Alvo`,
        idealClient && `**Cliente ideal:** ${idealClient}`,
        `\n## Tom de Comunicação`,
        comfortOnCamera && `**Conforto na câmera:** ${comfortOnCamera}`,
      ].filter(Boolean).join('\n');

      const res = await fetch(BRIEFING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: lockedClientId, // 🔒 envia o id travado, não o da URL atual
          briefing_data: briefingData,
          editorial,
          use_real_photos: useRealPhotos === 'real',
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        // trata bloqueio explícito do servidor (briefing já enviado)
        if (result?.code === 'briefing_locked' || res.status === 409) {
          setCompleted(true);
          toast.error('Este briefing já foi enviado anteriormente.');
          return;
        }
        throw new Error(result.error || 'Erro');
      }

      setCompleted(true);
      toast.success('Briefing enviado com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Carregando...</div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-lg font-semibold">Cliente não encontrado</p>
    </div>
  );

  if (completed) return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-warning/5 flex items-center justify-center px-4 py-10">
      <Sonner />
      <div className="w-full max-w-2xl mx-auto text-center space-y-6">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary to-warning flex items-center justify-center mx-auto shadow-2xl">
            <Rocket size={44} className="text-white" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles size={14} className="text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Bem-vindo(a) à Pulse</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground">
            É oficial: seu projeto começou! 🎉
          </h1>
          <p className="text-base text-muted-foreground max-w-lg mx-auto">
            Obrigado por confiar na <strong className="text-primary">Pulse Growth Marketing</strong>, <strong>{client?.company_name}</strong>. Já recebemos seu briefing e nossa equipe está pronta pra transformar sua marca.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          {[
            { n: '1', title: 'Análise', desc: 'Nossa equipe estuda seu briefing e o seu mercado' },
            { n: '2', title: 'Estratégia', desc: 'Montamos linha editorial + calendário de conteúdo' },
            { n: '3', title: 'Produção', desc: 'Damos início às gravações, artes e postagens' },
          ].map(step => (
            <div key={step.n} className="p-4 rounded-2xl bg-card border border-border/60 text-left">
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-sm mb-2">{step.n}</div>
              <p className="font-semibold text-sm">{step.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-card border border-border/60 max-w-md mx-auto">
          <div className="flex items-center justify-center gap-2 text-sm">
            <Heart size={16} className="text-primary fill-primary" />
            <span>Conheça quem vai cuidar do seu projeto</span>
          </div>
          <a
            href="/equipe/apresentacao"
            target="_blank"
            rel="noreferrer"
            className="inline-flex mt-3 items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            <Users size={14} /> Ver Apresentação da Equipe Pulse
          </a>
        </div>

        <p className="text-xs text-muted-foreground pt-2">Aqui temos amor pelo seu projeto! 🧡</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Sonner />
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">P</div>
            <span className="font-bold text-sm">Pulse Growth</span>
          </div>
          <Badge variant="secondary" className="text-xs">{client.company_name}</Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Intro */}
        <div className="text-center space-y-2 pb-2">
          <h1 className="text-xl font-bold">Briefing — {client.company_name} 📋</h1>
          <p className="text-sm text-muted-foreground">
            Olá! Esse é um novo começo para o seu <strong>negócio</strong>!! Este formulário é um guia essencial para montarmos a melhor estratégia para a sua empresa. Responda com o máximo de <strong>detalhes e sinceridade</strong> possível.
          </p>
        </div>

        {/* ========== SOBRE O NEGÓCIO ========== */}
        <SectionHeader title="📍 Sobre o seu negócio" />

        <SectionCard icon={Building2} title="Seu nome *">
          <Input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Nome completo do responsável" />
        </SectionCard>

        <SectionCard icon={Target} title="Qual seu nicho de atuação? *">
          <Input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex: Restaurante, Ferragista, Clínica..." />
        </SectionCard>

        <SectionCard icon={Star} title="Principal diferencial em relação aos concorrentes *">
          <Textarea value={mainDifferential} onChange={e => setMainDifferential(e.target.value)} rows={2} placeholder="O que te diferencia?" />
        </SectionCard>

        <SectionCard icon={Building2} title="Principais produtos/serviços (opcional)">
          <p className="text-xs text-muted-foreground">Se quiser, liste os produtos e serviços principais. Se preferir, deixe em branco — vamos alinhar isso na reunião de estratégia.</p>
          <Textarea value={productsServices} onChange={e => setProductsServices(e.target.value)} rows={2} placeholder="Liste os produtos e serviços principais (opcional)" />
        </SectionCard>

        <SectionCard icon={Target} title="Objetivos a curto, médio e longo prazo *">
          <Textarea value={businessGoals} onChange={e => setBusinessGoals(e.target.value)} rows={3} placeholder="Quais os objetivos do seu negócio? (não necessariamente ligado ao digital)" />
        </SectionCard>

        <SectionCard icon={Globe} title="Forma de atendimento *">
          <RadioGroup options={ATTENDANCE_OPTIONS} value={attendanceType} onChange={setAttendanceType} />
        </SectionCard>

        <SectionCard icon={Globe} title="Principais cidades que deseja atingir *">
          <Textarea value={targetCities} onChange={e => setTargetCities(e.target.value)} rows={2} placeholder="Ex: Minaçu, Formoso, Cavalcante..." />
        </SectionCard>

        <SectionCard icon={Eye} title="Já possui identidade visual? (logo, paleta de cores, fontes...)">
          <RadioGroup options={[{ id: 'sim', label: 'Sim, já tenho.' }, { id: 'nao', label: 'Ainda não.' }]} value={hasVisualIdentity} onChange={setHasVisualIdentity} />
        </SectionCard>

        <SectionCard icon={Globe} title="Possui site? Se sim, insira o link">
          <Input value={hasSite} onChange={e => setHasSite(e.target.value)} placeholder="Link do site ou 'Não'" />
        </SectionCard>

        {/* ========== CONCORRENTES ========== */}
        <SectionHeader title="🔍 Sobre seus concorrentes" />

        <SectionCard icon={Users} title="Principais concorrentes *">
          <p className="text-xs text-muted-foreground">Nome, Instagram e Site (se tiver) — Liste os três principais</p>
          <Textarea value={competitors} onChange={e => setCompetitors(e.target.value)} rows={4} placeholder="1. Nome - @instagram - site.com..." />
        </SectionCard>

        <SectionCard icon={Star} title="Referências digitais (de outro nicho)">
          <p className="text-xs text-muted-foreground">Profissionais de nicho diferente que você considera referência no digital. O que gosta e não gosta.</p>
          <Textarea value={digitalReferences} onChange={e => setDigitalReferences(e.target.value)} rows={3} placeholder="Cite nomes e o que admira neles" />
        </SectionCard>

        <SectionCard icon={Star} title="Referências do seu nicho">
          <p className="text-xs text-muted-foreground">Profissionais do mesmo nicho que são referência digital</p>
          <Textarea value={nicheReferences} onChange={e => setNicheReferences(e.target.value)} rows={2} placeholder="Cite nomes e o que admira neles" />
        </SectionCard>

        <SectionCard icon={AlertTriangle} title="Comunicação que NÃO gosta *" color="text-amber-500">
          <p className="text-xs text-muted-foreground">Alguém do seu nicho com comunicação que você não gosta? Detalhe os motivos.</p>
          <Textarea value={dislikedCommunication} onChange={e => setDislikedCommunication(e.target.value)} rows={3} placeholder="Ex: Fulano — usa clickbait demais..." />
        </SectionCard>

        {/* ========== REDES SOCIAIS ========== */}
        <SectionHeader title="📱 Sobre as Redes Sociais" />

        <SectionCard icon={Megaphone} title="Objetivo com as redes sociais">
          <CheckboxGroup options={SOCIAL_OBJECTIVES} selected={socialObjectives} onChange={setSocialObjectives} />
        </SectionCard>

        <SectionCard icon={AlertTriangle} title="Maior dificuldade no digital">
          <Textarea value={digitalDifficulty} onChange={e => setDigitalDifficulty(e.target.value)} rows={2} placeholder="Qual sua maior dificuldade hoje?" />
        </SectionCard>

        <SectionCard icon={Globe} title="Links das redes sociais">
          <p className="text-xs text-muted-foreground">Facebook, Instagram, Youtube, TikTok...</p>
          <Textarea value={socialLinks} onChange={e => setSocialLinks(e.target.value)} rows={3} placeholder="Cole os links das suas redes sociais" />
        </SectionCard>

        <SectionCard icon={MessageSquare} title="Temas importantes para trabalhar nas redes">
          <Textarea value={importantTopics} onChange={e => setImportantTopics(e.target.value)} rows={2} placeholder="Ex: Datas sazonais, promoções, bastidores..." />
        </SectionCard>

        <SectionCard icon={Camera} title="Conforto diante da câmera">
          <RadioGroup options={COMFORT_OPTIONS} value={comfortOnCamera} onChange={setComfortOnCamera} />
        </SectionCard>

        <SectionCard icon={Star} title="Produtos/serviços para focar nas redes sociais">
          <Textarea value={focusProducts} onChange={e => setFocusProducts(e.target.value)} rows={2} placeholder="Quais produtos gostaria de destacar?" />
        </SectionCard>

        <SectionCard icon={Target} title="Maior dificuldade que podemos auxiliar com redes sociais">
          <Textarea value={businessDifficulty} onChange={e => setBusinessDifficulty(e.target.value)} rows={2} />
        </SectionCard>

        <SectionCard icon={Eye} title="Como gostaria de ser reconhecido nas redes?">
          <Textarea value={desiredRecognition} onChange={e => setDesiredRecognition(e.target.value)} rows={2} placeholder="Ex: Melhor atendimento, melhor preço..." />
        </SectionCard>

        <SectionCard icon={AlertTriangle} title="Como NÃO gostaria de ser reconhecido?" color="text-amber-500">
          <Textarea value={undesiredRecognition} onChange={e => setUndesiredRecognition(e.target.value)} rows={2} />
        </SectionCard>

        <SectionCard icon={Globe} title="Referências de conteúdo confiável">
          <p className="text-xs text-muted-foreground">Sites, livros, artigos, revistas ou perfis nas redes</p>
          <Textarea value={contentReferences} onChange={e => setContentReferences(e.target.value)} rows={2} />
        </SectionCard>

        <SectionCard icon={Target} title="10 palavras-chave relevantes (em ordem de prioridade)">
          <Textarea value={keywords} onChange={e => setKeywords(e.target.value)} rows={3} placeholder="1. palavra, 2. palavra, 3. palavra..." />
        </SectionCard>

        {/* ========== PÚBLICO-ALVO ========== */}
        <SectionHeader title="👥 Análise de Público" />

        <SectionCard icon={Users} title="Idade média dos clientes que deseja captar/atender">
          <CheckboxGroup options={AGE_RANGES} selected={ageRangesTarget} onChange={setAgeRangesTarget} />
        </SectionCard>

        <SectionCard icon={Users} title="Idade média do cliente que efetivamente compra">
          <CheckboxGroup options={AGE_RANGES} selected={ageRangesBuyer} onChange={setAgeRangesBuyer} />
        </SectionCard>

        <SectionCard icon={Shield} title="Seu cliente te reconhece como autoridade?">
          <RadioGroup options={[{ id: 'sim', label: 'Sim' }, { id: 'nao', label: 'Não' }]} value={isAuthority} onChange={setIsAuthority} />
        </SectionCard>

        <SectionCard icon={Users} title="Grau de escolaridade dos clientes">
          <CheckboxGroup options={EDUCATION_LEVELS} selected={educationLevel} onChange={setEducationLevel} />
        </SectionCard>

        <SectionCard icon={Users} title="Classe social do cliente que deseja atingir">
          <CheckboxGroup options={SOCIAL_CLASSES} selected={socialClass} onChange={setSocialClass} />
        </SectionCard>

        <SectionCard icon={Megaphone} title="Seu cliente usa as redes sociais?">
          <RadioGroup options={[{ id: 'sim', label: 'Sim' }, { id: 'nao', label: 'Não' }]} value={clientUsesSocial} onChange={setClientUsesSocial} />
        </SectionCard>

        <SectionCard icon={Star} title="Descreva o cliente ideal *">
          <p className="text-xs text-muted-foreground">Forma de pagamento, comportamento, serviços que gosta de adquirir...</p>
          <Textarea value={idealClient} onChange={e => setIdealClient(e.target.value)} rows={4} placeholder="Imagine o cliente que você sempre gostaria de receber..." />
        </SectionCard>

        {/* ========== COMERCIAL / VENDAS ========== */}
        <SectionHeader title="💰 Vendas & Comercial" subtitle="Nos ajude a entender o momento comercial do seu negócio para gerar resultado de verdade." />

        <SectionCard icon={DollarSign} title="Ticket médio atual (opcional)">
          <Input value={ticketMedio} onChange={e => setTicketMedio(e.target.value)} placeholder="Ex: R$ 350 por venda" />
        </SectionCard>

        <SectionCard icon={TrendingUp} title="Faturamento médio mensal hoje (opcional)">
          <Input value={faturamentoAtual} onChange={e => setFaturamentoAtual(e.target.value)} placeholder="Ex: R$ 40.000/mês" />
        </SectionCard>

        <SectionCard icon={Target} title="Qual sua meta de faturamento com o digital?">
          <Textarea value={metaFaturamento} onChange={e => setMetaFaturamento(e.target.value)} rows={2} placeholder="Ex: dobrar o faturamento em 6 meses, atingir R$ 100k/mês..." />
        </SectionCard>

        <SectionCard icon={Megaphone} title="Como seus clientes chegam até você hoje?">
          <CheckboxGroup
            options={[
              { id: 'indicacao', label: 'Indicação boca a boca' },
              { id: 'instagram', label: 'Instagram / Redes sociais orgânicas' },
              { id: 'ads', label: 'Anúncios pagos (Meta / Google)' },
              { id: 'passagem', label: 'Passagem em frente à loja / ponto físico' },
              { id: 'google', label: 'Pesquisa no Google' },
              { id: 'parcerias', label: 'Parcerias / eventos' },
              { id: 'nao_sei', label: 'Não sei / não meço isso hoje' },
            ]}
            selected={canaisAquisicao}
            onChange={setCanaisAquisicao}
          />
        </SectionCard>

        <SectionCard icon={DollarSign} title="Já investe em anúncios pagos (tráfego)?">
          <RadioGroup
            options={[
              { id: 'sim_ativo', label: 'Sim, atualmente ativo' },
              { id: 'ja_investi', label: 'Já investi, hoje não estou' },
              { id: 'nao', label: 'Ainda não invisti' },
            ]}
            value={jaInvesteAds}
            onChange={setJaInvesteAds}
          />
        </SectionCard>

        <SectionCard icon={DollarSign} title="Orçamento mensal disponível para marketing/tráfego (opcional)">
          <p className="text-xs text-muted-foreground">Isso nos ajuda a montar a estratégia certa para o seu momento.</p>
          <Input value={orcamentoMkt} onChange={e => setOrcamentoMkt(e.target.value)} placeholder="Ex: R$ 500 / R$ 1.500 / R$ 3.000 por mês" />
        </SectionCard>

        <SectionCard icon={MessageSquare} title="Ciclo de venda (opcional)">
          <p className="text-xs text-muted-foreground">Do primeiro contato até fechar, quanto tempo em média leva?</p>
          <Input value={ciclovenda} onChange={e => setCicloVenda(e.target.value)} placeholder="Ex: imediato / alguns dias / semanas" />
        </SectionCard>

        <SectionCard icon={TrendingUp} title="Existem épocas do ano de maior movimento? (opcional)">
          <Textarea value={sazonalidade} onChange={e => setSazonalidade(e.target.value)} rows={2} placeholder="Ex: Dia dos Namorados, Black Friday, alta safra..." />
        </SectionCard>

        {/* ========== MATERIAIS OPCIONAIS ========== */}
        <SectionHeader title="🎨 Materiais que você já tem (opcional)" subtitle="Se já tiver, envie os links. Se não tiver, tudo bem — a gente ajuda a construir." />

        <SectionCard icon={Upload} title="Identidade visual (logo, paleta, fontes) — opcional">
          <p className="text-xs text-muted-foreground">
            Cole aqui um link do Google Drive, Dropbox, WeTransfer ou WhatsApp Web com os arquivos da sua marca.
          </p>
          <Input
            value={identidadeVisualLink}
            onChange={e => setIdentidadeVisualLink(e.target.value)}
            placeholder="https://drive.google.com/..."
            type="url"
          />
        </SectionCard>

        <SectionCard icon={Camera} title="Fotos profissionais já feitas em estúdio — opcional">
          <p className="text-xs text-muted-foreground">
            Se você já tem um ensaio profissional ou fotos de produto em estúdio, envie o link. Caso não tenha, deixe em branco — vamos decidir internamente como resolver.
          </p>
          <Input
            value={fotosEstudioLink}
            onChange={e => setFotosEstudioLink(e.target.value)}
            placeholder="https://drive.google.com/... (opcional)"
            type="url"
          />
        </SectionCard>


        {/* ========== CONSIDERAÇÕES FINAIS ========== */}
        <SectionHeader title="📝 Considerações Finais" />

        <SectionCard icon={MessageSquare} title="Informações adicionais sobre o seu projeto">
          <p className="text-xs text-muted-foreground">Fique à vontade para contar a história do seu negócio e mais informações relevantes. Quanto mais dados, melhor a estratégia!</p>
          <Textarea value={finalNotes} onChange={e => setFinalNotes(e.target.value)} rows={5} placeholder="Conte-nos tudo que achar relevante..." />
        </SectionCard>

        {/* ========== ANEXOS / LINKS ADICIONAIS ========== */}
        <SectionCard icon={Paperclip} title="Anexos e links adicionais (opcional)">
          <p className="text-xs text-muted-foreground">
            Compartilhe links de Drive, Dropbox, fotos, vídeos, materiais antigos, manual da marca, planilhas, posts de referência etc.
            Eles serão incluídos no PDF do briefing entregue à equipe.
          </p>

          {additionalAttachments.length > 0 && (
            <div className="space-y-2">
              {additionalAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
                  <Link2 size={14} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{att.label || 'Sem rótulo'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{att.url}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setAdditionalAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remover anexo"
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
            <Input
              value={newAttachLabel}
              onChange={e => setNewAttachLabel(e.target.value)}
              placeholder="Rótulo (ex: Manual da marca)"
              maxLength={80}
            />
            <Input
              value={newAttachUrl}
              onChange={e => setNewAttachUrl(e.target.value)}
              placeholder="https://..."
              type="url"
              maxLength={500}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const url = newAttachUrl.trim();
                if (!url) {
                  toast.error('Cole o link primeiro');
                  return;
                }
                if (!/^https?:\/\//i.test(url)) {
                  toast.error('O link deve começar com http:// ou https://');
                  return;
                }
                if (additionalAttachments.length >= 20) {
                  toast.error('Limite de 20 anexos atingido');
                  return;
                }
                setAdditionalAttachments(prev => [...prev, { label: newAttachLabel.trim(), url }]);
                setNewAttachLabel('');
                setNewAttachUrl('');
              }}
              className="gap-1.5"
            >
              <Plus size={14} /> Adicionar
            </Button>
          </div>
        </SectionCard>

        {/* ========== ACESSOS ========== */}
        <SectionHeader title="🔐 Informações de Acesso às Redes" subtitle="Essas informações são confidenciais e necessárias para a implementação de contas de anúncios e gerenciamento." />

        <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Lock size={16} /> Acesso ao Instagram
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Login / Usuário</Label>
              <Input value={instagramLogin} onChange={e => setInstagramLogin(e.target.value)} placeholder="@seuusuario" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Senha</Label>
              <Input type="password" value={instagramPassword} onChange={e => setInstagramPassword(e.target.value)} placeholder="Sua senha do Instagram" />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Lock size={16} /> Acesso ao Facebook
          </div>
          <p className="text-xs text-muted-foreground">Caso tenha página vinculada — necessário para implementação de contas de anúncios</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Login / E-mail</Label>
              <Input value={facebookLogin} onChange={e => setFacebookLogin(e.target.value)} placeholder="E-mail ou telefone do Facebook" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Senha</Label>
              <Input type="password" value={facebookPassword} onChange={e => setFacebookPassword(e.target.value)} placeholder="Sua senha do Facebook" />
            </div>
          </div>
        </div>

        <SectionCard icon={Lock} title="Outros acessos (Google, TikTok, etc.)">
          <Textarea value={otherAccesses} onChange={e => setOtherAccesses(e.target.value)} rows={3} placeholder="Qualquer outro login/senha que deseje compartilhar para gerenciamento" />
        </SectionCard>

        {/* ========== IDENTIDADE VISUAL ========== */}
        <SectionHeader title="🎨 Logos e Identidade Visual" />
        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Upload size={16} className="text-primary" /> Envie sua logo e materiais visuais
          </div>
          <p className="text-xs text-muted-foreground">Caso tenha, envie diretamente pelo chat do WhatsApp ou pelo Portal do Cliente na aba de Designer.</p>
        </div>

        {/* Submit */}
        <div className="pt-4 pb-8">
          <Button onClick={handleSubmit} disabled={saving} className="w-full" size="lg">
            {saving ? 'Enviando...' : '🚀 Enviar Briefing'}
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-3">Aqui temos amor pelo seu projeto! 🧡</p>
        </div>
      </div>
    </div>
  );
}
