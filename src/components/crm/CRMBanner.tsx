import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/vpsDb';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle } from 'lucide-react';
import { isToday, parseISO } from 'date-fns';

export function CRMBanner() {
  const { data: meetings = [] } = useQuery({
    queryKey: ['crm_leads_meetings_today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('status', 'meeting');
      if (error) throw error;
      return (data || []).filter(l => l.meeting_date && isToday(parseISO(l.meeting_date)));
    },
    refetchInterval: 30000 // 30 seconds
  });

  if (meetings.length === 0) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary rounded-xl shadow-lg shadow-primary/20">
          <Calendar className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            Atenção Closer!
            <AlertCircle className="h-3 w-3" />
          </h3>
          <p className="text-xs text-muted-foreground">
            Você tem <strong>{meetings.length}</strong> {meetings.length === 1 ? 'reunião agendada' : 'reuniões agendadas'} para hoje.
          </p>
        </div>
      </div>
      
      <div className="flex -space-x-2">
        {meetings.slice(0, 5).map((m, i) => (
          <div 
            key={m.id} 
            className="w-8 h-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary shadow-sm"
            title={m.name}
          >
            {m.name.charAt(0)}
          </div>
        ))}
        {meetings.length > 5 && (
          <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-bold text-muted-foreground">
            +{meetings.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}
