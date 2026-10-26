import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/vpsDb';
import { differenceInCalendarDays, setYear, addDays, format, startOfDay } from 'date-fns';
import type { AppRole } from '@/hooks/useAuth';

export interface BirthdayMember {
  id: string;
  name: string;
  display_name: string | null;
  role: AppRole;
  avatar_url: string | null;
  birthday: string; // yyyy-MM-dd
}

export interface UpcomingBirthday extends BirthdayMember {
  daysUntil: number;
  birthdayThisYear: Date;
}

export function useBirthdays() {
  const [members, setMembers] = useState<BirthdayMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, display_name, role, avatar_url, birthday')
        .not('birthday', 'is', null);
      if (data) {
        setMembers(data.filter((d: any) => d.birthday) as BirthdayMember[]);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  // Dia de hoje à meia-noite: com a hora junto, a véspera dava 0 dias ("HOJE!" um dia antes).
  // Atualiza quando vira o dia com a tela aberta (TV, sessão longa).
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const refresh = () => {
      const now = startOfDay(new Date());
      setToday(prev => (prev.getTime() === now.getTime() ? prev : now));
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const todayStr = format(today, 'yyyy-MM-dd');

  const upcoming = useMemo(() => {
    return members
      .map(m => {
        const bday = new Date(m.birthday + 'T00:00:00');
        let birthdayThisYear = setYear(bday, today.getFullYear());
        // If birthday already passed this year, look at next year
        if (birthdayThisYear < today) {
          birthdayThisYear = setYear(bday, today.getFullYear() + 1);
        }
        const daysUntil = differenceInCalendarDays(birthdayThisYear, today);
        return { ...m, daysUntil, birthdayThisYear } as UpcomingBirthday;
      })
      .filter(m => m.daysUntil >= 0 && m.daysUntil <= 7)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [members, today]);

  const todayBirthdays = useMemo(() => {
    return upcoming.filter(m => m.daysUntil === 0);
  }, [upcoming]);

  return { members, upcoming, todayBirthdays, loading };
}
