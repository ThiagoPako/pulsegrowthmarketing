import { format, addDays, getDay } from 'date-fns';
import type { Client, Recording, DayOfWeek, CompanySettings, RecordingType } from '@/types';

/** Buffer time (in minutes) between recordings for the videomaker to upload materials */
const BUFFER_BETWEEN_RECORDINGS = 30;
const FIXED_SCHEDULE_HORIZON_DAYS = 60;

const DAY_TO_NUM: Record<DayOfWeek, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

const NUM_TO_DAY: Record<number, DayOfWeek> = {
  0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
};

interface FixedRecordingGenerationOptions {
  startDate?: string;
  endDate?: string;
  fillCompleteMonth?: boolean;
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Get the week number (1-5) of a date within its month */
function getWeekOfMonth(date: Date): number {
  // Week 1 starts on the 1st, week 2 on the 8th, etc.
  return Math.ceil(date.getDate() / 7);
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

function shouldUseSelectedWeeks(selectedWeeks: number[] | undefined, fillCompleteMonth?: boolean): boolean {
  if (!selectedWeeks || selectedWeeks.length === 0) return false;

  // Clientes antigos costumam vir com [1,2,3,4] como padrão. Para gerar o mês
  // completo, esse padrão não pode bloquear a 5ª ocorrência em meses de 29-31 dias.
  if (fillCompleteMonth) {
    const hasDefaultFourWeeks = [1, 2, 3, 4].every(week => selectedWeeks.includes(week));
    if (hasDefaultFourWeeks) return false;
  }

  return true;
}

export function getDatesForDayInRange(
  dayOfWeek: DayOfWeek,
  startDate: string,
  endDate: string,
  selectedWeeks?: number[],
  fillCompleteMonth?: boolean
): string[] {
  const dates: string[] = [];
  const targetNum = DAY_TO_NUM[dayOfWeek];
  const end = parseDateKey(endDate);
  const useSelectedWeeks = shouldUseSelectedWeeks(selectedWeeks, fillCompleteMonth);

  let current = parseDateKey(startDate);
  while (current <= end && getDay(current) !== targetNum) {
    current = addDays(current, 1);
  }

  while (current <= end) {
    if (!useSelectedWeeks || selectedWeeks!.includes(getWeekOfMonth(current))) {
      dates.push(format(current, 'yyyy-MM-dd'));
    }
    current = addDays(current, 7);
  }

  return dates;
}

/** Get all dates for a specific day of week from today across a rolling future window,
 *  filtered by selectedWeeks (e.g. [1,2,3] means only weeks 1, 2, 3 of the month) */
export function getDatesUntilEndOfMonth(dayOfWeek: DayOfWeek, selectedWeeks?: number[]): string[] {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const horizonEnd = addDays(today, FIXED_SCHEDULE_HORIZON_DAYS);
  const dates: string[] = [];
  
  // Start from today
  let current = new Date(today);
  // Find first occurrence of the target day
  const targetNum = DAY_TO_NUM[dayOfWeek];
  while (getDay(current) !== targetNum) {
    current = addDays(current, 1);
  }
  
  while (current <= horizonEnd) {
    const dateStr = format(current, 'yyyy-MM-dd');
    if (dateStr >= todayStr) {
      // Filter by selectedWeeks if provided
      if (!selectedWeeks || selectedWeeks.length === 0 || selectedWeeks.includes(getWeekOfMonth(current))) {
        dates.push(dateStr);
      }
    }
    current = addDays(current, 7);
  }
  
  return dates;
}

/** Check if a videomaker has conflict at a specific date/time 
 * Hierarquia: fixa/avulso > extra. 
 * Se o novo agendamento for fixa/avulso, ignoramos conflitos com 'extra' (eles serão cancelados/removidos).
 */
export function hasConflictCheck(
  videomakerId: string,
  date: string,
  startTime: string,
  recordings: Recording[],
  duration: number,
  excludeId?: string,
  newType?: RecordingType
): boolean {
  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + duration;
  
  return recordings.some(r => {
    if (r.id === excludeId || r.status === 'cancelada') return false;
    if (r.videomakerId !== videomakerId || r.date !== date) return false;
    
    // Se o novo agendamento for fixa ou avulso (hierarquia superior), 
    // ele ignora conflitos com gravações do tipo 'extra'.
    const isHighPriority = newType === 'fixa' || newType === 'avulso';
    if (isHighPriority && r.type === 'extra') return false;

    const existStart = timeToMinutes(r.startTime);
    // Existing recording occupies: its duration + 30min buffer for upload
    const existEnd = existStart + duration + BUFFER_BETWEEN_RECORDINGS;
    // New recording also needs buffer after it
    const newEndWithBuffer = newEnd + BUFFER_BETWEEN_RECORDINGS;
    // Check overlap: new recording's full block vs existing recording's full block
    return newStart < existEnd && newEndWithBuffer > existStart;
  });
}


/** Check if time fits within work shifts */
export function isWithinWorkHoursCheck(
  day: DayOfWeek,
  startTime: string,
  settings: CompanySettings
): boolean {
  if (!settings.workDays.includes(day)) return false;
  const start = timeToMinutes(startTime);
  const end = start + settings.recordingDuration;
  const inA = start >= timeToMinutes(settings.shiftAStart) && end <= timeToMinutes(settings.shiftAEnd);
  const inB = start >= timeToMinutes(settings.shiftBStart) && end <= timeToMinutes(settings.shiftBEnd);
  return inA || inB;
}

/** Generate fixed recordings for a client until end of month */
export function generateFixedRecordings(
  client: Client,
  existingRecordings: Recording[],
  settings: CompanySettings,
  options: FixedRecordingGenerationOptions = {}
): Recording[] {
  // Guard: cannot generate if client is cancelled or has no videomaker
  if (client.status === 'cancelado') {
    return [];
  }

  if (!client.videomaker) {
    console.warn(`[generateFixedRecordings] Client "${client.companyName}" has no videomaker assigned — skipping.`);
    return [];
  }
  
  const dates = options.startDate && options.endDate
    ? getDatesForDayInRange(client.fixedDay, options.startDate, options.endDate, client.selectedWeeks, options.fillCompleteMonth)
    : getDatesUntilEndOfMonth(client.fixedDay, client.selectedWeeks);
  const newRecordings: Recording[] = [];
  let allRecs = [...existingRecordings];
  const duration = settings.recordingDuration;

  for (const date of dates) {
    const vmDayRecs = allRecs.filter(r => r.videomakerId === client.videomaker && r.date === date && r.status !== 'cancelada');
    const clientDayRecs = allRecs.filter(r => r.clientId === client.id && r.date === date && r.status !== 'cancelada');
    
    if (client.fullShiftRecording) {
      // Full-shift client: reserve both slots in the preferred shift
      const slots = client.preferredShift === 'tarde'
        ? ['14:30', '16:30']
        : ['08:30', '10:30'];
      
      for (const timeStr of slots) {
        const alreadyAtTime = clientDayRecs.some(r => r.startTime === timeStr);
        if (vmDayRecs.length < 4 && !alreadyAtTime && !hasConflictCheck(client.videomaker, date, timeStr, allRecs, duration)) {
          const rec: Recording = {
            id: crypto.randomUUID(),
            clientId: client.id,
            videomakerId: client.videomaker,
            date,
            startTime: timeStr,
            type: 'fixa',
            status: 'agendada',
          };
          newRecordings.push(rec);
          allRecs.push(rec);
          vmDayRecs.push(rec);
          clientDayRecs.push(rec);
        }
      }
    } else {
      // Normal client: single slot at fixedTime
      const targetTime = client.fixedTime || '08:30'; // fallback
      const alreadyScheduled = clientDayRecs.length > 0;
      
      if (!alreadyScheduled && vmDayRecs.length < 4 && !hasConflictCheck(client.videomaker, date, targetTime, allRecs, duration)) {
        const rec: Recording = {
          id: crypto.randomUUID(),
          clientId: client.id,
          videomakerId: client.videomaker,
          date,
          startTime: targetTime,
          type: 'fixa',
          status: 'agendada',
        };
        newRecordings.push(rec);
        allRecs.push(rec);
      }
    }
  }

  return newRecordings;
}

/** Generate extra recordings on extraDay with any available videomaker */
export function generateExtraRecordings(
  client: Client,
  existingRecordings: Recording[],
  settings: CompanySettings,
  allVideomakerIds: string[]
): Recording[] {
  if (client.status === 'cancelado') return [];
  if (!client.acceptsExtra) return [];
  if (!client.videomaker) return [];
  
  const dates = getDatesUntilEndOfMonth(client.extraDay);
  const newRecordings: Recording[] = [];
  let allRecs = [...existingRecordings];
  const duration = settings.recordingDuration;

  for (const date of dates) {
    const day = NUM_TO_DAY[getDay(new Date(date + 'T12:00:00'))];
    
    // Skip if client already has a recording on this day
    const alreadyScheduled = allRecs.some(r => r.clientId === client.id && r.date === date && r.status !== 'cancelada');
    if (alreadyScheduled) continue;

    // Find any available videomaker with a free slot
    let placed = false;
    
    // First try the client's own videomaker
    const orderedVms = [client.videomaker, ...allVideomakerIds.filter(id => id !== client.videomaker)];
    
    for (const vmId of orderedVms) {
      // Capacity check
      const vmDayRecsCount = allRecs.filter(r => r.videomakerId === vmId && r.date === date && r.status !== 'cancelada').length;
      if (vmDayRecsCount >= 4) continue;

      // Use standard fixed slots as requested by user
      const slots = findAvailableSlots(date, vmId, allRecs, settings);
      
      if (slots.length > 0) {
        // Take the first available slot
        const timeStr = slots[0];
        const rec: Recording = {
          id: crypto.randomUUID(),
          clientId: client.id,
          videomakerId: vmId,
          date,
          startTime: timeStr,
          type: 'extra',
          status: 'agendada',
        };
        newRecordings.push(rec);
        allRecs.push(rec);
        placed = true;
        break;
      }
    }
  }

  return newRecordings;
}

/** Find next date for a specific day of week on or after a given date */
export function findNextDateForDay(dayOfWeek: DayOfWeek, afterDate: string): string {
  const base = new Date(afterDate + 'T12:00:00');
  const target = DAY_TO_NUM[dayOfWeek];
  for (let i = 0; i <= 14; i++) {
    const candidate = addDays(base, i);
    if (getDay(candidate) === target && format(candidate, 'yyyy-MM-dd') >= afterDate) {
      return format(candidate, 'yyyy-MM-dd');
    }
  }
  return afterDate;
}

/** 
 * Find all available time slots for a specific date and videomaker.
 */
export function findAvailableSlots(
  date: string,
  videomakerId: string,
  recordings: Recording[],
  settings: CompanySettings
): string[] {
  const day = NUM_TO_DAY[getDay(new Date(date + 'T12:00:00'))];
  if (!settings.workDays.includes(day)) return [];

  const duration = settings.recordingDuration;
  const availableSlots: string[] = [];
  
  // Custom fixed slots as requested by user: 08:30, 10:30, 14:30, 16:30
  const FIXED_SLOTS = ['08:30', '10:30', '14:30', '16:30'];

  for (const timeStr of FIXED_SLOTS) {
    if (!hasConflictCheck(videomakerId, date, timeStr, recordings, duration)) {
      availableSlots.push(timeStr);
    }
  }
  
  return availableSlots;
}

/** Try to reschedule a cancelled recording:
 * 1. Backup day/time with responsible videomaker
 * 2. Extra day with ANY available videomaker
 */
export function findRescheduleSlot(
  recording: Recording,
  client: Client,
  existingRecordings: Recording[],
  settings: CompanySettings,
  allVideomakerIds: string[]
): { date: string; startTime: string; videomakerId: string; type: 'secundaria' | 'extra' } | null {
  const today = format(new Date(), 'yyyy-MM-dd');
  const duration = settings.recordingDuration;

  if (client.status === 'cancelado') return null;

  // Priority 1: Backup day/time with responsible videomaker
  const backupDate = findNextDateForDay(client.backupDay, today);
  const backupDay = NUM_TO_DAY[getDay(new Date(backupDate + 'T12:00:00'))];
  if (isWithinWorkHoursCheck(backupDay, client.backupTime, settings)) {
    if (!hasConflictCheck(client.videomaker, backupDate, client.backupTime, existingRecordings, duration)) {
      return { date: backupDate, startTime: client.backupTime, videomakerId: client.videomaker, type: 'secundaria' };
    }
  }

  // Priority 2: Extra day with ANY available videomaker
  if (client.acceptsExtra) {
    const extraDate = findNextDateForDay(client.extraDay, today);
    const extraDay = NUM_TO_DAY[getDay(new Date(extraDate + 'T12:00:00'))];
    
    // Try all videomakers (responsible first)
    const orderedVms = [client.videomaker, ...allVideomakerIds.filter(id => id !== client.videomaker)];
    
    for (const vmId of orderedVms) {
      const slots = findAvailableSlots(extraDate, vmId, existingRecordings, settings);
      if (slots.length > 0) {
        return { date: extraDate, startTime: slots[0], videomakerId: vmId, type: 'extra' };
      }
    }
  }

  return null;
}

/** 
 * Organize recordings for a specific date and videomaker to fit into the 4 standard slots
 * according to the hierarchy rules.
 */
export function organizeRecordingsForDate(
  date: string,
  videomakerId: string | null | undefined,
  allRecordings: Recording[],
  settings: CompanySettings,
  validClientIds?: Set<string>,
  cancelledClientIds?: Set<string>,
  clients?: Client[]
): { toUpdate: Recording[]; toCancel: Recording[] } {
  const normalizedVmId = videomakerId || '';
  
  const dayRecordings = allRecordings.filter(r => 
    r.date === date && 
    (r.videomakerId || '') === normalizedVmId && 
    r.status !== 'cancelada'
  );

  if (dayRecordings.length === 0) return { toUpdate: [], toCancel: [] };

  const toUpdate: Recording[] = [];
  const toCancel: Recording[] = [];

  // Filter out invalid recordings (no client or inactive client)
  // unless they are of type 'avulso' (which may have no clientId but should have a prospectName)
  const validRecs = dayRecordings.filter(r => {
    const isAvulso = r.type === 'avulso';
    const isCancelledClient = cancelledClientIds && r.clientId && cancelledClientIds.has(r.clientId);
    const isInvalidClient = validClientIds && r.clientId && !validClientIds.has(r.clientId);
    const isMissingClient = !r.clientId && !isAvulso;
    
    if (isCancelledClient || isInvalidClient || isMissingClient) {
      toCancel.push({ ...r, status: 'cancelada' });
      return false;
    }
    return true;
  });

  // If there's no videomaker assigned, all remaining valid recordings should also be cancelled
  if (!normalizedVmId) {
    validRecs.forEach(r => toCancel.push({ ...r, status: 'cancelada' }));
    return { toUpdate, toCancel };
  }

  // Hierarchy sorting: fixa > avulso > secundaria > backup > endomarketing > extra
  const priorityMap: Record<string, number> = {
    fixa: 1,
    avulso: 2,
    secundaria: 3,
    backup: 4,
    endomarketing: 5,
    extra: 6
  };

  const sortedRecs = [...validRecs].sort((a, b) => {
    const pA = priorityMap[a.type] || 99;
    const pB = priorityMap[b.type] || 99;
    if (pA !== pB) return pA - pB;
    // For same priority, keep the original time order
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  const FIXED_SLOTS = ['08:30', '10:30', '14:30', '16:30'];
  const usedSlots = new Set<string>();

  // 1. First Pass: Keep "fixa" recordings at their defined client schedule if possible
  const highPriority = sortedRecs.filter(r => r.type === 'fixa');
  highPriority.forEach(rec => {
    const client = clients?.find(c => c.id === rec.clientId);
    const targetTime = client?.fixedTime;
    
    // If client has a specific time and it's one of the standard slots and not used yet
    if (targetTime && FIXED_SLOTS.includes(targetTime) && !usedSlots.has(targetTime)) {
      if (rec.startTime !== targetTime) {
        toUpdate.push({ ...rec, startTime: targetTime });
      }
      usedSlots.add(targetTime);
      // Remove from pool of recs to be assigned in second pass
      const idx = sortedRecs.indexOf(rec);
      if (idx > -1) sortedRecs.splice(idx, 1);
    }
  });

  // 2. Second Pass: Assign remaining recordings to remaining available slots
  const remainingSlots = FIXED_SLOTS.filter(slot => !usedSlots.has(slot));
  let slotIdx = 0;

  sortedRecs.forEach((rec) => {
    if (slotIdx < remainingSlots.length) {
      const targetTime = remainingSlots[slotIdx];
      if (rec.startTime !== targetTime) {
        toUpdate.push({ ...rec, startTime: targetTime });
      }
      slotIdx++;
    } else {
      // Exceeded capacity of 4 slots per videomaker
      toCancel.push({ ...rec, status: 'cancelada' });
    }
  });

  return { toUpdate, toCancel };
}


