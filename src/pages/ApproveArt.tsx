// Aprovação de arte sem login (/aprovar-arte/<token>), pedido do usuário (03/11/2026): o cliente abre o link que chegou
// no grupo e vê a arte como ficaria no Instagram dele. Post de feed, carrossel (arrasta as lâminas), story e sequência de
// stories (passa um por um). Com duas opções (A e B), escolhe a que quer. Embaixo: Aprovar ou Pedir ajuste.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Loader2, Pencil } from 'lucide-react';
import NetworkPreview, { type PreviewFormat } from '@/components/social/NetworkPreview';
import logo from '@/assets/pulse-logo-branco.png';

const VPS_API_BASE = 'https://agenciapulse.tech/api';

interface ArtShare {
  title: string;
  format: 'feed' | 'carrossel' | 'story' | 'sequencia';
  options: { key: string; images: string[] }[];
  caption: string | null;
  client: { name: string; logo: string | null; username: string | null; avatar: string | null };
  decided: 'aprovado' | 'ajuste' | null;
  can_decide: boolean;
}

const FORMAT: Record<ArtShare['format'], { preview: PreviewFormat; label: string; hint: string }> = {
  feed: { preview: 'feed', label: 'Post no feed', hint: '' },
  carrossel: { preview: 'carousel', label: 'Carrossel', hint: 'Use as setas para passar as lâminas, como no Instagram.' },
  story: { preview: 'stories', label: 'Story', hint: '' },
  sequencia: { preview: 'stories', label: 'Sequência de stories', hint: 'Use as setas para ver cada story, na ordem em que vão sair.' },
};

export default function ApproveArt() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ArtShare | null>(null);
  const [error, setError] = useState('');
  const [option, setOption] = useState(0);
  // story e sequência: um por vez, tocando à direita para o próximo (como no Instagram)
  const [story, setStory] = useState(0);
  const [mode, setMode] = useState<'view' | 'adjust'>('view');
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<'aprovado' | 'ajuste' | null>(null);

  useEffect(() => {
    fetch(`${VPS_API_BASE}/public/aprovar-arte/${token}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Link não encontrado'); return j as ArtShare; })
      .then((j) => { setData(j); setDone(j.decided); })
      .catch((e) => setError(e.message));
  }, [token]);

  const current = data?.options[option];
  const isStory = data?.format === 'story' || data?.format === 'sequencia';
  const storyCount = isStory ? current?.images.length || 0 : 0;
  useEffect(() => { setStory(0); }, [option]);
  const fmt = data ? FORMAT[data.format] : FORMAT.feed;
  const previewFormat: PreviewFormat = useMemo(() => {
    if (!data || !current) return 'feed';
    if (data.format === 'feed' && current.images.length > 1) return 'carousel';
    return fmt.preview;
  }, [data, current, fmt.preview]);

  const send = async (action: 'approve' | 'adjust') => {
    if (!data || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${VPS_API_BASE}/public/aprovar-arte/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes, name, option: data.options.length > 1 ? current?.key : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Não deu para enviar');
      setDone(j.decided);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0b0b10] text-white">
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
        <header className="flex items-center justify-between">
          <img src={logo} alt="Pulse" className="h-6 w-auto opacity-90" />
          {data && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70">{fmt.label}</span>}
        </header>

        {error && !data ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/70">{error}</div>
        ) : !data ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin text-white/40" /></div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-xs text-white/50">{data.client.name} · para aprovar</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">{data.title}</h1>
              <p className="mt-1 text-xs text-white/50">Veja como fica no seu Instagram{data.options.length > 1 ? ' e escolha a opção que mais gostar' : ''}.</p>
            </div>

            {data.options.length > 1 && (
              <div role="tablist" aria-label="Opções da arte" className="flex justify-center gap-2">
                {data.options.map((o, i) => (
                  <button key={o.key} type="button" role="tab" aria-selected={i === option} onClick={() => setOption(i)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${i === option ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/15'}`}>
                    Opção {o.key}
                  </button>
                ))}
              </div>
            )}

            {current && (
              <div className="rounded-3xl bg-white p-3 text-foreground">
                {storyCount > 1 && (
                  <div className="mx-auto mb-2 flex max-w-[300px] gap-1" aria-label={`Story ${story + 1} de ${storyCount}`}>
                    {current.images.map((_, i) => (
                      <button key={i} type="button" onClick={() => setStory(i)} aria-label={`Ver o story ${i + 1}`}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${i <= story ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
                    ))}
                  </div>
                )}
                <div
                  className={storyCount > 1 ? 'cursor-pointer select-none' : undefined}
                  onClick={storyCount > 1 ? (e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    const right = e.clientX - box.left > box.width / 2;
                    setStory((i) => Math.max(0, Math.min(storyCount - 1, i + (right ? 1 : -1))));
                  } : undefined}
                >
                <NetworkPreview
                  key={`${option}-${previewFormat}-${story}`}
                  networks={['instagram']}
                  format={previewFormat}
                  media={isStory ? [current.images[story]] : current.images}
                  captions={{ instagram: data.caption || '' }}
                  accounts={[{ platform: 'instagram', name: data.client.name, username: data.client.username, picture: data.client.avatar }]}
                  fallbackName={data.client.name}
                  fallbackPicture={data.client.avatar}
                />
                </div>
                {current.images.length > 1 && <p className="mt-1 text-center text-[11px] text-neutral-500">{isStory ? `Story ${story + 1} de ${storyCount}: toque à direita para o próximo e à esquerda para voltar.` : fmt.hint}</p>}
              </div>
            )}

            {done ? (
              <div className={`rounded-2xl border p-5 text-center ${done === 'aprovado' ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/30 bg-amber-500/10'}`}>
                <p className="text-base font-semibold">{done === 'aprovado' ? 'Arte aprovada! 🎉' : 'Pedido de ajuste enviado'}</p>
                <p className="mt-1 text-sm text-white/70">{done === 'aprovado' ? 'Obrigado! A equipe da Pulse já foi avisada e agenda a postagem.' : 'A designer já recebeu o seu pedido e manda a versão nova por aqui.'}</p>
              </div>
            ) : !data.can_decide ? (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">Esta arte não está mais esperando aprovação.</p>
            ) : mode === 'adjust' ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">O que você quer mudar{data.options.length > 1 ? ` na opção ${current?.key}` : ''}?</p>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Ex.: trocar a cor do título, usar outra foto…"
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30" />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome (opcional)"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode('view')} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-semibold">Voltar</button>
                  <button type="button" disabled={sending || notes.trim().length < 3} onClick={() => send('adjust')} className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-black disabled:opacity-50">
                    {sending ? 'Enviando…' : 'Enviar pedido'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setMode('adjust')} className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-4 text-sm font-semibold transition-colors hover:bg-white/15">
                  <Pencil size={16} /> Pedir ajuste
                </button>
                <button type="button" disabled={sending} onClick={() => send('approve')} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-60">
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {data.options.length > 1 ? `Aprovar opção ${current?.key}` : 'Aprovar'}
                </button>
              </div>
            )}
            {error && data && <p className="text-center text-xs text-red-300">{error}</p>}
          </>
        )}
        <p className="pt-2 text-center text-[10px] text-white/30">Pulse Growth Marketing · prévia ilustrativa do Instagram</p>
      </div>
    </div>
  );
}
