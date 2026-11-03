// Conectar as redes do cliente com a cara da Pulse (usuário, 02/11/2026: "conexão transparente… dentro da nossa plataforma
// não mostrar plataforma de terceiros, porque o cliente fica desconfiado"). O cliente abre o link que a equipe mandou,
// toca em cada rede, faz o login oficial dela e volta para cá com "Conectado". Servidor: lib/uploadPost.mjs.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, Facebook, Instagram, Linkedin, Loader2, Lock, MapPin, Music2, RefreshCw, Youtube } from 'lucide-react';
import logo from '@/assets/pulse-logo-branco.png';

const API = 'https://agenciapulse.tech/api';

const NETWORKS: Record<string, { label: string; color: string; Icon: typeof Instagram; help: string }> = {
  instagram: { label: 'Instagram', color: 'linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)', Icon: Instagram, help: 'Conta profissional (empresa ou criador)' },
  facebook: { label: 'Facebook', color: '#1877F2', Icon: Facebook, help: 'A página da empresa' },
  tiktok: { label: 'TikTok', color: '#111111', Icon: Music2, help: 'A conta da empresa' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', Icon: Linkedin, help: 'O perfil ou a página da empresa' },
  youtube: { label: 'YouTube', color: '#FF0000', Icon: Youtube, help: 'O canal da empresa' },
  google_business: { label: 'Google', color: '#34A853', Icon: MapPin, help: 'A ficha da empresa no Google (avaliações)' },
};

interface Data { client: { name: string; logo: string | null }; networks: { id: string; connected: boolean; reconnect: boolean; account: string | null }[] }

export default function ConnectNetworks() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const back = params.get('rede');
  const status = params.get('connect_status');

  const load = () => fetch(`${API}/public/conectar/${encodeURIComponent(token || '')}`)
    .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'Link não encontrado'); setData(b); })
    .catch((e: Error) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'Conectar redes · Agência Pulse'; load(); }, [token]);

  const connect = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`${API}/public/conectar/${encodeURIComponent(token || '')}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rede: id }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.url) throw new Error(b.error || 'Não deu para abrir o login. Tente de novo.');
      window.location.href = b.url;
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  const done = data ? data.networks.filter((n) => n.connected).length : 0;
  return (
    <div className="min-h-screen bg-[#0E0E10] text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <header className="border-b-4 border-[#F15A24]">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <img src={logo} alt="Pulse" className="h-6" />
          <span className="flex items-center gap-1 text-xs text-white/60"><Lock className="h-3.5 w-3.5" /> Conexão segura</span>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-5 px-4 pb-12 pt-6">
        {!data && !error && <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#F15A24]" /></div>}
        {error && !data && <div className="rounded-2xl bg-white/5 p-6 text-center"><p className="font-semibold">{error}</p><p className="mt-1 text-sm text-white/60">Fale com a equipe da Pulse que mandamos um link novo.</p></div>}
        {data && (
          <>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Conecte as redes de {data.client.name}</h1>
              <p className="mt-2 text-sm text-white/70">Toque em cada rede e entre com o seu login. A Pulse só publica os conteúdos que você aprovar, e você pode desconectar quando quiser.</p>
            </div>

            {back && status && (
              <p className={`rounded-xl px-4 py-3 text-sm font-medium ${status === 'success' ? 'bg-[#1F9D55]/20 text-[#7BE0A6]' : 'bg-[#F15A24]/15 text-[#FFB08C]'}`} role="status">
                {status === 'success' ? `${NETWORKS[back]?.label || 'Rede'} conectado!` : `O ${NETWORKS[back]?.label || 'login'} não foi concluído. Toque de novo para tentar.`}
              </p>
            )}

            <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-label={`${done} de ${data.networks.length} conectadas`}>
              <div className="h-full rounded-full bg-[#F15A24] transition-all" style={{ width: `${(done / Math.max(1, data.networks.length)) * 100}%` }} />
            </div>
            <p className="-mt-3 text-xs text-white/50">{done} de {data.networks.length} conectada(s)</p>

            <div className="space-y-3">
              {data.networks.map((n) => {
                const meta = NETWORKS[n.id];
                if (!meta) return null;
                return (
                  <div key={n.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: meta.color }}><meta.Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{meta.label}</p>
                      <p className="truncate text-xs text-white/55">{n.connected ? (n.account ? `@${String(n.account).replace(/^@/, '')}` : 'Conectado') : n.reconnect ? 'Precisa entrar de novo' : meta.help}</p>
                    </div>
                    {n.connected ? (
                      <span className="flex items-center gap-1 rounded-full bg-[#1F9D55]/20 px-3 py-1.5 text-xs font-semibold text-[#7BE0A6]"><Check className="h-3.5 w-3.5" /> Conectado</span>
                    ) : (
                      <button type="button" disabled={!!busy} onClick={() => connect(n.id)}
                        className="rounded-xl bg-[#F15A24] px-4 py-2.5 text-sm font-bold active:scale-[0.98] disabled:opacity-60">
                        {busy === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : n.reconnect ? 'Entrar de novo' : 'Conectar'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {done === data.networks.length && data.networks.length > 0 && (
              <div className="rounded-2xl bg-[#1F9D55]/15 p-4 text-center">
                <p className="font-bold text-[#7BE0A6]">Tudo pronto! 🎉</p>
                <p className="mt-1 text-sm text-white/70">Suas redes estão conectadas. Pode fechar esta página.</p>
              </div>
            )}
            <button type="button" onClick={load} className="mx-auto flex items-center gap-1.5 text-xs text-white/50 underline"><RefreshCw className="h-3 w-3" /> Atualizar</button>
            <p className="text-center text-xs text-white/40">Agência Pulse · @agenciapulse</p>
          </>
        )}
      </main>
    </div>
  );
}
