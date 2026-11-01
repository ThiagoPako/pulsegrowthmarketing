import { useCallback, useEffect, useMemo, useState } from 'react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle, MessagesSquare, Loader2, Pencil, Plug, PlugZap, Plus, QrCode, Send, Smartphone, Trash2, Unplug } from 'lucide-react';

interface Connection {
  id: string;
  name: string;
  purposes: string[];
  desired: string;
  status: string;
  qr_image: string | null;
  pairing_code: string | null;
  phone: string | null;
  push_name: string | null;
  last_error: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
}

interface QueueRow {
  purpose: string;
  waiting: string;
  sent_24h: string;
  failed_24h: string;
}

const STATUS: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  conectada: { label: 'Conectada', tone: 'default' },
  qr: { label: 'Aguardando leitura do QR', tone: 'outline' },
  codigo: { label: 'Aguardando o código', tone: 'outline' },
  conectando: { label: 'Conectando…', tone: 'outline' },
  reconectando: { label: 'Reconectando…', tone: 'outline' },
  desligada: { label: 'Desligada', tone: 'secondary' },
  desconectada: { label: 'Desconectada', tone: 'secondary' },
  nova: { label: 'Nunca conectada', tone: 'secondary' },
  erro: { label: 'Erro', tone: 'destructive' },
};

const WAITING = ['conectando', 'reconectando', 'qr', 'codigo'];

function formatPhone(phone: string | null) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}`;
  return `+${d}`;
}

type EditState = { mode: 'new' } | { mode: 'edit'; connection: Connection } | null;

/**
 * Conexões do WhatsApp próprio (Baileys, processo pulse-wa na VPS). Cada número tem as funções que ele envia
 * (aprovação, agenda, cobrança…); o sistema escolhe a conexão certa para cada mensagem, e "geral" cobre o resto.
 */
export default function WhatsAppConnections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [purposes, setPurposes] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [engineAlive, setEngineAlive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>(null);
  const [form, setForm] = useState<{ name: string; purposes: string[] }>({ name: '', purposes: [] });
  const [connectFor, setConnectFor] = useState<Connection | null>(null);
  const [pairPhone, setPairPhone] = useState('');
  const [testFor, setTestFor] = useState<Connection | null>(null);
  const [testNumber, setTestNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await vpsAuthedFetch(path, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Falha na operação');
    return body;
  }, []);

  const load = useCallback(async () => {
    const body = await api('/whatsapp/connections');
    setConnections(body.connections || []);
    setPurposes(body.purposes || {});
    setQueue(body.queue || []);
    setEngineAlive(!!body.engine_alive);
  }, [api]);

  useEffect(() => {
    load().catch((error) => toast.error(error.message)).finally(() => setLoading(false));
  }, [load]);

  // enquanto alguma conexão está conectando/mostrando QR, atualiza a cada 3 s; senão a cada 15 s
  const anyWaiting = connections.some((c) => WAITING.includes(c.status));
  useEffect(() => {
    const timer = window.setInterval(() => load().catch(() => {}), anyWaiting ? 3000 : 15000);
    return () => window.clearInterval(timer);
  }, [anyWaiting, load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const openNew = () => {
    const used = new Set(connections.flatMap((c) => c.purposes));
    // "assistente" é o número do PULSE: nunca vem marcada sozinha numa conexão nova (tem botão próprio)
    setForm({ name: '', purposes: Object.keys(purposes).filter((p) => !used.has(p) && p !== 'assistente') });
    setEdit({ mode: 'new' });
  };
  const openEdit = (connection: Connection) => {
    setForm({ name: connection.name, purposes: connection.purposes });
    setEdit({ mode: 'edit', connection });
  };
  const saveEdit = () => run(async () => {
    if (!edit) return;
    if (edit.mode === 'new') {
      await api('/whatsapp/connections', { method: 'POST', body: JSON.stringify(form) });
    } else {
      await api(`/whatsapp/connections/${edit.connection.id}`, { method: 'PATCH', body: JSON.stringify(form) });
    }
    setEdit(null);
  }, edit?.mode === 'new' ? 'Conexão criada. Agora clique em Conectar.' : 'Funções atualizadas');

  const connect = (connection: Connection, byCode: boolean) => run(async () => {
    await api(`/whatsapp/connections/${connection.id}/connect`, {
      method: 'POST',
      body: JSON.stringify(byCode ? { pair_phone: pairPhone } : {}),
    });
    setConnectFor(null);
    setPairPhone('');
  });

  const coverage = useMemo(() => {
    const out: Record<string, Connection[]> = {};
    for (const key of Object.keys(purposes)) out[key] = connections.filter((c) => c.purposes.includes(key));
    return out;
  }, [connections, purposes]);
  const hasGeneral = coverage.geral?.length > 0;
  const queueByPurpose = Object.fromEntries(queue.map((q) => [q.purpose, q]));

  if (loading) return <p className="text-center text-muted-foreground py-8">Carregando conexões…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
          <div className="flex-1 min-w-[220px]">
            <CardTitle className="text-base flex items-center gap-2"><Smartphone size={16} /> Conexões do WhatsApp</CardTitle>
            <CardDescription className="text-[11px]">
              Cada número envia as mensagens das funções marcadas nele. O que não tiver número próprio sai pelo que tem "geral".
            </CardDescription>
          </div>
          <Badge variant={engineAlive ? 'default' : 'destructive'}>
            {engineAlive ? 'Serviço do WhatsApp no ar' : 'Serviço do WhatsApp fora do ar'}
          </Badge>
          <Button size="sm" onClick={openNew} disabled={busy}><Plus size={14} className="mr-1" /> Nova conexão</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!engineAlive && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                O processo do WhatsApp (pulse-wa) não está respondendo na VPS. As mensagens ficam na fila e saem quando ele voltar.
              </AlertDescription>
            </Alert>
          )}
          {connections.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma conexão ainda. Crie uma e conecte um número lendo o QR Code no celular.</p>
          )}
          {connections.map((c) => {
            const status = STATUS[c.status] || { label: c.status, tone: 'outline' as const };
            const connected = c.status === 'conectada';
            const waiting = WAITING.includes(c.status);
            return (
              <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.purposes.includes('assistente') && (
                    <Badge className="bg-primary/15 text-primary hover:bg-primary/15 border-primary/30"><MessagesSquare size={11} className="mr-1" />PULSE · assistente</Badge>
                  )}
                  <Badge variant={status.tone}>{waiting && <Loader2 size={11} className="mr-1 animate-spin" />}{status.label}</Badge>
                  {c.phone && <span className="text-xs text-muted-foreground">{formatPhone(c.phone)}{c.push_name ? ` · ${c.push_name}` : ''}</span>}
                  <div className="ml-auto flex flex-wrap gap-1">
                    {!connected && !waiting && (
                      <Button size="sm" variant="outline" onClick={() => { setPairPhone(''); setConnectFor(c); }} disabled={busy}>
                        <PlugZap size={14} className="mr-1" /> Conectar
                      </Button>
                    )}
                    {connected && (
                      <Button size="sm" variant="ghost" onClick={() => { setTestNumber(''); setTestFor(c); }} disabled={busy}>
                        <Send size={14} className="mr-1" /> Testar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)} disabled={busy} title="Editar funções">
                      <Pencil size={14} />
                    </Button>
                    {(connected || waiting) && (
                      <Button size="sm" variant="ghost" onClick={() => run(() => api(`/whatsapp/connections/${c.id}/disconnect`, { method: 'POST' }), 'Conexão desligada')} disabled={busy} title="Desligar (religa sem novo QR)">
                        <Unplug size={14} />
                      </Button>
                    )}
                    {c.phone && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (window.confirm(`Sair do WhatsApp em "${c.name}"? Para usar de novo será preciso ler o QR.`)) {
                          run(() => api(`/whatsapp/connections/${c.id}/logout`, { method: 'POST' }), 'Saiu do WhatsApp');
                        }
                      }} disabled={busy} title="Sair do WhatsApp">
                        <Plug size={14} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                      if (window.confirm(`Apagar a conexão "${c.name}"? Ela sai do WhatsApp e as funções dela passam para "geral".`)) {
                        run(() => api(`/whatsapp/connections/${c.id}`, { method: 'DELETE' }), 'Conexão apagada');
                      }
                    }} disabled={busy} title="Apagar">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.purposes.length === 0
                    ? <span className="text-xs text-muted-foreground">Sem funções: só envia testes.</span>
                    : c.purposes.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{purposes[p]?.split(' (')[0] || p}</Badge>)}
                </div>
                {c.status === 'qr' && c.qr_image && (
                  <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted/40 p-3">
                    <img src={c.qr_image} alt="QR Code do WhatsApp" className="h-48 w-48 rounded bg-white p-1" />
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                      <li>No celular deste número, abra o WhatsApp.</li>
                      <li>Toque em <strong>⋮ / Configurações → Aparelhos conectados → Conectar aparelho</strong>.</li>
                      <li>Aponte a câmera para este QR. Ele se renova sozinho; vale por 3 minutos.</li>
                    </ol>
                  </div>
                )}
                {c.status === 'codigo' && c.pairing_code && (
                  <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                    <p>No celular: <strong>Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</strong>, e digite:</p>
                    <p className="font-mono text-2xl tracking-widest text-foreground">{c.pairing_code.match(/.{1,4}/g)?.join('-')}</p>
                  </div>
                )}
                {c.last_error && !connected && (
                  <p className="text-xs text-destructive">{c.last_error}</p>
                )}
                {c.purposes.includes('assistente') && (
                  <p className="text-[11px] text-muted-foreground">
                    Número do Assistente PULSE: pode ficar nos grupos dos clientes. No grupo ele só lê, e só responde comando de números cadastrados.
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem envia cada mensagem</CardTitle>
          <CardDescription className="text-[11px]">Fila e envios das últimas 24 h por função.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {Object.entries(purposes).map(([key, label]) => {
            const owners = coverage[key] || [];
            const q = queueByPurpose[key];
            const fallback = !owners.length && key !== 'geral' && hasGeneral;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="flex-1 min-w-[200px]">{label}</span>
                <span className="text-xs">
                  {owners.length
                    ? owners.map((o) => o.name).join(', ')
                    : fallback
                      ? <span className="text-muted-foreground">pela conexão "geral"</span>
                      : <span className="text-destructive">nenhuma conexão: ficam na fila (até 48 h) esperando um número</span>}
                </span>
                {q && (
                  <span className="text-[11px] text-muted-foreground">
                    {Number(q.waiting) > 0 && <>na fila {q.waiting} · </>}enviadas {q.sent_24h}{Number(q.failed_24h) > 0 && <span className="text-destructive"> · falhas {q.failed_24h}</span>}
                  </span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.mode === 'edit' ? `Funções de "${edit.connection.name}"` : 'Nova conexão'}</DialogTitle>
            <DialogDescription>Marque o que este número vai enviar. Mais de um número pode ter a mesma função: o sistema reveza entre eles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: Aprovações, Financeiro, Atendimento" maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label>Funções</Label>
              {Object.entries(purposes).map(([key, label]) => {
                const others = connections.filter((c) => c.id !== (edit?.mode === 'edit' ? edit.connection.id : '') && c.purposes.includes(key));
                return (
                  <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox
                      className="mt-0.5"
                      checked={form.purposes.includes(key)}
                      onCheckedChange={() => setForm({
                        ...form,
                        purposes: form.purposes.includes(key) ? form.purposes.filter((p) => p !== key) : [...form.purposes, key],
                      })}
                    />
                    <span>
                      {label}
                      {others.length > 0 && <span className="block text-[11px] text-muted-foreground">também em: {others.map((o) => o.name).join(', ')}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy || !form.name.trim()}>{busy && <Loader2 size={14} className="mr-1 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!connectFor} onOpenChange={(open) => !open && setConnectFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar "{connectFor?.name}"</DialogTitle>
            <DialogDescription>Use um número só para o sistema: envio automático fora da API oficial pode levar o WhatsApp a bloquear o número.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button className="w-full" onClick={() => connectFor && connect(connectFor, false)} disabled={busy}>
              <QrCode size={14} className="mr-1" /> Mostrar QR Code
            </Button>
            <div className="space-y-1.5">
              <Label>Ou conectar com código (sem câmera)</Label>
              <div className="flex gap-2">
                <Input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} placeholder="5562999998888" inputMode="numeric" />
                <Button variant="outline" onClick={() => connectFor && connect(connectFor, true)} disabled={busy || pairPhone.replace(/\D/g, '').length < 12}>
                  Gerar código
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Número do celular que vai conectar, com 55 e DDD.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testFor} onOpenChange={(open) => !open && setTestFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Testar "{testFor?.name}"</DialogTitle>
            <DialogDescription>Envia uma mensagem de teste por esta conexão. Ela entra na fila e sai em alguns segundos (veja no Histórico).</DialogDescription>
          </DialogHeader>
          <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="62999998888" inputMode="numeric" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestFor(null)}>Cancelar</Button>
            <Button onClick={() => run(async () => {
              if (!testFor) return;
              await api(`/whatsapp/connections/${testFor.id}/test`, { method: 'POST', body: JSON.stringify({ number: testNumber }) });
              setTestFor(null);
            }, 'Teste na fila')} disabled={busy || testNumber.replace(/\D/g, '').length < 10}>
              <Send size={14} className="mr-1" /> Enviar teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
