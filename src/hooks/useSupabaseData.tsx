import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/vpsDb';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import type { Client, Recording, KanbanTask, Script, CompanySettings, DayOfWeek, ActiveRecording, ContentType, RecordingType, RecordingStatus, ConfirmationStatus, KanbanColumn, ScriptVideoType, ScriptPriority, ScriptContentFormat } from '@/types';

// ── Mappers: DB row ↔ App type ──

function rowToClient(r: any): Client {
  const normalizeDayOfWeek = (value: any, fallback: DayOfWeek): DayOfWeek => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace('terça', 'terca')
      .replace('sabado', 'sabado') as DayOfWeek;

    return ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'].includes(normalized)
      ? normalized
      : fallback;
  };

  const parseSelectedWeeks = (value: any): number[] => {
    if (Array.isArray(value)) return value.map(Number).filter(Boolean);
    if (typeof value === 'string') {
      const weeks = value.replace(/[{}\[\]\s]/g, '').split(',').map(Number).filter(Boolean);
      return weeks.length > 0 ? weeks : [1, 2, 3, 4];
    }
    return [1, 2, 3, 4];
  };

  return {
    id: r.id,
    companyName: r.company_name,
    responsiblePerson: r.responsible_person,
    phone: r.phone,
    color: r.color,
    logoUrl: r.logo_url || undefined,
    fixedDay: normalizeDayOfWeek(r.fixed_day, 'segunda'),
    fixedTime: r.fixed_time,
    videomaker: r.videomaker_id || '',
    backupTime: r.backup_time,
    backupDay: normalizeDayOfWeek(r.backup_day, 'terca'),
    extraDay: normalizeDayOfWeek(r.extra_day, 'quarta'),
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
    fullShiftRecording: r.full_shift_recording || false,
    preferredShift: r.preferred_shift || 'manha',
    selectedWeeks: parseSelectedWeeks(r.selected_weeks),
    artRequestsLimit: r.art_requests_limit ?? null,
    clientType: r.client_type || 'novo',
    proposalId: r.proposal_id || null,
    status: r.status || 'ativo',
    cancellationDate: r.cancellation_date || null,
    cancellationReason: r.cancellation_reason || null,
    briefingData: r.briefing_data || {},
  } as Client & { status: string; cancellationDate: string | null; cancellationReason: string | null; briefingData: any };
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
    full_shift_recording: c.fullShiftRecording || false,
    preferred_shift: c.preferredShift || 'manha',
    selected_weeks: c.selectedWeeks || [1, 2, 3, 4],
    art_requests_limit: c.artRequestsLimit ?? null,
    client_type: c.clientType || 'novo',
    proposal_id: c.proposalId || null,
  };
}

function normalizeDate(d: string): string {
  // API may return ISO timestamps like "2026-03-20T00:00:00.000Z"
  // Normalize to "YYYY-MM-DD" for consistent comparisons
  if (!d) return d;
  if (d.length > 10 && d.includes('T')) return d.split('T')[0];
  return d;
}

function rowToRecording(r: any): Recording {
  return {
    id: r.id,
    clientId: r.client_id || '',
    videomakerId: r.videomaker_id,
    date: normalizeDate(r.date),
    startTime: r.start_time,
    type: r.type as RecordingType,
    status: r.status as RecordingStatus,
    confirmationStatus: (r.confirmation_status || 'pendente') as ConfirmationStatus,
    ...(r.prospect_name ? { prospectName: r.prospect_name } : {}),
  };
}

function recordingToRow(r: Recording) {
  const row: any = {
    id: r.id,
    client_id: r.clientId || null,
    videomaker_id: r.videomakerId,
    date: r.date,
    start_time: r.startTime,
    type: r.type,
    status: r.status,
  };
  if (r.prospectName) row.prospect_name = r.prospectName;
  return row;
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
    clientId: r.client_id || '',
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
    recordingId: r.recording_id || undefined,
    clientEdited: r.client_edited || false,
    clientEditedAt: r.client_edited_at || undefined,
  };
}

function scriptToRow(s: Script) {
  return {
    id: s.id,
    client_id: s.clientId || null,
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
    direct_to_editing: s.directToEditing || false,
    recording_id: s.recordingId || null,
  };
}

function rowToSettings(r: any): CompanySettings {
  const parseWorkDays = (value: any): DayOfWeek[] => {
    if (Array.isArray(value) && value.length > 0) return value as DayOfWeek[];
    if (typeof value === 'string') {
      const days = value.replace(/[{}\[\]"\s]/g, '').split(',').filter(Boolean) as DayOfWeek[];
      if (days.length > 0) return days;
    }
    return defaultSettings.workDays;
  };

  const recordingDuration = Number(r?.recording_duration);

  return {
    shiftAStart: r?.shift_a_start || defaultSettings.shiftAStart,
    shiftAEnd: r?.shift_a_end || defaultSettings.shiftAEnd,
    shiftBStart: r?.shift_b_start || defaultSettings.shiftBStart,
    shiftBEnd: r?.shift_b_end || defaultSettings.shiftBEnd,
    workDays: parseWorkDays(r?.work_days),
    recordingDuration: Number.isFinite(recordingDuration) && recordingDuration > 0 ? recordingDuration : defaultSettings.recordingDuration,
    editingDeadlineHours: r?.editing_deadline_hours ?? 48,
    reviewDeadlineHours: r?.review_deadline_hours ?? 24,
    alterationDeadlineHours: r?.alteration_deadline_hours ?? 24,
    approvalDeadlineHours: r?.approval_deadline_hours ?? 6,
    editingDeadlineEnabled: r?.editing_deadline_enabled ?? true,
    reviewDeadlineEnabled: r?.review_deadline_enabled ?? true,
    alterationDeadlineEnabled: r?.alteration_deadline_enabled ?? true,
    approvalDeadlineEnabled: r?.approval_deadline_enabled ?? true,
    costAllocationRule: r?.cost_allocation_rule || 'approved',
    autoFillVacancies: r?.auto_fill_vacancies ?? false,
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
  recordingDuration: 90,
  editingDeadlineHours: 48,
  reviewDeadlineHours: 24,
  alterationDeadlineHours: 24,
  approvalDeadlineHours: 6,
  editingDeadlineEnabled: true,
  reviewDeadlineEnabled: true,
  alterationDeadlineEnabled: true,
  approvalDeadlineEnabled: true,
  costAllocationRule: 'approved',
  autoFillVacancies: false,
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
  const hasFetched = useRef(false);

  // Wait for auth token before fetching
  const hasToken = !!localStorage.getItem('pulse_jwt');

  const fetchAll = useCallback(async () => {
    const token = localStorage.getItem('pulse_jwt');
    if (!token) { setLoading(false); return; }
    const [cRes, rRes, tRes, sRes, setRes, arRes] = await Promise.all([
      invokeVpsFunction('clients', { method: 'GET' }),
      invokeVpsFunction('recordings', { method: 'GET' }),
      invokeVpsFunction('kanban-tasks', { method: 'GET' }),
      invokeVpsFunction('scripts', { method: 'GET' }),
      invokeVpsFunction('company-settings', { method: 'GET' }),
      invokeVpsFunction('active-recordings', { method: 'GET' }),
    ]);
    if (cRes.data && !cRes.error) {
      const allClients = (Array.isArray(cRes.data) ? cRes.data : []).map(rowToClient);
      setClients(allClients);
    }
    
    // Create a set of active client IDs for filtering other data
    const activeClientIds = new Set(
      (Array.isArray(cRes.data) ? cRes.data : [])
        .filter((c: any) => c.status !== 'cancelado')
        .map((c: any) => c.id)
    );

    if (rRes.data && !rRes.error) {
      const allRecordings = (Array.isArray(rRes.data) ? rRes.data : []).map(rowToRecording);
      // Filter out recordings for canceled clients unless they are not 'agendada' (keep history)
      setRecordings(allRecordings.filter(r => activeClientIds.has(r.clientId) || r.status !== 'agendada'));
    }
    if (tRes.data && !tRes.error) {
      setTasks((Array.isArray(tRes.data) ? tRes.data : []).map(rowToTask).filter(t => activeClientIds.has(t.clientId)));
    }
    if (sRes.data && !sRes.error) {
      setScripts((Array.isArray(sRes.data) ? sRes.data : []).map(rowToScript).filter(s => activeClientIds.has(s.clientId)));
    }
    if (setRes.data && !setRes.error && setRes.data) {
      const settingsData = Array.isArray(setRes.data) ? setRes.data[0] : setRes.data;
      setSettings(rowToSettings(settingsData));
      setSettingsId(settingsData.id);
    }

    if (arRes.data && !arRes.error) setActiveRecordings((Array.isArray(arRes.data) ? arRes.data : []).map(rowToActiveRecording));
    setLoading(false);
    hasFetched.current = true;
  }, []);

  // ── Initial fetch — only when token exists ──
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Listen for auth changes (login/logout) and re-fetch ──
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'pulse_jwt') {
        if (e.newValue) {
          // Token was set (login) — re-fetch data
          setTimeout(() => fetchAll(), 100);
        } else {
          // Token was removed (logout) — clear data
          setClients([]);
          setRecordings([]);
          setTasks([]);
          setScripts([]);
          setActiveRecordings([]);
          setLoading(false);
          hasFetched.current = false;
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchAll]);

  // ── Re-fetch after login in same tab (storage event doesn't fire for same-tab changes) ──
  useEffect(() => {
    if (!hasFetched.current && hasToken) {
      fetchAll();
    }
  }, [hasToken, fetchAll]);

  // ── Polling for data changes (replaces Supabase Realtime) ──
  useEffect(() => {
    const token = localStorage.getItem('pulse_jwt');
    if (!token) return;

    // Realtime subscription for content_tasks
    const channel = supabase
      .channel('public:content_tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'content_tasks' },
        (payload: any) => {
          console.log('Realtime change received:', payload);
          fetchAll(); // Refresh everything when a task changes
        }
      )
      .subscribe();

    // Still keep polling as a fallback, but much slower
    const interval = setInterval(async () => {
      fetchAll();
    }, 60000);

    return () => {
      clearInterval(interval);
      (channel as any).unsubscribe?.();
    };
  }, [fetchAll]);

  // ── Bulk insert recordings ──
  const addRecordingsBulk = useCallback(async (recs: Recording[]): Promise<boolean> => {
    if (recs.length === 0) return true;
    const rows = recs.map(r => recordingToRow(r));
    const { error } = await invokeVpsFunction('recordings', { body: rows });
    if (error) { console.error('addRecordingsBulk error:', error); return false; }
    setRecordings(prev => [...prev, ...recs]);
    return true;
  }, []);

  const deleteRecordingsBulk = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    const { error } = await supabase.from('recordings').delete().in('id', ids);
    if (error) { console.error('deleteRecordingsBulk error:', error); return false; }
    setRecordings(prev => prev.filter(r => !ids.includes(r.id)));
    return true;
  }, []);

  const cancelRecordingsBulk = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    const { error } = await supabase.from('recordings').update({ status: 'cancelada' }).in('id', ids);
    if (error) { console.error('cancelRecordingsBulk error:', error); return false; }
    setRecordings(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'cancelada' as const } : r));
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
  const cancelRecording = useCallback(async (id: string) => {
    await invokeVpsFunction(`recordings/${id}`, { body: { status: 'cancelada' }, method: 'PUT' });
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelada' as const } : r));
  }, []);

  // ── Recording CRUD ──
  const addRecording = useCallback(async (recording: Recording): Promise<boolean> => {
    // Hierarchy Rule: Fixed/Avulso take precedence over Extra.
    // If we're adding a Fixed/Avulso recording, we cancel any Extra recording at the same time/videomaker.
    const isHighPriority = recording.type === 'fixa' || recording.type === 'avulso';
    
    if (isHighPriority) {
      const timeToMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const BUFFER = 30;
      const newStart = timeToMinutes(recording.startTime);
      const newEnd = newStart + settings.recordingDuration + BUFFER;

      const conflictingExtras = recordings.filter(r => 
        r.videomakerId === recording.videomakerId && 
        r.date === recording.date && 
        r.type === 'extra' && 
        r.status !== 'cancelada' &&
        (() => {
          const existStart = timeToMinutes(r.startTime);
          const existEnd = existStart + settings.recordingDuration + BUFFER;
          return newStart < existEnd && newEnd > existStart;
        })()
      );

      for (const extra of conflictingExtras) {
        console.log(`Cancelling extra recording ${extra.id} due to hierarchy (new ${recording.type} scheduled)`);
        await cancelRecording(extra.id);
      }
    }

    const { error } = await invokeVpsFunction('recordings', { body: recordingToRow(recording) });
    if (error) { console.error('addRecording error:', error); return false; }
    setRecordings(prev => [...prev, recording]);
    return true;
  }, [recordings, settings, cancelRecording]);


  const updateRecording = useCallback(async (recording: Recording) => {
    const { id, ...rest } = recordingToRow(recording);
    await invokeVpsFunction(`recordings/${id}`, { body: rest, method: 'PUT' });
    setRecordings(prev => prev.map(r => r.id === recording.id ? recording : r));
  }, []);


  const deleteRecording = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await invokeVpsFunction(`recordings/${id}`, { method: 'DELETE' });
      if (error) { console.error('deleteRecording error:', error); return false; }
      setRecordings(prev => prev.filter(r => r.id !== id));
      setActiveRecordings(prev => prev.filter(a => a.recordingId !== id));
      return true;
    } catch (err) {
      console.error('deleteRecording error:', err);
      return false;
    }
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
          editing_deadline_enabled: s.editingDeadlineEnabled,
          review_deadline_enabled: s.reviewDeadlineEnabled,
          alteration_deadline_enabled: s.alterationDeadlineEnabled,
          approval_deadline_enabled: s.approvalDeadlineEnabled,
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
    addRecording, addRecordingsBulk, updateRecording, cancelRecording, deleteRecording, deleteFutureRecordingsForClient,
    deleteRecordingsBulk, cancelRecordingsBulk,
    addTask, updateTask, deleteTask,
    addScript, updateScript, deleteScript,
    updateSettings, startActiveRecording, stopActiveRecording,
    refetch: fetchAll,
  };
}
