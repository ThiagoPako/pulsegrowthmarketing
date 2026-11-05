// Redes sociais do cliente no cadastro (usuário, 02/11/2026): "no cadastro do cliente quero que seja possível
// selecionar as redes sociais e assim gerar um link que envio para o cliente e ele faz login das redes sociais deles
// que eu selecionei". O link é a página de conexão da Upload-Post (lib/uploadPost.mjs), só com as redes marcadas.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, AtSign, CheckCircle2, Copy, ExternalLink, Facebook, Instagram, Link2, Linkedin, Loader2, MapPin, MessageCircle, Music2, Pin, RefreshCw, Send, Twitter, Youtube } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import PlanUpgradeDialog from '@/components/social/PlanUpgradeDialog';

const NETWORKS = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
  { id: 'tiktok', label: 'TikTok', Icon: Music2 },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { id: 'youtube', label: 'YouTube', Icon: Youtube },
  // ficha do Google: postar novidades e responder avaliações (Central Social)
  { id: 'google_business', label: 'Google (avaliações)', Icon: MapPin },
  { id: 'threads', label: 'Threads', Icon: AtSign },
  { id: 'x', label: 'X', Icon: Twitter },
  { id: 'pinterest', label: 'Pinterest', Icon: Pin },
] as const;

interface Info {
  networks: string[];
  accounts: { platform: string; account_name: string; username: string | null; status: string }[];
  // a mesma conta ligada também em outro cliente (o login do navegador entrou nos dois perfis)
  shared?: { platform: string; username: string; clients: string[] }[];
  configured: boolean;
  whatsapp?: string | null;
  responsible?: string | null;
  name?: string | null;
}

export default function ClientSocialNetworks({ clientId, whatsapp, onContractValue }: { clientId: string; whatsapp?: string; onContractValue?: (value: number) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<'link' | 'sync' | 'send' | null>(null);
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  // upgrade do plano (03/11/2026): rede nova marcada num cliente que já tinha redes no plano
  const [upgrade, setUpgrade] = useState<{ id: string; label: string } | null>(null);
  const [addons, setAddons] = useState<{ id: string; network: string; monthly_value: number; charge: string; start_date: string; first_amount: number | null; first_days: number | null }[]>([]);

  const load = async () => {
    const { data, error } = await invokeVpsFunction(`upload-post/clients/${clientId}`, { method: 'GET' });
    if (error || data?.error) return;
    setInfo(data as Info);
    invokeVpsFunction(`clients/${clientId}/plan-addons`, { method: 'GET' }).then(({ data: a }) => setAddons(a?.addons || []));
    setChosen((data as Info).networks?.length ? (data as Info).networks : ['instagram', 'facebook']);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLink(''); load(); }, [clientId]);

  const toggle = (id: string) => {
    const planned = info?.networks || [];
    // rede nova num plano que já existe = upgrade: abre a cobrança (valor mensal + proporcional)
    if (!chosen.includes(id) && planned.length > 0 && !planned.includes(id)) {
      setUpgrade({ id, label: NETWORKS.find((n) => n.id === id)?.label || id });
      return;
    }
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  };

  const makeLink = async () => {
    setBusy('link');
    try {
      const { data, error } = await invokeVpsFunction(`upload-post/clients/${clientId}/connect`, { body: { networks: chosen } });
      if (error || data?.error || !data?.url) throw new Error(data?.error || error?.message || 'Não deu para gerar o link.');
      setLink(data.url);
      const first = String(info?.responsible || '').trim().split(/\s+/)[0];
      const labels = chosen.map((c) => NETWORKS.find((n) => n.id === c)?.label).filter(Boolean).join(', ');
      setMessage(`Olá${first ? `, ${first}` : ''}! 😊\n\nPara a Pulse publicar os seus conteúdos automaticamente, toque no link e conecte as suas redes (${labels}). Leva menos de um minuto e é seguro: a gente só publica o que você aprovar.\n\n${data.url}`);
      setPhone(info?.whatsapp || whatsapp || '');
      toast.success('Link pronto. Vale por 7 dias.');
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
  const digits = phone.replace(/\D/g, '');
  const waDigits = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const copy = async (text: string, ok: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error('Não deu para copiar: selecione e copie à mão.'); }
  };
  /** Manda pelo WhatsApp da Pulse (o sistema envia a mensagem ao número do cliente). */
  const sendByPulse = async () => {
    setBusy('send');
    try {
      const { data, error } = await invokeVpsFunction(`upload-post/clients/${clientId}/connect/send`, { body: { to: digits, message } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não deu para enviar.');
      toast.success(`Enviado para o WhatsApp do cliente (${data?.to || ''}).`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

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
      {!info.configured && <p className="text-[11px] text-destructive">A chave da integração de redes ainda não foi colada (Conexões Sociais).</p>}
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
      {addons.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Upgrades do plano</p>
          {addons.map((a) => (
            <p key={a.id} className="text-[11px]">
              {NETWORKS.find((n) => n.id === a.network)?.label || a.network}: {a.charge === 'cortesia'
                ? 'sem cobrança'
                : `+${a.monthly_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`} desde {a.start_date.split('-').reverse().join('/')}
              {a.charge !== 'cortesia' && a.first_amount != null && <span className="text-muted-foreground"> · 1ª fatura: {a.first_days} dias ({a.first_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</span>}
            </p>
          ))}
        </div>
      )}
      {info.accounts.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Conectadas: {info.accounts.map((a) => `${NETWORKS.find((n) => n.id === a.platform)?.label || a.platform}${a.username ? ` (@${a.username.replace(/^@/, '')})` : ''}${a.status === 'duplicada' ? ' · já é de outro cliente, não publica' : a.status !== 'connected' ? ' · precisa reconectar' : ''}`).join(' · ')}
        </p>
      )}
      {(info.shared || []).map((s) => (
        <div key={`${s.platform}-${s.username}`} role="alert" className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            <b>{NETWORKS.find((n) => n.id === s.platform)?.label || s.platform} @{s.username.replace(/^@/, '')}</b> também está conectado em{' '}
            <b>{s.clients.join(', ')}</b>. Os posts deste cliente iriam para essa conta. Se ela não é deste cliente, gere o link abaixo
            e abra numa <b>janela anônima</b>, entrando no Instagram certo (o navegador aproveita a conta que já está logada).
          </p>
        </div>
      ))}
      <Button type="button" size="sm" className="gap-1.5" disabled={!!busy || !chosen.length || !info.configured} onClick={makeLink}>
        {busy === 'link' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Gerar link para o cliente
      </Button>
      {link && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs" aria-label="Link de conexão" />
            <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 gap-1" onClick={() => copy(link, 'Link copiado')}><Copy size={13} /> Copiar link</Button>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Mensagem para o cliente</p>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 w-48" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp do cliente" aria-label="WhatsApp do cliente" />
            <Button type="button" size="sm" className="h-9 gap-1.5 bg-[#25D366] text-white hover:bg-[#1ebe5b]" disabled={busy === 'send' || digits.length < 10 || !message.includes(link)} onClick={sendByPulse}>
              {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar pelo WhatsApp da Pulse
            </Button>
            {digits.length >= 10 ? (
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" asChild>
                <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} className="text-[#25D366]" /> Abrir no meu WhatsApp <ExternalLink size={11} /></a>
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" disabled><MessageCircle size={14} /> Abrir no meu WhatsApp</Button>
            )}
            <Button type="button" size="sm" variant="ghost" className="h-9 gap-1" onClick={() => copy(message, 'Mensagem com o link copiada')}><Copy size={13} /> Copiar mensagem</Button>
          </div>
          {digits.length < 10 && <p className="text-[11px] text-muted-foreground">Coloque o WhatsApp do cliente com DDD para enviar.</p>}
        </div>
      )}
      <PlanUpgradeDialog
        clientId={clientId}
        network={upgrade}
        onClose={() => setUpgrade(null)}
        onDone={(v) => { if (upgrade) setChosen((c) => [...new Set([...c, upgrade.id])]); if (v != null) onContractValue?.(v); setUpgrade(null); load(); }}
      />
    </div>
  );
}
