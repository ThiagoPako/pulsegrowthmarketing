// Aba Storymaker do Estúdio de Postagem (usuário, 03/11/2026: "às vezes fazemos eventos e tem storymaker"). A equipe cria o
// evento (cliente fixo ou cliente só de evento, logo do evento, redes, quanto tempo vale) e cadastra os convidados: cada
// um recebe o próprio link. A equipe Pulse posta pelo link do evento com o login do sistema. Embaixo, a busca e o
// histórico (auditoria): quem postou o quê, quando e de onde.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Copy, ExternalLink, Facebook, History, ImagePlus, Instagram, Loader2, MessageCircle, Plus, Radio, Search, Square, Trash2, UserPlus, UserX, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ClientTag from '@/components/ClientTag';
import ClientSocialNetworks from '@/components/social/ClientSocialNetworks';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { uploadFileToVps } from '@/services/vpsApi';
import {
  addStorymakerGuest, closeStorymaker, createEventClient, createStorymaker, listStorymakers, revokeStorymakerGuest, storymakerHistory,
  type StorymakerAudit, type StorymakerGuest, type StorymakerLink,
} from '@/services/storymakerApi';
import { cn } from '@/lib/utils';

interface ClientRow { id: string; name: string; city: string | null; logo_url: string | null; accounts: { platform: string }[] }
interface GuestDraft { name: string; phone: string }

const NETS = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
] as const;
const DURATIONS = [4, 8, 12, 24, 48];
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const phoneLabel = (p: string | null) => (p ? p.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '');
const copy = (text: string, label = 'Link copiado') => navigator.clipboard?.writeText(text).then(() => toast.success(label), () => toast.error('Não deu para copiar'));

function LogoPicker({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast.error('Escolha uma imagem (PNG ou JPG)'); return; }
    setBusy(true);
    try { onChange(await uploadFileToVps(file, 'storymaker-logos')); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 hover:border-primary/60" aria-label={label}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : value ? <img src={value} alt="" className="h-full w-full bg-white object-contain p-1" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
      </button>
      <div className="min-w-0 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{label}</p>
        <p>{value ? 'Toque para trocar' : 'Opcional · PNG com fundo transparente fica melhor'}</p>
        {value && <button type="button" onClick={() => onChange(null)} className="text-destructive hover:underline">Tirar</button>}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

function GuestRow({ g, link, onRevoke }: { g: StorymakerGuest; link: StorymakerLink; onRevoke: () => void }) {
  const msg = `Oi, ${g.name.split(' ')[0]}! Este é o seu link para postar os stories do evento "${link.title}". Abra no celular, tire a foto ou grave o vídeo e poste na hora:\n${g.url}`;
  const wa = g.phone ? `https://wa.me/${g.phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return (
    <li className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2', g.revoked_at && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{g.name} {g.revoked_at && <span className="text-xs font-normal text-destructive">· sem acesso</span>}</p>
        <p className="text-xs text-muted-foreground">{g.phone ? phoneLabel(g.phone) : 'sem WhatsApp'} · {g.posts ?? 0} stories</p>
      </div>
      {!g.revoked_at && link.active && (
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Copiar link de ${g.name}`} onClick={() => copy(g.url, `Link de ${g.name} copiado`)}><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Enviar link a ${g.name} no WhatsApp`} asChild><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Tirar o acesso de ${g.name}`} onClick={onRevoke}><UserX className="h-4 w-4" /></Button>
        </div>
      )}
    </li>
  );
}

function HistoryDialog({ link, onClose }: { link: StorymakerLink | null; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<StorymakerAudit[] | null>(null);
  useEffect(() => {
    if (!link) return undefined;
    setRows(null);
    const t = window.setTimeout(() => { storymakerHistory(link.id, q).then(setRows).catch((e) => { toast.error((e as Error).message); setRows([]); }); }, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [link, q]);
  useEffect(() => { setQ(''); }, [link?.id]);
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-5 pb-3">
          <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Histórico · {link?.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {link?.client_name} · criado em {link ? when(link.created_at) : ''}{link?.created_by_name ? ` por ${link.created_by_name}` : ''}
          </p>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por pessoa ou IP" className="pl-9" />
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {!rows ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            : !rows.length ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum story {q ? 'encontrado' : 'postado ainda'}.</p>
              : (
                <ul className="divide-y divide-border">
                  {rows.map((r) => (
                    <li key={r.id} className="flex gap-3 py-2.5">
                      <a href={r.media_url} target="_blank" rel="noreferrer" className="h-16 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                        {/\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(r.media_url)
                          ? <video src={`${r.media_url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                          : <img src={r.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      </a>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">
                          {r.author || 'Sem nome'}{' '}
                          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', r.author_kind === 'equipe' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                            {r.author_kind === 'equipe' ? 'Equipe Pulse' : `Convidado${r.guest_phone ? ` · ${phoneLabel(r.guest_phone)}` : ''}`}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">Enviado {when(r.created_at)}{r.published_at ? ` · no ar ${when(r.published_at)}` : ''}</p>
                        <p className="truncate text-[11px] text-muted-foreground" title={r.user_agent || undefined}>IP {r.ip || '—'} · {r.user_agent ? r.user_agent.replace(/^Mozilla\/5\.0 \(([^)]+)\).*$/, '$1') : 'aparelho desconhecido'}</p>
                        {r.status === 'erro' && <p className="text-xs text-destructive">Erro: {r.last_error}</p>}
                      </div>
                      <span className={cn('h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        r.status === 'publicado' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : r.status === 'erro' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground')}>
                        {r.status === 'publicado' ? 'No ar' : r.status === 'erro' ? 'Erro' : r.status === 'cancelado' ? 'Cancelado' : 'Enviando'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StorymakerPanel() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientId, setClientId] = useState('');
  const [eventClient, setEventClient] = useState<{ name: string; logo: string | null } | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [title, setTitle] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [nets, setNets] = useState<string[]>(['instagram']);
  const [hours, setHours] = useState(12);
  const [guests, setGuests] = useState<GuestDraft[]>([{ name: '', phone: '' }]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [links, setLinks] = useState<StorymakerLink[] | null>(null);
  const [openGuests, setOpenGuests] = useState<string | null>(null);
  const [newGuest, setNewGuest] = useState<GuestDraft>({ name: '', phone: '' });
  const [history, setHistory] = useState<StorymakerLink | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const loadClients = useCallback(() => invokeVpsFunction('social-posts/accounts-overview', { method: 'GET' })
    .then(({ data }) => setClients((data?.clients || []) as ClientRow[]))
    .finally(() => setLoadingClients(false)), []);
  useEffect(() => { loadClients(); }, [loadClients]);

  const client = clients.find((c) => c.id === clientId) || null;
  const connected = (client?.accounts || []).map((a) => a.platform).filter((n) => n === 'instagram' || n === 'facebook');
  useEffect(() => { setNets(connected); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId, connected.join()]);

  const load = useCallback(async () => {
    try { setLinks(await listStorymakers({ q })); } catch (e) { toast.error((e as Error).message); setLinks([]); }
  }, [q]);
  useEffect(() => { const t = window.setTimeout(load, q ? 300 : 0); return () => window.clearTimeout(t); }, [load, q]);

  const saveEventClient = async () => {
    if (!eventClient) return;
    setSavingClient(true);
    try {
      const c = await createEventClient({ name: eventClient.name, logo_url: eventClient.logo });
      await loadClients();
      setClientId(c.id);
      setEventClient(null);
      toast.success('Cliente do evento cadastrado. Agora conecte o Instagram ou o Facebook dele.');
    } catch (e) { toast.error((e as Error).message); } finally { setSavingClient(false); }
  };

  const create = async () => {
    setBusy(true);
    try {
      const link = await createStorymaker({ client_id: clientId, title, networks: nets, hours, logo_url: logo, guests: guests.filter((g) => g.name.trim()) });
      setTitle(''); setLogo(null); setGuests([{ name: '', phone: '' }]);
      setQ('');
      await load();
      setOpenGuests(link.id);
      toast.success('Storymaker criado. Mande o link pessoal de cada convidado.');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const addGuest = async (l: StorymakerLink) => {
    try { await addStorymakerGuest(l.id, newGuest); setNewGuest({ name: '', phone: '' }); await load(); } catch (e) { toast.error((e as Error).message); }
  };

  const noAccounts = !!client && !connected.length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Radio className="h-5 w-5 text-primary" /> Novo storymaker</h2>
          <p className="mt-1 text-sm text-muted-foreground">Posta story em tempo real no evento. A equipe Pulse entra com o login; quem é de fora precisa estar cadastrado abaixo.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Cliente</Label>
            {!eventClient && <button type="button" onClick={() => setEventClient({ name: '', logo: null })} className="text-xs font-medium text-primary hover:underline">+ Cliente só de evento</button>}
          </div>
          {eventClient ? (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">Para quem contratou só o evento: não entra no Kanban nem na cobrança.</p>
              <Input value={eventClient.name} onChange={(e) => setEventClient({ ...eventClient, name: e.target.value })} placeholder="Nome de quem contratou" maxLength={100} />
              <LogoPicker value={eventClient.logo} onChange={(v) => setEventClient({ ...eventClient, logo: v })} label="Logo do cliente" />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEventClient(null)}>Cancelar</Button>
                <Button size="sm" className="flex-1" onClick={saveEventClient} disabled={savingClient || eventClient.name.trim().length < 2}>
                  {savingClient && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Cadastrar cliente do evento
                </Button>
              </div>
            </div>
          ) : (
            <Select value={clientId} onValueChange={setClientId} disabled={loadingClients}>
              <SelectTrigger><SelectValue placeholder={loadingClients ? 'Carregando…' : 'Escolher cliente'} /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}><ClientTag id={c.id} name={c.name} logo={c.logo_url || undefined} /></SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {noAccounts && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium">Este cliente ainda não conectou o Instagram nem o Facebook.</p>
            <ClientSocialNetworks clientId={client.id} />
            <Button size="sm" variant="outline" onClick={loadClients}>Já conectou? Atualizar</Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Nome do evento</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ex.: Inauguração da loja nova" />
        </div>
        <LogoPicker value={logo} onChange={setLogo} label="Logo do evento" />

        <div className="space-y-1.5">
          <Label className="text-xs">Postar no</Label>
          <div className="flex gap-2">
            {NETS.map(({ id, label, Icon }) => {
              const ok = connected.includes(id);
              const on = nets.includes(id);
              return (
                <button key={id} type="button" disabled={!ok} aria-pressed={on}
                  onClick={() => setNets((v) => (on ? v.filter((x) => x !== id) : [...v, id]))}
                  className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
                    on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground', !ok && 'cursor-not-allowed opacity-40')}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">O link vale por</Label>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((h) => (
              <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}
                className={cn('rounded-full border px-3 py-1 text-sm', hours === h ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{h} h</button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Convidados de fora (cada um recebe o próprio link)</Label>
          {guests.map((g, i) => (
            <div key={i} className="flex gap-2">
              <Input value={g.name} onChange={(e) => setGuests((v) => v.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="Nome" maxLength={60} />
              <Input value={g.phone} onChange={(e) => setGuests((v) => v.map((x, k) => (k === i ? { ...x, phone: e.target.value } : x)))} placeholder="WhatsApp" inputMode="tel" className="w-40" />
              <Button size="icon" variant="ghost" aria-label="Tirar convidado" onClick={() => setGuests((v) => (v.length > 1 ? v.filter((_, k) => k !== i) : [{ name: '', phone: '' }]))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <button type="button" onClick={() => setGuests((v) => [...v, { name: '', phone: '' }])} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"><UserPlus className="h-3.5 w-3.5" /> Mais um convidado</button>
        </div>

        <Button className="w-full gap-1.5" onClick={create} disabled={busy || !clientId || title.trim().length < 2 || !nets.length}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar storymaker
        </Button>
      </section>

      <section className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento, cliente ou pessoa que postou" className="pl-9" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        {!links ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          : !links.length ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{q ? 'Nada encontrado.' : 'Nenhum storymaker ainda. Crie o primeiro ao lado.'}</p>
            : links.map((l) => (
              <article key={l.id} className={cn('rounded-2xl border bg-card p-4 shadow-sm', l.active ? 'border-primary/30' : 'border-border')}>
                <div className="flex flex-wrap items-start gap-3">
                  {(l.logo_url || l.client_logo) && <img src={l.logo_url || l.client_logo || ''} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-border bg-white object-contain p-1" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.title}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <ClientTag id={l.client_id} name={l.client_name || ''} logo={l.client_logo || undefined} size={16} />
                      {l.client_status === 'evento' && <span className="rounded bg-muted px-1 text-[10px]">só evento</span>}
                      <span>· {l.active ? `até ${when(l.expires_at)}` : l.closed_at ? `encerrado ${when(l.closed_at)}` : `venceu ${when(l.expires_at)}`}</span>
                    </p>
                  </div>
                  <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', l.active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
                    {l.active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}{l.active ? 'Ao vivo' : 'Fechado'}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <b>{l.published ?? 0}</b> no ar de <b>{l.total ?? 0}</b> enviados{l.failed ? <span className="text-destructive"> · {l.failed} com erro</span> : null}
                  <span className="text-muted-foreground"> · {l.networks.map((n) => (n === 'instagram' ? 'Instagram' : 'Facebook')).join(' e ')}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.active && <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => copy(l.url, 'Link da equipe copiado')}><Copy className="h-4 w-4" /> Link da equipe</Button>}
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setOpenGuests(openGuests === l.id ? null : l.id)}><UserPlus className="h-4 w-4" /> Convidados ({l.guests.filter((g) => !g.revoked_at).length})</Button>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setHistory(l)}><History className="h-4 w-4" /> Histórico</Button>
                  {l.active && <Button size="sm" variant="ghost" className="gap-1.5" asChild><a href={l.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Abrir</a></Button>}
                  {l.active && (
                    <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setConfirm({ title: 'Encerrar storymaker?', description: `Ninguém mais posta em "${l.title}". O histórico continua guardado.`, confirmLabel: 'Encerrar', destructive: true,
                        onConfirm: async () => { try { await closeStorymaker(l.id); await load(); toast.success('Storymaker encerrado'); } catch (e) { toast.error((e as Error).message); } } })}>
                      <Square className="h-3.5 w-3.5" /> Encerrar
                    </Button>
                  )}
                </div>
                {openGuests === l.id && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">O link da equipe só abre com o login da Pulse. Cada convidado posta pelo link pessoal dele, e o nome vai para o histórico.</p>
                    {l.guests.length > 0 && (
                      <ul className="space-y-1.5">
                        {l.guests.map((g) => (
                          <GuestRow key={g.id} g={g} link={l} onRevoke={() => setConfirm({ title: `Tirar o acesso de ${g.name}?`, description: 'O link pessoal dele para de funcionar.', confirmLabel: 'Tirar acesso', destructive: true,
                            onConfirm: async () => { try { await revokeStorymakerGuest(g.id); await load(); } catch (e) { toast.error((e as Error).message); } } })} />
                        ))}
                      </ul>
                    )}
                    {l.active && (
                      <div className="flex gap-2">
                        <Input value={newGuest.name} onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })} placeholder="Nome do convidado" maxLength={60} />
                        <Input value={newGuest.phone} onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })} placeholder="WhatsApp" inputMode="tel" className="w-40" />
                        <Button size="sm" onClick={() => addGuest(l)} disabled={newGuest.name.trim().length < 2}><Plus className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
      </section>
      <HistoryDialog link={history} onClose={() => setHistory(null)} />
      <ConfirmActionDialog action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
