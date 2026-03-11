import { useState, useMemo, useRef } from 'react';
import { useOnboarding, ONBOARDING_STAGES, OnboardingTask, OnboardingStage } from '@/hooks/useOnboarding';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import ClientLogo from '@/components/ClientLogo';
import {
  Kanban, CheckCircle, FileText, Palette, ArrowRight, Clock, User,
  Camera, Upload, ExternalLink, Copy, AlertTriangle, Sparkles, Image, Phone, Mail, MapPin, Building2, CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  tasks: OnboardingTask[];
  currentStage: OnboardingStage;
  allStages: OnboardingStage[];
  completedStages: OnboardingStage[];
}

export default function OnboardingManagement() {
  const { tasksQuery, updateOnboardingTask, advanceToNextStage, createDesignTasksForClient } = useOnboarding();
  const [selectedGroup, setSelectedGroup] = useState<ClientGroup | null>(null);

  const tasks = tasksQuery.data || [];

  const clientGroups = useMemo(() => {
    const map = new Map<string, ClientGroup>();
    tasks.forEach(t => {
      if (!map.has(t.client_id)) {
        const c = t.clients;
        const hasIdentity = c?.briefing_data?.has_identity?.toLowerCase() === 'sim';
        const needsPhotos = c?.photo_preference === 'fotos_reais';

        const allStages: OnboardingStage[] = ['cliente_novo', 'contrato'];
        if (!hasIdentity) allStages.push('identidade_visual');
        if (needsPhotos) allStages.push('fotografia');
        allStages.push('reformulacao_perfil');

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
          tasks: [],
          currentStage: 'cliente_novo',
          allStages,
          completedStages: [],
        });
      }
      map.get(t.client_id)!.tasks.push(t);
    });

    map.forEach(group => {
      group.completedStages = group.tasks
        .filter(t => t.status === 'concluido')
        .map(t => t.stage as OnboardingStage);

      const currentTask = group.tasks.find(t => t.status !== 'concluido');
      group.currentStage = (currentTask?.stage as OnboardingStage) || 
        (group.completedStages.length === group.tasks.length && group.tasks.length > 0 ? 'reformulacao_perfil' : 'cliente_novo');
    });

    return Array.from(map.values());
  }, [tasks]);

  const clientsByStage = useMemo(() => {
    const result: Record<string, ClientGroup[]> = {};
    ONBOARDING_STAGES.forEach(s => { result[s.key] = []; });
    clientGroups.forEach(g => {
      const allDone = g.tasks.length > 0 && g.tasks.every(t => t.status === 'concluido');
      if (allDone) {
        result['reformulacao_perfil']?.push(g);
      } else if (result[g.currentStage]) {
        result[g.currentStage].push(g);
      }
    });
    return result;
  }, [clientGroups]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Onboarding de Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe cada etapa do processo de integração
          <Badge variant="secondary" className="ml-2 text-[10px]">{clientGroups.length} clientes</Badge>
        </p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {ONBOARDING_STAGES.map(stage => (
          <div key={stage.key} className="min-w-[280px] w-[280px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${stage.color})` }} />
              <span className="text-[11px] font-bold uppercase tracking-wider">{stage.icon} {stage.label}</span>
              <Badge variant="secondary" className="text-[10px] h-5 ml-auto">
                {clientsByStage[stage.key]?.length || 0}
              </Badge>
            </div>
            <div className="space-y-2.5 min-h-[100px]">
              {clientsByStage[stage.key]?.map(group => (
                <OnboardingCard key={group.clientId} group={group} onClick={() => setSelectedGroup(group)} />
              ))}
              {clientsByStage[stage.key]?.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <p className="text-[11px] text-muted-foreground">Nenhum cliente</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedGroup && (
        <OnboardingDetailSheet
          group={selectedGroup}
          open={!!selectedGroup}
          onOpenChange={o => !o && setSelectedGroup(null)}
        />
      )}
    </div>
  );
}

/* ── Kanban Card ── */
function OnboardingCard({ group, onClick }: { group: ClientGroup; onClick: () => void }) {
  const progress = group.tasks.length > 0
    ? Math.round((group.completedStages.length / group.allStages.length) * 100)
    : 0;

  const currentTask = group.tasks.find(t => t.status !== 'concluido');

  return (
    <Card className="p-3 space-y-2.5 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all" onClick={onClick}>
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
        {group.allStages.map((stageKey, i) => {
          const isDone = group.completedStages.includes(stageKey);
          const isCurrent = stageKey === group.currentStage && !isDone;
          const stage = ONBOARDING_STAGES.find(s => s.key === stageKey)!;
          return (
            <div key={stageKey} className="flex items-center gap-0.5 flex-1">
              <div
                className={`h-1.5 rounded-full flex-1 transition-colors ${
                  isDone ? 'bg-emerald-500' : isCurrent ? 'bg-primary animate-pulse' : 'bg-muted'
                }`}
                title={stage.label}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{group.completedStages.length}/{group.allStages.length} etapas</span>
        <span className="font-semibold">{progress}%</span>
      </div>

      {currentTask && (
        <div className="p-2 rounded-lg bg-muted/50 text-xs">
          <div className="flex items-center gap-1.5">
            <Clock size={10} className="text-muted-foreground" />
            <span className="font-medium truncate">{currentTask.title}</span>
          </div>
        </div>
      )}

      {group.niche && (
        <Badge variant="outline" className="text-[9px]">{group.niche}</Badge>
      )}
    </Card>
  );
}

/* ── Detail Sheet with 2 Columns ── */
function OnboardingDetailSheet({ group, open, onOpenChange }: { group: ClientGroup; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { updateOnboardingTask, advanceToNextStage, createDesignTasksForClient } = useOnboarding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [driveLink, setDriveLink] = useState('');

  const currentTask = group.tasks.find(t => t.status !== 'concluido');
  const completedTasks = group.tasks.filter(t => t.status === 'concluido').sort(
    (a, b) => new Date(a.completed_at || a.created_at).getTime() - new Date(b.completed_at || b.created_at).getTime()
  );
  const allDone = group.tasks.length > 0 && group.tasks.every(t => t.status === 'concluido');

  const handleAdvance = async () => {
    if (!currentTask) return;
    try {
      await advanceToNextStage.mutateAsync({
        clientId: group.clientId,
        currentStage: currentTask.stage as OnboardingStage,
      });
      toast.success('Avançado para próxima etapa!');
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTask) return;
    setUploading(true);
    try {
      const fileName = `${group.clientId}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('onboarding-contracts')
        .upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('onboarding-contracts')
        .getPublicUrl(data.path);
      await updateOnboardingTask.mutateAsync({
        id: currentTask.id,
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

  const handleSaveDriveLink = async () => {
    if (!currentTask || !driveLink) return;
    try {
      // Save drive link to onboarding task and to client record
      await updateOnboardingTask.mutateAsync({
        id: currentTask.id,
        drive_link: driveLink,
      } as any);
      await supabase
        .from('clients')
        .update({ drive_fotos: driveLink } as any)
        .eq('id', group.clientId);
      toast.success('Link do Drive salvo!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleFinishReformulacao = async () => {
    if (!currentTask) return;
    try {
      await createDesignTasksForClient.mutateAsync(group.clientId);
      await advanceToNextStage.mutateAsync({
        clientId: group.clientId,
        currentStage: currentTask.stage as OnboardingStage,
      });
      toast.success('Tarefas de reformulação criadas! Cliente integrado.');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStartStage = async () => {
    if (!currentTask) return;
    await updateOnboardingTask.mutateAsync({ id: currentTask.id, status: 'em_andamento' } as any);
    toast.success('Etapa iniciada!');
  };

  const briefing = group.briefingData || {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[90vw] sm:w-[800px] sm:max-w-[800px] overflow-y-auto p-0">
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
                    {group.completedStages.length}/{group.allStages.length} etapas
                  </Badge>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>

          {/* Client info bar */}
          <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
            {group.responsiblePerson && (
              <span className="flex items-center gap-1"><User size={11} />{group.responsiblePerson}</span>
            )}
            {group.whatsapp && (
              <span className="flex items-center gap-1"><Phone size={11} />{group.whatsapp}</span>
            )}
            {group.email && (
              <span className="flex items-center gap-1"><Mail size={11} />{group.email}</span>
            )}
            {group.city && (
              <span className="flex items-center gap-1"><MapPin size={11} />{group.city}</span>
            )}
          </div>

          {/* Stage pipeline visual */}
          <div className="flex items-center gap-1 mt-4">
            {group.allStages.map((stageKey, i) => {
              const isDone = group.completedStages.includes(stageKey);
              const isCurrent = stageKey === group.currentStage && !isDone;
              const stage = ONBOARDING_STAGES.find(s => s.key === stageKey)!;
              return (
                <div key={stageKey} className="flex items-center gap-1 flex-1">
                  <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold w-full justify-center transition-all ${
                    isDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : isCurrent ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? <CheckCircle size={10} /> : null}
                    <span className="truncate">{stage.icon} {stage.label}</span>
                  </div>
                  {i < group.allStages.length - 1 && <ArrowRight size={10} className="text-muted-foreground/40 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 min-h-[400px]">
          {/* Left Column - History */}
          <div className="p-5 border-r border-border bg-muted/20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Clock size={12} /> Histórico
            </h3>

            {completedTasks.length === 0 && !allDone && (
              <p className="text-xs text-muted-foreground italic">Nenhuma etapa concluída ainda.</p>
            )}

            <div className="space-y-3">
              {completedTasks.map(task => {
                const stage = ONBOARDING_STAGES.find(s => s.key === task.stage);
                return (
                  <div key={task.id} className="p-3 rounded-lg bg-card border">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                      <span className="text-xs font-semibold">{stage?.icon} {stage?.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{task.title}</p>
                    {task.completed_at && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {format(new Date(task.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}

                    {/* Stage-specific completed info */}
                    {task.stage === 'contrato' && task.contract_url && (
                      <a href={task.contract_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary flex items-center gap-1 mt-1 hover:underline">
                        <FileText size={10} /> Ver contrato assinado
                      </a>
                    )}
                    {task.stage === 'fotografia' && task.drive_link && (
                      <a href={task.drive_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary flex items-center gap-1 mt-1 hover:underline">
                        <ExternalLink size={10} /> Drive do ensaio
                      </a>
                    )}
                  </div>
                );
              })}

              {/* Briefing data summary if available */}
              {Object.keys(briefing).length > 0 && briefing.niche && (
                <div className="p-3 rounded-lg bg-card border mt-2">
                  <h4 className="text-[11px] font-bold mb-2 flex items-center gap-1">
                    <Building2 size={11} /> Dados do Briefing
                  </h4>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    {briefing.niche && <p><strong>Nicho:</strong> {briefing.niche}</p>}
                    {briefing.differentials && <p><strong>Diferenciais:</strong> {briefing.differentials}</p>}
                    {briefing.products_services && <p><strong>Produtos/Serviços:</strong> {briefing.products_services}</p>}
                    {briefing.target_cities && <p><strong>Cidades:</strong> {briefing.target_cities}</p>}
                    {briefing.ideal_client && <p><strong>Cliente ideal:</strong> {briefing.ideal_client}</p>}
                    {briefing.brand_voice && <p><strong>Tom de voz:</strong> {briefing.brand_voice}</p>}
                    {briefing.competitors && <p><strong>Concorrentes:</strong> {briefing.competitors}</p>}
                    {briefing.has_identity && <p><strong>Identidade visual:</strong> {briefing.has_identity === 'sim' ? 'Já possui' : 'Precisa criar'}</p>}
                    {briefing.comfortable_on_camera && <p><strong>Câmera:</strong> {briefing.comfortable_on_camera}</p>}
                  </div>
                </div>
              )}

              {/* Photo preference info */}
              <div className="p-3 rounded-lg bg-card border">
                <h4 className="text-[11px] font-bold mb-1 flex items-center gap-1">
                  <Camera size={11} /> Preferência de Fotos
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  {group.photoPreference === 'fotos_reais' ? '📸 Quer fotos reais' : 
                   group.photoPreference === 'banco_imagens' ? '🖼️ Banco de imagens' : '➖ Não precisa'}
                  {group.photoPreference === 'fotos_reais' && !group.hasPhotoShoot && (
                    <span className="block mt-0.5 text-amber-600">⚠️ Não tem ensaio - Aceita agendar</span>
                  )}
                  {group.photoPreference === 'fotos_reais' && group.hasPhotoShoot && (
                    <span className="block mt-0.5 text-emerald-600">✅ Já tem ensaio fotográfico</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Current Stage Actions */}
          <div className="p-5">
            {allDone ? (
              <div className="text-center py-8 space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                  <CheckCircle size={32} className="text-emerald-500" />
                </div>
                <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Cliente Integrado!</h3>
                <p className="text-xs text-muted-foreground">Todas as etapas de onboarding foram concluídas.</p>
              </div>
            ) : currentTask ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                    <Sparkles size={12} /> Etapa Atual
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/15 text-primary text-xs">
                      {ONBOARDING_STAGES.find(s => s.key === currentTask.stage)?.icon}{' '}
                      {ONBOARDING_STAGES.find(s => s.key === currentTask.stage)?.label}
                    </Badge>
                    <Badge className={STATUS_COLORS[currentTask.status]}>
                      {currentTask.status === 'pendente' ? 'Pendente' : currentTask.status === 'em_andamento' ? 'Em Andamento' : 'Concluído'}
                    </Badge>
                  </div>
                </div>

                <Separator />

                {/* Stage-specific actions */}
                {currentTask.stage === 'cliente_novo' && (
                  <ClienteNovoActions group={group} task={currentTask} onAdvance={handleAdvance} onStart={handleStartStage} />
                )}
                {currentTask.stage === 'contrato' && (
                  <ContratoActions
                    task={currentTask}
                    fileInputRef={fileInputRef}
                    uploading={uploading}
                    onUpload={handleContractUpload}
                    onAdvance={handleAdvance}
                    onStart={handleStartStage}
                  />
                )}
                {currentTask.stage === 'identidade_visual' && (
                  <IdentidadeVisualActions task={currentTask} onAdvance={handleAdvance} onStart={handleStartStage} />
                )}
                {currentTask.stage === 'fotografia' && (
                  <FotografiaActions
                    task={currentTask}
                    driveLink={driveLink}
                    setDriveLink={setDriveLink}
                    onSaveDrive={handleSaveDriveLink}
                    onAdvance={handleAdvance}
                    onStart={handleStartStage}
                  />
                )}
                {currentTask.stage === 'reformulacao_perfil' && (
                  <ReformulacaoActions task={currentTask} onFinish={handleFinishReformulacao} onStart={handleStartStage} />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Stage Action Components ── */

function ClienteNovoActions({ group, task, onAdvance, onStart }: { group: ClientGroup; task: OnboardingTask; onAdvance: () => void; onStart: () => void }) {
  const briefing = group.briefingData || {};
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Revise as informações do cliente enviadas no link de onboarding e avance para a próxima etapa.
      </p>

      <div className="space-y-2">
        <InfoRow icon={<Building2 size={12} />} label="Empresa" value={group.companyName} />
        <InfoRow icon={<User size={12} />} label="Responsável" value={group.responsiblePerson} />
        <InfoRow icon={<Phone size={12} />} label="WhatsApp" value={group.whatsapp} />
        <InfoRow icon={<Mail size={12} />} label="E-mail" value={group.email} />
        <InfoRow icon={<MapPin size={12} />} label="Cidade" value={group.city} />
        {group.niche && <InfoRow icon={<Building2 size={12} />} label="Nicho" value={group.niche} />}
        <InfoRow icon={<Camera size={12} />} label="Fotos" value={
          group.photoPreference === 'fotos_reais' ? 'Fotos reais' :
          group.photoPreference === 'banco_imagens' ? 'Banco de imagens' : 'Não precisa'
        } />
        {briefing.has_identity && (
          <InfoRow icon={<Palette size={12} />} label="Identidade Visual" value={briefing.has_identity === 'sim' ? 'Já possui' : 'Precisa criar'} />
        )}
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
      <p className="text-xs text-muted-foreground">
        Faça upload do contrato assinado em PDF para registrar e avançar.
      </p>

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
          <p className="text-[10px] text-muted-foreground mt-1">PDF, máx 10MB</p>
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
          <ArrowRight size={13} /> Avançar
        </Button>
      </div>
    </div>
  );
}

function IdentidadeVisualActions({ task, onAdvance, onStart }: { task: OnboardingTask; onAdvance: () => void; onStart: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        O cliente não possui identidade visual. Gerencie a criação no módulo Designer e avance quando finalizada.
      </p>

      <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-violet-500" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Criação de identidade visual em andamento</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          A Social Media pode acompanhar e solicitar urgência pelo seu painel.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="flex-1 gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" onClick={onAdvance} className="flex-1 gap-1">
          <ArrowRight size={13} /> Identidade Concluída
        </Button>
      </div>
    </div>
  );
}

function FotografiaActions({ task, driveLink, setDriveLink, onSaveDrive, onAdvance, onStart }: {
  task: OnboardingTask; driveLink: string; setDriveLink: (v: string) => void;
  onSaveDrive: () => void; onAdvance: () => void; onStart: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Adicione o link do Google Drive com as fotos do ensaio fotográfico do cliente.
      </p>

      <div>
        <Label className="text-xs">Link do Drive (Ensaio Fotográfico)</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={driveLink || task.drive_link || ''}
            onChange={e => setDriveLink(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="text-xs"
          />
          <Button size="sm" variant="outline" onClick={onSaveDrive} disabled={!driveLink}>Salvar</Button>
        </div>
      </div>

      {(task.drive_link || driveLink) && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Drive anexado</span>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="flex-1 gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" onClick={onAdvance} className="flex-1 gap-1" disabled={!task.drive_link && !driveLink}>
          <ArrowRight size={13} /> Ensaio Aprovado
        </Button>
      </div>
    </div>
  );
}

function ReformulacaoActions({ task, onFinish, onStart }: { task: OnboardingTask; onFinish: () => void; onStart: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ao finalizar, serão criadas automaticamente as tarefas de reformulação de perfil no módulo Designer:
      </p>

      <div className="space-y-1.5">
        {['Foto de Perfil', '5 Destaques', '6 Artes para o Feed'].map(item => (
          <div key={item} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-xs">
            <Image size={12} className="text-primary" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-[10px] text-muted-foreground">
          💡 As tarefas serão visíveis para o Designer e a Social Media poderá acompanhar e solicitar urgência pelo seu painel.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        {task.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={onStart} className="flex-1 gap-1">
            <Clock size={13} /> Iniciar
          </Button>
        )}
        <Button size="sm" onClick={onFinish} className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700">
          <Sparkles size={13} /> Criar Tarefas & Finalizar
        </Button>
      </div>
    </div>
  );
}

/* ── Helper ── */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground font-medium w-20 shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
