// Aprovação sem login (/aprovar/<token>), pedido do usuário (02/11/2026): "envie o link do vídeo para ele assistir e
// aprovar numa página única que funcione mesmo sem login, com a identidade visual da Pulse e igual ao Instagram, para
// ele imaginar como ficaria na rede social dele, e embaixo botões para solicitar alteração ou aprovar."
// O vídeo aparece num Reels de mentira, com o @ e a foto do perfil do cliente (conta conectada) ou a logo, a legenda do
// post quando já existe, e os botões Aprovar e Pedir alteração. Depois, o convite para a Área do Cliente.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bookmark, Check, Download, Heart, Loader2, Maximize, MessageCircle, Mic, MoreHorizontal, Music2, Pencil, Play, RotateCw, Send, Square, Trash2, Volume2, VolumeX } from 'lucide-react';
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
  // link da equipe (02/11/2026): Aprovar manda ao cliente, Pedir alteração volta ao editor
  team?: boolean;
  team_info?: { editor: string | null; urgent: boolean } | null;
}

const MAX_AUDIO_SECONDS = 180;

/**
 * Pedido de alteração por áudio (usuário, 02/11/2026: "ele pode clicar lá e enviar um áudio para pedir alteração, ele
 * não precisa escrever"). Grava no próprio navegador (webm no Android, mp4 no iPhone), até 3 min, e mostra para ouvir
 * antes de enviar.
 */
function AudioRecorder({ value, onChange, disabled }: { value: Blob | null; onChange: (b: Blob | null) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!value) { setUrl(''); return; }
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const stop = () => {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    setRecording(false);
  };

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: (mr.mimeType || type || 'audio/webm').split(';')[0] });
        onChange(blob.size > 1000 ? blob : null);
      };
      rec.current = mr;
      mr.start();
      setSeconds(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSeconds((v) => {
        if (v + 1 >= MAX_AUDIO_SECONDS) stop();
        return v + 1;
      }), 1000);
    } catch {
      setError('Não deu para usar o microfone. Libere o acesso ao microfone no navegador ou escreva o pedido.');
    }
  };

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div>
      {recording ? (
        <button type="button" onClick={stop}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#D64545] px-4 py-4 text-base font-bold active:scale-[0.98]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> Gravando {clock} · tocar para parar <Square className="h-4 w-4 fill-white" />
        </button>
      ) : value ? (
        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
          <audio src={url} controls className="h-10 min-w-0 flex-1" />
          <button type="button" onClick={() => onChange(null)} aria-label="Apagar o áudio" className="rounded-lg p-2 text-white/70"><Trash2 className="h-5 w-5" /></button>
        </div>
      ) : (
        <button type="button" onClick={start} disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#F15A24] px-4 py-4 text-base font-bold text-[#FFB08C] active:scale-[0.98] disabled:opacity-50">
          <Mic className="h-5 w-5" /> Gravar um áudio
        </button>
      )}
      {error && <p className="mt-2 text-center text-xs text-[#FF8A8A]">{error}</p>}
    </div>
  );
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
  // vídeo horizontal (telão, YouTube, TV; 05/11/2026): sem moldura de Reels, player 16:9 e convite para virar o celular
  const [horizontal, setHorizontal] = useState(false);
  // criativo (anúncio, 05/11/2026): o mesmo vídeo em feed, story e reels, com o botão de chamar no WhatsApp
  const [placement, setPlacement] = useState<'feed' | 'story' | 'reels'>('reels');
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(orientation: portrait)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(orientation: portrait)');
    if (!mq) return;
    const on = () => setPortrait(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const fullscreen = async () => {
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    try {
      if (v.requestFullscreen) await v.requestFullscreen();
      else v.webkitEnterFullscreen?.(); // iPhone
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
    } catch { v.webkitEnterFullscreen?.(); }
    v.play().catch(() => {});
    setPlaying(true);
  };
  const [mode, setMode] = useState<'idle' | 'adjust'>('idle');
  const [notes, setNotes] = useState('');
  const [audio, setAudio] = useState<Blob | null>(null);
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
      // o áudio sobe primeiro; o pedido leva o link dele (o servidor transcreve)
      let audioUrl: string | null = null;
      if (action === 'adjust' && audio) {
        const up = await fetch(`${VPS_API_BASE}/public/aprovar/${encodeURIComponent(token || '')}/audio`, {
          method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio,
        });
        const upBody = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upBody.error || 'Não deu para enviar o áudio. Tente de novo.');
        audioUrl = upBody.audio_url;
      }
      const r = await fetch(`${VPS_API_BASE}/public/aprovar/${encodeURIComponent(token || '')}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, notes, audio_url: audioUrl }),
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
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F15A24]">{data?.team ? 'Aprovação da equipe' : 'Aprovação'}</span>
        </div>
      </header>

      <main className={`mx-auto px-4 pb-10 pt-4 ${horizontal ? 'max-w-3xl' : 'max-w-md'}`}>
        {!data && !error && <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#F15A24]" /></div>}
        {error && (
          <div className="rounded-2xl bg-white/5 p-6 text-center">
            <p className="font-semibold">Não encontramos este conteúdo.</p>
            <p className="mt-1 text-sm text-white/60">Confira o link ou fale com a gente pelo WhatsApp.</p>
          </div>
        )}

        {data && (
          <>
            {data.team ? (
              // link da equipe (usuário, 02/11/2026: "que esse link seja um pouco diferente")
              <div className="mb-4 rounded-2xl border border-[#F15A24]/50 bg-[#F15A24]/10 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F15A24]">Só para a equipe Pulse</p>
                <p className="mt-1 text-base font-bold">{data.team_info?.urgent ? '🔥 Urgente · ' : ''}{data.client.name}</p>
                <p className="mt-0.5 text-sm text-white/70">
                  {data.team_info?.editor ? `Editado por ${data.team_info.editor}. ` : ''}Aprovar manda o vídeo para o cliente; Pedir alteração devolve ao editor.
                </p>
              </div>
            ) : (
              <p className="mb-3 text-center text-sm text-white/70">Assim vai ficar no Instagram de <b className="text-white">{data.client.name}</b></p>
            )}

            {data.type === 'criativo' && !horizontal && (
              <div role="tablist" aria-label="Onde o anúncio aparece" className="mb-3 flex justify-center gap-1.5">
                {([['feed', 'Feed'], ['story', 'Story'], ['reels', 'Reels']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={placement === k} onClick={() => setPlacement(k)}
                    className={`rounded-full px-3.5 py-1 text-xs font-semibold ${placement === k ? 'bg-white text-black' : 'bg-white/10 text-white/70'}`}>{label}</button>
                ))}
              </div>
            )}
            {data.type === 'criativo' && !horizontal && placement === 'feed' && (
              <div className="mx-auto flex items-center gap-2 rounded-t-2xl bg-black px-3 py-2">
                {data.client.avatar
                  ? <img src={data.client.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                  : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F15A24] text-xs font-bold">{data.client.name.slice(0, 1)}</span>}
                <span className="text-sm font-semibold">{handleOf(data)}</span>
                <span className="text-[11px] text-white/60">Patrocinado</span>
              </div>
            )}
            {/* Reels de mentira: o vídeo com a cara do Instagram (horizontal: player 16:9, sem a moldura do Reels) */}
            <div className={`relative mx-auto w-full overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 ${horizontal ? 'aspect-video rounded-2xl' : data.type === 'criativo' && placement === 'feed' ? 'aspect-[4/5]' : 'aspect-[9/16] rounded-2xl'}`}>
              <video
                ref={video}
                src={src}
                poster={data.thumbnail_url || undefined}
                className={`h-full w-full ${horizontal ? 'object-contain' : 'object-cover'}`}
                onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth > v.videoHeight * 1.1) setHorizontal(true); }}
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
              {horizontal || (data.type === 'criativo' && placement !== 'reels') ? (
                <>
                  {data.type === 'criativo' && placement === 'story' && !horizontal && (
                    <div className="pointer-events-none absolute left-0 right-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-3 pb-6 pt-2">
                      <div className="h-0.5 w-full rounded-full bg-white/40"><div className="h-full w-1/3 rounded-full bg-white" /></div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-semibold">{handleOf(data)} <span className="text-[11px] font-normal text-white/70">Patrocinado</span></div>
                    </div>
                  )}
                  <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Ligar o som' : 'Desligar o som'}
                    className="absolute bottom-3 right-3 rounded-full bg-black/50 p-1.5">
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                </>
              ) : (<>
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
              </>)}
            </div>

            {data.type === 'criativo' && !horizontal && (
              <div className={`mx-auto flex items-center justify-between bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white ${placement === 'feed' ? 'rounded-b-2xl' : 'mt-2 rounded-xl'}`}>
                <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> Chamar no WhatsApp</span>
                <span aria-hidden>›</span>
              </div>
            )}

            {horizontal && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                {portrait && <RotateCw className="h-6 w-6 shrink-0 animate-[spin_3s_linear_infinite] text-[#F15A24] motion-reduce:animate-none" />}
                <p className="flex-1 text-[13px] text-white/80">
                  {portrait ? 'Vídeo horizontal: vire o celular para assistir em tela cheia.' : 'Vídeo horizontal, para telão, TV ou YouTube.'}
                </p>
                <button type="button" onClick={fullscreen} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#F15A24] px-3 py-2 text-[13px] font-semibold text-white">
                  <Maximize className="h-4 w-4" /> Tela cheia
                </button>
              </div>
            )}

            <p className="mt-3 text-center text-[13px] font-semibold">{data.title}</p>

            {/* decisão */}
            {done ? (
              <div className={`mt-5 rounded-2xl p-5 text-center ${done === 'aprovado' ? 'bg-[#1F9D55]/15 text-[#7BE0A6]' : 'bg-[#F15A24]/15 text-[#FFB08C]'}`}>
                <p className="text-base font-bold">{data.team
                  ? (done === 'aprovado' ? 'Aprovado! Foi para o cliente ✅' : 'Alteração pedida 🔧')
                  : (done === 'aprovado' ? 'Aprovado! Obrigada 🧡' : 'Recebemos o seu pedido de ajuste 🧡')}</p>
                <p className="mt-1 text-sm text-white/70">
                  {data.team
                    ? (done === 'aprovado' ? 'O cliente recebe o vídeo para aprovar.' : 'O card voltou para o editor com o seu pedido.')
                    : (done === 'aprovado' ? 'A equipe já foi avisada e segue para o agendamento.' : 'A equipe já está ajustando e manda a nova versão para você aprovar.')}
                </p>
              </div>
            ) : mode === 'adjust' ? (
              <div className="mt-5 space-y-3">
                <label className="block text-sm font-semibold" htmlFor="ajuste">{data.team ? 'O que o editor precisa mudar?' : 'O que você quer mudar?'}</label>
                <AudioRecorder value={audio} onChange={setAudio} disabled={busy} />
                <p className="text-center text-xs text-white/50">ou escreva</p>
                <textarea id="ajuste" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  placeholder="Ex.: trocar a música, tirar a parte do começo, corrigir o nome na legenda…"
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-base text-white placeholder:text-white/40" />
                <button type="button" onClick={() => decide('adjust')} disabled={busy || (notes.trim().length < 3 && !audio)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F15A24] px-4 py-4 text-base font-bold active:scale-[0.98] disabled:opacity-50">
                  {busy ? <><Loader2 className="h-5 w-5 animate-spin" />{audio ? ' Enviando o áudio…' : ''}</> : data.team ? 'Devolver ao editor' : 'Enviar pedido de ajuste'}
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
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> {data.team ? 'Aprovar e enviar' : 'Aprovar'}</>}
                </button>
              </div>
            )}
            {/* baixar o vídeo (03/11/2026, pedido do Thiago: "coloque também um botão de download") */}
            {data.file_url && (
              <a href={data.file_url} download target="_blank" rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/85 active:scale-[0.98]">
                <Download className="h-4 w-4" /> Baixar o vídeo
              </a>
            )}
            {actionError && <p className="mt-3 text-center text-sm text-[#FF8A8A]" aria-live="polite">{actionError}</p>}

            {/* sempre levar ao portal (02/11/2026); no link da equipe não */}
            {!data.team && <div className="mt-8 rounded-2xl bg-white/5 p-5 text-center">
              <p className="text-sm font-semibold">Acompanhe tudo na sua Área do Cliente</p>
              <p className="mt-1 text-xs text-white/60">Vídeos, artes, gravações e relatórios num lugar só.</p>
              <div className="mt-3 flex flex-col gap-2">
                <a href={data.portal_url} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#0E0E10]">Entrar no portal</a>
                <a href={data.signup_url} className="text-xs text-white/70 underline">Ainda não tenho acesso: criar agora</a>
              </div>
            </div>}
            <p className="mt-6 text-center text-xs text-white/40">Agência Pulse · @agenciapulse</p>
          </>
        )}
      </main>
    </div>
  );
}
