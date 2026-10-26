import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Facebook, Instagram, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import { cn } from '@/lib/utils';
import {
  addDaysKey, brtToIso, formatDayLabel, suggestFormat, todayKey,
  type PublishFormat, type PublishTarget, type SchedulingAccount, type SchedulingItem,
} from '@/lib/postingSchedule';
import { cancelSchedule, rescheduleMaterial, scheduleMaterial, SchedulingApiError } from '@/services/schedulingApi';
import MaterialThumb from './MaterialThumb';
import { StateBadge } from './SchedulingItemChip';
import { FORMAT_LABELS, TYPE_STYLES } from './schedulingStyles';

interface Props {
  item: SchedulingItem | null;
  /** Dia em que o item foi solto no calendário (agendar arrastando) */
  presetDate?: string | null;
  clientId: string;
  accounts: SchedulingAccount[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

function Segmented<T extends string>({ value, options, onChange, disabled }: {
  value: T;
  options: { value: T; label: string; icon?: typeof Instagram }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60',
              active ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ScheduleDialog({ item, presetDate, clientId, accounts, onClose, onSaved }: Props) {
  const hasIg = accounts.some((a) => a.platform === 'instagram');
  const hasFb = accounts.some((a) => a.platform === 'facebook');
  const hasAccounts = hasIg || hasFb;
  const scheduled = !!item && !item.ghost && ['agendado', 'manual', 'erro'].includes(item.state);
  const readOnly = !!item && (item.state === 'publicado' || item.state === 'publicando' || (item.ghost && item.kind === 'post'));

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mode, setMode] = useState<'auto' | 'manual'>('manual');
  const [platform, setPlatform] = useState<PublishTarget>('instagram');
  const [format, setFormat] = useState<PublishFormat>('reels');
  const [caption, setCaption] = useState('');
  const [storyLink, setStoryLink] = useState('');
  const [storyLinkText, setStoryLinkText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const initial = useMemo(() => {
    if (!item) return null;
    const post = item.post;
    const isAutoNow = scheduled && item.mode === 'auto';
    return {
      date: presetDate || (item.ghost ? item.when?.date : null) || (scheduled || readOnly ? item.when?.date : null) || addDaysKey(todayKey(), 1),
      time: (scheduled || readOnly || item.ghost ? item.when?.time : null) || '',
      mode: (item.kind === 'post' || isAutoNow || (!scheduled && hasAccounts) ? 'auto' : 'manual') as 'auto' | 'manual',
      platform: (post?.platform || (hasIg ? 'instagram' : hasFb ? 'facebook' : 'instagram')) as PublishTarget,
      format: suggestFormat(item),
      caption: post?.caption ?? item.caption ?? '',
      storyLink: post?.story_link || '',
      storyLinkText: post?.story_link_text || '',
      mediaUrl: post?.media_url || item.media_url || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key, presetDate, hasIg, hasFb]);

  useEffect(() => {
    if (!initial) return;
    setDate(initial.date);
    setTime(initial.time);
    setMode(initial.mode);
    setPlatform(initial.platform);
    setFormat(initial.format);
    setCaption(initial.caption);
    setStoryLink(initial.storyLink);
    setStoryLinkText(initial.storyLinkText);
    setMediaUrl(initial.mediaUrl);
    setSaving(false);
  }, [initial]);

  if (!item || !initial) return null;

  const type = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
  const platformOptions = mode === 'auto'
    ? [
      ...(hasIg ? [{ value: 'instagram' as const, label: 'Instagram', icon: Instagram }] : []),
      ...(hasFb ? [{ value: 'facebook' as const, label: 'Facebook', icon: Facebook }] : []),
      ...(hasIg && hasFb ? [{ value: 'both' as const, label: 'Os dois' }] : []),
    ]
    : [
      { value: 'instagram' as const, label: 'Instagram', icon: Instagram },
      { value: 'facebook' as const, label: 'Facebook', icon: Facebook },
      { value: 'both' as const, label: 'Os dois' },
    ];
  const formatOptions: { value: PublishFormat; label: string }[] = [
    { value: 'reels', label: FORMAT_LABELS.reels },
    { value: 'feed', label: FORMAT_LABELS.feed },
    { value: 'stories', label: FORMAT_LABELS.stories },
    ...(item.media_items.length > 1 || format === 'carousel' ? [{ value: 'carousel' as const, label: FORMAT_LABELS.carousel }] : []),
  ];
  const isStory = format === 'stories';
  const multiImage = item.kind === 'arte' && item.media_items.length > 0;

  const onlyWhenChanged = scheduled && item.state !== 'erro'
    && mode === initial.mode && platform === initial.platform && format === initial.format
    && caption === initial.caption && storyLink === initial.storyLink && storyLinkText === initial.storyLinkText
    && mediaUrl === initial.mediaUrl;

  const changeMode = (next: 'auto' | 'manual') => {
    setMode(next);
    if (next === 'auto' && !platformOptionsFor(next).includes(platform)) setPlatform(hasIg ? 'instagram' : 'facebook');
  };
  function platformOptionsFor(next: 'auto' | 'manual'): PublishTarget[] {
    if (next === 'manual') return ['instagram', 'facebook', 'both'];
    return [...(hasIg ? ['instagram' as const] : []), ...(hasFb ? ['facebook' as const] : []), ...(hasIg && hasFb ? ['both' as const] : [])];
  }

  const save = async (allowPast = false) => {
    const iso = brtToIso(date, time);
    if (!iso) { toast.error('Escolha a data e a hora'); return; }
    const past = Date.parse(iso) < Date.now() - 60_000;
    if (past && mode === 'auto') { toast.error('O horário escolhido já passou. Escolha um horário futuro.'); return; }
    if (past && !allowPast) {
      setConfirm({
        title: 'Data no passado',
        description: `${formatDayLabel(date)} às ${time}`,
        confirmLabel: 'Salvar mesmo assim',
        onConfirm: () => save(true),
      });
      return;
    }
    setSaving(true);
    try {
      if (onlyWhenChanged) {
        await rescheduleMaterial({ client_id: clientId, kind: item.kind, id: item.id, date, time, allow_past: allowPast || undefined });
        onSaved('Agendamento atualizado');
      } else {
        const media = mode === 'auto'
          ? (format === 'carousel'
            ? { media_items: item.media_items }
            : { media_url: (multiImage ? item.media_items[0] : mediaUrl.trim()) || null })
          : {};
        await scheduleMaterial({
          client_id: clientId,
          kind: item.kind,
          id: item.id,
          date,
          time,
          mode,
          platform,
          publish_type: format,
          caption: isStory ? '' : caption,
          story_link: isStory ? storyLink.trim() || null : null,
          story_link_text: isStory ? storyLinkText.trim() || null : null,
          allow_past: allowPast || undefined,
          ...media,
        });
        onSaved(scheduled ? 'Agendamento atualizado' : 'Agendado');
      }
    } catch (err) {
      const e = err as SchedulingApiError;
      if (e.code === 'past_date' && !allowPast) {
        setConfirm({ title: 'Data no passado', description: `${formatDayLabel(date)} às ${time}`, confirmLabel: 'Salvar mesmo assim', onConfirm: () => save(true) });
      } else {
        toast.error(e.message || 'Não foi possível salvar');
      }
    } finally {
      setSaving(false);
    }
  };

  const askCancel = () => setConfirm({
    title: 'Cancelar agendamento?',
    description: `${item.title}${item.when ? ` · ${formatDayLabel(item.when.date)}${item.when.time ? ` às ${item.when.time}` : ''}` : ''}`,
    confirmLabel: 'Cancelar agendamento',
    destructive: true,
    onConfirm: async () => {
      setSaving(true);
      try {
        await cancelSchedule({ client_id: clientId, kind: item.kind, id: item.id });
        onSaved('Agendamento cancelado');
      } catch (err) {
        toast.error((err as Error).message || 'Não foi possível cancelar');
      } finally {
        setSaving(false);
      }
    },
  });

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
        <DialogContent className="max-h-[92vh] max-w-xl gap-0 overflow-y-auto p-0">
          <DialogHeader className="space-y-0 border-b border-border p-4 pr-12">
            <div className="flex items-start gap-3">
              <MaterialThumb item={item} videoFrame className="h-16 w-16 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="line-clamp-2 text-base leading-snug">{item.title}</DialogTitle>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('rounded px-1.5 py-px text-[10px] font-semibold', type.soft, type.text)}>{type.label}</span>
                  <StateBadge state={item.ghost ? 'cancelado' : item.state} />
                  {accounts.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                      {a.platform === 'instagram' ? <Instagram size={10} /> : <Facebook size={10} />}
                      {a.username || a.account_name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 p-4">
            {item.post?.last_error && (item.state === 'erro' || item.ghost) && (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertTriangle size={14} className="mt-px shrink-0" />
                <span className="break-words">{item.post.last_error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sched-date" className="text-xs">Data</Label>
                <Input id="sched-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnly} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-time" className="text-xs">Hora</Label>
                <Input id="sched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={readOnly} />
              </div>
            </div>

            {hasAccounts && item.kind !== 'post' && !readOnly && (
              <div className="space-y-1">
                <Label className="text-xs">Postagem</Label>
                <Segmented
                  value={mode}
                  onChange={changeMode}
                  options={[{ value: 'auto', label: 'Automática', icon: CalendarClock }, { value: 'manual', label: 'Manual' }]}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Rede</Label>
              <Segmented<PublishTarget> value={platform} onChange={setPlatform} options={platformOptions} disabled={readOnly} />
            </div>

            {(mode === 'auto' || readOnly) && (
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Segmented<PublishFormat> value={format} onChange={setFormat} options={formatOptions} disabled={readOnly} />
              </div>
            )}

            {mode === 'auto' && !isStory && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sched-caption" className="text-xs">Legenda</Label>
                  <span className={cn('text-[10px] tabular-nums', caption.length > 2200 ? 'text-destructive' : 'text-muted-foreground')}>{caption.length}/2200</span>
                </div>
                <Textarea id="sched-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} disabled={readOnly} className="text-sm" />
              </div>
            )}

            {mode === 'auto' && isStory && (
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <div className="space-y-1">
                  <Label htmlFor="sched-story-link" className="text-xs">Link do story</Label>
                  <Input id="sched-story-link" value={storyLink} onChange={(e) => setStoryLink(e.target.value)} placeholder="https://" disabled={readOnly} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sched-story-text" className="text-xs">Texto do link</Label>
                  <Input id="sched-story-text" value={storyLinkText} onChange={(e) => setStoryLinkText(e.target.value)} disabled={readOnly} />
                </div>
              </div>
            )}

            {mode === 'auto' && !readOnly && (
              multiImage ? (
                <div className="space-y-1">
                  <Label className="text-xs">Mídia</Label>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {(format === 'carousel' ? item.media_items : item.media_items.slice(0, 1)).map((url, i) => (
                      <img key={url + i} src={url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md border border-border object-cover" />
                    ))}
                  </div>
                </div>
              ) : format !== 'carousel' && (
                <div className="space-y-1">
                  <Label htmlFor="sched-media" className="text-xs">Mídia</Label>
                  <Input id="sched-media" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://" className="text-xs" />
                </div>
              )
            )}
          </div>

          <DialogFooter className="flex-row items-center gap-2 border-t border-border p-4 sm:justify-between">
            {scheduled && !readOnly ? (
              <Button type="button" variant="ghost" size="sm" onClick={askCancel} disabled={saving} className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 size={14} /> Cancelar agendamento
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Fechar</Button>
              {!readOnly && (
                <Button type="button" size="sm" onClick={() => save(false)} disabled={saving || !date || !time} className="gap-1.5">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                  {scheduled ? 'Salvar' : 'Agendar'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog action={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
