/**
 * Módulo Ísis (04/11/2026, pedido do Thiago): a social media da agência dentro do sistema. A equipe manda a demanda
 * escrevendo, gravando a voz ou anexando áudio, PDF e foto; a Ísis responde na hora o que entendeu e a Ísis do PC cria os
 * cards (vídeo, animação, artes no Design) e responde aqui quando estiver pronto. Ao entrar, ela já mostra sugestões em
 * cartões: o que ela deixou para conferir e as datas que vêm por aí.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarHeart, Check, FileText, Image as ImageIcon, Loader2, Mic, Paperclip, Send, Square, X, Lightbulb, AlertTriangle, ClipboardCheck } from 'lucide-react';
import IsisAvatar, { type IsisMood } from '@/components/isis/IsisAvatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { uploadFileToVps } from '@/services/vpsApi';
import { artSuggestions } from '@/lib/artSuggestions';
import { isisFetch, useIsisAccess, type IsisAttachment, type IsisMessage, type IsisSuggestion } from '@/hooks/useIsis';

const GREETINGS = [
  'Oi! Me conta o que a gente vai criar hoje? 💛',
  'Pode mandar: texto, áudio, foto ou PDF. Eu entendo e já organizo tudo.',
  'Precisa de arte, vídeo ou legenda? É só falar comigo!',
  'Bora deixar o feed dos clientes lindo? ✨',
];

const TONE: Record<string, { icon: typeof Lightbulb; cls: string }> = {
  aviso: { icon: AlertTriangle, cls: 'border-amber-300/60 bg-amber-50 dark:bg-amber-950/30' },
  conferir: { icon: ClipboardCheck, cls: 'border-sky-300/60 bg-sky-50 dark:bg-sky-950/30' },
  data: { icon: CalendarHeart, cls: 'border-pink-300/60 bg-pink-50 dark:bg-pink-950/30' },
  ideia: { icon: Lightbulb, cls: 'border-orange-300/60 bg-orange-50 dark:bg-orange-950/30' },
};

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const fmtTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const isImage = (a: IsisAttachment) => /^image\//.test(a.type) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url);
const isAudio = (a: IsisAttachment) => /^audio\//.test(a.type) || /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i.test(a.url);

export default function IsisPage() {
  const { currentUser } = useApp();
  const { user } = useAuth();
  const { access } = useIsisAccess();
  const queryClient = useQueryClient();
  const firstName = (currentUser?.displayName || currentUser?.name || '').trim().split(/\s+/)[0];

  const chat = useQuery({
    queryKey: ['isis-chat', user?.id ?? null],
    enabled: !!user,
    queryFn: () => isisFetch<{ messages: IsisMessage[] }>('/isis/chat'),
    refetchInterval: 8_000,
  });
  const suggestions = useQuery({
    queryKey: ['isis-sugestoes'],
    enabled: !!user,
    queryFn: () => isisFetch<{ items: IsisSuggestion[] }>('/isis/sugestoes'),
    staleTime: 60_000,
  });
  // datas que vêm por aí (feriados e sazonais), as mesmas do Kanban de Design
  const upcoming = useMemo(() => artSuggestions(new Date(), { holidayDays: 31, seasonalDays: 31 }).slice(0, 4), []);

  const [mood, setMood] = useState<IsisMood>('idle');
  const [greeting, setGreeting] = useState(0);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = chat.data?.messages ?? [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);
  useEffect(() => { void queryClient.invalidateQueries({ queryKey: ['isis-access'] }); }, [messages.length, queryClient]);

  const poke = () => {
    setMood('feliz');
    setGreeting((g) => (g + 1) % GREETINGS.length);
    setTimeout(() => setMood('idle'), 1800);
  };

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || 'audio/webm';
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size > 0) setFiles((f) => [...f, new File([blob], `audio-${Date.now()}.${ext}`, { type })]);
        setMood('idle');
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setMood('ouvindo');
    } catch {
      toast.error('Não consegui usar o microfone. Libere o acesso no navegador e tente de novo.');
    }
  }
  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function send(body = text) {
    if (sending) return;
    if (!body.trim() && !files.length) return;
    setSending(true);
    setMood('pensando');
    try {
      const attachments: IsisAttachment[] = [];
      for (const f of files) {
        const url = await uploadFileToVps(f, `isis/${user?.id || 'equipe'}`);
        attachments.push({ url, name: f.name, type: f.type });
      }
      await isisFetch('/isis/chat', { method: 'POST', body: JSON.stringify({ body: body.trim(), attachments }) });
      setText('');
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ['isis-chat'] });
      setMood('falando');
      setTimeout(() => setMood('idle'), 2200);
    } catch (e) {
      toast.error((e as Error).message);
      setMood('idle');
    } finally {
      setSending(false);
    }
  }

  async function dismiss(id: string) {
    try {
      await isisFetch(`/isis/sugestoes/${id}/dispensar`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['isis-sugestoes'] });
    } catch (e) { toast.error((e as Error).message); }
  }

  if (!access && !chat.isLoading && chat.isError) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <IsisAvatar mood="pensando" size={140} className="mx-auto" />
        <p className="text-sm text-muted-foreground">Você ainda não tem acesso à Ísis. Peça ao administrador para liberar na tela Equipe.</p>
      </div>
    );
  }

  const cards = suggestions.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Ísis e as sugestões dela */}
      <section className="space-y-5">
        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-orange-50 via-amber-50 to-pink-50 dark:from-orange-950/30 dark:via-zinc-900 dark:to-pink-950/20 p-5 flex items-end gap-4">
          <button type="button" onClick={poke} className="shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" aria-label="Falar com a Ísis">
            <IsisAvatar mood={mood} size={150} wave />
          </button>
          <div className="pb-4 min-w-0">
            <p className="text-xs font-medium text-orange-700/80 dark:text-orange-300/80">Ísis · social media da Pulse</p>
            <h1 className="text-xl font-semibold tracking-tight">{firstName ? `Oi, ${firstName}!` : 'Oi!'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{GREETINGS[greeting]}</p>
          </div>
        </div>

        <div className="space-y-2.5">
          <h2 className="text-sm font-semibold">O que eu separei para você</h2>
          {cards.length === 0 && upcoming.length === 0 && (
            <p className="text-xs text-muted-foreground">Nada pendente agora. Quando eu achar algo para conferir, aparece aqui.</p>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {cards.map((c) => {
              const tone = TONE[c.tone || 'ideia'] || TONE.ideia;
              const Icon = tone.icon;
              return (
                <article key={c.id} className={`relative rounded-2xl border p-3.5 ${tone.cls}`}>
                  <button type="button" onClick={() => dismiss(c.id)} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-black/5" aria-label="Dispensar">
                    <X size={13} />
                  </button>
                  <div className="flex items-start gap-2 pr-5">
                    <Icon size={15} className="mt-0.5 shrink-0 text-orange-600" />
                    <div className="min-w-0 space-y-1">
                      <p className="text-[13px] font-semibold leading-snug">{c.title}</p>
                      {c.body && <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {c.action && (
                      <Button size="sm" className="h-7 rounded-lg text-xs" disabled={sending} onClick={() => send(c.action!)}>
                        <Check size={12} /> Pode fazer
                      </Button>
                    )}
                    {c.link && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" asChild>
                        <a href={c.link}>Abrir</a>
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
            {upcoming.map((s) => (
              <article key={s.id} className={`rounded-2xl border p-3.5 ${TONE.data.cls}`}>
                <div className="flex items-start gap-2">
                  <CalendarHeart size={15} className="mt-0.5 shrink-0 text-pink-600" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-[13px] font-semibold leading-snug">{s.label} · {fmtDate(s.date)}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {s.daysUntil <= 0 ? 'É hoje.' : `Faltam ${s.daysUntil} dia${s.daysUntil > 1 ? 's' : ''}.`} {s.suggestion}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="mt-2.5 h-7 rounded-lg text-xs" disabled={sending}
                  onClick={() => send(`Ísis, cria as solicitações das artes de "${s.label}" (${fmtDate(s.date)}) para os clientes que combinam, e pede para as designers fazerem.`)}>
                  Pedir as artes
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Conversa */}
      <section className="flex min-h-[560px] flex-col rounded-3xl border bg-card">
        <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[62vh]">
          {chat.isLoading && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
          {!chat.isLoading && messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Mande a primeira demanda: "preciso de 5 artes de story para a Venon até sexta", um áudio explicando o vídeo, ou o PDF da campanha.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.author === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
              {m.author === 'isis' && <IsisAvatar size={34} className="shrink-0 -mb-1 self-end" />}
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${m.author === 'user' ? 'bg-orange-500 text-white rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
                {m.body && <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>}
                {m.transcript && <p className={`mt-1 text-xs italic ${m.author === 'user' ? 'text-white/85' : 'text-muted-foreground'}`}>🎙 "{m.transcript}"</p>}
                {m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => isImage(a) ? (
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="h-20 w-20 rounded-lg object-cover" /></a>
                    ) : isAudio(a) ? (
                      <audio key={a.url} src={a.url} controls className="h-9 max-w-[220px]" />
                    ) : (
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-black/10 px-2 py-1 text-xs"><FileText size={12} /> {a.name}</a>
                    ))}
                  </div>
                )}
                <p className={`mt-1 text-[10px] ${m.author === 'user' ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {fmtTime(m.created_at)}{m.author === 'user' && m.status ? ` · ${{ nova: 'enviada', lida: 'a Ísis viu', fazendo: 'fazendo', feita: 'feita ✓' }[m.status]}` : ''}
                </p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex items-end gap-2"><IsisAvatar size={34} mood="pensando" /><span className="text-xs text-muted-foreground">a Ísis está lendo…</span></div>
          )}
          <div ref={endRef} />
        </div>

        {/* anexos antes de enviar */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t px-4 pt-3">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
                {f.type.startsWith('audio/') ? <Mic size={12} /> : f.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
                <span className="max-w-[140px] truncate">{f.type.startsWith('audio/') ? 'Áudio gravado' : f.name}</span>
                <button type="button" onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} aria-label="Tirar anexo"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}

        <form className="flex items-end gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input ref={fileRef} type="file" multiple className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
          <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-xl" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo">
            <Paperclip size={18} />
          </Button>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            onFocus={() => mood === 'idle' && setMood('ouvindo')}
            onBlur={() => mood === 'ouvindo' && !recording && setMood('idle')}
            rows={1}
            placeholder={recording ? 'Gravando… toque no quadrado para parar' : 'Escreva para a Ísis…'}
            className="min-h-[42px] max-h-40 resize-none rounded-xl"
          />
          <Button type="button" variant={recording ? 'destructive' : 'outline'} size="icon" className="shrink-0 rounded-xl"
            onClick={recording ? stopRecording : startRecording} aria-label={recording ? 'Parar gravação' : 'Gravar a voz'}>
            {recording ? <Square size={16} /> : <Mic size={18} />}
          </Button>
          <Button type="submit" size="icon" className="shrink-0 rounded-xl bg-orange-500 hover:bg-orange-600" disabled={sending || recording || (!text.trim() && !files.length)} aria-label="Enviar">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </form>
      </section>
    </div>
  );
}
