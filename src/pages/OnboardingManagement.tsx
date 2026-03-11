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
import ClientLogo from '@/components/ClientLogo';
import { Kanban, List, CheckCircle, FileText, Send, Palette, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-muted text-muted-foreground' },
  em_andamento: { label: 'Em Andamento', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  concluido: { label: 'Concluído', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

export default function OnboardingManagement() {
  const { tasksQuery, updateOnboardingTask } = useOnboarding();
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [selectedTask, setSelectedTask] = useState<OnboardingTask | null>(null);

  const tasks = tasksQuery.data || [];

  const tasksByStage = useMemo(() => {
    const map: Record<string, OnboardingTask[]> = {};
    ONBOARDING_STAGES.forEach(s => { map[s.key] = []; });
    tasks.forEach(t => {
      if (map[t.stage]) map[t.stage].push(t);
      // If completed, also show in concluido
      if (t.status === 'concluido' && t.stage !== 'concluido') {
        // Already in its stage column
      }
    });
    return map;
  }, [tasks]);

  const handleCopyBriefingLink = (task: OnboardingTask) => {
    const link = `${window.location.origin}/briefing/${task.client_id}`;
    navigator.clipboard.writeText(link);
    toast.success('Link do briefing copiado!');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Onboarding de Clientes</h1>
          <p className="text-sm text-muted-foreground">Acompanhe o processo de integração dos novos clientes</p>
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
            <div key={stage.key} className="min-w-[280px] w-[280px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${stage.color})` }} />
                <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{tasksByStage[stage.key]?.length || 0}</Badge>
              </div>
              <div className="space-y-2">
                {tasksByStage[stage.key]?.map(task => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="bg-card border rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
                      <span className="text-[11px] text-muted-foreground truncate">{task.clients?.company_name}</span>
                    </div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <Badge className={`text-[10px] ${STATUS_CONFIG[task.status]?.color}`}>{STATUS_CONFIG[task.status]?.label}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs">
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Tarefa</th>
                <th className="text-left p-3">Etapa</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Criado</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedTask(task)}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
                      <span className="text-xs font-medium">{task.clients?.company_name}</span>
                    </div>
                  </td>
                  <td className="p-3 font-medium">{task.title}</td>
                  <td className="p-3"><Badge variant="secondary" className="text-[10px]">{ONBOARDING_STAGES.find(s => s.key === task.stage)?.label}</Badge></td>
                  <td className="p-3"><Badge className={`text-[10px] ${STATUS_CONFIG[task.status]?.color}`}>{STATUS_CONFIG[task.status]?.label}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(task.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Sheet */}
      {selectedTask && (
        <OnboardingDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTask(null)} />
      )}
    </div>
  );
}

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
    if (wantsNew) {
      toast.success('Tarefa de criação de identidade visual gerada');
    } else {
      toast.success('Identidade visual existente mantida');
    }
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

          {/* Stage-specific content */}
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
                <p className="text-xs text-muted-foreground mb-2">Envie este link para o cliente preencher as informações da empresa.</p>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                  const link = `${window.location.origin}/briefing/${task.client_id}`;
                  navigator.clipboard.writeText(link);
                  toast.success('Link copiado!');
                }}>
                  <Copy size={12} /> Copiar Link do Briefing
                </Button>
              </div>
              {task.briefing_completed ? (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">✅ Briefing preenchido pelo cliente</p>
                </div>
              ) : (
                <Button onClick={handleMarkBriefingComplete} variant="outline" className="w-full">Marcar briefing como concluído</Button>
              )}
            </div>
          )}

          {task.stage === 'identidade_visual' && (
            <div className="space-y-3">
              <p className="text-sm font-medium">O cliente deseja criar nova identidade visual?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={task.wants_new_identity === true ? 'default' : 'outline'}
                  onClick={() => handleIdentityDecision(true)}
                  className="gap-1"
                >
                  <Palette size={14} /> Sim, criar nova
                </Button>
                <Button
                  variant={task.wants_new_identity === false ? 'default' : 'outline'}
                  onClick={() => handleIdentityDecision(false)}
                  className="gap-1"
                >
                  Não, manter atual
                </Button>
              </div>
              {task.wants_new_identity && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                  <p className="font-medium text-amber-700 dark:text-amber-400">🎨 Tarefa de criação de identidade visual será gerada automaticamente no módulo Designer.</p>
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
