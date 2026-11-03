// Editor de funil do Pulse Direct: gatilho, etapas (mensagem, botões de link, botões de resposta que levam a outra
// etapa, pergunta que guarda dado, etiqueta, passar para a equipe) e a prévia do Instagram ao lado.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ExternalLink, Loader2, MessageSquareReply, Plus, Save, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import InstagramPreview from './InstagramPreview';
import { FIELD_LABELS, newStepId, type Flow, type FlowStep } from './types';

interface Post { id: string; permalink: string; caption: string; thumb: string | null }
const NONE = '__nenhuma__';
const NEW = '__nova__';

export default function FlowEditor({ clientId, accountName, initial, onSaved, onCancel }: {
  clientId: string; accountName: string; initial: Flow; onSaved: () => void; onCancel: () => void;
}) {
  const [flow, setFlow] = useState<Flow>(initial);
  const [focus, setFocus] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setFlow(initial); setFocus(null); }, [initial]);
  useEffect(() => {
    if (flow.trigger.type !== 'comment_keyword' || posts) return;
    invokeVpsFunction(`automations/posts/${clientId}`, { method: 'GET', body: { platform: 'instagram' } })
      .then(({ data }) => setPosts(data?.posts || [])).catch(() => setPosts([]));
  }, [flow.trigger.type, clientId, posts]);

  const stepName = (id: string | null | undefined) => {
    const i = flow.steps.findIndex((s) => s.id === id);
    return i < 0 ? '' : `Etapa ${i + 1}`;
  };
  const setStep = (id: string, patch: Partial<FlowStep>) => setFlow((f) => ({ ...f, steps: f.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  /** Escolher "nova etapa" num destino cria a etapa e já liga. */
  const target = (value: string, apply: (id: string | null) => void) => {
    if (value === NEW) {
      const id = newStepId();
      setFlow((f) => ({ ...f, steps: [...f.steps, { id, text: '', buttons: [], replies: [] }] }));
      apply(id);
      setFocus(id);
    } else apply(value === NONE ? null : value);
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

  const save = async () => {
    setSaving(true);
    try {
      const path = flow.id ? `flows/${clientId}/${flow.id}` : `flows/${clientId}`;
      const { data, error } = await invokeVpsFunction(path, { method: flow.id ? 'PUT' : 'POST', body: flow as unknown as Record<string, unknown> });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não deu para salvar');
      toast.success(flow.active ? 'Funil salvo e ligado ⚡' : 'Funil salvo (desligado)');
      onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };

  const destOptions = (selfId: string) => (
    <>
      {flow.steps.filter((s) => s.id !== selfId).map((s) => <SelectItem key={s.id} value={s.id}>{stepName(s.id)} · {(s.text || 'sem texto').slice(0, 30)}</SelectItem>)}
      <SelectItem value={NEW}>+ Nova etapa</SelectItem>
    </>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <Card><CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="max-w-xs font-semibold" value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })} placeholder="Nome do funil" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={flow.active} onCheckedChange={(v) => setFlow({ ...flow, active: v })} /> {flow.active ? 'Ligado' : 'Desligado'}</label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Quando começa</Label>
              <Select value={flow.trigger.type} onValueChange={(v: Flow['trigger']['type']) => setFlow({ ...flow, trigger: { ...flow.trigger, type: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comment_keyword">Alguém comenta no post</SelectItem>
                  <SelectItem value="dm_keyword">Alguém manda mensagem no direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Palavras-chave (separe por vírgula){flow.trigger.type === 'comment_keyword' ? ' · vazio = qualquer comentário' : ''}</Label>
              <Input value={flow.trigger.keywords.join(', ')} onChange={(e) => setFlow({ ...flow, trigger: { ...flow.trigger, keywords: e.target.value.split(',').map((k) => k.trimStart()) } })} placeholder="EU QUERO, LINK, PREÇO" />
            </div>
          </div>
          {flow.trigger.type === 'comment_keyword' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Em quais posts · nenhum marcado = em todos</Label>
                {!posts ? <Loader2 size={14} className="animate-spin" /> : (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {posts.map((p) => {
                      const on = flow.trigger.post_ids.includes(p.id);
                      return (
                        <button key={p.id} type="button" title={p.caption}
                          onClick={() => setFlow({ ...flow, trigger: { ...flow.trigger, post_ids: on ? flow.trigger.post_ids.filter((x) => x !== p.id) : [...flow.trigger.post_ids, p.id] } })}
                          className={cn('relative w-16 shrink-0 overflow-hidden rounded-md border-2', on ? 'border-primary' : 'border-transparent opacity-70')}>
                          {p.thumb ? <img src={p.thumb} alt="" className="h-16 w-16 object-cover" referrerPolicy="no-referrer" /> : <div className="h-16 w-16 bg-muted p-1 text-[8px]">{p.caption}</div>}
                        </button>
                      );
                    })}
                    {posts.length === 0 && <p className="text-xs text-muted-foreground">Sem posts (o Instagram está conectado pela Upload-Post?)</p>}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Resposta pública no comentário (opcional)</Label>
                <Input value={flow.public_reply || ''} onChange={(e) => setFlow({ ...flow, public_reply: e.target.value })} placeholder="Te mandei no direct! 💌" />
              </div>
            </>
          )}
        </CardContent></Card>

        {flow.steps.map((s, i) => (
          <div key={s.id}>
            {i > 0 && <div className="flex justify-center py-1 text-muted-foreground"><ArrowDown size={14} /></div>}
            <Card className={cn(focus === s.id && 'ring-2 ring-primary')} onClick={() => setFocus(s.id)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{stepName(s.id)}{i === 0 ? ' · primeira mensagem' : ''}</p>
                  {flow.steps.length > 1 && <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => removeStep(s.id)}><Trash2 size={13} /></Button>}
                </div>
                <Textarea rows={3} value={s.text} onChange={(e) => setStep(s.id, { text: e.target.value })} placeholder="Mensagem. Use {primeiro_nome} para chamar a pessoa pelo nome." />
                <Input value={s.image_url || ''} onChange={(e) => setStep(s.id, { image_url: e.target.value })} placeholder="Imagem antes da mensagem (link https, opcional)" />

                <div className="space-y-1.5">
                  <p className="flex items-center gap-1 text-xs font-medium"><ExternalLink size={12} /> Botões de link (até 3)</p>
                  {s.buttons.map((b, k) => (
                    <div key={k} className="flex gap-2">
                      <Input className="w-36" maxLength={20} value={b.title} placeholder="Texto do botão" onChange={(e) => setStep(s.id, { buttons: s.buttons.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} />
                      <Input value={b.url} placeholder="https://… ou https://wa.me/55…" onChange={(e) => setStep(s.id, { buttons: s.buttons.map((x, j) => (j === k ? { ...x, url: e.target.value } : x)) })} />
                      <Button size="sm" variant="ghost" onClick={() => setStep(s.id, { buttons: s.buttons.filter((_, j) => j !== k) })}><Trash2 size={13} /></Button>
                    </div>
                  ))}
                  {s.buttons.length < 3 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStep(s.id, { buttons: [...s.buttons, { title: '', url: 'https://' }] })}><Plus size={12} /> Botão de link</Button>}
                </div>

                {!s.ask && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1 text-xs font-medium"><MessageSquareReply size={12} /> Botões de resposta (levam para outra etapa)</p>
                    {s.replies.map((r, k) => (
                      <div key={k} className="flex gap-2">
                        <Input className="w-36" maxLength={20} value={r.title} placeholder="Ex.: Quero saber" onChange={(e) => setStep(s.id, { replies: s.replies.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} />
                        <Select value={r.next || NONE} onValueChange={(v) => target(v, (id) => setStep(s.id, { replies: s.replies.map((x, j) => (j === k ? { ...x, next: id || '' } : x)) }))}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Leva para…" /></SelectTrigger>
                          <SelectContent>{destOptions(s.id)}</SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => setStep(s.id, { replies: s.replies.filter((_, j) => j !== k) })}><Trash2 size={13} /></Button>
                      </div>
                    ))}
                    {s.replies.length < 13 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStep(s.id, { replies: [...s.replies, { title: '', next: '' }], next: null })}><Plus size={12} /> Botão de resposta</Button>}
                  </div>
                )}

                {!s.replies.length && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Pergunta (guarda a resposta no contato)</Label>
                      <Select value={s.ask?.field || NONE} onValueChange={(v) => setStep(s.id, { ask: v === NONE ? null : { field: v as NonNullable<FlowStep['ask']>['field'], next: s.ask?.next || null }, next: null })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sem pergunta</SelectItem>
                          {Object.entries(FIELD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>Perguntar: {v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{s.ask ? 'Depois da resposta, vai para' : 'Seguir direto para'}</Label>
                      <Select value={(s.ask ? s.ask.next : s.next) || NONE}
                        onValueChange={(v) => target(v, (id) => (s.ask ? setStep(s.id, { ask: { ...s.ask, next: id } }) : setStep(s.id, { next: id })))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={NONE}>Termina aqui</SelectItem>{destOptions(s.id)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Input className="w-44" value={s.tag || ''} onChange={(e) => setStep(s.id, { tag: e.target.value })} placeholder="Etiqueta (ex.: lead)" />
                  <label className="flex items-center gap-2 text-xs"><Switch checked={!!s.handoff} onCheckedChange={(v) => setStep(s.id, { handoff: v })} /> <UserRound size={12} /> Passar para a equipe</label>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1" onClick={() => { const id = newStepId(); setFlow((f) => ({ ...f, steps: [...f.steps, { id, text: '', buttons: [], replies: [] }] })); setFocus(id); }}><Plus size={14} /> Etapa</Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button className="gap-1" disabled={saving} onClick={save}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar funil</Button>
        </div>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-center text-xs text-muted-foreground">Prévia · toque nos botões para seguir o caminho</p>
        <InstagramPreview flow={flow} accountName={accountName} focusStepId={focus} />
      </div>
    </div>
  );
}
