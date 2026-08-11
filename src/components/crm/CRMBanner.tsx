import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Calendar, Snowflake, Briefcase, Phone, MessageSquare, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/vpsDb";
import { format, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function CRMBanner() {
  const navigate = useNavigate();
  
  const { data: leads = [] } = useQuery({
    queryKey: ['crm_leads_notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .or('status.eq.meeting,status.eq.fridge');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Sync every 30s
  });

  const todayMeetings = leads.filter(l => l.status === 'meeting' && l.meeting_date && isToday(parseISO(l.meeting_date)));
  const fridgeReturns = leads.filter(l => l.status === 'fridge' && l.return_date && isToday(parseISO(l.return_date)));

  if (todayMeetings.length === 0 && fridgeReturns.length === 0) return null;

  return (
    <div className="space-y-3 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
      {todayMeetings.map(lead => (
        <Alert key={`meeting-${lead.id}`} className="bg-purple-50 border-purple-200 text-purple-900 shadow-sm border-l-4 border-l-purple-500">
          <Briefcase className="h-4 w-4 text-purple-600" />
          <AlertTitle className="font-bold flex items-center gap-2">
            Reunião Agendada para Hoje!
            <span className="text-xs bg-purple-200 px-2 py-0.5 rounded-full">{lead.meeting_time?.slice(0, 5)}</span>
          </AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <span>Prepare-se para a reunião com <strong>{lead.name}</strong> da empresa <strong>{lead.company || 'Pessoa Física'}</strong>.</span>
            <div className="flex gap-2 shrink-0">
               {lead.phone && (
                 <Button size="sm" variant="outline" className="h-8 bg-white/50 border-purple-300 hover:bg-purple-100 text-purple-700" onClick={() => window.open(`https://wa.me/55${lead.phone?.replace(/\D/g, '')}`, '_blank')}>
                   <MessageSquare className="h-3 w-3 mr-2" /> WhatsApp
                 </Button>
               )}
               <Button size="sm" className="h-8 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => navigate('/crm')}>
                 Ver no CRM
               </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}

      {fridgeReturns.map(lead => (
        <Alert key={`fridge-${lead.id}`} className="bg-blue-50 border-blue-200 text-blue-900 shadow-sm border-l-4 border-l-blue-500">
          <Snowflake className="h-4 w-4 text-blue-600" />
          <AlertTitle className="font-bold">Hora de tirar o lead da Geladeira!</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <span>O prazo de retorno para <strong>{lead.name}</strong> ({lead.company}) vence hoje. Entre em contato para retomar a negociação.</span>
            <div className="flex gap-2 shrink-0">
               {lead.phone && (
                 <Button size="sm" variant="outline" className="h-8 bg-white/50 border-blue-300 hover:bg-blue-100 text-blue-700" onClick={() => window.open(`https://wa.me/55${lead.phone?.replace(/\D/g, '')}`, '_blank')}>
                   <Phone className="h-3 w-3 mr-2" /> Ligar agora
                 </Button>
               )}
               <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate('/crm')}>
                 Retomar Lead
               </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
