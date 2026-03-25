import { format, endOfMonth, addDays, getDay, startOfMonth, differenceInCalendarWeeks } from 'date-fns';
import type { Client, Recording, DayOfWeek, CompanySettings } from '@/types';

/** Buffer time (in minutes) between recordings for the videomaker to upload materials */
const BUFFER_BETWEEN_RECORDINGS = 30;

const DAY_TO_NUM: Record<DayOfWeek, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

const NUM_TO_DAY: Record<number, DayOfWeek> = {
  0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
};

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Get the week number (1-5) of a date within its month */
function getWeekOfMonth(date: Date): number {
  const monthStart = startOfMonth(date);
  // Week 1 starts on the 1st, week 2 on the 8th, etc.
  return Math.ceil(date.getDate() / 7);
}

/** Get all dates for a specific day of week from today until end of current month,
 *  filtered by selectedWeeks (e.g. [1,2,3] means only weeks 1, 2, 3 of the month) */
export function getDatesUntilEndOfMonth(dayOfWeek: DayOfWeek, selectedWeeks?: number[]): string[] {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const monthEnd = endOfMonth(today);
  const dates: string[] = [];
  
  // Start from today
  let current = new Date(today);
  // Find first occurrence of the target day
  const targetNum = DAY_TO_NUM[dayOfWeek];
  while (getDay(current) !== targetNum) {
    current = addDays(current, 1);
  }
  
  while (current <= monthEnd) {
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

/** Check if a videomaker has conflict at a specific date/time */
export function hasConflictCheck(
  videomakerId: string,
  date: string,
  startTime: string,
  recordings: Recording[],
  duration: number,
  excludeId?: string
): boolean {
  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + duration;
  return recordings.some(r => {
    if (r.id === excludeId || r.status === 'cancelada') return false;
    if (r.videomakerId !== videomakerId || r.date !== date) return false;
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
  settings: CompanySettings
): Recording[] {
  const dates = getDatesUntilEndOfMonth(client.fixedDay);
  const newRecordings: Recording[] = [];
  let allRecs = [...existingRecordings];
  const duration = settings.recordingDuration;

  for (const date of dates) {
    if (client.fullShiftRecording) {
      // Full-shift client: reserve both slots in the preferred shift
      const shift = client.preferredShift === 'tarde'
        ? [timeToMinutes(settings.shiftBStart), timeToMinutes(settings.shiftBEnd)]
        : [timeToMinutes(settings.shiftAStart), timeToMinutes(settings.shiftAEnd)];
      
      const [sStart, sEnd] = shift;
      for (let t = sStart; t + duration <= sEnd; t += duration + BUFFER_BETWEEN_RECORDINGS) {
        const timeStr = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        if (!hasConflictCheck(client.videomaker, date, timeStr, allRecs, duration)) {
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
        }
      }
    } else {
      // Normal client: single slot at fixedTime
      if (!hasConflictCheck(client.videomaker, date, client.fixedTime, allRecs, duration)) {
        const rec: Recording = {
          id: crypto.randomUUID(),
          clientId: client.id,
          videomakerId: client.videomaker,
          date,
          startTime: client.fixedTime,
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
  if (!client.acceptsExtra) return [];
  
  const dates = getDatesUntilEndOfMonth(client.extraDay);
  const newRecordings: Recording[] = [];
  let allRecs = [...existingRecordings];
  const duration = settings.recordingDuration;

  for (const date of dates) {
    const day = NUM_TO_DAY[getDay(new Date(date + 'T12:00:00'))];
    
    // Find any available videomaker with a free slot
    let placed = false;
    
    // First try the client's own videomaker
    const orderedVms = [client.videomaker, ...allVideomakerIds.filter(id => id !== client.videomaker)];
    
    for (const vmId of orderedVms) {
      // Try to find a free time slot in the work shifts
      const shifts = [
        [timeToMinutes(settings.shiftAStart), timeToMinutes(settings.shiftAEnd)],
        [timeToMinutes(settings.shiftBStart), timeToMinutes(settings.shiftBEnd)],
      ];
      
      for (const [sStart, sEnd] of shifts) {
        for (let t = sStart; t + duration <= sEnd; t += duration + BUFFER_BETWEEN_RECORDINGS) {
          const timeStr = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
          if (!hasConflictCheck(vmId, date, timeStr, allRecs, duration)) {
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
        if (placed) break;
      }
      if (placed) break;
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
      const shifts = [
        [timeToMinutes(settings.shiftAStart), timeToMinutes(settings.shiftAEnd)],
        [timeToMinutes(settings.shiftBStart), timeToMinutes(settings.shiftBEnd)],
      ];
      
      for (const [sStart, sEnd] of shifts) {
        for (let t = sStart; t + duration <= sEnd; t += duration + BUFFER_BETWEEN_RECORDINGS) {
          const timeStr = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
          if (isWithinWorkHoursCheck(extraDay, timeStr, settings) && !hasConflictCheck(vmId, extraDate, timeStr, existingRecordings, duration)) {
            return { date: extraDate, startTime: timeStr, videomakerId: vmId, type: 'extra' };
          }
        }
      }
    }
  }

  return null;
}
