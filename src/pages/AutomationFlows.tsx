import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Zap, Plus, Play, Pause, Trash2, Save, ArrowRight, GitBranch, Clock,
  Users, Bell, Filter, RefreshCw, CheckCircle2, AlertTriangle, Settings2,
  Workflow, ChevronDown, GripVertical, X, Copy, BarChart3, Eye
} from 'lucide-react';

// ─── Node Types ───
type NodeType = 'trigger' | 'condition' | 'action' | 'delay' | 'loop' | 'notification';

interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, any>;
  x: number;
  y: number;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface AutomationFlow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  nodes: FlowNode[];
  edges: FlowEdge[];
  created_at: string;
  updated_at: string;
}

const NODE_TYPES: { type: NodeType; label: string; icon: any; color: string; description: string }[] = [
  { type: 'trigger', label: 'Gatilho', icon: Zap, color: 'hsl(var(--chart-4))', description: 'Evento que inicia o fluxo' },
  { type: 'condition', label: 'Condição', icon: GitBranch, color: 'hsl(var(--chart-2))', description: 'Decisão baseada em regras' },
  { type: 'action', label: 'Ação', icon: Play, color: 'hsl(var(--chart-1))', description: 'Executar uma tarefa' },
  { type: 'delay', label: 'Espera', icon: Clock, color: 'hsl(var(--chart-3))', description: 'Aguardar um período' },
  { type: 'notification', label: 'Notificação', icon: Bell, color: 'hsl(var(--chart-5))', description: 'Enviar alerta' },
  { type: 'loop', label: 'Loop', icon: RefreshCw, color: 'hsl(var(--accent))', description: 'Repetir para cada item' },
];

const TRIGGER_OPTIONS = [
  { value: 'task_created', label: 'Tarefa criada' },
  { value: 'task_column_change', label: 'Tarefa muda de coluna' },
  { value: 'recording_scheduled', label: 'Gravação agendada' },
  { value: 'deadline_approaching', label: 'Prazo se aproximando' },
  { value: 'client_created', label: 'Novo cliente cadastrado' },
  { value: 'manual', label: 'Execução manual' },
  { value: 'schedule', label: 'Agendado (cron)' },
];

const ACTION_OPTIONS = [
  { value: 'assign_task', label: 'Atribuir tarefa a membro' },
  { value: 'move_column', label: 'Mover para coluna' },
  { value: 'send_whatsapp', label: 'Enviar WhatsApp' },
  { value: 'send_notification', label: 'Enviar notificação interna' },
  { value: 'create_task', label: 'Criar nova tarefa' },
  { value: 'update_priority', label: 'Alterar prioridade' },
  { value: 'redistribute', label: 'Redistribuir tarefas' },
];

const CONDITION_OPTIONS = [
  { value: 'workload_check', label: 'Carga do membro < limite' },
  { value: 'role_check', label: 'Cargo do membro é...' },
  { value: 'priority_check', label: 'Prioridade da tarefa é...' },
  { value: 'deadline_check', label: 'Prazo em menos de X horas' },
  { value: 'status_check', label: 'Status da tarefa é...' },
];

// ─── Flow Canvas (n8n-inspired) ───
function FlowCanvas({
  nodes, edges, selectedNode, onSelectNode, onMoveNode, onDeleteNode, onAddEdge
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onDeleteNode: (id: string) => void;
  onAddEdge: (source: string, target: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setDragging(nodeId);
    setDragOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
    onSelectNode(nodeId);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      onMoveNode(dragging, e.clientX - dragOffset.x, e.clientY - dragOffset.y);
    }
  }, [dragging, dragOffset, onMoveNode]);

  const handleMouseUp = () => {
    setDragging(null);
    if (connecting) setConnecting(null);
  };

  const getNodeMeta = (type: NodeType) => NODE_TYPES.find(n => n.type === type)!;

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-[600px] bg-muted/30 rounded-xl border-2 border-dashed border-border overflow-hidden cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={() => onSelectNode(null)}
    >
      {/* Grid pattern */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Edges (SVG lines) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {edges.map(edge => {
          const source = nodes.find(n => n.id === edge.source);
          const target = nodes.find(n => n.id === edge.target);
          if (!source || !target) return null;
          const sx = source.x + 100;
          const sy = source.y + 30;
          const tx = target.x;
          const ty = target.y + 30;
          const cx1 = sx + 60;
          const cx2 = tx - 60;
          return (
            <g key={edge.id}>
              <path
                d={`M ${sx} ${sy} C ${cx1} ${sy}, ${cx2} ${ty}, ${tx} ${ty}`}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeDasharray={edge.label === 'Não' ? '6 3' : undefined}
                className="opacity-60"
              />
              <circle cx={tx} cy={ty} r="4" fill="hsl(var(--primary))" className="opacity-80" />
              {edge.label && (
                <text
                  x={(sx + tx) / 2}
                  y={(sy + ty) / 2 - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-medium"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {nodes.map(node => {
        const meta = getNodeMeta(node.type);
        const Icon = meta.icon;
        const isSelected = selectedNode === node.id;
        return (
          <div
            key={node.id}
            className={`absolute select-none group transition-shadow duration-150 ${isSelected ? 'z-20' : 'z-10'}`}
            style={{ left: node.x, top: node.y }}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 shadow-lg min-w-[180px] cursor-grab active:cursor-grabbing transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/30 shadow-primary/20'
                  : 'border-border hover:border-primary/50 hover:shadow-xl'
              }`}
              style={{ background: `linear-gradient(135deg, hsl(var(--card)), hsl(var(--card) / 0.95))` }}
            >
              <div className="p-1.5 rounded-lg" style={{ background: meta.color + '20' }}>
                <Icon className="h-4 w-4" style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{node.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {node.config?.action || node.config?.trigger || node.config?.condition || meta.description}
                </p>
              </div>
              {/* Connection handle (right) */}
              <button
                className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-primary border-2 border-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:scale-125"
                onMouseDown={(e) => { e.stopPropagation(); setConnecting(node.id); }}
                onMouseUp={(e) => {
                  e.stopPropagation();
                  if (connecting && connecting !== node.id) {
                    onAddEdge(connecting, node.id);
                    setConnecting(null);
                  }
                }}
                title="Conectar"
              />
              {/* Connection handle (left) */}
              <div
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-muted-foreground/30 bg-background opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseUp={(e) => {
                  e.stopPropagation();
                  if (connecting && connecting !== node.id) {
                    onAddEdge(connecting, node.id);
                    setConnecting(null);
                  }
                }}
              />
              {/* Delete */}
              <button
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] hover:scale-110"
                onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-muted-foreground">
            <Workflow className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Arraste nós da paleta para começar</p>
            <p className="text-xs">Conecte os nós clicando nos pontos de conexão</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Node Config Panel ───
function NodeConfigPanel({
  node, onUpdate, teamMembers
}: {
  node: FlowNode;
  onUpdate: (config: Record<string, any>, label?: string) => void;
  teamMembers: { id: string; name: string; role: string }[];
}) {
  const meta = NODE_TYPES.find(n => n.type === node.type)!;
  const Icon = meta.icon;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: meta.color }} />
          Configurar: {node.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Nome do nó</label>
          <Input
            value={node.label}
            onChange={(e) => onUpdate(node.config, e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {node.type === 'trigger' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo de gatilho</label>
            <Select
              value={node.config.trigger || ''}
              onValueChange={(v) => onUpdate({ ...node.config, trigger: v })}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {node.type === 'action' && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo de ação</label>
              <Select
                value={node.config.action || ''}
                onValueChange={(v) => onUpdate({ ...node.config, action: v })}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(node.config.action === 'assign_task' || node.config.action === 'redistribute') && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Atribuir a</label>
                <Select
                  value={node.config.assignTo || 'auto'}
                  onValueChange={(v) => onUpdate({ ...node.config, assignTo: v })}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">🤖 Automático (menor carga)</SelectItem>
                    <SelectItem value="round_robin">🔄 Rodízio</SelectItem>
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name} ({m.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        {node.type === 'condition' && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Condição</label>
              <Select
                value={node.config.condition || ''}
                onValueChange={(v) => onUpdate({ ...node.config, condition: v })}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Valor</label>
              <Input
                value={node.config.value || ''}
                onChange={(e) => onUpdate({ ...node.config, value: e.target.value })}
                className="h-8 text-sm"
                placeholder="Ex: 5, alta, editor..."
              />
            </div>
          </>
        )}

        {node.type === 'delay' && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Tempo</label>
              <Input
                type="number"
                value={node.config.delayValue || 1}
                onChange={(e) => onUpdate({ ...node.config, delayValue: parseInt(e.target.value) })}
                className="h-8 text-sm"
                min={1}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Unidade</label>
              <Select
                value={node.config.delayUnit || 'hours'}
                onValueChange={(v) => onUpdate({ ...node.config, delayUnit: v })}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutos</SelectItem>
                  <SelectItem value="hours">Horas</SelectItem>
                  <SelectItem value="days">Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {node.type === 'notification' && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Canal</label>
              <Select
                value={node.config.channel || 'internal'}
                onValueChange={(v) => onUpdate({ ...node.config, channel: v })}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">🔔 Notificação interna</SelectItem>
                  <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mensagem</label>
              <Textarea
                value={node.config.message || ''}
                onChange={(e) => onUpdate({ ...node.config, message: e.target.value })}
                className="text-sm min-h-[60px]"
                placeholder="Use {nome_cliente}, {titulo_tarefa}..."
              />
            </div>
          </>
        )}

        {node.type === 'loop' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Iterar sobre</label>
            <Select
              value={node.config.iterateOver || 'team_members'}
              onValueChange={(v) => onUpdate({ ...node.config, iterateOver: v })}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team_members">Membros da equipe</SelectItem>
                <SelectItem value="pending_tasks">Tarefas pendentes</SelectItem>
                <SelectItem value="clients">Clientes ativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───
export default function AutomationFlows() {
  const { user } = useAuth();
  const { currentUser } = useApp();
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFlow, setEditingFlow] = useState<AutomationFlow | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Load flows and team
  useEffect(() => {
    loadFlows();
    loadTeam();
  }, []);

  const loadFlows = async () => {
    setLoading(true);
    const { data } = await supabase.from('automation_flows').select('*').order('created_at', { ascending: false });
    if (data) setFlows(data.map(f => ({
      ...f,
      nodes: (f.nodes as any) || [],
      edges: (f.edges as any) || [],
      trigger_config: (f.trigger_config as any) || {},
    })));
    setLoading(false);
  };

  const loadTeam = async () => {
    const { data } = await supabase.from('profiles').select('id, name, role');
    if (data) setTeamMembers(data);
  };

  const loadLogs = async (flowId: string) => {
    const { data } = await supabase.from('automation_logs').select('*').eq('flow_id', flowId).order('started_at', { ascending: false }).limit(20);
    if (data) setLogs(data);
    setShowLogs(true);
  };

  const createFlow = async () => {
    if (!newFlowName.trim()) return;
    const defaultNodes: FlowNode[] = [
      { id: crypto.randomUUID(), type: 'trigger', label: 'Gatilho', config: { trigger: 'task_created' }, x: 80, y: 260 },
    ];
    const { data, error } = await supabase.from('automation_flows').insert({
      name: newFlowName,
      nodes: defaultNodes as any,
      edges: [] as any,
      trigger_type: 'task_created',
      created_by: user?.id,
    } as any).select().single();
    if (error) { toast.error('Erro ao criar fluxo'); return; }
    if (data) {
      const flow = { ...data, nodes: defaultNodes, edges: [], trigger_config: {} } as AutomationFlow;
      setFlows(prev => [flow, ...prev]);
      setEditingFlow(flow);
      setShowEditor(true);
      setShowNewDialog(false);
      setNewFlowName('');
      toast.success('Fluxo criado!');
    }
  };

  const saveFlow = async () => {
    if (!editingFlow) return;
    const { error } = await supabase.from('automation_flows').update({
      name: editingFlow.name,
      description: editingFlow.description,
      nodes: editingFlow.nodes as any,
      edges: editingFlow.edges as any,
      is_active: editingFlow.is_active,
      trigger_type: editingFlow.trigger_type,
      updated_at: new Date().toISOString(),
    } as any).eq('id', editingFlow.id);
    if (error) { toast.error('Erro ao salvar'); return; }
    setFlows(prev => prev.map(f => f.id === editingFlow.id ? editingFlow : f));
    toast.success('Fluxo salvo!');
  };

  const deleteFlow = async (id: string) => {
    await supabase.from('automation_flows').delete().eq('id', id);
    setFlows(prev => prev.filter(f => f.id !== id));
    if (editingFlow?.id === id) { setEditingFlow(null); setShowEditor(false); }
    toast.success('Fluxo excluído');
  };

  const toggleFlowActive = async (flow: AutomationFlow) => {
    const newActive = !flow.is_active;
    await supabase.from('automation_flows').update({ is_active: newActive, updated_at: new Date().toISOString() } as any).eq('id', flow.id);
    setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, is_active: newActive } : f));
    if (editingFlow?.id === flow.id) setEditingFlow({ ...editingFlow, is_active: newActive });
    toast.success(newActive ? 'Fluxo ativado!' : 'Fluxo desativado');
  };

  const addNode = (type: NodeType) => {
    if (!editingFlow) return;
    const meta = NODE_TYPES.find(n => n.type === type)!;
    const newNode: FlowNode = {
      id: crypto.randomUUID(),
      type,
      label: meta.label,
      config: {},
      x: 200 + Math.random() * 200,
      y: 100 + Math.random() * 300,
    };
    setEditingFlow({ ...editingFlow, nodes: [...editingFlow.nodes, newNode] });
    setSelectedNode(newNode.id);
  };

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setEditingFlow(prev => {
      if (!prev) return prev;
      return { ...prev, nodes: prev.nodes.map(n => n.id === id ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n) };
    });
  }, []);

  const deleteNode = (id: string) => {
    if (!editingFlow) return;
    setEditingFlow({
      ...editingFlow,
      nodes: editingFlow.nodes.filter(n => n.id !== id),
      edges: editingFlow.edges.filter(e => e.source !== id && e.target !== id),
    });
    if (selectedNode === id) setSelectedNode(null);
  };

  const addEdge = (source: string, target: string) => {
    if (!editingFlow) return;
    const exists = editingFlow.edges.some(e => e.source === source && e.target === target);
    if (exists) return;
    const sourceNode = editingFlow.nodes.find(n => n.id === source);
    const label = sourceNode?.type === 'condition' ? 'Sim' : undefined;
    setEditingFlow({
      ...editingFlow,
      edges: [...editingFlow.edges, { id: crypto.randomUUID(), source, target, label }],
    });
  };

  const updateNodeConfig = (config: Record<string, any>, label?: string) => {
    if (!editingFlow || !selectedNode) return;
    setEditingFlow({
      ...editingFlow,
      nodes: editingFlow.nodes.map(n =>
        n.id === selectedNode ? { ...n, config, ...(label !== undefined ? { label } : {}) } : n
      ),
    });
  };

  const selectedNodeData = editingFlow?.nodes.find(n => n.id === selectedNode);

  // ─── List View ───
  if (!showEditor) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Workflow className="h-6 w-6 text-primary" />
              Automações
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie fluxos de distribuição automática de tarefas</p>
          </div>
          <Button onClick={() => setShowNewDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Fluxo
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total de Fluxos</p>
                  <p className="text-2xl font-bold">{flows.length}</p>
                </div>
                <Workflow className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Ativos</p>
                  <p className="text-2xl font-bold text-green-500">{flows.filter(f => f.is_active).length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Inativos</p>
                  <p className="text-2xl font-bold text-muted-foreground">{flows.filter(f => !f.is_active).length}</p>
                </div>
                <Pause className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Equipe</p>
                  <p className="text-2xl font-bold">{teamMembers.length}</p>
                </div>
                <Users className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flow list */}
        <div className="grid gap-4">
          {flows.map(flow => (
            <Card key={flow.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${flow.is_active ? 'bg-green-500/10' : 'bg-muted'}`}>
                      <Workflow className={`h-5 w-5 ${flow.is_active ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{flow.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px]">
                          {TRIGGER_OPTIONS.find(t => t.value === flow.trigger_type)?.label || flow.trigger_type}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {(flow.nodes as any[]).length} nós · {(flow.edges as any[]).length} conexões
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={flow.is_active} onCheckedChange={() => toggleFlowActive(flow)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadLogs(flow.id)}>
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingFlow(flow); setShowEditor(true); }}>
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteFlow(flow.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!loading && flows.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Workflow className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">Nenhum fluxo criado</p>
                <p className="text-xs text-muted-foreground mt-1">Crie seu primeiro fluxo de automação</p>
                <Button onClick={() => setShowNewDialog(true)} className="mt-4 gap-2" variant="outline">
                  <Plus className="h-4 w-4" /> Criar Fluxo
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* New Flow Dialog */}
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Fluxo de Automação</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Nome do fluxo (ex: Distribuição de edição)"
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFlow()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
              <Button onClick={createFlow} disabled={!newFlowName.trim()}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Logs Dialog */}
        <Dialog open={showLogs} onOpenChange={setShowLogs}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Histórico de Execuções</DialogTitle>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {logs.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução registrada</p>}
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
                  {log.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> :
                   log.status === 'error' ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" /> :
                   <RefreshCw className="h-4 w-4 text-primary animate-spin shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{new Date(log.started_at).toLocaleString('pt-BR')}</p>
                    {log.error && <p className="text-xs text-destructive mt-0.5">{log.error}</p>}
                  </div>
                  <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Editor View ───
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setShowEditor(false); setEditingFlow(null); setSelectedNode(null); }}>
            ← Voltar
          </Button>
          <div>
            <Input
              value={editingFlow?.name || ''}
              onChange={(e) => editingFlow && setEditingFlow({ ...editingFlow, name: e.target.value })}
              className="h-8 text-lg font-bold border-none shadow-none px-0 focus-visible:ring-0"
            />
          </div>
          <Badge variant={editingFlow?.is_active ? 'default' : 'secondary'}>
            {editingFlow?.is_active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={editingFlow?.is_active || false}
            onCheckedChange={() => editingFlow && toggleFlowActive(editingFlow)}
          />
          <Button onClick={saveFlow} className="gap-2">
            <Save className="h-4 w-4" /> Salvar
          </Button>
        </div>
      </div>

      {/* Node palette */}
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl border">
        <span className="text-xs font-medium text-muted-foreground mr-2">Adicionar:</span>
        {NODE_TYPES.map(nt => {
          const Icon = nt.icon;
          return (
            <Button
              key={nt.type}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => addNode(nt.type)}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: nt.color }} />
              {nt.label}
            </Button>
          );
        })}
      </div>

      {/* Canvas + Config side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <FlowCanvas
            nodes={editingFlow?.nodes || []}
            edges={editingFlow?.edges || []}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            onMoveNode={moveNode}
            onDeleteNode={deleteNode}
            onAddEdge={addEdge}
          />
        </div>
        <div className="space-y-4">
          {selectedNodeData ? (
            <NodeConfigPanel
              node={selectedNodeData}
              onUpdate={updateNodeConfig}
              teamMembers={teamMembers}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Settings2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Selecione um nó para configurar</p>
              </CardContent>
            </Card>
          )}

          {/* Flow description */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">Descrição do fluxo</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editingFlow?.description || ''}
                onChange={(e) => editingFlow && setEditingFlow({ ...editingFlow, description: e.target.value })}
                placeholder="Descreva o objetivo deste fluxo..."
                className="text-sm min-h-[80px]"
              />
            </CardContent>
          </Card>

          {/* Quick scenarios */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">Templates rápidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs h-8"
                onClick={() => {
                  if (!editingFlow) return;
                  const nodes: FlowNode[] = [
                    { id: crypto.randomUUID(), type: 'trigger', label: 'Tarefa criada', config: { trigger: 'task_created' }, x: 60, y: 100 },
                    { id: crypto.randomUUID(), type: 'condition', label: 'Carga < 5?', config: { condition: 'workload_check', value: '5' }, x: 320, y: 100 },
                    { id: crypto.randomUUID(), type: 'action', label: 'Atribuir', config: { action: 'assign_task', assignTo: 'auto' }, x: 580, y: 50 },
                    { id: crypto.randomUUID(), type: 'action', label: 'Redistribuir', config: { action: 'redistribute' }, x: 580, y: 200 },
                    { id: crypto.randomUUID(), type: 'notification', label: 'Notificar', config: { channel: 'internal', message: 'Nova tarefa atribuída: {titulo_tarefa}' }, x: 840, y: 100 },
                  ];
                  const edges: FlowEdge[] = [
                    { id: crypto.randomUUID(), source: nodes[0].id, target: nodes[1].id },
                    { id: crypto.randomUUID(), source: nodes[1].id, target: nodes[2].id, label: 'Sim' },
                    { id: crypto.randomUUID(), source: nodes[1].id, target: nodes[3].id, label: 'Não' },
                    { id: crypto.randomUUID(), source: nodes[2].id, target: nodes[4].id },
                    { id: crypto.randomUUID(), source: nodes[3].id, target: nodes[4].id },
                  ];
                  setEditingFlow({ ...editingFlow, nodes, edges, trigger_type: 'task_created' });
                  toast.success('Template aplicado!');
                }}
              >
                ⚡ Distribuição automática por carga
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs h-8"
                onClick={() => {
                  if (!editingFlow) return;
                  const nodes: FlowNode[] = [
                    { id: crypto.randomUUID(), type: 'trigger', label: 'Prazo próximo', config: { trigger: 'deadline_approaching' }, x: 60, y: 150 },
                    { id: crypto.randomUUID(), type: 'condition', label: 'Tarefa parada?', config: { condition: 'status_check', value: 'pendente' }, x: 320, y: 150 },
                    { id: crypto.randomUUID(), type: 'notification', label: 'Alertar membro', config: { channel: 'whatsapp', message: '⚠️ {titulo_tarefa} está próxima do prazo!' }, x: 580, y: 80 },
                    { id: crypto.randomUUID(), type: 'delay', label: 'Esperar 2h', config: { delayValue: 2, delayUnit: 'hours' }, x: 580, y: 250 },
                    { id: crypto.randomUUID(), type: 'notification', label: 'Alertar gestor', config: { channel: 'internal', message: '🚨 Tarefa {titulo_tarefa} não foi concluída no prazo' }, x: 840, y: 250 },
                  ];
                  const edges: FlowEdge[] = [
                    { id: crypto.randomUUID(), source: nodes[0].id, target: nodes[1].id },
                    { id: crypto.randomUUID(), source: nodes[1].id, target: nodes[2].id, label: 'Sim' },
                    { id: crypto.randomUUID(), source: nodes[2].id, target: nodes[3].id },
                    { id: crypto.randomUUID(), source: nodes[3].id, target: nodes[4].id },
                  ];
                  setEditingFlow({ ...editingFlow, nodes, edges, trigger_type: 'deadline_approaching' });
                  toast.success('Template aplicado!');
                }}
              >
                ⏰ Alerta de prazo vencendo
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
