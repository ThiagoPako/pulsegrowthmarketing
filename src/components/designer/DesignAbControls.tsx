import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Swords, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

// Arte humana × arte da IA (pedido do usuário, 03/11/2026): chaves do teste e o placar (só admin).

export interface DesignAbSettings { enabled: boolean; agent_admin_only: boolean; is_admin?: boolean }

export function useDesignAbSettings() {
  return useQuery({
    queryKey: ['design-ab-settings'],
    queryFn: async () => {
      const { data, error } = await invokeVpsFunction('design-ab/settings', { method: 'GET' });
      if (error || data?.error) return { enabled: false, agent_admin_only: true, is_admin: false } as DesignAbSettings;
      return data as DesignAbSettings;
    },
    staleTime: 60_000,
  });
}

/** Selo do card: quem faz a arte e se está no teste humano × IA. */
export function MadeByBadge({ madeBy, abTest, abResult }: { madeBy?: string | null; abTest?: boolean | null; abResult?: string | null }) {
  if (!madeBy) return null;
  const ai = madeBy === 'agente';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ai ? 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300' : 'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'}`}>
      {ai ? <Bot size={10} /> : <User size={10} />} {ai ? 'IA' : 'Humano'}
      {abTest && <><Swords size={10} className="ml-0.5" /> {abResult === 'venceu' ? 'venceu' : 'comparando'}</>}
    </span>
  );
}

/** Botão do admin no Kanban: liga/desliga o teste e a visibilidade, e mostra o placar. */
export function DesignAbAdminButton() {
  const queryClient = useQueryClient();
  const { data: s } = useDesignAbSettings();
  const { data: score } = useQuery({
    queryKey: ['design-ab-scoreboard'],
    enabled: !!s?.is_admin,
    queryFn: async () => {
      const { data } = await invokeVpsFunction('design-ab/scoreboard', { method: 'GET' });
      return data as { humano: number; agente: number; clients: { client_id: string; company_name: string | null; humano: number; agente: number }[] } | null;
    },
  });
  if (!s?.is_admin) return null;
  const save = async (patch: Partial<DesignAbSettings>) => {
    const { error, data } = await invokeVpsFunction('design-ab/settings', { method: 'PUT', body: patch });
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Não deu para salvar'); return; }
    await queryClient.invalidateQueries({ queryKey: ['design-ab-settings'] });
    await queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
    toast.success('Teste humano × IA atualizado');
  };
  const total = (score?.humano || 0) + (score?.agente || 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Swords size={14} /> Humano × IA
          {total > 0 && <span className="tabular-nums text-muted-foreground">{score?.humano}×{score?.agente}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-semibold">Arte humana × arte da IA</p>
          <p className="text-xs text-muted-foreground">Card criado à mão ganha uma versão da IA. O cliente escolhe uma e a IA aprende com a escolhida.</p>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Criar a versão da IA</span>
          <Switch checked={s.enabled} onCheckedChange={(v) => save({ enabled: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Cards da IA só para admin</span>
          <Switch checked={s.agent_admin_only} onCheckedChange={(v) => save({ agent_admin_only: v })} />
        </label>
        <div className="rounded-lg bg-muted/40 p-2.5">
          <p className="text-xs font-semibold">Placar das escolhas dos clientes</p>
          {total === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Nenhum cliente escolheu ainda.</p>
          ) : (
            <>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                <div className="bg-sky-500" style={{ width: `${((score?.humano || 0) / total) * 100}%` }} />
                <div className="bg-fuchsia-500" style={{ width: `${((score?.agente || 0) / total) * 100}%` }} />
              </div>
              <p className="mt-1 flex justify-between text-[11px]"><span className="text-sky-600 dark:text-sky-400">Humano {score?.humano}</span><span className="text-fuchsia-600 dark:text-fuchsia-400">IA {score?.agente}</span></p>
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[11px]">
                {(score?.clients || []).map((c) => (
                  <li key={c.client_id} className="flex justify-between gap-2"><span className="truncate">{c.company_name || 'Cliente'}</span><span className="shrink-0 tabular-nums text-muted-foreground">{c.humano} × {c.agente}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
