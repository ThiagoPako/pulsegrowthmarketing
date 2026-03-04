import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Client, Recording, KanbanTask, Script, CompanySettings, DayOfWeek, ActiveRecording, ContentType, RecordingType, RecordingStatus, KanbanColumn, ScriptVideoType, ScriptPriority } from '@/types';

// ── Mappers: DB row ↔ App type ──

function rowToClient(r: any): Client {
  return {
    id: r.id,
    companyName: r.company_name,
    responsiblePerson: r.responsible_person,
    phone: r.phone,
    color: r.color,
    fixedDay: r.fixed_day as DayOfWeek,
    fixedTime: r.fixed_time,
    videomaker: r.videomaker_id || '',
    backupTime: r.backup_time,
    backupDay: r.backup_day as DayOfWeek,
    extraDay: r.extra_day as DayOfWeek,
    extraContentTypes: (r.extra_content_types || []) as ContentType[],
    acceptsExtra: r.accepts_extra,
    extraClientAppears: r.extra_client_appears,
    weeklyReels: r.weekly_reels,
    weeklyCreatives: r.weekly_creatives,
    weeklyGoal: r.weekly_goal,
    hasEndomarketing: r.has_endomarketing,
    weeklyStories: r.weekly_stories,
    presenceDays: r.presence_days,
  };
}

function clientToRow(c: Client) {
  return {
    id: c.id,
    company_name: c.companyName,
    responsible_person: c.responsiblePerson,
    phone: c.phone,
    color: c.color,
    fixed_day: c.fixedDay,
    fixed_time: c.fixedTime,
    videomaker_id: c.videomaker || null,
    backup_time: c.backupTime,
    backup_day: c.backupDay,
    extra_day: c.extraDay,
    extra_content_types: c.extraContentTypes,
    accepts_extra: c.acceptsExtra,
    extra_client_appears: c.extraClientAppears,
    weekly_reels: c.weeklyReels,
    weekly_creatives: c.weeklyCreatives,
    weekly_goal: c.weeklyGoal,
    has_endomarketing: c.hasEndomarketing,
    weekly_stories: c.weeklyStories,
    presence_days: c.presenceDays,
  };
}

function rowToRecording(r: any): Recording {
  return {
    id: r.id,
    clientId: r.client_id,
    videomakerId: r.videomaker_id,
    date: r.date,
    startTime: r.start_time,
    type: r.type as RecordingType,
    status: r.status as RecordingStatus,
  };
}

function recordingToRow(r: Recording) {
  return {
    id: r.id,
    client_id: r.clientId,
    videomaker_id: r.videomakerId,
    date: r.date,
    start_time: r.startTime,
    type: r.type,
    status: r.status,
  };
}

function rowToTask(r: any): KanbanTask {
  return {
    id: r.id,
    clientId: r.client_id,
    title: r.title,
    column: r.column as KanbanColumn,
    checklist: r.checklist || [],
    weekStart: r.week_start,
    recordingDate: r.recording_date || undefined,
  };
}

function taskToRow(t: KanbanTask) {
  return {
    id: t.id,
    client_id: t.clientId,
    title: t.title,
    column: t.column,
    checklist: t.checklist as any,
    week_start: t.weekStart,
    recording_date: t.recordingDate || null,
  };
}

function rowToScript(r: any): Script {
  return {
    id: r.id,
    clientId: r.client_id,
    title: r.title,
    videoType: r.video_type as ScriptVideoType,
    content: r.content,
    recorded: r.recorded,
    priority: (r.priority || 'normal') as ScriptPriority,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function scriptToRow(s: Script) {
  return {
    id: s.id,
    client_id: s.clientId,
    title: s.title,
    video_type: s.videoType,
    content: s.content,
    recorded: s.recorded,
    priority: s.priority,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function rowToSettings(r: any): CompanySettings {
  return {
    shiftAStart: r.shift_a_start,
    shiftAEnd: r.shift_a_end,
    shiftBStart: r.shift_b_start,
    shiftBEnd: r.shift_b_end,
    workDays: r.work_days as DayOfWeek[],
    recordingDuration: r.recording_duration,
  };
}

function rowToActiveRecording(r: any): ActiveRecording {
  return {
    recordingId: r.recording_id,
    videomarkerId: r.videomaker_id,
    clientId: r.client_id,
    startedAt: r.started_at,
  };
}

const defaultSettings: CompanySettings = {
  shiftAStart: '08:00',
  shiftAEnd: '12:00',
  shiftBStart: '13:00',
  shiftBEnd: '18:00',
  workDays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
  recordingDuration: 120,
};

export function useSupabaseData() {
  const [clients, setClients] = useState<Client[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [settingsId, setSettingsId] = useState<string>('');
  const [activeRecordings, setActiveRecordings] = useState<ActiveRecording[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Initial fetch ──
  useEffect(() => {
    async function fetchAll() {
      const [cRes, rRes, tRes, sRes, setRes, arRes] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('recordings').select('*'),
        supabase.from('kanban_tasks').select('*'),
        supabase.from('scripts').select('*'),
        supabase.from('company_settings').select('*').limit(1).single(),
        supabase.from('active_recordings').select('*'),
      ]);
      if (cRes.data) setClients(cRes.data.map(rowToClient));
      if (rRes.data) setRecordings(rRes.data.map(rowToRecording));
      if (tRes.data) setTasks(tRes.data.map(rowToTask));
      if (sRes.data) setScripts(sRes.data.map(rowToScript));
      if (setRes.data) {
        setSettings(rowToSettings(setRes.data));
        setSettingsId(setRes.data.id);
      }
      if (arRes.data) setActiveRecordings(arRes.data.map(rowToActiveRecording));
      setLoading(false);
    }
    fetchAll();
  }, []);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const channel = supabase.channel('data-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        supabase.from('clients').select('*').then(({ data }) => { if (data) setClients(data.map(rowToClient)); });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => {
        supabase.from('recordings').select('*').then(({ data }) => { if (data) setRecordings(data.map(rowToRecording)); });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_tasks' }, () => {
        supabase.from('kanban_tasks').select('*').then(({ data }) => { if (data) setTasks(data.map(rowToTask)); });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scripts' }, () => {
        supabase.from('scripts').select('*').then(({ data }) => { if (data) setScripts(data.map(rowToScript)); });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_recordings' }, () => {
        supabase.from('active_recordings').select('*').then(({ data }) => { if (data) setActiveRecordings(data.map(rowToActiveRecording)); });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Bulk insert recordings ──
  const addRecordingsBulk = useCallback(async (recs: Recording[]): Promise<boolean> => {
    if (recs.length === 0) return true;
    const rows = recs.map(r => recordingToRow(r));
    const { error } = await supabase.from('recordings').insert(rows as any);
    if (error) { console.error('addRecordingsBulk error:', error); return false; }
    setRecordings(prev => [...prev, ...recs]);
    return true;
  }, []);

  // ── Client CRUD ──
  const addClient = useCallback(async (client: Client): Promise<boolean> => {
    // Check duplicate
    if (clients.some(c => c.companyName.toLowerCase() === client.companyName.toLowerCase())) return false;
    const { error } = await supabase.from('clients').insert(clientToRow(client) as any);
    if (error) { console.error('addClient error:', error); return false; }
    setClients(prev => [...prev, client]);
    return true;
  }, [clients]);

  const updateClient = useCallback(async (client: Client) => {
    const { id, ...rest } = clientToRow(client);
    await supabase.from('clients').update(rest as any).eq('id', id);
    setClients(prev => prev.map(c => c.id === client.id ? client : c));
  }, []);

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    const hasFuture = recordings.some(r => r.clientId === id && r.status === 'agendada' && r.date >= new Date().toISOString().split('T')[0]);
    if (hasFuture) return false;
    await supabase.from('clients').delete().eq('id', id);
    setClients(prev => prev.filter(c => c.id !== id));
    return true;
  }, [recordings]);

  // ── Recording CRUD ──
  const addRecording = useCallback(async (recording: Recording): Promise<boolean> => {
    const { error } = await supabase.from('recordings').insert(recordingToRow(recording) as any);
    if (error) { console.error('addRecording error:', error); return false; }
    setRecordings(prev => [...prev, recording]);
    return true;
  }, []);

  const updateRecording = useCallback(async (recording: Recording) => {
    const { id, ...rest } = recordingToRow(recording);
    await supabase.from('recordings').update(rest as any).eq('id', id);
    setRecordings(prev => prev.map(r => r.id === recording.id ? recording : r));
  }, []);

  const cancelRecording = useCallback(async (id: string) => {
    await supabase.from('recordings').update({ status: 'cancelada' } as any).eq('id', id);
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelada' as const } : r));
  }, []);

  // ── Task CRUD ──
  const addTask = useCallback(async (task: KanbanTask) => {
    await supabase.from('kanban_tasks').insert(taskToRow(task) as any);
    setTasks(prev => [...prev, task]);
  }, []);

  const updateTask = useCallback(async (task: KanbanTask) => {
    const { id, ...rest } = taskToRow(task);
    await supabase.from('kanban_tasks').update(rest as any).eq('id', id);
    setTasks(prev => prev.map(t => t.id === task.id ? task : t));
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    await supabase.from('kanban_tasks').delete().eq('id', id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Script CRUD ──
  const addScript = useCallback(async (script: Script) => {
    await supabase.from('scripts').insert(scriptToRow(script) as any);
    setScripts(prev => [...prev, script]);
  }, []);

  const updateScript = useCallback(async (script: Script) => {
    const { id, ...rest } = scriptToRow(script);
    await supabase.from('scripts').update(rest as any).eq('id', id);
    setScripts(prev => prev.map(s => s.id === script.id ? script : s));
  }, []);

  const deleteScript = useCallback(async (id: string) => {
    await supabase.from('scripts').delete().eq('id', id);
    setScripts(prev => prev.filter(s => s.id !== id));
  }, []);

  // ── Settings ──
  const updateSettings = useCallback(async (s: CompanySettings) => {
    if (settingsId) {
      await supabase.from('company_settings').update({
        shift_a_start: s.shiftAStart,
        shift_a_end: s.shiftAEnd,
        shift_b_start: s.shiftBStart,
        shift_b_end: s.shiftBEnd,
        work_days: s.workDays,
        recording_duration: s.recordingDuration,
      } as any).eq('id', settingsId);
    }
    setSettings(s);
  }, [settingsId]);

  // ── Active recordings ──
  const startActiveRecording = useCallback(async (rec: ActiveRecording) => {
    // Remove existing for this recording
    await supabase.from('active_recordings').delete().eq('recording_id', rec.recordingId);
    await supabase.from('active_recordings').insert({
      recording_id: rec.recordingId,
      videomaker_id: rec.videomarkerId,
      client_id: rec.clientId,
      started_at: rec.startedAt,
    } as any);
    setActiveRecordings(prev => [...prev.filter(a => a.recordingId !== rec.recordingId), rec]);
  }, []);

  const stopActiveRecording = useCallback(async (recordingId: string) => {
    await supabase.from('active_recordings').delete().eq('recording_id', recordingId);
    setActiveRecordings(prev => prev.filter(a => a.recordingId !== recordingId));
  }, []);

  return {
    clients, recordings, tasks, scripts, settings, activeRecordings, loading,
    addClient, updateClient, deleteClient,
    addRecording, addRecordingsBulk, updateRecording, cancelRecording,
    addTask, updateTask, deleteTask,
    addScript, updateScript, deleteScript,
    updateSettings, startActiveRecording, stopActiveRecording,
  };
}
