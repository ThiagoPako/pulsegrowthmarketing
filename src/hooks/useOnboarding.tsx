import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type OnboardingStage = 'contrato' | 'briefing' | 'identidade_visual' | 'concluido';
export type OnboardingStatus = 'pendente' | 'em_andamento' | 'concluido';

export const ONBOARDING_STAGES: { key: OnboardingStage; label: string; color: string }[] = [
  { key: 'contrato', label: 'Contrato', color: '217 91% 60%' },
  { key: 'briefing', label: 'Briefing', color: '45 93% 47%' },
  { key: 'identidade_visual', label: 'Identidade Visual', color: '262 83% 58%' },
  { key: 'concluido', label: 'Concluído', color: '142 71% 45%' },
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
  clients?: { company_name: string; color: string; logo_url: string | null; responsible_person: string; whatsapp: string; niche: string | null };
}

export function useOnboarding() {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['onboarding-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_tasks')
        .select('*, clients(company_name, color, logo_url, responsible_person, whatsapp, niche)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as OnboardingTask[];
    },
  });

  const createOnboardingForClient = useMutation({
    mutationFn: async (clientId: string) => {
      const tasks = [
        { client_id: clientId, stage: 'contrato', title: 'Criar contrato do cliente', status: 'pendente' },
        { client_id: clientId, stage: 'briefing', title: 'Envio do briefing', status: 'pendente' },
        { client_id: clientId, stage: 'identidade_visual', title: 'Definição de identidade visual', status: 'pendente' },
      ];
      const { error } = await supabase.from('onboarding_tasks').insert(tasks as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      toast.success('Tarefas de onboarding criadas!');
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

  return { tasksQuery, createOnboardingForClient, updateOnboardingTask };
}
