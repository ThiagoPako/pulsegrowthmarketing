import { Badge } from '@/components/ui/badge';
import { formatBriefingValue, getBriefingFieldLabel } from '@/lib/briefingLabels';

/** Rótulos legíveis dos canais de marketing salvos no briefing do provedor. */
const CHANNEL_LABELS: Record<string, string> = {
  blogueiras: 'Blogueiras / Influenciadores',
  outdoors: 'Outdoors / Mídia exterior',
  panfletagem: 'Panfletagem / Flyers',
  radio: 'Rádio / TV local',
  eventos: 'Patrocínio de eventos',
  indicacao: 'Indicação / Boca a boca',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  nenhum: 'Ainda não investimos',
};

const TEAM_VIDEO_LABELS: Record<string, string> = {
  sim_todos: 'Sim, todos os colaboradores',
  sim_alguns: 'Sim, apenas alguns setores',
  nao: 'Não querem vídeos com a equipe',
  a_decidir: 'Ainda vão definir',
};

const FIELDS: { key: string; label: string }[] = [
  { key: 'cities', label: 'Cidades de atuação' },
  { key: 'plans', label: 'Planos atuais e valores' },
  { key: 'mainDifferential', label: 'Diferenciais da empresa' },
  { key: 'teamVideosDetails', label: 'Observações sobre vídeos da equipe' },
  { key: 'influencerBudget', label: 'Verba para blogueiras/influenciadores' },
  { key: 'externalMarketingBudget', label: 'Verba para marketing externo' },
  { key: 'metaAdsBudget', label: 'Orçamento inicial Meta Ads' },
  { key: 'competitors', label: 'Concorrentes' },
  { key: 'targetAudience', label: 'Público-alvo' },
  { key: 'currentDifficulties', label: 'Dificuldades atuais' },
  { key: 'growthGoals', label: 'Metas de crescimento' },
  { key: 'socialLinks', label: 'Redes sociais' },
  { key: 'instagramExists', label: 'Já possui Instagram?' },
  { key: 'instagramProfile', label: 'Perfil ou link do Instagram' },
  { key: 'instagramLogin', label: 'Instagram — login' },
  { key: 'instagramPassword', label: 'Instagram — senha' },
  { key: 'facebookPageExists', label: 'Já possui página no Facebook?' },
  { key: 'facebookPage', label: 'Nome ou link da página do Facebook' },
  { key: 'facebookLogin', label: 'Facebook — login' },
  { key: 'facebookPassword', label: 'Facebook — senha' },
  { key: 'otherAccesses', label: 'Outros acessos e observações' },
  { key: 'visualIdentity', label: 'Identidade visual' },
  { key: 'additionalNotes', label: 'Observações adicionais' },
];

export interface ProviderBriefingSummaryProps {
  /** Conteúdo bruto de `briefing_data` (objeto ou string JSON). */
  data: unknown;
  className?: string;
}

export function parseBriefingData(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, any>) : null;
}

export function isProviderBriefing(raw: unknown): boolean {
  return parseBriefingData(raw)?._type === 'provedor_internet';
}

/** Exibição somente-leitura das respostas do briefing de provedor de internet. */
export function ProviderBriefingSummary({ data, className }: ProviderBriefingSummaryProps) {
  const d = parseBriefingData(data);
  if (!d || d._type !== 'provedor_internet') return null;

  const channels: string[] = Array.isArray(d.marketingChannels) ? d.marketingChannels : [];
  const submittedAt = d._submittedAt ? new Date(d._submittedAt) : null;
  const answered = FIELDS.filter((f) => String(d[f.key] || '').trim().length > 0);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Badge variant="secondary">Provedor de Internet</Badge>
        {d._version ? <Badge variant="outline">v{d._version}</Badge> : null}
        {submittedAt && !isNaN(submittedAt.getTime()) && (
          <span className="text-[11px] text-muted-foreground">
            Enviado em {submittedAt.toLocaleString('pt-BR')}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {d.teamVideos && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Vídeos com a equipe
            </p>
             <p className="text-sm mt-0.5">{TEAM_VIDEO_LABELS[d.teamVideos] || formatBriefingValue(d.teamVideos)}</p>
          </div>
        )}

        {channels.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Canais de marketing já usados
            </p>
            <div className="flex flex-wrap gap-1.5">
              {channels.map((c) => (
                <Badge key={c} variant="secondary" className="text-[10px]">
                  {CHANNEL_LABELS[c] || c}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {answered.map((f) => (
          <div key={f.key} className="rounded-lg border border-border bg-muted/40 p-3">
             <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label || getBriefingFieldLabel(f.key)}</p>
             <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{formatBriefingValue(d[f.key])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProviderBriefingSummary;
