import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type OnboardingStage = 'cliente_novo' | 'contrato' | 'identidade_visual' | 'fotografia' | 'reformulacao_perfil';
export type OnboardingStatus = 'pendente' | 'em_andamento' | 'concluido';

export const ONBOARDING_STAGES: { key: OnboardingStage; label: string; color: string; icon: string }[] = [
  { key: 'cliente_novo', label: 'Cliente Novo', color: '45 93% 47%', icon: '🆕' },
  { key: 'contrato', label: 'Contrato', color: '217 91% 60%', icon: '📄' },
  { key: 'identidade_visual', label: 'Identidade Visual', color: '262 83% 58%', icon: '🎨' },
  { key: 'fotografia', label: 'Fotografia', color: '330 80% 55%', icon: '📸' },
  { key: 'reformulacao_perfil', label: 'Reformulação de Perfil', color: '142 71% 45%', icon: '✅' },
];

export interface OnboardingTask {
  id: string;
  client_id: string;
  stage: OnboardingStage;
  title: string;
  description: string | null;
  status: OnboardingStatus;
  contract_url: string | null;
  contract_sent: boolean;
  contract_signed: boolean;
  briefing_completed: boolean;
  briefing_data: any;
  wants_new_identity: boolean | null;
  use_real_photos: boolean | null;
  photo_warning_shown: boolean;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  drive_link: string | null;
  clients?: {
    company_name: string;
    color: string;
    logo_url: string | null;
    responsible_person: string;
    whatsapp: string;
    niche: string | null;
    photo_preference: string;
    has_photo_shoot: boolean;
    accepts_photo_shoot_cost: boolean;
    briefing_data: any;
    videomaker_id: string | null;
    fixed_day: string;
    fixed_time: string;
    plan_id: string | null;
    client_type: string;
    email: string;
    city: string;
    phone: string;
  };
}

export function useOnboarding() {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['onboarding-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_tasks')
        .select('*, clients(company_name, color, logo_url, responsible_person, whatsapp, niche, photo_preference, has_photo_shoot, accepts_photo_shoot_cost, briefing_data, videomaker_id, fixed_day, fixed_time, plan_id, client_type, email, city, phone)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as OnboardingTask[];
    },
  });

  const createOnboardingForClient = useMutation({
    mutationFn: async (clientId: string) => {
      // Only create the initial "cliente_novo" task - other tasks are created dynamically
      const tasks = [
        { client_id: clientId, stage: 'cliente_novo', title: 'Novo cliente - Aguardando onboarding', status: 'pendente' },
      ];
      const { error } = await supabase.from('onboarding_tasks').insert(tasks as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      toast.success('Cliente adicionado ao onboarding!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const advanceToNextStage = useMutation({
    mutationFn: async ({ clientId, currentStage, extras }: { clientId: string; currentStage: OnboardingStage; extras?: Record<string, any> }) => {
      // Mark current stage as complete
      const { data: currentTasks } = await supabase
        .from('onboarding_tasks')
        .select('id')
        .eq('client_id', clientId)
        .eq('stage', currentStage)
        .neq('status', 'concluido');
      
      if (currentTasks?.length) {
        await supabase
          .from('onboarding_tasks')
          .update({ status: 'concluido', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(extras || {}) } as any)
          .eq('id', currentTasks[0].id);
      }

      // Determine next stage
      const stageFlow = getStageFlow(clientId);
      // We need client data to determine flow
      const { data: client } = await supabase
        .from('clients')
        .select('photo_preference, has_photo_shoot, briefing_data')
        .eq('id', clientId)
        .single();

      const bd = client?.briefing_data as Record<string, any> | null;
      const hasIdentity = bd?.has_identity?.toLowerCase() === 'sim';
      const needsPhotos = client?.photo_preference === 'fotos_reais';

      const fullFlow: OnboardingStage[] = ['cliente_novo', 'contrato'];
      if (!hasIdentity) fullFlow.push('identidade_visual');
      if (needsPhotos) fullFlow.push('fotografia');
      fullFlow.push('reformulacao_perfil');

      const currentIdx = fullFlow.indexOf(currentStage);
      const nextStage = fullFlow[currentIdx + 1];

      if (nextStage) {
        const titleMap: Record<string, string> = {
          contrato: 'Contrato - Assinatura',
          identidade_visual: 'Criação de Identidade Visual',
          fotografia: 'Ensaio Fotográfico',
          reformulacao_perfil: 'Reformulação de Perfil',
        };
        const { error } = await supabase.from('onboarding_tasks').insert({
          client_id: clientId,
          stage: nextStage,
          title: titleMap[nextStage] || nextStage,
          status: 'pendente',
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateOnboardingTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OnboardingTask> & { id: string }) => {
      const { error } = await supabase
        .from('onboarding_tasks')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createDesignTasksForClient = useMutation({
    mutationFn: async (clientId: string) => {
      const { data: existing } = await supabase
        .from('design_tasks')
        .select('id')
        .eq('client_id', clientId)
        .ilike('title', '%Reformulação%')
        .limit(1);
      
      if (existing?.length) return; // Already has tasks

      const designTasks = [
        { client_id: clientId, title: 'Reformulação - Foto de Perfil', format_type: 'perfil', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Destaque 1', format_type: 'destaque', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Destaque 2', format_type: 'destaque', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Destaque 3', format_type: 'destaque', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Destaque 4', format_type: 'destaque', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Destaque 5', format_type: 'destaque', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Arte Feed 1', format_type: 'feed', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Arte Feed 2', format_type: 'feed', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Arte Feed 3', format_type: 'feed', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Arte Feed 4', format_type: 'feed', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Arte Feed 5', format_type: 'feed', priority: 'alta', kanban_column: 'nova_tarefa' },
        { client_id: clientId, title: 'Reformulação - Arte Feed 6', format_type: 'feed', priority: 'alta', kanban_column: 'nova_tarefa' },
      ];

      const { error } = await supabase.from('design_tasks').insert(designTasks as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
      toast.success('Tarefas de reformulação criadas no módulo Designer!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { tasksQuery, createOnboardingForClient, updateOnboardingTask, advanceToNextStage, createDesignTasksForClient };
}

function getStageFlow(clientId: string) {
  // Helper - actual flow is determined with client data in advanceToNextStage
  return ['cliente_novo', 'contrato', 'identidade_visual', 'fotografia', 'reformulacao_perfil'];
}
