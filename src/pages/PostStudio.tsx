import { useCallback, useEffect, useMemo, useState } from 'react';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import {
  createScheduledPost, fetchScheduledPosts, cancelScheduledPost, publishScheduledPostNow,
  fetchClientMediaLibrary, SCHEDULED_POST_STATUS_LABELS,
  type ClientMediaAsset, type ConnectedSocialAccount, type PostMediaItem, type ScheduledPost,
  type SocialPlatformTarget, type SocialPublishType,
} from '@/services/socialPostsApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InstagramPreview } from '@/components/social/InstagramPreview';
import { MediaLibraryPicker } from '@/components/social/MediaLibraryPicker';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Images, Loader2, Plus, Trash2, ArrowUp, ArrowDown, CalendarClock, Zap, AlertTriangle, Link2, X,
  LayoutGrid, Square, Clapperboard, CircleDashed, FolderOpen, Link as LinkIcon,
} from 'lucide-react';

interface ClientConnection {
  id: string;
  name: string;
  city: string | null;
  accounts: ConnectedSocialAccount[];
}

const TYPE_OPTIONS: { value: SocialPublishType; label: string; hint: string; icon: typeof Square }[] = [
  { value: 'carousel', label: 'Carrossel', hint: '2 a 10 imagens ou vídeos no mesmo post', icon: LayoutGrid },
  { value: 'feed', label: 'Publicação', hint: 'Uma imagem no feed', icon: Square },
  { value: 'reels', label: 'Reels', hint: 'Um vídeo vertical', icon: Clapperboard },
  { value: 'stories', label: 'Story', hint: 'Some em 24h, aceita link', icon: CircleDashed },
];

const emptyItem = (): PostMediaItem => ({ url: '', label: '' });
const IS_VIDEO = /\.(mp4|mov|webm|m4v)(\?|$)/i;

export default function PostStudio() {
  const [clients, setClients] = useState<ClientConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState('');
  const [platform, setPlatform] = useState<SocialPlatformTarget>('instagram');
  const [publishType, setPublishType] = useState<SocialPublishType>('carousel');
  const [items, setItems] = useState<PostMediaItem[]>([emptyItem(), emptyItem()]);
  const [caption, setCaption] = useState('');
  const [storyLink, setStoryLink] = useState('');
  const [storyLinkText, setStoryLinkText] = useState('Saiba mais');
  const [scheduledAt, setScheduledAt] = useState('');
  const [bulk, setBulk] = useState('');
  const [saving, setSaving] = useState(false);
  const [queue, setQueue] = useState<ScheduledPost[]>([]);
  const [assets, setAssets] = useState<ClientMediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const loadClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeVpsFunction('social-posts/accounts-overview', { method: 'GET' });
      if (error) throw new Error(error.message);
      const list = (data?.clients ?? []) as ClientConnection[];
      setClients(list.filter(c => c.accounts.length > 0));
    } catch (err) {
      toast.error('Erro ao carregar clientes conectados: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await fetchScheduledPosts(clientId ? { client_id: clientId } : undefined));
    } catch { /* fila é secundária */ }
  }, [clientId]);

  const loadAssets = useCallback(async () => {
    if (!clientId) { setAssets([]); return; }
    setAssetsLoading(true);
    try {
      setAssets(await fetchClientMediaLibrary(clientId));
    } catch (err) {
      toast.error('Erro ao carregar a biblioteca do cliente: ' + (err as Error).message);
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => { loadAssets(); }, [loadAssets]);

  const client = clients.find(c => c.id === clientId) || null;
  const hasIg = !!client?.accounts.some(a => a.platform === 'instagram' && a.has_token);
  const hasFb = !!client?.accounts.some(a => a.platform === 'facebook' && a.has_token);
  const accountName = client?.accounts.find(a => a.platform === (platform === 'facebook' ? 'facebook' : 'instagram'))?.account_name
    || client?.accounts[0]?.account_name
    || '';

  useEffect(() => {
    if (platform === 'instagram' && !hasIg && hasFb) setPlatform('facebook');
    if (platform === 'facebook' && !hasFb && hasIg) setPlatform('instagram');
  }, [hasIg, hasFb, platform]);

  const maxItems = publishType === 'carousel' ? 10 : 1;
  const visibleItems = useMemo(() => items.slice(0, maxItems), [items, maxItems]);
  const filledItems = visibleItems.filter(i => i.url.trim());
  const selectedUrls = filledItems.map(i => i.url.trim());

  const updateItem = (i: number, patch: Partial<PostMediaItem>) =>
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems(prev => (prev.length <= 1 ? [emptyItem()] : prev.filter((_, idx) => idx !== i)));
  const moveItem = (i: number, dir: -1 | 1) =>
    setItems(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  /** Clique na galeria: adiciona no fim ou remove se já estiver escolhida. */
  const toggleAsset = (asset: ClientMediaAsset) => {
    const url = asset.url.trim();
    setItems(prev => {
      const current = prev.filter(i => i.url.trim());
      const already = current.some(i => i.url.trim() === url);
      if (already) {
        const next = current.filter(i => i.url.trim() !== url);
        return next.length ? next : [emptyItem()];
      }
      if (current.length >= maxItems) {
        if (maxItems === 1) return [{ url, label: asset.title }];
        toast.error(`Máximo de ${maxItems} mídias neste formato.`);
        return prev;
      }
      return [...current, { url, label: asset.title }];
    });
  };

  const applyBulk = () => {
    const urls = bulk.split(/[\n,\s]+/).map(u => u.trim()).filter(u => /^https?:\/\//i.test(u));
    if (!urls.length) { toast.error('Nenhum link válido encontrado.'); return; }
    setItems(urls.slice(0, maxItems).map(url => ({ url, label: '' })));
    setBulk('');
    toast.success(`${Math.min(urls.length, maxItems)} mídia(s) adicionada(s) na ordem colada.`);
  };

  const reset = () => {
    setItems([emptyItem(), emptyItem()]);
    setCaption('');
    setStoryLink('');
    setScheduledAt('');
  };

  const submit = async (now: boolean) => {
    if (!clientId) { toast.error('Escolha o cliente.'); return; }
    if (!filledItems.length) { toast.error('Adicione pelo menos uma mídia.'); return; }
    if (publishType === 'carousel' && filledItems.length < 2) { toast.error('Carrossel precisa de pelo menos 2 mídias.'); return; }
    const when = now ? new Date(Date.now() + 30_000) : new Date(scheduledAt);
    if (!now && (!scheduledAt || Number.isNaN(when.getTime()))) { toast.error('Escolha a data e a hora da postagem.'); return; }

    setSaving(true);
    try {
      const post = await createScheduledPost({
        client_id: clientId,
        platform,
        publish_type: publishType,
        media_items: filledItems.map(i => ({ url: i.url.trim(), label: i.label?.trim() || undefined })),
        caption: publishType === 'stories' ? '' : caption,
        story_link: publishType === 'stories' ? storyLink.trim() || null : null,
        story_link_text: publishType === 'stories' ? storyLinkText.trim() || null : null,
        scheduled_at: when.toISOString(),
      });
      if (now) {
        await publishScheduledPostNow(post.id);
        toast.success('Publicado no perfil do cliente.');
      } else {
        toast.success('Postagem agendada.');
      }
      reset();
      loadQueue();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary"><Images size={18} /></span>
          Estúdio de Postagem
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o cliente, selecione as artes e vídeos que já estão no sistema e veja a prévia igual ao Instagram antes de publicar.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando clientes conectados…</p>
      ) : clients.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground flex items-start gap-2">
          <AlertTriangle size={16} className="text-warning mt-0.5" />
          Nenhum cliente com Instagram ou Facebook conectado. Conecte em <strong>Conexões Sociais</strong>.
        </CardContent></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ─── Formulário ─── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">1. Cliente e formato</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Cliente</Label>
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger><SelectValue placeholder="Escolher cliente" /></SelectTrigger>
                      <SelectContent>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Onde publicar</Label>
                    <Select value={platform} onValueChange={v => setPlatform(v as SocialPlatformTarget)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {hasIg && <SelectItem value="instagram">Instagram</SelectItem>}
                        {hasFb && <SelectItem value="facebook">Facebook</SelectItem>}
                        {hasIg && hasFb && <SelectItem value="both">Instagram + Facebook</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Formato</Label>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TYPE_OPTIONS.map(o => {
                      const Icon = o.icon;
                      const active = publishType === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setPublishType(o.value)}
                          aria-pressed={active}
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-xl border p-3 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                          )}
                        >
                          <Icon size={18} />
                          <span className="font-medium">{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{TYPE_OPTIONS.find(o => o.value === publishType)?.hint}</p>
                </div>

                {client && (
                  <div className="flex flex-wrap gap-1.5">
                    {client.accounts.map(a => (
                      <Badge key={a.id} variant="secondary" className="text-xs font-normal">
                        {a.platform === 'instagram' ? '@' : 'fb: '}{a.account_name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  2. Mídias{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({filledItems.length}/{maxItems} selecionada{filledItems.length === 1 ? '' : 's'})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="upload">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="upload" className="text-xs"><UploadCloud size={13} className="mr-1" /> Enviar arquivo</TabsTrigger>
                    <TabsTrigger value="library" className="text-xs"><FolderOpen size={13} className="mr-1" /> Biblioteca do cliente</TabsTrigger>
                    <TabsTrigger value="links" className="text-xs"><LinkIcon size={13} className="mr-1" /> Colar links</TabsTrigger>
                  </TabsList>

                  <TabsContent value="upload" className="mt-3">
                    <PostMediaDropzone remaining={maxItems - filledItems.length} onUploaded={addUploaded} />
                  </TabsContent>


                  <TabsContent value="library" className="mt-3">
                    {!clientId ? (
                      <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                        Escolha o cliente acima para ver as artes e vídeos já cadastrados.
                      </p>
                    ) : (
                      <MediaLibraryPicker
                        assets={assets}
                        loading={assetsLoading}
                        selectedUrls={selectedUrls}
                        onToggle={toggleAsset}
                        onRefresh={loadAssets}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="links" className="mt-3 space-y-3">
                    {visibleItems.map((item, i) => (
                      <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                          <Input
                            value={item.url}
                            onChange={e => updateItem(i, { url: e.target.value })}
                            placeholder="https://… link direto da imagem ou vídeo"
                            inputMode="url"
                          />
                          <Button type="button" variant="ghost" size="icon" aria-label="Remover mídia" onClick={() => removeItem(i)}><Trash2 size={14} className="text-destructive" /></Button>
                        </div>
                      </div>
                    ))}
                    {publishType === 'carousel' && visibleItems.length < 10 && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setItems(prev => [...prev, emptyItem()])}>
                        <Plus size={14} className="mr-1" /> Adicionar campo
                      </Button>
                    )}
                    {publishType === 'carousel' && (
                      <div className="rounded-lg bg-muted/50 p-2.5 space-y-2">
                        <Label className="text-xs">Colar vários links de uma vez</Label>
                        <Textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={3} placeholder="Um link por linha, na ordem do carrossel" className="text-xs" />
                        <Button type="button" size="sm" variant="secondary" onClick={applyBulk}>Montar carrossel com esses links</Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {filledItems.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-border pt-3">
                    <Label className="text-xs">Ordem da postagem</Label>
                    {visibleItems.map((item, i) => item.url.trim() && (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                          {IS_VIDEO.test(item.url)
                            ? <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                            : <img src={item.url} alt={`Mídia ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />}
                        </div>
                        <Input
                          value={item.label || ''}
                          onChange={e => updateItem(i, { label: e.target.value })}
                          placeholder="Apelido interno (opcional)"
                          className="h-8 text-xs"
                        />
                        {publishType === 'carousel' && (
                          <>
                            <Button type="button" variant="ghost" size="icon" aria-label="Subir mídia" onClick={() => moveItem(i, -1)} disabled={i === 0}><ArrowUp size={14} /></Button>
                            <Button type="button" variant="ghost" size="icon" aria-label="Descer mídia" onClick={() => moveItem(i, 1)} disabled={i === visibleItems.length - 1}><ArrowDown size={14} /></Button>
                          </>
                        )}
                        <Button type="button" variant="ghost" size="icon" aria-label="Remover mídia" onClick={() => removeItem(i)}><Trash2 size={14} className="text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">3. Legenda, link e horário</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {publishType === 'stories' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Link2 size={12} /> Link do story</Label>
                      <Input value={storyLink} onChange={e => setStoryLink(e.target.value)} placeholder="https://…" inputMode="url" />
                    </div>
                    <div>
                      <Label className="text-xs">Texto do botão</Label>
                      <Input value={storyLinkText} onChange={e => setStoryLinkText(e.target.value)} placeholder="Saiba mais" />
                    </div>
                    <p className="text-[11px] text-muted-foreground sm:col-span-2">
                      O link só aparece se a conta do cliente tiver permissão de link liberada pela Meta. Se ela recusar, o story é publicado mesmo assim, sem o link.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Legenda</Label>
                      <span className={caption.length > 2200 ? 'text-[11px] text-destructive' : 'text-[11px] text-muted-foreground'}>{caption.length}/2200</span>
                    </div>
                    <Textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5} placeholder="Legenda com hashtags…" />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><CalendarClock size={12} /> Data e hora</Label>
                    <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button className="flex-1" onClick={() => submit(false)} disabled={saving}>
                      {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CalendarClock size={14} className="mr-1" />} Agendar
                    </Button>
                    <Button variant="secondary" onClick={() => submit(true)} disabled={saving}>
                      <Zap size={14} className="mr-1" /> Publicar agora
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Prévia + fila ─── */}
          <div className="space-y-4">
            <Card className="lg:sticky lg:top-4">
              <CardHeader className="pb-3"><CardTitle className="text-base">Prévia da postagem</CardTitle></CardHeader>
              <CardContent>
                <InstagramPreview
                  accountName={accountName}
                  publishType={publishType}
                  items={filledItems}
                  caption={caption}
                  storyLink={storyLink}
                  storyLinkText={storyLinkText}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Fila {client ? `de ${client.name}` : 'de postagens'}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {queue.length === 0 && <p className="text-xs text-muted-foreground">Nada na fila.</p>}
                {queue.slice(0, 12).map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.client_name || 'Cliente'} · {p.publish_type === 'carousel' ? 'Carrossel' : p.publish_type}</p>
                      <p className="text-muted-foreground">{new Date(p.scheduled_at).toLocaleString('pt-BR')}</p>
                      {p.last_error && <p className="text-destructive truncate">{p.last_error}</p>}
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{SCHEDULED_POST_STATUS_LABELS[p.status] || p.status}</Badge>
                    {(p.status === 'agendado' || p.status === 'erro') && (
                      <Button
                        variant="ghost" size="icon" aria-label="Cancelar postagem"
                        onClick={async () => { await cancelScheduledPost(p.id).catch(e => toast.error((e as Error).message)); loadQueue(); }}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
