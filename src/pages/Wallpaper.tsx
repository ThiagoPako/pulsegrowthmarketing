import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle, Apple, CalendarClock, CheckCircle2, Copy, ImagePlus, Link2, Loader2, Monitor, MonitorSmartphone,
  Plus, RefreshCw, Send, Trash2, Wallpaper as WallpaperIcon, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ClientLogo from '@/components/ClientLogo';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import { useCity } from '@/contexts/CityContext';
import { uploadFileToVps } from '@/services/vpsApi';
import { cn } from '@/lib/utils';
import {
  FIT_LABELS, addWallpaperImage, createWallpaperAccount, deleteWallpaperAccount, deleteWallpaperImage,
  deleteWallpaperSchedule, fetchWallpaperAccount, fetchWallpaperAccounts, fetchWallpaperClients,
  regenerateWallpaperLink, removeWallpaperDevice, scheduleWallpaper, updateWallpaperAccount, wallpaperLinkUrl,
  type WallpaperAccountDetail, type WallpaperFit, type WallpaperImage,
} from '@/services/wallpaperApi';

const logoProps = (c: { company_name: string; logo_url: string | null; color: string | null }) => ({
  companyName: c.company_name, logoUrl: c.logo_url ?? undefined, color: c.color ?? '',
});

const fmt = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }) : 'nunca');

/** datetime-local (horário do navegador) → ISO */
const localToIso = (value: string) => (value ? new Date(value).toISOString() : null);
const nowLocal = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

function Section({ title, icon: Icon, action, children }: { title: string; icon: typeof Monitor; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} className="text-primary" aria-hidden="true" />{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function NewAccountDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [clientId, setClientId] = useState('');
  const [fit, setFit] = useState<WallpaperFit>('fill');
  const [saving, setSaving] = useState(false);
  const { activeCity } = useCity();
  const { data: clients, isLoading } = useQuery({
    queryKey: ['wallpaper', 'clients', activeCity],
    queryFn: fetchWallpaperClients,
    enabled: open,
  });
  const available = (clients ?? []).filter((c) => !c.registered);

  useEffect(() => { if (open) { setClientId(''); setFit('fill'); } }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const { id } = await createWallpaperAccount(clientId, fit);
      toast.success('Cadastro criado. Agora envie o link ao cliente.');
      onCreated(id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo cadastro no Wallpaper</DialogTitle>
          <DialogDescription>Escolha o cliente. Depois você envia o link para conectar os computadores da empresa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={isLoading}>
              <SelectTrigger><SelectValue placeholder={isLoading ? 'Carregando…' : 'Selecione o cliente'} /></SelectTrigger>
              <SelectContent>
                {available.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                {!isLoading && available.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Todos os clientes já têm cadastro</div>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Como a imagem ocupa a tela</Label>
            <Select value={fit} onValueChange={(v) => setFit(v as WallpaperFit)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIT_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Vale para o Windows. No Mac a imagem sempre preenche a tela.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={!clientId || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar cadastro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ accountId, image, images, onClose, onSaved }: {
  accountId: string; image: WallpaperImage | null; images: WallpaperImage[]; onClose: () => void; onSaved: () => void;
}) {
  const [imageId, setImageId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (image) { setImageId(image.id); setStart(nowLocal()); setEnd(''); }
  }, [image]);

  const save = async () => {
    setSaving(true);
    try {
      await scheduleWallpaper(accountId, { image_id: imageId, starts_at: localToIso(start), ends_at: localToIso(end) });
      toast.success('Papel de parede agendado');
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selected = images.find((i) => i.id === imageId);
  return (
    <Dialog open={!!image} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar papel de parede</DialogTitle>
          <DialogDescription>
            Começa na data escolhida em todos os computadores. Com data de fim, volta sozinho para o papel de parede anterior quando acabar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {selected && <img src={selected.file_url} alt="" className="aspect-video w-full rounded-lg border border-border object-cover" />}
          <div className="space-y-1.5">
            <Label>Imagem</Label>
            <Select value={imageId} onValueChange={setImageId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {images.map((i) => <SelectItem key={i.id} value={i.id}>{i.title || 'Sem nome'}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wp-start">Começa em</Label>
              <Input id="wp-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-end">Termina em (opcional)</Label>
              <Input id="wp-end" type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={!imageId || !start || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const { activeCity } = useCity();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [scheduleFor, setScheduleFor] = useState<WallpaperImage | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const queryKey = ['wallpaper', 'account', activeCity, id];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchWallpaperAccount(id),
    refetchInterval: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['wallpaper', 'accounts'] });
  };

  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      toast.success(message);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const imagesById = useMemo(() => new Map((data?.images ?? []).map((i) => [i.id, i])), [data]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error)?.message || 'Cadastro não encontrado'}</p>;

  const { account } = data;
  const link = wallpaperLinkUrl(account.link_path);
  const active = data.active_image_id ? imagesById.get(data.active_image_id) : null;
  const upToDate = data.devices.filter((d) => d.up_to_date).length;
  const online = data.devices.filter((d) => d.online).length;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    for (const file of list) {
      try {
        if (!/\.(png|jpe?g|bmp|webp)$/i.test(file.name)) throw new Error(`${file.name}: use JPG, PNG, BMP ou WEBP`);
        const url = await uploadFileToVps(file, `wallpapers/${account.id}`);
        await addWallpaperImage(account.id, url, file.name.replace(/\.[^.]+$/, ''));
      } catch (err) {
        toast.error((err as Error).message);
      }
      setUploading((n) => n - 1);
    }
    if (fileInput.current) fileInput.current.value = '';
    refresh();
  };

  const applyNow = (image: WallpaperImage) => setConfirm({
    title: 'Aplicar agora em todos os computadores?',
    description: <p>“{image.title || 'Sem nome'}” vira o papel de parede de {data.devices.length} computador(es) em até {data.agent_interval_min} minutos.</p>,
    confirmLabel: 'Aplicar agora',
    onConfirm: () => run(() => scheduleWallpaper(account.id, { image_id: image.id }), 'Enviado para os computadores'),
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie à mão.');
    }
  };

  const whatsappText = encodeURIComponent(
    `Olá! Para manter o papel de parede da ${account.company_name} sempre atualizado, abra este link em cada computador da empresa e siga o passo a passo:\n${link}`
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ClientLogo client={logoProps(account)} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{account.company_name}</h2>
          <p className="text-sm text-muted-foreground">
            {data.devices.length} computador(es) · {online} online · {upToDate} com o papel de parede atual
          </p>
        </div>
        <Button
          variant="ghost" size="sm" className="text-destructive hover:text-destructive"
          onClick={() => setConfirm({
            title: 'Apagar o cadastro?',
            description: <p>Apaga imagens e agendamentos. O programa sai sozinho dos computadores do cliente na próxima conferência.</p>,
            confirmLabel: 'Apagar cadastro',
            destructive: true,
            onConfirm: () => run(async () => { await deleteWallpaperAccount(account.id); onDeleted(); }, 'Cadastro apagado'),
          })}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />Apagar
        </Button>
      </div>

      <Section title="Link para o cliente" icon={Link2}>
        <p className="mb-2 text-sm text-muted-foreground">
          O cliente abre o link em cada computador e segue o passo a passo (Windows ou Mac). Um mesmo link serve para todos os computadores.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={link} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyLink}><Copy className="mr-1.5 h-4 w-4" />Copiar</Button>
            <Button variant="outline" asChild>
              <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer"><Send className="mr-1.5 h-4 w-4" />WhatsApp</a>
            </Button>
            <Button
              variant="ghost" title="Gerar novo link"
              onClick={() => setConfirm({
                title: 'Gerar um link novo?',
                description: <p>O link atual para de funcionar para novas instalações. Os computadores já conectados continuam funcionando.</p>,
                confirmLabel: 'Gerar novo link',
                onConfirm: () => run(() => regenerateWallpaperLink(account.id), 'Link novo gerado'),
              })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title="Papel de parede atual"
        icon={MonitorSmartphone}
        action={(
          <Select value={account.fit} onValueChange={(v) => run(() => updateWallpaperAccount(account.id, { fit: v as WallpaperFit }), 'Ajuste salvo')}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FIT_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      >
        {active ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <img src={active.file_url} alt="" className="aspect-video w-full rounded-lg border border-border object-cover sm:w-72" />
            <div className="text-sm">
              <p className="font-medium">{active.title || 'Sem nome'}</p>
              <p className="text-muted-foreground">Os computadores conferem a cada {data.agent_interval_min} minutos e trocam sozinhos.</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum papel de parede aplicado ainda. Suba uma imagem e clique em “Aplicar agora”.</p>
        )}
      </Section>

      <Section
        title="Imagens"
        icon={ImagePlus}
        action={(
          <>
            <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.bmp,.webp" multiple hidden onChange={(e) => upload(e.target.files)} />
            <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploading > 0}>
              {uploading > 0 ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              {uploading > 0 ? `Enviando ${uploading}…` : 'Subir imagens'}
            </Button>
          </>
        )}
      >
        {data.images.length === 0 ? (
          <p className="text-sm text-muted-foreground">Suba as artes no tamanho da tela (ex.: 1920×1080 ou 3840×2160).</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.images.map((image) => (
              <div key={image.id} className={cn('overflow-hidden rounded-lg border bg-background', image.id === data.active_image_id ? 'border-primary ring-1 ring-primary' : 'border-border')}>
                <img src={image.file_url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <div className="space-y-2 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium" title={image.title}>{image.title || 'Sem nome'}</p>
                    {image.id === data.active_image_id && <Badge className="shrink-0">No ar</Badge>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-8 flex-1" onClick={() => applyNow(image)} disabled={image.id === data.active_image_id}>
                      <Zap className="mr-1 h-3.5 w-3.5" />Aplicar agora
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => setScheduleFor(image)}>
                      <CalendarClock className="mr-1 h-3.5 w-3.5" />Agendar
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" title="Apagar imagem"
                      onClick={() => setConfirm({
                        title: 'Apagar a imagem?',
                        description: <p>Os agendamentos com esta imagem também saem. Se ela estiver no ar, os computadores voltam ao papel de parede anterior.</p>,
                        confirmLabel: 'Apagar imagem',
                        destructive: true,
                        onConfirm: () => run(() => deleteWallpaperImage(image.id), 'Imagem apagada'),
                      })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Programação" icon={CalendarClock}>
        {data.schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada programado. Use “Agendar” numa imagem para trocar numa data (ex.: campanha de Natal).</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.schedules.map((s) => {
              const image = imagesById.get(s.image_id);
              return (
                <li key={s.id} className={cn('flex items-center gap-3 py-2', s.status === 'encerrada' && 'opacity-60')}>
                  {image && <img src={image.file_url} alt="" className="h-10 w-16 shrink-0 rounded border border-border object-cover" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{image?.title || 'Sem nome'}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(s.starts_at)}{s.ends_at ? ` até ${fmt(s.ends_at)}` : ' · sem data de fim'}
                    </p>
                  </div>
                  <Badge variant={s.status === 'ativa' ? 'default' : s.status === 'agendada' ? 'secondary' : 'outline'}>
                    {s.status === 'ativa' ? 'No ar' : s.status === 'agendada' ? 'Agendada' : 'Encerrada'}
                  </Badge>
                  <Button
                    size="sm" variant="ghost" className="h-8 px-2" title="Tirar da programação"
                    onClick={() => run(() => deleteWallpaperSchedule(s.id), 'Tirado da programação')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Computadores conectados" icon={Monitor}>
        {data.devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum computador conectado ainda. Envie o link ao cliente.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', d.online ? 'bg-emerald-500' : 'bg-muted-foreground/40')} title={d.online ? 'Online' : 'Offline'} />
                {d.os === 'mac' ? <Apple className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{d.hostname || 'Sem nome'}{d.os_user && <span className="font-normal text-muted-foreground"> · {d.os_user}</span>}</p>
                  <p className="text-xs text-muted-foreground">Visto {ago(d.last_seen_at)}</p>
                  {d.last_error && (
                    <p className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" />{d.last_error}</p>
                  )}
                </div>
                {d.up_to_date
                  ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />Atualizado</Badge>
                  : data.active_image_id && <Badge variant="outline">Aguardando</Badge>}
                <Button
                  size="sm" variant="ghost" className="h-8 px-2" title="Remover computador"
                  onClick={() => setConfirm({
                    title: `Remover ${d.hostname || 'o computador'}?`,
                    description: <p>O programa sai sozinho desse computador na próxima conferência. Para voltar, é só abrir o link de novo.</p>,
                    confirmLabel: 'Remover',
                    destructive: true,
                    onConfirm: () => run(() => removeWallpaperDevice(d.id), 'Computador removido'),
                  })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ScheduleDialog
        accountId={account.id}
        image={scheduleFor}
        images={data.images}
        onClose={() => setScheduleFor(null)}
        onSaved={() => { setScheduleFor(null); refresh(); }}
      />
      <ConfirmActionDialog action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

export default function Wallpaper() {
  const { activeCity } = useCity();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['wallpaper', 'accounts', activeCity],
    queryFn: fetchWallpaperAccounts,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!accounts) return;
    if (!selected || !accounts.some((a) => a.id === selected)) setSelected(accounts[0]?.id ?? null);
  }, [accounts, selected]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><WallpaperIcon className="h-6 w-6 text-primary" />Wallpaper</h1>
          <p className="text-sm text-muted-foreground">Papel de parede igual em todos os computadores da empresa do cliente, trocado na hora ou agendado.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" />Novo cadastro</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          {!isLoading && accounts?.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum cliente cadastrado ainda.
            </div>
          )}
          {accounts?.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent',
                selected === a.id ? 'border-primary ring-1 ring-primary' : 'border-border',
              )}
            >
              <ClientLogo client={logoProps(a)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.company_name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.online}/{a.devices} online{a.upcoming > 0 ? ` · ${a.upcoming} agendado(s)` : ''}
                </p>
              </div>
            </button>
          ))}
        </aside>

        <main className="min-w-0">
          {selected
            ? <AccountDetail key={selected} id={selected} onDeleted={() => setSelected(null)} />
            : !isLoading && (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Clique em “Novo cadastro”, escolha o cliente e envie o link para ele conectar os computadores.
              </div>
            )}
        </main>
      </div>

      <NewAccountDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (id) => {
          setCreating(false);
          // espera a lista nova: com a antiga, a seleção voltaria para o primeiro cadastro
          await queryClient.invalidateQueries({ queryKey: ['wallpaper'] });
          setSelected(id);
        }}
      />
    </div>
  );
}
