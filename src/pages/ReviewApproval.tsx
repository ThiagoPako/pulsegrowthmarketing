// Monitoramento de avaliações negativas (usuário, 02/11/2026): o cliente recebe o link no WhatsApp e, nesta página
// da Pulse (sem login), vê a avaliação, a resposta que a Ísis escreveu e aprova (ou ajusta). Se a Ísis achar que a
// avaliação fere as regras do Google, pergunta se ele quer pedir a remoção. Cada número tem o próprio link: embaixo
// aparece quem já viu e quem aprovou (auditoria). Servidor: vps-api-server/lib/socialHub.mjs.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Flag, Loader2, Pencil, ShieldCheck, Star } from 'lucide-react';
import logo from '@/assets/pulse-logo-branco.png';

const API = 'https://agenciapulse.tech/api';

interface Data {
  client: { name: string; logo: string | null };
  review: { reviewer: string | null; rating: number | null; comment: string | null; reviewed_at: string | null };
  draft: string;
  reply: { text: string; by: string; at: string } | null;
  removal: { reason: string; status: string | null } | null;
  you: string | null;
  audit: { name: string | null; opened_at: string | null; action: string | null; acted_at: string | null }[];
}

const when = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export default function ReviewApproval() {
  const { token } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'view' | 'edit' | 'adjust'>('view');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => fetch(`${API}/public/avaliacao/${encodeURIComponent(token || '')}`)
    .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'Link não encontrado'); setData(b); setText(b.draft || ''); })
    .catch((e: Error) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'Avaliação no Google · Agência Pulse'; load(); }, [token]);

  const decide = async (action: string, extra: Record<string, string> = {}) => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${API}/public/avaliacao/${encodeURIComponent(token || '')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Não deu certo. Tente de novo.');
      setMsg({ aprovado: 'Resposta publicada no Google ✅', ajuste: 'Recebemos o seu pedido: a equipe ajusta a resposta 🧡', remocao: 'Combinado! A equipe vai pedir a remoção ao Google 🚩', sem_remocao: 'Tudo bem, a avaliação fica e respondemos com educação.' }[b.decided as string] || 'Feito!');
      setMode('view');
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#0E0E10] text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <header className="border-b-4 border-[#F15A24]">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <img src={logo} alt="Pulse" className="h-6" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F15A24]">Avaliação no Google</span>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 pb-12 pt-5">
        {!data && !error && <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#F15A24]" /></div>}
        {error && <div className="rounded-2xl bg-white/5 p-6 text-center"><p className="font-semibold">Não encontramos esta avaliação.</p><p className="mt-1 text-sm text-white/60">Confira o link ou fale com a gente.</p></div>}
        {data && (
          <>
            <div className="flex items-center gap-3">
              {data.client.logo ? <img src={data.client.logo} alt={`Logo ${data.client.name}`} className="h-12 w-12 rounded-xl bg-white object-contain p-1" /> : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F15A24] text-lg font-bold">{data.client.name.slice(0, 1)}</span>}
              <p className="text-sm text-white/70">Olá{data.you ? `, ${data.you}` : ''}! Chegou uma avaliação no Google de <b className="text-white">{data.client.name}</b>:</p>
            </div>

            <div className="rounded-2xl bg-white p-4 text-[#161616]">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F15A24] font-bold text-white">{(data.review.reviewer || '?').slice(0, 1)}</span>
                <div>
                  <p className="text-sm font-semibold">{data.review.reviewer || 'Cliente'}</p>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < (data.review.rating || 0) ? 'fill-[#FBBC04] text-[#FBBC04]' : 'text-neutral-300'}`} />)}
                    <span className="ml-1 text-[11px] text-neutral-500">{when(data.review.reviewed_at)}</span>
                  </div>
                </div>
              </div>
              {data.review.comment && <p className="mt-3 text-sm leading-relaxed">{data.review.comment}</p>}
              {data.reply && (
                <div className="mt-3 rounded-xl bg-neutral-100 p-3">
                  <p className="text-[11px] font-semibold text-neutral-600">Resposta do proprietário · {data.reply.by}</p>
                  <p className="mt-1 text-sm">{data.reply.text}</p>
                </div>
              )}
            </div>

            {!data.reply && (
              <div className="space-y-3 rounded-2xl bg-white/5 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[#F15A24]" /> Resposta sugerida pela Ísis (Pulse)</p>
                {mode === 'edit' ? (
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-base text-white" />
                ) : mode === 'adjust' ? (
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Conte o que você quer mudar na resposta" className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-base text-white placeholder:text-white/40" />
                ) : <p className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm">{data.draft || '(a equipe está escrevendo a resposta)'}</p>}

                {mode === 'view' ? (
                  <div className="grid gap-2">
                    <button type="button" disabled={busy || !data.draft} onClick={() => decide('approve')} className="flex items-center justify-center gap-2 rounded-xl bg-[#1F9D55] px-4 py-3.5 font-bold disabled:opacity-50">
                      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> Aprovar e publicar</>}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setText(data.draft); setMode('edit'); }} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/25 px-3 py-3 text-sm font-semibold"><Pencil className="h-4 w-4" /> Editar e publicar</button>
                      <button type="button" onClick={() => { setText(''); setMode('adjust'); }} className="rounded-xl border border-white/25 px-3 py-3 text-sm font-semibold">Pedir ajuste</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setMode('view'); setText(data.draft); }} className="rounded-xl border border-white/25 px-3 py-3 text-sm">Voltar</button>
                    <button type="button" disabled={busy || text.trim().length < 3} onClick={() => (mode === 'edit' ? decide('edit', { text }) : decide('adjust', { note: text }))}
                      className="rounded-xl bg-[#F15A24] px-3 py-3 text-sm font-bold disabled:opacity-50">{busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : mode === 'edit' ? 'Publicar' : 'Enviar pedido'}</button>
                  </div>
                )}
              </div>
            )}

            {data.removal && (
              <div className="space-y-2 rounded-2xl border border-[#F15A24]/40 bg-[#F15A24]/10 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Flag className="h-4 w-4 text-[#F15A24]" /> Dá para pedir a remoção ao Google</p>
                <p className="text-sm text-white/80">A Ísis acha que esta avaliação fere as regras do Google: {data.removal.reason}. Quer que a gente peça a remoção? Quem decide é o Google.</p>
                {data.removal.status === 'sugerida' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy} onClick={() => decide('remove_yes')} className="rounded-xl bg-[#F15A24] px-3 py-3 text-sm font-bold">Sim, pedir remoção</button>
                    <button type="button" disabled={busy} onClick={() => decide('remove_no')} className="rounded-xl border border-white/25 px-3 py-3 text-sm">Não precisa</button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold">{{ cliente_quer: 'Você pediu a remoção: a equipe já está cuidando.', cliente_nao: 'Você preferiu manter a avaliação.', solicitada: 'Pedido de remoção enviado ao Google.' }[data.removal.status || ''] || ''}</p>
                )}
              </div>
            )}

            {msg && <p className="text-center text-sm text-[#FFB08C]" aria-live="polite">{msg}</p>}

            {data.audit.length > 1 && (
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Quem recebeu este aviso</p>
                {data.audit.map((a, i) => (
                  <p key={i} className="flex justify-between gap-2 border-b border-white/5 py-1.5 text-sm last:border-0">
                    <span>{a.name || 'Contato'}</span>
                    <span className="text-right text-white/60">{a.action ? `${a.action} · ${when(a.acted_at)}` : a.opened_at ? `viu · ${when(a.opened_at)}` : 'ainda não abriu'}</span>
                  </p>
                ))}
              </div>
            )}
            <p className="text-center text-xs text-white/40">Agência Pulse · @agenciapulse</p>
          </>
        )}
      </main>
    </div>
  );
}
