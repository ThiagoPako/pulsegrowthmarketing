import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';
import {
  Building2,
  MapPin,
  Wifi,
  Users,
  Camera,
  Megaphone,
  DollarSign,
  Send,
  CheckCircle2,
  AlertTriangle,
  Rocket,
  Globe,
  Target,
  FileText,
} from 'lucide-react';

const BRIEFING_API = '/api/client-briefing';

const MARKETING_CHANNELS = [
  { id: 'blogueiras', label: 'Blogueiras / Influenciadores digitais' },
  { id: 'outdoors', label: 'Outdoors / Mídia exterior' },
  { id: 'panfletagem', label: 'Panfletagem / Flyers' },
  { id: 'radio', label: 'Rádio / TV local' },
  { id: 'eventos', label: 'Patrocínio de eventos locais' },
  { id: 'indicacao', label: 'Indicação / Boca a boca' },
  { id: 'meta_ads', label: 'Meta Ads (Facebook/Instagram)' },
  { id: 'google_ads', label: 'Google Ads' },
  { id: 'nenhum', label: 'Ainda não investimos em marketing' },
];

const VIDEO_TEAM_OPTIONS = [
  { id: 'sim_todos', label: 'Sim, todos os colaboradores podem aparecer' },
  { id: 'sim_alguns', label: 'Sim, apenas alguns setores/colaboradores' },
  { id: 'nao', label: 'Não queremos vídeos com a equipe' },
  { id: 'a_decidir', label: 'Ainda vamos definir' },
];

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-display font-bold text-base text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => (
        <label
          key={opt.id}
          className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors cursor-pointer"
        >
          <Checkbox
            checked={selected.includes(opt.id)}
            onCheckedChange={(checked) => {
              if (checked) onChange([...selected, opt.id]);
              else onChange(selected.filter((s) => s !== opt.id));
            }}
            className="mt-0.5"
          />
          <span className="text-sm leading-snug">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map((opt) => (
        <label
          key={opt.id}
          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
            value === opt.id
              ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
              : 'border-border bg-card hover:bg-accent/40'
          }`}
        >
          <input
            type="radio"
            name="radio-group"
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
            className="accent-primary w-4 h-4"
          />
          <span className="text-sm">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export default function ClientBriefingProvider() {
  const { clientId } = useParams<{ clientId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [client, setClient] = useState<any>(null);
  const [lockedClientId, setLockedClientId] = useState<string | null>(null);

  // Dados do provedor
  const [cities, setCities] = useState('');
  const [plans, setPlans] = useState('');
  const [mainDifferential, setMainDifferential] = useState('');
  const [teamVideos, setTeamVideos] = useState('');
  const [teamVideosDetails, setTeamVideosDetails] = useState('');
  const [marketingChannels, setMarketingChannels] = useState<string[]>([]);
  const [influencerBudget, setInfluencerBudget] = useState('');
  const [externalMarketingBudget, setExternalMarketingBudget] = useState('');
  const [metaAdsBudget, setMetaAdsBudget] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [currentDifficulties, setCurrentDifficulties] = useState('');
  const [growthGoals, setGrowthGoals] = useState('');
  const [socialLinks, setSocialLinks] = useState('');
  const [visualIdentity, setVisualIdentity] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  useEffect(() => {
    if (!clientId) return;
    const fetchData = async () => {
      try {
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
        if (clientData.id && clientData.id !== clientId) {
          setLoading(false);
          return;
        }
        setClient(clientData);
        setLockedClientId(clientData.id || clientId);

        const bd = clientData.briefing_data;
        if (bd) {
          const d = typeof bd === 'string' ? JSON.parse(bd) : bd;
          if (d?._clientId && d._clientId !== clientId) {
            setLoading(false);
            return;
          }
          if (d?._type === 'provedor_internet') {
            setCities(d.cities || '');
            setPlans(d.plans || '');
            setMainDifferential(d.mainDifferential || '');
            setTeamVideos(d.teamVideos || '');
            setTeamVideosDetails(d.teamVideosDetails || '');
            setMarketingChannels(Array.isArray(d.marketingChannels) ? d.marketingChannels : []);
            setInfluencerBudget(d.influencerBudget || '');
            setExternalMarketingBudget(d.externalMarketingBudget || '');
            setMetaAdsBudget(d.metaAdsBudget || '');
            setCompetitors(d.competitors || '');
            setTargetAudience(d.targetAudience || '');
            setCurrentDifficulties(d.currentDifficulties || '');
            setGrowthGoals(d.growthGoals || '');
            setSocialLinks(d.socialLinks || '');
            setVisualIdentity(d.visualIdentity || '');
            setAdditionalNotes(d.additionalNotes || '');
            if (d._completed) setCompleted(true);
          }
        }
        if (data.briefingCompleted) setCompleted(true);
      } catch (_) {
        // network error
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [clientId]);

  const handleSubmit = async () => {
    const citiesT = cities.trim();
    const plansT = plans.trim();
    const diffT = mainDifferential.trim();

    if (!citiesT) {
      toast.error('Informe as cidades que o provedor atua.');
      return;
    }
    if (!plansT) {
      toast.error('Informe os planos atuais e valores.');
      return;
    }
    if (!diffT) {
      toast.error('Informe os diferenciais da empresa.');
      return;
    }
    if (!teamVideos) {
      toast.error('Informe se podemos fazer vídeos com a equipe.');
      return;
    }
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
        _type: 'provedor_internet',
        _clientId: clientId,
        _completed: true,
        _submittedAt: new Date().toISOString(),
        cities: citiesT,
        plans: plansT,
        mainDifferential: diffT,
        teamVideos,
        teamVideosDetails: teamVideosDetails.trim(),
        marketingChannels,
        influencerBudget: influencerBudget.trim(),
        externalMarketingBudget: externalMarketingBudget.trim(),
        metaAdsBudget: metaAdsBudget.trim(),
        competitors: competitors.trim(),
        targetAudience: targetAudience.trim(),
        currentDifficulties: currentDifficulties.trim(),
        growthGoals: growthGoals.trim(),
        socialLinks: socialLinks.trim(),
        visualIdentity: visualIdentity.trim(),
        additionalNotes: additionalNotes.trim(),
      };

      const res = await fetch(BRIEFING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          briefing_data: briefingData,
          editorial: `Provedor de internet atuando em: ${citiesT}. Planos: ${plansT}. Diferencial: ${diffT}`,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Erro ao salvar briefing');
      }

      setCompleted(true);
      toast.success('Briefing enviado com sucesso!');
    } catch (err: any) {
      console.error('Briefing provider error:', err);
      toast.error(err.message || 'Erro ao enviar briefing');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Rocket className="animate-bounce text-primary" size={32} />
          <p className="text-sm">Carregando briefing...</p>
        </div>
        <Sonner />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <AlertTriangle className="mx-auto text-destructive" size={40} />
            <h1 className="text-xl font-display font-bold">Link inválido ou expirado</h1>
            <p className="text-sm text-muted-foreground">
              O link deste briefing não está ativo. Entre em contato com a equipe Pulse para receber um novo link.
            </p>
          </CardContent>
        </Card>
        <Sonner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="text-center space-y-4 mb-8">
          {client.logo_url ? (
            <img
              src={client.logo_url}
              alt={client.company_name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto border border-border"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Wifi size={36} className="text-primary" />
            </div>
          )}
          <div>
            <Badge variant="secondary" className="mb-2">
              Briefing Especializado
            </Badge>
            <h1 className="text-2xl md:text-3xl font-display font-bold">
              Provedor de Internet
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {client.company_name} — organize as informações essenciais para criarmos o editorial.
            </p>
          </div>
        </div>

        {completed ? (
          <Card className="overflow-hidden border-primary/30 bg-primary/5">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 size={56} className="mx-auto text-primary" />
              <h2 className="text-xl font-display font-bold">Briefing recebido! 🚀</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Obrigado pelas informações. Nossa equipe já vai analisar os dados e construir uma
                estratégia de conteúdo personalizada para o provedor.
              </p>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="mt-2"
              >
                Recarregar página
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <SectionCard
              icon={MapPin}
              title="Cidades de Atuação"
              subtitle="Quais cidades o provedor atende hoje? Inclua sede e futuras expansões."
            >
              <Textarea
                value={cities}
                onChange={(e) => setCities(e.target.value)}
                placeholder="Ex: Minaçu (sede), Uruaçu, Campinorte, Nova Iguaçu de Goiás..."
                className="min-h-[100px]"
              />
            </SectionCard>

            <SectionCard
              icon={DollarSign}
              title="Planos Atuais e Valores"
              subtitle="Liste os planos de internet, velocidades, preços e qualquer benefício incluso."
            >
              <Textarea
                value={plans}
                onChange={(e) => setPlans(e.target.value)}
                placeholder="Ex: 300 Mega - R$ 79,90/mês | 500 Mega - R$ 99,90/mês (inclui Wi-Fi 6) | 1 Giga - R$ 149,90/mês..."
                className="min-h-[120px]"
              />
            </SectionCard>

            <SectionCard
              icon={Target}
              title="Diferenciais da Empresa"
              subtitle="O que o provedor acredita ser sua vantagem sobre a concorrência?"
            >
              <Textarea
                value={mainDifferential}
                onChange={(e) => setMainDifferential(e.target.value)}
                placeholder="Ex: atendimento humanizado em até 2h, fibra ótica própria, preço justo, cobertura em zona rural..."
                className="min-h-[120px]"
              />
            </SectionCard>

            <SectionCard
              icon={Camera}
              title="Vídeos com a Equipe"
              subtitle="Podemos gravar vídeos mostrando técnicos, atendimento e bastidores da empresa?"
            >
              <RadioGroup options={VIDEO_TEAM_OPTIONS} value={teamVideos} onChange={setTeamVideos} />
              {teamVideos && teamVideos !== 'nao' && (
                <div className="pt-2">
                  <Label className="text-xs text-muted-foreground">
                    Quais setores/colaboradores podem aparecer? (opcional)
                  </Label>
                  <Textarea
                    value={teamVideosDetails}
                    onChange={(e) => setTeamVideosDetails(e.target.value)}
                    placeholder="Ex: técnico de campo, equipe de atendimento, diretoria..."
                    className="min-h-[80px] mt-1.5"
                  />
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={Megaphone}
              title="Verbas de Marketing"
              subtitle="Onde o provedor já investe ou pretende investir em marketing?"
            >
              <CheckboxGroup
                options={MARKETING_CHANNELS}
                selected={marketingChannels}
                onChange={setMarketingChannels}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Users size={14} /> Verba para blogueiras/influenciadores
                  </Label>
                  <Input
                    value={influencerBudget}
                    onChange={(e) => setInfluencerBudget(e.target.value)}
                    placeholder="Ex: R$ 1.000/mês"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Globe size={14} /> Verba para marketing externo (outdoor, panfletagem)
                  </Label>
                  <Input
                    value={externalMarketingBudget}
                    onChange={(e) => setExternalMarketingBudget(e.target.value)}
                    placeholder="Ex: R$ 2.000/mês"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={DollarSign}
              title="Orçamento Inicial para Meta Ads"
              subtitle="Qual o valor mensal disponível para anúncios no Facebook e Instagram?"
            >
              <Input
                value={metaAdsBudget}
                onChange={(e) => setMetaAdsBudget(e.target.value)}
                placeholder="Ex: R$ 3.000/mês nos primeiros 3 meses"
              />
            </SectionCard>

            <SectionCard
              icon={Building2}
              title="Concorrência e Mercado"
              subtitle="Quem são os principais concorrentes na região?"
            >
              <Textarea
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
                placeholder="Ex: provedor X (cobre centro), operadora Y (preço baixo mas atendimento ruim)..."
                className="min-h-[100px]"
              />
            </SectionCard>

            <SectionCard
              icon={Users}
              title="Público-Alvo"
              subtitle="Quem é o cliente ideal do provedor?"
            >
              <Textarea
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Ex: famílias de classe média, home office, gamers, zona rural, comércios locais..."
                className="min-h-[100px]"
              />
            </SectionCard>

            <SectionCard
              icon={AlertTriangle}
              title="Dores e Desafios Atuais"
              subtitle="Quais os principais problemas que o provedor enfrenta hoje?"
            >
              <Textarea
                value={currentDifficulties}
                onChange={(e) => setCurrentDifficulties(e.target.value)}
                placeholder="Ex: churn por queda de sinal, concorrência agressiva no preço, falta de reconhecimento da marca..."
                className="min-h-[100px]"
              />
            </SectionCard>

            <SectionCard
              icon={Target}
              title="Objetivos de Crescimento"
              subtitle="O que o provedor quer conquistar nos próximos meses?"
            >
              <Textarea
                value={growthGoals}
                onChange={(e) => setGrowthGoals(e.target.value)}
                placeholder="Ex: 300 novas instalações no trimestre, expandir para 2 novas cidades, reduzir churn em 20%..."
                className="min-h-[100px]"
              />
            </SectionCard>

            <SectionCard
              icon={Globe}
              title="Redes Sociais e Presença Digital"
              subtitle="Links de Instagram, Facebook, site ou outras plataformas."
            >
              <Textarea
                value={socialLinks}
                onChange={(e) => setSocialLinks(e.target.value)}
                placeholder="Cole aqui os links das redes sociais e site..."
                className="min-h-[80px]"
              />
            </SectionCard>

            <SectionCard
              icon={FileText}
              title="Identidade Visual e Materiais"
              subtitle="Já existe identidade visual, fotos de equipe ou vídeos prontos?"
            >
              <Textarea
                value={visualIdentity}
                onChange={(e) => setVisualIdentity(e.target.value)}
                placeholder="Ex: temos logomarca e manual de marca; temos fotos dos técnicos em campo; não temos vídeos ainda..."
                className="min-h-[100px]"
              />
            </SectionCard>

            <SectionCard
              icon={Send}
              title="Informações Complementares"
              subtitle="Algo mais que a equipe Pulse precise saber para criar o editorial?"
            >
              <Textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Ex: datas de feiras que participamos, campanhas sazonais, lançamentos de planos..."
                className="min-h-[100px]"
              />
            </SectionCard>

            <div className="pt-4">
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full h-12 text-base font-semibold gap-2"
              >
                {saving ? (
                  <>
                    <Rocket className="animate-bounce" size={18} /> Enviando...
                  </>
                ) : (
                  <>
                    <Send size={18} /> Enviar Briefing
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-3">
                Após o envio, o briefing ficará bloqueado para edição. Revise bem antes de enviar.
              </p>
            </div>
          </div>
        )}
      </div>
      <Sonner />
    </div>
  );
}
