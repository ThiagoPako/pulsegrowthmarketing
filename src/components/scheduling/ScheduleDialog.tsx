import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowRight, BellRing, Zap, CalendarCheck2, CalendarClock, Check, Copy, Facebook, Instagram, Linkedin, Loader2, Music2, Repeat2, Sparkles, Trash2, UserPlus, Youtube } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import { cn } from '@/lib/utils';
import MediaFitNotes from './MediaFitNotes';
import NetworkPreview from '@/components/social/NetworkPreview';
import StoryTrackField, { type StoryTrack } from './StoryTrackField';
import {
  addDaysKey, brtParts, brtToIso, formatDayLabel, suggestFormat, todayKey, weekdayIndex,
  NETWORK_LABELS, NETWORK_MAX,
  type Network, type PublishFormat, type PublishTarget, type SchedulingAccount, type SchedulingItem, type StoryLinkDefaults,
} from '@/lib/postingSchedule';

const NETWORK_ICONS: Record<Network, typeof Instagram> = { instagram: Instagram, facebook: Facebook, tiktok: Music2, linkedin: Linkedin, youtube: Youtube };
const NETWORK_ORDER: Network[] = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'];
import {
  DEFAULT_BUTTON_TEXTS, defaultRepeat, rememberTime, repeatFromRule, repeatPayload, repeatProblem, type RepeatDraft,
} from '@/lib/storySeries';
import {
  cancelSchedule, generateCaption, markMaterialPosted, rescheduleMaterial, saveCaption, scheduleMaterial, SchedulingApiError, type CaptionSource,
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
  /** nome e logo do cliente na prévia quando a conta não tem foto (usuário, 03/11/2026) */
  clientName?: string;
  clientLogo?: string | null;
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
  // a marcação desliza até a opção tocada (usuário, 03/11/2026: "quero motion, bem feito e sofisticado")
  const group = useId();
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-border/70 bg-muted/40 p-1" role="radiogroup" aria-label={label}>
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
              'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span layoutId={`seg-${group}`} transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                className="absolute inset-0 rounded-lg bg-primary shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.6),inset_0_1px_0_hsl(0_0%_100%/0.25)]" />
            )}
            <span className="relative flex items-center gap-1.5">
              {Icon && <Icon size={13} aria-hidden="true" />}
              {o.label}
            </span>
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
  item, presetDate, presetTime, clientId, clientName, clientLogo, accounts, storyLink: clientLink, onEditClientLink, onClose, onSaved,
}: Props) {
  const hasIg = accounts.some((a) => a.platform === 'instagram');
  const hasFb = accounts.some((a) => a.platform === 'facebook');
  // redes com conta conectada (Instagram/Facebook pela Meta ou pela Upload-Post; TikTok, LinkedIn e YouTube pela Upload-Post)
  const connectedNets = NETWORK_ORDER.filter((n) => accounts.some((a) => a.platform === n));
  const hasAccounts = connectedNets.length > 0;
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
  // uma legenda por rede (02/11/2026: "cada rede social a legenda deve ser focada para atender o público daquela rede")
  const [networks, setNetworks] = useState<Network[]>([]);
  const [captions, setCaptions] = useState<Partial<Record<Network, string>>>({});
  const [activeNet, setActiveNet] = useState<Network>('instagram');
  const [firstComment, setFirstComment] = useState('');
  const [collab, setCollab] = useState('');
  const caption = captions[activeNet] ?? '';
  const [captionsTouched, setCaptionsTouched] = useState(false);
  const setCaption = (text: string) => { setCaptionsTouched(true); setCaptions((c) => ({ ...c, [activeNet]: text })); };
  const [storyLink, setStoryLink] = useState('');
  const [storyLinkText, setStoryLinkText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  // ordem do carrossel (usuário, 02/11/2026: "possível postar carrossel e organizar a ordem certinha")
  const [order, setOrder] = useState<string[]>([]);
  const [track, setTrack] = useState<StoryTrack | null>(null);
  // formato que o Instagram recusa (story > 60 s, reels < 3 s): trava o agendamento automático
  const [mediaBlocked, setMediaBlocked] = useState(false);
  // "Postar agora" (usuário, 02/11/2026): põe o horário de agora e salva; o robô publica em até 15 s
  const [postNowPending, setPostNowPending] = useState(false);
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
      networks: ((post?.platforms && post.platforms.length ? post.platforms
        : post?.platform === 'both' ? ['instagram', 'facebook'] : post?.platform ? [post.platform] : connectedNets.filter((n) => n === 'instagram' || n === 'facebook'))
        .filter((n) => connectedNets.includes(n as Network)) as Network[]),
      captions: (post?.captions || null) as Partial<Record<Network, string>> | null,
      storyLink: post?.story_link || clientLink?.url || '',
      storyLinkText: post?.story_link_text || clientLink?.default_text || DEFAULT_BUTTON_TEXTS[0],
      mediaUrl: post?.media_url || item.media_url || '',
      order: post?.media_items?.length ? post.media_items : item.media_items,
      track: post?.story_audio_url ? { url: post.story_audio_url, name: post.story_audio_name || null } : null,
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
    {
      const nets = initial.networks.length ? initial.networks : (connectedNets.slice(0, 1) as Network[]);
      setNetworks(nets);
      setActiveNet(nets[0] || 'instagram');
      const base: Partial<Record<Network, string>> = {};
      for (const n of NETWORK_ORDER) base[n] = initial.captions?.[n] ?? initial.caption;
      setCaptions(base);
      setCaptionsTouched(false);
      setFirstComment(item.post?.first_comment || '');
      setCollab(item.post?.collaborators ? item.post.collaborators.split(',').map((u) => `@${u}`).join(', ') : '');
    }
    setStoryLink(initial.storyLink);
    setStoryLinkText(initial.storyLinkText);
    setMediaUrl(initial.mediaUrl);
    setOrder(initial.order);
    setTrack(initial.track);
    setRepeat(initial.repeat);
    setScope(initial.scope);
    setSaving(false);
    setSavedCaption(initial.caption);
  }, [initial]);

  // "Postar agora": depois que o horário de agora entra no estado, salva (o save mais novo fica no ref)
  const saveRef = useRef<((allowPast?: boolean) => Promise<void>) | null>(null);
  useEffect(() => {
    if (!postNowPending) return;
    setPostNowPending(false);
    saveRef.current?.(false);
  }, [postNowPending, date, time]);

  const generate = async () => {
    if (!item) return;
    setGenerating(true);
    try {
      const result = await generateCaption({ client_id: clientId, kind: item.kind, id: item.id, network: mode === 'manual' ? 'instagram' : activeNet });
      setCaption(result.caption);
      toast.success(`Legenda para o ${NETWORK_LABELS[mode === 'manual' ? 'instagram' : activeNet]} criada ${CAPTION_SOURCES[result.fonte] || ''}`.trim(), { description: 'Revise antes de salvar.' });
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
  // redes da prévia: as marcadas para postar sozinho; no manual e no lembrete, a rede escolhida
  const previewNets: string[] = postsAlone && mode === 'auto' && networks.length ? networks
    : platform === 'both' ? ['instagram', 'facebook'] : [platform];
  const storyMedia = (multiImage ? order[0] : mediaUrl.trim()) || '';
  // trilha: story de UMA arte postado sozinho, sem repetição (a série não leva trilha)
  const canTrack = isStory && mode === 'auto' && !repeatOn && !!storyMedia && !/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(storyMedia);
  const storyFields = () => ({
    client_id: clientId,
    date,
    time,
    platform,
    story_mode: mode === 'lembrete' ? 'lembrete' as const : 'auto' as const,
    story_link: mode === 'lembrete' ? storyLink.trim() || null : null,
    story_link_text: mode === 'lembrete' ? storyLinkText.trim() || null : null,
    story_audio_url: canTrack && track ? track.url : null,
    story_audio_name: canTrack && track ? track.name : null,
  });

  const onlyWhenChanged = scheduled && !isSeriesItem && item.state !== 'erro'
    && mode === initial.mode && platform === initial.platform && format === initial.format
    && caption === initial.caption && storyLink === initial.storyLink && storyLinkText === initial.storyLinkText
    && networks.join() === initial.networks.join() && !captionsTouched
    && firstComment === (item.post?.first_comment || '') && collab === (item.post?.collaborators ? item.post.collaborators.split(',').map((u) => `@${u}`).join(', ') : '')
    && mediaUrl === initial.mediaUrl && order.join() === initial.order.join() && (track?.url || '') === (initial.track?.url || '') && !repeatOn;

  const askPostNow = () => setConfirm({
    title: 'Postar agora?',
    description: 'Sai em menos de 1 minuto, nas redes marcadas.',
    confirmLabel: 'Postar agora',
    onConfirm: () => {
      const now = brtParts(Date.now());
      if (!now) return;
      if (mode !== 'auto') setMode('auto');
      setDate(now.date);
      setTime(now.time);
      setPostNowPending(true);
    },
  });

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
    if (postsAlone && !isSeriesItem && !networks.length) { toast.error('Marque pelo menos uma rede.'); return; }
    const tooLong = postsAlone && !isStory ? networks.find((n) => (captions[n] ?? '').length > NETWORK_MAX[n]) : undefined;
    if (tooLong) { toast.error(`A legenda do ${NETWORK_LABELS[tooLong]} passou de ${NETWORK_MAX[tooLong]} caracteres.`); return; }
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
          ? { media_items: order }
          : { media_url: (multiImage ? order[0] : mediaUrl.trim()) || null })
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
        ...(postsAlone && !isStory ? {
          platforms: networks,
          captions: Object.fromEntries(networks.map((n) => [n, captions[n] ?? ''])),
          first_comment: firstComment.trim() || undefined,
          collaborators: networks.includes('instagram') ? collab.trim() || undefined : undefined,
        } : postsAlone && isStory ? { platforms: networks.filter((n) => n === 'instagram' || n === 'facebook') } : {}),
        publish_type: format,
        caption: isStory ? '' : postsAlone ? (captions.instagram ?? caption) : caption,
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
  saveRef.current = save;

  const whenLabel = `${item.title}${item.when ? ` · ${formatDayLabel(item.when.date)}${item.when.time ? ` às ${item.when.time}` : ''}` : ''}`;
  // Postagem manual feita (01/11/2026): carimba o material como postado; aparece no portal do cliente e no Kanban
  const canMarkPosted = !readOnly && !!item && !item.ghost && item.state === 'manual' && !isSeriesItem;
  const askPosted = () => {
    if (!item) return;
    setConfirm({
      title: 'Marcar como postado?',
      description: `${whenLabel ? `${whenLabel} · ` : ''}O card fica carimbado como postado, o cliente vê no portal e a operação sabe que saiu.`,
      confirmLabel: 'Sim, foi postado',
      onConfirm: async () => {
        setSaving(true);
        try {
          const r = await markMaterialPosted({ client_id: clientId, kind: item.kind, id: item.id });
          onSaved(r.already ? 'Já estava marcado como postado' : '✅ Marcado como postado');
        } catch (err) {
          toast.error((err as Error).message || 'Não foi possível marcar como postado');
        } finally {
          setSaving(false);
        }
      },
    });
  };

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
        <DialogContent className="max-h-[92vh] max-w-xl gap-0 overflow-y-auto p-0 lg:max-w-5xl">
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
                      {(() => { const Icon = NETWORK_ICONS[a.platform] || Instagram; return <Icon size={10} />; })()}
                      {a.username || a.account_name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* a legenda cresce até o fim da coluna (usuário, 03/11/2026: "caixa pequena com espaço sobrando") */}
          <div className="flex flex-col gap-4 p-4">
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

            {mode === 'auto' && !isSeriesItem ? (
              <div className="space-y-1">
                <Label className="text-xs">Redes</Label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Redes">
                  {connectedNets.filter((n) => !isStory || n === 'instagram' || n === 'facebook').map((n) => {
                    const Icon = NETWORK_ICONS[n];
                    const on = networks.includes(n);
                    return (
                      <button key={n} type="button" aria-pressed={on} disabled={readOnly}
                        onClick={() => {
                          const next = on ? networks.filter((x) => x !== n) : NETWORK_ORDER.filter((x) => x === n || networks.includes(x));
                          setNetworks(next);
                          if (!next.includes(activeNet) && next.length) setActiveNet(next[0]);
                          if (!on) setActiveNet(n);
                        }}
                        className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50',
                          on ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-border text-muted-foreground hover:border-primary/40')}>
                        <Icon size={13} aria-hidden="true" /> {NETWORK_LABELS[n]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Rede</Label>
                <Segmented<PublishTarget> label="Rede" value={platform} onChange={setPlatform} options={platformOptions} disabled={readOnly} />
              </div>
            )}

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

            {canTrack && (
              <StoryTrackField value={track} onChange={setTrack} disabled={readOnly} />
            )}

            {canRepeat && (
              <StorySeriesRepeat value={repeat} onChange={setRepeat} startDate={date} time={time} forced={following} />
            )}

            {!isSeriesItem && !isStory && (
              <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                  {mode === 'auto' && networks.length > 1 ? (
                    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Legenda de cada rede">
                      {networks.map((n) => (
                        <button key={n} type="button" role="tab" aria-selected={activeNet === n} onClick={() => setActiveNet(n)}
                          className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', activeNet === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                          {NETWORK_LABELS[n]}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Label htmlFor="sched-caption" className="text-xs font-semibold">Legenda{mode === 'auto' && networks.length === 1 ? ` · ${NETWORK_LABELS[networks[0]]}` : ''}</Label>
                  )}
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
                    <span className={cn('text-[10px] tabular-nums', caption.length > NETWORK_MAX[activeNet] ? 'text-destructive' : 'text-muted-foreground')}>{caption.length}/{NETWORK_MAX[activeNet]}</span>
                  </div>
                </div>
                <Textarea
                  id="sched-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={10}
                  disabled={readOnly || generating}
                  placeholder="Escreva a legenda ou clique em Gerar com IA"
                  className={cn('min-h-[220px] flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-3 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0', generating && 'animate-pulse')}
                />
                {generating && (
                  <p className="px-3 pb-2 text-[11px] text-muted-foreground">Lendo o roteiro ou assistindo ao vídeo… pode levar até 1 minuto.</p>
                )}
                {!readOnly && savedCaption !== null && caption !== savedCaption && (
                  <div className="flex justify-end border-t border-border px-2 py-1">
                    <Button type="button" variant="ghost" size="sm" onClick={storeCaption} disabled={savingCaption || caption.length > 2200} className="h-6 gap-1 px-2 text-[11px]">
                      {savingCaption ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Salvar só a legenda
                    </Button>
                  </div>
                )}
              </div>
            )}

            {mode === 'auto' && !isStory && !isSeriesItem && !readOnly && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sched-first-comment" className="text-xs">Primeiro comentário (opcional)</Label>
                  <Input id="sched-first-comment" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} placeholder="Link do WhatsApp, hashtags…" />
                </div>
                {networks.includes('instagram') ? (
                  <div className="space-y-1">
                    <Label htmlFor="sched-collab" className="flex items-center gap-1 text-xs"><UserPlus size={12} /> Adicionar colaborador (Collab)</Label>
                    <Input id="sched-collab" value={collab} onChange={(e) => setCollab(e.target.value)} placeholder="@parceiro, @fornecedor" />
                    <p className="text-[10px] text-muted-foreground">Até 3 perfis do Instagram. Cada um recebe o convite e aceita no app.</p>
                  </div>
                ) : (
                  <p className="self-end rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                    <UserPlus size={11} className="mr-1 inline" />Colaborador (Collab) só existe no Instagram: marque o Instagram para adicionar.
                  </p>
                )}
              </div>
            )}
            {item.creative && !readOnly && (
              <p className="rounded-lg border border-purple-500/25 bg-purple-500/5 px-3 py-2 text-[11px] text-muted-foreground">
                Criativo de anúncio: ao agendar, vira um card de postagem próprio. O criativo continua no Tráfego, sem mudar nada.
              </p>
            )}
            {/* o usuário procurou o colaborador e não achou (03/11/2026): diz por que não aparece */}
            {!readOnly && !isSeriesItem && (isStory || mode !== 'auto') && (
              <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                <UserPlus size={11} className="shrink-0" />
                {isStory
                  ? 'Story não aceita colaborador no Instagram; ele entra em feed, carrossel e reels.'
                  : hasAccounts
                    ? 'Para adicionar colaborador (Collab), escolha a postagem automática: o convite sai junto com o post.'
                    : 'Para adicionar colaborador (Collab), conecte o Instagram do cliente: ele entra na postagem automática.'}
              </p>
            )}

            {postsAlone && !readOnly && !isSeriesItem && (
              multiImage ? (
                <div className="space-y-1">
                  <Label className="text-xs">{format === 'carousel' ? 'Ordem do carrossel' : 'Mídia'}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {format === 'carousel' ? 'Use as setas para pôr na ordem em que vai aparecer; o X tira a imagem deste post.' : 'Toque na imagem que vai ser postada.'}
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {order.map((url, i) => {
                      const chosen = format === 'carousel' || i === 0;
                      const move = (to: number) => setOrder((o) => { const n = [...o]; [n[i], n[to]] = [n[to], n[i]]; return n; });
                      return (
                        <div key={url} className="relative shrink-0">
                          <button type="button" disabled={format === 'carousel'} aria-label={`Imagem ${i + 1}`}
                            onClick={() => setOrder((o) => [url, ...o.filter((u) => u !== url)])}
                            className={cn('block overflow-hidden rounded-md border-2', chosen ? 'border-primary' : 'border-transparent opacity-50 hover:opacity-100')}>
                            <img src={url} alt="" loading="lazy" className="h-20 w-16 object-cover" />
                          </button>
                          {format === 'carousel' && (
                            <>
                              <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{i + 1}</span>
                              {order.length > 2 && (
                                <button type="button" aria-label={`Tirar a imagem ${i + 1}`} onClick={() => setOrder((o) => o.filter((u) => u !== url))}
                                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-[11px] text-white">×</button>
                              )}
                              <div className="mt-1 flex justify-between">
                                <button type="button" aria-label="Para a esquerda" disabled={i === 0} onClick={() => move(i - 1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ArrowLeft size={13} /></button>
                                <button type="button" aria-label="Para a direita" disabled={i === order.length - 1} onClick={() => move(i + 1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ArrowRight size={13} /></button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : format !== 'carousel' && (
                <div className="space-y-1">
                  <Label htmlFor="sched-media" className="text-xs">Mídia</Label>
                  <Input id="sched-media" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://" className="text-xs" />
                </div>
              )
            )}
            {postsAlone && !readOnly && !isSeriesItem && (
              <MediaFitNotes urls={format === 'carousel' ? order : [multiImage ? order[0] : mediaUrl.trim()].filter(Boolean)} publishType={format} onBlock={setMediaBlocked} />
            )}
          </div>
          {/* prévia em cada rede (usuário, 03/11/2026: "que simule o Instagram e o Facebook e qualquer rede social que vá publicar") */}
          <aside className="border-t border-border bg-muted/30 p-4 lg:border-l lg:border-t-0">
            <div className="lg:sticky lg:top-0">
              <p className="mb-2 text-center text-xs font-semibold text-muted-foreground">Como vai ficar</p>
              <NetworkPreview
                networks={previewNets}
                format={format}
                media={format === 'carousel' ? order : [multiImage ? order[0] : mediaUrl.trim() || item.media_url || ''].filter(Boolean)}
                captions={postsAlone ? captions : Object.fromEntries(previewNets.map((n) => [n, caption]))}
                accounts={accounts.map((a) => ({ platform: a.platform, name: a.account_name, username: a.username, picture: a.profile_picture_url }))}
                fallbackName={clientName?.trim() || accounts[0]?.account_name || 'Cliente'}
                fallbackPicture={clientLogo}
                firstComment={firstComment}
                collaborators={networks.includes('instagram') ? collab : ''}
                storyLink={mode === 'lembrete' && storyLink ? { url: storyLink, text: storyLinkText } : null}
                active={postsAlone && networks.includes(activeNet) ? activeNet : undefined}
                onActiveChange={(n) => { if (networks.includes(n as Network)) setActiveNet(n as Network); }}
              />
            </div>
          </aside>
          </div>

          <DialogFooter className="flex-row flex-wrap items-center gap-2 border-t border-border p-4 sm:justify-between">
            {canMarkPosted && (
              <Button type="button" size="sm" onClick={askPosted} disabled={saving} className="order-first w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90 sm:order-none sm:hidden">
                <CalendarCheck2 size={14} /> Marcar como postado
              </Button>
            )}
            {scheduled && !readOnly ? (
              <Button type="button" variant="ghost" size="sm" onClick={askCancel} disabled={saving} className="gap-1.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 size={14} /> {isSeriesItem ? (following ? 'Cancelar as próximas' : 'Cancelar data') : 'Cancelar agendamento'}
              </Button>
            ) : !readOnly && !repeatOn && !isSeriesItem && !hasAccounts ? (
              <p className="flex max-w-[16rem] items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                Para postar agora, conecte as redes do cliente em Conexões Sociais.
              </p>
            ) : <span />}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canMarkPosted && (
                <Button type="button" size="sm" onClick={askPosted} disabled={saving} className="hidden gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90 sm:inline-flex">
                  <CalendarCheck2 size={14} /> Marcar como postado
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Fechar</Button>
              {/* sempre à vista (usuário, 03/11/2026: "o botão de publicar agora não apareceu"); sem rede conectada fica travado e diz por quê */}
              {!readOnly && !repeatOn && !isSeriesItem && (
                <Button type="button" variant="outline" size="sm" onClick={askPostNow} disabled={saving || !hasAccounts || (mode === 'auto' && mediaBlocked)} className="gap-1.5 border-primary/40 text-primary transition hover:bg-primary/10 hover:text-primary active:scale-[0.97]"
                  title={hasAccounts ? 'Publica nas redes marcadas em menos de 1 minuto' : 'Conecte o Instagram ou o Facebook do cliente em Conexões Sociais para postar agora'}>
                  <Zap size={14} /> Postar agora
                </Button>
              )}
              {!readOnly && (
                <Button type="button" size="sm" onClick={() => save(false)} disabled={saving || !date || !time || (postsAlone && mediaBlocked)}
                  className="gap-1.5 bg-gradient-to-b from-primary to-primary/85 px-4 shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.7),inset_0_1px_0_hsl(0_0%_100%/0.25)] transition hover:brightness-110 active:scale-[0.97]">
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
