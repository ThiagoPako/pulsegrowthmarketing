import { useEffect, useMemo, useState } from 'react';
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
import { toast } from 'sonner';
import { Play, Pause, CheckCircle2, Flame, FileText, Clock, User as UserIcon, PenLine } from 'lucide-react';
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
  const { clients, addScript } = useApp();
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<{ taskId: string; startedAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finalizing, setFinalizing] = useState<PendingTask | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for finalize dialog
  const [form, setForm] = useState({
    title: '',
    videoType: 'vendas' as ScriptVideoType,
    contentFormat: 'reels' as ScriptContentFormat,
    content: '',
    caption: '',
  });

  const sessionKey = user ? `copy_active_session_${user.id}` : null;

  // Load persisted session
  useEffect(() => {
    if (!sessionKey) return;
    const raw = localStorage.getItem(sessionKey);
    if (raw) {
      try {
        setActiveSession(JSON.parse(raw));
      } catch { /* ignore */ }
    }
  }, [sessionKey]);

  // Live timer tick
  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  const loadTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('content_tasks')
      .select('id, client_id, title, content_type, editing_priority, created_at, prospect_name')
      .eq('kanban_column', 'ideias')
      .is('script_id', null)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      toast.error('Erro ao carregar tarefas');
    } else {
      setTasks((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadTasks(); }, []);

  const clientById = useMemo(() => {
    const map = new Map(clients.map(c => [c.id, c]));
    return (id: string | null) => (id ? map.get(id) : undefined);
  }, [clients]);

  const activeTask = activeSession ? tasks.find(t => t.id === activeSession.taskId) : null;
  const urgentTasks = tasks.filter(t => t.editing_priority && (!activeSession || t.id !== activeSession.taskId));
  const todoTasks = tasks.filter(t => !t.editing_priority && (!activeSession || t.id !== activeSession.taskId));

  const startTask = (task: PendingTask) => {
    if (activeSession && activeSession.taskId !== task.id) {
      toast.error('Finalize ou pause a tarefa atual antes de iniciar outra');
      return;
    }
    const session = { taskId: task.id, startedAt: Date.now() };
    setActiveSession(session);
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify(session));
    toast.success(`Executando: ${task.title}`);
  };

  const cancelSession = () => {
    if (!confirm('Cancelar execução? O tempo será descartado.')) return;
    setActiveSession(null);
    if (sessionKey) localStorage.removeItem(sessionKey);
  };

  const openFinalize = () => {
    if (!activeTask) return;
    setForm({
      title: activeTask.title,
      videoType: 'vendas',
      contentFormat: (['reels', 'story', 'criativo'].includes(activeTask.content_type) ? activeTask.content_type : 'reels') as ScriptContentFormat,
      content: '',
      caption: '',
    });
    setFinalizing(activeTask);
  };

  const saveScript = async () => {
    if (!finalizing || !activeSession) return;
    if (!form.content.trim()) {
      toast.error('Escreva o conteúdo do roteiro');
      return;
    }
    if (!finalizing.client_id) {
      toast.error('Tarefa sem cliente vinculado');
      return;
    }
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
        clientId: finalizing.client_id,
        title: form.title.trim() || finalizing.title,
        videoType: form.videoType,
        contentFormat: form.contentFormat,
        content: contentHtml,
        recorded: false,
        priority: 'normal',
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

      // Link script back to content_task — task remains in 'ideias' (zona de ideias)
      await supabase.from('content_tasks').update({
        script_id: scriptId,
        updated_at: nowIso,
      } as any).eq('id', finalizing.id);

      toast.success(`Roteiro criado em ${durationLabel} — enviado para Zona de Ideias`);

      // Clear session
      setActiveSession(null);
      if (sessionKey) localStorage.removeItem(sessionKey);
      setFinalizing(null);
      loadTasks();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar roteiro');
    } finally {
      setSaving(false);
    }
  };

  const elapsedMs = activeSession ? now - activeSession.startedAt : 0;

  const TaskCard = ({ task, urgent }: { task: PendingTask; urgent?: boolean }) => {
    const client = clientById(task.client_id);
    return (
      <div className={`group relative rounded-xl border p-3 transition-all hover:shadow-md ${urgent ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-card'}`}>
        <div className="flex items-start gap-3">
          {client ? (
            <ClientLogo client={client as any} size="sm" />
          ) : (
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
        <Button
          size="sm"
          className="w-full mt-3 gap-1.5"
          variant={urgent ? 'destructive' : 'default'}
          onClick={() => startTask(task)}
          disabled={!!activeSession}
        >
          <Play size={12} /> Iniciar
        </Button>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
          <PenLine className="text-primary" /> Copy
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Área de trabalho do copywriter — roteiros pendentes por cliente</p>
      </header>

      {/* Active execution spotlight */}
      {activeTask && (
        <div className="mb-6 rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {clientById(activeTask.client_id) && <ClientLogo client={clientById(activeTask.client_id) as any} size="md" />}
              <div className="min-w-0">
                <Badge className="mb-1 gap-1"><Clock size={10} /> Em execução</Badge>
                <h2 className="text-xl font-bold text-foreground truncate">{activeTask.title}</h2>
                <p className="text-sm text-muted-foreground truncate">
                  {clientById(activeTask.client_id)?.companyName || activeTask.prospect_name || 'Sem cliente'} · {activeTask.content_type}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-3xl font-mono font-bold text-primary tabular-nums">{formatDuration(elapsedMs)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">tempo</div>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={openFinalize} className="gap-1.5"><CheckCircle2 size={14} /> Finalizar roteiro</Button>
                <Button variant="outline" size="sm" onClick={cancelSession} className="gap-1.5"><Pause size={12} /> Cancelar</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Urgentes */}
        <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Flame size={16} className="text-red-500" /> Urgentes</h3>
            <Badge variant="destructive">{urgentTasks.length}</Badge>
          </div>
          <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {urgentTasks.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhuma tarefa urgente</p>
            )}
            {urgentTasks.map(t => <TaskCard key={t.id} task={t} urgent />)}
          </div>
        </section>

        {/* A fazer */}
        <section className="rounded-2xl border border-border bg-card/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><FileText size={16} className="text-primary" /> Roteiros a fazer</h3>
            <Badge variant="secondary">{todoTasks.length}</Badge>
          </div>
          <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {loading && <p className="text-xs text-muted-foreground text-center py-6">Carregando...</p>}
            {!loading && todoTasks.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Fila vazia — bom trabalho!</p>
            )}
            {todoTasks.map(t => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>

        {/* Em execução (info) */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Clock size={16} className="text-primary" /> Em execução</h3>
            <Badge>{activeTask ? 1 : 0}</Badge>
          </div>
          {!activeTask ? (
            <div className="text-center py-10">
              <UserIcon className="mx-auto text-muted-foreground mb-2" size={32} />
              <p className="text-xs text-muted-foreground">Selecione um roteiro para iniciar</p>
              <p className="text-[10px] text-muted-foreground mt-1">Apenas 1 execução ativa por vez</p>
            </div>
          ) : (
            <div className="rounded-xl border border-primary bg-background p-3">
              <p className="text-xs text-muted-foreground">Executando agora:</p>
              <p className="font-semibold text-sm text-foreground">{activeTask.title}</p>
              <div className="text-2xl font-mono font-bold text-primary mt-2 tabular-nums">{formatDuration(elapsedMs)}</div>
              <Button size="sm" className="w-full mt-3 gap-1.5" onClick={openFinalize}>
                <CheckCircle2 size={12} /> Finalizar
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Finalize dialog */}
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
              <Textarea
                rows={10}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Escreva o roteiro aqui..."
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Você poderá editar com formatação rica no módulo Roteiros depois de salvar.</p>
            </div>
            <div>
              <Label>Legenda (opcional)</Label>
              <Textarea rows={3} value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Legenda para o post..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizing(null)} disabled={saving}>Voltar</Button>
            <Button onClick={saveScript} disabled={saving} className="gap-1.5">
              <CheckCircle2 size={14} /> {saving ? 'Salvando...' : 'Salvar e enviar para Zona de Ideias'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
