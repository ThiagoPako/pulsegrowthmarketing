import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
const BRIEFING_API = 'https://agenciapulse.tech/api/client-briefing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Building2, Users, Star, MessageSquare, Camera, AlertTriangle, Shield, Globe, Target, Megaphone, Eye, Lock, Upload } from 'lucide-react';
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

  // Foto preferência
  const [useRealPhotos, setUseRealPhotos] = useState('');

  useEffect(() => {
    if (!clientId) return;
    const fetchData = async () => {
      const { data: clientData } = await supabase.from('clients').select('company_name, responsible_person, color, logo_url, briefing_data').eq('id', clientId).single();
      if (clientData) {
        setClient(clientData);
        // Restore existing briefing data
        const bd = (clientData as any).briefing_data;
        if (bd) {
          const d = typeof bd === 'string' ? JSON.parse(bd) : bd;
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
          if (d._completed) setCompleted(true);
        }
      }

      // Also check onboarding task
      const { data: tasks } = await supabase.from('onboarding_tasks').select('*').eq('client_id', clientId).eq('stage', 'briefing');
      if (tasks && tasks.length > 0) {
        const t = tasks[0] as any;
        if (t.briefing_completed) setCompleted(true);
      }
      setLoading(false);
    };
    fetchData();
  }, [clientId]);

  const handleSubmit = async () => {
    if (!ownerName || !niche || !mainDifferential) {
      toast.error('Preencha os campos obrigatórios (nome, nicho, diferencial)');
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
        useRealPhotos, _completed: true, _submittedAt: new Date().toISOString(),
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

      await supabase.from('clients').update({
        briefing_data: briefingData,
        editorial,
      } as any).eq('id', clientId);

      // Update onboarding task if exists
      const { data: tasks } = await supabase.from('onboarding_tasks').select('id').eq('client_id', clientId).eq('stage', 'briefing');
      if (tasks && tasks.length > 0) {
        await supabase.from('onboarding_tasks').update({
          briefing_data: briefingData,
          briefing_completed: true,
          use_real_photos: useRealPhotos === 'real',
          status: 'concluido',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any).eq('id', (tasks[0] as any).id);
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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Sonner />
      <div className="text-center space-y-4 max-w-md mx-auto px-6">
        <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Briefing enviado! 🎉</h1>
        <p className="text-muted-foreground">Obrigado por preencher as informações. Nossa equipe vai analisar e preparar a melhor estratégia para sua marca.</p>
        <p className="text-xs text-muted-foreground mt-4">Aqui temos amor pelo seu projeto! 🧡</p>
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

        <SectionCard icon={Building2} title="Produtos/serviços que deseja trabalhar">
          <Textarea value={productsServices} onChange={e => setProductsServices(e.target.value)} rows={2} placeholder="Liste os produtos e serviços principais" />
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

        {/* ========== FOTOS ========== */}
        <SectionHeader title="📸 Fotos para Artes" />

        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Camera size={16} className="text-primary" /> As artes devem usar fotos reais?
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setUseRealPhotos('real')}
              className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${useRealPhotos === 'real' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
              📸 Fotos reais da empresa/equipe
            </button>
            <button onClick={() => setUseRealPhotos('banco')}
              className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${useRealPhotos === 'banco' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
              🖼️ Fotos de banco de imagem
            </button>
          </div>
          {useRealPhotos === 'real' && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-2 items-start">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Se não houver fotos profissionais, será necessário agendar sessão. Isso pode gerar atraso e custo adicional.
              </p>
            </div>
          )}
        </div>

        {/* ========== CONSIDERAÇÕES FINAIS ========== */}
        <SectionHeader title="📝 Considerações Finais" />

        <SectionCard icon={MessageSquare} title="Informações adicionais sobre o seu projeto">
          <p className="text-xs text-muted-foreground">Fique à vontade para contar a história do seu negócio e mais informações relevantes. Quanto mais dados, melhor a estratégia!</p>
          <Textarea value={finalNotes} onChange={e => setFinalNotes(e.target.value)} rows={5} placeholder="Conte-nos tudo que achar relevante..." />
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
