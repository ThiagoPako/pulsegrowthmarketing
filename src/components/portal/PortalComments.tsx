// Comentários no portal (usuário, 02/11/2026: "prepare o portal do cliente para o cliente conseguir acompanhar os
// comentários dos posts e as respostas da Ísis"). Mostra os comentários dos últimos 60 dias de cada rede e quem
// respondeu (a Ísis ou a equipe), e as avaliações do Google. Só leitura: quem responde é a Pulse.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageCircle, Star } from 'lucide-react';
import { portalAction } from '@/lib/portalApi';

interface Comment {
  id: string; platform: string; post_permalink: string | null; post_caption: string | null; post_thumb: string | null;
  author_username: string | null; text: string; commented_at: string; status: string; reply_text: string | null; reply_by: string | null; replied_at: string | null;
}
interface Review {
  id: string; reviewer: string | null; rating: number | null; comment: string | null; reviewed_at: string | null; status: string;
  reply_text: string | null; reply_by: string | null; replied_at: string | null;
}

const NETWORK: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn' };
const when = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '');

export default function PortalComments({ clientId, clientColor }: { clientId: string; clientColor: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [view, setView] = useState<'comentarios' | 'google'>('comentarios');
  const [net, setNet] = useState<string>('todas');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, r] = await Promise.all([
        portalAction({ action: 'get_social_comments', client_id: clientId }),
        portalAction({ action: 'get_google_reviews', client_id: clientId }),
      ]);
      if (!alive) return;
      setComments(c?.comments || []);
      setReviews(r?.reviews || []);
    })();
    return () => { alive = false; };
  }, [clientId]);

  const nets = useMemo(() => [...new Set((comments || []).map((c) => c.platform))], [comments]);
  const shown = (comments || []).filter((c) => net === 'todas' || c.platform === net);
  const answered = (comments || []).filter((c) => c.status === 'respondido').length;
  const byIsis = (comments || []).filter((c) => c.reply_by === 'Ísis').length;
  const avg = reviews.length ? reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.filter((r) => r.rating).length : null;

  if (!comments) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>;

  const pill = (active: boolean) => `px-3 py-1.5 rounded-full text-xs font-medium transition-all ${active ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 text-white">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Comentários (60 dias)', value: comments.length },
          { label: 'Respondidos', value: answered },
          { label: 'Respondidos pela Ísis', value: byIsis },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-white/5 p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: `hsl(${clientColor})` }}>{s.value}</p>
            <p className="text-[11px] text-white/60">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        <button className={pill(view === 'comentarios')} onClick={() => setView('comentarios')}>💬 Comentários</button>
        {reviews.length > 0 && <button className={pill(view === 'google')} onClick={() => setView('google')}>⭐ Google {avg ? `(${avg.toFixed(1)})` : ''}</button>}
      </div>

      {view === 'comentarios' ? (
        <>
          {nets.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <button className={pill(net === 'todas')} onClick={() => setNet('todas')}>Todas</button>
              {nets.map((n) => <button key={n} className={pill(net === n)} onClick={() => setNet(n)}>{NETWORK[n] || n}</button>)}
            </div>
          )}
          {shown.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-8 text-center text-sm text-white/60">
              <MessageCircle className="mx-auto mb-2 h-6 w-6" /> Nenhum comentário nos posts recentes ainda.
            </div>
          ) : shown.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white/5 p-4">
              <div className="flex items-start gap-3">
                {c.post_thumb && <img src={c.post_thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-white/50">{NETWORK[c.platform] || c.platform} · {when(c.commented_at)}
                    {c.post_permalink && <> · <a href={c.post_permalink} target="_blank" rel="noreferrer" className="underline">ver post</a></>}</p>
                  <p className="mt-1 text-sm"><b>@{c.author_username || 'alguém'}</b> {c.text}</p>
                  {c.reply_text ? (
                    <div className="mt-2 rounded-xl border-l-2 bg-white/5 px-3 py-2" style={{ borderColor: `hsl(${clientColor})` }}>
                      <p className="text-[11px] text-white/50">Resposta {c.reply_by === 'Ísis' ? 'da Ísis (Pulse)' : c.reply_by && c.reply_by !== 'Google' ? `de ${c.reply_by} (Pulse)` : 'da Pulse'} · {when(c.replied_at)}</p>
                      <p className="text-sm">{c.reply_text}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-white/40">{c.status === 'escalado' ? 'A equipe está cuidando deste comentário.' : 'Aguardando resposta.'}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        reviews.map((r) => (
          <div key={r.id} className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < (r.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-white/20'}`} />)}
              <span className="ml-2 text-[11px] text-white/50">{r.reviewer || 'Cliente'} · {when(r.reviewed_at)}</span>
            </div>
            {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
            {r.reply_text ? (
              <div className="mt-2 rounded-xl border-l-2 bg-white/5 px-3 py-2" style={{ borderColor: `hsl(${clientColor})` }}>
                <p className="text-[11px] text-white/50">Resposta {r.reply_by === 'Ísis' ? 'da Ísis (Pulse)' : 'da empresa'} · {when(r.replied_at)}</p>
                <p className="text-sm">{r.reply_text}</p>
              </div>
            ) : <p className="mt-2 text-[11px] text-white/40">Aguardando resposta.</p>}
          </div>
        ))
      )}
    </div>
  );
}
