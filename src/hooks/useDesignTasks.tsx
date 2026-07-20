import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/vpsDb';
import { useCity } from '@/contexts/CityContext';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { toast } from 'sonner';

export type DesignTaskColumn = 'nova_tarefa' | 'executando' | 'fila_baixa_prioridade' | 'em_analise' | 'enviar_cliente' | 'aprovado' | 'ajustes' | 'postado';

export const DESIGN_COLUMNS: { key: DesignTaskColumn; label: string; color: string }[] = [
  { key: 'nova_tarefa', label: 'Nova Tarefa', color: '217 91% 60%' },
  { key: 'executando', label: 'Executando', color: '45 93% 47%' },
  { key: 'fila_baixa_prioridade', label: 'Fila Baixa Prioridade', color: '240 5% 55%' },
  { key: 'ajustes', label: 'Ajustes Solicitados', color: '0 72% 51%' },
  { key: 'em_analise', label: 'Em Análise', color: '262 83% 58%' },
  { key: 'enviar_cliente', label: 'Enviar para Cliente', color: '187 85% 43%' },
  { key: 'aprovado', label: 'Aprovadas — Artes para Agendar', color: '142 71% 45%' },
  { key: 'postado', label: 'Artes Postadas', color: '280 65% 60%' },
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

// Persistência local pra primeira renderização instantânea entre reloads/navegações.
// Guarda por cidade e limita ao que é útil pro kanban/painel.
const LS_KEY = (city: string) => `pulse:design-tasks:${city || 'default'}`;
const LS_LAST_CITY = 'pulse:design-tasks:last-city';
const LS_MAX_AGE_MS = 60 * 60 * 1000; // 1h — cache local mais generoso; refetch em background mantém fresco

function readLocalTasks(city: string): DesignTask[] | undefined {
  try {
    const key = city ? LS_KEY(city) : LS_KEY(localStorage.getItem(LS_LAST_CITY) || 'default');
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at: number; data: DesignTask[] };
    if (!parsed?.data || !Array.isArray(parsed.data)) return undefined;
    if (Date.now() - (parsed.at || 0) > LS_MAX_AGE_MS) return undefined;
    return parsed.data;
  } catch { return undefined; }
}

function readLocalUpdatedAt(city: string): number {
  try {
    const key = city ? LS_KEY(city) : LS_KEY(localStorage.getItem(LS_LAST_CITY) || 'default');
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).at || 0 : 0;
  } catch { return 0; }
}

function writeLocalTasks(city: string, data: DesignTask[]) {
  try {
    // Não apagar cache bom com resultado vazio (evita "flash 0" no kanban).
    if (!data || data.length === 0) {
      const existing = readLocalTasks(city);
      if (existing && existing.length > 0) return;
    }
    const payload = JSON.stringify({ at: Date.now(), data });
    localStorage.setItem(LS_KEY(city), payload);
    // Espelha em 'default' também, pra hidratar antes do CityContext resolver.
    localStorage.setItem(LS_KEY('default'), payload);
    if (city) localStorage.setItem(LS_LAST_CITY, city);
  } catch { /* quota exceeded — ignore */ }
}

export function useDesignTasks() {
  const queryClient = useQueryClient();
  const { activeCity, isLoading: cityLoading } = useCity();

  // Only fetch tasks from the last 60 days to keep the kanban snappy.
  const RECENT_WINDOW_DAYS = 60;
  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Cards já postados só interessam recentes; antigos vão pra relatórios.
  const POSTADO_WINDOW_DAYS = 21;
  const postadoSince = new Date(Date.now() - POSTADO_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Colunas enxutas — evita puxar campos pesados desnecessários no kanban.
  const LIST_COLS = [
    'id','client_id','prospect_name','title','description','format_type','kanban_column',
    'priority','copy_text','attachment_url','attachment_urls','editable_file_url',
    'assigned_to','started_at','completed_at','sent_to_client_at','client_approved_at',
    'auto_approved','time_spent_seconds','timer_running','timer_started_at','version',
    'mockup_url','due_date','position','created_at','updated_at'
  ].join(',');

  const tasksQuery = useQuery({
    queryKey: ['design-tasks', activeCity],
    queryFn: async () => {
      const filterPostado = (arr: any[]) =>
        (arr || []).filter((t: any) => t.kanban_column !== 'postado' || (t.updated_at && t.updated_at >= postadoSince));

      // Caminho rápido na VPS: endpoint dedicado com SQL único + joins prontos + filtro de cidade.
      // Remove a latência do endpoint genérico /db/query e evita cascata de tentativas no carregamento inicial.
      try {
        const fast = await invokeVpsFunction('design-tasks/fast', {
          method: 'GET',
          body: {
            limit: 600,
            postado_days: POSTADO_WINDOW_DAYS,
          },
        });

        if (!fast.error && Array.isArray(fast.data)) {
          const list = filterPostado(fast.data) as unknown as DesignTask[];
          writeLocalTasks(activeCity, list);
          return list;
        }
      } catch {
        // Se a VPS ainda não estiver com o endpoint novo, cai no caminho compatível abaixo.
      }

      // Estratégia em cascata: tenta com joins → sem joins → sem filtro de data.
      // Em qualquer nível que retornar linhas, usamos.
      const tryQuery = async (label: string, build: () => any) => {
        try {
          const { data, error } = await build();
          if (error) {
            console.warn(`[design-tasks] ${label} falhou:`, error?.message || error);
            return null;
          }
          console.log(`[design-tasks] ${label} ok — ${(data || []).length} linhas`);
          return data || [];
        } catch (e: any) {
          console.warn(`[design-tasks] ${label} exceção:`, e?.message || e);
          return null;
        }
      };

      // 1) Com joins completos
      let data = await tryQuery('join completo', () =>
        supabase
          .from('design_tasks')
          .select(`${LIST_COLS}, clients(company_name, color, logo_url, whatsapp, responsible_person), profiles!design_tasks_assigned_to_fkey(name, display_name, avatar_url)`)
          .gte('created_at', recentSince)
          .order('created_at', { ascending: false })
          .limit(300)
      );

      // 2) Sem joins
      if (!data) {
        data = await tryQuery('sem joins', () =>
          supabase
            .from('design_tasks')
            .select(LIST_COLS)
            .gte('created_at', recentSince)
            .order('created_at', { ascending: false })
            .limit(300)
        );
      }

      // 3) Sem filtro de data (fallback máximo)
      if (!data) {
        data = await tryQuery('sem filtros', () =>
          supabase
            .from('design_tasks')
            .select(LIST_COLS)
            .order('created_at', { ascending: false })
            .limit(300)
        );
      }

      if (!data) {
        throw new Error('Falha ao carregar design_tasks em todas as tentativas — verifique o backend da VPS.');
      }

      const list = filterPostado(data) as unknown as DesignTask[];
      writeLocalTasks(activeCity, list);
      return list;
    },
    // Não bloqueia esperando cityLoading — mostra cache local imediato e refetcha quando a cidade resolver (queryKey muda).
    enabled: true,
    initialData: () => readLocalTasks(activeCity),
    initialDataUpdatedAt: () => readLocalUpdatedAt(activeCity),
    placeholderData: (prev) => prev,
    // Cache considerado fresco por 30s — evita refetch redundante em navegações rápidas.
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    structuralSharing: true,
    notifyOnChangeProps: ['data', 'error'],
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
    onSuccess: (updated) => {
      if (updated?.id) {
        queryClient.setQueryData<DesignTask[]>(['design-tasks', activeCity], (prev) => {
          if (!prev) return prev;
          return prev.map((task) => task.id === updated.id ? { ...task, ...updated } as DesignTask : task);
        });
      }
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
