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
  Send, Trash2, ListChecks, Target, CalendarDays, GripVertical,
  Video, Camera, Image as ImageIcon, Eye, ShieldCheck, Lock
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import ClientLogo from '@/components/ClientLogo';
import UserAvatar from '@/components/UserAvatar';
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
  requested_by: string | null;
  requested_by_name: string | null;
  fulfilled_script_id: string | null;
  fulfilled_at: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
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
  const { clients, scripts, addScript, users } = useApp();
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [requests, setRequests] = useState<ScriptRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<{ taskId?: string; requestId?: string; batchTaskIds?: string[]; startedAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finalizing, setFinalizing] = useState<{ task?: PendingTask; request?: ScriptRequest; batch?: PendingTask[] } | null>(null);
  const [batchForms, setBatchForms] = useState<{ title: string; content: string; caption: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<ScriptRequest | null>(null);
  const canApprove = ['admin', 'gestor_projetos', 'socio_gestor', 'copywriter'].includes(((user as any)?.role) || '');
  const [requestForm, setRequestForm] = useState({
    clientId: '',
    topic: '',
    notes: '',
    contentFormat: 'reels' as ScriptContentFormat,
    priority: 'alta' as 'alta' | 'normal',
  });

  // Diálogo de geração pontual (por cliente + semana)
  const [singleGenOpen, setSingleGenOpen] = useState(false);
  const [singleGenForm, setSingleGenForm] = useState({
    clientId: '',
    weekDate: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (data de referência da semana)
  });
  const [singleGenBusy, setSingleGenBusy] = useState(false);

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
  const activeBatchIds = activeSession?.batchTaskIds || [];
  const activeBatch = activeBatchIds.length > 0 ? tasks.filter(t => activeBatchIds.includes(t.id)) : [];
  const isBusy = !!activeSession;
  const excludedTaskIds = new Set<string>([
    ...(activeSession?.taskId ? [activeSession.taskId] : []),
    ...activeBatchIds,
  ]);

  const priorityRequests = requests.filter(r => r.priority === 'alta' && r.status !== 'in_progress' && r.id !== activeSession?.requestId);
  const normalRequests = requests.filter(r => r.priority === 'normal' && r.status !== 'in_progress' && r.id !== activeSession?.requestId);
  const urgentTasks = tasks.filter(t => t.editing_priority && !excludedTaskIds.has(t.id));
  const todoTasks = tasks.filter(t => !t.editing_priority && !excludedTaskIds.has(t.id));

  const startTask = (task: PendingTask) => {
    if (isBusy) { toast.error('Finalize a tarefa atual antes de iniciar outra'); return; }
    const session = { taskId: task.id, startedAt: Date.now() };
    setActiveSession(session);
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify(session));
    toast.success(`Executando: ${task.title}`);
    broadcastChange();
  };

  const startBatch = (batchTasks: PendingTask[]) => {
    if (isBusy) { toast.error('Finalize a tarefa atual antes de iniciar outra'); return; }
    if (batchTasks.length === 0) return;
    const session = { batchTaskIds: batchTasks.map(t => t.id), startedAt: Date.now() };
    setActiveSession(session);
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify(session));
    toast.success(`Executando lote de ${batchTasks.length} stories`);
    broadcastChange();
  };

  const openStoryBatch = (batchTasks: PendingTask[]) => {
    if (isBusy) { toast.error('Finalize a tarefa atual antes de iniciar outra'); return; }
    if (batchTasks.length === 0) return;
    const session = { batchTaskIds: batchTasks.map(t => t.id), startedAt: Date.now() };
    setActiveSession(session);
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify(session));
    setBatchForms(batchTasks.map(t => ({ title: t.title, content: '', caption: '' })));
    setFinalizing({ batch: batchTasks });
    broadcastChange();
  };

  const openSingleTask = (task: PendingTask) => {
    if (isBusy) { toast.error('Finalize a tarefa atual antes de iniciar outra'); return; }
    const session = { taskId: task.id, startedAt: Date.now() };
    setActiveSession(session);
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify(session));
    setForm({
      title: task.title,
      videoType: 'vendas',
      contentFormat: (['reels', 'story', 'criativo'].includes(task.content_type) ? task.content_type : 'reels') as ScriptContentFormat,
      content: '', caption: '',
    });
    setFinalizing({ task });
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

  const approveRequest = async (req: ScriptRequest) => {
    const approverName = ((user as any)?.name) || ((user as any)?.user_metadata?.name) || user?.email || 'Responsável';
    const { error } = await supabase.from('script_requests').update({
      approved_at: new Date().toISOString(),
      approved_by_name: approverName,
    } as any).eq('id', req.id);
    if (error) { console.error(error); toast.error('Erro ao aprovar pedido'); return; }
    toast.success('Pedido aprovado — liberado para execução');
    setPreviewRequest(null);
    loadAll(true);
    broadcastChange();
  };

  const rejectRequest = async (req: ScriptRequest) => {
    if (!confirm('Rejeitar este pedido? Ele será cancelado.')) return;
    await supabase.from('script_requests').update({ status: 'cancelled' } as any).eq('id', req.id);
    toast.success('Pedido rejeitado');
    setPreviewRequest(null);
    loadAll(true);
    broadcastChange();
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
    if (activeBatch.length > 0) {
      setBatchForms(activeBatch.map(t => ({ title: t.title, content: '', caption: '' })));
      setFinalizing({ batch: activeBatch });
    } else if (activeTask) {
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
    setSaving(true);
    try {
      const durationMs = Date.now() - activeSession.startedAt;
      const durationLabel = formatDuration(durationMs);
      const nowIso = new Date().toISOString();

      // ── LOTE DE STORIES ──
      if (finalizing.batch && finalizing.batch.length > 0) {
        const filled = batchForms
          .map((f, i) => ({ f, task: finalizing.batch![i] }))
          .filter(x => x.f.content.trim());
        if (filled.length === 0) { toast.error('Escreva pelo menos um roteiro'); setSaving(false); return; }
        for (const { f, task } of filled) {
          if (!task.client_id) continue;
          const scriptId = crypto.randomUUID();
          const contentHtml = f.content.trim().startsWith('<')
            ? f.content
            : f.content.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
          const script: Script = {
            id: scriptId,
            clientId: task.client_id,
            title: f.title.trim() || task.title,
            videoType: 'vendas',
            contentFormat: 'story',
            content: contentHtml,
            recorded: false,
            priority: 'normal',
            createdAt: nowIso,
            updatedAt: nowIso,
            isEndomarketing: false,
            caption: f.caption || undefined,
            createdBy: user?.id,
          };
          await addScript(script);
          if (f.caption) {
            await supabase.from('scripts').update({ caption: f.caption } as any).eq('id', scriptId);
          }
          await supabase.from('content_tasks').update({
            script_id: scriptId, updated_at: nowIso,
          } as any).eq('id', task.id);
        }
        toast.success(`${filled.length} stories criadas em ${durationLabel}`);
        setActiveSession(null);
        if (sessionKey) localStorage.removeItem(sessionKey);
        setFinalizing(null);
        setBatchForms([]);
        loadAll(true);
        broadcastChange();
        return;
      }

      if (!form.content.trim()) { toast.error('Escreva o conteúdo do roteiro'); setSaving(false); return; }
      const clientId = finalizing.task?.client_id || finalizing.request?.client_id;
      if (!clientId) { toast.error('Sem cliente vinculado'); setSaving(false); return; }
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
      requested_by_name: users.find(u => u.id === user?.id)?.name || (user as any)?.user_metadata?.name || (user as any)?.name || 'Social Media',
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

  // ── AUTO-GERAÇÃO DE TAREFAS DE ROTEIRO ──
  // Para cada cliente ativo, calcula déficit por formato (reels / criativo / story)
  // comparando demanda semanal com (estoque de roteiros + pendentes) do mesmo formato.
  // Cria placeholders em content_tasks (kanban_column='ideias') para cada déficit.
  const autoGenerateTasks = async (silent = false) => {
    type Fmt = 'reels' | 'criativo' | 'story';
    const FORMATS: { key: Fmt; label: string; weeklyField: 'weeklyReels' | 'weeklyCreatives' | 'weeklyStories' }[] = [
      { key: 'reels', label: 'Reels', weeklyField: 'weeklyReels' },
      { key: 'criativo', label: 'Criativo', weeklyField: 'weeklyCreatives' },
      { key: 'story', label: 'Story', weeklyField: 'weeklyStories' },
    ];

    // Estoque por (clienteId, formato)
    const stockKey = (cid: string, f: Fmt) => `${cid}::${f}`;
    const stockByCF = new Map<string, number>();
    scripts.forEach(s => {
      if (s.recorded || !s.clientId) return;
      const f = (s.contentFormat || 'reels') as Fmt;
      if (!['reels', 'criativo', 'story'].includes(f)) return;
      stockByCF.set(stockKey(s.clientId, f), (stockByCF.get(stockKey(s.clientId, f)) || 0) + 1);
    });

    // Pendentes por (clienteId, formato) — content_tasks em 'ideias' sem script
    const pendingByCF = new Map<string, number>();
    tasks.forEach(t => {
      if (!t.client_id) return;
      const f = t.content_type as Fmt;
      if (!['reels', 'criativo', 'story'].includes(f)) return;
      pendingByCF.set(stockKey(t.client_id, f), (pendingByCF.get(stockKey(t.client_id, f)) || 0) + 1);
    });

    const rows: any[] = [];
    for (const c of clients) {
      const status = (c as any).status || 'ativo';
      if (status === 'cancelado') continue;
      for (const fmt of FORMATS) {
        const target = Math.max(0, Number((c as any)[fmt.weeklyField] || 0));
        if (target <= 0) continue;
        const k = stockKey(c.id, fmt.key);
        const have = (stockByCF.get(k) || 0) + (pendingByCF.get(k) || 0);
        const deficit = target - have;
        if (deficit <= 0) continue;
        for (let i = 0; i < deficit; i++) {
          rows.push({
            client_id: c.id,
            title: `Novo Roteiro ${fmt.label} — ${c.companyName}`,
            content_type: fmt.key,
            kanban_column: 'ideias',
            description: `🤖 Gerado automaticamente pela demanda semanal (${fmt.label}) do cliente`,
            created_by: user?.id ?? null,
          });
        }
      }
    }

    if (rows.length === 0) {
      if (!silent) toast.info('Nenhum cliente com déficit no momento ✅');
      return 0;
    }

    // Inserir em lotes de 20
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      const { error } = await supabase.from('content_tasks').insert(batch as any);
      if (error) {
        console.error('[auto-gerar] erro:', error);
        if (!silent) toast.error('Erro ao gerar tarefas: ' + error.message);
        break;
      }
      inserted += batch.length;
    }

    if (inserted > 0) {
      if (!silent) toast.success(`✨ ${inserted} tarefa(s) de roteiro criada(s) automaticamente`);
      broadcastChange();
      loadAll(true);
    }
    return inserted;
  };

  // Auto-executa 1x por dia por usuário
  useEffect(() => {
    if (loading || !user || clients.length === 0) return;
    const flagKey = `copy_autogen_${user.id}_${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(flagKey)) return;
    localStorage.setItem(flagKey, '1');
    autoGenerateTasks(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, clients.length]);

  // ── DÉFICIT DE UM CLIENTE ESPECÍFICO ──
  const computeClientDeficit = (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return null;
    const formats = [
      { key: 'reels' as const, label: 'Reels', target: Number(c.weeklyReels || 0) },
      { key: 'criativo' as const, label: 'Criativo', target: Number(c.weeklyCreatives || 0) },
      { key: 'story' as const, label: 'Story', target: Number(c.weeklyStories || 0) },
    ];
    const breakdown = formats.map(f => {
      const stock = scripts.filter(s => !s.recorded && s.clientId === clientId && (s.contentFormat || 'reels') === f.key).length;
      const pending = tasks.filter(t => t.client_id === clientId && t.content_type === f.key).length;
      const have = stock + pending;
      const deficit = Math.max(0, f.target - have);
      return { ...f, stock, pending, have, deficit };
    });
    const total = breakdown.reduce((sum, b) => sum + b.deficit, 0);
    return { client: c, breakdown, total };
  };

  const singleGenDeficit = useMemo(
    () => singleGenForm.clientId ? computeClientDeficit(singleGenForm.clientId) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [singleGenForm.clientId, clients, scripts, tasks]
  );

  const generateForClient = async () => {
    if (!singleGenDeficit || singleGenDeficit.total === 0) {
      toast.info('Este cliente não tem déficit no momento ✅');
      return;
    }
    setSingleGenBusy(true);
    // Rótulo da semana a partir da data escolhida
    const d = new Date(singleGenForm.weekDate + 'T00:00:00');
    const weekOfMonth = Math.ceil(d.getDate() / 7);
    const monthLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    const weekLabel = `S${weekOfMonth} · ${monthLabel}`;

    const rows: any[] = [];
    for (const b of singleGenDeficit.breakdown) {
      for (let i = 0; i < b.deficit; i++) {
        rows.push({
          client_id: singleGenDeficit.client.id,
          title: `Novo Roteiro ${b.label} — ${singleGenDeficit.client.companyName} (${weekLabel})`,
          content_type: b.key,
          kanban_column: 'ideias',
          description: `🎯 Gerado manualmente para ${singleGenDeficit.client.companyName} — semana ${weekLabel} (${b.label})`,
          created_by: user?.id ?? null,
        });
      }
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      const { error } = await supabase.from('content_tasks').insert(batch as any);
      if (error) {
        console.error('[gerar-cliente] erro:', error);
        toast.error('Erro ao gerar tarefas: ' + error.message);
        break;
      }
      inserted += batch.length;
    }

    setSingleGenBusy(false);
    if (inserted > 0) {
      toast.success(`✨ ${inserted} tarefa(s) criada(s) para ${singleGenDeficit.client.companyName} (${weekLabel})`);
      broadcastChange();
      loadAll(true);
      setSingleGenOpen(false);
    }
  };


  // ── FILA AGRUPADA POR CATEGORIA ──
  type QueueItem =
    | { kind: 'request'; id: string; priority: 'alta' | 'normal'; req: ScriptRequest }
    | { kind: 'task'; id: string; urgent: boolean; task: PendingTask };

  type GroupKey = 'priority_social' | 'urgent_task' | 'normal_social' | 'backlog_task';

  const GROUP_META: Record<GroupKey, {
    label: string; sub: string; accent: string; badge: string; dot: string;
  }> = {
    priority_social: {
      label: 'Prioridade Social',
      sub: 'Pedidos alta prioridade do social media',
      accent: 'from-red-600/25 to-red-600/5 border-red-600/40',
      badge: 'bg-red-600 text-white',
      dot: 'bg-red-600',
    },
    urgent_task: {
      label: 'Urgentes',
      sub: 'Tarefas marcadas como prioritárias',
      accent: 'from-orange-500/25 to-orange-500/5 border-orange-500/40',
      badge: 'bg-orange-500 text-black',
      dot: 'bg-orange-500',
    },
    normal_social: {
      label: 'Pedidos Social',
      sub: 'Pedidos normais do social media',
      accent: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
      badge: 'bg-amber-500/80 text-black',
      dot: 'bg-amber-500',
    },
    backlog_task: {
      label: 'Backlog',
      sub: 'Demanda automática e roteiros gerais',
      accent: 'from-white/10 to-white/[0.02] border-white/10',
      badge: 'bg-white/15 text-white/80',
      dot: 'bg-white/50',
    },
  };

  const GROUP_ORDER: GroupKey[] = ['priority_social', 'urgent_task', 'normal_social', 'backlog_task'];

  type FormatKey = 'reels' | 'criativo' | 'story' | 'outros';
  const FORMAT_META: Record<FormatKey, {
    label: string; icon: any; accent: string; badge: string; ring: string; text: string;
  }> = {
    reels: {
      label: 'Reels',
      icon: Video,
      accent: 'from-violet-600/20 to-violet-600/[0.03] border-violet-500/30',
      badge: 'bg-violet-500 text-white',
      ring: 'bg-violet-500',
      text: 'text-violet-300',
    },
    criativo: {
      label: 'Criativo',
      icon: ImageIcon,
      accent: 'from-cyan-500/20 to-cyan-500/[0.03] border-cyan-500/30',
      badge: 'bg-cyan-500 text-black',
      ring: 'bg-cyan-500',
      text: 'text-cyan-300',
    },
    story: {
      label: 'Story',
      icon: Camera,
      accent: 'from-fuchsia-500/20 to-fuchsia-500/[0.03] border-fuchsia-500/30',
      badge: 'bg-fuchsia-500 text-white',
      ring: 'bg-fuchsia-500',
      text: 'text-fuchsia-300',
    },
    outros: {
      label: 'Outros',
      icon: FileText,
      accent: 'from-white/8 to-white/[0.02] border-white/10',
      badge: 'bg-white/15 text-white/80',
      ring: 'bg-white/40',
      text: 'text-white/60',
    },
  };
  const FORMAT_ORDER: FormatKey[] = ['reels', 'criativo', 'story', 'outros'];
  const normalizeFormat = (f: string | null | undefined): FormatKey => {
    const v = (f || '').toLowerCase();
    if (v === 'reels' || v === 'criativo' || v === 'story') return v;
    return 'outros';
  };
  const formatOf = (it: QueueItem): FormatKey =>
    normalizeFormat(it.kind === 'request' ? it.req.content_format : it.task.content_type);

  const groups: Record<GroupKey, QueueItem[]> = useMemo(() => {
    const g: Record<GroupKey, QueueItem[]> = {
      priority_social: priorityRequests.map(r => ({ kind: 'request' as const, id: r.id, priority: 'alta' as const, req: r })),
      urgent_task: urgentTasks.map(t => ({ kind: 'task' as const, id: t.id, urgent: true, task: t })),
      normal_social: normalRequests.map(r => ({ kind: 'request' as const, id: r.id, priority: 'normal' as const, req: r })),
      backlog_task: todoTasks.map(t => ({ kind: 'task' as const, id: t.id, urgent: false, task: t })),
    };
    return g;
  }, [priorityRequests, urgentTasks, normalRequests, todoTasks]);

  // ── ORDEM MANUAL POR GRUPO (drag & drop) ──
  const orderKey = user ? `copy_queue_group_order_${user.id}` : null;
  const [customOrder, setCustomOrder] = useState<Record<string, string[]>>({});
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const toggleBox = (key: string) => {
    setExpandedBoxes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  useEffect(() => {
    if (!orderKey) return;
    try {
      const raw = localStorage.getItem(orderKey);
      setCustomOrder(raw ? JSON.parse(raw) : {});
    } catch { /* ignore */ }
  }, [orderKey]);

  const keyOf = (it: QueueItem) => `${it.kind}-${it.id}`;

  const orderedGroups: Record<GroupKey, QueueItem[]> = useMemo(() => {
    const out = {} as Record<GroupKey, QueueItem[]>;
    for (const gk of GROUP_ORDER) {
      const items = groups[gk];
      const order = customOrder[gk] || [];
      if (order.length === 0) { out[gk] = items; continue; }
      const map = new Map(items.map(it => [keyOf(it), it]));
      const seen = new Set<string>();
      const first: QueueItem[] = [];
      for (const k of order) {
        const it = map.get(k);
        if (it) { first.push(it); seen.add(k); }
      }
      out[gk] = [...first, ...items.filter(it => !seen.has(keyOf(it)))];
    }
    return out;
  }, [groups, customOrder]);

  const totalQueue = GROUP_ORDER.reduce((n, k) => n + orderedGroups[k].length, 0);

  const sortClientBoxes = <T extends { clientId: string }>(gk: GroupKey, fmt: FormatKey, boxes: T[]): T[] => {
    const order = customOrder[`${gk}::${fmt}::boxes`] || [];
    if (order.length === 0) return boxes;
    const map = new Map(boxes.map(b => [b.clientId, b]));
    const seen = new Set<string>();
    const first: T[] = [];
    for (const cid of order) {
      const it = map.get(cid);
      if (it) { first.push(it); seen.add(cid); }
    }
    return [...first, ...boxes.filter(b => !seen.has(b.clientId))];
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const dropId = result.source.droppableId;
    if (result.destination.droppableId !== dropId) return;
    if (result.destination.index === result.source.index) return;

    // Caixinhas de cliente: `${gk}::${fmt}::boxes` — reordena por clientId.
    if (dropId.endsWith('::boxes')) {
      const [gkStr, fmtStr] = dropId.split('::');
      const gk = gkStr as GroupKey;
      const fmt = fmtStr as FormatKey;
      const items = orderedGroups[gk].filter(it => formatOf(it) === fmt && it.kind === 'task') as Extract<QueueItem, { kind: 'task' }>[];
      const byClient = new Map<string, Extract<QueueItem, { kind: 'task' }>[]>();
      for (const it of items) {
        const cid = it.task.client_id || '__no_client__';
        if (!byClient.has(cid)) byClient.set(cid, []);
        byClient.get(cid)!.push(it);
      }
      let boxes: { clientId: string }[];
      if (fmt === 'story') {
        boxes = [];
        for (const [cid, ts] of byClient) {
          for (let i = 0; i < ts.length; i += 5) boxes.push({ clientId: cid });
        }
      } else {
        boxes = Array.from(byClient.keys()).map(cid => ({ clientId: cid }));
      }
      const sorted = sortClientBoxes(gk, fmt, boxes);
      const arr = [...sorted];
      const [moved] = arr.splice(result.source.index, 1);
      arr.splice(result.destination.index, 0, moved);
      // Ordem única por clientId (mantém primeira ocorrência para story em lotes)
      const newOrder: string[] = [];
      const seen = new Set<string>();
      for (const b of arr) { if (!seen.has(b.clientId)) { newOrder.push(b.clientId); seen.add(b.clientId); } }
      const next = { ...customOrder, [dropId]: newOrder };
      setCustomOrder(next);
      if (orderKey) { try { localStorage.setItem(orderKey, JSON.stringify(next)); } catch { /* ignore */ } }
      return;
    }

    // Linhas normais: `${gk}::${fmt}`
    const [gkStr, fmtStr] = dropId.split('::');
    const gk = gkStr as GroupKey;
    const fmt = fmtStr as FormatKey;
    const subItems = orderedGroups[gk].filter(it => formatOf(it) === fmt);
    const items = [...subItems];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    const newOrder = items.map(keyOf);
    const next = { ...customOrder, [dropId]: newOrder };
    setCustomOrder(next);
    if (orderKey) {
      try { localStorage.setItem(orderKey, JSON.stringify(next)); } catch { /* ignore */ }
    }
  };




  const elapsedMs = activeSession ? now - activeSession.startedAt : 0;

  // ── UI Components (aesthetic: Pulse Academy — dark netflix-style) ──
  const highDemand = clientDemand.filter(d => d.score > 0).slice(0, 6);

  const QueueRow = ({ item, index, dragHandleProps }: { item: QueueItem; index: number; dragHandleProps?: any }) => {
    const isReq = item.kind === 'request';
    const client = isReq ? clientById(item.req.client_id) : clientById(item.task.client_id);
    const title = isReq ? item.req.topic : item.task.title;
    const fmtKey = formatOf(item);
    const fmtMeta = FORMAT_META[fmtKey];
    const FmtIcon = fmtMeta.icon;
    const isHigh = isReq ? item.priority === 'alta' : item.urgent;
    const tagLabel = isReq ? (item.priority === 'alta' ? 'Prioridade Social' : 'Pedido Social') : (item.urgent ? 'Urgente' : 'Backlog');
    const tagColor = isHigh ? 'bg-red-600 text-white' : 'bg-white/10 text-white/70';
    const onStart = () => isReq ? startRequest(item.req) : startTask(item.task);
    const onCancel = isReq ? () => cancelRequest(item.req.id) : undefined;

    return (
      <div
        className={`group relative flex items-center gap-3 p-2.5 rounded-lg border transition-all overflow-hidden ${
          isHigh
            ? 'bg-red-600/[0.06] border-red-600/25 hover:border-red-600/50'
            : 'bg-zinc-900/40 border-white/5 hover:border-white/20'
        }`}
      >
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${fmtMeta.ring}`} aria-hidden />
        <button
          {...(dragHandleProps || {})}
          className="text-white/25 hover:text-white/70 cursor-grab active:cursor-grabbing shrink-0 p-1 -ml-1 ml-1"
          title="Arrastar para reordenar"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical size={14} />
        </button>
        <div className="w-8 h-8 rounded-md bg-black/60 border border-white/10 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-black italic tracking-tight text-white/70 tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
        <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-white/5 bg-zinc-950 flex items-center justify-center">
          {client ? <ClientLogo client={client as any} size="sm" /> : <FileText size={14} className="text-white/30" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-sm ${fmtMeta.badge}`}>
              <FmtIcon size={9} /> {fmtMeta.label}
            </span>
            <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-sm ${tagColor}`}>{tagLabel}</span>
            {isReq && <span className="text-[8px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">Briefing Social</span>}
          </div>
          <p className="text-[12px] font-black uppercase tracking-tight text-white/95 truncate" title={title}>{title}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40 truncate">
            {client?.companyName || (isReq ? 'Sem cliente' : (item.task.prospect_name || 'Sem cliente'))}
          </p>
          {isReq && (item.req.requested_by || item.req.requested_by_name) && (() => {
            const reqUser = users.find(u => u.id === item.req.requested_by);
            const name = reqUser?.name || item.req.requested_by_name || 'Social Media';
            return (
              <div className="mt-1 flex items-center gap-1.5">
                <UserAvatar user={{ name, avatarUrl: reqUser?.avatarUrl }} size="sm" className="!w-5 !h-5 !text-[8px]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60 truncate">{name}</span>
              </div>
            );
          })()}
          {isReq && item.req.notes && (
            <div className="mt-1.5 rounded-md border-l-2 border-amber-500/60 bg-amber-500/[0.06] px-2 py-1.5">
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-amber-400/80 mb-0.5">Observações do Social</p>
              <p className="text-[11px] text-white/80 leading-snug whitespace-pre-wrap break-words">{item.req.notes}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isReq && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPreviewRequest(item.req)}
              className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10 border border-white/10"
              title="Pré-visualizar pedido"
            >
              <Eye size={13} />
            </Button>
          )}
          <Button
            size="sm"
            onClick={onStart}
            disabled={isBusy}
            className={`h-8 px-3 gap-1.5 font-black uppercase italic tracking-widest text-[10px] ${
              isHigh ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-white text-black hover:bg-zinc-200'
            }`}
            title="Iniciar execução"
          >
            <Play size={11} className="fill-current" /> Iniciar
          </Button>
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 w-8 p-0 text-white/40 hover:text-red-500 hover:bg-red-500/10">
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-10 py-5 sm:py-8 space-y-6">
        {/* ── HEADER Pulse Copy ── */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-white/10 pb-5">
          <div className="flex items-center gap-4">
            <motion.div
              animate={{ scale: [1, 1.05, 1], rotate: [0, -2, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-12 h-12 rounded-xl bg-red-600/15 border border-red-600/30 flex items-center justify-center shrink-0"
            >
              <PenLine size={22} className="text-red-500" />
            </motion.div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-red-600 mb-1">Copywriter Hub</p>
              <h1 className="text-2xl sm:text-4xl font-black italic uppercase tracking-tighter leading-none">
                Pulse <span className="text-red-600">Copy</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 mt-1.5">
                Uma execução ativa por vez · Fila priorizada · Pedidos do social em destaque
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setSingleGenOpen(true)} className="bg-white/10 hover:bg-white/20 text-white gap-1.5 h-9 px-4 font-black uppercase italic tracking-widest text-[10px] border border-white/10">
              <Target size={12} /> Gerar por cliente
            </Button>
            <Button onClick={() => autoGenerateTasks(false)} className="bg-white/10 hover:bg-white/20 text-white gap-1.5 h-9 px-4 font-black uppercase italic tracking-widest text-[10px] border border-white/10">
              <Sparkles size={12} /> Auto-gerar
            </Button>
            <Button onClick={() => setRequestDialogOpen(true)} className="bg-red-600 hover:bg-red-700 text-white gap-1.5 h-9 px-4 font-black uppercase italic tracking-widest text-[10px]">
              <PlusCircle size={12} /> Novo pedido
            </Button>
          </div>
        </header>

        {/* ── SPOTLIGHT: execução ao vivo ── */}
        <AnimatePresence>
          {(activeTask || activeRequest || activeBatch.length > 0) && (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="relative overflow-hidden rounded-2xl border border-red-600/40 bg-gradient-to-br from-red-600/15 via-red-600/5 to-transparent p-5 shadow-[0_0_40px_rgba(220,38,38,0.15)]"
            >
              <div className="absolute top-3 left-4 flex items-center gap-2">
                <motion.span className="w-2 h-2 rounded-full bg-red-500 inline-block"
                  animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
                <span className="text-[9px] font-black uppercase tracking-[0.35em] text-red-500">Ao Vivo</span>
                {activeRequest && (
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded-sm">
                    Pedido Social
                  </span>
                )}
                {activeBatch.length > 0 && (
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-fuchsia-300 border border-fuchsia-500/40 px-1.5 py-0.5 rounded-sm">
                    Lote {activeBatch.length}× Story
                  </span>
                )}
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-5 pt-6">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-16 h-16 rounded-2xl bg-red-600/20 border border-red-600/40 flex items-center justify-center shrink-0"
                >
                  <PenLine size={28} className="text-red-500" />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter truncate">
                    {activeBatch.length > 0
                      ? `Lote de ${activeBatch.length} Stories`
                      : (activeTask?.title || activeRequest?.topic)}
                  </h2>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 truncate mt-1">
                    {(clientById(activeTask?.client_id || activeRequest?.client_id || activeBatch[0]?.client_id)?.companyName)
                      || activeTask?.prospect_name || 'Sem cliente'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-4xl font-mono font-black text-white tabular-nums leading-none">
                      {formatDuration(elapsedMs)}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mt-1.5">Tempo</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={openFinalize} className="bg-white text-black hover:bg-zinc-200 gap-1.5 h-9 font-black uppercase italic tracking-widest text-[10px]">
                      <CheckCircle2 size={12} /> Finalizar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelSession} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5 h-8 font-black uppercase italic tracking-widest text-[10px]">
                      <Pause size={11} /> Cancelar
                    </Button>
                  </div>
                </div>
              </div>
              {activeRequest && activeRequest.notes && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.35em] text-amber-400 mb-1.5">Briefing do Social · Observações</p>
                  <p className="text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap break-words">{activeRequest.notes}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── FILA DE ROTEIROS (unificada) ── */}
        <section className="rounded-2xl border border-white/5 bg-gradient-to-b from-zinc-900/60 to-zinc-900/20 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-600/25 to-red-600/5 border border-red-600/30 flex items-center justify-center">
                <ListChecks size={18} className="text-red-500" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.35em] text-red-600 mb-0.5">Fila de Produção</p>
                <h2 className="text-lg sm:text-xl font-black italic uppercase tracking-tighter">Roteiros a fazer</h2>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> Prioridade {priorityRequests.length + urgentTasks.length}</span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/40 inline-block" /> Backlog {normalRequests.length + todoTasks.length}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-white">{totalQueue} totais</span>
            </div>
          </div>

          {loading ? (
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40 text-center py-10">Carregando fila…</p>
          ) : totalQueue === 0 ? (
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-500/80 text-center py-10">
              ✅ Fila vazia — nada pendente
            </p>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="space-y-5 max-h-[640px] overflow-y-auto pr-1">
                {GROUP_ORDER.map(gk => {
                  const items = orderedGroups[gk];
                  if (items.length === 0) return null;
                  const meta = GROUP_META[gk];
                  return (
                    <div key={gk} className={`rounded-xl border bg-gradient-to-b ${meta.accent} p-3`}>
                      <div className="flex items-center justify-between mb-2.5 px-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${meta.dot} inline-block`} />
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/95 leading-none">{meta.label}</p>
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40 mt-0.5">{meta.sub}</p>
                          </div>
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-[0.25em] px-2 py-0.5 rounded-sm ${meta.badge}`}>
                          {items.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {FORMAT_ORDER.map(fmt => {
                          const rawSub = items.filter(it => formatOf(it) === fmt);
                          if (rawSub.length === 0) return null;
                          const dropId = `${gk}::${fmt}`;
                          const order = customOrder[dropId] || [];
                          let subItems = rawSub;
                          if (order.length > 0) {
                            const map = new Map(rawSub.map(it => [keyOf(it), it]));
                            const seen = new Set<string>();
                            const first: QueueItem[] = [];
                            for (const k of order) {
                              const it = map.get(k);
                              if (it) { first.push(it); seen.add(k); }
                            }
                            subItems = [...first, ...rawSub.filter(it => !seen.has(keyOf(it)))];
                          }
                          const fMeta = FORMAT_META[fmt];
                          const FIcon = fMeta.icon;
                          return (
                            <div key={dropId} className={`rounded-lg border bg-gradient-to-b ${fMeta.accent} p-2.5`}>
                              <div className="flex items-center justify-between mb-2 px-0.5">
                                <div className="flex items-center gap-2">
                                  <div className={`w-6 h-6 rounded-md ${fMeta.badge} flex items-center justify-center`}>
                                    <FIcon size={12} />
                                  </div>
                                  <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${fMeta.text}`}>{fMeta.label}</p>
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-sm ${fMeta.badge}`}>
                                  {subItems.length}
                                </span>
                              </div>
                              {fmt === 'story' ? (() => {
                                // Requests permanecem individuais; tasks são agrupadas em lotes de 5 por cliente.
                                const reqItems = subItems.filter(it => it.kind === 'request');
                                const taskItems = subItems.filter(it => it.kind === 'task') as Extract<QueueItem, { kind: 'task' }>[];
                                const byClient = new Map<string, PendingTask[]>();
                                for (const it of taskItems) {
                                  const cid = it.task.client_id || '__no_client__';
                                  if (!byClient.has(cid)) byClient.set(cid, []);
                                  byClient.get(cid)!.push(it.task);
                                }
                                const clientBoxes: { clientId: string; tasks: PendingTask[]; batchIndex: number }[] = [];
                                for (const [cid, ts] of byClient) {
                                  let batchIndex = 0;
                                  for (let i = 0; i < ts.length; i += 5) {
                                    clientBoxes.push({ clientId: cid, tasks: ts.slice(i, i + 5), batchIndex: batchIndex++ });
                                  }
                                }
                                return (
                                  <div className="space-y-2">
                                    {reqItems.map((item, idx) => (
                                      <QueueRow key={`${item.kind}-${item.id}`} item={item} index={idx} />
                                    ))}
                                    {clientBoxes.length > 0 && (() => {
                                      const boxesDropId = `${gk}::${fmt}::boxes`;
                                      const allSorted = sortClientBoxes(gk, fmt, clientBoxes);
                                      const activeKey = Array.from(expandedBoxes).find(k =>
                                        k.startsWith('story::') && allSorted.some(b => `story::${b.clientId}::${b.batchIndex}` === k)
                                      );
                                      const sorted = activeKey
                                        ? allSorted.filter(b => `story::${b.clientId}::${b.batchIndex}` === activeKey)
                                        : allSorted;
                                      const gridCls = activeKey
                                        ? 'grid grid-cols-1 gap-2'
                                        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2';
                                      return (
                                        <Droppable droppableId={boxesDropId}>
                                          {(provided) => (
                                            <div
                                              ref={provided.innerRef}
                                              {...provided.droppableProps}
                                              className={gridCls}
                                            >
                                              {sorted.map((b, bIdx) => {
                                                const client = clientById(b.clientId);
                                                const isFull = b.tasks.length === 5;
                                                const draggableId = `storybox-${b.clientId}-${b.batchIndex}`;
                                                return (
                                                  <Draggable key={draggableId} draggableId={draggableId} index={bIdx}>
                                                    {(prov, snapshot) => (
                                                      <div
                                                        ref={prov.innerRef}
                                                        {...prov.draggableProps}
                                                        {...prov.dragHandleProps}
                                                        style={{
                                                          ...prov.draggableProps.style,
                                                          opacity: snapshot.isDragging ? 0.85 : 1,
                                                        }}
                                                      >
                                                        {(() => {
                                                          const boxKey = `story::${b.clientId}::${b.batchIndex}`;
                                                          const expanded = expandedBoxes.has(boxKey);
                                                          return (
                                                            <div className="flex flex-col">
                                                              <button
                                                                type="button"
                                                                onClick={() => toggleBox(boxKey)}
                                                                className={`w-full group relative rounded-lg border p-2.5 text-left overflow-hidden transition-all cursor-grab active:cursor-grabbing
                                                                  ${isFull
                                                                    ? 'border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-600/15 via-fuchsia-500/5 to-transparent hover:border-fuchsia-400 hover:shadow-[0_0_0_1px_rgba(217,70,239,0.4)]'
                                                                    : 'border-dashed border-fuchsia-500/25 bg-fuchsia-500/[0.03] hover:border-fuchsia-400/60'}
                                                                  ${expanded ? 'ring-1 ring-fuchsia-400/60' : ''}`}
                                                                title={`${client?.companyName || 'Sem cliente'} — ${b.tasks.length}/5 stories`}
                                                              >
                                                                <span className={`absolute left-0 top-0 bottom-0 w-1 ${isFull ? 'bg-fuchsia-500' : 'bg-fuchsia-500/40'}`} aria-hidden />
                                                                <div className="flex items-center gap-2 pl-1.5">
                                                                  <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-white/5 bg-zinc-950 flex items-center justify-center">
                                                                    {client ? <ClientLogo client={client as any} size="sm" /> : <FileText size={14} className="text-white/30" />}
                                                                  </div>
                                                                  <div className="flex-1 min-w-0">
                                                                    <p className="text-[11px] font-black uppercase tracking-tight text-white/95 truncate leading-tight">
                                                                      {client?.companyName || 'Sem cliente'}
                                                                    </p>
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                      <Camera size={9} className="text-fuchsia-300" />
                                                                      <span className={`text-[9px] font-black tabular-nums tracking-wider ${isFull ? 'text-fuchsia-300' : 'text-fuchsia-200/70'}`}>
                                                                        {b.tasks.length}/5 STORY
                                                                      </span>
                                                                    </div>
                                                                  </div>
                                                                </div>
                                                              </button>
                                                              {expanded && (
                                                                <div className="mt-2 space-y-1.5 pl-1">
                                                                  {isFull && (
                                                                    <Button
                                                                      size="sm"
                                                                      onClick={() => openStoryBatch(b.tasks)}
                                                                      disabled={isBusy}
                                                                      className="w-full h-8 gap-1.5 font-black uppercase italic tracking-widest text-[10px] bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                                                                    >
                                                                      <Play size={11} className="fill-current" /> Iniciar lote (5)
                                                                    </Button>
                                                                  )}
                                                                  {b.tasks.map((t, tIdx) => (
                                                                    <QueueRow
                                                                      key={`sb-row-${t.id}`}
                                                                      item={{ kind: 'task', id: t.id, task: t, urgent: t.editing_priority } as QueueItem}
                                                                      index={tIdx}
                                                                    />
                                                                  ))}
                                                                  {!isFull && (
                                                                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-fuchsia-200/50 px-1">
                                                                      Aguardando {5 - b.tasks.length} para fechar lote
                                                                    </p>
                                                                  )}
                                                                </div>
                                                              )}
                                                            </div>
                                                          );
                                                        })()}
                                                      </div>
                                                    )}
                                                  </Draggable>
                                                );
                                              })}
                                              {provided.placeholder}
                                            </div>
                                          )}
                                        </Droppable>
                                      );
                                    })()}
                                  </div>
                                );
                              })() : (() => {
                                // Reels / Criativo: requests como linhas + tasks agrupadas em caixinhas por cliente.
                                const reqItems = subItems.filter(it => it.kind === 'request');
                                const taskItems = subItems.filter(it => it.kind === 'task') as Extract<QueueItem, { kind: 'task' }>[];
                                const byClient = new Map<string, PendingTask[]>();
                                for (const it of taskItems) {
                                  const cid = it.task.client_id || '__no_client__';
                                  if (!byClient.has(cid)) byClient.set(cid, []);
                                  byClient.get(cid)!.push(it.task);
                                }
                                const clientBoxes = Array.from(byClient.entries()).map(([clientId, ts]) => ({
                                  clientId,
                                  tasks: ts.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
                                }));
                                const accent = fmt === 'reels'
                                  ? { border: 'border-violet-500/40', hoverBorder: 'hover:border-violet-400', bg: 'from-violet-600/15 via-violet-500/5 to-transparent', bar: 'bg-violet-500', icon: 'text-violet-300', count: 'text-violet-300', shadow: 'hover:shadow-[0_0_0_1px_rgba(139,92,246,0.4)]' }
                                  : { border: 'border-cyan-500/40', hoverBorder: 'hover:border-cyan-400', bg: 'from-cyan-600/15 via-cyan-500/5 to-transparent', bar: 'bg-cyan-500', icon: 'text-cyan-300', count: 'text-cyan-300', shadow: 'hover:shadow-[0_0_0_1px_rgba(34,211,238,0.4)]' };
                                const fmtLabel = fmt === 'reels' ? 'REELS' : 'CRIAT.';
                                return (
                                  <div className="space-y-2">
                                    {reqItems.length > 0 && (
                                      <Droppable droppableId={dropId}>
                                        {(provided) => (
                                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                            {reqItems.map((item, idx) => (
                                              <Draggable key={`${item.kind}-${item.id}`} draggableId={`${item.kind}-${item.id}`} index={idx}>
                                                {(prov, snapshot) => (
                                                  <div
                                                    ref={prov.innerRef}
                                                    {...prov.draggableProps}
                                                    {...prov.dragHandleProps}
                                                    style={{
                                                      ...prov.draggableProps.style,
                                                      opacity: snapshot.isDragging ? 0.85 : 1,
                                                      cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                                                    }}
                                                  >
                                                    <QueueRow item={item} index={idx} dragHandleProps={prov.dragHandleProps} />
                                                  </div>
                                                )}
                                              </Draggable>
                                            ))}
                                            {provided.placeholder}
                                          </div>
                                        )}
                                      </Droppable>
                                    )}
                                    {clientBoxes.length > 0 && (() => {
                                      const boxesDropId = `${gk}::${fmt}::boxes`;
                                      const allSorted = sortClientBoxes(gk, fmt, clientBoxes);
                                      const activeKey = Array.from(expandedBoxes).find(k =>
                                        k.startsWith(`${fmt}::`) && allSorted.some(b => `${fmt}::${b.clientId}` === k)
                                      );
                                      const sorted = activeKey
                                        ? allSorted.filter(b => `${fmt}::${b.clientId}` === activeKey)
                                        : allSorted;
                                      const gridCls = activeKey
                                        ? 'grid grid-cols-1 gap-2'
                                        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2';
                                      return (
                                        <Droppable droppableId={boxesDropId}>
                                          {(provided) => (
                                            <div
                                              ref={provided.innerRef}
                                              {...provided.droppableProps}
                                              className={gridCls}
                                            >
                                              {sorted.map((b, bIdx) => {
                                                const client = clientById(b.clientId);
                                                const count = b.tasks.length;
                                                const draggableId = `${fmt}box-${b.clientId}`;
                                                return (
                                                  <Draggable key={draggableId} draggableId={draggableId} index={bIdx}>
                                                    {(prov, snapshot) => (
                                                      <div
                                                        ref={prov.innerRef}
                                                        {...prov.draggableProps}
                                                        {...prov.dragHandleProps}
                                                        style={{
                                                          ...prov.draggableProps.style,
                                                          opacity: snapshot.isDragging ? 0.85 : 1,
                                                        }}
                                                      >
                                                        {(() => {
                                                          const boxKey = `${fmt}::${b.clientId}`;
                                                          const expanded = expandedBoxes.has(boxKey);
                                                          return (
                                                            <div className="flex flex-col">
                                                              <button
                                                                type="button"
                                                                onClick={() => toggleBox(boxKey)}
                                                                className={`w-full group relative rounded-lg border p-2.5 text-left overflow-hidden transition-all cursor-grab active:cursor-grabbing ${accent.border} bg-gradient-to-br ${accent.bg} ${accent.hoverBorder} ${accent.shadow} ${expanded ? 'ring-1 ring-white/30' : ''}`}
                                                                title={`${client?.companyName || 'Sem cliente'} — ${count} ${fmtLabel}`}
                                                              >
                                                                <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent.bar}`} aria-hidden />
                                                                <div className="flex items-center gap-2 pl-1.5">
                                                                  <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-white/5 bg-zinc-950 flex items-center justify-center">
                                                                    {client ? <ClientLogo client={client as any} size="sm" /> : <FileText size={14} className="text-white/30" />}
                                                                  </div>
                                                                  <div className="flex-1 min-w-0">
                                                                    <p className="text-[11px] font-black uppercase tracking-tight text-white/95 truncate leading-tight">
                                                                      {client?.companyName || 'Sem cliente'}
                                                                    </p>
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                      {fmt === 'reels'
                                                                        ? <Video size={9} className={accent.icon} />
                                                                        : <ImageIcon size={9} className={accent.icon} />}
                                                                      <span className={`text-[9px] font-black tabular-nums tracking-wider ${accent.count}`}>
                                                                        {count} {fmtLabel}
                                                                      </span>
                                                                    </div>
                                                                  </div>
                                                                </div>
                                                              </button>
                                                              {expanded && (
                                                                <div className="mt-2 space-y-1.5 pl-1">
                                                                  {b.tasks.map((t, tIdx) => (
                                                                    <QueueRow
                                                                      key={`${fmt}-row-${t.id}`}
                                                                      item={{ kind: 'task', id: t.id, task: t, urgent: t.editing_priority } as QueueItem}
                                                                      index={tIdx}
                                                                    />
                                                                  ))}
                                                                </div>
                                                              )}
                                                            </div>
                                                          );
                                                        })()}
                                                      </div>
                                                    )}
                                                  </Draggable>
                                                );
                                              })}
                                              {provided.placeholder}
                                            </div>
                                          )}
                                        </Droppable>
                                      );
                                    })()}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </section>

        {/* ── DEMANDA POR CLIENTE ── */}
        {highDemand.length > 0 && (
          <section className="rounded-2xl border border-white/5 bg-gradient-to-b from-zinc-900/60 to-zinc-900/20 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500/25 to-orange-500/5 border border-orange-500/30 flex items-center justify-center">
                  <TrendingUp size={18} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.35em] text-orange-500 mb-0.5">Sinal de demanda</p>
                  <h2 className="text-lg sm:text-xl font-black italic uppercase tracking-tighter">Clientes precisando</h2>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">pendentes vs estoque</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {highDemand.map(d => (
                <div key={d.clientId} className="rounded-xl border border-orange-500/20 bg-black/40 p-3 flex flex-col items-center text-center gap-2 hover:border-orange-500/50 transition-colors">
                  <ClientLogo client={d.client as any} size="sm" />
                  <div className="min-w-0 w-full">
                    <p className="text-[11px] font-black uppercase tracking-tight text-white/90 truncate">{d.client?.companyName}</p>
                    <div className="flex items-center justify-center gap-2 mt-1 text-[10px]">
                      <span className="flex items-center gap-0.5 text-red-500 font-black tabular-nums" title="Pendentes">
                        <AlertTriangle size={10} />{d.pending}
                      </span>
                      <span className="text-zinc-700">/</span>
                      <span className="flex items-center gap-0.5 text-emerald-500 font-black tabular-nums" title="Estoque">
                        <Package size={10} />{d.stock}
                      </span>
                    </div>
                    <span className={`inline-block mt-1.5 text-[8px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-sm ${
                      d.score >= 3 ? 'bg-red-600 text-white' : d.score >= 1 ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/60'
                    }`}>
                      Déficit {d.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


      {/* ── Dialog: gerar tarefas para cliente específico ── */}
      <Dialog open={singleGenOpen} onOpenChange={setSingleGenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target size={18} className="text-primary" /> Gerar tarefas para cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Cliente *</Label>
              <Select value={singleGenForm.clientId} onValueChange={(v) => setSingleGenForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                <SelectContent>
                  {clients
                    .filter(c => ((c as any).status || 'ativo') !== 'cancelado')
                    .sort((a, b) => a.companyName.localeCompare(b.companyName))
                    .map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><CalendarDays size={12} /> Data / semana de referência *</Label>
              <Input
                type="date"
                value={singleGenForm.weekDate}
                onChange={e => setSingleGenForm(f => ({ ...f, weekDate: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground mt-1">A semana será calculada a partir da data escolhida (ex.: S2 · nov 2025).</p>
            </div>

            {singleGenDeficit && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Déficit atual</p>
                  <Badge className={singleGenDeficit.total > 0 ? 'bg-orange-500 text-white' : 'bg-emerald-500 text-white'}>
                    {singleGenDeficit.total > 0 ? `${singleGenDeficit.total} a criar` : 'Sem déficit ✅'}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {singleGenDeficit.breakdown.map(b => (
                    <div key={b.key} className="rounded-lg border border-border bg-card p-2 text-center">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold">{b.label}</p>
                      <p className="text-lg font-bold text-foreground tabular-nums">{b.deficit}</p>
                      <p className="text-[10px] text-muted-foreground">
                        meta {b.target} · tem {b.have}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!singleGenForm.clientId && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Selecione um cliente para ver o déficit por formato.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleGenOpen(false)}>Cancelar</Button>
            <Button
              onClick={generateForClient}
              disabled={singleGenBusy || !singleGenDeficit || singleGenDeficit.total === 0}
              className="gap-1.5"
            >
              <Sparkles size={14} />
              {singleGenBusy ? 'Gerando...' : singleGenDeficit ? `Gerar ${singleGenDeficit.total} tarefa(s)` : 'Gerar tarefas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {finalizing?.batch ? (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Lote de <b>{finalizing.batch.length} stories</b> — preencha cada roteiro abaixo. Deixe em branco para pular.
              </p>
              {finalizing.batch.map((t, i) => {
                const bf = batchForms[i] || { title: t.title, content: '', caption: '' };
                const updateBf = (patch: Partial<typeof bf>) => {
                  setBatchForms(prev => {
                    const next = [...prev];
                    next[i] = { ...bf, ...patch };
                    return next;
                  });
                };
                return (
                  <div key={t.id} className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/[0.03] p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-sm bg-fuchsia-500 text-white">
                        Story {String(i + 1).padStart(2, '0')}
                      </span>
                      <Input
                        className="h-8 text-sm flex-1"
                        value={bf.title}
                        onChange={e => updateBf({ title: e.target.value })}
                        placeholder="Título"
                      />
                    </div>
                    <Textarea
                      rows={4}
                      value={bf.content}
                      onChange={e => updateBf({ content: e.target.value })}
                      placeholder={`Roteiro do story ${i + 1}...`}
                    />
                    <Input
                      value={bf.caption}
                      onChange={e => updateBf({ caption: e.target.value })}
                      placeholder="Legenda (opcional)"
                      className="h-8 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizing(null)}>Cancelar</Button>
            <Button onClick={saveScript} disabled={saving} className="gap-1.5">
              <CheckCircle2 size={14} /> {saving ? 'Salvando...' : 'Salvar roteiro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PRÉ-VISUALIZAÇÃO / APROVAÇÃO DO PEDIDO ── */}
      <Dialog open={!!previewRequest} onOpenChange={(open) => !open && setPreviewRequest(null)}>
        <DialogContent className="max-w-2xl bg-[#0a0a0a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Eye size={18} className="text-red-500" />
              <span className="font-black uppercase italic tracking-tight">Prévia do Pedido de Roteiro</span>
            </DialogTitle>
          </DialogHeader>
          {previewRequest && (() => {
            const c = clientById(previewRequest.client_id);
            const fmt = (['reels', 'story', 'criativo'].includes(previewRequest.content_format) ? previewRequest.content_format : 'reels') as ScriptContentFormat;
            const fmtMeta = FORMAT_META[fmt];
            const FmtIcon = fmtMeta.icon;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-sm ${fmtMeta.badge}`}>
                    <FmtIcon size={12} /> {fmtMeta.label}
                  </span>
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-sm ${previewRequest.priority === 'alta' ? 'bg-red-600 text-white' : 'bg-white/10 text-white/70'}`}>
                    {previewRequest.priority === 'alta' ? 'Prioridade Alta' : 'Prioridade Normal'}
                  </span>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-md overflow-hidden border border-white/10 bg-zinc-950 flex items-center justify-center shrink-0">
                    {c ? <ClientLogo client={c as any} size="sm" /> : <FileText size={16} className="text-white/30" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Cliente</p>
                    <p className="text-sm font-bold text-white truncate">{c?.companyName || 'Sem cliente'}</p>
                  </div>
                </div>

                {(previewRequest.requested_by || previewRequest.requested_by_name) && (() => {
                  const reqUser = users.find(u => u.id === previewRequest.requested_by);
                  const name = reqUser?.name || previewRequest.requested_by_name || 'Social Media';
                  return (
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3">
                      <UserAvatar user={{ name, avatarUrl: reqUser?.avatarUrl }} size="md" />
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Solicitado por</p>
                        <p className="text-sm font-bold text-white truncate">{name}</p>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-500 mb-1.5">Tema do Roteiro</p>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-lg font-black italic uppercase tracking-tight text-white leading-tight whitespace-pre-wrap break-words">
                      {previewRequest.topic}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-400 mb-1.5">Observações do Social</p>
                  <div className="rounded-lg border-l-4 border-amber-500/60 bg-amber-500/[0.05] p-4 min-h-[80px]">
                    {previewRequest.notes ? (
                      <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap break-words">{previewRequest.notes}</p>
                    ) : (
                      <p className="text-sm text-white/40 italic">Sem observações adicionais.</p>
                    )}
                  </div>
                </div>

                <p className="text-[10px] text-white/40 uppercase tracking-widest">
                  Criado em {new Date(previewRequest.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setPreviewRequest(null)} className="border-white/20 text-white hover:bg-white/10">
              Fechar
            </Button>
            {previewRequest && previewRequest.status === 'pending' && (
              <Button
                onClick={() => { const r = previewRequest; setPreviewRequest(null); startRequest(r); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-black uppercase italic tracking-widest text-[11px]"
              >
                <Play size={14} className="fill-current" /> Iniciar agora
              </Button>
            )}
            {previewRequest && previewRequest.status === 'pending' && canApprove && (
              <Button
                variant="outline"
                onClick={() => rejectRequest(previewRequest)}
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 gap-1.5"
              >
                <Trash2 size={14} /> Cancelar pedido
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
