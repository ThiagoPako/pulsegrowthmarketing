// Editor de funil do Pulse Direct (refeito em 02/11/2026: "muito confuso de usar… usabilidade fácil e intuitiva").
// Em cima: como o funil começa (comentário ou direct, palavras e posts). Embaixo: as mensagens em ordem, cada uma com
// o que a pessoa pode fazer depois (botões de link/WhatsApp, botões de resposta, pergunta) e o que acontece no fim.
// Ao lado, o celular com a prévia do direct do Instagram.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronUp, Hand, Heart, Loader2, MessageSquare, MessageSquareReply, Plus, Save, Tag, Trash2, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import InstagramPreview from './InstagramPreview';
import ButtonEditor from './ButtonEditor';
import { FIELD_LABELS, FOLLOW_DEFAULT, newStepId, type Flow, type FlowStep } from './types';

interface Post { id: string; permalink: string; caption: string; thumb: string | null }
const NONE = '__nenhuma__';
const NEW = '__nova__';
const VIOLET = '#7C5CFF';

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
      {children}
    </div>
  );
}

export default function FlowEditor({ clientId, accountName, initial, onSaved, onCancel }: {
  clientId: string; accountName: string; initial: Flow; onSaved: () => void; onCancel: () => void;
}) {
  const [flow, setFlow] = useState<Flow>(initial);
  const [focus, setFocus] = useState<string | null>(initial.steps[0]?.id || null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setFlow(initial); setFocus(initial.steps[0]?.id || null); }, [initial]);
  useEffect(() => {
    if (flow.trigger.type !== 'comment_keyword' || posts) return;
    invokeVpsFunction(`automations/posts/${clientId}`, { method: 'GET', body: { platform: 'instagram' } })
      .then(({ data }) => setPosts(data?.posts || [])).catch(() => setPosts([]));
  }, [flow.trigger.type, clientId, posts]);

  const indexOf = (id: string | null | undefined) => flow.steps.findIndex((s) => s.id === id);
  const setStep = (id: string, patch: Partial<FlowStep>) => setFlow((f) => ({ ...f, steps: f.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const addStep = () => {
    const id = newStepId();
    setFlow((f) => ({ ...f, steps: [...f.steps, { id, text: '', buttons: [], replies: [] }] }));
    setFocus(id);
    return id;
  };
  const target = (value: string, apply: (id: string | null) => void) => {
    if (value === NEW) apply(addStep());
    else apply(value === NONE ? null : value);
  };
  const removeStep = (id: string) => {
    if (flow.steps.length === 1) return;
    setFlow((f) => ({
      ...f,
      steps: f.steps.filter((s) => s.id !== id).map((s) => ({
        ...s, next: s.next === id ? null : s.next,
        replies: s.replies.map((r) => (r.next === id ? { ...r, next: '' } : r)),
        ask: s.ask ? { ...s.ask, next: s.ask.next === id ? null : s.ask.next } : s.ask,
      })),
    }));
  };
  const move = (id: string, dir: -1 | 1) => setFlow((f) => {
    const i = f.steps.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 1 || j < 1 || j >= f.steps.length) return f; // a primeira mensagem fica sempre em primeiro
    const steps = [...f.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    return { ...f, steps };
  });

  const save = async () => {
    setSaving(true);
    try {
      const path = flow.id ? `flows/${clientId}/${flow.id}` : `flows/${clientId}`;
      const { data, error } = await invokeVpsFunction(path, { method: flow.id ? 'PUT' : 'POST', body: flow as unknown as Record<string, unknown> });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não deu para salvar');
      toast.success(flow.active ? 'Funil salvo e ligado' : 'Funil salvo, ainda desligado');
      onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };

  const destOptions = (selfId: string) => (
    <>
      {flow.steps.filter((s) => s.id !== selfId).map((s) => <SelectItem key={s.id} value={s.id}>Mensagem {indexOf(s.id) + 1}: {(s.text || 'sem texto').slice(0, 34)}</SelectItem>)}
      <SelectItem value={NEW}>+ Criar uma mensagem nova</SelectItem>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1" onClick={onCancel}><ArrowLeft size={14} /> Funis</Button>
        <Input className="h-10 max-w-sm text-base font-semibold" value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })} placeholder="Nome do funil" aria-label="Nome do funil" />
        <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
          <Switch checked={flow.active} onCheckedChange={(v) => setFlow({ ...flow, active: v })} /> {flow.active ? 'Ligado' : 'Desligado'}
        </label>
        <div className="flex-1" />
        <Button className="gap-1.5" style={{ background: '#F15A24' }} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar funil</Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* gatilho */}
          <div className="space-y-4 rounded-xl border-2 p-4" style={{ borderColor: `${VIOLET}55` }}>
            <p className="flex items-center gap-2 font-semibold" style={{ color: VIOLET }}><Workflow size={16} /> Quando o funil começa</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['comment_keyword', 'Comentou no post', 'A pessoa comenta e recebe a mensagem no direct'],
                ['dm_keyword', 'Mandou mensagem no direct', 'A pessoa escreve uma palavra no direct'],
                ['story_reply', 'Respondeu o story', 'Stories não aceitam link: peça "manda um oi aqui" e o direct responde com o botão'],
                ['first_message', 'Primeiro contato no direct', 'Boas-vindas para quem fala com o perfil pela primeira vez'],
              ] as const).map(([v, label, help]) => (
                <button key={v} type="button" onClick={() => setFlow({ ...flow, trigger: { ...flow.trigger, type: v } })}
                  className={cn('rounded-lg border-2 p-3 text-left transition-colors', flow.trigger.type === v ? 'bg-[#7C5CFF]/10' : 'border-border hover:border-[#7C5CFF]/40')}
                  style={flow.trigger.type === v ? { borderColor: VIOLET } : undefined}>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground">{help}</p>
                </button>
              ))}
            </div>
            {flow.trigger.type !== 'first_message' && (
            <Section title="Palavras que disparam" help={flow.trigger.type === 'comment_keyword' ? 'Separe por vírgula. Sem palavras, qualquer comentário dispara. Acento, maiúscula e pontuação não importam.' : flow.trigger.type === 'story_reply' ? 'Opcional. Sem palavras, qualquer resposta a qualquer story dispara.' : 'Separe por vírgula. Acento, maiúscula e pontuação não importam.'}>
              <Input value={flow.trigger.keywords.join(', ')} onChange={(e) => setFlow({ ...flow, trigger: { ...flow.trigger, keywords: e.target.value.split(',').map((k) => k.trimStart()) } })} placeholder="EU QUERO, LINK, PREÇO" />
              {flow.trigger.keywords.filter((k) => k.trim()).length > 0 && (
                <div className="flex flex-wrap gap-1">{flow.trigger.keywords.filter((k) => k.trim()).map((k) => <span key={k} className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: VIOLET }}>{k.trim()}</span>)}</div>
              )}
            </Section>
            )}
            {flow.trigger.type === 'first_message' && (
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                O Instagram não avisa nenhuma ferramenta quando alguém começa a seguir. Por isso a boas-vindas vai na primeira mensagem
                que a pessoa manda no direct (inclusive resposta a story, quando não houver funil de story ligado).
              </p>
            )}
            {flow.trigger.type === 'comment_keyword' && (
              <>
                <Section title="Em quais posts" help={flow.trigger.post_ids.length ? `${flow.trigger.post_ids.length} post(s) escolhido(s). Toque de novo para tirar.` : 'Nenhum escolhido: vale para todos os posts.'}>
                  {!posts ? <Loader2 size={14} className="animate-spin" /> : posts.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum post encontrado. O Instagram do cliente está conectado?</p> : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {posts.map((p) => {
                        const on = flow.trigger.post_ids.includes(p.id);
                        return (
                          <button key={p.id} type="button" title={p.caption} aria-pressed={on}
                            onClick={() => setFlow({ ...flow, trigger: { ...flow.trigger, post_ids: on ? flow.trigger.post_ids.filter((x) => x !== p.id) : [...flow.trigger.post_ids, p.id] } })}
                            className={cn('relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-[3px]', on ? '' : 'border-transparent opacity-60 hover:opacity-100')}
                            style={on ? { borderColor: VIOLET } : undefined}>
                            {p.thumb ? <img src={p.thumb} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <div className="h-full w-full bg-muted p-1 text-[9px]">{p.caption}</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Section>
                <div className="space-y-2 rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <Switch checked={!!flow.trigger.followers_only} onCheckedChange={(v) => setFlow({ ...flow, trigger: { ...flow.trigger, followers_only: v, follow_message: flow.trigger.follow_message || FOLLOW_DEFAULT } })} />
                    <Heart size={14} className="text-pink-500" /> Só para seguidores
                  </label>
                  <p className="text-xs text-muted-foreground">Ligado: quem comenta recebe primeiro um pedido para seguir o perfil. O link ou presente só vai quando a pessoa responde "JÁ SIGO" (ou toca no botão "Já sigo ✅").</p>
                  {flow.trigger.followers_only && (
                    <Textarea rows={3} value={flow.trigger.follow_message ?? FOLLOW_DEFAULT} onChange={(e) => setFlow({ ...flow, trigger: { ...flow.trigger, follow_message: e.target.value } })} placeholder={FOLLOW_DEFAULT} aria-label="Mensagem pedindo para seguir" />
                  )}
                </div>
                <Section title="Resposta no comentário" help="Aparece embaixo do comentário, para a pessoa saber que recebeu no direct. Opcional.">
                  <Input value={flow.public_reply || ''} onChange={(e) => setFlow({ ...flow, public_reply: e.target.value })} placeholder="Te mandei no direct! 💌" />
                  <p className="text-[11px] text-muted-foreground">Escreva algumas versões separadas por | (ex.: Te mandei no direct! 💌 | Olha seu direct 😉). O sistema chama a pessoa pelo @ e varia a frase: resposta sempre igual o Instagram trata como spam.</p>
                </Section>
              </>
            )}
          </div>

          {/* mensagens */}
          {flow.steps.map((s, i) => {
            const open = focus === s.id;
            const followMode = s.ask ? 'ask' : s.replies.length ? 'replies' : 'none';
            return (
              <div key={s.id} className={cn('rounded-xl border bg-card transition-shadow', open && 'shadow-md')} style={open ? { borderColor: VIOLET } : undefined}>
                <button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setFocus(open ? null : s.id)}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: VIOLET }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.text || (i === 0 ? 'Primeira mensagem' : 'Mensagem sem texto')}</span>
                    <span className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {s.buttons.length > 0 && <span>{s.buttons.length} botão(ões) de link</span>}
                      {s.replies.length > 0 && <span>{s.replies.length} resposta(s)</span>}
                      {s.ask && <span>pergunta {FIELD_LABELS[s.ask.field].toLowerCase()}</span>}
                      {s.tag && <span className="text-emerald-600">etiqueta {s.tag}</span>}
                      {s.handoff && <span className="text-amber-600">chama a equipe</span>}
                    </span>
                  </span>
                  {i > 1 && <span role="button" tabIndex={0} aria-label="Subir" className="rounded p-1 hover:bg-muted" onClick={(e) => { e.stopPropagation(); move(s.id, -1); }}><ChevronUp size={14} /></span>}
                  {i > 0 && i < flow.steps.length - 1 && <span role="button" tabIndex={0} aria-label="Descer" className="rounded p-1 hover:bg-muted" onClick={(e) => { e.stopPropagation(); move(s.id, 1); }}><ChevronDown size={14} /></span>}
                </button>
                {open && (
                  <div className="space-y-5 border-t p-4">
                    <Section title="Mensagem" help="Use {primeiro_nome} para chamar a pessoa pelo nome.">
                      <Textarea rows={3} value={s.text} onChange={(e) => setStep(s.id, { text: e.target.value })} placeholder="Oi, {primeiro_nome}! 😊" />
                      <div className="flex flex-wrap gap-1">
                        {['{primeiro_nome}', '😊', '👇', '✅', '💛'].map((t) => (
                          <button key={t} type="button" className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted" onClick={() => setStep(s.id, { text: `${s.text}${s.text && !s.text.endsWith(' ') ? ' ' : ''}${t}` })}>{t}</button>
                        ))}
                      </div>
                      <Input value={s.image_url || ''} onChange={(e) => setStep(s.id, { image_url: e.target.value })} placeholder="Imagem antes da mensagem: cole o link https (opcional)" />
                    </Section>

                    <Section title="Botões de link" help="Até 3. O de WhatsApp pede só o número.">
                      <ButtonEditor clientNumber value={s.buttons} onChange={(buttons) => setStep(s.id, { buttons })} />
                    </Section>

                    <Section title="Depois desta mensagem" help="O que a pessoa faz para continuar a conversa.">
                      <div className="grid gap-2 sm:grid-cols-3">
                        {([['none', 'Nada, segue ou termina', MessageSquare], ['replies', 'Escolhe um botão', MessageSquareReply], ['ask', 'Responde uma pergunta', Tag]] as const).map(([v, label, Icon]) => (
                          <button key={v} type="button"
                            onClick={() => setStep(s.id, v === 'replies' ? { ask: null, next: null, replies: s.replies.length ? s.replies : [{ title: '', next: '' }] } : v === 'ask' ? { replies: [], next: null, ask: s.ask || { field: 'telefone', next: null } } : { replies: [], ask: null })}
                            className={cn('flex items-center gap-2 rounded-lg border-2 p-2.5 text-left text-xs font-medium', followMode === v ? 'bg-[#7C5CFF]/10' : 'border-border hover:border-[#7C5CFF]/40')}
                            style={followMode === v ? { borderColor: VIOLET } : undefined}>
                            <Icon size={14} /> {label}
                          </button>
                        ))}
                      </div>
                      {followMode === 'replies' && (
                        <div className="space-y-2">
                          {s.replies.map((r, k) => (
                            <div key={k} className="flex flex-wrap items-center gap-2">
                              <Input className="h-9 w-44" maxLength={20} value={r.title} placeholder="Ex.: Quero saber" onChange={(e) => setStep(s.id, { replies: s.replies.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} />
                              <span className="text-xs text-muted-foreground">leva para</span>
                              <Select value={r.next || NONE} onValueChange={(v) => target(v, (id) => setStep(s.id, { replies: s.replies.map((x, j) => (j === k ? { ...x, next: id || '' } : x)) }))}>
                                <SelectTrigger className="h-9 min-w-0 flex-1"><SelectValue placeholder="Escolha a mensagem" /></SelectTrigger>
                                <SelectContent>{destOptions(s.id)}</SelectContent>
                              </Select>
                              <Button type="button" size="sm" variant="ghost" aria-label="Remover botão" onClick={() => setStep(s.id, { replies: s.replies.filter((_, j) => j !== k) })}><Trash2 size={13} /></Button>
                            </div>
                          ))}
                          {s.replies.length < 13 && <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setStep(s.id, { replies: [...s.replies, { title: '', next: '' }] })}><Plus size={12} /> Botão de resposta</Button>}
                        </div>
                      )}
                      {followMode === 'ask' && s.ask && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Select value={s.ask.field} onValueChange={(v) => setStep(s.id, { ask: { ...s.ask!, field: v as NonNullable<FlowStep['ask']>['field'] } })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(FIELD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>Guardar: {v}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={s.ask.next || NONE} onValueChange={(v) => target(v, (id) => setStep(s.id, { ask: { ...s.ask!, next: id } }))}>
                            <SelectTrigger><SelectValue placeholder="Depois da resposta" /></SelectTrigger>
                            <SelectContent><SelectItem value={NONE}>Termina a conversa</SelectItem>{destOptions(s.id)}</SelectContent>
                          </Select>
                        </div>
                      )}
                      {followMode === 'none' && (
                        <Select value={s.next || NONE} onValueChange={(v) => target(v, (id) => setStep(s.id, { next: id }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value={NONE}>Termina a conversa</SelectItem>{destOptions(s.id)}</SelectContent>
                        </Select>
                      )}
                    </Section>

                    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/40 p-3">
                      <label className="flex items-center gap-2 text-xs"><Tag size={13} className="text-emerald-600" />
                        <Input className="h-8 w-40" value={s.tag || ''} onChange={(e) => setStep(s.id, { tag: e.target.value })} placeholder="Etiqueta no contato" />
                      </label>
                      <label className="flex items-center gap-2 text-xs"><Switch checked={!!s.handoff} onCheckedChange={(v) => setStep(s.id, { handoff: v })} /><Hand size={13} className="text-amber-600" /> Chamar a equipe aqui</label>
                      {flow.steps.length > 1 && <Button type="button" size="sm" variant="ghost" className="ml-auto gap-1 text-destructive" onClick={() => removeStep(s.id)}><Trash2 size={13} /> Apagar mensagem</Button>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <Button variant="outline" className="w-full gap-1.5 border-dashed" onClick={addStep}><Plus size={14} /> Adicionar mensagem</Button>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <p className="mb-2 text-center text-xs text-muted-foreground">Prévia no celular: toque nos botões para seguir o caminho</p>
          <InstagramPreview flow={flow} accountName={accountName} focusStepId={focus} />
        </div>
      </div>
    </div>
  );
}
