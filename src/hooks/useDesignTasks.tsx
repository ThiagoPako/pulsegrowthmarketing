import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/vpsDb';
import { useCity } from '@/contexts/CityContext';
import { toast } from 'sonner';

export type DesignTaskColumn = 'nova_tarefa' | 'executando' | 'fila_baixa_prioridade' | 'em_analise' | 'enviar_cliente' | 'aprovado' | 'ajustes';

export const DESIGN_COLUMNS: { key: DesignTaskColumn; label: string; color: string }[] = [
  { key: 'nova_tarefa', label: 'Nova Tarefa', color: '217 91% 60%' },
  { key: 'executando', label: 'Executando', color: '45 93% 47%' },
  { key: 'fila_baixa_prioridade', label: 'Fila Baixa Prioridade', color: '240 5% 55%' },
  { key: 'em_analise', label: 'Em Análise', color: '262 83% 58%' },
  { key: 'enviar_cliente', label: 'Enviar para Cliente', color: '187 85% 43%' },
  { key: 'aprovado', label: 'Aprovado', color: '142 71% 45%' },
  { key: 'ajustes', label: 'Ajustes Solicitados', color: '0 72% 51%' },
];

export interface DesignTask {
  id: string;
  client_id: string | null;
  prospect_name: string | null;
  title: string;
  description: string | null;
  format_type: string;
  kanban_column: DesignTaskColumn;
  priority: string;
  copy_text: string | null;
  references_links: string[];
  reference_images: string[];
  attachment_url: string | null;
  attachment_urls: string[];
  editable_file_url: string | null;
  observations: string | null;
  created_by: string | null;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  sent_to_client_at: string | null;
  client_approved_at: string | null;
  auto_approved: boolean;
  time_spent_seconds: number;
  timer_running: boolean;
  timer_started_at: string | null;
  version: number;
  mockup_url: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  clients?: { company_name: string; color: string; logo_url: string | null; whatsapp: string; responsible_person: string };
  profiles?: { name: string; display_name: string | null; avatar_url: string | null } | null;
}

export function useDesignTasks() {
  const queryClient = useQueryClient();
  const { activeCity, isLoading: cityLoading } = useCity();

  // Only fetch tasks from the last 90 days to keep the kanban snappy.
  // Older 'aprovado' cards stay in reports; the kanban shows recent work.
  const RECENT_WINDOW_DAYS = 90;
  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const tasksQuery = useQuery({
    queryKey: ['design-tasks', activeCity],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('design_tasks')
          .select('*, clients(company_name, color, logo_url, whatsapp, responsible_person), profiles!design_tasks_assigned_to_fkey(name, display_name, avatar_url)')
          .gte('created_at', recentSince)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) {
          console.warn('Error fetching design tasks with relations, retrying simple query:', error);

          const fallback = await supabase
            .from('design_tasks')
            .select('*')
            .gte('created_at', recentSince)
            .order('created_at', { ascending: false })
            .limit(500);

          if (fallback.error) {
            console.error('Error fetching design tasks:', fallback.error);
            throw fallback.error;
          }

          return (fallback.data || []) as unknown as DesignTask[];
        }
        return (data || []) as unknown as DesignTask[];
      } catch (err) {
        console.error('Exception in tasksQuery:', err);
        throw err;
      }
    },
    enabled: !cityLoading,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });


  const historyQuery = (taskId: string) => useQuery({
    queryKey: ['design-task-history', activeCity, taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_task_history')
        .select('*, profiles:user_id(name, display_name, avatar_url)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!taskId && !cityLoading,
  });

  const createTask = useMutation({
    mutationFn: async (task: Partial<DesignTask>) => {
      const { data, error } = await supabase
        .from('design_tasks')
        .insert(task as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
      toast.success('Tarefa de design criada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DesignTask> & { id: string }) => {
      const { data, error } = await supabase
        .from('design_tasks')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addHistory = useMutation({
    mutationFn: async (entry: { task_id: string; action: string; details?: string; attachment_url?: string; user_id?: string }) => {
      const { error } = await supabase.from('design_task_history').insert(entry as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['design-task-history', vars.task_id] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      // Delete history first
      await supabase.from('design_task_history').delete().eq('task_id', taskId);
      const { error } = await supabase.from('design_tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
      toast.success('Tarefa excluída com sucesso!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao excluir tarefa'),
  });

  return { tasksQuery, historyQuery, createTask, updateTask, addHistory, deleteTask };
}
