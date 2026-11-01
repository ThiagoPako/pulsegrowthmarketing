import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, BookOpen, Check, ExternalLink, Globe, Loader2, Mic, MicOff, PenLine, RotateCcw, Save, Search, Send, Sparkles, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import ClientLogo from '@/components/ClientLogo';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import type { Client, Script, ScriptContentFormat, ScriptVideoType } from '@/types';
import { SCRIPT_CONTENT_FORMAT_LABELS, SCRIPT_VIDEO_TYPE_LABELS } from '@/types';
import {
  askVictoria, conversationPayload, fetchVictoriaInfo, removeVictoriaLesson, scriptToHtml, useSpeechToText,
  type VictoriaReply, type VictoriaTurn,
} from '@/lib/victoria';

type Step = 'cliente' | 'tipo' | 'conversa' | 'salvar';

const FORMAT_HINTS: Record<ScriptContentFormat, string> = {
  reels: 'Orgânico: dica, retenção, CTA para comentar, seguir ou salvar',
  story: 'Conversa direta e curta, 15 a 60 s',
  criativo: 'Anúncio pago: oferta, prova e "clique no botão"',
};

function VictoriaAvatar({ url, name, size = 'md' }: { url: string | null | undefined; name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';
  return url ? (
    <img src={url} alt="" className={`${cls} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-red-600/20 font-bold text-red-500`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function ReplyCard({ reply, onUse, latest }: { reply: VictoriaReply; onUse: () => void; latest: boolean }) {
  return (
    <div className="space-y-3 rounded-2xl rounded-bl-sm border border-border bg-muted/60 p-3 text-sm">
      {reply.titulo && <p className="font-semibold">{reply.titulo}</p>}
      <p className="whitespace-pre-wrap break-words leading-relaxed">{reply.roteiro}</p>
      {reply.legenda && (
        <div className="rounded-md border border-border bg-background/60 p-2 text-xs">
          <span className="font-semibold">Legenda: </span>{reply.legenda}
        </div>
      )}
      {reply.observacoes && <p className="text-xs text-amber-500">⚠ {reply.observacoes}</p>}
      {reply.referencias.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Globe size={11} /> Referências do nicho</p>
          {reply.referencias.map((ref) => (
            <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-xs hover:underline">
              <ExternalLink size={11} className="mt-0.5 shrink-0" />
              <span><span className="font-medium">{ref.titulo || ref.url}</span>{ref.por_que ? ` · ${ref.por_que}` : ''}</span>
            </a>
          ))}
        </div>
      )}
      {reply.aprendizados.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reply.aprendizados.map((lesson) => (
            <Badge key={lesson.id} variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-500">
              Aprendi{lesson.scope === 'geral' ? ' (geral)' : ''}: {lesson.rule}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>
          Estudou {reply.usados.roteiros_cliente} roteiro(s) do cliente, {reply.usados.roteiros_agencia} da agência
          {reply.usados.regras ? ` e ${reply.usados.regras} regra(s)` : ''}{reply.usados.pesquisou ? ' · pesquisou o nicho' : ''}
        </span>
        {latest && (
          <Button size="sm" className="ml-auto h-7 bg-red-600 text-white hover:bg-red-700" onClick={onUse}>
            <Check size={13} className="mr-1" /> Usar este roteiro
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Victoria, a roteirista (pedido do usuário, 01/11/2026): cliente → tipo → conversa. A pessoa fala a ideia (texto ou
 * voz), a Victoria escreve no padrão da agência, a pessoa corrige e ela refaz; as correções viram regra no servidor.
 * O roteiro final é salvo como roteiro do cliente (scripts), igual aos outros roteiros do Copy.
 */
export default function VictoriaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { clients, addScript } = useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('cliente');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  const [format, setFormat] = useState<ScriptContentFormat>('reels');
  const [videoType, setVideoType] = useState<ScriptVideoType>('vendas');
  const [turns, setTurns] = useState<VictoriaTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [final, setFinal] = useState({ title: '', content: '', caption: '' });
  const listRef = useRef<HTMLDivElement>(null);

  const speech = useSpeechToText((text) => setDraft((prev) => (prev ? `${prev.trimEnd()} ${text}` : text)));

  const info = useQuery({
    queryKey: ['victoria-info', client?.id ?? null],
    queryFn: () => fetchVictoriaInfo(client?.id),
    enabled: open,
    staleTime: 60_000,
  });
  const victoriaName = (info.data?.victoria.name || 'Victoria').split(/\s+/)[0];
  const victoriaAvatar = info.data?.victoria.avatar_url;

  useEffect(() => {
    if (!open) return;
    setStep('cliente');
    setSearch('');
    setClient(null);
    setFormat('reels');
    setVideoType('vendas');
    setTurns([]);
    setDraft('');
    setWebSearch(true);
    setFinal({ title: '', content: '', caption: '' });
  }, [open]);

  const stopSpeech = speech.stop;
  useEffect(() => {
    if (!open) stopSpeech();
  }, [open, stopSpeech]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [turns.length, busy]);

  const activeClients = useMemo(() => {
    const term = search.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return clients
      .filter((c) => c.status !== 'cancelado')
      .filter((c) => !term || c.companyName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(term))
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [clients, search]);

  const lastReply = [...turns].reverse().find((t) => t.role === 'victoria')?.reply;

  const send = async () => {
    const text = draft.trim();
    if (!text || !client || busy) return;
    speech.stop();
    const role = lastReply ? 'correcao' : 'pedido';
    const next: VictoriaTurn[] = [...turns, { role, text }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    try {
      const reply = await askVictoria({
        client_id: client.id,
        content_format: format,
        video_type: videoType,
        conversation: conversationPayload(next),
        search: webSearch,
      });
      setTurns((list) => [...list, { role: 'victoria', text: reply.roteiro, reply }]);
      // a pesquisa do nicho vale para a conversa toda: nas correções fica mais rápido sem ela
      setWebSearch(false);
      if (reply.aprendizados.length) {
        toast.success(`${victoriaName} aprendeu ${reply.aprendizados.length} regra(s) com a sua correção`);
        void queryClient.invalidateQueries({ queryKey: ['victoria-info', client.id] });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      // devolve o texto para a pessoa não perder o que falou
      setTurns((list) => list.slice(0, -1));
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const pickReply = (reply: VictoriaReply) => {
    setFinal({
      title: reply.titulo || `${SCRIPT_CONTENT_FORMAT_LABELS[format]} - ${client?.companyName || ''}`.trim(),
      content: reply.roteiro,
      caption: format === 'story' ? '' : reply.legenda,
    });
    setStep('salvar');
  };

  const save = async () => {
    if (!client || !final.content.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const script: Script = {
        id: crypto.randomUUID(),
        clientId: client.id,
        title: final.title.trim() || `${SCRIPT_CONTENT_FORMAT_LABELS[format]} - ${client.companyName}`,
        videoType,
        contentFormat: format,
        content: scriptToHtml(final.content),
        recorded: false,
        priority: 'normal',
        createdAt: now,
        updatedAt: now,
        isEndomarketing: false,
        caption: final.caption.trim() || undefined,
        createdBy: user?.id,
      };
      if (!(await addScript(script))) return; // o hook já mostrou o erro
      toast.success(`Roteiro salvo em ${client.companyName}`);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const removeLesson = async (id: string) => {
    try {
      await removeVictoriaLesson(id);
      void queryClient.invalidateQueries({ queryKey: ['victoria-info', client?.id ?? null] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const lessons = info.data?.lessons ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy && !saving) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VictoriaAvatar url={victoriaAvatar} name={victoriaName} size="sm" />
            {victoriaName}, roteirista da Pulse
          </DialogTitle>
          <DialogDescription>
            {step === 'cliente' && 'Para qual cliente é o roteiro?'}
            {step === 'tipo' && client && `${client.companyName}: que tipo de conteúdo?`}
            {step === 'conversa' && client && `${client.companyName} · ${SCRIPT_CONTENT_FORMAT_LABELS[format]} · ${SCRIPT_VIDEO_TYPE_LABELS[videoType]}`}
            {step === 'salvar' && 'Confira e salve o roteiro no cliente.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'cliente' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" className="pl-8" aria-label="Buscar cliente" />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {activeClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setClient(c); setStep('tipo'); }}
                  className="flex items-center gap-2 rounded-lg border border-border p-2 text-left text-sm transition hover:border-red-500/50"
                >
                  <ClientLogo client={c} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.companyName}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{c.niche || 'sem nicho cadastrado'}</span>
                  </span>
                </button>
              ))}
              {activeClients.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground sm:col-span-2">Nenhum cliente encontrado.</p>}
            </div>
          </div>
        )}

        {step === 'tipo' && client && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="rounded-lg border border-border p-3 text-xs">
              <div className="flex items-center gap-2">
                <ClientLogo client={client} size="sm" />
                <span className="font-semibold">{client.companyName}</span>
                <span className="text-muted-foreground">· {client.niche || 'sem nicho'}</span>
              </div>
              {info.data?.client?.editorial ? (
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-muted-foreground"><strong>Editorial:</strong> {info.data.client.editorial}</p>
              ) : (
                <p className="mt-2 text-amber-500">⚠ Sem linha editorial cadastrada: a {victoriaName} segue o nicho e os roteiros já feitos.</p>
              )}
              {info.data?.scripts && (
                <p className="mt-1 text-muted-foreground">
                  {info.data.scripts.total} roteiro(s) no sistema ({info.data.scripts.recorded} gravado(s)) · {lessons.length} regra(s) aprendida(s)
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(Object.keys(SCRIPT_CONTENT_FORMAT_LABELS) as ScriptContentFormat[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormat(value)}
                    aria-pressed={format === value}
                    className={`rounded-lg border p-3 text-left transition ${format === value ? 'border-red-500 bg-red-600/10' : 'border-border hover:border-red-500/40'}`}
                  >
                    <span className="block font-semibold">{SCRIPT_CONTENT_FORMAT_LABELS[value]}</span>
                    <span className="block text-[11px] text-muted-foreground">{FORMAT_HINTS[value]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Objetivo do vídeo</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SCRIPT_VIDEO_TYPE_LABELS) as ScriptVideoType[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVideoType(value)}
                    aria-pressed={videoType === value}
                    className={`rounded-full border px-3 py-1 text-xs transition ${videoType === value ? 'border-red-500 bg-red-600/10' : 'border-border hover:border-red-500/40'}`}
                  >
                    {SCRIPT_VIDEO_TYPE_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('cliente')}><ArrowLeft size={14} className="mr-1" /> Cliente</Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => setStep('conversa')}>
                <PenLine size={14} className="mr-1" /> Abrir a {victoriaName}
              </Button>
            </div>
          </div>
        )}

        {step === 'conversa' && client && (
          <>
            <div ref={listRef} className="min-h-[220px] flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-background/40 p-3">
              <div className="flex gap-2">
                <VictoriaAvatar url={victoriaAvatar} name={victoriaName} />
                <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                  Oi! Sou a {victoriaName}. Já conheço o nicho e o editorial da {client.companyName} e os roteiros que vocês já gravaram.
                  Me conta a ideia do {SCRIPT_CONTENT_FORMAT_LABELS[format].toLowerCase()} (pode falar no microfone) que eu escrevo no padrão da agência.
                </div>
              </div>
              {turns.map((turn, index) => (
                turn.role === 'victoria' && turn.reply ? (
                  <div key={index} className="flex gap-2">
                    <VictoriaAvatar url={victoriaAvatar} name={victoriaName} />
                    <div className="min-w-0 flex-1">
                      <ReplyCard reply={turn.reply} latest={turn.reply === lastReply} onUse={() => pickReply(turn.reply as VictoriaReply)} />
                    </div>
                  </div>
                ) : (
                  <div key={index} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-red-600/15 px-3 py-2 text-sm">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {turn.role === 'correcao' ? 'Correção' : 'Ideia'}
                      </span>
                      <p className="whitespace-pre-wrap break-words">{turn.text}</p>
                    </div>
                  </div>
                )
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  {victoriaName} está escrevendo{webSearch && !lastReply ? ' e pesquisando o que está em alta no nicho' : ''}…
                </div>
              )}
            </div>

            {lessons.length > 0 && (
              <details className="rounded-lg border border-border px-3 py-2 text-xs">
                <summary className="flex cursor-pointer items-center gap-1 font-medium"><BookOpen size={12} /> O que a {victoriaName} já aprendeu ({lessons.length})</summary>
                <ul className="mt-2 space-y-1">
                  {lessons.map((lesson) => (
                    <li key={lesson.id} className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0 text-[10px]">{lesson.scope === 'geral' ? 'Geral' : 'Cliente'}</Badge>
                      <span className="flex-1">{lesson.rule}</span>
                      <button type="button" aria-label="Tirar esta regra" title="Tirar esta regra" onClick={() => void removeLesson(lesson.id)}>
                        <X size={12} className="text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="space-y-2">
              {(speech.listening || speech.interim) && (
                <p className="text-xs text-red-500">🎙 Ouvindo… {speech.interim}</p>
              )}
              {speech.error && <p className="text-xs text-amber-500">{speech.error}</p>}
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); }
                }}
                rows={3}
                disabled={busy}
                placeholder={lastReply ? 'O que mudar? Ex.: "o gancho está fraco, começa pela dor de quem…"' : 'A ideia do vídeo. Ex.: "promoção de troca de óleo na sexta, falar do brinde…"'}
                aria-label={lastReply ? 'Correção para a Victoria' : 'Ideia do roteiro'}
              />
              <div className="flex flex-wrap items-center gap-2">
                {speech.supported && (
                  <Button
                    type="button"
                    variant={speech.listening ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={() => (speech.listening ? speech.stop() : speech.start())}
                    disabled={busy}
                    aria-label={speech.listening ? 'Parar o ditado' : 'Falar a ideia'}
                  >
                    {speech.listening ? <MicOff size={14} className="mr-1" /> : <Mic size={14} className="mr-1" />}
                    {speech.listening ? 'Parar' : 'Falar'}
                  </Button>
                )}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={webSearch} onCheckedChange={setWebSearch} disabled={busy} className="scale-75" aria-label="Pesquisar referências do nicho na web" />
                  <Globe size={12} /> Pesquisar o nicho na web
                </label>
                {turns.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setTurns([]); setWebSearch(true); }}>
                    <RotateCcw size={13} className="mr-1" /> Recomeçar
                  </Button>
                )}
                <Button type="button" size="sm" className="ml-auto bg-red-600 text-white hover:bg-red-700" onClick={() => void send()} disabled={busy || !draft.trim()}>
                  {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : lastReply ? <Sparkles size={14} className="mr-1" /> : <Send size={14} className="mr-1" />}
                  {lastReply ? 'Refazer com a correção' : 'Escrever roteiro'}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'salvar' && client && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="victoria-title">Título</Label>
              <Input id="victoria-title" value={final.title} onChange={(e) => setFinal((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="victoria-content">Roteiro</Label>
              <Textarea id="victoria-content" rows={12} value={final.content} onChange={(e) => setFinal((f) => ({ ...f, content: e.target.value }))} />
            </div>
            {format !== 'story' && (
              <div className="space-y-1.5">
                <Label htmlFor="victoria-caption">Legenda</Label>
                <Textarea id="victoria-caption" rows={3} value={final.caption} onChange={(e) => setFinal((f) => ({ ...f, caption: e.target.value }))} />
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('conversa')} disabled={saving}><ArrowLeft size={14} className="mr-1" /> Voltar à conversa</Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => void save()} disabled={saving || !final.content.trim()}>
                {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
                Salvar roteiro
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
