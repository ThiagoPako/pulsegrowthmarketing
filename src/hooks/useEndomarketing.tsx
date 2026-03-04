import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, startOfWeek, parseISO, differenceInMinutes } from 'date-fns';

export interface EndoCliente {
  id: string;
  client_id?: string;
  company_name: string;
  responsible_person?: string;
  phone?: string;
  color: string;
  active: boolean;
  stories_per_week: number;
  presence_days_per_week: number;
  selected_days: string[];
  session_duration: number;
  execution_type: string;
  plan_type: string;
  total_contracted_hours: number;
  notes?: string;
  editorial?: string;
  created_at: string;
  updated_at: string;
}

export interface EndoProfissional {
  id: string;
  user_id: string;
  max_hours_per_day: number;
  available_days: string[];
  start_time: string;
  end_time: string;
  active: boolean;
}

export interface EndoAgendamento {
  id: string;
  cliente_id: string;
  profissional_id: string;
  videomaker_id?: string;
  date: string;
  start_time: string;
  duration: number;
  status: string;
  cancellation_reason?: string;
  checklist: { stories: boolean; reels: boolean; institucional: boolean; estrategico: boolean };
  notes?: string;
  created_at: string;
}

export function useEndoClientes() {
  const [clientes, setClientes] = useState<EndoCliente[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('endomarketing_clientes')
      .select('*')
      .order('company_name');
    if (data) setClientes(data as unknown as EndoCliente[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const channel = supabase
      .channel('endo-clientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'endomarketing_clientes' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const addCliente = async (cliente: Omit<EndoCliente, 'id' | 'created_at' | 'updated_at'>) => {
    const { error } = await supabase.from('endomarketing_clientes').insert(cliente as any);
    return !error;
  };

  const updateCliente = async (id: string, updates: Partial<EndoCliente>) => {
    await supabase.from('endomarketing_clientes').update(updates as any).eq('id', id);
  };

  const deleteCliente = async (id: string) => {
    await supabase.from('endomarketing_clientes').delete().eq('id', id);
  };

  return { clientes, loading, addCliente, updateCliente, deleteCliente, refresh: fetch };
}

export function useEndoProfissionais() {
  const [profissionais, setProfissionais] = useState<EndoProfissional[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('endomarketing_profissionais').select('*');
    if (data) setProfissionais(data as unknown as EndoProfissional[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const addProfissional = async (prof: Omit<EndoProfissional, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('endomarketing_profissionais').insert(prof as any);
    return !error;
  };

  const updateProfissional = async (id: string, updates: Partial<EndoProfissional>) => {
    await supabase.from('endomarketing_profissionais').update(updates as any).eq('id', id);
  };

  return { profissionais, loading, addProfissional, updateProfissional, refresh: fetch };
}

export function useEndoAgendamentos() {
  const [agendamentos, setAgendamentos] = useState<EndoAgendamento[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('endomarketing_agendamentos')
      .select('*')
      .order('date', { ascending: true });
    if (data) setAgendamentos(data as unknown as EndoAgendamento[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const channel = supabase
      .channel('endo-agendamentos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'endomarketing_agendamentos' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const addAgendamento = async (ag: Omit<EndoAgendamento, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('endomarketing_agendamentos').insert(ag as any);
    return !error;
  };

  const updateAgendamento = async (id: string, updates: Partial<EndoAgendamento>) => {
    await supabase.from('endomarketing_agendamentos').update(updates as any).eq('id', id);
  };

  const cancelAgendamento = async (id: string, reason?: string) => {
    await supabase.from('endomarketing_agendamentos').update({ status: 'cancelado', cancellation_reason: reason } as any).eq('id', id);
  };

  // Check conflicts for professional
  const hasConflict = (profissionalId: string, date: string, startTime: string, duration: number, excludeId?: string) => {
    const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const newStart = timeToMin(startTime);
    const newEnd = newStart + duration;
    return agendamentos.some(a => {
      if (a.id === excludeId || a.status === 'cancelado') return false;
      if (a.profissional_id !== profissionalId || a.date !== date) return false;
      const existStart = timeToMin(a.start_time);
      const existEnd = existStart + a.duration;
      return newStart < existEnd && newEnd > existStart;
    });
  };

  // Check videomaker conflicts
  const hasVideomakerConflict = (videomakerId: string, date: string, startTime: string, duration: number, excludeId?: string) => {
    const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const newStart = timeToMin(startTime);
    const newEnd = newStart + duration;
    return agendamentos.some(a => {
      if (a.id === excludeId || a.status === 'cancelado' || !a.videomaker_id) return false;
      if (a.videomaker_id !== videomakerId || a.date !== date) return false;
      const existStart = timeToMin(a.start_time);
      const existEnd = existStart + a.duration;
      return newStart < existEnd && newEnd > existStart;
    });
  };

  // Get daily occupation for a professional
  const getDailyOccupation = (profissionalId: string, date: string) => {
    return agendamentos
      .filter(a => a.profissional_id === profissionalId && a.date === date && a.status !== 'cancelado')
      .reduce((sum, a) => sum + a.duration, 0);
  };

  // Suggest best days for scheduling
  const suggestBestDays = (profissionalId: string, profMaxMinutes: number, duration: number, days: number = 30) => {
    const suggestions: { date: string; occupation: number; available: number }[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = addDays(today, i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // skip weekends
      const dateStr = format(d, 'yyyy-MM-dd');
      const occupied = getDailyOccupation(profissionalId, dateStr);
      const available = profMaxMinutes - occupied;
      if (available >= duration) {
        suggestions.push({ date: dateStr, occupation: occupied, available });
      }
    }
    return suggestions.sort((a, b) => a.occupation - b.occupation).slice(0, 10);
  };

  return {
    agendamentos, loading, addAgendamento, updateAgendamento, cancelAgendamento,
    hasConflict, hasVideomakerConflict, getDailyOccupation, suggestBestDays, refresh: fetch
  };
}
