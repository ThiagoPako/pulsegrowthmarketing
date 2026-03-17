import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, isSameDay, setYear, addDays, format } from 'date-fns';
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

  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, 'yyyy-MM-dd');

  const upcoming = useMemo(() => {
    return members
      .map(m => {
        const bday = new Date(m.birthday + 'T00:00:00');
        let birthdayThisYear = setYear(bday, today.getFullYear());
        // If birthday already passed this year, look at next year
        if (birthdayThisYear < today && !isSameDay(birthdayThisYear, today)) {
          birthdayThisYear = setYear(bday, today.getFullYear() + 1);
        }
        const daysUntil = differenceInDays(birthdayThisYear, today);
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
