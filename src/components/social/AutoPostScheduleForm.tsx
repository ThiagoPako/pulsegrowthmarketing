import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchConnectedAccounts,
  type ConnectedSocialAccount,
  type SocialPlatformTarget,
  type SocialPublishType,
} from '@/services/socialPostsApi';

export interface AutoPostFormValue {
  enabled: boolean;
  platform: SocialPlatformTarget;
  publishType: SocialPublishType;
  mediaUrl: string;
  caption: string;
}

export interface AutoPostScheduleFormProps {
  clientId: string;
  value: AutoPostFormValue;
  onChange: (next: AutoPostFormValue) => void;
  /** Informa ao pai se o cliente tem contas conectadas (para validar no confirmar). */
  onAccountsLoaded?: (accounts: ConnectedSocialAccount[]) => void;
  className?: string;
}

const PLATFORM_OPTIONS: { value: SocialPlatformTarget; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'both', label: 'Instagram + Facebook' },
];

const TYPE_OPTIONS: { value: SocialPublishType; label: string }[] = [
  { value: 'reels', label: 'Reels (vídeo)' },
  { value: 'feed', label: 'Feed (imagem)' },
  { value: 'stories', label: 'Stories' },
];

/**
 * Bloco "Postagem automática" usado dentro do dialog de agendamento.
 * Mostra as contas conectadas do cliente e coleta plataforma, tipo, mídia e legenda.
 */
export function AutoPostScheduleForm({ clientId, value, onChange, onAccountsLoaded, className }: AutoPostScheduleFormProps) {
  const [accounts, setAccounts] = useState<ConnectedSocialAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setAccounts(null);
    setLoadError(null);
    fetchConnectedAccounts(clientId)
      .then(list => {
        if (!alive) return;
        setAccounts(list);
        onAccountsLoaded?.(list);
      })
      .catch(err => {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : 'Falha ao consultar contas');
        setAccounts([]);
        onAccountsLoaded?.([]);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const hasIg = !!accounts?.some(a => a.platform === 'instagram' && a.has_token);
  const hasFb = !!accounts?.some(a => a.platform === 'facebook' && a.has_token);
  const hasAny = hasIg || hasFb;
  const captionLen = value.caption.length;

  const update = (patch: Partial<AutoPostFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className={cn('rounded-lg border border-border p-3 space-y-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-primary" />
          <Label htmlFor="auto-post-toggle" className="font-medium cursor-pointer">Postar automaticamente</Label>
        </div>
        <Switch
          id="auto-post-toggle"
          checked={value.enabled}
          disabled={!hasAny}
          onCheckedChange={enabled => update({ enabled })}
          aria-label="Ativar postagem automática"
        />
      </div>

      {/* Status das contas */}
      {accounts === null ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Verificando contas conectadas…</p>
      ) : loadError ? (
        <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle size={12} /> {loadError}</p>
      ) : !hasAny ? (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" />
          Este cliente ainda não tem Instagram/Facebook conectado. Vá em <strong>Clientes → editar → Redes Sociais → Conectar</strong>.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {accounts.map(a => (
            <Badge key={a.id} variant="secondary" className="gap-1 text-xs font-normal">
              <CheckCircle2 size={11} className="text-success" />
              {a.platform === 'instagram' ? '@' : ''}{a.account_name}
              {a.api_base === 'instagram' && <span className="text-muted-foreground">· direto</span>}
              {a.expiring_soon && <AlertTriangle size={11} className="text-warning" aria-label="Autorização expira em breve" />}
            </Badge>
          ))}
        </div>
      )}

      {value.enabled && hasAny && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Onde publicar</Label>
              <Select value={value.platform} onValueChange={v => update({ platform: v as SocialPlatformTarget })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.filter(o =>
                    o.value === 'instagram' ? hasIg : o.value === 'facebook' ? hasFb : hasIg && hasFb
                  ).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Formato</Label>
              <Select value={value.publishType} onValueChange={v => update({ publishType: v as SocialPublishType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Link direto do vídeo/imagem final *</Label>
            <Input
              value={value.mediaUrl}
              onChange={e => update({ mediaUrl: e.target.value })}
              placeholder="https://… (arquivo enviado na edição)"
              inputMode="url"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Precisa ser um link público que abre o arquivo direto (não pasta do Drive).</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Legenda</Label>
              <span className={cn('text-[11px]', captionLen > 2200 ? 'text-destructive' : 'text-muted-foreground')}>{captionLen}/2200</span>
            </div>
            <Textarea
              value={value.caption}
              onChange={e => update({ caption: e.target.value })}
              rows={4}
              placeholder="Legenda com hashtags…"
              disabled={value.publishType === 'stories'}
            />
            {value.publishType === 'stories' && <p className="text-[11px] text-muted-foreground mt-1">Stories não aceitam legenda.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default AutoPostScheduleForm;
