import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth, type Profile } from '@/hooks/useAuth';
import type { User, Client, Recording, KanbanTask, CompanySettings, DayOfWeek, Script, ActiveRecording, UserRole } from '@/types';

interface AppState {
  currentUser: User | null;
  users: User[];
  clients: Client[];
  recordings: Recording[];
  tasks: KanbanTask[];
  scripts: Script[];
  settings: CompanySettings;
  activeRecordings: ActiveRecording[];
}

interface AppContextType extends AppState {
  logout: () => void;
  addUser: (user: User) => boolean;
  updateUser: (user: User) => void;
  deleteUser: (id: string) => void;
  addClient: (client: Client) => boolean;
  updateClient: (client: Client) => void;
  deleteClient: (id: string) => boolean;
  addRecording: (recording: Recording) => boolean;
  updateRecording: (recording: Recording) => void;
  cancelRecording: (id: string) => void;
  addTask: (task: KanbanTask) => void;
  updateTask: (task: KanbanTask) => void;
  deleteTask: (id: string) => void;
  addScript: (script: Script) => void;
  updateScript: (script: Script) => void;
  deleteScript: (id: string) => void;
  updateSettings: (settings: CompanySettings) => void;
  startActiveRecording: (rec: ActiveRecording) => void;
  stopActiveRecording: (recordingId: string) => void;
  hasConflict: (videomakerId: string, date: string, startTime: string, excludeId?: string) => boolean;
  isWithinWorkHours: (day: DayOfWeek, startTime: string) => boolean;
  getSuggestionsForCancellation: (recording: Recording) => Client[];
}

const defaultSettings: CompanySettings = {
  startTime: '08:00',
  endTime: '18:00',
  workDays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
  recordingDuration: 2,
};

function profileToUser(profile: Profile): User {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    password: '', // Not used with Supabase Auth
    role: profile.role as UserRole,
    avatarUrl: profile.avatar_url || undefined,
    displayName: profile.display_name || undefined,
    jobTitle: profile.job_title || undefined,
  };
}

function loadState<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { profile, signOut, loading: authLoading } = useAuth();

  // Derive currentUser from Supabase Auth profile
  const currentUser = profile ? profileToUser(profile) : null;

  // Non-auth data still in localStorage for now
  const [users, setUsers] = useState<User[]>(() => loadState('pulse_users', []));
  const [clients, setClients] = useState<Client[]>(() => loadState('pulse_clients', []));
  const [recordings, setRecordings] = useState<Recording[]>(() => loadState('pulse_recordings', []));
  const [tasks, setTasks] = useState<KanbanTask[]>(() => loadState('pulse_tasks', []));
  const [scripts, setScripts] = useState<Script[]>(() => loadState('pulse_scripts', []));
  const [settings, setSettings] = useState<CompanySettings>(() => loadState('pulse_settings', defaultSettings));
  const [activeRecordings, setActiveRecordings] = useState<ActiveRecording[]>(() => loadState('pulse_activeRecordings', []));

  useEffect(() => { localStorage.setItem('pulse_users', JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem('pulse_clients', JSON.stringify(clients)); }, [clients]);
  useEffect(() => { localStorage.setItem('pulse_recordings', JSON.stringify(recordings)); }, [recordings]);
  useEffect(() => { localStorage.setItem('pulse_tasks', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem('pulse_scripts', JSON.stringify(scripts)); }, [scripts]);
  useEffect(() => { localStorage.setItem('pulse_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('pulse_activeRecordings', JSON.stringify(activeRecordings)); }, [activeRecordings]);

  const logout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const addUser = useCallback((user: User) => {
    if (users.some(u => u.email === user.email)) return false;
    setUsers(prev => [...prev, user]);
    return true;
  }, [users]);

  const updateUser = useCallback((user: User) => {
    setUsers(prev => prev.map(u => u.id === user.id ? user : u));
  }, []);

  const deleteUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  const addClient = useCallback((client: Client) => {
    if (clients.some(c => c.companyName.toLowerCase() === client.companyName.toLowerCase())) return false;
    setClients(prev => [...prev, client]);
    return true;
  }, [clients]);

  const updateClient = useCallback((client: Client) => {
    setClients(prev => prev.map(c => c.id === client.id ? client : c));
  }, []);

  const deleteClient = useCallback((id: string) => {
    const hasFuture = recordings.some(r => r.clientId === id && r.status === 'agendada' && r.date >= new Date().toISOString().split('T')[0]);
    if (hasFuture) return false;
    setClients(prev => prev.filter(c => c.id !== id));
    return true;
  }, [recordings]);

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const hasConflict = useCallback((videomakerId: string, date: string, startTime: string, excludeId?: string) => {
    const newStart = timeToMinutes(startTime);
    const newEnd = newStart + 120;
    return recordings.some(r => {
      if (r.id === excludeId || r.status === 'cancelada') return false;
      if (r.videomakerId !== videomakerId || r.date !== date) return false;
      const existStart = timeToMinutes(r.startTime);
      const existEnd = existStart + 120;
      return newStart < existEnd && newEnd > existStart;
    });
  }, [recordings]);

  const isWithinWorkHours = useCallback((day: DayOfWeek, startTime: string) => {
    if (!settings.workDays.includes(day)) return false;
    const start = timeToMinutes(startTime);
    const end = start + 120;
    return start >= timeToMinutes(settings.startTime) && end <= timeToMinutes(settings.endTime);
  }, [settings]);

  const addRecording = useCallback((recording: Recording) => {
    if (hasConflict(recording.videomakerId, recording.date, recording.startTime)) return false;
    setRecordings(prev => [...prev, recording]);
    return true;
  }, [hasConflict]);

  const updateRecording = useCallback((recording: Recording) => {
    setRecordings(prev => prev.map(r => r.id === recording.id ? recording : r));
  }, []);

  const cancelRecording = useCallback((id: string) => {
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelada' as const } : r));
  }, []);

  const addTask = useCallback((task: KanbanTask) => setTasks(prev => [...prev, task]), []);
  const updateTask = useCallback((task: KanbanTask) => setTasks(prev => prev.map(t => t.id === task.id ? task : t)), []);
  const deleteTask = useCallback((id: string) => setTasks(prev => prev.filter(t => t.id !== id)), []);
  const addScript = useCallback((script: Script) => setScripts(prev => [...prev, script]), []);
  const updateScript = useCallback((script: Script) => setScripts(prev => prev.map(s => s.id === script.id ? script : s)), []);
  const deleteScript = useCallback((id: string) => setScripts(prev => prev.filter(s => s.id !== id)), []);
  const updateSettings = useCallback((s: CompanySettings) => setSettings(s), []);
  const startActiveRecording = useCallback((rec: ActiveRecording) => setActiveRecordings(prev => [...prev.filter(a => a.recordingId !== rec.recordingId), rec]), []);
  const stopActiveRecording = useCallback((recordingId: string) => setActiveRecordings(prev => prev.filter(a => a.recordingId !== recordingId)), []);

  const getSuggestionsForCancellation = useCallback((recording: Recording) => {
    return clients.filter(c => {
      if (c.id === recording.clientId) return false;
      if (!c.acceptsExtra) return false;
      return !hasConflict(recording.videomakerId, recording.date, c.backupTime, recording.id);
    });
  }, [clients, hasConflict]);

  return (
    <AppContext.Provider value={{
      currentUser, users, clients, recordings, tasks, scripts, settings, activeRecordings,
      logout, addUser, updateUser, deleteUser,
      addClient, updateClient, deleteClient,
      addRecording, updateRecording, cancelRecording,
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
