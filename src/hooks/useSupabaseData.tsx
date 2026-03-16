import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
    email: r.email || '',
    city: r.city || '',
    weeklyReels: r.weekly_reels,
    weeklyCreatives: r.weekly_creatives,
    weeklyGoal: r.weekly_goal,
    hasEndomarketing: r.has_endomarketing,
    weeklyStories: r.weekly_stories,
    presenceDays: r.presence_days,
    monthlyRecordings: r.monthly_recordings ?? 4,
    niche: r.niche || '',
    clientLogin: r.client_login || '',
    clientPassword: r.client_password || '',
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
    email: c.email || '',
    city: c.city || '',
    weekly_reels: c.weeklyReels,
    weekly_creatives: c.weeklyCreatives,
    weekly_goal: c.weeklyGoal,
    has_endomarketing: c.hasEndomarketing,
    weekly_stories: c.weeklyStories,
    presence_days: c.presenceDays,
    monthly_recordings: c.monthlyRecordings,
    niche: c.niche || '',
    client_login: c.clientLogin || '',
    client_password: c.clientPassword || '',
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
    try {
      // 1. Content tasks and related data
      const { data: contentTasks } = await supabase.from('content_tasks').select('id').eq('client_id', id);
      if (contentTasks && contentTasks.length > 0) {
        const taskIds = contentTasks.map(t => t.id);
        await supabase.from('task_comments').delete().in('task_id', taskIds);
        await supabase.from('task_history').delete().in('task_id', taskIds);
      }
      await supabase.from('content_tasks').delete().eq('client_id', id);

      // 2. Social media deliveries
      await supabase.from('social_media_deliveries').delete().eq('client_id', id);

      // 3. Delivery records
      await supabase.from('delivery_records').delete().eq('client_id', id);

      // 4. Active recordings & recordings
      await supabase.from('active_recordings').delete().eq('client_id', id);
      // WhatsApp confirmations reference recordings, delete first
      await supabase.from('whatsapp_confirmations').delete().eq('client_id', id);
      await supabase.from('recordings').delete().eq('client_id', id);
      setRecordings(prev => prev.filter(r => r.clientId !== id));
      setActiveRecordings(prev => prev.filter(a => a.clientId !== id));

      // 5. WhatsApp messages
      await supabase.from('whatsapp_messages').delete().eq('client_id', id);

      // 6. Billing messages & revenues & financial contracts
      await supabase.from('billing_messages').delete().eq('client_id', id);
      await supabase.from('revenues').delete().eq('client_id', id);
      await supabase.from('financial_contracts').delete().eq('client_id', id);

      // 7. Endomarketing partner tasks (direct client_id FK)
      await supabase.from('endomarketing_partner_tasks').delete().eq('client_id', id);

      // 8. Endomarketing contracts
      await supabase.from('client_endomarketing_contracts').delete().eq('client_id', id);

      // 9. Endomarketing clientes & related
      const { data: endoClients } = await supabase.from('endomarketing_clientes').select('id').eq('client_id', id);
      if (endoClients && endoClients.length > 0) {
        const endoIds = endoClients.map(e => e.id);
        await supabase.from('endomarketing_agendamentos').delete().in('cliente_id', endoIds);
        await supabase.from('endomarketing_logs').delete().in('cliente_id', endoIds);
      }
      await supabase.from('endomarketing_clientes').delete().eq('client_id', id);

      // 10. Social accounts & integration logs
      await supabase.from('social_accounts').delete().eq('client_id', id);
      await supabase.from('integration_logs').delete().eq('client_id', id);

      // 11. Kanban tasks & scripts
      await supabase.from('kanban_tasks').delete().eq('client_id', id);
      setTasks(prev => prev.filter(t => t.clientId !== id));
      await supabase.from('scripts').delete().eq('client_id', id);
      setScripts(prev => prev.filter(s => s.clientId !== id));

      // 12. Finally delete the client
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) { console.error('deleteClient error:', error); return false; }
      setClients(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (err) {
      console.error('deleteClient cascade error:', err);
      return false;
    }
  }, []);

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

  /** Delete multiple future 'agendada' recordings for a client */
  const deleteFutureRecordingsForClient = useCallback(async (clientId: string): Promise<number> => {
    const today = new Date().toISOString().split('T')[0];
    const toDelete = recordings.filter(r => r.clientId === clientId && r.status === 'agendada' && r.date >= today);
    if (toDelete.length === 0) return 0;
    const ids = toDelete.map(r => r.id);
    await supabase.from('recordings').delete().in('id', ids);
    setRecordings(prev => prev.filter(r => !ids.includes(r.id)));
    return ids.length;
  }, [recordings]);

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

    // Create portal notification for the client
    try {
      await supabase.from('client_portal_notifications').insert({
        client_id: script.clientId,
        title: '📝 Novo roteiro criado',
        message: `O roteiro "${script.title}" foi criado. Confira na Zona Criativa!`,
        type: 'new_script',
        link_script_id: script.id,
      } as any);
    } catch (err) {
      console.error('Portal script notification error:', err);
    }
  }, []);

  const updateScript = useCallback(async (script: Script) => {
    const { id, ...rest } = scriptToRow(script);
    const { error } = await supabase.from('scripts').update(rest as any).eq('id', id);
    if (error) { console.error('updateScript error:', error); return; }
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
        editing_deadline_hours: s.editingDeadlineHours,
        review_deadline_hours: s.reviewDeadlineHours,
        alteration_deadline_hours: s.alterationDeadlineHours,
        approval_deadline_hours: s.approvalDeadlineHours,
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
      planned_script_ids: rec.plannedScriptIds || [],
    } as any);
    setActiveRecordings(prev => [...prev.filter(a => a.recordingId !== rec.recordingId), rec]);
  }, []);

  const stopActiveRecording = useCallback(async (recordingId: string, deliveryOverrides?: { reels_produced?: number; videos_recorded?: number; creatives_produced?: number; stories_produced?: number; arts_produced?: number; extras_produced?: number }, completedScriptIds?: string[]) => {
    const active = activeRecordings.find(a => a.recordingId === recordingId);
    
    await supabase.from('active_recordings').delete().eq('recording_id', recordingId);
    setActiveRecordings(prev => prev.filter(a => a.recordingId !== recordingId));

    if (active) {
      const { error } = await supabase.from('delivery_records').insert({
        recording_id: recordingId,
        client_id: active.clientId,
        videomaker_id: active.videomarkerId,
        date: new Date().toISOString().split('T')[0],
        reels_produced: deliveryOverrides?.reels_produced ?? 0,
        creatives_produced: deliveryOverrides?.creatives_produced ?? 0,
        stories_produced: deliveryOverrides?.stories_produced ?? 0,
        arts_produced: deliveryOverrides?.arts_produced ?? 0,
        extras_produced: deliveryOverrides?.extras_produced ?? 0,
        videos_recorded: deliveryOverrides?.videos_recorded ?? 1,
        delivery_status: 'realizada',
        observations: 'Registro automático ao finalizar gravação',
      } as any);
      if (error) console.error('Auto delivery record error:', error);

      // Auto-create social media deliveries for completed scripts
      if (completedScriptIds && completedScriptIds.length > 0) {
        const scriptRows = completedScriptIds.map(scriptId => {
          const script = scripts.find(s => s.id === scriptId);
          return {
            client_id: active.clientId,
            content_type: script?.contentFormat || 'reels',
            title: script?.title || 'Vídeo gravado',
            status: 'entregue',
            delivered_at: new Date().toISOString().split('T')[0],
            script_id: scriptId,
            recording_id: recordingId,
            created_by: active.videomarkerId,
          };
        });
        const { error: socialError } = await supabase.from('social_media_deliveries').insert(scriptRows as any);
        if (socialError) console.error('Auto social delivery error:', socialError);
      }
    }
  }, [activeRecordings, scripts]);

  return {
    clients, recordings, tasks, scripts, settings, activeRecordings, loading,
    addClient, updateClient, deleteClient,
    addRecording, addRecordingsBulk, updateRecording, cancelRecording, deleteFutureRecordingsForClient,
    addTask, updateTask, deleteTask,
    addScript, updateScript, deleteScript,
    updateSettings, startActiveRecording, stopActiveRecording,
  };
}
