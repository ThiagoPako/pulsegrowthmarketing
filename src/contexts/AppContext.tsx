import React, { createContext, useContext, useCallback, useState, useEffect } from 'react'; // refreshed
import { getDay } from 'date-fns';

import { useAuth, type Profile } from '@/hooks/useAuth';
import { useCity } from '@/contexts/CityContext';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/vpsDb';
import { usePresenceHeartbeat } from '@/hooks/usePresence';
import { generateFixedRecordings, findAvailableSlots, organizeRecordingsForDate } from '@/lib/schedulingUtils';
import { sendRecordingScheduledNotification } from '@/services/whatsappService';
import type { User, Client, Recording, KanbanTask, CompanySettings, DayOfWeek, Script, ActiveRecording, UserRole, RecordingType } from '@/types';

const DATE_TO_DAY: Record<number, DayOfWeek> = {
  0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
};


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
  addClient: (client: Client) => Promise<boolean>;
  updateClient: (client: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<boolean>;
  addRecording: (recording: Recording, options?: { skipClientDayCheck?: boolean }) => Promise<boolean>;
  updateRecording: (recording: Recording) => void;
  cancelRecording: (id: string) => void;
  deleteRecording: (id: string) => Promise<boolean>;
  deleteRecordingsBulk: (ids: string[]) => Promise<boolean>;
  cancelRecordingsBulk: (ids: string[]) => Promise<boolean>;
  cancelAndReschedule: (recording: Recording) => { success: boolean; rescheduled?: { date: string; startTime: string; videomakerId: string; type: string } };
  generateScheduleForClient: (client: Client, options?: FixedScheduleGenerationOptions) => Promise<number>;
  regenerateScheduleForClient: (client: Client, options?: FixedScheduleGenerationOptions) => Promise<{ deleted: number; created: number }>;
  generateFixedSchedulesForMonth: (clientsToGenerate: Client[], startDate: string, endDate: string) => Promise<number>;
  previewFixedSchedulesForMonth: (clientsToGenerate: Client[], startDate: string, endDate: string) => Recording[];
  commitFixedSchedules: (recordings: Recording[]) => Promise<number>;
  autoFillVacanciesForDate: (date: string) => Promise<number>;
  organizeSchedule: (startDate: string, endDate: string) => Promise<{ updated: number; cancelled: number }>;

  addTask: (task: KanbanTask) => void;
  updateTask: (task: KanbanTask) => void;
  deleteTask: (id: string) => void;
  addScript: (script: Script) => Promise<void>;
  updateScript: (script: Script) => void;
  deleteScript: (id: string) => void;
  updateSettings: (settings: CompanySettings) => void;
  startActiveRecording: (rec: ActiveRecording) => void;
  stopActiveRecording: (recordingId: string, deliveryOverrides?: { reels_produced?: number; videos_recorded?: number; creatives_produced?: number; stories_produced?: number; arts_produced?: number; extras_produced?: number }, completedScriptIds?: string[]) => void;
  hasConflict: (videomakerId: string, date: string, startTime: string, excludeId?: string, newType?: RecordingType, clientId?: string, options?: { skipClientDayCheck?: boolean }) => { hasConflict: boolean; message?: string };
  isWithinWorkHours: (day: DayOfWeek, startTime: string) => boolean;

  getSuggestionsForCancellation: (recording: Recording) => Client[];
  refetchData: () => void;
}

interface FixedScheduleGenerationOptions {
  startDate?: string;
  endDate?: string;
  fillCompleteMonth?: boolean;
  availableVideomakerIds?: string[];
  fillAvailableSlots?: boolean;
}


function profileToUser(profile: Profile): User {
  const rawMonthlySalary = (profile as any).monthly_salary ?? (profile as any).monthlySalary ?? 0;
  const monthlySalary = Number(rawMonthlySalary) || 0;

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    password: '',
    role: profile.role as UserRole,
    avatarUrl: profile.avatar_url || undefined,
    displayName: profile.display_name || undefined,
    jobTitle: profile.job_title || undefined,
    fontScale: profile.font_scale || undefined,
    monthlySalary,
  };
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { profile, signOut, loading: authLoading, user } = useAuth();
  const { activeCity, isLoading: cityLoading } = useCity();
  const data = useSupabaseData();

  const [myRoles, setMyRoles] = useState<UserRole[]>([]);
  const baseCurrentUser = profile ? profileToUser(profile) : null;
  const currentUser = baseCurrentUser
    ? { ...baseCurrentUser, roles: Array.from(new Set([baseCurrentUser.role, ...myRoles])) }
    : null;

  useEffect(() => {
    if (!profile?.id) { setMyRoles([]); return; }
    (async () => {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', profile.id);
      if (data) setMyRoles((data as Array<{ role: UserRole }>).map(r => r.role));
    })();
  }, [profile?.id]);

  // Heartbeat for virtual office presence
  usePresenceHeartbeat(user?.id ?? profile?.id);

  // Global CRM Notifications Listener
  useEffect(() => {
    if (!user?.id) return;
    
    const channel = supabase.channel('crm-notifications')
      .on('broadcast', { event: 'crm:new_client' }, (payload) => {
        const { message, city } = payload.payload || {};
        const toastId = `crm-new-client-${Date.now()}`;
        import('sonner').then(({ toast }) => {
          toast.success('NOVO CONTRATO FECHADO! 🚀', {
            id: toastId,
            description: message || 'Um novo cliente acaba de entrar para a Pulse!',
            duration: 10000,
            action: {
              label: 'Ver CRM',
              onClick: () => window.location.hash = '/crm'
            }
          });
        });
      })
      .on('broadcast', { event: 'crm:meeting_scheduled' }, (payload) => {
        const { message } = payload.payload || {};
        import('sonner').then(({ toast }) => {
          toast.info('REUNIÃO AGENDADA 📅', {
            description: message || 'Uma nova reunião comercial foi marcada.',
            duration: 5000,
          });
        });
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // O useSupabaseData já dispara o bootstrap ao resolver a cidade/token.
  // Refetch extra aqui duplicava todas as requisições no primeiro carregamento.

  
  const [users, setUsers] = useState<User[]>([]);

  const fetchUsers = useCallback(async () => {
    const hasVpsToken = typeof window !== 'undefined' && !!localStorage.getItem('pulse_jwt');
    if (cityLoading) return;
    if (!hasVpsToken) {
      setUsers([]);
      return;
    }
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    if (profilesRes.error) {
      console.error('[AppContext] error loading profiles:', profilesRes.error);
      return;
    }

    const profiles = profilesRes.data || [];
    // Um usuário pode ter várias funções (ex.: videomaker + editor).
    const rolesByUserId = new Map<string, UserRole[]>();
    ((rolesRes.data || []) as Array<{ user_id: string; role: UserRole }>).forEach(roleRow => {
      const list = rolesByUserId.get(roleRow.user_id) || [];
      if (!list.includes(roleRow.role)) list.push(roleRow.role);
      rolesByUserId.set(roleRow.user_id, list);
    });

    setUsers(profiles.map((p: any) => {
      const extra = rolesByUserId.get(p.id) || [];
      // A função principal continua sendo a do profile (fallback: primeira de user_roles).
      const primary: UserRole = (p.role as UserRole) || extra[0];
      return {
        ...profileToUser({ ...p, role: primary } as Profile),
        roles: Array.from(new Set<UserRole>([primary, ...extra].filter(Boolean))),
      };
    }));

  }, [cityLoading, activeCity]);

  useEffect(() => { fetchUsers(); }, [fetchUsers, profile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleProfilesUpdated = () => { fetchUsers(); };
    window.addEventListener('pulse:profiles-updated', handleProfilesUpdated);
    return () => window.removeEventListener('pulse:profiles-updated', handleProfilesUpdated);
  }, [fetchUsers]);

  const logout = useCallback(async () => { await signOut(); }, [signOut]);

  const addUser = useCallback((_user: User) => false, []);
  const updateUser = useCallback((_user: User) => {}, []);
  const deleteUser = useCallback((_id: string) => {}, []);

  const addClient = useCallback(async (client: Client): Promise<boolean> => {
    if (data.clients.some(c => c.companyName.toLowerCase() === client.companyName.toLowerCase())) return false;
    return await data.addClient(client);
  }, [data]);

  const updateClient = useCallback(async (client: Client) => { await data.updateClient(client); }, [data]);

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    return await data.deleteClient(id);
  }, [data]);

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const BUFFER_BETWEEN_RECORDINGS = 30;
  const FIXED_SLOTS = ['08:30', '10:30', '14:30', '16:30'];
  const LOWER_PRIORITY_TYPES_FOR_FIXED = new Set<RecordingType>(['extra', 'backup', 'secundaria']);

  const hasConflict = useCallback((videomakerId: string, date: string, startTime: string, excludeId?: string, newType?: RecordingType, clientId?: string, options?: { skipClientDayCheck?: boolean }) => {
    const newStart = timeToMinutes(startTime);
    const duration = data.settings.recordingDuration || 90;
    const newEnd = newStart + duration;

    // 1. Check if client already has a recording on this day (unless full-shift or explicitly skipped)
    if (clientId && !options?.skipClientDayCheck) {
      const client = data.clients.find(c => c.id === clientId);
      const clientDayRecs = data.recordings.filter(r => r.clientId === clientId && r.date === date && r.status !== 'cancelada' && r.id !== excludeId);
      
      if (client) {
        if (client.fullShiftRecording) {
          if (clientDayRecs.length >= 2) {
            return { hasConflict: true, message: "Este cliente já possui 2 gravações (limite turno integral) neste dia." };
          }
          if (clientDayRecs.some(r => r.startTime === startTime)) {
            return { hasConflict: true, message: "Este cliente já possui uma gravação exatamente neste horário." };
          }
        } else if (clientDayRecs.length > 0) {
          return { hasConflict: true, message: "Este cliente já possui uma gravação agendada para este dia." };
        }
      }
    }

    // 2. Check videomaker availability
    const conflict = data.recordings.find(r => {
      if (r.id === excludeId || r.status === 'cancelada') return false;
      if (r.videomakerId !== videomakerId || r.date !== date) return false;

      const isHighPriority = newType === 'fixa' || newType === 'avulso';
      if (isHighPriority && r.type === 'extra') return false;

      const existStart = timeToMinutes(r.startTime);
      const existEnd = existStart + duration + BUFFER_BETWEEN_RECORDINGS;
      const newEndWithBuffer = newEnd + BUFFER_BETWEEN_RECORDINGS;

      return newStart < existEnd && newEndWithBuffer > existStart;
    });

    if (conflict) {
      const conflictClient = data.clients.find(c => c.id === conflict.clientId);
      const clientLabel = conflictClient?.companyName || conflict.prospectName || 'gravação';
      return {
        hasConflict: true,
        message: `Conflito com ${clientLabel} às ${conflict.startTime} (${conflict.status}, tipo ${conflict.type}). Duração ${duration}min + buffer ${BUFFER_BETWEEN_RECORDINGS}min.`,
      };
    }

    return { hasConflict: false };
  }, [data.recordings, data.settings.recordingDuration, data.clients]);


  const isWithinWorkHours = useCallback((day: DayOfWeek, startTime: string) => {
    if (!data.settings.workDays.includes(day)) return false;
    const start = timeToMinutes(startTime);
    const duration = data.settings.recordingDuration || 90;
    const end = start + duration;
    const s = data.settings;
    const inA = start >= timeToMinutes(s.shiftAStart || '08:30') && end <= timeToMinutes(s.shiftAEnd || '12:00');
    const inB = start >= timeToMinutes(s.shiftBStart || '14:30') && end <= timeToMinutes(s.shiftBEnd || '18:00');
    return inA || inB;
  }, [data.settings]);


  const addRecording = useCallback(async (recording: Recording, options?: { skipClientDayCheck?: boolean }): Promise<boolean> => {
    if (hasConflict(recording.videomakerId, recording.date, recording.startTime, undefined, recording.type, recording.clientId, options).hasConflict) return false;
    const ok = await data.addRecording(recording);
    if (!ok) {
      console.error('addRecording: VPS insert failed for recording', recording);
      return false;
    }
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

  /** Generate fixed recordings only for a client until end of month.
   * REGRA: extras e backups NUNCA são gerados automaticamente — só aparecem
   * manualmente quando um admin preenche a vaga após cancelamento. */
  const generateScheduleForClient = useCallback(async (client: Client, options: FixedScheduleGenerationOptions = {}): Promise<number> => {
    const availableVideomakerIds = Array.from(new Set([
      ...users.filter(user => user.role === 'videomaker').map(user => user.id),
      ...data.recordings.map(recording => recording.videomakerId),
      client.videomaker,
    ].filter(Boolean)));

    const fixedRecs = generateFixedRecordings(client, data.recordings, data.settings, {
      ...options,
      availableVideomakerIds: options.availableVideomakerIds || availableVideomakerIds,
      fillAvailableSlots: options.fillAvailableSlots ?? true,
    });
    if (fixedRecs.length > 0) {
      const saved = await data.addRecordingsBulk(fixedRecs);
      if (!saved) throw new Error('A API da VPS recusou a criação das gravações fixas.');
    }
    return fixedRecs.length;
  }, [data, users]);

  const previewFixedSchedulesForMonth = useCallback((clientsToGenerate: Client[], startDate: string, endDate: string): Recording[] => {
    const availableVideomakerIds = Array.from(new Set([
      ...users.filter(user => user.role === 'videomaker').map(user => user.id),
      ...data.recordings.map(recording => recording.videomakerId),
      ...clientsToGenerate.map(client => client.videomaker),
    ].filter(Boolean)));
    const activeFixedClients = clientsToGenerate.filter(c => c.fixedDay && c.status === 'ativo');
    if (activeFixedClients.length === 0) return [];
    if (availableVideomakerIds.length === 0) return [];

    const generatedRecordings: Recording[] = [];
    const currentRecordings = [...data.recordings];

    for (const client of activeFixedClients) {
      const newClientRecordings = generateFixedRecordings(client, currentRecordings, data.settings, {
        startDate,
        endDate,
        fillCompleteMonth: true,
        availableVideomakerIds,
        fillAvailableSlots: true,
      }).filter(newRecording => {
        const existingSameSlot = currentRecordings.some(existing =>
          existing.clientId === newRecording.clientId &&
          existing.date === newRecording.date &&
          existing.startTime === newRecording.startTime &&
          existing.type === 'fixa' &&
          existing.status !== 'cancelada'
        );

        if (existingSameSlot) return false;

        const existingFixedClientRecsForDate = currentRecordings.filter(existing =>
          existing.clientId === newRecording.clientId &&
          existing.date === newRecording.date &&
          existing.type === 'fixa' &&
          existing.status !== 'cancelada'
        );

        return client.fullShiftRecording ? existingFixedClientRecsForDate.length < 2 : existingFixedClientRecsForDate.length === 0;
      });

      generatedRecordings.push(...newClientRecordings);
      currentRecordings.push(...newClientRecordings);
    }

    return generatedRecordings;
  }, [data, users]);

  const commitFixedSchedules = useCallback(async (generatedRecordings: Recording[]): Promise<number> => {
    if (generatedRecordings.length === 0) return 0;

    // Deduplicação final contra o snapshot mais recente de gravações,
    // evitando duplicar fixas se o popup ficou aberto enquanto outras foram criadas.
    const seen = new Set<string>();
    generatedRecordings = generatedRecordings.filter(rec => {
      const key = `${rec.clientId}|${rec.date}|${rec.startTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const dup = data.recordings.some(existing =>
        existing.status !== 'cancelada' &&
        existing.clientId === rec.clientId &&
        existing.date === rec.date &&
        existing.startTime === rec.startTime
      );
      return !dup;
    });


    if (generatedRecordings.length === 0) {
      await data.refetch();
      return 0;
    }


    const durationWithBuffer = (data.settings.recordingDuration || 90) + BUFFER_BETWEEN_RECORDINGS;
    const conflictingLowerPriorityIds = data.recordings
      .filter(recording => LOWER_PRIORITY_TYPES_FOR_FIXED.has(recording.type) && recording.status !== 'cancelada')
      .filter(extra => generatedRecordings.some(fixed => {
        if (extra.videomakerId !== fixed.videomakerId || extra.date !== fixed.date) return false;
        const extraStart = timeToMinutes(extra.startTime);
        const fixedStart = timeToMinutes(fixed.startTime);
        return fixedStart < extraStart + durationWithBuffer && fixedStart + durationWithBuffer > extraStart;
      }))
      .map(recording => recording.id);

    if (conflictingLowerPriorityIds.length > 0) {
      await data.cancelRecordingsBulk(conflictingLowerPriorityIds);
    }

    const saved = await data.addRecordingsBulk(generatedRecordings);
    if (!saved) {
      throw new Error('A API da VPS recusou a criação das gravações fixas.');
    }
    await data.refetch();
    return generatedRecordings.length;
  }, [data]);

  const generateFixedSchedulesForMonth = useCallback(async (clientsToGenerate: Client[], startDate: string, endDate: string): Promise<number> => {
    const generated = previewFixedSchedulesForMonth(clientsToGenerate, startDate, endDate);
    return commitFixedSchedules(generated);
  }, [previewFixedSchedulesForMonth, commitFixedSchedules]);

  /** Delete future agendada recordings for a client and regenerate (fixed only) */
  const regenerateScheduleForClient = useCallback(async (client: Client, options: FixedScheduleGenerationOptions = {}): Promise<{ deleted: number; created: number }> => {
    const deleted = await data.deleteFutureRecordingsForClient(client.id);
    const today = new Date().toISOString().split('T')[0];
    const remainingRecs = data.recordings.filter(r => !(r.clientId === client.id && r.status === 'agendada' && r.date >= today));
    
    const availableVideomakerIds = Array.from(new Set([
      ...users.filter(user => user.role === 'videomaker').map(user => user.id),
      ...data.recordings.map(recording => recording.videomakerId),
      client.videomaker,
    ].filter(Boolean)));

    const fixedRecs = generateFixedRecordings(client, remainingRecs, data.settings, {
      ...options,
      availableVideomakerIds: options.availableVideomakerIds || availableVideomakerIds,
      fillAvailableSlots: options.fillAvailableSlots ?? true,
    });
    if (fixedRecs.length > 0) {
      const saved = await data.addRecordingsBulk(fixedRecs);
      if (!saved) throw new Error('A API da VPS recusou a criação das gravações fixas.');
    }
    return { deleted, created: fixedRecs.length };
  }, [data, users]);

  const autoFillVacanciesForDate = useCallback(async (date: string): Promise<number> => {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateObj = new Date(date + 'T12:00:00');
    const dayName = DATE_TO_DAY[getDay(dateObj)];
    
    // Sort clients: priority to those who have extraDay today, then those who just accept extras
    const extraClients = data.clients
      .filter(c => c.acceptsExtra && c.status === 'ativo')
      .sort((a, b) => {
        const aMatchesDay = a.extraDay === dayName;
        const bMatchesDay = b.extraDay === dayName;
        if (aMatchesDay && !bMatchesDay) return -1;
        if (!aMatchesDay && bMatchesDay) return 1;
        return 0;
      });
    
    if (extraClients.length === 0) return 0;

    let createdCount = 0;
    const currentRecs = [...data.recordings];
    const allVmIds = users.filter(u => u.role === 'videomaker').map(u => u.id);

    // Distribution among videomakers: iterate slots first, then videomakers
    for (const slot of FIXED_SLOTS) {
      for (const vmId of allVmIds) {
        // Strict capacity check: ensure VM doesn't exceed 4 recordings already
        const vmDayRecsCount = currentRecs.filter(r => 
          r.videomakerId === vmId && 
          r.date === date && 
          r.status !== 'cancelada'
        ).length;

        if (vmDayRecsCount >= 4) continue;

        // Check if slot is available for this VM
        if (!hasConflict(vmId, date, slot).hasConflict) {
          // Find an eligible client who isn't already recording on this day
          const eligibleClient = extraClients.find(c => 
            !currentRecs.some(r => r.clientId === c.id && r.date === date && r.status !== 'cancelada')
          );

          if (eligibleClient) {
            const newRec: Recording = {
              id: crypto.randomUUID(),
              clientId: eligibleClient.id,
              videomakerId: vmId,
              date,
              startTime: slot,
              type: 'extra',
              status: 'agendada',
            };
            
            const ok = await data.addRecording(newRec);
            if (ok) {
              createdCount++;
              currentRecs.push(newRec);
              
              // Move used client to the end of the list to distribute among clients too
              const index = extraClients.indexOf(eligibleClient);
              if (index > -1) {
                extraClients.splice(index, 1);
                extraClients.push(eligibleClient);
              }
            }
          }
        }
      }
    }
    return createdCount;
  }, [data, users, hasConflict]);
  const organizeSchedule = useCallback(async (startDate: string, endDate: string): Promise<{ updated: number; cancelled: number }> => {
    // 1. Fetch ALL recordings for the range directly from the VPS to catch "ghost" recordings
    const { data: allRawRecs, error } = await supabase
      .from('recordings')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    if (error || !allRawRecs) {
      console.error('Error fetching recordings for organization:', error);
      throw new Error('Erro ao carregar dados para organização');
    }

    // Re-map raw rows to app types (similar to rowToRecording in useSupabaseData)
    const allRecs: Recording[] = allRawRecs.map((r: any) => ({
      id: r.id,
      clientId: r.client_id || '',
      videomakerId: r.videomaker_id || '',
      date: r.date.split('T')[0],
      startTime: r.start_time,
      type: r.type,
      status: r.status,
      confirmationStatus: r.confirmation_status || 'pendente',
      prospectName: r.prospect_name,
    }));

    const dates: string[] = [];
    let curr = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    while (curr <= end) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    const activeClientIds = new Set(data.clients.filter(c => c.status !== 'cancelado').map(c => c.id));
    const cancelledClientIds = new Set(data.clients.filter(c => c.status === 'cancelado').map(c => c.id));
    const allVideomakerIds = new Set([
      ...users.filter(u => u.role === 'videomaker').map(u => u.id),
      ...allRecs.map(r => r.videomakerId).filter(Boolean)
    ]);
    const vmIdsToProcess = [...Array.from(allVideomakerIds), ""];

    const recordingsToUpdate: Recording[] = [];
    const idsToDelete: string[] = [];
    
    // We work on a local copy to track changes across iterations
    let currentRecsLocal = [...allRecs];

    for (const date of dates) {
      for (const vmId of vmIdsToProcess) {
        const { toUpdate, toCancel } = organizeRecordingsForDate(
          date, 
          vmId, 
          currentRecsLocal, 
          data.settings, 
          activeClientIds,
          cancelledClientIds,
          data.clients
        );
        
        // Add to our bulk lists
        recordingsToUpdate.push(...toUpdate);
        
        // For cancellations, we'll actually DELETE them if they were generated incorrectly
        // or just mark as cancelled. The user said "apagar" (delete).
        toCancel.forEach(rec => {
          idsToDelete.push(rec.id);
          // Remove from local copy so it doesn't affect other iterations
          const idx = currentRecsLocal.findIndex(r => r.id === rec.id);
          if (idx !== -1) currentRecsLocal.splice(idx, 1);
        });

        // Update local copy for toUpdate items too
        toUpdate.forEach(rec => {
          const idx = currentRecsLocal.findIndex(r => r.id === rec.id);
          if (idx !== -1) currentRecsLocal[idx] = rec;
        });
      }
    }

    // 3. Perform bulk operations
    if (idsToDelete.length > 0) {
      // Chunk deletions to avoid URL length limits in some proxies
      const CHUNK_SIZE = 50;
      for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
        const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
        await data.deleteRecordingsBulk(chunk);
      }
    }

    if (recordingsToUpdate.length > 0) {
      // Updates are still row-by-row unless we add a bulk update endpoint
      // But we can at least do them in parallel
      const updatePromises = recordingsToUpdate.map(rec => data.updateRecording(rec));
      await Promise.all(updatePromises);
    }

    await data.refetch();
    return { updated: recordingsToUpdate.length, cancelled: idsToDelete.length };
  }, [data, users]);


  /** Cancel a recording — backup slots are only created manually via the backup dialog */

  const cancelAndReschedule = useCallback((recording: Recording) => {
    data.cancelRecording(recording.id);
    // No automatic rescheduling to backup day — admin chooses via backup dialog
    return { success: false };
  }, [data]);

  const updateRecording = useCallback((recording: Recording) => { data.updateRecording(recording); }, [data]);
  const cancelRecording = useCallback(async (id: string) => { 
    const rec = data.recordings.find(r => r.id === id);
    await data.cancelRecording(id); 
    if (data.settings.autoFillVacancies && rec) {
      autoFillVacanciesForDate(rec.date);
    }
  }, [data, autoFillVacanciesForDate]);

  const deleteRecording = useCallback(async (id: string) => { return data.deleteRecording(id); }, [data]);
  const addTask = useCallback((task: KanbanTask) => { data.addTask(task); }, [data]);
  const updateTask = useCallback((task: KanbanTask) => { data.updateTask(task); }, [data]);
  const deleteTask = useCallback((id: string) => { data.deleteTask(id); }, [data]);
  const addScript = useCallback(async (script: Script) => { return data.addScript(script); }, [data]);
  const updateScript = useCallback((script: Script) => { data.updateScript(script); }, [data]);
  const deleteScript = useCallback((id: string) => { data.deleteScript(id); }, [data]);
  const updateSettings = useCallback((s: CompanySettings) => { data.updateSettings(s); }, [data]);
  const startActiveRecording = useCallback(async (rec: ActiveRecording) => { await data.startActiveRecording(rec); }, [data]);
  const stopActiveRecording = useCallback((recordingId: string, deliveryOverrides?: { reels_produced?: number; videos_recorded?: number; creatives_produced?: number; stories_produced?: number; arts_produced?: number; extras_produced?: number }, completedScriptIds?: string[]) => { data.stopActiveRecording(recordingId, deliveryOverrides, completedScriptIds); }, [data]);

  const getSuggestionsForCancellation = useCallback((recording: Recording) => {
    return data.clients.filter(c => {
      if (c.id === recording.clientId) return false;
      if (!c.acceptsExtra) return false;
      return !hasConflict(recording.videomakerId, recording.date, c.backupTime, recording.id, undefined, c.id).hasConflict;
    });
  }, [data.clients, hasConflict]);

  return (
    <AppContext.Provider value={{
      currentUser, users, clients: data.clients, recordings: data.recordings,
      tasks: data.tasks, scripts: data.scripts, settings: data.settings,
      activeRecordings: data.activeRecordings,
      logout, addUser, updateUser, deleteUser,
      addClient, updateClient, deleteClient,
      addRecording, updateRecording, cancelRecording, deleteRecording,
      deleteRecordingsBulk: data.deleteRecordingsBulk, cancelRecordingsBulk: data.cancelRecordingsBulk,
      cancelAndReschedule, generateScheduleForClient, regenerateScheduleForClient, generateFixedSchedulesForMonth,
      previewFixedSchedulesForMonth, commitFixedSchedules,
      autoFillVacanciesForDate, organizeSchedule,

      addTask, updateTask, deleteTask,

      addScript, updateScript, deleteScript,
      updateSettings, startActiveRecording, stopActiveRecording,
      hasConflict, isWithinWorkHours,
      getSuggestionsForCancellation,
      refetchData: data.refetch,
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
