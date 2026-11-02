// Redes sociais do cliente no cadastro (usuário, 02/11/2026): "no cadastro do cliente quero que seja possível
// selecionar as redes sociais e assim gerar um link que envio para o cliente e ele faz login das redes sociais deles
// que eu selecionei". O link é a página de conexão da Upload-Post (lib/uploadPost.mjs), só com as redes marcadas.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Facebook, Instagram, Link2, Linkedin, Loader2, Music2, RefreshCw, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

const NETWORKS = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
  { id: 'tiktok', label: 'TikTok', Icon: Music2 },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { id: 'youtube', label: 'YouTube', Icon: Youtube },
] as const;

interface Info {
  networks: string[];
  accounts: { platform: string; account_name: string; username: string | null; status: string }[];
  configured: boolean;
}

export default function ClientSocialNetworks({ clientId, whatsapp }: { clientId: string; whatsapp?: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<'link' | 'sync' | null>(null);
  const [link, setLink] = useState('');

  const load = async () => {
    const { data, error } = await invokeVpsFunction(`upload-post/clients/${clientId}`, { method: 'GET' });
    if (error || data?.error) return;
    setInfo(data as Info);
    setChosen((data as Info).networks?.length ? (data as Info).networks : ['instagram', 'facebook']);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLink(''); load(); }, [clientId]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const makeLink = async () => {
    setBusy('link');
    try {
      const { data, error } = await invokeVpsFunction(`upload-post/clients/${clientId}/connect`, { body: { networks: chosen } });
      if (error || data?.error || !data?.url) throw new Error(data?.error || error?.message || 'Não deu para gerar o link.');
      setLink(data.url);
      try { await navigator.clipboard.writeText(data.url); toast.success('Link gerado e copiado. Vale por 48 horas.'); } catch { toast.success('Link gerado. Vale por 48 horas.'); }
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy('sync');
    try {
      const { data, error } = await invokeVpsFunction(`upload-post/clients/${clientId}/sync`, { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não deu para atualizar.');
      toast.success((data?.accounts || []).length ? 'Contas atualizadas.' : 'O cliente ainda não conectou nenhuma rede.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!info) return null;
  const connected = (id: string) => info.accounts.find((a) => a.platform === id);
  const message = link
    ? `Olá! 😊 Para a Pulse publicar os seus conteúdos automaticamente, entre neste link e faça login nas suas redes (${chosen.map((c) => NETWORKS.find((n) => n.id === c)?.label).join(', ')}). É rápido e seguro: a gente só publica o que você aprovar.\n\n${link}`
    : '';

  return (
    <div className="p-4 rounded-xl border space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Redes sociais (postagem automática)</p>
          <p className="text-[11px] text-muted-foreground">Marque as redes que a Pulse cuida e gere o link: o cliente faz login só nelas.</p>
        </div>
        <Button type="button" size="sm" variant="ghost" title="Atualizar contas conectadas" disabled={!!busy} onClick={sync}>
          {busy === 'sync' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </Button>
      </div>
      {!info.configured && <p className="text-[11px] text-destructive">A chave da Upload-Post ainda não foi colada (Conexões Sociais).</p>}
      <div className="flex flex-wrap gap-1.5">
        {NETWORKS.map(({ id, label, Icon }) => {
          const on = chosen.includes(id);
          const acc = connected(id);
          return (
            <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={on}
              className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40')}>
              <Icon size={13} aria-hidden="true" /> {label}
              {acc && <CheckCircle2 size={12} className="text-emerald-500" aria-label="conectada" />}
            </button>
          );
        })}
      </div>
      {info.accounts.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Conectadas: {info.accounts.map((a) => `${NETWORKS.find((n) => n.id === a.platform)?.label || a.platform}${a.username ? ` (@${a.username.replace(/^@/, '')})` : ''}${a.status !== 'connected' ? ' · precisa reconectar' : ''}`).join(' · ')}
        </p>
      )}
      <Button type="button" size="sm" className="gap-1.5" disabled={!!busy || !chosen.length || !info.configured} onClick={makeLink}>
        {busy === 'link' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Gerar link para o cliente
      </Button>
      {link && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
            <Button type="button" size="sm" variant="outline" className="gap-1 shrink-0" onClick={async () => {
              try { await navigator.clipboard.writeText(message); toast.success('Mensagem com o link copiada'); } catch { toast.error('Copie o link acima.'); }
            }}>
              <Copy size={13} /> Copiar mensagem
            </Button>
          </div>
          {whatsapp && (
            <a className="text-xs text-primary underline" target="_blank" rel="noreferrer"
              href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`}>
              Abrir no WhatsApp do cliente
            </a>
          )}
        </div>
      )}
    </div>
  );
}
