import { useState, useEffect, useCallback } from 'react';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import type { Client, Recording, KanbanTask, Script, CompanySettings, DayOfWeek, ActiveRecording, ContentType, RecordingType, RecordingStatus, ConfirmationStatus, KanbanColumn, ScriptVideoType, ScriptPriority, ScriptContentFormat } from '@/types';

// ── Mappers: DB row ↔ App type ──

function rowToClient(r: any): Client {
  return {
    id: r.id,
    companyName: r.company_name,
    responsiblePerson: r.responsible_person,
    phone: r.phone,
    color: r.color,
    logoUrl: r.logo_url || undefined,
    fixedDay: r.fixed_day as DayOfWeek,
    fixedTime: r.fixed_time,
    videomaker: r.videomaker_id || '',
    backupTime: r.backup_time,
    backupDay: r.backup_day as DayOfWeek,
    extraDay: r.extra_day as DayOfWeek,
    extraContentTypes: (r.extra_content_types || []) as ContentType[],
    acceptsExtra: r.accepts_extra,
    extraClientAppears: r.extra_client_appears,
    whatsapp: r.whatsapp || '',
    whatsappGroup: r.whatsapp_group || '',
    email: r.email || '',
    city: r.city || '',
    weeklyReels: r.weekly_reels,
    weeklyCreatives: r.weekly_creatives,
    weeklyGoal: r.weekly_goal,
    hasEndomarketing: r.has_endomarketing,
    hasVehicleFlyer: r.has_vehicle_flyer ?? false,
    weeklyStories: r.weekly_stories,
    presenceDays: r.presence_days,
    monthlyRecordings: r.monthly_recordings ?? 4,
    niche: r.niche || '',
    clientLogin: r.client_login || '',
    clientPassword: '',
    driveLink: r.drive_link || '',
    driveFotos: r.drive_fotos || '',
    driveIdentidadeVisual: r.drive_identidade_visual || '',
    editorial: r.editorial || '',
  };
}

function clientToRow(c: Client) {
  return {
    id: c.id,
    company_name: c.companyName,
    responsible_person: c.responsiblePerson,
    phone: c.phone,
    color: c.color,
    logo_url: c.logoUrl || null,
    fixed_day: c.fixedDay,
    fixed_time: c.fixedTime,
    videomaker_id: c.videomaker || null,
    backup_time: c.backupTime,
    backup_day: c.backupDay,
    extra_day: c.extraDay,
    extra_content_types: c.extraContentTypes,
    accepts_extra: c.acceptsExtra,
    extra_client_appears: c.extraClientAppears,
    whatsapp: c.whatsapp || '',
    whatsapp_group: c.whatsappGroup || null,
    email: c.email || '',
    city: c.city || '',
    weekly_reels: c.weeklyReels,
    weekly_creatives: c.weeklyCreatives,
    weekly_goal: c.weeklyGoal,
    has_endomarketing: c.hasEndomarketing,
    has_vehicle_flyer: c.hasVehicleFlyer ?? false,
    weekly_stories: c.weeklyStories,
    presence_days: c.presenceDays,
    monthly_recordings: c.monthlyRecordings,
    niche: c.niche || '',
    client_login: c.clientLogin || '',
    drive_link: c.driveLink || '',
    drive_fotos: c.driveFotos || '',
    drive_identidade_visual: c.driveIdentidadeVisual || '',
    editorial: c.editorial || '',
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
    confirmationStatus: (r.confirmation_status || 'pendente') as ConfirmationStatus,
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
    contentFormat: (r.content_format || 'reels') as ScriptContentFormat,
    content: r.content,
    recorded: r.recorded,
    priority: (r.priority || 'normal') as ScriptPriority,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isEndomarketing: r.is_endomarketing || false,
    endoClientId: r.endo_client_id || undefined,
    scheduledDate: r.scheduled_date || undefined,
    createdBy: r.created_by || undefined,
    directToEditing: r.direct_to_editing || false,
  };
}

function scriptToRow(s: Script) {
  return {
    id: s.id,
    client_id: s.clientId,
    title: s.title,
    video_type: s.videoType,
    content_format: s.contentFormat,
    content: s.content,
    recorded: s.recorded,
    priority: s.priority,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    is_endomarketing: s.isEndomarketing,
    endo_client_id: s.endoClientId || null,
    scheduled_date: s.scheduledDate || null,
    created_by: s.createdBy || null,
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
    editingDeadlineHours: r.editing_deadline_hours ?? 48,
    reviewDeadlineHours: r.review_deadline_hours ?? 24,
    alterationDeadlineHours: r.alteration_deadline_hours ?? 24,
    approvalDeadlineHours: r.approval_deadline_hours ?? 6,
  };
}

function rowToActiveRecording(r: any): ActiveRecording {
  return {
    recordingId: r.recording_id,
    videomarkerId: r.videomaker_id,
    clientId: r.client_id,
    startedAt: r.started_at,
    plannedScriptIds: r.planned_script_ids || [],
  };
}

const defaultSettings: CompanySettings = {
  shiftAStart: '08:30',
  shiftAEnd: '12:00',
  shiftBStart: '14:30',
  shiftBEnd: '18:00',
  workDays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
  recordingDuration: 120,
  editingDeadlineHours: 48,
  reviewDeadlineHours: 24,
  alterationDeadlineHours: 24,
  approvalDeadlineHours: 6,
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

  // ── Initial fetch via VPS API ──
  useEffect(() => {
    async function fetchAll() {
      const [cRes, rRes, tRes, sRes, setRes, arRes] = await Promise.all([
        invokeVpsFunction('clients', { method: 'GET' }),
        invokeVpsFunction('recordings', { method: 'GET' }),
        invokeVpsFunction('kanban-tasks', { method: 'GET' }),
        invokeVpsFunction('scripts', { method: 'GET' }),
        invokeVpsFunction('company-settings', { method: 'GET' }),
        invokeVpsFunction('active-recordings', { method: 'GET' }),
      ]);
      if (cRes.data && !cRes.error) setClients((Array.isArray(cRes.data) ? cRes.data : []).map(rowToClient));
      if (rRes.data && !rRes.error) setRecordings((Array.isArray(rRes.data) ? rRes.data : []).map(rowToRecording));
      if (tRes.data && !tRes.error) setTasks((Array.isArray(tRes.data) ? tRes.data : []).map(rowToTask));
      if (sRes.data && !sRes.error) setScripts((Array.isArray(sRes.data) ? sRes.data : []).map(rowToScript));
      if (setRes.data && !setRes.error && setRes.data) {
        setSettings(rowToSettings(setRes.data));
        setSettingsId(setRes.data.id);
      }
      if (arRes.data && !arRes.error) setActiveRecordings((Array.isArray(arRes.data) ? arRes.data : []).map(rowToActiveRecording));
      setLoading(false);
    }
    fetchAll();
  }, []);

  // ── Polling for data changes (replaces Supabase Realtime) ──
  useEffect(() => {
    const interval = setInterval(async () => {
      const [cRes, rRes, tRes, sRes, arRes] = await Promise.all([
        invokeVpsFunction('clients', { method: 'GET' }),
        invokeVpsFunction('recordings', { method: 'GET' }),
        invokeVpsFunction('kanban-tasks', { method: 'GET' }),
        invokeVpsFunction('scripts', { method: 'GET' }),
        invokeVpsFunction('active-recordings', { method: 'GET' }),
      ]);
      if (cRes.data && !cRes.error) setClients((Array.isArray(cRes.data) ? cRes.data : []).map(rowToClient));
      if (rRes.data && !rRes.error) setRecordings((Array.isArray(rRes.data) ? rRes.data : []).map(rowToRecording));
      if (tRes.data && !tRes.error) setTasks((Array.isArray(tRes.data) ? tRes.data : []).map(rowToTask));
      if (sRes.data && !sRes.error) setScripts((Array.isArray(sRes.data) ? sRes.data : []).map(rowToScript));
      if (arRes.data && !arRes.error) setActiveRecordings((Array.isArray(arRes.data) ? arRes.data : []).map(rowToActiveRecording));
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // ── Bulk insert recordings ──
  const addRecordingsBulk = useCallback(async (recs: Recording[]): Promise<boolean> => {
    if (recs.length === 0) return true;
    const rows = recs.map(r => recordingToRow(r));
    const { error } = await invokeVpsFunction('recordings', { body: rows });
    if (error) { console.error('addRecordingsBulk error:', error); return false; }
    setRecordings(prev => [...prev, ...recs]);
    return true;
  }, []);

  // ── Client CRUD ──
  const addClient = useCallback(async (client: Client): Promise<boolean> => {
    if (clients.some(c => c.companyName.toLowerCase() === client.companyName.toLowerCase())) return false;
    const { error } = await invokeVpsFunction('clients', { body: clientToRow(client) });
    if (error) { console.error('addClient error:', error); return false; }
    setClients(prev => [...prev, client]);
    return true;
  }, [clients]);

  const updateClient = useCallback(async (client: Client) => {
    const { id, ...rest } = clientToRow(client);
    await invokeVpsFunction(`clients/${id}`, { body: rest, method: 'PUT' });
    setClients(prev => prev.map(c => c.id === client.id ? client : c));
  }, []);

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await invokeVpsFunction(`clients/${id}`, { method: 'DELETE' });
      if (error) { console.error('deleteClient error:', error); return false; }
      setClients(prev => prev.filter(c => c.id !== id));
      setRecordings(prev => prev.filter(r => r.clientId !== id));
      setActiveRecordings(prev => prev.filter(a => a.clientId !== id));
      setTasks(prev => prev.filter(t => t.clientId !== id));
      setScripts(prev => prev.filter(s => s.clientId !== id));
      return true;
    } catch (err) {
      console.error('deleteClient error:', err);
      return false;
    }
  }, []);

  // ── Recording CRUD ──
  const addRecording = useCallback(async (recording: Recording): Promise<boolean> => {
    const { error } = await invokeVpsFunction('recordings', { body: recordingToRow(recording) });
    if (error) { console.error('addRecording error:', error); return false; }
    setRecordings(prev => [...prev, recording]);
    return true;
  }, []);

  const updateRecording = useCallback(async (recording: Recording) => {
    const { id, ...rest } = recordingToRow(recording);
    await invokeVpsFunction(`recordings/${id}`, { body: rest, method: 'PUT' });
    setRecordings(prev => prev.map(r => r.id === recording.id ? recording : r));
  }, []);

  const cancelRecording = useCallback(async (id: string) => {
    await invokeVpsFunction(`recordings/${id}`, { body: { status: 'cancelada' }, method: 'PUT' });
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelada' as const } : r));
  }, []);

  const deleteFutureRecordingsForClient = useCallback(async (clientId: string): Promise<number> => {
    const { data } = await invokeVpsFunction(`recordings/future/${clientId}`, { method: 'DELETE' });
    const deleted = data?.deleted || 0;
    if (deleted > 0) {
      const today = new Date().toISOString().split('T')[0];
      setRecordings(prev => prev.filter(r => !(r.clientId === clientId && r.status === 'agendada' && r.date >= today)));
    }
    return deleted;
  }, []);

  // ── Task CRUD ──
  const addTask = useCallback(async (task: KanbanTask) => {
    await invokeVpsFunction('kanban-tasks', { body: taskToRow(task) });
    setTasks(prev => [...prev, task]);
  }, []);

  const updateTask = useCallback(async (task: KanbanTask) => {
    const { id, ...rest } = taskToRow(task);
    await invokeVpsFunction(`kanban-tasks/${id}`, { body: rest, method: 'PUT' });
    setTasks(prev => prev.map(t => t.id === task.id ? task : t));
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    await invokeVpsFunction(`kanban-tasks/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Script CRUD ──
  const addScript = useCallback(async (script: Script) => {
    await invokeVpsFunction('scripts', { body: scriptToRow(script) });
    setScripts(prev => [...prev, script]);
  }, []);

  const updateScript = useCallback(async (script: Script) => {
    const { id, ...rest } = scriptToRow(script);
    const { error } = await invokeVpsFunction(`scripts/${id}`, { body: rest, method: 'PUT' });
    if (error) { console.error('updateScript error:', error); return; }
    setScripts(prev => prev.map(s => s.id === script.id ? script : s));
  }, []);

  const deleteScript = useCallback(async (id: string) => {
    await invokeVpsFunction(`scripts/${id}`, { method: 'DELETE' });
    setScripts(prev => prev.filter(s => s.id !== id));
  }, []);

  // ── Settings ──
  const updateSettings = useCallback(async (s: CompanySettings) => {
    if (settingsId) {
      await invokeVpsFunction(`company-settings/${settingsId}`, {
        body: {
          shift_a_start: s.shiftAStart,
          shift_a_end: s.shiftAEnd,
          shift_b_start: s.shiftBStart,
          shift_b_end: s.shiftBEnd,
          work_days: s.workDays,
          recording_duration: s.recordingDuration,
          editing_deadline_hours: s.editingDeadlineHours,
          review_deadline_hours: s.reviewDeadlineHours,
          alteration_deadline_hours: s.alterationDeadlineHours,
          approval_deadline_hours: s.approvalDeadlineHours,
        },
        method: 'PUT',
      });
    }
    setSettings(s);
  }, [settingsId]);

  // ── Active recordings ──
  const startActiveRecording = useCallback(async (rec: ActiveRecording) => {
    await invokeVpsFunction('active-recordings', {
      body: {
        recording_id: rec.recordingId,
        videomaker_id: rec.videomarkerId,
        client_id: rec.clientId,
        started_at: rec.startedAt,
        planned_script_ids: rec.plannedScriptIds || [],
      },
    });
    setActiveRecordings(prev => [...prev.filter(a => a.recordingId !== rec.recordingId), rec]);
  }, []);

  const stopActiveRecording = useCallback(async (recordingId: string, deliveryOverrides?: { reels_produced?: number; videos_recorded?: number; creatives_produced?: number; stories_produced?: number; arts_produced?: number; extras_produced?: number }, completedScriptIds?: string[]) => {
    await invokeVpsFunction(`active-recordings/${recordingId}/stop`, {
      body: { deliveryOverrides, completedScriptIds },
    });
    setActiveRecordings(prev => prev.filter(a => a.recordingId !== recordingId));
  }, []);

  return {
    clients, recordings, tasks, scripts, settings, activeRecordings, loading,
    addClient, updateClient, deleteClient,
    addRecording, addRecordingsBulk, updateRecording, cancelRecording, deleteFutureRecordingsForClient,
    addTask, updateTask, deleteTask,
    addScript, updateScript, deleteScript,
    updateSettings, startActiveRecording, stopActiveRecording,
  };
}
