import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { MessagesSquare, Loader2, Pencil, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PulseWhatsAppCard from '@/components/whatsapp/PulseWhatsAppCard';

interface AssistantNumber {
  id: string;
  name: string;
  phone: string;
  user_id: string | null;
  user_name: string | null;
  cities: string[];
  permissions: string[];
  active: boolean;
  last_command_at: string | null;
}

interface Overview {
  settings: { enabled: boolean; group_monitor_enabled: boolean; monitor_since: string | null };
  connection: { id: string; name: string; status: string; phone: string | null } | null;
  numbers: AssistantNumber[];
  permissions: Record<string, string>;
  cities: Record<string, string>;
  team: { id: string; name: string }[];
  whisper: { available: boolean };
  claude: { configured: boolean; model: string | null };
  log: { id: string; kind: string; tool: string | null; text: string | null; phone: string | null; created_at: string; number_name: string | null; error?: string | null }[];
  actions: { id: string; kind: string; summary: string; status: string; source: string; created_at: string; number_name: string | null }[];
  demands: { id: string; kind: string; summary: string; status: string; cidade: string | null; alerted_count: number; created_at: string; company_name: string | null }[];
  jobs: { id: string; status: string; params: { month?: string }; requested_by_name: string | null; claimed_by_name: string | null; created_at: string; delivered_at: string | null; fail_reason: string | null; sent_to_client_at: string | null; company_name: string | null }[];
}

const LOG_KINDS: Record<string, string> = {
  comando: 'Comando', acao: 'Ação feita', acao_proposta: 'Pediu confirmação', negado: 'Permissão negada', ignorado: 'Número não autorizado',
  erro: 'Erro', cancelado: 'Cancelado', expirado: 'Expirou', alerta: 'Aviso de demanda', limite: 'Limite por hora', desligado: 'PULSE desligado',
  audio_falhou: 'Áudio não entendido', alerta_satisfacao: 'Aviso de cliente insatisfeito', recusa: 'Recusado pelo assistente', relatorio_entregue: 'Relatório entregue', relatorio_falhou: 'Relatório falhou',
};
const ACTION_STATUS: Record<string, string> = {
  pendente: 'Esperando o sim', executando: 'Executando', executada: 'Feita', cancelada: 'Cancelada', expirada: 'Expirou',
  substituida: 'Substituída', falhou: 'Falhou',
};
const JOB_STATUS: Record<string, string> = { pendente: 'Na fila', em_andamento: 'Gerando', entregue: 'Entregue', falhou: 'Falhou', cancelado: 'Cancelado' };
const DEMAND_KIND: Record<string, string> = { post: 'Post', arte: 'Arte', video: 'Vídeo', ajuste: 'Ajuste', gravacao: 'Gravação', duvida: 'Dúvida' };

const when = (value: string | null) => (value ? format(new Date(value), 'dd/MM HH:mm') : '');
const formatPhone = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('55') && d.length >= 12 ? `(${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}` : phone;
};

type Form = { id?: string; name: string; phone: string; user_id: string; cities: string[]; permissions: string[]; active: boolean };
const EMPTY: Form = { name: '', phone: '', user_id: '', cities: [], permissions: [], active: true };

/**
 * Configurações → WhatsApp → Assistente PULSE (só admin): o número da PULSE, liga/desliga, números autorizados
 * (com cidades e permissões) e o que o PULSE fez por último.
 */
export default function AssistantPulse() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await vpsAuthedFetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Falha na operação');
    return body;
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api('/assistant/overview'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = (patch: Partial<Overview['settings']>) => run(() => api('/assistant/settings', { method: 'PATCH', body: JSON.stringify(patch) }));

  const saveNumber = async () => {
    if (!form) return;
    const body = JSON.stringify({ name: form.name, phone: form.phone, user_id: form.user_id || null, cities: form.cities, permissions: form.permissions, active: form.active });
    const done = await run(
      () => (form.id ? api(`/assistant/numbers/${form.id}`, { method: 'PATCH', body }) : api('/assistant/numbers', { method: 'POST', body })),
      form.id ? 'Número atualizado' : 'Número cadastrado',
    );
    if (done) setForm(null);
  };

  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  if (error && !data) {
    return (
      <Alert variant="destructive"><AlertDescription className="text-sm">Não consegui carregar o Assistente PULSE: {error}</AlertDescription></Alert>
    );
  }

  return (
    <div className="space-y-4" data-testid="assistant-pulse">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><MessagesSquare size={18} /> Assistente PULSE</h2>
        <p className="text-xs text-muted-foreground">
          Assistente que recebe comandos da equipe pelo WhatsApp, em texto ou áudio. Toda ação que muda algo pede "sim" antes.
        </p>
      </div>

      <PulseWhatsAppCard onChange={load} />

      {!data ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>PULSE ligado</Label>
                  <p className="text-[11px] text-muted-foreground">Desligado, avisa que está desligado e não faz nada.</p>
                </div>
                <Switch checked={data.settings.enabled} disabled={busy} onCheckedChange={(v) => saveSettings({ enabled: v })} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Monitor dos grupos dos clientes</Label>
                  <p className="text-[11px] text-muted-foreground">Detecta pedidos dos clientes nos grupos e avisa quem tem "alertas dos grupos".</p>
                </div>
                <Switch checked={data.settings.group_monitor_enabled} disabled={busy || !data.settings.enabled} onCheckedChange={(v) => saveSettings({ group_monitor_enabled: v })} />
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2 text-xs">
                <Badge variant={data.claude.configured ? 'default' : 'destructive'}>
                  {data.claude.configured ? `Modelo: ${data.claude.model}` : 'Sem chave do Claude (Integrações → APIs)'}
                </Badge>
                <Badge variant={data.whisper.available ? 'default' : 'secondary'}>
                  {data.whisper.available ? 'Áudio: Whisper instalado' : 'Áudio: Whisper ainda não instalado (pede por escrito)'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
              <div className="flex-1 min-w-[220px]">
                <CardTitle className="text-base">Números autorizados</CardTitle>
                <CardDescription className="text-[11px]">
                  Só estes números falam com o PULSE; os outros são ignorados em silêncio. Cada um age só nas cidades e com as permissões marcadas.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setForm({ ...EMPTY })} disabled={busy}><Plus size={14} className="mr-1" /> Adicionar número</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.numbers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum número cadastrado ainda.</p>}
              {data.numbers.map((n) => (
                <div key={n.id} className={`rounded-lg border border-border p-3 space-y-2 ${n.active ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{n.name}</span>
                    <span className="text-xs text-muted-foreground">{formatPhone(n.phone)}{n.user_name ? ` · ${n.user_name}` : ''}</span>
                    {!n.active && <Badge variant="secondary">Desativado</Badge>}
                    {n.cities.map((c) => <Badge key={c} variant="outline" className="text-[10px]">{data.cities[c] || c}</Badge>)}
                    <div className="ml-auto flex gap-1">
                      <Switch checked={n.active} disabled={busy} onCheckedChange={(v) => run(() => api(`/assistant/numbers/${n.id}`, { method: 'PATCH', body: JSON.stringify({ active: v }) }))} />
                      <Button size="sm" variant="ghost" onClick={() => setForm({ id: n.id, name: n.name, phone: n.phone, user_id: n.user_id || '', cities: n.cities, permissions: n.permissions, active: n.active })} disabled={busy} title="Editar">
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" title="Remover" disabled={busy} onClick={() => {
                        if (window.confirm(`Remover ${n.name} dos números do PULSE?`)) run(() => api(`/assistant/numbers/${n.id}`, { method: 'DELETE' }), 'Número removido');
                      }}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {n.permissions.length === 0
                      ? <span className="text-xs text-muted-foreground">Sem permissões: só conversa e busca clientes.</span>
                      : n.permissions.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{(data.permissions[p] || p).split(' (')[0]}</Badge>)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">O que o PULSE fez</CardTitle>
              <CardDescription className="text-[11px]">Últimos comandos, ações, demandas detectadas nos grupos e pedidos de relatório.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="log">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="log">Comandos</TabsTrigger>
                  <TabsTrigger value="actions">Ações</TabsTrigger>
                  <TabsTrigger value="demands">Demandas</TabsTrigger>
                  <TabsTrigger value="jobs">Relatórios</TabsTrigger>
                </TabsList>
                <TabsContent value="log" className="divide-y divide-border">
                  {data.log.length === 0 && <p className="text-sm text-muted-foreground py-2">Nada ainda.</p>}
                  {data.log.map((l) => (
                    <div key={l.id} className="py-2 text-sm flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground w-20">{when(l.created_at)}</span>
                      <Badge variant={l.kind === 'negado' || l.kind === 'erro' ? 'destructive' : 'outline'} className="text-[10px]">{LOG_KINDS[l.kind] || l.kind}</Badge>
                      <span className="text-xs">{l.number_name || (l.phone ? formatPhone(l.phone) : '')}</span>
                      {l.tool && <span className="text-[11px] text-muted-foreground">{l.tool}</span>}
                      {l.text && <span className="text-xs text-muted-foreground basis-full whitespace-pre-line">{l.text}</span>}
                      {l.error && <span className="text-[11px] text-destructive basis-full break-all">{l.error}</span>}
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="actions" className="divide-y divide-border">
                  {data.actions.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhuma ação ainda.</p>}
                  {data.actions.map((a) => (
                    <div key={a.id} className="py-2 text-sm space-y-1">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-muted-foreground w-20">{when(a.created_at)}</span>
                        <Badge variant={a.status === 'executada' ? 'default' : a.status === 'falhou' ? 'destructive' : 'outline'} className="text-[10px]">{ACTION_STATUS[a.status] || a.status}</Badge>
                        <span className="text-xs">{a.number_name}</span>
                        {a.source !== 'comando' && <span className="text-[11px] text-muted-foreground">({a.source === 'alerta' ? 'demanda do grupo' : 'relatório entregue'})</span>}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">{a.summary}</p>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="demands" className="divide-y divide-border">
                  {!data.settings.group_monitor_enabled && (
                    <p className="text-xs text-muted-foreground py-2 flex items-center gap-1"><AlertTriangle size={12} /> O monitor dos grupos está desligado.</p>
                  )}
                  {data.demands.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhuma demanda detectada.</p>}
                  {data.demands.map((d) => (
                    <div key={d.id} className="py-2 text-sm space-y-1">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-muted-foreground w-20">{when(d.created_at)}</span>
                        <Badge variant="outline" className="text-[10px]">{DEMAND_KIND[d.kind] || d.kind}</Badge>
                        <span className="text-xs font-medium">{d.company_name || '—'}</span>
                        {d.cidade && <span className="text-[11px] text-muted-foreground">{data.cities[d.cidade] || d.cidade}</span>}
                        <Badge variant={d.status === 'card_criado' ? 'default' : 'secondary'} className="text-[10px]">{d.status === 'card_criado' ? 'Card criado' : `Avisados: ${d.alerted_count}`}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{d.summary}</p>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="jobs" className="divide-y divide-border">
                  {data.jobs.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhum pedido de relatório.</p>}
                  {data.jobs.map((j) => (
                    <div key={j.id} className="py-2 text-sm flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-20">{when(j.created_at)}</span>
                      <Badge variant={j.status === 'entregue' ? 'default' : j.status === 'falhou' ? 'destructive' : 'outline'} className="text-[10px]">{JOB_STATUS[j.status] || j.status}</Badge>
                      <span className="text-xs font-medium">{j.company_name || '—'}</span>
                      <span className="text-xs text-muted-foreground">{j.params?.month}</span>
                      <span className="text-[11px] text-muted-foreground">pedido por {j.requested_by_name || '—'}{j.claimed_by_name ? ` · agente ${j.claimed_by_name}` : ''}{j.sent_to_client_at ? ' · enviado ao cliente' : ''}</span>
                      {j.fail_reason && <span className="text-xs text-destructive basis-full">{j.fail_reason}</span>}
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{form?.id ? `Editar ${form.name}` : 'Novo número autorizado'}</DialogTitle>
                <DialogDescription>O PULSE confere tudo no servidor: cidade e permissão valem para cada pedido.</DialogDescription>
              </DialogHeader>
              {form && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Nome</Label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} placeholder="ex.: Thiago" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Telefone (WhatsApp)</Label>
                      <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="numeric" placeholder="(62) 99999-8888" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Usuário da equipe (opcional)</Label>
                    <Select value={form.user_id || '__none__'} onValueChange={(v) => setForm({ ...form, user_id: v === '__none__' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {data.team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Os lançamentos e cards ficam no nome dessa pessoa.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Cidades</Label>
                    <div className="flex gap-4">
                      {Object.entries(data.cities).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={form.cities.includes(key)} onCheckedChange={() => setForm({ ...form, cities: toggle(form.cities, key) })} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>O que este número pode fazer</Label>
                    {Object.entries(data.permissions).map(([key, label]) => (
                      <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox className="mt-0.5" checked={form.permissions.includes(key)} onCheckedChange={() => setForm({ ...form, permissions: toggle(form.permissions, key) })} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Ativo
                  </label>
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
                <Button onClick={saveNumber} disabled={busy || !form?.name.trim() || !form?.phone.trim() || !form?.cities.length}>
                  {busy && <Loader2 size={14} className="mr-1 animate-spin" />}Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
