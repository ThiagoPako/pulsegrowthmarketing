import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Link2, Loader2, MessageCircle, MousePointerClick, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DEFAULT_BUTTON_TEXTS } from '@/lib/storySeries';
import { fetchClientStoryLink, saveClientStoryLink } from '@/services/storiesApi';

interface Props {
  clientId: string;
  clientName: string;
  onClose: () => void;
  onSaved?: () => void;
}

const TEAM_ALL = 'equipe';

/** Número em formato de leitura: 55 62 99999-0101 → (62) 99999-0101 */
function displayPhone(value: string): string {
  const d = String(value || '').replace(/\D/g, '');
  const local = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || '';
}

/** Link do story por cliente: WhatsApp, mensagem pronta, botões e quem recebe os lembretes. */
export default function ClientStoryLinkDialog({ clientId, clientName, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['story-link', clientId],
    queryFn: () => fetchClientStoryLink(clientId),
    staleTime: 0,
  });
  const [whatsapp, setWhatsapp] = useState('');
  const [message, setMessage] = useState('');
  const [customText, setCustomText] = useState('');
  const [defaultText, setDefaultText] = useState(DEFAULT_BUTTON_TEXTS[0]);
  const [responsible, setResponsible] = useState<string>(TEAM_ALL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const link = query.data?.link;
    if (!link) return;
    setWhatsapp(displayPhone(link.whatsapp));
    setMessage(link.message || '');
    setCustomText(link.custom_text || '');
    setDefaultText(link.default_text || DEFAULT_BUTTON_TEXTS[0]);
    setResponsible(link.responsible_user_id || TEAM_ALL);
  }, [query.data]);

  const link = query.data?.link;
  const team = query.data?.team ?? [];
  const texts = [...DEFAULT_BUTTON_TEXTS, ...(customText.trim() ? [customText.trim()] : [])];

  const save = async () => {
    setSaving(true);
    try {
      await saveClientStoryLink(clientId, {
        whatsapp,
        message,
        custom_text: customText.trim() || null,
        default_text: texts.includes(defaultText) ? defaultText : DEFAULT_BUTTON_TEXTS[0],
        responsible_user_id: responsible === TEAM_ALL ? null : responsible,
      });
      toast.success('Link do story salvo');
      queryClient.invalidateQueries({ queryKey: ['story-link', clientId] });
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-lg gap-0 overflow-y-auto p-0">
        <DialogHeader className="space-y-0 border-b border-border p-4 pr-12">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/20">
              <MessageCircle size={19} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">Link do story</DialogTitle>
              <div className="truncate text-xs text-muted-foreground">{clientName}</div>
            </div>
          </div>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-9" />
            <Skeleton className="h-20" />
          </div>
        ) : query.error ? (
          <div className="p-4 text-sm text-destructive">{(query.error as Error).message}</div>
        ) : (
          <div className="space-y-4 p-4">
            {link?.url && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-2.5">
                <Link2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:underline">
                  {link.url.replace(/^https?:\/\//, '')}
                </a>
                {link.short_url && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground" title="Cliques">
                    <MousePointerClick size={11} /> {link.clicks}
                  </span>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(link.url as string)} aria-label="Copiar link">
                  <Copy size={13} />
                </Button>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="story-wa" className="text-xs">WhatsApp</Label>
              <Input id="story-wa" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(62) 99999-0000" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="story-msg" className="text-xs">Mensagem pronta</Label>
                <span className="text-[10px] tabular-nums text-muted-foreground">{message.length}/500</span>
              </div>
              <Textarea id="story-msg" value={message} onChange={(e) => setMessage(e.target.value.slice(0, 500))} rows={2} placeholder="Olá! Vi o story e quero saber mais" className="text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Botões</Label>
              <div className="space-y-1.5" role="radiogroup" aria-label="Botão padrão">
                {texts.map((text) => {
                  const active = defaultText === text;
                  return (
                    <button
                      key={text}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDefaultText(text)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all',
                        active ? 'border-amber-500 bg-amber-500/10 font-semibold text-foreground' : 'border-border text-muted-foreground hover:border-amber-400/60 hover:text-foreground',
                      )}
                    >
                      <span className="truncate">{text}</span>
                      <Star size={14} className={active ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40'} aria-label={active ? 'Padrão' : undefined} />
                    </button>
                  );
                })}
              </div>
              <Input value={customText} onChange={(e) => setCustomText(e.target.value.slice(0, 30))} placeholder="Personalizado" aria-label="Botão personalizado" className="h-9" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lembretes para</Label>
              <Select value={responsible} onValueChange={setResponsible}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TEAM_ALL}>Admin e social media da cidade</SelectItem>
                  {team.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}{member.role === 'social_media' ? ' · Social media' : ' · Admin'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row justify-end gap-2 border-t border-border p-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Fechar</Button>
          <Button type="button" size="sm" onClick={save} disabled={saving || query.isLoading || !whatsapp.trim()} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
