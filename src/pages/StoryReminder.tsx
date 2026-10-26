import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Ban, BellRing, CheckCircle2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ClientLogo from '@/components/ClientLogo';
import StoryReminderPanel from '@/components/scheduling/StoryReminderPanel';
import { StoryLinkPreview } from '@/components/scheduling/StoryLinkFields';
import { usePlaybackUrl } from '@/hooks/usePlaybackUrl';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { formatDayLabel } from '@/lib/postingSchedule';
import { cn } from '@/lib/utils';
import { fetchStoryReminder, type StoryReminder as Reminder } from '@/services/storiesApi';

const STATE: Record<Reminder['state'], { label: string; icon: typeof BellRing; tone: string }> = {
  pendente: { label: 'Lembrete', icon: BellRing, tone: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  avisado: { label: 'Para postar', icon: BellRing, tone: 'border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  postado: { label: 'Postado', icon: CheckCircle2, tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  cancelado: { label: 'Cancelado', icon: Ban, tone: 'border-border bg-muted text-muted-foreground' },
};

function Media({ reminder }: { reminder: Reminder }) {
  const playback = usePlaybackUrl(reminder.media_kind === 'video' ? reminder.media_url : null);
  if (reminder.media_kind === 'video' && playback.src) {
    return (
      <video
        src={playback.src}
        controls
        playsInline
        preload="metadata"
        className="aspect-[9/16] w-full max-w-[260px] rounded-2xl border border-border bg-black object-contain shadow-lg"
      />
    );
  }
  return (
    <StoryLinkPreview
      item={{ thumb_url: reminder.thumb_url, media_url: reminder.media_url, media_kind: reminder.media_kind, type: 'story', title: reminder.title }}
      buttonText={reminder.button_text}
      className="w-full max-w-[260px] rounded-2xl"
    />
  );
}

/** Lembrete de story com link: o vídeo, o link do WhatsApp do cliente, o texto do botão e o "Postado". */
export default function StoryReminder() {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { has } = useModuleAccess();
  const query = useQuery({ queryKey: ['story-reminder', id], queryFn: () => fetchStoryReminder(id), enabled: !!id });
  const reminder = query.data;

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }
  if (query.error || !reminder) {
    return (
      <div className="mx-auto flex max-w-md items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle size={16} /> {(query.error as Error)?.message || 'Lembrete não encontrado'}
      </div>
    );
  }

  const state = STATE[reminder.state];
  const StateIcon = state.icon;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-gradient-to-r from-amber-500/10 via-card to-emerald-500/10 p-3 shadow-sm sm:p-4">
        {reminder.client && (
          <ClientLogo client={{ companyName: reminder.client.company_name, color: reminder.client.color || '', logoUrl: reminder.client.logo_url || undefined }} size="lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-foreground">{reminder.client?.company_name}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{reminder.title}</span>
            {reminder.when && <span className="font-semibold tabular-nums text-foreground">· {formatDayLabel(reminder.when.date)} às {reminder.when.time}</span>}
          </div>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', state.tone)}>
          <StateIcon size={12} /> {state.label}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex justify-center"><Media reminder={reminder} /></div>
        <div className="space-y-3">
          {reminder.state === 'cancelado' ? (
            <div className="flex gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              <Ban size={16} className="mt-0.5 shrink-0" /> {reminder.last_error || 'Cancelado'}
            </div>
          ) : (
            <StoryReminderPanel
              postId={reminder.id}
              mediaUrl={reminder.media_url}
              link={reminder.story_link}
              buttonText={reminder.button_text}
              notified={reminder.state === 'avisado'}
              posted={reminder.state === 'postado'}
              postedBy={reminder.posted_by_name}
              onPosted={() => queryClient.invalidateQueries({ queryKey: ['story-reminder', id] })}
            />
          )}
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Link2 size={13} /> {reminder.button_text}
            </div>
            {reminder.story_link && (
              <a href={reminder.story_link} target="_blank" rel="noreferrer" className="block break-all text-sm font-medium text-primary hover:underline">
                {reminder.story_link}
              </a>
            )}
          </div>
          {reminder.client && has('pulse_plus') && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Link to={`/agendamentos?cliente=${reminder.client.id}`}><ArrowLeft size={14} /> Agendamentos</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
