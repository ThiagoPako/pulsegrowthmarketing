import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';

export interface ClientProfessional {
  id: string;
  client_id: string;
  name: string;
  specialty: string | null;
  council_type: string | null;
  council_number: string | null;
  rqe: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
  schedule_notes: string | null;
  photos: string[] | null;
  videos: string[] | null;
  active: boolean;
  created_at?: string;
}

export interface ClientUnit {
  id: string;
  client_id: string;
  unit_name: string;
  unit_type: string | null;
  city_name: string | null;
  state: string | null;
  city_anniversary: string | null;
  population: number | null;
  competitors: string | null;
  has_convenience: boolean;
  has_lodging: boolean;
  has_restaurant: boolean;
  address: string | null;
  phone: string | null;
  manager_name: string | null;
  notes: string | null;
  photos: string[] | null;
  videos: string[] | null;
  created_at?: string;
}

const asArray = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : []);

function normalizeMedia<T extends { photos?: unknown; videos?: unknown }>(row: T) {
  return { ...row, photos: asArray(row.photos), videos: asArray(row.videos) };
}

/** Profissionais e unidades de rede de um cliente — 100% via API da VPS. */
export function useClientDatabase(clientId?: string) {
  const queryClient = useQueryClient();

  const professionals = useQuery({
    queryKey: ['client-professionals', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientProfessional[]> => {
      const { data, error } = await supabase
        .from('client_professionals')
        .select('*')
        .eq('client_id', clientId as string)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []).map((row: any) => normalizeMedia(row)) as ClientProfessional[];
    },
  });

  const units = useQuery({
    queryKey: ['client-units', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientUnit[]> => {
      const { data, error } = await supabase
        .from('client_units')
        .select('*')
        .eq('client_id', clientId as string)
        .order('city_name', { ascending: true });
      if (error) throw error;
      return (data || []).map((row: any) => normalizeMedia(row)) as ClientUnit[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['client-professionals', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-units', clientId] });
  };

  const saveRecord = useMutation({
    mutationFn: async ({ table, payload }: { table: 'client_professionals' | 'client_units'; payload: Record<string, unknown> }) => {
      const { id, ...rest } = payload as { id?: string };
      if (id) {
        const { error } = await supabase.from(table).update(rest as any).eq('id', id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from(table).insert(rest as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Registro salvo com sucesso!');
    },
    onError: (error: any) => toast.error(error?.message || 'Erro ao salvar registro'),
  });

  const deleteRecord = useMutation({
    mutationFn: async ({ table, id }: { table: 'client_professionals' | 'client_units'; id: string }) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Registro removido.');
    },
    onError: (error: any) => toast.error(error?.message || 'Erro ao remover registro'),
  });

  return { professionals, units, saveRecord, deleteRecord };
}
