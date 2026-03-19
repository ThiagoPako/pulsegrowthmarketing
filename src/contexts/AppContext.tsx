import React, { createContext, useContext, useCallback, useState, useEffect } from 'react'; // refreshed
import { useAuth, type Profile } from '@/hooks/useAuth';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/vpsDb';
import { generateFixedRecordings, generateExtraRecordings, findRescheduleSlot } from '@/lib/schedulingUtils';
import { sendRecordingScheduledNotification } from '@/services/whatsappService';
import type { User, Client, Recording, KanbanTask, CompanySettings, DayOfWeek, Script, ActiveRecording, UserRole } from '@/types';

interface AppContextType {
  currentUser: User | null;
  users: User[];
  clients: Client[];
  recordings: Recording[];
  tasks: KanbanTask[];
  scripts: Script[];
  settings: CompanySettings;
  activeRecordings: ActiveRecording[];
  logout: () => void;
  addUser: (user: User) => boolean;
  updateUser: (user: User) => void;
  deleteUser: (id: string) => void;
  addClient: (client: Client) => boolean;
  updateClient: (client: Client) => void;
  deleteClient: (id: string) => Promise<boolean>;
  addRecording: (recording: Recording) => boolean;
  updateRecording: (recording: Recording) => void;
  cancelRecording: (id: string) => void;
  cancelAndReschedule: (recording: Recording) => { success: boolean; rescheduled?: { date: string; startTime: string; videomakerId: string; type: string } };
  generateScheduleForClient: (client: Client) => Promise<number>;
  regenerateScheduleForClient: (client: Client) => Promise<{ deleted: number; created: number }>;
  addTask: (task: KanbanTask) => void;
  updateTask: (task: KanbanTask) => void;
  deleteTask: (id: string) => void;
  addScript: (script: Script) => Promise<void>;
  updateScript: (script: Script) => void;
  deleteScript: (id: string) => void;
  updateSettings: (settings: CompanySettings) => void;
  startActiveRecording: (rec: ActiveRecording) => void;
  stopActiveRecording: (recordingId: string, deliveryOverrides?: { reels_produced?: number; videos_recorded?: number; creatives_produced?: number; stories_produced?: number; arts_produced?: number; extras_produced?: number }, completedScriptIds?: string[]) => void;
  hasConflict: (videomakerId: string, date: string, startTime: string, excludeId?: string) => boolean;
  isWithinWorkHours: (day: DayOfWeek, startTime: string) => boolean;
  getSuggestionsForCancellation: (recording: Recording) => Client[];
}

function profileToUser(profile: Profile): User {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    password: '',
    role: profile.role as UserRole,
    avatarUrl: profile.avatar_url || undefined,
    displayName: profile.display_name || undefined,
    jobTitle: profile.job_title || undefined,
  };
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const data = useSupabaseData();

  const currentUser = profile ? profileToUser(profile) : null;
  
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data: profiles }) => {
      if (profiles) setUsers(profiles.map((p: any) => profileToUser(p as Profile)));
    });
  }, [profile]);

  const logout = useCallback(async () => { await signOut(); }, [signOut]);

  const addUser = useCallback((_user: User) => false, []);
  const updateUser = useCallback((_user: User) => {}, []);
  const deleteUser = useCallback((_id: string) => {}, []);

  const addClient = useCallback((client: Client): boolean => {
    if (data.clients.some(c => c.companyName.toLowerCase() === client.companyName.toLowerCase())) return false;
    data.addClient(client);
    return true;
  }, [data]);

  const updateClient = useCallback((client: Client) => { data.updateClient(client); }, [data]);

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    return await data.deleteClient(id);
  }, [data]);

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const hasConflict = useCallback((videomakerId: string, date: string, startTime: string, excludeId?: string) => {
    const newStart = timeToMinutes(startTime);
    const newEnd = newStart + data.settings.recordingDuration;
    return data.recordings.some(r => {
      if (r.id === excludeId || r.status === 'cancelada') return false;
      if (r.videomakerId !== videomakerId || r.date !== date) return false;
      const existStart = timeToMinutes(r.startTime);
      const existEnd = existStart + data.settings.recordingDuration;
      return newStart < existEnd && newEnd > existStart;
    });
  }, [data.recordings, data.settings.recordingDuration]);

  const isWithinWorkHours = useCallback((day: DayOfWeek, startTime: string) => {
    if (!data.settings.workDays.includes(day)) return false;
    const start = timeToMinutes(startTime);
    const end = start + data.settings.recordingDuration;
    const s = data.settings;
    const inA = start >= timeToMinutes(s.shiftAStart) && end <= timeToMinutes(s.shiftAEnd);
    const inB = start >= timeToMinutes(s.shiftBStart) && end <= timeToMinutes(s.shiftBEnd);
    return inA || inB;
  }, [data.settings]);

  const addRecording = useCallback((recording: Recording): boolean => {
    if (hasConflict(recording.videomakerId, recording.date, recording.startTime)) return false;
    data.addRecording(recording);
    // Send WhatsApp notification
    const client = data.clients.find(c => c.id === recording.clientId);
    const vm = users.find(u => u.id === recording.videomakerId);
    if (client?.whatsapp && vm) {
      sendRecordingScheduledNotification(
        client.whatsapp, client.companyName, client.id,
        recording.date, recording.startTime, vm.name
      );
    }
    return true;
  }, [hasConflict, data, users]);

  /** Generate fixed + extra recordings for a client until end of month */
  const generateScheduleForClient = useCallback(async (client: Client): Promise<number> => {
    const videomakerIds = users.filter(u => u.role === 'videomaker').map(u => u.id);
    const fixedRecs = generateFixedRecordings(client, data.recordings, data.settings);
    const allRecsAfterFixed = [...data.recordings, ...fixedRecs];
    const extraRecs = generateExtraRecordings(client, allRecsAfterFixed, data.settings, videomakerIds);
    const allNew = [...fixedRecs, ...extraRecs];
    if (allNew.length > 0) {
      await data.addRecordingsBulk(allNew);
    }
    return allNew.length;
  }, [data, users]);

  /** Delete future agendada recordings for a client and regenerate */
  const regenerateScheduleForClient = useCallback(async (client: Client): Promise<{ deleted: number; created: number }> => {
    const deleted = await data.deleteFutureRecordingsForClient(client.id);
    // After deletion, re-fetch current recordings state (minus deleted ones)
    const today = new Date().toISOString().split('T')[0];
    const remainingRecs = data.recordings.filter(r => !(r.clientId === client.id && r.status === 'agendada' && r.date >= today));
    
    const videomakerIds = users.filter(u => u.role === 'videomaker').map(u => u.id);
    const fixedRecs = generateFixedRecordings(client, remainingRecs, data.settings);
    const allRecsAfterFixed = [...remainingRecs, ...fixedRecs];
    const extraRecs = generateExtraRecordings(client, allRecsAfterFixed, data.settings, videomakerIds);
    const allNew = [...fixedRecs, ...extraRecs];
    if (allNew.length > 0) {
      await data.addRecordingsBulk(allNew);
    }
    return { deleted, created: allNew.length };
  }, [data, users]);

  /** Cancel a recording and try to reschedule automatically */
  const cancelAndReschedule = useCallback((recording: Recording) => {
    data.cancelRecording(recording.id);
    
    const client = data.clients.find(c => c.id === recording.clientId);
    if (!client) return { success: false };

    const videomakerIds = users.filter(u => u.role === 'videomaker').map(u => u.id);
    
    // Use recordings after cancel
    const recsAfterCancel = data.recordings.map(r => r.id === recording.id ? { ...r, status: 'cancelada' as const } : r);
    
    const slot = findRescheduleSlot(recording, client, recsAfterCancel, data.settings, videomakerIds);
    
    if (slot) {
      const newRec: Recording = {
        id: crypto.randomUUID(),
        clientId: recording.clientId,
        videomakerId: slot.videomakerId,
        date: slot.date,
        startTime: slot.startTime,
        type: slot.type,
        status: 'agendada',
      };
      data.addRecording(newRec);
      return { success: true, rescheduled: slot };
    }
    
    return { success: false };
  }, [data, users]);

  const updateRecording = useCallback((recording: Recording) => { data.updateRecording(recording); }, [data]);
  const cancelRecording = useCallback((id: string) => { data.cancelRecording(id); }, [data]);
  const addTask = useCallback((task: KanbanTask) => { data.addTask(task); }, [data]);
  const updateTask = useCallback((task: KanbanTask) => { data.updateTask(task); }, [data]);
  const deleteTask = useCallback((id: string) => { data.deleteTask(id); }, [data]);
  const addScript = useCallback(async (script: Script) => { return data.addScript(script); }, [data]);
  const updateScript = useCallback((script: Script) => { data.updateScript(script); }, [data]);
  const deleteScript = useCallback((id: string) => { data.deleteScript(id); }, [data]);
  const updateSettings = useCallback((s: CompanySettings) => { data.updateSettings(s); }, [data]);
  const startActiveRecording = useCallback((rec: ActiveRecording) => { data.startActiveRecording(rec); }, [data]);
  const stopActiveRecording = useCallback((recordingId: string, deliveryOverrides?: { reels_produced?: number; videos_recorded?: number; creatives_produced?: number; stories_produced?: number; arts_produced?: number; extras_produced?: number }, completedScriptIds?: string[]) => { data.stopActiveRecording(recordingId, deliveryOverrides, completedScriptIds); }, [data]);

  const getSuggestionsForCancellation = useCallback((recording: Recording) => {
    return data.clients.filter(c => {
      if (c.id === recording.clientId) return false;
      if (!c.acceptsExtra) return false;
      return !hasConflict(recording.videomakerId, recording.date, c.backupTime, recording.id);
    });
  }, [data.clients, hasConflict]);

  return (
    <AppContext.Provider value={{
      currentUser, users, clients: data.clients, recordings: data.recordings,
      tasks: data.tasks, scripts: data.scripts, settings: data.settings,
      activeRecordings: data.activeRecordings,
      logout, addUser, updateUser, deleteUser,
      addClient, updateClient, deleteClient,
      addRecording, updateRecording, cancelRecording,
      cancelAndReschedule, generateScheduleForClient, regenerateScheduleForClient,
      addTask, updateTask, deleteTask,
      addScript, updateScript, deleteScript,
      updateSettings, startActiveRecording, stopActiveRecording,
      hasConflict, isWithinWorkHours,
      getSuggestionsForCancellation,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
