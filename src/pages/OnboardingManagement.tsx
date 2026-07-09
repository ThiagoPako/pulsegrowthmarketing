import { useState, useMemo, useRef, useEffect } from 'react';
import { useOnboarding, ONBOARDING_STAGES, OnboardingTask, OnboardingStage } from '@/hooks/useOnboarding';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import ClientLogo from '@/components/ClientLogo';
import {
  CheckCircle, FileText, Palette, ArrowRight, Clock, User,
  Camera, Upload, ExternalLink, Copy, Sparkles, Image as ImageIcon,
  Phone, Mail, MapPin, Building2, Trash2, Link2, Rocket,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-muted text-muted-foreground',
  em_andamento: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  concluido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

interface ClientGroup {
  clientId: string;
  companyName: string;
  color: string;
  logoUrl: string | null;
  responsiblePerson: string;
  whatsapp: string;
  niche: string | null;
  email: string;
  city: string;
  phone: string;
  photoPreference: string;
  hasPhotoShoot: boolean;
  briefingData: any;
  clientType: string;
  editorial: string | null;
  driveFotos: string | null;
  driveIdentidade: string | null;
  tasks: OnboardingTask[];
  currentStage: OnboardingStage;
  completedStages: OnboardingStage[];
}

export default function OnboardingManagement() {
  const { tasksQuery, deleteOnboardingClient, moveClientToStage } = useOnboarding();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [draggingClientId, setDraggingClientId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);


  const tasks = tasksQuery.data || [];

  const clientGroups = useMemo(() => {
    const map = new Map<string, ClientGroup>();
    tasks.forEach(t => {
      if (!map.has(t.client_id)) {
        const c = t.clients;
        map.set(t.client_id, {
          clientId: t.client_id,
          companyName: c?.company_name || 'Cliente',
          color: c?.color || '217 91% 60%',
          logoUrl: c?.logo_url || null,
          responsiblePerson: c?.responsible_person || '',
          whatsapp: c?.whatsapp || '',
          niche: c?.niche || null,
          email: c?.email || '',
          city: c?.city || '',
          phone: c?.phone || '',
          photoPreference: c?.photo_preference || 'nao_precisa',
          hasPhotoShoot: c?.has_photo_shoot || false,
          briefingData: c?.briefing_data || {},
          clientType: c?.client_type || 'novo',
          editorial: c?.editorial || null,
          driveFotos: c?.drive_fotos || null,
          driveIdentidade: c?.drive_identidade_visual || null,
          tasks: [],
          currentStage: 'cliente_novo',
          completedStages: [],
        });
      }
      map.get(t.client_id)!.tasks.push(t);
    });

    map.forEach(group => {
      group.completedStages = group.tasks
        .filter(t => t.status === 'concluido')
        .map(t => t.stage as OnboardingStage);

      const activeTasks = group.tasks
        .filter(t => t.status !== 'concluido')
        .sort((a, b) =>
          ONBOARDING_STAGES.findIndex(s => s.key === a.stage) -
          ONBOARDING_STAGES.findIndex(s => s.key === b.stage)
        );

      const allDone = group.tasks.length > 0 && activeTasks.length === 0;
      group.currentStage = allDone
        ? 'cliente_bordo'
        : (activeTasks[0]?.stage as OnboardingStage) || 'cliente_novo';
    });

    return Array.from(map.values());
  }, [tasks]);

  const clientsByStage = useMemo(() => {
    const result: Record<string, ClientGroup[]> = {};
    ONBOARDING_STAGES.forEach(s => { result[s.key] = []; });
    clientGroups.forEach(g => {
      if (result[g.currentStage]) result[g.currentStage].push(g);
    });
    return result;
  }, [clientGroups]);

  const selectedGroup = selectedClientId
    ? clientGroups.find(g => g.clientId === selectedClientId) || null
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Onboarding de Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Fluxo linear em 7 etapas — do cliente novo à integração completa
          <Badge variant="secondary" className="ml-2 text-[10px]">{clientGroups.length} clientes</Badge>
        </p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {ONBOARDING_STAGES.map(stage => {
          const isOver = dragOverStage === stage.key;
          return (
          <div
            key={stage.key}
            className={`min-w-[260px] w-[260px] flex-shrink-0 rounded-xl transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/40' : ''}`}
            onDragOver={e => { if (draggingClientId) { e.preventDefault(); setDragOverStage(stage.key); } }}
            onDragLeave={() => setDragOverStage(prev => (prev === stage.key ? null : prev))}
            onDrop={e => {
              e.preventDefault();
              if (draggingClientId) {
                const group = clientGroups.find(g => g.clientId === draggingClientId);
                if (group && group.currentStage !== stage.key) {
                  moveClientToStage.mutate({ clientId: draggingClientId, targetStage: stage.key });
                }
              }
              setDraggingClientId(null);
              setDragOverStage(null);
            }}
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${stage.color})` }} />
              <span className="text-[11px] font-bold uppercase tracking-wider">{stage.icon} {stage.label}</span>
              <Badge variant="secondary" className="text-[10px] h-5 ml-auto">
                {clientsByStage[stage.key]?.length || 0}
              </Badge>
            </div>
            <div className="space-y-2.5 min-h-[100px] p-1">
              {clientsByStage[stage.key]?.map(group => (
                <div
                  key={group.clientId}
                  draggable
                  onDragStart={e => {
                    setDraggingClientId(group.clientId);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => { setDraggingClientId(null); setDragOverStage(null); }}
                  className={draggingClientId === group.clientId ? 'opacity-40' : ''}
                >
                  <OnboardingCard
                    group={group}
                    onClick={() => setSelectedClientId(group.clientId)}
                    onDelete={() => deleteOnboardingClient.mutate(group.clientId)}
                  />
                </div>
              ))}
              {clientsByStage[stage.key]?.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    {isOver ? 'Solte aqui' : 'Nenhum cliente'}
                  </p>
                </div>
              )}
            </div>
          </div>
          );
        })}

      </div>

      {selectedGroup && (
        <OnboardingDetailSheet
          group={selectedGroup}
          open={!!selectedGroup}
          onOpenChange={o => !o && setSelectedClientId(null)}
        />
      )}
    </div>
  );
}

/* ── Kanban Card ── */
function OnboardingCard({ group, onClick, onDelete }: { group: ClientGroup; onClick: () => void; onDelete: () => void }) {
  const total = ONBOARDING_STAGES.length;
  const doneCount = group.completedStages.length;
  const progress = Math.round((doneCount / total) * 100);
  const currentTask = group.tasks.find(t => t.status !== 'concluido');
  const currentStageInfo = ONBOARDING_STAGES.find(s => s.key === group.currentStage);

  return (
    <Card className="p-3 space-y-2.5 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group/card relative" onClick={onClick}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover/card:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 z-10"
            onClick={e => e.stopPropagation()}
          >
            <Trash2 size={12} />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={e => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar card de onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as tarefas de onboarding de <strong>{group.companyName}</strong> serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-2">
        <ClientLogo client={{ companyName: group.companyName, color: group.color, logoUrl: group.logoUrl }} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{group.companyName}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <User size={9} /> {group.responsiblePerson}
          </p>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="flex items-center gap-0.5">
        {ONBOARDING_STAGES.map(stage => {
          const isDone = group.completedStages.includes(stage.key);
          const isCurrent = stage.key === group.currentStage && !isDone;
          return (
            <div
              key={stage.key}
              className={`h-1.5 rounded-full flex-1 transition-colors ${
                isDone ? 'bg-emerald-500' : isCurrent ? 'bg-primary animate-pulse' : 'bg-muted'
              }`}
              title={stage.label}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{doneCount}/{total} etapas</span>
        <span className="font-semibold">{progress}%</span>
      </div>

      {currentStageInfo && (
        <div className="p-2 rounded-lg bg-muted/50 text-xs">
          <div className="flex items-center gap-1.5">
            <Clock size={10} className="text-muted-foreground" />
            <span className="font-medium truncate">{currentStageInfo.icon} {currentStageInfo.label}</span>
          </div>
        </div>
      )}

      {group.niche && <Badge variant="outline" className="text-[9px]">{group.niche}</Badge>}
    </Card>
  );
}

/* ── Detail Sheet ── */
function OnboardingDetailSheet({ group, open, onOpenChange }: { group: ClientGroup; open: boolean; onOpenChange: (o: boolean) => void }) {
  const {
    updateOnboardingTask, advanceToNextStage,
    attachEditorial, saveEditorialDraft,
    triggerReformulacaoPerfil, triggerIdentidadeVisual, triggerAgendarFotografia,
    finishOnboarding,
  } = useOnboarding();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const activeTask = group.tasks
    .filter(t => t.status !== 'concluido')
    .sort((a, b) =>
      ONBOARDING_STAGES.findIndex(s => s.key === a.stage) -
      ONBOARDING_STAGES.findIndex(s => s.key === b.stage)
    )[0];

  const allDone = group.tasks.length > 0 && !activeTask;
  const currentStageInfo = ONBOARDING_STAGES.find(s => s.key === (activeTask?.stage || 'cliente_bordo'));

  const handleAdvance = async () => {
    if (!activeTask) return;
    try {
      await advanceToNextStage.mutateAsync({
        clientId: group.clientId,
        currentStage: activeTask.stage as OnboardingStage,
      });
      toast.success('Etapa concluída!');
    } catch (e) {
      console.error(e);
    }
  };

  const handleStart = async () => {
    if (!activeTask) return;
    await updateOnboardingTask.mutateAsync({ id: activeTask.id, status: 'em_andamento' } as any);
    toast.success('Etapa iniciada!');
  };

  const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTask) return;
    setUploading(true);
    try {
      const publicUrl = await uploadFileToVps(file, `contracts/${group.clientId}`);
      await updateOnboardingTask.mutateAsync({
        id: activeTask.id,
        contract_url: publicUrl,
        contract_signed: true,
      } as any);
      toast.success('Contrato enviado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar contrato');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] sm:w-[780px] sm:max-w-[780px] overflow-y-auto p-0">
        {/* Header */}
        <div className="p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              <ClientLogo client={{ companyName: group.companyName, color: group.color, logoUrl: group.logoUrl }} size="md" />
              <div>
                <span className="text-lg">{group.companyName}</span>
                <div className="flex items-center gap-2 mt-1">
                  {group.niche && <Badge variant="outline" className="text-[10px]">{group.niche}</Badge>}
                  <Badge variant="secondary" className="text-[10px]">
                    {group.completedStages.length}/{ONBOARDING_STAGES.length} etapas
                  </Badge>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
            {group.responsiblePerson && <span className="flex items-center gap-1"><User size={11} />{group.responsiblePerson}</span>}
            {group.whatsapp && <span className="flex items-center gap-1"><Phone size={11} />{group.whatsapp}</span>}
            {group.email && <span className="flex items-center gap-1"><Mail size={11} />{group.email}</span>}
            {group.city && <span className="flex items-center gap-1"><MapPin size={11} />{group.city}</span>}
          </div>

          {/* Pipeline */}
          <div className="flex items-center gap-1 mt-4">
            {ONBOARDING_STAGES.map((stage, i) => {
              const isDone = group.completedStages.includes(stage.key);
              const isCurrent = stage.key === (activeTask?.stage || (allDone ? 'cliente_bordo' : ''));
              return (
                <div key={stage.key} className="flex items-center gap-1 flex-1">
                  <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold w-full justify-center transition-all ${
                    isDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : isCurrent ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? <CheckCircle size={10} /> : null}
                    <span className="truncate">{stage.icon}</span>
                  </div>
                  {i < ONBOARDING_STAGES.length - 1 && <ArrowRight size={9} className="text-muted-foreground/40 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body — single stage panel */}
        <div className="p-6 space-y-4">
          {allDone ? (
            <ClienteBordoActions group={group} />
          ) : activeTask ? (
            <>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/15 text-primary text-xs">
                  {currentStageInfo?.icon} {currentStageInfo?.label}
                </Badge>
                <Badge className={STATUS_COLORS[activeTask.status]}>
                  {activeTask.status === 'pendente' ? 'Pendente' : activeTask.status === 'em_andamento' ? 'Em Andamento' : 'Concluído'}
                </Badge>
              </div>
              <Separator />

              {activeTask.stage === 'cliente_novo' && (
                <ClienteNovoActions group={group} task={activeTask} onAdvance={handleAdvance} onStart={handleStart} />
              )}
              {activeTask.stage === 'contrato' && (
                <ContratoActions
                  task={activeTask}
                  fileInputRef={fileInputRef}
                  uploading={uploading}
                  onUpload={handleContractUpload}
                  onAdvance={handleAdvance}
                  onStart={handleStart}
                />
              )}
              {activeTask.stage === 'briefing' && (
                <BriefingActions group={group} task={activeTask} onAdvance={handleAdvance} onStart={handleStart} />
              )}
              {activeTask.stage === 'criar_editorial' && (
                <CriarEditorialActions
                  group={group}
                  task={activeTask}
                  onSaveDraft={(editorial) => saveEditorialDraft.mutateAsync({ clientId: group.clientId, editorial })}
                  onAdvance={handleAdvance}
                  onStart={handleStart}
                />
              )}
              {activeTask.stage === 'anexar_editorial' && (
                <AnexarEditorialActions
                  group={group}
                  task={activeTask}
                  onAttach={(editorial) => attachEditorial.mutateAsync({ clientId: group.clientId, editorial })}
                  onStart={handleStart}
                />
              )}
              {activeTask.stage === 'distribuicao' && (
                <DistribuicaoActions
                  group={group}
                  task={activeTask}
                  onStart={handleStart}
                  onTriggerReformulacao={() => triggerReformulacaoPerfil.mutateAsync(group.clientId)}
                  onTriggerIdentidade={() => triggerIdentidadeVisual.mutateAsync(group.clientId)}
                  onSaveFotografia={(link) => triggerAgendarFotografia.mutateAsync({ clientId: group.clientId, driveLink: link })}
                  onFinish={() => finishOnboarding.mutateAsync(group.clientId)}
                />
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Stage Actions ── */

function ClienteNovoActions({ group, task, onAdvance, onStart }: { group: ClientGroup; task: OnboardingTask; onAdvance: () => void; onStart: () => void }) {
  const briefing = group.briefingData || {};
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Revise as informações do cliente e avance para o contrato.</p>
      <div className="space-y-2">
        <InfoRow icon={<Building2 size={12} />} label="Empresa" value={group.companyName} />
        <InfoRow icon={<User size={12} />} label="Responsável" value={group.responsiblePerson} />
        <InfoRow icon={<Phone size={12} />} label="WhatsApp" value={group.whatsapp} />
        <InfoRow icon={<Mail size={12} />} label="E-mail" value={group.email} />
        <InfoRow icon={<MapPin size={12} />} label="Cidade" value={group.city} />
        {group.niche && <InfoRow icon={<Building2 size={12} />} label="Nicho" value={group.niche} />}
      </div>
      {briefing.social_objectives?.length > 0 && (
        <div className="p-2 rounded-lg bg-muted/50">
          <p className="text-[10px] font-semibold mb-1">Objetivos nas redes:</p>
          <div className="flex flex-wrap gap-1">
            {briefing.social_objectives.map((o: string) => (
              <Badge key={o} variant="secondary" className="text-[9px]">{o}</Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="flex-1 gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" onClick={onAdvance} className="flex-1 gap-1">
          <ArrowRight size={13} /> Avançar para Contrato
        </Button>
      </div>
    </div>
  );
}

function ContratoActions({ task, fileInputRef, uploading, onUpload, onAdvance, onStart }: {
  task: OnboardingTask; fileInputRef: React.RefObject<HTMLInputElement>; uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onAdvance: () => void; onStart: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Faça upload do contrato assinado em PDF.</p>
      {task.contract_url ? (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Contrato enviado</span>
          </div>
          <a href={task.contract_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1 mt-1">
            <ExternalLink size={10} /> Visualizar contrato
          </a>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-xs font-medium">Clique para enviar o contrato</p>
          <p className="text-[10px] text-muted-foreground mt-1">Formato PDF</p>
          {uploading && <p className="text-[11px] text-primary mt-2 animate-pulse">Enviando...</p>}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onUpload} />
      <div className="flex gap-2 pt-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="flex-1 gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" onClick={onAdvance} className="flex-1 gap-1" disabled={!task.contract_url && !task.contract_signed}>
          <ArrowRight size={13} /> Avançar para Briefing
        </Button>
      </div>
    </div>
  );
}

function BriefingActions({ group, task, onAdvance, onStart }: { group: ClientGroup; task: OnboardingTask; onAdvance: () => void; onStart: () => void }) {
  const briefingLink = `${window.location.origin}/onboarding/${group.clientId}`;
  const hasBriefing = group.briefingData && Object.keys(group.briefingData).length > 0;

  const copyBriefingLink = () => {
    navigator.clipboard.writeText(briefingLink);
    toast.success('Link de briefing copiado!');
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Envie o link de briefing para o cliente preencher. Ao concluir, avance para criar o editorial.
      </p>

      <div className="p-3 rounded-lg border">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Link do briefing</Label>
        <div className="flex gap-2 mt-1.5">
          <Input value={briefingLink} readOnly className="text-xs" />
          <Button size="sm" variant="outline" onClick={copyBriefingLink} className="gap-1">
            <Copy size={12} /> Copiar
          </Button>
        </div>
      </div>

      {hasBriefing ? (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Briefing preenchido</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {Object.keys(group.briefingData).length} campos respondidos
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            ⏳ Aguardando o cliente preencher o briefing pelo link.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="flex-1 gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" onClick={onAdvance} className="flex-1 gap-1">
          <ArrowRight size={13} /> Avançar para Criar Editorial
        </Button>
      </div>
    </div>
  );
}

function CriarEditorialActions({ group, task, onSaveDraft, onAdvance, onStart }: {
  group: ClientGroup; task: OnboardingTask;
  onSaveDraft: (editorial: string) => Promise<any>;
  onAdvance: () => void; onStart: () => void;
}) {
  const [editorial, setEditorial] = useState(group.editorial || '');
  useEffect(() => { setEditorial(group.editorial || ''); }, [group.editorial]);

  const briefing = group.briefingData || {};

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Redija a linha editorial com base no briefing do cliente. Esse conteúdo será a fonte de verdade para roteiros e design.
      </p>

      {briefing.brand_voice && (
        <div className="p-2 rounded-lg bg-muted/50 text-xs">
          <span className="font-semibold">Tom de voz:</span> {briefing.brand_voice}
        </div>
      )}

      <div>
        <Label className="text-xs">Linha Editorial</Label>
        <Textarea
          value={editorial}
          onChange={e => setEditorial(e.target.value)}
          placeholder="Descreva a linha editorial: pilares de conteúdo, tom, estilo, temas, calls-to-action..."
          className="text-sm min-h-[280px] mt-1.5 font-mono"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Aceita HTML simples. Este conteúdo será usado pelo sistema para criar roteiros e artes.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onSaveDraft(editorial)} className="gap-1" disabled={!editorial.trim()}>
          <FileText size={13} /> Salvar Rascunho
        </Button>
        <Button
          size="sm"
          onClick={async () => { await onSaveDraft(editorial); onAdvance(); }}
          className="flex-1 gap-1"
          disabled={!editorial.trim()}
        >
          <ArrowRight size={13} /> Editorial Pronto
        </Button>
      </div>
    </div>
  );
}

function AnexarEditorialActions({ group, task, onAttach, onStart }: {
  group: ClientGroup; task: OnboardingTask;
  onAttach: (editorial: string) => Promise<any>;
  onStart: () => void;
}) {
  const [editorial, setEditorial] = useState(group.editorial || '');
  const [editing, setEditing] = useState(!group.editorial);
  useEffect(() => { setEditorial(group.editorial || ''); }, [group.editorial]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Revise o editorial e anexe ao cadastro do cliente. Depois de anexado, o sistema passa a usá-lo para criar roteiros.
      </p>

      {!editing && group.editorial ? (
        <div className="rounded-lg border border-accent bg-accent/10 p-4 max-h-[280px] overflow-auto">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <FileText size={10} /> Linha Editorial
          </p>
          <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: group.editorial }} />
        </div>
      ) : (
        <Textarea
          value={editorial}
          onChange={e => setEditorial(e.target.value)}
          className="text-sm min-h-[280px] font-mono"
          placeholder="Cole ou edite a linha editorial..."
        />
      )}

      <div className="flex gap-2 pt-2 flex-wrap">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setEditing(v => !v)} className="gap-1">
          <FileText size={13} /> {editing ? 'Visualizar' : 'Editar'}
        </Button>
        <Button
          size="sm"
          onClick={() => onAttach(editorial)}
          className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700"
          disabled={!editorial.trim()}
        >
          <CheckCircle size={13} /> Aprovar e Anexar
        </Button>
      </div>
    </div>
  );
}

function DistribuicaoActions({
  group, task, onStart, onTriggerReformulacao, onTriggerIdentidade, onSaveFotografia, onFinish,
}: {
  group: ClientGroup; task: OnboardingTask; onStart: () => void;
  onTriggerReformulacao: () => Promise<any>;
  onTriggerIdentidade: () => Promise<any>;
  onSaveFotografia: (link: string) => Promise<any>;
  onFinish: () => Promise<any>;
}) {
  const [designTasksState, setDesignTasksState] = useState<{ reformulacao: boolean; identidade: boolean }>({ reformulacao: false, identidade: false });
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [driveLink, setDriveLink] = useState(group.driveFotos || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: reforma }, { data: identidade }] = await Promise.all([
        supabase.from('design_tasks').select('id').eq('client_id', group.clientId).ilike('title', '%Reformulação%').limit(1),
        supabase.from('design_tasks').select('id').eq('client_id', group.clientId).ilike('title', '%Identidade Visual%').limit(1),
      ]);
      setDesignTasksState({
        reformulacao: (reforma || []).length > 0,
        identidade: (identidade || []).length > 0,
      });
    })();
  }, [group.clientId]);

  const portalLink = `${window.location.origin}/portal-registro/${group.clientId}`;

  const copyPortalLink = () => {
    navigator.clipboard.writeText(portalLink);
    setCopied(true);
    toast.success('Link do portal copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const hubActions = [
    {
      key: 'reformulacao',
      icon: <ImageIcon size={20} />,
      title: 'Reformulação de Perfil',
      description: '12 tarefas: foto de perfil + 5 destaques + 6 artes',
      done: designTasksState.reformulacao,
      color: 'from-violet-500/10 to-purple-500/10 border-violet-200 dark:border-violet-800',
      onClick: async () => { await onTriggerReformulacao(); setDesignTasksState(s => ({ ...s, reformulacao: true })); },
    },
    {
      key: 'identidade',
      icon: <Palette size={20} />,
      title: 'Criar Identidade Visual',
      description: 'Logotipo, paleta, tipografia e aplicações',
      done: designTasksState.identidade,
      color: 'from-pink-500/10 to-rose-500/10 border-pink-200 dark:border-pink-800',
      onClick: async () => { await onTriggerIdentidade(); setDesignTasksState(s => ({ ...s, identidade: true })); },
    },
    {
      key: 'fotografia',
      icon: <Camera size={20} />,
      title: 'Agendar Fotografia',
      description: 'Link do Drive com ensaio fotográfico',
      done: !!group.driveFotos,
      color: 'from-sky-500/10 to-blue-500/10 border-sky-200 dark:border-sky-800',
      onClick: () => setPhotoDialogOpen(true),
    },
    {
      key: 'portal',
      icon: <Link2 size={20} />,
      title: 'Portal do Cliente',
      description: 'Copiar link para o cliente criar a conta',
      done: false,
      color: 'from-emerald-500/10 to-teal-500/10 border-emerald-200 dark:border-emerald-800',
      onClick: copyPortalLink,
      customBadge: copied ? '✓ Copiado' : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Distribua as tarefas iniciais do cliente. Ao terminar, finalize o onboarding.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {hubActions.map(action => (
          <button
            key={action.key}
            onClick={action.onClick}
            className={`text-left p-4 rounded-xl border bg-gradient-to-br ${action.color} hover:scale-[1.02] transition-transform relative`}
          >
            {(action.done || action.customBadge) && (
              <Badge className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px]">
                {action.customBadge || '✓ Feito'}
              </Badge>
            )}
            <div className="flex items-center gap-2 mb-2 text-primary">
              {action.icon}
              <span className="font-semibold text-sm">{action.title}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{action.description}</p>
          </button>
        ))}
      </div>

      {group.driveFotos && (
        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <a href={group.driveFotos} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <ExternalLink size={11} /> Drive de fotos anexado
          </a>
        </div>
      )}

      <Separator />

      <div className="flex gap-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button
          size="lg"
          onClick={onFinish}
          className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-base font-bold"
        >
          <Rocket size={16} /> Cliente a Bordo — Finalizar Onboarding
        </Button>
      </div>

      {/* Photo dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Fotografia</DialogTitle>
            <DialogDescription>
              Cole o link do Google Drive com o ensaio fotográfico do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Link do Drive</Label>
            <Input
              value={driveLink}
              onChange={e => setDriveLink(e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotoDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!driveLink.trim()) return;
                await onSaveFotografia(driveLink.trim());
                setPhotoDialogOpen(false);
              }}
              disabled={!driveLink.trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClienteBordoActions({ group }: { group: ClientGroup }) {
  return (
    <div className="text-center py-10 space-y-4">
      <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
        <Sparkles size={40} className="text-emerald-500" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">🎉 Cliente Integrado!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {group.companyName} concluiu todas as 7 etapas do onboarding.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground font-medium w-24 shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
