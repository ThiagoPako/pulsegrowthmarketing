// Aprovação sem login (/aprovar/<token>), pedido do usuário (02/11/2026): "envie o link do vídeo para ele assistir e
// aprovar numa página única que funcione mesmo sem login, com a identidade visual da Pulse e igual ao Instagram, para
// ele imaginar como ficaria na rede social dele, e embaixo botões para solicitar alteração ou aprovar."
// O vídeo aparece num Reels de mentira, com o @ e a foto do perfil do cliente (conta conectada) ou a logo, a legenda do
// post quando já existe, e os botões Aprovar e Pedir alteração. Depois, o convite para a Área do Cliente.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bookmark, Check, Heart, Loader2, MessageCircle, MoreHorizontal, Music2, Pencil, Play, Send, Volume2, VolumeX } from 'lucide-react';
import logo from '@/assets/pulse-logo-branco.png';

const VPS_API_BASE = 'https://agenciapulse.tech/api';

interface ShareData {
  title: string;
  type: string;
  status: string;
  file_url: string;
  web_url: string | null;
  thumbnail_url: string | null;
  client: { name: string; logo: string | null; username: string | null; avatar: string | null };
  caption: string | null;
  decided: 'aprovado' | 'ajuste' | null;
  portal_url: string;
  signup_url: string;
}

const handleOf = (d: ShareData) => d.client.username || d.client.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

export default function ApproveContent() {
  const { token } = useParams();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');
  const [src, setSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [moreCaption, setMoreCaption] = useState(false);
  const [mode, setMode] = useState<'idle' | 'adjust'>('idle');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'aprovado' | 'ajuste' | null>(null);
  const [actionError, setActionError] = useState('');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    document.title = 'Aprovar conteúdo · Agência Pulse';
    fetch(`${VPS_API_BASE}/public/aprovar/${encodeURIComponent(token || '')}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Link não encontrado');
        setData(body);
        setSrc(body.web_url || body.file_url);
        setDone(body.decided);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  const decide = async (action: 'approve' | 'adjust') => {
    setBusy(true);
    setActionError('');
    try {
      const r = await fetch(`${VPS_API_BASE}/public/aprovar/${encodeURIComponent(token || '')}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, notes }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Não deu certo. Tente de novo.');
      setDone(body.decided);
      setMode('idle');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E10] text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <header className="border-b-4 border-[#F15A24]">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <img src={logo} alt="Pulse" className="h-6" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F15A24]">Aprovação</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-10 pt-4">
        {!data && !error && <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#F15A24]" /></div>}
        {error && (
          <div className="rounded-2xl bg-white/5 p-6 text-center">
            <p className="font-semibold">Não encontramos este conteúdo.</p>
            <p className="mt-1 text-sm text-white/60">Confira o link ou fale com a gente pelo WhatsApp.</p>
          </div>
        )}

        {data && (
          <>
            <p className="mb-3 text-center text-sm text-white/70">Assim vai ficar no Instagram de <b className="text-white">{data.client.name}</b></p>

            {/* Reels de mentira: o vídeo com a cara do Instagram */}
            <div className="relative mx-auto aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
              <video
                ref={video}
                src={src}
                poster={data.thumbnail_url || undefined}
                className="h-full w-full object-cover"
                playsInline
                loop
                muted={muted}
                preload="metadata"
                onClick={toggle}
                onError={() => { if (src !== data.file_url) setSrc(data.file_url); }}
              />
              {!playing && (
                <button type="button" onClick={toggle} aria-label="Assistir" className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur"><Play className="h-8 w-8 fill-white" /></span>
                </button>
              )}
              <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-4 pb-6 pt-3">
                <span className="text-[17px] font-bold">Reels</span>
                <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Ligar o som' : 'Desligar o som'}
                  className="pointer-events-auto rounded-full bg-black/40 p-1.5">
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>
              {/* coluna de ações, como no Instagram */}
              <div className="pointer-events-none absolute bottom-24 right-3 flex flex-col items-center gap-5 text-white drop-shadow">
                <Heart className="h-7 w-7" />
                <MessageCircle className="h-7 w-7" />
                <Send className="h-7 w-7" />
                <Bookmark className="h-7 w-7" />
                <MoreHorizontal className="h-6 w-6" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-4 pt-12">
                <div className="flex items-center gap-2">
                  {data.client.avatar
                    ? <img src={data.client.avatar} alt="" className="h-8 w-8 rounded-full border border-white/40 object-cover" />
                    : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F15A24] text-sm font-bold">{data.client.name.slice(0, 1)}</span>}
                  <span className="text-sm font-semibold">{handleOf(data)}</span>
                  <span className="rounded-md border border-white/60 px-2 py-0.5 text-[11px] font-semibold">Seguir</span>
                </div>
                {data.caption && (
                  <p className={`mt-2 text-[13px] leading-snug ${moreCaption ? '' : 'line-clamp-2'}`} onClick={() => setMoreCaption((v) => !v)}>
                    {data.caption}
                  </p>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-white/85"><Music2 className="h-3.5 w-3.5" /> Áudio original · {handleOf(data)}</p>
              </div>
            </div>

            <p className="mt-3 text-center text-[13px] font-semibold">{data.title}</p>

            {/* decisão */}
            {done ? (
              <div className={`mt-5 rounded-2xl p-5 text-center ${done === 'aprovado' ? 'bg-[#1F9D55]/15 text-[#7BE0A6]' : 'bg-[#F15A24]/15 text-[#FFB08C]'}`}>
                <p className="text-base font-bold">{done === 'aprovado' ? 'Aprovado! Obrigada 🧡' : 'Recebemos o seu pedido de ajuste 🧡'}</p>
                <p className="mt-1 text-sm text-white/70">
                  {done === 'aprovado' ? 'A equipe já foi avisada e segue para o agendamento.' : 'A equipe já está ajustando e manda a nova versão para você aprovar.'}
                </p>
              </div>
            ) : mode === 'adjust' ? (
              <div className="mt-5 space-y-3">
                <label className="block text-sm font-semibold" htmlFor="ajuste">O que você quer mudar?</label>
                <textarea id="ajuste" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} autoFocus
                  placeholder="Ex.: trocar a música, tirar a parte do começo, corrigir o nome na legenda…"
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-base text-white placeholder:text-white/40" />
                <button type="button" onClick={() => decide('adjust')} disabled={busy || notes.trim().length < 3}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F15A24] px-4 py-4 text-base font-bold active:scale-[0.98] disabled:opacity-50">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Enviar pedido de ajuste'}
                </button>
                <button type="button" onClick={() => setMode('idle')} className="w-full py-2 text-sm text-white/60">Voltar</button>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setMode('adjust')} disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-white/25 px-3 py-4 text-[15px] font-bold active:scale-[0.98]">
                  <Pencil className="h-4 w-4" /> Pedir alteração
                </button>
                <button type="button" onClick={() => decide('approve')} disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#1F9D55] px-3 py-4 text-[15px] font-bold active:scale-[0.98] disabled:opacity-60">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> Aprovar</>}
                </button>
              </div>
            )}
            {actionError && <p className="mt-3 text-center text-sm text-[#FF8A8A]" aria-live="polite">{actionError}</p>}

            {/* sempre levar ao portal (02/11/2026) */}
            <div className="mt-8 rounded-2xl bg-white/5 p-5 text-center">
              <p className="text-sm font-semibold">Acompanhe tudo na sua Área do Cliente</p>
              <p className="mt-1 text-xs text-white/60">Vídeos, artes, gravações e relatórios num lugar só.</p>
              <div className="mt-3 flex flex-col gap-2">
                <a href={data.portal_url} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#0E0E10]">Entrar no portal</a>
                <a href={data.signup_url} className="text-xs text-white/70 underline">Ainda não tenho acesso: criar agora</a>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-white/40">Agência Pulse · @agenciapulse</p>
          </>
        )}
      </main>
    </div>
  );
}
