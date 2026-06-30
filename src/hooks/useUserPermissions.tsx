import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';

export interface ModuleDef {
  key: string;
  label: string;
  icon: string;
  description: string;
  paths: string[]; // paths this module grants access to
}

export const AVAILABLE_MODULES: ModuleDef[] = [
  { key: 'conteudo', label: 'Conteúdo', icon: '📋', description: 'Kanban de conteúdo', paths: ['/conteudo'] },
  { key: 'agenda', label: 'Agenda', icon: '📅', description: 'Agenda de gravações', paths: ['/agenda'] },
  { key: 'roteiros', label: 'Roteiros', icon: '📝', description: 'Criação de roteiros', paths: ['/roteiros'] },
  { key: 'social', label: 'Social Media', icon: '📱', description: 'Entregas e tráfego', paths: ['/entregas-social', '/trafego'] },
  { key: 'edicao', label: 'Edição', icon: '✂️', description: 'Kanban de edição', paths: ['/edicao', '/edicao/kanban'] },
  { key: 'designer', label: 'Designer', icon: '🎨', description: 'Kanban e relatórios de design', paths: ['/designer', '/designer/relatorios'] },
  { key: 'portal', label: 'Portal', icon: '🖥️', description: 'Gerenciador de conteúdos do portal', paths: ['/conteudos-portal'] },
  { key: 'entregas', label: 'Entregas', icon: '📦', description: 'Registro de entregas', paths: ['/entregas'] },
  { key: 'desempenho', label: 'Desempenho', icon: '🎯', description: 'Relatórios de desempenho', paths: ['/desempenho'] },
  { key: 'clientes', label: 'Clientes', icon: '🏢', description: 'Gestão de clientes', paths: ['/clientes'] },
  { key: 'relacionamento', label: 'Relacionamento', icon: '🤝', description: 'Solicitações de gravação especial', paths: ['/relacionamento'] },
  { key: 'onboarding', label: 'Onboarding', icon: '👤', description: 'Onboarding de clientes', paths: ['/onboarding-gestao'] },
  { key: 'equipe', label: 'Equipe', icon: '👥', description: 'Gestão da equipe', paths: ['/equipe'] },
  { key: 'planos', label: 'Planos', icon: '📦', description: 'Planos de serviço', paths: ['/planos'] },
  { key: 'metas', label: 'Metas', icon: '🎯', description: 'Metas da empresa', paths: ['/metas'] },
  { key: 'crm', label: 'CRM', icon: '📋', description: 'Pipeline de vendas e CRM', paths: ['/crm'] },
  { key: 'endomarketing', label: 'Endomarketing', icon: '📣', description: 'Módulo completo de endomarketing', paths: ['/endomarketing', '/endomarketing/contratos', '/endomarketing/tarefas', '/endomarketing/relatorios', '/endomarketing/calendario'] },
  { key: 'financeiro', label: 'Financeiro', icon: '💰', description: 'Módulo financeiro completo', paths: ['/financeiro', '/financeiro/contratos', '/financeiro/receitas', '/financeiro/despesas', '/financeiro/inadimplencia', '/financeiro/relatorios', '/financeiro/configuracoes', '/financeiro/caixa', '/financeiro/movimentacoes', '/financeiro/parceiros', '/financeiro/chat', '/financeiro/apis'] },
  { key: 'relatorios', label: 'Relatórios', icon: '📊', description: 'Relatórios gerais', paths: ['/relatorios'] },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬', description: 'Automação WhatsApp', paths: ['/whatsapp'] },
  { key: 'configuracoes', label: 'Configurações', icon: '⚙️', description: 'Configurações do sistema', paths: ['/configuracoes'] },
  { key: 'portal_videos', label: 'Vídeos Portal', icon: '🎬', description: 'Vídeos de boas-vindas e novidades', paths: ['/portal-videos'] },
];

export function useUserPermissions(userId?: string) {
  const queryClient = useQueryClient();

  const permissionsQuery = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_permissions')
        .select('module')
        .eq('user_id', userId);
      if (error) throw error;
      return (data || []).map((d: any) => d.module as string);
    },
    enabled: !!userId,
  });

  const setPermissions = useMutation({
    mutationFn: async ({ userId, modules }: { userId: string; modules: string[] }) => {
      // Delete all existing permissions
      const { error: delErr } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId);
      if (delErr) throw delErr;

      // Insert new ones
      if (modules.length > 0) {
        const rows = modules.map(m => ({ user_id: userId, module: m }));
        const { error: insErr } = await supabase
          .from('user_permissions')
          .insert(rows as any);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', vars.userId] });
      queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
      toast.success('Permissões atualizadas!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { permissionsQuery, setPermissions };
}

/** Hook for current user to check their own permissions */
export function useMyPermissions() {
  const query = useQuery({
    queryKey: ['my-permissions'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user?.id) return { modules: [] as string[], role: '' };

      // Use role directly from /auth/me (already joined with user_roles) — avoids profile/role mismatch
      const authRole = (user as any).role || '';

      const permRes = await supabase
        .from('user_permissions')
        .select('module')
        .eq('user_id', user.id);

      return {
        modules: (permRes.data || []).map((d: any) => d.module as string),
        role: authRole,
      };
    },
  });

  const hasModuleAccess = (path: string): boolean => {
    const data = query.data;
    if (!data) return true; // loading state: allow
    
    // admin always has full access
    if (data.role === 'admin') return true;

    // If user has custom permissions set, use those
    if (data.modules && data.modules.length > 0) {
      const mod = AVAILABLE_MODULES.find(m => m.paths.some(p => path === p || path.startsWith(p + '/')));
      if (!mod) return true; // dashboard and unknown paths are always allowed
      return data.modules.includes(mod.key);
    }

    // Default access for other roles can be defined here if needed
    // For now, if no custom permissions, allow access (roles are already filtered in Sidebar/AppRoutes)
    return true;
  };

  return { ...query, hasModuleAccess, modules: query.data?.modules || [] };
}
