import React, { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, CheckCircle2, Flame, FileText, Clock, User as UserIcon,
  PenLine, Sparkles, PlusCircle, AlertTriangle, TrendingUp, Package,
  Send, Trash2, ListChecks
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import type { Script, ScriptVideoType, ScriptContentFormat } from '@/types';
import { SCRIPT_VIDEO_TYPE_LABELS, SCRIPT_CONTENT_FORMAT_LABELS } from '@/types';

interface PendingTask {
  id: string;
  client_id: string | null;
  title: string;
  content_type: string;
  editing_priority: boolean;
  created_at: string;
  prospect_name: string | null;
}

interface ScriptRequest {
  id: string;
  client_id: string | null;
  topic: string;
  notes: string | null;
  content_format: string;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
  priority: 'alta' | 'normal';
  requested_by_name: string | null;
  fulfilled_script_id: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

const VIDEO_TYPES: ScriptVideoType[] = ['vendas', 'institucional', 'reconhecimento', 'educacional', 'bastidores', 'depoimento', 'lancamento', 'evento'];
const CONTENT_FORMATS: ScriptContentFormat[] = ['reels', 'story', 'criativo'];

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function Copy() {
  const { user } = useAuth();
  const { clients, scripts, addScript } = useApp();
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [requests, setRequests] = useState<ScriptRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<{ taskId?: string; requestId?: string; startedAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finalizing, setFinalizing] = useState<{ task?: PendingTask; request?: ScriptRequest } | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    clientId: '',
    topic: '',
    notes: '',
    contentFormat: 'reels' as ScriptContentFormat,
    priority: 'alta' as 'alta' | 'normal',
  });

  const [form, setForm] = useState({
    title: '',
    videoType: 'vendas' as ScriptVideoType,
    contentFormat: 'reels' as ScriptContentFormat,
    content: '',
    caption: '',
  });

  const sessionKey = user ? `copy_active_session_${user.id}` : null;
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!sessionKey) return;
    const raw = localStorage.getItem(sessionKey);
    if (raw) {
      try { setActiveSession(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true);
    const [tasksRes, reqRes] = await Promise.all([
      supabase.from('content_tasks')
        .select('id, client_id, title, content_type, editing_priority, created_at, prospect_name')
        .eq('kanban_column', 'ideias')
        .is('script_id', null)
        .order('created_at', { ascending: false }),
      supabase.from('script_requests')
        .select('*')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false }),
    ]);
    if (tasksRes.error) console.error(tasksRes.error);
    else setTasks((tasksRes.data as any) || []);
    if (reqRes.error) console.error(reqRes.error);
    else setRequests((reqRes.data as any) || []);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const onFocus = () => loadAll(true);
    const onVisibility = () => { if (document.visibilityState === 'visible') loadAll(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const bc = 'BroadcastChannel' in window ? new BroadcastChannel('copy_tasks_sync') : null;
    if (bc) bc.onmessage = () => loadAll(true);

    const channel = supabase
      .channel('copy_content_tasks')
      .on('broadcast' as any, { event: 'copy_task_change' }, () => loadAll(true))
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'content_tasks' }, () => loadAll(true))
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'script_requests' }, () => loadAll(true))
      .subscribe();
    channelRef.current = channel;

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      bc?.close();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  const broadcastChange = () => {
    try { channelRef.current?.send?.({ event: 'copy_task_change', payload: { t: Date.now() } }); } catch { /* ignore */ }
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('copy_tasks_sync');
        bc.postMessage({ t: Date.now() });
        bc.close();
      }
    } catch { /* ignore */ }
  };

  const clientById = useMemo(() => {
    const map = new Map(clients.map(c => [c.id, c]));
    return (id: string | null | undefined) => (id ? map.get(id) : undefined);
  }, [clients]);

  // ── DEMANDA POR CLIENTE ──
  // Estoque = scripts recorded=false do cliente
  // Pendentes reels = tasks 'ideias' sem script (o que precisa produzir)
  // Score = pendentes - estoque (quanto maior, mais urgente)
  const clientDemand = useMemo(() => {
    const stockByClient = new Map<string, number>();
    scripts.forEach(s => {
      if (!s.recorded && s.clientId) {
        stockByClient.set(s.clientId, (stockByClient.get(s.clientId) || 0) + 1);
      }
    });
    const pendingByClient = new Map<string, number>();
    tasks.forEach(t => {
      if (t.client_id && (t.content_type === 'reels' || t.content_type === 'criativo' || t.content_type === 'story')) {
        pendingByClient.set(t.client_id, (pendingByClient.get(t.client_id) || 0) + 1);
      }
    });
    const ids = new Set([...stockByClient.keys(), ...pendingByClient.keys()]);
    const rows = Array.from(ids).map(id => {
      const stock = stockByClient.get(id) || 0;
      const pending = pendingByClient.get(id) || 0;
      return {
        clientId: id,
        client: clientById(id),
        stock,
        pending,
        score: pending - stock,
      };
    }).filter(r => r.client).sort((a, b) => b.score - a.score);
    return rows;
  }, [scripts, tasks, clientById]);

  const activeTask = activeSession?.taskId ? tasks.find(t => t.id === activeSession.taskId) : null;
  const activeRequest = activeSession?.requestId ? requests.find(r => r.id === activeSession.requestId) : null;
  const isBusy = !!activeSession;

  const priorityRequests = requests.filter(r => r.priority === 'alta' && r.status !== 'in_progress' && r.id !== activeSession?.requestId);
  const normalRequests = requests.filter(r => r.priority === 'normal' && r.status !== 'in_progress' && r.id !== activeSession?.requestId);
  const urgentTasks = tasks.filter(t => t.editing_priority && t.id !== activeSession?.taskId);
  const todoTasks = tasks.filter(t => !t.editing_priority && t.id !== activeSession?.taskId);

  const startTask = (task: PendingTask) => {
    if (isBusy) { toast.error('Finalize a tarefa atual antes de iniciar outra'); return; }
    const session = { taskId: task.id, startedAt: Date.now() };
    setActiveSession(session);
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify(session));
    toast.success(`Executando: ${task.title}`);
    broadcastChange();
  };

  const startRequest = async (req: ScriptRequest) => {
    if (isBusy) { toast.error('Finalize a tarefa atual antes de iniciar outra'); return; }
    const session = { requestId: req.id, startedAt: Date.now() };
    setActiveSession(session);
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify(session));
    await supabase.from('script_requests').update({ status: 'in_progress' } as any).eq('id', req.id);
    toast.success(`Executando pedido: ${req.topic}`);
    broadcastChange();
    loadAll(true);
  };

  const cancelSession = async () => {
    if (!confirm('Cancelar execução? O tempo será descartado.')) return;
    if (activeSession?.requestId) {
      await supabase.from('script_requests').update({ status: 'pending' } as any).eq('id', activeSession.requestId);
    }
    setActiveSession(null);
    if (sessionKey) localStorage.removeItem(sessionKey);
    broadcastChange();
    loadAll(true);
  };

  const openFinalize = () => {
    if (activeTask) {
      setForm({
        title: activeTask.title,
        videoType: 'vendas',
        contentFormat: (['reels', 'story', 'criativo'].includes(activeTask.content_type) ? activeTask.content_type : 'reels') as ScriptContentFormat,
        content: '', caption: '',
      });
      setFinalizing({ task: activeTask });
    } else if (activeRequest) {
      setForm({
        title: activeRequest.topic,
        videoType: 'vendas',
        contentFormat: (['reels', 'story', 'criativo'].includes(activeRequest.content_format) ? activeRequest.content_format : 'reels') as ScriptContentFormat,
        content: '', caption: '',
      });
      setFinalizing({ request: activeRequest });
    }
  };

  const saveScript = async () => {
    if (!finalizing || !activeSession) return;
    if (!form.content.trim()) { toast.error('Escreva o conteúdo do roteiro'); return; }
    const clientId = finalizing.task?.client_id || finalizing.request?.client_id;
    if (!clientId) { toast.error('Sem cliente vinculado'); return; }
    setSaving(true);
    try {
      const durationMs = Date.now() - activeSession.startedAt;
      const durationLabel = formatDuration(durationMs);
      const nowIso = new Date().toISOString();
      const scriptId = crypto.randomUUID();
      const contentHtml = form.content.trim().startsWith('<')
        ? form.content
        : form.content.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

      const script: Script = {
        id: scriptId,
        clientId,
        title: form.title.trim() || (finalizing.task?.title || finalizing.request?.topic || 'Roteiro'),
        videoType: form.videoType,
        contentFormat: form.contentFormat,
        content: contentHtml,
        recorded: false,
        priority: finalizing.request?.priority === 'alta' ? 'urgent' : 'normal',
        createdAt: nowIso,
        updatedAt: nowIso,
        isEndomarketing: false,
        caption: form.caption || undefined,
        createdBy: user?.id,
      };
      await addScript(script);
      if (form.caption) {
        await supabase.from('scripts').update({ caption: form.caption } as any).eq('id', scriptId);
      }

      if (finalizing.task) {
        await supabase.from('content_tasks').update({
          script_id: scriptId, updated_at: nowIso,
        } as any).eq('id', finalizing.task.id);
      }
      if (finalizing.request) {
        await supabase.from('script_requests').update({
          status: 'done',
          fulfilled_script_id: scriptId,
          fulfilled_at: nowIso,
        } as any).eq('id', finalizing.request.id);
      }

      toast.success(`Roteiro criado em ${durationLabel}`);
      setActiveSession(null);
      if (sessionKey) localStorage.removeItem(sessionKey);
      setFinalizing(null);
      loadAll(true);
      broadcastChange();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar roteiro');
    } finally {
      setSaving(false);
    }
  };

  const createRequest = async () => {
    if (!requestForm.clientId) { toast.error('Selecione o cliente'); return; }
    if (!requestForm.topic.trim()) { toast.error('Descreva o tema'); return; }
    const { error } = await supabase.from('script_requests').insert({
      client_id: requestForm.clientId,
      topic: requestForm.topic.trim(),
      notes: requestForm.notes.trim() || null,
      content_format: requestForm.contentFormat,
      priority: requestForm.priority,
      requested_by: user?.id,
      requested_by_name: (user as any)?.user_metadata?.name || user?.email || 'Social Media',
    } as any);
    if (error) { console.error(error); toast.error('Erro ao criar pedido'); return; }
    toast.success('Pedido de roteiro criado');
    setRequestDialogOpen(false);
    setRequestForm({ clientId: '', topic: '', notes: '', contentFormat: 'reels', priority: 'alta' });
    loadAll(true);
    broadcastChange();
  };

  const cancelRequest = async (id: string) => {
    if (!confirm('Cancelar este pedido?')) return;
    await supabase.from('script_requests').update({ status: 'cancelled' } as any).eq('id', id);
    loadAll(true);
    broadcastChange();
  };

  const elapsedMs = activeSession ? now - activeSession.startedAt : 0;

  // ── UI Components ──
  const TaskCard = ({ task, urgent }: { task: PendingTask; urgent?: boolean }) => {
    const client = clientById(task.client_id);
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`group relative rounded-xl border p-3 transition-all hover:shadow-md ${urgent ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}
      >
        <div className="flex items-start gap-3">
          {client ? <ClientLogo client={client as any} size="sm" /> : (
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <FileText size={16} className="text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {urgent && <Badge variant="destructive" className="h-5 gap-1"><Flame size={10} /> Urgente</Badge>}
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{task.content_type}</span>
            </div>
            <h4 className="text-sm font-semibold text-foreground line-clamp-2">{task.title}</h4>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{client?.companyName || task.prospect_name || 'Sem cliente'}</p>
          </div>
        </div>
        <Button size="sm" className="w-full mt-3 gap-1.5" variant={urgent ? 'destructive' : 'default'}
          onClick={() => startTask(task)} disabled={isBusy}>
          <Play size={12} /> Iniciar
        </Button>
      </motion.div>
    );
  };

  const RequestCard = ({ req }: { req: ScriptRequest }) => {
    const client = clientById(req.client_id);
    const isPriority = req.priority === 'alta';
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`group relative rounded-xl border-2 p-3 transition-all hover:shadow-md ${isPriority ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-transparent' : 'border-border bg-card'}`}
      >
        <div className="flex items-start gap-3">
          {client ? <ClientLogo client={client as any} size="sm" /> : (
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Sparkles size={16} className="text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isPriority && <Badge className="h-5 gap-1 bg-amber-500 hover:bg-amber-500 text-white"><Sparkles size={10} /> Prioridade</Badge>}
              <Badge variant="outline" className="h-5 text-[10px]">{SCRIPT_CONTENT_FORMAT_LABELS[req.content_format as ScriptContentFormat] || req.content_format}</Badge>
            </div>
            <h4 className="text-sm font-semibold text-foreground line-clamp-2">{req.topic}</h4>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{client?.companyName || 'Sem cliente'}</p>
            {req.notes && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 italic">"{req.notes}"</p>}
            {req.requested_by_name && <p className="text-[10px] text-muted-foreground mt-1">📨 {req.requested_by_name}</p>}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" className={`flex-1 gap-1.5 ${isPriority ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
            onClick={() => startRequest(req)} disabled={isBusy}>
            <Play size={12} /> Iniciar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => cancelRequest(req.id)} title="Cancelar pedido">
            <Trash2 size={12} />
          </Button>
        </div>
      </motion.div>
    );
  };

  const highDemand = clientDemand.filter(d => d.score > 0).slice(0, 6);

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* ── Header ── */}
      <header className="glass-card p-5 border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <motion.div
            animate={{ scale: [1, 1.06, 1], rotate: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0"
          >
            <PenLine size={26} className="text-primary" />
          </motion.div>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Copy</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Área do copywriter — apenas 1 execução ativa por vez, igual videomaker</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setRequestDialogOpen(true)} className="gap-1.5" variant="outline">
              <PlusCircle size={14} /> Solicitar roteiro
            </Button>
          </div>
        </div>
      </header>

      {/* ── SPOTLIGHT: execução ao vivo ── */}
      <AnimatePresence>
        {(activeTask || activeRequest) && (
          <motion.div
            key="active"
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 ring-2 ring-primary/20 shadow-xl"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0"
              >
                <PenLine size={30} className="text-primary" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px] gap-1">
                    <motion.span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"
                      animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                    AO VIVO
                  </Badge>
                  {activeRequest && <Badge className="bg-amber-500 text-white text-[10px] gap-1"><Sparkles size={10} /> Pedido do social</Badge>}
                </div>
                <h2 className="font-display text-xl font-bold text-foreground truncate">
                  {activeTask?.title || activeRequest?.topic}
                </h2>
                <p className="text-sm text-muted-foreground truncate">
                  {(clientById(activeTask?.client_id || activeRequest?.client_id)?.companyName)
                    || activeTask?.prospect_name || 'Sem cliente'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-4xl font-mono font-bold text-primary tabular-nums">
                    <Clock size={16} className="inline mr-1 -mt-1" />
                    {formatDuration(elapsedMs)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">tempo</div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={openFinalize} className="gap-1.5"><CheckCircle2 size={14} /> Finalizar</Button>
                  <Button variant="outline" size="sm" onClick={cancelSession} className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10">
                    <Pause size={12} /> Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DEMANDA POR CLIENTE ── */}
      {highDemand.length > 0 && (
        <section className="glass-card p-4 sm:p-5 border-2 border-orange-500/25 bg-gradient-to-br from-orange-500/[0.04] to-transparent">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-display font-semibold text-base flex items-center gap-2">
              <TrendingUp size={18} className="text-orange-500" />
              Clientes com maior demanda
              <Badge variant="outline" className="text-[10px]">baseado em pendentes vs estoque</Badge>
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {highDemand.map(d => (
              <div key={d.clientId} className="rounded-xl border border-orange-500/30 bg-card p-3 flex flex-col items-center text-center gap-2">
                <ClientLogo client={d.client as any} size="sm" />
                <div className="min-w-0 w-full">
                  <p className="text-xs font-semibold text-foreground truncate">{d.client?.companyName}</p>
                  <div className="flex items-center justify-center gap-2 mt-1 text-[10px]">
                    <span className="flex items-center gap-0.5 text-destructive font-bold" title="Reels pendentes">
                      <AlertTriangle size={10} />{d.pending}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <span className="flex items-center gap-0.5 text-emerald-600 font-bold" title="Estoque de roteiros">
                      <Package size={10} />{d.stock}
                    </span>
                  </div>
                  <Badge className={`mt-1.5 text-[9px] ${d.score >= 3 ? 'bg-destructive text-destructive-foreground' : d.score >= 1 ? 'bg-amber-500 text-white' : 'bg-muted'}`}>
                    déficit {d.score}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── TABS: Pedidos vs Backlog ── */}
      <Tabs defaultValue="requests" className="w-full">
        <TabsList>
          <TabsTrigger value="requests" className="gap-2">
            <Sparkles size={14} /> Pedidos do Social
            {requests.length > 0 && <Badge variant="secondary" className="h-4 text-[10px]">{requests.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="backlog" className="gap-2">
            <ListChecks size={14} /> Backlog
            {tasks.length > 0 && <Badge variant="secondary" className="h-4 text-[10px]">{tasks.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Prioridade */}
            <section className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" /> Prioridade
                </h3>
                <Badge className="bg-amber-500 text-white">{priorityRequests.length}</Badge>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-460px)] overflow-y-auto pr-1">
                {priorityRequests.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhum pedido prioritário</p>
                )}
                {priorityRequests.map(r => <RequestCard key={r.id} req={r} />)}
              </div>
            </section>

            {/* Pedidos normais */}
            <section className="rounded-2xl border border-border bg-card/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                  <Send size={16} className="text-primary" /> Pedidos gerais
                </h3>
                <Badge variant="secondary">{normalRequests.length}</Badge>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-460px)] overflow-y-auto pr-1">
                {normalRequests.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhum pedido geral</p>
                )}
                {normalRequests.map(r => <RequestCard key={r.id} req={r} />)}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="backlog" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                  <Flame size={16} className="text-destructive" /> Urgentes
                </h3>
                <Badge variant="destructive">{urgentTasks.length}</Badge>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-460px)] overflow-y-auto pr-1">
                {urgentTasks.length === 0 && !loading && (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhuma tarefa urgente</p>
                )}
                {urgentTasks.map(t => <TaskCard key={t.id} task={t} urgent />)}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                  <FileText size={16} className="text-primary" /> Roteiros a fazer
                </h3>
                <Badge variant="secondary">{todoTasks.length}</Badge>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-460px)] overflow-y-auto pr-1">
                {loading && <p className="text-xs text-muted-foreground text-center py-6">Carregando...</p>}
                {!loading && todoTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Fila vazia — bom trabalho!</p>
                )}
                {todoTasks.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: novo pedido ── */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles size={18} className="text-amber-500" /> Solicitar roteiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Cliente *</Label>
              <Select value={requestForm.clientId} onValueChange={(v) => setRequestForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tema *</Label>
              <Input value={requestForm.topic} onChange={e => setRequestForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="Ex: Reels sobre promoção de fim de ano" />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={requestForm.notes} onChange={e => setRequestForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Ângulo desejado, referências, CTA..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Formato</Label>
                <Select value={requestForm.contentFormat} onValueChange={(v) => setRequestForm(f => ({ ...f, contentFormat: v as ScriptContentFormat }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_FORMATS.map(v => <SelectItem key={v} value={v}>{SCRIPT_CONTENT_FORMAT_LABELS[v]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={requestForm.priority} onValueChange={(v) => setRequestForm(f => ({ ...f, priority: v as 'alta' | 'normal' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">🔥 Alta prioridade</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createRequest} className="gap-1.5"><Send size={14} /> Enviar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: finalizar roteiro ── */}
      <Dialog open={!!finalizing} onOpenChange={(open) => !open && setFinalizing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine size={18} /> Finalizar roteiro
              <Badge variant="secondary" className="ml-auto font-mono">{formatDuration(elapsedMs)}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de vídeo</Label>
                <Select value={form.videoType} onValueChange={(v) => setForm(f => ({ ...f, videoType: v as ScriptVideoType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_TYPES.map(v => <SelectItem key={v} value={v}>{SCRIPT_VIDEO_TYPE_LABELS[v]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Formato</Label>
                <Select value={form.contentFormat} onValueChange={(v) => setForm(f => ({ ...f, contentFormat: v as ScriptContentFormat }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_FORMATS.map(v => <SelectItem key={v} value={v}>{SCRIPT_CONTENT_FORMAT_LABELS[v]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Roteiro</Label>
              <Textarea rows={10} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Escreva o roteiro aqui..." />
            </div>
            <div>
              <Label>Legenda (opcional)</Label>
              <Textarea rows={3} value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizing(null)}>Cancelar</Button>
            <Button onClick={saveScript} disabled={saving} className="gap-1.5">
              <CheckCircle2 size={14} /> {saving ? 'Salvando...' : 'Salvar roteiro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
