import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';

export type OnboardingStage =
  | 'cliente_novo'
  | 'contrato'
  | 'briefing'
  | 'criar_editorial'
  | 'anexar_editorial'
  | 'distribuicao'
  | 'cliente_bordo';

export type OnboardingStatus = 'pendente' | 'em_andamento' | 'concluido';

export const ONBOARDING_STAGES: { key: OnboardingStage; label: string; color: string; icon: string }[] = [
  { key: 'cliente_novo',     label: 'Cliente Novo',        color: '45 93% 47%',  icon: '🆕' },
  { key: 'contrato',         label: 'Contrato',            color: '217 91% 60%', icon: '📄' },
  { key: 'briefing',         label: 'Briefing',            color: '190 90% 50%', icon: '📝' },
  { key: 'criar_editorial',  label: 'Criar Editorial',     color: '262 83% 58%', icon: '✍️' },
  { key: 'anexar_editorial', label: 'Anexar Editorial',    color: '291 64% 55%', icon: '📎' },
  { key: 'distribuicao',     label: 'Distribuição',        color: '25 95% 55%',  icon: '🚀' },
  { key: 'cliente_bordo',    label: 'Cliente a Bordo',     color: '142 71% 45%', icon: '✅' },
];

const STAGE_ORDER: OnboardingStage[] = ONBOARDING_STAGES.map(s => s.key);

const STAGE_TITLES: Record<OnboardingStage, string> = {
  cliente_novo: 'Novo cliente - Aguardando onboarding',
  contrato: 'Contrato - Assinatura',
  briefing: 'Briefing - Preenchimento',
  criar_editorial: 'Criar linha editorial',
  anexar_editorial: 'Anexar editorial ao cliente',
  distribuicao: 'Distribuição de tarefas',
  cliente_bordo: 'Cliente a bordo',
};

// Map legacy stages to the new pipeline so existing cards don't vanish
const LEGACY_STAGE_MAP: Record<string, OnboardingStage> = {
  identidade_visual: 'distribuicao',
  fotografia: 'distribuicao',
  reformulacao_perfil: 'distribuicao',
};

export function normalizeStage(stage: string): OnboardingStage {
  if (STAGE_ORDER.includes(stage as OnboardingStage)) return stage as OnboardingStage;
  return LEGACY_STAGE_MAP[stage] || 'cliente_novo';
}

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
    editorial: string | null;
    drive_fotos: string | null;
    drive_identidade_visual: string | null;
  };
}

async function createDesignTaskForIdentity(clientId: string, client: any) {
  const bd = client?.briefing_data as Record<string, any> | null;
  const description = [
    `Cliente: ${client?.company_name || ''}`,
    client?.responsible_person ? `Responsável: ${client.responsible_person}` : '',
    client?.niche ? `Nicho: ${client.niche}` : '',
    bd?.brand_voice ? `Tom de voz: ${bd.brand_voice}` : '',
    bd?.social_links ? `Redes: ${bd.social_links}` : '',
    bd?.competitors ? `Concorrentes: ${bd.competitors}` : '',
    bd?.website ? `Site: ${bd.website}` : '',
  ].filter(Boolean).join('\n');

  const { data: existingDesign } = await supabase
    .from('design_tasks')
    .select('id')
    .eq('client_id', clientId)
    .ilike('title', '%Identidade Visual%')
    .limit(1);

  if (existingDesign?.length) return { alreadyExists: true };

  const identityChecklist = [
    { id: crypto.randomUUID(), text: 'Criar logotipo / marca', done: false },
    { id: crypto.randomUUID(), text: 'Criar paleta de cores', done: false },
    { id: crypto.randomUUID(), text: 'Definir tipografia', done: false },
    { id: crypto.randomUUID(), text: 'Criar aplicações da marca', done: false },
    { id: crypto.randomUUID(), text: 'Criar papel timbrado', done: false },
    { id: crypto.randomUUID(), text: 'Criar cartão de visita', done: false },
    { id: crypto.randomUUID(), text: '⚠️ Subir mockup para aprovação do cliente', done: false },
  ];
  const { error } = await supabase.from('design_tasks').insert({
    client_id: clientId,
    title: `Identidade Visual - ${client?.company_name || 'Cliente'}`,
    description,
    format_type: 'logomarca',
    priority: 'alta',
    kanban_column: 'nova_tarefa',
    checklist: identityChecklist,
  } as any);
  if (error) throw error;
  return { alreadyExists: false };
}

async function createReformulationTasks(clientId: string) {
  const { data: existing } = await supabase
    .from('design_tasks')
    .select('id')
    .eq('client_id', clientId)
    .ilike('title', '%Reformulação%')
    .limit(1);
  if (existing?.length) return { alreadyExists: true };

  const profileChecklist = [
    { id: crypto.randomUUID(), text: 'Criar arte do perfil', done: false },
    { id: crypto.randomUUID(), text: 'Montar mockup do perfil', done: false },
    { id: crypto.randomUUID(), text: 'Anexar mockup para aprovação', done: false },
  ];
  const destaqueChecklist = (n: number) => [
    { id: crypto.randomUUID(), text: `Criar arte destaque ${n}`, done: false },
    { id: crypto.randomUUID(), text: 'Incluir no mockup geral', done: false },
  ];
  const feedChecklist = (n: number) => [
    { id: crypto.randomUUID(), text: `Criar arte feed ${n}`, done: false },
    { id: crypto.randomUUID(), text: 'Incluir no mockup do feed', done: false },
  ];

  const designTasks = [
    { client_id: clientId, title: 'Reformulação - Foto de Perfil', format_type: 'story', priority: 'alta', kanban_column: 'nova_tarefa', checklist: profileChecklist },
    ...Array.from({ length: 5 }, (_, i) => ({ client_id: clientId, title: `Reformulação - Destaque ${i + 1}`, format_type: 'story', priority: 'alta', kanban_column: 'nova_tarefa', checklist: destaqueChecklist(i + 1) })),
    ...Array.from({ length: 6 }, (_, i) => ({ client_id: clientId, title: `Reformulação - Arte Feed ${i + 1}`, format_type: 'feed', priority: 'alta', kanban_column: 'nova_tarefa', checklist: feedChecklist(i + 1) })),
  ];

  const { error } = await supabase.from('design_tasks').insert(designTasks as any);
  if (error) throw error;
  return { alreadyExists: false };
}

export function useOnboarding() {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['onboarding-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_tasks')
        .select('*, clients(company_name, color, logo_url, responsible_person, whatsapp, niche, photo_preference, has_photo_shoot, accepts_photo_shoot_cost, briefing_data, videomaker_id, fixed_day, fixed_time, plan_id, client_type, email, city, phone, editorial, drive_fotos, drive_identidade_visual)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Normalize legacy stages so cards keep appearing under new columns
      const normalized = (data || []).map((t: any) => ({ ...t, stage: normalizeStage(t.stage) }));
      return normalized as unknown as OnboardingTask[];
    },
  });

  const createOnboardingForClient = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.from('onboarding_tasks').insert({
        client_id: clientId,
        stage: 'cliente_novo',
        title: STAGE_TITLES.cliente_novo,
        status: 'pendente',
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      toast.success('Cliente adicionado ao onboarding!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Purely sequential advance: close current stage, open next
  const advanceToNextStage = useMutation({
    mutationFn: async ({ clientId, currentStage, extras }: { clientId: string; currentStage: OnboardingStage; extras?: Record<string, any> }) => {
      const idx = STAGE_ORDER.indexOf(currentStage);
      if (idx === -1) throw new Error(`Etapa inválida: ${currentStage}`);

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

      const nextStage = STAGE_ORDER[idx + 1];
      if (!nextStage) return;

      const { data: existingNext } = await supabase
        .from('onboarding_tasks')
        .select('id')
        .eq('client_id', clientId)
        .eq('stage', nextStage)
        .limit(1);

      if (!existingNext?.length) {
        const { error } = await supabase.from('onboarding_tasks').insert({
          client_id: clientId,
          stage: nextStage,
          title: STAGE_TITLES[nextStage],
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

  // Save editorial to clients.editorial and advance anexar_editorial → distribuicao
  const attachEditorial = useMutation({
    mutationFn: async ({ clientId, editorial }: { clientId: string; editorial: string }) => {
      const { error: upErr } = await supabase
        .from('clients')
        .update({ editorial } as any)
        .eq('id', clientId);
      if (upErr) throw upErr;

      const { data: taskRows } = await supabase
        .from('onboarding_tasks')
        .select('id, stage')
        .eq('client_id', clientId)
        .in('stage', ['anexar_editorial', 'criar_editorial'])
        .neq('status', 'concluido');

      const target = taskRows?.find(t => t.stage === 'anexar_editorial') || taskRows?.[0];
      if (target) {
        await supabase
          .from('onboarding_tasks')
          .update({ status: 'concluido', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
          .eq('id', target.id);
      }

      const { data: existingNext } = await supabase
        .from('onboarding_tasks')
        .select('id')
        .eq('client_id', clientId)
        .eq('stage', 'distribuicao')
        .limit(1);

      if (!existingNext?.length) {
        await supabase.from('onboarding_tasks').insert({
          client_id: clientId,
          stage: 'distribuicao',
          title: STAGE_TITLES.distribuicao,
          status: 'pendente',
        } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Editorial anexado ao cliente!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Save editorial draft without advancing
  const saveEditorialDraft = useMutation({
    mutationFn: async ({ clientId, editorial }: { clientId: string; editorial: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({ editorial } as any)
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      toast.success('Rascunho salvo!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Hub actions — do NOT advance stage
  const triggerReformulacaoPerfil = useMutation({
    mutationFn: async (clientId: string) => createReformulationTasks(clientId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
      if (res?.alreadyExists) toast.info('Reformulação já criada anteriormente.');
      else toast.success('12 tarefas de reformulação criadas no módulo Designer!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const triggerIdentidadeVisual = useMutation({
    mutationFn: async (clientId: string) => {
      const { data: client } = await supabase
        .from('clients')
        .select('company_name, responsible_person, niche, briefing_data, logo_url')
        .eq('id', clientId)
        .single();
      return createDesignTaskForIdentity(clientId, client);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
      if (res?.alreadyExists) toast.info('Identidade visual já criada anteriormente.');
      else toast.success('Tarefa de Identidade Visual criada no módulo Designer!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const triggerAgendarFotografia = useMutation({
    mutationFn: async ({ clientId, driveLink }: { clientId: string; driveLink: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({ drive_fotos: driveLink } as any)
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      toast.success('Link do ensaio fotográfico salvo!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const finishOnboarding = useMutation({
    mutationFn: async (clientId: string) => {
      const { data: taskRows } = await supabase
        .from('onboarding_tasks')
        .select('id, stage')
        .eq('client_id', clientId)
        .in('stage', ['distribuicao', 'cliente_bordo'])
        .neq('status', 'concluido');

      const distTask = taskRows?.find(t => t.stage === 'distribuicao');
      if (distTask) {
        await supabase
          .from('onboarding_tasks')
          .update({ status: 'concluido', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
          .eq('id', distTask.id);
      }

      const { data: existingBordo } = await supabase
        .from('onboarding_tasks')
        .select('id')
        .eq('client_id', clientId)
        .eq('stage', 'cliente_bordo')
        .limit(1);

      let bordoId = existingBordo?.[0]?.id;
      if (!bordoId) {
        const { data: inserted } = await supabase.from('onboarding_tasks').insert({
          client_id: clientId,
          stage: 'cliente_bordo',
          title: STAGE_TITLES.cliente_bordo,
          status: 'concluido',
          completed_at: new Date().toISOString(),
        } as any).select('id').single();
        bordoId = inserted?.id;
      } else {
        await supabase
          .from('onboarding_tasks')
          .update({ status: 'concluido', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
          .eq('id', bordoId);
      }

      await supabase
        .from('clients')
        .update({ onboarding_completed: true } as any)
        .eq('id', clientId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('🎉 Cliente a bordo! Onboarding concluído.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteOnboardingClient = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from('onboarding_tasks')
        .delete()
        .eq('client_id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      toast.success('Card de onboarding removido!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Back-compat aliases used elsewhere
  const createDesignTasksForClient = triggerReformulacaoPerfil;

  return {
    tasksQuery,
    createOnboardingForClient,
    updateOnboardingTask,
    advanceToNextStage,
    attachEditorial,
    saveEditorialDraft,
    triggerReformulacaoPerfil,
    triggerIdentidadeVisual,
    triggerAgendarFotografia,
    finishOnboarding,
    createDesignTasksForClient,
    deleteOnboardingClient,
  };
}
