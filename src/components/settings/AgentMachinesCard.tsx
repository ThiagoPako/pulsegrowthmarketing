import { useCallback, useEffect, useMemo, useState } from 'react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Circle, Copy, Laptop, Loader2, Pencil, Plus, RefreshCw, Unplug } from 'lucide-react';

interface Machine {
  id: string;
  name: string;
  hostname: string | null;
  created_at: string;
  connected_at: string | null;
  last_seen_at: string | null;
  code_pending: boolean;
  pair_status: string | null;
  pair_report: PairReport | null;
}

interface PairCheck {
  label: string;
  ok: boolean;
  detail: string | null;
}

interface PairReport {
  checks?: PairCheck[];
  node?: string | null;
}

interface PairState {
  pair_status: string | null;
  hostname: string | null;
  pair_report: PairReport | null;
  code_expires_at: string | null;
}

interface Agent {
  user_id: string;
  role: string;
  machine_id: string | null;
  active: boolean;
  last_used_at: string | null;
  name: string | null;
  email: string | null;
}

const ROLE_LABELS: Record<string, string> = { editor: 'Editor', revisor: 'Revisão', chefe: 'Chefe' };
const ONLINE_MS = 15 * 60 * 1000;
const PULSE_CMD = 'node ~/Movies/"OPEN CUT"/ferramentas/sistema/pulse.mjs conectar';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// etapas da conexão ao vivo, na ordem em que o Mac avisa o sistema
const PAIR_STEPS = [
  { id: 'aguardando', label: 'Código gerado — esperando o Mac' },
  { id: 'chaves_entregues', label: 'O Mac respondeu e recebeu as chaves' },
  { id: 'chaves_gravadas', label: 'Chaves gravadas no Mac' },
  { id: 'verificado', label: 'Mac conferido (Node, ffmpeg, pasta OPEN CUT, mapa, chaves)' },
];
const STEP_INDEX: Record<string, number> = { aguardando: 0, chaves_entregues: 1, chaves_gravadas: 2, conectado: 4, com_avisos: 4 };

function machineStatus(machine: Machine) {
  if (machine.pair_status === 'com_avisos') return { label: 'Conectado com avisos', variant: 'destructive' as const };
  if (!machine.connected_at) {
    return machine.code_pending
      ? { label: 'Aguardando conexão', variant: 'outline' as const }
      : { label: 'Código vencido', variant: 'secondary' as const };
  }
  const recent = machine.last_seen_at && Date.now() - new Date(machine.last_seen_at).getTime() < ONLINE_MS;
  return recent ? { label: 'Em uso agora', variant: 'default' as const } : { label: 'Conectado', variant: 'outline' as const };
}

type DialogState = { mode: 'new' } | { mode: 'code'; machine: Machine } | null;

/**
 * Computadores onde os agentes rodam (Mac 1, Mac 2…). "Conectar outro Mac" gera um código de uso único;
 * no Mac, `pulse conectar <código>` grava as chaves dos agentes escolhidos. Cada agente roda em um Mac só:
 * conectar um agente num Mac novo desliga a chave dele no Mac anterior.
 */
export default function AgentMachinesCard() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ code: string; machineId: string; machineName: string; minutes: number } | null>(null);
  const [pair, setPair] = useState<PairState | null>(null);

  const load = useCallback(async () => {
    const response = await vpsAuthedFetch('/agent-machines');
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Falha ao carregar os computadores');
    setMachines(body.machines || []);
    setAgents(body.agents || []);
  }, []);

  useEffect(() => {
    load()
      .catch((error) => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false));
  }, [load]);

  // enquanto a janela mostra o código, o sistema acompanha o Mac até a conexão terminar
  const pairStatus = pair?.pair_status;
  const pairFinished = pairStatus === 'conectado' || pairStatus === 'com_avisos' || pairStatus === 'vencido';
  useEffect(() => {
    if (!issued || pairFinished) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await vpsAuthedFetch(`/agent-machines/${issued.machineId}/pair`);
        if (!response.ok || stopped) return;
        const body = await response.json();
        if (stopped) return;
        setPair(body);
        if (['conectado', 'com_avisos'].includes(body.pair_status)) load().catch(() => {});
      } catch {
        // rede instável: tenta de novo no próximo ciclo
      }
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [issued, pairFinished, load]);

  const machineName = useMemo(() => new Map(machines.map((m) => [m.id, m.name])), [machines]);
  const agentsOf = (machineId: string | null) =>
    agents.filter((a) => a.active && (machineId ? a.machine_id === machineId : !a.machine_id || !machineName.has(a.machine_id)));
  const unassigned = agentsOf(null);
  const withoutKey = agents.filter((a) => !a.active);

  const openNew = () => {
    setName(`Mac ${machines.length + 1}`);
    setSelected([]);
    setIssued(null);
    setPair(null);
    setDialog({ mode: 'new' });
  };

  const openCode = (machine: Machine) => {
    setName(machine.name);
    setSelected(agentsOf(machine.id).map((a) => a.user_id));
    setIssued(null);
    setPair(null);
    setDialog({ mode: 'code', machine });
  };

  const toggle = (userId: string) =>
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));

  const handleGenerate = async () => {
    if (!dialog) return;
    if (!name.trim()) return toast.error('Dê um nome ao computador');
    if (!selected.length) return toast.error('Escolha pelo menos um agente');
    setSaving(true);
    try {
      const url = dialog.mode === 'new' ? '/agent-machines' : `/agent-machines/${dialog.machine.id}/code`;
      const response = await vpsAuthedFetch(url, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), user_ids: selected }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Falha ao gerar o código');
      setPair(null);
      setIssued({ code: body.code, machineId: body.machine.id, machineName: body.machine.name, minutes: body.expires_in_minutes });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (machine: Machine) => {
    const next = window.prompt('Novo nome do computador', machine.name)?.trim();
    if (!next || next === machine.name) return;
    const response = await vpsAuthedFetch(`/agent-machines/${machine.id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) });
    if (!response.ok) return toast.error('Falha ao renomear');
    await load();
  };

  const handleDisconnect = async (machine: Machine) => {
    const names = agentsOf(machine.id).map((a) => a.name).join(', ');
    const warning = names ? ` ${names} param de funcionar nele na hora.` : '';
    if (!window.confirm(`Desconectar "${machine.name}"?${warning}`)) return;
    const response = await vpsAuthedFetch(`/agent-machines/${machine.id}`, { method: 'DELETE' });
    if (!response.ok) return toast.error('Falha ao desconectar');
    toast.success('Computador desconectado');
    await load();
  };

  const copyCommand = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(`${PULSE_CMD} ${issued.code}`);
      toast.success('Comando copiado');
    } catch {
      toast.error('O navegador não deixou copiar. Selecione o comando com o mouse e use Cmd+C.');
    }
  };

  const currentMachineId = dialog?.mode === 'code' ? dialog.machine.id : null;

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Laptop size={18} />
          <h2 className="text-base font-semibold">Computadores dos agentes</h2>
        </div>
        <Button size="sm" className="ml-auto" onClick={openNew} disabled={loading || agents.length === 0}>
          <Plus size={14} className="mr-1" /> Conectar outro Mac
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Em qual Mac cada agente trabalha. Cada agente roda em um computador só; para mudar de Mac, conecte-o no novo
        e ele para no anterior.
      </p>

      {loading ? (
        <Loader2 className="animate-spin text-muted-foreground" size={18} />
      ) : (
        <div className="space-y-3">
          {machines.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum computador conectado ainda.</p>
          )}
          {machines.map((machine) => {
            const status = machineStatus(machine);
            const list = agentsOf(machine.id);
            return (
              <div key={machine.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Laptop size={16} className="text-muted-foreground" />
                  <span className="font-medium">{machine.name}</span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {machine.hostname && <span className="text-xs text-muted-foreground">{machine.hostname}</span>}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleRename(machine)} title="Renomear">
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openCode(machine)}>
                      <RefreshCw size={14} className="mr-1" /> Agentes / novo código
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDisconnect(machine)}>
                      <Unplug size={14} className="mr-1" /> Desconectar
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {machine.connected_at ? 'Nenhum agente neste Mac.' : 'Os agentes entram quando o Mac usar o código.'}
                    </span>
                  ) : (
                    list.map((agent) => (
                      <Badge key={agent.user_id} variant="secondary">
                        {agent.name || agent.email} · {ROLE_LABELS[agent.role] || agent.role}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Conectado em {formatDate(machine.connected_at)} · último sinal {formatDate(machine.last_seen_at)}
                </p>
              </div>
            );
          })}

          {withoutKey.length > 0 && (
            <div className="rounded-lg border border-dashed border-amber-500/50 p-3 space-y-2">
              <span className="text-sm font-medium">Sem computador e sem chave ativa</span>
              <div className="flex flex-wrap gap-1.5">
                {withoutKey.map((agent) => (
                  <Badge key={agent.user_id} variant="outline">
                    {agent.name || agent.email} · {ROLE_LABELS[agent.role] || agent.role}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Parados até serem conectados num Mac: use "Conectar outro Mac" e marque o agente — ele recebe uma chave nova.
              </p>
            </div>
          )}

          {unassigned.length > 0 && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <span className="text-sm font-medium">Sem computador definido</span>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((agent) => (
                  <Badge key={agent.user_id} variant="outline">
                    {agent.name || agent.email} · {ROLE_LABELS[agent.role] || agent.role}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Chaves salvas à mão (antes desta tela). Continuam funcionando; conecte o Mac onde rodam para aparecerem nele.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'code' ? `Agentes do ${dialog.machine.name}` : 'Conectar outro Mac'}</DialogTitle>
            <DialogDescription>
              Escolha os agentes que vão rodar nesse computador. Você recebe um código para usar no Mac.
            </DialogDescription>
          </DialogHeader>

          {issued ? (
            <div className="space-y-4">
              {!pairStatus || pairStatus === 'aguardando' ? (
                <>
                  <p className="text-sm">
                    No <strong>{issued.machineName}</strong>, com a pasta OPEN CUT instalada, abra o Terminal e rode:
                  </p>
                  <code className="block select-all break-all rounded bg-muted px-3 py-2 text-sm">
                    {PULSE_CMD} {issued.code}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyCommand}>
                    <Copy size={14} className="mr-1" /> Copiar comando
                  </Button>
                </>
              ) : null}

              <PairProgress status={pairStatus || 'aguardando'} hostname={pair?.hostname || null} />

              {pair?.pair_report?.checks && pair.pair_report.checks.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">O que o Mac conferiu</p>
                  {pair.pair_report.checks.map((check, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm">
                      {check.ok ? (
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                      )}
                      <span>
                        {check.label}
                        {check.detail && <span className="block text-xs text-muted-foreground">{check.detail}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {pairStatus === 'conectado' && (
                <p className="text-sm font-medium text-emerald-600">Conexão concluída. O {issued.machineName} já pode trabalhar.</p>
              )}
              {pairStatus === 'com_avisos' && (
                <p className="text-sm text-amber-600">
                  Conectado, mas o Mac precisa de ajustes (lista acima). Depois de corrigir, gere um novo código e rode de novo
                  para conferir.
                </p>
              )}
              {pairStatus === 'vencido' && (
                <p className="text-sm text-destructive">O código venceu antes de o Mac responder. Gere outro.</p>
              )}
              {pairStatus === 'parado' && (
                <p className="text-sm text-amber-600">
                  O Mac recebeu as chaves mas parou de responder. Veja a mensagem no Terminal dele; se preciso, gere um novo
                  código e rode de novo.
                </p>
              )}
              {(!pairStatus || pairStatus === 'aguardando') && (
                <p className="text-xs text-muted-foreground">
                  O código vale {issued.minutes} minutos e só uma vez. Deixe esta janela aberta: ela mostra cada passo
                  conforme o Mac responde.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {dialog?.mode === 'new' && (
                <div className="space-y-1.5">
                  <Label>Nome do computador</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mac 2" maxLength={60} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Agentes neste Mac</Label>
                {agents.map((agent) => {
                  const elsewhere = agent.machine_id && agent.machine_id !== currentMachineId ? machineName.get(agent.machine_id) : null;
                  return (
                    <label key={agent.user_id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={selected.includes(agent.user_id)} onCheckedChange={() => toggle(agent.user_id)} />
                      <span>{agent.name || agent.email}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_LABELS[agent.role] || agent.role}</span>
                      {elsewhere && selected.includes(agent.user_id) && (
                        <span className="text-xs text-amber-600">sai do {elsewhere}</span>
                      )}
                      {!agent.active && (
                        <span className="text-xs text-muted-foreground">sem chave ativa — recebe uma nova</span>
                      )}
                      {agent.active && !agent.machine_id && selected.includes(agent.user_id) && (
                        <span className="text-xs text-amber-600">a chave atual deixa de valer</span>
                      )}
                    </label>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Agente novo? Gere a chave dele em "Agentes de edição" antes.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            {issued ? (
              <>
                {(pairStatus === 'vencido' || pairStatus === 'parado' || pairStatus === 'com_avisos') && (
                  <Button variant="outline" onClick={() => { setIssued(null); setPair(null); }}>
                    Gerar outro código
                  </Button>
                )}
                <Button onClick={() => setDialog(null)}>
                  {pairStatus === 'conectado' || pairStatus === 'com_avisos' ? 'Pronto' : 'Fechar'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>Cancelar</Button>
                <Button onClick={handleGenerate} disabled={saving}>
                  {saving && <Loader2 size={14} className="mr-1 animate-spin" />} Gerar código
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PairProgress({ status, hostname }: { status: string; hostname: string | null }) {
  const current = STEP_INDEX[status] ?? (status === 'parado' ? 2 : 0);
  return (
    <ol className="space-y-2">
      {PAIR_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current && status !== 'vencido' && status !== 'parado';
        return (
          <li key={step.id} className="flex items-center gap-2 text-sm">
            {done ? (
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            ) : active ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
            ) : (
              <Circle size={16} className="shrink-0 text-muted-foreground/50" />
            )}
            <span className={done || active ? '' : 'text-muted-foreground'}>
              {step.label}
              {step.id === 'chaves_entregues' && done && hostname ? ` (${hostname})` : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
