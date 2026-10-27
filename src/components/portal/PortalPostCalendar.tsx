import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Film, Image as ImageIcon, Instagram, Layers, Loader2, X } from 'lucide-react';
import { portalAction } from '@/lib/portalApi';
import { videoThumbUrl } from '@/lib/mediaPreview';
import { resolvePlayback } from '@/lib/playbackUrl';

/**
 * Calendário de postagem no portal (só leitura): o cliente acompanha o que vai ao ar e o que já saiu,
 * com a miniatura de cada post. No computador, a grade do mês; no celular, a lista por dia (cabe na tela).
 * Dados: portal-actions → get_post_calendar (vps-api-server/scheduling.mjs → postCalendar).
 */

interface CalendarPost {
  key: string;
  title: string;
  type: 'reels' | 'story' | 'carrossel' | 'arte' | 'feed';
  state: 'agendado' | 'publicado';
  date: string;
  time: string | null;
  thumb_url: string | null;
  media_url: string | null;
  media_kind: 'video' | 'image';
  caption: string;
  platform: 'instagram' | 'facebook' | 'both' | null;
}

const TYPE_LABEL: Record<CalendarPost['type'], string> = {
  reels: 'Reels', story: 'Story', carrossel: 'Carrossel', arte: 'Arte', feed: 'Feed',
};
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function postThumb(post: CalendarPost): string | null {
  if (post.thumb_url) return post.thumb_url;
  if (post.media_kind === 'image') return post.media_url;
  return videoThumbUrl(post.media_url);
}

function Thumb({ post, className = '' }: { post: CalendarPost; className?: string }) {
  const src = postThumb(post);
  const [failed, setFailed] = useState(false);
  const Icon = post.media_kind === 'video' ? Film : post.type === 'carrossel' ? Layers : ImageIcon;
  return (
    <div className={`relative overflow-hidden bg-white/[0.06] ${className}`}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center"><Icon size={16} className="text-white/25" /></div>
      )}
      {post.media_kind === 'video' && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 p-0.5"><Film size={9} className="text-white/80" /></span>
      )}
    </div>
  );
}

function StateTag({ state }: { state: CalendarPost['state'] }) {
  return state === 'publicado' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
      <CheckCircle2 size={10} /> Publicado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
      <Clock size={10} /> Agendado
    </span>
  );
}

function PostViewer({ post, clientColor, onClose }: { post: CalendarPost; clientColor: string; onClose: () => void }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (post.media_kind !== 'video' || !post.media_url) return;
    let cancelled = false;
    // versão leve do vídeo (toca sem travar); sem ela, o original
    resolvePlayback(post.media_url).then((p) => { if (!cancelled) setVideoUrl(p.url); }).catch(() => { if (!cancelled) setVideoUrl(post.media_url); });
    return () => { cancelled = true; };
  }, [post]);

  const [y, m, d] = post.date.split('-').map(Number);
  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#111118] border border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 bg-[#111118]/95 backdrop-blur border-b border-white/[0.06]">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{post.title}</p>
            <p className="text-[11px] text-white/50">{pad(d)}/{pad(m)}/{y}{post.time ? ` às ${post.time}` : ''} · {TYPE_LABEL[post.type]}</p>
          </div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="bg-black">
          {post.media_kind === 'video' && post.media_url ? (
            videoUrl ? (
              <video src={videoUrl} poster={postThumb(post) || undefined} controls playsInline preload="auto" className="w-full max-h-[60dvh] object-contain bg-black" />
            ) : (
              <div className="aspect-[9/16] max-h-[60dvh] mx-auto flex items-center justify-center"><Loader2 className="animate-spin text-white/40" /></div>
            )
          ) : postThumb(post) ? (
            <img src={postThumb(post)!} alt={post.title} className="w-full max-h-[60dvh] object-contain" />
          ) : null}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StateTag state={post.state} />
            {post.platform && (
              <span className="inline-flex items-center gap-1 text-[11px] text-white/50"><Instagram size={12} /> {post.platform === 'both' ? 'Instagram e Facebook' : post.platform === 'facebook' ? 'Facebook' : 'Instagram'}</span>
            )}
          </div>
          {post.caption ? (
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: `hsl(${clientColor})` }}>Legenda</p>
              <p className="text-sm text-white/80 whitespace-pre-line leading-relaxed">{post.caption}</p>
            </div>
          ) : (
            <p className="text-xs text-white/40">Legenda ainda não definida.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PortalPostCalendar({ clientId, clientColor }: { clientId: string; clientColor: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<CalendarPost | null>(null);
  const today = todayKey();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    portalAction({ action: 'get_post_calendar', client_id: clientId, from: keyOf(year, month, 1), to: keyOf(year, month, daysInMonth) })
      .then((res) => {
        if (cancelled) return;
        if (res?.error) { setError('Não foi possível carregar o calendário.'); setPosts([]); }
        else setPosts(Array.isArray(res?.posts) ? res.posts : []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, year, month, daysInMonth]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) map.set(p.date, [...(map.get(p.date) || []), p]);
    return map;
  }, [posts]);

  const scheduledCount = posts.filter((p) => p.state === 'agendado').length;
  const publishedCount = posts.length - scheduledCount;

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const daysWithPosts = [...byDay.keys()].sort();

  return (
    <div className="space-y-4">
      {/* Cabeçalho: mês, navegação e resumo */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <CalendarDays size={20} style={{ color: `hsl(${clientColor})` }} />
          <h2 className="text-lg sm:text-xl font-bold capitalize">{MONTHS[month]} {year}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go(-1)} className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center" aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="h-10 px-4 rounded-full bg-white/[0.06] hover:bg-white/10 text-xs font-semibold">Hoje</button>
          <button onClick={() => go(1)} className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center" aria-label="Próximo mês"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-sky-300"><Clock size={12} /> {scheduledCount} agendado{scheduledCount === 1 ? '' : 's'}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300"><CheckCircle2 size={12} /> {publishedCount} publicado{publishedCount === 1 ? '' : 's'}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-white/40"><Loader2 className="animate-spin" /></div>
      ) : error ? (
        <p className="py-10 text-center text-sm text-white/50">{error}</p>
      ) : (
        <>
          {/* Celular: lista por dia */}
          <div className="sm:hidden space-y-4">
            {daysWithPosts.length === 0 && <p className="py-10 text-center text-sm text-white/40">Nenhum post neste mês ainda.</p>}
            {daysWithPosts.map((day) => {
              const [, mm, dd] = day.split('-').map(Number);
              const weekday = WEEKDAYS[new Date(`${day}T12:00:00`).getDay()];
              return (
                <section key={day}>
                  <h3 className={`text-xs font-semibold mb-2 ${day === today ? '' : 'text-white/50'}`} style={day === today ? { color: `hsl(${clientColor})` } : {}}>
                    {weekday}, {pad(dd)}/{pad(mm)}{day === today ? ' · hoje' : ''}
                  </h3>
                  <div className="space-y-2">
                    {byDay.get(day)!.map((p) => (
                      <button key={p.key} onClick={() => setOpen(p)} className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-2 text-left active:scale-[0.99] transition-transform">
                        <Thumb post={p} className="w-14 h-20 rounded-xl shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-semibold truncate">{p.title}</p>
                          <p className="text-[11px] text-white/50">{p.time || '--:--'} · {TYPE_LABEL[p.type]}</p>
                          <StateTag state={p.state} />
                        </div>
                        <ChevronRight size={16} className="text-white/30 shrink-0" />
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Computador/tablet: grade do mês com miniaturas */}
          <div className="hidden sm:block rounded-2xl border border-white/[0.06] overflow-hidden">
            <div className="grid grid-cols-7 bg-white/[0.03] text-[11px] font-semibold text-white/40">
              {WEEKDAYS.map((w) => <div key={w} className="px-2 py-2 text-center">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} className="min-h-[118px] border-t border-r border-white/[0.04] bg-white/[0.01]" />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = keyOf(year, month, i + 1);
                const items = byDay.get(day) || [];
                const isToday = day === today;
                return (
                  <div key={day} className="min-h-[118px] border-t border-r border-white/[0.04] p-1.5 space-y-1">
                    <div className="flex justify-end">
                      <span className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'font-bold text-white' : 'text-white/40'}`} style={isToday ? { background: `hsl(${clientColor})` } : {}}>
                        {i + 1}
                      </span>
                    </div>
                    {items.slice(0, 3).map((p) => (
                      <button key={p.key} onClick={() => setOpen(p)} title={`${p.time || ''} ${p.title}`}
                        className="w-full flex items-center gap-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] p-1 text-left transition-colors">
                        <Thumb post={p} className="w-7 h-9 rounded-md shrink-0" />
                        <div className="min-w-0 leading-tight">
                          <p className="text-[10px] font-semibold truncate">{p.title}</p>
                          <p className={`text-[10px] ${p.state === 'publicado' ? 'text-emerald-300' : 'text-sky-300'}`}>{p.time || '--:--'}</p>
                        </div>
                      </button>
                    ))}
                    {items.length > 3 && (
                      <button onClick={() => setOpen(items[3])} className="w-full text-[10px] text-white/50 hover:text-white">+{items.length - 3} posts</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {open && <PostViewer post={open} clientColor={clientColor} onClose={() => setOpen(null)} />}
    </div>
  );
}
