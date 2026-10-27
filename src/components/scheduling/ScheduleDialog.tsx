import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BellRing, CalendarClock, Check, Copy, Facebook, Instagram, Loader2, Repeat2, Sparkles, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import { cn } from '@/lib/utils';
import {
  addDaysKey, brtToIso, formatDayLabel, suggestFormat, todayKey, weekdayIndex,
  type PublishFormat, type PublishTarget, type SchedulingAccount, type SchedulingItem, type StoryLinkDefaults,
} from '@/lib/postingSchedule';
import {
  DEFAULT_BUTTON_TEXTS, defaultRepeat, rememberTime, repeatFromRule, repeatPayload, repeatProblem, type RepeatDraft,
} from '@/lib/storySeries';
import {
  cancelSchedule, generateCaption, rescheduleMaterial, saveCaption, scheduleMaterial, SchedulingApiError, type CaptionSource,
} from '@/services/schedulingApi';
import {
  cancelStoryOccurrence, cancelStorySeries, createStorySeries, updateStoryOccurrence, updateStorySeries,
} from '@/services/storiesApi';
import MaterialThumb from './MaterialThumb';
import { StateBadge, StoryBadgePill } from './SchedulingItemChip';
import StoryLinkFields from './StoryLinkFields';
import StoryReminderPanel from './StoryReminderPanel';
import StorySeriesRepeat from './StorySeriesRepeat';
import { FORMAT_LABELS, TYPE_STYLES } from './schedulingStyles';

interface Props {
  item: SchedulingItem | null;
  /** Dia em que o item foi solto no calendário (agendar arrastando) */
  presetDate?: string | null;
  /** Hora padrão (a última usada) para quem ainda não tem hora */
  presetTime?: string | null;
  clientId: string;
  accounts: SchedulingAccount[];
  /** Link e botões do story do cliente (vêm preenchidos) */
  storyLink?: StoryLinkDefaults | null;
  onEditClientLink?: () => void;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type PostMode = 'auto' | 'lembrete' | 'manual';
type Scope = 'one' | 'following';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: typeof Instagram;
  disabled?: boolean;
}

function Segmented<T extends string>({ value, options, onChange, disabled, label }: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50',
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

const CAPTION_SOURCES: Record<CaptionSource, string> = {
  roteiro: 'a partir do roteiro',
  video: 'a partir do vídeo (imagens e fala)',
  arte: 'a partir da arte',
  titulo: 'a partir do título e do nicho do cliente',
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Legenda copiada');
  } catch {
    toast.error('Não foi possível copiar');
  }
}

export default function ScheduleDialog({
  item, presetDate, presetTime, clientId, accounts, storyLink: clientLink, onEditClientLink, onClose, onSaved,
}: Props) {
  const hasIg = accounts.some((a) => a.platform === 'instagram');
  const hasFb = accounts.some((a) => a.platform === 'facebook');
  const hasAccounts = hasIg || hasFb;
  const series = item?.series || null;
  const isSeriesItem = !!series;
  const seriesActive = series?.status === 'ativa';
  const scheduled = !!item && !item.ghost && ['agendado', 'manual', 'erro'].includes(item.state);
  const readOnly = !!item && (item.state === 'publicado' || item.state === 'publicando' || (item.ghost && item.kind === 'post'));

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mode, setMode] = useState<PostMode>('manual');
  const [platform, setPlatform] = useState<PublishTarget>('instagram');
  const [format, setFormat] = useState<PublishFormat>('reels');
  const [caption, setCaption] = useState('');
  const [storyLink, setStoryLink] = useState('');
  const [storyLinkText, setStoryLinkText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [repeat, setRepeat] = useState<RepeatDraft>(defaultRepeat(''));
  const [scope, setScope] = useState<Scope>('one');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingCaption, setSavingCaption] = useState(false);
  const [savedCaption, setSavedCaption] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const initial = useMemo(() => {
    if (!item) return null;
    const post = item.post;
    const isAutoNow = scheduled && item.mode === 'auto';
    const fmt: PublishFormat = isSeriesItem ? 'stories' : suggestFormat(item);
    let initialMode: PostMode;
    if (post?.story_mode === 'lembrete') initialMode = 'lembrete';
    else if (item.kind === 'post' || item.kind === 'serie' || isAutoNow) initialMode = 'auto';
    else if (scheduled) initialMode = 'manual';
    else initialMode = hasAccounts ? 'auto' : (fmt === 'stories' ? 'lembrete' : 'manual');
    const initialDate = presetDate || (item.ghost ? item.when?.date : null) || (scheduled || readOnly ? item.when?.date : null) || addDaysKey(todayKey(), 1);
    return {
      date: initialDate,
      time: (scheduled || readOnly || item.ghost ? item.when?.time : null) || presetTime || '',
      mode: initialMode,
      platform: (post?.platform || (hasIg ? 'instagram' : hasFb ? 'facebook' : 'instagram')) as PublishTarget,
      format: fmt,
      caption: post?.caption || item.caption || '',
      storyLink: post?.story_link || clientLink?.url || '',
      storyLinkText: post?.story_link_text || clientLink?.default_text || DEFAULT_BUTTON_TEXTS[0],
      mediaUrl: post?.media_url || item.media_url || '',
      repeat: series ? repeatFromRule(series.rule, series.index) : defaultRepeat(initialDate),
      scope: (item.virtual ? 'following' : 'one') as Scope,
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
    setRepeat(initial.repeat);
    setScope(initial.scope);
    setSaving(false);
    setSavedCaption(initial.caption);
  }, [initial]);

  const generate = async () => {
    if (!item) return;
    setGenerating(true);
    try {
      const result = await generateCaption({ client_id: clientId, kind: item.kind, id: item.id });
      setCaption(result.caption);
      toast.success(`Legenda criada ${CAPTION_SOURCES[result.fonte] || ''}`.trim(), { description: 'Revise antes de salvar.' });
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível gerar a legenda');
    } finally {
      setGenerating(false);
    }
  };

  // Guarda só a legenda (sem mexer na data): serve para o material ainda sem data e para o manual
  const storeCaption = async () => {
    if (!item) return;
    setSavingCaption(true);
    try {
      await saveCaption({ client_id: clientId, kind: item.kind, id: item.id, caption });
      setSavedCaption(caption);
      toast.success('Legenda salva');
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível salvar a legenda');
    } finally {
      setSavingCaption(false);
    }
  };

  // Link do cliente salvo com o diálogo aberto: entra no story que ainda não tinha link próprio
  useEffect(() => {
    if (!clientLink?.url || item?.post?.story_link) return;
    setStoryLink((current) => current || clientLink.url || '');
    setStoryLinkText((current) => (current && current !== DEFAULT_BUTTON_TEXTS[0] ? current : clientLink.default_text || current));
  }, [clientLink?.url, clientLink?.default_text, item?.post?.story_link]);

  if (!item || !initial) return null;

  const type = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
  const isStory = format === 'stories';
  const multiImage = item.kind === 'arte' && item.media_items.length > 0;
  const following = isSeriesItem && scope === 'following';
  // Repetir: story de um material (o post solto do Estúdio não repete); na série, só "este e os próximos"
  const canRepeat = isStory && mode !== 'manual' && !readOnly && (isSeriesItem ? following : ['conteudo', 'arte', 'portal'].includes(item.kind));
  const repeatOn = canRepeat && (following || repeat.enabled);
  const reminderPost = item.post?.story_mode === 'lembrete' && item.post.id && !item.virtual
    && (item.state === 'agendado' || (item.state === 'publicado' && item.post.manual_posted));

  function platformOptionsFor(next: PostMode): PublishTarget[] {
    if (next !== 'auto') return ['instagram', 'facebook', 'both'];
    return [...(hasIg ? ['instagram' as const] : []), ...(hasFb ? ['facebook' as const] : []), ...(hasIg && hasFb ? ['both' as const] : [])];
  }
  const platformOptions: Option<PublishTarget>[] = platformOptionsFor(mode).map((value) => ({
    value,
    label: value === 'instagram' ? 'Instagram' : value === 'facebook' ? 'Facebook' : 'Os dois',
    icon: value === 'instagram' ? Instagram : value === 'facebook' ? Facebook : undefined,
  }));
  const formatOptions: Option<PublishFormat>[] = [
    { value: 'reels', label: FORMAT_LABELS.reels },
    { value: 'feed', label: FORMAT_LABELS.feed },
    { value: 'stories', label: FORMAT_LABELS.stories },
    ...(item.media_items.length > 1 || format === 'carousel' ? [{ value: 'carousel' as const, label: FORMAT_LABELS.carousel }] : []),
  ];
  const modeOptions: Option<PostMode>[] = isStory
    ? [
      { value: 'auto', label: 'Postar sozinho', icon: CalendarClock, disabled: !hasAccounts },
      { value: 'lembrete', label: 'Lembrete com link', icon: BellRing },
      ...(!isSeriesItem && item.kind !== 'post' ? [{ value: 'manual' as const, label: 'Manual' }] : []),
    ]
    : [
      ...(hasAccounts || item.kind === 'post' ? [{ value: 'auto' as const, label: 'Automática', icon: CalendarClock }] : []),
      ...(item.kind !== 'post' ? [{ value: 'manual' as const, label: 'Manual' }] : []),
    ];

  const changeMode = (next: PostMode) => {
    setMode(next);
    if (!platformOptionsFor(next).includes(platform)) setPlatform(hasIg ? 'instagram' : 'facebook');
  };
  const changeFormat = (next: PublishFormat) => {
    setFormat(next);
    if (next !== 'stories' && mode === 'lembrete') changeMode(hasAccounts ? 'auto' : 'manual');
    if (next === 'stories' && mode === 'auto' && !hasAccounts) changeMode('lembrete');
  };
  const changeDate = (next: string) => {
    setDate(next);
    // Repetição ainda desligada: o dia da semana acompanha a data
    if (!repeat.enabled && !isSeriesItem && next) {
      setRepeat((r) => ({ ...r, weekdays: [weekdayIndex(next)], end_date: addDaysKey(next, 30) }));
    }
  };

  const postsAlone = mode !== 'manual';
  const storyFields = () => ({
    client_id: clientId,
    date,
    time,
    platform,
    story_mode: mode === 'lembrete' ? 'lembrete' as const : 'auto' as const,
    story_link: mode === 'lembrete' ? storyLink.trim() || null : null,
    story_link_text: mode === 'lembrete' ? storyLinkText.trim() || null : null,
  });

  const onlyWhenChanged = scheduled && !isSeriesItem && item.state !== 'erro'
    && mode === initial.mode && platform === initial.platform && format === initial.format
    && caption === initial.caption && storyLink === initial.storyLink && storyLinkText === initial.storyLinkText
    && mediaUrl === initial.mediaUrl && !repeatOn;

  const save = async (allowPast = false) => {
    const iso = brtToIso(date, time);
    if (!iso) { toast.error('Escolha a data e a hora'); return; }
    const past = Date.parse(iso) < Date.now() - 60_000;
    if (past && (postsAlone || repeatOn)) { toast.error('O horário escolhido já passou. Escolha um horário futuro.'); return; }
    if (past && !allowPast) {
      setConfirm({
        title: 'Data no passado',
        description: `${formatDayLabel(date)} às ${time}`,
        confirmLabel: 'Salvar mesmo assim',
        onConfirm: () => save(true),
      });
      return;
    }
    const problem = repeatOn ? repeatProblem({ ...repeat, enabled: true }, date) : null;
    if (problem) { toast.error(problem); return; }
    if (mode === 'lembrete' && storyLink.trim() && !/^https?:\/\//i.test(storyLink.trim())) {
      toast.error('O link do story precisa começar com https://');
      return;
    }
    setSaving(true);
    rememberTime(time);
    try {
      if (isSeriesItem && series) {
        if (following) {
          await updateStorySeries(series.id, { ...storyFields(), from_slot: series.slot_at as string, repeat: repeatPayload({ ...repeat, enabled: true }) });
          onSaved('Repetição atualizada');
        } else {
          await updateStoryOccurrence(item.id, storyFields());
          onSaved('Data atualizada');
        }
        return;
      }
      const media = postsAlone
        ? (format === 'carousel'
          ? { media_items: item.media_items }
          : { media_url: (multiImage ? item.media_items[0] : mediaUrl.trim()) || null })
        : {};
      if (repeatOn) {
        await createStorySeries({
          ...storyFields(), kind: item.kind, id: item.id, media_url: 'media_url' in media ? media.media_url : null,
          repeat: repeatPayload({ ...repeat, enabled: true }),
        });
        onSaved('Repetição agendada');
        return;
      }
      if (onlyWhenChanged) {
        await rescheduleMaterial({ client_id: clientId, kind: item.kind, id: item.id, date, time, allow_past: allowPast || undefined });
        onSaved('Agendamento atualizado');
        return;
      }
      await scheduleMaterial({
        client_id: clientId,
        kind: item.kind,
        id: item.id,
        date,
        time,
        mode: postsAlone ? 'auto' : 'manual',
        platform,
        publish_type: format,
        caption: isStory ? '' : caption,
        ...(isStory && postsAlone ? storyFields() : {}),
        allow_past: allowPast || undefined,
        ...media,
      });
      onSaved(scheduled ? 'Agendamento atualizado' : 'Agendado');
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

  const whenLabel = `${item.title}${item.when ? ` · ${formatDayLabel(item.when.date)}${item.when.time ? ` às ${item.when.time}` : ''}` : ''}`;
  const askCancel = () => {
    if (isSeriesItem && series) {
      setConfirm({
        title: following ? 'Cancelar esta data e as próximas?' : 'Cancelar esta data?',
        description: following ? `${whenLabel} · ${series.label}` : whenLabel,
        confirmLabel: following ? 'Sim, cancelar as próximas' : 'Sim, cancelar esta data',
        destructive: true,
        onConfirm: async () => {
          setSaving(true);
          try {
            if (following) await cancelStorySeries(series.id, { client_id: clientId, from_slot: series.slot_at });
            else await cancelStoryOccurrence(item.id, clientId);
            onSaved(following ? 'Repetição cancelada' : 'Data cancelada');
          } catch (err) {
            toast.error((err as Error).message || 'Não foi possível cancelar');
          } finally {
            setSaving(false);
          }
        },
      });
      return;
    }
    setConfirm({
      title: 'Cancelar agendamento?',
      description: whenLabel,
      confirmLabel: 'Sim, cancelar agendamento',
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
  };

  const saveLabel = following ? 'Salvar as próximas' : isSeriesItem ? 'Salvar esta data' : repeatOn ? 'Agendar repetição' : scheduled ? 'Salvar' : 'Agendar';

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
                  <StoryBadgePill item={item} fallback={<StateBadge state={item.ghost ? 'cancelado' : item.state} />} />
                  {series && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/30 bg-pink-500/10 px-1.5 py-px text-[10px] font-medium text-pink-700 dark:text-pink-300">
                      <Repeat2 size={10} aria-hidden="true" /> {series.label}
                    </span>
                  )}
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
            {((item.post?.last_error && (item.state === 'erro' || item.ghost)) || series?.last_error) && (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertTriangle size={14} className="mt-px shrink-0" />
                <span className="break-words">{item.post?.last_error || series?.last_error}</span>
              </div>
            )}

            {reminderPost && (
              <StoryReminderPanel
                postId={item.post?.id || null}
                mediaUrl={item.post?.media_url || item.media_url}
                link={item.post?.story_link || null}
                buttonText={item.post?.story_link_text || null}
                notified={!!item.post?.reminder_sent_at}
                posted={item.state === 'publicado'}
                onPosted={() => onSaved('Postado')}
              />
            )}

            {isSeriesItem && seriesActive && !item.virtual && !readOnly && (
              <Segmented<Scope>
                label="O que mudar"
                value={scope}
                onChange={setScope}
                options={[{ value: 'one', label: 'Só este' }, { value: 'following', label: 'Este e os próximos', icon: Repeat2 }]}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sched-date" className="text-xs">{following ? 'A partir de' : 'Data'}</Label>
                <Input id="sched-date" type="date" value={date} onChange={(e) => changeDate(e.target.value)} disabled={readOnly} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-time" className="text-xs">Hora</Label>
                <Input id="sched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={readOnly} />
              </div>
            </div>

            {!isSeriesItem && (
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Segmented<PublishFormat> label="Tipo" value={format} onChange={changeFormat} options={formatOptions} disabled={readOnly} />
              </div>
            )}

            {!readOnly && modeOptions.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">Postagem</Label>
                <Segmented<PostMode> label="Postagem" value={mode} onChange={changeMode} options={modeOptions} />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Rede</Label>
              <Segmented<PublishTarget> label="Rede" value={platform} onChange={setPlatform} options={platformOptions} disabled={readOnly} />
            </div>

            {isStory && mode === 'lembrete' && !readOnly && (
              <StoryLinkFields
                item={item}
                link={storyLink}
                onLinkChange={setStoryLink}
                buttonText={storyLinkText}
                onButtonTextChange={setStoryLinkText}
                buttonTexts={clientLink?.button_texts}
                onEditClientLink={onEditClientLink}
              />
            )}

            {canRepeat && (
              <StorySeriesRepeat value={repeat} onChange={setRepeat} startDate={date} time={time} forced={following} />
            )}

            {!isSeriesItem && !isStory && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="sched-caption" className="text-xs">Legenda</Label>
                  <div className="flex items-center gap-1">
                    {caption && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => copyText(caption)}>
                        <Copy size={11} /> Copiar
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={generate}
                        disabled={generating}
                        className="h-6 gap-1 border-primary/40 px-2 text-[11px] text-primary hover:bg-primary/10 hover:text-primary"
                        title="A IA lê o roteiro; sem roteiro, assiste ao vídeo (ou olha a arte) e escreve no tom do nicho do cliente"
                      >
                        {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        {generating ? 'Gerando…' : caption ? 'Gerar outra' : 'Gerar com IA'}
                      </Button>
                    )}
                    <span className={cn('text-[10px] tabular-nums', caption.length > 2200 ? 'text-destructive' : 'text-muted-foreground')}>{caption.length}/2200</span>
                  </div>
                </div>
                <Textarea
                  id="sched-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                  disabled={readOnly || generating}
                  placeholder="Escreva a legenda ou clique em Gerar com IA"
                  className={cn('text-sm', generating && 'animate-pulse')}
                />
                {generating && (
                  <p className="text-[11px] text-muted-foreground">Lendo o roteiro ou assistindo ao vídeo… pode levar até 1 minuto.</p>
                )}
                {!readOnly && savedCaption !== null && caption !== savedCaption && (
                  <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={storeCaption} disabled={savingCaption || caption.length > 2200} className="h-6 gap-1 px-2 text-[11px]">
                      {savingCaption ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Salvar só a legenda
                    </Button>
                  </div>
                )}
              </div>
            )}

            {postsAlone && !readOnly && !isSeriesItem && (
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
              <Button type="button" variant="ghost" size="sm" onClick={askCancel} disabled={saving} className="gap-1.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 size={14} /> {isSeriesItem ? (following ? 'Cancelar as próximas' : 'Cancelar data') : 'Cancelar agendamento'}
              </Button>
            ) : <span />}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Fechar</Button>
              {!readOnly && (
                <Button type="button" size="sm" onClick={() => save(false)} disabled={saving || !date || !time} className="gap-1.5">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : repeatOn ? <Repeat2 size={14} /> : <CalendarClock size={14} />}
                  {saveLabel}
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
