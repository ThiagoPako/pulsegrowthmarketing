import { useState, useMemo } from 'react';
import { useOnboarding, ONBOARDING_STAGES, OnboardingTask, OnboardingStage } from '@/hooks/useOnboarding';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import ClientLogo from '@/components/ClientLogo';
import { Kanban, List, CheckCircle, FileText, Copy, Palette, ArrowRight, Clock, User } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-muted text-muted-foreground' },
  em_andamento: { label: 'Em Andamento', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  concluido: { label: 'Concluído', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  contrato: <FileText size={14} />,
  briefing: <Copy size={14} />,
  identidade_visual: <Palette size={14} />,
  concluido: <CheckCircle size={14} />,
};

interface ClientOnboardingGroup {
  clientId: string;
  companyName: string;
  color: string;
  logoUrl: string | null;
  responsiblePerson: string;
  whatsapp: string;
  niche: string | null;
  tasks: OnboardingTask[];
  currentStage: OnboardingStage;
  progress: number;
  completedCount: number;
  totalCount: number;
}

export default function OnboardingManagement() {
  const { tasksQuery, updateOnboardingTask } = useOnboarding();
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [selectedTask, setSelectedTask] = useState<OnboardingTask | null>(null);

  const tasks = tasksQuery.data || [];

  // Group tasks by client
  const clientGroups = useMemo(() => {
    const map = new Map<string, ClientOnboardingGroup>();
    
    tasks.forEach(t => {
      if (!map.has(t.client_id)) {
        map.set(t.client_id, {
          clientId: t.client_id,
          companyName: t.clients?.company_name || 'Cliente',
          color: t.clients?.color || '217 91% 60%',
          logoUrl: t.clients?.logo_url || null,
          responsiblePerson: t.clients?.responsible_person || '',
          whatsapp: t.clients?.whatsapp || '',
          niche: t.clients?.niche || null,
          tasks: [],
          currentStage: 'contrato',
          progress: 0,
          completedCount: 0,
          totalCount: 0,
        });
      }
      map.get(t.client_id)!.tasks.push(t);
    });

    // Calculate current stage and progress for each client
    const stageOrder: OnboardingStage[] = ['contrato', 'briefing', 'identidade_visual', 'concluido'];
    
    map.forEach(group => {
      const completed = group.tasks.filter(t => t.status === 'concluido').length;
      group.completedCount = completed;
      group.totalCount = group.tasks.length;
      group.progress = group.totalCount > 0 ? Math.round((completed / group.totalCount) * 100) : 0;

      // Determine current stage: first non-completed task's stage, or 'concluido' if all done
      if (completed === group.totalCount && group.totalCount > 0) {
        group.currentStage = 'concluido';
      } else {
        const firstPending = stageOrder.find(stage => 
          group.tasks.some(t => t.stage === stage && t.status !== 'concluido')
        );
        group.currentStage = firstPending || 'contrato';
      }
    });

    return Array.from(map.values());
  }, [tasks]);

  // Group clients by their current stage for kanban view
  const clientsByStage = useMemo(() => {
    const result: Record<string, ClientOnboardingGroup[]> = {};
    ONBOARDING_STAGES.forEach(s => { result[s.key] = []; });
    clientGroups.forEach(g => {
      if (result[g.currentStage]) {
        result[g.currentStage].push(g);
      }
    });
    return result;
  }, [clientGroups]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Onboarding de Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe cada etapa do processo de integração
            <Badge variant="secondary" className="ml-2 text-[10px]">{clientGroups.length} clientes</Badge>
          </p>
        </div>
        <Tabs value={view} onValueChange={v => setView(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="kanban" className="text-xs gap-1"><Kanban size={14} /> Kanban</TabsTrigger>
            <TabsTrigger value="lista" className="text-xs gap-1"><List size={14} /> Lista</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ONBOARDING_STAGES.map(stage => (
            <div key={stage.key} className="min-w-[300px] w-[300px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${stage.color})` }} />
                <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
                <Badge variant="secondary" className="text-[10px] h-5 ml-auto">
                  {clientsByStage[stage.key]?.length || 0}
                </Badge>
              </div>
              <div className="space-y-2.5">
                {clientsByStage[stage.key]?.map(group => (
                  <ClientKanbanCard key={group.clientId} group={group} onSelectTask={setSelectedTask} />
                ))}
                {clientsByStage[stage.key]?.length === 0 && (
                  <div className="rounded-xl border border-dashed p-6 text-center">
                    <p className="text-xs text-muted-foreground">Nenhum cliente nesta etapa</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {clientGroups.map(group => (
            <ClientListCard key={group.clientId} group={group} onSelectTask={setSelectedTask} />
          ))}
          {clientGroups.length === 0 && (
            <div className="border rounded-xl p-8 text-center text-muted-foreground">
              Nenhum cliente em onboarding
            </div>
          )}
        </div>
      )}

      {selectedTask && (
        <OnboardingDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTask(null)} />
      )}
    </div>
  );
}

/* ── Kanban Card ── */
function ClientKanbanCard({ group, onSelectTask }: { group: ClientOnboardingGroup; onSelectTask: (t: OnboardingTask) => void }) {
  const stageOrder: OnboardingStage[] = ['contrato', 'briefing', 'identidade_visual', 'concluido'];

  return (
    <Card className="p-3 space-y-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ClientLogo client={{ companyName: group.companyName, color: group.color, logoUrl: group.logoUrl }} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{group.companyName}</p>
          {group.responsiblePerson && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <User size={10} /> {group.responsiblePerson}
            </p>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{group.completedCount}/{group.totalCount} etapas</span>
          <span className="font-semibold">{group.progress}%</span>
        </div>
        <Progress value={group.progress} className="h-1.5" />
      </div>

      {/* Stage pipeline visual */}
      <div className="flex items-center gap-1">
        {stageOrder.filter(s => s !== 'concluido').map((stageKey, i) => {
          const task = group.tasks.find(t => t.stage === stageKey);
          const isDone = task?.status === 'concluido';
          const isActive = task?.status === 'em_andamento';
          const stage = ONBOARDING_STAGES.find(s => s.key === stageKey)!;

          return (
            <div key={stageKey} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => task && onSelectTask(task)}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium w-full justify-center transition-all
                  ${isDone
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : isActive
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-600'
                      : 'bg-muted text-muted-foreground'}
                  ${task ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                `}
                title={`${stage.label}: ${task ? STATUS_CONFIG[task.status]?.label : 'Sem tarefa'}`}
              >
                {isDone ? <CheckCircle size={10} /> : STAGE_ICONS[stageKey]}
                <span className="truncate hidden sm:inline">{stage.label.split(' ')[0]}</span>
              </button>
              {i < 2 && <ArrowRight size={10} className="text-muted-foreground/40 flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Active task details */}
      {group.tasks.filter(t => t.status !== 'concluido').slice(0, 1).map(task => (
        <button
          key={task.id}
          onClick={() => onSelectTask(task)}
          className="w-full text-left p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Clock size={10} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Próxima etapa:</span>
          </div>
          <p className="text-xs font-medium mt-0.5">{task.title}</p>
          <Badge className={`text-[9px] mt-1 ${STATUS_CONFIG[task.status]?.color}`}>
            {STATUS_CONFIG[task.status]?.label}
          </Badge>
        </button>
      ))}
    </Card>
  );
}

/* ── List Card ── */
function ClientListCard({ group, onSelectTask }: { group: ClientOnboardingGroup; onSelectTask: (t: OnboardingTask) => void }) {
  const stageOrder: OnboardingStage[] = ['contrato', 'briefing', 'identidade_visual'];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <ClientLogo client={{ companyName: group.companyName, color: group.color, logoUrl: group.logoUrl }} size="md" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{group.companyName}</p>
            {group.niche && <Badge variant="outline" className="text-[10px]">{group.niche}</Badge>}
          </div>
          {group.responsiblePerson && (
            <p className="text-xs text-muted-foreground">{group.responsiblePerson}</p>
          )}
        </div>

        {/* Progress */}
        <div className="w-24 space-y-1">
          <Progress value={group.progress} className="h-2" />
          <p className="text-[10px] text-muted-foreground text-center">{group.progress}%</p>
        </div>

        {/* Stage pills */}
        <div className="flex items-center gap-1.5">
          {stageOrder.map((stageKey, i) => {
            const task = group.tasks.find(t => t.stage === stageKey);
            const isDone = task?.status === 'concluido';
            const isActive = task?.status === 'em_andamento';
            const stage = ONBOARDING_STAGES.find(s => s.key === stageKey)!;

            return (
              <div key={stageKey} className="flex items-center gap-1">
                <button
                  onClick={() => task && onSelectTask(task)}
                  className={`
                    flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all
                    ${isDone
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : isActive
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-1 ring-blue-300'
                        : 'bg-muted text-muted-foreground'}
                    ${task ? 'cursor-pointer hover:opacity-80' : ''}
                  `}
                >
                  {isDone ? <CheckCircle size={11} /> : STAGE_ICONS[stageKey]}
                  {stage.label}
                </button>
                {i < 2 && <ArrowRight size={10} className="text-muted-foreground/30" />}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ── Detail Sheet ── */
function OnboardingDetailSheet({ task, open, onOpenChange }: { task: OnboardingTask; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { updateOnboardingTask } = useOnboarding();
  const [contractUrl, setContractUrl] = useState(task.contract_url || '');

  const handleMarkSent = async () => {
    await updateOnboardingTask.mutateAsync({ id: task.id, contract_sent: true, status: 'em_andamento' } as any);
    toast.success('Contrato marcado como enviado');
  };

  const handleMarkSigned = async () => {
    await updateOnboardingTask.mutateAsync({ id: task.id, contract_signed: true, status: 'concluido', completed_at: new Date().toISOString() } as any);
    toast.success('Contrato assinado!');
  };

  const handleSaveContract = async () => {
    await updateOnboardingTask.mutateAsync({ id: task.id, contract_url: contractUrl } as any);
    toast.success('Contrato salvo');
  };

  const handleMarkBriefingComplete = async () => {
    await updateOnboardingTask.mutateAsync({ id: task.id, briefing_completed: true, status: 'concluido', completed_at: new Date().toISOString() } as any);
    toast.success('Briefing concluído!');
  };

  const handleIdentityDecision = async (wantsNew: boolean) => {
    await updateOnboardingTask.mutateAsync({ id: task.id, wants_new_identity: wantsNew, status: wantsNew ? 'em_andamento' : 'concluido', completed_at: wantsNew ? null : new Date().toISOString() } as any);
    toast.success(wantsNew ? 'Tarefa de criação de identidade visual gerada' : 'Identidade visual existente mantida');
  };

  const handleComplete = async () => {
    await updateOnboardingTask.mutateAsync({ id: task.id, status: 'concluido', completed_at: new Date().toISOString() } as any);
    toast.success('Tarefa concluída!');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
            <span className="truncate">{task.title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{ONBOARDING_STAGES.find(s => s.key === task.stage)?.label}</Badge>
            <Badge className={STATUS_CONFIG[task.status]?.color}>{STATUS_CONFIG[task.status]?.label}</Badge>
          </div>

          <Separator />

          {task.stage === 'contrato' && (
            <div className="space-y-3">
              <div>
                <Label>Link do contrato</Label>
                <div className="flex gap-2">
                  <Input value={contractUrl} onChange={e => setContractUrl(e.target.value)} placeholder="https://..." />
                  <Button size="sm" variant="outline" onClick={handleSaveContract}>Salvar</Button>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileText size={16} />
                <span className="text-sm">Contrato enviado</span>
                <Switch checked={task.contract_sent} onCheckedChange={() => handleMarkSent()} className="ml-auto" disabled={task.contract_sent} />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle size={16} />
                <span className="text-sm">Contrato assinado</span>
                <Switch checked={task.contract_signed} onCheckedChange={() => handleMarkSigned()} className="ml-auto" disabled={task.contract_signed || !task.contract_sent} />
              </div>
            </div>
          )}

          {task.stage === 'briefing' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium mb-1">Link do Briefing</p>
                <p className="text-xs text-muted-foreground mb-2">Envie este link para o cliente preencher.</p>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/briefing/${task.client_id}`);
                  toast.success('Link copiado!');
                }}>
                  <Copy size={12} /> Copiar Link
                </Button>
              </div>
              {task.briefing_completed ? (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">✅ Briefing preenchido</p>
                </div>
              ) : (
                <Button onClick={handleMarkBriefingComplete} variant="outline" className="w-full">Marcar como concluído</Button>
              )}
            </div>
          )}

          {task.stage === 'identidade_visual' && (
            <div className="space-y-3">
              <p className="text-sm font-medium">O cliente deseja criar nova identidade visual?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={task.wants_new_identity === true ? 'default' : 'outline'} onClick={() => handleIdentityDecision(true)} className="gap-1">
                  <Palette size={14} /> Sim, criar nova
                </Button>
                <Button variant={task.wants_new_identity === false ? 'default' : 'outline'} onClick={() => handleIdentityDecision(false)} className="gap-1">
                  Não, manter atual
                </Button>
              </div>
              {task.wants_new_identity && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                  <p className="font-medium text-amber-700 dark:text-amber-400">🎨 Tarefa de identidade visual será gerada no módulo Designer.</p>
                </div>
              )}
            </div>
          )}

          {task.status !== 'concluido' && (
            <Button onClick={handleComplete} className="w-full gap-1 mt-4">
              <CheckCircle size={16} /> Concluir Tarefa
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
